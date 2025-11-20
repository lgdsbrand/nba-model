/* =========================
   UPLOAD CSV URLS (Google Sheets export links)
   ========================= */
const CSV_URLS = {
  // Core 8 tabs
  trgames:   "https://docs.google.com/spreadsheets/d/TRGAMES_ID/export?format=csv&gid=0",
  nbastuff:  "https://docs.google.com/spreadsheets/d/NBASTUFF_ID/export?format=csv&gid=0",
  lineups:   "https://docs.google.com/spreadsheets/d/LINEUPS_ID/export?format=csv&gid=0",
  player:    "https://docs.google.com/spreadsheets/d/PLAYER_ID/export?format=csv&gid=0",
  league:    "https://docs.google.com/spreadsheets/d/LEAGUE_ID/export?format=csv&gid=0",
  ranking:   "https://docs.google.com/spreadsheets/d/RANKING_ID/export?format=csv&gid=0",
  ats:       "https://docs.google.com/spreadsheets/d/ATS_ID/export?format=csv&gid=0",
  ou:        "https://docs.google.com/spreadsheets/d/OU_ID/export?format=csv&gid=0",

  // TeamRankings rebounding feeds
  teamOffReb: "https://docs.google.com/spreadsheets/d/OFFREB_ID/export?format=csv&gid=0",
  teamDefReb: "https://docs.google.com/spreadsheets/d/DEFREB_ID/export?format=csv&gid=0",
  oppOffReb:  "https://docs.google.com/spreadsheets/d/OPPOFFREB_ID/export?format=csv&gid=0",
  oppDefReb:  "https://docs.google.com/spreadsheets/d/OPPDEFREB_ID/export?format=csv&gid=0",
};

/* =========================
   TUNING WEIGHTS
   ========================= */
const WEIGHTS = {
  perDiff: 4.0,          // lineup PER difference multiplier
  usg: 1.0,              // usage multiplier in lineup PER weighting

  rebToPoints: 0.25,     // rebounding % diffs → point adjustments
  perToPoints: 0.9,      // PER diff → point diff

  baseTotal: 200,        // baseline total
  paceToTotal: 1.2,      // pace contribution to total
  effToTotal: 0.6,       // efficiency contribution to total

  b2bPenaltyAway: -0.7,  // away back-to-back penalty
  b2bPenaltyHome: -0.5,  // home back-to-back penalty

  logisticScale: 8.0,    // scale for win probability logistic

  baseConf: 60,
  minConf: 50,
  maxConf: 95,

  atsMinEdge: 0.7,       // min spread edge to bet
  totalMinEdge: 2.0,     // min total edge to bet
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
   State
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
    (homeStats.
