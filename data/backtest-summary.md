# Backtest Over/Under Kills

Gerado em: 2026-05-25T23:11:33.212Z
Holdout: 15 mapas mais recentes por liga.
Treino: todos os mapas coletados anteriores ao holdout da propria liga.
Sem duracao, side ou bans. Picks sempre avaliados pela role indicada.

## Resumo por liga

| Liga | Testes | MAE pre | MAE picks | Linhas pre acc | Linhas picks acc | Linha 24.5 pre | Linha 24.5 picks |
|---|---:|---:|---:|---:|---:|---:|---:|
| LCK | 15 | 7.93 | 8.00 | 66.0% (200) | 65.0% (200) | 53.3% (15) | 53.3% (15) |
| LPL | 15 | 6.57 | 6.47 | 66.7% (210) | 67.6% (207) | 46.7% (15) | 46.7% (15) |
| CBLOL | 15 | 4.23 | 4.28 | 77.8% (207) | 76.7% (202) | 60.0% (15) | 60.0% (15) |
| LEC | 15 | 7.04 | 7.11 | 67.8% (202) | 66.8% (205) | 80.0% (15) | 80.0% (15) |
| LCS | 15 | 7.97 | 7.99 | 69.8% (205) | 69.8% (205) | 46.7% (15) | 46.7% (15) |

## Geral

- Testes: 75
- MAE pre-draft: 6.75 kills
- MAE com picks: 6.77 kills
- Acuracia em todas as linhas com edge >= 0.75: pre 69.6% (1024 decisoes), picks 69.2% (1019 decisoes)
- Acuracia linha 24.5: pre 57.3% (75 decisoes), picks 57.3% (75 decisoes)

## Jogos testados

