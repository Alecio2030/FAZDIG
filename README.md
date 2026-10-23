# FAZDIG — Fazenda Digital

Sistema gerencial agropecuário: pecuária, agricultura (com o ciclo completo do café), frota e financeiro, para produtores com várias fazendas. Roda no celular (iPhone e Android) e no computador, pelo navegador.

Versão atual: **V153** (23/10/2026).

## Linguagem e tecnologia

| Parte | Tecnologia |
|---|---|
| Aplicativo (telas) | **TypeScript** com **React Native** e **Expo** (SDK 57); o mesmo código gera o app de celular e o site |
| Navegação | React Navigation (abas embaixo + pilha de telas) |
| Banco de dados, login e arquivos | **Supabase** (PostgreSQL), com as regras de acesso (RLS) no próprio banco |
| Regras de negócio pesadas | Funções em **PL/pgSQL** dentro do banco (chamadas pelo app com `supabase.rpc(...)`) |
| IA, satélite e exportações | Funções na nuvem do Supabase (**Edge Functions**, TypeScript/Deno), na pasta `supabase/functions` |
| Site | Publicado no **Netlify** (fazendadigitalcaipira.netlify.app) |

Para contratar programador, o perfil é: **React Native / Expo com TypeScript + Supabase (PostgreSQL)**.

## Pastas

```
src/
  telas/        telas, separadas por módulo (rebanho, reproducao, agricola, frota, financeiro, cadastros, auth)
  componentes/  peças reaproveitadas (campos, listas, busca, foto, voz...)
  navegacao/    abas, rotas e o mapa de funções de cada módulo (modulos.ts)
  contexto/     sessão do usuário, fazenda em uso e acessos
  lib/          acesso ao Supabase, cálculos e regras do lado do app
  imagens/      imagens usadas nas telas
  tema.ts       cores, letras e espaçamentos
  config.ts     endereço do Supabase e número da versão
supabase/
  functions/        código das funções na nuvem (IA, satélite, contabilidade)
  historico-sql/    arquivos de atualização do banco das versões V130 a V153
docs/
  historico-versoes.md   o LEIA-ME de cada versão entregue
  banco-de-dados.md      mapa do banco (tabelas, funções, agendamentos)
public/   ícones e manifesto do site
assets/   ícones do app
```

## Como rodar (programador)

```bash
npm install
npx expo start            # abre no celular pelo Expo Go (QR code)
npx expo start --web      # abre no navegador
npx tsc --noEmit          # confere os tipos
```

## Como publicar o site

```bash
npx expo export --platform web
```
Depois, no Netlify (aba Deploys), arraste a pasta `dist` gerada.

## Chaves e segredos

- `src/config.ts` só tem o endereço do Supabase e a chave **publicável** (pública por natureza; quem protege os dados são as regras RLS do banco).
- As chaves secretas (**ANTHROPIC_API_KEY**, **COPERNICUS_CLIENT_ID**, **COPERNICUS_CLIENT_SECRET**) ficam só nos *Secrets* do Supabase e **nunca** entram neste repositório.

## Regras de trabalho

As regras de negócio e o padrão das telas estão em [`AGENTS.md`](AGENTS.md). Toda alteração deve respeitá-las.
