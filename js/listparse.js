// 解析從 Google 地圖清單頁「全選複製」的文字，取出店名。
// 清單頁一間店大約是：店名、評分、(評論數)、價位與類型、有時還有備註。
const RATING = /^\d(\.\d)?(\s*\([\d,]+\))?$/;
const COUNT = /^\([\d,]+\)$/;
const PRICE = /^\$[\d,\-+]+\s*(·.*)?$/;
const DOT = /^·/;
const NOISE = /^(儲存|分享|已儲存|地圖|清單|休[週周][一二三四五六日]|推薦[：:].*|暫時關閉|永久歇業|營業中|休息中|外送速遞餐廳|外賣自取餐廳)$/;

export function parseListText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const names = [];
  let afterRating = false; // 評分之後的第一行文字是類型，不是店名
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (RATING.test(l) || COUNT.test(l)) {
      afterRating = true;
      continue;
    }
    if (PRICE.test(l) || DOT.test(l)) {
      afterRating = false;
      continue;
    }
    if (NOISE.test(l)) continue;
    const next = lines[i + 1] || '';
    if (afterRating && !(RATING.test(next) || COUNT.test(next))) {
      afterRating = false; // 這行是類型（例如「西點」「愛心食堂」）
      continue;
    }
    afterRating = false;
    if (l.length < 2 || l.length > 80) continue;
    names.push(l);
  }
  const seen = new Set();
  return names.filter((n) => {
    const k = n.toLowerCase().replace(/\s+/g, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
