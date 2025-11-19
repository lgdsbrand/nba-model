/* NBA Lineup Model — vanilla JS
 * - Upload 8 CSV tabs
 * - Column-letter parsing (no headers)
 * - Player-driven outcome (PER, USG, GP, MIN)
 * - Team nudges (pace, efficiency, rebounding)
 * - trgames matchup split + metadata
 */

/* Column letter map — adjust to your exact sheet if needed */
const COLS = {
  // trgames: rank, hotness, matchup "CHA @ NY", time, location
  trgames: { rank: "A", hotness: "B", matchup: "C", time: "D", location: "E" },

  // nbastuff: team stats L5 / H+A (example letters; adjust as needed)
  nbastuff: {
    team: "A",
    ppg: "F",
    oppg: "G",
    pace: "H",
    offEff: "I",
    defEff: "J",
    oreb: "K",     // optional
    oppOreb: "L",  // optional
    last5W: "M",
  },

  // Lineups: A=team, B–F = F1–F5
  lineups: { team: "A", f1: "B", f2: "C", f3: "D", f4: "E", f5: "F" },

  // Player: B=name, F=GP, G=PER, H=USG, I=MIN (adjust if your MIN is elsewhere)
  player: { name: "B", gp: "F", per: "G", usg: "H", min: "I" },

  // League: reference averages (optional display)
  league: { ppg: "B", oppg: "C", pace: "D", offEff: "E", defEff: "F" },

  // Ranking: predictive ranking
  ranking: { team: "A", wl: "B", modelScore: "C" },

  // ATS: team record string e.g., "40–36–2"
  ats: { team: "A", record: "B" },

  // OU: team record string
  ou: { team: "A", record: "B" },
};

/* Global state */
const state = {
  trgames: [],
  nbastuff: [],
  lineups: [],
  player: [],
  league: [],
  ranking: [],
  ats: [],
  ou: [],
  currentGame: null,
  awayTeam: null,
  homeTeam: null,
  awayLineup: [],
  homeLineup: [],
};

/* Helpers */
function parseCsvFile(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      complete: (res) => {
        const rows = (res.data || []).map((row) => {
          const obj = {};
          for (let i = 0; i < row.length; i++) {
            const letter = String.fromCharCode(65 + i); // A,B,C...
            obj[letter] = row[i];
          }
          return obj;
        });
        resolve(rows);
      },
      skipEmptyLines: true,
    });
  });
}

function getCol(row, letter) {
  return (row && row[letter]) || "";
}

function parseMatchup(matchupStr) {
  const parts = (matchupStr || "").split("@");
  if (parts.length !== 2) return { away: "", home: "" };
  return { away: parts[0].trim(), home: parts[1].trim() };
}

function teamRowByKey(rows, letter, key) {
  return rows.find((r) => getCol(r, letter).toUpperCase() === (key || "").toUpperCase());
}

