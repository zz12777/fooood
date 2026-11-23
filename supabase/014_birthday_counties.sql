-- 壽星優惠加上「有分店的縣市」：有填的話，生日行程測驗只會推薦給選了這些縣市的人；空白代表不確定或全台都有。
alter table public.birthday_brands add column if not exists counties text[] not null default '{}';

update public.birthday_brands set counties = array['高雄市', '屏東縣'] where brand = '六盛茶苑';
update public.birthday_brands set counties = array['台中市'] where brand = '初爐了烘焙坊';
update public.birthday_brands set counties = array['屏東縣'] where brand = '騎士咬一口餐廳';
