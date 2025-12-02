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
    c:    "F",
    PER:  "AA"
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
  lineupPer:  1.00,  // PER / usage / minutes
  oEff:       0.70,  // offensive efficiency
  dEff:       0.60,  // defensive efficiency
  pace:       0.35,  // pace
  oreb:       0.50,  // offensive rebounding %
  dreb:       0.25,  // defensive rebounding %
}

/*************** CONSTANTS *****************/

const LEAGUE_DEFAULT_POINTS = 118; // fallback if league avg 
const LINEUP_PER_MIDPOINT = 15; // PER baseline for lineup adjustment
// For oEff / dEff we treat 1.0 as league average if not provided
const leagueAvgOffEff = 1.0;
const leagueAvgDefEff = 1.0;
const leagueAvgPace   = 100;

/*************** UTILITIES *****************/

// letter -> 0-based index (A -> 0)
function letterToIndex(letter) {
  return String(letter).toUpperCase().charCodeAt(0) - 65;
}

// Simple CSV parser that respects quoted commas (returns array of rows -> array of cells)
function parseCsv(text) {
  if (!text) return [];
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

// load CSV from public Google "publish as csv" link (or other csv url)
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
  if (!letter || !row) return "";
  const idx = letterToIndex(letter);
  return row[idx] ?? "";
}

