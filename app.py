# app.py
import io
import re
import pandas as pd
import numpy as np
import streamlit as st

st.set_page_config(page_title="NBA Lineup Model (Column Letters)", layout="wide")

# ---------------------------
# Utilities
# ---------------------------

def col_letter_to_idx(letter: str) -> int:
    """A -> 0, B -> 1, ..., Z -> 25, AA -> 26, etc."""
    letter = letter.strip().upper()
    val = 0
    for ch in letter:
        if not ("A" <= ch <= "Z"):
            raise ValueError(f"Invalid column letter: {letter}")
        val = val * 26 + (ord(ch) - ord('A') + 1)
    return val - 1

def series_by_letter(df: pd.DataFrame, letter: str) -> pd.Series:
    idx = col_letter_to_idx(letter)
    return df.iloc[:, idx]

def minutes_per_game(total_minutes, games):
    try:
        g = float(games) if pd.notna(games) else 0.0
        mp = float(total_minutes) if pd.notna(total_minutes) else 0.0
        return mp / g if g > 0 else np.nan
    except Exception:
        return np.nan

def usage_adjusted_per(per, usg, league_usage=20.0, cap_low=0.6, cap_high=1.4):
    if pd.isna(per) or pd.isna(usg):
        return np.nan
    scale = (usg / league_usage) if league_usage else 1.0
    scale = np.clip(scale, cap_low, cap_high)
    return per * scale

def lineup_weighted_per(player_names, stats_df, cols):
    """
    player_names: list of 5 names (some may be empty)
    stats_df: full stats dataframe
    cols: dict with 'player','team','g','mp','per','usg','mpg' letters (mpg is created)
    """
    rows = []
    # build stats columns as series by letter
    s_player = series_by_letter(stats_df, cols["player"]).astype(str).str.strip()
    s_per    = pd.to_numeric(series_by_letter(stats_df, cols["per"]), errors="coerce")
    s_usg    = pd.to_numeric(series_by_letter(stats_df, cols["usg"]), errors="coerce")
    s_mpg    = pd.to_numeric(stats_df["__MPG__"], errors="coerce")
    for name in player_names:
        name = (name or "").strip()
        if not name:
            continue
        mask = s_player == name
        if not mask.any():
            continue
        per  = float(s_per[mask].iloc[0]) if pd.notna(s_per[mask].iloc[0]) else np.nan
        usg  = float(s_usg[mask].iloc[0]) if pd.notna(s_usg[mask].iloc[0]) else np.nan
        mpg  = float(s_mpg[mask].iloc[0]) if pd.notna(s_mpg[mask].iloc[0]) else np.nan
        adj_per = usage_adjusted_per(per, usg)
        if pd.isna(adj_per) or pd.isna(mpg):
            continue
        rows.append((adj_per, mpg))
    if not rows:
        return np.nan
    per_min_sum = sum(adj * m for adj, m in rows)
    min_sum = sum(m for _, m in rows)
    return per_min_sum / min_sum if min_sum > 0 else np.nan

def nice(x):
    return "" if pd.isna(x) else f"{x:.2f}"

# ---------------------------
# Uploads (top of page)
# ---------------------------

st.title("NBA Lineup-Based Model (Column Letters)")

left, right = st.columns(2)
with left:
    stats_file = st.file_uploader("Upload **Stats** CSV", type=["csv"])
with right:
    lineups_file = st.file_uploader("Upload **Lineups** CSV", type=["csv"])

if not stats_file or not lineups_file:
    st.info("Upload both CSVs above to proceed.")
    st.stop()

try:
    stats_df_raw = pd.read_csv(stats_file)
    lineups_df_raw = pd.read_csv(lineups_file)
except Exception as e:
    st.error(f"Could not read one of the CSVs: {e}")
    st.stop()

# ---------------------------
# Column letter mapping (sidebar)
# ---------------------------

