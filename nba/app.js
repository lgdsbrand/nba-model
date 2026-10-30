/***********************************************************
 * NBA GAME CARDS (2026-10-26)
 *
 * Reads nba/data/cards.json, written five times a day by pipeline/cards.py
 * (GitHub Actions): five days of games, two back to two ahead, each with the
 * DraftKings lines, the model's projected score, win % and fair prices, and
 * the result once it is final. Every team carries its records, last ten games
 * and the figures behind the projection, for the matchup details.
 *
 * Win % and fair prices, never edges: the backtest found no edge over
 * DraftKings, so the page shows our chance and the book's price side by side,
 * like the NHL page (pipeline/backtest.py, pipeline/cards.py).
 *
 * The lineup tool in the matchup details re-runs the model in the browser with
 * the starters a visitor types; predict() below mirrors pipeline/model.py.
 ***********************************************************/

const DATA = "/nba/data/";
const CARDS_URL = DATA + "cards.json";
const PLAYERS_URL = DATA + "players.csv";
const TOP_PICKS = 4;
const SLOTS = ["Guard", "Guard", "Forward", "Forward", "Center"];

const state = { data: null, day: null, players: null, powerOpen: false };

/*************** HELPERS ****************/

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function add(parent, ...children) {
  children.forEach(c => c && parent.appendChild(c));
  return parent;
}

function odds(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Math.round(Number(n));
  return v > 0 ? `+${v}` : String(v);
}

function pct(p, digits = 1) {
  return p == null ? "—" : `${(p * 100).toFixed(digits)}%`;
}

function signed(n) {
  if (n == null) return "—";
  const v = Number(n);
  return v > 0 ? `+${v}` : v === 0 ? "PK" : String(v);
}

// A home spread as books write it, named by its favourite: "BOS -13.5".
function spreadLabel(homeLine, home, away) {
  if (homeLine == null) return "—";
  const v = Math.round(Number(homeLine) * 2) / 2;
  if (v === 0) return "Pick'em";
  return v < 0 ? `${home} ${v}` : `${away} -${v}`;
}

function easternToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

