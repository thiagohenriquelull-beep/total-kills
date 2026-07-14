# Walk-Forward Calibration Backtest

Gerado em: 2026-05-26T03:31:02.080Z
Cada jogo foi previsto usando apenas jogos anteriores a ele.

## Por Liga

| Liga | Testes | Real medio | Pre esperado | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Picks ±3 | Melhorou com picks? |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 15 | 27.80 | 27.68 | -0.12 | 8.03 | 27.70 | -0.10 | 7.92 | 26.7% | sim |
| LPL | 15 | 24.53 | 26.83 | 2.29 | 6.63 | 27.16 | 2.63 | 6.31 | 26.7% | sim |
| CBLOL | 15 | 25.73 | 26.17 | 0.43 | 3.97 | 26.64 | 0.91 | 4.03 | 46.7% | nao |
| LEC | 15 | 29.27 | 31.04 | 1.77 | 7.01 | 30.20 | 0.93 | 7.16 | 33.3% | nao |
| LCS | 15 | 21.87 | 25.39 | 3.53 | 8.24 | 25.57 | 3.70 | 8.07 | 26.7% | sim |

## Geral

- Jogos testados: 75
- Pre-draft: esperado 27.42, real 25.84, bias 1.58, MAE 6.78
- Com picks: esperado 27.45, real 25.84, bias 1.61, MAE 6.69
- Dentro de ±3 kills: pre 29.3%, picks 32.0%
- Dentro de ±5 kills: pre 49.3%, picks 45.3%

## Jogos

