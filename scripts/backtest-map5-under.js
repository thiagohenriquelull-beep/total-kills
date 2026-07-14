/**
 * Teste especifico: usar apenas mapa 5 de BO5 como sinal under.
 *
 * Compara:
 * - baseline atual
 * - ajuste na previsao somente em BO5 G5
 * - regra bruta: apostar under em todo BO5 G5 contra a linha pre-draft
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");
const {
  DEFAULT_BET_POLICY,
  evaluateBetSide,
  classifyDecision,
  summarize,
} = require("./backtest-final-rule.js");
const { buildMapContext } = require("./backtest-map-context-adjustment.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const ODDS = 1.8;
const DEFAULT_SIGMA = 6.4;
const DEFAULT_EDGE_THRESHOLD = 1.0;
const MAP5_ADJUSTMENTS = [0, -0.5, -1.0, -1.25, -1.5, -1.75, -2.0, -2.5];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return sign * y;
}

function normalCdf(x, mu, sigma) {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))));
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    const file = path.join(DATA_DIR, `expanded-${league}.json`);
    if (fs.existsSync(file)) games.push(...readJson(file).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function actualSide(totalKills, line) {
  if (totalKills > line) return "over";
  if (totalKills < line) return "under";
  return "push";
}

function isMap5(context) {
  return context?.format === "BO5" && Number(context.mapNumber) === 5;
}

function runAdjustment(games, mapContext, adjustment) {
  const rows = [];
  for (const league of LEAGUES) {
    const chronological = games
      .filter((game) => game.league === league)
      .sort(Model.sortRecent)
      .reverse();

    for (let index = 0; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      if (train.length < MIN_TRAIN) continue;

      const model = Model.buildModel(train);
      const house = model.houseLine(game, train);
      const context = mapContext.get(String(game.id || ""));
      const map5Adjustment = isMap5(context) ? adjustment : 0;
      const line = house.preLine;
      const basePrediction = house.post.prediction + (house.calibration.adjustment || 0);
      const prediction = basePrediction + map5Adjustment;
      const edge = prediction - line;
      const sigma = house.post.sigma || model.leagueSigmas.get(league) || DEFAULT_SIGMA;
      const overProbability = 1 - normalCdf(line, prediction, sigma);
      const underProbability = 1 - overProbability;
      const overEval = evaluateBetSide("over", overProbability, ODDS, edge, DEFAULT_EDGE_THRESHOLD, DEFAULT_BET_POLICY);
      const underEval = evaluateBetSide("under", underProbability, ODDS, edge, DEFAULT_EDGE_THRESHOLD, DEFAULT_BET_POLICY);
      const decision = classifyDecision(overEval, underEval);
      const side = actualSide(game.totalKills, line);
      const isBet = Boolean(decision.side && side !== "push");
      const correct = isBet ? decision.side === side : null;
      const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;

      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        line,
        basePrediction: r(basePrediction),
        prediction: r(prediction),
        adjustment,
        map5Adjustment,
        isMap5: isMap5(context),
        edge: r(edge),
        evOver: r(overEval.ev, 4),
        evUnder: r(underEval.ev, 4),
        decisionSide: decision.side,
        decisionReason: decision.reason,
        actualSide: side,
        correct,
        profit: r(profit, 4),
        error: r(prediction - game.totalKills, 4),
      });
    }
  }
  return rows;
}

function runAlwaysUnderMap5(games, mapContext) {
  const rows = [];
  for (const league of LEAGUES) {
    const chronological = games
      .filter((game) => game.league === league)
      .sort(Model.sortRecent)
      .reverse();

    for (let index = 0; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      if (train.length < MIN_TRAIN) continue;
      const context = mapContext.get(String(game.id || ""));
      if (!isMap5(context)) continue;

      const model = Model.buildModel(train);
      const house = model.houseLine(game, train);
      const side = actualSide(game.totalKills, house.preLine);
      const isBet = side !== "push";
      const correct = isBet ? side === "under" : null;
      const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;
      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        line: house.preLine,
        decisionSide: "under",
        actualSide: side,
        correct,
        profit: r(profit, 4),
      });
    }
  }
  return rows;
}

function predictionSummary(rows) {
  const errors = rows.map((row) => row.error).filter(Number.isFinite);
  if (!errors.length) return { rows: rows.length, mae: null, bias: null };
  return {
    rows: rows.length,
    mae: r(errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length, 4),
    bias: r(errors.reduce((sum, value) => sum + value, 0) / errors.length, 4),
  };
}

function withPrediction(stats, rows) {
  return { ...stats, prediction: predictionSummary(rows) };
}

function byLeague(rows) {
  const groups = {};
  for (const row of rows) {
    if (!groups[row.league]) groups[row.league] = [];
    groups[row.league].push(row);
  }
  return Object.fromEntries(Object.entries(groups).map(([league, list]) => [league, withPrediction(summarize(list), list)]));
}

function summaryLine(label, stats) {
  return `| ${label} | ${stats.rows} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.profit ?? "-"} | ${stats.prediction?.mae ?? "-"} | ${stats.prediction?.bias ?? "-"} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Backtest Mapa 5 Under");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, minimo ${MIN_TRAIN} jogos. Linha simulada = pre-draft do modelo atual. Odd ${ODDS.toFixed(2)}.`);
  lines.push("");
  lines.push("## Ajuste So No BO5 Mapa 5");
  lines.push("");
  lines.push("| Ajuste G5 | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.adjustments) {
    lines.push(summaryLine(item.adjustment.toFixed(2), item.overall));
  }
  lines.push("");
  lines.push("## Apenas BO5 Mapa 5");
  lines.push("");
  lines.push("| Ajuste G5 | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.adjustments) {
    lines.push(summaryLine(item.adjustment.toFixed(2), item.map5Only));
  }
  lines.push("");
  lines.push("## Regra Bruta");
  lines.push("");
  lines.push("| Regra | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  lines.push(summaryLine("Apostar UNDER todo BO5 G5", report.alwaysUnderMap5));
  lines.push("");
  lines.push("## Por Liga Na Regra Bruta");
  lines.push("");
  lines.push("| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [league, stats] of Object.entries(report.alwaysUnderByLeague)) {
    lines.push(summaryLine(league, stats));
  }
  lines.push("");
  lines.push("## Conclusao");
  lines.push("");
  const best = report.adjustments.slice().sort((a, b) => (b.map5Only.roi ?? -99) - (a.map5Only.roi ?? -99))[0];
  lines.push(`Melhor ajuste no recorte BO5 G5: ${best.adjustment.toFixed(2)}, ROI ${pct(best.map5Only.roi)}, ${best.map5Only.bets} bets.`);
  lines.push(`Regra bruta under em todo BO5 G5: ROI ${pct(report.alwaysUnderMap5.roi)}, ${report.alwaysUnderMap5.bets} bets.`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const mapContext = buildMapContext(games);
  const adjustments = [];
  const allRows = [];

  for (const adjustment of MAP5_ADJUSTMENTS) {
    const rows = runAdjustment(games, mapContext, adjustment);
    allRows.push(...rows.map((row) => ({ ...row, variant: `g5-${adjustment}` })));
    adjustments.push({
      adjustment,
      overall: withPrediction(summarize(rows), rows),
      map5Only: withPrediction(summarize(rows.filter((row) => row.isMap5)), rows.filter((row) => row.isMap5)),
      byLeague: byLeague(rows),
    });
  }

  const alwaysRows = runAlwaysUnderMap5(games, mapContext);
  const report = {
    createdAt: new Date().toISOString(),
    adjustments,
    alwaysUnderMap5: withPrediction(summarize(alwaysRows), alwaysRows),
    alwaysUnderByLeague: byLeague(alwaysRows),
  };

  writeJson(path.join(DATA_DIR, "map5-under-backtest.json"), { report, rows: allRows, alwaysUnderRows: alwaysRows });
  fs.writeFileSync(path.join(DATA_DIR, "map5-under-backtest.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
