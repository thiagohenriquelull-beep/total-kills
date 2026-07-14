# Backtest Da Regra Final

Gerado em: 2026-05-26T09:59:59.291Z
Metodo: walk-forward, minimo 30 jogos de treino. Linha simulada = linha pre-draft justa do modelo.
Odds usadas: over 1.80 / under 1.80. Break-even @1.80 = 55.6%.

A regra testada e a mesma do app: EV primeiro, edge como filtro de confianca, e contrarian apenas para odd alta com EV maior.

## Geral

| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Todos | 1125 | 63 | 44 | 19 | 44 | 69.8% | 25.7% | 16.2 |

## Por Liga

| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 150 | 2 | 0 | 2 | 1 | 50.0% | -10.0% | -0.2 |
| LCKCL | 270 | 20 | 14 | 6 | 15 | 75.0% | 35.0% | 7 |
| LPL | 270 | 29 | 27 | 2 | 20 | 69.0% | 24.1% | 7 |
| CBLOL | 129 | 0 | 0 | 0 | 0 | - | - | 0 |
| LEC | 198 | 12 | 3 | 9 | 8 | 66.7% | 20.0% | 2.4 |
| LCS | 108 | 0 | 0 | 0 | 0 | - | - | 0 |

## Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV + edge | 63 | 63 | 44 | 19 | 44 | 69.8% | 25.7% | 16.2 |

## Pass Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV baixo | 1062 | 0 | 0 | 0 | 0 | - | - | 0 |

## Por Lado

| Lado | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| under | 19 | 19 | 0 | 19 | 13 | 68.4% | 23.2% | 4.4 |
| over | 44 | 44 | 44 | 0 | 31 | 70.5% | 26.8% | 11.8 |

## Observacao

Este teste nao prova odd 3.00 historica, porque nao temos historico real de odds. Ele valida a regra com odds padrao 1.80. As odds altas entram corretamente no app pela formula de EV e precisam ser confirmadas no historico real das apostas registradas.

