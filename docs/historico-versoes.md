# Fazenda Digital V153

Pacote completo: Etapas 1, 2 e 3 (login, cadastros de base, rebanho),
agora todos no padrão de abas Cadastrar | Consultar.

## Como instalar
1. Em C:\FAZENDA_DIGITAL\app, APAGUE a pasta src e o arquivo App.tsx.
2. Extraia este pacote em C:\FAZENDA_DIGITAL\app (substituir tudo).
3. BANCO DA V153 (RODAR): no Supabase, SQL Editor, cole TODO o arquivo "Fazenda Digital V153 - banco.sql" e clique em Run.
   No fim aparece "V153 ok | 2 | 8". RODE ANTES O DA V152 (se ainda não rodou). Não apaga nem altera dados. Pode rodar mais de uma vez.
   A função de leitura do extrato pela IA ("ler-extrato") JÁ FOI PUBLICADA no Supabase (23/10). O código dela fica em
   supabase/functions/ler-extrato só como registro.
   BANCO DA V152 (RODAR ANTES DO DA V153, se ainda não rodou): no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V152 - banco.sql" e clique em Run. No fim aparece "V152 ok | 4 | 8 | true".
   Não apaga nem altera dados (só cria tabelas, colunas e funções). Pode rodar mais de uma vez. Se der erro, nada é alterado: me mande a mensagem.
   A V151 e a V150 não mudaram o banco. O banco da V149 JÁ FOI RODADO.
   BANCO DA V149 (RODAR, se ainda não rodou): no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V149 - banco.sql" e clique em Run. No fim aparecem 7 funções criadas.
   Não apaga nem altera nenhum dado (só cria funções). Se der erro, nada é alterado: me mande a mensagem.
   Pode rodar mais de uma vez.
   O banco da V148 JÁ FOI RODADO (conferido em 22/10). O da V147 também.
   Os bancos da V144 e da V145 JÁ ESTÃO no Supabase (conferido em 21/10). A V146 não mudou o banco.
   BANCO DA V145 (já rodado, fica como registro): no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V145 - banco.sql" e clique em Run. No fim aparece a relação dos bens com o código patrimonial.
   Se ainda não rodou o da V144, rode o da V144 ANTES. Pode rodar mais de uma vez.
   BANCO DA V144 (rodar antes do da V145, se ainda não rodou): no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V144 - banco.sql" e clique em Run. No fim aparece a relação dos centros de custo.
   Se der erro, nada é alterado: me mande a mensagem. Pode rodar mais de uma vez.
   BANCO DA V143: já rodado (fica só como registro). Era: no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V143 - banco.sql" e clique em Run. No fim aparece a conferência dos centros
   (Receitas e Custos lado a lado). Se der erro, nada é alterado: me mande a mensagem.
   BANCO DA V142 (PLANO DE CONTAS): já rodado. Só para registro: no Supabase, abra o SQL Editor, cole TODO o arquivo
   "Fazenda Digital V142 - banco.sql" e clique em Run. No fim aparece a relação do plano novo
   (cerca de 218 contas). Se der qualquer erro, nada é alterado: me mande a mensagem.
   (Os campos novos do Talhão já foram gravados no Supabase; estão no arquivo só como registro.)
   O banco da V141 JÁ FOI ATUALIZADO direto no Supabase ("Fazenda Digital V141 - banco.sql" fica só como registro; não precisa rodar). A V140 não muda a estrutura do banco: os dados técnicos dos produtos JÁ FORAM GRAVADOS direto no Supabase ("Fazenda Digital V140 - dados dos produtos.sql" fica só como registro; não precisa rodar). A V139 e a V138 não mudam o banco. O banco da V137 JÁ FOI ATUALIZADO direto no Supabase ("Fazenda Digital V137 - banco.sql" fica só como registro). A V136 e a V135 não mudaram o banco. O banco da V134 JÁ FOI ATUALIZADO direto no Supabase (o arquivo "Fazenda Digital V134 - banco.sql" fica só como registro; não precisa rodar). Se ainda não rodou o da V131, rode-o antes
   ("Fazenda Digital V131 - banco.sql", que continua no pacote).
4. Para o site: npx expo export --platform web e, no Netlify (aba Deploys), arraste a nova pasta "dist".
   Depois, no PC, aperte Ctrl+F5 para não abrir a página antiga guardada.
5. No celular: feche o app de vez e abra de novo (no Expo Go, chacoalhe e toque em Reload).

FROTA: o arquivo "Fazenda Digital Frota - banco.sql" substitui os da V119, V120 e V121.

## Novidade desta versão (V153: Conciliação bancária)

Financeiro › Conciliação bancária (ícone novo).
- Escolha a conta do banco e o período. Traga o extrato por:
  🏦 Arquivo do banco (OFX: no internet banking, Extrato › Exportar › OFX/Money) – exato, sem custo e sem IA;
  📄 PDF, 📊 Excel/CSV ou 📷 Foto – lidos pela IA (função ler-extrato), com conferência antes de guardar
  (quantidade, período, entradas, saídas, saldo final e aviso se o saldo não fecha ou se a conta lida é outra).
- "Guardar e conciliar": o mesmo lançamento nunca entra duas vezes (pode importar o mesmo arquivo de novo) e o
  sistema casa sozinho cada linha do banco com o pagamento/recebimento do sistema na mesma conta, com o mesmo valor
  e até 5 dias de diferença.
- Resumo: conciliadas, o que está no banco e não no sistema, o que está no sistema e não no banco, saldo do
  sistema x saldo do banco e a diferença.
- NO BANCO E NÃO NO SISTEMA: toque na linha e escolha
  • Lançar despesa/receita: de quem é (Grupo/Administrativo, uma Fazenda ou o Particular, dizendo de qual sócio),
    o que é (tipo sugerido pelo histórico: tarifa, IOF, rendimento, energia, seguro, INSS/FGTS, impostos...),
    centro de custo, pessoa e descrição. Cria o título já pago/recebido nesta conta, na data e no valor do banco.
  • Baixar conta a pagar/receber em aberto (✓ = mesmo valor; diferença a mais entra como juros/multa).
  • Parear com um lançamento do sistema (data ou valor diferentes).
  • Ignorar (ex.: aplicação e resgate automáticos).
- NO SISTEMA E NÃO NO BANCO: lista com a opção de estornar o que não aconteceu (só o Master estorna).
- Conciliados (com "Desfazer") e os extratos guardados (com "Excluir" para o importado por engano).
- Pagamento estornado volta a linha do banco para as pendências sozinho.

## Versão V152 (imobilizado em formação, rateio no abastecimento e transferências)

### 1. Imobilizado EM FORMAÇÃO (Mais › Imobilizado)
- Novo: "Situação do bem": Pronto, já em uso | EM FORMAÇÃO (lavoura, curral, barragem, estrada, casa, galpão…).
- O bem em formação já nasce com o CÓDIGO (ex.: FI 069) e com um CENTRO DE CUSTO próprio, criado sozinho
  dentro do grupo novo "IMOBILIZADO EM FORMAÇÃO" da fazenda (ex.: 4.1.08-001 FI 069 Lavoura Café – Talhão Vanessa).
  No Administrativo fica em 4.9.08.
- Tudo o que for lançado nesse centro vira custo de formação: insumos, mão de obra e máquinas das Atividades,
  serviços e despesas das Compras e do Contas a pagar, combustível dos Abastecimentos, produtos transferidos de
  outra fazenda e a depreciação de outros bens rateada para ele. Campo opcional "Gastos anteriores ao sistema".
- Lavoura: ligue o bem ao talhão (ou ligue "Criar o talhão agora"). Enquanto estiver em formação, as Atividades
  desse talhão vão SOZINHAS para o centro da formação (não para o custo da safra).
- Ao abrir o bem: custo acumulado por origem e "Concluir a formação (início da operação)": data de início, valor a
  ativar (vem calculado, pode corrigir), vida útil, residual e quem recebe a exaustão/depreciação. Ao concluir:
  o bem passa a "em uso" com esse valor, a exaustão/depreciação começa, o centro da formação é encerrado e, na
  lavoura sem talhão, o TALHÃO é criado sozinho (pastagem: a manga). Daí em diante é custo de produção.
- "Reabrir a formação" desfaz a conclusão, se a data ou o valor foram lançados errados.
- Resultado da atividade: o que foi pago para um bem em formação vai para Investimentos (1.6.01.011 Imobilizado em
  Formação), e não para Custos e despesas.
- Categorias novas: Barragens, represas e açudes; Estradas, terraplanagem e drenagem.
- Consulta do Imobilizado: relação "Bens em formação"; a ficha mostra o custo acumulado e o centro.

### 2. Frota › Abastecimentos: centro de custo e rateio
- Seção "Centro de custo (opcional)": aparece com 100%. Trocou para 40%? Abre a linha do próximo centro já com
  60%; pôs 40% nela? Abre outra com 20%… até fechar 100%. Mostra quanto vai para cada centro.
- Em branco, vale o centro do cadastro do veículo (como antes). No posto, a despesa e o contas a pagar seguem o rateio.

### 3. Mais › Transferências (ícone novo)
- Produtos do estoque: entram no estoque da outra fazenda (pelo custo médio daqui) ou vão DIRETO num centro de
  custo de lá (aplicação, obra ou lavoura em formação). O código do produto é o mesmo em todas as fazendas.
- Bem do imobilizado: muda de fazenda com o mesmo código patrimonial (o da fazenda de aquisição). Também continua
  o botão "Transferir para outra fazenda" dentro do bem, que agora registra aqui.
- Gado: do lote daqui para um lote aberto da outra fazenda; os animais levam brinco, registro e nº interno
  (se o nº já existir lá, ganham o próximo livre). Aparece nas Movimentações das duas fazendas.
- "Desfazer a transferência nº" (estoque e gado). Consulta: todas, as que saíram e as que chegaram.
- Não gera conta a pagar nem a receber: tudo é do Grupo.

## Versão V151 (só plantas efetivamente plantadas em todo o Agrícola)

- O sistema não usa mais as plantas CALCULADAS pelo espaçamento em nenhuma conta nem lista:
  Consulta dos talhões, Atividades (dose por planta), Plano de adubação, Análise de solo (g por planta)
  e Irrigação (litros por planta). Vale sempre o total EFETIVAMENTE PLANTADO do cadastro do talhão.
- Talhão sem o total plantado: aparece "Falta o total de plantas plantadas" – complete em
  Agrícola › Talhões › Alterar (campo "Total de plantas efetivamente plantadas").
- As plantas calculadas pelo espaçamento continuam só como referência na folha e na consulta do talhão (V146).

## Versão V150 (plantas efetivamente plantadas nas Atividades)

- Agrícola › Atividades: a dose POR PLANTA (defensivo, adubo via solo, plantio) usa o TOTAL DE PLANTAS
  EFETIVAMENTE PLANTADAS do cadastro do talhão, e não mais as plantas calculadas pelo espaçamento.
  Atividade em só parte do talhão: as plantas são proporcionais à área informada (área ÷ área útil).
- Talhão sem o total de plantas plantadas no cadastro: aparece "Sem o total de plantas plantadas no cadastro"
  e a dose por planta não é aceita até completar o talhão (Agrícola › Talhões › Alterar).

## Versão V149 (alterar e excluir na implantação)

Para os testes da implantação e os lançamentos errados por falta de prática.

- CONSULTA › FICHA › "✏️ Alterar ou excluir": a ficha de cada lançamento ganhou o botão que abre o
  Cadastrar JÁ CARREGADO com aquele registro (a Consulta continua só mostrando; quem altera é o Cadastrar).
  Vale para: Compras e Despesas, Contas a pagar/receber (título avulso), Imobilizado, Talhões, Atividades,
  Colheitas, Secagem e Pilagem, Lotes e Dietas. Financiamento: o título leva direto à ficha do contrato.
  Gravou a alteração → volta para a ficha. Excluiu → volta direto para a Consulta.
- VENDA: a ficha da venda ganhou "Excluir esta venda (para lançar de novo)" (venda não se altera).
- JÁ TEM PAGAMENTO? Antes o sistema só mandava estornar primeiro. Agora pergunta "Estornar e excluir":
  estorna o pagamento/recebimento e exclui tudo de uma vez (o valor volta para o caixa/banco).
  Só o Produtor e o Administrador conseguem; os outros recebem a explicação, como antes.
  Vale para compra, despesa, título, financiamento, venda, entrada de animais comprados, colheita,
  fechamento e vale da colheita, secagem, pilagem, taxa do armazém de café e frete.
- ESTOQUE INICIAL (Insumos e Medicamentos › abrir o produto): quadro "Estoque inicial em <fazenda>" com as
  entradas que não vieram de compra (o saldo da implantação). Dá para lançar, corrigir (data, quantidade,
  valor por unidade) ou excluir. Não deixa o estoque ficar negativo se já houve saída.
- EXCLUIR PRODUTO: sai junto o estoque inicial dele. Se tiver compra, atividade, aplicação etc., diz onde.
- EXCLUIR TALHÃO (novo) e MANGA: o centro de custo e o ativo biológico que nasceram com ele saem junto.
  Se já tiver lançamentos, diz em quais (atividades, colheitas, safras, compras...).
- EXCLUIR FAZENDA ou PARTICULAR cadastrado errado (novo, só Produtor/Administrador): só sem movimento;
  talhões, mangas, centros de custo, contas bancárias e acessos dela saem junto. Se tiver movimento, diz qual.
- EXCLUIR ALIMENTO (dietas) e PROTOCOLO DE IATF (ficha da IATF), que não tinham.
- Mensagem clara quando um cadastro não pode ser excluído: diz ONDE ele está sendo usado
  (ex.: "está sendo usado em compras"), em vez de só "está sendo usado em outros registros".

## Versão V148 (retorno ao estoque dentro das Atividades – um canal só)

- A ATIVIDADE é o documento de saída do estoque: nº automático, talhão/manga (centro de custo), produtos,
  dose, calda, máquina e pessoas.
- Agrícola › Atividades ganhou a aba RETORNO (Lançar | Retorno | Consultar): informe o nº da atividade
  (ou toque numa das recentes); aparecem os produtos que saíram, quanto já voltou e quanto pode voltar.
  O que voltar entra no estoque com o MESMO valor unitário da saída e sai do custo da atividade e do
  talhão (consumo = saída − retorno). Não deixa voltar mais do que saiu. Retorno lançado pode ser desfeito.
- Na ficha da atividade: "Voltou ao estoque X · consumo líquido Y (por ha)" e o botão "Retorno ao estoque".
- Alterar a atividade mantém os retornos; a quantidade baixada não pode ficar menor que o que já voltou.
- Saiu a tela separada "Saídas e retornos do estoque" da V147 (nenhuma requisição tinha sido lançada).
- Continua da V147: dose "por bomba" nas Atividades (dose × bombas, calda total, L/ha e por 100 L).

## Versão V147 (requisição separada – substituída pela V148; dose por bomba)

- Agrícola (e Pecuário) › Saídas e retornos do estoque: abas Saída | Retorno | Consultar.
  - SAÍDA = requisição com nº automático por fazenda: data, destino (centro de custo: talhão, manga,
    lote ou outro centro da fazenda), quem retirou e os produtos, sempre na UNIDADE DE ESTOQUE.
    Cada produto sai ao custo médio do dia e vai ao custo do destino.
  - RETORNO: informe o nº da requisição; aparecem os produtos, quanto saiu, quanto já voltou e quanto
    pode voltar. O que voltar entra no estoque com o MESMO valor unitário da saída (lançamento inverso)
    e sai do custo do destino. Não deixa voltar mais do que saiu.
  - CONSULTAR: por nº, produto, destino ou quem retirou; mostra saída, retorno, consumo e o valor líquido.
    Dali dá para ir direto ao retorno ou excluir a requisição.
- Atividades › produtos: nova forma de dose "por bomba" (ex.: 200 mL por bomba de 20 L). Informe as
  bombas aplicadas e os litros por bomba (costal 20 L, tanque 400 L, 2.000 L...): o total = dose × bombas,
  com a calda total, L de calda por ha, o equivalente por ha e a concentração por 100 L.
- Atividades: com "Baixar do estoque" desligado, pode informar "Saiu pela requisição nº" (o produto já
  saiu pela requisição; a atividade registra a aplicação sem baixar nem custear de novo).
- Painel do talhão e custo por saca do café: entram as saídas por requisição para o talhão (menos os retornos).

## Versão V146 (consulta do Talhão igual à folha do cadastro)

- Agrícola › Talhões › Consultar: logo no início, Plantas efetivamente PLANTADAS (total do talhão e por ha)
  e Plantas CALCULADAS pelo espaçamento (total e por ha), com a diferença entre as duas.
- Os dados do talhão aparecem na mesma ordem e com os mesmos títulos da folha do cadastro:
  Identificação e localização, Cultura e genética, Manejo técnico, Ativo biológico e exaustão,
  Previsão da Produção. Depois vêm Financeiro, Atividades, satélite, pragas e análises.
- "Previsão de safra" passou a se chamar "Previsão da Produção" (cadastro e consulta).
- No cadastro, o quadro das plantas mostra também os dois totais: plantadas e calculadas.
- A lista da consulta mostra o total de plantas plantadas (ou, sem ele, o calculado).

## Versão V145 (total de plantas no Talhão e código patrimonial automático)

- Agrícola › Talhões: o campo agora é "Total de plantas efetivamente plantadas (no talhão)".
  As plantas por ha efetivas são calculadas: total ÷ área útil (sem área útil, ÷ área total),
  com a diferença para as plantas por ha do espaçamento. Saiu o cálculo de covas.
  O "Por planta" da previsão de safra usa o total de plantas informado.
  Talhão que tinha plantas por ha digitadas: a tela mostra o número antigo para você informar o total.
- Mais › Imobilizado: o código patrimonial nasce sozinho com a sigla da fazenda da entrada e o próximo
  número (TI 001, TI 002... na Fazenda 3 Irmãos; ADM 001 no Administrativo). Pode digitar outro código.
  Transferido para outra fazenda, o bem continua com o código que tinha. Código repetido é recusado.
  Os bens já cadastrados sem código recebem o automático ao rodar o banco da V145.

## Versão V144 (centros de custo = contas de grau 3 do grupo 4)

- Os CENTROS DE CUSTO são as contas de GRAU 3 do grupo 4 do Plano de contas, com o mesmo código e o
  mesmo nome: 4.1.01 AGRÍCOLA, 4.1.02 PECUÁRIA, 4.1.05 DESPESAS OPERACIONAIS, 4.1.07 DESPESAS
  FINANCEIRAS, e assim em cada fazenda (4.9 = Administrativo).
- O sistema cria todos sozinho: agora (ao rodar o banco da V144) e sempre que entrar uma conta de grau 3
  no grupo 4, ou ela mudar de nome ou de código. Se a conta for inativada, o centro também fica inativo.
- Divisões automáticas dentro do centro (código do centro + "-" + nº):
    cada talhão  → dentro do 4.N.01 AGRÍCOLA da fazenda   (ex.: 4.1.01-001 Talhão 1)
    cada manga e cada lote → dentro do 4.N.02 PECUÁRIA     (ex.: 4.2.02-001)
  É por elas que o custo chega ao talhão, à manga e ao lote (atividades, colheita, secagem, pilagem).
  Cadastrou um talhão, manga ou lote: a divisão nasce junto; mudou o nome, ela acompanha.
- Financeiro › Centros de custo › Cadastrar: digite o código (ex.: 4.1.01) e o nome vem do Plano de
  contas; ou escolha um centro e crie uma divisão a mais (ex.: Viveiro de mudas dentro do 4.1.01).
  O botão "Montar centros da fazenda" saiu (não precisa mais).
- Talhão: o centro de custo já vem sozinho (o do próprio talhão); não é mais obrigatório escolher.
- Nas telas de lançamento, a lista de centros mostra só os da unidade em uso.
- Os centros do Particular (sócios) continuam como estavam.

## Novidade da versão anterior (V143: últimas compras no Estoque e últimos fornecimentos no Fornecedor)

CONSULTA DO ESTOQUE (Agrícola › Insumos e estoque e Pecuário › Medicamentos e vacinas › Consultar)
- Cada produto mostra as 3 ÚLTIMAS COMPRAS, da mais nova para a mais antiga: data, quantidade
  (com o tamanho da embalagem, se houver), preço unitário da nota, fornecedor e prazo de pagamento
  ("À vista" ou "30 / 60 / 90 dias", contados da data da compra até cada vencimento).
  Quando o custo (com frete, despesas e créditos de imposto) é diferente do preço, aparece ao lado.
- As compras são de todas as unidades do Grupo (com o nome da fazenda); o saldo continua o da fazenda em uso.
- CÓDIGO DO PRODUTO: cada produto ganhou um código sequencial criado pelo sistema (os 75 já
  cadastrados foram numerados de 1 a 75). Aparece antes do nome, no cadastro, e a busca aceita o código.

CONSULTA DE PESSOAS (Mais › Pessoas › Consultar)
- Fornecedor mostra a RAZÃO SOCIAL (e o nome fantasia) e os 3 ÚLTIMOS FORNECIMENTOS: data, nº da
  compra, nota, prazo de pagamento e, item por item, [código] produto, quantidade e preço unitário.
- Vale também para quem já vendeu para o Grupo mas não está marcado como Fornecedor.
- Para ver só fornecedores, toque no botão "Fornecedor" acima da lista.

PLANO DE CONTAS: RECEITAS E CUSTOS COM OS MESMOS GRAUS 2 E 3 (rodar o arquivo do banco da V143)
- Grau 2 = a fazenda, igual dos dois lados: 3.1 e 4.1 FAZENDA 3 IRMÃOS; 3.2 e 4.2 FAZENDA DAS GARÇAS;
  3.9 e 4.9 ADMINISTRAÇÃO (SEDE).
- Grau 3 = o centro de custo, com o mesmo número nas Receitas e nos Custos:
    .01 AGRÍCOLA                    (3.1.01 Agrícola 3 Irmãos  ×  4.1.01 Agrícola 3 Irmãos)
    .02 PECUÁRIA                    (uma só, nas Receitas e nos Custos)
    .05 OUTRAS RECEITAS             ×  DESPESAS OPERACIONAIS
    .07 RECEITAS FINANCEIRAS        ×  DESPESAS FINANCEIRAS
    .50 DEDUÇÕES DAS VENDAS         (só nas Receitas: é redutora da receita, não é custo)
- O que mudou de número: nas Receitas, financeiras 05 → 07 e outras receitas 09 → 05.
  4.1.01 "Custo produção de café" passou a se chamar AGRÍCOLA.
- Garças: "Custos gados empastados" (4.2.01) e "Custos de gados confinados" (4.2.02) viraram uma só
  4.2.02 PECUÁRIA. As contas de mesmo nome viraram uma (Ração Pronta, Silagem de Milho, Salários e
  Encargos, Mão de Obra de Terceiros; "Medicamentos" juntou com "Medicamentos e Vacinas");
  Silagem de Capim, que só existia no confinado, entrou no fim (4.2.02.034).
- Pecuária é uma só; a separação pasto × confinamento fica só nas analíticas do gado:
    Receitas 3.N.02: .001 Venda de Gado Bovino Empastado · .002 Venda de Leite · .003 Venda de Gado Bovino Confinado
    Custos   4.N.02: .001 Custo Aquisição Gado Bovino de Pasto (era "Compras de Bovinos")
                     .002 Custo Aquisição Gado Bovino para Confinamento (era "Custo do Gado", do confinado)
- Criados para fechar o espelho: 4.1.02 PECUÁRIA (as duas de aquisição do gado e Outros Custos da Pecuária) e 4.2.01 AGRÍCOLA
  (Outros Custos Agrícolas).
- As contas são as mesmas (só trocaram código e nome): lançamentos e Tipos de despesa e receita
  continuam apontando para elas. O plano antes desta troca fica guardado em plano_contas_v142.
- Fazenda nova cadastrada já nasce com os mesmos graus 3 nos dois lados.

## Novidade da versão anterior (V142: plano de contas de 4 graus, plantas por ha e sacas por ha)

PLANO DE CONTAS (substitui todo o anterior; o de 5 graus fica guardado em plano_contas_v141)
- Máscara 9.9.99.999. Nas Receitas (3) e nos Custos e despesas (4): grau 2 = FAZENDA (centro de
  custo), grau 3 = subcentro (Agrícola, Pecuária, Custo de produção de café, Despesas
  operacionais...), grau 4 = conta onde os valores caem.
- Entraram as contas da sua planilha (acertos: "1.1.O1" → 1.1.01, "4..1.01.004" → 4.1.01.004,
  "2.1.01.002Fornecedores" → 2.1.01.002, "Aaplicações" → Aplicações, "Defensívos" → Defensivos).
  Ficaram de fora as linhas sem nome (3.x.02.051, 3.x.05.002, 3.x.09.001, 4.1.05.005, 4.2.01.002):
  os números continuam livres para você.
- O sistema criou, marcadas como "criada pelo sistema", as contas que ele precisa para classificar
  sozinho: Estoques (1.1.03), Adiantamentos, Financiamentos (2.1.04 e 2.2), Patrimônio Líquido
  (2.3: saldos de abertura, retiradas e Particular), combustível, manutenção, secagem etc.
  A Fazenda das Garças ganhou Despesas operacionais (4.2.05) e financeiras (4.2.07), e a
  ADMINISTRAÇÃO (SEDE) ganhou o seu grau 2 (3.9 e 4.9) para o que é lançado sem fazenda.
- Classificação por fazenda: o mesmo tipo (ex.: Energia elétrica) cai na conta de mesmo nome da
  fazenda do lançamento (3 Irmãos 4.1.01.014; Garças 4.2.05.004). Não havendo conta igual na
  fazenda, cai em "Outras despesas" / "Outras receitas" dela. Em Financeiro › Tipos, ao escolher
  a conta, a tela mostra em que conta o tipo cai em cada fazenda.
- Os 581 títulos já lançados passaram para o plano novo (financiamento de custeio → 2.1.04.001;
  tarifas sem fazenda → 4.9.07.004).
- AMARRAÇÃO AUTOMÁTICA DO QUE VIER DEPOIS:
  • Fazenda nova cadastrada → o sistema cria o grau 2 dela (3.N e 4.N) com receitas, deduções,
    despesas operacionais e financeiras. Mudou o nome da fazenda, muda o nome do grupo.
  • Banco novo → ganha a conta "Banco X CC Ag. 0000 Nº 00000" em 1.1.01.101 em diante (os 3 da
    Cresol já estão em 1.1.01.101 a 103); caixa novo → 1.1.01.001 (Caixa Geral) e seguintes;
    aplicação → 1.1.01.151 em diante.
  • Operação nova (ex.: "Análise de solo"): crie a conta no Plano de contas (no subcentro de
    uma fazenda) e o tipo em Financeiro › Tipos de despesa e receita, apontando para ela. Nas
    outras fazendas o sistema usa a conta de mesmo nome; se quiser separado, crie a conta com o
    mesmo nome no grupo das outras fazendas.
- Centros de custo (fazenda › atividade › talhão/lote) continuam nos bastidores para o rateio
  por talhão, lote e máquina; o centro e o subcentro gerenciais passam a ser os graus 2 e 3.

TALHÕES
- Plantas por ha: a CALCULADA pelo espaçamento e a EFETIVAMENTE PLANTADA (informada). Quando
  informada, é ela que vale para covas, plano de adubação, atividades e irrigação; a tela mostra
  a diferença (falhas ou adensamento).
- Previsão de safra: informa-se SACAS ESTIMADAS POR HECTARE e o sistema mostra as sacas
  calculadas do talhão (pela área útil) e o rendimento por planta.

SAFRAS (produção prevista)
- A previsão por talhão também é em sacas por hectare; ao lado, as sacas calculadas e o total.

## Novidade da versão anterior (V141: Fertilizante químico × Adubo orgânico)

- Nova categoria FERTILIZANTE (QUÍMICO): natureza (mineral simples, misto/formulado, complexo,
  organomineral, corretivo de solo, bioestimulante/condicionador), estado físico (sólido ou
  líquido), aplicação (solo, fertirrigação, foliar; pode marcar mais de uma), garantias N, P, K,
  Ca, Mg, S, B, Zn, Cu, Mn e outros, e nº de registro MAPA. Se for corretivo, aparecem PRNT, CaO
  e MgO; se for líquido, aparece a densidade.
- ADUBO passa a ser o ADUBO ORGÂNICO: origem (esterco bovino, cama de frango, composto, palha de
  café, torta, húmus, biofertilizante…), estado físico, matéria orgânica, carbono orgânico,
  umidade, relação C/N, N, P, K, Ca, Mg e registro MAPA (se houver).
- Os 21 produtos que estavam em Adubo eram todos químicos ou corretivos: passaram para
  Fertilizante, com natureza, estado físico e aplicação preenchidos.
- O Plano de adubação usa os dois (fertilizante e adubo orgânico); a escolha do calcário mostra
  os corretivos de solo. Nas Atividades, os fertilizantes aparecem primeiro na adubação.
- Compras de fertilizante caem na mesma conta de estoque "Adubos e Fertilizantes".

## Novidade da versão anterior (V140: dados técnicos dos produtos e várias classes no defensivo)

- DEFENSIVOS: a Classe agora aceita marcar MAIS DE UMA (ex.: Abamectina = Inseticida + Acaricida
  + Nematicida; Nativo Plus = Fungicida + Bactericida). Entraram as classes Bactericida,
  Cupinicida, Formicida, Raticida e Regulador de crescimento.
- Cadastro dos produtos em estoque completado (só os campos que estavam em branco):
  fabricante, princípio ativo, concentração, classe e nº de registro no MAPA dos defensivos;
  garantias (N, P, K, Ca, S, B e outros) dos adubos; aplicação das peças de cerca.
  As garantias dos adubos já passam a valer no Plano de adubação.

## Novidade da versão anterior (V139: arrumação dos ícones)

- Pecuário ganhou RAÇAS e FERROS (saíram do Mais).
- Mais ganhou COMPRAS, IMOBILIZADO e VENDAS (saíram do Financeiro). Continuam só para quem
  tem o Financeiro liberado; no Administrativo não aparece Vendas e no Particular não aparecem
  Vendas nem Imobilizado (como era no Financeiro).
- Em Mais, "Quem lançou" passou a se chamar AUDITORIA.