// Map rows -> objects using a column-letter map
// colMap: { field1: "A", field2: "B", ... }
function mapTable(rows, colMap, { skipHeader = true } = {}) {
  const out = [];
  const start = skipHeader ? 1 : 0;
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

function parseNumber(v, fallback = NaN) {
  if (v == null) return fallback;
  const s = String(v).replace(/[,%]/g, "").trim();
  if (s === "") return fallback;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

/*************** GLOBAL STATE ****************/

const state = {
  games: [],
  players: {},          // name -> { name, g, mp, per, usg }
  defaultLineups: {},   // teamName -> { g1,g2,f1,f2,c }
  customLineups: {},     // teamName -> { g1,g2,f1,f2,c }
  teamStats: {},        // teamName -> merged stats object
  leagueAvgPts: typeof LEAGUE_DEFAULT_POINTS !== "undefined" ? LEAGUE_DEFAULT_POINTS : 118,
  selectedGameIndex: null,
  currentPrediction: null,
  nameMapTrToEspn: {},  // mapping table names -> espn
  nameMapStuffToEspn: {}
};

/*************** DATA LOAD + INIT ****************/

async function init() {
  const gamesErrorEl = document.getElementById("games-error");
  if (gamesErrorEl) gamesErrorEl.textContent = "Loading…";

  try {
    // fetch all relevant CSVs in parallel
    const [
      gamesRows,
      playerRows,
      lineupRows,
      nbastuffRows,
      ppgRows,
      atsRows,
      ouRows,
      rankRows,
      leagueRows,
      namesRows
    ] = await Promise.all([
      loadCsv(GAMES_URL),
      loadCsv(PLAYER_URL),
      loadCsv(LINEUPS_URL),
      loadCsv(NBASTUFF_URL),
      loadCsv(PPG_URL),
      loadCsv(ATS_URL),
      loadCsv(OU_URL),
      loadCsv(RANKING_URL),
      loadCsv(LEAGUE_URL),
      loadCsv(NAMES_URL)
    ]);

    // parse and map
    state.games = mapTable(gamesRows, COLS.games).map(g => ({
      ...g,
      spread: parseNumber(g.spread, 0),
      total: parseNumber(g.total, 0)
    }));

    // players
    const players = mapTable(playerRows, COLS.players);
    players.forEach(p => {
      const name = p.name;
      if (!name) return;
      state.players[name] = {
        name,
        g: parseNumber(p.g, 0),
        mp: parseNumber(p.mp, 20),
        per: parseNumber(p.per, 15),
        usg: parseNumber(p.usg, 20)
      };
    });

    // build name maps (namesRows expected to include columns for different sources)
    // Expecting a table like: TR_name | Stuff_name | ESPN_name  (you said A/B/C)
    if (namesRows && namesRows.length > 1) {
      const head = namesRows[0];
      // try to find which column is TR, Stuff and ESPN by header text; fallback to A/B/C
      const hdr = head.map(h => (h || "").toString().toLowerCase());
      let trCol = hdr.indexOf("team") >= 0 ? hdr.indexOf("team") : 0;
      let stuffCol = hdr.indexOf("nbastuffer") >= 0 ? hdr.indexOf("nbastuffer") : 1;
      let espnCol = hdr.indexOf("espn") >= 0 ? hdr.indexOf("espn") : 2;

      // if header row contains no meaningful words, default columns A/B/C
      if (hdr.every(h => !h)) {
        trCol = 0; stuffCol = 1; espnCol = 2;
      }

      // build maps
      for (let i = 1; i < namesRows.length; i++) {
        const r = namesRows[i];
        if (!r) continue;
        const tr = (r[trCol] || "").toString().trim();
        const stuff = (r[stuffCol] || "").toString().trim();
        const espn = (r[espnCol] || "").toString().trim();
        if (tr && espn) state.nameMapTrToEspn[tr] = espn;
        if (stuff && espn) state.nameMapStuffToEspn[stuff] = espn;
      }
    }

    // team stats merge
    const statsByTeam = {};

    function ensureTeam(t) {
      if (!t) return null;
      if (!statsByTeam[t]) statsByTeam[t] = { team: t };
      return statsByTeam[t];
    }

    // NBA Stuffer L5/H-A tab
    mapTable(nbastuffRows, COLS.nbastuff).forEach(r => {
      const teamRaw = r.team;
      if (!teamRaw) return;
      const team = normalizeTeamName(teamRaw);
      const t = ensureTeam(team);
      t.ppg_l5  = parseNumber(r.ppg);
      t.oppg_l5 = parseNumber(r.oppg);
      t.pace_l5 = parseNumber(r.pace);
      t.oeff_l5 = parseNumber(r.oeff);
      t.deff_l5 = parseNumber(r.deff);
      t.l5w = parseNumber(r.l5w, 0);
      t.l5l = parseNumber(r.l5l, 0);
    });

    // Season PPG
    mapTable(ppgRows, COLS.ppg).forEach(r => {
      const team = normalizeTeamName(r.team);
      const t = ensureTeam(team);
      t.ppg_szn = parseNumber(r.ppg);
      t.oppg_szn = parseNumber(r.oppg);
    });

    // ATS
    mapTable(atsRows, COLS.ats).forEach(r => {
      const team = normalizeTeamName(r.team);
      const t = ensureTeam(team);
      t.ats_record = r.record;
      t.ats_cover = r.cover;
    });

    // O/U
    mapTable(ouRows, COLS.ou).forEach(r => {
      const team = normalizeTeamName(r.team);
      const t = ensureTeam(team);
      t.ou_record = r.record;
    });

    // Predictive ranking
    mapTable(rankRows, COLS.ranking).forEach(r => {
      const team = normalizeTeamName(r.team);
      const t = ensureTeam(team);
      t.rating = parseNumber(r.rating, 0);
    });

    // League averages (optional)
    const league = mapTable(leagueRows, COLS.league, { skipHeader: false });
    league.forEach(r => {
      const label = (r.label || "").toString().toLowerCase();
      const value = parseNumber(r.value, NaN);
      if (label.includes("point") || label.includes("points")) {
        if (!Number.isNaN(value)) state.leagueAvgPts = value;
      }
    });

    // lineups (team -> starters + adjusted lineup PER)
    const lineups = mapTable(lineupRows, COLS.lineups);
    lineups.forEach(l => {
      const team = l.team;
      if (!team) return;
      // starters
      const normalizedTeam = normalizeTeamName(team);
      state.defaultLineups[normalizedTeam] = {
        g1: l.g1 || "",
        g2: l.g2 || "",
        f1: l.f1 || "",
        f2: l.f2 || "",
        c:  l.c  || ""
      };
      // adjusted lineup PER, column AA
      const t = ensureTeam(team);
      t.lineup_per = parseNumber(l.PER);
    });

    state.teamStats = statsByTeam;

    // populate UI lists and render
    populatePlayerList();
    renderGamesBar();
    wireUiHandlers();

    if (gamesErrorEl) {
      if (!state.games.length) gamesErrorEl.textContent = "No games — check GAMES_URL / CSV.";
      else gamesErrorEl.textContent = "";
    }
  } catch (err) {
    console.error("init error", err);
    const gamesErrorEl = document.getElementById("games-error");
    if (gamesErrorEl) gamesErrorEl.textContent = "Load error — check CSV links / permissions.";
  }
}

/*************** NAME NORMALIZATION ****************/

// Try to map arbitrary team name to the ESPN-style name we use throughout the UI.
// We prefer: TR->ESPN map, then Stuffer->ESPN map, else raw string.
function normalizeTeamName(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // try maps
  return state.nameMapTrToEspn[s] || state.nameMapStuffToEspn[s] || s;
}

/*************** UI HELPERS ****************/

function populatePlayerList() {
  const dl = document.getElementById("players-list");
  if (!dl) return;
  dl.innerHTML = "";
  const names = Object.keys(state.players).sort();
  names.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    dl.appendChild(opt);
  });
}

