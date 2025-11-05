# app.py
import pandas as pd
import numpy as np
import streamlit as st

st.set_page_config(page_title="NBA Lineup-Based Model", layout="wide")

# ---------------------------
# 1. Paste your Google Sheet CSV links here
# ---------------------------
STATS_URL = "https://docs.google.com/spreadsheets/d/your_stats_sheet_id/export?format=csv"
LINEUPS_URL = "https://docs.google.com/spreadsheets/d/your_lineups_sheet_id/export?format=csv"

# ---------------------------
# 2. Column letter settings
# ---------------------------
# Stats tab
STATS_PLAYER_COL = "B"
STATS_TEAM_COL   = "A"
STATS_GAMES_COL  = "F"
STATS_MP_COL     = "H"
STATS_PER_COL    = "I"
STATS_USG_COL    = "T"

# Lineups tab
LINEUPS_TEAM_COL = "A"
LINEUPS_G1_COL   = "B"
LINEUPS_G2_COL   = "C"
LINEUPS_F1_COL   = "D"
LINEUPS_F2_COL   = "E"
LINEUPS_C_COL    = "F"

# ---------------------------
# Helper functions
# ---------------------------
def col_letter_to_idx(letter: str) -> int:
    """Convert Excel-style column letter (A, B, AA) to zero-based index."""
    letter = letter.strip().upper()
    val = 0
    for ch in letter:
        val = val * 26 + (ord(ch) - ord('A') + 1)
    return val - 1

def series_by_letter(df: pd.DataFrame, letter: str) -> pd.Series:
    return df.iloc[:, col_letter_to_idx(letter)]

def minutes_per_game(total_minutes, games):
    try:
        g = float(games) if pd.notna(games) else 0
        mp = float(total_minutes) if pd.notna(total_minutes) else 0
        return mp / g if g > 0 else np.nan
    except Exception:
        return np.nan

def usage_adjusted_per(per, usg, league_usage=20.0, cap_low=0.6, cap_high=1.4):
    if pd.isna(per) or pd.isna(usg):
        return np.nan
    scale = np.clip(usg / league_usage, cap_low, cap_high)
    return per * scale

def lineup_weighted_per(player_names, stats_df, cols):
    """Compute weighted lineup PER based on minutes and usage."""
    s_player = series_by_letter(stats_df, cols["player"]).astype(str).str.strip()
    s_per    = pd.to_numeric(series_by_letter(stats_df, cols["per"]), errors="coerce")
    s_usg    = pd.to_numeric(series_by_letter(stats_df, cols["usg"]), errors="coerce")
    s_mpg    = pd.to_numeric(stats_df["__MPG__"], errors="coerce")

    rows = []
    for name in player_names:
        name = (name or "").strip()
        if not name:
            continue
        mask = s_player == name
        if not mask.any():
            continue
        per  = float(s_per[mask].iloc[0])
        usg  = float(s_usg[mask].iloc[0])
        mpg  = float(s_mpg[mask].iloc[0])
        adj_per = usage_adjusted_per(per, usg)
        rows.append((adj_per, mpg))

    if not rows:
        return np.nan
    per_min_sum = sum(p * m for p, m in rows)
    min_sum = sum(m for _, m in rows)
    return per_min_sum / min_sum if min_sum else np.nan

# ---------------------------
# 3. Load data automatically
# ---------------------------
@st.cache_data
def load_data():
    stats_df = pd.read_csv(STATS_URL)
    lineups_df = pd.read_csv(LINEUPS_URL)
    return stats_df, lineups_df

stats_df, lineups_df = load_data()

# Compute MPG = MP / G
s_games = pd.to_numeric(series_by_letter(stats_df, STATS_GAMES_COL), errors="coerce")
s_mp    = pd.to_numeric(series_by_letter(stats_df, STATS_MP_COL), errors="coerce")
stats_df["__MPG__"] = [minutes_per_game(m, g) for m, g in zip(s_mp, s_games)]

# ---------------------------
# 4. Build lineups + compute weighted PER
# ---------------------------
cols = {
    "player": STATS_PLAYER_COL,
    "team": STATS_TEAM_COL,
    "g": STATS_GAMES_COL,
    "mp": STATS_MP_COL,
    "per": STATS_PER_COL,
    "usg": STATS_USG_COL,
    "mpg": "__MPG__"
}

teams = series_by_letter(lineups_df, LINEUPS_TEAM_COL).astype(str).str.strip()
pos_cols = [LINEUPS_G1_COL, LINEUPS_G2_COL, LINEUPS_F1_COL, LINEUPS_F2_COL, LINEUPS_C_COL]

def lineup_from_row(df, row_idx, letters):
    vals = []
    for L in letters:
        vals.append(str(df.iloc[row_idx, col_letter_to_idx(L)]) if pd.notna(df.iloc[row_idx, col_letter_to_idx(L)]) else "")
    return vals

results = []
for i, team in enumerate(teams):
    lineup = lineup_from_row(lineups_df, i, pos_cols)
    lineup_per = lineup_weighted_per(lineup, stats_df, cols)
    results.append((team, lineup_per))

# ---------------------------
# 5. Display
# ---------------------------
st.title("🏀 NBA Lineup Weighted PER Model")
st.markdown("Automatically calculates weighted PER based on Minutes, Usage%, and Player Efficiency.")

df_out = pd.DataFrame(results, columns=["Team", "Weighted Lineup PER"])
df_out = df_out.sort_values("Weighted Lineup PER", ascending=False)
st.dataframe(df_out, use_container_width=True)

st.download_button(
    "📥 Download Results",
    data=df_out.to_csv(index=False).encode("utf-8"),
    file_name="nba_lineup_per.csv",
    mime="text/csv"
)