function dayCaption(date, today) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (diff === -2) return "2 days ago";
  if (diff === 2) return "2 days away";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function shortDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function parseCsv(text) {
  return text.trim().split(/\r?\n/).map(line => {
    const cells = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if (ch === "," && !quoted) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

/*************** MODEL (mirrors pipeline/model.py) ****************/

function erf(x) {
  // Abramowitz and Stegun 7.1.26: good to 1.5e-7, plenty for a win %.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function matchup(h, a, lgEff) {
  const poss = (h.pace + a.pace) / 2;
  const home = poss * (h.oeff + a.deff - lgEff) / 100;
  const away = poss * (a.oeff + h.deff - lgEff) / 100;
  return [home - away, home + away];
}

function windows(team) {
  return {
    season: { pace: team.pace, oeff: team.off_eff, deff: team.def_eff },
    l5: { pace: team.l5_pace, oeff: team.l5_off_eff, deff: team.l5_def_eff },
  };
}

function predict(home, away, perHome, perAway) {
  const { params, league } = state.data.model;
  const h = windows(home), a = windows(away);
  const s = matchup(h.season, a.season, league.eff);
  const f = matchup(h.l5, a.l5, league.eff);
  const dot = (c, x) => c.reduce((sum, ci, i) => sum + ci * x[i], 0);
  const margin = dot(params.margin.coef, [1, s[0], f[0], perHome - perAway]);
  const total = dot(params.total.coef, [1, s[1], f[1], perHome + perAway]);
  const p = Math.min(Math.max(normalCdf(margin / params.margin.sd), 1e-6), 1 - 1e-6);
  const homeWin = 1 / (1 + Math.exp(-params.win_stretch * Math.log(p / (1 - p))));
  return { homePts: (total + margin) / 2, awayPts: (total - margin) / 2, homeWin };
}

function lineupPer(names) {
  let total = 0, weight = 0;
  names.forEach(name => {
    const p = state.players && state.players[name];
    if (!p) return;
    const w = (p.mp || 20) * ((p.usg || 20) / 20);
    total += (p.per || 15) * w;
    weight += w;
  });
  return weight ? total / weight : 0;
}

async function loadPlayers() {
  if (state.players) return state.players;
  const res = await fetch(PLAYERS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = parseCsv(await res.text()).slice(1);
  state.players = {};
  rows.forEach(([name, team, g, mp, per, usg]) => {
    if (name) state.players[name] = { name, team, mp: Number(mp), per: Number(per), usg: Number(usg) };
  });
  return state.players;
}

/*************** DATE STRIP ****************/

function renderDates() {
  const nav = document.getElementById("dates");
  nav.innerHTML = "";
  const today = easternToday();
  state.data.days.forEach(day => {
    const b = el("button", "date-btn" + (day.date === state.day ? " active" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", day.date === state.day ? "true" : "false");
    add(b, el("span", "caption", dayCaption(day.date, today)), el("strong", null, shortDate(day.date)));
    b.addEventListener("click", () => selectDay(day.date));
    nav.appendChild(b);
  });
}

function selectDay(date) {
  state.day = date;
  const url = new URL(window.location.href);
  url.searchParams.set("date", date);
  window.history.replaceState(null, "", url);
  renderDates();
  renderBoard();
}

function defaultDay(days) {
  const asked = new URLSearchParams(window.location.search).get("date");
  if (asked && days.some(d => d.date === asked)) return asked;
  const today = easternToday();
  const exact = days.find(d => d.date === today && d.games.length);
  if (exact) return exact.date;
  const next = days.find(d => d.date >= today && d.games.length);
  return (next || days.find(d => d.games.length) || days[days.length - 1]).date;
}

/*************** BOARD ****************/

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const day = state.data.days.find(d => d.date === state.day);
  if (!day || !day.games.length) {
    board.appendChild(el("div", "empty", "No NBA games on this day."));
    return;
  }
  const power = powerPanel();
  if (power) board.appendChild(power);
  const top = topPanel(day);
  if (top) board.appendChild(top);
  day.games.forEach(g => board.appendChild(gameCard(g)));
}

function favourite(g) {
  const m = g.model;
  const homeFav = m.home_win >= 0.5;
  return {
    abbr: homeFav ? g.home : g.away,
    p: homeFav ? m.home_win : m.away_win,
    fair: homeFav ? m.fair_ml_home : m.fair_ml_away,
    book: g.line ? (homeFav ? g.line.ml_home : g.line.ml_away) : null,
    homeFav,
  };
}

function wonOrLost(g) {
  if (g.state !== "post" || !g.model || g.favourite_won == null) return null;
  return g.favourite_won ? "won" : "lost";
}

function topPanel(day) {
  const predicted = day.games.filter(g => g.model);
  if (!predicted.length) return null;
  const panel = el("section", "panel");
  const head = add(el("div", "panel-head"), el("span", "bar"), el("h2", null, "🎯 Highest probability"));
  const graded = predicted.filter(g => wonOrLost(g));
  if (graded.length) {
    const w = graded.filter(g => g.favourite_won).length;
    head.appendChild(el("span", "right muted", `Favourites ${w}-${graded.length - w}`));
  }
  panel.appendChild(head);
  const body = el("div", "panel-body");
  const tops = el("div", "tops");
  predicted
    .map(g => ({ g, f: favourite(g) }))
    .sort((x, y) => y.f.p - x.f.p)
    .slice(0, TOP_PICKS)
    .forEach(({ g, f }) => {
      const result = wonOrLost(g);
      const box = el("div", "top" + (result ? " " + result : ""));
      add(box,
        el("div", "caption", `${g.away} @ ${g.home}`),
        el("div", "pick", `${f.abbr} to win`));
      const line = el("div", "tiny");
      add(line, el("span", "pct", pct(f.p)), document.createTextNode(` · Fair ${odds(f.fair)}` + (f.book != null ? ` · DK ${odds(f.book)}` : "")));
      box.appendChild(line);
      if (result) box.appendChild(el("div", "tiny " + (result === "won" ? "win" : "loss"), result === "won" ? "✓ Won" : "✗ Lost"));
      tops.appendChild(box);
    });
  add(body, tops, el("p", "tiny",
    "Our chance of each pick, not an edge. Fair is the price that chance is worth; a price only pays over time when your book offers better than fair."));
  panel.appendChild(body);
  return panel;
}

function logo(team, abbr) {
  const wrap = el("div", "logo");
  if (team && team.logo) {
    const img = el("img");
    img.src = team.logo;
    img.alt = `${team.name} logo`;
    img.loading = "lazy";
    img.width = 58;
    img.height = 58;
    img.addEventListener("error", () => { wrap.innerHTML = ""; wrap.appendChild(el("span", "abbr", abbr)); });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(el("span", "abbr", abbr));
  }
  return wrap;
}

function teamColumn(g, side) {
  const abbr = g[side];
  const team = state.data.teams[abbr];
  const col = el("div", "team");
  add(col, logo(team, abbr), el("div", "team-name", team ? team.name : abbr));
  if (team) col.appendChild(el("div", "team-record", team.record));
  if (team && team.power_rank) {
    const power = el("div", "team-power", `Power #${team.power_rank} · ${powerText(team.power)}`);
    power.title = "Power rating: points per game better than an average team on a neutral floor.";
    col.appendChild(power);
    if (team.offense_rank) {
      const ends = el("div", "team-power", `Off #${team.offense_rank} · Def #${team.defense_rank}`);
      ends.title = `Offense ${team.offense} and defense ${team.defense} points per 100 possessions, adjusted for the schedule (league ranks of 30).`;
      col.appendChild(ends);
    }
  }
  if (g.b2b && g.b2b[side]) {
    const flag = el("span", "pill b2b", "Back to back");
    flag.title = `${abbr} played yesterday: tonight is the second night of a back to back.`;
    col.appendChild(flag);
  }
  const price = g.line ? (side === "home" ? g.line.ml_home : g.line.ml_away) : null;
  const other = g.line ? (side === "home" ? g.line.ml_away : g.line.ml_home) : null;
  if (price != null) {
    const box = el("div", "ml-box num" + (other != null && price < other ? " fav" : ""));
    add(box, el("span", "caption", "DK ML"), document.createTextNode(odds(price)));
    col.appendChild(box);
  }
  return col;
}

function middleColumn(g) {
  const mid = el("div", "middle");
  if (g.state === "post") {
    mid.appendChild(el("span", "pill final", "FINAL"));
    mid.appendChild(el("div", "final-score num", `${g.away_score} - ${g.home_score}`));
  } else if (g.state === "in") {
    mid.appendChild(el("span", "pill live", "● LIVE"));
    mid.appendChild(el("div", "tiny", "Final score after the next update"));
  } else {
    mid.appendChild(el("span", "pill", g.time));
    mid.appendChild(el("div", "at", "@"));
  }
  if (g.line && g.line.total != null) mid.appendChild(el("div", "ou", `O/U ${g.line.total}`));
  if (g.game_score != null) mid.appendChild(gameScoreBadge(g.game_score));

  const away = state.data.teams[g.away], home = state.data.teams[g.home];
  if (away && home) {
    const table = el("table", "records num");
    [["OVR", away.record, home.record], ["A/H", away.road_record, home.home_record], ["L10", away.last10_record, home.last10_record]]
      .forEach(([label, a, h]) => {
        const tr = el("tr");
        add(tr, el("td", null, a), el("td", "label", label), el("td", null, h));
        table.appendChild(tr);
      });
    mid.appendChild(table);
  }
  return mid;
}

// Game score 0-100 (pipeline/cards.py game_score): 60% how good both teams
// are by power rank, 40% how close our win % makes the game.
function gameScoreBadge(score) {
  const tier = score >= 80 ? "hot" : score >= 65 ? "good" : "";
  const badge = el("div", "game-score " + tier);
  add(badge, el("span", "caption", "Game score"), el("b", "num", String(score)));
  badge.title = "0-100: two highly ranked teams in a close game score highest (60% team strength by power rank, 40% closeness by our win %).";
  return badge;
}

// A power rating with its sign and one decimal: "+8.0", "-0.7".
function powerText(p) {
  return p == null ? "—" : `${p > 0 ? "+" : ""}${Number(p).toFixed(1)}`;
}

function powerPanel() {
  const teams = Object.values(state.data.teams).filter(t => t.power_rank)
    .sort((a, b) => a.power_rank - b.power_rank);
  if (!teams.length) return null;
  const panel = el("section", "panel");
  const btn = el("button", "panel-head toggle");
  btn.type = "button";
  const arrow = el("span", "right muted");
  add(btn, el("span", "bar"), el("h2", null, "📈 Power rankings"), arrow);
  const body = el("div", "panel-body");
  const show = (open) => {
    // Kept open across date changes, which rebuild the board.
    state.powerOpen = open;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    arrow.textContent = open ? "Hide ▴" : "Show ▾";
  };
  show(state.powerOpen);
  const rows = teams.map(t => {
    const name = el("td");
    add(name, el("b", null, t.abbr), el("span", "muted", ` ${t.short}`));
    const end = (value, rank) => (value == null ? null : `${Number(value).toFixed(1)} (${rank})`);
    return [t.power_rank, name, powerText(t.power), end(t.offense, t.offense_rank),
      end(t.defense, t.defense_rank), t.record, t.last10_record, t.ats];
  });
  add(body, table(["#", "Team", "Power", "Off", "Def", "Record", "Last 10", "ATS"], rows),
    el("p", "tiny", "Off and Def: points scored and allowed per 100 possessions, adjusted for the schedule, league rank in brackets (a low Def is a good defense). Power is the two together: points per game better than an average team on a neutral floor. This season's games count most, recent ones more; last season counts as about ten games, so it fades by mid-November."));
  btn.addEventListener("click", () => show(body.hidden));
  return add(panel, btn, body);
}

function numbersBand(g) {
  const m = g.model;
  const band = el("div", "numbers");
  const homeLeads = m.home_win >= 0.5;
  const winCell = (abbr, p, fair, lead) => {
    const cell = el("div");
    add(cell,
      el("div", "caption" + (lead ? " lead" : ""), `${abbr} win`),
      el("div", "big num" + (lead ? " win" : ""), pct(p)),
      el("div", "fair num", `Fair ${odds(fair)}`));
    return cell;
  };
  const proj = el("div");
  const score = el("div", "big proj num");
  add(score,
    el("span", homeLeads ? null : "win", m.away_pts.toFixed(1)),
    el("span", "dash", "-"),
    el("span", homeLeads ? "win" : null, m.home_pts.toFixed(1)));
  add(proj, el("div", "caption lead", "Projected score"), score);
  add(band,
    winCell(g.away, m.away_win, m.fair_ml_away, !homeLeads),
    proj,
    winCell(g.home, m.home_win, m.fair_ml_home, homeLeads));
  return band;
}

// How far our line sits from the book's before the box is coloured: about the
// widest quarter (mid) and tenth (big) of this season's games. A gap is a
// disagreement, not a value signal: in last season's backtest, games where we
// were furthest from DraftKings did no better against its line.
const GAP = { spread: { mid: 3, big: 5 }, total: { mid: 6, big: 9 } };

function gapLevel(market, ours, book) {
  if (ours == null || book == null) return null;
  const gap = Math.abs(Number(ours) - Number(book));
  const t = GAP[market];
  return { gap, level: gap >= t.big ? "big" : gap >= t.mid ? "mid" : null };
}

function linesRow(g) {
  const m = g.model, l = g.line || {};
  const wrap = el("div", "lines");
  const box = (title, bookText, ourText, gap) => {
    const b = el("div", "line-box" + (gap && gap.level ? ` gap-${gap.level}` : ""));
    b.appendChild(el("div", "caption", title));
    const r1 = el("div", "line-row");
    add(r1, el("span", "muted", l.book || "DraftKings"), el("b", "num", bookText));
    const r2 = el("div", "line-row");
    add(r2, el("span", "muted", "Our line"), el("b", "num", ourText));
    add(b, r1, r2);
    if (gap && gap.level) {
      const r3 = el("div", "line-row gap-row");
      add(r3, el("span", null, gap.level === "big" ? "Big difference" : "Difference"),
        el("b", "num", `${gap.gap.toFixed(1)} pts`));
      b.appendChild(r3);
      b.title = "Our line and the book's are far apart. That is a disagreement, not a value signal.";
    }
    return b;
  };
  add(wrap,
    box("Spread", spreadLabel(l.spread, g.home, g.away), spreadLabel(m.fair_spread, g.home, g.away),
      gapLevel("spread", m.fair_spread, l.spread)),
    box("Total", l.total != null ? String(l.total) : "—", m.fair_total.toFixed(1),
      gapLevel("total", m.fair_total, l.total)));
  return wrap;
}

function gameCard(g) {
  const card = el("article", "panel game");
  const top = el("div", "game-top");
  add(top, teamColumn(g, "away"), middleColumn(g), teamColumn(g, "home"));
  card.appendChild(top);

  if (g.model) {
    add(card, numbersBand(g), linesRow(g));
    const result = wonOrLost(g);
    if (result) {
      const f = favourite(g);
      card.appendChild(el("p", "note " + (result === "won" ? "win" : "loss"),
        `${result === "won" ? "✓" : "✗"} Our favourite ${f.abbr} (${pct(f.p)}) ${result === "won" ? "won" : "lost"}.`));
    }
  } else {
    card.appendChild(el("p", "note", g.state === "pre"
      ? "No prediction yet: a team has no figures this season."
      : "No pregame prediction was recorded for this game."));
  }

  const btn = el("button", "details-btn", "View matchup details ▾");
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  const details = el("div", "details");
  details.hidden = true;
  // A second button at the bottom of the open details closes them without
  // scrolling back up, and brings the card's top back into view.
  const bottom = el("button", "details-btn bottom", "Hide matchup details ▴");
  bottom.type = "button";
  bottom.hidden = true;
  const toggle = (open) => {
    if (open && !details.childNodes.length) buildDetails(details, g);
    details.hidden = !open;
    bottom.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Hide matchup details ▴" : "View matchup details ▾";
  };
  btn.addEventListener("click", () => toggle(details.hidden));
  bottom.addEventListener("click", () => {
    toggle(false);
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "start" });
  });
  add(card, btn, details, bottom);
  return card;
}

/*************** MATCHUP DETAILS ****************/

function section(title, ...children) {
  const s = el("section");
  s.appendChild(el("h3", null, title));
  children.forEach(c => c && s.appendChild(c));
  return s;
}

function table(headers, rows) {
  const wrap = el("div", "scroll");
  const t = el("table", "grid num");
  const thead = el("tr");
  headers.forEach(h => thead.appendChild(el("th", null, h)));
  t.appendChild(thead);
  rows.forEach(r => {
    const tr = el("tr");
    r.forEach(cell => tr.appendChild(cell instanceof Node ? cell : el("td", null, cell == null ? "—" : String(cell))));
    t.appendChild(tr);
  });
  wrap.appendChild(t);
  return wrap;
}

function movement(g) {
  const l = g.line;
  if (!l || (l.open_spread == null && l.open_total == null && l.open_ml_home == null)) return null;
  return section("Line movement (" + (l.book || "DraftKings") + ")", table(["Market", "Open", "Now"], [
    ["Spread", spreadLabel(l.open_spread, g.home, g.away), spreadLabel(l.spread, g.home, g.away)],
    ["Total", l.open_total, l.total],
    [`${g.away} ML`, odds(l.open_ml_away), odds(l.ml_away)],
    [`${g.home} ML`, odds(l.open_ml_home), odds(l.ml_home)],
  ]));
}

// A team's league rank in one figure: 1 = best (for pace, 1 = fastest).
function leagueRank(key, value, higherBetter) {
  if (value == null) return null;
  const v = Number(Number(value).toFixed(1));
  const better = Object.values(state.data.teams).filter(t => t[key] != null
    && (higherBetter === false ? Number(Number(t[key]).toFixed(1)) < v : Number(Number(t[key]).toFixed(1)) > v));
  return better.length + 1;
}

// Which side the comparison favours: the team better in at least
// VERDICT_MARGIN more categories than the other, otherwise "pretty even".
const VERDICT_MARGIN = 3;

function verdict(g, wins) {
  const [aw, hw] = wins;
  const counted = aw + hw;
  if (!counted) return null;
  const box = el("div", "verdict");
  if (Math.abs(aw - hw) >= VERDICT_MARGIN) {
    const leader = aw > hw ? g.away : g.home;
    add(box, el("span", "caption", "Stats favour"), el("b", "win", leader),
      el("span", "muted", ` better in ${Math.max(aw, hw)} of ${counted} categories`));
  } else {
    add(box, el("span", "caption", "Pretty even"),
      el("span", "muted", ` ${g.away} better in ${aw}, ${g.home} in ${hw} of ${counted} categories`));
  }
  return box;
}

// Fast and slow by league pace rank: top ten and bottom ten of thirty.
const PACE_BAND = 10;

function paceNote(g, a, h) {
  if (a.pace == null || h.pace == null) return null;
  const teams = Object.values(state.data.teams).filter(t => t.pace != null).length;
  const ra = leagueRank("pace", a.pace, null), rh = leagueRank("pace", h.pace, null);
  const fast = r => r <= PACE_BAND, slow = r => r > teams - PACE_BAND;
  const ranks = `pace ranks ${g.away} ${ra}, ${g.home} ${rh} of ${teams}`;
  let text;
  if (fast(ra) && fast(rh)) text = `⚡ Two fast teams (${ranks}): more possessions, expect a high-scoring game.`;
  else if (slow(ra) && slow(rh)) text = `🐢 Two slow teams (${ranks}): fewer possessions, expect a low-scoring game.`;
  else if ((fast(ra) && slow(rh)) || (slow(ra) && fast(rh))) {
    const quick = fast(ra) ? g.away : g.home;
    text = `↔ Fast against slow (${ranks}): ${quick} wants to run; the tempo, and the score, likely land in between.`;
  } else if (fast(ra) || fast(rh)) text = `Slightly up-tempo (${ranks}): one fast team, one average.`;
  else if (slow(ra) || slow(rh)) text = `Slightly slow (${ranks}): one slow team, one average.`;
  else text = `Average pace for both (${ranks}): no strong pace lean.`;
  const lg = state.data.model && state.data.model.league;
  if (g.model && lg && lg.pts) {
    text += ` Our projected total ${g.model.fair_total.toFixed(1)} against a league-average game of ${(2 * lg.pts).toFixed(1)}.`;
  }
  return el("p", "pace-note", text);
}

function comparison(g) {
  const a = state.data.teams[g.away], h = state.data.teams[g.home];
  if (!a || !h) return null;
  const wins = [0, 0];
  const rows = [
    ["Points per game", "ppg", true], ["Points allowed", "oppg", false],
    ["Offensive efficiency", "off_eff", true], ["Defensive efficiency", "def_eff", false],
    ["Pace", "pace", null],
    ["Last 5: points", "l5_ppg", true], ["Last 5: allowed", "l5_oppg", false],
    ["Last 5: off. efficiency", "l5_off_eff", true], ["Last 5: def. efficiency", "l5_def_eff", false],
    ["Rating (SRS)", "rating", true], ["Starters' PER", "lineup_per", true],
  ].map(([label, key, higherBetter]) => {
    // One decimal, as shown, decides which side is better.
    const av = a[key] == null ? null : Number(a[key]).toFixed(1);
    const hv = h[key] == null ? null : Number(h[key]).toFixed(1);
    const cell = (v, other, side) => {
      const better = higherBetter != null && v != null && other != null && v !== other
        && ((Number(v) > Number(other)) === higherBetter);
      if (better) wins[side] += 1;
      const td = el("td", better ? "better" : null, v == null ? "—" : v);
      const rank = leagueRank(key, v, higherBetter);
      if (rank != null) td.appendChild(el("span", "rank", ` (${rank})`));
      return td;
    };
    return [label, cell(av, hv, 0), cell(hv, av, 1)];
  });
  rows.push(["ATS record", a.ats, h.ats], ["Over/under record", a.ou, h.ou]);
  return section("Stat comparison", verdict(g, wins), table(["", g.away, g.home], rows),
    paceNote(g, a, h),
    el("p", "tiny", "League rank in brackets: 1 is best (for pace, the fastest). Efficiency is points per 100 possessions. Season figures blend in last season until each team has played 10 games."));
}

function headToHead(g) {
  const games = g.h2h || [];
  const title = "Head to head";
  if (!games.length) return section(title, el("p", "tiny", "No meetings this season or last."));
  let homeWins = 0;
  const rows = games.map(r => {
    // r is the meeting from this game's home team's side.
    if (r.result === "W") homeWins += 1;
    const winner = r.result === "W" ? g.home : g.away;
    const hi = Math.max(r.pts, r.opp_pts), lo = Math.min(r.pts, r.opp_pts);
    const covered = r.ats === "W" ? g.home : r.ats === "L" ? g.away : r.ats === "P" ? "Push" : null;
    return [
      shortDate(r.date), r.home ? `${g.away} @ ${g.home}` : `${g.home} @ ${g.away}`,
      `${winner} ${hi}-${lo}`, covered, chip(r.ou),
    ];
  });
  return section(`${title} (${g.home} ${homeWins}-${games.length - homeWins})`,
    table(["Date", "Game", "Winner", "Covered", "O/U"], rows),
    el("p", "tiny", "Meetings this season and last, newest first."));
}

function chip(value) {
  const td = el("td");
  if (value) td.appendChild(el("span", "chip " + value, value));
  else td.textContent = "—";
  return td;
}

function lastTen(abbr) {
  const team = state.data.teams[abbr];
  if (!team || !team.last10.length) return null;
  const rows = team.last10.map(r => [
    shortDate(r.date), `${r.home ? "vs" : "@"} ${r.opp}`, `${r.pts}-${r.opp_pts}`, chip(r.result), chip(r.ats), chip(r.ou),
  ]);
  return section(`${team.name}: last 10 (${team.last10_record})`,
    table(["Date", "Opp", "Score", "W/L", "ATS", "O/U"], rows));
}

function lineups(g) {
  const away = state.data.teams[g.away], home = state.data.teams[g.home];
  if (!away || !home) return null;
  const s = el("section", "whatif");
  s.appendChild(el("h3", null, "Starting lineups"));
  const cols = el("div", "two");
  const inputs = {};
  [["away", away], ["home", home]].forEach(([side, team]) => {
    const col = el("div");
    col.appendChild(el("div", "caption", `${team.name} · PER ${team.lineup_per == null ? "—" : team.lineup_per.toFixed(1)}`));
    col.appendChild(el("div", "tiny", " "));
    inputs[side] = SLOTS.map((slot, i) => {
      const starter = team.starters[i];
      const id = `${g.id}-${side}-${i}`;
      const label = el("label", null, `${slot}${starter && starter.per != null ? ` · PER ${starter.per}` : ""}`);
      label.htmlFor = id;
      const input = el("input");
      input.id = id;
      input.value = starter ? starter.name : "";
      input.setAttribute("list", `players-${team.abbr}`);
      input.autocomplete = "off";
      add(col, label, input);
      return input;
    });
    cols.appendChild(col);
  });
  s.appendChild(cols);

  if (g.state !== "pre" || !g.model) {
    s.appendChild(el("p", "tiny", "The lineups each team used most recently. Edit them before tip-off to re-run the projection."));
    inputs.away.concat(inputs.home).forEach(i => { i.disabled = true; });
    return s;
  }

  const out = el("div", "whatif-out");
  const run = el("button", null, "Re-run with these lineups");
  run.type = "button";
  run.addEventListener("click", async () => {
    run.disabled = true;
    try {
      await loadPlayers();
      const names = side => inputs[side].map(i => i.value.trim()).filter(Boolean);
      const unknown = names("away").concat(names("home")).filter(n => !state.players[n]);
      const p = predict(home, away, lineupPer(names("home")), lineupPer(names("away")));
      out.innerHTML = "";
      const homeLeads = p.homeWin >= 0.5;
      add(out,
        el("div", null, `${g.away} ${p.awayPts.toFixed(1)} - ${p.homePts.toFixed(1)} ${g.home}`),
        el("div", "win", `${homeLeads ? g.home : g.away} win ${pct(homeLeads ? p.homeWin : 1 - p.homeWin)} (was ${pct(homeLeads ? g.model.home_win : g.model.away_win)})`));
      if (unknown.length) out.appendChild(el("div", "tiny", `Not found, left out: ${unknown.join(", ")}`));
    } catch (err) {
      console.error(err);
      out.textContent = "Could not load player figures. Try again.";
    } finally {
      run.disabled = false;
    }
  });
  add(s, run, out, el("p", "tiny", "Swap a starter for an injury or rest. The projection is re-run with that lineup's PER; everything else stays as it was."));
  // Player suggestions per team, filled once the figures load.
  loadPlayers().then(players => {
    [away, home].forEach(team => {
      const id = `players-${team.abbr}`;
      if (document.getElementById(id)) return;
      const list = el("datalist");
      list.id = id;
      Object.values(players).filter(p => p.team === team.name).forEach(p => {
        const o = el("option");
        o.value = p.name;
        list.appendChild(o);
      });
      document.body.appendChild(list);
    });
  }).catch(() => {});
  return s;
}

function buildDetails(container, g) {
  const tens = el("div", "two");
  add(tens, lastTen(g.away), lastTen(g.home));
  add(container, movement(g), comparison(g), tens, headToHead(g), lineups(g));
}

/*************** INIT ****************/

async function init() {
  const board = document.getElementById("board");
  try {
    const res = await fetch(CARDS_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    console.error("cards.json", err);
    board.innerHTML = "";
    board.appendChild(el("div", "empty", "Games could not be loaded. Please refresh in a minute."));
    return;
  }
  state.day = defaultDay(state.data.days);
  renderDates();
  renderBoard();
  const early = state.data.early_season;
  const updated = new Date(state.data.updated.replace("Z", ":00Z"));
  const when = Number.isNaN(updated.getTime()) ? state.data.updated : updated.toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) + " ET";
  document.getElementById("footnote").textContent =
    `Updated ${when}. Lines: DraftKings via ESPN. Predictions lock at tip-off. ` +
    "Win % is calibrated on last season's games; the projection uses each team's season and last five games and its starters. " +
    `Amber line boxes: our line is ${GAP.spread.mid}+ points from the book's on the spread or ${GAP.total.mid}+ on the total, a disagreement worth a look, not a bet on its own.` +
    (early ? " Early season: until teams have played 10 games, season figures still lean on last season, so offseason roster moves show up slowly. Weigh them against the book." : "");
}

document.addEventListener("DOMContentLoaded", init);