## Novidade da versão anterior (V138: ao voltar à página de rosto, sai-se da unidade)

- Na página de rosto nenhuma caixinha fica marcada: entrar na Faz. 3 Irmãos e voltar não deixa
  a 3 Irmãos em evidência.
- Voltando à página de rosto, sai-se da unidade: as agendas abertas por ali não mostram fazenda
  nenhuma no alto da tela. A unidade só aparece depois de tocar numa caixinha de SISTEMAS.
- Na Agenda, o botão "Abrir o sistema" virou "Voltar à página de rosto" (o sistema abre pelas
  caixinhas, sempre escolhendo a unidade).

## Novidade da versão anterior (V137: só as unidades que recebem lançamentos)

Página de rosto, faixa SISTEMAS: saíram as caixinhas Produtor, Administrador e Escritório
(são pessoas, não lugares onde caem lançamentos). Ficaram:
- ADMINISTRATIVO: despesas e receitas que não são de nenhuma fazenda (o antigo
  "Administração (sede)"; o que já foi lançado continua lá). Abre só o Financeiro e o Mais.
  Em Compras, só "Despesa (sem estoque)".
- PARTICULAR (um ou mais): despesas e receitas dos sócios. Abre o Financeiro, a Frota e o Mais.
  Cada despesa ou receita diz DE QUAL SÓCIO é (pode dividir entre sócios).
  NÃO entra no resultado das fazendas: vai ao Patrimônio Líquido (2.3.05.01.0003 Despesas
  Particulares dos Sócios e 2.3.05.01.0004 Receitas Particulares dos Sócios). No Resultado da
  atividade aparece no bloco "Particular dos sócios e retiradas (Patrimônio Líquido)".
- Cada FAZENDA, como antes.

Quem vê o quê:
- Produtor, Administrador e Escritório: o Administrativo, os Particulares e as fazendas.
- Gerente e funcionário: só a(s) fazenda(s) liberada(s) para eles.

Como cadastrar o Particular e os sócios:
- Mais › Fazendas e Particular › Cadastrar › "O que você está cadastrando": Particular dos sócios.
  Dê o nome (ex.: Particular) e toque em "Cadastrar o Particular".
- A tela abre na hora para incluir os sócios (nome e "Incluir"). Para incluir depois:
  Mais › Fazendas e Particular › Consultar › toque no Particular.

No alto das telas, a linha de baixo mostra onde se está lançando: a fazenda, "Administrativo"
ou o nome do Particular, e quem está usando.

## Novidade da versão anterior (V136)

- A aba "Início" (que ficava em branco) saiu da barra de baixo. Para voltar à página de
  rosto, use o "‹ Voltar" no alto da tela.
- Página de rosto: a caixa grande "Anotações das agendas" saiu. As anotações aparecem
  quando se toca na caixinha da agenda (a agenda abre com elas e com o botão de marcar feita).
  O número vermelho na caixinha continua mostrando o que está atrasado ou é para hoje.
- No alto de todas as telas: o título, o nome do Grupo (GRUPO CASSANI) e, embaixo, em letra
  menor, a fazenda em que se está lançando e quem está usando, por exemplo
  "FAZENDA 3 IRMAOS · Usuário: Produtor" (o e-mail não aparece).

## Novidade da versão anterior (V135: o Painel saiu)

- A página "Painel" (quadros de A receber, A pagar, Caixa, Bancos, Aplicações, Posição
  financeira e os ícones das agendas) deixou de existir.
- A aba "Início", na barra de baixo, agora leva direto à página de rosto.
- Ao abrir o sistema (pelas caixinhas da faixa SISTEMAS), ele abre no primeiro módulo
  liberado para a pessoa (Pecuário, Agrícola, Frota, Financeiro ou Mais).
- Os totais financeiros continuam no botão Finanças da agenda do Produtor, e o extrato
  e o fluxo de caixa no Financeiro. Para lançar em outra fazenda, toque na caixinha dela
  na página de rosto.

## Novidade da versão anterior (V134: nova página de rosto)

Depois de entrar no sistema, a primeira página ficou assim:
- Em cima: a logo do app, o nome do Grupo (GRUPO CASSANI), a logo do proprietário e a data.
- Faixa verde SISTEMAS: caixinhas lado a lado (2 por linha no celular, 4 no PC) para
  Produtor, Administrador, Escritório e cada fazenda. Tocar abre o sistema; na caixinha da
  fazenda, o sistema já abre nela. Cada fazenda mostra em letras miúdas o tempo de hoje:
  agora, máxima, mínima e a chuva prevista em mm (com a chance, em %).
- Faixa verde AGENDAS: uma caixinha por agenda (Produtor, Administrador, Escritório e cada
  fazenda, uma a uma). Fazenda nova cadastrada aparece sozinha. O número vermelho mostra o que
  está atrasado ou é para hoje. Tocar abre a agenda.
- Caixa grande "Anotações das agendas": as anotações de todas as agendas que a pessoa abre,
  com o nome da agenda, o prazo e quem anotou. Fora do prazo fica em VERMELHO.
  O botão "Cumprida" tira da lista e leva para "Tarefas cumpridas" (toque para abrir), onde
  dá para Desfazer. O banco apaga sozinho as cumpridas 3 dias depois (todo dia às 00h10).
- Na Agenda, o campo "Data" da anotação passou a se chamar "Prazo para cumprir".
- O botão "Abrir o sistema" e a lista "Tempo hoje nas fazendas" saíram (agora estão nas caixinhas).
- "Trocar as logos": no modo de troca, tocar na caixinha da fazenda troca a logo dela.

## Novidade da versão anterior (V133: acerto da V132)

- A V132 já estava funcionando no site, mas a aba Mais continuava mostrando "V131"
  (o número da versão não tinha sido trocado). Agora mostra V133.
- Na aba Mais, a linha de cima agora diz de qual Grupo é o usuário, por exemplo
  "Administrador do GRUPO CASSANI (lançando em FAZENDA 3 IRMAOS)".
- O nome da fazenda continua aparecendo só onde ela é necessária: no Painel ("Lançando em"),
  nos botões das agendas de cada fazenda e nos estoques.

## Novidade da versão anterior (V132: o alto das telas mostra o GRUPO, e não a fazenda)

- Em todas as telas, embaixo do título, aparece o nome do Grupo (ex.: GRUPO CASSANI),
  que vem de Mais › Produtor › Nome do grupo. Antes aparecia a fazenda em uso.
  Sem nome de grupo cadastrado, aparece a fazenda, como antes.
- No Painel, o quadro de cima mostra o Grupo em destaque e, embaixo, "Lançando em: <fazenda>".
  Com mais de uma fazenda, o botão Trocar continua ali: a fazenda em uso é só onde caem os
  lançamentos (compras, vendas, custos, despesas); os ativos e os passivos são do Grupo.
- Ao gravar o cadastro do Produtor, o nome do grupo novo já aparece no alto das telas.

## Novidade desta versão (V131: o GRUPO é o tronco; cada fazenda é uma filial)

O Produtor (ex.: GRUPO CASSANI) é o tronco, e não uma fazenda. Cada fazenda é uma filial.
Os movimentos (compras, vendas, custos e despesas) são de cada fazenda. Os ativos e os
passivos são do Grupo.

1. O QUE É DO GRUPO (aparece tudo junto, de qualquer fazenda)
- Caixa, bancos e aplicações: qualquer conta paga e recebe por qualquer fazenda.
  Em Bancos e caixa não se escolhe mais a fazenda.
- Contas a pagar e a receber: aparecem todas. No alto da tela, "De qual unidade" filtra
  (Todas, cada fazenda ou a Administração). Cada título mostra de quem é.
- Financiamentos: a dívida é do Grupo (veja o item 3).
- Imobilizado: o bem é do Grupo, alocado numa fazenda (veja o item 4).
- Fluxo de caixa previsto: sempre do Grupo inteiro.
- Os números (título nº, compra nº, venda nº, financiamento nº, bem nº) agora são únicos no
  Grupo e não se repetem entre as fazendas.

2. ADMINISTRAÇÃO (SEDE)
- É uma "unidade" à parte, para as despesas e as receitas da sede: escritório, contador,
  pró-labore, tarifas etc.
- No Contas a pagar/receber (Lançar) e em Compras › Despesa, escolha "De quem é esta despesa":
  uma fazenda ou "Administração (sede)". Vem marcada a fazenda em uso.
- O resultado do Grupo é a soma das fazendas mais a Administração, sem rateio.

3. FINANCIAMENTOS: FAZENDA DA DESPESA
- No cadastro há o campo "Fazenda da despesa (juros, IOF e despesas)". Os juros, a variação
  monetária, o IOF e as despesas de contratação vão para o resultado dessa fazenda.
- OS CONTRATOS JÁ LANÇADOS FICARAM "A INFORMAR". Informe a fazenda em Financiamentos ›
  Consultar › toque no contrato › "Informar a fazenda da despesa". Isso vale mesmo para
  contrato com parcela já paga.
- O alto da Consulta avisa quantos contratos ainda estão sem a fazenda.
- Enquanto a fazenda não for informada, as parcelas desses contratos entram só no relatório
  do Grupo e da Administração, e não no de nenhuma fazenda.

4. IMOBILIZADO: ALOCAÇÃO E TRANSFERÊNCIA
- No cadastro do bem: "Onde o bem fica (alocado em)".
- Para levar o bem a outra fazenda: Cadastrar › Alterar um bem › "Transferir para outra fazenda".
  Informe o destino, a data e o centro de custo de lá. O bem e o valor continuam do Grupo, e
  não se gera conta a pagar nem a receber. Daí em diante, a depreciação e o custo por hora vão
  para a fazenda nova.
- A Consulta mostra onde cada bem está e as transferências. Na depreciação do mês, cada bem
  conta para a fazenda onde estava naquele mês.

5. RELATÓRIOS
- Resultado da atividade e Exportar para a contabilidade: escolha "Grupo (tudo)", uma
  fazenda ou a Administração.
- No arquivo da contabilidade, o que é do Grupo ou da Administração sai na coluna Fazenda como
  "Grupo / Administração (sede)".

6. COMPRAS DE PRODUTOS (ESTOQUE)
- Continuam na fazenda em uso, porque o produto entra no estoque daquela fazenda.
- A consulta de compras abre na fazenda em uso e filtra por outra, pela Administração ou por todas.
- Para alterar uma compra de produtos de outra fazenda, troque a fazenda em uso.

O QUE FICA PARA A PRÓXIMA ETAPA (V132): a transferência de gado, de insumos e de café entre
fazendas, só com quantidade e valor, sem conta a pagar ou a receber. Hoje só o imobilizado transfere.

## Versão V130: abas, agenda do Escritório, consultas e local do tempo)
Rode o arquivo "Fazenda Digital V130 - banco.sql" (só acrescenta o ponto do escritório).

1. ABAS DE BAIXO NO CELULAR
- Mais altas, com letra e símbolo maiores e uma folga embaixo, longe da faixa do iPhone:
  fica fácil de tocar.
- No PC, os botões ficam juntos no meio da barra (não espalhados pela tela toda).
- Os símbolos (ícones) são carregados logo ao abrir, para não aparecerem quadradinhos.

2. ABAS DE CIMA DAS TELAS (Cadastrar | Consultar, Lançar | Pagar | Consultar, Previsão | Chuva...)
- Agora numa faixa só, juntas, cada uma com o seu símbolo; a aberta fica toda verde.

3. AGENDA DO ESCRITÓRIO IGUAL À DO PRODUTOR
- Mostra os recados, tarefas e lembretes. As contas a pagar e a receber não aparecem mais uma a
  uma: os totais e a equação dos saldos (Caixa + Bancos + Aplicações + A receber − A pagar) ficam
  no botão "Finanças". As contas, uma a uma, continuam em Financeiro › Contas a pagar / a receber.

4. CONSULTAS JÁ ABREM COM A RELAÇÃO DOS CADASTRADOS (a busca filtra)
- Talhões, Safras, Mangas, Pessoas, Fazendas, Raças, Ferros, Insumos e medicamentos, Bancos e
  caixa, Centros de custo, Veículos, Lotes e Dietas.

5. SAFRA: EXCLUIR
- No painel da safra (Consultar › toque na safra), o botão "Alterar, encerrar ou excluir esta
  safra" fica logo no alto. Em Abrir safra, "Alterar, encerrar ou excluir uma safra" escolhe na
  relação. Só exclui sem movimento e pergunta "Quer mesmo excluir?" antes.

6. NOME DA FAZENDA EM USO: aparece em todas as janelas, na barra de cima, embaixo do título.

7. CLIMA E CHUVA: LOCAL DA PREVISÃO
- No lugar de "Usar o centro de Colatina", os lugares cadastrados: "Na Fazenda ..." (pelo centro
  dos talhões e mangas desenhados no mapa ou pelo ponto já gravado) e "No escritório".
- O escritório é marcado uma vez: estando lá, o dono toca em "Estou no escritório: marcar este
  lugar como o Escritório". Continua valendo o "Onde estou agora (GPS)".

## Versão V129: página de rosto do grupo)
- Na página de rosto, logo abaixo de GRUPO CASSANI e da data, vem o botão "Abrir o sistema".
- As fazendas aparecem embaixo, em letras pequenas, só com o tempo de hoje
  ("Tempo hoje nas fazendas"): não são mais um botão de fazenda para abrir.

## Versão V128: barra de baixo no celular)
Esta versão NÃO tem arquivo de banco: só trocar o app e publicar.
- No celular (pelo navegador ou pelo ícone na tela de início), a barra de baixo (Início, Pecuário,
  Agrícola, Frota...) voltou à altura normal: estava espremida pela faixa de baixo do iPhone.
- As letras maiores da barra de cima e da barra de baixo agora valem só no PC (tela larga). No
  celular ficam no tamanho certo para caber.

## Versão V127: operação mais clara e acessos por caixinha)
1. BARRAS DO SISTEMA
- Barra de cima e abas de baixo em verde, com letras brancas e maiores (no PC, maiores ainda).
- Em TODAS as janelas aparece em cima o nome da tela e, logo abaixo, a fazenda em uso.
- Em todas as janelas: "‹ Voltar" (página anterior) à esquerda e "Sair" (sai do sistema,
  pergunta antes) à direita. Na página de rosto há também o botão "Sair do sistema".

2. PÁGINA DE ROSTO DO GRUPO
- Abre com o nome do grupo em letras grandes (ex.: GRUPO CASSANI), e não com uma fazenda.
- O nome vem do cadastro do produtor: Mais › Fazendas › Consultar › toque no Produtor ›
  "Nome do grupo (página de rosto)". Em branco, aparece o nome do produtor.
- Com mais de uma fazenda, a página avisa em qual fazenda o sistema vai abrir (troca no painel).

3. TELA BRANCA
- Se alguma tela der erro, não fica mais a página branca: aparece "Esta tela teve um problema",
  com o motivo e os botões "Voltar para a página anterior" e "Ir para a página de início".
  Se acontecer de novo no Contas a receber, mande uma foto dessa mensagem.

4. USUÁRIOS E ACESSOS (Mais › Usuários e acessos)
O Produtor e o Administrador marcam, em caixinhas, o que a pessoa pode abrir:
- AGENDAS: Produtor, Administrador, Escritório, De todas as fazendas (inclusive as que forem
  cadastradas depois) ou Só da sua fazenda (as fazendas marcadas para a pessoa).
  "De todas" e "Só da sua" não vão juntas.
- SISTEMA: Pecuária, Agrícola, Frota, Financeiro e Mais. O que não estiver marcado some das
  abas de baixo para aquela pessoa. O Início aparece sempre. Sem o "Mais", a pessoa vê lá só a
  Agenda, a troca de senha e o Sair.
- Sugestão pelo perfil (dá para mudar): Gerente: agenda só da fazenda dele e todos os módulos,
  sem o Financeiro. Escritório: agendas do Escritório e de todas as fazendas, tudo com o
  Financeiro. Funcionário: nenhuma agenda; Pecuária, Agrícola e Frota.
- Quem já estava cadastrado continua abrindo tudo como antes, até o Produtor marcar as caixinhas.
- Nova agenda do ADMINISTRADOR: abre para o administrador do sistema, para quem tem o perfil
  Administrador e para quem o Produtor marcar. Recebe tarefas como as outras.
- Na Consulta de usuários aparece o que cada pessoa abre.
- Os módulos são escondidos pela tela; o Financeiro continua protegido também no banco.

5. ANIMAIS COM CONTROLE GENEALÓGICO: BISAVÓS
- Na Genealogia, embaixo dos avós, os bisavós: mãe e pai de cada avó e de cada avô (8 campos).
- Achando a mãe ou o pai no cadastro, os avós E os bisavós vêm preenchidos sozinhos.
- Na Reprodução, a ficha da fêmea mostra os bisavós, e o aviso de parentesco passa a avisar
  quando o touro aparece como bisavô da fêmea.

6. SAFRAS
- A Consulta já abre com a relação das safras da fazenda; a busca filtra.
- "Alterar, encerrar ou excluir uma safra": escolhe na relação das cadastradas (não precisa
  saber o número). No painel da safra também há o botão "Alterar, encerrar ou excluir esta safra".
- Excluir safra: o sistema confere antes se ela tem movimento (colheitas, atividades, café no
  armazém, contratos, secagem e pilagem, vendas). Com movimento, não exclui e diz o que tem.
  Sem movimento, pergunta "Quer mesmo excluir?" antes.

7. TALHÕES
- A Consulta já abre com a relação dos talhões (área total no alto); a busca filtra.
- Para alterar, a escolha continua sendo na relação dos cadastrados.

## Versão V126: definir senha sem e-mail)
O banco já foi atualizado (não precisa rodar arquivo nenhum).
- Mais › Usuários e acessos › Consultar › toque na pessoa › "Definir senha":
  o Produtor ou o administrador grava a senha nova na hora e passa para a pessoa.
  Não precisa de e-mail nem de código.
- Só o administrador do sistema define a senha do Produtor; ninguém altera a do
  administrador.
- Quem ainda não criou a conta (aparece "Aguardando criar a conta") cria pelo
  "Criar conta" do app, com a senha que quiser.
- Mais › "Trocar minha senha": qualquer pessoa troca a própria senha.

## Versão V125: trocar a senha pelo link do e-mail)
- O e-mail padrão do Supabase ("Reset your password") traz só um link, sem código.
  Agora o app aceita esse link: em Entrar › Esqueci minha senha › Enviar e-mail,
  abra o e-mail e toque em "Reset password". O app abre direto na tela
  "Senha nova"; grave a senha e ele já entra.
- O link vale uma vez e por pouco tempo. Pedindo outro, use sempre o do e-mail
  mais recente.
- Se um dia o e-mail passar a trazer um código de números, ele continua sendo
  aceito na tela "Esqueci minha senha".
- Vai junto o arquivo public/_redirects (o site abre em qualquer página e pelo ícone).

## Versão V124: página de início, agendas e ícone na área de trabalho)
1. ÍCONE NA ÁREA DE TRABALHO DO PC E NA TELA DO CELULAR
- Na página de início aparece o botão "Criar ícone na área de trabalho" (no PC)
  ou "Criar ícone na tela de início" (no celular).
- No Chrome e no Edge (PC e Android) é só tocar e confirmar. No iPhone o botão
  mostra o caminho: Compartilhar › Adicionar à Tela de Início.
- Aberto pelo ícone, o app abre direto, sem a barra do navegador, e o botão some.

2. PÁGINA DE INÍCIO (depois de entrar)
- Cada fazenda com o tempo de hoje: temperatura de agora, como está o céu,
  máxima, mínima e se vai chover (mm previstos).
- Botão "Abrir o sistema".
- Botões das agendas que a pessoa pode abrir: o Produtor vê a dele e a de cada
  fazenda; o gerente, a da fazenda dele. O número vermelho no botão é o que
  está atrasado ou é para hoje.

3. AGENDAS
- Abrem sempre com as obrigações (atrasadas, hoje, próximos dias). O botão
  "Nova tarefa" fica logo depois da lista.
- Agenda do Produtor: só as obrigações dele (tarefas, obrigações que se repetem,
  ITR e veículos particulares). As contas a pagar e a receber não aparecem uma a
  uma: embaixo há o botão "Finanças", que mostra só os totais (Caixa, Bancos,
  Aplicações, Contas a receber, Contas a pagar e o Saldo), somando as fazendas.
- Embaixo, os botões das agendas das fazendas. Na agenda da fazenda, o Produtor
  toca em "Nova tarefa" e a tarefa fica na agenda daquela fazenda (o gerente vê).
- Agenda do Escritório: continua com as contas a pagar e a receber uma a uma.
- Em todas as agendas há o botão "Abrir o sistema" para o resto.

## Versão V123: Administrador do sistema e cadastro do Produtor)
1. ADMINISTRADOR DO SISTEMA (aleciosesana@gmail.com)
- Entra em qualquer fazenda, vê tudo (inclusive o Financeiro) sem depender de
  cadastro ou liberação. Fazendas novas já ficam ligadas a ele sozinhas.
- Não aparece para o produtor em Usuários e acessos e ninguém altera nem retira
  o acesso dele.
2. CADASTRO DO PRODUTOR (Mais › Usuários e acessos › Cadastrar)
- Só para o administrador do sistema aparece o perfil "Produtor (dono)".
- Basta nome e e-mail: o Produtor fica dono de TODAS as fazendas (inclusive as
  que forem cadastradas depois), vê o Financeiro e abre a agenda do Produtor.
- O Produtor entra no app, toca em "Criar conta" com aquele e-mail e, a partir
  daí, ele mesmo libera o escritório, os gerentes e os funcionários.
- Só o administrador do sistema cria ou altera um Produtor; o Produtor não
  consegue criar outro dono.
- O e-mail do Produtor passa a ser o do cadastro do produtor.

## Versão V122 (acessos por pessoa, quem lançou, cópia de segurança e uso pelo navegador)
ATENÇÃO: rode no Supabase › SQL Editor o arquivo "Fazenda Digital V122 - banco.sql"
(inteiro, Run). Pode rodar mais de uma vez. Não apaga nem altera lançamento nenhum.
IMPORTANTE: o banco ainda não tem as tabelas da Frota. Rode ANTES, nesta ordem, os
arquivos "Fazenda Digital V119 - banco.sql", "V120 - banco.sql" e "V121 - banco.sql"
e só depois o da V122. Sem eles a aba Frota dá erro.
O pacote traz uma pasta nova, "public" (ícone do app para o navegador): ela vai
junto na extração, em C:\FAZENDA_DIGITAL\app\public.

1. ACESSOS POR PESSOA (Mais › Usuários e acessos)
- Chave nova "Vê o Financeiro" em cada pessoa. Ligada: vê a aba Financeiro, os
  saldos, as contas a pagar e a receber e os financiamentos. Desligada: a aba
  Financeiro some, o Painel mostra só as agendas e, do Contas a pagar, a pessoa
  só enxerga o que ela mesma lançar (ex.: um abastecimento no posto).
- O padrão segue o perfil e pode ser mudado: Escritório vê; Gerente e
  Funcionário não veem.
- A regra vale no banco, não só na tela: quem não vê o Financeiro não consegue
  ler títulos, baixas, financiamentos, bancos e caixa das outras pessoas.
  Compras e Vendas saem do menu junto com a aba Financeiro.
- Perfil novo "Administrador": vê e faz tudo, como o dono (libera acessos, vê o
  Financeiro, consulta quem lançou, faz a cópia de segurança e abre a agenda do
  Produtor). É o perfil para quem dá suporte ao sistema.
- Sem o Financeiro, na Frota (abastecimento no posto, manutenção em oficina e
  despesas do frete) a despesa já abre como "A pagar": o escritório dá a baixa.

COMO MONTAR O TESTE (Produtor, Escritório, Gerente e você)
a) Entre com a conta de dono que já existe.
b) Mais › Usuários e acessos › Cadastrar, uma pessoa por vez, com o e-mail dela:
   - Você: perfil Administrador, todas as fazendas.
   - Escritório: perfil Escritório, nível Completo, todas as fazendas
     ("Vê o Financeiro" já vem ligado). O mesmo e-mail e senha no PC e no celular.
   - Gerente: perfil Gerente, só a fazenda dele ("Vê o Financeiro" desligado).
c) Cada pessoa abre o app, toca em "Criar conta" com exatamente aquele e-mail e
   o acesso aparece sozinho.
d) A conta de dono fica com o Produtor (é ela que abre a agenda do Produtor).
   Ele pode trocar a senha em Entrar › Esqueci minha senha.

2. QUEM LANÇOU (Mais › Quem lançou, só dono e administrador)
- Todo cadastro e lançamento passa a guardar quem fez. A tela mostra, por
  período (Hoje, 7 dias, 30 dias ou outro) e por pessoa: hora, operação, número,
  descrição, valor, fazenda e o nome de quem lançou.
- Aparece a operação de origem: a compra (e não cada título dela), a atividade
  (e não cada saída de estoque).
- O registro conta daqui para a frente. Do que já estava lançado, só as telas
  que já guardavam o autor (compras, títulos, atividades, financiamentos...).

3. CÓPIA DE SEGURANÇA (Mais › Cópia de segurança, só dono e administrador)
- O banco passa a guardar sozinho uma cópia de tudo, todo domingo às 3h da
  manhã, e mantém as 8 últimas. Ao rodar o arquivo do banco já sai a primeira.
- "Fazer cópia agora": antes de um lançamento grande ou de uma limpeza.
- "Baixar": salva o arquivo no computador (pelo navegador), para guardar fora
  do sistema. Faça isso de vez em quando: as cópias ficam no mesmo banco.
- As fotos de notas e laudos não entram no arquivo. Voltar uma cópia não é feito
  pela tela; se precisar, é só pedir, informando a data.

4. USO PELO NAVEGADOR (PCs e celulares, sem instalar nada)
O app passa a funcionar também como site: o mesmo endereço abre no PC e nos
celulares (Android e iPhone). O que mudou para isso:
- Avisos e confirmações ("Excluir?", "Tirar foto / Galeria") aparecem numa
  caixa do próprio app (o navegador não tem o aviso do celular).
- Mapa dos talhões e pastos funciona no navegador.
- Foto de nota, de laudo e de planta: no celular abre a câmera; no PC, escolhe
  o arquivo. A foto é reduzida antes de enviar.
- No PC o conteúdo fica numa coluna central; "Enviar o link" copia o texto.
- No Expo Go tudo continua igual.

COMO PUBLICAR (uma vez; depois, só os passos b e c a cada versão)
a) Uma vez só, no Prompt, em C:\FAZENDA_DIGITAL\app:
     npx expo install react-dom react-native-web @expo/metro-runtime
b) Gerar o site:
     npx expo export --platform web
   Cria a pasta C:\FAZENDA_DIGITAL\app\dist
c) Publicar: crie uma conta gratuita em netlify.com, abra
   app.netlify.com/drop e arraste a pasta "dist" para a página. Sai um endereço
   (dá para trocar o nome em Site configuration › Change site name).
   Nas versões seguintes: no site criado, aba Deploys, arraste a nova "dist".
d) Para testar no próprio PC antes de publicar:  npx expo start --web
e) No celular: abra o endereço no Chrome (Android) ou no Safari (iPhone) e use
   "Adicionar à tela de início". Fica com o ícone do Fazenda Digital.
Precisa de internet para usar. A conta (e-mail e senha) é a mesma de sempre.
Esta parte foi escrita e conferida, mas o site ainda não foi gerado: se o passo
b ou a primeira abertura mostrar erro, mande a mensagem que aparece.

## Versão V121 (abastecimentos e manutenções na estrada, Arla 32)
ATENÇÃO: rode no Supabase › SQL Editor o arquivo "Fazenda Digital V121 - banco.sql"
(depois dos da V119 e da V120). Depois instale o pacote como sempre.

FRETE › ABASTECIMENTOS NA VIAGEM (quantos precisar)
- Data, KM NA HORA DO ABASTECIMENTO, COMBUSTÍVEL, LITROS, VALOR,
  ARLA 32 (litros e valor) e posto/cidade. Mostra o preço do litro.
- O km precisa ficar entre o km de saída e o de chegada do frete.
- Ficam gravados na Frota, no veículo: entram no consumo (km/L), no
  hodômetro, nos avisos de manutenção e nos Gastos da frota.
- Não geram contas a pagar separadas: somam nas DESPESAS DA VIAGEM do
  frete (um pagamento só: "Já paguei" ou "A pagar").

FRETE › MANUTENÇÕES NA ESTRADA (quantas precisar)
- O que foi feito (pneu, guincho, mecânico...), data, km, valor e
  oficina/cidade. Ficam no histórico de manutenções do veículo
  (corretivas, "na estrada, frete nº X") e somam nas despesas da viagem.

RESULTADO DA VIAGEM
- Frete líquido − despesas − manutenção na estrada − combustível e Arla
  (os da estrada mais algum abastecimento avulso do veículo entre a
  saída e a chegada, como o do tanque da fazenda antes de sair).

ARLA 32 TAMBÉM NO ABASTECIMENTO AVULSO (Frota › Abastecimentos › Posto)
- Campos "Arla 32 (litros)" e "Arla 32 (R$)". O total pago no posto
  soma combustível + Arla. O Arla não entra no cálculo do consumo.
- Gastos da frota, Situação da frota e ficha do veículo somam o Arla
  no combustível. "Arla 32" saiu da lista de combustíveis.

ONDE SE ALTERA
- Abastecimento e manutenção lançados no frete só se alteram ou
  excluem pelo frete. Na consulta aparecem com "frete nº X"; na ficha
  do veículo, o toque abre o frete.

## Versão V120 (FRETES na Frota)
ATENÇÃO: rode no Supabase › SQL Editor o arquivo "Fazenda Digital V120 - banco.sql"
(depois do da V119; se ainda não rodou o da V119, rode o da V119 primeiro).
Depois instale o pacote como sempre.

FROTA › FRETES (Lançar | Consultar)
- Tipo: "Para terceiros" (gera receita no Contas a receber) ou "Transporte
  próprio" (levar a produção ou trazer insumos: não gera receita, mostra
  quanto custou o transporte).
