import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { mark } from './art.js';
import { linkify, cleanAddress, countyFromAddress, areaLabel, shortCounty } from './text.js';

const $ = (sel) => document.querySelector(sel);
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PRICE_TEXT = { 1: '150 元以下', 2: '150 至 400 元', 3: '400 至 800 元', 4: '800 元以上' };
const TABS = [
  { key: 'todo', label: '待整理' },
  { key: 'all', label: '全部' },
  { key: 'visited', label: '吃過' },
];

const state = { rows: [], cats: [], tab: 'todo', q: '' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function show(which) {
  $('#loading').hidden = true;
  $('#panel-denied').hidden = which !== 'denied';
  $('#panel-main').hidden = which !== 'main';
}

/* ---------- 載入 ---------- */

async function load() {
  const { data: session } = await sb.auth.getSession();
  if (!session.session) return show('denied');
  const { data: ok } = await sb.rpc('is_editor');
  if (!ok) return show('denied');

  const [cats, rows] = await Promise.all([
    sb.from('categories').select('id,name,sort_order').order('sort_order'),
    sb
      .from('restaurants')
      .select(
        'id,name,address,maps_url,price_level,status,note,needs_review,created_at,' +
          'area:areas(name,county),cats:restaurant_categories(category_id)'
      )
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);
  if (cats.error || rows.error) {
    $('#loading').hidden = false;
    $('#loading').textContent = `讀取失敗：${(cats.error || rows.error).message}`;
    return;
  }
  state.cats = cats.data;
  state.rows = rows.data.map((r) => ({ ...r, catIds: new Set(r.cats.map((c) => c.category_id)) }));
  show('main');
  render();
}

/* ---------- 顯示 ---------- */

function visible() {
  const q = state.q.trim().toLowerCase();
  return state.rows.filter((r) => {
    if (state.tab === 'todo' && !r.needs_review) return false;
    if (state.tab === 'visited' && r.status !== 'visited') return false;
    if (q && !r.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderStats() {
  $('#stat-todo').textContent = `${state.rows.filter((r) => r.needs_review).length} 間`;
  $('#stat-all').textContent = `${state.rows.length} 間`;
  $('#stat-visited').textContent = `${state.rows.filter((r) => r.status === 'visited').length} 間`;
  $('#tabs').innerHTML = TABS.map(
    (t) => `<button type="button" class="chip chip-areas" data-tab="${t.key}" aria-pressed="${state.tab === t.key}">${t.label}</button>`
  ).join('');
}

function cardHtml(r) {
  const catChips = state.cats
    .map(
      (c) =>
        `<button type="button" class="chip chip-cats" data-act="cat" data-id="${c.id}" aria-pressed="${r.catIds.has(c.id)}">${esc(c.name)}</button>`
    )
    .join('');
  const priceChips = [1, 2, 3, 4]
    .map(
      (p) =>
        `<button type="button" class="chip chip-prices" data-act="price" data-v="${p}" aria-pressed="${r.price_level === p}">${'$'.repeat(p)}　${PRICE_TEXT[p]}</button>`
    )
    .join('');
  const area = !r.area
    ? '未分區'
    : r.area.county === '其他'
      ? shortCounty(countyFromAddress(r.address)) || '其他'
      : areaLabel(r.area.name, r.area.county);
  const link = r.maps_url ? `<a href="${esc(r.maps_url)}" target="_blank" rel="noopener">Google Map</a>` : '';
  const addr = r.address ? `<p class="rcard-addr">${esc(cleanAddress(r.address))}</p>` : '';
  return `
  <article class="rcard" data-id="${r.id}">
    <div class="rcard-head">
      <div>
        <h3>${esc(r.name)}</h3>
        <div class="rcard-meta"><span>${esc(area)}</span>${link}</div>
        ${addr}
      </div>
      <span class="saved" aria-live="polite"></span>
    </div>
    <div class="rgroup"><h4>類別（可複選）</h4><div class="chips">${catChips}</div>
      <form class="cat-add" data-act="cat-add">
        <input type="text" name="name" maxlength="12" placeholder="沒有想要的類別？打字新增" autocomplete="off" aria-label="新增類別">
        <button type="submit" class="btn-secondary">新增並選取</button>
      </form>
    </div>
    <div class="rgroup"><h4>價位（人均，再點一次取消）</h4><div class="chips">${priceChips}</div></div>
    <div class="rgroup"><h4>狀態</h4><div class="chips">
      <button type="button" class="chip chip-areas" data-act="status" data-v="want" aria-pressed="${r.status !== 'visited'}">想吃</button>
      <button type="button" class="chip chip-cats" data-act="status" data-v="visited" aria-pressed="${r.status === 'visited'}">吃過</button>
    </div></div>
    <label class="rgroup"><h4>備註</h4><textarea data-act="note" rows="2" placeholder="例如推薦的菜、誰推薦的，也可以貼貼文連結">${esc(r.note || '')}</textarea>
      <p class="note-preview"${/https?:\/\//.test(r.note || '') ? '' : ' hidden'}>${linkify(r.note || '')}</p></label>
    <div class="rcard-foot">${
      r.needs_review
        ? '<button type="button" class="btn-primary" data-act="done">整理好了</button>'
        : '<button type="button" class="btn-secondary" data-act="undone">放回待整理</button>'
    }</div>
  </article>`;
}

function render() {
  renderStats();
  const list = visible();
  $('#review-list').innerHTML = list.length
    ? list.map(cardHtml).join('')
    : `<p class="review-empty">${state.tab === 'todo' ? '全部整理完了，沒有待整理的店。' : '沒有符合的店。'}</p>`;
}

/* ---------- 儲存 ---------- */

function flash(card, text, error = false) {
  const el = card && card.querySelector('.saved');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', error);
  clearTimeout(el._t);
  if (!error) el._t = setTimeout(() => (el.textContent = ''), 1800);
}

async function updateRow(r, fields, card) {
  const { error } = await sb.from('restaurants').update(fields).eq('id', r.id);
  if (error) {
    flash(card, `儲存失敗：${error.message}`, true);
    return false;
  }
  Object.assign(r, fields);
  flash(card, '已儲存');
  return true;
}

async function toggleCat(r, id, card, btn) {
  const on = !r.catIds.has(id);
  const q = on
    ? sb.from('restaurant_categories').insert({ restaurant_id: r.id, category_id: id })
    : sb.from('restaurant_categories').delete().eq('restaurant_id', r.id).eq('category_id', id);
  const { error } = await q;
  if (error) return flash(card, `儲存失敗：${error.message}`, true);
  if (on) r.catIds.add(id);
  else r.catIds.delete(id);
  btn.setAttribute('aria-pressed', String(on));
  flash(card, '已儲存');
}

$('#review-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.tagName === 'TEXTAREA') return;
  const card = btn.closest('.rcard');
  const r = state.rows.find((x) => x.id === card.dataset.id);
  const act = btn.dataset.act;
  if (act === 'cat') return toggleCat(r, Number(btn.dataset.id), card, btn);
  if (act === 'price') {
    const v = Number(btn.dataset.v);
    const next = r.price_level === v ? null : v;
    if (await updateRow(r, { price_level: next }, card)) {
      card.querySelectorAll('[data-act="price"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === next)));
    }
    return;
  }
  if (act === 'status') {
    const v = btn.dataset.v;
    if (await updateRow(r, { status: v }, card)) {
      card.querySelectorAll('[data-act="status"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
      renderStats();
    }
    return;
  }
  if (act === 'done' || act === 'undone') {
    if (await updateRow(r, { needs_review: act === 'undone' }, card)) render();
  }
});

// 打字新增類別：沒有就建立，已經有同名的就直接選取
$('#review-list').addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-act="cat-add"]');
  if (!form) return;
  e.preventDefault();
  const card = form.closest('.rcard');
  const r = state.rows.find((x) => x.id === card.dataset.id);
  const name = form.elements.name.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  let cat = state.cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!cat) {
    const sort = Math.max(0, ...state.cats.map((c) => c.sort_order)) + 1;
    const { data, error } = await sb.from('categories').insert({ name, sort_order: sort }).select().single();
    if (error) return flash(card, `新增失敗：${error.message}`, true);
    cat = data;
    state.cats.push(cat);
  }
  if (!r.catIds.has(cat.id)) {
    const { error } = await sb.from('restaurant_categories').insert({ restaurant_id: r.id, category_id: cat.id });
    if (error) return flash(card, `儲存失敗：${error.message}`, true);
    r.catIds.add(cat.id);
  }
  render();
  const again = document.querySelector(`.rcard[data-id="${r.id}"]`);
  flash(again, `已加入「${cat.name}」`);
});

$('#review-list').addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'note') return;
  const card = e.target.closest('.rcard');
  const r = state.rows.find((x) => x.id === card.dataset.id);
  const value = e.target.value.trim() || null;
  if (value !== (r.note || null)) await updateRow(r, { note: value }, card);
  const pv = card.querySelector('.note-preview');
  pv.innerHTML = linkify(value || '');
  pv.hidden = !/https?:\/\//.test(value || '');
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  render();
});
$('#q').addEventListener('input', (e) => {
  state.q = e.target.value;
  render();
});

$('#brand-mark').innerHTML = mark();
load();
