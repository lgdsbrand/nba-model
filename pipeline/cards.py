"""The NBA game cards: nba/data/cards.json, the one file the page reads (2026-10-26).

Five days of games, from two days ago to two days ahead (Eastern), each game
with both teams, the DraftKings lines ESPN shows, the model's projected score,
win % and fair prices, and, once it is over, the final score and whether the
model's favourite won. Every team carries its records, its last ten games and
the figures behind the projection, for the card's matchup details.

PREDICTIONS ARE FROZEN AT TIP-OFF. Each run re-predicts the games that have not
started and stores the prediction, and the line it was made against, in
data/raw/cards_<season>.json. Once a game starts, ESPN drops its pregame
odds and the stored prediction is shown and graded unchanged. A game that
started before any run predicted it shows its score with no prediction.

WHAT IS SHOWN, and why (decided 2026-10-26): win % and fair prices, not
edges. The backtest (backtest.py) found the projection close to DraftKings but
with no edge over it; the calibrated edge was 0 in every market, so the cards
show probabilities, like the NHL page, and the book's line beside ours.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import model
import nba_data as nd

DAYS_BACK, DAYS_AHEAD = 2, 2
#: Recent games listed per team.
RECENT_GAMES = 10
#: Past meetings listed per game (this season and last).
H2H_GAMES = 10

#: Power rating: last season counts as this many games per team, so it
#: steadies October and fades as this season's games pile up.
POWER_LAST_SEASON_GAMES = 10
#: A this-season game's weight halves every this many days.
POWER_HALF_LIFE_DAYS = 60
#: Game score: this share from how good both teams are (power ranks), the
#: rest from how close the game is (our win %). The same formula is used on
#: the NHL and football pages.
GAME_SCORE_STRENGTH = 0.6


# ── Lines ─────────────────────────────────────────────────────────────────────

def _number(value) -> float | None:
    """'-1.5', 'o227.5', '+100' -> number; anything else -> None."""
    if value is None:
        return None
    text = str(value).strip().lstrip("ou").replace("+", "")
    if text.upper() in ("EVEN", "EV"):
        return 100.0
    try:
        return float(text)
    except ValueError:
        return None


def lines(competition: dict) -> dict | None:
    """The DraftKings spread, total and moneyline with both sides' prices, now
    and at open, or None when ESPN shows no line."""
    odds = sorted(competition.get("odds") or [],
                  key=lambda o: o.get("provider", {}).get("name") != nd.LINE_PROVIDER)
    for o in odds:
        spread = o.get("pointSpread") or {}
        total = o.get("total") or {}
        ml = o.get("moneyline") or {}

        def pick(block: dict, side: str, when: str, field: str):
            return _number(((block.get(side) or {}).get(when) or {}).get(field))

        out = {
            "book": o.get("provider", {}).get("displayName") or o.get("provider", {}).get("name"),
            "spread": pick(spread, "home", "close", "line"),
            "spread_home_price": pick(spread, "home", "close", "odds"),
            "spread_away_price": pick(spread, "away", "close", "odds"),
            "total": pick(total, "over", "close", "line"),
            "over_price": pick(total, "over", "close", "odds"),
            "under_price": pick(total, "under", "close", "odds"),
            "ml_home": pick(ml, "home", "close", "odds"),
            "ml_away": pick(ml, "away", "close", "odds"),
            "open_spread": pick(spread, "home", "open", "line"),
            "open_total": pick(total, "over", "open", "line"),
            "open_ml_home": pick(ml, "home", "open", "odds"),
            "open_ml_away": pick(ml, "away", "open", "odds"),
        }
        # Older payloads carry only the headline numbers.
        if out["spread"] is None:
            out["spread"] = _number(o.get("spread"))
        if out["total"] is None:
            out["total"] = _number(o.get("overUnder"))
        if any(out[k] is not None for k in ("spread", "total", "ml_home")):
            return out
    return None


def no_vig(home_price: float | None, away_price: float | None) -> float | None:
    """The home side's no-vig probability from a two-way American price."""
    if home_price is None or away_price is None:
        return None

    def implied(price: float) -> float:
        return -price / (-price + 100) if price < 0 else 100 / (price + 100)
    h, a = implied(home_price), implied(away_price)
    return h / (h + a)


# ── Teams ─────────────────────────────────────────────────────────────────────

def record(rows: list[dict]) -> str:
    w = sum(1 for r in rows if r["pts"] > r["opp_pts"])
    return f"{w}-{len(rows) - w}"


