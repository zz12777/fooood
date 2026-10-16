// 依店名與 Google 的店家型態，初步建議類別。
// 只會建議資料庫裡已經存在的類別名稱；對不上就回傳空陣列（維持未分類）。
// 這份規則在 supabase/functions/add-places/index.ts 裡有一份相同的複本，改的時候兩邊一起改。

export const TYPE_MAP = {
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

export const NAME_RULES = [
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

export function suggestCats(name, types, catNames) {
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
