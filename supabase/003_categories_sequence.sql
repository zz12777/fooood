-- 讓登入的管理者可以新增類別：
-- categories 的 id 是自動編號，新增時要用到編號序列，原本沒有開放這個權限。
grant usage, select on sequence public.categories_id_seq to authenticated;
