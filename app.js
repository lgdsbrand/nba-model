/*************************************************
 * 1) CSV URLS – FILL THESE IN
 *************************************************/

const GAMES_URL     = "PASTE_GAMES_CSV_URL_HERE";

const PLAYER_URL    = "PASTE_PLAYER_CSV_URL_HERE";
const LINEUPS_URL   = "PASTE_LINEUPS_CSV_URL_HERE";
const LEAGUE_URL    = "PASTE_LEAGUE_AVG_CSV_URL_HERE";

const OREB_URL      = "PASTE_OREB_CSV_URL_HERE";
const DREB_URL      = "PASTE_DREB_CSV_URL_HERE";
const OPP_OREB_URL  = "PASTE_OPP_OREB_CSV_URL_HERE";
const OPP_DREB_URL  = "PASTE_OPP_DREB_CSV_URL_HERE";

const ATS_URL       = "PASTE_ATS_CSV_URL_HERE";
const OU_URL        = "PASTE_OU_CSV_URL_HERE";
const RATING_URL    = "PASTE_RATING_CSV_URL_HERE";
const PPG_URL       = "PASTE_PPG_CSV_URL_HERE";
const NBASTUFF_URL  = "PASTE_NBASTUFFER_CSV_URL_HERE";
const NAMES_URL     = "PASTE_NAMES_CSV_URL_HERE";

/*************************************************
 * 2) COLUMN LETTER MAP – EDIT THESE ONLY
 *************************************************/

const COLS = {
  // Games sheet from Apps Script: GameID, Date, Time, Away, Home, Label, Spread, Total
  games: {
    id:    "A",
    date:  "B",
    time:  "C",
    away:  "D",
    home:  "E",
    label: "F",  // if empty, fall back to "Away @ Home"
    spread:"G",  // Spread (Home = -)
    total: "H",  // Total
  },

  // Player stats tab
  players: {
    name: "B",   // Player
    mp:   "H",   // MP
    per:  "I",   // PER
    usg:  "T",   // USG%
  },

  // Lineups tab (Team, G1, G2, F1, F2, C)
  lineups: {
    team: "A",
    g1:   "B",
    g2:   "C",
    f1:   "D",
    f2:   "E",
    c:    "F",
  },

  // League averages tab
  league: {
    label: "O",
    value: "P",
  },

  // Rebounding tabs (can expand later)
  oreb:     { team: "B", haf: "F", l3: "D" },
  dreb:     { team: "B", haf: "F", l3: "D" },
  oppOreb:  { team: "B", haf: "F", l3: "D" },
  oppDreb:  { team: "B", haf: "F", l3: "D" },

  // ATS tab
  ats: {
    team:   "A",
    record: "B",
    cover:  "C",
  },

  // O/U tab
  ou: {
    team:   "A",
    record: "B",
  },

  // Predictive rating tab
  rating: {
    team:   "A",
    rating: "D",
  },

  // PPG tab (TeamRankings)
  ppg: {
    team: "B",
    ppg:  "F",
    oppg: "G",
    pace: "H",
  },

  // NbaStuffer tab (simplified: oEFF, dEFF, PACE)
  nbastuff: {
    team:   "B",
    offEff: "J",  // oEFF
    defEff: "K",  // dEFF
    pace:   "I",  // PACE
  },

  // Names tab (TR name -> NbaStuffer name)
  names: {
    tr: "A",
    nb: "B",
  },
};

/*************************************************
 * 3) HELPERS – column letter to index
 *************************************************/

function colIndex(letter) {
  if (!letter) return -1;
  const col = letter.toUpperCase().replace(/[^A-Z]/g, "");
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64); // A=1...
  }
  return n - 1;
}

function cell(row, letter) {
  const idx = colIndex(letter);
  return idx >= 0 ? (row[idx] || "").trim() : "";
}

/*************************************************
 * 4) BASIC CSV LOADER
 *************************************************/

async function loadCSV(url) {
  if (!url || url.startsWith("PASTE_")) return [];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  return text
    .trim()
    .split(/\r?\n/)
    .map(r => r.split(","));
}

