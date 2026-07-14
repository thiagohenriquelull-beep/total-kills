# Backtest Da Regra Final

Gerado em: 2026-07-14T01:41:21.118Z
Metodo: walk-forward, minimo 30 jogos de treino. Linha simulada = linha pre-draft justa do modelo.
Odds usadas: over 1.80 / under 1.80. Break-even @1.80 = 55.6%.

A regra testada e a mesma do app: EV primeiro, edge como filtro de confianca, e contrarian apenas para odd alta com EV maior.

## Geral

| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Todos | 1411 | 46 | 26 | 20 | 32 | 69.6% | 25.2% | 11.6 |

## Por Liga

| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 194 | 0 | 0 | 0 | 0 | - | - | 0 |
| LCKCL | 308 | 7 | 4 | 3 | 6 | 85.7% | 54.3% | 3.8 |
| LPL | 423 | 31 | 20 | 11 | 22 | 71.0% | 27.7% | 8.6 |
| CBLOL | 143 | 2 | 2 | 0 | 0 | 0.0% | -100.0% | -2 |
| LEC | 216 | 5 | 0 | 5 | 3 | 60.0% | 8.0% | 0.4 |
| LCS | 127 | 1 | 0 | 1 | 1 | 100.0% | 80.0% | 0.8 |

## Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV + edge | 46 | 46 | 26 | 20 | 32 | 69.6% | 25.2% | 11.6 |

## Pass Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV baixo | 1365 | 0 | 0 | 0 | 0 | - | - | 0 |

## Por Lado

| Lado | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| under | 20 | 20 | 0 | 20 | 15 | 75.0% | 35.0% | 7 |
| over | 26 | 26 | 26 | 0 | 17 | 65.4% | 17.7% | 4.6 |

## Observacao

Este teste nao prova odd 3.00 historica, porque nao temos historico real de odds. Ele valida a regra com odds padrao 1.80. As odds altas entram corretamente no app pela formula de EV e precisam ser confirmadas no historico real das apostas registradas.

