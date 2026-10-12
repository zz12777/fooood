# 新竹吃什麼

把 Google 地圖、IG、Threads 收藏的新竹市與新竹縣餐廳，集中成一個手機好用的網頁。
可依地區、價位、類別篩選，也能隨機抽 1 到 3 間，並可選擇只抽營業中、排除吃過的。

## 結構

- `index.html`、`css/style.css`、`js/`：純靜態網頁，部署在 GitHub Pages，不需要建置步驟
- `js/config.js`：Supabase 專案網址與 publishable key（可公開）
- `supabase/schema.sql`：資料表與權限設定，貼到 Supabase 的 SQL Editor 執行
- `js/sample-data.js`：虛構的示範資料，網址加上 `?demo=1` 就能預覽版面

## 安全提醒

只有 publishable key 可以出現在這個儲存庫。secret key（service_role）與資料庫密碼不要放進任何檔案。
資料的寫入權限由資料庫的 Row Level Security 控制，只有 `editors` 表內的帳號能新增、修改、刪除。

## 設計

日系繪本風，字型 Google Fonts「Huninn」，配色黃 `#F6D27A`、藍 `#A8D3E6`、綠 `#B9DAA5`。
黃色代表主要動作與價位，藍色代表地區，綠色代表類別。不使用 emoji，圖示與插圖都是自己繪製的 SVG 線條。
