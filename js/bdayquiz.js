// 生日行程測驗：依回答從壽星優惠裡排出一天的行程（純邏輯，不碰畫面）
import { whenOf } from './bdaytime.js?v=20261123';

export const COUNTIES = [
  '新竹市', '新竹縣', '台北市', '新北市', '基隆市', '桃園市', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣',
];

// 喜歡的食物選項，對應到優惠的標籤
export const FOODS = [
  { id: 'bbq', label: '燒肉', tags: ['燒烤/串燒'], title: '燒肉派壽星' },
  { id: 'hotpot', label: '火鍋', tags: ['火鍋'], title: '火鍋派壽星' },
  { id: 'jp', label: '日式', tags: ['日式', '拉麵', '壽司'], title: '和風壽星' },
  { id: 'steak', label: '牛排', tags: ['牛排'], title: '牛排派壽星' },
  { id: 'buffet', label: '吃到飽', tags: ['吃到飽'], title: '吃到飽派壽星' },
  { id: 'asia', label: '韓式、泰式', tags: ['韓式', '泰式', '印度'], title: '異國探險壽星' },
  { id: 'west', label: '西式、義式', tags: ['西式', '義式', '披薩', '漢堡'], title: '洋食派壽星' },
  { id: 'sweet', label: '甜點', tags: ['冰品甜點'], title: '甜點系壽星' },
  { id: 'drink', label: '飲料、咖啡', tags: ['飲料', '咖啡廳'], title: '手搖控壽星' },
];

// 一天的時段，每段只看對應標籤的優惠
export const SLOTS = [
  { id: 'morning', label: '早上', tags: ['飲料', '咖啡廳', '早午餐'] },
  { id: 'lunch', label: '中午', tags: ['日式', '飯', '麵', '拉麵', '牛肉麵', '韓式', '泰式', '義式', '西式', '港式', '炸雞/炸物', '漢堡', '台式小吃', '披薩', '壽司', '印度', '鐵板燒', '早午餐'] },
  { id: 'afternoon', label: '下午', tags: ['冰品甜點'] },
  { id: 'dinner', label: '晚上', tags: ['燒烤/串燒', '火鍋', '牛排', '吃到飽', '鐵板燒', '韓式', '泰式', '日式', '西式', '義式'] },
];

const REGION = /^(台北|新北|基隆|桃園|新竹|苗栗|台中|彰化|南投|雲林|嘉義|台南|高雄|屏東|宜蘭|花蓮|台東|澎湖|金門|連江)/;
const NUM = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

// 只有單一門市的店，備註開頭會寫縣市（例如「台中；…」）
export function regionOf(b) {
  const m = String(b.note || '').match(REGION);
  return m ? m[1] : null;
}

export const needsMember = (b) => /會員|ocard|app|line|註冊|下載|官網申請|官網登記/i.test(`${b.offer} ${b.note || ''}`);

// 優惠要幾個人同行才成立，例如「四人同行壽星免費」回傳 4；沒有人數條件回傳 0
export function partyMin(b) {
  const s = String(b.offer || '');
  if (/以下/.test(s)) return 0;
  const m = s.match(/([一二兩三四五六七八九十]|\d+)\s*人(?:以上)?(?:同行|用餐)|([一二兩三四五六七八九十]|\d+)\s*人以上/);
  if (!m) return 0;
  const v = m[1] || m[2];
  return NUM[v] || Number(v) || 0;
}

const overlap = (a, b) => a.some((x) => b.includes(x));

// answers: { day: 'birthday' | 'other', county, party: 1|2|4|5, foods: [id], member: true|false }
export function buildPlan(brands, answers, rnd = Math.random) {
  const pref = FOODS.filter((f) => answers.foods.includes(f.id)).flatMap((f) => f.tags);
  const short = String(answers.county || '').replace(/[市縣]$/, '');
  const pool = brands.filter((b) => {
    const w = whenOf(b);
    if (answers.day === 'other' && w === 'day') return false;
    const r = regionOf(b);
    if (r && short && r !== short) return false;
    if (!answers.member && needsMember(b)) return false;
    if ((b.no_counties || []).includes(answers.county)) return false;
    // 有填「有分店的縣市」時，只推薦給選了這些縣市的人
    if ((b.counties || []).length && !b.counties.includes(answers.county)) return false;
    return true;
  });
  const used = new Set();
  const plan = [];
  for (const slot of SLOTS) {
    let best = null;
    for (const b of pool) {
      if (used.has(b.id) || !overlap(b.tags || [], slot.tags)) continue;
      const w = whenOf(b);
      const need = partyMin(b);
      const reasons = [];
      let score = rnd() * 1.5;
      if (overlap(b.tags || [], pref)) score += 3;
      if (answers.day === 'birthday' && (w === 'day' || w === 'day_month')) {
        score += slot.id === 'dinner' || slot.id === 'lunch' ? 3 : 1.5;
      }
      if (answers.day === 'other' && w === 'window') score -= 1;
      if (need) {
        if (answers.party >= need) {
          score += 2;
          reasons.push({ k: '{n} 人以上同行適用', p: { n: need } });
        } else score -= 6;
      }
      if (!best || score > best.score) best = { b, score, reasons };
    }
    if (best && best.score > -3) {
      used.add(best.b.id);
      plan.push({ slot, brand: best.b, reasons: best.reasons });
    }
  }
  const first = FOODS.find((f) => answers.foods.includes(f.id));
  return { title: first ? first.title : '什麼都想吃的壽星', plan, poolSize: pool.length };
}