/* Player stat lookup with simple normalization */
function findPlayerRow(name) {
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[\.\']/g, "")
      .replace(/\s+jr$/i, "")
      .trim();
  const target = norm(name);
  return state.player.find((r) => norm(getCol(r, COLS.player.name)) === target);
}

/* Lineup PER calculation (weighted by USG * reliability(GP, MIN)) */
function calculateLineupPER(playerNames) {
  let totalWeightedPER = 0;
  let totalUSG = 0;

  for (const nm of playerNames) {
    const pr = findPlayerRow(nm);
    const per = parseFloat(getCol(pr, COLS.player.per) || 0);
    const usg = parseFloat(getCol(pr, COLS.player.usg) || 0);
    const gp = parseFloat(getCol(pr, COLS.player.gp) || 0);
    const min = parseFloat(getCol(pr, COLS.player.min) || 0);

    const reliability = Math.min(1, gp / 20) * Math.min(1, min / 25); // caps at 1
    const weight = usg * reliability;

    totalWeightedPER += per * weight;
    totalUSG += weight;
  }

  return totalUSG > 0 ? +(totalWeightedPER / totalUSG).toFixed(2) : 0;
}

/* Confidence score using team stat nudges */
function computeConfidence(awayPER, homePER, awayStats, homeStats, awayB2B, homeB2B) {
  const baseDiff = homePER - awayPER; // positive favors home
  const paceAdj = ((homeStats.pace - awayStats.pace) || 0) * 0.1;
  const effAdj =
    (((homeStats.offEff - homeStats.defEff) || 0) - ((awayStats.offEff - awayStats.defEff) || 0)) * 0.05;
  const rebAdj =
    (((homeStats.oreb - homeStats.oppOreb) || 0) - ((awayStats.oreb - awayStats.oppOreb) || 0)) * 0.05;

  const b2bPenalty = (awayB2B ? -0.5 : 0) + (homeB2B ? -0.3 : 0);

  const confRaw = 60 + baseDiff * 4 + paceAdj + effAdj + rebAdj + b2bPenalty;
  return Math.max(50, Math.min(95, confRaw)); // clamp 50–95
}

/* Edges: ML, ATS, Total */
function computeEdges(spread, total, awayPER, homePER, awayStats, homeStats) {
  const perDiff = homePER - awayPER; // positive → home
  const mlEdge = perDiff * 0.8 + ((homeStats.offEff - awayStats.offEff) || 0) * 0.05;

  const atsEdge = mlEdge - spread * 0.35; // incorporate market spread

  const paceAvg = (homeStats.pace + awayStats.pace) / 2;
  const effAvg = ((homeStats.offEff + awayStats.offEff) - (homeStats.defEff + awayStats.defEff)) / 2;
  const expectedTotal = Math.max(190, Math.min(260, 200 + (paceAvg - 98) * 1.2 + effAvg * 0.6));
  const totalEdge = expectedTotal - total;

  return {
    mlEdge: +mlEdge.toFixed(2),
    atsEdge: +atsEdge.toFixed(2),
    totalEdge: +totalEdge.toFixed(2),
  };
}

/* Render helpers */
function renderGameSelect() {
  const sel = document.getElementById("game-select");
  sel.innerHTML = "";
  for (const r of state.trgames) {
    const matchup = getCol(r, COLS.trgames.matchup);
    const time = getCol(r, COLS.trgames.time);
    const opt = document.createElement("option");
    opt.value = matchup;
    opt.textContent = `${matchup} — ${time}`;
    sel.appendChild(opt);
  }
  if (state.trgames.length) sel.selectedIndex = 0;
  updateGameMeta();
}

function updateGameMeta() {
  const sel = document.getElementById("game-select");
  const matchupStr = sel.value;
  const row = state.trgames.find((r) => getCol(r, COLS.trgames.matchup) === matchupStr);
  document.getElementById("meta-time").textContent = getCol(row, COLS.trgames.time) || "—";
  document.getElementById("meta-location").textContent = getCol(row, COLS.trgames.location) || "—";
  document.getElementById("meta-hotness").textContent = getCol(row, COLS.trgames.hotness) || "—";
  document.getElementById("meta-rank").textContent = getCol(row, COLS.trgames.rank) || "—";

  const { away, home } = parseMatchup(matchupStr);
  state.awayTeam = away;
  state.homeTeam = home;
  document.getElementById("away-team").textContent = away || "—";
  document.getElementById("home-team").textContent = home || "—";

  // Seed lineup fields
  renderLineupFields("away-fields", "away");
  renderLineupFields("home-fields", "home");
}

/* Build lineup fields with F1–F5 and prefill names from Lineups tab */
function renderLineupFields(containerId, side) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const teamKey = side === "away" ? state.awayTeam : state.homeTeam;
  const lr = teamRowByKey(state.lineups, COLS.lineups.team, teamKey);

  const slots = ["f1", "f2", "f3", "f4", "f5"].map((k, i) => {
    const name = getCol(lr, COLS.lineups[k]) || "";
    return { label: `F${i + 1}`, name };
  });

  (side === "away" ? (state.awayLineup = []) : (state.homeLineup = []));

  for (const s of slots) {
    const wrap = document.createElement("div");
    wrap.className = "slot";

    const pos = document.createElement("div");
    pos.className = "pos";
    pos.textContent = s.label;
    wrap.appendChild(pos);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name";
    nameInput.value = s.name;
    wrap.appendChild(nameInput);

    const perInput = document.createElement("input");
    perInput.type = "number";
    perInput.step = "0.1";
    perInput.placeholder = "PER (auto if player CSV)";
    wrap.appendChild(perInput);

    const usgInput = document.createElement("input");
    usgInput.type = "number";
    usgInput.step = "0.1";
    usgInput.placeholder = "USG% (auto if player CSV)";
    wrap.appendChild(usgInput);

    const gpInput = document.createElement("input");
    gpInput.type = "number";
    gpInput.step = "1";
    gpInput.placeholder = "GP";
    wrap.appendChild(gpInput);

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.step = "0.1";
    minInput.placeholder = "MIN";
    wrap.appendChild(minInput);

    // Autofill from Player CSV if found
    const pr = s.name ? findPlayerRow(s.name) : null;
    if (pr) {
      perInput.value = getCol(pr, COLS.player.per) || "";
      usgInput.value = getCol(pr, COLS.player.usg) || "";
      gpInput.value = getCol(pr, COLS.player.gp) || "";
      minInput.value = getCol(pr, COLS.player.min) || "";
    }

    // Keep lineup state in sync
    function updateState() {
      const entry = {
        name: nameInput.value,
        per: parseFloat(perInput.value || "0"),
        usg: parseFloat(usgInput.value || "0"),
        gp: parseFloat(gpInput.value || "0"),
        min: parseFloat(minInput.value || "0"),
      };
      if (side === "away") {
        const idx = Array.from(container.children).indexOf(wrap);
        state.awayLineup[idx] = entry;
        document.getElementById("away-lineup-per").textContent = calculateLineupPER(
          state.awayLineup.map((x) => x.name)
        ).toFixed(2);
      } else {
        const idx = Array.from(container.children).indexOf(wrap);
        state.homeLineup[idx] = entry;
        document.getElementById("home-lineup-per").textContent = calculateLineupPER(
          state.homeLineup.map((x) => x.name)
        ).toFixed(2);
      }
    }

    [nameInput, perInput, usgInput, gpInput, minInput].forEach((el) =>
      el.addEventListener("input", updateState)
    );

    container.appendChild(wrap);
    updateState();
  }
}