- Frete nº, saída e chegada (chegada em branco = em viagem).
- Veículo, motorista e CONTRATANTE (quem paga; cadastra na hora como Cliente).
- ORIGEM: fazenda/local de carregamento, município e UF.
- DESTINO: fazenda/local de entrega, REGIÃO, MUNICÍPIO e ESTADO (UF).
- CARGA: tipo (café, gado, adubo, calcário, grãos, ração, madeira...),
  descrição, quantidade e unidade (sacas, cabeças, t, kg, m³), peso (kg).
- DOCUMENTOS: nota fiscal, CT-e, MDF-e e GTA (gado).
- KM DE SAÍDA e KM DE CHEGADA: mostra os km rodados. Os km entram no
  hodômetro do veículo (consumo e avisos de manutenção) e são conferidos
  com as leituras anteriores.
- VALOR DO FRETE: valor fechado, por km rodado, por tonelada ou por
  unidade (saca, cabeça) – o sistema calcula. Descontos (impostos e
  retenções do contratante). Recebimento: "Já recebi" (caixa/banco) ou
  "A receber" (vencimento). Conta nova 3.1.01.03.0003 Receita de Fretes
  Prestados.
- DESPESAS DA VIAGEM: PEDÁGIO, ALIMENTAÇÃO DO MOTORISTA, hospedagem/
  pernoite, diária do motorista, carga e descarga (chapa), outras (balsa,
  lona, estacionamento) e COMISSÃO DO MOTORISTA (% do frete). Pagamento:
  "Já paguei" ou "A pagar". Conta nova 4.1.02.02.0004 Custos dos Fretes
  Prestados (no transporte próprio: Fretes sobre Vendas).
- COMBUSTÍVEL: não se digita no frete. Vem dos abastecimentos do veículo
  entre a saída e a chegada; sem abastecimento no período, é estimado
  pelos km × consumo médio × último preço do litro.
- RESULTADO DA VIAGEM: frete líquido − despesas − combustível, o
  resultado por km e o frete por km (sem depreciação e manutenção).
- Consultar: fretes do período com km, receita, despesas, combustível e
  resultado; totais e resultado por km; ranking por contratante.
- Ficha do veículo (caminhão, caminhonete, carro): botão "Lançar frete".
- A receita e as despesas que nascem no frete só se alteram ou excluem
  pelo frete. Com recebimento lançado no Contas a receber, estorne antes
  de mudar o valor ou excluir.

## Versão V119 (aba FROTA – abastecimento e manutenção)
ATENÇÃO: antes de instalar o app, rode no Supabase › SQL Editor o arquivo
"Fazenda Digital V119 - banco.sql" (inteiro, Run). Pode rodar mais de uma vez.
Depois instale o pacote como sempre (apague src e App.tsx e extraia).

ABA NOVA "Frota" (entre Agrícola e Financeiro)
Para veículos, tratores, colhedoras, implementos e equipamentos (motobomba,
gerador, motosserra...). Funções:

1. VEÍCULOS E MÁQUINAS (Cadastrar | Consultar)
- Nome, tipo, marca, modelo, ano, placa, chassi/série, RENAVAM.
- USO: Agricultura, Pecuária, Administrativo ou Particular (do proprietário).
  É o uso que decide para onde vai o custo (ver "Classificação" abaixo).
  Particular: "De quem é" (em branco = o produtor).
- Medidor: hodômetro (km), horímetro (horas) ou não tem (implemento).
  Informe a leitura de hoje: é o ponto de partida.
- Combustível, tanque (L), seguro (vencimento), responsável/motorista,
  centro de custo e o bem do Imobilizado (opcional).
- PLANO DE MANUTENÇÃO: cada item a cada X km/horas e/ou Y meses (vale o
  que vencer primeiro), com "Última vez" (leitura e data) para quem já
  tem o histórico. Ao escolher o tipo, o sistema sugere um plano padrão
  (troca de óleo, filtros, graxa, revisão, licenciamento...). São médias:
  ajuste pelo manual do fabricante.
- Consultar: por nome, placa, marca ou nº; "Relação da frota em uso".
  Tocando, abre a FICHA do veículo.

2. FICHA DO VEÍCULO
- Leitura atual e uso médio por dia; consumo médio (km/L ou L/h) pelo
  método tanque cheio a tanque cheio; situação da manutenção.
- Plano item a item: Em dia / Perto de vencer / Vencida, quanto falta
  (km/h e data) e a PREVISÃO pela média de uso. Botão "Feito" abre a
  manutenção já com o item marcado.
- Gastos dos últimos 12 meses, abastecimentos e manutenções recentes.
- Botões: Abastecer, Manutenção, Atualizar km/horas, Editar.
- Trator/máquina ligado ao bem do Imobilizado: "Usar o consumo real"
  grava no bem os litros por hora medidos (e o preço do litro), que vão
  para o custo por hora das Atividades agrícolas.

3. ABASTECIMENTOS (Lançar | Consultar)
- Veículo, km ou horas (obrigatório quando tem medidor), litros,
  "Completou o tanque", combustível.
- TANQUE DA FAZENDA: escolha o combustível do estoque; sai do estoque
  pelo custo médio (a despesa já foi lançada na compra do diesel).
- POSTO: posto, R$/litro ou total, cupom, "Já paguei" (caixa/banco) ou
  "A pagar" (vencimento). Vira despesa em Compras e no Contas a pagar.
- O sistema não aceita km/horas menor que o anterior (nem maior que o de
  uma data seguinte): pega erro de digitação.
- Ao lançar, mostra o consumo do trecho e a média.

4. MANUTENÇÕES E TROCAS DE ÓLEO (Lançar | Consultar)
- Preventiva: marque os itens do plano feitos (eles voltam a contar do
  zero) · Corretiva: descreva o conserto.
- Óleo, filtros e peças DO ESTOQUE (saem pelo custo médio).
- Na fazenda ou em oficina/mecânico: valor do serviço (com peças
  compradas na hora), "Já paguei" ou "A pagar".

5. ATUALIZAR KM OU HORAS
- A leitura entre um abastecimento e outro (ex.: conferência semanal do
  horímetro). Mostra na hora o que ficou vencido.

6. SITUAÇÃO DA FROTA (painel) e GASTOS DA FROTA (relatório)
- Painel: vencidas, perto de vencer, gasto do mês, avisos e a frota
  por uso. Todas as fazendas ou só a ativa.
- Gastos: por período, por uso e por veículo: combustível, manutenção,
  km/horas rodados, custo por km ou por hora e consumo.

AVISOS NA AGENDA (automáticos)
- Agenda de cada fazenda: itens do plano vencidos ou que vão vencer
  dentro da janela da agenda (pela média de uso) e seguro vencendo, dos
  veículos daquela fazenda (menos os particulares).
- Agendas do Produtor e do Escritório: os mesmos avisos dos veículos
  PARTICULARES dos proprietários.
- Tocando no aviso, abre a ficha do veículo.

CLASSIFICAÇÃO (o sistema faz sozinho, pelo uso)
- Agricultura: Combustíveis e Lubrificantes Agrícolas / Manutenção de
  Tratores e Implementos (contas que já existiam).
- Pecuária: contas novas 4.1.01.02.0007 Combustíveis e Lubrificantes da
  Pecuária e 4.1.01.02.0008 Manutenção de Máquinas, Veículos e
  Equipamentos da Pecuária.
- Administrativo: contas novas 4.1.02.01.0010 Combustíveis de Veículos
  da Administração e 4.1.02.01.0011 Manutenção de Veículos e
  Equipamentos da Administração.
- Particular: conta nova 2.3.05.01.0002 Despesas Particulares dos
  Proprietários (Veículos), no Patrimônio Líquido: NÃO é custo da
  fazenda; no Resultado aparece fora do resultado, como retirada.
- O uso pode ser trocado em cada lançamento (ex.: a caminhonete
  particular que puxou o gado vira Pecuária só naquele abastecimento).
- Os tipos novos aparecem também em Financeiro › Tipos de despesa e
  receita, onde a conta pode ser trocada.
- A despesa que nasce na Frota só se altera ou exclui pela Frota.

OUTROS
- O rodapé da aba Mais voltou a mostrar a versão certa (estava V109).

## Versão V118 (Saldos de abertura: contrapartida no Patrimônio Líquido)
Não precisa instalar nada novo no app. Este pacote já traz tudo do V106 ao V117.
ATENÇÃO: este pacote só deve ser instalado depois que o banco for atualizado
com o arquivo "Fazenda Digital V118 - banco.sql" (traz também a parte do V117).

INÍCIO DO SISTEMA (Mais › Fazendas › Consultar › toque no Produtor)
- Seção nova "Início do sistema (saldos de abertura)". Você informa uma
  vez a data em que começa a operar o sistema de verdade.
- "Conferir o que muda" mostra, antes de gravar: quantos financiamentos,
  títulos e pagamentos são anteriores à data. Depois, "Confirmar esta
  data". Nada é apagado; trocando a data, o sistema reclassifica de novo.
- Enquanto a data não for informada, nada muda no sistema.

O QUE O SISTEMA FAZ SOZINHO, PELA DATA DE CADA LANÇAMENTO
- Título a pagar ou a receber com data anterior ao início (compra para
  estoque, despesa, venda, título avulso): a contrapartida vai para a
  conta nova do plano "2.3.02.01.0004 Saldos de Abertura (Implantação do
  Sistema)", no Patrimônio Líquido. A natureza original (adubo, energia,
  venda de café...) fica guardada e sai no histórico da exportação.
- Financiamento liberado antes do início: a dívida (saldo devedor de
  principal) entra com a contrapartida no Patrimônio Líquido e a
  liberação não passa pelo banco. O cadastro já percebe pela data e nem
  pergunta mais "Lançar a liberação no banco". As parcelas continuam no
  Contas a pagar; quando pagas, o principal abate a dívida e os juros
  são despesa financeira, como antes.
- Pagamento ou recebimento com data anterior ao início não mexe no saldo
  do caixa e dos bancos (painel, Bancos e caixa e extrato). O saldo
  inicial de cada conta passa a ser o do início do sistema.
- No título aparece a marca "Saldo de abertura (Patrimônio Líquido)".

RELATÓRIOS
- Resultado da atividade: bloco novo "Saldos de abertura (Patrimônio
  Líquido)", fora do resultado. Pagar ou receber uma conta que já
  existia mexe no caixa, mas não é despesa nem receita do período.
- Exportar para a contabilidade: esses lançamentos saem com o registro
  "Saldo de abertura". O financiamento antigo sai numa linha própria,
  com o saldo devedor e "Patrimônio Líquido" na coluna Caixa ou banco.
- A conta usada pode ser trocada em Financeiro › Tipos de despesa e
  receita › "Saldo de abertura" (definidos pelo sistema).

## Versão V117 (Agenda: participantes, envio de tarefas e mais obrigações automáticas)

PARTICIPANTES DAS AGENDAS (Mais › Usuários e acessos)
- Só o produtor cadastra participante. No cadastro da pessoa apareceu o
  campo "Agendas que pode abrir": as agendas das fazendas marcadas para
  ela e a do Escritório. Marque as que ela pode abrir.
- O sistema sugere pelo perfil (gerente: a agenda das fazendas dele;
  escritório: a do Escritório e as das fazendas; funcionário: nenhuma),
  mas quem decide é o produtor. Sem agenda marcada, a pessoa não
  participa das agendas.
- A agenda do Produtor continua só do produtor.
- Quem já tinha acesso ficou com as mesmas agendas de antes.

RELAÇÃO DAS AGENDAS (Mais › Agenda)
- Cada agenda mostra, embaixo do nome, os participantes dela. O produtor
  escolhe ali a agenda que quer ver; os demais abrem só as liberadas
  (as outras aparecem com cadeado).

ENVIAR TAREFA (Mais › Agenda › Enviar tarefa)
- Qualquer participante manda tarefa para as outras agendas, mesmo as
  que não abre. O sistema pergunta: "Enviar para todas" ou "Escolher
  para quem" (aí aparece a relação das agendas, com os participantes,
  para marcar).
- Na agenda de quem recebe, a tarefa aparece com "Tarefa de Fulano".
- Quem mandou acompanha em "Tarefas que enviei": em aberto ou feita, e
  pode cancelar (lixeira) enquanto estiver em aberto.

OBRIGAÇÕES QUE SE REPETEM (dentro de cada agenda)
- Botão "Cadastrar obrigação que se repete": o que fazer, de quanto em
  quanto tempo (dias, meses ou anos) e a primeira data. Ela entra
  sozinha na agenda a cada vencimento.
- Tocando nela aparecem "Feita" (passa para a próxima data) e "Excluir".

NOVAS OBRIGAÇÕES AUTOMÁTICAS (abastecidas pelo próprio sistema)
- Nas agendas das fazendas: produto abaixo do estoque mínimo; produto
  em estoque com a validade chegando; entrega de café dos contratos
  (venda futura e troca por insumos); lote há muito tempo sem pesar
  (90 dias, ajustável em "Ajustar os prazos das rotinas"; zero desliga).
- Nas agendas do Produtor e do Escritório: contas a pagar e a receber
  que vencem nos próximos 15 dias (com as parcelas dos financiamentos),
  um aviso só com o total das vencidas (abre a lista) e, em agosto e
  setembro, a declaração do ITR das fazendas com nº de ITR no cadastro.

## Versão V116 (Financiamento: atualizar o contrato até uma data)
O banco não mudou depois desta versão. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V115.

ATUALIZAR O CONTRATO ATÉ UMA DATA (Financiamentos › Consultar › contrato)
- Botão novo, logo depois dos dados do contrato. Você informa a data e
  toca em Calcular. Aparece: principal em aberto, correção monetária,
  juros ainda não pagos e o total atualizado.
- É SÓ INFORMAÇÃO: nada é gravado nas parcelas nem no contas a pagar.
  Só calcula quando você pede.
- A correção monetária é buscada na hora no Banco Central (gratuito):
  IPCA, INPC, IGP-M, TR, CDI e Selic. A tela mostra os meses ou dias
  que entraram na conta e avisa quando o índice ainda não foi
  publicado até a data pedida.
- Sem internet, ou com indexador "Outro", abre o campo para informar a
  variação do período à mão.
- "% do indexador": 100 = o índice cheio (100% do CDI); 120 = 120%.
- "Forma de cálculo": juros sobre o saldo corrigido (o usual nos
  bancos, já vem marcada) ou correção e juros separados. A tela mostra
  também quanto daria pela outra forma, para comparar.
- "Juros desde" e "Correção desde" já vêm sugeridos (última parcela
  paga; liberação; CDI e Selic acompanham os juros) e podem ser
  mudados.
- São os juros do contrato: multa e juros de mora de parcela vencida
  não entram. Para quitar, vale o valor que o banco informar.
- Contrato sem indexador: escolha um na própria tela para simular e,
  se quiser, toque em "Guardar este indexador no contrato".

INDEXADOR NO CADASTRO (Financiamentos › Cadastrar › Juros)
- O campo de texto virou escolha: Sem correção, IPCA, INPC, IGP-M, TR,
  CDI, Selic ou Outro, com o "% do indexador" e a forma de cálculo.
- Os contratos nº 12 e nº 14, que estavam com CDI, ficaram com 100% do
  CDI e juros sobre o saldo corrigido.
- A variação monetária cobrada pelo banco em cada parcela continua
  sendo informada na parcela, como antes.

## Versão V115 (Financiamento: acertos do cadastro e consulta por credor)
O banco não mudou. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V114.

BANCO E AGÊNCIA DO CONTRATO (Financeiro › Financiamentos › Cadastrar)
- Agora são quatro caixinhas: Nº do banco, Nome do banco, Nº da agência
  e Nome da agência (Marilândia, Centro Colatina, São Silvano...).
- Digitando o número, o sistema acha o nome (001 = Banco do Brasil,
  133 = Cresol, 756 = Sicoob...). Digitando o nome, acha o número.
  Pode digitar 1 ou 01: vira 001. Número fora da tabela do sistema é
  buscado na internet.
- Na primeira vez você digita; ao gravar o contrato, o banco com a
  agência entra sozinho em Cadastros › Pessoas › Banco. Nas próximas,
  ele aparece no alto do campo para escolher com um toque, e também ao
  digitar 2 letras do nome.
- O mesmo banco com outra agência vira outro cadastro (Cresol ag.
  Marilândia, Cresol ag. Centro Colatina).
- Banco que já estava cadastrado sem agência: a agência digitada
  completa o cadastro dele ao gravar.

CONTA EM QUE O DINHEIRO ENTROU
- Três caixinhas: Banco, Nº da agência e Nº da conta. As contas já
  cadastradas aparecem logo abaixo; enquanto você digita, ficam só as
  parecidas. Toque para escolher.
- Digitou uma conta que não existe: aparece o botão "Cadastrar esta
  conta", que leva a Bancos e caixa já com o que foi digitado. Ao
  cadastrar, você volta ao financiamento com a conta escolhida (o que
  já estava preenchido no contrato não se perde).

TITULAR E OBJETO FINANCIADO
- Digitando 2 letras aparecem, para tocar, os nomes e os objetos já
  usados nos outros contratos (os mais usados primeiro).
- O corretor do teclado foi desligado nesses campos.

IOF
- Funciona nos dois sentidos: informou o percentual, sai o valor;
  informou o valor, sai o percentual. Sempre sobre o valor liberado.

Nº DE CONTRATO REPETIDO
- Ao digitar um nº de contrato que já existe, aparece o aviso dizendo
  em qual financiamento ele está (banco e titular).
- Ao gravar, o sistema para e pede confirmação: "É outro contrato:
  gravar mesmo assim" (pode coincidir em bancos diferentes).

CONSULTAR
- Busca por banco, titular, nº do contrato ou objeto.
- "Por credor (títulos em aberto)": toque no credor e aparecem só os
  títulos em aberto dele, por vencimento, com o total, os vencidos e a
  divisão em principal e juros. Tocando no título, abre o contrato.
- O titular agora aparece na relação dos contratos.

CENTROS DE CUSTO (Financeiro › Centros de custo)
- Sem nenhum centro cadastrado, a tela não pergunta mais "Dentro do
  centro": explica que o primeiro é o da fazenda (código 01) e traz o
  botão para montar a estrutura inteira de uma vez.
- "Dentro do centro" passou a dizer que é opcional.
- Pode digitar o código sem os zeros (1 vira 01) e o código completo
  (01.02) sem escolher o centro de cima: o sistema acha.
- No Financiamento, embaixo do Centro de custo, há o atalho
  "Cadastrar centros de custo".

QUANTIDADE DE PARCELAS
- Todos os campos passaram a recusar o preenchimento automático do
  teclado e do navegador, para nenhum abrir com valor que não foi
  digitado ali.

## Versão V114 (Financiamento: carência dividida nas parcelas e ano civil)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V113.

JUROS DA CARÊNCIA "DIVIDIDOS NAS PARCELAS" (SAC)
- Para o contrato em que o banco calcula os juros da carência, soma ao
  saldo e divide em cotas iguais, uma em cada parcela.
- Marque "Divididos nas parcelas" e copie da tabela do banco o valor da
  coluna "Carência/Juros" de uma parcela (ex.: 9.101,68).
- Cada parcela fica: principal + cota da carência + juros do período.
  Os juros do período contam de um período antes da 1ª parcela, sobre o
  saldo com as cotas.
- A pergunta dos juros da carência aparece também com "Contrato já em
  andamento" ligado.

BASE DE DIAS "ANO CIVIL (365/366)"
- Era "365 dias". Um ano cheio rende exatamente a taxa anual, e o ano
  bissexto é contado como o banco conta. Use nos contratos anuais.

ATENÇÃO À TAXA
- Em "Juros anuais" vai o "Juros ao Ano" do contrato, e não o "CET ao
  Ano" (o CET inclui IOF e tarifas e é sempre maior).

## Versão V113 (Financiamento: juros da carência pagos a cada período)
O banco não mudou. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V112.

JUROS DO TEMPO DE CARÊNCIA (SAC · Principal fixo + juros)
- "Pagos a cada período" (já vem marcada): os juros são pagos todo ano
  (ou mês, conforme a periodicidade), então cada parcela traz só os
  juros do seu período. Os pagamentos só de juros que já venceram não
  entram; os que ainda vão vencer entram, marcados com "J" na tabela.
- "Pagos na 1ª parcela": a 1ª parcela traz os juros desde a liberação.
- "Somam ao saldo": os juros da carência viram saldo e rendem juros.
- A chave "Contrato já em andamento", ligada, já faz os juros da
  próxima parcela contarem de um período antes dela, mesmo sem
  informar valores já pagos.

## Versão V112 (Financiamento: só as parcelas do contrato)
O banco não mudou. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V111.

QUANTIDADE E VENCIMENTO DAS PARCELAS
- O sistema grava exatamente a quantidade de parcelas informada, a
  primeira no vencimento informado e as outras seguindo dela. Não entra
  mais nenhuma parcela antes dessa data, em nenhuma modalidade.
- Saiu a opção "Pagos a cada período" dos juros da carência (era ela
  que criava parcelas só de juros, um período depois da liberação).
- No SAC com carência ficam duas opções: "Pagos na 1ª parcela" (a que
  já vem marcada: a 1ª parcela traz os juros desde a liberação) e
  "Somam ao saldo".

CONTRATO JÁ EM ANDAMENTO
- A chave "Contrato já em andamento" subiu para o começo de Parcelas.
  Ligada, os campos passam a pedir "Parcelas que faltam" e "Vencimento
  da próxima parcela a pagar", e a tela avisa se a data já passou.

CONTRATOS GRAVADOS COM PARCELAS A MAIS
- Consultar › abra o contrato › "Alterar o contrato (refaz as
  parcelas)" › Salvar.

## Versão V111 (Bancos em Pessoas e ajustes do Financiamento)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V110.

BANCOS (Cadastros › Pessoas › Cadastrar › "Banco")
- No alto do cadastro escolha Pessoa ou Banco. O banco tem ficha
  própria: Nome, Local da agência, Nº da agência, Nº do banco, E-mail,
  Telefone e Celular.
- Na consulta de pessoas há o filtro "Banco".
- No Financiamento, o campo "Banco" mostra primeiro os bancos; quem for
  cadastrado ali na hora entra como banco. Escolhido o banco, a agência
  do contrato vem do cadastro dele (pode trocar).
- Os bancos que já tinham financiamento foram marcados como Banco.

FINANCIAMENTO
- Depois de gravar, a data da liberação e a quantidade de parcelas
  também ficam em branco.
- Conta em que o dinheiro entrou: agora são duas caixinhas, Nº da
  agência e Nº da conta. Digitando, o sistema acha a conta cadastrada;
  se não existir, ela é cadastrada em Bancos e caixa ao gravar. As
  contas já cadastradas aparecem logo abaixo, para usar com um toque.
- O sistema de cálculo (SPC · Parcelas iguais, SAC · Principal fixo +
  juros, Pagamento único) foi para a seção Juros.

PARCELAS IGUAIS (SPC) CONFERIDAS COM A TABELA DO BANCO
- A taxa ao mês segue a do contrato (ex.: 96,49% a.a. = 5,79% a.m.).
- Os juros da carência (da liberação até um mês antes da 1ª parcela)
  são contados como o banco conta e saem em cota igual por parcela.
- Com isso a coluna "Principal" bate com a do banco, parcela a parcela
  (pode sobrar 1 centavo em alguma).
- Para o sistema repetir a tabela do banco, informe a data da
  liberação, a 1ª parcela, os juros anuais e o valor da parcela
  exatamente como estão no contrato.

## Versão V110 (Financiamento: parcelas iguais corrigidas)
O banco não mudou. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 ao V109.

PARCELAS IGUAIS (Financeiro › Financiamentos › Cadastrar)
- "Valor da parcela do contrato" agora é OBRIGATÓRIO. Sem ele não há
  tabela nem gravação.
- O vencimento informado da primeira parcela é respeitado: a 1ª parcela
  vence nessa data e as outras seguem dela. Não entram mais parcelas só
  de juros antes, contadas da liberação, nem juros a mais na 1ª parcela.
  Todas as parcelas saem com o valor do contrato.
- A pergunta "Juros do tempo de carência" não aparece mais nas parcelas
  iguais (o valor da parcela do contrato já traz esses juros).
- "Quantidade de parcelas" abre em branco, e não mais com 12.

OUTRAS MODALIDADES
- Principal fixo + juros: a 1ª parcela vence na data informada. Só
  entram parcelas antes dela se você escolher "Pagos a cada período" na
  carência, e agora a tela avisa quantas são e quando vence a primeira.
- Tudo no vencimento: uma parcela só, na data informada.

CONTRATO JÁ GRAVADO COM PARCELAS A MAIS
- Consultar › abra o contrato › "Alterar o contrato (refaz as
  parcelas)" › Salvar. As parcelas são refeitas pela regra nova.

## Versão V109 (Financiamento: titular do contrato)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106, V107 e V108.

TITULAR DO CONTRATO (Financeiro › Financiamentos › Cadastrar)
- Campo novo, opcional, logo depois do nº do contrato.
- Preencha quando o contrato está no nome de outra pessoa (filho,
  cônjuge, sócio...). Em branco, o titular é o produtor.
- Aparece na relação dos financiamentos e na ficha do contrato.
- É só informação: as parcelas, o contas a pagar e os relatórios
  continuam da fazenda, como nos outros contratos.
- Nos contratos já lançados: Consultar › abra o contrato ›
  "Alterar o contrato" (só enquanto não houver parcela paga).

## Versão V108 (Financiamento: principal fixo com 1ª parcela longa e contrato em andamento)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 e do V107.

1. JUROS DA CARÊNCIA "PAGOS NA 1ª PARCELA" (Cadastrar › Parcelas)
- Terceira opção para os juros do tempo de carência, além de
  "Somam ao saldo" e "Pagos a cada período".
- É o caso do contrato em que a primeira parcela vence bem depois
  da liberação e traz os juros de todos os dias desde ela, sem
  nenhum pagamento antes.
- Conferido com a Conta Gráfica da Cresol (R$ 20.000,00, principal
  fixo, 5 parcelas anuais, 19,51% a.a., liberação em 24/12/2024):
  8.223,65 / 7.168,99 / 6.376,74 / 5.589,24 / 4.792,25, iguais às
  do banco, centavo por centavo.

2. CONTRATO JÁ EM ANDAMENTO: JUROS PELO CALENDÁRIO
Os juros da próxima parcela passam a contar da data certa do
vencimento anterior (um ano antes, um mês antes...), e não de
360 ou 30 dias antes. Na parcela anual a diferença era de 5 dias
de juros.

COMO LANÇAR O CONTRATO DE PRINCIPAL FIXO DA CRESOL (1ª já paga)
- Lançar a liberação no banco: desligado (contrato antigo).
- Valor liberado 20.000,00 · liberação 24/12/2024 · IOF 674,60.
- Juros anuais 19,51 · compostos · 360 dias.
- Como paga: Principal fixo + juros · Periodicidade: Anual.
- Contrato já em andamento: ligado.
  Já pago: principal 4.000,00 · juros 4.223,65.
- Parcelas que faltam: 4 · Vencimento da próxima: 15/01/2027.
- Confira a tabela: 7.168,99 / 6.376,74 / 5.589,24 / 4.792,25.

## Versão V107 (Financiamento: parcelas iguais como o banco calcula)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
Este pacote já traz tudo do V106 (Esqueci minha senha).

1. CÁLCULO DAS PARCELAS IGUAIS CORRIGIDO
- O sistema usava os juros dos dias corridos do mês anterior ao
  primeiro vencimento (31 dias). Agora usa a taxa do mês cheio,
  como os bancos.
- A divisão entre principal e juros também passou a ser a do
  banco: os juros da carência são repartidos em cotas iguais pelas
  parcelas, e o principal das parcelas fecha com o valor financiado.
- Conferido com a Conta Gráfica da Cresol (R$ 50.000,00, 36 parcelas,
  5,79% a.m.): parcela de 3.635,15 e principal da 1ª de 354,01,
  iguais aos do banco; nas demais a diferença é de centavos.

2. VALOR DA PARCELA DO CONTRATO (Cadastrar › Parcelas)
- Campo novo, opcional, nas "Parcelas iguais": copie do contrato o
  valor fixo da parcela.
- Informado, a parcela é essa. O sistema só calcula quanto é
  principal e quanto é juros em cada uma.
- A tela mostra ao lado quanto daria pelo cálculo do sistema, para
  conferir. Diferença de centavos é normal (o banco arredonda a taxa).

3. RECALCULAR AS PARCELAS EM ABERTO (Consultar › abra o contrato)
- Botão novo, nas parcelas iguais. Informe o valor fixo da parcela
  e o sistema refaz principal e juros de todas as parcelas ainda
  não pagas. Os títulos no contas a pagar mudam junto.
- As parcelas já pagas não mudam. Variação monetária e vencimentos
  já ajustados são mantidos.
- O ajuste de uma parcela só (toque na parcela) continua existindo,
  para variação monetária ou acerto de centavos.

4. O QUE NO BANCO APARECE COMO "CARÊNCIA/JUROS"
No sistema a parcela tem principal e juros. Os juros da carência
ficam dentro dos juros de cada parcela, sem coluna separada.

COMO ACERTAR O CONTRATO Nº 1 (Cresol)
1. Financeiro › Financiamentos › Consultar › abra o nº 1.
2. Recalcular as parcelas em aberto › 3.635,15 › Recalcular e gravar.
3. Confira: 1ª parcela com principal de 354,01; todas de 3.635,15.

## Versão V106 (Esqueci minha senha e entrada mais clara)
O banco não mudou. Não precisa instalar nada novo no app.
Para o código de senha chegar por e-mail, falta uma configuração
no Supabase (item 4), feita uma vez só.

1. ESQUECI MINHA SENHA (tela Entrar)
- Toque em "Esqueci minha senha", informe o e-mail e toque em
  "Enviar código".
- Chega um e-mail com um código de números. Digite o código e a
  senha nova, duas vezes. O app grava a senha e já entra.
- O código vale por pouco tempo e só uma vez. Dá para pedir outro
  depois de 1 minuto.

2. TELA ENTRAR MAIS CLARA
- "Entrar" é para quem já tem conta. "Criar conta" ficou separado,
  embaixo, com a pergunta "Ainda não tem conta neste app?".
- Em "Criar conta", se o e-mail já tem conta, o app avisa e oferece
  dois botões: "Entrar com este e-mail" e "Esqueci minha senha".
- Todos os campos de senha têm o olho para ver o que foi digitado.

