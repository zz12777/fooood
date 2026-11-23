// 壽星優惠的使用時間：依優惠文字自動判斷，管理頁可以手動改。
// day：只限生日當天｜day_month：當天和當月各有優惠｜window：生日前後幾天或當週｜month：整個生日月｜unknown：沒寫清楚
export const WHEN_TYPES = ['day', 'day_month', 'window', 'month', 'unknown'];
export const WHEN_LABEL = {
  day: '限生日當天',
  day_month: '當天另有優惠',
  window: '生日前後幾天',
  month: '生日當月',
  unknown: '未註明時間',
};

export function guessWhen(offer, note) {
  const s = `${offer || ''} ${note || ''}`;
  const day = /當日/.test(s);
  const month = /當月|生日月/.test(s);
  const win = /生日前後|前後[一二三四五六七八九十0-9]+[天日]|當週/.test(s);
  if (day && month) return 'day_month';
  if (day) return 'day';
  if (win) return 'window';
  if (month) return 'month';
  return 'unknown';
}

export const whenOf = (b) => (WHEN_TYPES.includes(b.when_type) ? b.when_type : guessWhen(b.offer, b.note));