/* Stat comparison rendering */
function renderStatComparison() {
  const awayRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.awayTeam);
  const homeRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.homeTeam);

  const atsAway = teamRowByKey(state.ats, COLS.ats.team, state.awayTeam);
  const atsHome = teamRowByKey(state.ats, COLS.ats.team, state.homeTeam);

  const ouAway = teamRowByKey(state.ou, COLS.ou.team, state.awayTeam);
  const ouHome = teamRowByKey(state.ou, COLS.ou.team, state.homeTeam);

  const rankAway = teamRowByKey(state.ranking, COLS.ranking.team, state.awayTeam);
  const rankHome = teamRowByKey(state.ranking, COLS.ranking.team, state.homeTeam);

  const rows = [
    { label: "PPG (L5)", away: getCol(awayRow, COLS.nbastuff.ppg), home: getCol(homeRow, COLS.nbastuff.ppg) },
    { label: "OPPG (L5)", away: getCol(awayRow, COLS.nbastuff.oppg), home: getCol(homeRow, COLS.nbastuff.oppg) },
    { label: "Pace (L5)", away: getCol(awayRow, COLS.nbastuff.pace), home: getCol(homeRow, COLS.nbastuff.pace) },
    { label: "Off Eff", away: getCol(awayRow, COLS.nbastuff.offEff), home: getCol(homeRow, COLS.nbastuff.offEff) },
    { label: "Def Eff", away: getCol(awayRow, COLS.nbastuff.defEff), home: getCol(homeRow, COLS.nbastuff.defEff) },
    { label: "ATS record", away: getCol(atsAway, COLS.ats.record), home: getCol(atsHome, COLS.ats.record) },
    { label: "O/U record", away: getCol(ouAway, COLS.ou.record), home: getCol(ouHome, COLS.ou.record) },
    { label: "Predictive rating", away: getCol(rankAway, COLS.ranking.modelScore), home: getCol(rankHome, COLS.ranking.modelScore) },
  ];

  const el = document.getElementById("stat-comp");
  el.innerHTML = `
    <table class="table">
      <thead><tr><th>Metric</th><th>${state.awayTeam}</th><th>${state.homeTeam}</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td>${r.label}</td><td>${r.away || "—"}</td><td>${r.home || "—"}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* Prediction flow */
function predictGame() {
  const spread = parseFloat(document.getElementById("edit-spread").value || "0");
  const total = parseFloat(document.getElementById("edit-total").value || "220");

  const awayPlayers = (state.awayLineup || []).map((x) => x.name);
  const homePlayers = (state.homeLineup || []).map((x) => x.name);

  const awayPER = calculateLineupPER(awayPlayers);
  const homePER = calculateLineupPER(homePlayers);

  const awayRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.awayTeam) || {};
  const homeRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.homeTeam) || {};

  const awayStats = {
    pace: parseFloat(getCol(awayRow, COLS.nbastuff.pace) || 98),
    offEff: parseFloat(getCol(awayRow, COLS.nbastuff.offEff) || 110),
    defEff: parseFloat(getCol(awayRow, COLS.nbastuff.defEff) || 110),
    oreb: parseFloat(getCol(awayRow, COLS.nbastuff.oreb) || 10),
    oppOreb: parseFloat(getCol(awayRow, COLS.nbastuff.oppOreb) || 10),
  };
  const homeStats = {
    pace: parseFloat(getCol(homeRow, COLS.nbastuff.pace) || 98),
    offEff: parseFloat(getCol(homeRow, COLS.nbastuff.offEff) || 110),
    defEff: parseFloat(getCol(homeRow, COLS.nbastuff.defEff) || 110),
    oreb: parseFloat(getCol(homeRow, COLS.nbastuff.oreb) || 10),
    oppOreb: parseFloat(getCol(homeRow, COLS.nbastuff.oppOreb) || 10),
  };

  const awayB2B = document.getElementById("away-b2b").checked;
  const homeB2B = document.getElementById("home-b2b").checked;

  const conf = computeConfidence(awayPER, homePER, awayStats, homeStats, awayB2B, homeB2B);
  const edges = computeEdges(spread, total, awayPER, homePER, awayStats, homeStats);

  document.getElementById("ml-edge").textContent = edges.mlEdge;
  document.getElementById("ats-edge").textContent = edges.atsEdge;
  document.getElementById("total-edge").textContent = edges.totalEdge;
  document.getElementById("confidence").textContent = `${conf.toFixed(1)}%`;
}

/* Save game to table */
function saveGameToTable() {
  const date = new Date().toLocaleDateString();
  const matchup = `${state.awayTeam} @ ${state.homeTeam}`;
  const ml = document.getElementById("ml-edge").textContent;
  const ats = document.getElementById("ats-edge").textContent;
  const tot = document.getElementById("total-edge").textContent;

  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${date}</td><td>${matchup}</td><td>${ml}</td><td>${ats}</td><td>${tot}</td>`;
  document.getElementById("saved-table").appendChild(tr);
}

