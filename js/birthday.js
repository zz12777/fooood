import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { mark, icon } from './art.js?v=20261109';
import { linkify, cleanAddress, fixAddressOrder, countyFromAddress } from './text.js?v=20261109';
import { MODES, MINUTE_OPTIONS, minutesTo, withinLimit, routeUrl, geocode, currentPosition } from './nearby.js?v=20261109';

const $ = (sel) => document.querySelector(sel);
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

// 附近搜尋先關閉；要恢復時改成 true，並把 birthday.html 裡附近的註解拿掉
const NEAR_ENABLED = false;

const state = {
  brands: [],
  tags: new Set(),
  q: '',
  near: { how: null, origin: null, label: '', mode: 'bike', minutes: 15, busy: false, msg: '', choices: [] },
};

/* ---------- 資料 ---------- */

async function load() {
  const path =
    NEAR_ENABLED
      ? 'birthday_brands?select=id,brand,keyword,offer,tags,note,source,branches:birthday_branches(id,name,address,lat,lng,maps_url)&order=brand'
      : 'birthday_brands?select=id,brand,keyword,offer,tags,note,source&order=brand';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`資料庫回應 ${res.status}`);
  const rows = await res.json();
  return rows.map((b) => ({
    ...b,
    tags: b.tags || [],
    branches: (b.branches || []).map((x) => ({ ...x, address: fixAddressOrder(x.address || '') })),
  }));
}

/* ---------- 篩選 ---------- */

const brandMatches = (b) => {
  if (state.tags.size && !b.tags.some((t) => state.tags.has(t))) return false;
  if (!state.q) return true;
  return `${b.brand} ${b.offer} ${b.note || ''} ${b.tags.join(' ')}`.toLowerCase().includes(state.q);
};

// 附近模式：把每間分店攤開，只留範圍內的，依距離排
function nearbyBranches() {
  const n = state.near;
  const out = [];
  for (const b of state.brands.filter(brandMatches)) {
    for (const br of b.branches) {
      const min = minutesTo(br, n.origin, n.mode);
      if (withinLimit(min, n.minutes)) out.push({ ...br, brand: b, nearMin: min });
    }
  }
  return out.sort((x, y) => x.nearMin - y.nearMin);
}

/* ---------- 畫面 ---------- */

function tagsHtml(b) {
  return b.tags.map((t) => `<span class="tag tag-cat">${esc(t)}</span>`).join('');
}

function extraHtml(b) {
  const parts = [];
  if (b.note) parts.push(`<p class="note">${linkify(b.note)}</p>`);
  if (b.source) parts.push(`<p class="addr">來源：${linkify(b.source)}</p>`);
  return parts.join('');
}

