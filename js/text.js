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
const SIMP = '义乡镇东关丰宝横区兴号楼层园广县湾阳门马鸟龙凤兰华岛汉会学场车铁桥际业环电书图纪术严临济级经国开长对时间这来红绿蓝营实创万与专个乐买亚优传价侨储党内军农冲净凉减动劳势医协单卫历压厂厅参双变员响团围圣坚坛垦块报声处备头夹奥妇宁审导将尔币师带库应庆废张弯总恶战拥择挂数无旧显晓杨极构样档栋树梦检欢汇沟渔湿满灯点烟爱现琼盐监码离积称穷简粮纸线组细终给绕统网罗习联肠脑艺荣药蒋许设访证评诊该说请谢贝财货购贸赖轩轻输过远连迟选递适邮释针钱钟钢银锅锦闲阅队阴随难雾韩页顺顾风饭饮饺馆骑鱼鲜鸡麦齐龄芦莺丽汤礼乔刘陈黄吴赵邓郑冯苏卢萧庄胜莲鹏鹤鹰龟宫庙观寿禄贵顶岭峡滨泽纺织结继续缘职听闻阁铜镜饼鸭鹅猪浅涌滩炉烧热独玛画盖盘禅种稳竞笔节范筑类紧纯练绍绘络绝苍苹莱获萝虾补装见规视觉订计认让记讲识诚话详语读课谊质费资赛赢赶跃轨转轮软载较辉边达运还进遗邻酱钓铺闪问阶险隐静韦项须预领题颜飞馒驾驿鲁鸣鸿圆壮夺奖妈孙宽宾寻岁岗帅庐异弹归当录忆怀态悦惊户执扩扬护换据摆斋暂机杂权条杰标栏气沪洁测浓涂温炼烫爷狮猫献产亩窑签粤约纳纹胶脸腊舱茎荡莹蔷虫蜡衬誉锋链键阔遥';
const TRAD = '義鄉鎮東關豐寶橫區興號樓層園廣縣灣陽門馬鳥龍鳳蘭華島漢會學場車鐵橋際業環電書圖紀術嚴臨濟級經國開長對時間這來紅綠藍營實創萬與專個樂買亞優傳價僑儲黨內軍農衝淨涼減動勞勢醫協單衛歷壓廠廳參雙變員響團圍聖堅壇墾塊報聲處備頭夾奧婦寧審導將爾幣師帶庫應慶廢張彎總惡戰擁擇掛數無舊顯曉楊極構樣檔棟樹夢檢歡匯溝漁濕滿燈點煙愛現瓊鹽監碼離積稱窮簡糧紙線組細終給繞統網羅習聯腸腦藝榮藥蔣許設訪證評診該說請謝貝財貨購貿賴軒輕輸過遠連遲選遞適郵釋針錢鐘鋼銀鍋錦閒閱隊陰隨難霧韓頁順顧風飯飲餃館騎魚鮮雞麥齊齡蘆鶯麗湯禮喬劉陳黃吳趙鄧鄭馮蘇盧蕭莊勝蓮鵬鶴鷹龜宮廟觀壽祿貴頂嶺峽濱澤紡織結繼續緣職聽聞閣銅鏡餅鴨鵝豬淺湧灘爐燒熱獨瑪畫蓋盤禪種穩競筆節範築類緊純練紹繪絡絕蒼蘋萊獲蘿蝦補裝見規視覺訂計認讓記講識誠話詳語讀課誼質費資賽贏趕躍軌轉輪軟載較輝邊達運還進遺鄰醬釣鋪閃問階險隱靜韋項須預領題顏飛饅駕驛魯鳴鴻圓壯奪獎媽孫寬賓尋歲崗帥廬異彈歸當錄憶懷態悅驚戶執擴揚護換據擺齋暫機雜權條傑標欄氣滬潔測濃塗溫煉燙爺獅貓獻產畝窯簽粵約納紋膠臉臘艙莖蕩瑩薔蟲蠟襯譽鋒鏈鍵闊遙';
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


// Google 偶爾會回傳「由小到大」的英文順序地址，例如
// 「No. 20, 成功一街鹿場里竹北市新竹縣30244」，這裡改回「新竹縣竹北市鹿場里成功一街20號」。
// 不是這種格式的地址原樣回傳。
export function fixAddressOrder(addr) {
  const a = toTrad(String(addr || '')).trim();
  const m = a.match(/^No\.?\s*([^,，]+?)\s*[,，]\s*(.+?)\s*(\d{3,6})?$/i);
  if (!m) return a;
  const num = /號/.test(m[1]) ? m[1] : `${m[1]}號`;
  const rest = m[2];
  const cm = rest.match(/^(.*?)((?:新竹|台北|臺北|新北|基隆|桃園|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)[市縣])$/);
  if (!cm) return a;
  const dm = cm[1].match(/^(.*?)(東區|北區|香山區|竹北市|竹東鎮|新埔鎮|關西鎮|湖口鄉|新豐鄉|芎林鄉|橫山鄉|北埔鄉|寶山鄉|峨眉鄉|五峰鄉|尖石鄉)$/);
  if (!dm) return a;
  const body = dm[1];
  const vm = body.match(/^(.+?[路街道段巷弄])(.*[里村])$/);
  const street = vm ? `${vm[2]}${vm[1]}` : body;
  return `${cm[2]}${dm[2]}${street}${num}`;
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

// 類別分三群：名稱有「式」的是什麼式（日式、越式、台式小吃…），吃飯時段是時間，其餘是品項
export const CAT_GROUPS = ['什麼式', '時間', '品項'];
const TIME_CATS = ['早餐', '午餐', '晚餐', '早午餐', '下午茶', '宵夜'];
export function catGroup(name) {
  if (TIME_CATS.includes(name)) return '時間';
  if (String(name).includes('式')) return '什麼式';
  return '品項';
}
// 把類別清單依三群分好，空的群不回傳
export function groupCats(cats, nameOf = (c) => c.name) {
  return CAT_GROUPS.map((g) => [g, cats.filter((c) => catGroup(nameOf(c)) === g)]).filter(([, list]) => list.length);
}