def recent_game(r: dict, abbr: dict[str, str]) -> dict:
    """One past game from a team's side: score, result, and against the line."""
    margin = r["pts"] - r["opp_pts"]
    ats = ou = None
    if r["spread"] != "":
        line = float(r["spread"]) if r["home"] else -float(r["spread"])
        edge = margin + line
        ats = "W" if edge > 0 else "L" if edge < 0 else "P"
    if r["total"] != "":
        diff = r["pts"] + r["opp_pts"] - float(r["total"])
        ou = "O" if diff > 0 else "U" if diff < 0 else "P"
    return {"date": r["date"], "opp": abbr.get(r["opp"], r["opp"]), "home": bool(r["home"]),
            "pts": r["pts"], "opp_pts": r["opp_pts"], "result": "W" if margin > 0 else "L",
            "ats": ats, "ou": ou}


def team_blocks(meta: list[dict], current_rows: list[dict], every_rows: list[dict],
                season_eff: dict, window: list[dict], l5: dict, per: dict,
                starters: dict, table: dict, ats: dict, ou: dict, rating: dict) -> dict[str, dict]:
    abbr = {t["displayName"]: t["abbreviation"] for t in meta}
    regular_now = [r for r in current_rows if r["season_type"] == nd.REGULAR]
    by_team_now = defaultdict(list)
    for r in regular_now:
        by_team_now[r["team"]].append(r)
    by_team_all = defaultdict(list)
    for r in sorted(every_rows, key=lambda r: (r["date"], r["event_id"])):
        by_team_all[r["team"]].append(r)
    window_by = defaultdict(list)
    for r in window:
        window_by[r["team"]].append(r)

    out = {}
    for t in meta:
        name = t["displayName"]
        now = by_team_now.get(name, [])
        recent = by_team_all.get(name, [])[-RECENT_GAMES:]
        season = window_by.get(name, [])
        logo = next((l["href"] for l in t.get("logos") or [] if "default" in (l.get("rel") or [])),
                    (t.get("logos") or [{}])[0].get("href"))
        w, l, p = ats.get(name, (0, 0, 0))
        o, u, op = ou.get(name, (0, 0, 0))
        eff, form = season_eff.get(name, {}), l5.get(name, {})
        out[t["abbreviation"]] = {
            "name": name, "short": t.get("shortDisplayName") or t.get("name") or name,
            "abbr": t["abbreviation"], "logo": logo,
            "color": f"#{t['color']}" if t.get("color") else None,
            "record": record(now),
            "home_record": record([r for r in now if r["home"]]),
            "road_record": record([r for r in now if not r["home"]]),
            "last10_record": record(recent),
            "last10": [recent_game(r, abbr) for r in reversed(recent)],
            "ats": f"{w}-{l}-{p}", "ou": f"{o}-{u}-{op}",
            "rating": round(rating[name], 1) if name in rating else None,
            "ppg": round(sum(r["pts"] for r in season) / len(season), 1) if season else None,
            "oppg": round(sum(r["opp_pts"] for r in season) / len(season), 1) if season else None,
            "pace": round(eff["pace"], 3) if eff else None,
            "off_eff": round(eff["oeff"], 3) if eff else None,
            "def_eff": round(eff["deff"], 3) if eff else None,
            "l5_pace": round(form["pace"], 3) if form else None,
            "l5_ppg": round(form["ppg"], 1) if form else None,
            "l5_oppg": round(form["oppg"], 1) if form else None,
            "l5_off_eff": round(form["oeff"], 3) if form else None,
            "l5_def_eff": round(form["deff"], 3) if form else None,
            # Model inputs (pace, efficiencies, PER) keep 3 decimals so the
            # page's lineup tool reproduces the card's numbers exactly.
            "lineup_per": round(per[name], 3) if per.get(name) else None,
            "starters": [{"name": s, "slot": slot,
                          "per": round(table[s]["per"], 1) if s in table else None}
                         for s, slot in zip(starters.get(name, []), ["G", "G", "F", "F", "C"]) if s],
        }
    return out


# ── Games ─────────────────────────────────────────────────────────────────────

