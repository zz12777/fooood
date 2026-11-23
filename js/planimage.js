// 把生日行程畫成一張圖片（PNG），不需要外部套件
const C = {
  paper: '#FBF7EA',
  card: '#FFFDF6',
  ink: '#3B3A33',
  soft: '#6F7064',
  line: '#E4DCC3',
  blue: '#A8D3E6',
  blueSoft: '#E3F1F7',
  green: '#B9DAA5',
  yellow: '#F6D27A',
  yellowSoft: '#FDF0CC',
};
const FONT = '"Huninn", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

// 中文逐字換行，英文盡量在空白處換行
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  const tokens = String(text).match(/[A-Za-z0-9$.,%'()&+/:-]+\s*|\s+|./gu) || [];
  for (const tk of tokens) {
    const test = line + tk;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trimEnd());
      line = tk.trimStart();
    } else line = test;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

// data: { title, sub, stops: [{ time, brand, offer, note }], footer }
export async function planToBlob(data) {
  try {
    await document.fonts.load(`32px ${FONT}`);
    await document.fonts.ready;
  } catch {
    /* 字型載不到就用系統字 */
  }
  const W = 1080;
  const PAD = 64;
  const inner = W - PAD * 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 先量高度：每站的內容高度
  const layout = data.stops.map((s) => {
    ctx.font = `30px ${FONT}`;
    const offer = wrap(ctx, s.offer, inner - 80);
    ctx.font = `24px ${FONT}`;
    const note = s.note ? wrap(ctx, s.note, inner - 80) : [];
    // 與下方繪製的位移一致：上邊距、時段、店名、優惠框、間距、備註、下邊距
    const h = 28 + 56 + 54 + (offer.length * 44 + 24) + 12 + note.length * 34 + 28;
    return { ...s, offer, note, h };
  });
  ctx.font = `52px ${FONT}`;
  const titleLines = wrap(ctx, data.title, inner);
  const headH = 150 + titleLines.length * 66 + 60;
  const H = headH + layout.reduce((n, s) => n + s.h + 24, 0) + 120;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // 標題區
  ctx.fillStyle = C.soft;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(data.kicker, PAD, 70);
  let y = 120;
  ctx.font = `52px ${FONT}`;
  for (const l of titleLines) {
    // 螢光筆底線
    const w = ctx.measureText(l).width;
    ctx.fillStyle = C.green;
    ctx.fillRect(PAD - 6, y + 36, w + 12, 22);
    ctx.fillStyle = C.ink;
    ctx.fillText(l, PAD, y);
    y += 66;
  }
  ctx.fillStyle = C.soft;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(data.sub, PAD, y + 14);
  y = headH;

  for (const s of layout) {
    roundRect(ctx, PAD, y, inner, s.h, 28, C.card, C.line);
    let yy = y + 28;
    // 時段小標籤
    ctx.font = `24px ${FONT}`;
    const tw = ctx.measureText(s.time).width;
    roundRect(ctx, PAD + 32, yy, tw + 32, 40, 20, C.blue);
    ctx.fillStyle = C.ink;
    ctx.fillText(s.time, PAD + 48, yy + 7);
    yy += 56;
    ctx.font = `36px ${FONT}`;
    ctx.fillText(s.brand, PAD + 32, yy);
    yy += 54;
    const oh = s.offer.length * 44 + 24;
    roundRect(ctx, PAD + 32, yy, inner - 64, oh, 16, C.blueSoft);
    ctx.fillStyle = C.ink;
    ctx.font = `30px ${FONT}`;
    s.offer.forEach((l, i) => ctx.fillText(l, PAD + 52, yy + 12 + i * 44));
    yy += oh + 12;
    if (s.note.length) {
      ctx.fillStyle = C.soft;
      ctx.font = `24px ${FONT}`;
      s.note.forEach((l, i) => ctx.fillText(l, PAD + 36, yy + i * 34));
    }
    y += s.h + 24;
  }

  ctx.fillStyle = C.soft;
  ctx.font = `24px ${FONT}`;
  ctx.fillText(data.footer, PAD, H - 80);

  return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
}

export async function downloadPlan(data, filename) {
  const blob = await planToBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