st.sidebar.header("Column Letters — Stats")
stats_player_col = st.sidebar.text_input("Player (e.g., B)", value="B")
stats_team_col   = st.sidebar.text_input("Team (e.g., A)", value="A")
stats_games_col  = st.sidebar.text_input("Games G (e.g., F)", value="F")
stats_mp_col     = st.sidebar.text_input("Minutes MP (e.g., H)", value="H")  # total mins
stats_per_col    = st.sidebar.text_input("PER (e.g., I)", value="I")
stats_usg_col    = st.sidebar.text_input("Usage% (e.g., T)", value="T")

st.sidebar.header("Column Letters — Lineups")
lu_team_col = st.sidebar.text_input("Team (e.g., A)", value="A")
lu_g1_col   = st.sidebar.text_input("Guard 1 (e.g., B)", value="B")
lu_g2_col   = st.sidebar.text_input("Guard 2 (e.g., C)", value="C")
lu_f1_col   = st.sidebar.text_input("Forward 1 (e.g., D)", value="D")
lu_f2_col   = st.sidebar.text_input("Forward 2 (e.g., E)", value="E")
lu_c_col    = st.sidebar.text_input("Center (e.g., F)", value="F")

enable_swaps = st.sidebar.checkbox("Enable lineup swapping", value=True)
show_exports  = st.sidebar.checkbox("Show export", value=True)

# ---------------------------
# Prepare data using letters
# ---------------------------

stats_df = stats_df_raw.copy()
lineups_df = lineups_df_raw.copy()

# Build working columns (by position index)
s_player = series_by_letter(stats_df, stats_player_col).astype(str).str.strip()
s_team   = series_by_letter(stats_df, stats_team_col).astype(str).str.strip()
s_games  = pd.to_numeric(series_by_letter(stats_df, stats_games_col), errors="coerce")
s_mp     = pd.to_numeric(series_by_letter(stats_df, stats_mp_col), errors="coerce")

# Compute MPG = MP / G
stats_df["__MPG__"] = [minutes_per_game(m, g) for m, g in zip(s_mp, s_games)]

# Keep letters map for later
stats_letters = {
    "player": stats_player_col,
    "team": stats_team_col,
    "g": stats_games_col,
    "mp": stats_mp_col,
    "per": stats_per_col,
    "usg": stats_usg_col,
    "mpg": "__MPG__",
}

# Lineups columns as strings (we’ll read by letters on the fly)
teams_series = series_by_letter(lineups_df, lu_team_col).astype(str).str.strip()
pos_cols_letters = [lu_g1_col, lu_g2_col, lu_f1_col, lu_f2_col, lu_c_col]

# ---------------------------
# Preview
# ---------------------------

with st.expander("Preview: Stats (first 20 rows)"):
    st.dataframe(stats_df.head(20))

with st.expander("Preview: Lineups (first 20 rows)"):
    st.dataframe(lineups_df.head(20))

# ---------------------------
# Lineup builder
# ---------------------------

st.subheader("Lineup Builder & Score")

teams = sorted(teams_series.dropna().unique().tolist())
team_choice = st.selectbox("Select team", teams)

# Identify row for this team
team_idx = teams_series[teams_series == team_choice].index[0]

# Current lineup names from lineups by letter
def lineup_from_row(df, row_idx, letters):
    vals = []
    for L in letters:
        vals.append(str(df.iloc[row_idx, col_letter_to_idx(L)]) if pd.notna(df.iloc[row_idx, col_letter_to_idx(L)]) else "")
    return vals

current_lineup = lineup_from_row(lineups_df, team_idx, pos_cols_letters)

# Player pool for this team from stats
pool = sorted(s_player[s_team == team_choice].dropna().unique().tolist())

if "overrides" not in st.session_state:
    st.session_state.overrides = {}

key = f"ovr_{team_choice}"
if key not in st.session_state.overrides:
    st.session_state.overrides[key] = current_lineup.copy()

