"""The NBA predictor's data, built from ESPN's public NBA feeds (2026-10-16).

The page (nba/index.html + nba/app.js) used to read ten tabs of a Google
Sheet that someone filled by hand. Nobody does any more, so this job builds
the same tables from ESPN and writes them as CSV files to nba/data/, which the
page reads instead. The model in app.js is unchanged: same formula, same
weights, fed the same kind of numbers.

WHAT IT WRITES (nba/data/), one file per old sheet tab:
  games.csv        the next game days: date, time (ET), teams, DraftKings
                   spread (home line, home favoured = negative) and total
  players.csv      every player's games, TOTAL minutes, PER and usage %
  lineups.csv      each team's five starters (G, G, F, F, C)
  team_l5.csv      each team's last five games: PPG, OPPG, pace, offensive
                   and defensive efficiency (points per 100 possessions), W-L
  team_season.csv  season PPG / OPPG
  ats.csv, ou.csv  against-the-spread and over/under records
  ranking.csv      a power rating (simple rating system: schedule-adjusted
                   average margin)
  league.csv       league averages (points per team-game, pace)
  names.csv        empty: one source means one spelling of every team

HOW THE NUMBERS ARE MADE, and why:
  * PER and usage are Basketball-Reference's published formulas applied to
    ESPN box scores, since the old sheet copied them from Basketball-Reference.
    Minutes are season TOTALS, as the sheet had them (app.js weights a
    starter's PER by them).
  * Pace and efficiency use possessions = FGA - OREB + TOV + 0.44 x FTA.
  * EARLY SEASON: until teams average BLEND_UNTIL_TEAM_GAMES games, every
    season figure (players, PPG, ATS/O-U, rating) combines last season with
    this one, so opening week is not built on one or two games. After that,
    this season only. Last-five figures always use the last five games played,
    reaching back into last season early on.
  * STARTERS: the starters of a team's most recent game. Before its first
    game of the season, its current roster's top players by minutes: two
    guards, two forwards, a center.

RAW DATA is cached in data/raw/ (one row per team-game and per player-game,
per season), so a run fetches only games it has not seen. A first run
backfills last season: about 250 schedule calls and 1,300 box scores.

Standard library only, so the scheduled runner needs no installs.
Run: python pipeline/nba_data.py            (writes data/raw and nba/data)
     python pipeline/nba_data.py --today 2026-10-21   (pretend it is that day)
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "nba" / "data"
API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"

REGULAR, POSTSEASON = 2, 3
#: Average games per team before this season's figures stand alone.
BLEND_UNTIL_TEAM_GAMES = 10
#: How far ahead to look for the next game days, and how many to publish.
LOOKAHEAD_DAYS = 14
GAME_DAYS = 2
#: ESPN's line provider for the spread and total.
LINE_PROVIDER = "DraftKings"

TEAM_FIELDS = ["event_id", "date", "season_type", "team", "opp", "home", "pts", "opp_pts",
               "min", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl",
               "blk", "tov", "pf", "spread", "total"]
PLAYER_FIELDS = ["event_id", "date", "season_type", "team", "player_id", "player", "pos", "starter",
                 "min", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk",
                 "tov", "pf", "pts"]
BOX = ["min", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf"]


# ── Time ──────────────────────────────────────────────────────────────────────

def eastern(moment: datetime) -> datetime:
    """A UTC time in US Eastern, by the US daylight-saving rule (no tz database
    needed): EDT from the second Sunday of March, 2 a.m., to the first Sunday
    of November, 2 a.m."""
    moment = moment.astimezone(timezone.utc)
    year = moment.year
    start = datetime(year, 3, 8, 7, tzinfo=timezone.utc)
    start += timedelta(days=(6 - start.weekday()) % 7)
    end = datetime(year, 11, 1, 6, tzinfo=timezone.utc)
    end += timedelta(days=(6 - end.weekday()) % 7)
    return moment + timedelta(hours=-4 if start <= moment < end else -5)


def season_of(day: date) -> int:
    """ESPN's season year: the 2026-27 season is 2027."""
    return day.year + 1 if day.month >= 8 else day.year


