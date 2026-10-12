-- 新竹美食資料庫：階段 1 資料表與權限
-- 貼到 Supabase 左側「SQL Editor」，按 Run。執行前先把最下方的 Email 改成你的登入信箱。

-- 1. 地區與類別（可自行增減）
create table public.areas (
  id serial primary key,
  name text not null unique,
  county text not null check (county in ('新竹市', '新竹縣')),
  sort_order int not null default 0
);

create table public.categories (
  id serial primary key,
  name text not null unique,
  sort_order int not null default 0
);

-- 2. 餐廳主表
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  maps_url text not null,                 -- Google 地圖連結（統一入口）
  place_id text unique,                   -- Google Places 的店家代碼，用來避免重複
  area_id int references public.areas (id),
  price_level smallint check (price_level between 1 and 4),
  status text not null default 'want' check (status in ('want', 'visited')),
  rating smallint check (rating between 1 and 5),
  note text,
  opening_hours jsonb,                    -- 營業時間，供「只抽營業中」使用
  hours_updated_at timestamptz,
  needs_review boolean not null default true,  -- 尚未確認類別、價位的店
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. 餐廳與類別（多對多，一間店可多個類別）
create table public.restaurant_categories (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id int not null references public.categories (id) on delete cascade,
  primary key (restaurant_id, category_id)
);

-- 4. 社群參考連結（一間店可多筆）
create table public.source_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  platform text not null default 'other' check (platform in ('instagram', 'threads', 'google', 'other')),
  url text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, url)
);

create index on public.restaurants (area_id);
create index on public.restaurants (price_level);
create index on public.restaurant_categories (category_id);
create index on public.source_links (restaurant_id);

-- 5. 自動更新 updated_at
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger restaurants_set_updated_at
before update on public.restaurants
for each row execute function public.set_updated_at();

-- 6. 可編輯名單（白名單）
create table public.editors (
  email text primary key
);

-- 判斷目前登入者是否在白名單內
create function public.is_editor()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.editors
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 7. 權限：所有人可讀，只有白名單帳號可寫
alter table public.areas enable row level security;
alter table public.categories enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_categories enable row level security;
alter table public.source_links enable row level security;
alter table public.editors enable row level security;  -- 不建任何政策 = 外部完全讀不到

-- 因為關閉了「自動開放新資料表」，這裡手動授權
grant usage on schema public to anon, authenticated;
grant select on public.areas, public.categories, public.restaurants,
  public.restaurant_categories, public.source_links to anon, authenticated;
grant insert, update, delete on public.areas, public.categories, public.restaurants,
  public.restaurant_categories, public.source_links to authenticated;
grant execute on function public.is_editor() to authenticated;

create policy "everyone can read areas" on public.areas for select using (true);
create policy "everyone can read categories" on public.categories for select using (true);
create policy "everyone can read restaurants" on public.restaurants for select using (true);
create policy "everyone can read restaurant_categories" on public.restaurant_categories for select using (true);
create policy "everyone can read source_links" on public.source_links for select using (true);

create policy "editors manage areas" on public.areas
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage categories" on public.categories
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage restaurants" on public.restaurants
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage restaurant_categories" on public.restaurant_categories
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage source_links" on public.source_links
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- 8. 初始資料：地區
insert into public.areas (name, county, sort_order) values
  ('東區', '新竹市', 1),
  ('北區', '新竹市', 2),
  ('香山區', '新竹市', 3),
  ('竹北市', '新竹縣', 4),
  ('竹東鎮', '新竹縣', 5),
  ('新豐鄉', '新竹縣', 6),
  ('湖口鄉', '新竹縣', 7),
  ('關西鎮', '新竹縣', 8),
  ('寶山鄉', '新竹縣', 9),
  ('新埔鎮', '新竹縣', 10),
  ('芎林鄉', '新竹縣', 11),
  ('橫山鄉', '新竹縣', 12),
  ('北埔鄉', '新竹縣', 13),
  ('峨眉鄉', '新竹縣', 14),
  ('尖石鄉', '新竹縣', 15),
  ('五峰鄉', '新竹縣', 16);

-- 9. 初始資料：類別
insert into public.categories (name, sort_order) values
  ('飯', 1), ('麵', 2), ('日式', 3), ('泰式', 4), ('義式', 5),
  ('披薩', 6), ('火鍋', 7), ('早午餐', 8), ('咖啡廳', 9), ('燒烤', 10),
  ('拉麵', 11), ('韓式', 12), ('宵夜', 13), ('牛肉麵', 14), ('冰品甜點', 15);

-- 10. 設定你的帳號為可編輯者（把下面的 Email 改成你要用來登入的信箱）
insert into public.editors (email) values ('請改成你的登入Email');
