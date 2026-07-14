const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const BLOCKED_THRESHOLD = 99;
const VALIDATION_PER_LEAGUE = 60;
const THRESHOLDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, BLOCKED_THRESHOLD];
const CONFIDENCE_THRESHOLDS = [0.1, 0.25, 0.35, 0.45, 0.55, 0.65];

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

function buildWalkForwardRows(games) {
  const rows = [];
  for (const league of LEAGUES) {
    const chronological = games.filter((game) => game.league === league).sort(Model.sortRecent).reverse();
    for (let index = 20; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      const model = Model.buildModel(train);
      const house = model.houseLine(game, train, {
        minDraftConfidence: 0,
        sideThresholds: Object.fromEntries(LEAGUES.map((item) => [item, { over: 0, under: 0 }])),
      });
      const deviation = game.totalKills - house.preLine;
      rows.push({
        id: game.id,
        league,
        date: game.date,
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        preLine: house.preLine,
        postLine: house.postLine,
        delta: house.delta,
        confidence: house.post.draft.confidence || 0,
        deviation,
      });
    }
  }
  return rows;
}

function classify(row, policy) {
  if (row.confidence < policy.minDraftConfidence) return "NEUTRO";
  if (policy.over < BLOCKED_THRESHOLD && row.delta >= policy.over) return "OVER";
  if (policy.under < BLOCKED_THRESHOLD && row.delta <= -policy.under) return "UNDER";
  return "NEUTRO";
}

function summarize(rows, policy) {
  const groups = { OVER: [], NEUTRO: [], UNDER: [] };
  for (const row of rows) groups[classify(row, policy)].push(row);
  const summarizeGroup = (items) => ({
    games: items.length,
    avgDeviation: round(mean(items.map((row) => row.deviation))),
    medianDeviation: round(median(items.map((row) => row.deviation))),
    avgAbsDeviation: round(mean(items.map((row) => Math.abs(row.deviation)))),
    overRate: items.length ? round(items.filter((row) => row.deviation > 0).length / items.length, 4) : 0,
    underRate: items.length ? round(items.filter((row) => row.deviation < 0).length / items.length, 4) : 0,
    avgDelta: round(mean(items.map((row) => row.delta))),
    avgConfidence: round(mean(items.map((row) => row.confidence)), 3),
  });
  const bySignal = Object.fromEntries(Object.entries(groups).map(([signal, items]) => [signal, summarizeGroup(items)]));
  const actionGames = groups.OVER.length + groups.UNDER.length;
  return {
    games: rows.length,
    actionGames,
    actionRate: rows.length ? round(actionGames / rows.length, 4) : 0,
    bySignal,
  };
}

function scoreSummary(summary) {
  const over = summary.bySignal.OVER;
  const under = summary.bySignal.UNDER;
  const neutral = summary.bySignal.NEUTRO;
  const minSide = Math.max(4, Math.floor(summary.games * 0.05));
  const minActions = Math.max(8, Math.floor(summary.games * 0.12));
  let score = 0;

  score += Math.max(0, over.avgDeviation) * Math.sqrt(Math.max(1, over.games));
  score += Math.max(0, -under.avgDeviation) * Math.sqrt(Math.max(1, under.games));
  score += Math.max(0, over.overRate - 0.5) * 18;
  score += Math.max(0, under.underRate - 0.5) * 18;
  score -= Math.abs(neutral.avgDeviation) * 1.4;
  score -= Math.max(0, neutral.avgAbsDeviation - 6.2) * 0.35;

  if (over.games && over.avgDeviation < 0) score -= 12 + Math.abs(over.avgDeviation) * 2;
  if (under.games && under.avgDeviation > 0) score -= 12 + under.avgDeviation * 2;
  if (over.games && over.games < minSide) score -= (minSide - over.games) * 2.5;
  if (under.games && under.games < minSide) score -= (minSide - under.games) * 2.5;
  if (summary.actionGames < minActions) score -= (minActions - summary.actionGames) * 1.8;
  if (summary.actionRate > 0.45) score -= (summary.actionRate - 0.45) * 25;

  return score;
}

function tuneLeague(rows) {
  let best = null;
  for (const minDraftConfidence of CONFIDENCE_THRESHOLDS) {
    for (const over of THRESHOLDS) {
      for (const under of THRESHOLDS) {
        const policy = { minDraftConfidence, over, under };
        const trainSummary = summarize(rows, policy);
        const score = scoreSummary(trainSummary);
        if (!best || score > best.score) best = { policy, trainSummary, score: round(score) };
      }
    }
  }
  return best;
}

