// 中英文切換。店名、地名、備註、優惠內容等資料不翻，只翻介面文字與類別名稱。
// 用法：t('中文原文', { 參數 })，英文模式下找得到翻譯就用翻譯，找不到就維持中文。

const KEY = 'fooood:lang';
export const lang = (() => {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
})();

export function setLang(l) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* 存不了就只在這次生效 */
  }
  location.reload();
}

const EN = {
  // 頁首與分頁
  '新竹吃什麼': 'Hsinchu Eats',
  '新竹市與新竹縣的口袋餐廳清單。依地區、價位、類別篩選，也能隨機抽今天吃什麼。':
    'A list of favorite restaurants in Hsinchu. Filter by area, price and category, or let luck pick today\'s meal.',
  '跳到餐廳清單': 'Skip to the restaurant list',
  '推薦店家/新增評論表單': 'Suggest a place / leave a review',
  '（開啟外部表單）': '(opens an external form)',
  '頁面': 'Pages',
  '餐廳清單': 'Restaurants',
  '壽星優惠': 'Birthday deals',
  '目前看到的是示範資料，店家都是虛構的，不是你的收藏。': 'You are looking at demo data. These places are made up.',
  // 抽籤
  '今天吃什麼？': 'What should we eat today?',
  '資料載入後，就能從符合條件的店裡抽。': 'Once the list loads, you can draw from the places that match.',
  '只抽營業中的店': 'Only places open now',
  '排除吃過的': 'Skip places I have been',
  '抽三間幸運店家': 'Draw 3 lucky places',
  '再抽一次': 'Draw again',
  '若想縮小範圍，可先在下方選擇地區、價位或類別。': 'To narrow it down, pick an area, price or category below first.',
  '目前沒有符合條件的店，放寬篩選或關掉開關再試試。': 'Nothing matches right now. Loosen the filters or turn off a switch.',
  '從符合條件的店裡抽出 {n} 間。': 'Drew {n} from the places that match.',
  '只抽{when} 有開的店': 'Only places open {when}',
  // 篩選
  '篩選地區、價位、類別': 'Filter by area, price, category',
  '地區': 'Area',
  '價位（人均）': 'Price (per person)',
  '類別': 'Category',
  '營業時間': 'Opening hours',
  '現在營業中': 'Open now',
  '指定時間': 'Pick a time',
  '找': 'Find places open',
  '哪一天': 'Day',
  '幾點': 'Time',
  '有開的店家': '',
  '搜尋': 'Search',
  '取消營業時間篩選': 'Clear opening hours filter',
  '僅以先前匯入的營業時間判定，實際需以 Google Map 當前版本為準（店家可能有修改過）。':
    'Based on the hours saved when each place was added. Check Google Maps for the latest hours, as they may have changed.',
  '附近': 'Nearby',
  '以街道查詢': 'Search by street',
  '使用目前位置': 'Use my location',
  '搜尋離': 'Near',
  '起點的街道或地址': 'Starting street or address',
  '例如 大學路': 'e.g. 大學路',
  '目前位置': 'my location',
  '交通方式': 'Getting there',
  '幾分鐘內': 'Minutes',
  '分鐘內的店家': 'minutes away',
  '分鐘內的分店': 'minutes away',
  '取消附近篩選': 'Clear nearby filter',
  '清單依直線距離由近到遠排，分鐘數只是粗略估算，會多放寬 20%。實際時間請點卡片上的「路線」。':
    'Sorted by straight line distance. Minutes are a rough estimate with 20% extra. Tap "Route" on a card for real travel time.',
  '依直線距離由近到遠排，分鐘數只是粗略估算，會多放寬 20%。實際時間請點卡片上的「路線」。':
    'Sorted by straight line distance. Minutes are a rough estimate with 20% extra. Tap "Route" on a card for real travel time.',
  '清除所有篩選': 'Clear all filters',
  '已篩選：現在營業中的店家': 'Showing places open now',
  '已篩選：{when} 有開的店家': 'Showing places open {when}',
  '已篩選：離「{label}」{mode} {min} 分鐘內的店家，由近到遠排': 'Showing places within {min} min by {mode} of "{label}", nearest first',
  '已篩選：離「{label}」{mode} {min} 分鐘內的分店，由近到遠排': 'Showing branches within {min} min by {mode} of "{label}", nearest first',
  '查詢中': 'Searching',
  '請先輸入街道或地址': 'Please type a street or address first',
  '找不到這個地址，請加上縣市或區名再查，例如「新竹市東區 中華路二段」':
    'Address not found. Try adding the city or district, e.g. 新竹市東區 中華路二段',
  '找到好幾個地點，請選起點。如果沒有你要的，請加上縣市再查，例如「新竹市 中華路二段」':
    'Several places found. Pick your starting point, or add the city and search again.',
  '找到好幾個地點，請選起點。如果沒有你要的，請加上縣市再查': 'Several places found. Pick your starting point, or add the city and search again.',
  '查詢失敗': 'Search failed',
  '地址查詢暫時不能用': 'Address search is unavailable right now',
  '這個瀏覽器不支援定位': 'This browser does not support location',
  '沒有允許定位，請改用輸入街道': 'Location permission denied. Please type a street instead.',
  '定位失敗，請改用輸入街道': 'Could not get your location. Please type a street instead.',
  '走路': 'walking',
  '騎車': 'scooter',
  '開車': 'car',
  '現在': 'now',
  '今天': 'Today',
  '明天': 'Tomorrow',
  // 清單與卡片
  '搜尋店名或備註': 'Search names or notes',
  '共 {n} 間': '{n} places',
  '符合 {m} 間，共 {n} 間': '{m} of {n} places',
  '{n} 項': '{n}',
  '營業中': 'Open',
  '休息中': 'Closed',
  '{when} 有開': 'Open {when}',
  '未分類': 'Uncategorized',
  '吃過': 'Been there',
  '路線': 'Route',
  '參考連結': 'Link',
  '人均 {p}': 'Per person {p}',
  '150 元以下': 'Under NT$150',
  '150 至 400 元': 'NT$150 to 400',
  '400 至 800 元': 'NT$400 to 800',
  '800 元以上': 'Over NT$800',
  '其他縣市': 'Other cities',
  '其他': 'Other',
  '空空的碗': 'An empty bowl',
  '翻找菜單中': 'Looking through the menu',
  '稍等一下。': 'Just a moment.',
  '還沒有餐廳': 'No restaurants yet',
  '匯入 Google 地圖的收藏後，這裡就會長出一整份清單。': 'Once places are added, the list will show up here.',
  '沒有符合的店': 'No matching places',
  '換個條件看看，或把篩選清掉。': 'Try other filters, or clear them.',
  '連不上資料庫': 'Cannot reach the database',
  '可能是網路不穩，或資料庫暫停了。稍後再試一次。': 'The network may be unstable or the database is paused. Please try again later.',
  '再試一次': 'Try again',
  '資料庫回應 {s}': 'Database responded {s}',
  '用來把想吃的店收在同一個地方。': 'All the places we want to eat, in one spot.',
  '管理': 'Admin',
  // 類別分群
  '什麼式': 'Cuisine',
  '時間': 'Meal time',
  '品項': 'Dishes',
  // 壽星優惠
  '壽星優惠 | 新竹吃什麼': 'Birthday deals | Hsinchu Eats',
  '生日快到了嗎？看看新竹附近哪些店家有壽星優惠。': 'Birthday coming up? See which places have birthday deals.',
  '生日快到了嗎？': 'Birthday coming up?',
  '優惠內容整理自網路分享，實際以各店家官方公告為準。':
    'Deals are collected from posts online and are shown in Chinese. Check each brand\'s official announcement for the latest terms.',
  '依類別篩選': 'Filter by category',
  '優惠清單': 'Deals',
  '附近的壽星優惠': 'Birthday deals nearby',
  '搜尋店名或優惠': 'Search brands or deals',
  '想推薦壽星優惠？': 'Know a birthday deal?',
  '告訴我們': 'Tell us',
  '來源：': 'Source: ',
  '在 Google Map 找分店': 'Find branches on Google Maps',
  '還沒有壽星優惠': 'No birthday deals yet',
  '整理好之後就會出現在這裡。': 'They will show up here once added.',
  '沒有符合的優惠': 'No matching deals',
  '換個類別或關鍵字看看。': 'Try another category or keyword.',
  '附近沒有符合的分店': 'No branches nearby',
  '把分鐘數調大，或換個交通方式試試。': 'Try more minutes or another way of getting there.',
  '載入中': 'Loading',
  '暫時讀不到資料': 'Cannot load data right now',
};

