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

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

function signalFromDelta(delta) {
  if (delta >= 0.75) return "OVER";
  if (delta <= -0.75) return "UNDER";
  return "NEUTRO";
}

function topEffects(effects) {
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

function runDraftSignalEvaluation(games) {
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
      const preLine = house.preLine;
      const delta = house.delta;
      const signal = signalFromDelta(delta);
      const deviation = game.totalKills - preLine;

      rows.push({
        id: game.id,
        league,
        date: game.date,
        game: `${game.teamA} vs ${game.teamB}`,
        teamA: game.teamA,
        teamB: game.teamB,
        actual: game.totalKills,
        prePrediction: round(house.pre.prediction),
        preLine,
        postPrediction: round(house.post.prediction),
        postLine: house.postLine,
        lineAdjustment: round(house.calibration.adjustment),
        draftDelta: round(delta),
        draftSignal: signal,
        deviation: round(deviation),
        absDeviation: round(Math.abs(deviation)),
        isOverLine: deviation > 0,
        isUnderLine: deviation < 0,
        draftConfidence: round(house.post.draft.confidence || 0, 3),
        topPickEffects: topEffects(house.post.draft.effects || []),
      });
    }
  }

  return rows;
}

function summarize(rows) {
  if (!rows.length) {
    return {
      games: 0,
      avgDeviation: 0,
      medianDeviation: 0,
      avgAbsDeviation: 0,
      overRate: 0,
      underRate: 0,
      avgLine: 0,
      avgActual: 0,
      avgDraftDelta: 0,
    };
  }
  return {
    games: rows.length,
    avgDeviation: round(mean(rows.map((row) => row.deviation))),
    medianDeviation: round(median(rows.map((row) => row.deviation))),
    avgAbsDeviation: round(mean(rows.map((row) => row.absDeviation))),
    overRate: round(rows.filter((row) => row.isOverLine).length / rows.length, 4),
    underRate: round(rows.filter((row) => row.isUnderLine).length / rows.length, 4),
    avgLine: round(mean(rows.map((row) => row.preLine))),
    avgActual: round(mean(rows.map((row) => row.actual))),
    avgDraftDelta: round(mean(rows.map((row) => row.draftDelta))),
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
    "preLine",
    "postLine",
    "draftDelta",
    "draftSignal",
    "deviation",
    "absDeviation",
    "isOverLine",
    "draftConfidence",
    "topPickEffects",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.league,
      row.date,
      row.game,
      row.actual,
      row.preLine,
      row.postLine,
      row.draftDelta,
      row.draftSignal,
      row.deviation,
      row.absDeviation,
      row.isOverLine,
      row.draftConfidence,
      row.topPickEffects.map((effect) => `${effect.role} ${effect.champion} ${effect.value >= 0 ? "+" : ""}${effect.value}`).join(" | "),
    ].map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report, rows) {
  const lines = [];
  lines.push("# Draft Signal Evaluation");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, ${TESTS_PER_LEAGUE} jogos por liga.`);
  lines.push("Objetivo: validar se drafts OVER ficam acima da linha, UNDER abaixo, e NEUTRO perto da linha.");
  lines.push("");
  lines.push("## Geral Por Sinal");
  lines.push("");
  lines.push("| Sinal | Jogos | Desvio medio | Mediana desvio | Abs medio | % Over | % Under | Delta draft medio |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const signal of ["OVER", "NEUTRO", "UNDER"]) {
    const item = report.bySignal[signal];
    lines.push(`| ${signal} | ${item.games} | ${item.avgDeviation.toFixed(2)} | ${item.medianDeviation.toFixed(2)} | ${item.avgAbsDeviation.toFixed(2)} | ${pct(item.overRate)} | ${pct(item.underRate)} | ${item.avgDraftDelta.toFixed(2)} |`);
  }
  lines.push("");
  lines.push("## Por Liga e Sinal");
  lines.push("");
  lines.push("| Liga | Sinal | Jogos | Desvio medio | Abs medio | % Over | % Under | Delta draft medio |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    for (const signal of ["OVER", "NEUTRO", "UNDER"]) {
      const item = report.byLeagueSignal[league][signal];
      lines.push(`| ${league} | ${signal} | ${item.games} | ${item.avgDeviation.toFixed(2)} | ${item.avgAbsDeviation.toFixed(2)} | ${pct(item.overRate)} | ${pct(item.underRate)} | ${item.avgDraftDelta.toFixed(2)} |`);
    }
  }
  lines.push("");
  lines.push("## Jogos");
  lines.push("");
  lines.push("| Liga | Jogo | Real | Linha | Sinal | Desvio | Delta draft | Picks principais |");
  lines.push("|---|---|---:|---:|---|---:|---:|---|");
  for (const row of rows) {
    const picks = row.topPickEffects.map((effect) => `${effect.role} ${effect.champion} ${effect.value >= 0 ? "+" : ""}${effect.value}`).join("; ");
    lines.push(`| ${row.league} | ${row.game} | ${row.actual} | ${row.preLine.toFixed(1)} | ${row.draftSignal} | ${row.deviation >= 0 ? "+" : ""}${row.deviation.toFixed(2)} | ${row.draftDelta >= 0 ? "+" : ""}${row.draftDelta.toFixed(2)} | ${picks} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const rows = runDraftSignalEvaluation(loadGames());
  const bySignal = Object.fromEntries(["OVER", "NEUTRO", "UNDER"].map((signal) => [signal, summarize(rows.filter((row) => row.draftSignal === signal))]));
  const byLeagueSignal = Object.fromEntries(LEAGUES.map((league) => [
    league,
    Object.fromEntries(["OVER", "NEUTRO", "UNDER"].map((signal) => [
      signal,
      summarize(rows.filter((row) => row.league === league && row.draftSignal === signal)),
    ])),
  ]));
  const report = {
    createdAt: new Date().toISOString(),
    testsPerLeague: TESTS_PER_LEAGUE,
    signalThresholds: { over: 0.75, under: -0.75 },
    overall: summarize(rows),
    bySignal,
    byLeagueSignal,
  };
  writeJson(path.join(DATA_DIR, "draft-signal-evaluation.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "draft-signal-evaluation.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "draft-signal-evaluation.md"), buildMarkdown(report, rows), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();

module.exports = { runDraftSignalEvaluation, summarize, main };