3. LEMBRETE: UMA CONTA SÓ, EM TODOS OS APARELHOS
A conta (e-mail e senha) é a mesma no PC de casa, no outro PC e nos
celulares. Cria-se uma vez; nos outros aparelhos é só "Entrar".
O primeiro e-mail que entra com o sistema vazio faz o Primeiro
acesso e fica como dono. Os demais o dono libera em
Mais › Usuários e acessos.

4. CONFIGURAR O ENVIO DO CÓDIGO NO SUPABASE (uma vez só)
Sem isso o Supabase só envia e-mail para os membros da sua
organização no próprio Supabase, e no máximo uns poucos por hora.

a) Senha de app do Gmail (grátis)
- Use um Gmail seu para ser o remetente.
- Em myaccount.google.com › Segurança, ligue a "Verificação em
  duas etapas" (se ainda não estiver ligada).
- Abra myaccount.google.com/apppasswords, crie uma senha de app
  com o nome "Fazenda Digital" e copie as 16 letras.

b) No Supabase, projeto fazenda-digital
- Authentication › Emails › SMTP Settings › ligue "Enable custom SMTP".
- Sender email: o seu Gmail.  Sender name: Fazenda Digital
- Host: smtp.gmail.com   Port: 465
- Username: o seu Gmail.  Password: as 16 letras, sem espaços.
- Save.

c) Modelo do e-mail (para vir o código, e não um link)
- Authentication › Emails › Templates › Reset Password.
- Subject: Código para trocar a senha - Fazenda Digital
- No corpo, apague tudo e cole:

<h2>Fazenda Digital</h2>
<p>Seu código para criar uma senha nova:</p>
<p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
<p>Digite esse código no app. Se não foi você que pediu, ignore este e-mail.</p>

- Save.

COMO TESTAR
1. Saia da conta (Mais › Sair da conta).
2. Entrar › Esqueci minha senha › informe o e-mail › Enviar código.
3. Abra o e-mail, digite o código e a senha nova.
4. Saia e entre de novo com a senha nova.
Se aparecer "O envio de e-mail ainda não está liberado para este
endereço", falta o item 4.

## Versão V105 (Fazenda com dados fiscais próprios para faturamento)
O banco JÁ ESTÁ ATUALIZADO e foi ZERADO para um cadastro novo.
Não precisa instalar nada novo no app.
(A pasta "assets" com o ícone vem de novo; pode substituir.)

1. PRIMEIRO ACESSO
O sistema está sem produtor e sem fazenda. Ao entrar com o e-mail e
a senha, abre o Primeiro acesso para cadastrar o produtor e a
primeira fazenda. Quem entrar primeiro fica como dono.

2. DADOS FISCAIS DA FAZENDA (Mais › Fazendas)
- Nome / razão social e CPF ou CNPJ de cada fazenda, além dos dados
  que já havia (inscrição estadual, defesa, INCRA, ITR, CAR).
- Só muda o faturamento. Rebanho, lavoura, financeiro, painel e
  agenda continuam de um dono só, com várias fazendas.
- Em branco, valem os dados do produtor.

3. ONDE ISSO APARECE
- Compras: a nota vem, por padrão, em nome do CPF/CNPJ da fazenda
  ativa (dá para trocar). Na leitura da nota por foto, esse
  documento é reconhecido como o comprador, nunca como fornecedor.
- O CPF/CNPJ da fazenda entra sozinho na lista "documentos de
  compra" do Produtor. É lá que se marca se ele tem crédito de ICMS,
  IPI e PIS/COFINS (entra sem nenhum crédito).
- Vendas: a tela mostra "Faturamento em nome de" e a ficha da venda
  mostra "Faturado por".

COMO TESTAR
1. Entre, faça o Primeiro acesso e cadastre a 1ª fazenda.
2. Mais › Fazendas › abra a fazenda › Dados fiscais › salve.
3. Cadastre a 2ª fazenda com outro CPF/CNPJ.
4. Troque de fazenda e abra Compras: a nota sai no nome da fazenda.

## Versão V104 (Fazenda: inscrições; Pessoas: sem o tipo Comprador)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
(A pasta "assets" com o ícone vem de novo; pode substituir.)

1. FAZENDAS (Mais › Fazendas)
Campos novos, todos opcionais:
- Inscrição no órgão de defesa animal/sanitária
- INCRA nº
- ITR nº
- CAR nº

2. PESSOAS
- O tipo "Comprador" saiu. Quem compra a produção é Cliente.
- Em Vendas, nos contratos e no armazém de café o campo passou a se
  chamar "Cliente".
- O Tipo continua aceitando mais de um ao mesmo tempo, de propósito:
  a mesma pessoa pode ser cliente e fornecedor num cadastro só. A
  tela agora avisa isso.

## Versão V103 (A receber e A pagar: vencidos, hoje, 7 dias e total)
Não mudou nada no banco. Não precisa instalar nada novo no app.
(A pasta "assets" com o ícone vem de novo; pode substituir.)

- Os quadros A receber e A pagar do painel mostram agora:
    Vencidos   títulos com vencimento antes de hoje
    Hoje       títulos que vencem hoje
    7 dias     de amanhã até daqui a 7 dias (hoje não entra de novo)
    Total      a soma dos três
- O quadro Posição financeira usa esse mesmo Total: a conta fecha com
  os quadros de cima.
- Tocando no quadro, a lista abre nos mesmos três grupos, cada um com
  o seu total.

## Versão V102 (Painel menor, quadro da posição e ícones das agendas)
Não mudou nada no banco. Não precisa instalar nada novo no app.
(A pasta "assets" com o ícone vem de novo; pode substituir.)

1. PAINEL (aba Início)
- Quadros menores: A receber e A pagar lado a lado; Caixa, Bancos e
  Aplicações numa linha só. Tocando, abrem as mesmas telas de antes.
- Quadro novo "Posição financeira", com a conta linha a linha:
    Caixa + Bancos + Aplicações + Contas a receber - Contas a pagar
  A receber e a pagar entram com os títulos vencidos e os que vencem
  até daqui a 7 dias.
- Agendas: aparecem só os ícones (Produtor, cada Fazenda, Escritório),
  os que o usuário pode abrir. O número vermelho no ícone é o que está
  atrasado ou é para hoje. A agenda só abre com o toque.
- Os 5 lembretes mais urgentes não aparecem mais sozinhos: toque em
  "Ver os 5 lembretes mais urgentes".

2. AGENDA DO PRODUTOR
- Mostra a agenda dele e, embaixo, os ícones para abrir as agendas
  dos gerentes (por fazenda) e a do Escritório.
- A agenda do Escritório mostra os ícones das agendas das fazendas.
- Nas agendas dos gerentes anotam o gerente da fazenda, o produtor e
  o escritório (já era assim desde o V101).

COMO TESTAR
1. Início: confira a conta do quadro Posição com os quadros de cima.
2. Toque no ícone Produtor: abre a agenda dele, com os ícones das
   outras embaixo.

## Versão V101 (Agenda refeita: uma agenda aberta por vez)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.
(A pasta "assets" com o ícone vem de novo; pode substituir.)

Onde: aba Mais › Agenda, ou o quadro da Agenda no painel.

1. A LISTA DAS AGENDAS
Ao abrir, aparecem as agendas para tocar:
  Produtor
  Fazenda Tal (uma para cada fazenda: é a agenda do gerente dela)
  Escritório
Tocou, abre só aquela. Sem autorização, aparece o cadeado e não abre.

2. QUEM ABRE O QUÊ
- Produtor: só o produtor.
- Fazenda Tal: o gerente daquela fazenda, o escritório e o produtor.
- Escritório: o escritório e o produtor.
O gerente só vê e alimenta a agenda da fazenda dele.
Funcionário não tem agenda.

3. PERFIL NOVO: ESCRITÓRIO
Em Mais › Usuários e acessos, o perfil agora pode ser Gerente,
Escritório ou Funcionário. É por ele que o sistema sabe quem abre a
agenda do Escritório e as das fazendas.

4. DENTRO DA AGENDA
- Nova anotação, marcar como feita (toque) e excluir (segurar): igual.
- Anotação feita por outra pessoa sai marcada: "Anotação do
  produtor", "do escritório" ou "do gerente".
- As obrigações automáticas ficam nas agendas das fazendas.

5. PAINEL
Os 5 lembretes mais urgentes juntam as agendas que o usuário abre.

COMO TESTAR
1. Mais › Agenda: a lista com Produtor, a fazenda e Escritório.
2. Abra cada uma, anote e volte.
3. Usuários e acessos › libere alguém como Escritório e outro como
   Gerente; entrando com eles, confira o cadeado nas outras agendas.

## Versão V100 (Página de início, painel e ícone: 3ª etapa)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

ATENÇÃO NA INSTALAÇÃO: este pacote traz também a pasta "assets" com
o ícone (icon.png e adaptive-icon.png). Ao extrair em
C:\FAZENDA_DIGITAL\app, aceite substituir os dois arquivos.

1. LOGO E ÍCONE
- Proposta de logo: sol nascendo sobre a lavoura, com os arcos de
  sinal (o "digital"). Está na página de início e na tela de entrada.
- O ícone do aplicativo NÃO aparece no Expo Go (lá o ícone é o do
  Expo). Ele passa a valer quando o app for gerado para instalar.

2. PÁGINA DE INÍCIO (abre depois de entrar)
- Logo do aplicativo em cima e FAZENDA DIGITAL logo abaixo.
- Logo do proprietário: "Trocar as logos" e toque no quadro. Pode
  tirar foto, escolher da galeria ou importar de um arquivo (PNG ou
  JPG). Cada fazenda também pode ter a sua logo, ao lado do nome.
- Fazendas: nome e, em letras pequenas, o tempo de hoje na fazenda:
  máxima, mínima, se vai chover e os mm previstos.
- Tocar numa fazenda entra nela. "Entrar" entra na fazenda atual.

3. SEGUNDA PÁGINA (aba Início = painel)
Soma todas as fazendas do usuário.
- Contas a receber e Contas a pagar: total que vence hoje e nos
  próximos 7 dias. Tocando, abre a lista desses títulos (e, à parte,
  os vencidos). Tocando no título, abre o título.
- Saldo de caixa e Saldo bancário: sempre os calculados pelo
  aplicativo. Tocando, abre o Extrato.
- Aplicações de liquidez imediata: cadastre em Financeiro › Bancos e
  caixa, com o tipo novo "Aplicação (liquidez imediata)".
- Agenda: os 5 lembretes mais urgentes de todas as fazendas e do
  Escritório Central. Tocando, abre a Agenda completa.
- As abas de baixo continuam iguais.
- Os cartões de animais, lotes e tempo saíram do painel: o tempo foi
  para a página de início; animais e lotes estão em Pecuário.

COMO TESTAR
1. Abra o app: página de início com a logo e o tempo da fazenda.
2. Trocar as logos › toque no quadro do proprietário › galeria.
3. Entrar › confira os valores do painel com o Contas a pagar, o
   Contas a receber e o Extrato.
4. Bancos e caixa › cadastre uma Aplicação com saldo inicial.
5. Toque em Contas a pagar no painel e, depois, na Agenda.

## Versão V99 (Agenda: 2ª etapa dos ajustes)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

Onde: aba Mais › Agenda, ou o cartão "Agenda da fazenda" no Início.

1. DE ONDE E DE QUEM
- "Agenda de onde": cada fazenda e o Escritório Central.
- Em cada lugar há a Agenda do Produtor e a Agenda do Gerente.
- O produtor (dono) vê as duas e anota nas duas. O que ele anota na
  Agenda do Gerente aparece para o gerente como "Anotação do produtor".
- O gerente vê e anota só na Agenda do Gerente das fazendas dele. A
  do Escritório Central aparece para todos os gerentes.
- Funcionário vê só as obrigações automáticas da fazenda.

2. ANOTAÇÕES
- "Nova anotação": data, o que fazer e observação.
- Toque na anotação para marcar como feita (toque de novo desfaz).
  Segure o dedo para excluir. Anotação do produtor, só ele exclui.

3. OBRIGAÇÕES AUTOMÁTICAS (só nas fazendas)
Entram sozinhas e saem quando o lançamento é feito:
- Reforços de vacinas e medicamentos (Sanidade).
- IATF: manejos do protocolo, inseminação e diagnóstico.
- Levar a vaca para o pré-parto (30 dias antes) e parto previsto.
- Trocar o gado de manga, pelo máximo de dias de ocupação da manga.
- Abastecer o cocho de sal (a cada 7 dias) e limpar o bebedouro (a
  cada 15), nas mangas com gado que têm essas estruturas cadastradas.
- Adubações programadas nos planos (pastagens e lavouras).
Tocando na obrigação, abre a tela onde ela se resolve.
"Ajustar os prazos das rotinas": muda os dias do sal, do bebedouro e
do pré-parto. Zero desliga.

A lista mostra: Atrasados, Hoje, Próximos 7 dias e Depois (60 dias).

COMO TESTAR
1. Mais › Agenda: veja as obrigações da fazenda.
2. Nova anotação na Agenda do Produtor; marque como feita.
3. Troque para Agenda do Gerente e anote: sai "Anotação do produtor".
4. Escolha "Escritório Central" e anote.
5. Numa manga com gado, cadastre um cocho de sal: aparece na agenda.
   Registre o abastecimento na manga: a obrigação vai para a frente.

## Versão V98 (Animais e Reprodução: 1ª etapa dos ajustes)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

1. PESOS INDIVIDUAIS (os dois tipos de animal)
- Todos os pesos do animal ficam guardados: o peso do dia do cadastro,
  cada peso novo informado na ficha e cada pesada com o brinco dele em
  Pecuário › Pesagens.
- A ficha do animal mostra "Pesos do animal": data, origem (cadastro
  ou Pesagem nº), peso e o ganho em kg/dia entre um peso e outro.
- O último peso é sempre o mais recente do histórico. Pesada com
  brinco atualiza sozinha o peso do animal.
- Animal cadastrado DEPOIS da pesagem: ao receber o brinco, puxa as
  pesadas já feitas com esse brinco.

2. OBJETIVO (sem controle genealógico)
- Campo novo: Corte ou Reprodução sem controle.

3. LOTE NO CADASTRO
- Já existia. O rótulo agora diz "só se for juntar-se a um lote
  existente".

4. CONSULTA
- O resultado da busca mostra o lote, o local onde o lote está (manga
  e a indicação de uso dela, ex.: Confinamento), o objetivo e o último
  peso com a data.
- A ficha aberta mostra o quadro "Onde está" no alto.
- O local vem da manga do lote. Lote sem manga aparece como "local
  não informado".

5. DEPs OFICIAIS (com controle genealógico)
- Escolha o programa: PMGZ (ABCZ), ANCP ou Geneplus (Embrapa). O
  sistema apresenta as características oficiais do programa para
  informar DEP, AC % e DECA (PMGZ) ou TOP % (ANCP e Geneplus), mais o
  índice (iABCZ, MGTe, IQG) e a edição do sumário.
- Em branco não grava. DEP negativa: sinal de menos antes do número.

6. REPRODUÇÃO
- Protocolo IATF: "Fêmeas individuais". Busque pelo brinco, registro
  (Série + RGN/RGD), número do sistema ou nome; cada fêmea escolhida
  entra na lista. Vale junto com o lote ou sem lote nenhum.
- "Coleta de embriões" passou a "Coleta de oócitos".

COMO TESTAR
1. Animais › Cadastrar › sem controle: informe objetivo e peso.
2. Consultar › ache o animal: veja lote, local e último peso. Abra a
   ficha, mude o peso e salve; abra de novo e veja os dois pesos.
3. Pesagens › lance uma pesada com o brinco dele; volte à ficha.
4. Animais › com controle › DEPs oficiais › PMGZ: informe 2 ou 3.
5. Reprodução › Protocolo IATF › Fêmeas individuais.

## Versão V97 (Tipos de despesa e receita: você mesmo mantém a lista)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

Onde: Financeiro › Tipos de despesa e receita (Cadastrar | Consultar).

O tipo é o nome que aparece nas telas ("Energia elétrica", "Seguros").
Cada tipo aponta para uma conta do plano, nos bastidores. Agora quem
inclui, renomeia e religa os tipos é você.

1. Cadastrar
- Onde aparece: Despesa (Compras › Despesa e Contas a pagar), Só
  Contas a pagar (financiamento, adiantamento, retirada) ou Contas a
  receber.
- Nome do tipo, do jeito que se fala no dia a dia.
- Conta do plano que o tipo usa. A lista mostra só as contas
  analíticas que servem para aquele lugar e avisa quando a conta já é
  de outro tipo.
- Cada tipo da lista usa uma conta diferente. Para um tipo novo que
  ainda não tem conta ("Água", por exemplo), crie antes a conta no
  plano: há o atalho "Criar no Plano de contas" na própria tela.

2. Consultar
- Os tipos separados por lugar, com a conta de cada um. Tocando num
  tipo: muda o nome, a conta ou desativa.
- "Definidos pelo sistema" são os que a tela de origem escolhe sozinha
  (venda de café, compra de adubo, mão de obra da colheita...). Neles
  só a conta muda.

Regras:
- Mudar a conta de um tipo vale para os próximos lançamentos. O que já
  foi lançado fica na conta antiga.
- Tipo desativado some das listas; o que foi lançado com ele continua.
- Tipo que veio com o sistema não se exclui (pode desativar). Tipo
  criado por você se exclui enquanto não tiver despesa lançada.

A VOZ em todas as telas fica para depois do seu pente-fino.

COMO TESTAR
1. Plano de contas › cadastre "Água" dentro de 4.1.02.01.
2. Tipos › Cadastrar › Despesa › "Água" › a conta nova › Cadastrar.
3. Compras › Despesa › "O que é": "Água" já aparece na lista.
4. Consultar › "Venda de bovinos" › troque a conta, se quiser.

## Versão V96 (Exportar para a contabilidade)
O banco e a função "exportar-contabilidade" no Supabase JÁ ESTÃO
ATUALIZADOS. Não precisa instalar nada novo no app.

Onde: Financeiro › Exportar para a contabilidade.

- Escolha a fazenda (a ativa ou todas) e o período, e toque em "Gerar
  o arquivo".
- Sai um arquivo CSV (abre no Excel): ponto e vírgula entre as colunas,
  vírgula nos centavos e datas em dd/mm/aaaa.
- "Abrir / baixar o arquivo" abre no navegador do celular. "Enviar o
  link" manda por WhatsApp ou e-mail para quem faz a contabilidade.
  O link vale por 1 hora; depois é só gerar de novo.

O que vem em cada linha:
  Registro (Lançado, Pago ou Recebido), Data, Vencimento, Natureza
  (Pagar ou Receber), Valor, Código da conta, Conta, Tipo da conta,
  Caixa ou banco, Pessoa, CPF/CNPJ, Documento, Título nº, Parcela,
  Histórico, Origem, Fazenda e Centro de custo.

- "Lançado": cada título emitido no período, pela data do lançamento.
- "Pago" / "Recebido": o dinheiro que saiu ou entrou no período.
- Parcela de financiamento sai em duas linhas: principal e juros.
  As parcelas aparecem como "Lançado" na data da liberação do
  contrato; o vencimento de cada uma está na coluna ao lado.
- Juros, multa e desconto da baixa saem em linhas próprias. O desconto
  vem com valor negativo.
- Título sem tipo sai como "Sem classificação" e a tela avisa quantos.

Só exporta o que o usuário pode ver. O arquivo fica guardado no
servidor, em pasta fechada: só abre pelo link.

COMO TESTAR
1. Exportar › Este ano › Gerar o arquivo › Abrir.
2. Mande o link para o seu e-mail e abra no computador, no Excel ou no
   LibreOffice.
3. Se der erro ao gerar, me mande a mensagem que aparecer.

## Versão V95 (Relatórios gerenciais, parte 2: resultado da atividade)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

Onde: Financeiro › Resultado da atividade. Só consulta.

- Escolha a fazenda (a ativa ou "Todas as fazendas") e o período: este
  mês, mês passado, este ano, 12 meses ou outras datas.
- É pelo REGIME DE CAIXA: vale a data em que o dinheiro entrou ou saiu
  (as baixas confirmadas). Por isso fecha com o Extrato.
- As linhas são as contas do plano, agrupadas pelo grupo de cima.
  Ninguém escolheu conta: a classificação veio da origem do lançamento.

Como o relatório é montado:
  Receitas recebidas
  (-) Custos e despesas pagos
  (-) Compras para estoque (insumos e animais)
  = RESULTADO DE CAIXA DA ATIVIDADE
  Investimentos (bens)
  Financiamentos (liberações menos principal pago)
  Outros movimentos (adiantamentos, retiradas, sem classificação)
  = VARIAÇÃO DO CAIXA NO PERÍODO

Regras:
- Parcela de financiamento: os juros e a variação monetária vão para
  despesas financeiras; o principal vai para Financiamentos, fora do
  resultado. Liberação de financiamento não é receita.
- Juros e multa pagos por atraso são despesa financeira; recebidos,
  receita financeira. Desconto obtido no pagamento é receita
  financeira; desconto concedido no recebimento, despesa.
- Compra de insumos e de animais entra no resultado quando é paga (é o
  regime de caixa). O consumo do estoque e a depreciação não entram.
- Título lançado sem tipo aparece em "Outros movimentos", como "Sem
  classificação".
- No fim, a tela confere a soma das contas com o movimento de caixa.

FICA PARA DEPOIS
- Visão por competência (consumo do estoque, depreciação e exaustão),
  se você quiser as duas.
- Abrir uma linha e ver os títulos que a formam.
- Exportação para a contabilidade.

COMO TESTAR
1. Resultado da atividade › Este ano: confira a variação do caixa com
   o Extrato de todas as contas no mesmo período.
2. Pague uma parcela de financiamento em Contas a pagar e veja os
   juros em despesas financeiras e o principal em Financiamentos.

## Versão V94 (Relatórios gerenciais, parte 1: extrato e fluxo de caixa)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

Onde: Financeiro › Extrato e fluxo de caixa. Só consulta: nada se
digita além da conta e do período. Tudo sai do que já foi lançado.

1. Extrato
- Escolha a conta (um caixa, um banco ou "Todas as contas") e o
  período: este mês, mês passado, 3 meses, este ano ou outras datas.
- Mostra o saldo anterior, as entradas, as saídas e o saldo final, e
  cada movimento com data, descrição, pessoa, nº do título, fazenda e o
  saldo depois dele.
- Entram os pagamentos e recebimentos confirmados (as baixas), pela
  data em que o dinheiro saiu ou entrou. É a mesma regra do saldo de
  Bancos e caixa, então os dois batem.
- Conta que serve a mais de uma fazenda mostra os movimentos de todas,
  com o nome da fazenda em cada linha.
- Pagamento lançado por usuário que não é o dono só entra depois de
  confirmado; a tela avisa quantos estão aguardando.

2. Fluxo previsto
- Parte do saldo de hoje em caixa e bancos e soma, mês a mês, o que
  está em aberto em Contas a receber e a pagar nos próximos 12 meses,
  com as parcelas dos financiamentos e as contas contínuas.
- Colunas: a receber, a pagar e o saldo acumulado no fim de cada mês
  (em vermelho quando fica negativo).
- "Vencidos" junta o que já venceu e não foi pago. Tocando num mês
  aparecem os títulos dele.
- Com mais de uma fazenda: "Esta fazenda" ou "Todas as fazendas".

FICA PARA A PRÓXIMA (V95)
- Resultado da atividade: receitas e despesas por período, agrupadas
  pela estrutura do plano de contas, por fazenda ou consolidado.

COMO TESTAR
1. Extrato › Todas as contas › Este mês: o saldo final deve ser igual
   à soma dos saldos em Financeiro › Bancos e caixa.
2. Lance uma despesa "Já paguei" em Compras e volte ao extrato.
3. Fluxo previsto: confira as parcelas do financiamento nos meses.

## Versão V93 (Cadastro e movimentação de financiamentos)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

Onde: Financeiro › Financiamentos (Cadastrar | Consultar).

1. Cadastrar
- Nº do financiamento (o sistema dá) e nº do contrato do banco, banco
  e agência, finalidade (custeio, investimento, comercialização) e
  objeto financiado.
- Liberação: data, valor liberado, IOF (% e valor: o valor é calculado
  pelo percentual e pode ser corrigido) e despesas de contratação.
  "IOF e despesas": descontados do valor liberado ou pagos à parte.
- Juros: anuais, simples ou compostos, e a base de dias do ano (360 ou
  365). Os juros mensais e diários aparecem calculados.
- Indexador: opcional. A variação monetária é informada em cada
  parcela, quando o banco manda o valor.
- Como paga:
  Parcelas iguais (principal e juros juntos, tabela Price);
  Principal fixo + juros do saldo devedor (SAC);
  Tudo no vencimento (saldo devedor mais juros, de uma vez).
- Quantidade de parcelas, periodicidade e vencimento da primeira. As
  demais são calculadas. Mensal, bimestral, trimestral, semestral e
  anual caem sempre no mesmo dia do mês; "Outro (dias)" conta os dias.
  O prazo em dias é calculado.
- Carência: se entre a liberação e a primeira parcela cabe mais de um
  período, aparece "Juros do tempo de carência": somam ao saldo ou são
  pagos a cada período (parcelas só de juros).
- A tabela calculada aparece na tela, com principal e juros de cada
  parcela, o total de juros e o valor da parcela fixa, para conferir
  com a do banco antes de gravar.
- Contrato já em andamento: ligue a chave e informe o que já foi pago
  de principal, juros e variação monetária, as parcelas que faltam e o
  próximo vencimento. Desligue "Lançar a liberação no banco".

2. O que o Gravar faz
- Cada parcela vira um título em Contas a pagar. A baixa é dada lá.
- O valor liberado entra na conta bancária na data da liberação (não é
  receita). Liberação com data futura fica em Contas a receber.
- IOF e despesas vão para despesa financeira: descontados, saem da
  conta na hora; à parte, ficam em Contas a pagar.

3. Consultar
- Relação dos financiamentos com o saldo devedor de cada um e o total,
  separado em "vence em até 12 meses" e "depois".
- Tocando num financiamento: todos os dados, o que já foi pago de
  principal, juros e variação monetária, e as parcelas.
- Tocando numa parcela em aberto: ajusta os juros, a variação
  monetária e o vencimento (o principal não muda). O título no contas
  a pagar acompanha.
- "Alterar o contrato" refaz as parcelas e só existe enquanto nenhuma
  parcela foi paga. "Excluir" pede o estorno dos pagamentos antes.

LIMITES DESTA ETAPA
- O título da parcela é um só (principal + juros). A separação fica na
  tabela do financiamento e vai para os relatórios (juros como despesa,
  principal como devolução da dívida) quando eles entrarem.
- Juros de mora por atraso são informados na baixa, em Contas a pagar.
- A Price usa a taxa do período padrão; a SAC e o pagamento único
  contam os dias de verdade entre os vencimentos. Diferença de centavos
  para a tabela do banco se acerta no ajuste da parcela.

COMO TESTAR
1. Cadastre um custeio: R$ 100.000,00, 8% ao ano, "Tudo no vencimento",
   vencimento daqui a 1 ano. Confira a tabela e grave.
2. Veja o saldo em Bancos e caixa e o título em Contas a pagar.
3. Um investimento em 5 parcelas anuais, SAC, com a primeira daqui a 2
   anos: teste as duas opções de juros da carência.
4. Consultar › toque numa parcela › informe uma variação monetária.

## Versão V92 (Plano de contas nos bastidores e Despesa sem estoque em Compras)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo no app.

A ideia: o sistema é gerencial. Quem opera não escolhe conta contábil em
tela nenhuma. O sistema classifica sozinho, pela origem do lançamento, e
o plano de contas fica só como a estrutura que agrupa os relatórios.

1. Compras › Despesa (sem estoque)
Onde: Financeiro › Compras. No alto, "O que você está lançando":
Produtos (estoque) ou Despesa (sem estoque).
- Despesa é o que não entra no estoque: energia, serviço, manutenção,
  contador, seguro, imposto, frete de venda etc.
- Pede só: de quem, o que é (lista em linguagem do dia a dia), valor,
  data e nº do documento. O "Detalhe" é opcional.
- Para onde vai: em branco fica como despesa geral da fazenda. Para
  apontar um talhão ou lote, ou dividir entre vários, toque em
  "+ Talhão, lote ou outro centro de custo".
- Pagamento:
  "Já paguei": escolha o caixa ou o banco. Sai na hora, na data da
  despesa, e não fica nada em aberto.
  "A pagar": informe o vencimento (ou as parcelas). Vai para Contas a
  pagar e a baixa é dada lá.
- Foto da conta, boleto ou recibo: a leitura preenche fornecedor, valor,
  data e vencimento para conferência. Nada grava sem o Gravar.
- Memória por fornecedor: escolhido o fornecedor, o sistema sugere o
  tipo de despesa, o centro de custo e a conta de pagamento da última
  despesa dele. É só mudar o que for diferente.
- A despesa ganha número de compra e aparece em Compras › Consultar.
  Para alterar: "Alterar uma despesa já lançada" (ou pelo nº, na tela
  de Produtos: ela abre sozinha na tela certa).
- Excluir uma despesa paga na hora devolve o dinheiro ao caixa/banco.

2. Sem conta do plano nas telas
- Compras de produtos: saiu o campo "Conta do plano de contas". A
  classificação vem da categoria do produto (adubo, defensivo,
  medicamento...). Ficou só o centro de custo.
- Vendas e compra de animais: mesma coisa, saiu o campo.
- Contas a pagar e a receber (título lançado à mão): no lugar da conta,
  "O que é esta conta", na mesma lista do dia a dia. Em Contas a pagar
  aparecem também os que não são despesa: parcela de financiamento,
  adiantamento e retirada do produtor.
- Colheita, secagem, pilagem, armazenagem e contrato de café continuam
  se classificando sozinhos, agora pelo plano novo.

3. Plano de contas novo (5 níveis)
Entrou a planilha "Plano_Contas_Agropecuaria_Caipira_Grau_5_VF", no
lugar do plano antigo: 176 contas, máscara 9.9.99.99.9999. Fica em
Financeiro › Plano de contas, para consultar e ajustar.
O que foi acertado na entrada:
- Os grupos "FAZENDA ......" viraram "TODAS AS FAZENDAS": a fazenda é
  marcada em cada lançamento, não é conta. O relatório separa por
  fazenda ou junta tudo.