/*************************************************
 * 5) GLOBAL STATE
 *************************************************/

let games = [];
let players = [];
let lineupsByTeam = {};
let leagueAvg = {};
let teamStats = {};
let atsMap = {};
let ouMap = {};
let ratingMap = {};
let mappingTRtoNB = {};

let selectedGame = null;
let savedGames = [];

/*************************************************
 * 6) INIT
 *************************************************/

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error(err);
    const el = document.getElementById("games-error");
    if (el) el.textContent = "Error loading data. Check CSV URLs.";
  });
});

async function init() {
  const [
    gameRows,
    playerRows,
    lineupRows,
    leagueRows,
    orebRows,
    drebRows,
    oppOrebRows,
    oppDrebRows,
    atsRows,
    ouRows,
    ratingRows,
    ppgRows,
    nbastufferRows,
    namesRows,
  ] = await Promise.all([
    loadCSV(GAMES_URL),
    loadCSV(PLAYER_URL),
    loadCSV(LINEUPS_URL),
    loadCSV(LEAGUE_URL),
    loadCSV(OREB_URL),
    loadCSV(DREB_URL),
    loadCSV(OPP_OREB_URL),
    loadCSV(OPP_DREB_URL),
    loadCSV(ATS_URL),
    loadCSV(OU_URL),
    loadCSV(RATING_URL),
    loadCSV(PPG_URL),
    loadCSV(NBASTUFF_URL),
    loadCSV(NAMES_URL),
  ]);

  parseGames(gameRows);
  parsePlayers(playerRows);
  parseLineups(lineupRows);
  parseLeague(leagueRows);
  parseRebounding(orebRows, drebRows, oppOrebRows, oppDrebRows);
  parseATS(atsRows);
  parseOU(ouRows);
  parseRatings(ratingRows);
  parsePPG(ppgRows);
  parseNbastuffer(nbastufferRows);
  parseNames(namesRows);

  buildGamesBar();
  buildPlayerDatalist();
  hookUI();
}

/*************************************************
 * 7) PARSERS (using COLS)
 *************************************************/

function parseGames(rows) {
  if (!rows.length) return;
  const c = COLS.games;
  // first row is header from Apps Script, so start at row 1
  games = rows.slice(1).map((r, idx) => {
    const away = cell(r, c.away);
    const home = cell(r, c.home);
    if (!away || !home) return null;
    return {
      id:     cell(r, c.id) || `game-${idx}`,
      date:   cell(r, c.date),
      time:   cell(r, c.time),
      away,
      home,
      label:  cell(r, c.label) || `${away} @ ${home}`,
      spread: cell(r, c.spread) ? Number(cell(r, c.spread)) : "",
      total:  cell(r, c.total)  ? Number(cell(r, c.total))  : "",
    };
  }).filter(Boolean);
}

function parsePlayers(rows) {
  if (!rows.length) return;
  const c = COLS.players;
  players = rows.slice(1).map(r => ({
    name: cell(r, c.name),
    mp:   Number(cell(r, c.mp)  || 0),
    per:  Number(cell(r, c.per) || 0),
    usg:  Number(cell(r, c.usg) || 0),
  })).filter(p => p.name);
}

function parseLineups(rows) {
  if (!rows.length) return;
  const c = COLS.lineups;
  lineupsByTeam = {};
  rows.slice(1).forEach(r => {
    const team = cell(r, c.team);
    if (!team) return;
    lineupsByTeam[team] = {
      g1: cell(r, c.g1),
      g2: cell(r, c.g2),
      f1: cell(r, c.f1),
      f2: cell(r, c.f2),
      c:  cell(r, c.c),
    };
  });
}

function parseLeague(rows) {
  if (!rows.length) return;
  const c = COLS.league;
  leagueAvg = {};
  rows.forEach(r => {
    const label = (cell(r, c.label) || "").toLowerCase();
    const val   = Number(cell(r, c.value) || 0);
    if (!label) return;
    leagueAvg[label] = val;
  });
}

