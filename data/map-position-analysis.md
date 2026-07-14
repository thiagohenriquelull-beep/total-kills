# Analise: Posicao Do Mapa Na Serie E Total De Kills

Gerado em: 2026-05-26T21:30:57.943Z
Dataset: 1305 mapas em 559 grupos de serie. Media geral: 28.77 kills.

## Conclusao Direta

A teoria aparece parcialmente: mapa 2 e mapa 5 diferem 4.29 kills em media, com p=0.016.

Mapa 2: media 29.79 em 463 jogos. Mapa 5: media 25.50 em 20 jogos. Diferenca mapa2-mapa5: 4.29 kills, IC95 0.81 a 7.77, p=0.016.

Mapas decisivos tiveram media 29.24 contra 28.50 dos intermediarios, diferenca 0.75 kills, p=0.130. Isso nao sustenta a explicacao geral de que "mapa decisivo" fica naturalmente mais under.

## Como O Numero Do Mapa Foi Inferido

O campo `game` do dataset atual quase sempre vem como confronto simples, sem `Game 1/2/3`. Por isso, a inferencia principal foi agrupar por `liga + torneio + data + dupla de times` e ordenar por `id` crescente dentro do grupo. Quando o titulo trouxer `Game X`, o script usa o titulo.

Distribuicao das inferencias:

| Metodo | Qtde |
|---:|---:|
| group-id-order | 1305 |

Distribuicao de tamanho observado da serie:

| Mapas jogados | Qtde |
|---:|---:|
| 1 | 96 |
| 2 | 242 |
| 3 | 179 |
| 4 | 22 |
| 5 | 20 |

Amostra de validacao da inferencia:

| Liga | Data | Serie | IDs em ordem | Mapas | Kills | Inferencia |
|---|---|---|---|---|---|---|
| LEC | 2026-05-25 | Movistar KOI vs G2 Esports | 78837 -> 78838 -> 78839 -> 78840 -> 78841 | 1, 2, 3, 4, 5 | 27, 35, 26, 38, 31 | group-id-order |
| LPL | 2026-05-24 | LGD Gaming vs Weibo Gaming | 78374 -> 78375 -> 78376 -> 78377 -> 78378 | 1, 2, 3, 4, 5 | 15, 15, 30, 22, 21 | group-id-order |
| LPL | 2026-05-24 | EDward Gaming vs Ninjas in Pyjamas | 78369 -> 78370 -> 78371 -> 78372 -> 78373 | 1, 2, 3, 4, 5 | 14, 37, 32, 32, 27 | group-id-order |
| LCS | 2026-05-24 | Team Liquid vs LYON | 78681 -> 78682 -> 78683 -> 78684 -> 78685 | 1, 2, 3, 4, 5 | 13, 26, 35, 13, 14 | group-id-order |
| LPL | 2026-05-23 | LNG Esports vs Team WE | 78359 -> 78360 -> 78361 -> 78362 -> 78363 | 1, 2, 3, 4, 5 | 11, 29, 34, 24, 17 | group-id-order |
| LCS | 2026-05-23 | FlyQuest vs Cloud9 | 78676 -> 78677 -> 78678 -> 78679 -> 78680 | 1, 2, 3, 4, 5 | 13, 22, 17, 28, 27 | group-id-order |
| CBLOL | 2026-05-10 | Fluxo W7M vs Los Grandes | 78037 -> 78038 -> 78039 -> 78040 -> 78041 | 1, 2, 3, 4, 5 | 19, 35, 25, 29, 27 | group-id-order |
| LPL | 2026-03-04 | JD Gaming vs Bilibili Gaming | 75073 -> 75074 -> 75075 -> 75076 -> 75077 | 1, 2, 3, 4, 5 | 24, 28, 32, 21, 18 | group-id-order |
| LPL | 2026-03-02 | Weibo Gaming vs Top Esports | 75063 -> 75064 -> 75065 -> 75066 -> 75067 | 1, 2, 3, 4, 5 | 34, 32, 26, 37, 37 | group-id-order |
| LEC | 2026-03-01 | G2 Esports vs Karmine Corp | 75053 -> 75054 -> 75055 -> 75056 -> 75057 | 1, 2, 3, 4, 5 | 22, 20, 28, 27, 43 | group-id-order |
| LEC | 2026-02-28 | Movistar KOI vs Karmine Corp | 75011 -> 75012 -> 75013 -> 75014 -> 75015 | 1, 2, 3, 4, 5 | 21, 19, 28, 14, 19 | group-id-order |
| LCKCL | 2026-02-26 | KRX Challengers vs KT Rolster Challengers | 74899 -> 74900 -> 74901 -> 74902 -> 74903 | 1, 2, 3, 4, 5 | 31, 18, 27, 31, 24 | group-id-order |

## Estatisticas Por Numero Do Mapa - Todo O Dataset

