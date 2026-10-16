import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { SAMPLE } from './sample-data.js';
import { icon, bowl, mark } from './art.js';
import { linkify, cleanAddress, countyFromAddress, toTrad, areaLabel, shortCounty, groupCats } from './text.js';

const $ = (sel, root = document) => root.querySelector(sel);
const DEMO = new URLSearchParams(location.search).has('demo');

const PRICE_TEXT = { 1: '150 元以下', 2: '150 至 400 元', 3: '400 至 800 元', 4: '800 元以上' };
const PLATFORM = { instagram: 'Instagram', threads: 'Threads', google: 'Google', other: '參考連結' };

const state = {
  all: [],
  areas: [],
  cats: [],
  filters: { areas: new Set(), prices: new Set(), cats: new Set(), q: '' },
  draw: { count: 3, openOnly: false, skipVisited: false, drawn: false },
  recent: new Set(),
};

/* ---------- 小工具 ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
};

function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- 營業時間（以台北時間判斷） ---------- */

function taipeiMinuteOfWeek() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return day * 1440 + Number(get('hour')) * 60 + Number(get('minute'));
}

// 回傳 true（營業中）、false（休息中）、null（沒有營業時間資料）
function isOpenNow(hours, now) {
  const periods = hours && hours.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const WEEK = 7 * 1440;
  for (const p of periods) {
    if (!p.open) continue;
    const start = p.open.day * 1440 + (p.open.hour || 0) * 60 + (p.open.minute || 0);
    if (!p.close) return true; // 全天營業
    let end = p.close.day * 1440 + (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (end <= start) end += WEEK;
    if ((now >= start && now < end) || (now + WEEK >= start && now + WEEK < end)) return true;
  }
  return false;
}

/* ---------- 資料載入 ---------- */

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`資料庫回應 ${res.status}`);
  return res.json();
}

const SELECT =
  'restaurants?select=id,name,address,maps_url,price_level,status,note,opening_hours,needs_review,created_at,' +
  'area:areas(name,county),' +
  'cats:restaurant_categories(category:categories(name)),' +
  'links:source_links(platform,url,note)' +
  '&order=created_at.desc';

function normalize(row) {
  return {
    id: row.id,
    name: row.name,
    address: toTrad(row.address || ''),
    mapsUrl: row.maps_url,
    price: row.price_level || null,
    status: row.status,
    note: row.note || '',
    hours: row.opening_hours || null,
    needsReview: !!row.needs_review,
    area: row.area ? areaLabel(row.area.name, row.area.county) : '',
    county: row.area ? row.area.county : '',
    cats: (row.cats || []).map((c) => c.category && c.category.name).filter(Boolean),
    links: row.links || [],
  };
}

// 新竹以外的店：用地址判斷縣市，篩選與卡片都顯示縣市名（例如台南市），不再是籠統的「其他地區」
function withCounty(r) {
  if (r.county !== '其他') return r;
  return { ...r, area: shortCounty(countyFromAddress(r.address)) || '其他', county: '其他縣市' };
}

async function loadData() {
  if (DEMO) return { restaurants: SAMPLE.restaurants.map((r) => withCounty({ ...r, area: areaLabel(r.area, r.county) })), areas: SAMPLE.areas.map((a) => ({ ...a, name: areaLabel(a.name, a.county) })), cats: SAMPLE.cats };
  const [rows, areas, cats] = await Promise.all([
    rest(SELECT),
    rest('areas?select=name,county&order=sort_order'),
    rest('categories?select=name&order=sort_order'),
  ]);
  return { restaurants: rows.map(normalize).map(withCounty), areas: areas.map((a) => ({ ...a, name: areaLabel(a.name, a.county) })), cats };
}

/* ---------- 篩選 ---------- */