// 類別名稱
const CATS = {
  日式: 'Japanese', 泰式: 'Thai', 義式: 'Italian', 韓式: 'Korean', 台式小吃: 'Taiwanese snacks', 港式: 'Hong Kong',
  越式: 'Vietnamese', 西式: 'Western', 印度: 'Indian', 美式: 'American', 中式: 'Chinese',
  早餐: 'Breakfast', 午餐: 'Lunch', 晚餐: 'Dinner', 早午餐: 'Brunch', 下午茶: 'Afternoon tea', 宵夜: 'Late night',
  飯: 'Rice', 麵: 'Noodles', 披薩: 'Pizza', 火鍋: 'Hot pot', 咖啡廳: 'Cafe', '燒烤/串燒': 'BBQ & skewers',
  拉麵: 'Ramen', 牛肉麵: 'Beef noodles', 冰品甜點: 'Desserts', 飲料: 'Drinks', 鐵板燒: 'Teppanyaki',
  鹹水雞: 'Salted chicken', 熱炒: 'Stir fry', 牛排: 'Steak', 海鮮: 'Seafood', 壽司: 'Sushi', 咖哩飯: 'Curry rice',
  '炸雞/炸物': 'Fried chicken', 麵線: 'Vermicelli', 漢堡: 'Burgers', 麻辣燙: 'Mala soup', 小吃: 'Snacks',
  吃到飽: 'Buffet', 素食: 'Vegetarian', 早午餐店: 'Brunch',
};

const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (d) => (lang === 'en' ? WEEK_EN[d] : `週${'日一二三四五六'[d]}`);

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : `{${k}}`));

export function t(zh, params) {
  if (lang === 'en' && Object.prototype.hasOwnProperty.call(EN, zh)) return fill(EN[zh], params);
  return fill(zh, params);
}

export const catName = (name) => (lang === 'en' && CATS[name]) || name;

// 把頁面上寫死的中文介面文字換成英文：文字節點與 placeholder、aria-label、title
export function translateDom(root = document.body) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  if (lang !== 'en') return;
  document.title = t(document.title);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const k = n.nodeValue.trim();
    if (k && Object.prototype.hasOwnProperty.call(EN, k)) n.nodeValue = n.nodeValue.replace(k, EN[k]);
  }
  root.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (v && Object.prototype.hasOwnProperty.call(EN, v)) el.setAttribute(a, EN[v]);
    }
  });
}

// 頁首的切換鈕：顯示「要切換過去」的語言
export function mountLangToggle(el) {
  if (!el) return;
  el.textContent = lang === 'en' ? '中文' : 'EN';
  el.setAttribute('aria-label', lang === 'en' ? '切換成中文' : 'Switch to English');
  el.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
}
