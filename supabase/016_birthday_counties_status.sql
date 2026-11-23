-- 記錄每個品牌查分店縣市的結果：found 找到、big 大型連鎖、none Google 找不到、manual 手動填寫
alter table public.birthday_brands add column if not exists counties_status text;

update public.birthday_brands set counties_status = 'found' where cardinality(counties) > 0 and counties_status is null;
-- 之前查過但結果是空白的，分不出是大型連鎖還是找不到，重新查一次（每個 1 次額度）
update public.birthday_brands set counties_checked_at = null where cardinality(counties) = 0 and counties_status is null;
