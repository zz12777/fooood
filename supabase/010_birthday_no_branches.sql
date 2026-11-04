-- 壽星優惠改成只列品牌與優惠，不再收分店：清掉之前找到的分店（包含找錯的牛角撥筋店）。
-- 資料表先留著，之後若要恢復「附近」功能還用得到。
delete from public.birthday_branches;
