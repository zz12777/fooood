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
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 200 } },
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

    // 3. 找出還沒查過的店
    const { data: todo, error: qErr } = await userClient
      .from('restaurants')
      .select('id, name, lat, lng, note')
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
        const hit = pickNearest(data.places, r.lat, r.lng, MATCH_RADIUS_M);
        const upd = buildUpdate(hit ? hit.place : null, r.note);
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
