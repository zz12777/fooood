// Edge Function：新增或更新壽星優惠，並找出這個品牌在新竹一帶的分店。
// 安全設計與 add-places 相同：
// 1. Google 金鑰只存在 Supabase Secrets（GOOGLE_PLACES_API_KEY）。
// 2. 呼叫者必須已登入且在 editors 白名單內（is_editor()），寫入也受 RLS 保護。
// 3. 每個品牌先搜新竹一帶（最多 2 頁），再搜全台（最多 3 頁），每頁最多 20 間；每次呼叫間隔 3.5 秒。
//    全台超過 60 間的大型連鎖，新竹以外只會收到一部分，新竹一帶則盡量收齊。
// 4. 只收店名含品牌名稱或搜尋關鍵字的結果。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_ITEMS = 4;
// 新竹市與竹北、竹東、新豐、湖口、寶山、芎林一帶，以及台灣本島與離島
const SCOPES = [
  { name: '新竹一帶', pages: 2, rect: { low: { latitude: 24.65, longitude: 120.85 }, high: { latitude: 24.95, longitude: 121.25 } } },
  { name: '全台', pages: 3, rect: { low: { latitude: 21.8, longitude: 118.1 }, high: { latitude: 26.4, longitude: 122.1 } } },
];

// --- logic:start（純邏輯，可獨立測試）---
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// 店名要包含品牌名稱或搜尋關鍵字，避免把附近其他店也算成分店
function isBranch(displayName, brand, keyword) {
  const d = normName(displayName);
  return [brand, keyword].filter(Boolean).some((k) => {
    const n = normName(k);
    return n.length >= 2 && d.includes(n);
  });
}

// 全台的搜尋範圍會碰到對岸沿海，排除中國大陸的地址
function inTaiwan(address) {
  return !/中国|中國|福建|省/.test(String(address || ''));
}

function cleanItem(it) {
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const tags = (Array.isArray(it.tags) ? it.tags : String(it.tags || '').split(/[,，、]/))
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    brand: s(it.brand, 60),
    keyword: s(it.keyword, 60) || null,
    offer: s(it.offer, 300),
    tags,
    note: s(it.note, 500) || null,
    source: s(it.source, 300) || null,
  };
}
// --- logic:end ---

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.businessStatus',
  'nextPageToken',
].join(',');

async function logUsage(db) {
  try {
    await db.from('api_usage').insert({ fn: 'add-birthday', n: 1 });
  } catch {
    /* 忽略 */
  }
}

async function searchPage(apiKey, db, query, rect, pageToken) {
  await logUsage(db);
  const body = { textQuery: query, languageCode: 'zh-TW', regionCode: 'TW', pageSize: 20, locationRestriction: { rectangle: rect } };
  if (pageToken) body.pageToken = pageToken;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

    const authHeader = req.headers.get('Authorization') || '';
    const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await db.auth.getUser();
    if (!userData?.user?.email) return json({ error: '請先登入' }, 401);
    const { data: isEditor, error: edErr } = await db.rpc('is_editor');
    if (edErr) return json({ error: `讀取白名單失敗：${edErr.message}` }, 500);
    if (!isEditor) return json({ error: '這個帳號沒有權限' }, 403);
    if (!apiKey) return json({ error: '尚未設定 GOOGLE_PLACES_API_KEY' }, 500);

    const body = await req.json().catch(() => ({}));
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS).map(cleanItem);
    if (!items.length) return json({ error: '沒有收到資料' }, 400);

    const results = [];
    for (const it of items) {
      if (!it.brand || !it.offer) {
        results.push({ brand: it.brand || '(空白)', status: 'failed', message: '品牌和優惠都要填' });
        continue;
      }
      try {
        // 品牌存在就更新優惠內容，不存在就新增
        const up = await db
          .from('birthday_brands')
          .upsert({ ...it, updated_at: new Date().toISOString() }, { onConflict: 'brand' })
          .select('id')
          .single();
        if (up.error) throw new Error(`寫入失敗：${up.error.message}`);
        const brandId = up.data.id;

        let found = 0;
        let added = 0;
        const seenIds = new Set();
        for (const scope of SCOPES) {
          let token = null;
          for (let page = 0; page < scope.pages; page++) {
            await sleep(3500);
            const data = await searchPage(apiKey, db, it.keyword || it.brand, scope.rect, token);
            const rows = (data.places || [])
              .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
              .filter((p) => isBranch(p.displayName?.text, it.brand, it.keyword))
              .filter((p) => inTaiwan(p.formattedAddress))
              .filter((p) => !seenIds.has(p.id))
              .map((p) => {
                seenIds.add(p.id);
                return {
                  brand_id: brandId,
                  name: p.displayName?.text || it.brand,
                  address: p.formattedAddress || null,
                  lat: p.location?.latitude ?? null,
                  lng: p.location?.longitude ?? null,
                  place_id: p.id,
                  maps_url: p.googleMapsUri || null,
                };
              });
            found += rows.length;
            if (rows.length) {
              const ins = await db.from('birthday_branches').upsert(rows, { onConflict: 'place_id', ignoreDuplicates: true }).select('id');
              if (ins.error) throw new Error(`分店寫入失敗：${ins.error.message}`);
              added += (ins.data || []).length;
            }
            token = data.nextPageToken;
            if (!token) break;
          }
        }
        results.push({
          brand: it.brand,
          status: 'ok',
          found,
          added,
          message: found ? `找到 ${found} 間分店，新加入 ${added} 間` : '沒有找到分店，優惠先存起來，可以在最後一欄填搜尋關鍵字再試',
        });
      } catch (e) {
        const msg = String(e.message || e);
        results.push({ brand: it.brand, status: 'failed', message: msg });
        if (/Google (403|429)/.test(msg)) break;
      }
    }
    return json({ results });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
});
