/* NBA Lineup Model URL driven
 * - Load 8 CSVs from URLs (Google Sheets export links)
 * - Column-letter parsing (no headers)
 * - Lineup-driven outcome using PER, USG, GP, MIN
 * - Team nudges using pace, efficiency, rebounding
 */

/* Column letter map adjust if your sheets differ */
const COLS = {
  trgames: { rank: "A", hotness: "B", matchup: "C", time: "D", location: "E" },
  nbastuff: { team: "A", ppg: "F", oppg: "G", pace: "H", offEff: "I", defEff: "J", oreb: "K", oppOreb: "L", last5W: "M" },
  lineups: { team: "A", f1: "B", f2: "C", f3: "D", f4: "E", f5: "F" },
  player: { name: "B", gp: "F", per: "G", usg: "H", min: "I" },
  league: { ppg: "B", oppg: "C", pace: "D", offEff: "E", defEff: "F" },
  ranking: { team: "A", wl: "B", modelScore: "C" },
  ats: { team: "A", record: "B" },
  ou: { team: "A", record: "B" },
};

const state = {
  trgames: [], nbastuff: [], lineups: [], player: [], league: [], ranking: [], ats: [], ou: [],
  awayTeam: null, homeTeam: null, awayLineup: [], homeLineup: []
};

function fetchCsvFromUrl(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
    return r.text();
  }).then((text) => {
    const parsed = Papa.parse(text, { skipEmptyLines: true }).data;
    return parsed.map((row) => {
      const obj = {};
      for (let i = 0; i < row.length; i++) {
        const letter = String.fromCharCode(65 + i);
        obj[letter] = row[i];
      }
      return obj;
    });
  });
}

function getCol(row, letter) {
  return (row && row[letter]) || "";
}

function parseMatchup(matchupStr) {
  if (!matchupStr) return { away: "", home: "" };
  const parts = matchupStr.split("@");
  if (parts.length === 2) return { away: parts[0].trim(), home: parts[1].trim() };
  // fallback try " vs " or " at "
  if (matchupStr.includes(" vs ")) {
    const p = matchupStr.split(" vs ");
    return { away: p[0].trim(), home: p[1].trim() };
  }
  if (matchupStr.includes(" at ")) {
    const p = matchupStr.split(" at ");
    return { away: p[0].trim(), home: p[1].trim() };
  }
  return { away: "", home: "" };
}

function teamRowByKey(rows, letter, key) {
  if (!rows || !key) return null;
  const target = key.toString().trim().toUpperCase();
  return rows.find((r) => (getCol(r, letter) || "").toString().trim().toUpperCase() === target);
}