function splitLeagueRows(rows, league) {
  const list = rows.filter((row) => row.league === league).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id));
  const validationSize = Math.min(VALIDATION_PER_LEAGUE, Math.max(20, Math.floor(list.length * 0.35)));
  return {
    train: list.slice(0, Math.max(0, list.length - validationSize)),
    validation: list.slice(Math.max(0, list.length - validationSize)),
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = ["league", "date", "game", "actual", "preLine", "delta", "confidence", "signal", "deviation"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Draft Signal Policy Tuning");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Metodo: walk-forward. Thresholds treinados em jogos anteriores e validados nos jogos mais recentes de cada liga.");
  lines.push("Objetivo: separar drafts OVER, UNDER e NEUTRO contra a linha pre-draft, sem usar tempo, gold, side ou bans.");
  lines.push("");
  lines.push("## Politica Recomendada Com Gating");
  lines.push("");
  lines.push("| Liga | Conf min | Over | Under | Bloqueios | Acoes val | OVER desvio/% | NEUTRO desvio/% | UNDER desvio/% |");
  lines.push("|---|---:|---:|---:|---|---:|---|---|---|");
  for (const item of report.byLeague) {
    const policy = item.policy;
    const val = item.gatedValidationSummary;
    lines.push(`| ${item.league} | ${policy.minDraftConfidence.toFixed(2)} | ${formatThreshold(policy.over)} | ${formatThreshold(policy.under)} | ${item.blockedSides.join(", ") || "-"} | ${val.actionGames}/${val.games} | ${formatSignal(val.bySignal.OVER, "over")} | ${formatSignal(val.bySignal.NEUTRO, "neutral")} | ${formatSignal(val.bySignal.UNDER, "under")} |`);
  }
  lines.push("");
  lines.push("## Tuning Bruto Antes Do Gating");
  lines.push("");
  lines.push("| Liga | Conf min | Over th | Under th | Acoes val | OVER desvio/% | NEUTRO desvio/% | UNDER desvio/% | Score treino |");
  lines.push("|---|---:|---:|---:|---:|---|---|---|---:|");
  for (const item of report.byLeague) {
    const policy = item.rawPolicy;
    const val = item.validationSummary;
    lines.push(`| ${item.league} | ${policy.minDraftConfidence.toFixed(2)} | ${formatThreshold(policy.over)} | ${formatThreshold(policy.under)} | ${val.actionGames}/${val.games} | ${formatSignal(val.bySignal.OVER, "over")} | ${formatSignal(val.bySignal.NEUTRO, "neutral")} | ${formatSignal(val.bySignal.UNDER, "under")} | ${item.score.toFixed(2)} |`);
  }
  lines.push("");
  lines.push("## Politica JS Recomendada");
  lines.push("");
  lines.push("```js");
  lines.push(JSON.stringify(report.recommendedPolicy, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatThreshold(value) {
  return value >= BLOCKED_THRESHOLD ? "bloq" : value.toFixed(2);
}

function formatSignal(group, side) {
  const rate = side === "under" ? group.underRate : side === "over" ? group.overRate : Math.max(group.overRate, group.underRate);
  return `${group.games}j / ${group.avgDeviation >= 0 ? "+" : ""}${group.avgDeviation.toFixed(2)} / ${pct(rate)}`;
}

function sideIsReliable(group, side) {
  if (group.games < 5) return false;
  if (side === "over") return group.avgDeviation >= 1.25 && group.overRate >= 0.57;
  return group.avgDeviation <= -1.25 && group.underRate >= 0.57;
}

function applyValidationGating(rawPolicy, validationSummary) {
  const policy = { ...rawPolicy };
  const blockedSides = [];
  if (!sideIsReliable(validationSummary.bySignal.OVER, "over")) {
    policy.over = BLOCKED_THRESHOLD;
    blockedSides.push("over");
  }
  if (!sideIsReliable(validationSummary.bySignal.UNDER, "under")) {
    policy.under = BLOCKED_THRESHOLD;
    blockedSides.push("under");
  }
  return { policy, blockedSides };
}

function main() {
  const rows = buildWalkForwardRows(loadGames());
  const byLeague = [];
  const recommendedThresholds = {};
  const validationRows = [];

  for (const league of LEAGUES) {
    const { train, validation } = splitLeagueRows(rows, league);
    const tuned = tuneLeague(train);
    const validationSummary = summarize(validation, tuned.policy);
    const gated = applyValidationGating(tuned.policy, validationSummary);
    const gatedValidationSummary = summarize(validation, gated.policy);
    const annotated = validation.map((row) => ({
      ...row,
      actual: row.actual,
      preLine: row.preLine,
      delta: round(row.delta),
      confidence: round(row.confidence, 3),
      signal: classify(row, gated.policy),
      deviation: round(row.deviation),
    }));
    validationRows.push(...annotated);
    recommendedThresholds[league] = { over: gated.policy.over, under: gated.policy.under };
    byLeague.push({
      league,
      trainGames: train.length,
      validationGames: validation.length,
      rawPolicy: tuned.policy,
      policy: gated.policy,
      blockedSides: gated.blockedSides,
      score: tuned.score,
      trainSummary: tuned.trainSummary,
      validationSummary,
      gatedValidationSummary,
    });
  }

  const minDraftConfidence = median(byLeague.map((item) => item.rawPolicy.minDraftConfidence));
  const recommendedPolicy = {
    minDraftConfidence,
    sideThresholds: recommendedThresholds,
  };
  const report = {
    createdAt: new Date().toISOString(),
    validationPerLeague: VALIDATION_PER_LEAGUE,
    thresholdsTested: THRESHOLDS,
    confidenceThresholdsTested: CONFIDENCE_THRESHOLDS,
    recommendedPolicy,
    byLeague,
  };

  writeJson(path.join(DATA_DIR, "draft-signal-policy-tuning.json"), { report, rows: validationRows });
  writeCsv(path.join(DATA_DIR, "draft-signal-policy-tuning.csv"), validationRows);
  fs.writeFileSync(path.join(DATA_DIR, "draft-signal-policy-tuning.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report.recommendedPolicy, null, 2));
}

if (require.main === module) main();

module.exports = { buildWalkForwardRows, tuneLeague, summarize, classify, main };