function renderGamesBar() {
  const bar = document.getElementById("games-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!state.games || state.games.length === 0) return;

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
    chip.addEventListener("click", () => selectGame(idx));
    bar.appendChild(chip);
  });

  // auto-select first game
  if (state.games.length) selectGame(0);
}

function selectGame(index) {
  if (!state.games[index]) return;
  state.selectedGameIndex = index;
  const game = state.games[index];
  // highlight chips
  document.querySelectorAll(".game-chip").forEach(chip => {
    chip.classList.toggle("active", Number(chip.dataset.index) === index);
  });

  // populate panel
  const panel = document.getElementById("selected-game-panel");
  if (panel) panel.classList.remove("hidden");

  document.getElementById("sg-matchup").textContent = `${game.away} @ ${game.home}`;
  document.getElementById("sg-time").textContent = game.time || "";
  document.getElementById("sg-spread").textContent = game.spread ? game.spread.toFixed(1) : "—";
  document.getElementById("sg-total").textContent = game.total ? game.total.toFixed(1) : "—";

  // fill edit inputs
  document.getElementById("book-spread").value = game.spread || "";
  document.getElementById("book-total").value = game.total || "";

  // load lineups (normalized team names)
  document.getElementById("away-team-label").textContent = game.away;
  document.getElementById("home-team-label").textContent = game.home;
  loadDefaultLineup("away", game.away);
  loadDefaultLineup("home", game.home);

  // hide sections until requested
  document.getElementById("lineups-section").classList.add("hidden");
  document.getElementById("prediction-section").classList.add("hidden");
  document.getElementById("stats-section").classList.add("hidden");
  document.getElementById("prediction-error").textContent = "";
}

/*************** LINEUP + MODEL HELPERS ****************/

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
  if (!playerNames.length) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  playerNames.forEach(name => {
    const p = state.players[name];
    if (!p) return;
    const minutes = p.mp || 20;
    const usage = p.usg || 20;
    const w = minutes * (usage / 20);
    weightedSum += (p.per || 15) * w;
    weightTotal += w;
  });
  return weightTotal ? (weightedSum / weightTotal) : 0;
}

function loadDefaultLineup(side, teamRaw) {
  console.log("loadDefaultLineup", side, teamRaw);
  const team = normalizeTeamName(teamRaw);
  const lineup = state.defaultLineups[team] || { g1: "", g2: "", f1: "", f2: "", c: "" };
  console.log("  normalized team:", team, "lineup:", lineup);
  document.getElementById(`${side}-g1`).value = lineup.g1 || "";
  document.getElementById(`${side}-g2`).value = lineup.g2 || "";
  document.getElementById(`${side}-f1`).value = lineup.f1 || "";
  document.getElementById(`${side}-f2`).value = lineup.f2 || "";
  document.getElementById(`${side}-c`).value  = lineup.c || "";
  document.getElementById(`${side}-b2b`).checked = false;
  const per = computeLineupPer(side);
  document.getElementById(`${side}-lineup-per`).textContent = per ? per.toFixed(2) : "—";
  console.log("  loaded lineup PER:", per);
}

/*************** PREDICTION ****************/