function normalizeName(s) {
  return (s || "").toString().toLowerCase().replace(/[\.\']/g, "").replace(/\s+jr$/i, "").trim();
}

function findPlayerRow(name) {
  const t = normalizeName(name);
  return state.player.find((r) => normalizeName(getCol(r, COLS.player.name)) === t);
}

function calculateLineupPERFromEntries(entries) {
  let totalWeightedPER = 0;
  let totalUSG = 0;
  for (const e of entries) {
    const per = parseFloat(e.per || 0);
    const usg = parseFloat(e.usg || 0);
    const gp = parseFloat(e.gp || 0);
    const min = parseFloat(e.min || 0);
    const reliability = Math.min(1, gp / 20) * Math.min(1, min / 25);
    const weight = usg * reliability;
    totalWeightedPER += per * weight;
    totalUSG += weight;
  }
  return totalUSG > 0 ? +(totalWeightedPER / totalUSG).toFixed(2) : 0;
}

function calculateLineupPER(playerNames) {
  const entries = playerNames.map((nm) => {
    const pr = findPlayerRow(nm) || {};
    return {
      name: nm,
      per: parseFloat(getCol(pr, COLS.player.per) || 0),
      usg: parseFloat(getCol(pr, COLS.player.usg) || 0),
      gp: parseFloat(getCol(pr, COLS.player.gp) || 0),
      min: parseFloat(getCol(pr, COLS.player.min) || 0),
    };
  });
  return calculateLineupPERFromEntries(entries);
}

function computeConfidence(awayPER, homePER, awayStats, homeStats, awayB2B, homeB2B) {
  const baseDiff = homePER - awayPER;
  const paceAdj = ((homeStats.pace - awayStats.pace) || 0) * 0.1;
  const effAdj = (((homeStats.offEff - homeStats.defEff) || 0) - ((awayStats.offEff - awayStats.defEff) || 0)) * 0.05;
  const rebAdj = (((homeStats.oreb - homeStats.oppOreb) || 0) - ((awayStats.oreb - awayStats.oppOreb) || 0)) * 0.05;
  const b2bPenalty = (awayB2B ? -0.5 : 0) + (homeB2B ? -0.3 : 0);
  const confRaw = 60 + baseDiff * 4 + paceAdj + effAdj + rebAdj + b2bPenalty;
  return Math.max(50, Math.min(95, confRaw));
}

function computeEdges(spread, total, awayPER, homePER, awayStats, homeStats) {
  const perDiff = homePER - awayPER;
  const mlEdge = perDiff * 0.8 + ((homeStats.offEff - awayStats.offEff) || 0) * 0.05;
  const atsEdge = mlEdge - spread * 0.35;
  const paceAvg = (homeStats.pace + awayStats.pace) / 2;
  const effAvg = ((homeStats.offEff + awayStats.offEff) - (homeStats.defEff + awayStats.defEff)) / 2;
  const expectedTotal = Math.max(190, Math.min(260, 200 + (paceAvg - 98) * 1.2 + effAvg * 0.6));
  const totalEdge = expectedTotal - total;
  return { mlEdge: +mlEdge.toFixed(2), atsEdge: +atsEdge.toFixed(2), totalEdge: +totalEdge.toFixed(2) };
}

/* UI rendering */
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
  const row = state.trgames.find((r) => getCol(r, COLS.trgames.matchup) === matchupStr) || {};
  document.getElementById("meta-time").textContent = getCol(row, COLS.trgames.time) || "—";
  document.getElementById("meta-location").textContent = getCol(row, COLS.trgames.location) || "—";
  document.getElementById("meta-hotness").textContent = getCol(row, COLS.trgames.hotness) || "—";
  document.getElementById("meta-rank").textContent = getCol(row, COLS.trgames.rank) || "—";

  const { away, home } = parseMatchup(matchupStr);
  state.awayTeam = away;
  state.homeTeam = home;
  document.getElementById("away-team").textContent = away || "—";
  document.getElementById("home-team").textContent = home || "—";

  renderLineupFields("away-fields", "away");
  renderLineupFields("home-fields", "home");
}

function renderLineupFields(containerId, side) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const teamKey = side === "away" ? state.awayTeam : state.homeTeam;
  const lr = teamRowByKey(state.lineups, COLS.lineups.team, teamKey) || {};
  const slots = ["f1", "f2", "f3", "f4", "f5"].map((k, i) => ({ label: `F${i+1}`, name: getCol(lr, COLS.lineups[k]) || "" }));
  if (side === "away") state.awayLineup = []; else state.homeLineup = [];

  slots.forEach((s, idx) => {
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
    perInput.placeholder = "PER";
    wrap.appendChild(perInput);

    const usgInput = document.createElement("input");
    usgInput.type = "number";
    usgInput.step = "0.1";
    usgInput.placeholder = "USG%";
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

    const pr = s.name ? findPlayerRow(s.name) : null;
    if (pr) {
      perInput.value = getCol(pr, COLS.player.per) || "";
      usgInput.value = getCol(pr, COLS.player.usg) || "";
      gpInput.value = getCol(pr, COLS.player.gp) || "";
      minInput.value = getCol(pr, COLS.player.min) || "";
    }

    function updateState() {
      const entry = {
        name: nameInput.value,
        per: parseFloat(perInput.value || "0"),
        usg: parseFloat(usgInput.value || "0"),
        gp: parseFloat(gpInput.value || "0"),
        min: parseFloat(minInput.value || "0"),
      };
      if (side === "away") {
        state.awayLineup[idx] = entry;
        document.getElementById("away-lineup-per").textContent = calculateLineupPER(state.awayLineup.map(x => x.name)).toFixed(2);
      } else {
        state.homeLineup[idx] = entry;
        document.getElementById("home-lineup-per").textContent = calculateLineupPER(state.homeLineup.map(x => x.name)).toFixed(2);
      }
    }

    [nameInput, perInput, usgInput, gpInput, minInput].forEach(el => el.addEventListener("input", updateState));
    container.appendChild(wrap);
    updateState();
  });
}

