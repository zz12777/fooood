import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { mark, icon } from './art.js?v=20261123b';
import { lang, t, catName, areaName, translateDom, mountLangToggle } from './i18n.js?v=20261123d';
import { WHEN_LABEL, whenOf } from './bdaytime.js?v=20261123';
import { downloadPlan } from './planimage.js?v=20261123';
import { COUNTIES, FOODS, buildPlan } from './bdayquiz.js?v=20261123b';
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
      : 'birthday_brands?select=*&order=brand';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(t('資料庫回應 {s}', { s: res.status }));
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
  return b.tags.map((x) => `<span class="tag tag-cat">${esc(catName(x))}</span>`).join('');
}

function whenTag(b) {
  const w = whenOf(b);
  return w === 'unknown' ? '' : `<span class="tag tag-when tag-when-${w}">${esc(t(WHEN_LABEL[w]))}</span>`;
}

function extraHtml(b) {
  const parts = [];
  if (b.note) parts.push(`<p class="note">${linkify(b.note)}</p>`);
  if (b.counties && b.counties.length)
    parts.push(`<p class="addr">${esc(t('分店：{list}', { list: b.counties.map(areaName).join(lang === 'en' ? ', ' : '、') }))}</p>`);
  if (b.no_counties && b.no_counties.length)
    parts.push(`<p class="addr">${esc(t('目前沒有分店：{list}', { list: b.no_counties.map(areaName).join(lang === 'en' ? ', ' : '、') }))}</p>`);
  if (b.source) parts.push(`<p class="addr">${t('來源：')}${linkify(b.source)}</p>`);
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
    <div class="tags">${tagsHtml(b)}${whenTag(b)}</div>
    <p class="bday-offer">${esc(b.offer)}</p>
    ${extraHtml(b)}
    <div class="card-foot">
      <a class="link link-map" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}${t('在 Google Map 找分店')}</a>
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
      <a class="link link-route" href="${esc(routeUrl(state.near.origin, br, state.near.mode))}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}${t('路線')}</a>
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
        `<button type="button" class="chip" aria-pressed="${state.tags.has(t)}" data-tag="${esc(t)}">${icon.check(14)}<span>${esc(catName(t))}</span><span class="n">${n}</span></button>`
    )
    .join('');
}

function renderList() {
  const el = $('#list');
  if (!state.brands.length) {
    el.innerHTML = `<div class="state"><h3>${t('還沒有壽星優惠')}</h3><p>${t('整理好之後就會出現在這裡。')}</p></div>`;
    return;
  }
  if (NEAR_ENABLED && state.near.origin) {
    const list = nearbyBranches();
    $('#list-title').textContent = t('附近的壽星優惠');
    el.innerHTML = list.length
      ? `<div class="grid">${list.map(branchCard).join('')}</div>`
      : `<div class="state"><h3>${t('附近沒有符合的分店')}</h3><p>${t('把分鐘數調大，或換個交通方式試試。')}</p></div>`;
    return;
  }
  $('#list-title').textContent = t('優惠清單');
  const list = state.brands.filter(brandMatches);
  el.innerHTML = list.length
    ? `<div class="grid">${list.map(brandCard).join('')}</div>`
    : `<div class="state"><h3>${t('沒有符合的優惠')}</h3><p>${t('換個類別或關鍵字看看。')}</p></div>`;
}

