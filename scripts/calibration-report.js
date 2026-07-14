const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

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

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function phaseStats(rows, phase) {
  const predictions = rows.map((row) => row[phase].prediction);
  const actuals = rows.map((row) => row.actual);
  const signedErrors = rows.map((row) => row[phase].prediction - row.actual);
  const absErrors = signedErrors.map(Math.abs);

  return {
    avgExpected: round(mean(predictions)),
    avgActual: round(mean(actuals)),
    bias: round(mean(signedErrors)),
    mae: round(mean(absErrors)),
    rmse: round(rmse(signedErrors)),
    within2: round(absErrors.filter((error) => error <= 2).length / rows.length, 4),
    within3: round(absErrors.filter((error) => error <= 3).length / rows.length, 4),
    within5: round(absErrors.filter((error) => error <= 5).length / rows.length, 4),
  };
}

function summarize(rows) {
  return {
    tests: rows.length,
    pre: phaseStats(rows, "pre"),
    post: phaseStats(rows, "post"),
    postMinusPreMae: round(phaseStats(rows, "post").mae - phaseStats(rows, "pre").mae),
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
    "preWithin3",
    "postExpected",
    "postSignedError",
    "postAbsError",
    "postWithin3",
    "postImproved",
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
      Math.abs(preSigned) <= 3,
      round(row.post.prediction),
      round(postSigned),
      round(Math.abs(postSigned)),
      Math.abs(postSigned) <= 3,
      Math.abs(postSigned) < Math.abs(preSigned),
      (row.picks?.teamA || []).join("|"),
      (row.picks?.teamB || []).join("|"),
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows) {
  const lines = [];
  lines.push("# Calibration Backtest");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Teste correto: previsao esperada de kills vs kills reais.");
  lines.push("Pre-draft usa liga/patch/times. Pos-picks adiciona os 10 picks pela role indicada.");
  lines.push("");
  lines.push("## Resumo Por Liga");
  lines.push("");
  lines.push("| Liga | Testes | Real medio | Pre esperado | Pre bias | Pre MAE | Pre ±3 | Picks esperado | Picks bias | Picks MAE | Picks ±3 | Melhorou? |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.tests} | ${item.pre.avgActual.toFixed(2)} | ${item.pre.avgExpected.toFixed(2)} | ${item.pre.bias.toFixed(2)} | ${item.pre.mae.toFixed(2)} | ${pct(item.pre.within3)} | ${item.post.avgExpected.toFixed(2)} | ${item.post.bias.toFixed(2)} | ${item.post.mae.toFixed(2)} | ${pct(item.post.within3)} | ${item.postMinusPreMae < 0 ? "sim" : "nao"} |`);
  }
  lines.push("");
  lines.push("## Geral");
  lines.push("");
  lines.push(`- Jogos testados: ${report.overall.tests}`);
  lines.push(`- Real medio: ${report.overall.pre.avgActual.toFixed(2)} kills`);
  lines.push(`- Pre-draft esperado medio: ${report.overall.pre.avgExpected.toFixed(2)} kills, bias ${report.overall.pre.bias.toFixed(2)}, MAE ${report.overall.pre.mae.toFixed(2)}`);
  lines.push(`- Com picks esperado medio: ${report.overall.post.avgExpected.toFixed(2)} kills, bias ${report.overall.post.bias.toFixed(2)}, MAE ${report.overall.post.mae.toFixed(2)}`);
  lines.push(`- Dentro de ±3 kills: pre ${pct(report.overall.pre.within3)}, picks ${pct(report.overall.post.within3)}`);
  lines.push(`- Dentro de ±5 kills: pre ${pct(report.overall.pre.within5)}, picks ${pct(report.overall.post.within5)}`);
  lines.push("");
  lines.push("## Jogos");
  lines.push("");
  lines.push("| Liga | Jogo | Data | Real | Pre esperado | Erro pre | Picks esperado | Erro picks |");
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
  const payload = readJson(path.join(DATA_DIR, "backtest-results.json"));
  const rows = payload.rows;
  const leagues = [...new Set(rows.map((row) => row.league))];
  const report = {
    createdAt: new Date().toISOString(),
    methodology: {
      holdout: "15 mapas mais recentes por liga",
      preDraft: "liga + patch + times",
      postDraft: "pre-draft + picks por role",
      noDurationSideBans: true,
    },
    byLeague: leagues.map((league) => ({ league, ...summarize(rows.filter((row) => row.league === league)) })),
    overall: summarize(rows),
  };

  writeJson(path.join(DATA_DIR, "calibration-report.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "calibration-games.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "calibration-summary.md"), buildMarkdown(report, rows), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
