const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const TESTS_PER_LEAGUE = 60;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function lineResult(actual, line) {
  if (actual > line) return "over";
  if (actual < line) return "under";
  return "push";
}

function directionCorrect(row) {
  if (row.lean === "neutral") return null;
  return row.actualSideVsPreLine === row.lean;
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function pickSummary(effects) {
  return effects
    .map((effect) => ({
      champion: effect.champion,
      role: effect.role,
      value: round(effect.value),
      n: effect.n,
      source: effect.source,
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5);
}

function runHouseLineEvaluation(games) {
  const rows = [];

  for (const league of LEAGUES) {
    const chronological = games.filter((game) => game.league === league).sort(Model.sortRecent).reverse();
    const start = Math.max(0, chronological.length - TESTS_PER_LEAGUE);

    for (let index = start; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      if (train.length < 20) continue;

      const model = Model.buildModel(train);
      const house = model.houseLine(game, train);
      const pre = house.pre;
      const post = house.post;
      const preLine = house.preLine;
      const postLine = house.postLine;
      const delta = house.delta;
      const lean = house.signal.lean;
      const actualSideVsPreLine = lineResult(game.totalKills, preLine);
      const actualSideVsPostLine = lineResult(game.totalKills, postLine);

      const row = {
        id: game.id,
        league,
        date: game.date,
        game: `${game.teamA} vs ${game.teamB}`,
        teamA: game.teamA,
        teamB: game.teamB,
        actual: game.totalKills,
        prePrediction: round(pre.prediction),
        preLine,
        postPrediction: round(post.prediction),
        postLine,
        delta: round(delta),
        changedLine: postLine !== preLine,
        lean,
        signalReason: house.signal.reason,
        signalThreshold: house.signal.threshold,
        lineAdjustment: round(house.calibration.adjustment),
        lineAdjustmentN: house.calibration.n,
        lineCalibrationOverRate: round(house.calibration.overRateBefore, 4),
        actualSideVsPreLine,
        actualSideVsPostLine,
        correct: null,
        draftConfidence: round(post.draft.confidence || 0, 3),
        topPickEffects: pickSummary(post.draft.effects || []),
      };
      row.correct = directionCorrect(row);
      rows.push(row);
    }
  }

  return rows;
}

function summarize(rows) {
  const actionRows = rows.filter((row) => row.lean !== "neutral");
  const movedRows = rows.filter((row) => row.changedLine);
  const correctRows = actionRows.filter((row) => row.correct === true);
  const wrongRows = actionRows.filter((row) => row.correct === false);
  const theoreticalProfit = correctRows.length * 0.8 - wrongRows.length;
  return {
    games: rows.length,
    actionGames: actionRows.length,
    neutralGames: rows.length - actionRows.length,
    movedLineGames: movedRows.length,
    actionRate: round(actionRows.length / rows.length, 4),
    movedLineRate: round(movedRows.length / rows.length, 4),
    directionAccuracy: actionRows.length ? round(correctRows.length / actionRows.length, 4) : 0,
    theoreticalRoiAt180: actionRows.length ? round(theoreticalProfit / actionRows.length, 4) : 0,
    theoreticalProfitAt180: round(theoreticalProfit),
    correct: correctRows.length,
    wrong: wrongRows.length,
    avgPreLine: round(mean(rows.map((row) => row.preLine))),
    avgPostLine: round(mean(rows.map((row) => row.postLine))),
    avgActual: round(mean(rows.map((row) => row.actual))),
    avgDelta: round(mean(rows.map((row) => row.delta))),
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = [
    "league",
    "date",
    "game",
    "actual",
    "prePrediction",
    "preLine",
    "postPrediction",
    "postLine",
    "delta",
    "changedLine",
    "lean",
    "actualSideVsPreLine",
    "correct",
    "draftConfidence",
    "lineAdjustment",
    "signalThreshold",
    "signalReason",
    "topPickEffects",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.league,
      row.date,
      row.game,
      row.actual,
      row.prePrediction,
      row.preLine,
      row.postPrediction,
      row.postLine,
      row.delta,
      row.changedLine,
      row.lean,
      row.actualSideVsPreLine,
      row.correct,
      row.draftConfidence,
      row.lineAdjustment,
      row.signalThreshold,
      row.signalReason,
      row.topPickEffects.map((effect) => `${effect.role} ${effect.champion} ${effect.value >= 0 ? "+" : ""}${effect.value}`).join(" | "),
    ].map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows) {
  const lines = [];
  lines.push("# House Line Draft Evaluation");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, ${TESTS_PER_LEAGUE} jogos por liga, sem usar linha real da casa.`);
  lines.push("Regra: modelo abre linha pre-draft calibrada por liga, ve picks, aplica politica por liga/lado e mede se o sinal bateu o resultado sobre/baixo da linha pre-draft.");
  lines.push("");
  lines.push("## Resumo");
  lines.push("");
  lines.push("| Liga | Jogos | Acoes | Mudou linha | Acerto direcional | ROI 1.80 | Certos | Errados | Linha pre | Linha pos | Real medio |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.games} | ${item.actionGames} | ${item.movedLineGames} | ${(item.directionAccuracy * 100).toFixed(1)}% | ${(item.theoreticalRoiAt180 * 100).toFixed(1)}% | ${item.correct} | ${item.wrong} | ${item.avgPreLine.toFixed(2)} | ${item.avgPostLine.toFixed(2)} | ${item.avgActual.toFixed(2)} |`);
  }
  lines.push(`| Geral | ${report.overall.games} | ${report.overall.actionGames} | ${report.overall.movedLineGames} | ${(report.overall.directionAccuracy * 100).toFixed(1)}% | ${(report.overall.theoreticalRoiAt180 * 100).toFixed(1)}% | ${report.overall.correct} | ${report.overall.wrong} | ${report.overall.avgPreLine.toFixed(2)} | ${report.overall.avgPostLine.toFixed(2)} | ${report.overall.avgActual.toFixed(2)} |`);
  lines.push("");
  lines.push("## Jogos");
  lines.push("");
  lines.push("| Liga | Jogo | Real | Linha pre | Linha pos | Adj | Delta | Lean | Motivo | Resultado vs pre | Acertou | Picks principais |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|");
  for (const row of rows) {
    const picks = row.topPickEffects.map((effect) => `${effect.role} ${effect.champion} ${effect.value >= 0 ? "+" : ""}${effect.value}`).join("; ");
    lines.push(`| ${row.league} | ${row.game} | ${row.actual} | ${row.preLine.toFixed(1)} | ${row.postLine.toFixed(1)} | ${row.lineAdjustment >= 0 ? "+" : ""}${row.lineAdjustment.toFixed(2)} | ${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(2)} | ${row.lean} | ${row.signalReason} | ${row.actualSideVsPreLine} | ${row.correct === null ? "-" : row.correct ? "sim" : "nao"} | ${picks} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const rows = runHouseLineEvaluation(loadGames());
  const report = {
    createdAt: new Date().toISOString(),
    testsPerLeague: TESTS_PER_LEAGUE,
    housePolicy: Model.DEFAULT_HOUSE_POLICY,
    byLeague: LEAGUES.map((league) => ({ league, ...summarize(rows.filter((row) => row.league === league)) })),
    overall: summarize(rows),
  };
  writeJson(path.join(DATA_DIR, "house-line-evaluation.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "house-line-evaluation.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "house-line-evaluation.md"), buildMarkdown(report, rows), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();

module.exports = { runHouseLineEvaluation, summarize, main };