function renderStatComparison() {
  const awayRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.awayTeam) || {};
  const homeRow = teamRowByKey(state.nbastuff, COLS.nbastuff.team, state.homeTeam) || {};
  const atsAway = teamRowByKey(state.ats, COLS.ats.team, state.awayTeam) || {};
  const atsHome = teamRowByKey(state.ats, COLS.ats.team, state.homeTeam) || {};
  const ouAway = teamRowByKey(state.ou, COLS.ou.team, state.awayTeam) || {};
  const ouHome = teamRowByKey(state.ou, COLS.ou.team, state.homeTeam) || {};
  const rankAway = teamRowByKey(state.ranking, COLS.ranking.team, state.awayTeam) || {};
  const rankHome = teamRowByKey(state.ranking, COLS.ranking.team, state.homeTeam) || {};

  const rows = [
    { label: "PPG L5", away: getCol(awayRow, COLS.nbastuff.ppg), home: getCol(homeRow, COLS.nbastuff.ppg) },
    { label: "OPPG L5", away: getCol(awayRow, COLS.nbastuff.oppg), home: getCol(homeRow, COLS.nbastuff.oppg) },
    { label: "Pace L5", away: getCol(awayRow, COLS.nbastuff.pace), home: getCol(homeRow, COLS.nbastuff.pace) },
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
        ${rows.map(r => `<tr><td>${r.label}</td><td>${r.away || "—"}</td><td>${r.home || "—"}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function predictGame() {
  const spread = parseFloat(document.getElementById("edit-spread").value || "0");
  const total = parseFloat(document.getElementById("edit-total").value || "220");
  const awayPlayers = (state.awayLineup || []).map(x => x.name);
  const homePlayers = (state.homeLineup || []).map(x => x.name);
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

async function loadAllCsvs() {
  const urls = {
    trgames: document.getElementById("url-trgames").value.trim(),
    nbastuff: document.getElementById("url-nbastuff").value.trim(),
    lineups: document.getElementById("url-lineups").value.trim(),
    player: document.getElementById("url-player").value.trim(),
    league: document.getElementById("url-league").value.trim(),
    ranking: document.getElementById("url-ranking").value.trim(),
    ats: document.getElementById("url-ats").value.trim(),
    ou: document.getElementById("url-ou").value.trim(),
  };

  const missing = Object.entries(urls).filter(([, u]) => !u).map(([k]) => k);
  if (missing.length) {
    document.getElementById("load-status").textContent = `Missing URLs: ${missing.join(", ")}`;
    return;
  }

  document.getElementById("load-status").textContent = "Loading CSVs from URLs...";
  try {
    const [trgames, nbastuff, lineups, player, league, ranking, ats, ou] = await Promise.all([
      fetchCsvFromUrl(urls.trgames),
      fetchCsvFromUrl(urls.nbastuff),
      fetchCsvFromUrl(urls.lineups),
      fetchCsvFromUrl(urls.player),
      fetchCsvFromUrl(urls.league),
      fetchCsvFromUrl(urls.ranking),
      fetchCsvFromUrl(urls.ats),
      fetchCsvFromUrl(urls.ou),
    ]);
    Object.assign(state, { trgames, nbastuff, lineups, player, league, ranking, ats, ou });
    renderGameSelect();
    document.getElementById("load-status").textContent = "Loaded!";
  } catch (err) {
    document.getElementById("load-status").textContent = `Error loading CSVs: ${err.message}`;
  }
}

function clearData() {
  Object.assign(state, {
    trgames: [], nbastuff: [], lineups: [], player: [], league: [], ranking: [], ats: [], ou: [],
    awayTeam: null, homeTeam: null, awayLineup: [], homeLineup: []
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
