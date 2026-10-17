// Supabase Edge Function：fill-places
// 用 Google Places API (New) 補齊餐廳的完整地址、營業時間、價位。
//
// 安全設計：
// 1. Google 金鑰只存在 Supabase 的 Secrets（GOOGLE_PLACES_API_KEY），不會出現在網頁或 GitHub。
// 2. 呼叫者必須已登入，且信箱在 public.editors 白名單內，否則拒絕。
// 3. 每次呼叫最多處理 MAX_PER_CALL 間，且只處理「還沒查過」的店，不會重複計費。
// 4. dryRun 模式只列出會查哪些店，不呼叫 Google。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_PER_CALL = 25;
const DEFAULT_PER_CALL = 20;
const MATCH_RADIUS_M = 300;

// --- logic:start（純邏輯，可獨立測試）---
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 在 Google 回傳的結果裡，挑離已知座標最近、且在半徑內的那一間
function pickNearest(places, lat, lng, radiusM) {
  let best = null;
  let bestD = Infinity;
  for (const p of places || []) {
    const loc = p.location;
    if (!loc || typeof loc.latitude !== 'number') continue;
    const d = haversineM(lat, lng, loc.latitude, loc.longitude);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best && bestD <= radiusM ? { place: best, distanceM: Math.round(bestD) } : null;
}

// 人均價位 → 本站四級（1: 150 以下, 2: 150 至 400, 3: 400 至 800, 4: 800 以上）
function priceLevelFromRange(priceRange) {
  if (!priceRange) return null;
  const toNum = (m) => (m && m.units != null ? Number(m.units) + (m.nanos || 0) / 1e9 : null);
  const lo = toNum(priceRange.startPrice);
  const hi = toNum(priceRange.endPrice);
  const vals = [lo, hi].filter((v) => v != null);
  if (!vals.length) return null;
  const mid = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mid < 150) return 1;
  if (mid < 400) return 2;
  if (mid < 800) return 3;
  return 4;
}

// 組出要寫回資料庫的欄位
function buildUpdate(place, existingNote) {
  const upd = { hours_updated_at: new Date().toISOString() };
  if (!place) return upd;
  if (place.id) upd.place_id = place.id;
  if (place.formattedAddress) upd.address = place.formattedAddress;
  const roh = place.regularOpeningHours;
  upd.opening_hours =
    roh && Array.isArray(roh.periods) && roh.periods.length
      ? { periods: roh.periods, weekdayDescriptions: roh.weekdayDescriptions || [] }
      : null;
  const price = priceLevelFromRange(place.priceRange);
  if (price) upd.price_level = price;
  if (place.businessStatus === 'CLOSED_PERMANENTLY') {
    const tag = 'Google 標示：已永久歇業';
    upd.note = existingNote ? (existingNote.includes(tag) ? existingNote : `${tag}。${existingNote}`) : tag;
  }
  return upd;
}

// 營業時間是否有變：比較每週時段，空值視為沒有資料
function hoursKey(oh) {
  const periods = oh && Array.isArray(oh.periods) ? oh.periods : [];
  return JSON.stringify(
    periods
      .map((p) => [p.open?.day, p.open?.hour, p.open?.minute, p.close?.day, p.close?.hour, p.close?.minute])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  );
}
function hoursChanged(oldOh, newOh) {
  return hoursKey(oldOh) !== hoursKey(newOh);
}

// 抽查名單：一部分給「發現改過時間」的店（改最多、最久沒查的優先），其餘從最久沒查的店裡隨機抽
function pickRecheck(rows, limit, rnd = Math.random) {
  const byOld = (a, b) => String(a.hours_updated_at || '').localeCompare(String(b.hours_updated_at || ''));
  const frequent = rows
    .filter((r) => (r.hours_change_count || 0) > 0)
    .sort((a, b) => b.hours_change_count - a.hours_change_count || byOld(a, b))
    .slice(0, Math.ceil(limit * 0.4));
  const taken = new Set(frequent.map((r) => r.id));
  const rest = rows.filter((r) => !taken.has(r.id)).sort(byOld);
  const need = limit - frequent.length;
  const pool = rest.slice(0, Math.max(need * 4, need));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...frequent, ...pool.slice(0, need)];
}
// --- logic:end ---

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.regularOpeningHours',
  'places.priceRange',
  'places.businessStatus',
  'places.googleMapsUri',
].join(',');

