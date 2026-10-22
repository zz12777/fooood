-- 記錄每一次呼叫 Google Places 的次數，管理頁用它顯示今天與本月還剩多少。
-- 只有白名單內的管理者可以讀寫；一般訪客完全看不到。
create table if not exists public.api_usage (
  id bigserial primary key,
  used_at timestamptz not null default now(),
  fn text not null,
  n integer not null default 1
);

alter table public.api_usage enable row level security;

drop policy if exists "editors read api_usage" on public.api_usage;
create policy "editors read api_usage" on public.api_usage
  for select to authenticated using (public.is_editor());

drop policy if exists "editors insert api_usage" on public.api_usage;
create policy "editors insert api_usage" on public.api_usage
  for insert to authenticated with check (public.is_editor());

grant select, insert on public.api_usage to authenticated;
grant usage, select on sequence public.api_usage_id_seq to authenticated;

-- 回傳「今天」與「本月」已用次數。Google 的額度是用太平洋時間算日與月，所以這裡也用太平洋時間。
create or replace function public.api_usage_summary()
returns json
language sql
stable
as $$
  select json_build_object(
    'today', coalesce(sum(n) filter (
      where (used_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date
    ), 0),
    'month', coalesce(sum(n) filter (
      where date_trunc('month', used_at at time zone 'America/Los_Angeles') = date_trunc('month', now() at time zone 'America/Los_Angeles')
    ), 0)
  )
  from public.api_usage;
$$;

grant execute on function public.api_usage_summary() to authenticated;

-- 這個功能啟用之前已經用掉的次數，可以手動補一筆（把數字換成你在 Google Cloud 指標頁看到的本月總數）：
-- insert into public.api_usage (fn, n) values ('先前用量', 300);
