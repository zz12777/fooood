-- 壽星優惠加上「使用時間」，先依優惠文字自動判斷，之後可以在管理頁修改。
-- day：只限生日當天、day_month：當天和當月各有優惠、window：生日前後幾天或當週、month：整個生日月、unknown：沒寫清楚
alter table public.birthday_brands add column if not exists when_type text;

update public.birthday_brands b
set when_type = case
  when s ~ '當日' and s ~ '當月|生日月' then 'day_month'
  when s ~ '當日' then 'day'
  when s ~ '生日前後|前後[一二三四五六七八九十0-9]+[天日]|當週' then 'window'
  when s ~ '當月|生日月' then 'month'
  else 'unknown'
end
from (select id, offer || ' ' || coalesce(note, '') as s from public.birthday_brands) x
where x.id = b.id and b.when_type is null;
