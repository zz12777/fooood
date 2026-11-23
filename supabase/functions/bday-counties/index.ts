// Edge Function：用 Google 查每個壽星優惠品牌的分店分布在哪些縣市，只存縣市，不存分店。
// 安全設計與 add-places 相同：金鑰只在 Supabase Secrets，呼叫者必須在 editors 白名單內。
// 每個品牌只搜尋一次全台（最多 20 間）。剛好滿 20 間代表是大型連鎖，縣市留空白（視為全台都有）。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_PER_CALL = 8;
const TAIWAN = { low: { latitude: 21.8, longitude: 118.1 }, high: { latitude: 26.4, longitude: 122.1 } };
const COUNTIES = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣',
];

// --- logic:start ---
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function isBranch(displayName, brand, keyword) {
  const d = normName(displayName);
  return [brand, keyword].filter(Boolean).some((k) => {
    const n = normName(k);
    return n.length >= 2 && d.includes(n);
  });
}
function countyOf(address) {
  const a = String(address || '').replace(/臺/g, '台').replace(/县/g, '縣').replace(/台湾/g, '台灣');
  if (/中国|中國|福建|省/.test(a)) return null;
  let best = null;
  let at = Infinity;
  for (const c of COUNTIES) {
    const i = a.indexOf(c);
    if (i !== -1 && i < at) {
      at = i;
      best = c;
    }
  }
  return best;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: '只接受 POST' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!url || !anon) return json({ error: '伺服器設定不完整' }, 500);
    const db = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: userData } = await db.auth.getUser();
    if (!userData?.user?.email) return json({ error: '請先登入' }, 401);
    const { data: isEditor, error: edErr } = await db.rpc('is_editor');
    if (edErr) return json({ error: `讀取白名單失敗：${edErr.message}` }, 500);
    if (!isEditor) return json({ error: '這個帳號沒有權限' }, 403);
    if (!apiKey) return json({ error: '尚未設定 GOOGLE_PLACES_API_KEY' }, 500);

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(MAX_PER_CALL, Number(body.limit) || MAX_PER_CALL));
    const { data: todo, error: qErr } = await db
      .from('birthday_brands')
      .select('id, brand, keyword')
      .is('counties_checked_at', null)
      .order('id')
      .limit(limit);
    if (qErr) return json({ error: `查詢失敗：${qErr.message}` }, 500);
    const { count: left } = await db
      .from('birthday_brands')
      .select('id', { count: 'exact', head: true })
      .is('counties_checked_at', null);

    const results = [];
    for (const b of todo || []) {
      try {
        await sleep(3500);
        try {
          await db.from('api_usage').insert({ fn: 'bday-counties', n: 1 });
        } catch {
          /* 記錄失敗不影響 */
        }
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.businessStatus,nextPageToken',
          },
          body: JSON.stringify({
            textQuery: b.brand,
            languageCode: 'zh-TW',
            regionCode: 'TW',
            pageSize: 20,
            locationRestriction: { rectangle: TAIWAN },
          }),
        });
        if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const all = data.places || [];
        const matched = all
          .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
          .filter((p) => isBranch(p.displayName?.text, b.brand, b.keyword));
        // 一頁就滿 20 筆而且還有下一頁，視為大型連鎖：縣市留空白
        const big = all.length >= 20 && !!data.nextPageToken && matched.length >= 15;
        const counties = big ? [] : [...new Set(matched.map((p) => countyOf(p.formattedAddress)).filter(Boolean))];
        const { error: uErr } = await db
          .from('birthday_brands')
          .update({ counties, counties_checked_at: new Date().toISOString() })
          .eq('id', b.id);
        if (uErr) throw new Error(`寫入失敗：${uErr.message}`);
        results.push({ brand: b.brand, status: big ? 'big' : counties.length ? 'found' : 'none', counties, found: matched.length });
      } catch (e) {
        const msg = String(e.message || e);
        results.push({ brand: b.brand, status: 'failed', message: msg });
        if (/Google (403|429)/.test(msg)) break;
      }
    }
    return json({ results, left: Math.max(0, (left || 0) - results.filter((r) => r.status !== 'failed').length) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
});
