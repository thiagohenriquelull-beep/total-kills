# Impacto dos Picks — Sem vs Com Draft

Gerado em: 2026-05-26T21:09:01.523Z
Metodo: walk-forward cross-league, min 30 jogos de treino. Movimento 0.0. Odds 1.80.
Mercado referencia (apostas forcadas): media da liga no treino.
Mercado referencia (filtrado por policy): linha pre-draft do modelo.

## Precisao de Predicao (MAE / RMSE)

| Liga | N | MAE sem picks | MAE com picks | Ganho MAE | RMSE sem | RMSE com |
|---|---:|---:|---:|---:|---:|---:|
| LCK | 150 | 6.82 | 6.69 | **0.13** | 8.56 | 8.45 |
| LCKCL | 270 | 7.29 | 7.13 | **0.15** | 9.25 | 8.99 |
| LPL | 270 | 6.45 | 6.29 | **0.16** | 8.31 | 8.07 |
| CBLOL | 129 | 6.32 | 6.3 | **0.02** | 7.84 | 7.7 |
| LEC | 198 | 6.76 | 6.69 | **0.08** | 8.42 | 8.27 |
| LCS | 108 | 5.89 | 5.74 | **0.15** | 7.24 | 7.07 |
| **TOTAL** | 1125 | 6.69 | 6.56 | **0.12** | 8.45 | 8.26 |

## Acurácia Direcional do Sinal de Picks

P(sign(delta) == sign(actual - prePred)): com que frequencia o delta dos picks
aponta o lado certo do residuo (o que o modelo sem picks nao conseguiu prever).

| Liga | Jogos com delta | Acerto direcional |
|---|---:|---:|
| LCK | 150 | 56.7% |
| LCKCL | 270 | 60.0% |
| LPL | 270 | 57.4% |
| CBLOL | 129 | 51.9% |
| LEC | 198 | 58.1% |
| LCS | 108 | 62.0% |
| **TOTAL** | 1125 | 57.9% |

## ROI: Sem Picks vs Com Picks (Apostas Forcadas, Mercado = Media Liga)

Ambos apostam em toda partida na direcao que o modelo aponta versus a media da liga.
Sem picks: usa predicao times+patch. Com picks: usa predicao times+patch+draft.

| Liga | Bets | Sem picks Hit | Sem picks ROI | Com picks Hit | Com picks ROI | Ganho ROI |
|---|---:|---:|---:|---:|---:|---:|
| LCK | 150 | 54.7% | -1.6% | 58.0% | 4.4% | 6.0% |
| LCKCL | 270 | 51.1% | -8.0% | 57.8% | 4.0% | 12.0% |
| LPL | 270 | 51.5% | -7.3% | 56.3% | 1.3% | 8.7% |
| CBLOL | 129 | 45.7% | -17.7% | 45.7% | -17.7% | 0.0% |
| LEC | 198 | 52.5% | -5.5% | 50.5% | -9.1% | -3.6% |
| LCS | 108 | 48.1% | -13.3% | 53.7% | -3.3% | 10.0% |
| **TOTAL** | 1125 | 51.0% | -8.2% | 54.4% | -2.1% | 6.1% |

## ROI: Com Picks Filtrado por Policy (Mercado = Linha Pre-Draft)

Usa evaluateDraftMarket (mesma logica do app). So aposta quando ha sinal claro.

| Liga | Bets | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|
| LCK | 42 | 69.0% | 24.3% | 10.2 |
| LCKCL | 114 | 63.2% | 13.7% | 15.6 |
| LPL | 106 | 67.9% | 22.3% | 23.6 |
| CBLOL | 0 | - | - | 0 |
| LEC | 76 | 57.9% | 4.2% | 3.2 |
| LCS | 28 | 67.9% | 22.1% | 6.2 |
| **TOTAL** | 366 | 64.5% | 16.1% | 58.8 |