function parseATS(rows) {
  if (!rows.length) return;
  const c = COLS.ats;
  atsMap = {};
  rows.slice(1).forEach(r => {
    const t = cell(r, c.team);
    if (!t) return;
    atsMap[t] = {
      record: cell(r, c.record),
      cover:  cell(r, c.cover),
    };
  });
}

function parseOU(rows) {
  if (!rows.length) return;
  const c = COLS.ou;
  ouMap = {};
  rows.slice(1).forEach(r => {
    const t = cell(r, c.team);
    if (!t) return;
    ouMap[t] = { record: cell(r, c.record) };
  });
}

function parseRatings(rows) {
  if (!rows.length) return;
  const c = COLS.rating;
  ratingMap = {};
  rows.slice(1).forEach(r => {
    const t = cell(r, c.team);
    if (!t) return;
    ratingMap[t] = Number(cell(r, c.rating) || 0);
  });
}

function parsePPG(rows) {
  if (!rows.length) return;
  const c = COLS.ppg;
  rows.slice(1).forEach(r => {
    const t = cell(r, c.team);
    if (!t) return;
    if (!teamStats[t]) teamStats[t] = {};
    teamStats[t].ppg  = Number(cell(r, c.ppg)  || 0);
    teamStats[t].oppg = Number(cell(r, c.oppg) || 0);
    teamStats[t].pace = Number(cell(r, c.pace) || 0);
  });
}

function parseNbastuffer(rows) {
  if (!rows.length) return;
  const c = COLS.nbastuff;
  rows.slice(1).forEach(r => {
    const t = cell(r, c.team);
    if (!t) return;
    if (!teamStats[t]) teamStats[t] = {};
    teamStats[t].offEff      = Number(cell(r, c.offEff) || 0);
    teamStats[t].defEff      = Number(cell(r, c.defEff) || 0);
    teamStats[t].paceStuffer = Number(cell(r, c.pace)   || 0);
  });
}

function parseNames(rows) {
  if (!rows.length) return;
  const c = COLS.names;
  mappingTRtoNB = {};
  rows.forEach(r => {
    const tr = cell(r, c.tr);
    const nb = cell(r, c.nb);
    if (!tr || !nb) return;
    mappingTRtoNB[tr] = nb;
  });
}

function parseRebounding(oreb, dreb, oppOreb, oppDreb) {
  // For now we leave these out of teamStats; can wire them in later if needed.
}

/*************************************************
 * 8) UI BUILDERS – games bar & players list
 *************************************************/

function buildGamesBar() {
  const bar = document.getElementById("games-bar");
  if (!bar) return;
  bar.innerHTML = "";

  games.forEach((g, idx) => {
    const chip = document.createElement("button");
    chip.className = "game-chip";
    chip.dataset.gameId = g.id || `idx-${idx}`;
    chip.innerHTML = `
      <span>${g.away} @ ${g.home}</span>
      <span class="game-chip-time">${g.time || ""}</span>
    `;
    chip.addEventListener("click", () => onSelectGame(g, chip));
    bar.appendChild(chip);
  });

  if (games.length) {
    const firstChip = bar.querySelector(".game-chip");
    if (firstChip) onSelectGame(games[0], firstChip);
  }
}

function buildPlayerDatalist() {
  const dl = document.getElementById("players-list");
  if (!dl) return;
  dl.innerHTML = "";
  const seen = new Set();
  players.forEach(p => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    const opt = document.createElement("option");
    opt.value = p.name;
    dl.appendChild(opt);
  });
}

/*************************************************
 * 9) GAME SELECTION PANEL
 *************************************************/

