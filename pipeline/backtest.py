"""Walk-forward backtest of the NBA game model against DraftKings lines (2026-10-26).

Replays a finished season one game day at a time. Before each day it builds
the model's inputs exactly as the daily data job would have that morning
(last five games, season efficiency, starters of each team's latest game and
their PER), from games played BEFORE that day only, then predicts the day's
games and grades them against the DraftKings spread and total ESPN recorded.

Two models are compared:

  ORIGINAL  the formula in nba/app.js as it stands: league points + lineup PER
            above 15 + 0.70 x (offensive efficiency - 1.0) - 0.60 x (defensive
            efficiency - 1.0) + 0.35 x (pace - 100), per team. Efficiency is
            points per 100 possessions (~110), so the two efficiency terms do
            not cancel and every team gains ~11 points. A team's score also
            falls with its OWN defensive efficiency rather than rising with its
            opponent's, and there is no home court.

  FIXED     the same ingredients put together the standard way: each team's
            points = possessions x (its offense + the opponent's defense -
            league average) / 100, from season and last-five figures; plus home
            court and the starters' PER. The weights are fitted by least squares
            on games BEFORE each day only (walk-forward), never on the games
            being graded.

Probabilities come from a normal distribution around the projected margin and
total, with its spread measured on the same past games. A side against a
-110/-110 line has a no-vig price of 50%, so edge = probability - 50%.

--write-params also fits the model on the whole season and writes
pipeline/model_params.json, which the daily job reads: the weights, the spread
of the margin and total, the win % stretch and each market's edge shrink. Refit
each offseason, never mid-season.

Standard library only. Run: python pipeline/backtest.py [--season 2026] [--write-params]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from statistics import mean, pstdev

import model
import nba_data as nd
from model import margin_features, normal_cdf, total_features

#: Games each team must have played this season before its games are graded.
MIN_TEAM_GAMES = 10
#: Graded games the fixed model needs before it is first fitted.
MIN_FIT_GAMES = 150
#: The -110 price both sides of a spread or total usually carry.
STANDARD_PRICE = -110


def least_squares(rows: list[list[float]], ys: list[float]) -> list[float]:
    """Ordinary least squares by the normal equations (k is tiny)."""
    k = len(rows[0])
    a = [[sum(r[i] * r[j] for r in rows) for j in range(k)] for i in range(k)]
    b = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(k)]
    for col in range(k):
        pivot = max(range(col, k), key=lambda r: abs(a[r][col]))
        a[col], a[pivot], b[col], b[pivot] = a[pivot], a[col], b[pivot], b[col]
        for r in range(k):
            if r != col and a[col][col]:
                f = a[r][col] / a[col][col]
                a[r] = [x - f * y for x, y in zip(a[r], a[col])]
                b[r] -= f * b[col]
    return [b[i] / a[i][i] if a[i][i] else 0.0 for i in range(k)]


# ── Point-in-time inputs ──────────────────────────────────────────────────────

def starters_before(player_rows: list[dict]) -> dict[str, list[str]]:
    """Each team's starters in its latest game, as the data job picks them."""
    latest = {}
    for r in player_rows:
        latest[r["team"]] = max(latest.get(r["team"], ("", "")), (r["date"], r["event_id"]))
    out = defaultdict(list)
    for r in player_rows:
        if r["starter"] and (r["date"], r["event_id"]) == latest[r["team"]]:
            out[r["team"]].append((r["player"], nd.slot_of(r["pos"])))
    return {t: nd.fill_slots(c) for t, c in out.items()}