function predictCurrentGame() {
  const idx = state.selectedGameIndex;
  if (idx == null) return null;
  const game = state.games[idx];
  if (!game) return null;

  // Book lines
  const bookSpread = parseNumber(
    document.getElementById("book-spread").value,
    game.spread
  );
  const bookTotal = parseNumber(
    document.getElementById("book-total").value,
    game.total
  );

  // Lineup PER
  const awayPer = computeLineupPer("away");
  const homePer = computeLineupPer("home");

  document.getElementById("away-lineup-per").textContent =
    awayPer ? awayPer.toFixed(2) : "—";
  document.getElementById("home-lineup-per").textContent =
    homePer ? homePer.toFixed(2) : "—";

  // Team stats (L5 if available, else fallbacks)
  const awayTeam = normalizeTeamName(game.away);
  const homeTeam = normalizeTeamName(game.home);

  const awayStats = state.teamStats[awayTeam] || {};
  const homeStats = state.teamStats[homeTeam] || {};

  // League "averages" for formula (use reasonable fallbacks)
  const leagueAvgPoints = state.leagueAvgPts || LEAGUE_DEFAULT_POINTS;


  // Per-team inputs for formula
  function getOffEff(stats) {
    // if we have an oeff_l5, use it; else derive from PPG vs league avg points
    if (stats.oeff_l5) return stats.oeff_l5;
    if (stats.ppg_szn) return stats.ppg_szn / (state.leagueAvgPts / 100);
    return 1.0;
  }

  function getDefEff(stats) {
    if (stats.deff_l5) return stats.deff_l5;
    if (stats.oppg_szn) return stats.oppg_szn / (state.leagueAvgPts / 100);
    return 1.0;
  }

  function getPace(stats) {
    return stats.pace_l5 || leagueAvgPace;
  }

  // Rebounding stats:
  // We assume you have already loaded these into state.teamStats
  // from OREB_URL, DREB_URL, OPP_OREB_URL, OPP_DREB_URL (not shown here).
  function getOffRebPerc(stats) {
    return parseNumber(stats.oreb_pct, leagueAvgOffEff); // fallback neutral
  }

  function getDefRebPerc(stats) {
    return parseNumber(stats.dreb_pct, leagueAvgDefEff); // fallback neutral
  }

  function getOppOffRebPerc(stats) {
    return parseNumber(stats.opp_oreb_pct, leagueAvgOffEff);
  }

  function getOppDefRebPerc(stats) {
    return parseNumber(stats.opp_dreb_pct, leagueAvgDefEff);
  }

  // Adjust lineup "score" = PER; center at 15 per your formula
  const awayAdjLineup = awayPer || 15;
  const homeAdjLineup = homePer || 15;

  const awayOffEff = getOffEff(awayStats);
  const homeOffEff = getOffEff(homeStats);

  const awayDefEff = getDefEff(awayStats);
  const homeDefEff = getDefEff(homeStats);

  const awayPace = getPace(awayStats);
  const homePace = getPace(homeStats);

  const awayOREB = getOffRebPerc(awayStats);
  const homeOREB = getOffRebPerc(homeStats);

  const awayDREB = getDefRebPerc(awayStats);
  const homeDREB = getDefRebPerc(homeStats);

  const awayOppOREB = getOppOffRebPerc(awayStats);
  const homeOppOREB = getOppOffRebPerc(homeStats);

  const awayOppDREB = getOppDefRebPerc(awayStats);
  const homeOppDREB = getOppDefRebPerc(homeStats);

  // Weights for new scoring formula
  const W_lineup    = WEIGHTS.lineupPer    ?? 1.00;
  const W_off_eff   = WEIGHTS.oEff         ?? 0.70;
  const W_def_eff   = WEIGHTS.dEff         ?? 0.60;
  const W_pace      = WEIGHTS.pace         ?? 0.35;
  const W_oreb      = WEIGHTS.oreb         ?? 0.50;
  const W_dreb      = WEIGHTS.dreb         ?? 0.25; 

  function predictedScore(
    adjLineup,
    offEff,
    defEff,
    pace,
    orebPct,
    drebPct,
    oppOrebPct,
    oppDrebPct
  ) {
    return (
      leagueAvgPoints +
      W_lineup * (adjLineup - 15) +
      W_off_eff * (offEff - leagueAvgOffEff) -
      W_def_eff * (defEff - leagueAvgDefEff) +
      W_pace * (pace - leagueAvgPace) +
      W_oreb * (orebPct - oppDrebPct) +
      W_dreb * (drebPct - oppOrebPct)
    );
  }

  // Apply formula to each side
  let awayScore = predictedScore(
    awayAdjLineup,
    awayOffEff,
    awayDefEff,
    awayPace,
    awayOREB,
    awayDREB,
    awayOppOREB,   // opponent offensive rebound%
    awayOppDREB  // opponent defensive rebound%
  );

  let homeScore = predictedScore(
    homeAdjLineup,
    homeOffEff,
    homeDefEff,
    homePace,
    homeOREB,
    homeDREB,
    homeOppOREB, // opponent offensive rebound%
    homeOppDREB  // opponent defensive rebound%
  );

  const modelTotal = awayScore + homeScore;
  const modelSpread = homeScore - awayScore; // home minus away

  // simple win prob from spread
  const homeWinProb = 1 / (1 + Math.exp(-modelSpread / 5));
  const awayWinProb = 1 - homeWinProb;

  const pred = {
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

    return pred;
}

/*************** STAT COMPARISON ****************/

function buildStatComparison(game) {
  const table = document.getElementById("stats-table");
  const err = document.getElementById("stats-error");
  if (err) err.textContent = "";

  const away = state.teamStats[normalizeTeamName(game.away)] || {};
  const home = state.teamStats[normalizeTeamName(game.home)] || {};

  function row(label, aVal, hVal, betterHigh = true) {
    const aNum = parseNumber(aVal, NaN);
    const hNum = parseNumber(hVal, NaN);
    let aBetter = false, hBetter = false;
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
    row("PPG (L5)", away.ppg_l5, home.ppg_l5, true),
    row("OPPG (L5)", away.oppg_l5, home.oppg_l5, false),
    row("Pace (L5)", away.pace_l5, home.pace_l5, true),
    row("Off Eff (L5)", away.oeff_l5, home.oeff_l5, true),
    row("Def Eff (L5)", away.deff_l5, home.deff_l5, false),
    row("Season PPG", away.ppg_szn, home.ppg_szn, true),
    row("Season OPPG", away.oppg_szn, home.oppg_szn, false),
    row("Last5 Record", `${away.l5w || 0}-${away.l5l || 0}`, `${home.l5w || 0}-${home.l5l || 0}`, true),
    row("ATS Record", away.ats_record, home.ats_record, true),
    row("O/U Record", away.ou_record, home.ou_record, true),
    row("Predictive Rating", away.rating, home.rating, true)
  ];

  table.innerHTML = "";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["", game.away, game.home].forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
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

/*************** SAVED GAMES ****************/

function appendSavedGame(pred) {
  const tbody = document.querySelector("#saved-table tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  const dateStr = new Date().toISOString().slice(0,10);

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

  cells.forEach(v => {
    const td = document.createElement("td");
    td.textContent = v;
    tr.appendChild(td);
  });

  tbody.appendChild(tr);
}

/*************** UI WIRING ****************/

function wireUiHandlers() {
  const btnLineups = document.getElementById("btn-lineups");
  if (btnLineups) btnLineups.addEventListener("click", () => {
    document.getElementById("lineups-section").classList.remove("hidden");
  });

  const btnPredict = document.getElementById("btn-predict");
  if (btnPredict) btnPredict.addEventListener("click", () => {
    const errEl = document.getElementById("prediction-error");
    if (errEl) errEl.textContent = "";
    const pred = predictCurrentGame();
    if (!pred) {
      if (errEl) errEl.textContent = "Unable to predict — missing game or stats.";
      return;
    }
    state.currentPrediction = pred;
    showPrediction(pred);
  });

  const btnStats = document.getElementById("btn-stats");
  if (btnStats) btnStats.addEventListener("click", () => {
    const idx = state.selectedGameIndex;
    if (idx == null) return;
    buildStatComparison(state.games[idx]);
    document.getElementById("stats-section").classList.remove("hidden");
  });

  const btnSave = document.getElementById("btn-save");
  if (btnSave) btnSave.addEventListener("click", () => {
    if (!state.currentPrediction) {
      const err = document.getElementById("prediction-error");
      if (err) err.textContent = "Run a prediction first before saving.";
      return;
    }
    appendSavedGame(state.currentPrediction);
  });

  // lineup save/reset handlers
  document.getElementById("btn-save-away").addEventListener("click", () => {
    if (state.selectedGameIndex == null) return;
    const team = normalizeTeamName(state.games[state.selectedGameIndex].away);
    state.customLineups[team] = {
      g1: document.getElementById("away-g1").value.trim(),
      g2: document.getElementById("away-g2").value.trim(),
      f1: document.getElementById("away-f1").value.trim(),
      f2: document.getElementById("away-f2").value.trim(),
      c:  document.getElementById("away-c").value.trim()
    };
    document.getElementById("away-lineup-per").textContent = computeLineupPer("away").toFixed(2);
  });

  document.getElementById("btn-reset-away").addEventListener("click", () => {
    if (state.selectedGameIndex == null) return;
    loadDefaultLineup("away", state.games[state.selectedGameIndex].away);
  });

  document.getElementById("btn-save-home").addEventListener("click", () => {
    if (state.selectedGameIndex == null) return;
    const team = normalizeTeamName(state.games[state.selectedGameIndex].home);
    // save custom lineups
    state.customLineups[team] = {
      g1: document.getElementById("home-g1").value.trim(),
      g2: document.getElementById("home-g2").value.trim(),
      f1: document.getElementById("home-f1").value.trim(),
      f2: document.getElementById("home-f2").value.trim(),
      c:  document.getElementById("home-c").value.trim()
    };
    document.getElementById("home-lineup-per").textContent = computeLineupPer("home").toFixed(2);
  });

  document.getElementById("btn-reset-home").addEventListener("click", () => {
    if (state.selectedGameIndex == null) return;
    loadDefaultLineup("home", state.games[state.selectedGameIndex].home);
  });
}

/*************** SHOW PREDICTION ****************/

function showPrediction(pred) {
  if (!pred) return;
  const sect = document.getElementById("prediction-section");
  if (sect) sect.classList.remove("hidden");

  document.getElementById("pred-away-name").textContent = pred.game.away;
  document.getElementById("pred-home-name").textContent = pred.game.home;
  document.getElementById("pred-away-score").textContent = pred.awayScore.toFixed(1);
  document.getElementById("pred-home-score").textContent = pred.homeScore.toFixed(1);

  const winner = pred.homeScore > pred.awayScore ? pred.game.home : pred.game.away;
  document.getElementById("pred-winner").textContent = winner;

  document.getElementById("pred-away-winprob").textContent = `${pred.game.away}: ${(pred.awayWinProb*100).toFixed(1)}%`;
  document.getElementById("pred-home-winprob").textContent = `${pred.game.home}: ${(pred.homeWinProb*100).toFixed(1)}%`;

  document.getElementById("pred-total-line").textContent = `Model Total: ${pred.modelTotal.toFixed(1)} vs Book Total ${pred.bookTotal ? pred.bookTotal.toFixed(1) : "—"}`;
  document.getElementById("pred-spread-line").textContent = `Model Spread (Home = -): ${pred.modelSpread.toFixed(1)} vs Book Spread ${pred.bookSpread ? pred.bookSpread.toFixed(1) : "—"}`;

  // total bet advice
  const totalPill = document.getElementById("pred-total-play-pill");
  const totalText = document.getElementById("pred-total-play");
  if (pred.bookTotal) {
    const diff = pred.modelTotal - pred.bookTotal;
    if (diff >= 4) { totalPill.className = "pill pill-over"; totalText.textContent = "BET OVER"; }
    else if (diff <= -4) { totalPill.className = "pill pill-under"; totalText.textContent = "BET UNDER"; }
    else { totalPill.className = "pill pill-nobet"; totalText.textContent = "NO BET"; }
  } else {
    totalPill.className = "pill pill-nobet";
    totalText.textContent = "NO BET";
  }

  // spread bet advice
  const spreadPill = document.getElementById("pred-spread-play-pill");
  const spreadText = document.getElementById("pred-spread-play");
  if (pred.bookSpread) {
    const diff = pred.modelSpread - pred.bookSpread;
    if (diff <= -2) { spreadPill.className = "pill pill-over"; spreadText.textContent = `BET ${pred.game.home}`; }
    else if (diff >= 2) { spreadPill.className = "pill pill-under"; spreadText.textContent = `BET ${pred.game.away}`; }
    else { spreadPill.className = "pill pill-nobet"; spreadText.textContent = "NO BET"; }
  } else {
    spreadPill.className = "pill pill-nobet";
    spreadText.textContent = "NO BET";
  }
}

/*************** STARTUP ***************/

document.addEventListener("DOMContentLoaded", init);