| Liga | Jogo | Data | Real | Pre | Erro pre | Picks | Erro picks |
|---|---|---|---:|---:|---:|---:|---:|
| LCK | HANJIN BRION vs Dplus KIA | 2026-05-21 | 20 | 27.74 | 7.74 | 27.56 | 7.56 |
| LCK | DN SOOPers vs Kiwoom DRX | 2026-05-22 | 22 | 27.70 | 5.70 | 27.57 | 5.57 |
| LCK | Kiwoom DRX vs DN SOOPers | 2026-05-22 | 28 | 27.09 | -0.91 | 27.59 | -0.41 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 17 | 27.83 | 10.83 | 28.03 | 11.03 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 28 | 27.03 | -0.97 | 27.47 | -0.53 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 16 | 25.46 | 9.46 | 25.47 | 9.47 |
| LCK | BNK FearX vs Dplus KIA | 2026-05-23 | 37 | 23.96 | -13.04 | 24.72 | -12.28 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 24 | 25.29 | 1.29 | 26.00 | 2.00 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 43 | 26.92 | -16.08 | 27.71 | -15.29 |
| LCK | Nongshim RedForce vs Hanwha Life Esports | 2026-05-23 | 54 | 29.25 | -24.75 | 29.74 | -24.26 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 36 | 32.60 | -3.40 | 31.30 | -4.70 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 25 | 29.85 | 4.85 | 28.81 | 3.81 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 20 | 28.23 | 8.23 | 27.57 | 7.57 |
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 18 | 29.23 | 11.23 | 29.62 | 11.62 |
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 29 | 27.08 | -1.92 | 26.36 | -2.64 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 24 | 30.83 | 6.83 | 30.40 | 6.40 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 17 | 29.98 | 12.98 | 30.53 | 13.53 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 23 | 30.25 | 7.25 | 30.31 | 7.31 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 33 | 29.83 | -3.17 | 31.19 | -1.81 |
| LPL | Invictus Gaming vs ThunderTalk Gaming | 2026-05-23 | 26 | 29.52 | 3.52 | 29.50 | 3.50 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 14 | 27.21 | 13.21 | 27.07 | 13.07 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 37 | 25.64 | -11.36 | 26.96 | -10.04 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 32 | 27.26 | -4.74 | 27.97 | -4.03 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 32 | 27.06 | -4.94 | 27.52 | -4.48 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 27 | 27.54 | 0.54 | 27.60 | 0.60 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 15 | 25.74 | 10.74 | 25.31 | 10.31 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 15 | 23.25 | 8.25 | 23.55 | 8.55 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 30 | 21.68 | -8.32 | 22.78 | -7.22 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 22 | 23.61 | 1.61 | 23.61 | 1.61 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 21 | 23.00 | 2.00 | 23.10 | 2.10 |
| CBLOL | Fluxo W7M vs RED Canids | 2026-05-16 | 24 | 28.85 | 4.85 | 29.06 | 5.06 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 18 | 28.90 | 10.90 | 29.06 | 11.06 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 25 | 26.80 | 1.80 | 27.00 | 2.00 |
| CBLOL | LOUD vs FURIA | 2026-05-17 | 26 | 25.57 | -0.43 | 26.32 | 0.32 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 23 | 24.58 | 1.58 | 24.43 | 1.43 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 26 | 24.76 | -1.24 | 25.14 | -0.86 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 32 | 24.85 | -7.15 | 26.00 | -6.00 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 29 | 25.35 | -3.65 | 25.54 | -3.46 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 29 | 26.11 | -2.89 | 26.26 | -2.74 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 24 | 26.91 | 2.91 | 27.83 | 3.83 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 25 | 27.10 | 2.10 | 27.50 | 2.50 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 21 | 26.13 | 5.13 | 26.35 | 5.35 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 28 | 25.77 | -2.23 | 25.77 | -2.23 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 22 | 25.79 | 3.79 | 27.45 | 5.45 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 34 | 25.05 | -8.95 | 25.86 | -8.14 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 27 | 31.48 | 4.48 | 29.73 | 2.73 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-10 | 32 | 31.34 | -0.66 | 30.61 | -1.39 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 44 | 31.85 | -12.15 | 30.58 | -13.42 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 38 | 32.47 | -5.53 | 31.23 | -6.77 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 12 | 34.59 | 22.59 | 33.27 | 21.27 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 36 | 31.35 | -4.65 | 29.73 | -6.27 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 33 | 32.11 | -0.89 | 30.91 | -2.09 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 18 | 31.88 | 13.88 | 29.93 | 11.93 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 25 | 31.09 | 6.09 | 30.58 | 5.58 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 17 | 30.88 | 13.88 | 31.01 | 14.01 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 27 | 28.54 | 1.54 | 29.00 | 2.00 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 35 | 28.64 | -6.36 | 28.06 | -6.94 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 26 | 29.38 | 3.38 | 29.13 | 3.13 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 38 | 29.72 | -8.28 | 29.86 | -8.14 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 31 | 30.22 | -0.78 | 29.34 | -1.66 |
| LCS | Dignitas vs Sentinels | 2026-05-17 | 10 | 27.09 | 17.09 | 26.26 | 16.26 |
| LCS | Sentinels vs Dignitas | 2026-05-17 | 26 | 25.08 | -0.92 | 25.13 | -0.87 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 39 | 27.14 | -11.86 | 27.17 | -11.83 |
| LCS | FlyQuest vs LYON | 2026-05-17 | 16 | 29.36 | 13.36 | 28.46 | 12.46 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 29 | 28.68 | -0.32 | 28.45 | -0.55 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 13 | 27.99 | 14.99 | 27.50 | 14.50 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 22 | 26.04 | 4.04 | 25.85 | 3.85 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 17 | 24.64 | 7.64 | 25.43 | 8.43 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 28 | 23.89 | -4.11 | 24.97 | -3.03 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 27 | 24.33 | -2.67 | 25.01 | -1.99 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 13 | 25.10 | 12.10 | 26.00 | 13.00 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 26 | 22.76 | -3.24 | 23.68 | -2.32 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 35 | 22.75 | -12.25 | 22.81 | -12.19 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 13 | 24.21 | 11.21 | 24.23 | 11.23 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 14 | 21.84 | 7.84 | 22.53 | 8.53 |