- Contas por pessoa ou por banco ("Fulano de Tal", "Banco ....") viraram
  uma conta só de cada grupo: o nome de cada um vem do cadastro de
  pessoas e de Bancos e caixa.
- Código repetido: Sementes e Mudas passou a 1.1.03.01.0003 (o 0002 é
  de Adubos e Fertilizantes).
- Deduções da receita: estavam com o código 3.1.01.09.xxxx e ficaram
  dentro do grupo delas, 3.1.02.01.xxxx.
- Erros de digitação nos nomes (CRÉDITOS, ADMINISTRATIVAS, AGRICULTURA).
- Contas que o sistema precisa e a planilha não tinha (incluídas):
  2.1.01.04.0001 Adiantamentos de Contratos de Café (Venda Futura)
  3.1.01.03.0001 Arrendamento e Aluguel de Pasto Recebidos
  3.1.01.03.0002 Venda de Bens do Imobilizado
  3.1.01.03.0099 Outras Receitas
  4.1.01.01.0008 Serviços de Terceiros na Lavoura
  4.1.01.01.0009 Secagem e Beneficiamento por Terceiros
  4.1.02.01.0008 Seguros
  4.1.02.01.0009 Manutenção de Benfeitorias e Instalações
  4.1.02.01.0099 Outras Despesas
- O que já estava lançado nos testes passou para a conta equivalente.
  O plano antigo ficou guardado no banco (plano_contas_v91).

4. A ponte entre a lista do dia a dia e o plano
Cada item da lista ("Energia elétrica", "Seguros"...) aponta para uma
conta do plano. Essa ligação fica numa tabela do banco
(tipos_lancamento). Por enquanto quem ajusta a lista sou eu, a pedido;
a tela para você mesmo incluir e religar os tipos fica para a próxima
etapa.

O QUE FICOU PARA DEPOIS
- Relatórios gerenciais por conta e por fazenda (resultado, extrato de
  caixa e banco) e o arquivo de exportação para a contabilidade.
- Tela para manter os tipos de despesa.
- "Repetir todo mês" dentro da Despesa (hoje: Contas a pagar › Contínua)
  e a pergunta automática "isto é um bem?" (hoje há o atalho para o
  Imobilizado no fim da tela).

COMO TESTAR
1. Compras › Despesa › fornecedor qualquer, "Energia elétrica", valor,
   "Já paguei", escolha o caixa › Gravar. Confira em Compras ›
   Consultar e o saldo em Bancos e caixa.
2. Lance outra do mesmo fornecedor: o tipo já vem sugerido.
3. Uma despesa "A pagar" em 2 parcelas: confira em Contas a pagar.
4. Uma compra de produto: não pede mais conta.
5. Financeiro › Plano de contas › Consultar › "Ver o plano completo".

## Versão V91 (Achar o talhão no mapa de longe, para desenhar a divisa)
Não mudou nada no banco. Não precisa instalar nada novo.

Onde: Agrícola › Talhões › "Desenhar o contorno no mapa" (e a busca do
mapa das mangas).

1. Busca por distrito e cidade
- Digite, por exemplo, "Boapaba, Colatina" e toque em Buscar. O sistema
  procura em duas bases de mapa e dá preferência à região da fazenda.
- Achando mais de um lugar, mostra a lista: toque no certo.
- Se o distrito não está cadastrado em nenhuma base, o mapa não fica
  mais parado: vai para a cidade e avisa. Daí é arrastar até a fazenda
  ou usar as coordenadas (item 2).

2. Busca por coordenadas (o jeito mais certo, de qualquer lugar)
- No Google Maps, ache a fazenda, segure o dedo em cima do talhão e
  copie os dois números que aparecem (ex.: -19.5321, -40.6312).
- Cole na busca: o mapa vai direto ao ponto e marca com um ponto
  vermelho.
- Aceita também graus, minutos e segundos (19°31'55"S 40°37'52"O), as
  coordenadas do CAR ou da escritura e o link comprido do Google Maps.
  Link curto (maps.app.goo.gl) não traz as coordenadas.

3. Imagem para achar as divisas
- A foto de satélite agora vem com os nomes dos lugares e as estradas
  por cima (liga e desliga em "Nomes e estradas", no canto do mapa).
- Chegando bem perto, a foto não fica mais em branco: amplia a última
  imagem que existe. Em "Satélite (mais detalhe)" aparece a imagem mais
  fina, onde ela existe.
- Régua de escala no canto de baixo.

4. Ao abrir o desenho de um talhão sem contorno, o mapa já vai para a
   região da fazenda (o ponto gravado em Clima e chuva), não mais para
   onde o celular está. O botão da mira continua indo para o GPS.

O botão "?" ao lado da busca traz esse passo a passo.

## Versão V90 (Agricultura inteligente – satélite: vigor da lavoura por talhão)
O banco e a função "satelite" no Supabase JÁ ESTÃO ATUALIZADOS. Não
precisa instalar nada novo no app.

ANTES DE USAR (uma vez só) – as chaves do Copernicus
1. Entre em https://shapps.dataspace.copernicus.eu/dashboard/ com a
   conta do Copernicus.
2. "User settings" › quadro "OAuth clients" › "Create". Dê um nome
   (ex.: Fazenda Digital) e crie.
3. Aparecem o Client ID e o Client secret. COPIE O SECRET NA HORA: ele
   só aparece uma vez.
4. No Supabase (projeto fazenda-digital) › Edge Functions › Secrets,
   crie dois secrets, como foi feito com a chave da IA:
   COPERNICUS_CLIENT_ID      (o Client ID)
   COPERNICUS_CLIENT_SECRET  (o Client secret)
5. Desenhe o contorno do talhão: Agrícola › Talhões › "Desenhar o
   contorno no mapa". Sem o contorno, o satélite não sabe onde olhar.

Onde: Agrícola › Talhões › Consultar › abra o talhão › "Vigor por
satélite".

O que mostra
- Vigor da lavoura (NDVI) na última imagem sem nuvem: o número (0 a 1),
  a faixa (solo exposto, muito baixo, baixo, médio, bom, alto, muito
  alto), a variação para a imagem anterior e o menor e o maior valor
  dentro do talhão.
- Alerta de queda: quando o NDVI cai 0,08 ou mais em relação à média
  das 3 imagens anteriores. Aparece também no painel do talhão.
- "Ver a imagem do talhão": o mapa colorido do talhão naquele dia, com
  a legenda. Cada quadradinho tem 10 metros; mancha mais clara dentro
  do talhão é onde a lavoura está mais fraca.
- Histórico: as últimas 20 passagens, com a barra, o número e a
  variação (quedas de 0,05 ou mais em vermelho). Tocando na data, abre
  a imagem daquele dia.
- Na primeira vez busca os últimos 6 meses (uns 20 segundos). Depois o
  sistema consulta sozinho ao abrir a tela, no máximo uma vez por dia,
  só as passagens novas. "Atualizar agora" consulta na hora.

ATENÇÃO
- Fonte: satélite Sentinel-2 (Copernicus), sem custo, dentro da cota
  gratuita mensal da conta. Passa a cada 5 dias. Com nuvem não há
  leitura: só entram passagens com pelo menos 60% do talhão limpo.
- O NDVI mede o verde e o enfolhamento; não diz a causa. Lavoura nova,
  com muito chão aparecendo, tem NDVI baixo mesmo sadia; mato na rua
  aumenta o número. O que vale é a mudança no tempo e as manchas.
- Redesenhar o contorno apaga o histórico do talhão e busca de novo.

## Versão V89 (Irrigação pelo balanço hídrico e tempo para pulverizar nas Atividades)
Não mudou nada no banco. Não precisa instalar nada novo.

1. Irrigação – Agrícola › Clima e chuva › aba nova "Irrigação"
- Um quadro por talhão: a barra da água no solo (o risco preto é o
  ponto de irrigar), o percentual e os milímetros que o solo ainda tem.
- Talhão irrigado, na hora de irrigar: "Irrigar: X mm", já contando a
  eficiência do sistema (gotejamento 90%, microaspersão e pivô 85%,
  aspersão 75%), com os litros por planta (pelo espaçamento) e os m³ no
  talhão. Se há chuva prevista para os próximos 3 dias, avisa.
- Fora da hora: "Não precisa irrigar agora" e em quantos dias chega ao
  ponto de irrigar, se não chover.
- "Lançar irrigação de X mm": abre Atividades já como Irrigação, com o
  talhão e a lâmina. Confira (ou ponha a lâmina que aplicou de verdade)
  e lance. Ao voltar, a barra já sobe.
- Talhão de sequeiro: só o acompanhamento da água no solo.
- O mesmo quadro aparece no painel do talhão ("Água no solo").

Como a conta é feita
- Todo dia: água no solo = a de ontem + chuva + irrigação − consumo.
- Chuva: a do pluviômetro (aba Chuva); nos dias sem leitura, a estimada.
- Irrigação: a lâmina (mm) das atividades de Irrigação do talhão. Se
  irrigou só parte do talhão, vale na proporção da área.
- Consumo: evapotranspiração de referência x Kc da idade da lavoura
  (0,6 até 1 ano; 0,8 em formação; 1,0 em produção).
- Capacidade de água do solo: pela argila da última análise de solo
  (arenoso 0,6; médio 1,0; argiloso 1,3 mm por cm) x a profundidade das
  raízes (30, 40 ou 50 cm, pela idade). Sem argila na análise: médio.
- Ponto de irrigar: quando o solo perde metade da capacidade.
- A conta começa 60 dias atrás, com o solo cheio.

ATENÇÃO
- É conta simplificada, de apoio à decisão. Só fica certa com as
  irrigações e o pluviômetro lançados em dia: irrigação feita e não
  lançada faz o sistema mandar irrigar de novo.
- No gotejamento a água molha só uma faixa: use a lâmina como
  referência e ajuste pelo que vê na lavoura. Confirme o manejo com o
  técnico responsável.

2. Tempo para pulverizar – Agrícola › Atividades › Lançar
- Em Pulverização (e Capina química), com a data de hoje, amanhã ou
  depois de amanhã, aparece o quadro "Tempo para pulverizar": as janelas
  boas do dia e, informando a hora de Início, se aquela hora é boa (e
  por que não).
- É só aviso: não impede o lançamento. Não aparece em data passada, ao
  alterar uma atividade ou sem internet.

## Versão V88 (Agricultura inteligente – foto da planta: pragas e doenças)
O banco e a IA JÁ ESTÃO ATUALIZADOS (função nova "diagnostico-planta" no
Supabase, usando a mesma chave da IA). Não precisa instalar nada novo.

Onde: Agrícola › Pragas e doenças (Lançar | Consultar) – um ícone só.
Também: painel do talhão › "Pragas e doenças" › botão da foto (abre já
com o talhão escolhido) e as ocorrências em aberto do talhão.

Lançar
1. Data e o talhão (ou a manga).
2. "Foto da planta": até 2 fotos, da câmera ou da galeria. A primeira
   bem de perto da parte com o problema (folha, ramo, fruto); a segunda,
   se quiser, da planta inteira. Pode escrever o que percebeu ("começou
   há 10 dias, nas folhas de baixo"): ajuda a IA.
3. "Analisar com a IA" (uns 15 segundos). Aparece a hipótese: o que é
   (praga, doença, deficiência, dano de clima ou herbicida, ou planta
   sadia), o nome do problema, a confiança da IA, a urgência, o que
   conferir no campo para confirmar e o que mais pode ser.
4. A tela abre preenchida para conferência: o que é, problema,
   severidade, parte da planta, o que foi visto e o que fazer. Corrija o
   que precisar e informe a incidência (% das plantas com o problema:
   olhe umas 20 plantas em zigue-zague e conte; a foto não mostra isso).
5. "Gravar ocorrência". Nada é gravado sozinho.
- Sem foto: é só preencher à mão. Escolhendo o que é, aparecem os
  problemas mais comuns para tocar; aceita digitar outro.
- "Planta sadia" grava a vistoria já como encerrada.

Consultar (só mostra)
- Busca pelo nº, talhão ou problema. Relações: Ocorrências em aberto;
  Em aberto por talhão; Últimas ocorrências.
- Ficha da ocorrência: tudo o que foi lançado, as fotos, "Lançar
  atividade" no talhão (para a pulverização), "Marcar como controlada"
  (ou reabrir) e excluir (só acesso completo).

ATENÇÃO
- É apoio à decisão: foto dá indício, não laudo. A IA pode errar,
  principalmente em sintomas parecidos (deficiências entre si, mancha de
  fungo x queimadura). Por isso ela diz a confiança e o que conferir.
- A IA indica só o grupo do produto, nunca marca nem dose: defensivo é
  com receituário agronômico. Confirme com o agrônomo responsável.
- Custo: poucos centavos de dólar por análise (usa os créditos da IA, os
  mesmos da leitura por foto), só quando você toca em "Analisar".

## Versão V87 (Agricultura inteligente – etapa 2, parte 1: Clima e chuva)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Agrícola › Clima e chuva (Previsão | Chuva | Consultar) – um ícone só.
Também: cartão "Tempo hoje na fazenda" no Início e botão no painel do talhão.

Local da fazenda
- Na primeira vez o sistema usa o centro das áreas desenhadas no mapa;
  sem desenho, o centro do município do cadastro da fazenda. O ponto
  fica gravado na fazenda.
- Estando na fazenda, toque em "Usar onde estou agora (GPS)" na aba
  Previsão: a previsão fica mais certa. Dá para voltar ao centro do
  município.

Previsão
- Agora: temperatura, tempo, máxima e mínima, umidade, vento e a chuva
  de hoje com a chance.
- Alertas: chuva forte (30 mm ou mais no dia), vento forte (rajada de
  50 km/h ou mais), calor forte (34 °C ou mais) e tempo seco (menos de
  10 mm em 15 dias e menos de 5 mm previstos para 7).
- Pulverização: diz se agora está bom para aplicar (e por que não) e as
  janelas boas de hoje e de amanhã, entre 5 h e 20 h. Janela boa: vento
  de 3 a 10 km/h, até 30 °C, umidade do ar de 55% para cima e sem chuva
  na hora e nas 2 horas seguintes. Vale a bula do produto.
- Próximos 7 dias: tempo, chuva em mm com a chance, vento, máxima e
  mínima, e o total de chuva previsto.
- Chuva estimada dos últimos 7, 15 e 30 dias.
- Puxe a tela para baixo para atualizar (o app guarda por 30 minutos).

Chuva (pluviômetro)
- Dia da chuva e milímetros (0 se não choveu). O nome do pluviômetro só
  é preciso se houver mais de um; com mais de um no mesmo dia, o sistema
  usa a média.
- Lançar de novo o mesmo dia pergunta se troca. Últimas leituras, com a
  lixeira para excluir.

Consultar (só mostra)
- Mês (◀ mês ▶): total do pluviômetro e da chuva estimada, dias de chuva
  e o dia a dia das duas, lado a lado.
- Balanço dos últimos 30 dias: chuva (a do pluviômetro nos dias com
  leitura; a estimada nos outros) menos a evapotranspiração de
  referência. Em vermelho quando faltou água; avisa os dias seguidos
  sem chuva.
- Chuva na safra: cada mês desde 1º de setembro; tocando no mês, abre o
  dia a dia.

Atenção
- Fonte: Open-Meteo (modelos de previsão do tempo). Não tem custo, não
  usa chave nem os créditos da IA. Precisa de internet.
- A chuva estimada é a do modelo para o ponto da fazenda: é referência.
  Quem manda é o pluviômetro.
- É previsão: pode errar, principalmente em pancada de verão.

Próximos passos da etapa 2 (a foto da planta foi feita na V88)
- Satélite: imagem e índice de vigor por talhão, com histórico e alerta
  de queda: feito na V90.
- Janela de pulverização dentro da tela de Atividades e irrigação pelo
  balanço hídrico de cada talhão: feitos na V89.

## Versão V86 (Venda futura de café e troca por insumos)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Agrícola › Armazém de café › aba nova "Contratos".

A aba Contratos
- Café em estoque, comprometido em contratos e livre para vender (em
  vermelho se falta café para cumprir os contratos).
- Contratos de preço fixo contra a cotação do dia: quanto estão acima
  ou abaixo.
- Alerta de entrega vencida e de entrega nos próximos 15 dias.
- "+ Novo contrato" e a lista dos contratos; tocando, abre a ficha.

Venda futura
- Contrato: comprador, data, entrega até, espécie e tipo do café,
  safra, sacas, preço fixo por saca ou a fixar na entrega, local de
  entrega.
- Adiantamento (na ficha do contrato, "Receber adiantamento"): data,
  valor e a conta onde entrou. O dinheiro entra no banco como
  ADIANTAMENTO DE CLIENTE (conta nova 2.1.01.005, do passivo), não como
  receita. Fica como título recebido em Contas a receber.
- Entrega: na ficha do contrato, "Entregar café (lançar a venda)". Abre
  Financeiro › Vendas já em Café, com o comprador e o contrato marcados.
  Marque os lotes: as sacas vêm limitadas ao saldo do contrato e o
  preço vem do contrato (a fixar: vem a cotação do dia; confirme o
  preço fechado). Lance o recebimento à vista.
- A receita é reconhecida na entrega. O adiantamento é abatido do valor
  a receber SEM movimentar dinheiro: o título da venda fica baixado na
  parte compensada e só o resto fica em aberto. A tela mostra antes de
  gravar quanto é compensado e quanto fica a receber.
- Entregou tudo: o contrato fica Concluído. "Encerrar com saldo" fecha
  um contrato que não vai ser cumprido inteiro.

Troca por insumos
- Lance primeiro a compra dos insumos em Financeiro › Compras, A PRAZO
  (entra no estoque pelo valor da nota e gera o título a pagar).
- Novo contrato › Troca por insumos: escolha a compra (aparecem as
  compras com valor em aberto). Informe o preço de referência da saca
  (as sacas saem pela conta) ou as sacas combinadas (o preço sai pela
  conta), e a data de entrega.
- Entrega: "Entregar café (lançar a venda)". A venda ao fornecedor sai
  pelo preço da troca; o sistema baixa o título a receber da venda e o
  título a pagar da compra um contra o outro (encontro de contas), sem
  passar pelo banco. Se o café valer mais que a compra, a diferença
  fica a receber.
- O custo do insumo é o valor da nota; a receita do café é da entrega.

Para desfazer
- Entrega lançada errada: Financeiro › Vendas › excluir a venda. A
  compensação é desfeita, o café volta ao armazém e o contrato reabre.
- A baixa de compensação não é estornada em Contas a pagar/receber:
  desfaz-se excluindo a venda da entrega.
- Adiantamento já abatido em entrega não pode ser estornado antes de
  excluir a entrega.
- Contrato sem entrega e sem adiantamento pode ser excluído ou
  cancelado.

Também: a ficha da venda mostra o contrato da entrega; a venda de café
sem contrato continua igual.

## Versão V85 (Custo de mão de obra e de máquina por hora nas Atividades)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

1. Valor da mão de obra – Cadastros › Pessoas
- Em quem é Funcionário ou Parceiro aparece a seção "Mão de obra (custo
  nas atividades)": como é pago (por hora, por diária ou por mês) e o
  valor. O sistema mostra o custo por hora: diária ÷ 8 h, mês ÷ 220 h.
- Para o custo completo, informe o valor já com os encargos.
- Em branco: o trabalho da pessoa não entra no custo.

2. Custo por hora da máquina – Financeiro › Imobilizado
- Em tratores, máquinas, veículos, implementos e equipamentos aparece
  a seção "Custo por hora de uso": consumo (litros/hora), preço do
  litro e manutenção por hora. Custo por hora = consumo x preço +
  manutenção.
- A depreciação NÃO entra aqui: continua pelo rateio mensal do bem,
  para não contar duas vezes.

3. Na atividade – Agrícola › Atividades › Lançar
- Quem fez: cada pessoa aparece com as horas (vêm do horário de início
  e fim; corrija se alguém trabalhou menos ou mais; 8 h = 1 diária) e o
  custo dela.
- Máquina e implemento: horas de máquina x custo por hora dos dois.
- Resumo no fim da tela: Produtos, Mão de obra, Máquinas, Custo da
  atividade e custo por hectare.
- O custo é gravado no lançamento, com os valores do cadastro naquele
  momento. Mudou o valor da diária depois? As atividades já lançadas
  não mudam; para refazer a conta de uma, abra em "Alterar uma
  atividade já lançada" e salve.

4. Onde o custo aparece
- Ficha da atividade (Consultar): custo total, a parte de cada um e o
  custo de cada local.
- Painel do talhão: linhas novas "Mão de obra (atividades)" e
  "Máquinas: combustível e manutenção (atividades)", somadas no custo
  acumulado da safra, por hectare e por saca prevista.
- Safras › resultado da safra e custo por saca de café: a mão de obra
  e as máquinas das atividades entram no custo da lavoura.

ATENÇÃO – para não contar duas vezes
- A mão de obra e a máquina entram no custo do talhão pelas HORAS das
  atividades. Por isso, o salário, as diárias, o diesel e a oficina
  pagos (Compras / Contas a pagar) NÃO devem ser rateados ao centro de
  custo do talhão: lance num centro de custo geral da fazenda. O
  dinheiro sai pelo financeiro; o custo vai para o talhão pela
  atividade.
- A colheita continua na função Colheitas (pagamento por produção):
  não lance os colhedores também como atividade.
- O diesel comprado para o estoque não é baixado pelas horas de
  máquina: o custo por hora usa o preço do litro informado no bem.

## Versão V84 (Lançamento por voz nas Atividades agrícolas)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Agrícola › Atividades › aba Lançar, no quadro "Lançar por voz".

Como usar
1. Toque em "Lançar por voz". Abre um campo de texto com o teclado.
2. Toque no microfone do teclado do iPhone (ao lado da barra de espaço)
   e fale tudo de uma vez. Ex.: "Adubação ontem no talhão 1, 200 gramas
   por planta de 20-00-20, com o trator, das 7 às 11, quem fez foi o
   João".
3. Toque em "Preencher a tela". Em uns 3 segundos a tela de Atividades
   aparece preenchida: o que foi feito, a data, os talhões, os produtos
   com a dose, o horário, a máquina, o implemento e quem fez.
4. Confira, corrija o que precisar e toque em "Lançar atividade".

Regras
- A voz NUNCA grava sozinha: só preenche a tela. Quem grava é o botão
  "Lançar atividade", depois de conferido.
- No alto da tela fica o aviso com o que você falou e o que ficou para
  conferir: o que não foi achado no cadastro (produto, talhão, máquina,
  pessoa) e o que não foi falado.
- A voz só usa o que já está cadastrado; não cria talhão, produto,
  máquina nem pessoa. O que não achar, você escolhe na tela.
- "Todos os talhões" ou "a lavoura toda" marca todos.
- "Hoje", "ontem", "anteontem", "segunda-feira" viram a data certa.
- Produto falado sem dose: vem a dose da última aplicação dele.
- Dose "por planta" (ou "por pé"), "por hectare" ou o total gasto
  ("foram 500 quilos").
- Se o microfone não aparecer no teclado: Ajustes do iPhone › Geral ›
  Teclado › Ativar Ditado.
- Pode também digitar o texto em vez de falar; funciona igual.
- Custo: fração de centavo de dólar por lançamento (usa os créditos da
  IA, os mesmos da leitura por foto).

Próximo passo da voz: levar o mesmo quadro para as outras telas
(Sanidade, Pesagem, Colheita, Compras...).

## Versão V83 (Embalagem de tamanho diferente na compra)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Financeiro › Compras, em cada item de produto.

- Produto comprado em embalagem (saco, frasco, big bag...) mostra o
  campo "Saco desta compra: 50 kg", já com a quantidade do cadastro.
- Veio de outro tamanho? Mude ali. Ex.: cadastro com saco de 50 kg e
  chegaram 10 sacos de 25 kg: digite Qtde. 10 e "Saco desta compra:
  25 kg". O sistema mostra "10 saco = 250 kg. Entra no estoque como
  5 saco de 50 kg".
- O estoque continua contado na embalagem do cadastro (saco de 50 kg)
  e o custo por saco acompanha: o R$ unitário que você digita é o do
  saco que veio (de 25 kg); o custo no estoque fica por saco de 50 kg.
- A compra guarda como veio: no detalhe aparece "veio em 10 saco de
  25 kg", e ao alterar a compra os campos voltam como foram digitados.
- Produto novo cadastrado na própria compra, em embalagem: informe a
  quantidade e a medida ali mesmo; ela fica no cadastro como a
  embalagem padrão, com o consumo na mesma medida.
- Nota por foto ou XML: a conversão aprendida do fornecedor passa a
  considerar o tamanho da embalagem.

## Versão V82 (Unidade de compra com a quantidade e consumo já convertido)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Agrícola › Insumos e estoque (e Medicamentos e vacinas, e o
cadastro de produto novo na Sanidade).

- Unidade de compra: quando é embalagem (saco, frasco, caixa, big bag,
  galão, rolo, unidade, palheta), logo abaixo aparece a quantidade que
  ela tem. Ex.: "Saco: 50 kg". Digite a quantidade e marque a medida
  (kg, g, tonelada, litro, mL, dose, metro, unidade).
- Unidade de consumo: a conversão já aparece calculada, sem digitar.
  Ex.: saco de 50 kg com consumo em kg mostra "1 saco = 50 kg"; com
  consumo em g, "1 saco = 50.000 g"; big bag de 1 tonelada com consumo
  em kg, "1 big bag = 1.000 kg".
- Compra em litro e consumo em mL (ou kg e g, tonelada e kg): também
  sai sozinho ("1 litro = 1.000 mL").
- Só pede para digitar quando não há como calcular. Ex.: frasco de
  50 mL aplicado em dose: "1 frasco (50 mL) tem ___ dose".
- Ao marcar a medida do saco, o consumo já vem na mesma medida; pode
  trocar.
- Os produtos já cadastrados continuam valendo: o que estava como
  "1 sc tem 50 kg" aparece agora como "Saco: 50 kg".
- Na consulta e no quadro do produto: "compra em saco de 50 kg ·
  consumo em kg".

## Versão V81 (Agricultura inteligente – etapa 3: plano de adubação)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Onde: Agrícola › Talhões › Consultar › abra o talhão › abra a análise de
solo › "Montar o plano de adubação".

Montar o plano
- Necessidade do ano (kg/ha): N e K₂O vêm da tabela do conilon, pela
  produtividade esperada e pelo K do solo. O P₂O₅ o sistema não
  calcula: digite se o agrônomo (ou o parecer) recomendou. Os três
  podem ser corrigidos.
- Adubos do plano: marque os adubos do cadastro (aparecem com a fórmula,
  ex.: 20-00-20, o estoque e o custo). O sistema usa primeiro os
  formulados, até o nutriente que fecha primeiro, e completa com os
  simples (ureia, cloreto de potássio…). Mostra kg/ha, g por planta, kg
  no talhão, quanto falta no estoque, o custo no ano e o quanto de cada
  nutriente foi entregue; avisa o que ficou faltando.
- Só entram adubos com a "Garantia química" (N, P, K) preenchida em
  Agrícola › Insumos e estoque e com unidade em kg.
- Parcelamento: 2 a 6 aplicações (vem 3; lavoura irrigada, 4), em partes
  iguais da floração (setembro) à granação (março). Datas e percentuais
  podem ser mudados; a soma tem de dar 100%.
- Calagem: se a análise pedir, "Incluir a calagem no plano" com o
  calcário do cadastro, o PRNT e a data.
- "Gravar o plano".

Acompanhar e executar
- O plano mostra cada aplicação: Programada, Atrasada ou Feita.
- "Lançar esta aplicação" abre a tela de Atividades já com o talhão, os
  produtos e a dose. Confira, ajuste o que foi diferente e lance: a
  atividade baixa o estoque, vai para o custo do talhão e marca a
  aplicação como feita. Excluir a atividade devolve a aplicação para
  programada.
- O painel do talhão mostra o plano e a próxima aplicação (em vermelho
  se estiver atrasada). A análise mostra os planos feitos com ela.

ATENÇÃO: é apoio à decisão. As doses de N e K seguem as tabelas do
Incaper para o conilon no ES; a escolha dos produtos e o parcelamento
são sugestão. Confirme com o agrônomo responsável.

## Versão V80 (Cotação do dia do conilon)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Agrícola › Armazém de café › aba nova "Cotação"
- Conilon hoje: o preço por saca de 60 kg do Centro do Comércio de Café
  de Vitória (tipo 7/8) e da Cooabriel (tipos 7 e 8), com a variação do
  dia. Fonte: site Notícias Agrícolas.
- A cotação entra sozinha nos dias úteis, perto do meio-dia e no fim da
  tarde (o banco busca; não depende do app aberto). "Atualizar agora"
  busca na hora (uns 5 segundos).
- Seu café em estoque: quanto valem as sacas hoje, cada lote pela
  cotação do tipo dele (sem cotação do tipo, pela do tipo 7).
- Últimos fechamentos: os 10 últimos dias, com as quedas em vermelho.
- Cotação da sua praça: "+ Informar a cotação do dia" grava o preço que
  a sua cooperativa ou comprador passou. Na mesma data, a informada
  vale mais que a do site.
- É preço de referência; não tem custo de uso.

Onde a cotação aparece
- Armazém de café › Consultar › Estoque por armazém / por tipo: o
  quanto o estoque vale pela cotação.
- Agrícola › Safras › painel da safra: o estoque da safra pela cotação
  e a "margem por saca se vender hoje" (cotação − custo por saca).
- Financeiro › Vendas › Café: em cada lote, a cotação de referência do
  tipo dele, para comparar com o preço que está vendendo.

## Versão V79 (Venda de café, custo por saca e resultado da safra – etapa 4 do café)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Financeiro › Vendas › Lançar
- "O que está vendendo" ganhou a opção Café.
- Café vendido: aparecem os lotes com saldo em cada armazém. Marque o
  lote, confira as sacas (vêm todas as do lote; se vendeu só uma parte,
  corrija) e informe o preço por saca. Pode vender mais de um lote na
  mesma venda; o preço do primeiro já vem nos outros.
