// 把備註裡的網址變成可以點開的連結（只接受 http 與 https）
const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function linkify(text) {
  return String(text ?? '')
    .split(/(https?:\/\/[^\s<>"'）)」]+)/g)
    .map((part, i) => {
      if (i % 2 === 0) return escape(part);
      let href = null;
      try {
        const u = new URL(part);
        if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
      } catch {
        /* 不是有效網址就當一般文字 */
      }
      if (!href) return escape(part);
      let label;
      try {
        label = new URL(href).hostname.replace(/^www\./, '');
      } catch {
        label = href;
      }
      return `<a class="note-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
    })
    .join('');
}

// 簡體轉繁體（只收地址與地名常用字；「里」「后」「台」這類簡繁寫法會撞到地名的字不轉）
const SIMP = '义乡镇东关丰宝横区兴号楼层园广县湾阳门马鸟龙凤兰华岛汉会学场车铁桥际业环电书图纪术严临济级经国开长对时间这来红绿蓝营实创万与专个乐买亚优传价侨储党内军农冲净凉减动劳势医协单卫历压厂厅参双变员响团围圣坚坛垦块报声处备头夹奥妇宁审导将尔币师带库应庆废张弯总恶战拥择挂数无旧显晓杨极构样档栋树梦检欢汇沟渔湿满灯点烟爱现琼盐监码离积称穷简粮纸线组细终给绕统网罗习联肠脑艺荣药蒋许设访证评诊该说请谢贝财货购贸赖轩轻输过远连迟选递适邮释针钱钟钢银锅锦闲阅队阴随难雾韩页顺顾风饭饮饺馆骑鱼鲜鸡麦齐龄';
const TRAD = '義鄉鎮東關豐寶橫區興號樓層園廣縣灣陽門馬鳥龍鳳蘭華島漢會學場車鐵橋際業環電書圖紀術嚴臨濟級經國開長對時間這來紅綠藍營實創萬與專個樂買亞優傳價僑儲黨內軍農衝淨涼減動勞勢醫協單衛歷壓廠廳參雙變員響團圍聖堅壇墾塊報聲處備頭夾奧婦寧審導將爾幣師帶庫應慶廢張彎總惡戰擁擇掛數無舊顯曉楊極構樣檔棟樹夢檢歡匯溝漁濕滿燈點煙愛現瓊鹽監碼離積稱窮簡糧紙線組細終給繞統網羅習聯腸腦藝榮藥蔣許設訪證評診該說請謝貝財貨購貿賴軒輕輸過遠連遲選遞適郵釋針錢鐘鋼銀鍋錦閒閱隊陰隨難霧韓頁順顧風飯飲餃館騎魚鮮雞麥齊齡';
export function toTrad(s) {
  return String(s ?? '').replace(/[\u4e00-\u9fff]/g, (ch) => {
    const i = SIMP.indexOf(ch);
    return i >= 0 ? TRAD[i] : ch;
  });
}

// 地址去掉開頭的郵遞區號與「台灣」，並轉成繁體
export function cleanAddress(addr) {
  return toTrad(addr)
    .replace(/^\s*\d{3,6}\s*/, '')
    .replace(/^(台灣|臺灣)\s*/, '');
}

// 從地址判斷是哪個縣市（只用在新竹以外的店）。臺統一寫成台，簡體的縣先轉成繁體。
const COUNTIES = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣',
];
export function countyFromAddress(addr) {
  const a = toTrad(addr).replace(/臺/g, '台');
  let best = null;
  let bestAt = Infinity;
  for (const c of COUNTIES) {
    const i = a.indexOf(c);
    if (i >= 0 && i < bestAt) {
      best = c;
      bestAt = i;
    }
  }
  return best;
}

// 篩選與卡片上顯示的地區名：新竹市的區前面加上「新竹」，其他縣市去掉市與縣（嘉義市、嘉義縣合成「嘉義」）
export function areaLabel(name, county) {
  return county === '新竹市' && !String(name).startsWith('新竹') ? `新竹${name}` : name;
}
export function shortCounty(county) {
  return String(county || '').replace(/[市縣]$/, '');
}