async function searchPlace(apiKey, name, lat, lng) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: name,
      languageCode: 'zh-TW',
      regionCode: 'TW',
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: '只接受 POST' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!url || !anon) return json({ error: '伺服器設定不完整' }, 500);

    // 1. 驗證登入與白名單
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const email = userData?.user?.email?.toLowerCase();
    if (!email) return json({ error: '請先登入' }, 401);

    const { data: isEditor, error: edErr } = await userClient.rpc('is_editor');
    if (edErr) return json({ error: `讀取白名單失敗：${edErr.message}` }, 500);
    if (!isEditor) return json({ error: '這個帳號沒有權限' }, 403);

    // 2. 參數
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(MAX_PER_CALL, Number(body.limit) || DEFAULT_PER_CALL));
    const dryRun = body.dryRun === true;

    // 抽查模式：隨機抽幾間已經查過的店，重抓營業時間，有變才更新
    if (body.mode === 'recheck') {
      const n = Math.max(1, Math.min(15, Number(body.limit) || 10));
      const { data: pool, error: pErr } = await userClient
        .from('restaurants')
        .select('id, name, lat, lng, note, place_id, google_cid, opening_hours, price_level, hours_change_count, hours_updated_at')
        .not('hours_updated_at', 'is', null)
        .not('lat', 'is', null)
        .order('hours_updated_at', { ascending: true })
        .limit(400);
      if (pErr) return json({ error: `查詢失敗：${pErr.message}` }, 500);
      const picks = pickRecheck(pool || [], n);
      if (dryRun) return json({ dryRun: true, wouldProcess: picks.map((r) => r.name), remaining: (pool || []).length });
      if (!apiKey) return json({ error: '尚未設定 GOOGLE_PLACES_API_KEY' }, 500);
      const changed = [];
      const same = [];
      const notFound = [];
      const failed = [];
      for (const r of picks) {
        await new Promise((ok) => setTimeout(ok, 3500));
        try {
          const data = await searchPlace(apiKey, r.name, r.lat, r.lng);
          const places = data.places || [];
          const place =
            places.find((p) => r.place_id && p.id === r.place_id) ||
            places.find((p) => r.google_cid && String(p.googleMapsUri || '').includes(`cid=${r.google_cid}`)) ||
            pickNearest(places, r.lat, r.lng, MATCH_RADIUS_M)?.place;
          if (!place) {
            notFound.push(r.name);
            continue;
          }
          const upd = buildUpdate(place, r.note);
          delete upd.address; // 抽查只更新營業時間、價位與歇業標記，不動地址
          delete upd.place_id;
          const isChanged = hoursChanged(r.opening_hours, upd.opening_hours);
          if (isChanged) upd.hours_change_count = (r.hours_change_count || 0) + 1;
          const { error: uErr } = await userClient.from('restaurants').update(upd).eq('id', r.id);
          if (uErr) throw new Error(uErr.message);
          (isChanged ? changed : same).push(r.name);
        } catch (e) {
          failed.push({ name: r.name, error: String(e.message || e) });
          if (/Google (403|429)/.test(String(e.message))) break;
        }
      }
      return json({ mode: 'recheck', checked: changed.length + same.length, changed, same, notFound, failed });
    }

    // 3. 找出還沒查過的店
    const { data: todo, error: qErr } = await userClient
      .from('restaurants')
      .select('id, name, lat, lng, note, google_cid')
      .is('hours_updated_at', null)
      .not('lat', 'is', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (qErr) return json({ error: `查詢失敗：${qErr.message}` }, 500);

    const { count: remainingBefore } = await userClient
      .from('restaurants')
      .select('id', { count: 'exact', head: true })
      .is('hours_updated_at', null)
      .not('lat', 'is', null);

    if (dryRun) {
      return json({ dryRun: true, wouldProcess: (todo || []).map((r) => r.name), remaining: remainingBefore ?? 0 });
    }
    if (!apiKey) return json({ error: '尚未設定 GOOGLE_PLACES_API_KEY' }, 500);

    // 4. 逐間查 Google 並寫回
    const matched = [];
    const notFound = [];
    const failed = [];
    for (const r of todo || []) {
      // 放慢節奏：每次間隔約 3.5 秒，一分鐘不超過約 17 次，低於每分鐘 20 次的上限
      await new Promise((ok) => setTimeout(ok, 3500));
      try {
        const data = await searchPlace(apiKey, r.name, r.lat, r.lng);
        // 先用 Google 地圖的店家編號（cid）精準比對；座標只是粗略位置，不能單獨依賴
        const byCid = r.google_cid
          ? (data.places || []).find((p) => String(p.googleMapsUri || '').includes(`cid=${r.google_cid}`))
          : null;
        const hit = byCid
          ? { place: byCid, distanceM: 0 }
          : pickNearest(data.places, r.lat, r.lng, MATCH_RADIUS_M);
        const upd = buildUpdate(hit ? hit.place : null, r.note);
        if (byCid && byCid.location) {
          upd.lat = byCid.location.latitude;
          upd.lng = byCid.location.longitude;
        }
        let { error: uErr } = await userClient.from('restaurants').update(upd).eq('id', r.id);
        if (uErr && uErr.code === '23505' && upd.place_id) {
          // 同一個 Google 地點已被另一筆資料使用：不寫 place_id，其餘照存
          delete upd.place_id;
          ({ error: uErr } = await userClient.from('restaurants').update(upd).eq('id', r.id));
        }
        if (uErr) throw new Error(uErr.message);
        if (hit) matched.push({ name: r.name, distanceM: hit.distanceM, hasHours: !!upd.opening_hours });
        else {
          // 附上 Google 回傳的最近候選，方便判斷為什麼沒對上
          const near = (data.places || [])
            .filter((p) => p.location)
            .map((p) => ({ n: p.displayName?.text || '?', d: Math.round(haversineM(r.lat, r.lng, p.location.latitude, p.location.longitude)) }))
            .sort((a, b) => a.d - b.d)[0];
          notFound.push(near ? `${r.name}（最近的是「${near.n}」，距離 ${near.d} 公尺）` : `${r.name}（Google 沒有回傳任何結果）`);
        }
      } catch (e) {
        // Google 或寫入出錯的店不標記為已查，下次會再試；遇到額度或權限錯誤就整批停下
        failed.push({ name: r.name, error: String(e.message || e) });
        if (/Google (403|429)/.test(String(e.message))) break;
      }
    }

    const { count: remaining } = await userClient
      .from('restaurants')
      .select('id', { count: 'exact', head: true })
      .is('hours_updated_at', null)
      .not('lat', 'is', null);

    return json({
      processed: matched.length + notFound.length,
      matched: matched.length,
      withoutHours: matched.filter((m) => !m.hasHours).length,
      notFound,
      failed,
      remaining: remaining ?? 0,
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
});