- O resto é igual às outras vendas: comprador, nº da nota, descontos
  na nota (Funrural / Senar em %, comissão, frete), conta (já sugere
  4.1.01.001 Venda de café), rateio e recebimento à vista ou parcelado.
- A venda tira as sacas do lote e do armazém e gera o contas a receber.
  Excluir a venda devolve o café ao armazém.
- Consultar: a venda de café mostra as sacas e o preço por saca; a
  ficha traz os lotes vendidos, o custo por saca de cada lote, a margem
  por saca e o resultado da venda.

Agrícola › Safras › Consultar › painel da safra
- "Custo por saca e resultado": sacas beneficiadas; custo da lavoura
  (insumos aplicados, serviços das compras e exaustão, no período da
  safra), colheita, secagem e pilagem, armazenagem; custo total e por
  saca; sacas vendidas, receita, preço médio líquido, margem por saca,
  resultado das sacas vendidas e o estoque ao custo.
- "Custo por saca de cada talhão": sacas, sc/ha, custo, custo por
  hectare e a margem das sacas vendidas.
- "Vendas do café desta safra".
- Café de outra origem entra na safra informada no lote, pelo custo por
  saca informado.
- Não entram no custo: mão de obra fixa, despesas gerais e juros que
  não estão em centro de custo de talhão.

Outros lugares
- Ficha do lote de café: a saída por venda aparece no extrato (toque
  para abrir a venda).
- Os dois armazéns repetidos ("Armazém 1" e "Armazem 1") foram juntados
  num só no banco.

Ficou para depois
- Venda futura (contrato com entrega depois) e troca por insumos.

## Versão V78 (correção da Entrada no armazém)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Agrícola › Armazém de café › Entrada › "De onde veio o café"
- "Café de outra origem" agora é uma opção da lista (bolinha), junto
  das pilagens, e não mais um link solto.
- Ao marcar, aparecem os campos: De onde veio (obrigatório; ex.: saldo
  da safra 2025, comprado de João), Safra do café e Custo por saca
  (opcionais; o custo vai ser o custo do lote na venda).
- Esses campos podem ser completados depois, em "Alterar ou classificar
  um lote já lançado", mesmo em lote que já teve movimentação.
- A origem aparece na ficha do lote e na consulta.
- Armazém e secador: digitar um nome igual a um já cadastrado (com ou
  sem acento) usa o que existe, em vez de cadastrar outro.

## Versão V77 (Armazém, classificação e estoque – etapa 3 do café)
O banco e a IA JÁ ESTÃO ATUALIZADOS (função nova "ler-classificacao" no
Supabase, usando a mesma chave da IA). Não precisa instalar nada novo.

Agrícola › Armazém de café (Entrada | Movimentar | Consultar) – um ícone só.

Entrada: o café beneficiado vira um lote de café.
- De onde veio: as pilagens com sacas ainda sem armazenar (pode dividir
  uma pilagem em mais de um lote ou armazém) ou "Café de outra origem"
  (estoque que já existia, sem pilagem no sistema).
- Onde ficou: Na fazenda (digite o nome do armazém; cadastra na hora) ou
  Em terceiros (cooperativa ou comprador; o armazém dele é criado
  sozinho).
- Sacas de 60 kg e o nº do romaneio ou recibo de depósito.
- Classificação: 📷 foto do laudo ou romaneio (a IA lê espécie, tipo,
  peneira, umidade, defeitos, impurezas e broca; a tela abre preenchida
  para conferência e a foto fica guardada) ou digitada. Tipo com atalho
  para 6, 6/7, 7, 7/8 e 8. Bebida aparece no arábica.
- Sem laudo na hora: lance assim mesmo e depois use "Alterar ou
  classificar um lote já lançado". Lote que já teve movimentação só muda
  a classificação e o documento.

Movimentar: escolha o lote e o armazém onde ele está.
- Transferir: para outro armazém da fazenda ou de terceiros. O lote
  continua o mesmo, com a mesma classificação.
- Quebra: perda de peso ou diferença de pesagem; sai do estoque.
- Taxa de armazenagem: em R$ (título no Contas a pagar em nome do dono
  do armazém, conta 5.1.02.005 Frete e armazenagem) e/ou em sacas.
- Ajuste: correção de contagem (+ ou −), com motivo; só acesso completo.
- Últimas movimentações, com a lixeira para excluir (o sistema não deixa
  excluir se o café já saiu do armazém de destino).

Consultar (só mostra): nº do lote, armazém, romaneio ou tipo; Estoque
por armazém; Estoque por tipo de café (com o total em sacas e kg e os
lotes sem classificação); Últimos lotes. A ficha do lote traz onde
está, a classificação, a foto do laudo, a pilagem de origem (e por ela
os talhões) e o extrato das movimentações.

Outros lugares
- Secagem e pilagem › Consultar › Onde está o café: o beneficiado agora
  separa o que aguarda entrada no armazém do que já entrou.
- Pilagem que já entrou no armazém não se altera nem se exclui (exclua
  a entrada antes).

## Versão V76 (Secagem e Pilagem – etapa 2 do café)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Agrícola › Secagem e pilagem (Secagem | Pilagem | Consultar) – um ícone só.

Secagem: cada carga do secador.
- Entrada, secador próprio (digite o nome do secador ou terreiro; cadastra
  na hora) ou de terceiro (dono do secador).
- Colheitas que entraram: aparecem as colheitas com café ainda sem secar;
  marque e confira os litros (vêm todos os que faltam; se entrou só uma
  parte, corrija e o resto fica para outra carga). Pode misturar talhões.
- "Já saiu do secador": data de saída, sacas secas (em coco), umidade
  final e horas. Desligado, a carga fica "no secador" e aparece no alto
  da tela com "Dar saída ›" para completar depois.
- Cobrança do terceiro:
  - R$ por saco de cereja: sacos (vêm dos litros e do saco usado nas
    colheitas; pode corrigir) × preço → título no Contas a pagar (conta
    5.1.02.003 Secagem e beneficiamento), rateado pelos talhões.
  - % das sacas secas: as sacas do secador saem do seu saldo, sem
    título. "Valor da saca" é opcional, só para pôr no custo.
  - Lançar depois.
- Secador próprio: custo de lenha, gás, energia e mão de obra (opcional;
  entra no custo por saca, não gera título).
- Resumo: litros por saca seca e as suas sacas.

Pilagem: cada beneficiamento.
- Máquina própria ou de terceiro (quem pilou).
- Café seco que foi pilado: as secagens com sacas ainda sem pilar.
- Resultado: sacas beneficiadas de 60 kg (ou o peso total em kg, que o
  sistema divide por 60) e a palha que sobrou.
- Cobrança do terceiro: R$ por saca beneficiada (título no Contas a
  pagar) ou % das sacas (pagamento em café) ou lançar depois.
- Resumo: renda (sacas em coco por saca beneficiada) e litros de café
  da roça por saca beneficiada.

Consultar (só mostra): nº, secador, quem pilou ou talhão; "Onde está o
café" (aguardando secagem, no secador, seco aguardando pilagem,
beneficiado); últimas secagens e pilagens. As fichas mostram a origem
do café por colheita e por talhão, o rendimento, a cobrança e o custo.

Outros lugares
- Painel da safra: sacas beneficiadas por talhão, % da previsão,
  rendimento e custo de colheita + secagem + pilagem por saca.
- Colheita que já entrou no secador não se altera nem se exclui
  (exclua a secagem antes). O mesmo da secagem para a pilagem.
- Período da safra: o padrão passou a ser 1º de setembro a 31 de
  agosto, para não cortar a colheita no meio. O painel do talhão usa o
  período da safra aberta em Agrícola › Safras (sem safra, o padrão).

## Versão V75 (Safras e Colheita – etapa 1 do café)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Agrícola › Safras (Abrir safra | Consultar)
- Abrir: nome (ex.: Safra 2027), cultura, início e fim previsto (pode mudar) e a
  previsão em sacas beneficiadas de cada talhão (vem da expectativa do
  cadastro do talhão), com o total e as sacas por hectare.
- "Alterar ou encerrar uma safra": pelo número. Encerrar tira a safra dos
  lançamentos de colheita; dá para reabrir. Excluir só sem colheitas.
- Consultar (só mostra): painel da safra com previsto, colhido (litros),
  custo da colheita, por talhão e por forma de colheita, e as colheitas.

Agrícola › Colheitas (Lançar | Pagamento | Consultar)
Lançar: uma colheita por talhão e por dia.
- Talhão e safra (a safra aberta que cobre a data já vem; sem nenhuma
  safra aberta, o sistema abre a "Safra AAAA" sozinho).
- Como foi colhido: Manual | Máquina de lona (arrasta a lona, com os
  trabalhadores colhendo e recebendo por produção) | Automotriz.
- Medida: Caixote | Saco | Quilo | Litro, com os litros da medida e o
  preço por medida. O sistema guarda a capacidade e o preço e traz na
  próxima colheita. Tudo é convertido em litros de café da roça, para
  juntar medidas diferentes e calcular o rendimento na pilagem.
  No quilo, vem 1,6 L por kg (aproximado; ajuste para a sua lavoura).
- Colhedores: digite o nome (cadastra na hora se não existir), a
  quantidade do dia e, se for diferente, o preço dele. "Trazer os
  colhedores da última colheita" repete a turma, só faltando as
  quantidades. A tela mostra quanto cada um tem a receber.
- Sem colhedores na lista (diaristas, mensalistas): informe só o total.
- Máquina (lona e automotriz): Própria (máquina do Imobilizado, horas e
  operador) ou De terceiro (dono da máquina e como cobra: por hora, por
  medida colhida ou valor fechado; gera o título no Contas a pagar, no
  centro de custo do talhão; "Lançar depois" não gera nada).
- Resumo: total colhido, litros, produção dos colhedores, serviço de
  máquina, custo por medida e por 1.000 L.
- "Alterar uma colheita já lançada": pelo número; alterar e excluir só
  antes do fechamento do pagamento.

Pagamento: o pagamento por produção fecha por período.
- Produção em aberto: "Fechar até" (dia) e "Dia do pagamento". Aparece
  cada colhedor com os dias trabalhados, a produção, os vales e o valor
  a pagar. Dá para desmarcar quem fica para depois.
- "Fechar pagamento": gera um título por colhedor no Contas a pagar
  (conta 5.1.02.001 Mão de obra da colheita), rateado pelos centros de
  custo dos talhões onde ele colheu. A baixa é feita em Financeiro ›
  Contas a pagar, como qualquer conta.
- Vales (adiantamentos): "+ Lançar vale" (quem, data e valor). O vale
  vira um título no Contas a pagar (dê a baixa lá, para sair do caixa ou
  do banco) e é descontado no fechamento. Vale maior que a produção: o
  que sobra fica como saldo devedor e desconta no próximo fechamento.
- Fechamentos feitos: a ficha mostra produção, vales, valor e o título
  de cada colhedor. "Excluir fechamento" devolve tudo para em aberto
  (com pagamento lançado, estorne antes).

Consultar (só mostra): nº, talhão ou colhedor; Últimas colheitas;
Produção por colhedor no mês (◀ mês ▶, com o que está em aberto);
Colhido por talhão no mês. A ficha traz colhedores, máquina e custo.

Outros lugares
- Painel do talhão: nova linha "Colheita" no custo da safra e o botão
  "Lançar colheita neste talhão".
- Contas a pagar: títulos da colheita (serviço de máquina, fechamento e
  vale) não mudam de valor nem se excluem por lá; a ficha do título tem
  o botão para ver a colheita ou o fechamento.

## Versão V74 (Agricultura inteligente – etapa 1: análises de solo e de folha)
O banco e a IA JÁ ESTÃO ATUALIZADOS (função nova "agronomo" no Supabase,
usando a mesma chave da IA). Não precisa instalar nada novo.

Onde: Agrícola › Talhões › Consultar › abra o talhão › "Análises de solo e
foliar".

1. Nova análise (foto do laudo ou digitar)
- 📷 Foto do laudo do laboratório: a IA lê todos os resultados e já
  converte as unidades para o padrão do sistema (K em cmolc vira mg/dm³,
  MO em g/kg vira dag/kg, folha em dag/kg vira g/kg…), dizendo o que
  converteu. Laudo com várias amostras: você escolhe qual é a do talhão.
- A tela abre preenchida para conferência; nada grava sozinho. A foto
  fica guardada.
- Solo: pH, P, K, Ca, Mg, Al, H+Al, SB, CTC efetiva e a pH 7, V%, m%, MO,
  P-rem, S, B, Cu, Fe, Mn, Zn, Na e argila. Folha: N, P, K, Ca, Mg, S, B,
  Cu, Fe, Mn, Zn, com a época da coleta (pré-florada ou granação).

2. Painel da análise (toque na análise)
- Resultados: o que o laudo não trouxe e dá para calcular aparece como
  "(calculado)": SB, CTC, V% e m%. Relação Ca:Mg.
- Folha (conilon): cada nutriente sai como Baixo, Adequado ou Alto, com a
  faixa de referência da época.
- Calagem (conta do sistema): T × (Ve − V) ÷ 100, com a saturação
  esperada pela CTC do solo (80, 70 ou 60%); você informa o PRNT e se é
  em cobertura (metade) ou incorporado. Sai em t/ha e em g por planta.
- Adubação de produção N e K (conilon): pela produtividade esperada (vem
  da previsão do talhão; pode mudar para simular) e pelo K do solo. Sai
  em kg/ha e em g por planta, com as épocas de parcelamento.
- Parecer do agrônomo virtual (IA): classifica cada resultado e explica
  o que fazer: calagem, gesso, N, P, K, micronutrientes, parcelamento,
  alertas e próximos passos. Fica guardado na análise. Custa centavos por
  parecer, só quando você pede.

Referências das contas: Incaper (Prezotti et al., 2007, 5ª aproximação do
ES; Guarçoni, 2017; Partelli et al., 2016). Fósforo, gesso e
micronutrientes do solo vêm só do parecer da IA.
ATENÇÃO: é apoio à decisão. A IA pode errar; confirme com o agrônomo
responsável antes de comprar e aplicar.

Próximas etapas da agricultura inteligente
- Etapa 2 – Lavoura vista de cima: imagem de satélite e índice de vigor
  por talhão, com histórico e alerta de queda; chuva e previsão do tempo.
- Etapa 3 – Plano de adubação: feito na V81.
- Etapa 4 – Foto da planta: a IA aponta praga, doença ou deficiência;
  monitoramento de pragas por talhão.
- Etapa 5 – Irrigação pelo balanço hídrico e lançamento por voz.

## Versão V73 (Compra de bovinos com valor e contas a pagar)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Pecuário › Movimentações › Compra
- A entrada continua igual (lote, quantidade, sexo, categoria, raça, idade,
  ferro, vendedor, peso total, GTA/nota, pesagem). No fim da tela há o
  quadro novo "Valor e pagamento":
  - Como é o preço: Por arroba | Por kg vivo | Por cabeça.
  - Desconto de barriga (% do peso ou kg por cabeça) e Kg da arroba (vem
    30; pode ser outro, ex.: 31,45), como na Venda.
  - Preço e a conta ao vivo, ex.: 1.600 kg ÷ 30 kg = 53,33 @ × R$ 320,00
    = R$ 17.065,60, com o custo por cabeça.
  - Conta do plano de contas, centro de custo, conta bancária prevista e
    pagamento à vista ou em parcelas.
- Com o preço informado, o mesmo "Lançar compra" cria os animais, a
  Compra nº (sequência das Compras) e os títulos no Contas a pagar.
  Precisa do vendedor e, para preço por arroba ou kg, do peso total.
- Preço em branco: só entram os animais, como antes.
- Excluir a entrada (Movimentações › Consultar › Excluir e desfazer)
  apaga também a compra e o contas a pagar dela. Com pagamento lançado,
  estorne antes.

Onde a compra de animais aparece
- Financeiro › Compras › Consultar: junto das outras compras; a ficha
  mostra cabeças, peso, arrobas, preço e custo por cabeça. Ela não se
  altera nem se exclui pela tela de Compras (só pela Movimentação).
- Financeiro › Contas a pagar: os títulos, para pagar normalmente.
- Frete à parte (CT-e) do gado: lance a nota de frete em Compras e
  informe a compra dos animais como transportada; o frete entra no custo.
- Ficha da movimentação: botão "Ver a compra nº" (e "Ver a venda nº" nas
  saídas que vieram de uma venda).

## Versão V72 (Vendas e Contas a receber)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.

Financeiro › Vendas (Lançar | Consultar)
A venda faz tudo num lançamento só: tira os animais do rebanho (ou o
produto do estoque), calcula o valor e gera o contas a receber.
- Venda nº (sequência por fazenda) e data. Venda não se altera: "Excluir
  uma venda já lançada" pelo número e lança de novo. Excluir devolve os
  animais ao rebanho, o produto ao estoque e apaga o contas a receber
  (venda com recebimento lançado precisa do estorno antes).
- O que está vendendo: Animais | Outros produtos e serviços.
- Comprador e nº da nota / GTA.

Animais
- Nº da pesagem + "Puxar dados": traz data, lote, cabeças, peso bruto, kg
  da arroba e o comprador. Se todas as pesadas têm brinco, saem
  exatamente esses animais. Sem pesagem: escolha o lote e a quantidade
  (ou marque animal por animal) e digite o peso.
- Como é o preço: Por arroba | Por kg vivo | Por cabeça.
- Desconto de barriga (arroba e kg): Sem desconto | % do peso | kg por
  cabeça. O peso para a conta é o bruto menos a barriga.
- Kg da arroba (vem 30): 30 kg = boi em pé a 50% de rendimento (15 kg de
  carcaça). Pode ser outro, ex.: 31,45 (já desconta barriga). A tela
  mostra o rendimento que o número representa.
- Conta ao vivo, ex.: 4.500 kg brutos − 180 kg de barriga (4%) = 4.320 kg
  ÷ 30 kg = 144 @ × R$ 300,00 = R$ 43.200,00, com a média por cabeça (R$,
  kg e @). Por kg ou por cabeça, mostra a quanto equivale a arroba.
- As arrobas são fechadas com 2 casas antes de multiplicar pelo preço.

Outros produtos e serviços
- Itens: "Serviço / outro" (descrição e valor: sucata, serviço de trator,
  esterco…) ou "Produto do estoque" (quantidade e preço; sai do estoque e
  não deixa vender mais do que tem).
- Venda de café fica para a etapa das Colheitas.

Descontos, classificação e recebimento (os dois tipos)
- "+ Descontos na nota": Funrural / Senar (em % sobre o valor da venda,
  ou em R$), comissão, frete e outros. Só o que o comprador desconta do
  pagamento; o valor a receber é o líquido.
- Conta do plano de contas (venda de animais já sugere 4.1.02.001 Venda
  de bovinos) e rateio por centro de custo (fecha 100%).
- Recebimento: conta prevista, à vista ou a prazo com parcelas editáveis
  (a soma tem de bater com o valor a receber).
- Consultar (só mostra): nº da venda, nº da nota ou comprador; Últimas
  vendas; Vendas do mês (◀ mês ▶) com cabeças, arrobas e valor. A ficha
  traz a conta da venda, os descontos, os títulos e os animais vendidos.

Pecuário › Movimentações
- A "Venda" saiu das Saídas (ficam Morte e Saída parceria): venda de
  animais é só em Financeiro › Vendas. A saída criada pela venda aparece
  na consulta das Movimentações, mas só se desfaz excluindo a venda.

Financeiro › Contas a receber (Lançar | Receber | Consultar)
As mesmas telas do Contas a pagar, do lado do recebimento:
- Lançar: título avulso a receber (arrendamento de pasto, serviço…),
  uma vez, parcelado ou contínuo (todo mês); multa e juros por atraso.
- Receber: vencidos, hoje, 7 e 30 dias; tocando, a baixa: data, valor
  recebido, juros, multa, desconto, em qual conta ou caixa entrou,
  comprovante por foto, recebimento parcial com novo vencimento.
  Master confirma o recebimento lançado por gerente/funcionário; estorno
  com motivo.
- Consultar: contas em aberto, recebimentos do mês, contas contínuas e
  saldo dos bancos e do caixa (agora soma os recebimentos confirmados).
- Título que vem de uma venda: valor e classificação vêm da venda; no
  título mudam o vencimento, os encargos e as observações.

Ainda não entra nesta versão
- Venda de café: fica para a V78 (depois de Secagem, Pilagem e Armazém).
- Valor e contas a pagar da compra de bovinos: feito na V73.

## Versão V71 (Contas a pagar)
O banco JÁ ESTÁ ATUALIZADO. Não precisa instalar nada novo.
No banco há títulos de exemplo ("exemplo" no nome) e duas contas de
exemplo em Bancos e caixa, para testar.

Financeiro › Contas a pagar (Lançar | Pagar | Consultar)
O cartão "Contas a pagar em aberto" do Início abre direto na aba Pagar.

LANÇAR
- Título nº (sequência por fazenda) e data de emissão; "Alterar um título
  já lançado" pelo número.
- 📷 Foto do boleto, da conta de luz/água/telefone ou do recibo: a IA lê
  fornecedor, valor, vencimento, código de barras, multa e juros, e a tela
  abre preenchida para conferência. O mesmo boleto não entra duas vezes.
  Nota de mercadoria continua em Compras (o título sai de lá).
- Fornecedor/credor, descrição e nº do documento.
- "Uma vez / parcelada": valor, nº de parcelas, 1º vencimento e intervalo;
  as parcelas podem ser ajustadas e a soma tem de fechar com o valor.
- "Contínua (todo mês)": energia, internet, salário, aluguel. Entra um
  título por mês, no mesmo dia, com o valor previsto (sempre até o mês que
  vem). Quando a conta do mês chegar, abra o título e corrija o valor.
  Para encerrar: abra o título do último mês › "Encerrar esta conta
  contínua".
- Classificação: conta do plano de contas e rateio por centro de custo
  (tem de fechar 100%).
- Para pagar: conta bancária/caixa prevista, linha digitável, Pix copia e
  cola, multa % e juros % ao mês, "Agendado no banco para" e observações.
- Título que vem de uma compra, ou que já tem pagamento: aqui só mudam o
  vencimento, o boleto, os encargos, o agendamento e as observações.

PAGAR
- Quadro com o total vencido e o que vence em 30 dias; os títulos em
  aberto por grupo: Vencidos, Vencem hoje, Próximos 7 dias, De 8 a 30 dias
  (e um botão para ver depois de 30 dias). Busca por nº, fornecedor,
  descrição ou documento.
- Tocando no título abre a baixa:
  - 📷 Foto ou print do comprovante (boleto pago, Pix, TED, recibo): a IA
    lê data, valor, juros, multa e autenticação. A foto fica guardada.
  - Data do pagamento, valor pago do título, juros, multa e desconto, com
    o total que saiu da conta. Título em atraso com multa/juros
    cadastrados já vem com os encargos calculados pelos dias.
  - De qual conta ou caixa saiu (a lista mostra o saldo de cada uma).
  - Pagou menos que o saldo: é pagamento parcial; pode informar o novo
    vencimento do saldo (o original fica guardado).
  - Linha digitável e Pix aparecem no alto: segure o dedo para copiar.
- Master (dono): o pagamento vale na hora. Gerente/funcionário: o
  pagamento fica "aguardando a confirmação do Master", que vê o quadro
  amarelo no alto da aba e confirma ou rejeita. O saldo do banco só baixa
  com o pagamento confirmado.
- Estorno: busque o título pelo número › "Estornar este pagamento" (pede
  o motivo). Só o Master estorna pagamento confirmado; quem lançou pode
  desfazer enquanto não foi confirmado.

CONSULTAR (só mostra)
- Busca por nº, fornecedor, descrição ou documento. Relações: Contas em
  aberto; Pagamentos do mês (◀ mês ▶); Contas contínuas; Saldo dos bancos
  e do caixa (saldo inicial menos os pagamentos confirmados).
- Ficha do título: todos os dados, classificação, boleto, pagamentos (com
  juros, multa, desconto e situação), foto do documento e do comprovante,
  e o botão para ver a compra de origem.

Compras
- Compra com pagamento lançado (mesmo parcial ou aguardando confirmação)
  não pode mais ser alterada nem excluída: estorne o pagamento antes.
  (Antes só travava com a parcela toda paga.)
- Consulta da compra: a parcela mostra "paga em parte".

Próximas etapas do financeiro
- Vendas e Contas a receber: feito na V72.
- Lançar juros e multas pagos na conta "5.5.01.002 Juros e multas por
  atraso" nos relatórios de resultado.

## Versão V70 (Compras – frete à parte: CT-e / NF de frete)
O banco e a leitura por foto JÁ FORAM ATUALIZADOS. Não precisa instalar nada novo.

Como funciona
- O frete cobrado à parte é uma COMPRA normal, de serviço: fornecedor = a
  transportadora, com contas a pagar, plano de contas e os créditos do
  documento (ICMS e PIS/COFINS, quando o cadastro diz que dá crédito).
- Nela você informa quais compras de mercadoria o frete transportou. O
  custo do frete (valor + outras despesas − desconto − créditos) é rateado
  pelo valor de cada item dessas compras e entra no custo e no estoque
  delas, igual ao frete que vem dentro da nota.
  Ex.: CT-e de 100,00 para a compra nº 12 (itens de 700,00 e 300,00):
  70,00 vai para o primeiro item e 30,00 para o segundo. Com crédito de
  ICMS de 12,00 no documento, o que rateia é 88,00.
- Um CT-e pode transportar várias compras (rateia entre todas, pelo valor)
  e uma compra pode receber mais de um frete.

Financeiro › Compras › Cadastrar
- XML do CT-e (botão "XML (NF-e / CT-e)"): lê transportadora, nº, data,
  valor, ICMS, vencimentos e as notas transportadas, e já aponta as
  compras delas (pela chave da NF-e; se a compra foi digitada à mão, pelo
  nº da nota e o CNPJ do fornecedor). É exato e não gasta a IA.
- Foto do DACTE: a IA lê os mesmos dados (quadro "Documentos originários").
- À mão: logo abaixo do nº da nota, toque em "Esta nota é de frete à
  parte (CT-e)? Informar a compra transportada". Digite o nº da compra e
  "Adicionar", ou escolha nas últimas compras. O quadro mostra quanto do
  frete cada compra recebe. O ICMS do frete vai em "+ Impostos do item".
- Se a compra da mercadoria ainda não foi lançada, o aviso azul diz qual
  nota faltou: lance a mercadoria primeiro e depois o frete.
- A nota de frete só tem itens de serviço (não tem produto de estoque).
- Alterar a compra da mercadoria, alterar o frete ou excluir qualquer um
  dos dois refaz o rateio sozinho.

Consulta da compra
- Mercadoria: cada item mostra o "frete à parte" no custo, e o quadro
  "Frete à parte recebido" traz a compra do frete (toque para abrir).
- Frete: quadro "Frete à parte: compras transportadas", com o valor que
  cada compra recebeu.

Outros lugares
- Painel do Talhão: a nota de frete rateada nas mercadorias não conta de
  novo como despesa do talhão (o custo chega pelo produto, quando aplicado).
- Imobilizado › "Puxar" pelo nº da compra: o valor já vem com o frete à parte.
- Mais: o rodapé voltou a mostrar a versão certa (estava parado em V62).

Atenção
- O que já saiu do estoque antes do frete ser lançado (atividades,
  sanidade) fica com o custo da época; o custo novo vale para o saldo e
  para as próximas saídas. Por isso, lance o frete junto com a nota.

Próximas etapas das Compras
- Câmera nos outros ícones: laudo de solo/foliar no Talhão, certificado
  ABCZ e andrológico na Genética, receita na Sanidade.
- Alerta de estoque mínimo por notificação no celular.

## Versão V69 (limpeza do teste e documentos de compra)
- Os testes de compra de 30/09 foram apagados por completo no Supabase:
  compras, itens, estoque, contas a pagar, fornecedores, produtos e
  vínculos criados pela leitura, fotos das notas e o histórico de
  alterações do banco. Nada ficou.
- Documentos de compra: saiu a opção "por fora". O cadastro tem só os
  documentos desta fazenda e os créditos de cada um.
- Nota em nome de outro destinatário: a leitura pergunta antes de abrir.

## Versão V68 (Compras – composição completa do custo e créditos fiscais)
O banco e a leitura por foto JÁ FORAM ATUALIZADOS. Regra de hoje (antes da
reforma tributária).

Documentos de compra (Mais › Fazendas › quadro do Produtor):
- Cada CPF/CNPJ em nome do qual as notas desta fazenda vêm (o do produtor
  e, se houver, filial), com os créditos que aproveita: ICMS, IPI,
  PIS/COFINS (1,65% e 7,6%).
- Nota em nome de quem não está nessa lista: a leitura para e pergunta
  "Ela não é desta fazenda?" antes de abrir (o padrão é não lançar).

Compra:
- Campos da nota: Frete | Seguro | Outras despesas | Acréscimo financeiro |
  Desconto. Em cada item, "+ Impostos do item": ICMS, IPI, ICMS-ST.
- Valor a pagar = produtos + frete + seguro + outras + acréscimo
  − desconto + IPI + ICMS-ST (o ICMS próprio já está no preço).
- Custo do item = valor + frete + seguro/outras/acréscimo/desconto rateados
  pelo valor + IPI + ICMS-ST − créditos do comprador:
  - ICMS: o ICMS destacado no item;
  - IPI: o IPI do item (sem crédito, o IPI fica no custo);
  - PIS/COFINS: 1,65% + 7,6% sobre o custo de aquisição sem o IPI
    recuperável e sem o ICMS destacado (Lei 14.592/2023).
  Ex. com todos os créditos: item 1.000,00 + frete 50,00 + IPI 50,00 com
  ICMS 120,00 → a pagar 1.100,00; custo 843,97 (créditos ICMS 120,00,
  IPI 50,00, PIS 15,35, COFINS 70,68). Sem créditos: custo 1.100,00.
- O estoque entra pelo custo. A Consulta da compra mostra a composição de
  cada item e o quadro "Créditos a recuperar".
- XML da NF-e: lê destinatário, seguro e ICMS/IPI/ST de cada item. Foto:
  a IA também lê as colunas de impostos e o quadro Cálculo do Imposto.

Frete à parte (CT-e): feito na V70.

