/****************************************************
 * NBA Lineup Model - Static JS Version
 * - Reads CSVs from Google Sheets (published as CSV)
 * - Uses column LETTER mapping (no headers required)
 * - Uses Lineups tab for default starters
 * - Uses Player tab for G, MP, PER, Usage%
 * - Supports Back-to-Back penalty via checkboxes
 ****************************************************/

/* 1) PASTE YOUR CSV LINKS */
const PLAYER_URL      = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=2033299676&single=true&output=csv";
const LINEUPS_URL    = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=975459408&single=true&output=csv";
const OEFF_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1030421164&single=true&output=csv";
const DEFF_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1401009495&single=true&output=csv";
const PACE_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1579578655&single=true&output=csv";
const OREB_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1907720061&single=true&output=csv";
const OPP_OREB_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1902898168&single=true&output=csv";
const DREB_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=957131207&single=true&output=csv";
const OPP_DREB_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=32364573&single=true&output=csv";
const LEAGUE_URL     = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1422185850&single=true&output=csv";

/* 2) COLUMN LETTER MAP (no headers required) */
// These match your handwritten notes.
const COLS = {
  player:  { player: "B", g: "F", mp: "H", per: "I", usg: "T" }, // no team col
  lineups: { team: "A", g1: "B", g2: "C", f1: "D", f2: "E", c: "F" },

  // TeamRankings tabs
  // oreb / dreb / oeff / deff: Team in B, H/A in F/G, Last 3 in D
  oreb: { team: "B", haF: "F", haG: "G", l3: "D" },
  dreb: { team: "B", haF: "F", haG: "G", l3: "D" },
  oeff: { team: "B", haF: "F", haG: "G", l3: "D" },
  deff: { team: "B", haF: "F", haG: "G", l3: "D" },

  // Opponent reb % tabs: Team in B, season % in C, L3 % in D
  ooreb: { team: "B", season: "C", l3: "D" },
  odreb: { team: "B", season: "C", l3: "D" },

  // Pace tab: Team in B, Home pace F, Away pace G
  pace: { team: "B", haF: "F", haG: "G" }
};

/* 3) MODEL WEIGHTS (you can tweak these) */
const BLEND_SZN   = 0.70;   // season vs last 3
const PER_K       = 0.08;   // how much lineup PER matters
const REB_K       = 0.25;   // how much rebounding edge matters
const HCA_PTS     = 2.0;    // home court advantage (points)
const B2B_PENALTY = 1.0;    // back-to-back penalty (points)
const WIN_SIGMA   = 6.5;    // spread std dev for win prob

/*******************  HELPERS  *********************/

function colLetterToIdx(L) {
  if (!L) return -1;
  L = L.trim().toUpperCase();
  let v = 0;
  for (const ch of L) v = v * 26 + (ch.charCodeAt(0) - 65 + 1);
  return v - 1;
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    if (!line.trim()) continue;
    // very simple parser (assumes no commas inside fields)
    rows.push(line.split(","));
  }
  return rows;
}

async function loadCSV(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to load CSV: " + url + " (" + res.status + ")");
  }
  const text = await res.text();
  return parseCSV(text);
}

function hardTrim(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toFloat(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/,/g, "");
  if (!s) return NaN;
  if (s.endsWith("%")) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? NaN : n / 100;
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function safe(v, d) {
  const n = toFloat(v);
  return isNaN(n) ? d : n;
}

function blend(a, b) {
  const A = toFloat(a);
  const B = toFloat(b);
  if (isNaN(A) && isNaN(B)) return NaN;
  if (isNaN(A)) return B;
  if (isNaN(B)) return A;
  return BLEND_SZN * A + (1 - BLEND_SZN) * B;
}

function minutesPerGame(mp, games) {
  const g = toFloat(games);
  const m = toFloat(mp);
  return g > 0 ? m / g : NaN;
}

function usageAdjPER(per, usg, base = 20) {
  const p = toFloat(per);
  const u = toFloat(usg);
  if (isNaN(p) || isNaN(u)) return NaN;
  const mult = Math.max(0.6, Math.min(1.4, u / base));
  return p * mult;
}

function logisticProb(diff, sigma = WIN_SIGMA) {
  // diff = homeScore - awayScore
  return 1 / (1 + Math.exp(-diff / sigma));
}

/*******************  BUILDERS  *********************/

function buildHA(rows, map) {
  const out = {};
  const tIdx = colLetterToIdx(map.team);
  const fIdx = colLetterToIdx(map.haF);
  const gIdx = colLetterToIdx(map.haG);
  const lIdx = colLetterToIdx(map.l3);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const t = hardTrim(row[tIdx]);
    if (!t) continue;
    out[t] = {
      Home: toFloat(row[fIdx]),
      Away: toFloat(row[gIdx]),
      L3: toFloat(row[lIdx])
    };
  }
  return out;
}