function renderNear() {
  if (!NEAR_ENABLED) return;
  const n = state.near;
  document.querySelectorAll('[data-near-way]').forEach((b) => b.setAttribute('aria-pressed', String(n.how === b.dataset.nearWay)));
  $('#near-form').hidden = !n.how;
  $('#near-input').hidden = n.how !== 'street';
  $('#near-here').hidden = n.how !== 'gps';
  $('#near-mode').innerHTML = Object.entries(MODES)
    .map(([k, m]) => `<option value="${k}"${n.mode === k ? ' selected' : ''}>${t(m.label)}</option>`)
    .join('');
  $('#near-min').innerHTML = MINUTE_OPTIONS.map((m) => `<option value="${m}"${n.minutes === m ? ' selected' : ''}>${m}</option>`).join('');
  const st = $('#near-status');
  st.textContent = n.busy
    ? t('查詢中')
    : n.msg
      ? t(n.msg)
      : n.origin
        ? t('已篩選：離「{label}」{mode} {min} 分鐘內的分店，由近到遠排', { label: t(n.label), mode: t(MODES[n.mode].label), min: n.minutes })
        : '';
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


/* ---------- 生日行程測驗 ---------- */

const quiz = { step: 0, answers: { day: null, county: '新竹市', party: null, foods: [], member: null }, result: null };
const STEPS = ['day', 'county', 'party', 'foods', 'member'];

function optBtn(key, value, label, pressed) {
  return `<button type="button" class="quiz-opt" data-q="${key}" data-v="${esc(value)}" aria-pressed="${pressed}">${esc(label)}</button>`;
}

function renderQuiz() {
  const el = $('#quiz');
  const a = quiz.answers;
  if (quiz.result) return renderResult();
  const key = STEPS[quiz.step];
  let body = '';
  if (key === 'day') {
    body = `<h3>${t('想在哪一天慶祝？')}</h3><div class="quiz-opts">
      ${optBtn('day', 'birthday', t('生日當天'), a.day === 'birthday')}
      ${optBtn('day', 'other', t('生日月的其他天'), a.day === 'other')}</div>`;
  } else if (key === 'county') {
    body = `<h3>${t('在哪個縣市？')}</h3>
      <label class="sr" for="quiz-county">${t('縣市')}</label>
      <select id="quiz-county" class="quiz-select">${COUNTIES.map(
        (c) => `<option value="${c}"${a.county === c ? ' selected' : ''}>${esc(areaName(c))}</option>`
      ).join('')}</select>
      <div class="quiz-nav-inline"><button type="button" class="btn-primary quiz-next" data-quiz="next">${t('下一題')}${icon.arrowRight(18)}</button></div>`;
  } else if (key === 'party') {
    body = `<h3>${t('跟誰一起？')}</h3><div class="quiz-opts">
      ${optBtn('party', 1, t('自己一個人'), a.party === 1)}
      ${optBtn('party', 2, t('兩個人'), a.party === 2)}
      ${optBtn('party', 4, t('三到四個人'), a.party === 4)}
      ${optBtn('party', 5, t('五人以上'), a.party === 5)}</div>`;
  } else if (key === 'foods') {
    body = `<h3>${t('喜歡吃什麼？可以多選')}</h3><div class="quiz-opts">
      ${FOODS.map((f) => optBtn('foods', f.id, t(f.label), a.foods.includes(f.id))).join('')}</div>
      <div class="quiz-nav-inline"><button type="button" class="btn-primary quiz-next" data-quiz="next">${a.foods.length ? t('下一題') : t('都可以，下一題')}${icon.arrowRight(18)}</button></div>`;
  } else if (key === 'member') {
    body = `<h3>${t('願意先加會員或下載 APP 嗎？')}</h3><p class="near-note">${t('很多生日禮要先成為會員才拿得到。')}</p><div class="quiz-opts">
      ${optBtn('member', 'yes', t('可以'), a.member === true)}
      ${optBtn('member', 'no', t('不想，只要不用加會員的'), a.member === false)}</div>`;
  }
  el.innerHTML = `<div class="quiz-head"><span class="quiz-progress" id="quiz-heading">${t('幫我排生日行程')}<span class="sr">　${quiz.step + 1} / ${STEPS.length}</span></span>
      <span class="quiz-dots" aria-hidden="true">${STEPS.map((_, i) => `<span class="quiz-dot${i < quiz.step ? ' is-done' : i === quiz.step ? ' is-now' : ''}"></span>`).join('')}</span>
      <button type="button" class="quiz-close" data-quiz="close" aria-label="${t('關閉')}">${icon.close(20)}</button></div>
    ${body}
    ${quiz.step ? `<button type="button" class="btn-text quiz-back" data-quiz="back">${icon.arrowLeft(18)}${t('上一題')}</button>` : ''}`;
}

function renderResult() {
  const a = quiz.answers;
  const r = quiz.result;
  const sub = [a.day === 'birthday' ? t('生日當天') : t('生日月的其他天'), areaName(a.county), t(['', '自己一個人', '兩個人', '', '三到四個人', '五人以上'][a.party])].join('｜');
  const stops = r.plan.length
    ? r.plan
        .map(({ slot, brand: b, reasons }) => {
          const q = encodeURIComponent(`${b.brand} ${a.county}`);
          return `<li class="quiz-stop">
            <span class="quiz-time">${esc(t(slot.label))}</span>
            <div class="quiz-stop-body">
              <h4>${esc(b.brand)}</h4>
              <div class="tags">${tagsHtml(b)}${whenTag(b)}${reasons.map((x) => `<span class="tag tag-reason">${esc(t(x.k, x.p))}</span>`).join('')}</div>
              <p class="bday-offer">${esc(b.offer)}</p>
              ${b.note ? `<p class="note">${linkify(b.note)}</p>` : ''}
              <a class="link link-map" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener noreferrer">${icon.pin(16)}${esc(t('在 Google Map 找{county}的分店', { county: areaName(a.county) }))}</a>
            </div>
          </li>`;
        })
        .join('')
    : `<li class="near-note">${t('沒有找到符合的優惠，換個選項再試試。')}</li>`;
  $('#quiz').innerHTML = `<div class="quiz-head quiz-head-result">
      <h3 class="quiz-title" id="quiz-heading">${esc(t('你是「{title}」', { title: t(r.title) }))}</h3>
      <button type="button" class="quiz-close" data-quiz="close" aria-label="${t('關閉')}">${icon.close(20)}</button></div>
    <p class="near-note">${esc(sub)}</p>
    <ol class="quiz-plan">${stops}</ol>
    <p class="near-note">${t('優惠以店家公告為準。')}</p>
    <div class="quiz-actions">
      <button type="button" class="quiz-act is-main" data-quiz="again"><span class="quiz-act-icon">${icon.shuffle(22)}</span><span class="quiz-act-text">${t('換一組')}</span></button>
      <button type="button" class="quiz-act" data-quiz="image"><span class="quiz-act-icon">${icon.download(22)}</span><span class="quiz-act-text">${t('下載圖片')}</span></button>
      <button type="button" class="quiz-act" data-quiz="copy"><span class="quiz-act-icon">${icon.copy(22)}</span><span class="quiz-act-text" aria-live="polite">${t('複製行程')}</span></button>
      <button type="button" class="quiz-act" data-quiz="restart"><span class="quiz-act-icon">${icon.restart(22)}</span><span class="quiz-act-text">${t('重新測驗')}</span></button>
    </div>`;
}

function planImageData() {
  const a = quiz.answers;
  const r = quiz.result;
  return {
    kicker: t('新竹吃什麼 壽星優惠'),
    title: t('你是「{title}」', { title: t(r.title) }),
    sub: [a.day === 'birthday' ? t('生日當天') : t('生日月的其他天'), areaName(a.county), t(['', '自己一個人', '兩個人', '', '三到四個人', '五人以上'][a.party])].join('｜'),
    stops: r.plan.map(({ slot, brand: b }) => ({ time: t(slot.label), brand: b.brand, offer: b.offer, note: b.note || '' })),
    footer: `zz12777.github.io/fooood　${t('優惠以店家公告為準')}`,
  };
}

function planText() {
  const r = quiz.result;
  return [t('你是「{title}」', { title: t(r.title) }), ...r.plan.map(({ slot, brand: b }) => `${t(slot.label)}：${b.brand}　${b.offer}`)].join('\n');
}

function nextStep() {
  if (quiz.step < STEPS.length - 1) quiz.step += 1;
  else quiz.result = buildPlan(state.brands, quiz.answers);
  renderQuiz();
  $('#quiz').scrollTop = 0;
}

function closeQuiz() {
  const d = $('#quiz');
  if (d.close) d.close();
  else d.removeAttribute('open');
}

function bindQuiz() {
  // 點視窗外面的灰色區域也會關閉
  $('#quiz').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeQuiz();
  });
  $('#quiz-open').addEventListener('click', () => {
    renderQuiz();
    const d = $('#quiz');
    if (d.showModal) d.showModal();
    else d.setAttribute('open', '');
  });
  $('#quiz').addEventListener('change', (e) => {
    if (e.target.id === 'quiz-county') quiz.answers.county = e.target.value;
  });
  $('#quiz').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-q]');
    const a = quiz.answers;
    if (o) {
      const k = o.dataset.q;
      const v = o.dataset.v;
      if (k === 'foods') {
        a.foods = a.foods.includes(v) ? a.foods.filter((x) => x !== v) : [...a.foods, v];
        renderQuiz();
        return;
      }
      if (k === 'day') a.day = v;
      if (k === 'party') a.party = Number(v);
      if (k === 'member') a.member = v === 'yes';
      nextStep();
      return;
    }
    const act = e.target.closest('[data-quiz]')?.dataset.quiz;
    if (act === 'next') nextStep();
    else if (act === 'back') {
      quiz.step = Math.max(0, quiz.step - 1);
      renderQuiz();
    } else if (act === 'close') closeQuiz();
    else if (act === 'again') {
      quiz.result = buildPlan(state.brands, a);
      renderQuiz();
    } else if (act === 'restart') {
      quiz.step = 0;
      quiz.result = null;
      renderQuiz();
    } else if (act === 'image') {
      if (quiz.result.plan.length) await downloadPlan(planImageData(), 'birthday-plan.png');
    } else if (act === 'copy') {
      // 按下去暫時變成「已複製」，五秒後換回原本的字
      const btn = e.target.closest('[data-quiz]');
      const label = btn.querySelector('.quiz-act-text');
      try {
        await navigator.clipboard.writeText(planText());
        label.textContent = t('已複製');
        btn.classList.add('is-done');
      } catch {
        label.textContent = t('無法複製');
      }
      clearTimeout(btn._timer);
      btn._timer = setTimeout(() => {
        label.textContent = t('複製行程');
        btn.classList.remove('is-done');
      }, 5000);
    }
  });
}

async function start() {
  translateDom();
  mountLangToggle($('#lang-toggle'));
  $('#brand-mark').innerHTML = mark();
  $('#search-icon').innerHTML = icon.search(18);
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon[el.dataset.icon](16)));
  bind();
  bindQuiz();
  renderNear();
  $('#list').innerHTML = `<div class="state"><h3>${t('載入中')}</h3><p>${t('稍等一下。')}</p></div>`;
  try {
    state.brands = await load();
    refresh();
  } catch (e) {
    $('#list').innerHTML = `<div class="state"><h3>${t('暫時讀不到資料')}</h3><p>${esc(e.message)}</p></div>`;
  }
}

start();
