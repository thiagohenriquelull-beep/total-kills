# Backtest com Linhas Simuladas

Gerado em: 2026-05-26T08:49:25.722Z
Metodo: walk-forward. Minimo 30 jogos de treino por jogo.
Jogos testados: Metodo A = 855, Metodo B = 855

Break-even: **55.6%** @ 1.80 | **54.1%** @ 1.85
Sinal GO = ROI > 5% @ 1.80 | MARGINAL = ROI > 0% @ 1.80 | PASS = ROI <= 0%

## METODO A — Mediana Movel como Linha da Casa

Casa = mediana movel dos ultimos 25 kills da liga. Sinal = L2 (picks completos). Edge = L2 - mediana.

### Geral (todas as ligas)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 727 | 401/53.1% | 326/60.4% | 56.4% | 1.5% | 4.3% | MARGINAL |
| ±1 | 596 | 338/52.1% | 258/62.8% | 56.7% | 2.1% | 4.9% | MARGINAL |
| ±1.5 | 462 | 257/52.9% | 205/65.4% | 58.4% | 5.2% | 8.1% | GO |
| ±2 | 341 | 184/51.6% | 157/68.8% | 59.5% | 7.2% | 10.1% | GO |
| ±2.5 | 242 | 128/53.9% | 114/68.4% | 60.7% | 9.3% | 12.4% | GO |
| ±3 | 161 | 95/56.8% | 66/66.7% | 60.9% | 9.6% | 12.6% | GO |

### LCK (150 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 123 | 66/56.1% | 57/63.2% | 59.4% | 6.8% | 9.8% | GO |
| ±1 | 99 | 52/57.7% | 47/63.8% | 60.6% | 9.1% | 12.1% | GO |
| ±1.5 | 77 | 36/55.6% | 41/70.7% | 63.6% | 14.5% | 17.7% | GO |
| ±2 | 57 | 25/60.0% | 32/75.0% | 68.4% | 23.2% | 26.6% | GO |
| ±2.5 | 38 | 15/66.7% | 23/78.3% | 73.7% | 32.6% | 36.3% | GO |
| ±3 | 22 | 10/70.0% | 12/66.7% | 68.2% | 22.7% | 26.1% | GO |

### LPL (270 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 232 | 130/49.2% | 102/64.7% | 56.0% | 0.9% | 3.7% | MARGINAL |
| ±1 | 205 | 116/47.4% | 89/65.2% | 55.1% | -0.8% | 2.0% | PASS |
| ±1.5 | 162 | 93/50.5% | 69/69.6% | 58.6% | 5.6% | 8.5% | GO |
| ±2 | 117 | 68/47.1% | 49/69.4% | 56.4% | 1.5% | 4.4% | MARGINAL |
| ±2.5 | 90 | 46/52.2% | 44/68.2% | 60.0% | 8.0% | 11.0% | GO |
| ±3 | 69 | 33/60.6% | 36/66.7% | 63.8% | 14.8% | 18.0% | GO |

### CBLOL (129 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 111 | 73/50.7% | 38/60.5% | 54.0% | -2.7% | 0.0% | PASS |
| ±1 | 92 | 65/50.8% | 27/70.4% | 56.5% | 1.7% | 4.6% | MARGINAL |
| ±1.5 | 65 | 45/48.9% | 20/70.0% | 55.4% | -0.3% | 2.5% | PASS |
| ±2 | 45 | 31/41.9% | 14/85.7% | 55.6% | 0.0% | 2.8% | PASS |
| ±2.5 | 35 | 26/46.2% | 9/77.8% | 54.3% | -2.3% | 0.4% | PASS |
| ±3 | 22 | 18/55.6% | 4/75.0% | 59.1% | 6.4% | 9.3% | GO |

### LEC (198 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 168 | 85/56.5% | 83/50.6% | 53.6% | -3.6% | -0.9% | PASS |
| ±1 | 131 | 73/56.2% | 58/55.2% | 55.7% | 0.3% | 3.1% | MARGINAL |
| ±1.5 | 108 | 61/55.7% | 47/55.3% | 55.6% | 0.0% | 2.8% | PASS |
| ±2 | 77 | 40/57.5% | 37/56.8% | 57.1% | 2.9% | 5.7% | MARGINAL |
| ±2.5 | 45 | 23/56.5% | 22/54.5% | 55.6% | 0.0% | 2.8% | PASS |
| ±3 | 25 | 18/44.4% | 7/57.1% | 48.0% | -13.6% | -11.2% | PASS |

### LCS (108 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 93 | 47/57.5% | 46/65.2% | 61.3% | 10.3% | 13.4% | GO |
| ±1 | 69 | 32/53.1% | 37/62.2% | 58.0% | 4.3% | 7.2% | MARGINAL |
| ±1.5 | 50 | 22/59.1% | 28/60.7% | 60.0% | 8.0% | 11.0% | GO |
| ±2 | 45 | 20/60.0% | 25/68.0% | 64.4% | 16.0% | 19.2% | GO |
| ±2.5 | 34 | 18/55.6% | 16/68.8% | 61.8% | 11.2% | 14.3% | GO |
| ±3 | 23 | 16/56.3% | 7/71.4% | 60.9% | 9.6% | 12.6% | GO |