function onSelectGame(game, chipEl) {
  selectedGame = game;

  document.querySelectorAll(".game-chip").forEach(c =>
    c.classList.remove("active")
  );
  if (chipEl) chipEl.classList.add("active");

  const panel = document.getElementById("selected-game-panel");
  if (panel) panel.classList.remove("hidden");

  const sgTime = document.getElementById("sg-time");
  const sgMatchup = document.getElementById("sg-matchup");
  const sgSpread = document.getElementById("sg-spread");
  const sgTotal = document.getElementById("sg-total");

  if (sgTime) sgTime.textContent = `${game.date} • ${game.time}`;
  if (sgMatchup) sgMatchup.textContent = `${game.away} @ ${game.home}`;
  if (sgSpread) sgSpread.textContent = game.spread === "" ? "—" : game.spread;
  if (sgTotal) sgTotal.textContent = game.total === "" ? "—" : game.total;

  const spreadInput = document.getElementById("book-spread");
  const totalInput = document.getElementById("book-total");
  if (spreadInput) spreadInput.value = game.spread === "" ? "" : game.spread;
  if (totalInput) totalInput.value = game.total === "" ? "" : game.total;

  const awayLabel = document.getElementById("away-team-label");
  const homeLabel = document.getElementById("home-team-label");
  if (awayLabel) awayLabel.textContent = game.away;
  if (homeLabel) homeLabel.textContent = game.home;

  fillLineupInputs("away", game.away);
  fillLineupInputs("home", game.home);

  const predSection = document.getElementById("prediction-section");
  if (predSection) predSection.classList.add("hidden");
}

/*************************************************
 * 10) LINEUP HELPERS (typeable / dropdown)
 *************************************************/

function fillLineupInputs(side, teamName) {
  const lu = lineupsByTeam[teamName] || { g1: "", g2: "", f1: "", f2: "", c: "" };
  const g1 = document.getElementById(`${side}-g1`);
  const g2 = document.getElementById(`${side}-g2`);
  const f1 = document.getElementById(`${side}-f1`);
  const f2 = document.getElementById(`${side}-f2`);
  const c  = document.getElementById(`${side}-c`);
  if (g1) g1.value = lu.g1 || "";
  if (g2) g2.value = lu.g2 || "";
  if (f1) f1.value = lu.f1 || "";
  if (f2) f2.value = lu.f2 || "";
  if (c)  c.value  = lu.c  || "";
  updateLineupPER(side);
}

function getPlayerByName(name) {
  return players.find(p => p.name === name);
}

function updateLineupPER(side) {
  const names = [
    document.getElementById(`${side}-g1`)?.value || "",
    document.getElementById(`${side}-g2`)?.value || "",
    document.getElementById(`${side}-f1`)?.value || "",
    document.getElementById(`${side}-f2`)?.value || "",
    document.getElementById(`${side}-c`) ?.value || "",
  ];

  let totalWeightedPer = 0;
  let totalMinutes = 0;

  names.forEach(n => {
    const p = getPlayerByName(n);
    if (!p) return;
    const minutes = p.mp || 30;
    totalMinutes += minutes;
    totalWeightedPer += p.per * minutes;
  });

  const per =
    totalMinutes > 0 ? (totalWeightedPer / totalMinutes).toFixed(2) : "—";
  const el = document.getElementById(`${side}-lineup-per`);
  if (el) el.textContent = per;
}

/*************************************************
 * 11) BUTTON WIRING
 *************************************************/

