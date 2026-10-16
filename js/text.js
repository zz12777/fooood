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

// 地址去掉開頭的郵遞區號與「台灣」，並把簡體的縣、鄉、鎮、區換成繁體
export function cleanAddress(addr) {
  const map = { 县: '縣', 乡: '鄉', 镇: '鎮', 东: '東', 关: '關', 丰: '豐', 宝: '寶', 横: '橫', 区: '區', 兴: '興', 号: '號', 楼: '樓', 层: '層', 园: '園', 广: '廣', 东: '東' };
  return String(addr || '')
    .replace(/^\s*\d{3,6}\s*/, '')
    .replace(/^(台灣|臺灣)\s*/, '')
    .replace(/[县乡镇东关丰宝横区兴号楼层园广]/g, (c) => map[c]);
}

// 從地址判斷是哪個縣市（只用在新竹以外的店）。臺統一寫成台，簡體的縣先轉成繁體。
const COUNTIES = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣',
];
export function countyFromAddress(addr) {
  const a = String(addr || '').replace(/臺/g, '台').replace(/县/g, '縣');
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