function buildSeasonL3(rows, map) {
  const out = {};
  const tIdx = colLetterToIdx(map.team);
  const sIdx = colLetterToIdx(map.season);
  const lIdx = colLetterToIdx(map.l3);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const t = hardTrim(row[tIdx]);
    if (!t) continue;
    out[t] = {
      Season: toFloat(row[sIdx]),
      L3: toFloat(row[lIdx])
    };
  }
  return out;
}

function buildPace(rows, map) {
  const out = {};
  const tIdx = colLetterToIdx(map.team);
  const fIdx = colLetterToIdx(map.haF);
  const gIdx = colLetterToIdx(map.haG);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const t = hardTrim(row[tIdx]);
    if (!t) continue;
    out[t] = {
      Home: toFloat(row[fIdx]),
      Away: toFloat(row[gIdx])
    };
  }
  return out;
}

/*******************  STATE  *********************/

const S = {
  playerRows: null,
  lineupsRows: null,
  oeff: null,
  deff: null,
  pace: null,
  oreb: null,
  dreb: null,
  ooreb: null,
  odreb: null,
  league: { pace: 105, ppg: 115, offEff: 1.12, defEff: 1.12 },

  teams: [],
  allPlayers: [],
  teamBasePER: {},   // baseline lineup PER from default lineups
  overrides: {}      // teamName -> [g1,g2,f1,f2,c]
};

/*******************  INIT  *********************/

async function init() {
  try {
    const [
      playerRows,
      lineupsRows,
      oeffRows,
      deffRows,
      paceRows,
      orebRows,
      oorebRows,
      drebRows,
      odrebRows,
      leagueRows
    ] = await Promise.all([
      loadCSV(PLAYER_URL),
      loadCSV(LINEUPS_URL),
      loadCSV(OEFF_URL),
      loadCSV(DEFF_URL),
      loadCSV(PACE_URL),
      loadCSV(OREB_URL),
      loadCSV(OPP_OREB_URL),
      loadCSV(DREB_URL),
      loadCSV(OPP_DREB_URL),
      loadCSV(LEAGUE_URL)
    ]);

    S.playerRows = playerRows;
    S.lineupsRows = lineupsRows;
    S.oeff = buildHA(oeffRows, COLS.oeff);
    S.deff = buildHA(deffRows, COLS.deff);
    S.pace = buildPace(paceRows, COLS.pace);
    S.oreb = buildHA(orebRows, COLS.oreb);
    S.dreb = buildHA(drebRows, COLS.dreb);
    S.ooreb = buildSeasonL3(oorebRows, COLS.ooreb);
    S.odreb = buildSeasonL3(odrebRows, COLS.odreb);

    // league averages sheet assumed as: label in col A, value in col B
    if (leagueRows && leagueRows.length) {
      const labels = leagueRows.map(r => hardTrim(r[0]).toLowerCase());
      const vals   = leagueRows.map(r => toFloat(r[1]));
      const getVal = name => {
        const idx = labels.indexOf(name.toLowerCase());
        return idx >= 0 ? vals[idx] : NaN;
      };
      S.league = {
        pace:   safe(getVal("pace"), 105),
        ppg:    safe(getVal("points"), 115),
        offEff: safe(getVal("off efficiency"), 1.12),
        defEff: safe(getVal("def efficiency"), 1.12)
      };
    }

    // build team list from Lineups tab
    const tIdx = colLetterToIdx(COLS.lineups.team);
    const teams = [];
    for (let i = 0; i < S.lineupsRows.length; i++) {
      const t = hardTrim(S.lineupsRows[i][tIdx]);
      if (t && t.toLowerCase() !== "team") teams.push(t);
    }
    S.teams = [...new Set(teams)].sort();

    // build full player list from Player tab
    const pIdx = colLetterToIdx(COLS.player.player);
    const players = [];
    for (let i = 1; i < S.playerRows.length; i++) {
      const nm = hardTrim(S.playerRows[i][pIdx]);
      if (nm) players.push(nm);
    }
    S.allPlayers = [...new Set(players)].sort();

    // compute baseline lineup PER for each team from default lineups
    S.teamBasePER = {};
    for (const team of S.teams) {
      const lu = defaultLineupForTeam(team);
      S.teamBasePER[team] = lineupWeightedPER(lu);
    }

    setupUI();
  } catch (err) {
    console.error(err);
    const res = document.getElementById("results");
    if (res) {
      res.style.display = "block";
      res.innerHTML =
        "<strong>Load error</strong> — check CSV links/permissions in app.js.";
    }
  }
}

