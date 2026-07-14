const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const HOLDOUT_PER_LEAGUE = 15;

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

function loadExpandedGames() {
  const games = [];
  for (const league of LEAGUES) {
    const payload = readJson(path.join(DATA_DIR, `expanded-${league}.json`));
    games.push(...payload.games);
  }
  const byId = new Map();
  for (const game of games) byId.set(String(game.id), game);
  return [...byId.values()];
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
    "teamAPicks",
    "teamBPicks",
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
      (row.picks?.teamA || []).join("|"),
      (row.picks?.teamB || []).join("|"),
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows, previous) {
  const lines = [];
  lines.push("# Calibrated Model Backtest");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Teste: 15 mapas mais recentes por liga fora do treino.");
  lines.push("Modelo: liga por estilo/recencia, calibracao de bias por liga, times recentes, picks por role e residual pre-draft.");
  lines.push("");
  lines.push("## Comparacao Geral");
  lines.push("");
  lines.push("| Modelo | Pre esperado | Real medio | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Picks ±3 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  if (previous) {
    lines.push(`| Antes | ${previous.overall.pre.avgExpected.toFixed(2)} | ${previous.overall.pre.avgActual.toFixed(2)} | ${previous.overall.pre.bias.toFixed(2)} | ${previous.overall.pre.mae.toFixed(2)} | ${previous.overall.post.avgExpected.toFixed(2)} | ${previous.overall.post.bias.toFixed(2)} | ${previous.overall.post.mae.toFixed(2)} | ${pct(previous.overall.post.within3)} |`);
  }
  lines.push(`| Calibrado | ${report.overall.pre.avgExpected.toFixed(2)} | ${report.overall.pre.avgActual.toFixed(2)} | ${report.overall.pre.bias.toFixed(2)} | ${report.overall.pre.mae.toFixed(2)} | ${report.overall.post.avgExpected.toFixed(2)} | ${report.overall.post.bias.toFixed(2)} | ${report.overall.post.mae.toFixed(2)} | ${pct(report.overall.post.within3)} |`);
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push("| Liga | Testes | Real medio | Pre esperado | Pre bias | Pre MAE | Picks esperado | Picks bias | Picks MAE | Melhorou com picks? |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.tests} | ${item.pre.avgActual.toFixed(2)} | ${item.pre.avgExpected.toFixed(2)} | ${item.pre.bias.toFixed(2)} | ${item.pre.mae.toFixed(2)} | ${item.post.avgExpected.toFixed(2)} | ${item.post.bias.toFixed(2)} | ${item.post.mae.toFixed(2)} | ${item.postMinusPreMae < 0 ? "sim" : "nao"} |`);
  }
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
  const games = loadExpandedGames();
  const rows = [];

  for (const league of LEAGUES) {
    const leagueGames = games.filter((game) => game.league === league).sort(Model.sortRecent);
    const test = leagueGames.slice(0, HOLDOUT_PER_LEAGUE);
    const train = leagueGames.slice(HOLDOUT_PER_LEAGUE);
    const model = Model.buildModel(train);

    for (const game of test) {
      const pre = model.predict(game, false);
      const post = model.predict(game, true);
      rows.push({
        id: game.id,
        league: game.league,
        date: game.date,
        patch: game.patch,
        game: `${game.teamA} vs ${game.teamB}`,
        teamA: game.teamA,
        teamB: game.teamB,
        actual: game.totalKills,
        picks: game.picks,
        pre: {
          prediction: pre.prediction,
          components: pre,
        },
        post: {
          prediction: post.prediction,
          components: post,
        },
      });
    }
  }

  const byLeague = LEAGUES.map((league) => ({ league, ...summarize(rows.filter((row) => row.league === league)) }));
  const report = {
    createdAt: new Date().toISOString(),
    options: Model.DEFAULT_OPTIONS,
    byLeague,
    overall: summarize(rows),
  };

  let previous = null;
  const previousPath = path.join(DATA_DIR, "calibration-report.json");
  if (fs.existsSync(previousPath)) previous = readJson(previousPath).report;

  writeJson(path.join(DATA_DIR, "calibrated-backtest-results.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "calibrated-backtest-games.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "calibrated-backtest-summary.md"), buildMarkdown(report, rows, previous), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
