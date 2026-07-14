# Backtest Da Regra Final

Gerado em: 2026-06-26T02:13:44.652Z
Metodo: walk-forward, minimo 30 jogos de treino. Linha simulada = linha pre-draft justa do modelo.
Odds usadas: over 1.80 / under 1.80. Break-even @1.80 = 55.6%.

A regra testada e a mesma do app: EV primeiro, edge como filtro de confianca, e contrarian apenas para odd alta com EV maior.

## Geral

| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Todos | 1285 | 33 | 23 | 10 | 20 | 60.6% | 9.1% | 3 |

## Por Liga

| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 194 | 0 | 0 | 0 | 0 | - | - | 0 |
| LCKCL | 285 | 7 | 5 | 2 | 6 | 85.7% | 54.3% | 3.8 |
| LPL | 320 | 18 | 16 | 2 | 10 | 55.6% | 0.0% | 0 |
| CBLOL | 143 | 2 | 2 | 0 | 0 | 0.0% | -100.0% | -2 |
| LEC | 216 | 5 | 0 | 5 | 3 | 60.0% | 8.0% | 0.4 |
| LCS | 127 | 1 | 0 | 1 | 1 | 100.0% | 80.0% | 0.8 |

## Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV + edge | 33 | 33 | 23 | 10 | 20 | 60.6% | 9.1% | 3 |

## Pass Por Motivo

| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EV baixo | 1252 | 0 | 0 | 0 | 0 | - | - | 0 |

## Por Lado

| Lado | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| under | 10 | 10 | 0 | 10 | 7 | 70.0% | 26.0% | 2.6 |
| over | 23 | 23 | 23 | 0 | 13 | 56.5% | 1.7% | 0.4 |

## Observacao

Este teste nao prova odd 3.00 historica, porque nao temos historico real de odds. Ele valida a regra com odds padrao 1.80. As odds altas entram corretamente no app pela formula de EV e precisam ser confirmadas no historico real das apostas registradas.

