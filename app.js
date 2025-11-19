/***********************************************************
 * NBA LINEUP MODEL — static app.js for Vercel
 * - Uses column letters only (no header names required)
 * - Supports:
 *   • Games bar from Apps Script sheet
 *   • Editable lineups with PER/USG weighting
 *   • Back-to-back toggles
 *   • Stat comparison table
 *   • Save Game to Table
 *   • Name mapping via "names" tab (TR / nbastuffer → ESPN)
 ***********************************************************/

/* 1) PASTE YOUR CSV LINKS HERE */
const GAMES_URL     = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=66182824&single=true&output=csv";

const PLAYER_URL    = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=2033299676&single=true&output=csv";
const LINEUPS_URL   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=975459408&single=true&output=csv";
const LEAGUE_URL    = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1422185850&single=true&output=csv";

const OREB_URL      = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1907720061&single=true&output=csv";
const DREB_URL      = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=957131207&single=true&output=csv";
const OPP_OREB_URL  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1902898168&single=true&output=csv";
const OPP_DREB_URL  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=32364573&single=true&output=csv";

const ATS_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1315673353&single=true&output=csv";
const OU_URL        = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1968724257&single=true&output=csv";
const RANKING_URL    = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=2093071983&single=true&output=csv";
const PPG_URL       = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=1145033141&single=true&output=csv";
const NBASTUFF_URL  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=837216555&single=true&output=csv";
const NAMES_URL     = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBKVlskmdHsujbUSOK_73O32-atb-RXYaWuqZL6THtbkWrYx8DTH3s8vfmsbxN9mxzBd0FiTzz49KI/pub?gid=19771105&single=true&output=csv";


/* 2) COLUMN LETTER MAP (edit these to match your sheets)
   These are *letters*, not indices.
*/
const COLS = {
  // Games sheet from Apps Script (one row per game)
  // A: internal id, B: date, C: time, D: Away, E: Home, F: label (optional),
  // G: spread (home = -), H: total
  games: {
    id:    "A",
    date:  "B",
    time:  "C",
    away:  "D",
    home:  "E",
    label: "F",
    spread:"G",
    total: "H"
  },

  // Player stats: (use your actual letters)
  // Example: B = Name, F = Games, H = MP/G, I = PER, T = USG%
  players: {
    name: "B",
    g:    "F",
    mp:   "H",
    per:  "I",
    usg:  "T"
  },

  // Lineups tab (your screenshot: A team, B–F positions)
  lineups: {
    team: "A",
    g1:   "B",
    g2:   "C",
    f1:   "D",
    f2:   "E",
    c:    "F"
  },

  // NBA Stuffer L5 / H/A tab (adjust letters if needed)
  // B: Team, F: PPG, G: OPPG, H: Pace, J: oEff, K: dEff,
  // L: W (last 5), M: L (last 5)
  nbastuff: {
    team:  "B",
    ppg:   "F",
    oppg:  "G",
    pace:  "I",
    oeff:  "J",
    deff:  "K",
    l5w:   "R",
    l5l:   "S"
  },

  // Season PPG / OPPG tab
  ppg: {
    team: "B",
    ppg:  "F",
    oppg: "G"
  },

  // ATS tab: A = Team, B = Record (e.g. 8-3-0), C = Cover%
  ats: {
    team:   "A",
    record: "B",
    cover:  "C"
  },

  // O/U tab: A = Team, B = Record (e.g. 8-3-0)
  ou: {
    team:   "A",
    record: "B"
  },

  // Predictive ranking tab: A = Team, D = Rating
  ranking: {
    team:   "A",
    rating: "D"
  },

  // Names tab: A = TeamRankings, B = nbastuffer, C = ESPN/mascot
  names: {
    tr:     "A",
    stuffer:"B",
    espn:   "C"
  },

  // League averages tab (optional): put "Points" in O, value in P
  league: {
    label: "A",
    value: "B"
  }
};

