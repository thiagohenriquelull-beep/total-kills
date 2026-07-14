# Calibrated Model Backtest

Gerado em: 2026-05-26T00:08:50.193Z
Teste: 15 mapas mais recentes por liga fora do treino.
Modelo: liga por estilo/recencia, calibracao de bias por liga, times recentes, picks por role e residual pre-draft.

## Comparacao Geral

| Modelo | Pre esperado | Real medio | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Picks ±3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Antes | 27.90 | 25.92 | 1.98 | 6.75 | 27.89 | 1.97 | 6.77 | 22.7% |
| Calibrado | 29.08 | 25.84 | 3.24 | 6.97 | 28.99 | 3.15 | 6.96 | 26.7% |

## Por Liga

| Liga | Testes | Real medio | Pre esperado | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Melhorou com picks? |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 15 | 27.80 | 28.95 | 1.15 | 8.12 | 28.81 | 1.01 | 8.07 | sim |
| LPL | 15 | 24.53 | 30.34 | 5.80 | 7.42 | 30.31 | 5.78 | 7.36 | sim |
| CBLOL | 15 | 25.73 | 28.24 | 2.50 | 4.17 | 28.25 | 2.51 | 4.18 | nao |
| LEC | 15 | 29.27 | 30.80 | 1.53 | 7.02 | 30.61 | 1.34 | 7.07 | nao |
| LCS | 15 | 21.87 | 27.06 | 5.20 | 8.15 | 26.98 | 5.11 | 8.11 | sim |

## Jogos