| Mapa | Jogos | Media | IC95 media | Mediana | Desv.Pad | > media geral | < media geral |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 559 | 28.16 | 27.48 a 28.85 | 28.00 | 8.26 | 45.6% | 54.4% |
| 2 | 463 | 29.79 | 29.01 a 30.57 | 28.00 | 8.60 | 49.7% | 50.3% |
| 3 | 221 | 28.81 | 27.75 a 29.86 | 28.00 | 7.98 | 47.5% | 52.5% |
| 4 | 42 | 27.07 | 24.30 a 29.84 | 26.50 | 9.16 | 40.5% | 59.5% |
| 5 | 20 | 25.50 | 22.11 a 28.89 | 25.00 | 7.74 | 25.0% | 75.0% |

## Testes Estatisticos

| Escopo | ANOVA p | Mapa 2 - Mapa 5 | p Welch | IC95 dif. | Observacao |
|---|---:|---:|---:|---:|---|
| Geral | 0.006 | 4.29 | 0.016 | 0.81 a 7.77 | diferenca estatisticamente detectada |
| LCK | 0.197 | -- | -- | -- a -- | amostra insuficiente |
| LCKCL | 0.003 | 9.57 | <0.001 | 6.24 a 12.90 | diferenca estatisticamente detectada |
| LPL | 0.884 | 2.31 | 0.472 | -4.00 a 8.62 | nao significativo |
| CBLOL | 0.137 | -- | -- | -- a -- | amostra insuficiente |
| LEC | 0.475 | -1.85 | 0.791 | -15.58 a 11.88 | nao significativo |
| LCS | 0.154 | 6.83 | 0.080 | -0.81 a 14.48 | nao significativo |

Notas: ANOVA testa se alguma media entre mapas 1-5 difere. Welch testa diretamente mapa 2 menos mapa 5. O p-valor de Welch usa aproximacao normal, adequada aqui pelo tamanho das amostras.

## Por Liga

| Liga | Mapa | Jogos | Media | Mediana | Desv.Pad | > media geral |
|---|---:|---:|---:|---:|---:|---:|
| LCK | 1 | 80 | 28.20 | 28.00 | 8.17 | 40.0% |
| LCK | 2 | 80 | 29.94 | 28.00 | 8.59 | 43.8% |
| LCK | 3 | 20 | 31.50 | 32.50 | 7.58 | 65.0% |
| LCKCL | 1 | 114 | 29.40 | 29.00 | 7.96 | 37.7% |
| LCKCL | 2 | 114 | 33.57 | 31.00 | 10.03 | 49.1% |
| LCKCL | 3 | 58 | 31.55 | 30.00 | 8.55 | 43.1% |
| LCKCL | 4 | 9 | 28.56 | 29.00 | 11.41 | 22.2% |
| LCKCL | 5 | 5 | 24.00 | 24.00 | 3.16 | 0.0% |
| LPL | 1 | 110 | 28.75 | 28.00 | 8.94 | 48.2% |
| LPL | 2 | 109 | 28.31 | 28.00 | 7.63 | 47.7% |
| LPL | 3 | 58 | 27.83 | 26.00 | 7.30 | 41.4% |
| LPL | 4 | 15 | 28.33 | 27.00 | 8.46 | 40.0% |
| LPL | 5 | 8 | 26.00 | 24.00 | 8.86 | 37.5% |
| CBLOL | 1 | 76 | 29.66 | 30.00 | 8.37 | 52.6% |
| CBLOL | 2 | 48 | 27.15 | 26.50 | 5.57 | 37.5% |
| CBLOL | 3 | 26 | 26.62 | 25.00 | 6.12 | 30.8% |
| CBLOL | 4 | 8 | 26.50 | 24.50 | 9.78 | 37.5% |
| CBLOL | 5 | 1 | 27.00 | 27.00 | -- | 0.0% |
| LEC | 1 | 128 | 26.96 | 27.00 | 7.53 | 43.0% |
| LEC | 2 | 62 | 29.15 | 27.50 | 8.15 | 50.0% |
| LEC | 3 | 31 | 27.77 | 28.00 | 9.68 | 51.6% |
| LEC | 4 | 4 | 28.00 | 30.00 | 10.36 | 50.0% |
| LEC | 5 | 3 | 31.00 | 31.00 | 12.00 | 66.7% |
| LCS | 1 | 51 | 24.84 | 23.00 | 8.19 | 39.2% |
| LCS | 2 | 50 | 27.50 | 26.00 | 7.39 | 60.0% |
| LCS | 3 | 28 | 26.39 | 27.50 | 6.10 | 53.6% |
| LCS | 4 | 6 | 21.83 | 21.50 | 6.11 | 33.3% |
| LCS | 5 | 3 | 20.67 | 21.00 | 6.51 | 33.3% |

## Contexto Da Serie