function mapLink(br) {
  const href =
    safeUrl(br.maps_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${br.name} ${br.address || ''}`.trim())}`;
  return `<a class="link link-map" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}Google Map</a>`;
}

const COUNTY_ORDER = ['新竹市', '新竹縣'];

// 分店依縣市分組，新竹排最前面，其他縣市依分店數由多到少
function branchGroups(branches) {
  const m = new Map();
  for (const br of branches) {
    const c = countyFromAddress(br.address) || '其他';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(br);
  }
  return [...m.entries()].sort((a, b) => {
    const ia = COUNTY_ORDER.indexOf(a[0]);
    const ib = COUNTY_ORDER.indexOf(b[0]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b[1].length - a[1].length;
  });
}

function brandCard(b, i) {
  const q = encodeURIComponent(b.brand);
  return `<article class="card" style="--i:${Math.min(i, 8)}">
    <div class="card-top"><h3>${esc(b.brand)}</h3></div>
    <div class="tags">${tagsHtml(b)}</div>
    <p class="bday-offer">${esc(b.offer)}</p>
    ${extraHtml(b)}
    <div class="card-foot">
      <a class="link link-map" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}在 Google Map 找分店</a>
    </div>
  </article>`;
}

function branchCard(br, i) {
  const b = br.brand;
  return `<article class="card" style="--i:${Math.min(i, 8)}">
    <div class="card-top"><h3>${esc(b.brand)}</h3></div>
    <p class="addr">${esc(br.name)}</p>
    <div class="tags">${tagsHtml(b)}</div>
    <p class="bday-offer">${esc(b.offer)}</p>
    ${extraHtml(b)}
    ${br.address ? `<p class="addr">${esc(cleanAddress(br.address))}</p>` : ''}
    <div class="card-foot">
      ${mapLink(br)}
      <a class="link link-route" href="${esc(routeUrl(state.near.origin, br, state.near.mode))}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}路線</a>
    </div>
  </article>`;
}

function renderTags() {
  const count = new Map();
  state.brands.forEach((b) => b.tags.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
  $('#filter-tags').innerHTML = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([t, n]) =>
        `<button type="button" class="chip" aria-pressed="${state.tags.has(t)}" data-tag="${esc(t)}">${icon.check(14)}<span>${esc(t)}</span><span class="n">${n}</span></button>`
    )
    .join('');
}

function renderList() {
  const el = $('#list');
  if (!state.brands.length) {
    el.innerHTML = '<div class="state"><h3>還沒有壽星優惠</h3><p>整理好之後就會出現在這裡。</p></div>';
    return;
  }
  if (NEAR_ENABLED && state.near.origin) {
    const list = nearbyBranches();
    $('#list-title').textContent = '附近的壽星優惠';
    el.innerHTML = list.length
      ? `<div class="grid">${list.map(branchCard).join('')}</div>`
      : '<div class="state"><h3>附近沒有符合的分店</h3><p>把分鐘數調大，或換個交通方式試試。</p></div>';
    return;
  }
  $('#list-title').textContent = '優惠清單';
  const list = state.brands.filter(brandMatches);
  el.innerHTML = list.length
    ? `<div class="grid">${list.map(brandCard).join('')}</div>`
    : '<div class="state"><h3>沒有符合的優惠</h3><p>換個類別或關鍵字看看。</p></div>';
}

function renderNear() {
  if (!NEAR_ENABLED) return;
  const n = state.near;
  document.querySelectorAll('[data-near-way]').forEach((b) => b.setAttribute('aria-pressed', String(n.how === b.dataset.nearWay)));
  $('#near-form').hidden = !n.how;
  $('#near-input').hidden = n.how !== 'street';
  $('#near-here').hidden = n.how !== 'gps';
  $('#near-mode').innerHTML = Object.entries(MODES)
    .map(([k, m]) => `<option value="${k}"${n.mode === k ? ' selected' : ''}>${m.label}</option>`)
    .join('');
  $('#near-min').innerHTML = MINUTE_OPTIONS.map((m) => `<option value="${m}"${n.minutes === m ? ' selected' : ''}>${m}</option>`).join('');
  const st = $('#near-status');
  st.textContent = n.busy ? '查詢中' : n.msg || (n.origin ? `已篩選：離「${n.label}」${MODES[n.mode].label} ${n.minutes} 分鐘內的分店，由近到遠排` : '');
  st.className = `near-status ${n.msg && !n.busy ? 'is-error' : ''}`.trim();
  $('#near-choices').innerHTML = n.choices
    .map((c, i) => `<button type="button" class="chip chip-near" data-near-pick="${i}"><span>${esc(c.label)}</span></button>`)
    .join('');
  $('#near-cancel').hidden = !n.how;
  $('#near-note').hidden = !n.how;
}

function refresh() {
  const n = state.tags.size + (state.near.origin ? 1 : 0);
  renderTags();
  renderNear();
  renderList();
}

/* ---------- 附近 ---------- */

function setOrigin(origin, label) {
  Object.assign(state.near, { origin, label, msg: '', choices: [], busy: false });
  refresh();
}

async function findOrigin() {
  const n = state.near;
  n.busy = true;
  n.msg = '';
  renderNear();
  try {
    if (n.how === 'gps') return setOrigin(await currentPosition(), '目前位置');
    const text = $('#near-input').value.trim();
    if (!text) throw new Error('請先輸入街道或地址');
    const found = await geocode(text);
    if (!found.length) throw new Error('找不到這個地址，請加上縣市或區名再查，例如「新竹市東區 中華路二段」');
    if (found.length === 1) return setOrigin(found[0], found[0].label);
    Object.assign(n, { busy: false, choices: found, msg: '找到好幾個地點，請選起點。如果沒有你要的，請加上縣市再查' });
    renderNear();
  } catch (e) {
    Object.assign(n, { busy: false, msg: e.message || '查詢失敗' });
    renderNear();
  }
}

function bind() {
  $('#search').addEventListener('input', (e) => {
    state.q = e.target.value.trim().toLowerCase();
    renderList();
  });
  $('#filters').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tag]');
    if (t) {
      const v = t.dataset.tag;
      state.tags.has(v) ? state.tags.delete(v) : state.tags.add(v);
      refresh();
      return;
    }
    const pick = e.target.closest('[data-near-pick]');
    if (pick) {
      const c = state.near.choices[Number(pick.dataset.nearPick)];
      if (c) setOrigin(c, c.label);
    }
  });
  if (!NEAR_ENABLED) return;
  document.querySelectorAll('[data-near-way]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = state.near;
      if (n.how === b.dataset.nearWay) return;
      Object.assign(n, { how: b.dataset.nearWay, origin: null, msg: '', choices: [] });
      refresh();
      if (n.how === 'street') $('#near-input').focus();
    })
  );
  $('#near-form').addEventListener('submit', (e) => {
    e.preventDefault();
    findOrigin();
  });
  const onOption = () => {
    state.near.mode = $('#near-mode').value;
    state.near.minutes = Number($('#near-min').value);
    refresh();
  };
  $('#near-mode').addEventListener('change', onOption);
  $('#near-min').addEventListener('change', onOption);
  $('#near-cancel').addEventListener('click', () => {
    Object.assign(state.near, { how: null, origin: null, label: '', msg: '', choices: [] });
    $('#near-input').value = '';
    refresh();
  });
}

async function start() {
  $('#brand-mark').innerHTML = mark();
  $('#search-icon').innerHTML = icon.search(18);
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon[el.dataset.icon](16)));
  bind();
  renderNear();
  $('#list').innerHTML = '<div class="state"><h3>載入中</h3><p>稍等一下。</p></div>';
  try {
    state.brands = await load();
    refresh();
  } catch (e) {
    $('#list').innerHTML = `<div class="state"><h3>暫時讀不到資料</h3><p>${esc(e.message)}</p></div>`;
  }
}

start();
