-- 壽星優惠加上「沒有分店的縣市」，生日行程測驗選到這些縣市時不會推薦。
alter table public.birthday_brands add column if not exists no_counties text[] not null default '{}';

-- 龍角新竹光復店已永久歇業
update public.birthday_brands set no_counties = array['新竹市'] where brand = '龍角';