def season_days(season: int) -> tuple[date, date]:
    return date(season - 1, 10, 1), date(season, 6, 30)


# ── ESPN ──────────────────────────────────────────────────────────────────────

class NotFound(RuntimeError):
    """ESPN answered 404: retrying will not help."""


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={
        "User-Agent": "legends-sports-nba-data/1.0", "Accept-Encoding": "gzip"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
            if body[:2] == b"\x1f\x8b":
                body = gzip.decompress(body)
            time.sleep(0.15)
            return json.loads(body)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise NotFound(f"ESPN has no {url}") from error
            if attempt == 4:
                raise RuntimeError(f"ESPN request failed: {url}: {error}") from error
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == 4:
                raise RuntimeError(f"ESPN request failed: {url}: {error}") from error
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def scoreboard(day: date) -> list[dict]:
    return fetch_json(f"{API}/scoreboard?dates={day:%Y%m%d}").get("events", [])


def event_line(competition: dict) -> tuple[str, str]:
    """(home spread, total) from a competition's odds, LINE_PROVIDER first."""
    odds = competition.get("odds") or competition.get("pickcenter") or []
    odds = sorted(odds, key=lambda o: (o.get("provider", {}).get("name") != LINE_PROVIDER))
    for o in odds:
        spread, total = o.get("spread"), o.get("overUnder")
        if spread is not None or total is not None:
            return ("" if spread is None else str(spread), "" if total is None else str(total))
    return "", ""


def count(value) -> int:
    """A box-score cell as a number; ESPN writes "--" for an empty one."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def parse_made_attempted(value: str) -> tuple[int, int]:
    made, _, attempted = (value or "0-0").partition("-")
    return count(made), count(attempted)


def box_score(event_id: str, day: str, season_type: int) -> tuple[list[dict], list[dict]]:
    """One final game's team rows and player rows."""
    summary = fetch_json(f"{API}/summary?event={event_id}")
    competitors = summary["header"]["competitions"][0]["competitors"]
    side = {c["team"]["displayName"]: c for c in competitors}
    spread, total = event_line({"odds": summary.get("pickcenter") or []})

    players, totals = [], {}
    for block in summary["boxscore"]["players"]:
        team = block["team"]["displayName"]
        stats = block["statistics"][0]
        keys = stats["keys"]
        tot = defaultdict(int)
        for entry in stats["athletes"]:
            values = entry.get("stats") or []
            if entry.get("didNotPlay") or not values:
                continue
            raw = dict(zip(keys, values))
            minutes = count(raw.get("minutes"))
            if minutes <= 0:
                continue
            fgm, fga = parse_made_attempted(raw.get("fieldGoalsMade-fieldGoalsAttempted"))
            tpm, tpa = parse_made_attempted(raw.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
            ftm, fta = parse_made_attempted(raw.get("freeThrowsMade-freeThrowsAttempted"))
            row = {
                "min": minutes, "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta,
                "oreb": count(raw.get("offensiveRebounds")), "dreb": count(raw.get("defensiveRebounds")),
                "ast": count(raw.get("assists")), "stl": count(raw.get("steals")),
                "blk": count(raw.get("blocks")), "tov": count(raw.get("turnovers")),
                "pf": count(raw.get("fouls")), "pts": count(raw.get("points")),
            }
            for k in BOX:
                tot[k] += row[k]
            athlete = entry["athlete"]
            players.append({
                "event_id": event_id, "date": day, "season_type": season_type, "team": team,
                "player_id": athlete["id"], "player": athlete["displayName"],
                "pos": (athlete.get("position") or {}).get("abbreviation", ""),
                "starter": 1 if entry.get("starter") else 0, **row,
            })
        totals[team] = tot

    teams = []
    names = list(totals)
    for team in names:
        opp = next(t for t in names if t != team)
        me, them = side[team], side[opp]
        home = me["homeAway"] == "home"
        teams.append({
            "event_id": event_id, "date": day, "season_type": season_type, "team": team, "opp": opp,
            "home": 1 if home else 0, "pts": int(me["score"]), "opp_pts": int(them["score"]),
            **{k: totals[team][k] for k in BOX}, "spread": spread, "total": total,
        })
    return teams, players


# ── Raw cache ─────────────────────────────────────────────────────────────────

def raw_path(season: int, kind: str) -> Path:
    return RAW / f"{season}_{kind}.csv"


def read_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_rows(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_state() -> dict:
    path = RAW / "state.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save_state(state: dict) -> None:
    (RAW / "state.json").write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def update_season(season: int, today: date, state: dict) -> None:
    """Fetch every final regular-season and playoff game of `season` not yet
    cached, up to yesterday (Eastern). Re-scans the last three days scanned, so
    a game that finished after the previous run is picked up."""
    first, last = season_days(season)
    last = min(last, today - timedelta(days=1))
    scanned = state.get(str(season))
    start = first if scanned is None else max(first, date.fromisoformat(scanned) - timedelta(days=3))
    if start > last:
        return
    team_rows = read_rows(raw_path(season, "teams"))
    player_rows = read_rows(raw_path(season, "players"))
    # Games ESPN has no box score for (it answered 404). A handful of playoff
    # games in 2025-26 did; they are left out rather than retried every run.
    unavailable = set(state.setdefault("unavailable", []))
    seen = {r["event_id"] for r in team_rows} | unavailable
    added, skipped = 0, 0
    # The scan never moves past a skipped game's day, so the next run retries it.
    first_skip: date | None = None

    def save(through: date) -> None:
        team_rows.sort(key=lambda r: (r["date"], r["event_id"], r["team"]))
        player_rows.sort(key=lambda r: (r["date"], r["event_id"], r["team"], r["player"]))
        write_rows(raw_path(season, "teams"), TEAM_FIELDS, team_rows)
        write_rows(raw_path(season, "players"), PLAYER_FIELDS, player_rows)
        state[str(season)] = through.isoformat()
        save_state(state)

    day = start
    while day <= last:
        for event in scoreboard(day):
            season_type = event.get("season", {}).get("type")
            final = event.get("status", {}).get("type", {}).get("completed")
            if season_type not in (REGULAR, POSTSEASON) or not final or event["id"] in seen:
                continue
            played = eastern(datetime.fromisoformat(event["date"].replace("Z", "+00:00"))).date()
            # One malformed box score is skipped, not fatal: the rest of the
            # season still loads, and the next run tries it again.
            try:
                teams, players = box_score(event["id"], played.isoformat(), season_type)
            except NotFound:
                print(f"  no box score for {event['id']} ({event.get('name')}): left out")
                unavailable.add(event["id"])
                state["unavailable"] = sorted(unavailable)
                seen.add(event["id"])
                continue
            except (KeyError, IndexError, StopIteration, ValueError, RuntimeError) as error:
                print(f"  skipped {event['id']} ({event.get('name')}): {error!r}")
                skipped += 1
                first_skip = first_skip or day
                continue
            if len(teams) != 2:
                skipped += 1
                first_skip = first_skip or day
                continue
            team_rows.extend(teams)
            player_rows.extend(players)
            seen.add(event["id"])
            added += 1
        # Progress is kept every 30 days scanned, so a long backfill that
        # fails part-way resumes rather than starting over.
        if (day - start).days % 30 == 29:
            save(min(day, first_skip) if first_skip else day)
        day += timedelta(days=1)
    save(min(last, first_skip) if first_skip else last)
    print(f"season {season}: +{added} games, {len(seen - unavailable)} cached, {skipped} skipped, "
          f"scanned to {state[str(season)]}")


def numeric(rows: list[dict]) -> list[dict]:
    """CSV strings to numbers, for every count column."""
    out = []
    for r in rows:
        row = dict(r)
        for k in BOX + ["pts", "opp_pts", "home", "starter", "season_type"]:
            if k in row and row[k] != "":
                row[k] = int(row[k])
        out.append(row)
    return out


# ── Computations ──────────────────────────────────────────────────────────────

def possessions(r: dict) -> float:
    return r["fga"] - r["oreb"] + r["tov"] + 0.44 * r["fta"]


def team_games_with_opponent(team_rows: list[dict]) -> list[dict]:
    """Each team-game row with its opponent's possessions attached."""
    by_event = defaultdict(list)
    for r in team_rows:
        by_event[r["event_id"]].append(r)
    out = []
    for rows in by_event.values():
        if len(rows) != 2:
            continue
        a, b = rows
        out.append({**a, "poss": possessions(a), "opp_poss": possessions(b)})
        out.append({**b, "poss": possessions(b), "opp_poss": possessions(a)})
    return out


def pace_of(rows: list[dict]) -> float:
    """Possessions per 48 minutes, both teams' possessions averaged."""
    poss = sum((r["poss"] + r["opp_poss"]) / 2 for r in rows)
    minutes = sum(r["min"] for r in rows) / 5
    return 48 * poss / minutes if minutes else 0.0


def last_five(team_rows: list[dict]) -> dict[str, dict]:
    by_team = defaultdict(list)
    for r in sorted(team_rows, key=lambda r: (r["date"], r["event_id"])):
        by_team[r["team"]].append(r)
    out = {}
    for team, rows in by_team.items():
        recent = rows[-5:]
        poss = sum(r["poss"] for r in recent)
        opp_poss = sum(r["opp_poss"] for r in recent)
        out[team] = {
            "ppg": sum(r["pts"] for r in recent) / len(recent),
            "oppg": sum(r["opp_pts"] for r in recent) / len(recent),
            "pace": pace_of(recent),
            "oeff": 100 * sum(r["pts"] for r in recent) / poss if poss else 0.0,
            "deff": 100 * sum(r["opp_pts"] for r in recent) / opp_poss if opp_poss else 0.0,
            "w": sum(1 for r in recent if r["pts"] > r["opp_pts"]),
            "l": sum(1 for r in recent if r["pts"] < r["opp_pts"]),
        }
    return out


def records(team_rows: list[dict]) -> tuple[dict, dict]:
    """ATS and over/under records from each game's line. The spread is the
    home team's line, so the home side covers when margin + spread > 0."""
    ats = defaultdict(lambda: [0, 0, 0])
    ou = defaultdict(lambda: [0, 0, 0])
    for r in team_rows:
        if r["spread"] != "":
            home_line = float(r["spread"])
            line = home_line if r["home"] else -home_line
            edge = (r["pts"] - r["opp_pts"]) + line
            ats[r["team"]][0 if edge > 0 else 1 if edge < 0 else 2] += 1
        if r["total"] != "":
            diff = r["pts"] + r["opp_pts"] - float(r["total"])
            ou[r["team"]][0 if diff > 0 else 1 if diff < 0 else 2] += 1
    return ats, ou


def ratings(team_rows: list[dict]) -> dict[str, float]:
    """Simple rating system: a team's average margin plus the average rating
    of the teams it played, solved by iteration and centred on zero."""
    games = defaultdict(list)
    for r in team_rows:
        games[r["team"]].append((r["opp"], r["pts"] - r["opp_pts"]))
    rating = {t: 0.0 for t in games}
    for _ in range(200):
        nxt = {}
        for team, played in games.items():
            mov = sum(m for _, m in played) / len(played)
            sos = sum(rating.get(o, 0.0) for o, _ in played) / len(played)
            nxt[team] = mov + sos
        mean = sum(nxt.values()) / len(nxt)
        rating = {t: v - mean for t, v in nxt.items()}
    return rating


def player_table(player_rows: list[dict], team_rows: list[dict]) -> list[dict]:
    """Games, total minutes, PER and usage per player over the window.

    PER is Hollinger's, as Basketball-Reference computes it: unadjusted PER
    from the player's box totals, his team's assist/field-goal ratio and the
    league's totals; adjusted to league pace; scaled so the league's
    minute-weighted average is 15. A traded player is measured against his
    latest team."""
    lg = defaultdict(float)
    for r in team_rows:
        for k in BOX + ["pts"]:
            lg[k] += r[k]
    lg_trb = lg["oreb"] + lg["dreb"]
    factor = (2 / 3) - (0.5 * (lg["ast"] / lg["fgm"])) / (2 * (lg["fgm"] / lg["ftm"]))
    vop = lg["pts"] / (lg["fga"] - lg["oreb"] + lg["tov"] + 0.44 * lg["fta"])
    drbp = (lg_trb - lg["oreb"]) / lg_trb

    team_tot = defaultdict(lambda: defaultdict(float))
    team_rows_by = defaultdict(list)
    for r in team_rows:
        team_rows_by[r["team"]].append(r)
        for k in BOX:
            team_tot[r["team"]][k] += r[k]
    team_pace = {t: pace_of(rows) for t, rows in team_rows_by.items()}
    lg_pace = pace_of(team_rows)

    players = {}
    for r in sorted(player_rows, key=lambda r: (r["date"], r["event_id"])):
        p = players.setdefault(r["player_id"], defaultdict(float))
        p["name"], p["team"] = r["player"], r["team"]
        p["g"] += 1
        for k in BOX + ["pts"]:
            p[k] += r[k]

    rows = []
    for p in players.values():
        mp, tm = p["min"], team_tot[p["team"]]
        if mp <= 0 or not tm["fgm"]:
            continue
        tm_ast_fg = tm["ast"] / tm["fgm"]
        trb = p["oreb"] + p["dreb"]
        uper = (1 / mp) * (
            p["tpm"] + (2 / 3) * p["ast"]
            + (2 - factor * tm_ast_fg) * p["fgm"]
            + p["ftm"] * 0.5 * (1 + (1 - tm_ast_fg) + (2 / 3) * tm_ast_fg)
            - vop * p["tov"]
            - vop * drbp * (p["fga"] - p["fgm"])
            - vop * 0.44 * (0.44 + 0.56 * drbp) * (p["fta"] - p["ftm"])
            + vop * (1 - drbp) * (trb - p["oreb"])
            + vop * drbp * p["oreb"]
            + vop * p["stl"]
            + vop * drbp * p["blk"]
            - p["pf"] * ((lg["ftm"] / lg["pf"]) - 0.44 * (lg["fta"] / lg["pf"]) * vop)
        )
        aper = (lg_pace / team_pace[p["team"]]) * uper if team_pace.get(p["team"]) else uper
        tm_min = tm["min"]
        usg_den = mp * (tm["fga"] + 0.44 * tm["fta"] + tm["tov"])
        usg = 100 * (p["fga"] + 0.44 * p["fta"] + p["tov"]) * (tm_min / 5) / usg_den if usg_den else 0.0
        rows.append({"name": p["name"], "team": p["team"], "g": int(p["g"]), "mp": int(mp),
                     "aper": aper, "usg": usg})
    total_min = sum(r["mp"] for r in rows)
    lg_aper = sum(r["aper"] * r["mp"] for r in rows) / total_min if total_min else 15.0
    for r in rows:
        r["per"] = r["aper"] * 15 / lg_aper if lg_aper else 0.0
    return rows


def slot_of(position: str) -> str:
    position = (position or "").upper()
    if position == "C":
        return "C"
    if "F" in position:
        return "F"
    if "G" in position:
        return "G"
    return ""


def fill_slots(candidates: list[tuple[str, str]]) -> list[str]:
    """(name, slot) in priority order -> [G, G, F, F, C]; a slot nobody of
    that position fills takes the next unused player."""
    wanted = ["G", "G", "F", "F", "C"]
    chosen = [""] * 5
    used = set()
    for i, slot in enumerate(wanted):
        for name, pos in candidates:
            if name not in used and pos == slot:
                chosen[i] = name
                used.add(name)
                break
    for i in range(5):
        if not chosen[i]:
            for name, _ in candidates:
                if name not in used:
                    chosen[i] = name
                    used.add(name)
                    break
    return chosen


def lineups(teams: list[dict], current_players: list[dict], minutes: dict[str, int]) -> dict[str, list[str]]:
    """Each team's starters: its latest game this season, else its roster's
    top players by minutes."""
    latest = {}
    for r in sorted(current_players, key=lambda r: (r["date"], r["event_id"])):
        latest[r["team"]] = r["event_id"]
    out = {}
    for team in teams:
        name = team["displayName"]
        if name in latest:
            starters = [(r["player"], slot_of(r["pos"])) for r in current_players
                        if r["team"] == name and r["event_id"] == latest[name] and r["starter"]]
            out[name] = fill_slots(starters)
            continue
        roster = fetch_json(f"{API}/teams/{team['id']}/roster").get("athletes", [])
        ranked = sorted(roster, key=lambda a: -minutes.get(a["displayName"], 0))
        out[name] = fill_slots([(a["displayName"], slot_of((a.get("position") or {}).get("abbreviation")))
                                for a in ranked])
    return out


def upcoming_games(today: date) -> list[dict]:
    """The next GAME_DAYS days with regular-season or playoff games, from today."""
    out, days = [], 0
    for offset in range(LOOKAHEAD_DAYS):
        day = today + timedelta(days=offset)
        found = []
        for event in scoreboard(day):
            if event.get("season", {}).get("type") not in (REGULAR, POSTSEASON):
                continue
            competition = event["competitions"][0]
            sides = {c["homeAway"]: c["team"]["displayName"] for c in competition["competitors"]}
            kickoff = eastern(datetime.fromisoformat(event["date"].replace("Z", "+00:00")))
            spread, total = event_line(competition)
            found.append({"id": event["id"], "date": kickoff.date().isoformat(),
                          "time": kickoff.strftime("%I:%M %p").lstrip("0") + " ET",
                          "away": sides.get("away", ""), "home": sides.get("home", ""),
                          "spread": spread, "total": total, "sort": event["date"]})
        if found:
            out.extend(sorted(found, key=lambda g: g["sort"]))
            days += 1
            if days == GAME_DAYS:
                break
    return out


# ── Output ────────────────────────────────────────────────────────────────────

def write_csv(name: str, header: list[str], rows: list[list]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def fmt(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}"


def build(today: date) -> None:
    current = season_of(today)
    previous = current - 1
    state = load_state()
    for season in (previous, current):
        update_season(season, today, state)
    save_state(state)

    rows = {s: (numeric(read_rows(raw_path(s, "teams"))), numeric(read_rows(raw_path(s, "players"))))
            for s in (previous, current)}
    cur_teams, cur_players = rows[current]
    prev_teams, prev_players = rows[previous]

    regular_cur = [r for r in cur_teams if r["season_type"] == REGULAR]
    blend = len(regular_cur) / 30 < BLEND_UNTIL_TEAM_GAMES
    window_seasons = (previous, current) if blend else (current,)
    window_teams = team_games_with_opponent(
        [r for s in window_seasons for r in rows[s][0] if r["season_type"] == REGULAR])
    window_players = [r for s in window_seasons for r in rows[s][1] if r["season_type"] == REGULAR]
    every_game = team_games_with_opponent(prev_teams + cur_teams)
    print(f"window: {'last season + ' if blend else ''}this season "
          f"({len(window_teams) // 2} games); this season so far: {len(regular_cur) // 2} games")

    teams = [t["team"] for t in fetch_json(f"{API}/teams")["sports"][0]["leagues"][0]["teams"]]

    # Players, and starters.
    players = player_table(window_players, window_teams)
    write_csv("players.csv", ["Player", "Team", "G", "MP", "PER", "USG%"],
              [[p["name"], p["team"], p["g"], p["mp"], fmt(p["per"]), fmt(p["usg"])]
               for p in sorted(players, key=lambda p: -p["mp"])])
    minutes = {p["name"]: p["mp"] for p in players}
    starters = lineups(teams, [r for r in cur_players], minutes)
    write_csv("lineups.csv", ["Team", "G1", "G2", "F1", "F2", "C"],
              [[t, *starters[t]] for t in sorted(starters)])

    # Team form, season scoring, records, rating.
    l5 = last_five(every_game)
    write_csv("team_l5.csv", ["Team", "PPG", "OPPG", "Pace", "OffEff", "DefEff", "W", "L"],
              [[t, fmt(v["ppg"]), fmt(v["oppg"]), fmt(v["pace"]), fmt(v["oeff"]), fmt(v["deff"]), v["w"], v["l"]]
               for t, v in sorted(l5.items())])
    season = defaultdict(list)
    for r in window_teams:
        season[r["team"]].append(r)
    write_csv("team_season.csv", ["Team", "PPG", "OPPG"],
              [[t, fmt(sum(r["pts"] for r in g) / len(g)), fmt(sum(r["opp_pts"] for r in g) / len(g))]
               for t, g in sorted(season.items())])
    # Records are this season only, even while the model's window still
    # borrows last season: a 44-25 record four games in is last year's team.
    ats, ou = records(team_games_with_opponent(regular_cur))
    write_csv("ats.csv", ["Team", "Record", "Cover%"],
              [[t, f"{w}-{l}-{p}", f"{100 * w / (w + l):.1f}%" if w + l else ""]
               for t, (w, l, p) in sorted(ats.items())])
    write_csv("ou.csv", ["Team", "Record"],
              [[t, f"{o}-{u}-{p}"] for t, (o, u, p) in sorted(ou.items())])
    write_csv("ranking.csv", ["Team", "Rating"],
              [[t, fmt(v)] for t, v in sorted(ratings(window_teams).items(), key=lambda kv: -kv[1])])
    league_pts = sum(r["pts"] for r in window_teams) / len(window_teams)
    write_csv("league.csv", ["Label", "Value"],
              [["Points", fmt(league_pts)], ["Pace", fmt(pace_of(window_teams))]])
    write_csv("names.csv", ["team", "nbastuffer", "espn"], [])

    # The next game days.
    games = upcoming_games(today)
    write_csv("games.csv", ["GameID", "Date", "Time", "Away", "Home", "Label", "Spread (Home = -)", "Total"],
              [[g["id"], g["date"], g["time"], g["away"], g["home"], "", g["spread"], g["total"]] for g in games])
    write_csv("updated.csv", ["Updated (UTC)", "Window"],
              [[datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                "last season + this season" if blend else "this season"]])
    print(f"wrote nba/data: {len(players)} players, {len(starters)} lineups, {len(games)} upcoming games")

    # The game cards: projections, lines, records and results for five days.
    import cards  # imported here: cards imports this module
    cards.build(today, teams, rows, current, previous, window_teams, every_game, players,
                starters, ats, ou)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--today", help="pretend today (Eastern) is this date, YYYY-MM-DD")
    args = parser.parse_args(argv)
    today = date.fromisoformat(args.today) if args.today else eastern(datetime.now(timezone.utc)).date()
    build(today)
    return 0


if __name__ == "__main__":
    sys.exit(main())