| Liga | Jogo | Data | Patch | Kills | Pre | Erro pre | Picks | Erro picks |
|---|---|---|---|---:|---:|---:|---:|---:|
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 16.10 | 29 | 29.81 | 0.81 | 29.21 | 0.21 |
| LCK | T1 vs HANJIN BRION | 2026-05-24 | 16.10 | 18 | 29.81 | 11.81 | 30.00 | 12.00 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 16.10 | 20 | 28.84 | 8.84 | 28.80 | 8.80 |
| LCK | Gen.G vs DN SOOPers | 2026-05-24 | 16.10 | 25 | 28.84 | 3.84 | 28.65 | 3.65 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 16.10 | 36 | 31.31 | 4.69 | 31.10 | 4.90 |
| LCK | Nongshim RedForce vs Hanwha Life Esports | 2026-05-23 | 16.10 | 54 | 31.31 | 22.69 | 31.15 | 22.85 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 2026-05-23 | 16.10 | 43 | 31.31 | 11.69 | 31.19 | 11.81 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 16.10 | 24 | 27.22 | 3.22 | 27.40 | 3.40 |
| LCK | BNK FearX vs Dplus KIA | 2026-05-23 | 16.10 | 37 | 27.22 | 9.78 | 26.85 | 10.15 |
| LCK | Dplus KIA vs BNK FearX | 2026-05-23 | 16.10 | 16 | 27.22 | 11.22 | 27.10 | 11.10 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 16.10 | 28 | 29.83 | 1.83 | 29.79 | 1.79 |
| LCK | KT Rolster vs Gen.G | 2026-05-22 | 16.10 | 17 | 29.83 | 12.83 | 30.01 | 13.01 |
| LCK | Kiwoom DRX vs DN SOOPers | 2026-05-22 | 16.10 | 28 | 29.33 | 1.33 | 29.59 | 1.59 |
| LCK | DN SOOPers vs Kiwoom DRX | 2026-05-22 | 16.10 | 22 | 29.33 | 7.33 | 29.39 | 7.39 |
| LCK | HANJIN BRION vs Dplus KIA | 2026-05-21 | 16.10 | 20 | 27.03 | 7.03 | 27.37 | 7.37 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 16.10 | 21 | 26.47 | 5.47 | 26.44 | 5.44 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 16.10 | 22 | 26.47 | 4.47 | 26.42 | 4.42 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 16.10 | 30 | 26.46 | 3.54 | 26.53 | 3.47 |
| LPL | Weibo Gaming vs LGD Gaming | 2026-05-24 | 16.10 | 15 | 26.47 | 11.47 | 26.30 | 11.30 |
| LPL | LGD Gaming vs Weibo Gaming | 2026-05-24 | 16.10 | 15 | 26.46 | 11.46 | 26.09 | 11.09 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 16.10 | 27 | 26.31 | 0.69 | 26.33 | 0.67 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 16.10 | 32 | 26.31 | 5.69 | 26.46 | 5.54 |
| LPL | Ninjas in Pyjamas vs EDward Gaming | 2026-05-24 | 16.10 | 32 | 26.31 | 5.69 | 26.53 | 5.47 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 16.10 | 37 | 26.31 | 10.69 | 26.34 | 10.66 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 2026-05-24 | 16.10 | 14 | 26.31 | 12.31 | 26.06 | 12.06 |
| LPL | Invictus Gaming vs ThunderTalk Gaming | 2026-05-23 | 16.10 | 26 | 29.36 | 3.36 | 29.25 | 3.25 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 16.10 | 33 | 29.36 | 3.64 | 29.46 | 3.54 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 2026-05-23 | 16.10 | 23 | 29.36 | 6.36 | 29.43 | 6.43 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 16.10 | 17 | 27.39 | 10.39 | 27.45 | 10.45 |
| LPL | LNG Esports vs Team WE | 2026-05-23 | 16.10 | 24 | 27.39 | 3.39 | 27.34 | 3.34 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 16.10 | 22 | 27.53 | 5.53 | 27.93 | 5.93 |
| CBLOL | Los Grandes vs LOUD | 2026-05-25 | 16.10 | 28 | 27.53 | 0.47 | 27.03 | 0.97 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 16.10 | 21 | 28.62 | 7.62 | 28.40 | 7.40 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 16.10 | 25 | 28.62 | 3.62 | 28.42 | 3.42 |
| CBLOL | FURIA vs RED Canids | 2026-05-24 | 16.10 | 24 | 28.62 | 4.62 | 29.17 | 5.17 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 16.10 | 29 | 28.28 | 0.72 | 28.11 | 0.89 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 16.10 | 29 | 28.28 | 0.72 | 28.09 | 0.91 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 2026-05-23 | 16.10 | 32 | 28.28 | 3.72 | 28.54 | 3.46 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 16.10 | 26 | 27.15 | 1.15 | 26.77 | 0.77 |
| CBLOL | FURIA vs LOUD | 2026-05-17 | 16.10 | 23 | 27.15 | 4.15 | 26.79 | 3.79 |
| CBLOL | LOUD vs FURIA | 2026-05-17 | 16.10 | 26 | 27.15 | 1.15 | 27.34 | 1.34 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 16.10 | 25 | 28.49 | 3.49 | 28.41 | 3.41 |
| CBLOL | RED Canids vs Fluxo W7M | 2026-05-16 | 16.10 | 18 | 28.49 | 10.49 | 28.76 | 10.76 |
| CBLOL | Fluxo W7M vs RED Canids | 2026-05-16 | 16.10 | 24 | 28.49 | 4.49 | 28.38 | 4.38 |
| CBLOL | Fluxo W7M vs RED Canids | 2026-05-16 | 16.10 | 40 | 28.49 | 11.51 | 28.45 | 11.55 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 16.10 | 31 | 28.22 | 2.78 | 27.99 | 3.01 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-25 | 16.10 | 38 | 28.22 | 9.78 | 28.22 | 9.78 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 16.10 | 26 | 28.22 | 2.22 | 28.20 | 2.20 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 16.10 | 35 | 28.22 | 6.78 | 28.34 | 6.66 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-25 | 16.10 | 27 | 28.22 | 1.22 | 28.46 | 1.46 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 16.10 | 17 | 28.15 | 11.15 | 28.34 | 11.34 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 16.10 | 25 | 28.15 | 3.15 | 28.37 | 3.37 |
| LEC | Movistar KOI vs Team Vitality | 2026-05-24 | 16.10 | 18 | 28.15 | 10.15 | 28.02 | 10.02 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 16.10 | 33 | 28.50 | 4.50 | 28.41 | 4.59 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 16.10 | 36 | 28.50 | 7.50 | 28.26 | 7.74 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 16.10 | 12 | 28.50 | 16.50 | 28.58 | 16.58 |
| LEC | G2 Esports vs Karmine Corp | 2026-05-23 | 16.10 | 38 | 28.50 | 9.50 | 28.74 | 9.26 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 16.9 | 44 | 28.65 | 15.35 | 28.50 | 15.50 |
| LEC | Movistar KOI vs G2 Esports | 2026-05-10 | 16.9 | 32 | 28.65 | 3.35 | 28.66 | 3.34 |
| LEC | G2 Esports vs Movistar KOI | 2026-05-10 | 16.9 | 27 | 28.65 | 1.65 | 28.82 | 1.82 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 16.10 | 14 | 26.52 | 12.52 | 26.62 | 12.62 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 16.10 | 13 | 26.52 | 13.52 | 26.39 | 13.39 |
| LCS | LYON vs Team Liquid | 2026-05-24 | 16.10 | 35 | 26.52 | 8.48 | 26.31 | 8.69 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 16.10 | 26 | 26.52 | 0.52 | 26.50 | 0.50 |
| LCS | Team Liquid vs LYON | 2026-05-24 | 16.10 | 13 | 26.52 | 13.52 | 26.66 | 13.66 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 16.10 | 27 | 27.09 | 0.09 | 27.26 | 0.26 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 16.10 | 28 | 27.09 | 0.91 | 26.96 | 1.04 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 16.10 | 17 | 27.09 | 10.09 | 27.32 | 10.32 |
| LCS | Cloud9 vs FlyQuest | 2026-05-23 | 16.10 | 22 | 27.09 | 5.09 | 26.75 | 4.75 |
| LCS | FlyQuest vs Cloud9 | 2026-05-23 | 16.10 | 13 | 27.09 | 14.09 | 27.23 | 14.23 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 16.10 | 29 | 27.27 | 1.73 | 27.18 | 1.82 |
| LCS | FlyQuest vs LYON | 2026-05-17 | 16.10 | 16 | 27.27 | 11.27 | 27.14 | 11.14 |
| LCS | LYON vs FlyQuest | 2026-05-17 | 16.10 | 39 | 27.27 | 11.73 | 27.54 | 11.46 |
| LCS | Sentinels vs Dignitas | 2026-05-17 | 16.10 | 26 | 25.70 | 0.30 | 25.62 | 0.38 |
| LCS | Dignitas vs Sentinels | 2026-05-17 | 16.10 | 10 | 25.70 | 15.70 | 25.57 | 15.57 |