def prediction(home: str, away: str, line: dict | None, fitted: dict) -> dict | None:
    g = model.inputs(home, away, fitted["season_eff"], fitted["l5"], fitted["league"], fitted["per"])
    if g is None:
        return None
    p = model.predict(g, fitted["params"])
    home_win = p["home_win"]
    out = {
        "made_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "home_pts": round(p["home_pts"], 1), "away_pts": round(p["away_pts"], 1),
        "home_win": round(home_win, 4), "away_win": round(1 - home_win, 4),
        "fair_ml_home": model.american(home_win), "fair_ml_away": model.american(1 - home_win),
        # The home team's line, as books write it: favoured = negative.
        "fair_spread": round(-p["margin"], 1), "fair_total": round(p["total"], 1),
        "line": line,
    }
    if line:
        out["book_home_win"] = no_vig(line.get("ml_home"), line.get("ml_away"))
    return out


def card(event: dict, frozen: dict, fitted: dict, abbr: dict[str, str]) -> dict | None:
    if event.get("season", {}).get("type") not in (nd.REGULAR, nd.POSTSEASON):
        return None
    competition = event["competitions"][0]
    sides = {c["homeAway"]: c for c in competition["competitors"]}
    if "home" not in sides or "away" not in sides:
        return None
    status = event.get("status", {}).get("type", {})
    state = status.get("state", "pre")
    home, away = sides["home"]["team"]["displayName"], sides["away"]["team"]["displayName"]
    tip = datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
    line = lines(competition)

    if state == "pre":
        made = prediction(home, away, line, fitted)
        if made:
            frozen[event["id"]] = made
    pred = frozen.get(event["id"])

    out = {
        "id": event["id"], "tip": tip.strftime("%Y-%m-%dT%H:%MZ"),
        "time": nd.eastern(tip).strftime("%I:%M %p").lstrip("0") + " ET",
        "state": state, "status": status.get("shortDetail") or status.get("description"),
        "home": abbr.get(home, home), "away": abbr.get(away, away),
        "line": (pred or {}).get("line") or line, "model": pred,
    }
    if state != "pre":
        out["home_score"] = int(sides["home"].get("score") or 0)
        out["away_score"] = int(sides["away"].get("score") or 0)
    if state == "post" and pred and out["home_score"] != out["away_score"]:
        home_won = out["home_score"] > out["away_score"]
        out["favourite_won"] = (pred["home_win"] >= 0.5) == home_won
    if out["model"]:
        out["model"] = {k: v for k, v in pred.items() if k != "line"}
    return out


def power_ratings(last_rows: list[dict], this_rows: list[dict], today: date,
                  league: set[str]) -> dict[str, float]:
    """Points per game better than an average team on a neutral floor.

    A simple rating system (average margin plus the average rating of the
    opponents) with home court taken out of every margin, weighted: this
    season's games by recency, last season's together worth
    POWER_LAST_SEASON_GAMES games per team. Unlike the stat comparison's
    SRS, which uses the model's window, a 0-4 start counts for more than
    last spring.
    """
    # Games between the league's teams only: the All-Star game is filed as a
    # regular-season game between "Team Stars" and "World".
    played = [r for r in last_rows + this_rows if r["season_type"] in (nd.REGULAR, nd.POSTSEASON)
              and r["team"] in league and r["opp"] in league]
    homes = [r["pts"] - r["opp_pts"] for r in played if r["home"]]
    if not homes:
        return {}
    home_court = sum(homes) / len(homes)
    last_ids = {id(r) for r in last_rows}
    last_weight = POWER_LAST_SEASON_GAMES / 82
    games = defaultdict(list)
    for r in played:
        if id(r) in last_ids:
            w = last_weight
        else:
            days_ago = (today - date.fromisoformat(r["date"])).days
            w = 0.5 ** (max(days_ago, 0) / POWER_HALF_LIFE_DAYS)
        margin = r["pts"] - r["opp_pts"] + (-home_court if r["home"] else home_court)
        games[r["team"]].append((r["opp"], margin, w))
    rating = {t: 0.0 for t in games}
    for _ in range(300):
        nxt = {t: sum(w * (m + rating.get(o, 0.0)) for o, m, w in g) / sum(w for _, _, w in g)
               for t, g in games.items()}
        mean = sum(nxt.values()) / len(nxt)
        rating = {t: v - mean for t, v in nxt.items()}
    return rating


def game_score(home_rank: int, away_rank: int, teams: int, home_win: float) -> int:
    """0-100: two highly ranked teams in a close game score highest."""
    strength = 100 * (1 - ((home_rank + away_rank) / 2 - 1) / (teams - 1))
    closeness = 100 * (1 - abs(2 * home_win - 1))
    return round(GAME_SCORE_STRENGTH * strength + (1 - GAME_SCORE_STRENGTH) * closeness)


