# GOL Kills Predictor

Ferramenta local para prever over/under de kills totais por mapa antes do jogo e durante o draft.

## Escopo V1

- Ligas alvo: LCK, LPL, CBLOL, LEC, LCS.
- Entradas reais antes do mapa: liga, patch, dois times, linha da casa e picks conforme o draft avanca.
- Fora do modelo principal: duracao, side blue/red e bans.
- Alvo: `totalKills = killsTeamA + killsTeamB`.

## Modelo V1

```text
previsao =
  media_liga
  + ajuste_patch
  + ajuste_time_A
  + ajuste_time_B
  + ajuste_picks
```

Os ajustes sao encolhidos por amostra para reduzir exageros quando ha poucos jogos.

- Times: comparados contra a media da propria liga.
- Picks: calculados com jogos de todas as ligas alvo, usando residual contra a media da liga do jogo.
- Draft parcial: cada pick conhecido adiciona uma parte proporcional do ajuste do draft completo.

## Arquivos

- `index.html`: interface local.
- `styles.css`: visual da ferramenta.
- `app.js`: motor de previsao e interacao.
- `data/games.js`: dataset carregado pela interface.
- `scripts/gol-browser-collector.js`: coletor para rodar usando a sessao logada do GOL no navegador do Codex.

## Uso

Abra `index.html` no navegador. Se a coleta ainda estiver pequena, a ferramenta funciona como prova de conceito e mostra a cobertura disponivel no topo.

