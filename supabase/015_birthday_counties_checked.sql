-- 記錄每個壽星優惠品牌是否已經用 Google 查過分店縣市，避免重複查詢浪費額度
alter table public.birthday_brands add column if not exists counties_checked_at timestamptz;

-- 已經手動填好縣市的品牌，視為查過
update public.birthday_brands set counties_checked_at = now() where cardinality(counties) > 0 and counties_checked_at is null;