def game_days(season: int) -> list[dict]:
    """One row per graded game, with every input known the morning of it."""
    teams = nd.numeric(nd.read_rows(nd.raw_path(season, "teams")))
    players = nd.numeric(nd.read_rows(nd.raw_path(season, "players")))
    teams.sort(key=lambda r: (r["date"], r["event_id"]))
    players.sort(key=lambda r: (r["date"], r["event_id"]))

    by_date = defaultdict(list)
    for r in teams:
        by_date[r["date"]].append(r)

    out = []
    for day in sorted(by_date):
        before = [r for r in teams if r["date"] < day]
        regular = [r for r in before if r["season_type"] == nd.REGULAR]
        if not regular:
            continue
        window = nd.team_games_with_opponent(regular)
        season_eff = model.season_efficiency(window)
        played = [g for g in by_date[day] if g["home"] == 1
                  and min(season_eff.get(g["team"], {}).get("g", 0),
                          season_eff.get(g["opp"], {}).get("g", 0)) >= MIN_TEAM_GAMES]
        if not played:
            continue
        l5 = nd.last_five(nd.team_games_with_opponent(before))
        p_before = [r for r in players if r["date"] < day]
        table = {p["name"]: p for p in nd.player_table(
            [r for r in p_before if r["season_type"] == nd.REGULAR], window)}
        starters = starters_before(p_before)
        lg = model.league(window)
        per = {t: model.lineup_per(names, table) for t, names in starters.items()}
        for g in played:
            out.append({
                "date": day, "event_id": g["event_id"], "home": g["team"], "away": g["opp"],
                "home_pts": g["pts"], "away_pts": g["opp_pts"],
                "spread": float(g["spread"]) if g["spread"] != "" else None,
                "total": float(g["total"]) if g["total"] != "" else None,
                **model.inputs(g["team"], g["opp"], season_eff, l5, lg, per),
            })
        print(f"  {day}: {len(played)} game(s)", end="\r")
    print()
    return out


# ── Models ────────────────────────────────────────────────────────────────────

def original(g: dict) -> tuple[float, float]:
    """(home margin, total) by the app.js formula, rebounding terms zero as live."""
    def score(per: float, l5: dict) -> float:
        return (g["lg_pts"] + 1.00 * ((per or 15) - 15) + 0.70 * (l5["oeff"] - 1.0)
                - 0.60 * (l5["deff"] - 1.0) + 0.35 * (l5["pace"] - 100))
    home, away = score(g["per_home"], g["l5_home"]), score(g["per_away"], g["l5_away"])
    return home - away, home + away


def walk_forward(games: list[dict]) -> list[dict]:
    """Attach both models' projections and the fixed model's sigmas. The fixed
    model is refitted before each day on every earlier graded game."""
    out, history = [], []
    for day in sorted({g["date"] for g in games}):
        todays = [g for g in games if g["date"] == day]
        if len(history) >= MIN_FIT_GAMES:
            margins = [h["home_pts"] - h["away_pts"] for h in history]
            totals = [h["home_pts"] + h["away_pts"] for h in history]
            bm = least_squares([margin_features(h) for h in history], margins)
            bt = least_squares([total_features(h) for h in history], totals)
            sd_m = pstdev([y - sum(b * x for b, x in zip(bm, margin_features(h)))
                           for h, y in zip(history, margins)])
            sd_t = pstdev([y - sum(b * x for b, x in zip(bt, total_features(h)))
                           for h, y in zip(history, totals)])
            for g in todays:
                om, ot = original(g)
                out.append({**g, "orig_margin": om, "orig_total": ot,
                            "fix_margin": sum(b * x for b, x in zip(bm, margin_features(g))),
                            "fix_total": sum(b * x for b, x in zip(bt, total_features(g))),
                            "sd_m": sd_m, "sd_t": sd_t, "coef_m": bm, "coef_t": bt})
        history.extend(todays)
    return out


# ── Grading ───────────────────────────────────────────────────────────────────

def payout(price: int) -> float:
    return 100 / -price if price < 0 else price / 100