/*******************  LINEUPS  *********************/

function defaultLineupForTeam(team) {
  const tIdx = colLetterToIdx(COLS.lineups.team);
  const g1Idx = colLetterToIdx(COLS.lineups.g1);
  const g2Idx = colLetterToIdx(COLS.lineups.g2);
  const f1Idx = colLetterToIdx(COLS.lineups.f1);
  const f2Idx = colLetterToIdx(COLS.lineups.f2);
  const cIdx  = colLetterToIdx(COLS.lineups.c);

  const needle = hardTrim(team).toLowerCase();

  for (let i = 0; i < S.lineupsRows.length; i++) {
    const row = S.lineupsRows[i];
    const t = hardTrim(row[tIdx]).toLowerCase();
    if (!t) continue;
    if (t === needle) {
      return [
        hardTrim(row[g1Idx]),
        hardTrim(row[g2Idx]),
        hardTrim(row[f1Idx]),
        hardTrim(row[f2Idx]),
        hardTrim(row[cIdx])
      ].filter(Boolean);
    }
  }
  return [];
}

function lineupWeightedPER(playerNames) {
  if (!playerNames || !playerNames.length) return NaN;

  const pIdx = colLetterToIdx(COLS.player.player);
  const gIdx = colLetterToIdx(COLS.player.g);
  const mIdx = colLetterToIdx(COLS.player.mp);
  const rIdx = colLetterToIdx(COLS.player.per);
  const uIdx = colLetterToIdx(COLS.player.usg);

  let sumPM = 0; // PER * minutes
  let sumM  = 0;

  for (const name of playerNames) {
    const target = hardTrim(name);
    for (let i = 1; i < S.playerRows.length; i++) {
      const row = S.playerRows[i];
      const nm  = hardTrim(row[pIdx]);
      if (!nm || nm !== target) continue;

      const mpg   = minutesPerGame(row[mIdx], row[gIdx]);
      const adj   = usageAdjPER(row[rIdx], row[uIdx]);
      if (!isNaN(mpg) && !isNaN(adj)) {
        sumPM += adj * mpg;
        sumM  += mpg;
      }
    }
  }
  return sumM > 0 ? sumPM / sumM : NaN;
}

function rosterForTeam(team) {
  // Start with that team's default starters, then all other players
  const starters = defaultLineupForTeam(team);
  const rest = S.allPlayers.filter(p => !starters.includes(p));
  return [...starters, ...rest];
}

function getOverrideOrDefaultLineup(team) {
  if (S.overrides[team] && S.overrides[team].length === 5) {
    return S.overrides[team];
  }
  return defaultLineupForTeam(team);
}

/*******************  UI SETUP  *********************/

function setupUI() {
  const awaySel = document.getElementById("awayTeam");
  const homeSel = document.getElementById("homeTeam");
  const predictBtn = document.getElementById("predictBtn");

  if (!awaySel || !homeSel || !predictBtn) return;

  awaySel.innerHTML = "";
  homeSel.innerHTML = "";

  S.teams.forEach(t => {
    const o1 = document.createElement("option");
    o1.value = t;
    o1.textContent = t;
    awaySel.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = t;
    o2.textContent = t;
    homeSel.appendChild(o2);
  });

  if (S.teams.length > 1) homeSel.selectedIndex = 1;

  awaySel.addEventListener("change", () => renderLineupEditors());
  homeSel.addEventListener("change", () => renderLineupEditors());

  const saveAway = document.getElementById("saveAway");
  const saveHome = document.getElementById("saveHome");
  if (saveAway) saveAway.addEventListener("click", () => saveLineupFromUI("away"));
  if (saveHome) saveHome.addEventListener("click", () => saveLineupFromUI("home"));

  predictBtn.addEventListener("click", predictGame);

  renderLineupEditors();
}

