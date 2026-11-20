/* Swipe Itinerary — a mobile-first itinerary planner.
 * Data lives in localStorage; no server or build step needed. */
(() => {
  'use strict';

  const STORE_KEY = 'swipe-itinerary.v1'; // keep the same key so existing trips survive updates
  // App version shown in the footer. Goes up by 0.1 with every release; keep it equal to the
  // number in sw.js (CACHE = 'swipe-itinerary-v…') so phones pick up the new files.
  const APP_VERSION = '1.6';
  const footerHTML = () => `<footer class="app-footer">Swipe Itinerary · v${APP_VERSION}</footer>`;

  const MODES = [
    { id: '', label: 'None', icon: '📍', color: '#64748b' },
    { id: 'walk', label: 'Walk', icon: '🚶', color: '#16a34a' },
    { id: 'bus', label: 'Bus', icon: '🚌', color: '#ea580c' },
    { id: 'train', label: 'Train', icon: '🚆', color: '#2563eb' },
    { id: 'metro', label: 'Metro', icon: '🚇', color: '#7c3aed' },
    { id: 'car', label: 'Car', icon: '🚗', color: '#0891b2' },
    { id: 'taxi', label: 'Taxi / Grab', icon: '🚕', color: '#ca8a04' },
    { id: 'flight', label: 'Flight', icon: '✈️', color: '#0284c7' },
    { id: 'boat', label: 'Boat', icon: '⛴️', color: '#0d9488' },
    { id: 'bike', label: 'Bike', icon: '🚲', color: '#65a30d' },
    { id: 'other', label: 'Other', icon: '🧭', color: '#db2777' },
  ];
  const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];
  // Label + placeholder for the "line / number" box of a transport leg, by mode
  const LINE_HINT = {
    bus: ['Bus no.', 'e.g. 205 / U83'], train: ['Train line', 'e.g. JR Nara Line / KTM'], metro: ['Line', 'e.g. Midosuji / MRT Kajang'],
    flight: ['Flight no.', 'e.g. MH52'], boat: ['Ferry / route', 'e.g. Star Ferry'], taxi: ['Service / plate', 'e.g. Grab, WXY 1234'],
    car: ['Car / plate', 'e.g. rental car'], bike: ['Bike', 'e.g. bike share'], other: ['Name / number', ''], '': ['Line / number', 'e.g. Bus 205'],
  };
  const lineHint = (mode) => LINE_HINT[mode] || LINE_HINT[''];
  // "Myeongdong Stn → Sadang Stn" from the From / To boxes
  const legRoute = (l) => (l.from && l.to ? `${l.from} → ${l.to}` : l.from ? `From ${l.from}` : l.to ? `→ ${l.to}` : '');
  const legLabel = (l) => [l.line, legRoute(l), l.detail].filter(Boolean).join(' · ') || modeOf(l.mode).label;
  function normalizeLeg(l) {
    const leg = {
      mode: modeOf(l?.mode).id, line: String(l?.line || '').trim(),
      from: String(l?.from || '').trim(), to: String(l?.to || '').trim(), detail: String(l?.detail || '').trim(),
    };
    // Older trips typed "From → To" into Details: move it into the From / To boxes (one arrow only)
    const m = !leg.from && !leg.to && leg.detail.match(/^([^→]+?)\s*(?:→|->)\s*([^→]+)$/);
    if (m && !m[2].includes('->')) { leg.from = m[1].trim(); leg.to = m[2].trim(); leg.detail = ''; }
    return leg;
  }
  const legsText = (legs) => legs.map((l) => `${modeOf(l.mode).icon} ${legLabel(l)}`).join(' → ');
  const transferText = (n) => (n > 1 ? `${n - 1} transfer${n > 2 ? 's' : ''}` : '');

  // Categories for whole-trip costs and budget allocations
  const CATS = [
    { id: 'flight', label: 'Flight', icon: '✈️', color: '#0284c7' },
    { id: 'lodging', label: 'Lodging', icon: '🏨', color: '#7c3aed' },
    { id: 'meals', label: 'Meals', icon: '🍜', color: '#ea580c' },
    { id: 'transport', label: 'Transport', icon: '🚆', color: '#2563eb' },
    { id: 'rental', label: 'Rental', icon: '👘', color: '#db2777' },
    { id: 'tickets', label: 'Tickets & tours', icon: '🎟', color: '#0d9488' },
    { id: 'shopping', label: 'Shopping', icon: '🛍', color: '#ca8a04' },
    { id: 'insurance', label: 'Insurance / visa', icon: '🛡', color: '#16a34a' },
    { id: 'sim', label: 'SIM / Wi‑Fi', icon: '📶', color: '#0891b2' },
    { id: 'other', label: 'Other', icon: '🧾', color: '#64748b' },
  ];
  const catOf = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

  // [code, symbol, name]
  const CURRENCIES = [
    ['MYR', 'RM', 'Malaysian ringgit'], ['SGD', 'S$', 'Singapore dollar'], ['IDR', 'Rp', 'Indonesian rupiah'],
    ['THB', '฿', 'Thai baht'], ['VND', '₫', 'Vietnamese dong'], ['PHP', '₱', 'Philippine peso'],
    ['BND', 'B$', 'Brunei dollar'], ['KHR', '៛', 'Cambodian riel'], ['JPY', '¥', 'Japanese yen'],
    ['KRW', '₩', 'Korean won'], ['CNY', 'CN¥', 'Chinese yuan'], ['HKD', 'HK$', 'Hong Kong dollar'],
    ['TWD', 'NT$', 'Taiwan dollar'], ['INR', '₹', 'Indian rupee'], ['LKR', 'Rs', 'Sri Lankan rupee'],
    ['MVR', 'Rf', 'Maldivian rufiyaa'], ['NPR', 'रू', 'Nepalese rupee'], ['PKR', '₨', 'Pakistani rupee'],
    ['BDT', '৳', 'Bangladeshi taka'], ['SAR', 'SAR', 'Saudi riyal'], ['AED', 'AED', 'UAE dirham'],
    ['QAR', 'QAR', 'Qatari riyal'], ['TRY', '₺', 'Turkish lira'], ['EGP', 'E£', 'Egyptian pound'],
    ['USD', 'US$', 'US dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'British pound'], ['CHF', 'CHF', 'Swiss franc'],
    ['AUD', 'A$', 'Australian dollar'], ['NZD', 'NZ$', 'New Zealand dollar'], ['CAD', 'C$', 'Canadian dollar'],
  ];
  const CUR = Object.fromEntries(CURRENCIES.map(([code, sym, name]) => [code, { code, sym, name }]));
  const SYMBOL_GUESS = { RM: 'MYR', '¥': 'JPY', '$': 'USD', '€': 'EUR', '£': 'GBP', '฿': 'THB', '₩': 'KRW', RP: 'IDR', '₫': 'VND', '₱': 'PHP', '₹': 'INR', '元': 'CNY' };
  CURRENCIES.forEach(([code, sym]) => { if (!SYMBOL_GUESS[sym.toUpperCase()]) SYMBOL_GUESS[sym.toUpperCase()] = code; });
  function normCur(c) {
    const s = String(c ?? '').trim().toUpperCase();
    if (!s) return null;
    return CUR[s] ? s : SYMBOL_GUESS[s] || null;
  }

  // ---------- Storage ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  /* Cleans a trip and upgrades older saved data:
   *  - v1 had one `fee` number per activity + a free-text currency symbol on the trip
   *  - now each activity has `fees: [{label, amount, currency}]` and each day has `spend: [...]` */
  function normalizeTrip(t, freshIds) {
    const id = (x) => (freshIds || !x ? uid() : String(x));
    const base = normCur(t.base) || 'MYR';
    const currency = normCur(t.currency) || base;
    const rates = {};
    if (t.rates && typeof t.rates === 'object') {
      Object.entries(t.rates).forEach(([k, v]) => { const c = normCur(k); if (c && c !== base && Number(v) > 0) rates[c] = Number(v); });
    }
    const fee = (f) => ({ id: id(f?.id), label: String(f?.label || ''), amount: num(f?.amount), currency: normCur(f?.currency) || currency });
    const days = (Array.isArray(t.days) ? t.days : []).map((d) => ({
      id: id(d?.id),
      title: String(d?.title || ''),
      items: (Array.isArray(d?.items) ? d.items : []).map((it) => ({
        id: id(it?.id),
        time: String(it?.time || ''), endTime: String(it?.endTime || ''),
        activity: String(it?.activity || 'Untitled'),
        // v1/v2 had a single mode + transport text; now a list of legs (for transfers)
        legs: (Array.isArray(it?.legs) ? it.legs : (it?.mode || it?.transport ? [{ mode: it.mode, detail: it.transport }] : []))
          .map((l) => normalizeLeg(l))
          .filter((l) => l.mode || l.line || l.from || l.to || l.detail),
        fees: Array.isArray(it?.fees)
          ? it.fees.map(fee).filter((f) => f.amount > 0)
          : (num(it?.fee) > 0 ? [{ id: uid(), label: '', amount: num(it.fee), currency }] : []),
        remarks: String(it?.remarks || ''),
      })),
      spend: (Array.isArray(d?.spend) ? d.spend : []).map((s) => ({
        id: id(s?.id), item: String(s?.item || 'Item'), amount: num(s?.amount),
        currency: normCur(s?.currency) || currency, paidBy: String(s?.paidBy || ''),
      })),
    }));
    if (!days.length) days.push({ id: uid(), title: '', items: [], spend: [] });
    const money = (x) => ({
      id: id(x?.id), item: String(x?.item || catOf(x?.category).label), amount: num(x?.amount),
      currency: normCur(x?.currency) || currency, paidBy: String(x?.paidBy || ''), category: catOf(x?.category).id,
    });
    return {
      id: id(t.id), name: String(t.name || 'Trip'), startDate: String(t.startDate || ''),
      base, currency, rates, ratesUpdated: String(t.ratesUpdated || ''), days,
      costs: (Array.isArray(t.costs) ? t.costs : []).map(money),
      // forWho: optional person the money is set aside for (e.g. "Lee")
      allocs: (Array.isArray(t.allocs) ? t.allocs : []).map((a) => ({ ...money(a), paidBy: '', forWho: String(a?.forWho || '').trim() })),
      travellers: Math.max(1, Math.min(99, parseInt(t.travellers, 10) || 1)),
      lastPayer: String(t.lastPayer || ''), lastSpendCurrency: normCur(t.lastSpendCurrency) || '',
      // Online sharing: emails that can open this trip (empty = only on this phone so far)
      members: freshIds || !Array.isArray(t.members) ? [] : [...new Set(t.members.map((m) => String(m).trim().toLowerCase()).filter(Boolean))],
      owner: freshIds ? '' : String(t.owner || '').toLowerCase(),
      updatedAt: freshIds ? 0 : Number(t.updatedAt) || 0,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.trips)) return { loaded: true, trips: data.trips.filter((t) => t && typeof t === 'object').map((t) => normalizeTrip(t)) };
      }
    } catch (e) { /* ignore corrupt or blocked storage */ }
    return { trips: [] };
  }
  let db = load();
  // Content of a trip without its sharing bookkeeping, used to spot real edits
  const contentKey = (t) => JSON.stringify({ ...t, members: undefined, owner: undefined, updatedAt: undefined });
  const localKeys = {}; // tripId -> content when last saved/received
  db.trips.forEach((t) => { localKeys[t.id] = contentKey(t); });

  function writeLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: 2, trips: db.trips })); }
    catch (e) { toast('⚠️ Could not save (storage full or blocked)'); }
  }
  function save() {
    // Remember when each trip was last edited on this phone (decides which copy wins when syncing)
    db.trips.forEach((t) => {
      const k = contentKey(t);
      if (localKeys[t.id] !== k) { t.updatedAt = Date.now(); localKeys[t.id] = k; }
    });
    writeLocal();
    scheduleSync();
  }

  // UI state that does not need persisting
  const ui = {
    view: (() => { try { return localStorage.getItem(STORE_KEY + '.view') || 'cards'; } catch (e) { return 'cards'; } })(), // 'cards' | 'sheet'
    dayIndex: {},      // tripId -> active day index
    cardIndex: {},     // dayId  -> active card index
  };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return t;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }
  const sym = (code) => (CUR[code] ? CUR[code].sym : code || '');
  // Currencies normally written without decimals (₩ 2,150, ¥ 380, Rp 50,000…)
  const NO_DECIMALS = new Set(['KRW', 'JPY', 'IDR', 'VND', 'KHR', 'TWD']);
  function fmtMoney(n, code, fixed2) {
    let v = Number(n) || 0;
    if (NO_DECIMALS.has(code)) v = Math.round(v);
    const s = v.toLocaleString(undefined, { minimumFractionDigits: fixed2 || v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return code ? `${sym(code)} ${s}` : s;
  }
  const fmtRate = (r) => (r ? String(Number(Number(r).toPrecision(6))) : '');

  // Conversion to the trip's "convert to" currency (RM by default)
  const rateOf = (trip, code) => (code === trip.base ? 1 : trip.rates[code] || 0);
  const toBase = (trip, amount, code) => { const r = rateOf(trip, code); return r ? num(amount) * r : null; };
  function sumBase(trip, entries) {
    let total = 0; const missing = new Set();
    entries.forEach((e) => {
      const v = toBase(trip, e.amount, e.currency);
      if (v == null) missing.add(e.currency); else total += v;
    });
    return { total, missing };
  }
  const fmtBase = (trip, s) => `${fmtMoney(s.total, trip.base, true)}${s.missing.size ? '*' : ''}`;
  // Sum of amounts expressed in one currency (amounts already in it are added as-is)
  function sumIn(trip, entries, code) {
    let total = 0; const missing = new Set();
    entries.forEach((e) => {
      if (e.currency === code) { total += num(e.amount); return; }
      const v = toBase(trip, e.amount, e.currency); const r = rateOf(trip, code);
      if (v == null || !r) missing.add(e.currency); else total += v / r;
    });
    return { total, missing };
  }
  // Total in the trip's main currency and in RM, e.g. "¥ 380 (≈ RM 11.02)"
  // Which local currency to show next to RM: the one the fares are actually in
  // (if they use one), else the trip's main currency, else the most-used one.
  function localCurrency(trip, entries) {
    const count = new Map();
    entries.forEach((e) => { if (e.currency !== trip.base) count.set(e.currency, (count.get(e.currency) || 0) + 1); });
    if (!count.size) return trip.currency !== trip.base ? trip.currency : null;
    if (count.size === 1) return [...count.keys()][0];
    if (count.has(trip.currency)) return trip.currency;
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  function fmtDual(trip, entries, forceCode) {
    const b = sumBase(trip, entries);
    const code = forceCode !== undefined ? forceCode : localCurrency(trip, entries);
    if (!code) return fmtBase(trip, b);
    const m = sumIn(trip, entries, code);
    const main = `${fmtMoney(m.total, code)}${m.missing.size ? '*' : ''}`;
    return b.missing.size && !b.total ? main : `${main} (≈ ${fmtBase(trip, b)})`;
  }
  // Two-line version for totals: local amount in bold with "≈ RM …" under it
  function dualHTML(main, rm, cls = '') {
    return `<span class="dual ${cls}"><b>${esc(main)}</b>${rm ? `<small>≈ ${esc(rm)}</small>` : ''}</span>`;
  }
  function dualStack(trip, entries, forceCode) {
    const b = sumBase(trip, entries);
    const code = forceCode !== undefined ? forceCode : localCurrency(trip, entries);
    if (!code) return dualHTML(fmtBase(trip, b), '');
    const m = sumIn(trip, entries, code);
    const main = `${fmtMoney(m.total, code)}${m.missing.size ? '*' : ''}`;
    return dualHTML(main, b.missing.size && !b.total ? '' : fmtBase(trip, b));
  }
  // An RM amount also shown in a local currency (e.g. what's left of the budget)
  function dualStackBase(trip, baseAmount, code, cls) {
    const r = code ? rateOf(trip, code) : 0;
    const rm = fmtMoney(baseAmount, trip.base, true);
    return r ? dualHTML(fmtMoney(baseAmount / r, code), rm, cls) : dualHTML(rm, '', cls);
  }
  const itemFees = (items) => items.flatMap((it) => it.fees);
  const tripFees = (trip) => trip.days.flatMap((d) => itemFees(d.items));
  const tripSpend = (trip) => trip.days.flatMap((d) => d.spend);
  function tripCurrencies(trip) {
    const set = new Set([trip.currency, ...Object.keys(trip.rates)]);
    tripFees(trip).forEach((f) => set.add(f.currency));
    [...tripSpend(trip), ...trip.costs, ...trip.allocs].forEach((s) => set.add(s.currency));
    set.delete(trip.base);
    return [...set].filter(Boolean);
  }
  function curOptions(trip, selected) {
    const mine = [trip.currency, trip.base, ...tripCurrencies(trip)].filter((c, i, a) => c && a.indexOf(c) === i);
    const opt = (c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`;
    const rest = CURRENCIES.map(([c]) => c).filter((c) => !mine.includes(c));
    return trip
      ? `<optgroup label="This trip">${mine.map(opt).join('')}</optgroup><optgroup label="All currencies">${rest.map(opt).join('')}</optgroup>`
      : CURRENCIES.map(([c]) => opt(c)).join('');
  }
  const allCurOptions = (selected) => CURRENCIES.map(([c, , name]) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c} — ${esc(name)}</option>`).join('');

  // Whole-trip estimate = trip costs + transport fees + budget allocations
  // (+ any daily spending beyond the allocations, e.g. activity tickets, meals)
  function tripTotals(trip) {
    const costs = sumBase(trip, trip.costs);
    const allocs = sumBase(trip, trip.allocs);
    const fees = sumBase(trip, tripFees(trip));
    const spent = sumBase(trip, tripSpend(trip));
    const missing = new Set([...costs.missing, ...allocs.missing, ...fees.missing]);
    const over = Math.max(0, spent.total - allocs.total);
    [...spent.missing].forEach((c) => missing.add(c));
    return { costs, allocs, fees, spent, over, total: { total: costs.total + allocs.total + fees.total + over, missing } };
  }

  function byPerson(trip, list) {
    const map = new Map();
    list.forEach((s) => {
      const who = s.paidBy.trim() || 'Unassigned';
      const v = toBase(trip, s.amount, s.currency);
      const cur = map.get(who) || { total: 0, missing: new Set() };
      if (v == null) cur.missing.add(s.currency); else cur.total += v;
      map.set(who, cur);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }
  function knownPayers(trip) {
    const count = new Map();
    [...tripSpend(trip), ...trip.costs].forEach((s) => { const p = s.paidBy.trim(); if (p) count.set(p, (count.get(p) || 0) + 1); });
    trip.allocs.forEach((a) => { const p = (a.forWho || '').trim(); if (p) count.set(p, (count.get(p) || 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }

  function dayDate(trip, i) {
    if (!trip.startDate) return null;
    const d = new Date(trip.startDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + i);
    return d;
  }
  const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => (d ? d.toLocaleDateString(undefined, opts) : '');
  const tripItems = (trip) => trip.days.flatMap((d) => d.items);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function sortItems(items) {
    // Items with a time are sorted by time; items without keep their order at the end.
    return items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => {
        if (a.it.time && b.it.time) return a.it.time.localeCompare(b.it.time) || a.i - b.i;
        if (a.it.time) return -1;
        if (b.it.time) return 1;
        return a.i - b.i;
      })
      .map((x) => x.it);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- Routing ----------
  const app = $('#app');
  function route() {
    const m = location.hash.match(/^#\/trip\/([\w-]+)/);
    const trip = m && db.trips.find((t) => t.id === m[1]);
    if (trip) renderTrip(trip);
    else renderHome();
  }
  window.addEventListener('hashchange', route);

  // ---------- Home ----------
  function renderHome() {
    document.title = 'Swipe Itinerary';
    document.onkeydown = null;
    const trips = db.trips;
    app.innerHTML = `
      <header class="topbar">
        <h1>My Trips<small>Plan like a sheet, swipe like flashcards</small></h1>
        <button class="icon-btn" id="homeMenu" aria-label="More">⋯</button>
      </header>
      <div id="syncBar">${syncBarHTML()}</div>
      ${trips.length ? `
        <ul class="trip-list">
          ${trips.map((t) => {
            const items = tripItems(t);
            const start = dayDate(t, 0);
            const end = dayDate(t, t.days.length - 1);
            const spend = tripSpend(t);
            return `<li><button class="trip-card" data-trip="${t.id}">
              <h3>${esc(t.name)}</h3>
              <div class="meta">
                ${start ? `<span>📅 ${esc(fmtDate(start, { day: 'numeric', month: 'short' }))}${t.days.length > 1 ? ' – ' + esc(fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</span>` : ''}
                <span>🗓 ${plural(t.days.length, 'day', 'days')}</span>
                <span>📝 ${plural(items.length, 'activity', 'activities')}</span>
                <span>💰 Total ≈ ${esc(fmtBase(t, tripTotals(t).total))}</span>
                ${spend.length ? `<span>💸 Spent ${esc(fmtBase(t, sumBase(t, spend)))}</span>` : ''}
                ${t.members.length > 1 ? `<span class="shared-badge">👥 Shared with ${esc(otherMembers(t).map(shortEmail).join(', '))}</span>` : ''}
              </div>
            </button></li>`;
          }).join('')}
        </ul>` : `
        <div class="empty">
          <div class="big">🧳</div>
          <h2>No trips yet</h2>
          <p>Create a trip, add activities with time, transport, fares and remarks — then swipe through your day like flashcards and track what everyone spends.</p>
          <button class="btn primary" id="newTripEmpty">Create your first trip</button>
          <div style="height:12px"></div>
          <button class="btn" id="sampleTrip">Try a sample trip</button>
        </div>`}
      ${footerHTML()}
      <button class="fab" id="newTrip" aria-label="New trip">+</button>
    `;
    app.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/trip/${b.dataset.trip}`; }));
    $('#newTrip').addEventListener('click', () => openTripDialog());
    $('#newTripEmpty')?.addEventListener('click', () => openTripDialog());
    $('#sampleTrip')?.addEventListener('click', createSample);
    wireSyncBar();
    $('#homeMenu').addEventListener('click', (e) => showMenu(e, [
      { label: '🧪 Add sample trip', fn: createSample },
      { label: '⬇️ Back up all trips (JSON)', fn: exportJSON },
      { label: '⬆️ Restore from backup', fn: () => $('#importFile').click() },
      { label: '🔄 Update app to latest version', fn: updateApp },
    ]));
  }

  // ---------- Trip ----------
  function renderTrip(trip) {
    document.title = `${trip.name} · Itinerary`;
    // -1 = the Overview dashboard (shown before Day 1, and opened first)
    const di = Math.min(ui.dayIndex[trip.id] ?? -1, trip.days.length - 1);
    ui.dayIndex[trip.id] = di;
    const T = tripTotals(trip);
    const chrome = `
      <header class="topbar">
        <button class="icon-btn" id="back" aria-label="Back">‹</button>
        <h1>${esc(trip.name)}<small>${plural(trip.days.length, 'day', 'days')} · total ≈ ${esc(fmtBase(trip, T.total))}</small></h1>
        <button class="icon-btn" id="tripMenu" aria-label="Trip options">⋯</button>
      </header>

      <nav class="day-tabs" id="dayTabs">
        <button class="day-tab overview ${di === -1 ? 'active' : ''}" data-day="-1">
          <b>📊 Overview</b>
          <span>Costs &amp; budget</span>
        </button>
        ${trip.days.map((d, i) => `
          <button class="day-tab ${i === di ? 'active' : ''}" data-day="${i}">
            <b>Day ${i + 1}</b>
            <span>${esc(fmtDate(dayDate(trip, i)) || d.title || plural(d.items.length, 'item', 'items'))}</span>
          </button>`).join('')}
        <button class="day-tab add" id="addDay" aria-label="Add day">+</button>
      </nav>`;
    autoFillRates(trip).then((got) => {
      if (got.length && location.hash === `#/trip/${trip.id}`) { renderTrip(trip); toast(`💱 Got today's rate for ${got.join(', ')}`); }
    });
    if (di === -1) { renderOverview(trip, chrome, T); return; }
    const day = trip.days[di];
    day.items = sortItems(day.items);
    const items = day.items;
    const date = dayDate(trip, di);

    app.innerHTML = `
      ${chrome}

      <div class="toolbar">
        <div class="day-title">
          ${esc(day.title || (date ? fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : `Day ${di + 1}`))}
          <button id="editDay" aria-label="Edit day">✎</button>
        </div>
        <div class="seg" role="tablist">
          <button class="${ui.view === 'cards' ? 'on' : ''}" data-view="cards">Cards</button>
          <button class="${ui.view === 'sheet' ? 'on' : ''}" data-view="sheet">Sheet</button>
        </div>
      </div>

      ${ui.view === 'cards' ? cardsHTML(trip, day, items) : sheetHTML(trip, items)}

      ${spendHTML(trip, day)}
      ${footerHTML()}

      <button class="fab" id="addItem" aria-label="Add activity">+</button>
    `;

    wireTripChrome(trip, di);
    $('#editDay').addEventListener('click', () => openDayDialog(trip, di));
    app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      try { localStorage.setItem(STORE_KEY + '.view', ui.view); } catch (e) { /* ignore */ }
      renderTrip(trip);
    }));
    $('#addItem').addEventListener('click', () => openItemDialog(trip, day));

    // Spending
    app.querySelectorAll('[data-spend]').forEach((b) => b.addEventListener('click', () => {
      openSpendDialog(trip, day, day.spend.find((s) => s.id === b.dataset.spend));
    }));
    $('#addSpend').addEventListener('click', () => openSpendDialog(trip, day));
    $('#spendRates').addEventListener('click', () => openRatesDialog(trip));

    document.onkeydown = null;
    if (ui.view === 'cards') wireDeck(trip, day, items);
    else {
      app.querySelectorAll('tr[data-item]').forEach((tr) => tr.addEventListener('click', () => {
        openItemDialog(trip, day, items.find((x) => x.id === tr.dataset.item));
      }));
      $('#sheetAdd')?.addEventListener('click', () => openItemDialog(trip, day));
    }
  }

  function wireTripChrome(trip, di) {
    $('#back').addEventListener('click', () => { location.hash = '#/'; });
    $('#tripMenu').addEventListener('click', (e) => showMenu(e, [
      { label: trip.members.length > 1 ? '👥 Sharing…' : '👥 Share trip', fn: () => openShareDialog(trip) },
      { label: '✎ Edit trip details', fn: () => openTripDialog(trip) },
      { label: '💱 Currencies & exchange rates', fn: () => openRatesDialog(trip) },
      { label: '📊 Overview (costs & budget)', fn: () => { ui.dayIndex[trip.id] = -1; renderTrip(trip); } },
      { label: '💸 Spending summary (who paid)', fn: () => openSummary(trip) },
      ...(di >= 0 ? [{ label: '📋 Share / copy this day', fn: () => copyDay(trip, di) }] : []),
      { label: '⬇️ Back up trip (JSON)', fn: () => exportJSON(trip) },
      { label: '🔄 Update app to latest version', fn: updateApp },
      { label: '🗑 Delete trip', fn: () => deleteTrip(trip), danger: true },
    ]));
    app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
      ui.dayIndex[trip.id] = Number(b.dataset.day);
      renderTrip(trip);
    }));
    // keep the active tab visible
    app.querySelector('.day-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#addDay').addEventListener('click', () => {
      trip.days.push({ id: uid(), title: '', items: [], spend: [] });
      ui.dayIndex[trip.id] = trip.days.length - 1;
      save(); renderTrip(trip);
      toast(`Day ${trip.days.length} added`);
    });
  }

  // ---------- Overview dashboard ----------
  function moneyRow(trip, x, attr, sub) {
    const v = toBase(trip, x.amount, x.currency);
    const c = catOf(x.category);
    return `<li><button class="spend-item" ${attr}="${x.id}">
      <span class="cat-ic" style="--accent:${c.color}">${c.icon}</span>
      <div class="what"><b>${esc(x.item)}</b><small>${sub}</small></div>
      <div class="amt"><b>${esc(fmtMoney(x.amount, x.currency))}</b>
        ${x.currency !== trip.base ? `<small>${v == null ? '<span class="warn">set rate</span>' : '≈ ' + esc(fmtMoney(v, trip.base, true))}</small>` : ''}</div>
    </button></li>`;
  }

  // Allocations per person: what's set aside for them, and what they've paid in daily spending
  function allocPeopleHTML(trip, code) {
    const people = new Map(); // lower-case name -> { name, list }
    trip.allocs.forEach((a) => {
      if (!a.forWho) return;
      const key = a.forWho.toLowerCase();
      if (!people.has(key)) people.set(key, { name: a.forWho, list: [] });
      people.get(key).list.push(a);
    });
    if (!people.size) return '';
    const shared = trip.allocs.filter((a) => !a.forWho);
    return `<div class="alloc-people">
      ${[...people.values()].map((p) => {
        const paid = tripSpend(trip).filter((s) => s.paidBy.trim().toLowerCase() === p.name.toLowerCase());
        return `<div class="ap">
          <span class="who">🙋 ${esc(p.name)}<small>${esc(p.list.map((a) => catOf(a.category).label).filter((v, i, x) => x.indexOf(v) === i).join(', '))}</small>${paid.length ? `<small>paid ${esc(code ? fmtMoney(sumIn(trip, paid, code).total, code) : fmtBase(trip, sumBase(trip, paid)))} so far</small>` : ''}</span>
          ${dualStack(trip, p.list, code)}
        </div>`;
      }).join('')}
      ${shared.length ? `<div class="ap"><span class="who">👥 Shared<small>not for one person</small></span>${dualStack(trip, shared, code)}</div>` : ''}
    </div>`;
  }

  function renderOverview(trip, chrome, T) {
    const B = trip.base;
    const grand = T.total.total;
    const pct = (v) => (grand > 0 ? (v / grand) * 100 : 0);
    // Each part is shown in the currency it was entered in (e.g. ₩) with RM under it
    const segs = [
      { label: 'Trip costs', v: T.costs, color: '#0284c7', html: dualStack(trip, trip.costs) },
      { label: 'Transport fees (from days)', v: T.fees, color: '#14b8a6', html: dualStack(trip, tripFees(trip)) },
      { label: 'Budget allocations', v: T.allocs, color: '#f59e0b', html: dualStack(trip, trip.allocs) },
      ...(T.over > 0 ? [{ label: 'Spending over budget', v: { total: T.over, missing: new Set() }, color: '#ef4444',
        html: dualStackBase(trip, T.over, localCurrency(trip, tripSpend(trip))) }] : []),
    ];
    // The whole trip in the local currency too, e.g. "≈ ₩ 1,930,000"
    const tripCode = localCurrency(trip, [...trip.costs, ...tripFees(trip), ...trip.allocs, ...tripSpend(trip)]);
    const inLocal = (rm) => (tripCode && rateOf(trip, tripCode) ? fmtMoney(rm / rateOf(trip, tripCode), tripCode) : '');
    const left = T.allocs.total - T.spent.total;
    // Budget totals use one local currency throughout (e.g. ₩), alongside RM
    const budgetCode = localCurrency(trip, [...trip.allocs, ...tripSpend(trip)]);
    const n = trip.travellers;
    app.innerHTML = `
      ${chrome}

      <section class="dash-hero">
        <div class="lbl">Estimated total trip cost</div>
        <div class="big">${esc(fmtBase(trip, T.total))}</div>
        ${inLocal(grand) ? `<div class="big-local">≈ ${esc(inLocal(grand))}</div>` : ''}
        <div class="pp">
          <span>≈ <b>${esc(fmtMoney(grand / n, B, true))}</b>${inLocal(grand / n) ? ` (${esc(inLocal(grand / n))})` : ''} per person</span>
          <span class="stepper" aria-label="Number of travellers">
            <button data-trav="-1" aria-label="Fewer travellers">−</button>
            <span>👥 ${n}</span>
            <button data-trav="1" aria-label="More travellers">+</button>
          </span>
        </div>
        <div class="bar">${segs.map((g) => `<i style="width:${pct(g.v.total)}%;background:${g.color}"></i>`).join('')}</div>
        <ul class="legend">
          ${segs.map((g) => `<li><i style="background:${g.color}"></i><span>${g.label}</span>${g.html}</li>`).join('')}
        </ul>
        ${T.total.missing.size ? `<div class="warn" style="font-size:.82rem;margin-top:6px">* No exchange rate yet for ${esc([...T.total.missing].join(', '))} — not counted. <button class="link-btn" id="dashRates">Set rates</button></div>` : ''}
      </section>

      <section class="spend">
        <div class="spend-head"><h2>✈️ Trip costs</h2><span class="muted-note">Flights, rentals, bookings…</span></div>
        ${trip.costs.length ? `<ul class="spend-list">${trip.costs.map((c) => moneyRow(trip, c, 'data-cost',
          `${esc(catOf(c.category).label)}${c.paidBy ? ' · paid by ' + esc(c.paidBy) : ''}`)).join('')}</ul>`
          : '<div class="spend-empty">Add costs for the whole trip — e.g. flights, hotel bookings, hanbok rental, insurance.</div>'}
        <button class="btn add-row-btn" id="addCost">+ Add trip cost</button>
        <div class="spend-foot"><div class="line"><span>Total trip costs</span>${dualStack(trip, trip.costs)}</div></div>
      </section>

      <section class="spend">
        <div class="spend-head"><h2>🍱 Budget allocations</h2><span class="muted-note">Money set aside</span></div>
        ${trip.allocs.length ? `<ul class="spend-list">${trip.allocs.map((a) => moneyRow(trip, a, 'data-alloc', `${esc(catOf(a.category).label)}${a.forWho ? ` · for <b class="for-who">${esc(a.forWho)}</b>` : ''}`)).join('')}</ul>`
          : '<div class="spend-empty">Set aside money for things like meals, lodging, transport and shopping.</div>'}
        <button class="btn add-row-btn" id="addAlloc">+ Add allocation</button>
        <div class="spend-foot">
          ${allocPeopleHTML(trip, budgetCode)}
          <div class="line"><span>Allocated</span>${dualStack(trip, trip.allocs, budgetCode)}</div>
          <div class="line"><span>Spent so far<small class="sub">daily spending</small></span>${dualStack(trip, tripSpend(trip), budgetCode)}</div>
          ${trip.allocs.length ? `<div class="meter"><i style="width:${Math.min(100, T.allocs.total ? (T.spent.total / T.allocs.total) * 100 : 0)}%" class="${left < 0 ? 'over' : ''}"></i></div>
          <div class="line grand"><span>${left < 0 ? 'Over budget by' : 'Left to spend'}</span>${dualStackBase(trip, Math.abs(left), budgetCode, left < 0 ? 'warn' : '')}</div>` : ''}
        </div>
      </section>

      <section class="spend">
        <div class="spend-head"><h2>🗓 Days</h2></div>
        <ul class="spend-list">
          ${trip.days.map((d, i) => `<li><button class="spend-item" data-goday="${i}">
            <span class="cat-ic">${i + 1}</span>
            <div class="what"><b>${esc(d.title || 'Day ' + (i + 1))}</b><small>${esc(fmtDate(dayDate(trip, i)) || '')}${dayDate(trip, i) ? ' · ' : ''}${plural(d.items.length, 'activity', 'activities')}</small></div>
            <div class="amt"><b>${esc(fmtBase(trip, sumBase(trip, d.spend)))}</b><small>🎫 transport ${esc(fmtDual(trip, itemFees(d.items)))}</small></div>
          </button></li>`).join('')}
        </ul>
      </section>
      ${footerHTML()}

      <button class="fab" id="addCostFab" aria-label="Add trip cost">+</button>
    `;
    wireTripChrome(trip, -1);
    document.onkeydown = null;
    app.querySelectorAll('[data-trav]').forEach((b) => b.addEventListener('click', () => {
      trip.travellers = Math.max(1, Math.min(99, trip.travellers + Number(b.dataset.trav)));
      save(); renderTrip(trip);
    }));
    app.querySelectorAll('[data-cost]').forEach((b) => b.addEventListener('click', () =>
      openMoneyDialog('cost', trip, trip.costs, trip.costs.find((x) => x.id === b.dataset.cost))));
    app.querySelectorAll('[data-alloc]').forEach((b) => b.addEventListener('click', () =>
      openMoneyDialog('alloc', trip, trip.allocs, trip.allocs.find((x) => x.id === b.dataset.alloc))));
    app.querySelectorAll('[data-goday]').forEach((b) => b.addEventListener('click', () => {
      ui.dayIndex[trip.id] = Number(b.dataset.goday); renderTrip(trip); window.scrollTo(0, 0);
    }));
    $('#addCost').addEventListener('click', () => openMoneyDialog('cost', trip, trip.costs));
    $('#addCostFab').addEventListener('click', () => openMoneyDialog('cost', trip, trip.costs));
    $('#addAlloc').addEventListener('click', () => openMoneyDialog('alloc', trip, trip.allocs));
    $('#dashRates')?.addEventListener('click', () => openRatesDialog(trip));
  }

  // Fee lines for a card / table cell
  function feesBlock(trip, fees, compact) {
    if (!fees.length) return compact ? '—' : '<div class="val muted">None</div>';
    const s = sumBase(trip, fees);
    const needsTotal = fees.length > 1 || fees.some((f) => f.currency !== trip.base);
    const lines = fees.map((f) => compact
      ? `${f.label ? esc(f.label) + ': ' : ''}${esc(fmtMoney(f.amount, f.currency))}`
      : `<div class="fee-line"><span>${esc(f.label || (fees.length > 1 ? 'Fare' : ''))}</span><span>${esc(fmtMoney(f.amount, f.currency))}</span></div>`);
    const total = needsTotal
      ? `${fees.length > 1 ? `Total ${esc(fmtDual(trip, fees))}` : `≈ ${esc(fmtBase(trip, s))}`}${s.missing.size ? ` <span class="warn">(no rate for ${esc([...s.missing].join(', '))})</span>` : ''}`
      : '';
    return compact
      ? `${lines.join('<br>')}${total ? `<br><small>${total}</small>` : ''}`
      : `<div class="val">${lines.join('')}</div>${total ? `<div class="fee-sum">${total}</div>` : ''}`;
  }

  // One transport leg: coloured badge for the bus no. / line, then the details
  function legHTML(l) {
    const m = modeOf(l.mode);
    const route = l.from && l.to ? `${esc(l.from)} <span class="arrow">→</span> ${esc(l.to)}`
      : l.from ? `From ${esc(l.from)}` : l.to ? `<span class="arrow">→</span> ${esc(l.to)}` : '';
    const main = route || (!l.line ? esc(l.detail || m.label) : '');
    const note = route || l.line ? l.detail : '';
    return `<b class="leg-text">${l.line ? `<span class="line-badge" style="--accent:${m.color}">${esc(l.line)}</span>` : ''}${
      main ? `<span>${main}</span>` : ''}</b>${note ? `<small class="leg-note">${esc(note)}</small>` : ''}`;
  }

  function cardsHTML(trip, day, items) {
    const n = items.length;
    return `
      <div class="deck" id="deck">
        ${items.map((it, i) => {
          const m = modeOf(it.legs[0]?.mode);
          return `<button class="card" data-item="${it.id}" style="--accent:${m.color}">
            <div class="idx">Stop ${i + 1} of ${n}</div>
            <div class="time ${it.time ? '' : 'none'}">${it.time ? esc(fmtTime(it.time)) : 'Any time'}</div>
            ${it.endTime ? `<div class="until">until ${esc(fmtTime(it.endTime))}</div>` : ''}
            <div class="activity">${esc(it.activity)}</div>
            <div class="row">
              <div class="ic">${m.icon}</div>
              <div><div class="lbl">Transport${it.legs.length > 1 ? ' · ' + transferText(it.legs.length) : it.legs[0]?.mode ? ' · ' + esc(m.label) : ''}</div>
                ${it.legs.length > 1 ? `<ol class="legs">${it.legs.map((l) => `<li><span>${modeOf(l.mode).icon}</span><div class="leg-body">${legHTML(l)}</div></li>`).join('')}</ol>`
                  : `<div class="val ${it.legs.length ? '' : 'muted'}">${it.legs.length ? legHTML(it.legs[0]) : 'Not set'}</div>`}</div>
            </div>
            <div class="row">
              <div class="ic">🎫</div>
              <div><div class="lbl">Transport fee${it.fees.length > 1 ? 's' : ''}</div>${feesBlock(trip, it.fees)}</div>
            </div>
            <div class="row">
              <div class="ic">📝</div>
              <div><div class="lbl">Remarks</div>
                <div class="val ${it.remarks ? '' : 'muted'}">${esc(it.remarks || 'No remarks')}</div></div>
            </div>
            <div class="grow"></div>
            <div class="hint">Tap to edit · swipe for next</div>
          </button>`;
        }).join('')}
        <button class="card add-card" id="deckAdd">
          <div class="plus">+</div>
          <div><b>${n ? 'Add another activity' : 'Add your first activity'}</b></div>
          <div style="font-size:.85rem">Time · activity · transport · fares · remarks</div>
        </button>
      </div>
      <div class="deck-nav">
        <button class="icon-btn" id="prevCard" aria-label="Previous">‹</button>
        <div class="dots" id="dots">${items.map(() => '<i></i>').join('')}<i></i></div>
        <span class="counter" id="counter"></span>
        <button class="icon-btn" id="nextCard" aria-label="Next">›</button>
      </div>`;
  }

  function wireDeck(trip, day, items) {
    const deck = $('#deck');
    const cards = [...deck.children];
    const dots = [...$('#dots').children];
    const counter = $('#counter');
    let current = -1;

    const setCurrent = (i) => {
      if (i === current) return;
      current = i;
      ui.cardIndex[day.id] = i;
      cards.forEach((c, k) => c.classList.toggle('current', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      counter.textContent = i < items.length ? `${i + 1} / ${items.length}` : items.length ? 'New' : '';
    };
    const goTo = (i, smooth = true) => {
      i = Math.max(0, Math.min(cards.length - 1, i));
      const c = cards[i];
      deck.scrollTo({ left: c.offsetLeft - (deck.clientWidth - c.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
      setCurrent(i);
    };
    const nearest = () => {
      const mid = deck.scrollLeft + deck.clientWidth / 2;
      let best = 0, bestD = Infinity;
      cards.forEach((c, k) => {
        const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
        if (d < bestD) { bestD = d; best = k; }
      });
      return best;
    };

    let raf;
    deck.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCurrent(nearest()));
    }, { passive: true });

    cards.forEach((c, k) => c.addEventListener('click', () => {
      if (k !== current) { goTo(k); return; } // tapping a side card brings it to the front
      if (c.id === 'deckAdd') openItemDialog(trip, day);
      else openItemDialog(trip, day, items.find((x) => x.id === c.dataset.item));
    }));
    $('#prevCard').addEventListener('click', () => goTo(current - 1));
    $('#nextCard').addEventListener('click', () => goTo(current + 1));

    // Restore position (or jump to the first card)
    const start = Math.min(ui.cardIndex[day.id] ?? 0, cards.length - 1);
    goTo(start, false);
    requestAnimationFrame(() => goTo(start, false));

    // Keyboard arrows on desktop
    document.onkeydown = (e) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'ArrowRight') goTo(current + 1);
      if (e.key === 'ArrowLeft') goTo(current - 1);
    };
  }

  function sheetHTML(trip, items) {
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Activity</th><th>Transport</th><th class="fee">Transport fees</th><th>Remarks</th></tr></thead>
          <tbody>
            ${items.map((it, i) => {
              return `<tr data-item="${it.id}">
                <td>${i + 1}</td>
                <td class="t">${esc(fmtTime(it.time) || '—')}${it.endTime ? `<br><small>→ ${esc(fmtTime(it.endTime))}</small>` : ''}</td>
                <td><b>${esc(it.activity)}</b></td>
                <td class="legs-cell">${it.legs.length ? it.legs.map((l, k) => `<div class="leg-line">${k ? '<i>↓</i>' : ''}${modeOf(l.mode).icon} ${legHTML(l)}</div>`).join('') : '—'}</td>
                <td class="fee">${feesBlock(trip, it.fees, true)}</td>
                <td class="rem">${esc(it.remarks || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr><td></td><td colspan="3">Total transport fees</td><td class="fee">${esc(fmtDual(trip, itemFees(items)))}</td><td></td></tr></tfoot>
        </table>
      </div>
      <button class="btn add-row-btn" id="sheetAdd">+ Add row</button>`;
  }

  function spendHTML(trip, day) {
    const fees = sumBase(trip, itemFees(day.items));
    const spent = sumBase(trip, day.spend);
    const people = byPerson(trip, day.spend);
    const missing = new Set([...fees.missing, ...spent.missing]);
    return `
      <section class="spend" aria-label="Spending">
        <div class="spend-head">
          <h2>💸 Spending</h2>
          <button class="link-btn" id="spendRates">💱 Rates</button>
        </div>
        ${day.spend.length ? `<ul class="spend-list">
          ${day.spend.map((s) => {
            const v = toBase(trip, s.amount, s.currency);
            return `<li><button class="spend-item" data-spend="${s.id}">
              <div class="what"><b>${esc(s.item)}</b><small>${s.paidBy ? `Paid by ${esc(s.paidBy)}` : 'Who paid? —'}</small></div>
              <div class="amt"><b>${esc(fmtMoney(s.amount, s.currency))}</b>
                ${s.currency !== trip.base ? `<small>${v == null ? '<span class="warn">set rate</span>' : '≈ ' + esc(fmtMoney(v, trip.base, true))}</small>` : ''}</div>
            </button></li>`;
          }).join('')}
        </ul>` : '<div class="spend-empty">Nothing spent yet. Add activity tickets, meals, shopping… here.</div>'}
        <button class="btn add-row-btn" id="addSpend">+ Add spending</button>
        <div class="spend-foot">
          ${people.length ? `<div class="people">${people.map(([who, v]) => `<span>${esc(who)} · ${esc(fmtBase(trip, v))}</span>`).join('')}</div>` : ''}
          <div class="line"><span>Spent today</span><b>${esc(fmtBase(trip, spent))}</b></div>
          <div class="line"><span>Transport fees today</span>${dualStack(trip, itemFees(day.items))}</div>
          <div class="line grand"><span>Day total</span><b>${esc(fmtMoney(spent.total + fees.total, trip.base, true))}${missing.size ? '*' : ''}</b></div>
          ${missing.size ? `<div class="warn" style="font-size:.82rem">* No exchange rate yet for ${esc([...missing].join(', '))} — tap 💱 Rates.</div>` : ''}
        </div>
      </section>`;
  }

  // ---------- Menus ----------
  function showMenu(evt, entries) {
    evt.stopPropagation();
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.id = 'menu';
    entries.forEach((en) => {
      const b = document.createElement('button');
      b.textContent = en.label;
      if (en.danger) b.className = 'danger';
      b.addEventListener('click', () => { closeMenu(); en.fn(); });
      menu.appendChild(b);
    });
    app.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }));
  }
  function closeMenu() { $('#menu')?.remove(); }

  // ---------- Item dialog ----------
  const itemDialog = $('#itemDialog');
  const itemForm = $('#itemForm');
  let itemCtx = null;
  let legDraft = [];
  let feeDraft = [];

  function renderLegRows() {
    $('#legRows').innerHTML = legDraft.map((l, i) => `
      ${i ? '<div class="transfer-mark">⇣ Transfer</div>' : ''}
      <div class="leg-row" data-leg="${i}">
        ${legDraft.length > 1 ? `<div class="leg-head"><b>Leg ${i + 1}</b>
          <button type="button" class="rm" data-rmleg="${i}" aria-label="Remove leg ${i + 1}">✕</button></div>` : ''}
        <div class="chips">${MODES.map((m) =>
          `<button type="button" class="chip ${m.id === l.mode ? 'on' : ''}" data-mode="${m.id}">${m.icon} ${esc(m.label)}</button>`).join('')}</div>
        <div class="leg-fields ${l.mode === 'walk' && !l.line ? 'no-line' : ''}">
          <label class="mini line-box"><span data-linelabel>${esc(lineHint(l.mode)[0])}</span>
            <input type="text" data-k="line" value="${esc(l.line)}" placeholder="${esc(lineHint(l.mode)[1])}" autocomplete="off" /></label>
          <div class="from-to">
            <label class="mini"><span>From (optional)</span>
              <input type="text" data-k="from" value="${esc(l.from)}" placeholder="e.g. Myeongdong Stn" autocomplete="off" /></label>
            <button type="button" class="swap" data-swap="${i}" aria-label="Swap from and to">⇄</button>
            <label class="mini"><span>To (optional)</span>
              <input type="text" data-k="to" value="${esc(l.to)}" placeholder="e.g. Sadang Stn" autocomplete="off" /></label>
          </div>
          <div class="suggest" data-suggest="${i}" hidden></div>
          <label class="mini"><span>Details (optional)</span>
            <input type="text" data-k="detail" value="${esc(l.detail)}" placeholder="Platform, exit, direction…" autocomplete="off" /></label>
        </div>
      </div>`).join('');
  }
  $('#legRows').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-mode]');
    const rm = e.target.closest('[data-rmleg]');
    const swap = e.target.closest('[data-swap]');
    if (swap) {
      const l = legDraft[Number(swap.dataset.swap)];
      [l.from, l.to] = [l.to, l.from];
      const row = swap.closest('[data-leg]');
      row.querySelector('[data-k=from]').value = l.from;
      row.querySelector('[data-k=to]').value = l.to;
      return;
    }
    if (chip) {
      const i = Number(chip.closest('[data-leg]').dataset.leg);
      const mode = chip.dataset.mode;
      legDraft[i].mode = mode;
      const row = chip.closest('[data-leg]');
      chip.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
      // relabel the line box for this mode (Bus no., Train line, Flight no.…) without losing focus/text
      const [label, ph] = lineHint(mode);
      row.querySelector('[data-linelabel]').textContent = label;
      row.querySelector('[data-k=line]').placeholder = ph;
      row.querySelector('.leg-fields').classList.toggle('no-line', mode === 'walk' && !legDraft[i].line);
    } else if (rm) {
      legDraft.splice(Number(rm.dataset.rmleg), 1);
      renderLegRows();
    }
  });
  $('#legRows').addEventListener('input', (e) => {
    const row = e.target.closest('[data-leg]');
    const k = e.target.dataset.k;
    if (row && ['detail', 'line', 'from', 'to'].includes(k)) legDraft[row.dataset.leg][k] = e.target.value;
    if (k === 'from' || k === 'to') showStationSuggestions(e.target);
  });

  // ---- Station name suggestions (only names used in this same trip) ----
  function tripStations(trip) {
    const seen = new Map(); // lower-case name -> { name, n }
    const add = (name) => {
      const v = String(name || '').trim(); if (!v) return;
      const key = v.toLowerCase(); const e = seen.get(key);
      if (e) e.n++; else seen.set(key, { name: v, n: 1 });
    };
    trip.days.forEach((d) => d.items.forEach((it) => it.legs.forEach((l) => { add(l.from); add(l.to); })));
    legDraft.forEach((l) => { add(l.from); add(l.to); }); // also what was just typed in this form
    return [...seen.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((e) => e.name);
  }
  function showStationSuggestions(input) {
    const row = input.closest('[data-leg]');
    const box = row.querySelector('[data-suggest]');
    const typed = input.value.trim().toLowerCase();
    const matches = tripStations(itemCtx.trip)
      .filter((n) => n.toLowerCase() !== typed && (!typed || n.toLowerCase().includes(typed)))
      .slice(0, 8);
    if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.dataset.for = input.dataset.k;
    box.innerHTML = matches.map((n) => `<button type="button" class="chip" data-station="${esc(n)}">📍 ${esc(n)}</button>`).join('');
    box.hidden = false;
  }
  $('#legRows').addEventListener('focusin', (e) => {
    if (e.target.dataset.k === 'from' || e.target.dataset.k === 'to') showStationSuggestions(e.target);
  });
  $('#legRows').addEventListener('focusout', (e) => {
    const row = e.target.closest('[data-leg]');
    if (!row || !(e.target.dataset.k === 'from' || e.target.dataset.k === 'to')) return;
    setTimeout(() => {
      const focused = document.activeElement;
      if (!row.contains(focused) || !['from', 'to'].includes(focused.dataset.k)) {
        const box = row.querySelector('[data-suggest]'); if (box) box.hidden = true;
      }
    }, 150);
  });
  // pointerdown + preventDefault keeps the keyboard open while tapping a suggestion
  $('#legRows').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-station]')) e.preventDefault(); });
  $('#legRows').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-station]');
    if (!chip) return;
    const row = chip.closest('[data-leg]');
    const box = chip.closest('[data-suggest]');
    const k = box.dataset.for;
    const input = row.querySelector(`[data-k=${k}]`);
    input.value = chip.dataset.station;
    legDraft[row.dataset.leg][k] = input.value;
    box.hidden = true;
    // picked a From → go straight to To
    const next = k === 'from' ? row.querySelector('[data-k=to]') : null;
    if (next && !next.value) next.focus(); else input.blur();
  });
  $('#addLeg').addEventListener('click', () => {
    const prev = legDraft[legDraft.length - 1];
    legDraft.push({ mode: prev && prev.mode !== 'walk' ? prev.mode : '', line: '', from: (prev && prev.to) || '', to: '', detail: '' });
    renderLegRows();
    const rows = $('#legRows').querySelectorAll('.leg-row');
    rows[rows.length - 1]?.scrollIntoView({ block: 'nearest' });
  });

  // Suggest a fare label from the matching transport leg, e.g. "206 fare"
  function farePlaceholder(i) {
    const l = legDraft[i] || legDraft[0];
    const name = l && (l.line || (l.mode && l.mode !== 'walk' ? modeOf(l.mode).label : ''));
    return `What for? e.g. ${name ? name + ' fare' : 'Bus fare / Grab'} (optional)`;
  }
  function renderFeeRows() {
    const { trip } = itemCtx;
    $('#feeRows').innerHTML = feeDraft.map((f, i) => `
      <div class="fee-row" data-i="${i}">
        <input class="label" type="text" data-k="label" value="${esc(f.label)}" placeholder="${esc(farePlaceholder(i))}" autocomplete="off" />
        <select data-k="currency" aria-label="Currency">${curOptions(trip, f.currency)}</select>
        <input type="number" data-k="amount" value="${f.amount === '' ? '' : esc(f.amount)}" inputmode="decimal" step="any" min="0" placeholder="Amount" aria-label="Amount" />
        <button type="button" class="rm" data-rm="${i}" aria-label="Remove fare">✕</button>
      </div>`).join('');
    updateFeeTotal();
  }
  function updateFeeTotal() {
    const { trip } = itemCtx;
    const fees = feeDraft.filter((f) => num(f.amount) > 0);
    const el = $('#feeTotal');
    if (!fees.length) { el.innerHTML = ''; return; }
    const s = sumBase(trip, fees);
    el.innerHTML = `Total <b>${esc(fmtDual(trip, fees))}</b>${s.missing.size
      ? ` <span class="warn">· no rate for ${esc([...s.missing].join(', '))} (offline?)</span> <button type="button" id="feeRates">Set rate</button>` : ''}`;
    $('#feeRates')?.addEventListener('click', () => openRatesDialog(trip, () => updateFeeTotal()));
  }
  $('#feeRows').addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row || !e.target.dataset.k) return;
    feeDraft[row.dataset.i][e.target.dataset.k] = e.target.value;
    updateFeeTotal();
    if (e.target.dataset.k === 'currency') {
      autoFillRates(itemCtx.trip, [e.target.value]).then((got) => { if (got.length && itemDialog.open) updateFeeTotal(); });
    }
  });
  $('#feeRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    feeDraft.splice(Number(b.dataset.rm), 1);
    if (!feeDraft.length) feeDraft.push({ label: '', amount: '', currency: itemCtx.trip.currency });
    renderFeeRows();
  });
  $('#addFee').addEventListener('click', () => {
    const last = feeDraft[feeDraft.length - 1];
    feeDraft.push({ label: '', amount: '', currency: last ? last.currency : itemCtx.trip.currency });
    renderFeeRows();
    const rows = $('#feeRows').querySelectorAll('.fee-row');
    rows[rows.length - 1]?.querySelector('.label').focus();
  });

  function openItemDialog(trip, day, item) {
    itemCtx = { trip, day, item };
    itemForm.reset();
    $('#itemDialogTitle').textContent = item ? 'Edit activity' : 'New activity';
    $('#itemDelete').style.display = item ? '' : 'none';
    $('#itemDuplicate').style.display = item ? '' : 'none';
    const f = itemForm.elements;
    if (item) {
      f.time.value = item.time || '';
      f.endTime.value = item.endTime || '';
      f.activity.value = item.activity || '';
      f.remarks.value = item.remarks || '';
      legDraft = item.legs.map((l) => ({ ...l }));
      feeDraft = item.fees.map((x) => ({ label: x.label, amount: String(x.amount), currency: x.currency }));
    } else {
      // Suggest a start time right after the last activity of the day
      const last = [...day.items].reverse().find((x) => x.endTime || x.time);
      f.time.value = last ? (last.endTime || last.time) : '';
      legDraft = [];
      feeDraft = [];
    }
    if (!feeDraft.length) feeDraft.push({ label: '', amount: '', currency: trip.currency });
    if (!legDraft.length) legDraft.push({ mode: '', line: '', from: '', to: '', detail: '' });
    renderLegRows();
    renderFeeRows();
    itemDialog.showModal();
    itemDialog.scrollTop = 0;
    if (!item) setTimeout(() => f.activity.focus(), 50);
  }

  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = itemForm.elements;
    const activity = f.activity.value.trim();
    if (!activity) { f.activity.focus(); return; }
    const { trip, day, item } = itemCtx;
    const fees = feeDraft
      .filter((x) => num(x.amount) > 0)
      .map((x) => ({ id: uid(), label: x.label.trim(), amount: num(x.amount), currency: normCur(x.currency) || trip.currency }));
    const data = {
      time: f.time.value, endTime: f.endTime.value, activity,
      legs: legDraft.map((l) => normalizeLeg({ ...l, detail: (l.detail || '').trim() })).filter((l) => l.mode || l.line || l.from || l.to || l.detail),
      fees, remarks: f.remarks.value.trim(),
    };
    let target;
    if (item) { Object.assign(item, data); target = item; }
    else { target = { id: uid(), ...data }; day.items.push(target); }
    day.items = sortItems(day.items);
    ui.cardIndex[day.id] = day.items.indexOf(target);
    save();
    itemDialog.close();
    renderTrip(trip);
    toast(item ? 'Saved' : 'Activity added');
  });
  $('#itemCancel').addEventListener('click', () => itemDialog.close());
  $('#itemDelete').addEventListener('click', () => {
    const { trip, day, item } = itemCtx;
    if (!confirm(`Delete "${item.activity}"?`)) return;
    const idx = day.items.indexOf(item);
    day.items.splice(idx, 1);
    ui.cardIndex[day.id] = Math.max(0, idx - 1);
    save(); itemDialog.close(); renderTrip(trip);
    toast('Deleted');
  });
  $('#itemDuplicate').addEventListener('click', () => {
    const { trip, day, item } = itemCtx;
    const copy = { ...item, id: uid(), legs: item.legs.map((l) => ({ ...l })), fees: item.fees.map((x) => ({ ...x, id: uid() })) };
    day.items.splice(day.items.indexOf(item) + 1, 0, copy);
    day.items = sortItems(day.items);
    ui.cardIndex[day.id] = day.items.indexOf(copy);
    save(); itemDialog.close(); renderTrip(trip);
    toast('Duplicated');
  });

  // ---------- Money dialog (daily spending, trip costs, budget allocations) ----------
  const spendDialog = $('#spendDialog');
  const spendForm = $('#spendForm');
  let spendCtx = null;
  let selectedCat = '';
  const KIND = {
    spend: { title: 'spending', what: 'Item *', ph: 'e.g. Matcha ice cream, souvenirs', toast: 'Spending' },
    cost: { title: 'trip cost', what: 'Item *', ph: 'e.g. Return flight KUL–ICN, hanbok rental', toast: 'Cost' },
    alloc: { title: 'allocation', what: 'Name (optional)', ph: 'e.g. Meals for 5 days', toast: 'Allocation' },
  };

  function updateSpendPreview() {
    const { trip } = spendCtx;
    const f = spendForm.elements;
    const code = f.currency.value;
    const isBase = code === trip.base;
    $('#spendRateField').style.display = isBase ? 'none' : '';
    $('#spendRateFrom').textContent = code;
    $('#spendRateTo').textContent = sym(trip.base);
    const rate = isBase ? 1 : num(f.rate.value);
    const amt = num(f.amount.value);
    $('#spendConverted').innerHTML = isBase
      ? ''
      : rate ? `In ${esc(sym(trip.base))}: <b>${esc(fmtMoney(amt * rate, trip.base, true))}</b>`
        : '<span class="warn">Enter the exchange rate to see the price in ' + esc(sym(trip.base)) + '</span>';
  }
  async function fillSpendRate() {
    const { trip } = spendCtx;
    const f = spendForm.elements;
    const code = f.currency.value;
    f.rate.value = fmtRate(rateOf(trip, code));
    $('#spendXe').href = xeUrl(code, trip.base);
    updateSpendPreview();
    if (code === trip.base || f.rate.value) return;
    f.rate.placeholder = 'Getting today’s rate…';
    await autoFillRates(trip, [code]);
    f.rate.placeholder = 'rate';
    if (f.currency.value === code && !f.rate.value && trip.rates[code]) {
      f.rate.value = fmtRate(trip.rates[code]);
      updateSpendPreview();
    }
  }
  spendForm.elements.currency.addEventListener('change', fillSpendRate);
  spendForm.elements.amount.addEventListener('input', updateSpendPreview);
  spendForm.elements.rate.addEventListener('input', updateSpendPreview);
  $('#payerChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-payer]');
    if (!b) return;
    spendForm.elements.paidBy.value = b.dataset.payer;
    renderPayerChips();
  });
  spendForm.elements.paidBy.addEventListener('input', () => renderPayerChips());
  function renderPayerChips() {
    const cur = spendForm.elements.paidBy.value.trim();
    $('#payerChips').innerHTML = knownPayers(spendCtx.trip).map((p) =>
      `<button type="button" class="chip ${p === cur ? 'on' : ''}" data-payer="${esc(p)}">🙋 ${esc(p)}</button>`).join('');
  }
  function renderCatChips() {
    $('#catChips').innerHTML = CATS.map((c) =>
      `<button type="button" class="chip ${c.id === selectedCat ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('');
  }
  $('#catChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    selectedCat = b.dataset.cat;
    renderCatChips();
  });

  // kind: 'spend' (list = day.spend) | 'cost' (trip.costs) | 'alloc' (trip.allocs)
  function openMoneyDialog(kind, trip, list, sp) {
    spendCtx = { kind, trip, list, sp };
    const K = KIND[kind];
    spendForm.reset();
    const f = spendForm.elements;
    $('#spendDialogTitle').textContent = `${sp ? 'Edit' : 'New'} ${K.title}`;
    $('#spendWhatLabel').textContent = K.what;
    f.what.placeholder = K.ph;
    f.what.required = kind !== 'alloc';
    $('#spendPriceLabel').textContent = kind === 'alloc' ? 'Amount set aside' : 'Price';
    $('#catField').style.display = kind === 'spend' ? 'none' : '';
    $('#payerLabel').textContent = kind === 'alloc' ? 'For who (optional)' : 'Who paid';
    f.paidBy.placeholder = kind === 'alloc' ? 'e.g. Lee — leave empty if shared' : 'Name';
    $('#spendDelete').style.display = sp ? '' : 'none';
    const code = sp ? sp.currency : (kind === 'spend' ? trip.lastSpendCurrency || trip.currency : trip.currency);
    f.currency.innerHTML = curOptions(trip, code);
    f.currency.value = code;
    selectedCat = sp ? sp.category || '' : (kind === 'alloc' ? 'meals' : kind === 'cost' ? 'flight' : '');
    if (sp) {
      f.what.value = sp.item;
      f.amount.value = sp.amount || '';
      f.paidBy.value = (kind === 'alloc' ? sp.forWho : sp.paidBy) || '';
    } else {
      f.paidBy.value = kind === 'spend' ? trip.lastPayer || '' : '';
    }
    renderCatChips();
    renderPayerChips();
    fillSpendRate();
    spendDialog.showModal();
    spendDialog.scrollTop = 0;
    if (!sp) setTimeout(() => f.what.focus(), 50);
  }
  const openSpendDialog = (trip, day, sp) => openMoneyDialog('spend', trip, day.spend, sp);

  spendForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = spendForm.elements;
    const { kind, trip, list, sp } = spendCtx;
    const itemName = f.what.value.trim() || (kind === 'alloc' ? catOf(selectedCat).label : '');
    if (!itemName) { f.what.focus(); return; }
    const currency = normCur(f.currency.value) || trip.currency;
    const rate = num(f.rate.value);
    if (currency !== trip.base && rate > 0) trip.rates[currency] = rate;
    const data = { item: itemName, amount: num(f.amount.value), currency, paidBy: kind === 'alloc' ? '' : f.paidBy.value.trim() };
    if (kind === 'alloc') data.forWho = f.paidBy.value.trim();
    if (kind !== 'spend') data.category = selectedCat;
    if (sp) Object.assign(sp, data);
    else list.push({ id: uid(), ...data });
    if (kind === 'spend') { trip.lastPayer = data.paidBy; trip.lastSpendCurrency = currency; }
    save(); spendDialog.close(); renderTrip(trip);
    toast(sp ? 'Saved' : `${KIND[kind].toast} added`);
  });
  $('#spendCancel').addEventListener('click', () => spendDialog.close());
  $('#spendDelete').addEventListener('click', () => {
    const { trip, list, sp } = spendCtx;
    if (!confirm(`Delete "${sp.item}"?`)) return;
    list.splice(list.indexOf(sp), 1);
    save(); spendDialog.close(); renderTrip(trip);
    toast('Deleted');
  });

  // ---------- Live exchange rates ----------
  // Free daily mid-market rates (similar to XE's). XE's own API is paid and needs a secret key,
  // so XE is offered as a one-tap link to compare instead.
  const xeUrl = (from, to) => `https://www.xe.com/currencyconverter/convert/?Amount=1&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}`;
  const rateCache = {}; // base -> { at, rates } or { failedAt }
  async function fetchRateTable(base) {
    const c = rateCache[base];
    if (c?.rates && Date.now() - c.at < 60 * 60 * 1000) return c.rates;
    if (c?.failedAt && Date.now() - c.failedAt < 60 * 1000) throw new Error('recently failed');
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
      const data = await res.json();
      if (data.result !== 'success' || !data.rates) throw new Error('bad response');
      rateCache[base] = { at: Date.now(), rates: data.rates };
      return data.rates;
    } catch (err) {
      rateCache[base] = { failedAt: Date.now() };
      throw err;
    }
  }
  const todayLabel = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // Fill in rates the trip doesn't have yet. Never overwrites a rate you typed. Returns the codes filled.
  async function autoFillRates(trip, codes = tripCurrencies(trip)) {
    const missing = [...new Set(codes)].filter((c) => c && c !== trip.base && !trip.rates[c]);
    if (!missing.length || navigator.onLine === false) return [];
    try {
      const table = await fetchRateTable(trip.base);
      const got = missing.filter((c) => table[c] > 0);
      got.forEach((c) => { trip.rates[c] = Number((1 / table[c]).toPrecision(6)); });
      if (got.length) { trip.ratesUpdated = todayLabel(); save(); }
      return got;
    } catch (err) {
      return [];
    }
  }

  // ---------- Rates dialog ----------
  const ratesDialog = $('#ratesDialog');
  const ratesForm = $('#ratesForm');
  let ratesCtx = null;

  function renderRates() {
    const { trip, codes, values } = ratesCtx;
    $('#ratesNote').innerHTML = `How much 1 unit of each currency is worth in <b>${esc(trip.base)}</b>. Rates fill in automatically when you're online (daily market rates, like XE)${trip.ratesUpdated ? ` — last updated ${esc(trip.ratesUpdated)}` : ''}. Tap <b>XE ↗</b> to compare, or type your money changer's rate.`;
    $('#ratesList').innerHTML = codes.length ? codes.map((c) => `
      <div class="rate-line" data-code="${c}">1 <b>${c}</b> =
        <input type="number" step="any" min="0" inputmode="decimal" value="${esc(fmtRate(values[c]))}" placeholder="rate" aria-label="${c} rate" />
        <b>${esc(sym(trip.base))}</b>
        <a class="xe" href="${xeUrl(c, trip.base)}" target="_blank" rel="noopener">XE ↗</a>
        <button type="button" class="rm" data-rm="${c}" aria-label="Remove ${c}">✕</button>
      </div>`).join('') : '<p class="muted-note">Only one currency so far. Add the currencies you will spend in.</p>';
    $('#ratesAddSel').innerHTML = CURRENCIES.map(([c, , name]) => c)
      .filter((c) => c !== trip.base && !codes.includes(c))
      .map((c) => `<option value="${c}">${c}</option>`).join('');
  }
  function readRateInputs() {
    $('#ratesList').querySelectorAll('[data-code]').forEach((row) => { ratesCtx.values[row.dataset.code] = num(row.querySelector('input').value); });
  }
  function openRatesDialog(trip, onDone) {
    const codes = tripCurrencies(trip);
    ratesCtx = { trip, codes, values: { ...trip.rates }, onDone };
    renderRates();
    ratesDialog.showModal();
    fillMissingInDialog();
  }
  // Fetch rates for currencies in the dialog that are still blank (keeps anything typed)
  async function fillMissingInDialog() {
    const ctx = ratesCtx;
    const blank = ctx.codes.filter((c) => !ctx.values[c]);
    if (!blank.length || navigator.onLine === false) return;
    try {
      const table = await fetchRateTable(ctx.trip.base);
      if (ratesCtx !== ctx || !ratesDialog.open) return;
      readRateInputs();
      let n = 0;
      blank.forEach((c) => { if (!ctx.values[c] && table[c] > 0) { ctx.values[c] = 1 / table[c]; n++; } });
      if (n) { ctx.fetched = todayLabel(); renderRates(); }
    } catch (err) { /* offline: leave blank for manual entry */ }
  }
  $('#ratesAdd').addEventListener('click', () => {
    readRateInputs();
    const c = $('#ratesAddSel').value;
    if (c && !ratesCtx.codes.includes(c)) ratesCtx.codes.push(c);
    renderRates();
    fillMissingInDialog();
  });
  $('#ratesList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    readRateInputs();
    ratesCtx.codes = ratesCtx.codes.filter((c) => c !== b.dataset.rm);
    delete ratesCtx.values[b.dataset.rm];
    renderRates();
  });
  $('#ratesFetch').addEventListener('click', async () => {
    const { trip } = ratesCtx;
    readRateInputs();
    const btn = $('#ratesFetch');
    btn.disabled = true; btn.textContent = 'Fetching…';
    try {
      delete rateCache[trip.base]; // force fresh numbers
      const table = await fetchRateTable(trip.base);
      let n = 0;
      ratesCtx.codes.forEach((c) => { if (table[c] > 0) { ratesCtx.values[c] = 1 / table[c]; n++; } });
      ratesCtx.fetched = todayLabel();
      renderRates();
      toast(n ? `Updated ${plural(n, 'rate', 'rates')} — tap Save to keep` : 'No rates to update');
    } catch (err) {
      toast('⚠️ Could not get rates — enter them manually');
    } finally {
      btn.disabled = false; btn.textContent = '🔄 Update all to today’s rates';
    }
  });
  ratesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    readRateInputs();
    const { trip, codes, values, onDone, fetched } = ratesCtx;
    const rates = {};
    codes.forEach((c) => { if (values[c] > 0) rates[c] = values[c]; });
    trip.rates = rates;
    if (fetched) trip.ratesUpdated = fetched;
    save(); ratesDialog.close();
    if (onDone) onDone(); else renderTrip(trip);
    toast('Rates saved');
  });
  $('#ratesCancel').addEventListener('click', () => ratesDialog.close());

  // ---------- Spending summary ----------
  function openSummary(trip) {
    const spend = tripSpend(trip);
    const fees = sumBase(trip, tripFees(trip));
    const spent = sumBase(trip, spend);
    const costs = sumBase(trip, trip.costs);
    const people = byPerson(trip, [...trip.costs, ...spend]);
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog">
      <div class="sheet-handle"></div>
      <h2>💸 Spending summary</h2>
      <p class="muted-note">All amounts converted to ${esc(trip.base)}.</p>
      <table class="summary-table"><tbody>
        ${trip.days.map((d, i) => {
          const s = sumBase(trip, d.spend);
          return `<tr><td>Day ${i + 1}${d.title ? ' · ' + esc(d.title) : ''}</td><td>${esc(fmtBase(trip, s))}</td></tr>`;
        }).join('')}
        <tr><td><b>Total daily spending</b></td><td>${esc(fmtBase(trip, spent))}</td></tr>
        <tr><td>✈️ Trip costs (flights, rentals…)</td><td>${esc(fmtBase(trip, costs))}</td></tr>
        <tr><td><b>Paid so far</b></td><td>${esc(fmtMoney(spent.total + costs.total, trip.base, true))}</td></tr>
      </tbody></table>
      <h2 style="font-size:1rem">Who paid</h2>
      ${people.length ? `<table class="summary-table"><tbody>
        ${people.map(([who, v]) => `<tr><td>🙋 ${esc(who)}</td><td>${esc(fmtBase(trip, v))}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted-note">No spending recorded yet.</p>'}
      <p class="muted-note">Transport fees for the whole trip: <b>${esc(fmtBase(trip, fees))}</b></p>
      <p class="muted-note">“Who paid” includes trip costs and daily spending.</p>
      ${spent.missing.size || fees.missing.size || costs.missing.size ? `<p class="warn" style="margin:0;font-size:.85rem">* Some amounts have no exchange rate yet and are not counted.</p>` : ''}
      <div class="sheet-actions"><span class="spacer"></span><button class="btn primary">Close</button></div>
    </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  // ---------- Trip dialog ----------
  const tripDialog = $('#tripDialog');
  const tripForm = $('#tripForm');
  let tripCtx = null;

  function openTripDialog(trip) {
    tripCtx = trip || null;
    tripForm.reset();
    const f = tripForm.elements;
    $('#tripDialogTitle').textContent = trip ? 'Edit trip' : 'New trip';
    $('#tripDelete').style.display = trip ? '' : 'none';
    f.currency.innerHTML = allCurOptions(trip ? trip.currency : 'MYR');
    f.base.innerHTML = allCurOptions(trip ? trip.base : 'MYR');
    if (trip) {
      f.name.value = trip.name;
      f.startDate.value = trip.startDate || '';
      f.dayCount.value = trip.days.length;
    } else {
      f.dayCount.value = 3;
    }
    tripDialog.showModal();
    if (!trip) setTimeout(() => f.name.focus(), 50);
  }

  // Re-express saved rates when the "convert to" currency changes
  function rebaseRates(trip, newBase) {
    if (newBase === trip.base) return;
    const r = trip.rates[newBase];
    const next = {};
    if (r) {
      Object.entries(trip.rates).forEach(([c, v]) => { if (c !== newBase) next[c] = v / r; });
      next[trip.base] = 1 / r;
    }
    trip.rates = next;
    trip.base = newBase;
  }

  tripForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = tripForm.elements;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }
    const count = Math.max(1, Math.min(60, parseInt(f.dayCount.value, 10) || 1));
    const trip = tripCtx || { id: uid(), days: [], rates: {}, base: f.base.value, costs: [], allocs: [], travellers: 1 };
    trip.name = name;
    trip.startDate = f.startDate.value;
    trip.currency = normCur(f.currency.value) || 'MYR';
    rebaseRates(trip, normCur(f.base.value) || 'MYR');

    if (count < trip.days.length) {
      const dropped = trip.days.slice(count);
      const lost = dropped.reduce((a, d) => a + d.items.length + d.spend.length, 0);
      if (lost && !confirm(`Reducing to ${count} day(s) will remove ${plural(lost, 'entry', 'entries')} (activities and spending). Continue?`)) return;
      trip.days.length = count;
    }
    while (trip.days.length < count) trip.days.push({ id: uid(), title: '', items: [], spend: [] });

    if (!tripCtx) db.trips.unshift(trip);
    save();
    tripDialog.close();
    if (tripCtx) route();
    else location.hash = `#/trip/${trip.id}`;
  });
  $('#tripCancel').addEventListener('click', () => tripDialog.close());
  $('#tripDelete').addEventListener('click', () => { tripDialog.close(); deleteTrip(tripCtx); });

  function deleteTrip(trip) {
    const others = otherMembers(trip);
    const msg = others.length
      ? `Remove "${trip.name}" from your trips?${trip.owner === sync.user?.email ? ` It will also be deleted for ${others.join(', ')}.` : ' The others keep their copy.'}`
      : `Delete trip "${trip.name}" and all its activities and spending?`;
    if (!confirm(msg)) return;
    cloudDelete(trip);
    db.trips = db.trips.filter((t) => t !== trip);
    save();
    location.hash = '#/';
    route();
    toast('Trip deleted');
  }

  // ---------- Day dialog ----------
  const dayDialog = $('#dayDialog');
  const dayForm = $('#dayForm');
  let dayCtx = null;

  function openDayDialog(trip, i) {
    dayCtx = { trip, i };
    const d = dayDate(trip, i);
    $('#dayDialogTitle').textContent = `Day ${i + 1}${d ? ' · ' + fmtDate(d) : ''}`;
    dayForm.elements.title.value = trip.days[i].title || '';
    $('#dayDelete').style.display = trip.days.length > 1 ? '' : 'none';
    dayDialog.showModal();
  }
  dayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { trip, i } = dayCtx;
    trip.days[i].title = dayForm.elements.title.value.trim();
    save(); dayDialog.close(); renderTrip(trip);
  });
  $('#dayCancel').addEventListener('click', () => dayDialog.close());
  $('#dayDelete').addEventListener('click', () => {
    const { trip, i } = dayCtx;
    const n = trip.days[i].items.length + trip.days[i].spend.length;
    if (!confirm(`Delete Day ${i + 1}${n ? ` and its ${plural(n, 'entry', 'entries')}` : ''}? Later days will shift up.`)) return;
    trip.days.splice(i, 1);
    ui.dayIndex[trip.id] = Math.max(0, i - 1);
    save(); dayDialog.close(); renderTrip(trip);
  });

  // Close any bottom sheet when tapping the dimmed backdrop
  document.querySelectorAll('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });

  // ---------- Export / import ----------
  const safeName = (s) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'itinerary';

  function exportJSON(trip) {
    const payload = { app: 'swipe-itinerary', version: 2, trips: trip && trip.id ? [trip] : db.trips };
    download(`${trip && trip.id ? safeName(trip.name) : 'itinerary-backup'}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded');
  }

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const trips = Array.isArray(data.trips) ? data.trips : [];
      let added = 0;
      trips.forEach((t) => {
        if (!t || typeof t.name !== 'string' || !Array.isArray(t.days)) return;
        db.trips.push(normalizeTrip(t, true));
        added++;
      });
      save(); route();
      toast(added ? `Restored ${plural(added, 'trip', 'trips')}` : 'No trips found in that file');
    } catch (err) {
      toast('⚠️ That file is not a valid backup');
    }
  });

  async function copyDay(trip, i) {
    const d = trip.days[i];
    const date = dayDate(trip, i);
    const lines = [`${trip.name} — Day ${i + 1}${date ? ' (' + fmtDate(date) + ')' : ''}${d.title ? ': ' + d.title : ''}`, ''];
    sortItems(d.items).forEach((it) => {
      lines.push(`${it.time ? fmtTime(it.time) + (it.endTime ? '–' + fmtTime(it.endTime) : '') : '•'}  ${it.activity}`);
      if (it.legs.length) lines.push(`   ${legsText(it.legs)}`);
      it.fees.forEach((f) => lines.push(`   🎫 ${f.label ? f.label + ': ' : ''}${fmtMoney(f.amount, f.currency)}`));
      if (it.remarks) lines.push(`   📝 ${it.remarks}`);
    });
    lines.push('', `Transport fees: ${fmtDual(trip, itemFees(d.items))}`);
    if (d.spend.length) {
      lines.push('', '💸 Spending');
      d.spend.forEach((s) => {
        const v = toBase(trip, s.amount, s.currency);
        lines.push(`• ${s.item} — ${fmtMoney(s.amount, s.currency)}${s.currency !== trip.base && v != null ? ` (${fmtMoney(v, trip.base, true)})` : ''}${s.paidBy ? ` · paid by ${s.paidBy}` : ''}`);
      });
      lines.push(`Spent: ${fmtBase(trip, sumBase(trip, d.spend))}`);
    }
    const text = lines.join('\n');
    try {
      if (navigator.share) { await navigator.share({ title: trip.name, text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('⚠️ Could not copy');
    }
  }

  // ---------- Sample data ----------
  function createSample() {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const fee = (amount, label = '', currency = 'JPY') => ({ id: uid(), label, amount, currency });
    // legs: 'mode:line:details' strings, e.g. 'bus:206:To Gojozaka'
    const mk = (time, endTime, activity, legs, fees, remarks) => ({
      id: uid(), time, endTime, activity, fees, remarks,
      legs: legs.map((x) => { const [mode, line, ...d] = x.split(':'); return { mode, line, detail: d.join(':') }; }),
    });
    const sp = (item, amount, paidBy, currency = 'JPY') => ({ id: uid(), item, amount, currency, paidBy });
    const trip = normalizeTrip({
      id: uid(), name: 'Kyoto & Osaka (sample)', startDate: iso, currency: 'JPY', base: 'MYR',
      rates: { JPY: 0.029, USD: 4.2 }, travellers: 2,
      costs: [
        { item: 'Return flight KUL–KIX ×2', category: 'flight', amount: 2380, currency: 'MYR', paidBy: 'Aina' },
        { item: 'Hotel Granvia, 3 nights', category: 'lodging', amount: 66000, currency: 'JPY', paidBy: 'Hafiz' },
        { item: 'Kimono rental ×2', category: 'rental', amount: 9000, currency: 'JPY', paidBy: 'Aina' },
        { item: 'Travel insurance', category: 'insurance', amount: 120, currency: 'MYR', paidBy: 'Hafiz' },
      ],
      allocs: [
        { item: 'Meals', category: 'meals', amount: 600, currency: 'MYR' },
        { item: 'Shopping & souvenirs', category: 'shopping', amount: 400, currency: 'MYR' },
      ],
      days: [
        { title: 'Arrive & explore Kyoto', items: [
          mk('08:30', '09:45', 'Kansai Airport → Kyoto Station', ['train:JR Haruka Express:Platform 30, to Kyoto Stn'], [fee(3600, 'Haruka ticket')], 'Buy ICOCA & Haruka combo at JR ticket office'),
          mk('10:15', '10:45', 'Check in luggage at hotel', ['walk::8 min from Kyoto Stn, Hachijo exit'], [], 'Hotel Granvia — check-in from 3 PM'),
          mk('11:00', '13:30', 'Fushimi Inari Taisha', ['walk::Back to Kyoto Stn', 'train:JR Nara Line:To Inari (2 stops)'], [fee(150, 'JR Nara Line')], 'Go up to Yotsutsuji viewpoint (~45 min hike). Wear good shoes!'),
          mk('14:30', '17:00', 'Kiyomizu-dera & Sannenzaka', ['train:JR Nara Line:Back to Kyoto Stn', 'bus:206:Bus stop D2 → Gojozaka'], [fee(150, 'JR Nara Line'), fee(230, 'Bus 206')], ''),
          mk('18:30', '', 'Dinner at Pontocho Alley', ['bus:207:To Shijo Kawaramachi', 'walk::5 min to Pontocho'], [fee(230, 'Bus 207')], 'Reservation under "Tan" — 7 PM'),
        ], spend: [
          sp('ICOCA card deposit', 2000, 'Hafiz'),
          sp('Kiyomizu-dera temple entry ×2', 800, 'Aina'),
          sp('Dinner set menu, Pontocho', 8000, 'Hafiz'),
          sp('Matcha ice cream ×2', 1000, 'Aina'),
          sp('Omamori charms', 1500, 'Hafiz'),
          sp('eSIM (bought online)', 12, 'Aina', 'USD'),
          sp('Snacks at 7-Eleven', 860, 'Hafiz'),
        ] },
        { title: 'Arashiyama', items: [
          mk('07:30', '09:00', 'Bamboo Grove (early, before crowds)', ['train:JR Sagano Line:To Saga-Arashiyama'], [fee(240)], ''),
          mk('09:30', '11:00', 'Tenryu-ji Temple', ['walk::'], [], ''),
          mk('12:00', '', 'Lunch: yudofu', ['walk::'], [], ''),
        ], spend: [sp('Tenryu-ji garden + temple ×2', 1000, 'Hafiz'), sp('Yudofu lunch ×2', 5000, 'Aina'), sp('Rickshaw ride', 4000, 'Aina')] },
        { title: 'Osaka day trip', items: [
          mk('09:00', '09:30', 'Kyoto → Osaka', ['train:JR Special Rapid:To Osaka Stn'], [fee(580)], ''),
          mk('10:00', '12:00', 'Osaka Castle', ['metro:Midosuji Line:To Hommachi', 'metro:Chuo Line:To Tanimachi 4-chome'], [fee(240, 'Metro (with transfer)')], ''),
          mk('18:00', '', 'Street food in Dotonbori', ['metro:Tanimachi Line:To Higashi-Umeda', 'walk::Underground passage to Umeda', 'metro:Midosuji Line:To Namba'], [fee(290, 'Metro')], 'Try takoyaki at Wanaka'),
        ], spend: [sp('Osaka Castle entry ×2', 1200, 'Hafiz'), sp('Takoyaki & street food', 3000, 'Aina')] },
      ],
    });
    db.trips.unshift(trip);
    save();
    location.hash = `#/trip/${trip.id}`;
  }

  // ---------- Online sync & sharing (see cloud.js) ----------
  const sync = {
    available: false, // Firebase loaded
    failed: false,    // Firebase could not load (offline / blocked)
    user: null,       // { email, name } when signed in
    ready: false,     // first list of online trips received for this user
    state: 'idle',    // idle | syncing | synced | offline | error
    known: new Set(), // trip ids that exist online
    pushed: {},       // tripId -> content last uploaded/received
    pending: [],      // online changes waiting until no form is open
    timer: null,
  };
  const TOMB_KEY = STORE_KEY + '.deleted'; // trips deleted here that still need deleting online
  let tombstones = (() => { try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || []; } catch (e) { return []; } })();
  const saveTombs = () => { try { localStorage.setItem(TOMB_KEY, JSON.stringify(tombstones)); } catch (e) { /* ignore */ } };
  const shortEmail = (e) => String(e).split('@')[0];
  const otherMembers = (t) => t.members.filter((m) => m !== sync.user?.email && m !== (sync.user ? '' : t.owner));
  const isMine = (t) => sync.user && (!t.members.length || t.members.includes(sync.user.email));

  function syncStatusText() {
    if (!sync.user) return '';
    if (!sync.ready) return 'Connecting…';
    return {
      syncing: 'Uploading…', synced: 'All saved online ✓', offline: 'Offline — will upload when back online',
      error: '⚠️ Some changes could not be uploaded', idle: 'All saved online ✓',
    }[sync.state];
  }
  function syncBarHTML() {
    if (sync.user) {
      return `<div class="sync-bar on"><span>☁️ <b>${esc(sync.user.email)}</b><small id="syncStatus">${esc(syncStatusText())}</small></span>
        <button class="link-btn" id="signOutBtn">Sign out</button></div>`;
    }
    if (sync.available) {
      return `<div class="sync-bar"><div><b>☁️ Save trips online &amp; share with family</b>
        <small>Sign in to keep trips safe and edit them together on different phones.</small></div>
        <button class="btn primary small" id="signInBtn">Sign in with Google</button></div>`;
    }
    return sync.failed ? '<div class="sync-bar muted"><small>☁️ Online sync is unavailable right now (offline?). Your trips are saved on this phone.</small></div>' : '';
  }
  function refreshSyncUI() {
    const bar = $('#syncBar');
    if (bar) { bar.innerHTML = syncBarHTML(); wireSyncBar(); }
    const st = $('#syncStatus');
    if (st) st.textContent = syncStatusText();
    if (shareCtx && shareDialog.open) renderShare();
  }
  function setSyncState(s) { sync.state = s; refreshSyncUI(); }
  function wireSyncBar() {
    $('#signInBtn')?.addEventListener('click', signIn);
    $('#signOutBtn')?.addEventListener('click', () => {
      if (!confirm('Sign out? Your trips stay on this phone but stop syncing until you sign in again.')) return;
      window.Cloud.signOut();
    });
  }
  async function signIn() {
    try { await window.Cloud.signIn(); }
    catch (err) {
      const why = err && err.code === 'auth/unauthorized-domain'
        ? 'this web address is not allowed in Firebase (Authentication → Settings → Authorized domains)'
        : (err && (err.code || err.message)) || 'unknown error';
      toast(`⚠️ Sign-in failed: ${why}`);
    }
  }

  function scheduleSync() {
    if (!sync.ready) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(pushChanges, 600);
  }
  // Upload trips edited on this phone (and trips that aren't online yet)
  async function pushChanges() {
    if (!sync.ready || !window.Cloud) return;
    const me = sync.user.email;
    const jobs = [];
    db.trips.forEach((t) => {
      if (t.cloudBlocked || !isMine(t)) return;
      const key = contentKey(t);
      if (sync.known.has(t.id) && sync.pushed[t.id] === key) return;
      sync.pushed[t.id] = key;
      if (sync.known.has(t.id)) {
        jobs.push(window.Cloud.update(t.id, { json: JSON.stringify(t), updatedAt: t.updatedAt || Date.now() }).catch((err) => pushFailed(t, err)));
      } else {
        t.members = [me]; t.owner = me;
        sync.known.add(t.id);
        jobs.push(window.Cloud.create(t.id, { json: JSON.stringify(t), updatedAt: t.updatedAt || Date.now(), members: [me], owner: me })
          .catch((err) => pushFailed(t, err)));
      }
    });
    if (!jobs.length) return;
    writeLocal();
    setSyncState(navigator.onLine === false ? 'offline' : 'syncing');
    await Promise.all(jobs); // resolves once the server has the changes
    if (sync.state === 'syncing' || sync.state === 'offline') setSyncState('synced');
  }
  function pushFailed(t, err) {
    console.warn('Upload failed', t.id, err);
    if (err && err.code === 'permission-denied') t.cloudBlocked = true; // e.g. removed from a shared trip: keep as a local copy
    if (err && err.code === 'not-found') { sync.known.delete(t.id); delete sync.pushed[t.id]; }
    setSyncState('error');
  }

  // Online trips changed (from another phone, or the first list after signing in)
  function onCloudChanges(changes) {
    sync.pending.push(...changes);
    applyPending();
  }
  function applyPending() {
    if (!sync.user || document.querySelector('dialog[open]')) return; // wait: a form may be editing this trip
    const changes = sync.pending.splice(0);
    let changed = false;
    changes.forEach((c) => {
      if (c.pending) return; // our own upload echoing back
      const i = db.trips.findIndex((t) => t.id === c.id);
      const local = db.trips[i];
      if (c.type === 'removed') {
        sync.known.delete(c.id); delete sync.pushed[c.id];
        if (local && local.members.length) {
          db.trips.splice(i, 1); changed = true;
          toast(`“${local.name}” was removed or is no longer shared with you`);
        }
        return;
      }
      sync.known.add(c.id);
      if (tombstones.includes(c.id)) { finishDelete(c.id, c.data); return; }
      let remote;
      try { remote = normalizeTrip({ ...JSON.parse(c.data.json), id: c.id }); } catch (e) { return; }
      remote.members = (c.data.members || []).map((m) => String(m).toLowerCase());
      remote.owner = String(c.data.owner || '').toLowerCase();
      remote.updatedAt = Number(c.data.updatedAt) || 0;
      const rk = contentKey(remote);
      if (local) {
        const membersChanged = local.members.join() !== remote.members.join() || local.owner !== remote.owner;
        local.members = remote.members; local.owner = remote.owner;
        if (membersChanged) changed = true;
        const lk = contentKey(local);
        if (lk === rk) { sync.pushed[c.id] = rk; return; }
        // Edited on this phone more recently than the online copy: keep ours, it gets uploaded
        if ((local.updatedAt || 0) > remote.updatedAt) return;
        db.trips[i] = remote;
      } else {
        db.trips.unshift(remote);
        if (sync.ready) toast(`👥 “${remote.name}” was shared with you`);
      }
      sync.pushed[c.id] = rk;
      localKeys[c.id] = rk;
      changed = true;
    });
    if (changed) { writeLocal(); route(); }
    if (!sync.ready) { sync.ready = true; refreshSyncUI(); }
    scheduleSync();
  }
  // Apply waiting online changes once a form closes
  document.querySelectorAll('dialog').forEach((dlg) => dlg.addEventListener('close', () => setTimeout(applyPending, 0)));

  function cloudDelete(trip) {
    if (!trip.members.length) return; // never uploaded
    if (!tombstones.includes(trip.id)) { tombstones.push(trip.id); saveTombs(); }
    if (sync.ready) finishDelete(trip.id, trip);
  }
  // Owner (or only member) deletes the online trip; anyone else just leaves it
  function finishDelete(id, data) {
    const me = sync.user.email;
    const members = data.members || [];
    const job = data.owner === me || members.length <= 1 ? window.Cloud.remove(id) : window.Cloud.removeMember(id, me);
    sync.known.delete(id); delete sync.pushed[id];
    const done = () => { tombstones = tombstones.filter((x) => x !== id); saveTombs(); };
    job.then(done).catch((err) => { if (err && (err.code === 'permission-denied' || err.code === 'not-found')) done(); });
  }

  // ---------- Share dialog ----------
  const shareDialog = $('#shareDialog');
  let shareCtx = null;
  function openShareDialog(trip) {
    shareCtx = { tripId: trip.id };
    renderShare();
    shareDialog.showModal();
  }
  function renderShare() {
    const trip = db.trips.find((t) => t.id === shareCtx.tripId);
    const body = $('#shareBody');
    if (!trip) { body.innerHTML = '<p class="muted-note">This trip is no longer available.</p>'; return; }
    if (!sync.available) {
      body.innerHTML = '<p class="muted-note">Online sharing isn’t available right now — check your internet connection and try again.</p>';
      return;
    }
    if (!sync.user) {
      body.innerHTML = `<p class="muted-note">Sign in with Google to save “${esc(trip.name)}” online and share it. Your husband, family or friends sign in with their own Google account on their phone, and you both see and edit the same trip.</p>
        <button type="button" class="btn primary" id="shareSignIn">Sign in with Google</button>`;
      $('#shareSignIn').addEventListener('click', signIn);
      return;
    }
    const me = sync.user.email;
    const online = sync.known.has(trip.id);
    const owner = trip.owner || me;
    const amOwner = owner === me;
    const members = trip.members.length ? trip.members : [me];
    body.innerHTML = `
      <p class="muted-note">Everyone here can see and edit <b>${esc(trip.name)}</b>. Changes show on all phones within seconds.</p>
      <ul class="member-list">
        ${members.map((m) => `<li><span class="avatar">${esc(m[0].toUpperCase())}</span>
          <span class="who"><b>${esc(m)}</b><small>${m === me ? 'You' : ''}${m === owner ? `${m === me ? ' · ' : ''}Owner` : ''}</small></span>
          ${amOwner && m !== me ? `<button type="button" class="rm" data-unshare="${esc(m)}" aria-label="Stop sharing with ${esc(m)}">✕</button>` : ''}</li>`).join('')}
      </ul>
      <label class="field"><span>Add by Google email</span>
        <div class="money share-add">
          <input type="email" id="shareEmail" placeholder="husband@gmail.com" autocomplete="email" inputmode="email" />
          <button type="button" class="btn primary small" id="shareAdd" ${online ? '' : 'disabled'}>Share</button>
        </div></label>
      ${online ? '' : '<p class="muted-note">Uploading this trip first…</p>'}
      <ol class="share-steps">
        <li>Send them the app link: <b>${esc(location.origin + location.pathname)}</b></li>
        <li>They tap <b>Sign in with Google</b> using the email above.</li>
        <li>The trip appears in their <b>My Trips</b> automatically.</li>
      </ol>
      ${amOwner ? '' : '<button type="button" class="btn ghost danger" id="shareLeave">Leave this trip</button>'}`;
    $('#shareAdd').addEventListener('click', () => addMember(trip));
    $('#shareEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(trip); } });
    body.querySelectorAll('[data-unshare]').forEach((b) => b.addEventListener('click', () => {
      const email = b.dataset.unshare;
      if (!confirm(`Stop sharing “${trip.name}” with ${email}? It disappears from their phone.`)) return;
      trip.members = trip.members.filter((m) => m !== email);
      writeLocal(); renderShare();
      window.Cloud.removeMember(trip.id, email).catch(() => toast('⚠️ Could not update sharing — try again online'));
    }));
    $('#shareLeave')?.addEventListener('click', () => {
      shareDialog.close();
      deleteTrip(trip);
    });
    if (!online) pushChanges();
  }
  function addMember(trip) {
    const input = $('#shareEmail');
    const email = input.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Please enter a valid email address'); input.focus(); return; }
    if (trip.members.includes(email)) { toast('Already shared with that email'); return; }
    if (!trip.members.length) trip.members = [sync.user.email];
    trip.members.push(email);
    writeLocal(); renderShare();
    toast(`Shared with ${email}`);
    window.Cloud.addMember(trip.id, email).catch((err) => {
      trip.members = trip.members.filter((m) => m !== email); writeLocal(); renderShare();
      toast(`⚠️ Could not share: ${(err && (err.code || err.message)) || 'unknown error'}`);
    });
  }
  $('#shareClose').addEventListener('click', () => { shareDialog.close(); route(); });

  // ---------- Connect to cloud.js ----------
  function onCloudReady() {
    if (sync.available) return;
    sync.available = true;
    refreshSyncUI();
    if (window.Cloud.user !== undefined) onCloudUser(window.Cloud.user);
  }
  function onCloudUser(user) {
    if ((user && user.email) === (sync.user && sync.user.email)) return;
    window.Cloud.stop();
    sync.user = user;
    sync.ready = false; sync.known.clear(); sync.pushed = {}; sync.pending = [];
    if (user) {
      window.Cloud.watch(user.email, onCloudChanges, (err) => { console.warn('Sync error', err); setSyncState('error'); });
    }
    refreshSyncUI();
    route();
  }
  window.addEventListener('cloud-ready', onCloudReady);
  window.addEventListener('cloud-user', (e) => { if (sync.available) onCloudUser(e.detail); });
  window.addEventListener('cloud-unavailable', () => { sync.failed = true; refreshSyncUI(); });
  window.addEventListener('online', () => { if (sync.state === 'offline') setSyncState('syncing'); scheduleSync(); });
  window.addEventListener('offline', () => { if (sync.user) setSyncState('offline'); });
  if (window.Cloud) onCloudReady();

  // ---------- App updates ----------
  // The installed app runs from an offline copy; this fetches the newest copy from the website.
  // Trips live in separate storage (and online when signed in), so they are never touched.
  async function updateApp() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') { location.reload(); return; }
    toast('🔄 Checking for a new version…');
    // Never drop the offline copy unless the website is actually reachable
    try {
      const r = await fetch(`sw.js?check=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) {
      toast('⚠️ Can’t update while offline — try again with internet');
      return;
    }
    try { sessionStorage.setItem(STORE_KEY + '.updateFrom', APP_VERSION); } catch (e) { /* ignore */ }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        const sw = reg.installing || reg.waiting;
        if (sw && sw.state !== 'activated') {
          await new Promise((done) => {
            const t = setTimeout(done, 8000);
            sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') { clearTimeout(t); done(); } });
          });
        }
      }
      // Re-download every stored app file; each is replaced only once its new copy arrived,
      // so the offline copy is never left empty or half-missing
      const name = (await caches.keys()).find((k) => k.startsWith('swipe-itinerary-v'));
      if (name) {
        const cache = await caches.open(name);
        await Promise.all((await cache.keys()).map(async (req) => {
          try {
            const res = await fetch(req.url, { cache: 'no-cache' });
            if (res.ok) await cache.put(req, res);
          } catch (e) { /* keep the old copy of this file */ }
        }));
      }
    } catch (e) { /* reload anyway */ }
    location.reload();
  }
  // After an update, say whether anything changed
  (() => {
    let from = null;
    try { from = sessionStorage.getItem(STORE_KEY + '.updateFrom'); sessionStorage.removeItem(STORE_KEY + '.updateFrom'); } catch (e) { /* ignore */ }
    if (from == null) return;
    setTimeout(() => {
      toast(APP_VERSION !== from ? `✓ Updated to v${APP_VERSION}` : `✓ You have the latest version (v${APP_VERSION})`);
    }, 800);
  })();

  // ---------- Boot ----------
  if (db.loaded) save(); // persist the upgrade of older saved data (never overwrite unreadable data)
  delete db.loaded;
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
