-- 壽星優惠：一個品牌一筆優惠，底下掛新竹一帶的各分店。
-- 所有人都可以看；只有白名單內的管理者可以新增、修改、刪除。
create table if not exists public.birthday_brands (
  id bigserial primary key,
  brand text not null unique,
  keyword text,
  offer text not null,
  tags text[] not null default '{}',
  note text,
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.birthday_branches (
  id bigserial primary key,
  brand_id bigint not null references public.birthday_brands (id) on delete cascade,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  place_id text unique,
  maps_url text,
  created_at timestamptz not null default now()
);

alter table public.birthday_brands enable row level security;
alter table public.birthday_branches enable row level security;

drop policy if exists "anyone reads birthday_brands" on public.birthday_brands;
create policy "anyone reads birthday_brands" on public.birthday_brands for select using (true);
drop policy if exists "editors write birthday_brands" on public.birthday_brands;
create policy "editors write birthday_brands" on public.birthday_brands
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

drop policy if exists "anyone reads birthday_branches" on public.birthday_branches;
create policy "anyone reads birthday_branches" on public.birthday_branches for select using (true);
drop policy if exists "editors write birthday_branches" on public.birthday_branches;
create policy "editors write birthday_branches" on public.birthday_branches
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

grant select on public.birthday_brands, public.birthday_branches to anon, authenticated;
grant insert, update, delete on public.birthday_brands, public.birthday_branches to authenticated;
grant usage, select on sequence public.birthday_brands_id_seq, public.birthday_branches_id_seq to authenticated;
