# Draft Signal Policy Tuning

Gerado em: 2026-05-26T09:59:30.356Z
Metodo: walk-forward. Thresholds treinados em jogos anteriores e validados nos jogos mais recentes de cada liga.
Objetivo: separar drafts OVER, UNDER e NEUTRO contra a linha pre-draft, sem usar tempo, gold, side ou bans.

## Politica Recomendada Com Gating

| Liga | Conf min | Over | Under | Bloqueios | Acoes val | OVER desvio/% | NEUTRO desvio/% | UNDER desvio/% |
|---|---:|---:|---:|---|---:|---|---|---|
| LCK | 0.55 | 0.50 | bloq | under | 8/56 | 8j / +8.13 / 87.5% | 48j / -1.15 / 56.3% | 0j / +0.00 / 0.0% |
| LCKCL | 0.55 | bloq | bloq | over, under | 0/60 | 0j / +0.00 / 0.0% | 60j / +1.37 / 56.7% | 0j / +0.00 / 0.0% |
| LPL | 0.55 | 1.00 | bloq | under | 20/60 | 20j / +4.90 / 65.0% | 40j / -0.90 / 57.5% | 0j / +0.00 / 0.0% |
| CBLOL | 0.65 | bloq | bloq | over, under | 0/48 | 0j / +0.00 / 0.0% | 48j / +0.88 / 50.0% | 0j / +0.00 / 0.0% |
| LEC | 0.10 | bloq | bloq | over, under | 0/60 | 0j / +0.00 / 0.0% | 60j / +0.52 / 51.7% | 0j / +0.00 / 0.0% |
| LCS | 0.55 | bloq | bloq | over, under | 0/41 | 0j / +0.00 / 0.0% | 41j / -0.91 / 53.7% | 0j / +0.00 / 0.0% |

## Tuning Bruto Antes Do Gating

| Liga | Conf min | Over th | Under th | Acoes val | OVER desvio/% | NEUTRO desvio/% | UNDER desvio/% | Score treino |
|---|---:|---:|---:|---:|---|---|---|---:|
| LCK | 0.55 | 0.50 | 0.50 | 32/56 | 8j / +8.13 / 87.5% | 24j / -1.21 / 62.5% | 24j / -1.08 / 50.0% | 30.57 |
| LCKCL | 0.55 | 0.50 | 1.00 | 38/60 | 33j / +3.53 / 54.5% | 22j / -1.82 / 72.7% | 5j / +1.10 / 60.0% | 54.93 |
| LPL | 0.55 | 1.00 | 0.50 | 28/60 | 20j / +4.90 / 65.0% | 32j / -1.16 / 59.4% | 8j / +0.13 / 50.0% | 49.91 |
| CBLOL | 0.65 | 0.50 | 0.50 | 15/48 | 13j / +2.19 / 46.2% | 33j / +0.50 / 51.5% | 2j / -1.50 / 50.0% | 11.77 |
| LEC | 0.10 | 0.50 | 0.50 | 43/60 | 1j / -5.50 / 0.0% | 17j / +1.62 / 58.8% | 42j / +0.21 / 47.6% | 50.70 |
| LCS | 0.55 | 0.50 | 0.75 | 10/41 | 7j / -2.50 / 57.1% | 31j / +0.05 / 54.8% | 3j / -7.17 / 66.7% | 34.29 |

## Politica JS Recomendada

```js
{
  "minDraftConfidence": 0.55,
  "sideThresholds": {
    "LCK": {
      "over": 0.5,
      "under": 99
    },
    "LCKCL": {
      "over": 99,
      "under": 99
    },
    "LPL": {
      "over": 1,
      "under": 99
    },
    "CBLOL": {
      "over": 99,
      "under": 99
    },
    "LEC": {
      "over": 99,
      "under": 99
    },
    "LCS": {
      "over": 99,
      "under": 99
    }
  }
}
```