def grade(rows: list[dict], label: str) -> None:
    """Spread and total picks against the book at several edge floors."""
    win = payout(STANDARD_PRICE)
    print(f"\n{label}")
    for market in ("spread", "total"):
        picks = []
        for g in rows:
            line = g[market]
            if line is None:
                continue
            actual_margin = g["home_pts"] - g["away_pts"]
            actual_total = g["home_pts"] + g["away_pts"]
            for model in ("orig", "fix"):
                if market == "spread":
                    gap = g[f"{model}_margin"] + line          # > 0: home covers
                    result = actual_margin + line
                    p = normal_cdf(gap / g["sd_m"])
                else:
                    gap = g[f"{model}_total"] - line           # > 0: over
                    result = actual_total - line
                    p = normal_cdf(gap / g["sd_t"])
                side_p = max(p, 1 - p)
                won = (result > 0) == (gap > 0)
                picks.append((model, gap > 0, side_p - 0.5, won, result == 0))
        for model in ("orig", "fix"):
            mine = [p for p in picks if p[0] == model]
            first = "home" if market == "spread" else "over"
            share = sum(p[1] for p in mine) / len(mine)
            print(f"  {market:6} {'ORIGINAL' if model == 'orig' else 'FIXED':8} "
                  f"calls {first} {100 * share:4.0f}% of {len(mine)} games")
            for floor in (0.0, 0.02, 0.05):
                sel = [p for p in mine if p[2] >= floor and not p[4]]
                if not sel:
                    continue
                w = sum(p[3] for p in sel)
                roi = (w * win - (len(sel) - w)) / len(sel)
                print(f"      edge >= {100 * floor:2.0f}%: {w:4}-{len(sel) - w:<4} "
                      f"{100 * w / len(sel):5.1f}%  ROI {100 * roi:+5.1f}%")


def accuracy(rows: list[dict]) -> None:
    def mae(xs):
        return mean(abs(x) for x in xs)
    with_lines = [g for g in rows if g["spread"] is not None and g["total"] is not None]
    print(f"\nPROJECTION ERROR on {len(with_lines)} games with lines (lower is better)")
    print(f"  {'':22}{'margin MAE':>11}{'margin bias':>13}{'total MAE':>11}{'total bias':>12}")
    for name, m, t in (("DraftKings line", lambda g: -g["spread"], lambda g: g["total"]),
                       ("ORIGINAL model", lambda g: g["orig_margin"], lambda g: g["orig_total"]),
                       ("FIXED model", lambda g: g["fix_margin"], lambda g: g["fix_total"])):
        em = [m(g) - (g["home_pts"] - g["away_pts"]) for g in with_lines]
        et = [t(g) - (g["home_pts"] + g["away_pts"]) for g in with_lines]
        print(f"  {name:22}{mae(em):11.2f}{mean(em):+13.2f}{mae(et):11.2f}{mean(et):+12.2f}")


def win_probability(rows: list[dict]) -> None:
    """Straight-up winner: log loss and calibration of the fixed model's win %,
    against the original's 1 / (1 + e^(-margin / 5))."""
    print("\nWIN PROBABILITY (home win), log loss: lower is better; coin flip = 0.693")
    for name, prob in (("ORIGINAL", lambda g: 1 / (1 + math.exp(-g["orig_margin"] / 5))),
                       ("FIXED", lambda g: normal_cdf(g["fix_margin"] / g["sd_m"]))):
        ll, bins = 0.0, defaultdict(lambda: [0, 0, 0.0])
        for g in rows:
            p = min(max(prob(g), 1e-6), 1 - 1e-6)
            y = g["home_pts"] > g["away_pts"]
            ll -= math.log(p if y else 1 - p)
            fav = max(p, 1 - p)
            b = bins[min(int(fav * 10), 9)]
            b[0] += 1
            b[1] += (y if p >= 0.5 else not y)
            b[2] += fav
        print(f"  {name:8} log loss {ll / len(rows):.3f}   favourite won: "
              + "  ".join(f"{10 * k}s {100 * v[2] / v[0]:.0f}%->{100 * v[1] / v[0]:.0f}% (n={v[0]})"
                          for k, v in sorted(bins.items())))


# ── Parameters for the daily job ──────────────────────────────────────────────

def best(grid: list[float], loss) -> float:
    return min(grid, key=loss)