function hookUI() {
  // lineup fields -> recompute PER
  ["away", "home"].forEach(side => {
    ["g1", "g2", "f1", "f2", "c"].forEach(pos => {
      const el = document.getElementById(`${side}-${pos}`);
      if (el) el.addEventListener("change", () => updateLineupPER(side));
    });
  });

  const btnLineups = document.getElementById("btn-lineups");
  if (btnLineups) {
    btnLineups.addEventListener("click", () => {
      const sec = document.getElementById("lineups-section");
      if (!sec) return;
      sec.classList.toggle("hidden");
    });
  }

  const btnPredict = document.getElementById("btn-predict");
  if (btnPredict) {
    btnPredict.addEventListener("click", () => runPrediction());
  }

  const btnStats = document.getElementById("btn-stats");
  if (btnStats) {
    btnStats.addEventListener("click", () => {
      buildStatComparison();
      const sec = document.getElementById("stats-section");
      if (sec) sec.classList.toggle("hidden");
    });
  }

  const btnSave = document.getElementById("btn-save");
  if (btnSave) {
    btnSave.addEventListener("click", () => saveCurrentGame());
  }

  const btnSaveAway = document.getElementById("btn-save-away");
  if (btnSaveAway) {
    btnSaveAway.addEventListener("click", () => {
      if (!selectedGame) return;
      lineupsByTeam[selectedGame.away] = {
        g1: document.getElementById("away-g1")?.value || "",
        g2: document.getElementById("away-g2")?.value || "",
        f1: document.getElementById("away-f1")?.value || "",
        f2: document.getElementById("away-f2")?.value || "",
        c:  document.getElementById("away-c") ?.value || "",
      };
    });
  }

  const btnSaveHome = document.getElementById("btn-save-home");
  if (btnSaveHome) {
    btnSaveHome.addEventListener("click", () => {
      if (!selectedGame) return;
      lineupsByTeam[selectedGame.home] = {
        g1: document.getElementById("home-g1")?.value || "",
        g2: document.getElementById("home-g2")?.value || "",
        f1: document.getElementById("home-f1")?.value || "",
        f2: document.getElementById("home-f2")?.value || "",
        c:  document.getElementById("home-c") ?.value || "",
      };
    });
  }

  const btnResetAway = document.getElementById("btn-reset-away");
  if (btnResetAway) {
    btnResetAway.addEventListener("click", () => {
      if (!selectedGame) return;
      fillLineupInputs("away", selectedGame.away);
    });
  }

  const btnResetHome = document.getElementById("btn-reset-home");
  if (btnResetHome) {
    btnResetHome.addEventListener("click", () => {
      if (!selectedGame) return;
      fillLineupInputs("home", selectedGame.home);
    });
  }
}

/*************************************************
 * 12) PREDICTION WRAPPER
 *************************************************/

function runPrediction() {
  const errEl = document.getElementById("prediction-error");
  if (errEl) errEl.textContent = "";

  if (!selectedGame) {
    if (errEl) errEl.textContent = "Select a game first.";
    return;
  }

  const bookSpread = Number(document.getElementById("book-spread")?.value || 0);
  const bookTotal  = Number(document.getElementById("book-total") ?.value || 0);
  const awayB2B    = !!document.getElementById("away-b2b")?.checked;
  const homeB2B    = !!document.getElementById("home-b2b")?.checked;

  const awayLineupPer = parseFloat(
    document.getElementById("away-lineup-per")?.textContent || 0
  );
  const homeLineupPer = parseFloat(
    document.getElementById("home-lineup-per")?.textContent || 0
  );

  const result = predictGame({
    game: selectedGame,
    awayLineupPer,
    homeLineupPer,
    bookSpread,
    bookTotal,
    awayB2B,
    homeB2B,
  });

  showPrediction(result);
}

/*************************************************
 * 13) CORE PREDICTION LOGIC
 *     (Swap this out with your full formula later)
 *************************************************/

