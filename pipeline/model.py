"""The NBA game model, shared by the daily job and the backtest (2026-10-26).

Each team's points = possessions x (its offensive efficiency + the opponent's
defensive efficiency - league efficiency) / 100, from both the season and the
last five games; plus home court and the starters' PER. The weights, the
spread of the margin and total, and the win % stretch live in
model_params.json, written by `python pipeline/backtest.py --write-params`.

This replaces the formula app.js used to run in the browser, which added ~30
points to every total (see backtest.py for the comparison).
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import nba_data as nd

PARAMS = Path(__file__).resolve().parent / "model_params.json"


def normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def load_params() -> dict:
    return json.loads(PARAMS.read_text(encoding="utf-8"))


# ── Inputs ────────────────────────────────────────────────────────────────────

def season_efficiency(window: list[dict]) -> dict[str, dict]:
    """Games, pace and offensive/defensive efficiency per team over the window."""
    by_team = defaultdict(list)
    for r in window:
        by_team[r["team"]].append(r)
    out = {}
    for team, rows in by_team.items():
        poss = sum(r["poss"] for r in rows)
        opp_poss = sum(r["opp_poss"] for r in rows)
        out[team] = {"g": len(rows), "pace": nd.pace_of(rows),
                     "oeff": 100 * sum(r["pts"] for r in rows) / poss,
                     "deff": 100 * sum(r["opp_pts"] for r in rows) / opp_poss}
    return out


def league(window: list[dict]) -> dict[str, float]:
    return {"pts": sum(r["pts"] for r in window) / len(window),
            "eff": 100 * sum(r["pts"] for r in window) / sum(r["poss"] for r in window),
            "pace": nd.pace_of(window)}


def lineup_per(names: list[str], players: dict[str, dict]) -> float:
    """The starters' PER weighted by minutes x usage / 20, as app.js weights it."""
    total = weight = 0.0
    for name in names:
        p = players.get(name)
        if not p:
            continue
        w = (p["mp"] or 20) * ((p["usg"] or 20) / 20)
        total += (p["per"] or 15) * w
        weight += w
    return total / weight if weight else 0.0


def inputs(home: str, away: str, season_eff: dict, l5: dict, lg: dict, per: dict) -> dict | None:
    """One game's model inputs, or None when a team has no figures yet."""
    if home not in season_eff or away not in season_eff or home not in l5 or away not in l5:
        return None
    return {"lg_pts": lg["pts"], "lg_eff": lg["eff"], "lg_pace": lg["pace"],
            "s_home": season_eff[home], "s_away": season_eff[away],
            "l5_home": l5[home], "l5_away": l5[away],
            "per_home": per.get(home, 0.0), "per_away": per.get(away, 0.0)}


# ── Model ─────────────────────────────────────────────────────────────────────

def matchup(g: dict, key_home: str, key_away: str) -> tuple[float, float]:
    """(home margin, total) from an additive efficiency matchup on one window."""
    h, a = g[key_home], g[key_away]
    poss = (h["pace"] + a["pace"]) / 2
    home = poss * (h["oeff"] + a["deff"] - g["lg_eff"]) / 100
    away = poss * (a["oeff"] + h["deff"] - g["lg_eff"]) / 100
    return home - away, home + away


def margin_features(g: dict) -> list[float]:
    return [1.0, matchup(g, "s_home", "s_away")[0], matchup(g, "l5_home", "l5_away")[0],
            g["per_home"] - g["per_away"]]


def total_features(g: dict) -> list[float]:
    return [1.0, matchup(g, "s_home", "s_away")[1], matchup(g, "l5_home", "l5_away")[1],
            g["per_home"] + g["per_away"]]


def dot(coef: list[float], features: list[float]) -> float:
    return sum(c * x for c, x in zip(coef, features))


def win_probability(margin: float, sd: float, stretch: float) -> float:
    """Home win %: the margin's normal chance of a home win, sharpened by the
    stretch the backtest fitted (its raw win % was a little cautious)."""
    p = min(max(normal_cdf(margin / sd), 1e-6), 1 - 1e-6)
    return 1 / (1 + math.exp(-stretch * math.log(p / (1 - p))))


def predict(g: dict, params: dict) -> dict:
    margin = dot(params["margin"]["coef"], margin_features(g))
    total = dot(params["total"]["coef"], total_features(g))
    return {"home_pts": (total + margin) / 2, "away_pts": (total - margin) / 2,
            "margin": margin, "total": total,
            "home_win": win_probability(margin, params["margin"]["sd"], params["win_stretch"])}


def american(p: float) -> int:
    """The fair American price of a chance p."""
    p = min(max(p, 0.001), 0.999)
    return round(-100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)