function matches(r) {
  const f = state.filters;
  if (f.areas.size && !f.areas.has(r.area)) return false;
  if (f.prices.size && !f.prices.has(r.price)) return false;
  if (f.cats.size && !r.cats.some((c) => f.cats.has(c))) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!`${r.name} ${r.note} ${r.address}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

const filtered = () => state.all.filter(matches);

function activeFilterCount() {
  const f = state.filters;
  return f.areas.size + f.prices.size + f.cats.size + (f.q ? 1 : 0);
}

/* ---------- 畫面：卡片 ---------- */

function cardHtml(r, now, index = 0) {
  const open = isOpenNow(r.hours, now);
  const openTag =
    open === null
      ? ''
      : `<span class="open ${open ? 'is-open' : 'is-closed'}">${icon.clock(14)}${open ? '營業中' : '休息中'}</span>`;

  const price = r.price
    ? `<span class="price" aria-label="人均 ${PRICE_TEXT[r.price]}" title="人均 ${PRICE_TEXT[r.price]}"><span class="on">${'$'.repeat(r.price)}</span><span class="off">${'$'.repeat(4 - r.price)}</span></span>`
    : '';

  const tags = [];
  if (r.area) tags.push(`<span class="tag tag-area">${esc(r.area)}</span>`);
  r.cats.forEach((c) => tags.push(`<span class="tag tag-cat">${esc(c)}</span>`));
  if (!r.cats.length) tags.push('<span class="tag tag-pending">未分類</span>');
  if (r.status === 'visited') tags.push(`<span class="tag tag-visited">${icon.check(13)}吃過</span>`);

  const mapHref =
    safeUrl(r.mapsUrl) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address}`.trim())}`;

  const refs = (r.links || [])
    .map((l) => ({ ...l, href: safeUrl(l.url) }))
    .filter((l) => l.href)
    .map(
      (l) =>
        `<a class="link link-ref" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${icon.link(16)}${esc(PLATFORM[l.platform] || PLATFORM.other)}</a>`
    )
    .join('');

  return `<article class="card" style="--i:${index}">
    <div class="card-top">
      <h3>${esc(r.name)}</h3>
      ${price}
    </div>
    <div class="tags">${tags.join('')}</div>
    ${r.address ? `<p class="addr">${esc(cleanAddress(r.address))}</p>` : ''}
    ${r.note ? `<p class="note">${linkify(r.note)}</p>` : ''}
    <div class="card-foot">
      <a class="link link-map" href="${esc(mapHref)}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}Google Map</a>
      ${refs}
      ${openTag}
    </div>
  </article>`;
}

/* ---------- 畫面：篩選區 ---------- */

const chip = (kind, value, label, count) =>
  `<button type="button" class="chip chip-${kind}" aria-pressed="false" data-kind="${kind}" data-value="${esc(value)}">${icon.check(14)}<span>${esc(label)}</span><span class="n">${count}</span></button>`;

function renderFilterChips() {
  const countBy = (fn) => {
    const m = new Map();
    state.all.forEach((r) => fn(r).forEach((k) => m.set(k, (m.get(k) || 0) + 1)));
    return m;
  };
  const areaCount = countBy((r) => (r.area ? [r.area] : []));
  const priceCount = countBy((r) => (r.price ? [r.price] : []));
  const catCount = countBy((r) => r.cats);

  const byCounty = {};
  state.areas.forEach((a) => {
    if (a.county === '其他' || !areaCount.get(a.name)) return;
    (byCounty[a.county] ||= []).push(a);
  });
  // 新竹以外的縣市依店數多到少排列，放在最後
  const others = new Map();
  state.all.forEach((r) => {
    if (r.county === '其他縣市' && r.area) others.set(r.area, (others.get(r.area) || 0) + 1);
  });
  if (others.size) {
    byCounty['其他縣市'] = [...others.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'zh-Hant'))
      .map(([name]) => ({ name, county: '其他縣市' }));
  }
  const countyOrder = ['新竹市', '新竹縣', '其他縣市'];
  const orderedCounties = Object.entries(byCounty).sort(
    (x, y) => countyOrder.indexOf(x[0]) - countyOrder.indexOf(y[0])
  );
  $('#filter-areas').innerHTML = orderedCounties
    .map(
      ([county, list]) =>
        `<div class="county"><span class="county-name">${esc(county)}</span><div class="chips">${list
          .map((a) => chip('areas', a.name, a.name, areaCount.get(a.name)))
          .join('')}</div></div>`
    )
    .join('');

  $('#filter-prices').innerHTML = [1, 2, 3, 4]
    .filter((p) => priceCount.get(p))
    .map((p) => chip('prices', p, `${'$'.repeat(p)}　${PRICE_TEXT[p]}`, priceCount.get(p)))
    .join('');

  $('#filter-cats').innerHTML = groupCats(state.cats.filter((c) => catCount.get(c.name)))
    .map(
      ([group, list]) =>
        `<div class="county"><span class="county-name">${esc(group)}</span><div class="chips">${list
          .map((c) => chip('cats', c.name, c.name, catCount.get(c.name)))
          .join('')}</div></div>`
    )
    .join('');
}

function syncChipState() {
  document.querySelectorAll('.chip').forEach((el) => {
    const kind = el.dataset.kind;
    const raw = el.dataset.value;
    const value = kind === 'prices' ? Number(raw) : raw;
    el.setAttribute('aria-pressed', state.filters[kind].has(value) ? 'true' : 'false');
  });
  const n = activeFilterCount();
  const badge = $('#filter-badge');
  badge.hidden = n === 0;
  badge.textContent = `${n} 項`;
  $('#clear-filters').hidden = n === 0;
}

/* ---------- 畫面：清單 ---------- */

function renderList() {
  const el = $('#list');
  const now = taipeiMinuteOfWeek();
  const list = filtered();
  $('#list-count').textContent =
    state.all.length === 0 ? '' : activeFilterCount() ? `符合 ${list.length} 間，共 ${state.all.length} 間` : `共 ${state.all.length} 間`;

  if (state.all.length === 0) {
    el.innerHTML = stateBlock(bowl({ soup: false, label: '空空的碗' }), '還沒有餐廳', '匯入 Google 地圖的收藏後，這裡就會長出一整份清單。');
    return;
  }
  if (list.length === 0) {
    el.innerHTML = stateBlock(
      bowl({ soup: false, label: '空空的碗' }),
      '沒有符合的店',
      '換個條件看看，或把篩選清掉。',
      '<button type="button" class="btn-secondary" data-action="clear">清除所有篩選</button>'
    );
    return;
  }
  el.innerHTML = `<div class="grid">${list.map((r, i) => cardHtml(r, now, Math.min(i, 8))).join('')}</div>`;
}

function stateBlock(art, title, body, action = '') {
  return `<div class="state">${art}<h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
}

