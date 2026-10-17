import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { mark } from './art.js';
import { toTrad, fixAddressOrder } from './text.js';
import { suggestCats } from './categorize.js';
import { parseListText } from './listparse.js';

const $ = (sel) => document.querySelector(sel);
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let running = false;
let stopRequested = false;

function show(which) {
  $('#loading').hidden = true;
  $('#panel-login').hidden = which !== 'login';
  $('#panel-denied').hidden = which !== 'denied';
  $('#panel-main').hidden = which !== 'main';
}

function say(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind ? 'is-' + kind : ''}`.trim();
}

function log(text, kind = '') {
  const li = document.createElement('li');
  if (kind) li.className = `is-${kind}`;
  li.textContent = text;
  $('#log').appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

/* ---------- 登入 ---------- */

async function route() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) return show('login');
  const { data: isEditor, error } = await sb.rpc('is_editor');
  if (error || !isEditor) {
    $('#denied-email').textContent = `目前登入的信箱：${session.user.email || '未知'}`;
    return show('denied');
  }
  show('main');
  refreshStats();
}

async function logout() {
  await sb.auth.signOut();
  route();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const status = $('#login-status');
  const btn = $('#login-btn');
  btn.disabled = true;
  say(status, '確認中');
  // 先比對白名單：不在名單內的信箱，不會寄出登入信
  const check = await sb.rpc('email_allowed', { p_email: email });
  if (!check.error && check.data === false) {
    btn.disabled = false;
    say(status, '這個信箱沒有管理權限，所以不會寄出登入連結。', 'error');
    return;
  }
  say(status, '寄送中');
  const redirect = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  btn.disabled = false;
  if (error) {
    say(status, `寄不出去：${error.message}。若剛寄過，請等一下再試。`, 'error');
  } else {
    say(status, '已寄出。請到信箱點登入連結，會自動回到這一頁。', 'ok');
  }
});

$('#logout').addEventListener('click', logout);
$('#denied-logout').addEventListener('click', logout);

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') route();
});

/* ---------- 補齊資料 ---------- */

async function refreshStats() {
  const total = await sb.from('restaurants').select('id', { count: 'exact', head: true });
  const todo = await sb
    .from('restaurants')
    .select('id', { count: 'exact', head: true })
    .is('hours_updated_at', null);
  $('#stat-total').textContent = total.error ? '讀取失敗' : `${total.count} 間`;
  $('#stat-todo').textContent = todo.error ? '讀取失敗' : `${todo.count} 間`;
  const changed = await sb.from('restaurants').select('id', { count: 'exact', head: true }).gte('hours_change_count', 1);
  $('#stat-changed').textContent = changed.error ? '尚未啟用' : `${changed.count} 間`;
  return todo.count;
}

async function callFill(body) {
  const { data, error } = await sb.functions.invoke('fill-places', { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j && j.error) msg = j.error;
    } catch {
      /* 保留原本的訊息 */
    }
    throw new Error(msg);
  }
  return data;
}

function setRunning(on, dry = false) {
  running = on;
  $('#run-btn').disabled = on;
  $('#dry-btn').disabled = on;
  $('#stop-btn').hidden = !on || dry;
}

async function dryRun() {
  setRunning(true, true);
  $('#log').innerHTML = '';
  try {
    const r = await callFill({ dryRun: true, limit: 25 });
    log(`試跑完成：還有 ${r.remaining} 間沒查過，下一批會查 ${r.wouldProcess.length} 間。`, 'ok');
    if (r.wouldProcess.length) log(`下一批：${r.wouldProcess.join('、')}`);
  } catch (e) {
    log(`試跑失敗：${e.message}`, 'error');
  } finally {
    setRunning(false);
  }
}

async function run() {
  setRunning(true);
  stopRequested = false;
  $('#log').innerHTML = '';
  let round = 0;
  let totalMatched = 0;
  let totalNotFound = 0;
  try {
    while (!stopRequested) {
      round += 1;
      log(`第 ${round} 批處理中`);
      const r = await callFill({ limit: 20 });
      totalMatched += r.matched;
      totalNotFound += r.notFound.length;
      log(
        `第 ${round} 批完成：查到 ${r.matched} 間，沒找到 ${r.notFound.length} 間，` +
          `其中 ${r.withoutHours} 間 Google 沒有營業時間。還剩 ${r.remaining} 間。`,
        r.failed.length ? 'error' : 'ok'
      );
      if (r.notFound.length) log(`沒找到：${r.notFound.join('、')}`);
      if (r.failed.length) {
        log(`出錯：${r.failed.map((f) => `${f.name}（${f.error}）`).join('；')}`, 'error');
        log('先停下來，避免繼續出錯。處理好後再按一次，查過的不會重複。', 'error');
        break;
      }
      if (r.remaining === 0 || r.processed === 0) break;
    }
    if (stopRequested) log('已停止。', 'error');
    else log(`結束。這次共查到 ${totalMatched} 間，沒找到 ${totalNotFound} 間。`, 'ok');
  } catch (e) {
    log(`失敗：${e.message}`, 'error');
  } finally {
    setRunning(false);
    refreshStats();
  }
}

$('#run-btn').addEventListener('click', () => !running && run());
$('#dry-btn').addEventListener('click', () => !running && dryRun());
$('#stop-btn').addEventListener('click', () => {
  stopRequested = true;
});

/* ---------- 抽查營業時間 ---------- */

let rechecking = false;
$('#recheck-btn').addEventListener('click', async () => {
  if (rechecking) return;
  rechecking = true;
  $('#recheck-btn').disabled = true;
  const out = $('#recheck-log');
  out.innerHTML = '';
  const addLog = (text, kind = '') => {
    const li = document.createElement('li');
    if (kind) li.className = `is-${kind}`;
    li.textContent = text;
    out.appendChild(li);
  };
  try {
    addLog('抽查中，約需 40 秒，請不要關掉這一頁。');
    const r = await callFill({ mode: 'recheck', limit: 10 });
    addLog(`抽查 ${r.checked} 間：營業時間有變 ${r.changed.length} 間，沒變 ${r.same.length} 間。`, 'ok');
    if (r.changed.length) addLog(`有變而且已更新：${r.changed.join('、')}`);
    if (r.same.length) addLog(`沒變：${r.same.join('、')}`);
    if (r.notFound.length) addLog(`Google 沒對到：${r.notFound.join('、')}`, 'error');
    if (r.failed.length) addLog(`出錯：${r.failed.map((f) => `${f.name}（${f.error}）`).join('；')}`, 'error');
  } catch (e) {
    addLog(`失敗：${e.message}`, 'error');
  } finally {
    rechecking = false;
    $('#recheck-btn').disabled = false;
    refreshStats();
  }
});

/* ---------- 整理地址與地區 ---------- */

let fixing = false;
async function fixAddresses() {
  fixing = true;
  $('#fix-btn').disabled = true;
  const out = $('#fix-log');
  out.innerHTML = '';
  const addLog = (text, kind = '') => {
    const li = document.createElement('li');
    if (kind) li.className = `is-${kind}`;
    li.textContent = text;
    out.appendChild(li);
  };
  try {
    const [rs, ar] = await Promise.all([
      sb.from('restaurants').select('id,name,address,area_id').limit(3000),
      sb.from('areas').select('id,name,county').limit(200),
    ]);
    if (rs.error) throw new Error(rs.error.message);
    if (ar.error) throw new Error(ar.error.message);
    const data = rs.data;
    const other = ar.data.find((x) => x.name === '其他地區');
    const areaOf = (addr) => {
      const t = String(addr || '').replace(/臺/g, '台');
      const hit = ar.data.find((x) => x.county !== '其他' && t.includes(x.county + x.name));
      return hit ? hit.id : other ? other.id : null;
    };
    const plan = new Map();
    for (const r of data) {
      if (!r.address) continue;
      const next = fixAddressOrder(r.address);
      const upd = {};
      if (next !== r.address) upd.address = next;
      // 只修「現在被歸在其他地區或沒有地區」的店，避免動到你手動調整過的
      if (!r.area_id || r.area_id === other?.id) {
        const id = areaOf(next);
        if (id && id !== r.area_id) upd.area_id = id;
      }
      if (Object.keys(upd).length) plan.set(r.id, upd);
    }
    const todo = data.filter((r) => plan.has(r.id));
    if (!todo.length) {
      addLog(`檢查了 ${data.length} 間，地址和地區都沒有需要修的。`, 'ok');
      return;
    }
    let done = 0;
    for (const r of todo) {
      const upd = plan.get(r.id);
      const next = upd.address || r.address;
      const { error: e } = await sb.from('restaurants').update(upd).eq('id', r.id);
      if (e) {
        addLog(`失敗：${r.name}（${e.message}）`, 'error');
        continue;
      }
      done += 1;
      addLog(`${r.name}：${next}${upd.area_id ? '（已重新判斷地區）' : ''}`);
    }
    addLog(`完成：檢查 ${data.length} 間，改了 ${done} 間。`, done === todo.length ? 'ok' : 'error');
  } catch (e) {
    addLog(`失敗：${e.message}`, 'error');
  } finally {
    fixing = false;
    $('#fix-btn').disabled = false;
  }
}
$('#fix-btn').addEventListener('click', () => !fixing && fixAddresses());

/* ---------- 自動分類未分類的店 ---------- */

let catting = false;
async function autoCategorize() {
  catting = true;
  $('#cat-btn').disabled = true;
  const out = $('#cat-log');
  out.innerHTML = '';
  const addLog = (text, kind = '') => {
    const li = document.createElement('li');
    if (kind) li.className = `is-${kind}`;
    li.textContent = text;
    out.appendChild(li);
  };
  try {
    const [rs, cs, links] = await Promise.all([
      sb.from('restaurants').select('id,name').limit(3000),
      sb.from('categories').select('id,name').limit(500),
      sb.from('restaurant_categories').select('restaurant_id').limit(10000),
    ]);
    for (const x of [rs, cs, links]) if (x.error) throw new Error(x.error.message);
    const has = new Set(links.data.map((l) => l.restaurant_id));
    const idByName = new Map(cs.data.map((c) => [c.name, c.id]));
    const names = [...idByName.keys()];
    const todo = rs.data.filter((r) => !has.has(r.id));
    if (!todo.length) {
      addLog('每一間都已經有分類了。', 'ok');
      return;
    }
    const rows = [];
    let hit = 0;
    for (const r of todo) {
      const picked = suggestCats(r.name, [], names);
      if (!picked.length) continue;
      hit += 1;
      for (const n of picked) rows.push({ restaurant_id: r.id, category_id: idByName.get(n) });
      addLog(`${r.name}：${picked.join('、')}`);
    }
    if (rows.length) {
      const { error } = await sb.from('restaurant_categories').insert(rows);
      if (error) throw new Error(error.message);
    }
    addLog(`完成：${todo.length} 間未分類，分好 ${hit} 間，${todo.length - hit} 間對不上，留在未分類。`, 'ok');
  } catch (e) {
    addLog(`失敗：${e.message}`, 'error');
  } finally {
    catting = false;
    $('#cat-btn').disabled = false;
  }
}
$('#cat-btn').addEventListener('click', () => !catting && autoCategorize());

/* ---------- 貼連結新增 ---------- */

const ADD_CHUNK = 6;
let adding = false;

async function callAdd(lines) {
  const { data, error } = await sb.functions.invoke('add-places', { body: { lines } });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j && j.error) msg = j.error;
    } catch {
      /* 保留原本的訊息 */
    }
    throw new Error(msg);
  }
  return data.results || [];
}

async function addPlaces() {
  const lines = $('#add-input')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return;
  adding = true;
  $('#add-btn').disabled = true;
  const out = $('#add-log');
  out.innerHTML = '';
  const addLog = (text, kind = '') => {
    const li = document.createElement('li');
    if (kind) li.className = `is-${kind}`;
    li.textContent = text;
    out.appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
  };
  let added = 0;
  let exists = 0;
  let failed = 0;
  const failedLines = [];
  try {
    for (let i = 0; i < lines.length; i += ADD_CHUNK) {
      const chunk = lines.slice(i, i + ADD_CHUNK);
      addLog(`處理第 ${i + 1} 到 ${i + chunk.length} 筆，共 ${lines.length} 筆`);
      const results = await callAdd(chunk);
      results.forEach((r, k) => {
        if (r.status === 'added') {
          added += 1;
          addLog(`新增：${r.name}（${r.message.replace('已新增，', '').replace('已新增', '')}）`.replace('（）', ''), 'ok');
        } else if (r.status === 'exists') {
          exists += 1;
          addLog(`略過：${r.name}（${r.message}）`);
        } else {
          failed += 1;
          failedLines.push(chunk[k]);
          addLog(`失敗：${r.input}（${r.message}）`, 'error');
        }
      });
      if (results.length < chunk.length) {
        failed += chunk.length - results.length;
        failedLines.push(...chunk.slice(results.length));
        addLog('因為 Google 額度或權限問題，剩下的先停下。', 'error');
        break;
      }
    }
    addLog(`結束：新增 ${added} 間，已存在 ${exists} 間，失敗 ${failed} 間。`, failed ? 'error' : 'ok');
    // 只留下失敗的，方便修正後再按一次
    $('#add-input').value = failedLines.join('\n');
  } catch (e) {
    addLog(`失敗：${e.message}`, 'error');
  } finally {
    adding = false;
    $('#add-btn').disabled = false;
    refreshStats();
  }
}
$('#add-btn').addEventListener('click', () => !adding && addPlaces());

/* ---------- 貼清單文字新增（依店名） ---------- */

const normKey = (s) => toTrad(String(s || '')).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
let listAdding = false;

$('#list-parse').addEventListener('click', () => {
  const names = parseListText($('#list-input').value);
  $('#list-names').value = names.join('\n');
  const out = $('#list-log');
  out.innerHTML = '';
  const li = document.createElement('li');
  li.textContent = names.length ? `解析出 ${names.length} 間。請看一下有沒有不是店名的行，刪掉再新增。` : '沒有解析出店名。';
  out.appendChild(li);
});

async function addByNames() {
  const names = $('#list-names')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return;
  const note = $('#list-note').value.trim() || null;
  listAdding = true;
  $('#list-add').disabled = true;
  const out = $('#list-log');
  out.innerHTML = '';
  const addLog = (text, kind = '') => {
    const li = document.createElement('li');
    if (kind) li.className = `is-${kind}`;
    li.textContent = text;
    out.appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
  };
  let added = 0;
  let exists = 0;
  let failed = 0;
  const left = [];
  try {
    const { data: have, error } = await sb.from('restaurants').select('name').limit(5000);
    if (error) throw new Error(error.message);
    const haveKeys = (have || []).map((r) => normKey(r.name));
    const todo = [];
    for (const n of names) {
      const k = normKey(n);
      if (k && haveKeys.some((h) => h === k || (k.length >= 4 && (h.includes(k) || k.includes(h)) && Math.min(h.length, k.length) >= 4))) {
        exists += 1;
        addLog(`略過：${n}（名稱已在清單裡）`);
      } else todo.push(n);
    }
    addLog(`要查詢 ${todo.length} 間，每間約 4 秒，請不要關掉這一頁。`);
    for (let i = 0; i < todo.length; i += ADD_CHUNK) {
      const chunk = todo.slice(i, i + ADD_CHUNK);
      addLog(`處理第 ${i + 1} 到 ${i + chunk.length} 筆，共 ${todo.length} 筆`);
      const { data, error: e } = await sb.functions.invoke('add-places', {
        body: { items: chunk.map((name) => ({ name, note })) },
      });
      if (e) {
        let msg = e.message;
        try {
          const j = await e.context.json();
          if (j && j.error) msg = j.error;
        } catch {
          /* 保留原本的訊息 */
        }
        throw new Error(msg);
      }
      const results = data.results || [];
      results.forEach((r, k) => {
        if (r.status === 'added') {
          added += 1;
          addLog(`新增：${r.name}（${r.message.replace('已新增，', '').replace('已新增', '')}）`.replace('（）', ''), 'ok');
        } else if (r.status === 'exists') {
          exists += 1;
          addLog(`略過：${r.name}（${r.message}）`);
        } else {
          failed += 1;
          left.push(chunk[k]);
          addLog(`沒新增：${r.input}（${r.message}）`, 'error');
        }
      });
      if (results.length < chunk.length) {
        left.push(...chunk.slice(results.length));
        addLog('因為 Google 額度或權限問題，剩下的先停下。', 'error');
        left.push(...todo.slice(i + chunk.length));
        break;
      }
    }
    addLog(`結束：新增 ${added} 間，已存在 ${exists} 間，沒新增 ${failed} 間。`, failed ? 'error' : 'ok');
    $('#list-names').value = left.join('\n');
  } catch (e) {
    addLog(`失敗：${e.message}`, 'error');
  } finally {
    listAdding = false;
    $('#list-add').disabled = false;
    refreshStats();
  }
}
$('#list-add').addEventListener('click', () => !listAdding && addByNames());

$('#brand-mark').innerHTML = mark();
route();
