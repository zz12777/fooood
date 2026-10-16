import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { mark } from './art.js';

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
          addLog(`新增：${r.name}`, 'ok');
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

$('#brand-mark').innerHTML = mark();
route();