function renderLineupEditors() {
  const awayTeam = document.getElementById("awayTeam").value;
  const homeTeam = document.getElementById("homeTeam").value;

  document.getElementById("awayTeamLabel").textContent = awayTeam || "—";
  document.getElementById("homeTeamLabel").textContent = homeTeam || "—";

  if (awayTeam) renderOneEditor("away", awayTeam);
  if (homeTeam) renderOneEditor("home", homeTeam);
}

function renderOneEditor(side, team) {
  const ids = {
    g1: `${side}_g1`,
    g2: `${side}_g2`,
    f1: `${side}_f1`,
    f2: `${side}_f2`,
    c:  `${side}_c`
  };

  const roster = rosterForTeam(team);
  const lineup = getOverrideOrDefaultLineup(team);

  ["g1", "g2", "f1", "f2", "c"].forEach((slot, idx) => {
    const sel = document.getElementById(ids[slot]);
    if (!sel) return;
    sel.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    sel.appendChild(empty);

    roster.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      if (lineup[idx] === p) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function readLineupFromUI(side) {
  const ids = [`${side}_g1`, `${side}_g2`, `${side}_f1`, `${side}_f2`, `${side}_c`];
  return ids
    .map(id => hardTrim(document.getElementById(id)?.value))
    .filter(Boolean);
}

function saveLineupFromUI(side) {
  const team =
    side === "away"
      ? document.getElementById("awayTeam").value
      : document.getElementById("homeTeam").value;

  if (!team) return;
  const lu = readLineupFromUI(side);
  if (lu.length !== 5) return;

  S.overrides[team] = lu;
  // also update baseline PER for this team
  S.teamBasePER[team] = lineupWeightedPER(lu);
  alert(`${team} lineup saved.`);
}

/*******************  MODEL LOGIC  *********************/

function teamContext(team, isHome) {
  const sideKey = isHome ? "Home" : "Away";

  const oeff = S.oeff[team] || {};
  const deff = S.deff[team] || {};
  const oreb = S.oreb[team] || {};
  const dreb = S.dreb[team] || {};
  const pace = S.pace[team] || {};
  const ooreb = S.ooreb[team] || {};
  const odreb = S.odreb[team] || {};

  return {
    offEff: blend(oeff[sideKey], oeff.L3),
    defEff: blend(deff[sideKey], deff.L3),
    oreb:   blend(oreb[sideKey], oreb.L3),
    dreb:   blend(dreb[sideKey], dreb.L3),
    oppOreb: blend(ooreb.Season, ooreb.L3),
    oppDreb: blend(odreb.Season, odreb.L3),
    pace:   pace[sideKey]
  };
}

function predictScores(awayTeam, homeTeam, awayLineup, homeLineup, awayB2B, homeB2B) {
  const leaguePace = S.league.pace;
  const leaguePPG  = S.league.ppg;
  const leagueOff  = S.league.offEff;
  const leagueDef  = S.league.defEff;

  // base pace for game: blend of team paces
  const awayCtx = teamContext(awayTeam, false);
  const homeCtx = teamContext(homeTeam, true);

  const pace = (safe(awayCtx.pace, leaguePace) + safe(homeCtx.pace, leaguePace)) / 2;

  // base points per possession from league
  const basePPP = leaguePPG / leaguePace;

  // offensive and defensive multipliers (normalized to league)
  const awayOffMult = safe(awayCtx.offEff, leagueOff) / leagueOff;
  const homeOffMult = safe(homeCtx.offEff, leagueOff) / leagueOff;

  const awayDefMult = leagueDef / safe(homeCtx.defEff, leagueDef); // opp defense
  const homeDefMult = leagueDef / safe(awayCtx.defEff, leagueDef);

  // lineup PER multipliers (difference between lineups)
  const awayPER = lineupWeightedPER(awayLineup) || S.teamBasePER[awayTeam] || 15;
  const homePER = lineupWeightedPER(homeLineup) || S.teamBasePER[homeTeam] || 15;
  const perDiff = awayPER - homePER; // >0 = away has better lineup

  const awayPERmult = 1 + (perDiff * PER_K) / 100;
  const homePERmult = 1 - (perDiff * PER_K) / 100;

  // rebounding edges (off + def + opp allowed)
  const awayRebEdge =
    safe(awayCtx.oreb, 0) -
    safe(homeCtx.oppDreb, 0) +
    safe(awayCtx.dreb, 0) -
    safe(homeCtx.oppOreb, 0);

  const homeRebEdge =
    safe(homeCtx.oreb, 0) -
    safe(awayCtx.oppDreb, 0) +
    safe(homeCtx.dreb, 0) -
    safe(awayCtx.oppOreb, 0);

  const awayRebMult = 1 + (awayRebEdge * REB_K);
  const homeRebMult = 1 + (homeRebEdge * REB_K);

  // raw expected points
  let awayScore =
    pace *
    basePPP *
    awayOffMult *
    awayDefMult *
    awayPERmult *
    awayRebMult;

  let homeScore =
    pace *
    basePPP *
    homeOffMult *
    homeDefMult *
    homePERmult *
    homeRebMult;

  // home court advantage: split points
  awayScore -= HCA_PTS / 2;
  homeScore += HCA_PTS / 2;

  // back-to-back penalties
  if (awayB2B) awayScore -= B2B_PENALTY;
  if (homeB2B) homeScore -= B2B_PENALTY;

  // clamp to sane range
  awayScore = Math.max(70, Math.min(150, awayScore));
  homeScore = Math.max(70, Math.min(150, homeScore));

  return { awayScore, homeScore };
}

/*******************  PREDICT BUTTON HANDLER  *********************/

function predictGame() {
  const awayTeam = document.getElementById("awayTeam").value;
  const homeTeam = document.getElementById("homeTeam").value;
  const bookSpread = toFloat(document.getElementById("bookSpread").value);
  const bookTotal  = toFloat(document.getElementById("bookTotal").value);
  const awayB2B = document.getElementById("awayB2B")?.checked || false;
  const homeB2B = document.getElementById("homeB2B")?.checked || false;

  if (!awayTeam || !homeTeam || awayTeam === homeTeam) {
    alert("Please select two different teams.");
    return;
  }

  const awayLineup = readLineupFromUI("away");
  const homeLineup = readLineupFromUI("home");

  const { awayScore, homeScore } = predictScores(
    awayTeam,
    homeTeam,
    awayLineup,
    homeLineup,
    awayB2B,
    homeB2B
  );

  const modelTotal = awayScore + homeScore;
  const modelSpread = homeScore - awayScore; // home - away

  // total play
  let totalPlay = "NO BET";
  if (!isNaN(bookTotal)) {
    if (modelTotal >= bookTotal + 10) totalPlay = "BET OVER";
    else if (modelTotal <= bookTotal - 10) totalPlay = "BET UNDER";
  }

  // spread play (bookSpread is home spread; negative = home favored)
  let spreadPlay = "NO BET";
  if (!isNaN(bookSpread)) {
    const edge = modelSpread - (-bookSpread); // compare to model home fav
    if (edge >= 2) spreadPlay = `BET ${homeTeam}`;
    else if (edge <= -2) spreadPlay = `BET ${awayTeam}`;
  }

  // win probabilities
  const diff = homeScore - awayScore;
  const homeWinProb = logisticProb(diff);
  const awayWinProb = 1 - homeWinProb;
  const winner =
    awayScore > homeScore ? awayTeam :
    homeScore > awayScore ? homeTeam : "Push";

  const resultsEl = document.getElementById("results");
  if (!resultsEl) return;

  resultsEl.style.display = "block";
  resultsEl.innerHTML = `
    <h2>Game Prediction Results</h2>
    <p><strong>${awayTeam}:</strong> ${awayScore.toFixed(1)}</p>
    <p><strong>${homeTeam}:</strong> ${homeScore.toFixed(1)}</p>
    <p><strong>Predicted Winner:</strong> ${winner}</p>
    <p><strong>Win Probability:</strong><br>
       ${awayTeam}: ${(awayWinProb * 100).toFixed(1)}%<br>
       ${homeTeam}: ${(homeWinProb * 100).toFixed(1)}%
    </p>
    <hr>
    <p><strong>Model Total:</strong> ${modelTotal.toFixed(1)} ${
      isNaN(bookTotal) ? "" : `vs Book Total ${bookTotal.toFixed(1)}`
    }<br>
       <strong>Total Play:</strong> ${totalPlay}
    </p>
    <p><strong>Model Spread (Home - Away):</strong> ${modelSpread.toFixed(1)} ${
      isNaN(bookSpread) ? "" : `vs Book Spread ${bookSpread.toFixed(1)}`
    }<br>
       <strong>Spread Play:</strong> ${spreadPlay}
    </p>
  `;
}

/*******************  START  *********************/

document.addEventListener("DOMContentLoaded", init);