function predictGame(ctx) {
  const { game, awayLineupPer, homeLineupPer, awayB2B, homeB2B, bookSpread, bookTotal } =
    ctx;

  const aTeam = game.away;
  const hTeam = game.home;

  const aStats = teamStats[aTeam] || {};
  const hStats = teamStats[hTeam] || {};

  const aRating = ratingMap[aTeam] || 0;
  const hRating = ratingMap[hTeam] || 0;

  const aPace = aStats.pace || aStats.paceStuffer || leagueAvg["pace"] || 100;
  const hPace = hStats.pace || hStats.paceStuffer || leagueAvg["pace"] || 100;
  const pace = (aPace + hPace) / 2;
  const leaguePace = leagueAvg["pace"] || 100;
  const paceFactor = pace / leaguePace;

  // base from PPG
  const aPPG = aStats.ppg || (leagueAvg["ppg"] || 112);
  const hPPG = hStats.ppg || (leagueAvg["ppg"] || 112);

  let baseTotal = (aPPG + hPPG) * 0.5 * paceFactor;

  // lineup influence
  const avgPer = (awayLineupPer || 15) + (homeLineupPer || 15);
  baseTotal *= 1 + (avgPer - 30) * 0.01;

  // rating-based spread (home - away)
  let modelSpread = (hRating - aRating) * 0.6;

  // b2b penalty
  if (awayB2B) modelSpread += 0.8;
  if (homeB2B) modelSpread -= 0.8;

  let homeScore = baseTotal / 2 + modelSpread / 2;
  let awayScore = baseTotal - homeScore;

  // clamp
  awayScore = Math.max(80, Math.min(145, awayScore));
  homeScore = Math.max(80, Math.min(145, homeScore));

  const modelTotal = awayScore + homeScore;
  const modelHomeSpread = homeScore - awayScore;

  // simple win probabilities from spread
  const homeWinProb = 0.5 + Math.tanh(modelHomeSpread / 12) * 0.25;
  const awayWinProb = 1 - homeWinProb;

  const totalEdge  = modelTotal - bookTotal;
  const spreadEdge = modelHomeSpread - bookSpread;

  let totalPlay = "NO BET";
  if (Math.abs(totalEdge) >= 8) {
    totalPlay = totalEdge > 0 ? "BET OVER" : "BET UNDER";
  }

  let spreadPlay = "NO BET";
  if (Math.abs(spreadEdge) >= 2) {
    spreadPlay = spreadEdge > 0 ? `BET ${hTeam}` : `BET ${aTeam}`;
  }

  return {
    awayScore: awayScore.toFixed(1),
    homeScore: homeScore.toFixed(1),
    modelTotal: modelTotal.toFixed(1),
    modelSpread: modelHomeSpread.toFixed(1),
    totalEdge: totalEdge.toFixed(1),
    spreadEdge: spreadEdge.toFixed(1),
    totalPlay,
    spreadPlay,
    homeWinProb: (homeWinProb * 100).toFixed(1),
    awayWinProb: (awayWinProb * 100).toFixed(1),
  };
}

/*************************************************
 * 14) SHOW PREDICTION
 *************************************************/

function showPrediction(r) {
  const sec = document.getElementById("prediction-section");
  if (sec) sec.classList.remove("hidden");

  const aName = selectedGame.away;
  const hName = selectedGame.home;

  document.getElementById("pred-away-name").textContent = aName;
  document.getElementById("pred-home-name").textContent = hName;
  document.getElementById("pred-away-score").textContent = r.awayScore;
  document.getElementById("pred-home-score").textContent = r.homeScore;

  const winner =
    parseFloat(r.homeScore) > parseFloat(r.awayScore) ? hName : aName;
  document.getElementById("pred-winner").textContent = winner;

  document.getElementById(
    "pred-away-winprob"
  ).textContent = `${aName}: ${r.awayWinProb}%`;
  document.getElementById(
    "pred-home-winprob"
  ).textContent = `${hName}: ${r.homeWinProb}%`;

  const bookSpread = Number(document.getElementById("book-spread")?.value || 0);
  const bookTotal  = Number(document.getElementById("book-total") ?.value || 0);

  document.getElementById(
    "pred-total-line"
  ).textContent = `Model Total: ${r.modelTotal} vs Book Total ${bookTotal}`;
  document.getElementById(
    "pred-total-play"
  ).textContent = `Total Play: ${r.totalPlay} (edge ${r.totalEdge})`;

  document.getElementById(
    "pred-spread-line"
  ).textContent = `Model Spread (Home): ${r.modelSpread} vs Book Spread ${bookSpread}`;
  document.getElementById(
    "pred-spread-play"
  ).textContent = `Spread Play: ${r.spreadPlay} (edge ${r.spreadEdge})`;
}

/*************************************************
 * 15) STAT COMPARISON TABLE
 *************************************************/

