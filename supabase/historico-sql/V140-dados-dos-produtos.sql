-- Fazenda Digital V140 - dados técnicos dos produtos em estoque
-- Só preenche o que está em branco: fabricante vazio e chaves de "atributos" que ainda não existem.
-- (o que já estava preenchido no cadastro prevalece). JÁ FOI RODADO direto no Supabase.
with d(nome, fab, attrs) as (values
  ('ACIDO BORICO 25 KG', null, '{"b": "17"}'::jsonb),
  ('CALCINIT 25 KG', 'Yara', '{"n": "15,5", "ca": "19"}'::jsonb),
  ('CLORETO DE POTASSIO BRANCO 50KG', null, '{"k": "60"}'::jsonb),
  ('FERTIPAR 00-21-00 HIPERFOS 50KG', 'Fertipar', '{"p": "21"}'::jsonb),
  ('GRANULADO 16-16-16 / 50 KG', null, '{"n": "16", "p": "16", "k": "16"}'::jsonb),
  ('KRISTA MOP 25 KG', 'Yara', '{"k": "60"}'::jsonb),
  ('MAP GRANULADO 50KG', null, '{"n": "11", "p": "52"}'::jsonb),
  ('MAP PURIFICADO 25 KG', null, '{"n": "12", "p": "61"}'::jsonb),
  ('SULFATO DE COBRE 25 KG', null, '{"s": "12", "outros": "Cu 25%"}'::jsonb),
  ('SULFATO DE MAGNÉSIO 25 KG', null, '{"s": "12", "outros": "Mg 9%"}'::jsonb),
  ('SUPER SIMPLES 50 KG', null, '{"p": "18", "ca": "16", "s": "8"}'::jsonb),
  ('TOP-PHOS 280 HP EN 50KG', 'Timac Agro', '{"p": "28", "ca": "17", "s": "5"}'::jsonb),
  ('URÉIA 50 KG', null, '{"n": "45"}'::jsonb),
  ('YARA GRANULADO 16-16-16 / 50 KG', 'Yara', '{"n": "16", "p": "16", "k": "16"}'::jsonb),
  ('ABAMEX MAX 5L', 'Cropchem', '{"principio": "Abamectina", "concentracao": "72 g/L (EC)", "classe": "Inseticida, Acaricida, Nematicida", "registro_mapa": "05221"}'::jsonb),
  ('AD+ ADJUVANTE 20L', null, '{"classe": "Adjuvante"}'::jsonb),
  ('ALTACOR 450GR', 'FMC', '{"principio": "Clorantraniliprole", "concentracao": "350 g/kg (WG)", "classe": "Inseticida", "registro_mapa": "08909"}'::jsonb),
  ('CITROMAX 1KG', 'Citromax', '{"principio": "Sulfluramida", "concentracao": "3 g/kg (isca granulada)", "classe": "Inseticida, Formicida", "registro_mapa": "02896"}'::jsonb),
  ('EVENTRA FIPRONIL 1KG', 'ALTA', '{"principio": "Fipronil", "concentracao": "800 g/kg (WG)", "classe": "Inseticida, Cupinicida", "registro_mapa": "13112"}'::jsonb),
  ('FALCON 1L', 'Ihara', '{"principio": "Piroxassulfona + Flumioxazina", "concentracao": "200 + 200 g/L (SC)", "classe": "Herbicida", "registro_mapa": "15620"}'::jsonb),
  ('GAMONIUM 20L', 'Sinon', '{"principio": "Glufosinato - sal de amônio", "concentracao": "200 g/L (SL)", "classe": "Herbicida", "registro_mapa": "38519"}'::jsonb),
  ('KAZUMIN 1L', 'UPL', '{"principio": "Casugamicina", "concentracao": "20 g/L (SL)", "classe": "Fungicida, Bactericida", "registro_mapa": "01648702"}'::jsonb),
  ('MIRAVIS 20L', 'Syngenta', '{"principio": "Pidiflumetofem", "concentracao": "200 g/L (SC)", "classe": "Fungicida", "registro_mapa": "15622"}'::jsonb),
  ('MIRAVIS 5L', 'Syngenta', '{"principio": "Pidiflumetofem", "concentracao": "200 g/L (SC)", "classe": "Fungicida", "registro_mapa": "15622"}'::jsonb),
  ('MIREX XD 500G', 'Atta-Kill', '{"principio": "Sulfluramida", "classe": "Formicida"}'::jsonb),
  ('MONCEREN 1L', 'Gowan', '{"principio": "Pencicurom", "concentracao": "250 g/L (SC)", "classe": "Fungicida", "registro_mapa": "00404"}'::jsonb),
  ('MONCEREN 20L', 'Gowan', '{"principio": "Pencicurom", "concentracao": "250 g/L (SC)", "classe": "Fungicida", "registro_mapa": "00404"}'::jsonb),
  ('NATIVO PLUS 10L', 'Bayer', '{"principio": "Oxicloreto de cobre + Tebuconazol + Trifloxistrobina", "concentracao": "420 + 90 + 75 g/L (SC)", "classe": "Fungicida, Bactericida", "registro_mapa": "03024"}'::jsonb),
  ('NITROFORMIGA 1KG', null, '{"classe": "Formicida"}'::jsonb),
  ('NOMOLT 5L', 'BASF', '{"principio": "Teflubenzurom", "concentracao": "150 g/L (SC)", "classe": "Inseticida", "registro_mapa": "01393"}'::jsonb),
  ('OBERON 5L', 'Bayer', '{"principio": "Espiromesifeno", "concentracao": "240 g/L (SC)", "classe": "Inseticida, Acaricida", "registro_mapa": "01706"}'::jsonb),
  ('ORKESTRA 5L', 'BASF', '{"principio": "Fluxapiroxade + Piraclostrobina", "concentracao": "167 + 333 g/L (SC)", "classe": "Fungicida", "registro_mapa": "08813"}'::jsonb),
  ('ROUNDUP ORIGINAL MAIS 20L', 'Bayer', '{"principio": "Glifosato - sal de di-amônio", "concentracao": "480 g/L e.a. (577 g/L de sal) (SL)", "classe": "Herbicida", "registro_mapa": "01119"}'::jsonb),
  ('ROUNDUP ULTRA EM PÓ 5KG', 'Bayer', '{"principio": "Glifosato - sal de amônio", "concentracao": "650 g/kg e.a. (715 g/kg de sal) (WG)", "classe": "Herbicida", "registro_mapa": "09106"}'::jsonb),
  ('SALMIX RODEN 200 GR', null, '{"classe": "Raticida"}'::jsonb),
  ('SELECT ONE PACK 5L', 'UPL', '{"principio": "Cletodim", "concentracao": "120 g/L (EC)", "classe": "Herbicida", "registro_mapa": "02102"}'::jsonb),
  ('SIVANTO PRIME 5L', 'Bayer', '{"principio": "Flupiradifurona", "concentracao": "200 g/L (SL)", "classe": "Inseticida", "registro_mapa": "21817"}'::jsonb),
  ('VERDICT MAX 5L', 'Corteva', '{"principio": "Haloxifope-P-metílico", "concentracao": "540 g/L (EC)", "classe": "Herbicida", "registro_mapa": "03518"}'::jsonb),
  ('VERTMEC 84 5L', 'Syngenta', '{"principio": "Abamectina", "concentracao": "84 g/L (SC)", "classe": "Inseticida, Acaricida, Nematicida", "registro_mapa": "25519"}'::jsonb),
  ('GRAMPO 1 KG', null, '{"aplicacao": "Cercas"}'::jsonb),
  ('ROLO ARAME FARPADO 500 MTS', null, '{"aplicacao": "Cercas"}'::jsonb),
  ('ROLO ARAME LISO 1000 MTS', null, '{"aplicacao": "Cercas"}'::jsonb),
  ('ROLO ARAME LISO 500 MTS', null, '{"aplicacao": "Cercas"}'::jsonb),
  ('GUABI PEIXE 25 KG', 'Guabi', '{}'::jsonb)
)
update public.insumos i
   set fabricante = coalesce(nullif(trim(i.fabricante), ''), d.fab),
       atributos  = d.attrs || coalesce(i.atributos, '{}'::jsonb)
  from d
 where i.nome = d.nome
returning i.nome, i.fabricante, i.atributos;