def back_to_back(days: list[dict], every_rows: list[dict], abbr: dict[str, str]) -> None:
    """Flag each side that played the day before (the second night of a back
    to back), from finished games and the scoreboards of the days shown."""
    played = {(abbr.get(r["team"], r["team"]), r["date"]) for r in every_rows}
    for day in days:
        for g in day["games"]:
            played.update({(g["home"], day["date"]), (g["away"], day["date"])})
    for day in days:
        before = (date.fromisoformat(day["date"]) - timedelta(days=1)).isoformat()
        for g in day["games"]:
            g["b2b"] = {side: (g[side], before) in played for side in ("away", "home")}


def head_to_head(days: list[dict], every_rows: list[dict], abbr: dict[str, str]) -> None:
    """Each game's past meetings, newest first, from the home team's side."""
    meetings = defaultdict(list)
    for r in sorted(every_rows, key=lambda r: (r["date"], r["event_id"]), reverse=True):
        meetings[(abbr.get(r["team"], r["team"]), abbr.get(r["opp"], r["opp"]))].append(r)
    for day in days:
        for g in day["games"]:
            past = [r for r in meetings.get((g["home"], g["away"]), []) if r["date"] < day["date"]]
            g["h2h"] = [recent_game(r, abbr) for r in past[:H2H_GAMES]]


# ── Build ─────────────────────────────────────────────────────────────────────

def frozen_path(season: int):
    return nd.RAW / f"cards_{season}.json"


def build(today: date, meta: list[dict], rows: dict, current: int, previous: int,
          window: list[dict], every_game: list[dict], players: list[dict],
          starters: dict, ats: dict, ou: dict) -> None:
    table = {p["name"]: p for p in players}
    season_eff = model.season_efficiency(window)
    l5 = nd.last_five(every_game)
    per = {t: model.lineup_per(names, table) for t, names in starters.items()}
    fitted = {"params": model.load_params(), "season_eff": season_eff, "l5": l5,
              "league": model.league(window), "per": per}
    rating = nd.ratings(window)
    abbr = {t["displayName"]: t["abbreviation"] for t in meta}

    path = frozen_path(current)
    frozen = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    days = []
    for offset in range(-DAYS_BACK, DAYS_AHEAD + 1):
        day = today + timedelta(days=offset)
        games = [c for c in (card(e, frozen, fitted, abbr) for e in nd.scoreboard(day)) if c]
        days.append({"date": day.isoformat(), "games": sorted(games, key=lambda g: (g["tip"], g["home"]))})

    path.write_text(json.dumps(frozen, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    every_rows = rows[previous][0] + rows[current][0]
    back_to_back(days, every_rows, abbr)
    head_to_head(days, every_rows, abbr)
    teams = team_blocks(meta, rows[current][0], every_rows, season_eff, window, l5, per,
                        starters, table, ats, ou, rating)
    power = power_ratings(rows[previous][0], rows[current][0], today, set(abbr))
    order = sorted(power, key=lambda name: -power[name])
    for name in order:
        team = teams.get(abbr.get(name, name))
        if team:
            team["power"] = round(power[name], 1)
            team["power_rank"] = order.index(name) + 1
    for day in days:
        for g in day["games"]:
            h, a = teams.get(g["home"], {}), teams.get(g["away"], {})
            if g["model"] and h.get("power_rank") and a.get("power_rank"):
                g["game_score"] = game_score(h["power_rank"], a["power_rank"], len(order),
                                             g["model"]["home_win"])
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "today": today.isoformat(),
        # Season figures still blend in last season (nba_data.BLEND_UNTIL_TEAM_GAMES).
        "early_season": len([r for r in rows[current][0] if r["season_type"] == nd.REGULAR]) / 30
        < nd.BLEND_UNTIL_TEAM_GAMES,
        # What the page needs to re-predict a game with a lineup the visitor
        # edits (the lineup tool in a card's matchup details).
        "model": {"params": fitted["params"],
                  "league": {k: round(v, 6) for k, v in fitted["league"].items()}},
        "days": days,
        "teams": teams,
    }
    nd.OUT.mkdir(parents=True, exist_ok=True)
    (nd.OUT / "cards.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    shown = sum(len(d["games"]) for d in days)
    predicted = sum(1 for d in days for g in d["games"] if g["model"])
    print(f"wrote nba/data/cards.json: {shown} games over {len(days)} days, {predicted} with a prediction")
