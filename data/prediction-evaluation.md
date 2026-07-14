# Prediction Evaluation

Gerado em: 2026-05-26T09:59:51.914Z
Metodo: walk-forward, sem linhas sinteticas de aposta.
Modelos: L0 baseline liga recente, L1 liga+confronto, L2 liga+confronto+picks.

## Geral

| Modelo | Esperado | Real | Bias | MAE | RMSE | ±2 | ±3 | ±5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| L0 Baseline | 29.16 | 27.39 | 1.77 | 7.53 | 9.34 | 15.6% | 28.9% | 41.1% |
| L1 Pre-draft | 28.53 | 27.39 | 1.15 | 7.28 | 9.14 | 20.0% | 26.7% | 45.6% |
| L2 Picks | 28.48 | 27.39 | 1.10 | 7.15 | 8.94 | 17.8% | 28.9% | 43.3% |

- L1 vs L0 MAE: -0.25
- L2 vs L1 MAE: -0.13

## Por Liga

| Liga | Testes | L0 MAE | L1 MAE | L1 bias | L2 MAE | L2 bias | L2 ±3 | L2 > L1? |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| LCK | 15 | 9.10 | 8.03 | -0.12 | 7.92 | -0.10 | 26.7% | sim |
| LCKCL | 15 | 10.11 | 9.81 | -1.03 | 9.40 | -1.49 | 13.3% | sim |
| LPL | 15 | 6.95 | 6.63 | 2.29 | 6.31 | 2.63 | 26.7% | sim |
| CBLOL | 15 | 3.86 | 3.97 | 0.43 | 4.03 | 0.91 | 46.7% | nao |
| LEC | 15 | 6.99 | 7.01 | 1.77 | 7.16 | 0.93 | 33.3% | nao |
| LCS | 15 | 8.19 | 8.24 | 3.53 | 8.07 | 3.70 | 26.7% | sim |

## Drafts Que Mais Mexeram Na Linha

