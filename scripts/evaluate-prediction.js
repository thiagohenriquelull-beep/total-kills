const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const TESTS_PER_LEAGUE = 15;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rmse(errors) {
  return Math.sqrt(mean(errors.map((error) => error ** 2)));
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function stats(rows, key) {
  if (!rows.length) {
    return { n: 0, avgExpected: 0, avgActual: 0, bias: 0, mae: 0, rmse: 0, within2: 0, within3: 0, within5: 0 };
  }
  const signed = rows.map((row) => row[key] - row.actual);
  const abs = signed.map(Math.abs);
  return {
    n: rows.length,
    avgExpected: round(mean(rows.map((row) => row[key]))),
    avgActual: round(mean(rows.map((row) => row.actual))),
    bias: round(mean(signed)),
    mae: round(mean(abs)),
    rmse: round(rmse(signed)),
    within2: round(abs.filter((error) => error <= 2).length / rows.length, 4),
    within3: round(abs.filter((error) => error <= 3).length / rows.length, 4),
    within5: round(abs.filter((error) => error <= 5).length / rows.length, 4),
  };
}

function summarize(rows) {
  return {
    tests: rows.length,
    baseline: stats(rows, "baseline"),
    preDraft: stats(rows, "preDraft"),
    postDraft: stats(rows, "postDraft"),
    postMinusPreMae: round(stats(rows, "postDraft").mae - stats(rows, "preDraft").mae),
    preMinusBaselineMae: round(stats(rows, "preDraft").mae - stats(rows, "baseline").mae),
  };
}

function runWalkForward(games) {
  const rows = [];

  for (const league of LEAGUES) {
    const chronological = games.filter((game) => game.league === league).sort(Model.sortRecent).reverse();
    const start = Math.max(0, chronological.length - TESTS_PER_LEAGUE);

    for (let index = start; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      if (train.length < 20) continue;

      const trainLeague = train.filter((item) => item.league === league).sort(Model.sortRecent);
      const recent = trainLeague.slice(0, 25);
      const baseline = mean((recent.length ? recent : trainLeague).map((item) => item.totalKills));
      const model = Model.buildModel(train);
      const pre = model.predictPreDraft(game);
      const post = model.predictWithDraft(game);
      const draftDelta = post.prediction - pre.prediction;

      rows.push({
        id: game.id,
        league,
        date: game.date,
        patch: game.patch,
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        baseline,
        preDraft: pre.prediction,
        postDraft: post.prediction,
        draftDelta,
        draftConfidence: post.draft.confidence || 0,
        draftCount: post.draft.count || 0,
        topPickEffects: (post.draft.effects || [])
          .map((effect) => ({
            champion: effect.champion,
            role: effect.role,
            value: round(effect.value),
            n: effect.n,
            source: effect.source,
          }))
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          .slice(0, 5),
      });
    }
  }

  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = ["league", "date", "game", "actual", "baseline", "preDraft", "postDraft", "draftDelta", "draftConfidence", "topPickEffects"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.league,
      row.date,
      row.game,
      row.actual,
      round(row.baseline),
      round(row.preDraft),
      round(row.postDraft),
      round(row.draftDelta),
      round(row.draftConfidence, 3),
      row.topPickEffects.map((item) => `${item.role} ${item.champion} ${item.value >= 0 ? "+" : ""}${item.value}`).join(" | "),
    ].map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows) {
  const strongDraft = rows
    .filter((row) => Math.abs(row.draftDelta) >= 0.75)
    .sort((a, b) => Math.abs(b.draftDelta) - Math.abs(a.draftDelta));
  const lines = [];
  lines.push("# Prediction Evaluation");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Metodo: walk-forward, sem linhas sinteticas de aposta.");
  lines.push("Modelos: L0 baseline liga recente, L1 liga+confronto, L2 liga+confronto+picks.");
  lines.push("");
  lines.push("## Geral");
  lines.push("");
  lines.push("| Modelo | Esperado | Real | Bias | MAE | RMSE | ±2 | ±3 | ±5 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [label, key] of [["L0 Baseline", "baseline"], ["L1 Pre-draft", "preDraft"], ["L2 Picks", "postDraft"]]) {
    const item = report.overall[key];
    lines.push(`| ${label} | ${item.avgExpected.toFixed(2)} | ${item.avgActual.toFixed(2)} | ${item.bias.toFixed(2)} | ${item.mae.toFixed(2)} | ${item.rmse.toFixed(2)} | ${pct(item.within2)} | ${pct(item.within3)} | ${pct(item.within5)} |`);
  }
  lines.push("");
  lines.push(`- L1 vs L0 MAE: ${report.overall.preMinusBaselineMae >= 0 ? "+" : ""}${report.overall.preMinusBaselineMae.toFixed(2)}`);
  lines.push(`- L2 vs L1 MAE: ${report.overall.postMinusPreMae >= 0 ? "+" : ""}${report.overall.postMinusPreMae.toFixed(2)}`);
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push("| Liga | Testes | L0 MAE | L1 MAE | L1 bias | L2 MAE | L2 bias | L2 ±3 | L2 > L1? |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.tests} | ${item.baseline.mae.toFixed(2)} | ${item.preDraft.mae.toFixed(2)} | ${item.preDraft.bias.toFixed(2)} | ${item.postDraft.mae.toFixed(2)} | ${item.postDraft.bias.toFixed(2)} | ${pct(item.postDraft.within3)} | ${item.postMinusPreMae < 0 ? "sim" : "nao"} |`);
  }
  lines.push("");
  lines.push("## Drafts Que Mais Mexeram Na Linha");
  lines.push("");
  lines.push("| Liga | Jogo | Real | L1 | L2 | Delta draft | Picks principais |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  for (const row of strongDraft.slice(0, 30)) {
    const picks = row.topPickEffects.map((item) => `${item.role} ${item.champion} ${item.value >= 0 ? "+" : ""}${item.value}`).join("; ");
    lines.push(`| ${row.league} | ${row.game} | ${row.actual} | ${row.preDraft.toFixed(2)} | ${row.postDraft.toFixed(2)} | ${row.draftDelta >= 0 ? "+" : ""}${row.draftDelta.toFixed(2)} | ${picks} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const rows = runWalkForward(loadGames());
  const report = {
    createdAt: new Date().toISOString(),
    method: "walk-forward",
    testsPerLeague: TESTS_PER_LEAGUE,
    overall: summarize(rows),
    byLeague: LEAGUES.map((league) => ({ league, ...summarize(rows.filter((row) => row.league === league)) })),
  };
  writeJson(path.join(DATA_DIR, "prediction-evaluation.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "prediction-evaluation.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "prediction-evaluation.md"), buildMarkdown(report, rows), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();

module.exports = { runWalkForward, summarize, main };
