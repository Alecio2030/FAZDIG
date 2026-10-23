-- =====================================================================
-- Fazenda Digital V130 - banco
-- Clima e chuva: o ponto do escritório, para escolher "No escritório"
-- como local da previsão (além de "Na fazenda ...").
-- Rode inteiro no Supabase › SQL Editor (Run). Pode rodar mais de uma vez.
-- =====================================================================
alter table produtor add column if not exists escritorio_lat numeric;
alter table produtor add column if not exists escritorio_lng numeric;
notify pgrst, 'reload schema';
