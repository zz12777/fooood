// 附近的店：用直線距離估算到店的分鐘數，不呼叫任何付費服務。
// 估算會有誤差，所以篩選時多放寬 20%。

export const MODES = {
  // 市區實際會遇到紅綠燈、單行道、繞過鐵路與河川，所以速度與繞路係數都抓得比較保守
  walk: { label: '走路', kmh: 4.2, detour: 1.4, overhead: 0, gmaps: 'walking' },
  bike: { label: '騎車', kmh: 18, detour: 1.5, overhead: 2, gmaps: 'two-wheeler' },
  car: { label: '開車', kmh: 20, detour: 1.5, overhead: 4, gmaps: 'driving' },
};
export const MINUTE_OPTIONS = [5, 15, 30];
export const BUFFER = 1.2;

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function estimateMinutes(km, mode) {
  const m = MODES[mode] || MODES.walk;
  return Math.round(((km * m.detour) / m.kmh) * 60 + m.overhead);
}

// 回傳到店的估算分鐘數；店沒有座標就回傳 null
export function minutesTo(r, origin, mode) {
  if (!origin || typeof r.lat !== 'number' || typeof r.lng !== 'number') return null;
  return estimateMinutes(distanceKm(origin.lat, origin.lng, r.lat, r.lng), mode);
}

export const withinLimit = (min, limit) => min !== null && min <= Math.round(limit * BUFFER);

export function routeUrl(origin, r, mode) {
  const dest = `${r.name} ${r.address || ''}`.trim();
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${origin.lat},${origin.lng}` +
    `&destination=${encodeURIComponent(dest)}` +
    `&travelmode=${(MODES[mode] || MODES.walk).gmaps}`
  );
}

// 輸入街道或地址，用 OpenStreetMap 轉成座標（免費，不需要金鑰）。
// 沒寫縣市時，先只找新竹一帶，找不到才擴大到全台；有寫縣市就直接依輸入找。
// 同名的路可能很多，所以回傳最多 8 個候選讓使用者選，每個候選都帶縣市與區。
const HSINCHU_BOX = '120.85,24.92,121.20,24.65';

async function searchOsm(text, box) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&countrycodes=tw&accept-language=zh-TW' +
    (box ? `&viewbox=${box}&bounded=1` : '') +
    `&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('地址查詢暫時不能用');
  const rows = await res.json();
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const a = r.address || {};
    const label =
      [a.city || a.county, a.city_district || a.suburb || a.town || a.township, a.village || a.neighbourhood, a.road]
        .filter(Boolean)
        .join('') || String(r.display_name || '').split(',').slice(0, 3).join(' ');
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ lat: Number(r.lat), lng: Number(r.lon), label });
    if (out.length >= 8) break;
  }
  return out;
}

export async function geocode(text) {
  const hasCity = /[市縣]/.test(text);
  if (!hasCity) {
    const near = await searchOsm(text, HSINCHU_BOX);
    if (near.length) return near;
  }
  return searchOsm(text);
}

export function currentPosition() {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) return fail(new Error('這個瀏覽器不支援定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => fail(new Error(e.code === 1 ? '沒有允許定位，請改用輸入街道' : '定位失敗，請改用輸入街道')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}
