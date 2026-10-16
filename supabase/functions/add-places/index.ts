// Edge Function：貼 Google 地圖連結新增店家。
// 安全設計：
// 1. Google 金鑰只存在 Supabase Secrets（GOOGLE_PLACES_API_KEY）。
// 2. 呼叫者必須已登入且在 editors 白名單內（用 is_editor()），寫入也受 RLS 保護。
// 3. 每次最多 MAX_URLS 個連結，每個連結最多呼叫 Google 一次，每次間隔 3.5 秒。
// 4. 已存在的店（同店家編號或同 place_id）不會重複新增，也不會呼叫 Google。
// 5. 只跟隨 Google 的短網址，不會去連其他網站。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_URLS = 8;
const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/;

// --- logic:start（純邏輯，可獨立測試）---
function parseLine(line) {
  const m = String(line || '').match(/https?:\/\/\S+/);
  if (!m) return null;
  const url = m[0].replace(/[)\]】」。，,]+$/, '');
  const note = String(line).replace(m[0], '').trim();
  return { url, note: note || null };
}

// 從（已展開的）Google 地圖網址取出店名、店家編號 cid、座標
function parseMapsUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  let name = null;
  const pm = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (pm) {
    try {
      name = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim();
    } catch {
      name = pm[1].replace(/\+/g, ' ').trim();
    }
  }
  let cid = null;
  const hex = href.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (hex) cid = BigInt('0x' + hex[1]).toString();
  else if (/^\d+$/.test(url.searchParams.get('cid') || '')) cid = url.searchParams.get('cid');
  let lat = null;
  let lng = null;
  const c = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (c) {
    lat = Number(c[1]);
    lng = Number(c[2]);
  }
  return { name, cid, lat, lng };
}

// 簡體字轉繁體（只處理地址裡常見的字），再判斷是否為新竹市、新竹縣的哪一區
function normalizeAddr(addr) {
  const from = '县乡镇东关丰宝横区';
  const to = '縣鄉鎮東關豐寶橫區';
  return String(addr || '').replace(/./g, (ch) => {
    const i = from.indexOf(ch);
    return i >= 0 ? to[i] : ch;
  });
}
function pickAreaId(address, areas) {
  const a = normalizeAddr(address);
  const hit = areas.find((x) => x.county !== '其他' && a.includes(x.county + x.name));
  if (hit) return hit.id;
  const other = areas.find((x) => x.name === '其他地區');
  return other ? other.id : null;
}

function priceLevelFromRange(priceRange) {
  if (!priceRange) return null;
  const toNum = (m) => (m && m.units != null ? Number(m.units) + (m.nanos || 0) / 1e9 : null);
  const vals = [toNum(priceRange.startPrice), toNum(priceRange.endPrice)].filter((v) => v != null);
  if (!vals.length) return null;
  const mid = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mid < 150) return 1;
  if (mid < 400) return 2;
  if (mid < 800) return 3;
  return 4;
}

// 類別建議規則（和網站的 js/categorize.js 相同，改的時候兩邊一起改）
const TYPE_MAP = {
  ramen_restaurant: ['拉麵', '日式'],
  japanese_restaurant: ['日式'],
  sushi_restaurant: ['壽司', '日式'],
  korean_restaurant: ['韓式'],
  thai_restaurant: ['泰式'],
  italian_restaurant: ['義式'],
  pizza_restaurant: ['披薩'],
  vietnamese_restaurant: ['越式'],
  hot_pot_restaurant: ['火鍋'],
  barbecue_restaurant: ['燒烤'],
  steak_house: ['牛排', '西式'],
  seafood_restaurant: ['海鮮'],
  brunch_restaurant: ['早午餐'],
  breakfast_restaurant: ['早午餐'],
  cafe: ['咖啡廳'],
  coffee_shop: ['咖啡廳'],
  dessert_shop: ['冰品甜點'],
  dessert_restaurant: ['冰品甜點'],
  ice_cream_shop: ['冰品甜點'],
  bakery: ['冰品甜點'],
  tea_house: ['飲料'],
  juice_shop: ['飲料'],
  american_restaurant: ['西式'],
  hamburger_restaurant: ['西式'],
};