function buildStatComparison() {
  const table = document.getElementById("stats-table");
  const errEl = document.getElementById("stats-error");
  if (errEl) errEl.textContent = "";

  if (!selectedGame) {
    if (errEl) errEl.textContent = "Select a game first.";
    return;
  }

  const a = selectedGame.away;
  const h = selectedGame.home;

  const aStats = teamStats[a] || {};
  const hStats = teamStats[h] || {};

  const rows = [];

  function addRow(label, aVal, hVal, higherIsBetter = true) {
    if (aVal == null && hVal == null) return;
    const aNum = Number(aVal);
    const hNum = Number(hVal);
    let awayBetter = false;
    let homeBetter = false;

    if (!isNaN(aNum) && !isNaN(hNum) && aNum !== hNum) {
      if (higherIsBetter) {
        awayBetter = aNum > hNum;
        homeBetter = hNum > aNum;
      } else {
        awayBetter = aNum < hNum;
        homeBetter = hNum < aNum;
      }
    }

    rows.push({ label, away: aVal, home: hVal, awayBetter, homeBetter });
  }

  addRow(
    "Lineup PER",
    document.getElementById("away-lineup-per")?.textContent || "",
    document.getElementById("home-lineup-per")?.textContent || ""
  );

  addRow("Season PPG", aStats.ppg, hStats.ppg, true);
  addRow("Season OPPG", aStats.oppg, hStats.oppg, false);
  addRow(
    "Pace",
    aStats.pace || aStats.paceStuffer,
    hStats.pace || hStats.paceStuffer,
    true
  );
  addRow("Off Efficiency", aStats.offEff, hStats.offEff, true);
  addRow("Def Efficiency", aStats.defEff, hStats.defEff, false);

  addRow(
    "ATS Record",
    (atsMap[a] && atsMap[a].record) || "",
    (atsMap[h] && atsMap[h].record) || null,
    null
  );
  addRow(
    "O/U Record",
    (ouMap[a] && ouMap[a].record) || "",
    (ouMap[h] && ouMap[h].record) || null,
    null
  );
  addRow("Predictive Rating", ratingMap[a], ratingMap[h], true);

  table.innerHTML = `
    <thead>
      <tr>
        <th class="stats-row-label">Stat</th>
        <th>${a}</th>
        <th>${h}</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(r => {
          const aClass = r.awayBetter ? "stats-better" : "";
          const hClass = r.homeBetter ? "stats-better" : "";
          return `
          <tr>
            <td class="stats-row-label">${r.label}</td>
            <td class="${aClass}">${r.away ?? ""}</td>
            <td class="${hClass}">${r.home ?? ""}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  `;
}

/*************************************************
 * 16) SAVE GAME TO TABLE
 *************************************************/

function saveCurrentGame() {
  if (!selectedGame) return;

  const predSection = document.getElementById("prediction-section");
  if (predSection && predSection.classList.contains("hidden")) {
    // if no prediction yet, run it first
    runPrediction();
  }

  const aScoreStr = document.getElementById("pred-away-score")?.textContent;
  const hScoreStr = document.getElementById("pred-home-score")?.textContent;
  if (!aScoreStr || !hScoreStr) return;

  const awayScore = Number(aScoreStr);
  const homeScore = Number(hScoreStr);

  const modelTotal = (awayScore + homeScore).toFixed(1);
  const bookTotal = Number(document.getElementById("book-total")?.value || 0);

  const modelSpread = (homeScore - awayScore).toFixed(1);
  const bookSpread = Number(document.getElementById("book-spread")?.value || 0);

  const totalEdge = (parseFloat(modelTotal) - bookTotal).toFixed(1);
  const spreadEdge = (parseFloat(modelSpread) - bookSpread).toFixed(1);

  const tbody = document.querySelector("#saved-table tbody");
  if (!tbody) return;
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>${selectedGame.date}</td>
    <td>${selectedGame.away} @ ${selectedGame.home}</td>
    <td>${awayScore.toFixed(1)}</td>
    <td>${homeScore.toFixed(1)}</td>
    <td>${modelTotal}</td>
    <td>${bookTotal}</td>
    <td>${totalEdge}</td>
    <td>${modelSpread}</td>
    <td>${bookSpread}</td>
    <td>${spreadEdge}</td>
  `;

  tbody.appendChild(tr);
}
