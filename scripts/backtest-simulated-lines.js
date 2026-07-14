/**
 * Backtest com linhas simuladas realistas.
 *
 * Dois métodos, ambos walk-forward:
 *
 * METODO A — Mediana Móvel como Linha da Casa
 *   Casa = mediana dos últimos MEDIAN_WINDOW kills da liga (jogos anteriores).
 *   Nosso sinal = L2 (picks completos). Edge = L2 - casa.
 *   Testa se o modelo COMPLETO supera uma linha naïve.
 *
 * METODO B — L1 Pré-Draft como Linha da Casa
 *   Casa = L1 (previsão pré-draft), arredondada para x.5.
 *   Nosso sinal = delta do draft (L2 - L1).
 *   Testa se a INFORMAÇÃO DO DRAFT acrescenta algo acima do que já sabíamos.
 *
 * Para cada método, varremos thresholds de edge e reportamos:
 *   - Qtd de apostas OVER / UNDER / total
 *   - Hit rate (% acerto)
 *   - ROI a odds 1.80 e 1.85
 *   - Sinal GO/PASS por liga e threshold
 *
 * Break-even: 55.6% @ 1.80 | 54.1% @ 1.85
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;

const MIN_TRAIN = 30;
const MEDIAN_WINDOW = 25;
const EDGE_THRESHOLDS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
const ODDS = [1.80, 1.85];
const BREAK_EVEN = { 1.80: 1 / 1.80, 1.85: 1 / 1.85 };

// ─── helpers ──────────────────────────────────────────────────────────────────

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function r(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function rollingMedian(values, window) {
  if (!values.length) return null;
  const recent = values.slice(-window);
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundLine(v) {
  return Math.floor(v) + 0.5;
}

function roiAt(odds, correct, total) {
  if (!total) return null;
  const profit = correct * (odds - 1) - (total - correct);
  return r(profit / total, 4);
}

function sliceStats(bets) {
  if (!bets.length) return null;
  const correct = bets.filter((b) => b.correct).length;
  const hitRate = correct / bets.length;
  const stats = {
    bets: bets.length,
    correct,
    hitRate: r(hitRate, 4),
  };
  for (const odds of ODDS) {
    stats[`roi${odds.toFixed(2).replace(".", "_")}`] = roiAt(odds, correct, bets.length);
  }
  return stats;
}

function goSignal(stats) {
  if (!stats || stats.bets < 20) return "SAMPLE PEQUENO";
  if (stats.roi1_80 > 0.05) return "GO";
  if (stats.roi1_80 > 0) return "MARGINAL";
  return "PASS";
}

// ─── coleta de jogos ──────────────────────────────────────────────────────────

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    const file = path.join(DATA_DIR, `expanded-${league}.json`);
    games.push(...readJson(file).games);
  }
  return games.filter((g) => LEAGUES.includes(g.league) && Number.isFinite(g.totalKills));
}

// ─── núcleo do backtest ───────────────────────────────────────────────────────

function runBacktest(games, method) {
  const rows = [];

  for (const league of LEAGUES) {
    const chronological = games
      .filter((g) => g.league === league)
      .sort(Model.sortRecent)
      .reverse();

    const pastKills = [];

    for (let i = 0; i < chronological.length; i++) {
      const game = chronological[i];
      const train = chronological.slice(0, i);

      if (train.length < MIN_TRAIN) {
        pastKills.push(game.totalKills);
        continue;
      }

      const model = Model.buildModel(train);
      const l1 = model.predictPreDraft(game);
      const l2 = model.predictWithDraft(game);

      let houseLine, edge;
      if (method === "A") {
        const med = rollingMedian(pastKills, MEDIAN_WINDOW);
        if (med === null) { pastKills.push(game.totalKills); continue; }
        houseLine = roundLine(med);
        edge = l2.prediction - houseLine;
      } else {
        houseLine = roundLine(l1.prediction);
        edge = l2.prediction - houseLine;
      }

      const actual = game.totalKills;
      const actualSide = actual > houseLine ? "over" : actual < houseLine ? "under" : "push";

      rows.push({
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual,
        houseLine,
        l1: r(l1.prediction),
        l2: r(l2.prediction),
        edge: r(edge),
        actualSide,
        trainGames: train.length,
      });

      pastKills.push(game.totalKills);
    }
  }

  return rows;
}

// ─── análise de thresholds ────────────────────────────────────────────────────

function analyzeThreshold(rows, threshold) {
  const betsOver = rows.filter((row) => row.edge >= threshold && row.actualSide !== "push");
  const betsUnder = rows.filter((row) => row.edge <= -threshold && row.actualSide !== "push");

  const overCorrect = betsOver.filter((b) => b.actualSide === "over");
  const underCorrect = betsUnder.filter((b) => b.actualSide === "under");

  const allBets = [
    ...betsOver.map((b) => ({ ...b, ourSide: "over", correct: b.actualSide === "over" })),
    ...betsUnder.map((b) => ({ ...b, ourSide: "under", correct: b.actualSide === "under" })),
  ];

  return {
    threshold,
    over: sliceStats(betsOver.map((b) => ({ correct: b.actualSide === "over" }))),
    under: sliceStats(betsUnder.map((b) => ({ correct: b.actualSide === "under" }))),
    combined: sliceStats(allBets),
    totalRows: rows.length,
  };
}

function analyzeLeague(rows, league) {
  const leagueRows = rows.filter((r) => r.league === league);
  return EDGE_THRESHOLDS.map((t) => analyzeThreshold(leagueRows, t));
}

function analyzeAll(rows) {
  return EDGE_THRESHOLDS.map((t) => analyzeThreshold(rows, t));
}

// ─── markdown ─────────────────────────────────────────────────────────────────

function methodLabel(method) {
  return method === "A"
    ? "METODO A — Mediana Movel como Linha da Casa"
    : "METODO B — L1 Pre-Draft como Linha da Casa";
}

function methodDesc(method) {
  return method === "A"
    ? `Casa = mediana movel dos ultimos ${MEDIAN_WINDOW} kills da liga. Sinal = L2 (picks completos). Edge = L2 - mediana.`
    : "Casa = L1 arredondado para x.5. Sinal = delta do draft (L2 - L1). Testa se picks agregam valor.";
}

function thresholdTable(thresholds, label) {
  const lines = [];
  lines.push(`### ${label}`);
  lines.push("");
  lines.push("| Threshold | Apostas | Over (n/hit) | Under (n/hit) | Hit% | ROI 1.80 | ROI 1.85 | Sinal |");
  lines.push("|---:|---:|---|---|---:|---:|---:|---|");

  for (const t of thresholds) {
    const c = t.combined;
    if (!c) {
      lines.push(`| ±${t.threshold} | 0 | - | - | - | - | - | PASS |`);
      continue;
    }
    const over = t.over ? `${t.over.bets}/${pct(t.over.hitRate)}` : "0/-";
    const under = t.under ? `${t.under.bets}/${pct(t.under.hitRate)}` : "0/-";
    const roi80 = c.roi1_80 !== null ? pct(c.roi1_80) : "-";
    const roi85 = c.roi1_85 !== null ? pct(c.roi1_85) : "-";
    lines.push(`| ±${t.threshold} | ${c.bets} | ${over} | ${under} | ${pct(c.hitRate)} | ${roi80} | ${roi85} | ${goSignal(c)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildMarkdown(resultA, resultB) {
  const lines = [];
  lines.push("# Backtest com Linhas Simuladas");
  lines.push("");
  lines.push(`Gerado em: ${new Date().toISOString()}`);
  lines.push(`Metodo: walk-forward. Minimo ${MIN_TRAIN} jogos de treino por jogo.`);
  lines.push(`Jogos testados: Metodo A = ${resultA.allRows.length}, Metodo B = ${resultB.allRows.length}`);
  lines.push("");
  lines.push("Break-even: **55.6%** @ 1.80 | **54.1%** @ 1.85");
  lines.push("Sinal GO = ROI > 5% @ 1.80 | MARGINAL = ROI > 0% @ 1.80 | PASS = ROI <= 0%");
  lines.push("");

  for (const [result, method] of [[resultA, "A"], [resultB, "B"]]) {
    lines.push(`## ${methodLabel(method)}`);
    lines.push("");
    lines.push(methodDesc(method));
    lines.push("");
    lines.push(thresholdTable(result.overall, "Geral (todas as ligas)"));

    for (const league of LEAGUES) {
      const leagueThresholds = result.byLeague[league];
      lines.push(thresholdTable(leagueThresholds, `${league} (${result.allRows.filter(r => r.league === league).length} jogos testados)`));
    }
  }

  lines.push("## Decisão: Quando Apostar?");
  lines.push("");
  lines.push("Use esta tabela para escolher liga + threshold + método com GO ou MARGINAL e sample >= 20.");
  lines.push("Comece com unidades pequenas (1-2% da banca) em ligas com sinal GO confirmado.");
  lines.push("Registre cada aposta no app para calcular ROI real vs casas reais.");
  lines.push("");

  return lines.join("\n") + "\n";
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("Carregando jogos...");
  const games = loadGames();
  console.log(`Total: ${games.length} jogos`);

  console.log("Rodando Metodo A (mediana movel)...");
  const rowsA = runBacktest(games, "A");
  console.log(`  ${rowsA.length} jogos avaliados`);

  console.log("Rodando Metodo B (L1 como linha)...");
  const rowsB = runBacktest(games, "B");
  console.log(`  ${rowsB.length} jogos avaliados`);

  const resultA = {
    method: "A",
    allRows: rowsA,
    overall: analyzeAll(rowsA),
    byLeague: Object.fromEntries(LEAGUES.map((l) => [l, analyzeLeague(rowsA, l)])),
  };

  const resultB = {
    method: "B",
    allRows: rowsB,
    overall: analyzeAll(rowsB),
    byLeague: Object.fromEntries(LEAGUES.map((l) => [l, analyzeLeague(rowsB, l)])),
  };

  const report = {
    createdAt: new Date().toISOString(),
    config: { minTrain: MIN_TRAIN, medianWindow: MEDIAN_WINDOW, thresholds: EDGE_THRESHOLDS, odds: ODDS },
    methodA: {
      description: methodDesc("A"),
      overall: resultA.overall,
      byLeague: resultA.byLeague,
    },
    methodB: {
      description: methodDesc("B"),
      overall: resultB.overall,
      byLeague: resultB.byLeague,
    },
  };

  writeJson(path.join(DATA_DIR, "simulated-lines-backtest.json"), report);
  const md = buildMarkdown(resultA, resultB);
  fs.writeFileSync(path.join(DATA_DIR, "simulated-lines-backtest.md"), md, "utf8");

  // resumo rápido no console
  console.log("\n=== RESUMO METODO A ===");
  for (const t of resultA.overall) {
    const c = t.combined;
    if (!c) continue;
    const roi = c.roi1_80 !== null ? `ROI 1.80=${pct(c.roi1_80)}` : "";
    console.log(`  threshold ±${t.threshold}: ${c.bets} apostas, ${pct(c.hitRate)} acerto ${roi} [${goSignal(c)}]`);
  }

  console.log("\n=== RESUMO METODO B ===");
  for (const t of resultB.overall) {
    const c = t.combined;
    if (!c) continue;
    const roi = c.roi1_80 !== null ? `ROI 1.80=${pct(c.roi1_80)}` : "";
    console.log(`  threshold ±${t.threshold}: ${c.bets} apostas, ${pct(c.hitRate)} acerto ${roi} [${goSignal(c)}]`);
  }

  console.log(`\nSalvo em data/simulated-lines-backtest.md`);
}

main();
