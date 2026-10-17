-- 抽查營業時間時，記錄每間店被發現改過幾次，常改的店之後會優先被抽到
alter table public.restaurants
  add column if not exists hours_change_count integer not null default 0;