/* Load CSVs orchestrator */
async function loadAllCsvs() {
  const files = {
    trgames: document.getElementById("csv-trgames").files[0],
    nbastuff: document.getElementById("csv-nbastuff").files[0],
    lineups: document.getElementById("csv-lineups").files[0],
    player: document.getElementById("csv-player").files[0],
    league: document.getElementById("csv-league").files[0],
    ranking: document.getElementById("csv-ranking").files[0],
    ats: document.getElementById("csv-ats").files[0],
    ou: document.getElementById("csv-ou").files[0],
  };

  const missing = Object.entries(files)
    .filter(([, f]) => !f)
    .map(([k]) => k);
  if (missing.length) {
    document.getElementById("load-status").textContent = `Missing: ${missing.join(", ")}`;
    return;
  }

  document.getElementById("load-status").textContent = "Parsing CSVs...";
  const [trgames, nbastuff, lineups, player, league, ranking, ats, ou] = await Promise.all([
    parseCsvFile(files.trgames),
    parseCsvFile(files.nbastuff),
    parseCsvFile(files.lineups),
    parseCsvFile(files.player),
    parseCsvFile(files.league),
    parseCsvFile(files.ranking),
    parseCsvFile(files.ats),
    parseCsvFile(files.ou),
  ]);

  Object.assign(state, { trgames, nbastuff, lineups, player, league, ranking, ats, ou });
  renderGameSelect();
  document.getElementById("load-status").textContent = "Loaded!";
}

/* Reset data */
function clearData() {
  Object.assign(state, {
    trgames: [],
    nbastuff: [],
    lineups: [],
    player: [],
    league: [],
    ranking: [],
    ats: [],
    ou: [],
    currentGame: null,
    awayTeam: null,
    homeTeam: null,
    awayLineup: [],
    homeLineup: [],
  });
  document.getElementById("game-select").innerHTML = "";
  document.getElementById("stat-comp").innerHTML = "";
  document.getElementById("away-team").textContent = "—";
  document.getElementById("home-team").textContent = "—";
  document.getElementById("away-lineup-per").textContent = "0.00";
  document.getElementById("home-lineup-per").textContent = "0.00";
  document.getElementById("ml-edge").textContent = "—";
  document.getElementById("ats-edge").textContent = "—";
  document.getElementById("total-edge").textContent = "—";
  document.getElementById("confidence").textContent = "—";
  document.getElementById("saved-table").innerHTML = "";
  document.getElementById("load-status").textContent = "Cleared.";
}

/* Events */
document.getElementById("btn-load").addEventListener("click", loadAllCsvs);
document.getElementById("btn-clear").addEventListener("click", clearData);
document.getElementById("game-select").addEventListener("change", updateGameMeta);
document.getElementById("btn-stat").addEventListener("click", renderStatComparison);
document.getElementById("btn-lineups").addEventListener("click", () => {
  renderLineupFields("away-fields", "away");
  renderLineupFields("home-fields", "home");
});
document.getElementById("btn-predict").addEventListener("click", predictGame);
document.getElementById("btn-save").addEventListener("click", saveGameToTable);

/* Away/Home lineup save/reset hooks (local only) */
document.getElementById("away-save").addEventListener("click", () => {
  localStorage.setItem("awayLineup", JSON.stringify(state.awayLineup));
});
document.getElementById("home-save").addEventListener("click", () => {
  localStorage.setItem("homeLineup", JSON.stringify(state.homeLineup));
});
document.getElementById("away-reset").addEventListener("click", () => {
  state.awayLineup = [];
  renderLineupFields("away-fields", "away");
});
document.getElementById("home-reset").addEventListener("click", () => {
  state.homeLineup = [];
  renderLineupFields("home-fields", "home");
});
