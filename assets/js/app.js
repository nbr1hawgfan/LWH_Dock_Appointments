/* LWH Dock Appointments — carrier booking + LWH team board.
   Data: Supabase (LWH Companion project, appt_* RPCs). Email: GAS mailer reads appt_outbox. */
(() => {
  'use strict';
  const VERSION = '1.0.6';
  const SB = 'https://tjivcqxnkftujceumdtx.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaXZjcXhua2Z0dWpjZXVtZHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTE5NDMsImV4cCI6MjEwMDQ2Nzk0M30.GzDc-_u92jvAHq7eG1X-1cet5Av9qF3ZDEVJMRKEP0E';
  const WX = { lat: 35.333, lon: -94.300, name: 'Fort Smith' };
  const TRAILERS = ["53' Dry Van", "48' Dry Van", 'Reefer', 'Flatbed', 'Box Truck', 'Other'];
  const STATUS = { BOOKED: 'Booked', ARRIVED: 'Checked in', AT_DOOR: 'At door', DONE: 'Done', NO_SHOW: 'No-show', CANCELLED: 'Cancelled' };
  const DIRNAME = { IN: 'Inbound', OUT: 'Outbound' };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('lwhappt_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('lwhappt_' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem('lwhappt_' + k); } catch (e) { /* ignore */ } },
  };
  const pd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const ds = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
  const fmtT = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  const fmtD = (s, long) => { const d = pd(s); return long ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] + ', ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()] + ' ' + d.getDate() : DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const fmtStamp = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d); };
  const ctNow = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return { date: g('year') + '-' + g('month') + '-' + g('day'), min: Number(g('hour')) * 60 + Number(g('minute')) }; };
  const fmtPhone = (v) => { const d = String(v).replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10); if (d.length < 4) return d; if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3); return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6); };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Pinned to the building's coordinates (Google doesn't list 8501 State Hwy 45 under our name)
  const mapQ = () => (S.cfg && S.cfg.map_q) || (S.cfg && S.cfg.site_address) || '';
  const mapsUrl = () => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(mapQ());
  const mapView = () => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQ());
  // phone numbers in text become tap-to-call links
  const linkPhones = (t) => esc(t).replace(/\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}\b/g, (m) => '<a href="tel:+1' + m.replace(/\D/g, '') + '">' + m + '</a>');
  const ENTRY_CAPTION = 'Doors 34–41 are used for loading and unloading. Call 479-651-3382 for your door assignment. Paperwork may say 8501 State Hwy 45; we are the building just south of Americold.';
  const entryPhoto = () => '<figure class="entry-photo"><a href="assets/img/entrance.jpg?v=3" target="_blank" rel="noopener"><img src="assets/img/entrance.jpg?v=3" alt="Logistics Warehouse – ArcBest dock doors" loading="lazy"><span class="photo-tag">Logistics Warehouse · ArcBest</span></a><figcaption>' + linkPhones(ENTRY_CAPTION) + '</figcaption></figure>';
  const mapEmbed = (h) => '<div class="map-box"><iframe title="Map to ' + esc(S.cfg.site_address) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="height:' + (h || 220) + 'px" src="https://maps.google.com/maps?q=' + encodeURIComponent(mapQ()) + '&z=15&output=embed"></iframe>' +
    '<div class="map-links"><a href="' + mapsUrl() + '" target="_blank" rel="noopener">Get directions</a><a href="' + mapView() + '" target="_blank" rel="noopener">Open in Google Maps</a></div></div>';

  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), err ? 6000 : 3500);
  }
  function busy(on, label) {
    let b = $('#busy');
    if (!on) { b && b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'busy'; b.className = 'busy'; document.body.appendChild(b); }
    b.innerHTML = '<div class="box"><div class="spin"></div><div>' + esc(label || 'Working…') + '</div></div>';
  }
  function modal(title, body, foot, wide) {
    const host = $('#modalHost');
    host.innerHTML = '<div class="modal-bg"><div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="modal-x" type="button" aria-label="Close">×</button></div>' +
      '<div class="modal-body">' + body + '</div>' + (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div></div>';
    const close = () => { host.innerHTML = ''; };
    $('.modal-x', host).onclick = close;
    $('.modal-bg', host).addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) close(); });
    return { el: $('.modal', host), close };
  }
  const closeModal = () => { $('#modalHost').innerHTML = ''; };

  async function rpc(fn, args) {
    let r;
    try {
      r = await fetch(SB + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
        body: JSON.stringify(args || {}),
      });
    } catch (e) { throw new Error('No connection. Check your signal and try again.'); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'Server error ' + r.status);
    return j;
  }

  // ---------- state ----------
  const S = {
    cfg: null,
    view: 'home',
    book: null,          // { dir, days:[], date, slot, resched:{c,k} }
    manage: null,        // { appointment, token, can_change }
    lastBooked: null,
    team: { token: LS.get('team_token', null), name: LS.get('team_name', ''), role: LS.get('team_role', ''), date: null, data: null, week: null, showCancelled: false, timer: null },
  };
  const teamMode = () => !!S.team.token;

  // ---------- clock + weather ----------
  function tickClock() {
    $('#clock').textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
  }
  const WXC = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'], 95: ['⛈️', 'Storms'], 96: ['⛈️', 'Storms'], 99: ['⛈️', 'Storms'] };
  async function loadWeather() {
    try {
      let d = LS.get('wx', null);
      if (!d || Date.now() - d.t > 15 * 60000) {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + WX.lat + '&longitude=' + WX.lon +
          '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=1');
        if (!r.ok) return;
        d = { t: Date.now(), d: await r.json() }; LS.set('wx', d);
      }
      const c = d.d.current, dy = d.d.daily, w = WXC[c.weather_code] || ['🌡️', ''];
      $('#wx').innerHTML = '<span>' + w[0] + '</span><b>' + Math.round(c.temperature_2m) + '°F</b> ' + esc(w[1]) +
        ' <span style="color:var(--muted)">· H ' + Math.round(dy.temperature_2m_max[0]) + '° / L ' + Math.round(dy.temperature_2m_min[0]) + '° · ' + (dy.precipitation_probability_max[0] || 0) + '% rain · ' + WX.name + '</span>';
    } catch (e) { /* weather is a nice-to-have */ }
  }

  // ---------- chrome (nav + header) ----------
  function renderChrome() {
    const nav = $('#nav');
    const items = teamMode()
      ? [['board', 'Dock Board'], ['tbook', 'Book'], ['search', 'Search'], ['blocks', 'Block Time'], ['settings', 'Settings']]
      : [['home', 'Home'], ['book', 'Book'], ['mine', 'My Appointments'], ['find', 'Find']];
    nav.innerHTML = items.map(([v, l]) => '<button type="button" data-v="' + v + '" class="' + (S.view === v || (v === 'book' && S.view === 'details') ? 'active' : '') + '">' + l + (v === 'mine' ? mineCount() : '') + '</button>').join('') +
      (teamMode() ? '<span class="spacer"></span><button type="button" class="logout" data-v="logout">Sign out</button>' : '');
    $$('button', nav).forEach((b) => b.onclick = () => go(b.dataset.v));
    $('#brandRight').innerHTML = teamMode()
      ? '<div class="who"><div class="n">' + esc(S.team.name) + '</div><div class="s">LWH Team</div></div>'
      : '';
    $('#teamLink').textContent = teamMode() ? 'Sign out of team view' : 'LWH team sign in';
  }
  function mineCount() {
    const n = LS.get('mine', []).filter((x) => !x.date || x.date >= ctNow().date).length;
    return n ? ' <span class="count">' + n + '</span>' : '';
  }

  function go(v, opts) {
    if (v === 'logout') return teamLogout();
    if (v === 'book' && !(opts && opts.keep)) S.book = null;
    S.view = v;
    clearInterval(S.team.timer); S.team.timer = null;
    const u = new URL(location.href);
    ['c', 'k', 'view'].forEach((p) => u.searchParams.delete(p));
    if (teamMode() && v !== 'board') u.searchParams.set('view', v);
    history.replaceState(null, '', u.pathname + u.search);
    renderChrome();
    window.scrollTo(0, 0);
    const R = { home: vHome, book: vBook, details: vDetails, done: vDone, mine: vMine, find: vFind, manage: vManage, login: vLogin, board: vBoard, tbook: () => teamBookModal({}), search: vSearch, blocks: vBlocks, settings: vSettings }[v];
    if (v === 'tbook') { S.view = 'board'; renderChrome(); vBoard(); teamBookModal({}); return; }
    (R || vHome)();
  }
  const app = () => $('#app');

  // =====================================================================
  //  CARRIER
  // =====================================================================
  function vHome() {
    const c = S.cfg;
    const mine = LS.get('mine', []).filter((x) => x.date >= ctNow().date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const hrs = c.hours.filter((h) => h.is_open);
    const brTxt = (c.breaks || []).map((b) => 'closed ' + fmtT(b.start) + ' – ' + fmtT(b.end) + (b.label ? ' for ' + b.label.toLowerCase() : '')).join(', ');
    const hrsTxt = hrs.length ? (DOW[hrs[0].dow] + '–' + DOW[hrs[hrs.length - 1].dow] + ' · ' + fmtT(hrs[0].open) + ' – ' + fmtT(hrs[0].close) + (brTxt ? ' · ' + brTxt : '')) : '';
    app().innerHTML =
      '<div class="hero"><h1>Schedule a dock appointment</h1>' +
      '<p>Book, change or cancel your pickup or delivery in about a minute. You\'ll get a confirmation by email.</p>' +
      '<div class="addr">📍 ' + esc(c.site_address) + '</div>' +
      (hrsTxt ? '<div class="hint" style="margin-top:4px">Dock hours: ' + esc(hrsTxt) + '</div>' : '') + entryPhoto() + mapEmbed(200) + '</div>' +
      '<div class="dir-pick">' +
      '<button class="dir-btn" type="button" data-d="IN"><span class="tag">Delivering to us</span><b>Inbound</b><span>Drop off / unload at our dock</span></button>' +
      '<button class="dir-btn out" type="button" data-d="OUT"><span class="tag">Picking up from us</span><b>Outbound</b><span>Pick up / load at our dock</span></button></div>' +
      (mine.length ? '<div class="card"><div class="card-head"><h2>Your upcoming appointments</h2></div><div class="card-body" id="homeMine"><div class="skel" style="height:60px"></div></div></div>' : '') +
      '<div class="quick"><button class="btn btn-ghost btn-block" type="button" id="qFind">Find an appointment</button>' +
      '<button class="btn btn-ghost btn-block" type="button" id="qMine">My appointments</button></div>';
    $$('.dir-btn').forEach((b) => b.onclick = () => startBook(b.dataset.d));
    $('#qFind').onclick = () => go('find');
    $('#qMine').onclick = () => go('mine');
    if (mine.length) loadMine($('#homeMine'), 3);
  }

  function startBook(dir, resched) {
    S.book = { dir, days: [], date: null, slot: null, resched: resched || null, loadedTo: null };
    go('book', { keep: true });
  }

  async function loadDays(from, n) {
    const b = S.book;
    const r = await rpc('appt_availability', { p_dir: b.dir, p_from: from, p_days: n, p_exclude_conf: b.resched ? b.resched.c : null });
    if (!r.ok) throw new Error(r.message);
    b.interval = r.interval_min;
    r.days.forEach((d) => { const i = b.days.findIndex((x) => x.date === d.date); if (i >= 0) b.days[i] = d; else b.days.push(d); });
    b.loadedTo = addDays(from, n - 1);
  }

  async function vBook() {
    const b = S.book;
    if (!b) { // came from nav: choose direction first
      app().innerHTML = '<div class="page-head"><div><h1>Book an appointment</h1><p>Are you delivering to us or picking up?</p></div></div>' +
        '<div class="dir-pick"><button class="dir-btn" type="button" data-d="IN"><span class="tag">Delivering to us</span><b>Inbound</b><span>Drop off / unload</span></button>' +
        '<button class="dir-btn out" type="button" data-d="OUT"><span class="tag">Picking up from us</span><b>Outbound</b><span>Pick up / load</span></button></div>' + lastLikeHtml();
      $$('.dir-btn').forEach((x) => x.onclick = () => startBook(x.dataset.d));
      const ll = $('#likeLast'); if (ll) ll.onclick = () => { const p = LS.get('profile', {}); startBook(p.last_dir || 'IN'); };
      return;
    }
    app().innerHTML = stepsHtml(1) +
      '<div class="page-head"><div><h1>' + (b.resched ? 'Pick a new time' : 'Pick a time') + '</h1><p><span class="dirtag ' + b.dir + '">' + DIRNAME[b.dir] + '</span> ' +
      (b.resched ? 'Rescheduling ' + esc(b.resched.c) : '<button class="btn btn-sm btn-ghost" type="button" id="swapDir">Switch to ' + (b.dir === 'IN' ? 'outbound' : 'inbound') + '</button>') + '</p></div>' +
      '<button class="btn btn-black" type="button" id="firstAvail">First available</button></div>' +
      '<div class="card"><div class="card-body"><div class="days" id="days"><div class="skel" style="height:80px;width:100%"></div></div>' +
      '<div id="slots"></div><div id="pickSum"></div></div></div>';
    const sw = $('#swapDir'); if (sw) sw.onclick = () => startBook(b.dir === 'IN' ? 'OUT' : 'IN');
    $('#firstAvail').onclick = firstAvailable;
    try {
      if (!b.days.length) await loadDays(S.cfg.today, 14);
      if (!b.date) { const f = b.days.find((d) => d.open_count > 0); b.date = f ? f.date : b.days[0].date; }
      renderDays(); renderSlots();
    } catch (e) { $('#days').innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  function stepsHtml(n) {
    const lbl = S.book && S.book.resched ? ['New time', 'Confirm', 'Done'] : ['Time', 'Details', 'Done'];
    return '<div class="steps">' + lbl.map((l, i) => '<div class="' + (i + 1 === n ? 'on' : i + 1 < n ? 'done' : '') + '">' + (i + 1) + '. ' + l + '</div>').join('') + '</div>';
  }
  function lastLikeHtml() {
    const p = LS.get('profile', null);
    if (!p || !p.carrier_name) return '';
    return '<div class="note" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1">Welcome back, <b>' + esc(p.contact_name || p.carrier_name) + '</b>. Your carrier info will be filled in for you.</div>' +
      '<button class="btn btn-sm btn-red" type="button" id="likeLast">Book like last time (' + esc(DIRNAME[p.last_dir || 'IN']) + ', ' + esc(p.trailer_type || '') + ')</button></div>';
  }
  function renderDays() {
    const b = S.book, max = addDays(S.cfg.today, S.cfg.max_days_ahead);
    $('#days').innerHTML = b.days.map((d) => {
      const dd = pd(d.date), cls = !d.open ? 'closed' : d.open_count ? '' : 'none';
      return '<button type="button" class="day-btn ' + cls + (d.date === b.date ? ' on' : '') + '" data-d="' + d.date + '"' + (!d.open ? ' disabled' : '') + '>' +
        '<div class="dw">' + (d.date === S.cfg.today ? 'Today' : DOW[dd.getDay()]) + '</div><div class="dn">' + dd.getDate() + '</div><div class="dm">' + MON[dd.getMonth()] + '</div>' +
        '<div class="dc">' + (!d.open ? 'Closed' : d.open_count ? d.open_count + ' open' : (d.slots.length && d.slots.every((x) => x.why === 'past')) ? '—' : 'Full') + '</div></button>';
    }).join('') + (b.loadedTo < max ? '<button type="button" class="day-btn" id="moreDays"><div class="dw">More</div><div class="dn">›</div><div class="dm">dates</div></button>' : '');
    $$('.day-btn[data-d]').forEach((x) => x.onclick = () => { b.date = x.dataset.d; b.slot = null; renderDays(); renderSlots(); });
    const m = $('#moreDays');
    if (m) m.onclick = async () => { m.disabled = true; try { await loadDays(addDays(b.loadedTo, 1), 14); renderDays(); $('#days').scrollLeft = 1e6; } catch (e) { toast(e.message, true); } };
    const on = $('.day-btn.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function renderSlots() {
    const b = S.book, d = b.days.find((x) => x.date === b.date);
    const why = { full: 'Booked', blocked: 'Unavailable', too_soon: 'Too soon', past: 'Passed', too_far: '', day_full: 'Day full', break: 'Break' };
    if (!d || !d.open) { $('#slots').innerHTML = '<div class="empty"><div class="e">🚫</div>The dock is closed this day.</div>'; $('#pickSum').innerHTML = ''; return; }
    $('#slots').innerHTML = '<div class="lbl-sm" style="margin-top:16px">' + esc(fmtD(d.date, true)) + ' · ' + b.interval + '-minute appointments</div>' +
      '<div class="slots" style="margin-top:8px">' + d.slots.map((s) => s.ok
        ? '<button type="button" class="slot' + (b.slot && b.slot.start === s.start ? ' on' : '') + '" data-s="' + esc(s.start) + '" data-t="' + s.t + '">' + fmtT(s.t) + '</button>'
        : '<button type="button" class="slot no" disabled>' + fmtT(s.t) + '<small>' + (why[s.why] || 'Unavailable') + '</small></button>').join('') + '</div>' +
      (d.open_count ? '' : '<div class="note warn" style="margin-top:12px">' + (d.slots.some((x) => x.why === 'day_full') ? 'This day is fully booked. Please pick another date.' : 'No open times this day. Try another date.') + '</div>');
    $$('.slot[data-s]').forEach((x) => x.onclick = () => { b.slot = { start: x.dataset.s, t: x.dataset.t, date: b.date }; renderSlots(); });
    renderPickSum();
  }
  function renderPickSum() {
    const b = S.book;
    $('#pickSum').innerHTML = b.slot ? '<div class="pick-summary"><div><div style="font-size:13px;opacity:.85">' + DIRNAME[b.dir] + ' appointment</div><b>' + esc(fmtD(b.slot.date)) + ' · ' + fmtT(b.slot.t) + '</b></div>' +
      '<button class="btn btn-red" type="button" id="toDetails" style="background:#fff;color:var(--red)">' + (b.resched ? 'Confirm new time' : 'Continue') + ' ›</button></div>' : '';
    const t = $('#toDetails');
    if (t) { t.onclick = () => b.resched ? doReschedule() : go('details'); t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  async function firstAvailable() {
    const b = S.book, max = addDays(S.cfg.today, S.cfg.max_days_ahead);
    busy(true, 'Finding the first open time…');
    try {
      let f = b.days.find((d) => d.open_count > 0);
      while (!f && b.loadedTo < max) { await loadDays(addDays(b.loadedTo, 1), 14); f = b.days.find((d) => d.open_count > 0); }
      if (!f) { toast('No open times in the booking window. Please call the office.', true); return; }
      const s = f.slots.find((x) => x.ok);
      b.date = f.date; b.slot = { start: s.start, t: s.t, date: f.date };
      renderDays(); renderSlots();
    } catch (e) { toast(e.message, true); } finally { busy(false); }
  }

  function vDetails() {
    const b = S.book;
    if (!b || !b.slot) return go('book');
    const p = LS.get('profile', {});
    const f = Object.assign({ carrier_name: '', scac: '', contact_name: '', phone: '', email: '', trailer_type: '', ref_no: '', trailer_no: '', notes: '' }, p, b.form || {});
    app().innerHTML = stepsHtml(2) +
      '<div class="pick-summary" style="margin:0 0 16px"><div><div style="font-size:13px;opacity:.85">' + DIRNAME[b.dir] + ' appointment</div><b>' + esc(fmtD(b.slot.date)) + ' · ' + fmtT(b.slot.t) + '</b></div>' +
      '<button class="btn btn-sm btn-ghost" type="button" id="chgTime">Change time</button></div>' +
      (p.carrier_name ? '<div class="note good" style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1">Filled in from your last booking on this device.</div><button class="btn btn-sm btn-ghost" type="button" id="clrProf">Clear</button></div>' : '') +
      '<form id="fDet" class="card" novalidate><div class="card-body">' +
      '<div class="field"><label>Trailer type <span class="req-star">*</span></label><div class="chips" id="trl">' + TRAILERS.map((t) => '<button type="button" class="chip' + (f.trailer_type === t ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div></div>' +
      '<div class="form-grid">' +
      fld('ref_no', 'PO / BOL number', f.ref_no, true, 'class="input big" autocapitalize="characters" autocomplete="off" placeholder="PO or BOL #"', 'full') +
      fld('carrier_name', 'Carrier name', f.carrier_name, true, 'class="input" autocomplete="organization"') +
      fld('scac', 'SCAC or MC #', f.scac, false, 'class="input" autocapitalize="characters" autocomplete="off"') +
      fld('contact_name', 'Your name', f.contact_name, true, 'class="input" autocomplete="name"') +
      fld('phone', 'Phone', f.phone, true, 'class="input" type="tel" inputmode="tel" autocomplete="tel"') +
      fld('email', 'Email (for your confirmation)', f.email, true, 'class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off"', 'full') +
      fld('trailer_no', 'Trailer # (if known)', f.trailer_no, false, 'class="input" autocapitalize="characters" autocomplete="off"') +
      '<div class="field"><label>&nbsp;</label><label class="switch"><input type="checkbox" id="remember" ' + (LS.get('remember', true) ? 'checked' : '') + '> Remember my info on this device</label></div>' +
      '<div class="field full"><label>Notes for the dock (optional)</label><textarea class="input" name="notes" rows="2" maxlength="500" placeholder="Pallet count, special handling, etc.">' + esc(f.notes) + '</textarea></div>' +
      '</div><div id="detErr"></div><button class="btn btn-red btn-block" type="submit" style="padding:15px;font-size:17px">Book appointment</button></div></form>';
    $('#chgTime').onclick = () => { b.form = readForm(); go('book', { keep: true }); };
    const cp = $('#clrProf'); if (cp) cp.onclick = () => { LS.del('profile'); b.form = { ref_no: readForm().ref_no }; vDetails(); };
    $$('#trl .chip').forEach((c) => c.onclick = () => { $$('#trl .chip').forEach((x) => x.classList.remove('on')); c.classList.add('on'); });
    const ph = $('[name=phone]'); ph.addEventListener('input', () => { ph.value = fmtPhone(ph.value); });
    ['ref_no', 'scac', 'trailer_no'].forEach((n) => { const i = $('[name=' + n + ']'); i.addEventListener('input', () => { const p0 = i.selectionStart; i.value = i.value.toUpperCase(); i.setSelectionRange(p0, p0); }); });
    $('#fDet').onsubmit = (e) => { e.preventDefault(); submitBooking(); };
    if (!f.ref_no) setTimeout(() => $('[name=ref_no]').focus(), 50);
  }
  function fld(name, label, val, req, attrs, cls) {
    return '<div class="field' + (cls ? ' ' + cls : '') + '"><label for="f_' + name + '">' + esc(label) + (req ? ' <span class="req-star">*</span>' : '') + '</label>' +
      '<input id="f_' + name + '" name="' + name + '" value="' + esc(val || '') + '" ' + attrs + '></div>';
  }
  function readForm() {
    const o = {};
    $$('#fDet [name]').forEach((i) => { o[i.name] = i.value.trim(); });
    const on = $('#trl .chip.on'); o.trailer_type = on ? on.dataset.t : '';
    return o;
  }
  async function submitBooking() {
    const b = S.book, f = readForm(), err = $('#detErr');
    const miss = [];
    if (!f.trailer_type) miss.push('trailer type');
    if (!f.ref_no) miss.push('PO / BOL');
    if (!f.carrier_name) miss.push('carrier name');
    if (!f.contact_name) miss.push('your name');
    if (f.phone.replace(/\D/g, '').length < 10) miss.push('phone');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) miss.push('email');
    if (miss.length) { err.innerHTML = '<div class="note bad" style="margin-bottom:12px">Please fill in: ' + esc(miss.join(', ')) + '.</div>'; err.scrollIntoView({ block: 'center' }); return; }
    err.innerHTML = '';
    const remember = $('#remember').checked; LS.set('remember', remember);
    busy(true, 'Booking your appointment…');
    try {
      const r = await rpc('appt_book', { p: Object.assign({}, f, { direction: b.dir, start: b.slot.start }) });
      if (!r.ok) {
        if (['full', 'blocked', 'too_soon', 'past'].includes(r.error)) {
          toast(r.message, true); b.form = f; b.slot = null; b.days = []; go('book', { keep: true });
        } else err.innerHTML = '<div class="note bad" style="margin-bottom:12px">' + esc(r.message) + '</div>';
        return;
      }
      if (remember) LS.set('profile', { carrier_name: f.carrier_name, scac: f.scac, contact_name: f.contact_name, phone: f.phone, email: f.email, trailer_type: f.trailer_type, last_dir: b.dir });
      rememberMine(r.appointment, r.token);
      S.lastBooked = { appointment: r.appointment, token: r.token };
      S.book = null;
      go('done');
    } catch (e) { err.innerHTML = '<div class="note bad" style="margin-bottom:12px">' + esc(e.message) + '</div>'; } finally { busy(false); }
  }
  function rememberMine(a, token) {
    const list = LS.get('mine', []).filter((x) => x.c !== a.conf_no);
    list.push({ c: a.conf_no, k: token, date: a.local_date, time: a.local_time, dir: a.direction, ref: a.ref_no });
    LS.set('mine', list.slice(-40));
  }

  function apptDetailsHtml(a) {
    const row = (k, v) => v ? '<div><span class="k">' + esc(k) + '</span><b>' + esc(v) + '</b></div>' : '';
    return '<div class="detail-list">' + row('Type', DIRNAME[a.direction]) + row('PO / BOL', a.ref_no) + row('Trailer', a.trailer_type + (a.trailer_no ? ' · #' + a.trailer_no : '')) +
      row('Carrier', a.carrier_name + (a.scac ? ' (' + a.scac + ')' : '')) + row('Contact', a.contact_name) + row('Phone', a.phone) + row('Email', a.email) +
      row('Door', a.door) + row('Notes', a.notes) + row('Cancel reason', a.status === 'CANCELLED' ? a.cancel_reason : '') + '</div>';
  }
  function vDone() {
    const L = S.lastBooked;
    if (!L) return go('home');
    const a = L.appointment;
    app().innerHTML = stepsHtml(3) + '<div class="confirm"><div class="check">✓</div><h2>' + (L.resched ? 'Appointment moved' : 'You\'re booked') + '</h2>' +
      '<div class="hint">Confirmation number</div><div class="conf-no">' + esc(a.conf_no) + '</div>' +
      '<div class="when">' + DIRNAME[a.direction] + ' · ' + esc(fmtD(a.local_date, true)) + ' at ' + fmtT(a.local_time) + '</div>' +
      '<div class="hint" style="margin-top:6px">A confirmation was sent to <b>' + esc(a.email) + '</b>. Use the link in it to reschedule or cancel.</div>' +
      apptDetailsHtml(a) +
      '<div class="note" style="text-align:left;margin-top:16px"><b>When you arrive:</b> ' + linkPhones(S.cfg.instructions) + '</div>' +
      '<div style="text-align:left;margin-top:14px">' + entryPhoto() + mapEmbed(220) + '</div>' +
      '<div class="btn-row"><button class="btn btn-red" type="button" id="ics">Add to calendar</button>' +
      '<a class="btn btn-ghost" href="' + mapsUrl() + '" target="_blank" rel="noopener">Directions</a>' +
      '<button class="btn btn-ghost" type="button" id="notif">Get notifications</button></div>' +
      '<div class="btn-row"><button class="btn btn-black" type="button" id="another">Book another</button><button class="btn btn-ghost" type="button" id="manage">Manage this appointment</button></div></div>';
    $('#ics').onclick = () => downloadIcs(a);
    $('#notif').onclick = () => enablePush('carrier', a.conf_no, L.token);
    $('#another').onclick = () => startBook(a.direction);
    $('#manage').onclick = () => openManage(a.conf_no, L.token);
  }

  function downloadIcs(a) {
    const st = new Date(a.start_at), en = new Date(st.getTime() + a.slot_minutes * 60000);
    const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Logistics Warehouse//Dock Appointments//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + a.conf_no + '@logisticswarehouse.net', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(st), 'DTEND:' + z(en),
      'SUMMARY:' + e(DIRNAME[a.direction] + ' dock appt ' + a.conf_no + ' – Logistics Warehouse'),
      'LOCATION:' + e(S.cfg.site_address),
      'DESCRIPTION:' + e('Confirmation ' + a.conf_no + '\nPO/BOL ' + a.ref_no + '\nTrailer ' + a.trailer_type + '\n' + S.cfg.instructions),
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Dock appointment in 1 hour', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const l = document.createElement('a'); l.href = url; l.download = 'LWH-' + a.conf_no + '.ics'; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function loadMine(el, limit) {
    const list = LS.get('mine', []);
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="e">📅</div>No appointments saved on this device yet.</div>'; return; }
    try {
      const r = await rpc('appt_mine', { p_items: list.map((x) => ({ c: x.c, k: x.k })) });
      let items = (r.items || []);
      // keep local cache in sync (time may have been moved by LWH)
      LS.set('mine', items.map((i) => ({ c: i.appointment.conf_no, k: i.token, date: i.appointment.local_date, time: i.appointment.local_time, dir: i.appointment.direction, ref: i.appointment.ref_no })));
      const today = ctNow().date;
      const up = items.filter((i) => i.appointment.local_date >= today && i.appointment.status !== 'CANCELLED');
      const past = items.filter((i) => !up.includes(i)).reverse();
      items = limit ? up.slice(0, limit) : up.concat(past.slice(0, 15));
      el.innerHTML = items.length ? items.map(cardHtml).join('') : '<div class="empty"><div class="e">📅</div>No upcoming appointments.</div>';
      $$('.appt-card', el).forEach((c) => c.onclick = () => openManage(c.dataset.c, c.dataset.k));
      renderChrome();
    } catch (e) { el.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  function cardHtml(i) {
    const a = i.appointment;
    return '<div class="appt-card ' + a.direction + ' ' + a.status + '" data-c="' + esc(a.conf_no) + '" data-k="' + esc(i.token) + '" role="button" tabindex="0">' +
      '<div><div class="when">' + esc(fmtD(a.local_date)) + ' · ' + fmtT(a.local_time) + '</div><div class="sub">' + DIRNAME[a.direction] + ' · PO/BOL ' + esc(a.ref_no) + ' · ' + esc(a.carrier_name) + '</div></div>' +
      '<div class="right"><span class="st st-' + a.status + '">' + STATUS[a.status] + '</span><div class="hint" style="margin-top:4px">' + esc(a.conf_no) + '</div></div></div>';
  }
  function vMine() {
    app().innerHTML = '<div class="page-head"><div><h1>My appointments</h1><p>Appointments booked on this device.</p></div><button class="btn btn-ghost" type="button" id="findOther">Find another</button></div><div id="mineList"><div class="skel" style="height:70px"></div></div>';
    $('#findOther').onclick = () => go('find');
    loadMine($('#mineList'));
  }
  function vFind() {
    app().innerHTML = '<div class="page-head"><div><h1>Find an appointment</h1><p>Use the confirmation number from your email.</p></div></div>' +
      '<form class="card" id="fFind" style="max-width:520px"><div class="card-body">' +
      '<div class="field"><label>Confirmation number</label><input class="input big" name="c" autocapitalize="characters" autocomplete="off" placeholder="LW…" required></div>' +
      '<div class="field"><label>Email it was booked with</label><input class="input" name="e" type="email" autocomplete="email" autocapitalize="off" required></div>' +
      '<div id="findErr"></div><button class="btn btn-red btn-block" type="submit">Find appointment</button></div></form>';
    $('#fFind').onsubmit = async (ev) => {
      ev.preventDefault();
      const c = $('[name=c]').value.trim().toUpperCase(), e = $('[name=e]').value.trim();
      busy(true, 'Looking it up…');
      try {
        const r = await rpc('appt_get', { p_conf: c, p_key: e });
        if (!r.ok) { $('#findErr').innerHTML = '<div class="note bad" style="margin-bottom:12px">' + esc(r.message) + '</div>'; return; }
        rememberMine(r.appointment, r.token);
        S.manage = r; go('manage');
      } catch (er) { toast(er.message, true); } finally { busy(false); }
    };
  }
  async function openManage(c, k) {
    busy(true, 'Loading…');
    try {
      const r = await rpc('appt_get', { p_conf: c, p_key: k });
      if (!r.ok) { toast(r.message, true); return go('find'); }
      rememberMine(r.appointment, r.token);
      S.manage = r; go('manage');
    } catch (e) { toast(e.message, true); } finally { busy(false); }
  }
  function vManage() {
    const M = S.manage;
    if (!M) return go('find');
    const a = M.appointment;
    app().innerHTML = '<div class="page-head"><div><h1>Appointment ' + esc(a.conf_no) + '</h1><p><span class="st st-' + a.status + '">' + STATUS[a.status] + '</span></p></div></div>' +
      '<div class="card"><div class="card-body"><div class="when" style="font-family:var(--head);font-size:24px;font-weight:600">' + DIRNAME[a.direction] + ' · ' + esc(fmtD(a.local_date, true)) + ' at ' + fmtT(a.local_time) + '</div>' +
      apptDetailsHtml(a) +
      (M.can_change ? '<div class="btn-row" style="margin-top:18px"><button class="btn btn-red" type="button" id="mRes">Reschedule</button><button class="btn btn-ghost" type="button" id="mCan" style="color:#9E0E26">Cancel appointment</button></div>'
        : (a.status === 'BOOKED' ? '<div class="note warn" style="margin-top:16px">This appointment is too close to change online. Please call the office.</div>' : '')) +
      (a.status !== 'CANCELLED' ? '<div class="btn-row" style="margin-top:10px"><button class="btn btn-ghost" type="button" id="mIcs">Add to calendar</button><a class="btn btn-ghost" href="' + mapsUrl() + '" target="_blank" rel="noopener">Directions</a><button class="btn btn-ghost" type="button" id="mNot">Get notifications</button></div>' : '') +
      (a.status !== 'CANCELLED' ? '<div style="margin-top:16px">' + entryPhoto() + mapEmbed(220) + '</div>' : '') +
      '</div></div>';
    const rs = $('#mRes'); if (rs) rs.onclick = () => startBook(a.direction, { c: a.conf_no, k: M.token });
    const cn = $('#mCan'); if (cn) cn.onclick = () => confirmCancel(a, M.token);
    const ic = $('#mIcs'); if (ic) ic.onclick = () => downloadIcs(a);
    const nt = $('#mNot'); if (nt) nt.onclick = () => enablePush('carrier', a.conf_no, M.token);
  }
  function confirmCancel(a, token) {
    const m = modal('Cancel appointment?', '<p>Cancel <b>' + esc(a.conf_no) + '</b> on ' + esc(fmtD(a.local_date)) + ' at ' + fmtT(a.local_time) + '?</p>' +
      '<div class="field" style="margin-top:12px"><label>Reason (optional)</label><input class="input" id="cReason" maxlength="200" placeholder="Load not ready, truck issue…"></div>',
    '<button class="btn btn-ghost" type="button" id="cKeep">Keep it</button><button class="btn btn-red" type="button" id="cGo">Yes, cancel</button>');
    $('#cKeep', m.el).onclick = m.close;
    $('#cGo', m.el).onclick = async () => {
      busy(true, 'Cancelling…');
      try {
        const r = await rpc('appt_cancel', { p_conf: a.conf_no, p_key: token, p_reason: $('#cReason').value });
        if (!r.ok) { toast(r.message, true); return; }
        m.close(); toast('Appointment cancelled. A confirmation email is on its way.');
        S.manage = { appointment: r.appointment, token, can_change: false }; vManage();
      } catch (e) { toast(e.message, true); } finally { busy(false); }
    };
  }
  async function doReschedule() {
    const b = S.book;
    busy(true, 'Moving your appointment…');
    try {
      const r = await rpc('appt_reschedule', { p_conf: b.resched.c, p_key: b.resched.k, p_start: b.slot.start });
      if (!r.ok) { toast(r.message, true); if (['full', 'blocked', 'too_soon'].includes(r.error)) { b.days = []; b.slot = null; vBook(); } return; }
      rememberMine(r.appointment, r.token);
      S.lastBooked = { appointment: r.appointment, token: r.token, resched: true };
      S.book = null; go('done');
    } catch (e) { toast(e.message, true); } finally { busy(false); }
  }

  // ---------- push notifications ----------
  function b64ToU8(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
  async function enablePush(kind, k1, k2) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      modal('Notifications', isIOS && !standalone()
        ? '<p>On iPhone, notifications work once the app is on your Home Screen.</p><ol style="margin:12px 0 0 20px;line-height:1.8"><li>Tap the <b>Share</b> button in Safari</li><li>Tap <b>Add to Home Screen</b></li><li>Open the app from your Home Screen and tap <b>Get notifications</b> again</li></ol><p class="ios-hint">You\'ll still get every update by email either way.</p>'
        : '<p>This browser does not support notifications. You\'ll still get every update by email.</p>');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Notifications are blocked. You can turn them on in your browser settings.', true); return; }
      busy(true, 'Turning on notifications…');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(S.cfg.vapid_public) });
      const r = await rpc('appt_push_sub', { p_kind: kind, p_key1: k1, p_key2: k2, p_sub: sub.toJSON(), p_ua: navigator.userAgent });
      if (!r.ok) throw new Error(r.message);
      LS.set('push_on_' + kind, true);
      fetch(SB + '/functions/v1/appt-push', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ action: 'test', endpoint: sub.endpoint }) }).catch(() => {});
      toast(kind === 'team' ? 'Notifications on for new bookings, changes and late arrivals.' : 'Notifications on. We\'ll alert you about reminders, door assignment and changes.');
    } catch (e) { toast(e.message || 'Could not turn on notifications.', true); } finally { busy(false); }
  }
  async function disablePush(kind) {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) { await rpc('appt_push_unsub', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      LS.del('push_on_' + kind); toast('Notifications turned off on this device.');
    } catch (e) { toast('Could not turn off notifications.', true); }
  }

  // =====================================================================
  //  LWH TEAM
  // =====================================================================
  function vLogin() {
    app().innerHTML = '<div class="login-wrap"><div class="login-card" style="max-width:420px;margin:20px auto"><div class="card-body" style="padding:26px">' +
      '<h1 style="font-family:var(--head);text-transform:uppercase">LWH Team</h1><p class="sub" style="color:var(--ink-2);margin-bottom:16px">Sign in to the dock board.</p>' +
      '<form id="fLogin"><div class="field"><label>Name</label><input class="input" name="n" autocomplete="username" value="' + esc(LS.get('team_last', '')) + '" required></div>' +
      '<div class="field"><label>PIN</label><input class="input pin" name="p" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" required></div>' +
      '<div id="lErr"></div><button class="btn btn-red btn-block" type="submit">Sign in</button></form>' +
      '<div class="login-foot" style="margin-top:14px;text-align:center"><button class="how" type="button" id="backCarrier" style="background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer">Back to carrier booking</button></div></div></div></div>';
    $('#backCarrier').onclick = () => go('home');
    const n = $('[name=n]'); (n.value ? $('[name=p]') : n).focus();
    $('#fLogin').onsubmit = async (e) => {
      e.preventDefault();
      busy(true, 'Signing in…');
      try {
        const r = await rpc('appt_admin_login', { p_name: n.value.trim(), p_pin: $('[name=p]').value });
        if (!r.ok) { $('#lErr').innerHTML = '<div class="note bad" style="margin-bottom:12px">' + esc(r.message) + '</div>'; return; }
        Object.assign(S.team, { token: r.token, name: r.name, role: r.role });
        LS.set('team_token', r.token); LS.set('team_name', r.name); LS.set('team_role', r.role); LS.set('team_last', r.name);
        go('board');
      } catch (er) { toast(er.message, true); } finally { busy(false); }
    };
  }
  async function teamLogout() {
    try { await rpc('appt_admin_logout', { p_token: S.team.token }); } catch (e) { /* ignore */ }
    S.team.token = null; LS.del('team_token'); LS.del('team_name'); LS.del('team_role');
    go('home');
  }
  async function trpc(fn, args) {
    const r = await rpc(fn, Object.assign({ p_token: S.team.token }, args));
    if (r && r.error === 'signed_out') { S.team.token = null; LS.del('team_token'); toast('Please sign in again.', true); go('login'); throw new Error('signed_out'); }
    return r;
  }
  const canEdit = () => S.team.role === 'admin';

  function weekStart(d) { const x = pd(d); x.setDate(x.getDate() - x.getDay()); return ds(x); }
  async function vBoard() {
    if (!S.team.date) S.team.date = ctNow().date;
    const d = S.team.date;
    app().innerHTML = '<div class="board-ctrl"><button class="btn btn-ghost btn-sm" type="button" id="bPrev">‹</button><div class="date-lbl" id="bLbl">' + esc(fmtD(d, true)) + '</div>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="bNext">›</button><button class="btn btn-ghost btn-sm" type="button" id="bToday">Today</button>' +
      '<input class="input" type="date" id="bDate" value="' + d + '" style="width:auto;padding:7px 10px">' +
      '<span style="flex:1"></span><label class="switch"><input type="checkbox" id="bCan" ' + (S.team.showCancelled ? 'checked' : '') + '> Show cancelled</label>' +
      (canEdit() ? '<button class="btn btn-red btn-sm" type="button" id="bBook">+ Book</button>' : '') + '</div>' +
      '<div class="week" id="week"></div><div class="tiles" id="tiles"></div><div id="lanes"><div class="skel" style="height:300px"></div></div>';
    const move = (n) => { S.team.date = addDays(S.team.date, n); vBoard(); };
    $('#bPrev').onclick = () => move(-1); $('#bNext').onclick = () => move(1);
    $('#bToday').onclick = () => { S.team.date = ctNow().date; vBoard(); };
    $('#bDate').onchange = (e) => { if (e.target.value) { S.team.date = e.target.value; vBoard(); } };
    $('#bCan').onchange = (e) => { S.team.showCancelled = e.target.checked; renderBoard(); };
    const bb = $('#bBook'); if (bb) bb.onclick = () => teamBookModal({ date: S.team.date });
    await refreshBoard();
    S.team.timer = setInterval(() => { if (document.visibilityState === 'visible' && !$('#modalHost').innerHTML) refreshBoard(true); }, 30000);
  }
  async function refreshBoard(quiet) {
    const ws = weekStart(S.team.date);
    try {
      const r = await trpc('appt_admin_board', { p_from: ws, p_to: addDays(ws, 6) });
      if (!r.ok) { toast(r.message, true); return; }
      S.team.data = r; S.team.role = r.me.role; LS.set('team_role', r.me.role);
      renderBoard();
    } catch (e) { if (!quiet && e.message !== 'signed_out') $('#lanes').innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  function renderBoard() {
    const R = S.team.data, d = S.team.date, ws = weekStart(d), today = ctNow().date;
    if (!R || !$('#lanes')) return;
    const st = R.settings, iv = st.interval_min;
    const all = R.appointments;
    // week strip
    $('#week').innerHTML = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const dd = addDays(ws, i), live = all.filter((a) => a.local_date === dd && a.status !== 'CANCELLED');
      const ni = live.filter((a) => a.direction === 'IN').length, no = live.length - ni;
      return '<button type="button" data-d="' + dd + '" class="' + (dd === d ? 'on ' : '') + (dd === today ? 'today' : '') + '"><div class="wd">' + DOW[i] + '</div><div class="wn">' + pd(dd).getDate() + '</div>' +
        '<div class="wc"><i class="ci">' + ni + ' in</i> · <i class="co">' + no + ' out</i></div></button>';
    }).join('');
    $$('#week button').forEach((b) => b.onclick = () => { S.team.date = b.dataset.d; $('#bLbl').textContent = fmtD(S.team.date, true); $('#bDate').value = S.team.date; renderBoard(); });

    const day = all.filter((a) => a.local_date === d);
    const live = day.filter((a) => a.status !== 'CANCELLED');
    const cnt = (f) => live.filter(f).length;
    $('#tiles').innerHTML =
      tile('Inbound', cnt((a) => a.direction === 'IN') + (st.daily_max_in ? '<small style="font-size:.5em;color:var(--muted)"> / ' + st.daily_max_in + '</small>' : ''), cnt((a) => a.direction === 'IN' && a.status === 'DONE') + ' done') +
      tile('Outbound', cnt((a) => a.direction === 'OUT') + (st.daily_max_out ? '<small style="font-size:.5em;color:var(--muted)"> / ' + st.daily_max_out + '</small>' : ''), cnt((a) => a.direction === 'OUT' && a.status === 'DONE') + ' done') +
      tile('On site', cnt((a) => a.status === 'ARRIVED' || a.status === 'AT_DOOR'), cnt((a) => a.status === 'AT_DOOR') + ' at a door', 'amber') +
      tile('No-shows', cnt((a) => a.status === 'NO_SHOW'), day.filter((a) => a.status === 'CANCELLED').length + ' cancelled', 'dark');

    const h = st.hours.find((x) => x.dow === pd(d).getDay());
    const blocks = R.blocks.filter((b) => b.date === d);
    const shown = S.team.showCancelled ? day : live;
    const times = (h && h.is_open) ? daySlots(st, h) : [];
    const brks = (st.breaks || []).map((b) => ({ s: toMin(b.start), e: toMin(b.end), label: b.label || 'Break' }));
    // appointments outside the grid (old interval / forced / weekend) still get a row
    shown.forEach((a) => { const m = toMin(a.local_time); if (!times.some((t) => m >= t && m < t + iv)) times.push(m); });
    times.sort((x, y) => x - y);
    if (!times.length) {
      $('#lanes').innerHTML = '<div class="empty"><div class="e">🚫</div>The dock is closed this day.' + (canEdit() ? ' Change hours in Settings, or book with an override.' : '') + '</div>' + blockListHtml(blocks);
      return;
    }
    const now = ctNow(), nowRow = d === now.date ? times.filter((t) => t <= now.min).pop() : null;
    const blocked = (dir, m) => blocks.find((b) => (b.direction === 'ALL' || b.direction === dir) && (!b.start || (m < toMin(b.end) && m + iv > toMin(b.start))));
    const cell = (dir, m) => {
      const here = shown.filter((a) => a.direction === dir && toMin(a.local_time) >= m && toMin(a.local_time) < m + iv);
      const blk = blocked(dir, m), cap = dir === 'IN' ? st.cap_in : st.cap_out;
      const free = cap - here.filter((a) => a.status !== 'CANCELLED').length;
      return '<div class="cell' + (blk ? ' blocked' : '') + '">' + (blk ? '<div class="blk">⛔ ' + esc(blk.reason || 'Blocked') + '</div>' : '') +
        here.map((a) => bkHtml(a, d, now)).join('') +
        (!blk && free > 0 && canEdit() ? '<button type="button" class="open-slot" data-dir="' + dir + '" data-t="' + fromMin(m) + '">+ Open' + (free > 1 ? ' (' + free + ')' : '') + '</button>' : '') + '</div>';
    };
    $('#lanes').innerHTML = '<div class="lanes"><div class="lh">Time</div><div class="lh in">Inbound</div><div class="lh out">Outbound</div>' +
      rowsWithBreaks(times, brks, h).map((r) => r.brk
        ? '<div class="tm brk">' + fmtT(fromMin(r.brk.s)).replace(' ', '&nbsp;') + '</div><div class="cell brk-row" style="grid-column:span 2">' + esc(r.brk.label) + ' · ' + fmtT(fromMin(r.brk.s)) + ' – ' + fmtT(fromMin(r.brk.e)) + '</div>'
        : '<div class="tm' + (r.m === nowRow ? ' now' : '') + '">' + fmtT(fromMin(r.m)).replace(' ', '&nbsp;') + '</div>' + cell('IN', r.m) + cell('OUT', r.m)).join('') + '</div>' + blockListHtml(blocks);
    $$('#lanes .bk').forEach((b) => b.onclick = () => apptModal(Number(b.dataset.id)));
    $$('#lanes .open-slot').forEach((b) => b.onclick = () => teamBookModal({ date: d, dir: b.dataset.dir, t: b.dataset.t }));
    $$('#lanes [data-unblock]').forEach((b) => b.onclick = () => delBlock(Number(b.dataset.unblock)));
  }
  // slot grid for a day: a break splits the day and the grid restarts when it ends (matches appt_day_slots in Supabase)
  function daySlots(st, h) {
    const iv = st.interval_min, br = (st.breaks || []).map((b) => [toMin(b.start), toMin(b.end)]), out = [];
    let t = toMin(h.open), n = 0;
    const close = toMin(h.close);
    while (t + iv <= close && n++ < 300) {
      const b = br.find((x) => t < x[1] && t + iv > x[0] && x[1] > t);
      if (b) { t = b[1]; continue; }
      out.push(t); t += iv;
    }
    return out;
  }
  function rowsWithBreaks(times, brks, h) {
    const rows = times.map((m) => ({ m }));
    if (h && h.is_open) brks.filter((b) => b.s >= toMin(h.open) && b.s < toMin(h.close)).forEach((b) => rows.push({ m: b.s - 0.5, brk: b }));
    return rows.sort((a, b) => a.m - b.m);
  }
  function tile(k, v, h, cls) { return '<div class="tile ' + (cls || '') + '"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div><div class="h">' + esc(h) + '</div></div>'; }
  function blockListHtml(blocks) {
    if (!blocks.length) return '';
    return '<div class="card" style="margin-top:16px"><div class="card-head"><h2>Blocked time this day</h2></div><div class="card-body flush">' + blocks.map((b) =>
      '<div class="list-row"><div class="grow"><div class="t">' + (b.start ? fmtT(b.start) + ' – ' + fmtT(b.end) : 'All day') + ' · ' + (b.direction === 'ALL' ? 'Both' : DIRNAME[b.direction]) + '</div><div class="s">' + esc(b.reason || '') + ' · by ' + esc(b.created_by || '') + '</div></div>' +
      (canEdit() ? '<button class="btn btn-ghost btn-sm" type="button" data-unblock="' + b.id + '">Remove</button>' : '') + '</div>').join('') + '</div></div>';
  }
  function bkHtml(a, d, now) {
    const late = a.status === 'BOOKED' && d === now.date && now.min > toMin(a.local_time) + 30;
    return '<button type="button" class="bk ' + a.direction + ' ' + a.status + (late ? ' late' : '') + '" data-id="' + a.id + '">' +
      '<div class="c">' + esc(a.carrier_name) + '</div><div class="r">' + esc(a.ref_no) + ' · ' + esc(a.trailer_type) + (a.local_time.slice(3) !== '00' && a.local_time.slice(3) !== '30' ? ' · ' + fmtT(a.local_time) : '') + '</div>' +
      '<div class="m"><span class="st st-' + (late ? 'LATE' : a.status) + '">' + (late ? 'Late' : STATUS[a.status]) + '</span>' + (a.door ? '<span class="door">Door ' + esc(a.door) + '</span>' : '') + '</div></button>';
  }

  function findAppt(id) { return (S.team.data && S.team.data.appointments.find((a) => a.id === id)) || (S.team.search || []).find((a) => a.id === id); }
  function doorOptions(dir, cur) {
    const st = S.team.data ? S.team.data.settings : null;
    const list = st ? String(dir === 'IN' ? st.doors_in : st.doors_out).split(',').map((x) => x.trim()).filter(Boolean) : [];
    return '<option value="">—</option>' + list.map((x) => '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + (cur && !list.includes(cur) ? '<option selected>' + esc(cur) + '</option>' : '');
  }
  async function apptModal(id) {
    const a = findAppt(id);
    if (!a) return;
    const ed = canEdit();
    const tel = a.phone ? '<a href="tel:' + esc(a.phone.replace(/[^\d+]/g, '')) + '">' + esc(a.phone) + '</a>' : '';
    const m = modal(a.conf_no + ' · ' + DIRNAME[a.direction],
      '<div style="font-family:var(--head);font-size:22px;font-weight:600">' + esc(fmtD(a.local_date, true)) + ' · ' + fmtT(a.local_time) + '</div>' +
      '<div style="margin:6px 0 10px"><span class="st st-' + a.status + '">' + STATUS[a.status] + '</span> <span class="hint">Booked by ' + esc(a.booked_by === 'carrier' ? 'carrier online' : a.booked_by) + (a.reschedule_count ? ' · moved ' + a.reschedule_count + '×' : '') + '</span></div>' +
      '<dl class="kv"><dt>Carrier</dt><dd>' + esc(a.carrier_name) + (a.scac ? ' (' + esc(a.scac) + ')' : '') + '</dd><dt>PO / BOL</dt><dd><b>' + esc(a.ref_no) + '</b></dd><dt>Trailer</dt><dd>' + esc(a.trailer_type) + '</dd>' +
      '<dt>Contact</dt><dd>' + esc(a.contact_name) + (tel ? ' · ' + tel : '') + '</dd>' + (a.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a></dd>' : '') +
      (a.notes ? '<dt>Carrier notes</dt><dd>' + esc(a.notes) + '</dd>' : '') + (a.cancel_reason && a.status === 'CANCELLED' ? '<dt>Cancel reason</dt><dd>' + esc(a.cancel_reason) + '</dd>' : '') +
      (a.arrived_at ? '<dt>Checked in</dt><dd>' + esc(fmtStamp(a.arrived_at)) + '</dd>' : '') + (a.done_at ? '<dt>Done</dt><dd>' + esc(fmtStamp(a.done_at)) + '</dd>' : '') + '</dl>' +
      (ed ? '<div class="row-2" style="margin-top:14px"><div class="field"><label>Door</label><select class="input" id="mDoor">' + doorOptions(a.direction, a.door) + '</select></div>' +
        '<div class="field"><label>Trailer #</label><input class="input" id="mTrl" value="' + esc(a.trailer_no) + '" autocapitalize="characters"></div></div>' +
        '<div class="field"><label>Team notes (not shown to carrier)</label><textarea class="input" id="mNotes" rows="2">' + esc(a.team_notes || '') + '</textarea></div>' +
        '<div class="lbl-sm">Update status</div><div class="status-btns">' +
        (a.status === 'BOOKED' || a.status === 'NO_SHOW' ? '<button class="btn btn-black" data-s="ARRIVED" type="button">Checked in</button>' : '') +
        (['BOOKED', 'ARRIVED'].includes(a.status) ? '<button class="btn btn-red" data-s="AT_DOOR" type="button">At door</button>' : '') +
        (['ARRIVED', 'AT_DOOR'].includes(a.status) ? '<button class="btn btn-green" data-s="DONE" type="button">Done</button>' : '') +
        (a.status === 'BOOKED' ? '<button class="btn btn-ghost" data-s="NO_SHOW" type="button">No-show</button>' : '') +
        (a.status !== 'BOOKED' && a.status !== 'CANCELLED' ? '<button class="btn btn-ghost" data-s="BOOKED" type="button">Back to booked</button>' : '') +
        (a.status !== 'CANCELLED' && a.status !== 'DONE' ? '<button class="btn btn-ghost" data-s="CANCELLED" type="button" style="color:#9E0E26">Cancel</button>' : '') + '</div>' : '') +
      '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" type="button" id="mHist">Show history &amp; emails</button><div id="histBox" class="hist"></div></div>',
    ed ? '<button class="btn btn-ghost" type="button" id="mMove">Reschedule</button><button class="btn btn-black" type="button" id="mSave">Save</button>' : '', true);
    const save = async (extra) => {
      const p = Object.assign({ door: $('#mDoor').value, team_notes: $('#mNotes').value, trailer_no: $('#mTrl').value }, extra || {});
      if (p.status === 'AT_DOOR' && !p.door) { toast('Pick a door first.', true); $('#mDoor').focus(); return; }
      if (p.status === 'CANCELLED') { const why = prompt('Reason for cancelling (the carrier will see this):', 'Cancelled by LWH'); if (why === null) return; p.reason = why; }
      busy(true, 'Saving…');
      try {
        const r = await trpc('appt_admin_update', { p_id: a.id, p });
        if (!r.ok) { toast(r.message, true); return; }
        m.close(); toast(p.status ? 'Marked ' + STATUS[p.status].toLowerCase() + '.' : 'Saved.'); await refreshBoard(true);
      } catch (e) { if (e.message !== 'signed_out') toast(e.message, true); } finally { busy(false); }
    };
    if (ed) {
      $$('.status-btns [data-s]', m.el).forEach((b) => b.onclick = () => save({ status: b.dataset.s }));
      $('#mSave', m.el).onclick = () => save();
      $('#mMove', m.el).onclick = () => { m.close(); teamMoveModal(a); };
    }
    $('#mHist', m.el).onclick = async () => {
      const r = await trpc('appt_admin_history', { p_id: a.id });
      $('#histBox').innerHTML = (r.items || []).map((h) => '<div><b>' + esc(h.action) + '</b> by ' + esc(h.actor) + ' <span class="w">' + esc(fmtStamp(h.at)) + '</span></div>').join('') +
        (r.emails || []).map((e) => '<div>✉ ' + esc(e.kind) + ' → ' + esc(e.to) + ' <span class="w">' + (e.sent_at ? 'sent ' + esc(fmtStamp(e.sent_at)) : e.error ? 'error: ' + esc(e.error) : 'queued') + '</span></div>').join('');
    };
  }

  async function slotSelect(dir, date, cur, excludeConf) {
    const r = await rpc('appt_availability', { p_dir: dir, p_from: date, p_days: 1, p_exclude_conf: excludeConf || null, p_admin_token: S.team.token });
    const d = r.days && r.days[0];
    if (!d || !d.open || !d.slots.length) return '<option value="">Dock closed this day</option>';
    const why = { full: 'FULL', blocked: 'BLOCKED', past: 'PAST', day_full: 'DAY FULL' };
    return d.slots.map((s) => '<option value="' + esc(s.start) + '"' + (s.t === cur ? ' selected' : '') + '>' + fmtT(s.t) + (s.ok ? '' : ' — ' + (why[s.why] || s.why)) + '</option>').join('');
  }
  async function teamMoveModal(a) {
    const m = modal('Reschedule ' + a.conf_no, '<div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="tvDate" value="' + a.local_date + '"></div>' +
      '<div class="field"><label>Time</label><select class="input" id="tvTime"><option>Loading…</option></select></div></div>' +
      '<label class="switch"><input type="checkbox" id="tvForce"> Override (allow full or blocked times)</label><p class="hint" style="margin-top:10px">The carrier gets an email with the new time.</p>',
    '<button class="btn btn-ghost" type="button" id="tvX">Close</button><button class="btn btn-red" type="button" id="tvGo">Move appointment</button>');
    const load = async () => { $('#tvTime').innerHTML = await slotSelect(a.direction, $('#tvDate').value, a.local_time, a.conf_no); };
    $('#tvDate').onchange = load; await load();
    $('#tvX', m.el).onclick = m.close;
    $('#tvGo', m.el).onclick = async () => {
      if (!$('#tvTime').value) return;
      busy(true, 'Moving…');
      try {
        const r = await trpc('appt_admin_update', { p_id: a.id, p: { start: $('#tvTime').value }, p_force: $('#tvForce').checked });
        if (!r.ok) { toast(r.message + (['full', 'blocked'].includes(r.error) ? ' Tick Override to book anyway.' : ''), true); return; }
        m.close(); toast('Moved. The carrier will get an email.'); await refreshBoard(true);
      } catch (e) { if (e.message !== 'signed_out') toast(e.message, true); } finally { busy(false); }
    };
  }
  async function teamBookModal(o) {
    if (!canEdit()) { toast('View-only users cannot book.', true); return; }
    const date = o.date || S.team.date || ctNow().date, dir = o.dir || 'IN';
    const m = modal('Book for a carrier',
      '<div class="seg" id="tbDir" style="margin-bottom:14px"><button type="button" data-d="IN" class="' + (dir === 'IN' ? 'on' : '') + '">Inbound</button><button type="button" data-d="OUT" class="' + (dir === 'OUT' ? 'on' : '') + '">Outbound</button></div>' +
      '<div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="tbDate" value="' + date + '"></div><div class="field"><label>Time</label><select class="input" id="tbTime"></select></div></div>' +
      '<div class="row-2"><div class="field"><label>PO / BOL *</label><input class="input" id="tb_ref_no" autocapitalize="characters"></div>' +
      '<div class="field"><label>Trailer type *</label><select class="input" id="tb_trailer_type"><option value="">—</option>' + TRAILERS.map((t) => '<option>' + esc(t) + '</option>').join('') + '</select></div></div>' +
      '<div class="row-2"><div class="field"><label>Carrier *</label><input class="input" id="tb_carrier_name"></div><div class="field"><label>SCAC / MC</label><input class="input" id="tb_scac" autocapitalize="characters"></div></div>' +
      '<div class="row-2"><div class="field"><label>Contact</label><input class="input" id="tb_contact_name"></div><div class="field"><label>Phone</label><input class="input" id="tb_phone" type="tel"></div></div>' +
      '<div class="field"><label>Carrier email (gets the confirmation)</label><input class="input" id="tb_email" type="email" autocapitalize="off"></div>' +
      '<div class="field"><label>Team notes</label><input class="input" id="tb_team_notes"></div>' +
      '<label class="switch"><input type="checkbox" id="tbForce"> Override (allow full, blocked or short-notice times)</label>',
    '<button class="btn btn-ghost" type="button" id="tbX">Close</button><button class="btn btn-red" type="button" id="tbGo">Book</button>', true);
    let d0 = dir;
    const load = async () => { $('#tbTime').innerHTML = await slotSelect(d0, $('#tbDate').value, o.t); };
    $$('#tbDir button').forEach((b) => b.onclick = () => { d0 = b.dataset.d; $$('#tbDir button').forEach((x) => x.classList.toggle('on', x === b)); load(); });
    $('#tbDate').onchange = load; load();
    $('#tb_phone').addEventListener('input', (e) => { e.target.value = fmtPhone(e.target.value); });
    $('#tbX', m.el).onclick = m.close;
    $('#tbGo', m.el).onclick = async () => {
      const p = { direction: d0, start: $('#tbTime').value };
      ['ref_no', 'trailer_type', 'carrier_name', 'scac', 'contact_name', 'phone', 'email', 'team_notes'].forEach((k) => { p[k] = $('#tb_' + k).value.trim(); });
      if (!p.start || !p.ref_no || !p.trailer_type || !p.carrier_name) { toast('Time, PO/BOL, trailer type and carrier are required.', true); return; }
      busy(true, 'Booking…');
      try {
        const r = await trpc('appt_admin_book', { p, p_force: $('#tbForce').checked });
        if (!r.ok) { toast(r.message + (['full', 'blocked', 'too_soon'].includes(r.error) ? ' Tick Override to book anyway.' : ''), true); return; }
        m.close(); toast('Booked ' + r.appointment.conf_no + (p.email ? '. Confirmation emailed.' : '.'));
        S.team.date = r.appointment.local_date; if (S.view === 'board') await refreshBoard(); else go('board');
      } catch (e) { if (e.message !== 'signed_out') toast(e.message, true); } finally { busy(false); }
    };
  }

  function vSearch() {
    app().innerHTML = '<div class="page-head"><div><h1>Search</h1><p>Confirmation #, PO/BOL, carrier, SCAC, email or trailer #.</p></div></div>' +
      '<input class="input big" id="sq" placeholder="Search…" autocomplete="off" style="margin-bottom:14px"><div class="card"><div class="card-body flush" id="sres"><div class="empty">Type at least 2 characters.</div></div></div>';
    let t;
    $('#sq').oninput = (e) => { clearTimeout(t); t = setTimeout(async () => {
      try {
        const r = await trpc('appt_admin_search', { p_q: e.target.value });
        S.team.search = r.items || [];
        $('#sres').innerHTML = S.team.search.length ? S.team.search.map((a) => '<div class="list-row" style="cursor:pointer" data-id="' + a.id + '"><div class="grow"><div class="t">' + esc(a.conf_no) + ' · ' + esc(a.carrier_name) + '</div>' +
          '<div class="s">' + DIRNAME[a.direction] + ' · ' + esc(fmtD(a.local_date)) + ' ' + fmtT(a.local_time) + ' · PO/BOL ' + esc(a.ref_no) + '</div></div><span class="st st-' + a.status + '">' + STATUS[a.status] + '</span></div>').join('')
          : '<div class="empty">No matches.</div>';
        $$('#sres [data-id]').forEach((x) => x.onclick = () => apptModal(Number(x.dataset.id)));
      } catch (er) { /* handled */ }
    }, 250); };
    $('#sq').focus();
  }

  async function vBlocks() {
    const today = ctNow().date;
    app().innerHTML = '<div class="page-head"><div><h1>Block time</h1><p>Training, inventory, holidays — blocked times can\'t be booked.</p></div></div>' +
      (canEdit() ? '<form class="card" id="fBlk"><div class="card-head"><h2>Add a block</h2></div><div class="card-body">' +
      '<div class="row-2"><div class="field"><label>From date</label><input class="input" type="date" name="date" value="' + today + '" required></div><div class="field"><label>To date (optional)</label><input class="input" type="date" name="date_to"></div></div>' +
      '<label class="switch" style="margin-bottom:12px"><input type="checkbox" id="allDay"> All day</label>' +
      '<div class="row-2" id="blkTimes"><div class="field"><label>Start</label><input class="input" type="time" name="start" value="13:00" step="300"></div><div class="field"><label>End</label><input class="input" type="time" name="end" value="14:00" step="300"></div></div>' +
      '<div class="row-2"><div class="field"><label>Applies to</label><select class="input" name="direction"><option value="ALL">Inbound and outbound</option><option value="IN">Inbound only</option><option value="OUT">Outbound only</option></select></div>' +
      '<div class="field"><label>Reason</label><input class="input" name="reason" placeholder="Safety training" maxlength="120"></div></div>' +
      '<button class="btn btn-red" type="submit">Add block</button></div></form>' : '') +
      '<div class="card"><div class="card-head"><h2>Upcoming blocks</h2></div><div class="card-body flush" id="blkList"><div class="skel" style="height:50px"></div></div></div>';
    const f = $('#fBlk');
    if (f) {
      $('#allDay').onchange = (e) => { $('#blkTimes').hidden = e.target.checked; };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const p = Object.fromEntries(new FormData(f).entries());
        if ($('#allDay').checked) { p.start = ''; p.end = ''; }
        busy(true, 'Saving…');
        try {
          const r = await trpc('appt_admin_block_add', { p });
          if (!r.ok) { toast(r.message, true); return; }
          toast('Blocked ' + r.added + ' day' + (r.added > 1 ? 's' : '') + '.');
          if (r.conflicts) modal('Heads up', '<p><b>' + r.conflicts + '</b> booked appointment' + (r.conflicts > 1 ? 's fall' : ' falls') + ' inside this block. They were not moved — open them on the Dock Board to reschedule.</p>');
          vBlocks();
        } catch (er) { if (er.message !== 'signed_out') toast(er.message, true); } finally { busy(false); }
      };
    }
    try {
      const r = await trpc('appt_admin_board', { p_from: today, p_to: addDays(today, 60) });
      const bl = r.blocks || [];
      $('#blkList').innerHTML = bl.length ? bl.map((b) => '<div class="list-row"><div class="grow"><div class="t">' + esc(fmtD(b.date)) + ' · ' + (b.start ? fmtT(b.start) + ' – ' + fmtT(b.end) : 'All day') + '</div>' +
        '<div class="s">' + (b.direction === 'ALL' ? 'Inbound and outbound' : DIRNAME[b.direction] + ' only') + ' · ' + esc(b.reason || 'No reason') + ' · by ' + esc(b.created_by || '') + '</div></div>' +
        (canEdit() ? '<button class="btn btn-ghost btn-sm" type="button" data-unblock="' + b.id + '">Remove</button>' : '') + '</div>').join('') : '<div class="empty">No blocks in the next 60 days.</div>';
      $$('#blkList [data-unblock]').forEach((b) => b.onclick = () => delBlock(Number(b.dataset.unblock)));
    } catch (e) { /* handled */ }
  }
  async function delBlock(id) {
    if (!confirm('Remove this block? Those times become bookable again.')) return;
    const r = await trpc('appt_admin_block_del', { p_id: id });
    if (r.ok) { toast('Block removed.'); if (S.view === 'blocks') vBlocks(); else refreshBoard(true); }
  }

  async function vSettings() {
    app().innerHTML = '<div class="empty"><div class="spin dark"></div></div>';
    const today = ctNow().date;
    let R, U;
    try { R = await trpc('appt_admin_board', { p_from: today, p_to: today }); U = await trpc('appt_admin_users', { p_action: 'list' }); } catch (e) { return; }
    const s = R.settings, ed = canEdit(), dis = ed ? '' : ' disabled';
    const num = (n, l, v, h, min, max) => '<div class="field"><label>' + l + '</label><input class="input" type="number" name="' + n + '" value="' + v + '" min="' + min + '" max="' + max + '"' + dis + '>' + (h ? '<div class="hint">' + h + '</div>' : '') + '</div>';
    app().innerHTML = '<div class="page-head"><div><h1>Settings</h1><p>' + (s.updated_by ? 'Last changed by ' + esc(s.updated_by) + ' · ' + esc(fmtStamp(s.updated_at)) : '') + '</p></div></div>' +
      '<form id="fSet"><div class="grid grid-2">' +
      '<div class="card"><div class="card-head"><h2>Appointment slots</h2></div><div class="card-body">' +
      '<div class="field"><label>Appointment length</label><div class="seg" id="ivSeg">' + [15, 20, 30, 60].map((v) => '<button type="button" data-v="' + v + '" class="' + (s.interval_min === v ? 'on' : '') + '"' + dis + '>' + v + ' min</button>').join('') + '</div>' +
      '<div class="hint">30 = on the hour and half hour · 20 = three per hour · 15 = four per hour. Existing appointments keep their times.</div></div>' +
      '<div class="row-2">' + num('cap_in', 'Inbound trucks per slot', s.cap_in, 'Doors in use at once', 0, 20) + num('cap_out', 'Outbound trucks per slot', s.cap_out, '', 0, 20) + '</div>' +
      '<div class="row-2">' + num('lead_hours', 'Minimum notice (hours)', s.lead_hours, 'How soon carriers can book', 0, 168) + num('change_cutoff_hours', 'Change cutoff (hours)', s.change_cutoff_hours, 'No online changes inside this', 0, 168) + '</div>' +
      '<div class="row-2">' + num('daily_max_in', 'Max inbound per day', s.daily_max_in, '0 = no daily limit', 0, 500) + num('daily_max_out', 'Max outbound per day', s.daily_max_out, '0 = no daily limit', 0, 500) + '</div>' +
      num('daily_max_total', 'Max total per day (in + out)', s.daily_max_total, '0 = no limit. Use if one crew works both.', 0, 1000) +
      '<div class="field"><label>Daily breaks (no appointments)</label><input class="input" name="breaks_txt" value="' + esc((s.breaks || []).map((b) => b.start + '-' + b.end + (b.label ? ' ' + b.label : '')).join(', ')) + '" placeholder="11:00-11:30 Lunch"' + dis + '>' +
      '<div class="hint">Every open day, both directions. Separate several with commas, e.g. 11:00-11:30 Lunch, 14:00-14:15 Break. Times restart right after a break.</div></div>' +
      num('max_days_ahead', 'Book up to (days ahead)', s.max_days_ahead, '', 1, 180) +
      '<div class="row-2"><div class="field"><label>Inbound doors</label><input class="input" name="doors_in" value="' + esc(s.doors_in) + '"' + dis + '></div><div class="field"><label>Outbound doors</label><input class="input" name="doors_out" value="' + esc(s.doors_out) + '"' + dis + '></div></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><h2>Dock hours</h2></div><div class="card-body">' + s.hours.map((h) =>
        '<div class="hours-row" data-dow="' + h.dow + '"><b>' + DOW[h.dow] + '</b><label class="switch"><input type="checkbox" class="hOpen" ' + (h.is_open ? 'checked' : '') + dis + '> Open</label>' +
        '<input class="input hFrom" type="time" value="' + h.open + '" step="900"' + dis + '><input class="input hTo" type="time" value="' + h.close + '" step="900"' + dis + '></div>').join('') +
      '<div class="hint" style="margin-top:8px">Close is when the last appointment must end (4:00 PM close = last 30-min slot at 3:30).</div></div></div>' +
      '<div class="card"><div class="card-head"><h2>Email</h2></div><div class="card-body">' +
      '<div class="field"><label>LWH team emails</label><textarea class="input" name="team_emails" rows="2"' + dis + '>' + esc(s.team_emails) + '</textarea><div class="hint">Separate with commas. New bookings, changes, cancels and the 6 AM schedule.</div></div>' +
      '<div class="field"><label>ArcBest emails</label><textarea class="input" name="customer_emails" rows="2"' + dis + '>' + esc(s.customer_emails) + '</textarea><div class="hint">Optional. Get the same team emails.</div></div></div></div>' +
      '<div class="card"><div class="card-head"><h2>Carrier info</h2></div><div class="card-body">' +
      '<div class="field"><label>Site address</label><input class="input" name="site_address" value="' + esc(s.site_address) + '"' + dis + '></div>' +
      '<div class="row-2"><div class="field"><label>Map pin latitude</label><input class="input" name="site_lat" value="' + esc(s.site_lat) + '"' + dis + '></div>' +
      '<div class="field"><label>Map pin longitude</label><input class="input" name="site_lng" value="' + esc(s.site_lng) + '"' + dis + '></div></div>' +
      '<div class="hint" style="margin:-6px 0 12px">Where map and directions links point. In Google Maps, right-click the dock entrance to copy its coordinates.</div>' +
            '<div class="field"><label>Arrival instructions</label><textarea class="input" name="instructions" rows="3"' + dis + '>' + esc(s.instructions) + '</textarea></div>' +
      '<div class="field"><label>App link (used in emails)</label><input class="input" name="app_url" value="' + esc(s.app_url) + '"' + dis + '></div></div></div>' +
      '</div>' + (ed ? '<button class="btn btn-red" type="submit" style="margin-bottom:20px">Save settings</button>' : '') + '</form>' +
      '<div class="grid grid-2"><div class="card"><div class="card-head"><h2>Team users</h2></div><div class="card-body flush" id="uList"></div>' +
      (ed ? '<div class="card-body"><div class="row-2"><div class="field"><label>Name</label><input class="input" id="uN"></div><div class="field"><label>PIN (4–8 digits)</label><input class="input" id="uP" inputmode="numeric" maxlength="8"></div></div>' +
        '<div class="row-2"><div class="field"><label>Email</label><input class="input" id="uE" type="email"></div><div class="field"><label>Access</label><select class="input" id="uR"><option value="admin">Full</option><option value="viewer">View only</option></select></div></div>' +
        '<button class="btn btn-black btn-sm" type="button" id="uAdd">Add / update user</button></div>' : '') + '</div>' +
      '<div class="card"><div class="card-head"><h2>This device</h2></div><div class="card-body">' +
      '<div class="field"><label>Notifications</label><div class="btn-row"><button class="btn btn-red btn-sm" type="button" id="pOn">Turn on</button><button class="btn btn-ghost btn-sm" type="button" id="pOff">Turn off</button></div>' +
      '<div class="hint">New bookings, reschedules, cancels and late arrivals.' + (isIOS && !standalone() ? ' On iPhone, add this app to your Home Screen first.' : '') + '</div></div>' +
      '<div class="field"><label>Change my PIN</label><div style="display:flex;gap:8px"><input class="input" id="myPin" inputmode="numeric" maxlength="8" placeholder="New PIN"><button class="btn btn-black btn-sm" type="button" id="myPinGo">Save</button></div></div>' +
      '<div class="hint">Version ' + VERSION + '</div></div></div></div>';
    const renderUsers = (items) => {
      $('#uList').innerHTML = items.map((u) => '<div class="list-row"><div class="grow"><div class="t">' + esc(u.name) + (u.role === 'viewer' ? ' <span class="st st-CANCELLED">View only</span>' : '') + '</div><div class="s">' + esc(u.email || '') + (u.last_login ? ' · last in ' + esc(fmtStamp(u.last_login)) : ' · never signed in') + '</div></div>' +
        (ed && u.name !== S.team.name ? '<button class="btn btn-ghost btn-sm" type="button" data-rm="' + u.id + '">Remove</button>' : '') + '</div>').join('');
      $$('#uList [data-rm]').forEach((b) => b.onclick = async () => { if (!confirm('Remove this user?')) return; const r = await trpc('appt_admin_users', { p_action: 'remove', p: { id: Number(b.dataset.rm) } }); if (r.ok) renderUsers(r.items); else toast(r.message, true); });
    };
    renderUsers(U.items || []);
    let iv = s.interval_min;
    $$('#ivSeg button').forEach((b) => b.onclick = () => { iv = Number(b.dataset.v); $$('#ivSeg button').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#fSet').onsubmit = async (e) => {
      e.preventDefault();
      const p = Object.fromEntries(new FormData($('#fSet')).entries());
      p.interval_min = iv;
      const bt = String(p.breaks_txt || '').trim(); delete p.breaks_txt;
      p.breaks = [];
      for (const part of bt ? bt.split(',') : []) {
        const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(.*)$/);
        if (!m) { toast('Break "' + part.trim() + '" should look like 11:00-11:30 Lunch', true); return; }
        const a = m[1].padStart(2, '0') + ':' + m[2], b = m[3].padStart(2, '0') + ':' + m[4];
        if (b <= a) { toast('Break end must be after start: ' + part.trim(), true); return; }
        p.breaks.push({ start: a, end: b, label: m[5].trim() });
      }
      p.hours = $$('.hours-row').map((r) => ({ dow: Number(r.dataset.dow), is_open: $('.hOpen', r).checked, open: $('.hFrom', r).value, close: $('.hTo', r).value }));
      if (iv !== s.interval_min && !confirm('Change appointment length from ' + s.interval_min + ' to ' + iv + ' minutes? New bookings use the new length right away.')) return;
      busy(true, 'Saving…');
      try {
        const r = await trpc('appt_admin_save_settings', { p });
        if (!r.ok) { toast(r.message, true); return; }
        toast('Settings saved.'); S.cfg = await rpc('appt_public_config'); vSettings();
      } catch (er) { if (er.message !== 'signed_out') toast(er.message, true); } finally { busy(false); }
    };
    const ua = $('#uAdd');
    if (ua) ua.onclick = async () => {
      const r = await trpc('appt_admin_users', { p_action: 'add', p: { name: $('#uN').value, pin: $('#uP').value, email: $('#uE').value, role: $('#uR').value } });
      if (!r.ok) { toast(r.message, true); return; }
      toast('User saved.'); renderUsers(r.items); ['#uN', '#uP', '#uE'].forEach((x) => { $(x).value = ''; });
    };
    $('#pOn').onclick = () => enablePush('team', S.team.token, null);
    $('#pOff').onclick = () => disablePush('team');
    $('#myPinGo').onclick = async () => {
      const r = await trpc('appt_admin_users', { p_action: 'pin', p: { pin: $('#myPin').value } });
      if (!r.ok) { toast(r.message, true); return; }
      toast('PIN changed.'); $('#myPin').value = '';
    };
  }

  // =====================================================================
  //  boot
  // =====================================================================
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installBtn').hidden = true; };
  $('#teamLink').onclick = () => { if (teamMode()) teamLogout(); else go('login'); };
  window.addEventListener('online', () => { $('#offline').hidden = true; });
  window.addEventListener('offline', () => { $('#offline').hidden = false; });

  async function boot() {
    tickClock(); setInterval(tickClock, 20000); loadWeather();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    try {
      S.cfg = await rpc('appt_public_config');
    } catch (e) {
      app().innerHTML = '<div class="note bad">' + esc(e.message) + '</div><div class="btn-row" style="margin-top:12px"><button class="btn btn-red" onclick="location.reload()">Try again</button></div>';
      return;
    }
    $('#footAddr').textContent = S.cfg.site_address;
    const q = new URLSearchParams(location.search);
    if (q.get('c') && q.get('k')) return openManage(q.get('c'), q.get('k'));
    if (q.get('c')) { const m = LS.get('mine', []).find((x) => x.c === q.get('c').toUpperCase()); if (m) return openManage(m.c, m.k); }
    const v = q.get('view');
    if (teamMode()) return go(['board', 'search', 'blocks', 'settings'].includes(v) ? v : 'board');
    if (v === 'board' || v === 'team') return go('login');
    go(['book', 'mine', 'find'].includes(v) ? v : 'home');
  }
  boot();
})();