/* 3) MODEL WEIGHTS (tweak later) */
const WEIGHTS = {
  lineupPer:  0.40,  // PER / usage / minutes
  oEff:       0.30,  // offensive efficiency
  dEff:       0.25,  // defensive efficiency (lower is better)
  pace:       0.10,
  rank:       0.15,
  b2bPenalty: 1.5    // points deducted if back-to-back toggle ON
};

const LEAGUE_DEFAULT_POINTS = 118; // fallback if league avg not loaded

/************** UTILITIES ****************/

function letterToIndex(letter) {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

// Simple CSV parser that respects quoted commas
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  });
}

async function loadCsv(url) {
  if (!url || !url.trim()) return [];
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

function valueFromRow(row, letter) {
  if (!letter) return "";
  const idx = letterToIndex(letter);
  return row[idx] ?? "";
}

function mapTable(rows, colMap, { skipHeader = true } = {}) {
  const start = skipHeader ? 1 : 0;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const obj = {};
    for (const key of Object.keys(colMap)) {
      const letter = colMap[key];
      obj[key] = valueFromRow(r, letter);
    }
    out.push(obj);
  }
  return out;
}

function parseNumber(v, fallback = 0) {
  if (v == null) return fallback;
  const cleaned = String(v).replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/************** NAME MAPPING (TR / STUFFER → ESPN) *************/

let nameMapTrToEspn = {};
let nameMapStuffToEspn = {};

function canonName(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  return (
    nameMapTrToEspn[s] ||
    nameMapStuffToEspn[s] ||
    s
  );
}

/************** GLOBAL STATE ****************/

const state = {
  games: [],           // array of game objects
  players: {},         // name -> { per, mp, usg }
  defaultLineups: {},  // team -> { g1, g2, f1, f2, c }
  teamStats: {},       // team -> merged stats
  leagueAvgPts: LEAGUE_DEFAULT_POINTS,

  selectedGame: null,
  currentPrediction: null
};

/************** DATA LOAD ****************/

async function init() {
  const gamesErrorEl = document.getElementById("games-error");
  gamesErrorEl.textContent = "Loading…";

  try {
    const [
      gamesRows,
      playerRows,
      lineupRows,
      orebRows,
      drebRows,
      oppOrebRows,
      oppDrebRows,
      atsRows,
      ouRows,
      ratingRows,
      ppgRows,
      nbastuffRows,
      namesRows,
      leagueRows
    ] = await Promise.all([
      loadCsv(GAMES_URL),
      loadCsv(PLAYER_URL),
      loadCsv(LINEUPS_URL),
      loadCsv(OREB_URL),
      loadCsv(DREB_URL),
      loadCsv(OPP_OREB_URL),
      loadCsv(OPP_DREB_URL),
      loadCsv(ATS_URL),
      loadCsv(OU_URL),
      loadCsv(RANKING_URL),
      loadCsv(PPG_URL),
      loadCsv(NBASTUFF_URL),
      loadCsv(NAMES_URL),
      loadCsv(LEAGUE_URL)
    ]);

    /* --- build name maps first --- */
    nameMapTrToEspn = {};
    nameMapStuffToEspn = {};
    mapTable(namesRows, COLS.names).forEach(row => {
      const espn = row.espn || row.tr || row.stuffer;
      if (!espn) return;
      if (row.tr)      nameMapTrToEspn[row.tr]       = espn;
      if (row.stuffer) nameMapStuffToEspn[row.stuffer] = espn;
    });

    /* --- games --- */
    state.games = mapTable(gamesRows, COLS.games).map(g => ({
      ...g,
      away:   canonName(g.away),
      home:   canonName(g.home),
      spread: parseNumber(g.spread, 0),
      total:  parseNumber(g.total, 0)
    }));

    if (!state.games.length) {
      gamesErrorEl.textContent = "No games found — check GAMES_URL / CSV.";
    } else {
      gamesErrorEl.textContent = "";
    }

    /* --- players --- */
    const players = mapTable(playerRows, COLS.players);
    players.forEach(p => {
      const name = p.name;
      if (!name) return;
      state.players[name] = {
        name,
        g:   parseNumber(p.g, 1),
        mp:  parseNumber(p.mp, 24),
        per: parseNumber(p.per, 15),
        usg: parseNumber(p.usg, 20)
      };
    });

    /* --- lineups (team name through mapping) --- */
    const lineups = mapTable(lineupRows, COLS.lineups);
    lineups.forEach(l => {
      const team = canonName(l.team);
      if (!team) return;
      state.defaultLineups[team] = {
        g1: l.g1,
        g2: l.g2,
        f1: l.f1,
        f2: l.f2,
        c:  l.c
      };
    });

    /* --- merged team stats --- */
    const statsByTeam = {};
    function ensureTeam(team) {
      if (!team) return;
      const key = canonName(team);
      if (!statsByTeam[key]) statsByTeam[key] = { team: key };
      return statsByTeam[key];
    }

    // NBA Stuffer (L5 stats)
    mapTable(nbastuffRows, COLS.nbastuff).forEach(r => {
      const t = ensureTeam(r.team);
      if (!t) return;
      t.ppg_l5   = parseNumber(r.ppg);
      t.oppg_l5  = parseNumber(r.oppg);
      t.pace_l5  = parseNumber(r.pace);
      t.oeff_l5  = parseNumber(r.oeff, 1.1);
      t.deff_l5  = parseNumber(r.deff, 1.1);
      t.l5w      = parseNumber(r.l5w);
      t.l5l      = parseNumber(r.l5l);
    });

    // Season PPG / OPPG
    mapTable(ppgRows, COLS.ppg).forEach(r => {
      const t = ensureTeam(r.team);
      if (!t) return;
      t.ppg_szn  = parseNumber(r.ppg);
      t.oppg_szn = parseNumber(r.oppg);
    });

    // ATS
    mapTable(atsRows, COLS.ats).forEach(r => {
      const t = ensureTeam(r.team);
      if (!t) return;
      t.ats_record = r.record;
      t.ats_cover  = r.cover;
    });

    // O/U
    mapTable(ouRows, COLS.ou).forEach(r => {
      const t = ensureTeam(r.team);
      if (!t) return;
      t.ou_record = r.record;
    });

    // Predictive rating
    mapTable(ratingRows, COLS.ranking).forEach(r => {
      const t = ensureTeam(r.team);
      if (!t) return;
      t.ranking = parseNumber(r.ranking);
    });

    // League avg points
    const league = mapTable(leagueRows, COLS.league, { skipHeader: false });
    league.forEach(row => {
      const label = (row.label || "").toLowerCase();
      if (label.includes("point")) {
        state.leagueAvgPts = parseNumber(row.value, LEAGUE_DEFAULT_POINTS);
      }
    });

    state.teamStats = statsByTeam;

    /* --- UI setup --- */
    populatePlayerList();
    renderGamesBar();
    wireUiHandlers();
  } catch (err) {
    console.error("NBA init error:", err);
    gamesErrorEl.textContent = "Load error — check CSV links / permissions.";
  }
}

/************** UI HELPERS ****************/

function populatePlayerList() {
  const dl = document.getElementById("players-list");
  if (!dl) return;
  dl.innerHTML = "";
  const names = Object.keys(state.players).sort();
  names.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  });
}