| Liga | Jogo | Real | L1 | L2 | Delta draft | Picks principais |
|---|---|---:|---:|---:|---:|---|
| LEC | Movistar KOI vs Team Vitality | 18 | 31.88 | 29.93 | -1.95 | SUP Nami -2.8; ADC Ezreal -2.65; MID Syndra -2.32; JUNGLE Vi -1.67; TOP Rumble -1.61 |
| LCKCL | Hanwha Life Esports Challengers vs Dplus KIA Challengers | 24 | 34.65 | 32.84 | -1.81 | TOP Gwen -2.8; SUP Milio -2.51; ADC Ezreal -2.2; TOP Sion -1.95; MID Twisted Fate -1.3 |
| LEC | G2 Esports vs Movistar KOI | 27 | 31.48 | 29.73 | -1.75 | SUP Karma -2.8; TOP Ornn -2.15; ADC Ezreal -2.04; JUNGLE Pantheon -1.69; MID Azir -1.66 |
| CBLOL | Los Grandes vs LOUD | 22 | 25.79 | 27.45 | +1.66 | JUNGLE Jarvan IV +1.92; ADC Ezreal +1.83; JUNGLE Aatrox +1.71; SUP Neeko +1.66; TOP Rumble +1.58 |
| LEC | G2 Esports vs Karmine Corp | 36 | 31.35 | 29.73 | -1.62 | SUP Nami -2.8; SUP Lulu -2.41; TOP Gnar -2.23; MID Azir -1.67; MID LeBlanc -1.61 |
| LCKCL | BNK FEARX Youth vs T1 Esports Academy | 28 | 36.10 | 34.53 | -1.56 | TOP Jayce -2.37; TOP Sion -2.02; JUNGLE Xin Zhao -1.89; SUP Lux -1.56; ADC Caitlyn -1.54 |
| LCKCL | T1 Esports Academy vs BNK FEARX Youth | 34 | 36.48 | 34.98 | -1.50 | SUP Nami -2.54; SUP Bard -2.52; ADC Ezreal -2.3; MID Orianna -1.81; JUNGLE Lee Sin -1.02 |
| LCKCL | Nongshim Esports Academy vs Gen.G Global Academy | 54 | 30.09 | 31.54 | +1.45 | MID Akali +2.8; JUNGLE Vi +2.8; SUP Nautilus +2.8; TOP Zaahen +0.73; JUNGLE Xin Zhao +0.72 |
| LPL | ThunderTalk Gaming vs Invictus Gaming | 33 | 29.83 | 31.19 | +1.36 | ADC Ashe +2.43; TOP Jayce +1.64; SUP Nautilus +1.61; ADC Senna -1.34; MID Akali +1.14 |
| LEC | G2 Esports vs Karmine Corp | 12 | 34.59 | 33.27 | -1.33 | ADC Ezreal -2.8; SUP Karma -2.8; MID Ryze -1.95; TOP Rumble -1.93; TOP Galio +1.7 |
| LPL | EDward Gaming vs Ninjas in Pyjamas | 37 | 25.64 | 26.96 | +1.31 | MID Orianna +2.66; JUNGLE Vi +1.62; JUNGLE Jarvan IV +1.6; TOP Tristana +0.98; ADC Corki +0.86 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 36 | 32.60 | 31.30 | -1.30 | SUP Nami -2.2; TOP Gnar -2.04; MID Ryze -1.94; JUNGLE Lee Sin +1.9; JUNGLE Jarvan IV -1.5 |
| LEC | G2 Esports vs Movistar KOI | 44 | 31.85 | 30.58 | -1.28 | MID Galio -2.62; MID LeBlanc -2.3; JUNGLE Xin Zhao -2.04; TOP KSante -2.01; ADC Ashe -1.2 |
| LEC | G2 Esports vs Karmine Corp | 38 | 32.47 | 31.23 | -1.24 | JUNGLE Xin Zhao -2.48; JUNGLE Vi -2.03; MID Taliyah -1.88; ADC Ashe -1.4; SUP Seraphine -1.38 |
| LEC | G2 Esports vs Karmine Corp | 33 | 32.11 | 30.91 | -1.19 | ADC Jhin -2.67; TOP Ambessa -2.56; JUNGLE Aatrox -1.63; ADC Varus -1.12; MID Ahri -0.87 |
| CBLOL | Los Grandes vs Vivo Keyd Stars | 32 | 24.85 | 26.00 | +1.16 | JUNGLE Pantheon +2.26; ADC Ezreal +1.81; SUP Neeko +1.65; TOP Rumble +1.54; MID Cassiopeia +1.4 |
| LCKCL | HANJIN BRION Challengers vs T1 Esports Academy | 46 | 34.28 | 33.16 | -1.12 | SUP Bard -2.28; ADC Caitlyn -1.64; MID Ryze -1.31; JUNGLE Wukong -1.22; MID Anivia -0.8 |
| LPL | LGD Gaming vs Weibo Gaming | 30 | 21.68 | 22.78 | +1.10 | ADC Miss Fortune +2.76; SUP Nautilus +2.43; MID Aurora +1.81; JUNGLE Xin Zhao +1.36; SUP Bard +1.18 |
| LCS | FlyQuest vs Cloud9 | 28 | 23.89 | 24.97 | +1.08 | SUP Neeko +2.26; TOP Renekton +1.6; JUNGLE Wukong +1.59; MID Taliyah +1.03; MID Aurora +0.98 |
| LCK | Gen.G vs DN SOOPers | 25 | 29.85 | 28.81 | -1.05 | SUP Seraphine -2.24; MID Ryze -2.05; JUNGLE Skarner -1.84; ADC Ashe -1.81; JUNGLE Lee Sin +1.76 |
| LCS | Team Liquid vs LYON | 26 | 22.76 | 23.68 | +0.92 | SUP Nautilus +2.62; ADC Senna +2.04; TOP Ambessa +1.64; JUNGLE Vi +1.61; MID Aurora +1.3 |
| CBLOL | FURIA vs RED Canids | 24 | 26.91 | 27.83 | +0.91 | ADC Varus +2.67; ADC Ezreal +1.46; SUP Neeko +1.35; TOP Rumble +1.18; JUNGLE Xin Zhao +1.15 |
| LCS | Team Liquid vs LYON | 13 | 25.10 | 26.00 | +0.90 | TOP Sion +2.37; ADC Jhin +2.15; JUNGLE Wukong +1.42; MID Anivia -0.95; SUP Rell +0.94 |
| LCS | FlyQuest vs LYON | 16 | 29.36 | 28.46 | -0.89 | ADC Caitlyn -2.06; SUP Nami -2.03; JUNGLE Jarvan IV -1.47; ADC Corki -1.42; JUNGLE Sejuani -1.37 |
| LEC | G2 Esports vs Movistar KOI | 31 | 30.22 | 29.34 | -0.88 | ADC Jinx -2.02; TOP Gnar -1.73; JUNGLE Pantheon -1.3; MID Azir -1.15; JUNGLE Zaahen -1.11 |
| LCS | Dignitas vs Sentinels | 10 | 27.09 | 26.26 | -0.83 | ADC Caitlyn -1.71; JUNGLE Xin Zhao -1.62; MID Ryze -1.59; TOP Sion +1.43; JUNGLE Jarvan IV -1.36 |
| LCKCL | HANJIN BRION Challengers vs T1 Esports Academy | 31 | 36.63 | 35.80 | -0.82 | TOP Jayce -2; MID Mel -1.92; TOP Sion -1.52; JUNGLE Xin Zhao -1.45; ADC Ashe +1.25 |
| CBLOL | Los Grandes vs LOUD | 34 | 25.05 | 25.86 | +0.81 | MID Taliyah +2.49; JUNGLE Vi +1.56; SUP Seraphine +1.29; ADC Ashe +1.16; MID Viktor +0.88 |
| LCS | Cloud9 vs FlyQuest | 17 | 24.64 | 25.43 | +0.79 | SUP Nautilus +2.47; ADC Senna +2.39; MID Sylas +2; ADC Sivir +1.23; JUNGLE Ambessa +0.62 |
| LCK | Hanwha Life Esports vs Nongshim RedForce | 43 | 26.92 | 27.71 | +0.79 | TOP Rumble +2.36; MID Akali +1.34; ADC Lucian -1.19; JUNGLE Wukong +1.1; MID Annie +1.08 |