const NAME_RULES = [
  [/拉麵|ラーメン|らーめん|ramen/i, ['拉麵', '日式']],
  [/牛肉麵/, ['牛肉麵', '麵']],
  [/麵|米粉|河粉/, ['麵']],
  [/火鍋|鍋物|涮|麻辣鍋|石頭鍋/, ['火鍋']],
  [/燒肉|燒烤|烤肉|串燒|烤串|炭火|bbq/i, ['燒烤']],
  [/咖啡|coffee|cafe|café|珈琲/i, ['咖啡廳']],
  [/早午餐|brunch|早餐/i, ['早午餐']],
  [/茶餐廳|冰室/, ['港式']],
  [/茶|飲|豆沙|豆漿|果汁|檸檬|手搖|青草|奶蓋/, ['飲料']],
  [/冰|甜點|蛋糕|可麗餅|鬆餅|舒芙蕾|布丁|豆花|甜品|麻糬|甜甜圈|巧克力|dessert/i, ['冰品甜點']],
  [/義大利|義式|pasta|pizzeria|trattoria|燉飯/i, ['義式']],
  [/披薩|pizza/i, ['披薩']],
  [/韓式|韓國|韓|石鍋|拌飯/, ['韓式']],
  [/泰式|泰國|打拋|冬蔭/, ['泰式']],
  [/越南|越式|pho\b/i, ['越式']],
  [/港式|燒臘|港茶/, ['港式']],
  [/壽司|寿司|sushi|手卷/i, ['壽司', '日式']],
  [/日式|日本|居酒屋|丼|定食|天婦羅|炸豬排|お好み/, ['日式']],
  [/飯|丼|便當|燴飯|滷肉飯|雞肉飯/, ['飯']],
  [/咖哩|カレー|curry/i, ['咖哩飯']],
  [/牛排|steak/i, ['牛排', '西式']],
  [/海鮮|生魚片|蝦|蟹/, ['海鮮']],
  [/炸雞/, ['炸雞']],
  [/鐵板燒/, ['鐵板燒']],
  [/鹹水雞/, ['鹹水雞']],
  [/熱炒|快炒/, ['熱炒']],
  [/宵夜/, ['宵夜']],
  [/小吃|滷味|臭豆腐|蚵仔|肉圓|碗粿|擔仔|鹽酥雞|蔥油餅|刈包/, ['台式小吃', '小吃']],
];

function suggestCats(name, types, catNames) {
  const have = new Set(catNames);
  const out = [];
  const add = (list) => list.forEach((c) => have.has(c) && !out.includes(c) && out.push(c));
  for (const t of types || []) if (TYPE_MAP[t]) add(TYPE_MAP[t]);
  const full = String(name || '');
  // 「茶餐廳」「冰室」是港式餐廳，不是飲料或冰品，其他規則先把這兩個詞拿掉再比對
  const n = full.replace(/茶餐廳|冰室/g, '');
  for (const [re, cats] of NAME_RULES) {
    if (re.test(re.source.startsWith('茶餐廳') ? full : n) || (cats[0] === '港式' && re.test(full))) {
      // 「台式小吃」和「小吃」只取存在的第一個
      if (cats[0] === '台式小吃') add(cats.filter((c) => have.has(c)).slice(0, 1));
      else add(cats);
    }
  }
  return out;
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
  'places.regularOpeningHours',
  'places.priceRange',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.types',
].join(',');

async function expandUrl(input) {
  let cur = input;
  for (let i = 0; i < 6; i++) {
    const host = new URL(cur).hostname;
    if (!SHORT_HOSTS.test(host)) break;
    const res = await fetch(cur, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) cur = new URL(loc, cur).href;
    else break;
  }
  return cur;
}

