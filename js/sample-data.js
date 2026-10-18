// 示範資料：全部是虛構的店家，只在網址加上 ?demo=1 時使用，用來預覽版面。
// 資料庫有真實資料之後，這個檔案不會被用到。

const daily = (openH, closeH, closeNextDay = false) =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    open: { day: d, hour: openH, minute: 0 },
    close: { day: closeNextDay ? (d + 1) % 7 : d, hour: closeH, minute: 0 },
  }));

const hours = (periods) => ({ periods });
const MAP = 'https://www.google.com/maps';

export const SAMPLE = {
  areas: [
    { name: '東區', county: '新竹市' },
    { name: '北區', county: '新竹市' },
    { name: '香山區', county: '新竹市' },
    { name: '竹北市', county: '新竹縣' },
    { name: '竹東鎮', county: '新竹縣' },
    { name: '關西鎮', county: '新竹縣' },
  ],
  cats: ['飯', '麵', '日式', '泰式', '義式', '披薩', '火鍋', '早午餐', '咖啡廳', '燒烤', '拉麵', '韓式', '宵夜', '牛肉麵', '冰品甜點'].map((name) => ({ name })),
  restaurants: [
    { id: 's1', lat: 24.8039, lng: 120.9686, name: '示範拉麵屋', area: '東區', county: '新竹市', price: 2, status: 'want', cats: ['日式', '拉麵'], address: '300新竹市東區示範路 1 號', note: '示範備註：湯頭清爽，想試試辣味。', hours: hours(daily(11, 21)), mapsUrl: MAP, links: [{ platform: 'instagram', url: 'https://www.instagram.com/' }] },
    { id: 's2', name: '示範牛肉麵館', area: '北區', county: '新竹市', price: 2, status: 'visited', cats: ['麵', '牛肉麵'], note: '示範備註：半筋半肉。', hours: hours(daily(11, 20)), mapsUrl: MAP, links: [] },
    { id: 's3', lat: 24.83, lng: 121.012, name: '示範義式小廚', area: '竹北市', county: '新竹縣', price: 3, status: 'want', cats: ['義式', '披薩'], address: '302新竹縣竹北市示範街 8 號', note: '示範備註：適合朋友聚餐。貼文 https://www.threads.net/@demo/post/1', hours: hours(daily(11, 22)), mapsUrl: MAP, links: [{ platform: 'threads', url: 'https://www.threads.net/' }] },
    { id: 's4', name: '示範韓味食堂', area: '東區', county: '新竹市', price: 2, status: 'want', cats: ['韓式', '飯'], note: '示範備註：石鍋拌飯。', hours: hours(daily(11, 21)), mapsUrl: MAP, links: [] },
    { id: 's5', lat: 24.835, lng: 121.006, name: '示範泰式小館', area: '竹北市', county: '新竹縣', price: 2, status: 'want', cats: ['泰式', '飯'], note: '', hours: null, mapsUrl: MAP, links: [{ platform: 'instagram', url: 'https://www.instagram.com/' }] },
    { id: 's6', name: '示範鍋物工坊', area: '北區', county: '新竹市', price: 3, status: 'want', cats: ['火鍋'], note: '示範備註：湯底可選兩種。', hours: hours(daily(17, 23)), mapsUrl: MAP, links: [] },
    { id: 's7', name: '示範早午餐桌', area: '東區', county: '新竹市', price: 2, status: 'visited', cats: ['早午餐', '咖啡廳'], note: '示範備註：週末要排隊。', hours: hours(daily(8, 15)), mapsUrl: MAP, links: [] },
    { id: 's8', name: '示範燒烤夜市場', area: '香山區', county: '新竹市', price: 3, status: 'want', cats: ['燒烤', '宵夜'], note: '示範備註：晚上才開。', hours: hours(daily(18, 2, true)), mapsUrl: MAP, links: [] },
    { id: 's9', lat: 24.79, lng: 121.15, name: '示範冰品鋪', area: '關西鎮', county: '新竹縣', price: 1, status: 'want', cats: ['冰品甜點'], note: '示範備註：夏天再去。', hours: hours(daily(12, 20)), mapsUrl: MAP, links: [{ platform: 'threads', url: 'https://www.threads.net/' }] },
    { id: 's10', name: '示範日式定食', area: '竹東鎮', county: '新竹縣', price: 2, status: 'want', cats: ['日式', '飯'], note: '', hours: hours(daily(11, 20)), mapsUrl: MAP, links: [] },
    { id: 's11', name: '示範咖啡小站', area: '北區', county: '新竹市', price: 1, status: 'want', cats: ['咖啡廳', '冰品甜點'], note: '示範備註：有插座。', hours: hours(daily(9, 18)), mapsUrl: MAP, links: [] },
    { id: 's12', name: '示範高級鐵板燒', area: '竹北市', county: '新竹縣', price: 4, status: 'want', cats: ['日式'], note: '示範備註：留給紀念日。', hours: hours(daily(17, 22)), mapsUrl: MAP, links: [] },
    { id: 's13', name: '示範小吃攤', area: '東區', county: '新竹市', price: 1, status: 'want', cats: ['麵', '宵夜'], note: '', hours: hours(daily(17, 1, true)), mapsUrl: MAP, links: [] },
    { id: 's14', name: '尚未分類的示範店', area: '香山區', county: '新竹市', price: null, status: 'want', cats: [], note: '示範備註：還沒補上類別與價位。', hours: null, needsReview: true, mapsUrl: MAP, links: [] },
    { id: 's15', name: '示範台南小吃', area: '其他地區', county: '其他', address: '台南市中西區示範路 3 號', price: 1, status: 'want', cats: ['小吃'], note: '', hours: null, mapsUrl: MAP, links: [] },
    { id: 's16', name: '示範台中甜點', area: '其他地區', county: '其他', address: '403台灣台中市西區示範街 5 號', price: 2, status: 'want', cats: ['冰品甜點'], note: '', hours: null, mapsUrl: MAP, links: [] },
  ],
};
