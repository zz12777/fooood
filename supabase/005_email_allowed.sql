-- 登入前先確認信箱在白名單內，不在名單的信箱就不寄登入信。
-- 這個函式只回答「是或不是」，不會把名單內容交出去。
create or replace function public.email_allowed(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.editors where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_allowed(text) from public;
grant execute on function public.email_allowed(text) to anon, authenticated;
