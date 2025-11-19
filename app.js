/* app.js — NBA Lineup Model (updated)
 *
 * Loads CSVs from Google Sheets export URLs (core 8 + 4 TeamRankings rebounding feeds)
 * Lineup-driven outcome using PER, USG, GP, MIN
 * Team nudges using pace, efficiency, and rebounding (own + opponent)
 * Outputs: projected scores, model spread, model total, win probabilities, ML winner,
 * model vs book edges, and bet signals for spread and total
 */

/* =========================
   CONFIG: CSV URLs
   ========================= */
const CSV_URLS = {
  // Core 8 tabs
  trgames:   "",
  nbastuff:  "",
  lineups:   "",
  player:    "",
  league:    "",
  ranking:   "",
  ats:       "",
  ou:        "",

  // TeamRankings rebounding feeds
  teamOffReb: "",
  teamDefReb: "",
  oppOffReb:  "",
  oppDefReb:  "",
};

/* =========================
   MODEL WEIGHTS
   ========================= */
const WEIGHTS = {
  perDiff: 4.0,
  usg: 1.0,

  rebToPoints: 0.25,
  perToPoints: 0.9,

  baseTotal: 200,
  paceToTotal: 1.2,
  effToTotal: 0.6,

  b2bPenaltyAway: -0.7,
  b2bPenaltyHome: -0.5,

  logisticScale: 8.0,

  baseConf: 60,
  minConf: 50,
  maxConf: 95,

  atsMinEdge: 0.7,
  totalMinEdge: 2.0,
};

/* =========================
   Column letters mapping
   ========================= */
const COLS = {
  trgames: { rank: "A", hotness: "B", matchup: "C", time: "D", location: "E", spread: "F", total: "G" },
  nbastuff: { team: "A", ppg: "F", oppg: "G", pace: "H", offEff: "I", defEff: "J" },
  lineups: { team: "A", f1: "B", f2: "C", f3: "D", f4: "E", f5: "F" },
  player: { name: "B", gp: "F", per: "G", usg: "H", min: "I" },
  league: { ppg: "B", oppg: "C", pace: "D", offEff: "E", defEff: "F" },
  ranking: { team: "A", wl: "B", modelScore: "C" },
  ats: { team: "A", record: "B" },
  ou: { team: "A", record: "B" },
};

/* =========================
   Global state
   ========================= */
const state = {
  trgames: [], nbastuff: [], lineups: [], player: [], league: [], ranking: [], ats: [], ou: [],
  teamOffReb: [], teamDefReb: [], oppOffReb: [], oppDefReb: [],
  awayTeam: null, homeTeam: null, awayLineup: [], homeLineup: []
};

/* =========================
   CSV fetching
   ========================= */
function fetchCsvFromUrl(url) {
  return fetch(url).then(r => r.text()).then(text => {
    const parsed = Papa.parse(text, { skipEmptyLines: true }).data;
    return parsed.map(row => {
      const obj = {};
      for (let i = 0; i < row.length; i++) {
        const letter = String.fromCharCode(65 + i);
        obj[letter] = row[i];
      }
      return obj;
    });
  });
}

function urlFor(key) {
  const el = document.getElementById(`url-${key}`);
  if (el && el.value && el.value.trim()) return el.value.trim();
  return CSV_URLS[key];
}

/* =========================
   Helpers
   ========================= */
function getCol(row, letter) { return (row && row[letter]) || ""; }
function parseMatchup(str) { const [away, home] = str.split("@").map(s => s.trim()); return { away, home }; }
function teamRowByKey(rows, letter, key) { return rows.find(r => (getCol(r, letter) || "").toUpperCase() === (key || "").toUpperCase()); }
function normalizeName(s) { return (s || "").toLowerCase().replace(/[\.\']/g,"").replace(/\s+jr$/i,"").trim(); }
function findPlayerRow(name) { return state.player.find(r => normalizeName(getCol(r, COLS.player.name)) === normalizeName(name)); }

/* =========================
   Lineup PER
   ========================= */
function calculateLineupPER(playerNames) {
  let totalWeightedPER = 0, totalUSG = 0;
  for (const nm of playerNames) {
    const pr = findPlayerRow(nm) || {};
    const per = parseFloat(getCol(pr, COLS.player.per) || 0);
    const usg = parseFloat(getCol(pr, COLS.player.usg) || 0);
    const gp = parseFloat(getCol(pr, COLS.player.gp) || 0);
    const min = parseFloat(getCol(pr, COLS.player.min) || 0);
    const reliability = Math.min(1, gp/20) * Math.min(1, min/25);
    const weight = usg * reliability * WEIGHTS.usg;
    totalWeightedPER += per * weight;
    totalUSG += weight;
  }
  return totalUSG > 0 ? +(totalWeightedPER/totalUSG).toFixed(2) : 0;
}

/* =========================
   Extract team stats
   ========================= */
function extractTeamStats(teamKey) {
  const nbRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, teamKey) || {};
  const offRow = teamRowByKey(state.teamOffReb, "A", teamKey) || {};
  const defRow = teamRowByKey(state.teamDefReb, "A", teamKey) || {};
  const oppOffRow = teamRowByKey(state.oppOffReb, "A", teamKey) || {};
  const oppDefRow = teamRowByKey(state.oppDefReb, "A", teamKey) || {};

  return {
    pace: parseFloat(getCol(nbRow, COLS.nbastuff.pace) || 98),
    offEff: parseFloat(getCol(nbRow, COLS.nbastuff.offEff) || 110),
    defEff: parseFloat(getCol(nbRow, COLS.nbastuff.defEff) || 110),
    offRebPct: parseFloat(getCol(offRow, "B") || 0),
    defRebPct: parseFloat(getCol(defRow, "B") || 0),
    oppOffRebPct: parseFloat(getCol(oppOffRow, "B") || 0),
    oppDefRebPct: parseFloat(getCol(oppDefRow, "B") || 0),
  };
}

/* =========================
   Confidence
   ========================= */
function computeConfidence(awayPER, homePER, awayStats, homeStats, awayB2B, homeB2B) {
  const diffPER = (homePER - awayPER) * WEIGHTS.perDiff;
  const rebAdj =
    (homeStats.offRebPct - awayStats.offRebPct) * WEIGHTS.rebToPoints +
    (homeStats.defRebPct - awayStats.defRebPct) * WEIGHTS.rebToPoints +
    (homeStats.oppOffRebPct - awayStats.oppOffRebPct) * (WEIGHTS.rebToPoints/2) +
    (homeStats.oppDefRebPct - awayStats.oppDefRebPct) * (WEIGHTS.rebToPoints/2);
  const effAdj = (homeStats.offEff - awayStats.offEff) * (WEIGHTS.effToTotal/10);
  const paceAdj = (homeStats.pace - awayStats.pace) * (WEIGHTS.paceToTotal/10);
  const b2bPenalty = (awayB2B ? WEIGHTS.b2bPenaltyAway : 0) + (homeB2B ? WEIGHTS.b2bPenaltyHome : 0);
  const confRaw = WEIGHTS.baseConf + diffPER + rebAdj + effAdj + paceAdj + b2bPenalty;
  return Math.max(WEIGHTS.minConf, Math.min(WEIGHTS.maxConf, confRaw));
}

/* =========================
   Win probabilities
   ========================= */
function diffToWinProb(pointDiff) {
  const s = WEIGHTS.logisticScale;
  const pHome = 1 / (1 + Math.exp(-pointDiff / s));
  const pAway = 1 - pHome;
  return { pHome, pAway };
}

/*
