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

function phaseStats(rows, phase) {
  const signed = rows.map((row) => row[phase].prediction - row.actual);
  const abs = signed.map(Math.abs);
  return {
    avgExpected: round(mean(rows.map((row) => row[phase].prediction))),
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
  const pre = phaseStats(rows, "pre");
  const post = phaseStats(rows, "post");
  return {
    tests: rows.length,
    pre,
    post,
    postMinusPreMae: round(post.mae - pre.mae),
  };
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = [
    "league",
    "date",
    "patch",
    "game",
    "actualKills",
    "preExpected",
    "preSignedError",
    "preAbsError",
    "postExpected",
    "postSignedError",
    "postAbsError",
    "postImproved",
    "leagueCorrection",
    "teamAAdjustment",
    "teamBAdjustment",
    "draftAdjustment",
    "trainGames",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const preSigned = row.pre.prediction - row.actual;
    const postSigned = row.post.prediction - row.actual;
    const values = [
      row.league,
      row.date,
      row.patch,
      row.game,
      row.actual,
      round(row.pre.prediction),
      round(preSigned),
      round(Math.abs(preSigned)),
      round(row.post.prediction),
      round(postSigned),
      round(Math.abs(postSigned)),
      Math.abs(postSigned) < Math.abs(preSigned),
      round(row.post.components.correction.value),
      round(row.post.components.teamA.value),
      round(row.post.components.teamB.value),
      round(row.post.components.draft.value),
      row.trainGames,
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows) {
  const lines = [];
  lines.push("# Walk-Forward Calibration Backtest");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Cada jogo foi previsto usando apenas jogos anteriores a ele.");
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push("| Liga | Testes | Real medio | Pre esperado | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Picks ±3 | Melhorou com picks? |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.tests} | ${item.pre.avgActual.toFixed(2)} | ${item.pre.avgExpected.toFixed(2)} | ${item.pre.bias.toFixed(2)} | ${item.pre.mae.toFixed(2)} | ${item.post.avgExpected.toFixed(2)} | ${item.post.bias.toFixed(2)} | ${item.post.mae.toFixed(2)} | ${pct(item.post.within3)} | ${item.postMinusPreMae < 0 ? "sim" : "nao"} |`);
  }
  lines.push("");
  lines.push("## Geral");
  lines.push("");
  lines.push(`- Jogos testados: ${report.overall.tests}`);
  lines.push(`- Pre-draft: esperado ${report.overall.pre.avgExpected.toFixed(2)}, real ${report.overall.pre.avgActual.toFixed(2)}, bias ${report.overall.pre.bias.toFixed(2)}, MAE ${report.overall.pre.mae.toFixed(2)}`);
  lines.push(`- Com picks: esperado ${report.overall.post.avgExpected.toFixed(2)}, real ${report.overall.post.avgActual.toFixed(2)}, bias ${report.overall.post.bias.toFixed(2)}, MAE ${report.overall.post.mae.toFixed(2)}`);
  lines.push(`- Dentro de ±3 kills: pre ${pct(report.overall.pre.within3)}, picks ${pct(report.overall.post.within3)}`);
  lines.push(`- Dentro de ±5 kills: pre ${pct(report.overall.pre.within5)}, picks ${pct(report.overall.post.within5)}`);
  lines.push("");
  lines.push("## Jogos");
  lines.push("");
  lines.push("| Liga | Jogo | Data | Real | Pre | Erro pre | Picks | Erro picks |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|");
  for (const row of rows) {
    const preSigned = row.pre.prediction - row.actual;
    const postSigned = row.post.prediction - row.actual;
    lines.push(`| ${row.league} | ${row.game} | ${row.date || ""} | ${row.actual} | ${row.pre.prediction.toFixed(2)} | ${preSigned.toFixed(2)} | ${row.post.prediction.toFixed(2)} | ${postSigned.toFixed(2)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const rows = [];

  for (const league of LEAGUES) {
    const recent = games.filter((game) => game.league === league).sort(Model.sortRecent);
    const chronological = [...recent].reverse();
    const start = Math.max(0, chronological.length - TESTS_PER_LEAGUE);

    for (let index = start; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      const model = Model.buildModel(train);
      const pre = model.predict(game, false);
      const post = model.predict(game, true);
      rows.push({
        id: game.id,
        league,
        date: game.date,
        patch: game.patch,
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        trainGames: train.length,
        pre: { prediction: pre.prediction, components: pre },
        post: { prediction: post.prediction, components: post },
      });
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    options: Model.DEFAULT_OPTIONS,
    byLeague: LEAGUES.map((league) => ({ league, ...summarize(rows.filter((row) => row.league === league)) })),
    overall: summarize(rows),
  };

  writeJson(path.join(DATA_DIR, "walkforward-backtest-results.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "walkforward-backtest-games.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "walkforward-backtest-summary.md"), buildMarkdown(report, rows), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
