-- 階段 1 補充：其他地區、新增類別（飲料、小吃、港式、西式）、Google 地點代碼欄位
-- 這段已包含在「匯入食物清單」的 SQL 裡；這個檔案只是留存結構變更的紀錄。
-- 重複執行不會出錯。

alter table public.areas drop constraint if exists areas_county_check;
alter table public.areas add constraint areas_county_check check (county in ('新竹市', '新竹縣', '其他'));

insert into public.areas (name, county, sort_order) values ('其他地區', '其他', 99) on conflict (name) do nothing;
insert into public.categories (name, sort_order) values ('飲料', 16), ('小吃', 17), ('港式', 18), ('西式', 19) on conflict (name) do nothing;

-- Google 地圖地點代碼（取自地圖連結），用來避免同一間店重複匯入
alter table public.restaurants add column if not exists google_cid text unique;