| Liga | Jogo | Data | Real | Pre | Erro pre | Picks | Erro picks |
|---|---|---|---:|---:|---:|---:|---:|
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 29 | 29.64 | 0.64 | 29.22 | 0.22 |
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 18 | 29.64 | 11.64 | 29.75 | 11.75 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 20 | 28.61 | 8.61 | 28.48 | 8.48 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 25 | 28.61 | 3.61 | 28.46 | 3.46 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 36 | 29.90 | -6.10 | 29.67 | -6.33 |
| LCK | Nongshim RedForce vs Hanwha Life Esports | 2026-05-23 | 54 | 29.90 | -24.10 | 29.86 | -24.14 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 43 | 29.90 | -13.10 | 29.71 | -13.29 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 24 | 28.03 | 4.03 | 27.96 | 3.96 |
| LCK | BNK FearX vs Dplus KIA | 2026-05-23 | 37 | 28.03 | -8.97 | 27.84 | -9.16 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 16 | 28.03 | 12.03 | 27.75 | 11.75 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 28 | 29.64 | 1.64 | 29.48 | 1.48 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 17 | 29.64 | 12.64 | 29.49 | 12.49 |
| LCK | Kiwoom DRX vs DN SOOPers | 2026-05-22 | 28 | 28.51 | 0.51 | 28.46 | 0.46 |
| LCK | DN SOOPers vs Kiwoom DRX | 2026-05-22 | 22 | 28.51 | 6.51 | 28.36 | 6.36 |
| LCK | HANJIN BRION vs Dplus KIA | 2026-05-21 | 20 | 27.72 | 7.72 | 27.67 | 7.67 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 21 | 29.50 | 8.50 | 29.41 | 8.41 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 22 | 29.50 | 7.50 | 29.37 | 7.37 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 30 | 29.50 | -0.50 | 29.47 | -0.53 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 15 | 29.50 | 14.50 | 29.36 | 14.36 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 15 | 29.50 | 14.50 | 29.37 | 14.37 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 27 | 30.21 | 3.21 | 30.15 | 3.15 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 32 | 30.21 | -1.79 | 30.28 | -1.72 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 32 | 30.21 | -1.79 | 30.24 | -1.76 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 37 | 30.21 | -6.79 | 30.22 | -6.78 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 14 | 30.21 | 16.21 | 30.15 | 16.15 |
| LPL | Invictus Gaming vs ThunderTalk Gaming | 2026-05-23 | 26 | 31.78 | 5.78 | 31.75 | 5.75 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 33 | 31.78 | -1.22 | 31.94 | -1.06 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 23 | 31.78 | 8.78 | 31.72 | 8.72 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 17 | 30.59 | 13.59 | 30.73 | 13.73 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 24 | 30.59 | 6.59 | 30.53 | 6.53 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 34 | 27.82 | -6.18 | 27.92 | -6.08 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 22 | 27.82 | 5.82 | 27.98 | 5.98 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 28 | 27.82 | -0.18 | 27.68 | -0.32 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 21 | 28.74 | 7.74 | 28.69 | 7.69 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 25 | 28.74 | 3.74 | 28.78 | 3.78 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 24 | 28.74 | 4.74 | 28.87 | 4.87 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 29 | 27.96 | -1.04 | 27.94 | -1.06 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 29 | 27.96 | -1.04 | 27.89 | -1.11 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 32 | 27.96 | -4.04 | 28.04 | -3.96 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 26 | 27.77 | 1.77 | 27.70 | 1.70 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 23 | 27.77 | 4.77 | 27.66 | 4.66 |
| CBLOL | LOUD vs FURIA | 2026-05-17 | 26 | 27.77 | 1.77 | 27.84 | 1.84 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 25 | 28.89 | 3.89 | 28.88 | 3.88 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 18 | 28.89 | 10.89 | 28.90 | 10.90 |
| CBLOL | Fluxo W7M vs RED Canids | 2026-05-16 | 24 | 28.89 | 4.89 | 28.95 | 4.95 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 31 | 30.70 | -0.30 | 30.45 | -0.55 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 38 | 30.70 | -7.30 | 30.56 | -7.44 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 26 | 30.70 | 4.70 | 30.53 | 4.53 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 35 | 30.70 | -4.30 | 30.41 | -4.59 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 27 | 30.70 | 3.70 | 30.65 | 3.65 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 17 | 31.07 | 14.07 | 31.05 | 14.05 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 25 | 31.07 | 6.07 | 30.99 | 5.99 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 18 | 31.07 | 13.07 | 30.80 | 12.80 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 33 | 30.76 | -2.24 | 30.56 | -2.44 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 36 | 30.76 | -5.24 | 30.36 | -5.64 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 12 | 30.76 | 18.76 | 30.65 | 18.65 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 38 | 30.76 | -7.24 | 30.63 | -7.37 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 44 | 30.75 | -13.25 | 30.46 | -13.54 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-10 | 32 | 30.75 | -1.25 | 30.61 | -1.39 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 27 | 30.75 | 3.75 | 30.44 | 3.44 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 14 | 27.01 | 13.01 | 27.00 | 13.00 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 13 | 27.01 | 14.01 | 26.86 | 13.86 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 35 | 27.01 | -7.99 | 26.85 | -8.15 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 26 | 27.01 | 1.01 | 26.94 | 0.94 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 13 | 27.01 | 14.01 | 27.03 | 14.03 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 27 | 27.16 | 0.16 | 27.18 | 0.18 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 28 | 27.16 | -0.84 | 27.12 | -0.88 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 17 | 27.16 | 10.16 | 27.18 | 10.18 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 22 | 27.16 | 5.16 | 26.93 | 4.93 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 13 | 27.16 | 14.16 | 27.04 | 14.04 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 29 | 27.35 | -1.65 | 27.18 | -1.82 |
| LCS | FlyQuest vs LYON | 2026-05-17 | 16 | 27.35 | 11.35 | 27.20 | 11.20 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 39 | 27.35 | -11.65 | 27.37 | -11.63 |
| LCS | Sentinels vs Dignitas | 2026-05-17 | 26 | 26.53 | 0.53 | 26.44 | 0.44 |
| LCS | Dignitas vs Sentinels | 2026-05-17 | 10 | 26.53 | 16.53 | 26.38 | 16.38 |

