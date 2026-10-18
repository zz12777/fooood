// 附近的店：用直線距離估算到店的分鐘數，不呼叫任何付費服務。
// 估算會有誤差，所以篩選時多放寬 20%。

export const MODES = {
  walk: { label: '走路', kmh: 4.5, detour: 1.3, overhead: 0, gmaps: 'walking' },
  bike: { label: '騎車', kmh: 25, detour: 1.3, overhead: 1, gmaps: 'two-wheeler' },
  car: { label: '開車', kmh: 28, detour: 1.35, overhead: 2, gmaps: 'driving' },
};
export const MINUTE_OPTIONS = [5, 10, 15, 20, 30];
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

// 輸入街道或地址，用 OpenStreetMap 轉成座標（免費，不需要金鑰）
export async function geocode(text) {
  const q = /新竹/.test(text) ? text : `新竹 ${text}`;
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&accept-language=zh-TW' +
    '&viewbox=120.75,25.0,121.25,24.5&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('地址查詢暫時不能用');
  const rows = await res.json();
  if (!rows.length) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
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
