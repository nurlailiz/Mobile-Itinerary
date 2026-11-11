/* Swipe Itinerary — a mobile-first itinerary planner.
 * Data lives in localStorage; no server or build step needed. */
(() => {
  'use strict';

  const STORE_KEY = 'swipe-itinerary.v1';

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

  // ---------- Storage ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.trips)) return data;
      }
    } catch (e) { /* ignore corrupt or blocked storage */ }
    return { trips: [] };
  }
  let db = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast('⚠️ Could not save (storage full or blocked)'); }
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
  function fmtMoney(n, cur) {
    const v = Number(n) || 0;
    const s = v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return cur ? `${cur} ${s}` : s;
  }
  function dayDate(trip, i) {
    if (!trip.startDate) return null;
    const d = new Date(trip.startDate + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + i);
    return d;
  }
  const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => (d ? d.toLocaleDateString(undefined, opts) : '');
  const sumFees = (items) => items.reduce((a, it) => a + (Number(it.fee) || 0), 0);
  const tripItems = (trip) => trip.days.flatMap((d) => d.items);

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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
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
      ${trips.length ? `
        <ul class="trip-list">
          ${trips.map((t) => {
            const items = tripItems(t);
            const start = dayDate(t, 0);
            const end = dayDate(t, t.days.length - 1);
            return `<li><button class="trip-card" data-trip="${t.id}">
              <h3>${esc(t.name)}</h3>
              <div class="meta">
                ${start ? `<span>📅 ${esc(fmtDate(start, { day: 'numeric', month: 'short' }))}${t.days.length > 1 ? ' – ' + esc(fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</span>` : ''}
                <span>🗓 ${t.days.length} day${t.days.length === 1 ? '' : 's'}</span>
                <span>📝 ${items.length} activit${items.length === 1 ? 'y' : 'ies'}</span>
                <span>💰 ${esc(fmtMoney(sumFees(items), t.currency))}</span>
              </div>
            </button></li>`;
          }).join('')}
        </ul>` : `
        <div class="empty">
          <div class="big">🧳</div>
          <h2>No trips yet</h2>
          <p>Create a trip, add activities with time, transport, fee and remarks — then swipe through your day like flashcards.</p>
          <button class="btn primary" id="newTripEmpty">Create your first trip</button>
          <div style="height:12px"></div>
          <button class="btn" id="sampleTrip">Try a sample trip</button>
        </div>`}
      <button class="fab" id="newTrip" aria-label="New trip">+</button>
    `;
    app.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/trip/${b.dataset.trip}`; }));
    $('#newTrip').addEventListener('click', () => openTripDialog());
    $('#newTripEmpty')?.addEventListener('click', () => openTripDialog());
    $('#sampleTrip')?.addEventListener('click', createSample);
    $('#homeMenu').addEventListener('click', (e) => showMenu(e, [
      { label: '⬇️ Back up all trips (JSON)', fn: exportJSON },
      { label: '⬆️ Restore from backup', fn: () => $('#importFile').click() },
    ]));
  }

  // ---------- Trip ----------
  function renderTrip(trip) {
    document.title = `${trip.name} · Itinerary`;
    let di = Math.min(ui.dayIndex[trip.id] ?? 0, trip.days.length - 1);
    ui.dayIndex[trip.id] = di;
    const day = trip.days[di];
    day.items = sortItems(day.items);
    const items = day.items;
    const date = dayDate(trip, di);
    const total = sumFees(items);

    app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" id="back" aria-label="Back">‹</button>
        <h1>${esc(trip.name)}<small>${trip.days.length} day${trip.days.length === 1 ? '' : 's'} · total ${esc(fmtMoney(sumFees(tripItems(trip)), trip.currency))}</small></h1>
        <button class="icon-btn" id="tripMenu" aria-label="Trip options">⋯</button>
      </header>

      <nav class="day-tabs" id="dayTabs">
        ${trip.days.map((d, i) => `
          <button class="day-tab ${i === di ? 'active' : ''}" data-day="${i}">
            <b>Day ${i + 1}</b>
            <span>${esc(fmtDate(dayDate(trip, i)) || d.title || `${d.items.length} item${d.items.length === 1 ? '' : 's'}`)}</span>
          </button>`).join('')}
        <button class="day-tab add" id="addDay" aria-label="Add day">+</button>
      </nav>

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

      ${ui.view === 'cards' ? cardsHTML(trip, day, items) : sheetHTML(trip, items, total)}

      <div class="summary">
        <span>${items.length} activit${items.length === 1 ? 'y' : 'ies'} this day</span>
        <span>Day total <b>${esc(fmtMoney(total, trip.currency))}</b></span>
      </div>

      <button class="fab" id="addItem" aria-label="Add activity">+</button>
    `;

    $('#back').addEventListener('click', () => { location.hash = '#/'; });
    $('#tripMenu').addEventListener('click', (e) => showMenu(e, [
      { label: '✎ Edit trip details', fn: () => openTripDialog(trip) },
      { label: '📄 Export to Excel (CSV)', fn: () => exportCSV(trip) },
      { label: '📋 Copy day as text', fn: () => copyDay(trip, di) },
      { label: '⬇️ Back up trip (JSON)', fn: () => exportJSON(trip) },
      { label: '🗑 Delete trip', fn: () => deleteTrip(trip), danger: true },
    ]));
    app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
      ui.dayIndex[trip.id] = Number(b.dataset.day);
      renderTrip(trip);
    }));
    // keep the active tab visible
    app.querySelector('.day-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#addDay').addEventListener('click', () => {
      trip.days.push({ id: uid(), title: '', items: [] });
      ui.dayIndex[trip.id] = trip.days.length - 1;
      save(); renderTrip(trip);
      toast(`Day ${trip.days.length} added`);
    });
    $('#editDay').addEventListener('click', () => openDayDialog(trip, di));
    app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      try { localStorage.setItem(STORE_KEY + '.view', ui.view); } catch (e) { /* ignore */ }
      renderTrip(trip);
    }));
    $('#addItem').addEventListener('click', () => openItemDialog(trip, day));

    document.onkeydown = null;
    if (ui.view === 'cards') wireDeck(trip, day, items);
    else {
      app.querySelectorAll('tr[data-item]').forEach((tr) => tr.addEventListener('click', () => {
        openItemDialog(trip, day, items.find((x) => x.id === tr.dataset.item));
      }));
      $('#sheetAdd')?.addEventListener('click', () => openItemDialog(trip, day));
    }
  }

  function cardsHTML(trip, day, items) {
    const n = items.length;
    return `
      <div class="deck" id="deck">
        ${items.map((it, i) => {
          const m = modeOf(it.mode);
          return `<button class="card" data-item="${it.id}" style="--accent:${m.color}">
            <div class="idx">Stop ${i + 1} of ${n}</div>
            <div class="time ${it.time ? '' : 'none'}">${it.time ? esc(fmtTime(it.time)) : 'Any time'}</div>
            ${it.endTime ? `<div class="until">until ${esc(fmtTime(it.endTime))}</div>` : ''}
            <div class="activity">${esc(it.activity)}</div>
            <div class="row">
              <div class="ic">${m.icon}</div>
              <div><div class="lbl">Transport${it.mode ? ' · ' + esc(m.label) : ''}</div>
                <div class="val ${it.transport || it.mode ? '' : 'muted'}">${esc(it.transport || (it.mode ? m.label : 'Not set'))}</div></div>
            </div>
            <div class="row">
              <div class="ic">💰</div>
              <div><div class="lbl">Fee</div>
                <div class="val ${it.fee ? '' : 'muted'}">${it.fee ? esc(fmtMoney(it.fee, trip.currency)) : 'Free'}</div></div>
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
          <div style="font-size:.85rem">Time · activity · transport · fee · remarks</div>
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

  function sheetHTML(trip, items, total) {
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Activity</th><th>Transport</th><th class="fee">Fee</th><th>Remarks</th></tr></thead>
          <tbody>
            ${items.map((it, i) => {
              const m = modeOf(it.mode);
              return `<tr data-item="${it.id}">
                <td>${i + 1}</td>
                <td class="t">${esc(fmtTime(it.time) || '—')}${it.endTime ? `<br><small>→ ${esc(fmtTime(it.endTime))}</small>` : ''}</td>
                <td><b>${esc(it.activity)}</b></td>
                <td>${it.mode || it.transport ? `${m.icon} ${esc(it.transport || m.label)}` : '—'}</td>
                <td class="fee">${it.fee ? esc(fmtMoney(it.fee, trip.currency)) : '—'}</td>
                <td class="rem">${esc(it.remarks || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr><td></td><td colspan="3">Total</td><td class="fee">${esc(fmtMoney(total, trip.currency))}</td><td></td></tr></tfoot>
        </table>
      </div>
      <button class="btn add-row-btn" id="sheetAdd">+ Add row</button>`;
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
  let selectedMode = '';

  function renderModeChips() {
    $('#modeChips').innerHTML = MODES.map((m) =>
      `<button type="button" class="chip ${m.id === selectedMode ? 'on' : ''}" data-mode="${m.id}">${m.icon} ${esc(m.label)}</button>`).join('');
  }
  $('#modeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    selectedMode = b.dataset.mode;
    renderModeChips();
  });

  function openItemDialog(trip, day, item) {
    itemCtx = { trip, day, item };
    itemForm.reset();
    $('#itemDialogTitle').textContent = item ? 'Edit activity' : 'New activity';
    $('#feeCurrency').textContent = trip.currency || '';
    $('#feeCurrency').style.display = trip.currency ? '' : 'none';
    $('#itemDelete').style.display = item ? '' : 'none';
    $('#itemDuplicate').style.display = item ? '' : 'none';
    const f = itemForm.elements;
    if (item) {
      f.time.value = item.time || '';
      f.endTime.value = item.endTime || '';
      f.activity.value = item.activity || '';
      f.transport.value = item.transport || '';
      f.fee.value = item.fee ?? '';
      f.remarks.value = item.remarks || '';
      selectedMode = item.mode || '';
    } else {
      // Suggest a start time right after the last activity of the day
      const last = [...day.items].reverse().find((x) => x.endTime || x.time);
      f.time.value = last ? (last.endTime || last.time) : '';
      selectedMode = '';
    }
    renderModeChips();
    itemDialog.showModal();
    if (!item) setTimeout(() => f.activity.focus(), 50);
  }

  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = itemForm.elements;
    const activity = f.activity.value.trim();
    if (!activity) { f.activity.focus(); return; }
    const { trip, day, item } = itemCtx;
    const fee = f.fee.value === '' ? '' : Math.max(0, Number(f.fee.value) || 0);
    const data = {
      time: f.time.value, endTime: f.endTime.value, activity,
      mode: selectedMode, transport: f.transport.value.trim(), fee, remarks: f.remarks.value.trim(),
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
    const copy = { ...item, id: uid() };
    day.items.splice(day.items.indexOf(item) + 1, 0, copy);
    day.items = sortItems(day.items);
    ui.cardIndex[day.id] = day.items.indexOf(copy);
    save(); itemDialog.close(); renderTrip(trip);
    toast('Duplicated');
  });

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
    if (trip) {
      f.name.value = trip.name;
      f.startDate.value = trip.startDate || '';
      f.dayCount.value = trip.days.length;
      f.currency.value = trip.currency || '';
    } else {
      f.dayCount.value = 3;
    }
    tripDialog.showModal();
    if (!trip) setTimeout(() => f.name.focus(), 50);
  }

  tripForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = tripForm.elements;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }
    const count = Math.max(1, Math.min(60, parseInt(f.dayCount.value, 10) || 1));
    const trip = tripCtx || { id: uid(), days: [] };
    trip.name = name;
    trip.startDate = f.startDate.value;
    trip.currency = f.currency.value.trim();

    if (count < trip.days.length) {
      const dropped = trip.days.slice(count);
      const lost = dropped.reduce((a, d) => a + d.items.length, 0);
      if (lost && !confirm(`Reducing to ${count} day(s) will remove ${lost} activit${lost === 1 ? 'y' : 'ies'}. Continue?`)) return;
      trip.days.length = count;
    }
    while (trip.days.length < count) trip.days.push({ id: uid(), title: '', items: [] });

    if (!tripCtx) db.trips.unshift(trip);
    save();
    tripDialog.close();
    if (tripCtx) route();
    else location.hash = `#/trip/${trip.id}`;
  });
  $('#tripCancel').addEventListener('click', () => tripDialog.close());
  $('#tripDelete').addEventListener('click', () => { tripDialog.close(); deleteTrip(tripCtx); });

  function deleteTrip(trip) {
    if (!confirm(`Delete trip "${trip.name}" and all its activities?`)) return;
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
    const n = trip.days[i].items.length;
    if (!confirm(`Delete Day ${i + 1}${n ? ` and its ${n} activit${n === 1 ? 'y' : 'ies'}` : ''}? Later days will shift up.`)) return;
    trip.days.splice(i, 1);
    ui.dayIndex[trip.id] = Math.max(0, i - 1);
    save(); dayDialog.close(); renderTrip(trip);
  });

  // Close any bottom sheet when tapping the dimmed backdrop
  document.querySelectorAll('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });

  // ---------- Export / import ----------
  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const safeName = (s) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'itinerary';

  function exportCSV(trip) {
    const rows = [['Day', 'Date', 'Day title', 'Time', 'Until', 'Activity', 'Transport mode', 'Transportation', `Fee${trip.currency ? ' (' + trip.currency + ')' : ''}`, 'Remarks']];
    trip.days.forEach((d, i) => {
      const date = dayDate(trip, i);
      const iso = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
      sortItems(d.items).forEach((it) => rows.push([
        i + 1, iso, d.title || '', it.time, it.endTime, it.activity,
        it.mode ? modeOf(it.mode).label : '', it.transport, it.fee, it.remarks,
      ]));
    });
    rows.push([]);
    rows.push(['', '', '', '', '', 'TOTAL', '', '', sumFees(tripItems(trip)), '']);
    // BOM so Excel opens UTF‑8 (emoji, accents, CJK) correctly
    download(`${safeName(trip.name)}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV exported — opens in Excel / Sheets');
  }

  function exportJSON(trip) {
    const payload = { app: 'swipe-itinerary', version: 1, trips: trip && trip.id ? [trip] : db.trips };
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
        const clean = {
          id: uid(), name: t.name, startDate: String(t.startDate || ''), currency: String(t.currency || ''),
          days: t.days.map((d) => ({
            id: uid(), title: String(d?.title || ''),
            items: (Array.isArray(d?.items) ? d.items : []).map((it) => ({
              id: uid(), time: String(it?.time || ''), endTime: String(it?.endTime || ''),
              activity: String(it?.activity || 'Untitled'), mode: modeOf(it?.mode).id,
              transport: String(it?.transport || ''), fee: it?.fee === '' || it?.fee == null ? '' : Number(it.fee) || 0,
              remarks: String(it?.remarks || ''),
            })),
          })),
        };
        if (!clean.days.length) clean.days.push({ id: uid(), title: '', items: [] });
        db.trips.push(clean);
        added++;
      });
      save(); route();
      toast(added ? `Restored ${added} trip${added === 1 ? '' : 's'}` : 'No trips found in that file');
    } catch (err) {
      toast('⚠️ That file is not a valid backup');
    }
  });

  async function copyDay(trip, i) {
    const d = trip.days[i];
    const date = dayDate(trip, i);
    const lines = [`${trip.name} — Day ${i + 1}${date ? ' (' + fmtDate(date) + ')' : ''}${d.title ? ': ' + d.title : ''}`, ''];
    sortItems(d.items).forEach((it) => {
      const m = modeOf(it.mode);
      lines.push(`${it.time ? fmtTime(it.time) + (it.endTime ? '–' + fmtTime(it.endTime) : '') : '•'}  ${it.activity}`);
      if (it.mode || it.transport) lines.push(`   ${m.icon} ${it.transport || m.label}`);
      if (it.fee) lines.push(`   💰 ${fmtMoney(it.fee, trip.currency)}`);
      if (it.remarks) lines.push(`   📝 ${it.remarks}`);
    });
    lines.push('', `Total: ${fmtMoney(sumFees(d.items), trip.currency)}`);
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
    const mk = (time, endTime, activity, mode, transport, fee, remarks) => ({ id: uid(), time, endTime, activity, mode, transport, fee, remarks });
    const trip = {
      id: uid(), name: 'Kyoto & Osaka (sample)', startDate: iso, currency: '¥',
      days: [
        { id: uid(), title: 'Arrive & explore Kyoto', items: [
          mk('08:30', '09:45', 'Kansai Airport → Kyoto Station', 'train', 'JR Haruka Express', 3600, 'Buy ICOCA & Haruka combo at JR ticket office'),
          mk('10:15', '10:45', 'Check in luggage at hotel', 'walk', '8 min walk from Kyoto Stn', '', 'Hotel Granvia — check-in from 3 PM'),
          mk('11:00', '13:30', 'Fushimi Inari Taisha', 'train', 'JR Nara Line, 2 stops', 150, 'Go up to Yotsutsuji viewpoint (~45 min hike). Wear good shoes!'),
          mk('14:30', '17:00', 'Kiyomizu-dera & Sannenzaka', 'bus', 'City Bus 206 / 86', 230, 'Temple entry ¥400 paid at gate'),
          mk('18:30', '', 'Dinner at Pontocho Alley', 'walk', '', 4000, 'Reservation under "Tan" — 7 PM'),
        ] },
        { id: uid(), title: 'Arashiyama', items: [
          mk('07:30', '09:00', 'Bamboo Grove (early, before crowds)', 'train', 'JR Sagano Line to Saga-Arashiyama', 240, ''),
          mk('09:30', '11:00', 'Tenryu-ji Temple', 'walk', '', 500, 'Garden + temple ticket'),
          mk('12:00', '', 'Lunch: yudofu', '', '', 2500, ''),
        ] },
        { id: uid(), title: 'Osaka day trip', items: [
          mk('09:00', '09:30', 'Kyoto → Osaka', 'train', 'JR Special Rapid', 580, ''),
          mk('10:00', '12:00', 'Osaka Castle', 'metro', 'Chuo Line to Tanimachi 4-chome', 600, ''),
          mk('18:00', '', 'Street food in Dotonbori', 'metro', 'Midosuji Line to Namba', 3000, 'Try takoyaki at Wanaka'),
        ] },
      ],
    };
    db.trips.unshift(trip);
    save();
    location.hash = `#/trip/${trip.id}`;
  }

  // ---------- Boot ----------
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