/* ---------- 隨機抽 ---------- */

function drawPool() {
  const now = taipeiMinuteOfWeek();
  let list = filtered();
  let unknown = 0;
  if (state.draw.openOnly) {
    list = list.filter((r) => {
      const o = isOpenNow(r.hours, now);
      if (o === null) {
        unknown++;
        return false;
      }
      return o;
    });
  }
  if (state.draw.skipVisited) list = list.filter((r) => r.status !== 'visited');
  return { list, unknown };
}

function updateDrawHint() {
  const { list } = drawPool();
  const hint = $('#draw-hint');
  const btn = $('#draw-btn');
  if (state.all.length === 0) {
    hint.textContent = '資料載入後，就能從符合條件的店裡抽。';
    btn.disabled = true;
    return;
  }
  hint.textContent =
    list.length === 0
      ? '目前沒有符合條件的店，放寬篩選或關掉開關再試試。'
      : state.draw.drawn
        ? ''
        : '若想縮小範圍，可先在下方選擇地區、價位或類別。';
  btn.disabled = list.length === 0;
}

function doDraw() {
  const { list } = drawPool();
  const out = $('#draw-result');
  const note = $('#draw-note');
  if (list.length === 0) return;

  const n = Math.min(state.draw.count, list.length);
  let fresh = list.filter((r) => !state.recent.has(r.id));
  if (fresh.length < n) {
    state.recent.clear();
    fresh = list;
  }
  const picked = shuffle(fresh).slice(0, n);
  picked.forEach((r) => state.recent.add(r.id));

  const now = taipeiMinuteOfWeek();
  out.innerHTML = picked.map((r, i) => cardHtml(r, now, i)).join('');
  out.classList.remove('is-fresh');
  void out.offsetWidth; // 重新觸發進場動畫
  out.classList.add('is-fresh');

  const parts = [`從符合條件的店裡抽出 ${picked.length} 間。`];
  note.textContent = parts.join('');

  state.draw.drawn = true;
  $('#draw-label').textContent = '再抽一次';
  updateDrawHint();
}

