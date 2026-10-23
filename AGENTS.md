# Regras do projeto FAZDIG (para programadores e assistentes de IA)

Leia antes de mexer no código. Estas regras foram definidas pelo dono do sistema ao longo das versões V1 a V153.

## Técnica

- App **Expo SDK 57 / React Native / TypeScript**. A navegação é **React Navigation** (`src/navegacao`), **não** Expo Router.
- O Expo muda muito a cada versão: antes de usar uma API do Expo, consulte a documentação da versão do `expo` no `package.json` (https://docs.expo.dev/versions/v57.0.0/). Instale pacotes com `npx expo install <pacote>`.
- O app roda no Expo Go, no navegador (Netlify) e precisa continuar funcionando nos três: iPhone, Android e PC.
- Antes de entregar: `npx tsc --noEmit` sem erros.
- A versão aparece no fim da tela Mais: atualize `VERSAO_APP` em `src/config.ts` a cada entrega.
- Mudança no banco: um arquivo SQL por versão em `supabase/historico-sql/`, que **não apaga nem altera dados**, pode rodar mais de uma vez e termina com uma linha de conferência ("V153 ok | ...").
- Chaves secretas só nos Secrets do Supabase. Nunca no código.

## Filosofia do sistema

- ERP super completo de pecuária e agricultura, **simples de operar**, visual leve, intuitivo e inteligente: o máximo de operação com o mínimo de intervenção do usuário.
- Usar ao máximo dados disponíveis em órgãos públicos ou privados, evitar criar custos (R$) para o produtor e usar as melhores tecnologias.
- Sistema **gerencial, não contábil**: gera os dados por fazenda; a contabilidade apanha os dados exportados.
- O plano de contas é só estrutura de referência: **nenhuma tela pede conta contábil**; o sistema classifica sozinho.

## Estrutura Grupo / fazendas

- O **Produtor (Grupo)** é o tronco; cada **fazenda** é uma filial.
- Compras, vendas, custos e despesas são das fazendas. Ativos e passivos (caixa, bancos, contas a receber/pagar, financiamentos, imobilizado) são do Grupo.
- O resultado é do Grupo, apurado pelos movimentos de cada fazenda. Despesas e receitas da sede entram como **Administrativo**.
- **Particular**: despesas dos sócios (centro de custo no Patrimônio Líquido), identificando o sócio; só Produtor, Administrador e Escritório veem.
- Transferência entre fazendas só move bens e valores.
- Cada fazenda tem dados fiscais próprios para o faturamento.
- Na entrada de saldos já existentes (implantação), a contrapartida vai para o Patrimônio Líquido.
- O rateio só pode ser efetivado uma vez nas contas de resultado.

## Acessos

- Perfis: Produtor, Administrador, Escritório e Gerente de fazenda.
- O gerente **não vê o financeiro** e só vê e alimenta a agenda da sua fazenda.
- O Produtor (e o Administrador) liberam os acessos de cada usuário por caixinhas (agendas e módulos).

## Padrão das telas

- Abas **Cadastrar | Consultar**: formulário primeiro; consulta por busca, sem listar tudo.
- Na Consulta não se inclui nem altera nada; mostra todos os dados do registro.
- Campos que usam cadastros aceitam **digitar** e mantêm a opção de **escolher** os já cadastrados (sugestões a partir de 2 letras).
- Valores em formato monetário brasileiro: 2 casas decimais e ponto a cada 3 casas (1.234,56).
- Entrada por **foto** de documento abre sempre uma **tela de conferência**; nunca lança direto.
- Voltar/sair em todas as telas; letras legíveis no PC.
- Cadastros podem ser alterados e excluídos (a implantação tem testes e erros de lançamento).

## Regras de negócio principais

- **Animais**: registro = Série Alfabética do criador + RGN/RGD sequencial por série (sem zero à esquerda) + nome + sufixo/afixo (antes ou depois do nome). Série+RGN é o brinco para sempre. Animal não é cadastrado sem idade. Guardar todos os pesos; a consulta mostra o último.
- **Pesagem**: nº sequencial por fazenda, arroba bruta padrão 30 kg; só registra peso, não cria nem altera animais.
- **Preço do gado**: por arroba (principal), kg vivo ou cabeça; a arroba pode ter outros kg (ex.: 31,45) e opção de descontar a barriga.
- **Custo das compras**: frete, seguro, outras despesas e acréscimos rateados pelo valor do item; descontos abatem; ICMS/IPI/PIS/COFINS reduzem o custo quando dão crédito (cadastro diz quem tem direito). Frete à parte (CT-e) é rateado nas mercadorias transportadas.
- **Estoque**: unidade de compra com a quantidade da embalagem (ex.: saco de 50 kg) convertida para a unidade de consumo. A saída é **só pela Atividade**; a sobra volta pelo Retorno, pelo nº da atividade.
- **Atividades agrícolas**: plantas = as efetivamente plantadas (não as calculadas pelo espaçamento).
- **Café**: colheita (automotriz, lona ou por produção), secagem e pilagem próprias ou de terceiros (R$ por saco ou % das sacas), armazém, classificação, venda por saca de 60 kg, venda futura (adiantamento é adiantamento de cliente, receita na entrega) e troca por insumos.
- **Financiamentos**: SAC, SPC (parcelas iguais, com valor da parcela obrigatório) e outras; o 1º vencimento informado manda nas seguintes; juros e correção monetária da atualização são só informação (nada gravado nas parcelas).
- **Imobilizado**: código automático com a sigla da fazenda de entrada (ex.: TI 001), mantido na transferência; imobilizado em formação acumula custos até entrar em operação.
- Não há folha de pagamento: só controle de salários, adiantamentos e empréstimo ao funcionário.

## Próximas frentes já decididas

Voz em todas as telas (depois do pente-fino), funcionamento offline, LCDPR, NF-e, GTA, entrada por foto e voz pelo WhatsApp, venda por módulos (financeiro básico e completo).