## Versão V67 (Compras – frete rateado no custo dos itens)
O banco do Supabase JÁ FOI ATUALIZADO.
- Frete tem campo próprio (antes ia junto em "Frete / outras despesas").
  Os campos agora são: Frete | Outras despesas | Desconto.
- O frete da nota é rateado pelo valor de cada item e vai para o CUSTO do
  item (produto + frete). Outras despesas somam e o desconto abate, também
  rateados pelo valor.
  Ex.: 2 itens de 499,00 + frete 45,00 = cada item 499,00 + 22,50 = 521,50.
  O último item fica com a sobra dos centavos, para fechar com a nota.
- O estoque entra pelo custo (por unidade: custo do item / quantidade).
- Na tela da compra aparece o quadro "Custo de cada item" enquanto você
  digita; na Consulta da compra, cada item mostra o custo e a parte do frete.
- Leitura por foto/XML: o frete lido vai para o campo Frete e o aviso diz
  que foi rateado.
- Compras antigas: o que estava em "outras despesas" foi rateado no custo
  dos itens (sem separar o frete, que não dava para saber).
- Frete cobrado à parte (NF de frete / CT-e): regra ainda a definir.

## Versão V66 (leitura da nota: comprador, itens e modelo mais preciso)
O banco e a leitura por foto JÁ FORAM ATUALIZADOS.
- Comprador: os documentos de compra do produtor vão junto para a IA como
  COMPRADOR e nunca viram fornecedor (antes a IA podia pegar o CNPJ do
  destinatário como se fosse do fornecedor).
- A IA agora confere a nota antes de responder: cada linha da tabela é um
  item (sem repetir), valor total da linha (não o unitário), quantidade x
  unitário, e soma dos itens + frete - desconto = total da nota. Lê o nº com
  os zeros e a chave de acesso (11 grupos de 4 números embaixo do código de
  barras), que é o que identifica a nota com certeza.
- Modelo da IA: passou para o Sonnet (mais preciso em números, cerca de US$ 0,02 por nota, uns
  R$ 0,10 a 0,15). Se não estiver disponível na conta, volta
  sozinho para o Haiku.
- Foto com mais qualidade (0,7).
- Nota repetida: também pergunta quando o fornecedor e o valor total são
  iguais aos de uma compra já gravada (para quando o nº da nota sai diferente
  em outra foto).
Dica: enquadre só a nota, bem reta e ocupando a tela toda; a IA recebe a
imagem reduzida, e números pequenos numa foto de longe se perdem.

## Versão V65 (leitura por foto mais segura: fornecedor, vencimentos, nota repetida)
A leitura por foto JÁ FOI ATUALIZADA no Supabase.
IMPORTANTE: a trava de nota repetida compara com o que está GRAVADO. Ler a
mesma foto duas vezes sem tocar em "Gravar" não é repetição (nada foi
lançado). Para testar: grave a compra e depois leia a mesma nota de novo.

- Fornecedor: o app confere o CNPJ/CPF lido pelos dígitos verificadores.
  Se a IA errar um número, NÃO cadastra fornecedor novo: procura pelo nome
  parecido (uma letra trocada no nome não atrapalha) e avisa para conferir. Se não
  achar, deixa o campo para você escolher.
- Nota repetida nas Compras, já na leitura: pergunta "Nota já lançada?"
  quando existe compra com o mesmo nº de nota do mesmo fornecedor, ou com o
  mesmo nº e o mesmo valor (mesmo que o fornecedor tenha sido lido errado).
  Ao gravar, também confere nº + valor de qualquer fornecedor.
- Vencimentos: as datas lidas do quadro "Fatura/Duplicatas" são sempre
  usadas. Se a soma não bate com a nota, as datas ficam e o valor é dividido
  igualmente, com aviso para conferir. Sem vencimento na nota, fica à vista
  e o aviso diz isso (antes ia para à vista sem avisar).
- A IA foi orientada a ler o CNPJ só do emitente, a data de emissão do campo
  certo e nunca usar a data de emissão como vencimento.

## Versão V64 (Imobilizado – nota repetida bloqueada)
O banco do Supabase JÁ FOI ATUALIZADO.
- A mesma nota não entra duas vezes no Imobilizado. Antes só avisava, e só
  quando a foto pegava a chave inteira.
- A nota é reconhecida pela chave da NF-e ou, se a foto não pegou a chave,
  pelo fornecedor + nº da nota.
- Nota de 1 item (ou cadastrada como "Nota inteira"): a leitura é recusada
  com "Esta nota fiscal já foi cadastrada no bem nº X".
- Nota com vários itens: os já cadastrados vêm com ✓ e não podem ser
  escolhidos de novo; quando todos foram cadastrados, a nota é recusada.
- O banco também confere na hora de gravar (trava dupla).
- Ligação com a Compra: também pelo fornecedor + nº da nota, quando a foto
  não pega a chave.

## Versão V63 (Foto nos outros ícones – etapa 1: Imobilizado)
O banco do Supabase e a leitura por foto JÁ FORAM ATUALIZADOS.
Não precisa instalar nada novo (a câmera já foi instalada na V61).

Financeiro › Imobilizado › Cadastrar – quadro "Entrada pela nota fiscal do bem":
- 📷 Foto da nota (DANFE) ou 📄 XML da NF-e da máquina, veículo, implemento…
- A tela abre preenchida para conferência, nada é gravado sozinho:
  - Nome do bem sugerido (ex.: "Trator John Deere 6100J").
  - Descrição com marca, modelo, ano, nº de série, chassi, placa e renavam
    (o que estiver escrito na nota).
  - Categoria sugerida (trator, implemento, veículo…) e a vida útil dela.
  - Valor do item + a parte do frete e das despesas, menos o desconto.
  - Data de ativação = data da nota; fornecedor pelo CNPJ (cadastrado na
    hora se não existir); nº e série da nota.
- Nota com vários itens: aparece "Qual item da nota é este bem?". Depois de
  cadastrar um, a tela fica com a mesma nota para escolher o próximo (os já
  cadastrados aparecem com ✓). "Nota inteira (um bem só)" serve para uma
  construção comprada em vários itens.
- Se a nota já foi lançada em Compras, o bem fica ligado à compra sozinho.
  Se a nota já foi usada em outro bem, aparece o aviso.
- "Puxar" pelo nº da compra agora traz também a foto e a chave da nota.
- Consulta do bem: mostra a chave da NF-e e o botão "Ver a foto da nota".
  Ao alterar um bem, o link "📷 Ver a foto da nota" aparece no alto.

Próximas etapas da foto nos ícones
- Etapa 2 – Talhão: laudo de análise de solo e foliar.
- Etapa 3 – Genética: certificado de registro ABCZ e exame andrológico.
- Etapa 4 – Sanidade: receita do veterinário.

## Versão V62 (Compras – compra repetida)
O banco do Supabase e a leitura por foto JÁ FORAM ATUALIZADOS.
- A foto agora lê também conta de energia, água e telefone, recibo e boleto.
- Código de barras / linha digitável do pagamento: a IA lê e ele
  identifica o documento (como a chave da NF-e). A mesma fatura não entra
  duas vezes, mesmo sem fornecedor ou CNPJ no papel.
- Ao gravar QUALQUER compra nova (por foto, XML ou digitada), se já existir
  uma compra do mesmo fornecedor com o mesmo nº de documento, ou com a
  mesma data e o mesmo valor, o app pergunta: "Compra repetida? Gravar
  mesmo assim?".

## Versão V61 (Compras – nota fiscal por foto e por XML)
O banco do Supabase JÁ FOI ATUALIZADO e a função de leitura (ler-documento)
já está publicada, com a chave da IA guardada só no servidor.

ANTES DE INSTALAR (uma vez só), com o Expo parado, em C:\FAZENDA_DIGITAL\app:
   npx expo install expo-image-picker expo-document-picker

Financeiro › Compras › Cadastrar – quadro "Entrada pela nota fiscal":
- 📄 XML da NF-e: escolha o arquivo .xml que vem no e-mail do fornecedor.
  É exato e não gasta a IA. Use sempre que tiver.
- 📷 Foto da nota: tire a foto do DANFE (ou escolha da galeria). A IA lê
  em uns 10 segundos. A foto fica guardada junto da compra.
Os dois abrem a MESMA tela da compra já preenchida para conferência:
- Fornecedor achado pelo CNPJ (se não existir, é cadastrado na hora).
- Nº e série da nota, data de emissão, itens com quantidade, valores,
  lote e validade, frete, desconto e os vencimentos das duplicatas
  (viram as parcelas do contas a pagar, se fecharem com o total).
- Cada item mostra "Na nota: ..." como veio no papel. Na primeira nota de
  um fornecedor você aponta o produto do seu estoque; o sistema APRENDE
  (inclusive a conversão: se a nota vem em KG e o estoque conta em saco,
  corrija a quantidade uma vez) e nas próximas notas o item já vem certo.
- Aviso azul no alto diz o que não foi lido, os itens a apontar e se o
  total da nota não bate com a soma.
- Nota ilegível não trava: abre com o que deu para ler e você completa ou
  tira outra foto.
- Você completa o que não vem no papel: conta do plano, rateio, conta
  bancária e estoque mínimo de produto novo. Nada é gravado sem o seu
  "Gravar compra".
- A mesma NF-e não entra duas vezes (pela chave de acesso, conferida pelo
  dígito verificador).
Consulta da compra: mostra a chave da NF-e e o botão "Ver a foto da nota".

Custo da leitura por foto: fração de centavo de dólar por nota (modelo
Claude Haiku 4.5). O XML não custa nada.

Próximas etapas das Compras
- Etapa 2 – câmera nos outros ícones: NF de máquina no Imobilizado,
  laudo de análise de solo/foliar no Talhão, certificado ABCZ e exame
  andrológico na Genética, receita na Sanidade.
- Etapa 3 – alerta de estoque mínimo por notificação no celular
  (gratuita); WhatsApp depois, se quiser.

## Versão V60 (Atividades – etapa 1 de 4)
O banco do Supabase JÁ FOI ATUALIZADO.

Agrícola › Atividades (Lançar | Consultar)
1. Atividade nº (sequência por fazenda) e Data (vem hoje); "Alterar uma
   atividade já lançada" pelo número (também dá para excluir).
2. O que foi feito, em botões: Adubação (via solo, foliar, fertirrigação,
   correção do solo), Pulverização (fungicida, inseticida, herbicida,
   nutricional) com o alvo, Capina (manual/roçada, mecânica, química),
   Poda (recepa, esqueletamento, decote, desbrota…), Irrigação (com a
   lâmina em mm), Plantio/replantio e Outra.
3. Onde: toca nos talhões (vários de uma vez, ou "Marcar todos") e, se
   precisar, nas mangas. A área útil e as plantas vêm do cadastro; se
   trabalhou só uma parte, corrige os hectares e tudo acompanha.
4. Produtos (até 6 por aplicação): só aparecem os do tipo certo, com o
   estoque e o custo médio. A dose é por planta, por hectare ou total, em
   g, kg, t, mL ou L. A dose da última aplicação do mesmo produto já vem
   preenchida. O app mostra na hora o total (ex.: 5.714 kg = 114,3 sc),
   o custo e se o estoque vai faltar.
5. Execução: início e fim (passa da meia-noite: 22:00 às 02:00 = 4 h),
   rendimento em ha/h, máquina e implemento (do Imobilizado), horas de
   máquina (vêm do horário; corrige pelo horímetro) e quem fez (busca na
   lista de pessoas ou cadastra na hora como funcionário).
Ao lançar: baixa o estoque ao custo médio, divide o custo entre os
locais pela área trabalhada (com o centro de custo de cada talhão) e,
na poda, grava também no histórico de podas do talhão. Excluir devolve
o estoque.

Consultar (só mostra): nº, talhão, tipo ou produto; relações Últimas
atividades e Produtos aplicados no mês (◀ mês ▶). Tocando, abre a ficha
da atividade com o custo de cada local.

Painel do Talhão
- Nova seção Atividades (as 15 mais recentes) e o botão "Lançar
  atividade neste talhão" (abre já com o talhão marcado).
- Financeiro da safra: "Insumos aplicados (atividades)" entra no custo.
  Das compras rateadas ao talhão, agora só conta a parte de serviços e
  despesas: produto comprado para o estoque vira custo quando é
  aplicado (antes contaria duas vezes).

Decisões para as próximas etapas
- Etapa 2 – custo da mão de obra (valor da diária/hora no cadastro da
  pessoa) e da máquina por hora (combustível e manutenção). A
  depreciação continua pelo rateio mensal do Imobilizado, para não
  lançar duas vezes; as horas já estão sendo registradas desde agora.
- Etapa 3 – lançamento por voz, com a tela de confirmação.
- Etapa 4 – Painel de Irrigação (ligar/desligar e programar a bomba).
  Depende de uma placa controladora no campo; até lá a irrigação é
  lançada como atividade.
- Colheita fica na função Colheitas (produção por talhão), para não
  lançar em dois lugares.

## Versão V59 (Talhões completos)
O banco do Supabase JÁ FOI ATUALIZADO.

Agrícola › Talhões (Cadastrar | Consultar) – tela nova, só para talhões
1. Identificação e localização: nome, área total e área útil plantada
   (ha), perímetro, altitude, face de exposição ao sol (N, NE, L, SE, S,
   SO, O, NO ou plano) e o botão "Desenhar o contorno no mapa" (satélite;
   as outras áreas aparecem de referência; área e perímetro saem do desenho).
2. Cultura: Café Conilon, Café Arábica ou outra; variedade/clone; data do
   plantio (mostra idade e fase: Formação, Produção plena, Lavoura velha);
   espaçamento entre linhas × entre plantas → plantas por hectare e total
   de covas do talhão.
3. Manejo: sequeiro ou irrigada (gotejamento, microaspersão, aspersão,
   pivô); histórico de podas (recepa, esqueletamento, decote, desbrota,
   poda programada de ciclo) – recepa nos últimos 12 meses gera aviso de
   previsão reduzida; histórico de análises de solo (0–20, 20–40, 40–60 cm:
   pH, P, K, Ca, Mg, MO, V%) e foliar (N, P, K, Ca, Mg).
4. Ativo biológico: custo de formação, início da exaustão (1ª safra),
   período em safras e centro de custo do talhão → exaustão mensal,
   acumulada e valor contábil. Ao salvar, cria/atualiza o bem no
   Imobilizado (exaustão, 100% no centro do talhão).
5. Previsão de safra (sacas) digitada, com sacas por hectare.

Consultar (só mostra): nome ou cultura; relação dos talhões com área útil
total. Tocando, abre o PAINEL DO TALHÃO: área útil, plantas, idade/fase,
previsão; financeiro da safra (jul–jun): custo de formação, exaustão
mensal, compras rateadas ao centro de custo do talhão, exaustão da safra,
custo acumulado, custo por hectare e por saca prevista; podas e análises.

## Versão V58 (Plano de contas: grau 1 fixo)
O banco do Supabase JÁ FOI ATUALIZADO.
- Contas de grau 1 (1 Ativo, 2 Passivo, 3 Patrimônio líquido, 4 Receitas,
  5 Despesas…): ficam fixas. Ao abrir, só mostram os dados; não mudam
  nome, código, tipo nem situação, e não podem ser excluídas. A trava
  está também no banco.
- Contas de grau 2, 3 e 4: o nome pode ser alterado (e também código e
  conta de cima, como na V57). Elas sempre precisam de uma conta de cima.

## Versão V57 (Plano de contas: alterar)
O banco do Supabase JÁ FOI ATUALIZADO.

Financeiro › Plano de contas
- Cadastrar: novo campo "Alterar uma conta já cadastrada" (busca por
  código ou nome). Abre a conta com TUDO editável: nome, código, conta de
  cima (mover de grupo), tipo do grupo principal, analítica e ativa.
  Mudando o código ou movendo a conta, as contas de baixo acompanham
  (código e tipo). O sistema não deixa: código repetido, passar do 4º
  nível, analítica com contas embaixo, ou conta com lançamentos virar
  sintética.
- Consultar (só mostra): botão "Ver o plano completo", além da busca por
  nome ou código.

## Versão V56 (padrão 0.000.000.000,00 em todo o sistema)
- TODO campo de número com decimais (pesos, áreas, quantidades, doses,
  percentuais, kg, arrobas, capacidades…) agora põe o ponto a cada 3
  casas enquanto digita: 1234567,5 → 1.234.567,5. Vale também para as
  pesadas da Pesagem.
- Valores gravados voltam ao campo já formatados (12.500,5).
- Textos das consultas que ainda saíam sem ponto de milhar foram
  corrigidos: estoque e estoque mínimo, conteúdo da embalagem, GMD,
  percentuais de parentesco, cabeças por pasto e por lote, contagens da
  IATF e dos indicadores.
- Campos de dinheiro continuam como na V55 (entram pelos centavos).

## Versão V55 (valores em formato de dinheiro)
- Todo campo de valor em R$ agora se formata enquanto digita, como nos
  bancos: os números entram pelos centavos (1 → 0,01 · 123456 → 1.234,56),
  sempre com 2 casas depois da vírgula e ponto a cada 3 casas.
  Onde: Compras (R$ unitário, valor do item, serviço, frete, desconto,
  parcelas), Imobilizado (valor de aquisição), Bancos e caixa (saldo
  inicial; aceita negativo com "-"), Lotes (aluguel pasto e suplemento)
  e Alimentos (R$ por kg).
- Valores que vêm do banco aparecem já formatados (300.000,00).
- Todas as telas de consulta já mostravam R$ 1.234,56; as duas que
  ainda montavam o texto à parte (Dietas) passaram a usar o mesmo padrão.

## Versão V54 (Compras – etapas 2 e 3)
O banco do Supabase JÁ FOI ATUALIZADO.

Etapa 2 – Arquivo de produtos (Agrícola › Insumos e estoque, e Pecuário ›
Medicamentos e vacinas)
- Categorias novas: Sêmen e Peça / manutenção. Unidades novas: caixa,
  big bag, galão, rolo, metro e palheta.
- Identificação: fabricante/marca e código de barras (GTIN).
- Dados técnicos conforme a categoria:
  Adubo: N, P, K, Ca, S, Zn, B e outros micronutrientes.
  Defensivo: princípio ativo, concentração, classe e registro MAPA.
  Semente/muda: cultivar, pureza, germinação e registro MAPA/RENASEM.
  Vacina/medicamento: classe terapêutica (carências já existiam).
  Sêmen: touro, RGN/RGD, raça, grau de sangue, tipo (convencional ou
  sexado), central, iABCZ, MGTe e PTA leite.
  Sal mineral e ração: níveis de garantia. Peça: código e aplicação.
- Estoque mínimo (alerta de reposição) e, no produto já cadastrado,
  custo médio ponderado e último custo (pelas compras com valor).
- Na consulta: grupo (Sanidade, Nutrição, Genética, Agricultura,
  Manutenção), fabricante, dados técnicos, custo médio e ⚠️ REPOR.

Etapa 3 – Financeiro › Imobilizado (Cadastrar | Consultar)
- Bem nº e data de ativação; "Alterar um bem já cadastrado".
- "Veio de uma compra?": digite o nº e puxe valor, data, fornecedor e nota.
- Depreciação (tratores, máquinas, implementos, veículos, benfeitorias,
  cercas, equipamentos) ou Exaustão (lavoura de café, outra perene,
  pastagem plurianual), com o talhão/área.
- Valor, vida útil (anos ou safras; a categoria sugere) e valor residual %.
  O app mostra na hora: quota mensal, acumulado, valor contábil e fim.
- Rateio mensal por centro de custo: obrigatório e tem de fechar 100%.
- Baixa (vendido, sucateado, erradicado) com data e motivo.
- Consultar (só mostra): nome, código ou nº; relações: Bens e valor
  contábil; Depreciação e exaustão do mês (◀ mês ▶) com o total por
  centro de custo e por bem. Ficha do bem com a tabela ano a ano.

## Versão V53 (Compras – etapa 1)
O banco do Supabase JÁ FOI ATUALIZADO.

Financeiro › Compras (Cadastrar | Consultar) – insumos, peças e serviços
(a compra de bovinos continua em Pecuário › Movimentações).
- Compra nº (sequência por fazenda) e Data; "Alterar uma compra já
  cadastrada" pelo número.
- Compras de ENTRADA RÁPIDA da Sanidade aparecem num quadro amarelo:
  toque para completar fornecedor, nota, valores, rateio e pagamento.
- Fornecedor, nº da nota.
- Itens: Produto (vai para o estoque) ou Serviço/outro.
  Produto: busca no cadastro (mostra o estoque) ou cadastra na hora
  (categoria e unidade de compra); quantidade, R$ unitário e valor
  (um calcula o outro), lote do fabricante, validade e estoque mínimo
  (quando o produto ainda não tem).
- Frete/outras despesas, desconto e total.
- Classificação: conta do plano de contas e rateio por centros de custo
  (a soma tem de fechar 100%, senão não grava).
- Pagamento: conta bancária de saída; à vista ou a prazo (nº de parcelas,
  1º vencimento, a cada X dias), com as parcelas editáveis; a soma tem de
  bater com o total.
- Ao gravar: entra no estoque (com lote e validade) e as parcelas vão para
  o contas a pagar. Compra com parcela já paga não pode ser alterada.
- Consultar (só mostra): nº da compra, nº da nota ou fornecedor;
  relações: Últimas compras, Compras a completar e Produtos no estoque
  mínimo (repor).

## Versão V52 (acesso à Visão do Pasto pelas Mangas)
- Pecuário › Mangas (pastos): logo abaixo de Cadastrar | Consultar há o
  item "Visão do Pasto", que abre o mapa e o painel de ocupação.
- Continua também como ícone próprio em Pecuário › Visão do Pasto.

## Versão V51 (Visão do Pasto: mapa e ocupação das mangas)
O banco do Supabase JÁ FOI ATUALIZADO.

Pecuário › Visão do Pasto (ícone novo, ao lado de Mangas)
- Mapa (satélite ou mapa de ruas, OpenStreetMap, sem custo): as mangas
  aparecem pintadas: vermelho = ocupada, verde = em descanso,
  amarelo = vedada ou em transição para agricultura. Cada uma mostra o
  nome, as cabeças e os dias ocupada, ou os dias de descanso.
- Busca por cidade/lugar e botão "onde estou" (GPS do celular).
- Desenhar: escolha a manga (ou digite o nome de uma nova) e toque em
  volta da cerca, ponto a ponto; arraste um ponto para acertar;
  Desfazer e Limpar. A área (ha) e o perímetro saem sozinhos e são
  gravados na manga.
- Painel de ocupação: tabela com Status, Pasto, Área, Destinação, Lote
  atual, Dias ocupado, Dias em descanso e Carga (UA/ha, 1 UA = 450 kg,
  pelo peso médio do lote). Toque no título para ordenar; o padrão
  mostra primeiro os prontos para uso (mais dias de descanso).
  Dias ocupado acima do limite (padrão 10) ficam em vermelho com ⚠️.
- Toque no pasto (no mapa ou na tabela):
  - Vazio: "Entrar com lote de animais" (lista os lotes de outros pastos
    ou sem pasto) e "Vedar este pasto".
  - Ocupado: "Mudar lote de pasto (rotacionar)" com os pastos vazios,
    mais descansados primeiro, e a carga que ficaria.
  - Vedado: "Liberar a vedação".
  - Destinação (Pecuária / Transição agricultura), limites de dias,
    ver/redesenhar no mapa e ficha da manga.
  A mudança é gravada como Movimentação (Troca de manga), com a data.
- Segurar a linha da tabela abre o cadastro da manga.

## Versão V50 (Reprodução)
O banco do Supabase JÁ FOI ATUALIZADO (4 modelos de protocolo de IATF já cadastrados).

Pecuário › Reprodução (Cadastrar | Consultar)
- Cadastrar › Lançamento:
  - Protocolo IATF: IATF nº e D0; modelo (3 manejos, 4 manejos, Novilhas,
    Ressincronização) com a agenda do curral em datas, que pode ser
    ajustada; DG 1 e DG 2; lote e fêmeas. Depois de aberto (ou por
    "Continuar um protocolo já aberto"): marcar cada manejo feito, fêmea
    que perdeu o dispositivo ou saiu, registrar a inseminação em grade
    (touro, sêmen, inseminador, ECC de cada uma) e o DG em grade
    (Prenhe / Vazia).
  - Cobertura / IA / TE: fêmea, tipo (Monta, IA, IATF, TE, FIV), doadora
    (TE/FIV), touro do rebanho ou de fora/central, sêmen convencional ou
    sexado, inseminador, ECC.
  - Diagnóstico (DG): prenhe/vazia, ultrassom/toque, dias de gestação,
    sexagem fetal e previsão de parto.
  - Parto / Aborto e Coleta de embriões (TE/FIV: estruturas/oócitos e
    embriões viáveis).
  - Alerta de parentesco: consanguinidade da cria acima de 6,25%
    (pai x filha, irmãos, meio-irmãos, avô) avisa antes de gravar.
- Consultar (só mostra):
  - Fêmea pelo nº, brinco, nome ou registro: ficha reprodutiva com
    situação, previsão de parto, partos, idade ao 1º parto, IEP, dias
    em aberto, serviços por concepção, genealogia e histórico.
  - Relações: Prenhes e previsão de parto; Servidas aguardando DG;
    Vazias e paridas; Protocolos de IATF (agenda, fêmeas, taxas de
    serviço, concepção e prenhez); Indicadores (12 ou 24 meses) por
    touro, inseminador, protocolo e ECC.

## Versão V49 (Dietas e Alimentos)
O banco do Supabase JÁ FOI ATUALIZADO (17 alimentos de tabela já cadastrados).

Pecuário › Dietas (Cadastrar | Consultar)
- Dieta nº e Data no topo; "Alterar uma dieta já cadastrada".
- Rebanho: Aptidão (Corte, Leite, Genética), Lote (traz cabeças, peso
  médio e escore do lote), descrição, cabeças, peso vivo, escore.
  Corte: meta de ganho (GMD). Leite: L/dia, % gordura, DEL.
  Genética: Receptoras, Doadoras ou Touros.
- Consumo de MS: Leite pela equação do NRC 2001; Corte e Genética pelo
  % do peso vivo (2,3% e 2,0%, pode mudar).
- Metas PB / NDT / FDN mínima (% da MS): referência média que muda com a
  aptidão e o desempenho; o técnico pode alterar.
- Alimentos da dieta: escolha na lista e informe os kg no cocho por
  cabeça. Mostra kg de MS e custo de cada um.
- Balanço: custo/cab/dia e do lote, consumo x estimado, % volumoso,
  custo por kg de MS, eficiência, barras Exigido x Fornecido e alertas
  (FDN baixa, ureia acima de 1% da MS ou 40 g/100 kg PV, PB e NDT
  abaixo da meta, sem mineral, alimento sem preço).
- Ficha do trato: kg de cada alimento por cabeça e para o lote todo;
  botão para enviar por WhatsApp.
- Consultar: número da dieta ou relação das dietas; a ficha só mostra.

Pecuário › Alimentos (Cadastrar | Consultar)
- Nome, tipo, origem dos valores (tabela ou análise própria), MS, PB,
  NDT, FDN e preço por kg. Os valores de tabela são médias: confira e
  informe os preços.

## Versão V48 (Consulta só mostra; origem com condições)
- Lotes › Consultar: tocando num lote, abre a ficha do lote SÓ PARA VER,
  com todos os dados (número, data de criação, saldo de animais, origem
  e condições, pesos, escore, composição, proprietário, manga, mineral,
  alimentação e observações). Não inclui nem altera nada.
- Para alterar um lote: Lotes › Cadastrar › "Alterar um lote já
  cadastrado" › digite o número › Abrir.
- Condição da origem no Cadastrar:
  - Parceria › Engorda: % do Criador, % do Parceiro e % das @ acrescidas.
  - Parceria › Apascentamento: Aluguel do Pasto e do Suplemento (R$ cab/dia).
  - Mineral e Alimentar valem para qualquer origem.

## Versão V47 (Consulta de Lotes)
- Lotes › Consultar ficou só com:
  - o campo para digitar o número do lote (ex.: FC 003, fc3 ou 3);
  - o botão "Relação de lotes com animais ativos": lista os lotes com
    animais, com o total de lotes e de cabeças. Tocando, abre o lote.
- Saíram a sigla, o resumo e o botão de animais sem lote.

## Versão V46 (final do Lote)
O banco do Supabase JÁ FOI ATUALIZADO.

- No final do cadastro do lote, depois das Observações:
  - Engorda: % das @ acrescidas.
  - Aluguel: Pasto (R$ cab/dia) e Suplemento (R$ cab/dia).
  - Mineral: tipo (busca no estoque, mostra o saldo) e kg cab/dia.
  - Alimentar: tipo (busca no estoque: rações) e kg cab/dia.
- Mineral ou alimento que não está cadastrado: digite o nome e cadastre
  na hora; o estoque dele entra depois pelas Compras.

## Versão V45 (Lotes)
O banco do Supabase JÁ FOI ATUALIZADO.

- Lotes › Cadastrar: saíram os avisos que ficavam antes da Composição
  (a sigla só aparece se a fazenda ainda não tiver uma).
- Logo abaixo de Cadastrar | Consultar: Lote nº (sigla + número da
  fazenda, ex.: FC 004) e Data de criação.
- Origem: Compra, Parceria (Apascentamento ou Engorda, com % do Criador
  e % do Parceiro, que somam 100%), Cria (crias da fazenda) e Outra
  (informar qual).
- Peso Bruto Inicial: Total e Médio. Digitando um, o outro é calculado
  pela quantidade de cabeças.
- Escore de Condição Corporal: 1 a 5.
- Peso Bruto Parcial: Data, Total e Médio.
- A "Data de entrada / abertura" virou a Data de criação, lá em cima.

## Versão V44 (alterar animal já cadastrado)
- Animais › Cadastrar: ao digitar um registro (ex.: SCS1) ou um brinco
  que já existe, o app pergunta "Quer alterar o cadastro dele?".
  "Alterar cadastro" abre o animal com os dados para alterar.
- Ao salvar uma alteração, o app pergunta "Confirmar" antes de gravar.

## Versão V43 (nome do animal na Consulta)
- Animal registrado aberto pela Consulta: o Nome do animal vem do
  cadastro. Se o nome completo não estiver gravado, monta pelo nome
  escolhido + Sufixo/Afixo ou pelo registro.
