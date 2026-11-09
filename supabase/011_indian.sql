-- 新增類別「印度」，網站會把它放在「什麼式」那一群
insert into public.categories (name, sort_order)
select '印度', coalesce(max(sort_order), 0) + 1 from public.categories
where not exists (select 1 from public.categories where name = '印度');