function renderGamesBar() {
  const bar = document.getElementById("games-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!state.games.length) return;

  state.games.forEach((g, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "game-chip";
    chip.dataset.index = idx;

    const timeSpan = document.createElement("span");
    timeSpan.className = "game-chip-time";
    timeSpan.textContent = g.time || "";
    const labelSpan = document.createElement("span");
    const label = g.label || `${g.away} @ ${g.home}`;
    labelSpan.textContent = label;

    chip.appendChild(timeSpan);
    chip.appendChild(labelSpan);

    chip.addEventListener("click", () => {
      selectGame(idx);
    });

    bar.appendChild(chip);
  });

  // auto-select first game
  selectGame(0);
}

function selectGame(idx) {
  const game = state.games[idx];
  state.selectedGame = game;
  state.currentPrediction = null;

  document.querySelectorAll(".game-chip").forEach(chip => {
    chip.classList.toggle("active", Number(chip.dataset.index) === idx);
  });

  const panel = document.getElementById("selected-game-panel");
  if (!panel) return;
  panel.classList.remove("hidden");

  document.getElementById("sg-matchup").textContent =
    `${game.away} @ ${game.home}`;
  document.getElementById("sg-time").textContent = game.time || "";

  document.getElementById("sg-spread").textContent =
    game.spread || game.spread === 0 ? game.spread.toFixed(1) : "—";
  document.getElementById("sg-total").textContent =
    game.total || game.total === 0 ? game.total.toFixed(1) : "—";

  const spreadInput = document.getElementById("book-spread");
  const totalInput  = document.getElementById("book-total");
  if (spreadInput) spreadInput.value = game.spread ?? "";
  if (totalInput)  totalInput.value  = game.total ?? "";

  document.getElementById("away-team-label").textContent = game.away;
  document.getElementById("home-team-label").textContent = game.home;

  loadDefaultLineup("away", game.away);
  loadDefaultLineup("home", game.home);

  document.getElementById("lineups-section").classList.add("hidden");
  document.getElementById("prediction-section").classList.add("hidden");
  document.getElementById("stats-section").classList.add("hidden");
  document.getElementById("prediction-error").textContent = "";
}

function loadDefaultLineup(side, team) {
  const lineup = state.defaultLineups[team] || {
    g1: "",
    g2: "",
    f1: "",
    f2: "",
    c: ""
  };

  document.getElementById(`${side}-g1`).value = lineup.g1 || "";
  document.getElementById(`${side}-g2`).value = lineup.g2 || "";
  document.getElementById(`${side}-f1`).value = lineup.f1 || "";
  document.getElementById(`${side}-f2`).value = lineup.f2 || "";
  document.getElementById(`${side}-c`).value  = lineup.c  || "";

  document.getElementById(`${side}-b2b`).checked = false;

  const per = computeLineupPer(side);
  document.getElementById(`${side}-lineup-per`).textContent =
    per ? per.toFixed(2) : "—";
}

/************** LINEUP + MODEL LOGIC ****************/

function getLineupPlayers(side) {
  return [
    document.getElementById(`${side}-g1`).value.trim(),
    document.getElementById(`${side}-g2`).value.trim(),
    document.getElementById(`${side}-f1`).value.trim(),
    document.getElementById(`${side}-f2`).value.trim(),
    document.getElementById(`${side}-c`).value.trim()
  ].filter(Boolean);
}

function computeLineupPer(side) {
  const playerNames = getLineupPlayers(side);
  let totalWeighted = 0;
  let totalWeight = 0;

  playerNames.forEach(name => {
    const p = state.players[name];
    if (!p) return;
    const minutes = p.mp || 24;
    const usage   = p.usg || 20;
    const weight  = minutes * (usage / 20);
    totalWeighted += p.per * weight;
    totalWeight   += weight;
  });

  if (!totalWeight) return 15; // fallback league-avg PER
  return totalWeighted / totalWeight;
}

function computeTeamStrength(teamName, side, lineupPer, isB2B) {
  const stats = state.teamStats[teamName] || {};
  const oEff = stats.oeff_l5 || 1.1;
  const dEff = stats.deff_l5 || 1.1;
  const pace = stats.pace_l5 || stats.pace_szn || 100;
  const rating = stats.rating || 0;

  const perDelta = (lineupPer || 15) - 15;

  let strength =
    WEIGHTS.lineupPer * perDelta +
    WEIGHTS.oEff      * (oEff - 1.1) * 10 +
    WEIGHTS.dEff      * (1.1 - dEff) * 10 +  // lower dEff = better
    WEIGHTS.pace      * (pace - 100) / 4 +
    WEIGHTS.rank      * rating;

  if (isB2B) strength -= WEIGHTS.b2bPenalty;

  return strength;
}

function predictCurrentGame() {
  const game = state.selectedGame;
  if (!game) return null;

  const spreadInput = document.getElementById("book-spread");
  const totalInput  = document.getElementById("book-total");

  const bookSpread = parseNumber(spreadInput.value, game.spread);
  const bookTotal  = parseNumber(totalInput.value, game.total);

  const awayPer = computeLineupPer("away");
  const homePer = computeLineupPer("home");
  document.getElementById("away-lineup-per").textContent = awayPer.toFixed(2);
  document.getElementById("home-lineup-per").textContent = homePer.toFixed(2);

  const awayB2B = document.getElementById("away-b2b").checked;
  const homeB2B = document.getElementById("home-b2b").checked;

  const awayStrength = computeTeamStrength(game.away, "away", awayPer, awayB2B);
  const homeStrength = computeTeamStrength(game.home, "home", homePer, homeB2B);

  const strengthDiff = homeStrength - awayStrength; // home minus away

  // Convert strength diff into spread (home negative when favored)
  const modelSpread = strengthDiff * 1.1;

  // Baseline total from team PPG (L5 > season > league avg)
  const awayStats = state.teamStats[game.away] || {};
  const homeStats = state.teamStats[game.home] || {};

  const awayPpgBase =
    awayStats.ppg_l5 ||
    awayStats.ppg_szn ||
    state.leagueAvgPts;

  const homePpgBase =
    homeStats.ppg_l5 ||
    homeStats.ppg_szn ||
    state.leagueAvgPts;

  // Combined scoring baseline (no extra /2 here)
  let modelTotal = awayPpgBase + homePpgBase;

  // Pace adjustment (centered at 100)
  const paceAvg =
    (awayStats.pace_l5 || 100) * 0.5 +
    (homeStats.pace_l5 || 100) * 0.5;
  const paceAdj = (paceAvg - 100) * 0.5;
  modelTotal += paceAdj;

  // Split points between teams via logistic on strength
  const homeShare = 1 / (1 + Math.exp(-strengthDiff / 5));
  const awayShare = 1 - homeShare;

  const awayScore = modelTotal * awayShare;
  const homeScore = modelTotal * homeShare;

  // Win probabilities from spread proxy
  const homeWinProb = 1 / (1 + Math.exp(-modelSpread / 5));
  const awayWinProb = 1 - homeWinProb;

  return {
    game,
    bookSpread,
    bookTotal,
    awayScore,
    homeScore,
    modelTotal,
    modelSpread,
    homeWinProb,
    awayWinProb
  };
}

/************** STAT COMPARISON TABLE ****************/

function buildStatComparison(game) {
  const table = document.getElementById("stats-table");
  const errorEl = document.getElementById("stats-error");
  errorEl.textContent = "";

  const away = state.teamStats[game.away] || { team: game.away };
  const home = state.teamStats[game.home] || { team: game.home };

  function row(label, aVal, hVal, betterHigh = true) {
    const aNum = parseNumber(aVal, NaN);
    const hNum = parseNumber(hVal, NaN);
    let aBetter = false;
    let hBetter = false;
    if (!Number.isNaN(aNum) && !Number.isNaN(hNum)) {
      if (betterHigh) {
        if (aNum > hNum) aBetter = true;
        else if (hNum > aNum) hBetter = true;
      } else {
        if (aNum < hNum) aBetter = true;
        else if (hNum < aNum) hBetter = true;
      }
    }
    return { label, aVal, hVal, aBetter, hBetter };
  }

  const rows = [
    row("PPG (Last 5)", away.ppg_l5, home.ppg_l5, true),
    row("OPPG (Last 5)", away.oppg_l5, home.oppg_l5, false),
    row("Pace (Last 5)", away.pace_l5, home.pace_l5, true),
    row("Off Eff (Last 5)", away.oeff_l5, home.oeff_l5, true),
    row("Def Eff (Last 5)", away.deff_l5, home.deff_l5, false),
    row("Season PPG", away.ppg_szn, home.ppg_szn, true),
    row("Season OPPG", away.oppg_szn, home.oppg_szn, false),
    row("Last 5 Record",
        `${away.l5w || 0}-${away.l5l || 0}`,
        `${home.l5w || 0}-${home.l5l || 0}`,
        true),
    row("ATS Record", away.ats_record, home.ats_record, true),
    row("O/U Record", away.ou_record, home.ou_record, true),
    row("Predictive Rating", away.rating, home.rating, true)
  ];

  table.innerHTML = "";

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  const thBlank = document.createElement("th");
  thBlank.className = "stats-row-label";
  thBlank.textContent = "";
  htr.appendChild(thBlank);

  const thAway = document.createElement("th");
  thAway.textContent = game.away;
  htr.appendChild(thAway);

  const thHome = document.createElement("th");
  thHome.textContent = game.home;
  htr.appendChild(thHome);

  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");

    const tdLabel = document.createElement("td");
    tdLabel.className = "stats-row-label";
    tdLabel.textContent = r.label;
    tr.appendChild(tdLabel);

    const tdAway = document.createElement("td");
    tdAway.textContent = r.aVal ?? "—";
    if (r.aBetter) tdAway.classList.add("stats-better");
    tr.appendChild(tdAway);

    const tdHome = document.createElement("td");
    tdHome.textContent = r.hVal ?? "—";
    if (r.hBetter) tdHome.classList.add("stats-better");
    tr.appendChild(tdHome);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

/************** SAVED GAMES TABLE ****************/

function appendSavedGame(pred) {
  const tbody = document.querySelector("#saved-table tbody");
  if (!tbody) return;

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const cells = [
    dateStr,
    `${pred.game.away} @ ${pred.game.home}`,
    pred.awayScore.toFixed(1),
    pred.homeScore.toFixed(1),
    pred.modelTotal.toFixed(1),
    pred.bookTotal ? pred.bookTotal.toFixed(1) : "—",
    pred.bookTotal ? (pred.modelTotal - pred.bookTotal).toFixed(1) : "—",
    pred.modelSpread.toFixed(1),
    pred.bookSpread ? pred.bookSpread.toFixed(1) : "—",
    pred.bookSpread ? (pred.modelSpread - pred.bookSpread).toFixed(1) : "—"
  ];

  const tr = document.createElement("tr");
  cells.forEach(v => {
    const td = document.createElement("td");
    td.textContent = v;
    tr.appendChild(td);
  });

  tbody.appendChild(tr);
}

/************** BUTTON WIRING ****************/

function wireUiHandlers() {
  document.getElementById("btn-lineups").addEventListener("click", () => {
    document.getElementById("lineups-section").classList.remove("hidden");
  });

  document.getElementById("btn-predict").addEventListener("click", () => {
    const errEl = document.getElementById("prediction-error");
    errEl.textContent = "";
    const pred = predictCurrentGame();
    if (!pred) {
      errEl.textContent = "Unable to predict — missing game or stats.";
      return;
    }
    state.currentPrediction = pred;
    showPrediction(pred);
  });

  document.getElementById("btn-stats").addEventListener("click", () => {
    if (!state.selectedGame) return;
    buildStatComparison(state.selectedGame);
    document.getElementById("stats-section").classList.remove("hidden");
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    if (!state.currentPrediction) {
      document.getElementById("prediction-error").textContent =
        "Run a prediction first before saving.";
      return;
    }
    appendSavedGame(state.currentPrediction);
  });

  // lineup save/reset
  document.getElementById("btn-save-away").addEventListener("click", () => {
    if (!state.selectedGame) return;
    const team = state.selectedGame.away;
    state.defaultLineups[team] = {
      g1: document.getElementById("away-g1").value.trim(),
      g2: document.getElementById("away-g2").value.trim(),
      f1: document.getElementById("away-f1").value.trim(),
      f2: document.getElementById("away-f2").value.trim(),
      c:  document.getElementById("away-c").value.trim()
    };
    const per = computeLineupPer("away");
    document.getElementById("away-lineup-per").textContent = per.toFixed(2);
  });

  document.getElementById("btn-reset-away").addEventListener("click", () => {
    if (!state.selectedGame) return;
    loadDefaultLineup("away", state.selectedGame.away);
  });

  document.getElementById("btn-save-home").addEventListener("click", () => {
    if (!state.selectedGame) return;
    const team = state.selectedGame.home;
    state.defaultLineups[team] = {
      g1: document.getElementById("home-g1").value.trim(),
      g2: document.getElementById("home-g2").value.trim(),
      f1: document.getElementById("home-f1").value.trim(),
      f2: document.getElementById("home-f2").value.trim(),
      c:  document.getElementById("home-c").value.trim()
    };
    const per = computeLineupPer("home");
    document.getElementById("home-lineup-per").textContent = per.toFixed(2);
  });

  document.getElementById("btn-reset-home").addEventListener("click", () => {
    if (!state.selectedGame) return;
    loadDefaultLineup("home", state.selectedGame.home);
  });
}

function showPrediction(pred) {
  const section = document.getElementById("prediction-section");
  section.classList.remove("hidden");

  document.getElementById("pred-away-name").textContent = pred.game.away;
  document.getElementById("pred-home-name").textContent = pred.game.home;
  document.getElementById("pred-away-score").textContent =
    pred.awayScore.toFixed(1);
  document.getElementById("pred-home-score").textContent =
    pred.homeScore.toFixed(1);

  const winner =
    pred.homeScore > pred.awayScore ? pred.game.home : pred.game.away;
  document.getElementById("pred-winner").textContent = winner;

  document.getElementById("pred-away-winprob").textContent =
    `${pred.game.away}: ${(pred.awayWinProb * 100).toFixed(1)}%`;
  document.getElementById("pred-home-winprob").textContent =
    `${pred.game.home}: ${(pred.homeWinProb * 100).toFixed(1)}%`;

  const totalLine = `Model Total: ${pred.modelTotal.toFixed(
    1
  )} vs Book Total ${
    pred.bookTotal || pred.bookTotal === 0 ? pred.bookTotal.toFixed(1) : "—"
  }`;
  document.getElementById("pred-total-line").textContent = totalLine;

  let totalPlayText = "NO BET";
  let totalPillClass = "pill-nobet";
  if (pred.bookTotal || pred.bookTotal === 0) {
    const diff = pred.modelTotal - pred.bookTotal;
    if (diff >= 4) {
      totalPlayText = "BET OVER";
      totalPillClass = "pill-over";
    } else if (diff <= -4) {
      totalPlayText = "BET UNDER";
      totalPillClass = "pill-under";
    }
  }
  const totalPill = document.getElementById("pred-total-play-pill");
  totalPill.className = `pill ${totalPillClass}`;
  document.getElementById("pred-total-play").textContent = totalPlayText;

  const spreadLine = `Model Spread (Home = -): ${pred.modelSpread.toFixed(
    1
  )} vs Book Spread ${
    pred.bookSpread || pred.bookSpread === 0
      ? pred.bookSpread.toFixed(1)
      : "—"
  }`;
  document.getElementById("pred-spread-line").textContent = spreadLine;

  let spreadPlayText = "NO BET";
  let spreadPillClass = "pill-nobet";
  if (pred.bookSpread || pred.bookSpread === 0) {
    const diff = pred.modelSpread - pred.bookSpread;
    if (diff <= -2) {
      spreadPlayText = `BET ${pred.game.home}`;
      spreadPillClass = "pill-over";
    } else if (diff >= 2) {
      spreadPlayText = `BET ${pred.game.away}`;
      spreadPillClass = "pill-under";
    }
  }
  const spreadPill = document.getElementById("pred-spread-play-pill");
  spreadPill.className = `pill ${spreadPillClass}`;
  document.getElementById("pred-spread-play").textContent = spreadPlayText;
}

/************* STARTUP *************/
document.addEventListener("DOMContentLoaded", init);