async function searchPlace(apiKey, name, lat, lng) {
  const body = { textQuery: name, languageCode: 'zh-TW', regionCode: 'TW', maxResultCount: 5 };
  if (lat != null) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } };
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
    const lines = Array.isArray(body.lines) ? body.lines.slice(0, MAX_URLS) : [];
    if (!lines.length) return json({ error: '沒有收到連結' }, 400);

    const { data: areas, error: aErr } = await db.from('areas').select('id, name, county');
    if (aErr) return json({ error: `讀取地區失敗：${aErr.message}` }, 500);

    const { data: catRows } = await db.from('categories').select('id, name');
    const catIdByName = new Map((catRows || []).map((c) => [c.name, c.id]));

    const results = [];
    const seen = new Set();
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) {
        results.push({ input: String(line).slice(0, 60), status: 'failed', message: '找不到連結' });
        continue;
      }
      const label = parsed.url.slice(0, 60);
      try {
        const host = new URL(parsed.url).hostname;
        if (!SHORT_HOSTS.test(host) && !GOOGLE_HOST.test(host)) throw new Error('不是 Google 地圖連結');
        const full = await expandUrl(parsed.url);
        if (!GOOGLE_HOST.test(new URL(full).hostname)) throw new Error('短網址沒有指向 Google 地圖');
        if (/placelists|\/maps\/(?:@|\/)?[^/]*\/?lists?\//.test(full)) {
          throw new Error('這是一份清單的連結，不是單一店家。請改貼清單裡每間店各自的分享連結');
        }
        const info = parseMapsUrl(full);
        if (!info || !info.name) throw new Error('網址裡找不到店名，請改貼地圖上「分享」的連結');
        if (!info.cid) throw new Error('網址裡找不到店家編號，請改貼地圖上「分享」的連結');

        if (seen.has(info.cid)) {
          results.push({ input: label, name: info.name, status: 'exists', message: '這次貼的連結裡重複了' });
          continue;
        }
        seen.add(info.cid);
        const dup = await db.from('restaurants').select('name').eq('google_cid', info.cid).maybeSingle();
        if (dup.data) {
          results.push({ input: label, name: dup.data.name, status: 'exists', message: '已經在清單裡' });
          continue;
        }

        await sleep(3500);
        const data = await searchPlace(apiKey, info.name, info.lat, info.lng);
        const place = (data.places || []).find((p) => String(p.googleMapsUri || '').includes(`cid=${info.cid}`));
        if (!place) throw new Error(`Google 搜尋「${info.name}」沒有對到同一間店`);

        const dup2 = await db.from('restaurants').select('name').eq('place_id', place.id).maybeSingle();
        if (dup2.data) {
          results.push({ input: label, name: dup2.data.name, status: 'exists', message: '已經在清單裡' });
          continue;
        }

        const roh = place.regularOpeningHours;
        const row = {
          name: place.displayName?.text || info.name,
          address: place.formattedAddress || null,
          lat: place.location?.latitude ?? null,
          lng: place.location?.longitude ?? null,
          maps_url: parsed.url,
          place_id: place.id,
          google_cid: info.cid,
          area_id: pickAreaId(place.formattedAddress, areas),
          price_level: priceLevelFromRange(place.priceRange),
          opening_hours:
            roh && Array.isArray(roh.periods) && roh.periods.length
              ? { periods: roh.periods, weekdayDescriptions: roh.weekdayDescriptions || [] }
              : null,
          hours_updated_at: new Date().toISOString(),
          status: 'want',
          needs_review: true,
          note: parsed.note,
        };
        if (place.businessStatus === 'CLOSED_PERMANENTLY') {
          row.note = row.note ? `Google 標示：已永久歇業。${row.note}` : 'Google 標示：已永久歇業';
        }
        const ins = await db.from('restaurants').insert(row).select('id').single();
        if (ins.error) throw new Error(`寫入失敗：${ins.error.message}`);
        // 依店名與 Google 的店家型態，初步分類；對不上就維持未分類
        const picked = suggestCats(row.name, place.types, [...catIdByName.keys()]);
        if (picked.length) {
          const link = await db
            .from('restaurant_categories')
            .insert(picked.map((n) => ({ restaurant_id: ins.data.id, category_id: catIdByName.get(n) })));
          if (link.error) picked.length = 0;
        }
        results.push({
          input: label,
          name: row.name,
          status: 'added',
          message: picked.length ? `已新增，分類：${picked.join('、')}` : '已新增，沒有符合的分類，請到整理頁選',
        });
      } catch (e) {
        const msg = String(e.message || e);
        results.push({ input: label, status: 'failed', message: msg });
        if (/Google (403|429)/.test(msg)) break; // 額度或權限問題，整批停下
      }
    }
    return json({ results });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
});