def edge_shrink(rows: list[dict], market: str) -> float:
    """k in shown = book + k x (model - book), by maximum likelihood on the
    walk-forward picks. The backtest's lines are -110 both ways, so book = 50%.
    Floored at 0: a k below 0 would mean betting against the model."""
    data = []
    for g in rows:
        line = g[market]
        if line is None:
            continue
        if market == "spread":
            p, result = normal_cdf((g["fix_margin"] + line) / g["sd_m"]), g["home_pts"] - g["away_pts"] + line
        else:
            p, result = normal_cdf((g["fix_total"] - line) / g["sd_t"]), g["home_pts"] + g["away_pts"] - line
        if result:
            data.append((p, result > 0))

    def loss(k):
        return -sum(math.log(0.5 + k * (p - 0.5) if y else 0.5 - k * (p - 0.5)) for p, y in data)
    return best([i / 1000 for i in range(0, 1001)], loss)


def win_stretch(rows: list[dict]) -> float:
    """a in win % = sigmoid(a x logit(model win %)): the backtest's win % was
    a little cautious, so a > 1 sharpens it."""
    data = [(normal_cdf(g["fix_margin"] / g["sd_m"]), g["home_pts"] > g["away_pts"]) for g in rows]

    def loss(a):
        total = 0.0
        for p, y in data:
            p = min(max(p, 1e-6), 1 - 1e-6)
            q = 1 / (1 + math.exp(-a * math.log(p / (1 - p))))
            total -= math.log(q if y else 1 - q)
        return total
    return best([i / 100 for i in range(50, 301)], loss)


def write_params(season: int, games: list[dict], rows: list[dict]) -> None:
    """Fit the model on the whole season and store what the daily job needs."""
    margins = [g["home_pts"] - g["away_pts"] for g in games]
    totals = [g["home_pts"] + g["away_pts"] for g in games]
    bm = least_squares([margin_features(g) for g in games], margins)
    bt = least_squares([total_features(g) for g in games], totals)
    sd_m = pstdev([y - sum(b * x for b, x in zip(bm, margin_features(g))) for g, y in zip(games, margins)])
    sd_t = pstdev([y - sum(b * x for b, x in zip(bt, total_features(g))) for g, y in zip(games, totals)])
    params = {
        "fitted_on": f"{season} season, {len(games)} games, {games[0]['date']} to {games[-1]['date']}",
        "margin": {"names": ["home court", "season matchup", "last-5 matchup", "PER diff"],
                   "coef": [round(c, 4) for c in bm], "sd": round(sd_m, 2)},
        "total": {"names": ["constant", "season matchup", "last-5 matchup", "PER sum"],
                  "coef": [round(c, 4) for c in bt], "sd": round(sd_t, 2)},
        "win_stretch": win_stretch(rows),
        "edge_shrink": {"spread": edge_shrink(rows, "spread"), "total": edge_shrink(rows, "total")},
    }
    # A moneyline is the same margin distribution as the spread; with no
    # moneyline history to fit on, it takes the spread's shrink.
    params["edge_shrink"]["moneyline"] = params["edge_shrink"]["spread"]
    PARAMS.write_text(json.dumps(params, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {PARAMS.name}: " + json.dumps(params))


PARAMS = model.PARAMS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--write-params", action="store_true",
                        help="also fit on the whole season and write pipeline/model_params.json")
    args = parser.parse_args(argv)
    print(f"building point-in-time inputs for {args.season}...")
    games = game_days(args.season)
    rows = walk_forward(games)
    print(f"graded {len(rows)} games, {rows[0]['date']} to {rows[-1]['date']}")
    last = rows[-1]
    print("last fit, margin [home court, season matchup, last-5 matchup, PER diff]: "
          + ", ".join(f"{c:.3f}" for c in last["coef_m"]) + f"  sd {last['sd_m']:.1f}")
    print("last fit, total  [constant, season matchup, last-5 matchup, PER sum]:   "
          + ", ".join(f"{c:.3f}" for c in last["coef_t"]) + f"  sd {last['sd_t']:.1f}")
    accuracy(rows)
    win_probability(rows)
    grade(rows, "AGAINST THE BOOK (-110 both sides; break-even 52.4%)")
    if args.write_params:
        write_params(args.season, games, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
