// 每週備份：用公開的唯讀金鑰讀出所有資料表，存成 JSON。
// 也等於對 Supabase 發出請求，讓免費專案不會因為閒置而被暫停。
// 如果讀不到資料（例如專案已被暫停），腳本會失敗，GitHub 會寄信通知。

import { mkdir, writeFile } from 'node:fs/promises';

const cfg = await import('../js/config.js');
const URL_BASE = (process.env.SUPABASE_URL || cfg.SUPABASE_URL).replace(/\/$/, '');
const KEY = process.env.SUPABASE_KEY || cfg.SUPABASE_KEY;
const OUT = process.argv[2] || 'backup';
const TABLES = ['areas', 'categories', 'restaurants', 'restaurant_categories', 'source_links'];
const PAGE = 1000;

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`${table} 讀取失敗：${res.status} ${(await res.text()).slice(0, 200)}`);
    const part = await res.json();
    rows.push(...part);
    if (part.length < PAGE) return rows;
  }
}

await mkdir(OUT, { recursive: true });
const counts = {};
for (const t of TABLES) {
  const rows = await fetchAll(t);
  counts[t] = rows.length;
  await writeFile(`${OUT}/${t}.json`, JSON.stringify(rows, null, 2));
}
if (!counts.restaurants) throw new Error('restaurants 是空的，可能出問題了，先不當作成功。');
await writeFile(`${OUT}/_info.json`, JSON.stringify({ at: new Date().toISOString(), counts }, null, 2));
console.log('備份完成', counts);