/* ---------- 事件 ---------- */

function refresh() {
  syncChipState();
  renderList();
  updateDrawHint();
}

function bindEvents() {
  $('#filters').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (c) {
      const kind = c.dataset.kind;
      const value = kind === 'prices' ? Number(c.dataset.value) : c.dataset.value;
      const set = state.filters[kind];
      set.has(value) ? set.delete(value) : set.add(value);
      refresh();
      return;
    }
    if (e.target.closest('#clear-filters')) clearFilters();
  });

  $('#list').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear"]')) clearFilters();
  });

  $('#search').addEventListener('input', (e) => {
    state.filters.q = e.target.value.trim();
    refresh();
  });

  $('#opt-open').addEventListener('change', (e) => {
    state.draw.openOnly = e.target.checked;
    updateDrawHint();
  });
  $('#opt-skip-visited').addEventListener('change', (e) => {
    state.draw.skipVisited = e.target.checked;
    updateDrawHint();
  });
  $('#draw-btn').addEventListener('click', doDraw);
}

function clearFilters() {
  const f = state.filters;
  f.areas.clear();
  f.prices.clear();
  f.cats.clear();
  f.q = '';
  $('#search').value = '';
  refresh();
}

/* ---------- 啟動 ---------- */

function setupStatic() {
  $('#brand-mark').innerHTML = mark();
  $('#draw-art').innerHTML = bowl();
  $('#search-icon').innerHTML = icon.search(18);
  $('#filters-label').innerHTML = `${icon.sliders(18)}<span>篩選地區、價位、類別</span>`;
  $('#draw-btn').innerHTML = `${icon.dice(20)}<span id="draw-label">抽三間幸運店家</span>`;
  // 桌面寬度預設展開篩選區
  if (window.matchMedia('(min-width: 900px)').matches) $('#filters').open = true;
}

async function load() {
  $('#list').innerHTML = stateBlock(bowl({ label: '翻找菜單中' }), '翻找菜單中', '稍等一下。');
  try {
    const data = await loadData();
    state.all = data.restaurants;
    state.areas = data.areas;
    state.cats = data.cats;
    // 還沒有任何營業時間資料時，先不顯示「只抽營業中」，避免開了就抽不到店
    if (state.all.length && !state.all.some((r) => r.hours)) {
      $('#opt-open').closest('label').hidden = true;
      state.draw.openOnly = false;
    }
    // 還沒有任何一間標記為吃過時，「排除吃過的」沒有作用，先不顯示
    if (state.all.length && !state.all.some((r) => r.status === 'visited')) {
      $('#opt-skip-visited').closest('label').hidden = true;
      state.draw.skipVisited = false;
    }
    renderFilterChips();
    refresh();
  } catch (err) {
    console.error(err);
    $('#list').innerHTML = stateBlock(
      bowl({ soup: false, label: '空空的碗' }),
      '連不上資料庫',
      '可能是網路不穩，或資料庫暫停了。稍後再試一次。',
      '<button type="button" class="btn-secondary" id="retry">再試一次</button>'
    );
    $('#retry').addEventListener('click', load, { once: true });
  }
}

setupStatic();
bindEvents();
if (DEMO) $('#demo-banner').hidden = false;
load();
