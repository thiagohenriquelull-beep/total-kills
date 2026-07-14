# Backtest Ajuste Por Numero Do Mapa

Gerado em: 2026-05-26T22:21:52.181Z
Metodo: walk-forward, minimo 30 jogos de treino. Linha simulada = pre-draft justa do modelo atual. Odds 1.80.

Ajustes testados:
- BO3: mapa 1 -0.25, mapa 2 +0.50, mapa 3 -1.00.
- BO5: mapa 1 0.00, mapa 2 +1.00, mapa 3 +0.25, mapa 4 -0.75, mapa 5 -1.25.

## Cobertura Do Contexto

- Jogos avaliados: 1125
- Jogos com mapa/formato identificado: 859 (76.4%)
- Buckets: BO3 G1=281, BO3 G2=282, BO3 G3=112, unknown=266, BO5 G1=41, BO5 G2=41, BO5 G3=41, BO5 G4=41, BO5 G5=20

## Comparacao Geral

| Variante | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 1125 | 60 | 43 | 17 | 43 | 71.7% | 29.0% | 17.4 | 6.4699 | -0.1821 |
| map-25pct | 1125 | 65 | 43 | 22 | 43 | 66.1% | 19.1% (-9.9%) | 12.4 | 6.4588 (-0.01) | -0.1923 |
| map-50pct | 1125 | 66 | 44 | 22 | 46 | 69.7% | 25.4% (-3.5%) | 16.8 | 6.4492 (-0.02) | -0.2025 |
| map-75pct | 1125 | 85 | 57 | 28 | 57 | 67.1% | 20.7% (-8.3%) | 17.6 | 6.4416 (-0.03) | -0.2126 |
| map-100pct | 1125 | 112 | 69 | 43 | 74 | 66.1% | 18.9% (-10.1%) | 21.2 | 6.4361 (-0.03) | -0.2228 |
| map-125pct | 1125 | 140 | 83 | 57 | 93 | 66.4% | 19.6% (-9.4%) | 27.4 | 6.4325 (-0.04) | -0.233 |

## Apenas Jogos Com Mapa Identificado

| Variante | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 859 | 59 | 42 | 17 | 42 | 71.2% | 28.1% | 16.6 | 6.5456 | -0.105 |
| map-25pct | 859 | 64 | 42 | 22 | 42 | 65.6% | 18.1% (-10.0%) | 11.6 | 6.5311 (-0.01) | -0.1183 |
| map-50pct | 859 | 65 | 43 | 22 | 45 | 69.2% | 24.6% (-3.5%) | 16 | 6.5184 (-0.03) | -0.1316 |
| map-75pct | 859 | 84 | 56 | 28 | 56 | 66.7% | 20.0% (-8.1%) | 16.8 | 6.5085 (-0.04) | -0.145 |
| map-100pct | 859 | 111 | 68 | 43 | 73 | 65.8% | 18.4% (-9.8%) | 20.4 | 6.5013 (-0.04) | -0.1583 |
| map-125pct | 859 | 139 | 82 | 57 | 92 | 66.2% | 19.1% (-9.0%) | 26.6 | 6.4966 (-0.05) | -0.1716 |

## Map-100pct Por Bucket

| Bucket | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BO3 G1 | 281 | 31 | 14 | 17 | 22 | 71.0% | 27.7% | 8.6 | 6.51 | 0.2731 |
| BO3 G2 | 282 | 40 | 40 | 0 | 28 | 70.0% | 26.0% | 10.4 | 6.7117 | -1.1834 |
| BO3 G3 | 112 | 19 | 0 | 19 | 10 | 52.6% | -5.3% | -1 | 6.3088 | -1.086 |
| BO5 G1 | 41 | 3 | 2 | 1 | 3 | 100.0% | 80.0% | 2.4 | 7.142 | 2.8717 |
| BO5 G2 | 41 | 12 | 12 | 0 | 8 | 66.7% | 20.0% | 2.4 | 5.9911 | 0.6006 |
| BO5 G3 | 41 | 1 | 0 | 1 | 0 | 0.0% | -100.0% | -1 | 6.026 | 0.2447 |
| BO5 G4 | 41 | 1 | 0 | 1 | 0 | 0.0% | -100.0% | -1 | 6.2173 | 1.422 |
| BO5 G5 | 20 | 4 | 0 | 4 | 2 | 50.0% | -10.0% | -0.4 | 5.7818 | 1.5975 |

## Map-100pct Por Liga

| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 150 | 8 | 1 | 7 | 4 | 50.0% | -10.0% | -0.8 | 6.7055 | -0.2995 |
| LCKCL | 270 | 35 | 22 | 13 | 26 | 74.3% | 33.7% | 11.8 | 6.8768 | -0.4692 |
| LPL | 270 | 36 | 32 | 4 | 25 | 69.4% | 25.0% | 9 | 6.1648 | 0.1408 |
| CBLOL | 129 | 4 | 3 | 1 | 2 | 50.0% | -10.0% | -0.4 | 6.2557 | -0.2116 |
| LEC | 198 | 25 | 8 | 17 | 13 | 52.0% | -6.4% | -1.6 | 6.5754 | -0.5327 |
| LCS | 108 | 4 | 3 | 1 | 4 | 100.0% | 80.0% | 3.2 | 5.5989 | 0.1455 |

## Diagnostico Das Bets Baseline Por Mapa

Aqui o ajuste de mapa ainda nao mexe na previsao; ele so classifica se a bet original estava alinhada ou contra o sinal historico do mapa.

| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| aligned | 27 | 27 | 16 | 11 | 21 | 77.8% | 40.0% | 10.8 | 7.2356 | -0.461 |
| against | 29 | 29 | 24 | 5 | 18 | 62.1% | 11.7% | 3.4 | 5.8327 | -2.4101 |
| neutral-map | 3 | 3 | 2 | 1 | 3 | 100.0% | 80.0% | 2.4 | 7.9792 | 4.1323 |

### Baseline Por Bucket De Mapa

| Bucket | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BO3 G1 | 30 | 30 | 20 | 10 | 22 | 73.3% | 32.0% | 9.6 | 6.611 | 0.8459 |
| BO3 G3 | 5 | 5 | 4 | 1 | 3 | 60.0% | 8.0% | 0.4 | 4.2985 | -2.8653 |
| BO3 G2 | 19 | 19 | 15 | 4 | 13 | 68.4% | 23.2% | 4.4 | 6.6641 | -3.9642 |
| BO5 G1 | 3 | 3 | 2 | 1 | 3 | 100.0% | 80.0% | 2.4 | 7.9792 | 4.1323 |
| BO5 G2 | 1 | 1 | 1 | 0 | 1 | 100.0% | 80.0% | 0.8 | 11.5706 | -11.5706 |
| BO5 G3 | 1 | 1 | 0 | 1 | 0 | 0.0% | -100.0% | -1 | 6.4988 | -6.4988 |

## Conclusao Operacional

Melhor variante no subconjunto com mapa identificado: map-50pct, ROI 24.6% (-3.5% vs baseline), lucro 16.

Resultado preliminar: nao adicionar ainda. O contexto de mapa pode ser informativo, mas nesta simulacao nao melhorou ROI o suficiente.

Observacao: como a linha simulada e a linha pre-draft do proprio modelo, este teste mede se o mapa melhora nossa decisao relativa. Nao prova que a casa deixara esse edge aberto em linhas reais.

