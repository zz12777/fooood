-- 類別改名：炸雞 改成 炸雞/炸物，燒烤 改成 燒烤/串燒。已經分好類的店會跟著改，不用重新分類。
update public.categories set name = '炸雞/炸物' where name = '炸雞';
update public.categories set name = '燒烤/串燒' where name = '燒烤';
