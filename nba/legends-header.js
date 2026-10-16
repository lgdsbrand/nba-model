/*
 * The Legends Sports header, so this page reads as part of the client's site
 * (lgdsanalytics.vercel.app/nba, 2026-10-16). A plain-script copy of his
 * header (frontend/src/App.jsx and DropdownNavigation.jsx in
 * lgdsbrand/mlb_predictor_engine_v2): his logo and wordmark with this page's
 * subtitle, his row of sports on a desktop, his menu behind a hamburger on a
 * phone or tablet. Every link opens his site.
 *
 * Renders into <div id="legends-header" data-sport="nba" data-subtitle="...">.
 * The CSS is its own (every class starts with lg-), so this page's styles and
 * the header's never touch.
 *
 * KEEP SPORTS IN STEP with his SPORTS_CONFIG (frontend/src/utils/sports_config.js):
 * ACTIVE and BETA sit in the bar, COMING_SOON under "More".
 */
(function () {
  var ORIGIN = 'https://lgdsanalytics.vercel.app';
  var SPORTS = [
    { id: 'home', name: 'Home', icon: '🏠', status: 'ACTIVE' },
    { id: 'mlb', name: 'MLB', icon: '⚾', status: 'ACTIVE' },
    { id: 'tennis', name: 'Tennis', icon: '🎾', status: 'ACTIVE' },
    { id: 'nba', name: 'NBA', icon: '🏀', status: 'BETA' },
    { id: 'soccer', name: 'Soccer', icon: '⚽', status: 'COMING_SOON' },
    { id: 'ufc', name: 'UFC', icon: '🥊', status: 'COMING_SOON' },
    { id: 'nfl', name: 'NFL', icon: '🏈', status: 'BETA' },
    { id: 'fantasy', name: 'Fantasy', icon: '🏈', status: 'ACTIVE' },
    { id: 'wnba', name: 'WNBA', icon: '🏀', status: 'BETA' },
    { id: 'nhl', name: 'NHL', icon: '🏒', status: 'BETA' },
    { id: 'cbb', name: 'CBB', icon: '🏀', status: 'COMING_SOON' },
    { id: 'cfb', name: 'CFB', icon: '🏈', status: 'BETA' },
    { id: 'pga', name: 'PGA Tour', icon: '⛳', status: 'COMING_SOON' },
  ];
  // NBA and NHL live at their own paths on his site; the rest are views of
  // his app, opened by /?sport=.
  var PATHS = { home: '/', nba: '/nba', nhl: '/nhl' };

  function href(id) {
    return ORIGIN + (PATHS[id] || '/?sport=' + encodeURIComponent(id));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function badge(status) {
    if (status === 'BETA') return el('span', 'lg-badge lg-badge-beta', 'BETA');
    if (status === 'COMING_SOON') return el('span', 'lg-badge lg-badge-soon', 'SOON');
    return null;
  }

  var CSS = [
    '.lg-header{position:sticky;top:0;z-index:50;width:100%;display:flex;flex-direction:column;background:rgba(2,6,23,.9);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid rgba(15,23,42,.8);box-shadow:0 4px 30px rgba(0,0,0,.4);user-select:none;font-family:ui-sans-serif,system-ui,sans-serif}',
    '.lg-header *{box-sizing:border-box;font-family:inherit}',
    '.lg-header a{text-decoration:none}',
    '.lg-row{width:100%;padding:12px 16px;border-bottom:1px solid rgba(15,23,42,.4)}',
    '.lg-wrap{max-width:1280px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.lg-brand{display:flex;flex-direction:column;min-width:0}',
    '.lg-brand-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
    '.lg-logo{height:36px;width:auto;object-fit:contain;filter:brightness(1.1) drop-shadow(0 0 15px rgba(59,130,246,.35))}',
    '.lg-sep{display:none;color:#94a3b8;font-weight:300;font-size:20px;margin:0 4px}',
    '.lg-wordmark{margin-top:2px;font-size:18px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;background:linear-gradient(to right,#22d3ee,#3b82f6,#6366f1);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.lg-subtitle{margin-top:2px;font-size:9px;font-weight:700;letter-spacing:-.025em;color:#6b7280}',
    '.lg-sports-row{display:none;width:100%;padding:8px 32px;border-bottom:1px solid rgba(15,23,42,.2)}',
    '.lg-nav{display:flex;align-items:center;gap:4px;padding:2px;border:1px solid #0f172a;border-radius:12px;background:rgba(15,23,42,.3)}',
    '.lg-tab{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1px solid transparent;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;cursor:pointer;transition:all .2s;white-space:nowrap;background:none;list-style:none}',
    '.lg-tab::-webkit-details-marker{display:none}',
    '.lg-tab:hover{color:#e2e8f0;background:rgba(15,23,42,.4)}',
    '.lg-tab.lg-on{color:#818cf8;font-weight:800;background:rgba(79,70,229,.2);border-color:rgba(99,102,241,.2);box-shadow:0 0 12px rgba(99,102,241,.1)}',
    '.lg-badge{border-radius:4px;padding:0 4px;font-size:7px;font-weight:900;letter-spacing:.1em}',
    '.lg-badge-beta{border:1px solid rgba(6,182,212,.3);background:#083344;color:#22d3ee}',
    '.lg-badge-soon{border:1px solid #1e293b;background:rgba(15,23,42,.5);color:#64748b}',
    '.lg-info{display:flex;gap:8px}',
    '.lg-info a{padding:6px 12px;border:1px solid #0f172a;border-radius:8px;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}',
    '.lg-info a:hover{color:#e2e8f0;background:rgba(15,23,42,.6)}',
    '.lg-menu{position:relative}',
    '.lg-panel{position:absolute;right:0;z-index:60;border:1px solid #1e293b;border-top-color:rgba(99,102,241,.3);border-radius:16px;background:#020617;box-shadow:0 25px 50px -12px rgba(0,0,0,.6)}',
    '.lg-more-panel{top:calc(100% + 8px);left:0;right:auto;width:224px;padding:8px}',
    '.lg-burger-panel{top:56px;width:288px;max-height:80vh;overflow-y:auto;padding:20px}',
    '.lg-item{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;border-radius:12px;border:1px solid transparent;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#cbd5e1}',
    'a.lg-item:hover{color:#f1f5f9;background:rgba(15,23,42,.5)}',
    '.lg-item.lg-on{color:#818cf8;font-weight:800;background:rgba(79,70,229,.2);border-color:rgba(99,102,241,.3)}',
    '.lg-item.lg-soon{opacity:.5}',
    '.lg-item-name{display:flex;align-items:center;gap:12px}',
    '.lg-caption{display:block;margin:0 0 4px;padding:0 8px;font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#64748b}',
    '.lg-rule{margin:16px 0;border-top:1px solid #0f172a}',
    '.lg-burger summary{list-style:none;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid #1e293b;border-radius:12px;background:rgba(15,23,42,.4);color:#94a3b8;cursor:pointer}',
    '.lg-burger summary::-webkit-details-marker{display:none}',
    '.lg-burger summary:hover{color:#e2e8f0;border-color:#334155}',
    '.lg-bars{display:block;width:20px;height:2px;border-radius:9999px;background:currentColor;box-shadow:0 -6px 0 currentColor,0 6px 0 currentColor}',
    '@media (min-width:640px){.lg-sep{display:inline}}',
    '@media (min-width:768px){.lg-row{padding:12px 32px}.lg-logo{height:44px}.lg-wordmark{font-size:20px}.lg-subtitle{font-size:10px}.lg-sep{font-size:24px;margin:0 8px}}',
    '@media (min-width:1024px){.lg-logo{height:48px}.lg-sports-row{display:block}.lg-burger{display:none}}',
    '@media (min-width:1280px){.lg-wrap{max-width:1440px}}',
    '@media (min-width:1536px){.lg-wrap{max-width:1600px}}',
  ].join('\n');

  function render(host) {
    var current = host.getAttribute('data-sport');
    var subtitle = host.getAttribute('data-subtitle') || '';
    var logo = host.getAttribute('data-logo');

    var style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var header = el('header', 'lg-header');

    // 1. Brand, and the hamburger below 1024px.
    var brandRow = el('div', 'lg-row');
    var brandWrap = el('div', 'lg-wrap');
    var brand = el('a', 'lg-brand');
    brand.href = ORIGIN + '/';
    var line = el('span', 'lg-brand-line');
    var img = el('img', 'lg-logo');
    img.src = logo;
    img.alt = 'Legends Sports';
    line.appendChild(img);
    line.appendChild(el('span', 'lg-sep', '|'));
    line.appendChild(el('span', 'lg-wordmark', 'Legends Sports'));
    brand.appendChild(line);
    brand.appendChild(el('span', 'lg-subtitle', subtitle));
    brandWrap.appendChild(brand);

    var burger = el('details', 'lg-menu lg-burger');
    var burgerButton = el('summary');
    burgerButton.setAttribute('aria-label', 'Toggle navigation menu');
    burgerButton.appendChild(el('span', 'lg-bars'));
    burger.appendChild(burgerButton);
    var burgerPanel = el('div', 'lg-panel lg-burger-panel');
    burgerPanel.appendChild(el('span', 'lg-caption', 'Sports Predictors'));
    SPORTS.forEach(function (s) {
      var soon = s.status === 'COMING_SOON';
      var item = el(soon ? 'span' : 'a', 'lg-item' + (s.id === current ? ' lg-on' : '') + (soon ? ' lg-soon' : ''));
      if (!soon) item.href = href(s.id);
      var name = el('span', 'lg-item-name');
      name.appendChild(el('span', '', s.icon));
      name.appendChild(el('span', '', s.name));
      item.appendChild(name);
      var b = badge(s.status);
      if (b) item.appendChild(b);
      burgerPanel.appendChild(item);
    });
    burgerPanel.appendChild(el('div', 'lg-rule'));
    burgerPanel.appendChild(el('span', 'lg-caption', 'Information'));
    [['about', 'ℹ️', 'About'], ['contact', '✉️', 'Contact']].forEach(function (info) {
      var item = el('a', 'lg-item');
      item.href = ORIGIN + '/?open=' + info[0];
      var name = el('span', 'lg-item-name');
      name.appendChild(el('span', '', info[1]));
      name.appendChild(el('span', '', info[2]));
      item.appendChild(name);
      burgerPanel.appendChild(item);
    });
    burger.appendChild(burgerPanel);
    brandWrap.appendChild(burger);
    brandRow.appendChild(brandWrap);
    header.appendChild(brandRow);

    // 2. His sports, 1024px and up.
    var sportsRow = el('div', 'lg-sports-row');
    var sportsWrap = el('div', 'lg-wrap');
    var nav = el('nav', 'lg-nav');
    nav.setAttribute('aria-label', 'Sports');
    SPORTS.forEach(function (s) {
      if (s.status === 'COMING_SOON') return;
      var tab = el('a', 'lg-tab' + (s.id === current ? ' lg-on' : ''));
      tab.href = href(s.id);
      tab.appendChild(el('span', '', s.icon));
      tab.appendChild(el('span', '', s.name));
      var b = badge(s.status);
      if (b) tab.appendChild(b);
      nav.appendChild(tab);
    });
    var more = el('details', 'lg-menu');
    var moreButton = el('summary', 'lg-tab', 'More ▾');
    more.appendChild(moreButton);
    var morePanel = el('div', 'lg-panel lg-more-panel');
    SPORTS.forEach(function (s) {
      if (s.status !== 'COMING_SOON') return;
      var item = el('span', 'lg-item lg-soon');
      var name = el('span', 'lg-item-name');
      name.appendChild(el('span', '', s.icon));
      name.appendChild(el('span', '', s.name));
      item.appendChild(name);
      item.appendChild(badge(s.status));
      morePanel.appendChild(item);
    });
    more.appendChild(morePanel);
    nav.appendChild(more);
    sportsWrap.appendChild(nav);
    var info = el('div', 'lg-info');
    [['about', 'About'], ['contact', 'Contact']].forEach(function (pair) {
      var link = el('a', '', pair[1]);
      link.href = ORIGIN + '/?open=' + pair[0];
      info.appendChild(link);
    });
    sportsWrap.appendChild(info);
    sportsRow.appendChild(sportsWrap);
    header.appendChild(sportsRow);

    host.replaceWith(header);

    // An open menu closes on Escape or a press anywhere outside it.
    var menus = [burger, more];
    document.addEventListener('pointerdown', function (event) {
      menus.forEach(function (menu) {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') menus.forEach(function (menu) { menu.open = false; });
    });
  }

  var host = document.getElementById('legends-header');
  if (host) render(host);
})();