- Animal gravado sem nome: aviso no campo e, na lista da Consulta,
  "Sem nome no cadastro: toque para informar".

## Versão V42 (animal aberto pela Consulta)
- Animal registrado aberto pela Consulta: saiu o "Nome escolhido pelo
  criador". O "Nome do animal" traz o nome completo gravado no cadastro
  (ex.: Maria da Constantino) e pode ser corrigido ali mesmo.

## Versão V41 (Sufixo/Afixo e nome informados à mão)
O banco do Supabase JÁ FOI ATUALIZADO.

- Cadastro de animal registrado: o Sufixo/Afixo vem da Série, mas pode
  ser alterado à mão (animal com outro Sufixo/Afixo). "Usar o da Série"
  desfaz.
- Nome do animal: vem montado (nome escolhido + Sufixo/Afixo), mas pode
  ser digitado à mão. "Voltar para: ..." desfaz.
- Ao abrir um animal pela Consulta: saíram o Sufixo/Afixo, a pergunta
  antes/depois e as observações do Registro (inclusive o nº interno).
  Fica só o registro completo, o nome escolhido e o nome do animal.

## Versão V40 (registro de outro criatório e nome escolhido)
O banco do Supabase JÁ FOI ATUALIZADO.

- "Série Alfabética e RGN/RGD" é um campo só, que já vem com o próximo
  da sua Série (ex.: SCS1) e pode ser alterado:
  - Sua Série: o número é criado pelo sistema.
  - Outra Série (animal de outro criatório): digite o registro dele
    (ex.: ABC123). Se a Série já estiver cadastrada, o Sufixo/Afixo vem
    sozinho; se for nova, digite o Sufixo/Afixo e ela é cadastrada ao salvar.
  - "Voltar para SCS.. (número do sistema)" desfaz a alteração.
- Novo campo "Nome escolhido pelo criador" (ex.: Maria), antes do
  "Nome do animal", que já mostra o nome completo: Maria da Constantino
  (depois) ou da Constantino Maria (antes).

## Versão V39 (animal comprado e nome completo)
- Animal comprado de outro produtor: botão "Animal comprado de outro
  produtor? Informar o registro". Digite a Série e o RGN/RGD dele
  (ex.: ABC123) e o Sufixo/Afixo dele. Se a Série não existir no sistema,
  ela é cadastrada sozinha. O mesmo registro não pode entrar duas vezes.
- Nome do animal: ao sair do campo, o nome já fica completo no próprio
  campo ("Maria da Constantino" ou, com antes, "da Constantino Maria").
  Trocar antes/depois reorganiza o nome.
- Saiu a informação que aparecia embaixo do nome.

## Versão V38 (tela do animal com controle genealógico)
O banco do Supabase JÁ FOI ATUALIZADO.

- Registro: um campo só, "Série Alfabética e RGN/RGD", já com o número
  completo do próximo animal (ex.: SCS1). Sem nome de criador.
- Logo abaixo: Sufixo/Afixo (vem da Série escolhida).
- Saíram: Tipo de registro, Série Alfabética e Sufixo/Afixo separados.
- Pergunta nova: "Sufixo/Afixo antes ou depois do nome?"
  Depois: SCS1 Maria da Constantino. Antes: SCS1 da Constantino Maria.
- Animal comprado já registrado continua com o botão para informar o número.

## Versão V37 (RGN/RGD sempre visível)
- O campo RGN/RGD aparece sempre, logo abaixo do Criador. Com o criador
  escolhido, mostra o próximo número da sequência da série (ex.: 1 (SCS1)).
- Criador não está na lista? Botão "Cadastrar agora" dentro do próprio
  animal: nome, Série Alfabética, Sufixo/Afixo e último RGN/RGD usado.
  Marcando "O criador sou eu", vira o criador padrão das fazendas.
- Banco: cadastrado o criador SCS – da Constantino (produtor), ligado à
  Fazenda Constantino. Sequência começa em SCS1.

## Versão V36 (ordem do registro)
- Animal com controle genealógico, na ordem: Criador › RGN/RGD (criado
  pelo sistema) › Tipo de registro › Série Alfabética e Sufixo/Afixo,
  que vêm do cadastro do criador (não se digitam).
- Lista de criadores mostra "Nome (Série)"; busca por nome ou série.

## Versão V35 (Série e sufixo do produtor)
O banco do Supabase JÁ FOI ATUALIZADO.

- Dados do Produtor (Mais › Fazendas › Consultar › toque no Produtor):
  novo grupo "Criador de gado registrado" com Série Alfabética, Sufixo/
  Afixo e Último RGN/RGD usado. Ao salvar, o produtor vira o criador
  padrão das fazendas que ainda não têm criador.
- Animal com controle genealógico: já abre com a Série do produtor (ou a
  da fazenda), o RGN/RGD do sistema e o Sufixo/Afixo.
- Nome do animal: digitando "Maria", aparece embaixo "Nome completo:
  Maria da Constantino" e o registro SCS1 Maria da Constantino.

## Versão V34 (RGN/RGD)
- Animal com controle genealógico: logo depois da Série Alfabética vem o
  RGN/RGD, criado pelo sistema (próximo da sequência da série, sem limite
  e sem zero à esquerda). Não é mais digitado.
- Só para animal comprado já registrado: botão "Animal comprado já
  registrado? Informar o número". O número não pode repetir na série.
- Ordem: Criador › Série Alfabética | RGN/RGD › Tipo (RGN ou RGD) ›
  Sufixo/Afixo › Nome do animal.

## Versão V33 (Registro do gado com controle genealógico)
O banco do Supabase JÁ FOI ATUALIZADO.

- Série Alfabética aceita de 2 a 5 letras (ex.: SCS). Antes exigia 4
  letras e recusava a SCS.
- RGN/RGD sem limite, também no "Último RGN/RGD usado" do criador.
- Registro sempre = Série + número, sem zero à esquerda: digitou 00001,
  fica SCS1. Nome do animal + Sufixo/Afixo: SCS1 Maria da Constantino.
- Se o nome for digitado já com o sufixo ("Maria da Constantino"), o
  sufixo não se repete.
- Mais › Pessoas (criador): campos agora se chamam Série Alfabética e
  Sufixo/Afixo.

## Versão V32 (Animais)
O banco do Supabase JÁ FOI ATUALIZADO (não precisa rodar nada lá).

- Um ícone só (Pecuário › Animais). No Cadastrar, escolha o tipo:
  "Sem controle genealógico" ou "Com controle genealógico".
- SEM controle genealógico: número (dado pelo sistema), nome, brinco,
  ferro, idade em meses (ou data), sexo, categoria, raça, grau de sangue,
  peso e lote. Filiação continua opcional.
- O número interno agora NUNCA se repete na fazenda, nem de animal
  excluído. Brinco não aceita um já usado na fazenda (mesmo de animal
  vendido ou morto).
- COM controle genealógico: criador → Série Alfabética e Sufixo/Afixo
  aparecem sozinhos; RGN ou RGD (em branco, o sistema dá o próximo da
  sequência do criador, agora SEM LIMITE de 99.999); nome; data de
  nascimento; sexo; raça; grau de sangue; concepção (Monta natural, IA,
  IATF, TE, FIV); pelagem (lembra o que já foi digitado); peso ao nascer;
  peso atual; CE (só machos).
- Genealogia: digite a Série + RGN da mãe e do pai (ex.: CSC123). Se
  estiver no cadastro, liga e puxa os avós do cadastro dela/dele; se não
  estiver, fica como informado e você digita os avós.
- DEPs: espaço reservado; entram com o cadastro de DEPs.
- Consulta: acha também pela Série + RGN (com ou sem espaço) e mostra o
  registro completo.

## Versão V31 (Mangas)
O banco do Supabase JÁ FOI ATUALIZADO (não precisa rodar nada lá).

- Cadastro da manga ganhou três grupos novos:
  - Uso e produção: indicação de uso (Corte, Leite, Cria, Recria...;
    o que for digitado fica guardado e aparece na próxima), GMD potencial
    (kg/dia), biomassa (kg MS/ha), data da análise do solo e capacidade
    nas águas e na seca, agora em UA/ha (com decimais).
  - Manejo do pasto: altura de entrada e de saída (cm), período de
    descanso (dias) e topografia (Plana, Suave ondulada, Ondulada, Forte
    ondulada, Montanhosa).
  - Bebedouros, cochos e cercas: toque em "+ Bebedouro", "+ Cocho de sal",
    "+ Cocho de alimentação" ou "+ Cerca" (pode ter mais de um de cada).
    Bebedouro: tipo e data da limpeza. Cocho de sal: tipo, com cobertura,
    capacidade (kg), data do abastecimento, insumo e quantidade. Cocho de
    alimentação: tipo, capacidade de animais, data do abastecimento,
    alimento e quantidade. Cerca: tipo, data da manutenção e serviço.
- Tipos, insumos, alimentos e serviços lembram o que já foi digitado:
  ao tocar no campo aparecem as opções para escolher.
- Limpezas, abastecimentos e manutenções formam um HISTÓRICO: registrar
  um novo não apaga os anteriores.
- Consulta de Mangas: busca também pelo uso; cada manga mostra capim, uso,
  topografia, capacidade em UA/ha e animais agora. Tocando, abre a FICHA
  DA MANGA: todos os dados, a capacidade total em UA (UA/ha x área), cada
  estrutura com o último manejo e o botão "+ Lançar limpeza /
  abastecimento / manutenção" (data já vem com hoje), o histórico
  (tocando num registro, dá para excluir) e "Editar cadastro".
- Lotes: a escolha da manga mostra a capacidade em UA/ha.

## Versão V30
- Cadastro de Medicamentos e vacinas refeito:
  - Cada problema aparece em vermelho no próprio campo e, por extenso,
    junto do botão ("Falta corrigir: ..."). Acabou o "confira os campos
    em vermelho" sem nada vermelho.
  - Digitou o nome de um produto já cadastrado: carrega todos os dados e
    mostra o ESTOQUE e a dose recomendada no alto. Botão: "Confirmar
    cadastro" (se falta algo) ou "Confirmar alteração".
  - Depois de salvar, confere no banco que ficou gravado.
- Consulta: cada produto mostra frasco, dose, vias, doenças e estoque.
- Sanidade, na ordem do aplicador: animal ou lote, peso, diagnóstico
  provável. Com o diagnóstico, aparecem os produtos do cadastro indicados
  para ele (dose e estoque); tocando "+ Usar", o produto entra com a dose
  calculada. Se só um for indicado, já entra sozinho no Medicamento 1.
  O aplicador só mexe na dose aplicada se aplicou diferente.
- Avisos de erro da Sanidade também listam cada problema por extenso.

## Versão V29
- Medicamentos e vacinas › Cadastrar: digitou o nome de um produto já
  cadastrado, a tela carrega todos os dados dele. Faltando algo, completa
  e toca "Confirmar cadastro"; já completo, "Confirmar alteração".
  Mudou o nome digitado: a tela volta a ser de cadastro novo.
- Depois de salvar, o app confere no banco se a dose recomendada ficou
  gravada; se não ficou, avisa junto do botão.
- Sanidade: "3. Dose aplicada por cabeça" com campo grande e a unidade
  ao lado ("mL por cabeça").
- Banco: apagados os produtos de teste e as aplicações deles; ficou só o
  Doril (medicamento).

## Versão V28
- Medicamentos e vacinas › Cadastrar: ao digitar o nome, aparecem os já
  cadastrados parecidos. Tocando:
  - em "Completo", abre o cadastro dele com todos os dados;
  - em "Entrada parcial", nome, categoria, volume do frasco e dose vêm do
    cadastro; só se informam data, frascos e fornecedor.
- Via de aplicação: até 2 (ex.: subcutânea ou intramuscular).
- O aviso de erro agora aparece também junto do botão de salvar.
  (Era por isso que a dose "não firmava": havia nome repetido e o aviso
  ficava no alto da tela.)

## Versão V27
- Sanidade: cada medicamento mostra, separado e numerado:
  1. DOSE RECOMENDADA (do cadastro) — ex.: 1 mL para cada 100 kg;
  2. DOSE CALCULADA POR CABEÇA — com a conta; se faltar o peso, avisa;
  3. DOSE APLICADA POR CABEÇA — vem da calculada; se mudar, avisa que
     ficou diferente da calculada.
- Produto sem dose recomendada não é aplicado: só aparece o aviso para
  completar o cadastro. Saiu o "Salvar no cadastro do produto".
- Botão de confirmar da Sanidade: "Aplicado".
- Vacina e medicamento só se cadastram com dose recomendada (Completo ou
  Entrada parcial). Saiu a opção "Só o nome". Na busca, produto antigo sem
  dose aparece com "SEM DOSE RECOMENDADA: complete o cadastro".

## Versão V26
- Entrada parcial também em Pecuário › Medicamentos e vacinas (Cadastrar):
  depois da categoria, "Como cadastrar": Completo | Entrada parcial.
  Mesmos campos da Sanidade; como ali não há animal, um campo de peso
  serve só para conferir a dose calculada (não é gravado).

## Versão V25
- Sanidade › cadastrar produto na hora: nova opção "Entrada parcial"
  (as opções agora são Completo | Entrada parcial | Só o nome).
  Para medicamento comprado às pressas: data da compra, qtde. de frascos,
  volume do frasco (vacina: doses no frasco), dose recomendada (por peso
  ou por cabeça) e a dose calculada na hora; fornecedor opcional.
  Os frascos entram no estoque; fica uma compra "a completar"
  (fornecedor, nota, valor e pagamento se completam em Compras).
- Medicamentos e vacinas (consulta): mostra "compra a completar".
- Banco: já atualizado (função entrada_rapida e situação "a_completar").

## Versão V24
- Sanidade: produto sem dose recomendada TRAVA o medicamento. Só aparece o
  quadro para informar a recomendação e salvar no cadastro; dose aplicada,
  consumo, estoque e reforços só aparecem depois.
- "Baixar do estoque" vem sempre ligado; só desliga se o operador desligar
  (estoque zerado: baixa mesmo assim e avisa que fica negativo).
- A versão instalada aparece no fim da tela Mais ("Fazenda Digital V24").

## Versão V23
- Pecuário › Medicamentos e vacinas: cadastro de insumos já filtrado em
  vacinas e medicamentos (as mensagens da Sanidade apontam para cá).
- Sanidade: produto sem dose recomendada mostra ali mesmo "[1] mL para cada
  [100] kg" (ou por cabeça) e o botão "Salvar no cadastro do produto".
  Sem dose recomendada, a aplicação não é lançada.
- Telas abertas pelo menu são sempre novas e limpas (antes o app podia
  reaproveitar a tela anterior, com os dados dela). O aviso verde do
  lançamento anterior some sozinho em alguns segundos.

## Versão V22
- Insumos: "Unidade de compra (e do estoque)" e "Unidade de consumo (em que
  se aplica)", com "1 frasco tem [100] mL". O estoque fica na de compra
  e mostra o equivalente: "2,55 frasco (255 mL)". Vale para todos os
  insumos (adubo: compra em saco, consumo em kg).
- Dose recomendada escrita como frase: "[1] mL para cada [100] kg de peso
  vivo" ou "[5] mL por cabeça". Não salva com um dos números em branco.
- Sanidade: "Peso para cálculo da dose" logo antes dos medicamentos.
  Cada medicamento mostra sempre: Dose recomendada, Dose calculada por
  cabeça (com a conta, ou o motivo de não calcular) e Dose aplicada (vem
  da calculada; o que for aplicado é o que baixa do estoque).

## Versão V21
- Insumos (uso veterinário): "Unidade da dose" (ex.: mL) e "Quanto tem em
  1 frasco" (ex.: 100 mL), para o estoque em frascos baixar certo.
  Dose por peso vivo: X mL a cada Y kg (ex.: 1 mL a cada 100 kg).
- Sanidade: campo "Peso aproximado" (lote: peso médio por cabeça), sugerido
  pela última pesagem. Mostra "Dose recomendada: 4,5 mL (450 kg ÷ 100 kg
  × 1 mL)" e preenche a dose aplicada. Se aplicou mais ou menos, corrige:
  a dose aplicada é a que baixa do estoque, convertida (45 mL = 0,45 frasco).
  Reforços seguem a mesma conta.
- Reforço: "Aplicado hoje com outra dose" (informa a dose aplicada).

## Versão V20
- Insumos (vacina e medicamento): seção "Uso veterinário" com doenças para
  que serve, princípio ativo, via de aplicação, dose recomendada (por
  cabeça ou a cada X kg de peso vivo), esquema (dose única ou reforços:
  quantos, a cada quantos dias e dose do reforço) e carência para abate
  e leite. Consulta marca "Cadastro incompleto".
- Sanidade › "+ Cadastrar" produto: pergunta "Informar agora" (dados de
  uso ali mesmo) ou "Completar depois" (só o nome, fica incompleto).
- Sanidade: ao escolher o produto, mostra para que serve e a recomendação,
  e já preenche a dose (se for por cabeça) e os reforços. Dá para mudar.
- Botões: rótulo sempre numa linha (o "Descartar" não quebra mais).
- Parte agrícola dos insumos (dose por hectare, carência de colheita):
  fica para a etapa das telas agrícolas.

## Versão V19 (etapa 3: sanidade)
- Pecuário › Sanidade refeita:
  - Lote ou um animal; diagnóstico provável.
  - Até 4 medicamentos por aplicação. Produto: digita, "Ver cadastrados"
    ou cadastra na hora (vacina em dose; demais em mL).
  - Cada medicamento: dose aplicada por cabeça, baixar do estoque,
    dose única ou com reforço.
  - Reforços: quantos; cada um com prazo em dias (mostra a data completa)
    e dose própria (a de ataque pode ser maior). Botões de prazo (3, 7,
    14, 21, 30 dias) preenchem todos; dá para mudar um a um.
  - Consultar: agenda "Reforços a aplicar" (atrasados e próximos 30 dias).
    Tocando: "Aplicado hoje" (com ou sem baixa de estoque) ou abrir a aplicação.
  - Detalhe: cada reforço com situação; tocar marca aplicado ou desfaz.
    Excluir devolve ao estoque tudo o que foi baixado.

## Próximas etapas combinadas
4. Faixas etárias para GTA e faturamento (cadastro do produtor).
5. Alimentação: alimentos e formulações, sal e complemento por manga, capins.

## Versão V18
- Pesagem, Movimentações e Sanidade: barra fixa no rodapé, sempre
  visível, com "Descartar" (pergunta antes) e "Lançar". Se faltar algo,
  o aviso aparece ali mesmo, acima dos botões.
  (Antes o botão ficava no fim da tela e o aviso de erro só no alto;
  por isso as pesagens não eram gravadas.)
- Lotes: "Manga onde está" virou "Manga onde vai/está".

## Versão V16/V17 (etapa 2: genética)
- Pessoas: novo tipo Criador, com SUI (exatamente 4 letras, sem números,
  única), sufixo e último RGN usado (para continuar a numeração do papel).
- Fazendas: "Criador dos nascimentos desta fazenda".
- Movimentações › Nascimento: "Registrar" (ligado quando a fazenda tem
  criador). Cada bezerro recebe o próximo RGN (1 a 99.999, sem zeros à
  esquerda): CSCO1, CSCO2... Esse é o brinco dele para sempre.
- Animais: Criador e RGN. RGN em branco = próximo da sequência; animal
  comprado já registrado: digita o RGN dele. Registro montado sozinho:
  SUI+RGN + nome + sufixo (ex.: CSCO1 Maria da Constantino).
  Depois de registrado, criador, RGN e brinco não mudam (o nome muda,
  e o registro acompanha).

## Versão V15 (etapa 1)
- Morte: escolhe o animal, sem pesagem.
- Campos de número: ao tocar, o que digitar substitui (não junta).
- Sexo diferente do lote: pergunta Alterar ou Confirmar.
- Animal não entra sem idade.

## Versão V14
- Raça e Ferro (Pesagem, Movimentações, Animais e Lotes): campo novo
  que aceita digitar.
  - Digitando, aparecem os cadastrados parecidos.
  - "Ver cadastrados" mostra a lista para escolher (consultar).
  - Se não existir: "+ Cadastrar ..." cria na hora e já escolhe.
    Ferro cadastrado assim entra como ferro de terceiro (ajuste em Mais › Ferros).
- Pessoa (fornecedor, cliente, parceiro): ganhou o "Ver cadastrados";
  quem já é do tipo pedido aparece primeiro.

## Versão V13
- Pesagem: sexo, raça, idade e ferro sempre digitáveis (o lote só
  pré-preenche). Fornecedor, cliente e parceiro ganham o campo
  "Fazenda do ..." (nome da fazenda deles).
- Pesadas: sem sugestão automática do teclado do iPhone.
- Movimentações: trocar ou corrigir o nº da pesagem limpa tudo o que
  tinha sido puxado da anterior (antes misturava as duas).
- Entradas puxam da pesagem também sexo, raça, idade e ferro (para
  conferir na tela). Os animais continuam entrando sem brinco.

## Versão V12
- A pesagem só registra peso: não cria nem altera dados de animais.
  - Com lote: sexo, raça, idade e ferro aparecem como "Dados do lote"
    (os que os animais já têm), sem edição.
  - Sem lote (ex.: gado de terceiro): esses campos só descrevem os
    animais naquela pesagem.
  - Brinco na pesada: liga o peso ao histórico do animal já cadastrado.
    A tela mostra "Animal nº X" ou "Brinco sem cadastro".
- Movimentações: "Puxar dados" traz só dados de pesagem (quantidade,
  peso, data, lote e pessoa). Em compra/entrada, os animais entram sem
  brinco; a identificação é feita depois, no cadastro de cada animal.

## Versão V11
- Pecuário › Pesagens refeita como documento completo:
  - Pesagem nº automático e sequencial por fazenda; data de hoje.
  - Objetivo: compra, venda, parceria, transferência, controle ou outras
    (escrever). O objetivo sugere origem e destino.
  - Origem: fazenda própria, fornecedor, parceiro ou outros.
    Destino: fazenda própria, cliente, parceiro ou outros.
  - Lote, sexo, raça, idade (data ou meses) e ferro; o lote preenche.
  - Peso da arroba bruta: 30 kg, pode alterar.
  - Pesadas: Ord., Brinco, Qtde., Peso bruto e Arrobas. Com brinco, 1
    cabeça. Ao preencher o peso, abre a próxima linha.
  - Totais ao vivo: quantidade, peso bruto, qtde. de arrobas
    (peso ÷ arroba bruta) e arrobas média (arrobas ÷ cabeças).
- Movimentações: campo "Nº da pesagem" + "Puxar dados" (quantidade,
  peso, data, lote, sexo, raça, idade, ferro e a pessoa).
  - Venda/saída em que todas as pesadas têm brinco: saem exatamente
    esses animais.
  - Cada pesagem serve a uma movimentação só.
- Banco: tabelas de pesagem ampliadas; o antigo "romaneio" virou nº da pesagem.

## Versão V10
- Pecuário › Sanidade: abas Lançar | Consultar.
  - Vacina, vermífugo, tratamento ou outro; no lote (com as cabeças
    tratadas, preenchidas pelo lote) ou num animal.
  - Produto vem de Insumos (vacina: categoria Vacina; vermífugo e
    tratamento: Medicamento), com a dose por cabeça na unidade do produto.
  - Mostra o consumo (dose x cabeças) e o estoque; "Baixar do estoque"
    tira o consumo do estoque da fazenda.
  - Reforço: data da próxima aplicação, com botões de 21, 30, 90 dias e 6 meses.
  - Consultar: agenda de próximas aplicações (atrasadas e dos próximos
    30 dias; sai da agenda quando o reforço é lançado) e histórico por
    período e tipo.
  - Excluir devolve ao estoque o que foi baixado (só acesso completo).

## Versão V9
- Pecuário › Pesagens: abas Lançar | Consultar.
  - Romaneio com número sugerido (o próximo livre), data e lote.
  - Animal por animal: aparece a lista do lote, digita o peso de cada um;
    os em branco não entram. Busca por número, brinco ou nome.
  - Em grupo: passadas na balança (cabeças + peso total), para gado sem
    identificação. Lote com mais de 400 cabeças vai direto para grupo.
  - Totais ao vivo: cabeças, média, total em kg e em arrobas de peso vivo.
  - Consultar: por período (90 dias preenchidos) e lote.
  - Detalhe: média, mais leve e mais pesado, comparação com a pesagem
    anterior do lote (ganho e GMD) e, por animal, peso anterior e GMD.
  - Pesagem não se altera: exclui e lança de novo (só acesso completo).

## Versão V8
- Pecuário › Movimentações: abas Lançar | Consultar.
  - Entradas: nascimento (com ou sem mãe), compra, entrada de parceria.
    Criam as cabeças com número interno no lote de destino; o lote sugere
    sexo, categoria, raça, ferro e idade.
  - Saídas: venda, morte, saída de parceria. Mudam a situação dos animais.
  - Transferências: troca de lote (respeita o sexo do lote) e troca de
    manga (o lote inteiro muda de pasto).
  - Saídas e troca de lote: por quantidade (o sistema escolhe primeiro os
    sem brinco, de número mais alto) ou marcando animal por animal.
  - Pessoa (vendedor, comprador, parceiro), GTA/nota e peso total opcional.
  - Consultar: por período, entradas/saídas/transferências e lote.
    Tocando, abre o detalhe com os animais e o botão "Excluir e desfazer".
  - Desfazer só se os animais não tiveram movimentação depois. Só acesso
    completo exclui. Quem tem "só lançamentos" lança todos os tipos.
- Confinamento fica para depois (o banco já aceita).

## Versão V7
- Mais › Usuários e acessos (só o dono): abas Cadastrar | Consultar.
  - Liberação por e-mail: nome, e-mail, perfil (gerente ou funcionário),
    nível (completo ou só lançamentos) e fazendas que a pessoa pode ver.
  - A pessoa cria a conta no app com esse mesmo e-mail e o acesso aparece
    sozinho no primeiro login. Se ela já tiver conta, vale na hora.
  - Editar: perfil, nível, fazendas e "Acesso liberado" (bloquear sem
    apagar o histórico). Liberação ainda não usada pode ser cancelada.
  - O acesso do dono não é alterado por aqui.
- Tela de primeiro acesso: com o sistema já configurado, quem entra sem
  liberação vê "Aguardando liberação", com o botão "Verificar de novo".
- Banco: só o dono altera acessos (antes um gerente com acesso completo
  conseguia mexer na tabela de acessos).

## Versão V6
- Agrícola › Insumos e estoque: abas Cadastrar | Consultar.
  - Nome, categoria (adubo, defensivo, semente ou muda, vacina, medicamento,
    sal mineral, ração, combustível, outro) e unidade de estoque.
  - A unidade é sugerida pela categoria (adubo kg, defensivo L, vacina dose...).
  - Consulta pelo nome, com filtro por categoria e o saldo em estoque
    na fazenda ativa (entradas - saídas + ajustes).
  - Nome repetido é bloqueado; excluir só se nunca foi usado.
- Com isso, todos os cadastros de base estão prontos no padrão
  Cadastrar | Consultar.

## Versão V5
- Financeiro › Bancos e caixa: abas Cadastrar | Consultar.
  - Conta bancária (banco, agência, conta) ou caixa em dinheiro.
  - Fazenda opcional (em branco = serve para todas).
  - Saldo inicial (aceita negativo, ex.: -200,00) com a data do saldo.
- Financeiro › Centros de custo: abas Cadastrar | Consultar.
  - Máscara 99.99.999: fazenda › atividade › talhão, manga ou lote.
  - Botão "Montar centros desta fazenda" (aparece em Consultar quando a
    fazenda ativa ainda não tem centros): cria a fazenda, Lavoura (um por
    talhão ativo), Pecuária (um por lote ativo) e Administração geral.
  - No 2º e 3º nível, o centro pode ser ligado a um talhão, manga ou lote;
    o nome vem dele.
  - Consulta pelo nome ou pelo começo do código ("01" mostra a fazenda toda).
- Plano de contas e centros usam a mesma regra de códigos (lib/codigos.ts).

## Versão V4
- Financeiro › Plano de contas: abas Cadastrar | Consultar.
  - Máscara 9.9.99.999 (4 níveis). Plano modelo já carregado no banco:
    102 contas (Ativo, Passivo, Patrimônio líquido, Receitas, Despesas),
    64 analíticas.
  - Cadastrar: escolha a conta de cima; o tipo vem dela e o código
    sugerido é o próximo número livre. Nível 4 é sempre analítica.
  - Consultar: pelo nome (sem precisar de acento) ou pelo começo do
    código: "4" mostra todas as receitas, "5.1" o custeio da lavoura.
  - Editar: nome, analítica/sintética (quando permitido) e ativa.
    Código e posição não mudam depois de cadastrada.
  - Excluir: bloqueado se a conta agrupa outras ou já tem lançamentos.

## Versão V3
- Mais › Fazendas: abas Cadastrar | Consultar.
  - Cadastro com nome, sigla (sugerida pelo nome), inscrição estadual,
    área total e endereço.
  - Na edição mostra quanto já está cadastrado em mangas e talhões.
  - Fazenda não se exclui (apagaria rebanho e lançamentos): só Ativa/Inativa.
    A última fazenda ativa não pode ser inativada.
  - Sigla repetida entre fazendas é bloqueada.
- Consultar Fazendas mostra no alto o quadro do Produtor; tocando nele,
  abre os dados do produtor (nome, CPF/CNPJ, e-mail, telefone).

## Versão V2
- Pessoas, Mangas, Talhões, Lotes, Raças e Ferros abrem nas abas
  Cadastrar (formulário primeiro) e Consultar (busca, sem listar tudo).
- A consulta mostra os totais no alto (ex.: mangas ativas e hectares,
  lotes ativos e cabeças) e busca enquanto você digita.
  - Pessoas: nome, nome fantasia ou CPF/CNPJ (com ou sem pontos), com filtro por tipo.
  - Lotes: número ("3", "FC 003") ou descrição; lotes encerrados aparecem marcados.
  - Ferros: descrição ou nome do dono.
- Depois de cadastrar, a tela fica pronta para o próximo cadastro, com aviso verde.
- Em Mais, "Raças e ferros" virou dois itens: Raças e Ferros.
- Quadro "Lotes ativos" do Início e "Por lote" em Animais abrem a consulta de lotes.
