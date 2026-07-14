---
name: atualizar-jogos
description: Atualiza o dataset com os jogos novos do gol.gg (coleta, valida, mergeia, testa e regenera analytics). Use quando o usuário pedir para atualizar os jogos, adicionar jogos novos, incluir os jogos do fim de semana, ou rodar a atualização semanal.
---

# Atualização semanal de jogos

O usuário roda isto todo fim de semana. O fluxo inteiro já está automatizado em um comando; o seu papel é executá-lo, conferir o resultado e reportar.

## Procedimento

1. Rode a atualização completa (na raiz do projeto):
   ```
   npm run update
   ```
   Isso executa, em ordem, abortando em qualquer falha:
   - `scripts/collect-new-games-http.js` — coleta do gol.gg até hoje, salva em `data/jogos-novos.json` (dataset intocado);
   - `scripts/merge-new-games.js` — checklist 3.8 (patch, 5 picks/lado, nomes decodificados, zero duplicatas...), backup em `backups/`, merge em `games.json`, regeneração de `games.js`;
   - `npm test` — golden tests do modelo + sanidade do dataset;
   - `scripts/refresh-analytics.js` — cadeia expand → backtest → historical-analysis → check-state.

2. Se aparecer `data/buracos-historicos.json`, reporte ao usuário quantos jogos e de quais ligas/datas — são jogos ANTERIORES à última data de cada liga. NÃO mergeie automaticamente: pergunte. Se o usuário aprovar: `node scripts/merge-new-games.js data/buracos-historicos.json`, depois `npm test` e `npm run refresh` de novo, e apague o arquivo de buracos.

3. Commite o resultado:
   ```
   git add -A && git commit -m "Dataset: +N jogos (coleta ate YYYY-MM-DD)"
   ```

4. Reporte ao usuário: jogos novos por liga, total do dataset antes → depois, patches encontrados, buracos (se houver), e confirmação de que testes e analytics passaram.

## Regras (do PROJETO-CONTEXTO.md — não violar)

- NUNCA edite `games.js`/`games.json` à mão; só via `merge-new-games.js`.
- NUNCA pule a validação ou os testes para "ir mais rápido".
- Se a coleta retornar poucos jogos demais ou jogos inválidos, suspeite do parser (gol.gg pode ter mudado o HTML) — investigue antes de mergear qualquer coisa.
- Nenhuma mudança em `model-core.js` ou nas fórmulas faz parte deste fluxo.
- Se os golden tests falharem após o merge, algo mudou no cálculo do modelo — PARE e investigue; não ajuste os goldens.

## Problemas conhecidos

- gol.gg bloqueia requisições cruas de alguns ambientes; o coletor usa user-agent de browser e retry. Se falhar com HTTP 403/429 consistente, espere alguns minutos e tente de novo.
- O coletor aceita data-limite: `node scripts/collect-new-games-http.js 2026-07-20` (padrão: hoje).
- `--skip-collect` no weekly-update reaproveita um `jogos-novos.json` já coletado.
