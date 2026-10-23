-- Fazenda Digital V141 - categoria Fertilizante (químico); Adubo passa a ser o orgânico.
-- JÁ FOI RODADO direto no Supabase (fica só como registro).

-- 1) nova categoria
alter table public.insumos drop constraint if exists insumos_categoria_check;
alter table public.insumos add constraint insumos_categoria_check check (categoria = any (array[
  'fertilizante','adubo','defensivo','semente','vacina','medicamento','sal_mineral','racao','semen','peca','combustivel','outro']));

-- 2) compra de fertilizante vai para a mesma conta de estoque (Adubos e Fertilizantes)
insert into public.tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
select 'estoque_fertilizante', 'Compra de fertilizantes e corretivos', uso, conta_id, ordem, true, true
  from public.tipos_lancamento where chave = 'estoque_adubo'
on conflict (chave) do nothing;
update public.tipos_lancamento set nome = 'Compra de adubos orgânicos' where chave = 'estoque_adubo';

-- 3) os produtos que estavam em Adubo são todos químicos/corretivos: passam para Fertilizante
update public.insumos set categoria = 'fertilizante' where categoria = 'adubo';

-- 4) dados do fertilizante (só onde está em branco; o que já existe prevalece)
with d(nome, attrs) as (values
  ('ACIDO BORICO 25 KG',              '{"natureza":"Mineral simples","estado":"Sólido","modo":"Fertirrigação, Foliar"}'::jsonb),
  ('CAL VIRGEM 20 KG',                '{"natureza":"Corretivo de solo","estado":"Sólido"}'::jsonb),
  ('CALCÁRIO TON',                    '{"natureza":"Corretivo de solo","estado":"Sólido","modo":"Solo"}'::jsonb),
  ('CALCINIT 25 KG',                  '{"natureza":"Mineral simples","estado":"Sólido","modo":"Fertirrigação"}'::jsonb),
  ('CLORETO DE POTASSIO BRANCO 50KG', '{"natureza":"Mineral simples","estado":"Sólido","modo":"Fertirrigação"}'::jsonb),
  ('FERTIPAR 00-21-00 HIPERFOS 50KG', '{"natureza":"Mineral simples","estado":"Sólido","modo":"Solo"}'::jsonb),
  ('FOLHA TOP 20L',                   '{"estado":"Líquido","modo":"Foliar"}'::jsonb),
  ('GRANULADO 16-16-16 / 50 KG',      '{"estado":"Sólido","modo":"Solo"}'::jsonb),
  ('KRISTA MOP 25 KG',                '{"natureza":"Mineral simples","estado":"Sólido","modo":"Fertirrigação"}'::jsonb),
  ('MAP GRANULADO 50KG',              '{"natureza":"Mineral simples","estado":"Sólido","modo":"Solo"}'::jsonb),
  ('MAP PURIFICADO 25 KG',            '{"natureza":"Mineral simples","estado":"Sólido","modo":"Fertirrigação"}'::jsonb),
  ('MULTIHUMIC 20 LTS',               '{"natureza":"Bioestimulante / condicionador","estado":"Líquido"}'::jsonb),
  ('SULFATO DE COBRE 25 KG',          '{"natureza":"Mineral simples","estado":"Sólido","cu":"25"}'::jsonb),
  ('SULFATO DE MAGNÉSIO 25 KG',       '{"natureza":"Mineral simples","estado":"Sólido","mg":"9"}'::jsonb),
  ('SULFATO DE ZINCO 25 KG',          '{"natureza":"Mineral simples","estado":"Sólido"}'::jsonb),
  ('SUPER SIMPLES 50 KG',             '{"natureza":"Mineral simples","estado":"Sólido","modo":"Solo"}'::jsonb),
  ('TOP-PHOS 280 HP EN 50KG',         '{"estado":"Sólido","modo":"Solo"}'::jsonb),
  ('URÉIA 50 KG',                     '{"natureza":"Mineral simples","estado":"Sólido"}'::jsonb),
  ('YARA GRANULADO 16-16-16 / 50 KG', '{"natureza":"Mineral complexo","estado":"Sólido","modo":"Solo"}'::jsonb)
)
update public.insumos i
   set atributos = d.attrs || coalesce(i.atributos, '{}'::jsonb)
  from d where i.nome = d.nome;

-- Cu e Mg ganharam campo próprio: sai o texto provisório de "Outros"
update public.insumos set atributos = atributos - 'outros'
 where nome in ('SULFATO DE COBRE 25 KG', 'SULFATO DE MAGNÉSIO 25 KG') and atributos->>'outros' in ('Cu 25%', 'Mg 9%');