| Contexto | Jogos | Media | IC95 media | Mediana | Desv.Pad | > media geral |
|---|---:|---:|---:|---:|---:|---:|
| Todos os mapas | 1305 | 28.77 | 28.32 a 29.23 | 28.00 | 8.39 | 46.9% |
| Apenas series com 2+ mapas | 1209 | 28.78 | 28.31 a 29.26 | 28.00 | 8.45 | 46.7% |
| Mapas decisivos | 463 | 29.24 | 28.50 a 29.99 | 28.00 | 8.20 | 48.2% |
| Mapas intermediarios | 746 | 28.50 | 27.88 a 29.11 | 28.00 | 8.60 | 45.7% |
| Mapa 3 decisivo | 179 | 28.77 | 27.60 a 29.93 | 28.00 | 7.93 | 48.6% |
| Mapa 3 intermediario | 42 | 28.98 | 26.48 a 31.48 | 28.00 | 8.27 | 42.9% |
| Mapa 5 | 20 | 25.50 | 22.11 a 28.89 | 25.00 | 7.74 | 25.0% |

Testes de contexto:

| Comparacao | Diferenca media | p Welch | IC95 dif. |
|---|---:|---:|---:|
| Decisivo - intermediario | 0.75 | 0.130 | -0.22 a 1.72 |
| Mapa 3 decisivo - mapa 3 intermediario | -0.21 | 0.881 | -2.97 a 2.55 |

## Contexto Por Liga

| Liga | Contexto | Jogos | Media | Mediana | > media geral |
|---|---|---:|---:|---:|---:|
| LCK | Apenas series com 2+ mapas | 180 | 29.34 | 28.00 | 44.4% |
| LCK | Mapas decisivos | 80 | 29.44 | 28.00 | 43.8% |
| LCK | Mapas intermediarios | 100 | 29.26 | 29.00 | 45.0% |
| LCK | Mapa 3 decisivo | 20 | 31.50 | 32.50 | 65.0% |
| LCKCL | Apenas series com 2+ mapas | 300 | 31.29 | 30.00 | 42.0% |
| LCKCL | Mapas decisivos | 114 | 32.04 | 30.50 | 43.0% |
| LCKCL | Mapas intermediarios | 186 | 30.83 | 30.00 | 41.4% |
| LCKCL | Mapa 3 decisivo | 49 | 30.49 | 30.00 | 38.8% |
| LCKCL | Mapa 3 intermediario | 9 | 37.33 | 39.00 | 66.7% |
| LCKCL | Mapa 5 | 5 | 24.00 | 24.00 | 0.0% |
| LPL | Apenas series com 2+ mapas | 299 | 28.33 | 28.00 | 46.2% |
| LPL | Mapas decisivos | 109 | 28.06 | 27.00 | 43.1% |
| LPL | Mapas intermediarios | 190 | 28.49 | 28.00 | 47.9% |
| LPL | Mapa 3 decisivo | 43 | 27.84 | 26.00 | 37.2% |
| LPL | Mapa 3 intermediario | 15 | 27.80 | 30.00 | 53.3% |
| LPL | Mapa 5 | 8 | 26.00 | 24.00 | 37.5% |
| CBLOL | Apenas series com 2+ mapas | 131 | 27.75 | 26.00 | 38.9% |
| CBLOL | Mapas decisivos | 48 | 27.44 | 26.00 | 35.4% |
| CBLOL | Mapas intermediarios | 83 | 27.93 | 26.00 | 41.0% |
| CBLOL | Mapa 3 decisivo | 18 | 27.28 | 25.50 | 33.3% |
| CBLOL | Mapa 3 intermediario | 8 | 25.13 | 24.00 | 25.0% |
| CBLOL | Mapa 5 | 1 | 27.00 | 27.00 | 0.0% |
| LEC | Apenas series com 2+ mapas | 162 | 27.73 | 27.00 | 45.1% |
| LEC | Mapas decisivos | 62 | 29.18 | 28.00 | 54.8% |
| LEC | Mapas intermediarios | 100 | 26.84 | 26.00 | 39.0% |
| LEC | Mapa 3 decisivo | 27 | 27.52 | 25.00 | 48.1% |
| LEC | Mapa 3 intermediario | 4 | 29.50 | 28.00 | 75.0% |
| LEC | Mapa 5 | 3 | 31.00 | 31.00 | 66.7% |
| LCS | Apenas series com 2+ mapas | 137 | 25.77 | 25.00 | 48.9% |
| LCS | Mapas decisivos | 50 | 26.98 | 26.50 | 56.0% |
| LCS | Mapas intermediarios | 87 | 25.08 | 24.00 | 44.8% |
| LCS | Mapa 3 decisivo | 22 | 27.00 | 28.00 | 54.5% |
| LCS | Mapa 3 intermediario | 6 | 24.17 | 25.00 | 50.0% |
| LCS | Mapa 5 | 3 | 20.67 | 21.00 | 33.3% |

## Recomendacao Para O Modelo

Pode valer testar uma variavel leve de posicao do mapa, mas com shrink forte. O efeito observado entre mapa 2 e mapa 5 foi 4.29 kills; nao deve entrar como ajuste grande sem backtest walk-forward.