## METODO B — L1 Pre-Draft como Linha da Casa

Casa = L1 arredondado para x.5. Sinal = delta do draft (L2 - L1). Testa se picks agregam valor.

### Geral (todas as ligas)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 436 | 268/58.2% | 168/68.5% | 62.2% | 11.9% | 15.0% | GO |
| ±1 | 187 | 122/64.8% | 65/66.1% | 65.2% | 17.4% | 20.7% | GO |
| ±1.5 | 59 | 39/64.1% | 20/75.0% | 67.8% | 22.0% | 25.4% | GO |
| ±2 | 19 | 13/76.9% | 6/83.3% | 79.0% | 42.1% | 46.1% | SAMPLE PEQUENO |
| ±2.5 | 4 | 1/100.0% | 3/100.0% | 100.0% | 80.0% | 85.0% | SAMPLE PEQUENO |
| ±3 | 0 | - | - | - | - | - | PASS |

### LCK (150 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 72 | 15/60.0% | 57/64.9% | 63.9% | 15.0% | 18.2% | GO |
| ±1 | 25 | 5/100.0% | 20/60.0% | 68.0% | 22.4% | 25.8% | GO |
| ±1.5 | 3 | 0/- | 3/66.7% | 66.7% | 20.0% | 23.3% | SAMPLE PEQUENO |
| ±2 | 1 | 0/- | 1/100.0% | 100.0% | 80.0% | 85.0% | SAMPLE PEQUENO |
| ±2.5 | 0 | - | - | - | - | - | PASS |
| ±3 | 0 | - | - | - | - | - | PASS |

### LPL (270 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 160 | 126/60.3% | 34/79.4% | 64.4% | 15.9% | 19.1% | GO |
| ±1 | 87 | 79/63.3% | 8/100.0% | 66.7% | 20.0% | 23.3% | GO |
| ±1.5 | 35 | 32/62.5% | 3/100.0% | 65.7% | 18.3% | 21.6% | GO |
| ±2 | 13 | 12/75.0% | 1/100.0% | 76.9% | 38.5% | 42.3% | SAMPLE PEQUENO |
| ±2.5 | 2 | 1/100.0% | 1/100.0% | 100.0% | 80.0% | 85.0% | SAMPLE PEQUENO |
| ±3 | 0 | - | - | - | - | - | PASS |

### CBLOL (129 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 53 | 46/45.6% | 7/57.1% | 47.2% | -15.1% | -12.7% | PASS |
| ±1 | 15 | 14/57.1% | 1/0.0% | 53.3% | -4.0% | -1.3% | SAMPLE PEQUENO |
| ±1.5 | 3 | 3/66.7% | 0/- | 66.7% | 20.0% | 23.3% | SAMPLE PEQUENO |
| ±2 | 0 | - | - | - | - | - | PASS |
| ±2.5 | 0 | - | - | - | - | - | PASS |
| ±3 | 0 | - | - | - | - | - | PASS |

### LEC (198 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 112 | 56/58.9% | 56/62.5% | 60.7% | 9.3% | 12.3% | GO |
| ±1 | 50 | 19/68.4% | 31/58.1% | 62.0% | 11.6% | 14.7% | GO |
| ±1.5 | 17 | 4/75.0% | 13/69.2% | 70.6% | 27.1% | 30.6% | SAMPLE PEQUENO |
| ±2 | 5 | 1/100.0% | 4/75.0% | 80.0% | 44.0% | 48.0% | SAMPLE PEQUENO |
| ±2.5 | 2 | 0/- | 2/100.0% | 100.0% | 80.0% | 85.0% | SAMPLE PEQUENO |
| ±3 | 0 | - | - | - | - | - | PASS |

### LCS (108 jogos testados)

| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |
|---:|---:|---|---|---:|---:|---:|---|
| ±0.5 | 39 | 25/68.0% | 14/85.7% | 74.4% | 33.9% | 37.6% | GO |
| ±1 | 10 | 5/60.0% | 5/100.0% | 80.0% | 44.0% | 48.0% | SAMPLE PEQUENO |
| ±1.5 | 1 | 0/- | 1/100.0% | 100.0% | 80.0% | 85.0% | SAMPLE PEQUENO |
| ±2 | 0 | - | - | - | - | - | PASS |
| ±2.5 | 0 | - | - | - | - | - | PASS |
| ±3 | 0 | - | - | - | - | - | PASS |

## Decisão: Quando Apostar?

Use esta tabela para escolher liga + threshold + método com GO ou MARGINAL e sample >= 20.
Comece com unidades pequenas (1-2% da banca) em ligas com sinal GO confirmado.
Registre cada aposta no app para calcular ROI real vs casas reais.