ov = st.session_state.overrides[key].copy()

if enable_swaps:
    c1, c2, c3, c4, c5 = st.columns(5)
    ov[0] = c1.selectbox("Guard 1", ["—"] + pool, index=(["—"]+pool).index(ov[0]) if ov[0] in (["—"]+pool) else 0)
    ov[1] = c2.selectbox("Guard 2", ["—"] + pool, index=(["—"]+pool).index(ov[1]) if ov[1] in (["—"]+pool) else 0)
    ov[2] = c3.selectbox("Forward 1", ["—"] + pool, index=(["—"]+pool).index(ov[2]) if ov[2] in (["—"]+pool) else 0)
    ov[3] = c4.selectbox("Forward 2", ["—"] + pool, index=(["—"]+pool).index(ov[3]) if ov[3] in (["—"]+pool) else 0)
    ov[4] = c5.selectbox("Center",   ["—"] + pool, index=(["—"]+pool).index(ov[4]) if ov[4] in (["—"]+pool) else 0)

    if st.button("Save lineup for this team"):
        st.session_state.overrides[key] = ov.copy()
        # write back to lineups_df
        for i, L in enumerate(pos_cols_letters):
            val = "" if ov[i] == "—" else ov[i]
            lineups_df.iat[team_idx, col_letter_to_idx(L)] = val
        st.success("Saved lineup.")
else:
    st.info("Swapping disabled in sidebar.")

# Compute lineup score on the fly
players_selected = [p for p in ov if p not in ("—", "", None)]
lu_score = lineup_weighted_per(players_selected, stats_df, stats_letters)

m1, m2 = st.columns(2)
m1.metric("Lineup Weighted PER (usage & minutes)", nice(lu_score))
m2.metric("Δ vs PER 15", nice((lu_score - 15.0) if pd.notna(lu_score) else np.nan))

with st.expander("Selected players — details"):
    if players_selected:
        # show per/usg/mpg for selected
        df_show = pd.DataFrame({
            "Player": players_selected
        })
        # map back to stats rows
        s_per = pd.to_numeric(series_by_letter(stats_df, stats_per_col), errors="coerce")
        s_usg = pd.to_numeric(series_by_letter(stats_df, stats_usg_col), errors="coerce")
        info = []
        for p in players_selected:
            mask = s_player == p
            if mask.any():
                info.append({
                    "Player": p,
                    "MPG": float(stats_df["__MPG__"][mask].iloc[0]) if pd.notna(stats_df["__MPG__"][mask].iloc[0]) else np.nan,
                    "PER": float(s_per[mask].iloc[0]) if pd.notna(s_per[mask].iloc[0]) else np.nan,
                    "USG%": float(s_usg[mask].iloc[0]) if pd.notna(s_usg[mask].iloc[0]) else np.nan
                })
        if info:
            st.dataframe(pd.DataFrame(info))
        else:
            st.write("No matching stats for selected players.")
    else:
        st.write("No players selected.")

# ---------------------------
# Export with lineup scores
# ---------------------------

if show_exports:
    st.markdown("---")
    st.subheader("Export updated lineups")
    # compute LineupPER for each team row
    s_per = pd.to_numeric(series_by_letter(stats_df, stats_per_col), errors="coerce")
    s_usg = pd.to_numeric(series_by_letter(stats_df, stats_usg_col), errors="coerce")

    def score_for_row(idx):
        names = lineup_from_row(lineups_df, idx, pos_cols_letters)
        names = [n for n in names if n and n != "—"]
        return lineup_weighted_per(names, stats_df, stats_letters)

    out = lineups_df.copy()
    out["LineupPER"] = [score_for_row(i) for i in out.index]
    csv_bytes = out.to_csv(index=False).encode("utf-8")
    st.download_button("Download CSV", data=csv_bytes, file_name="lineups_with_scores.csv", mime="text/csv")
