/**
 * Teste isolado do contexto de mapa dentro da serie.
 *
 * Nao altera o app. Compara o modelo atual contra ajustes fixos por mapa:
 * BO3: G1 -0.25, G2 +0.50, G3 -1.00
 * BO5: G1 +0.00, G2 +1.00, G3 +0.25, G4 -0.75, G5 -1.25
 *
 * Linha simulada: linha pre-draft do modelo atual. O ajuste muda a previsao
 * usada para EV/edge, como aconteceria se o app soubesse o mapa da serie.
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

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const DEFAULT_SIGMA = 6.4;
const DEFAULT_EDGE_THRESHOLD = 1.0;
const ODDS = 1.8;

const BASE_MAP_ADJUSTMENTS = {
  BO3: { 1: -0.25, 2: 0.5, 3: -1.0 },
  BO5: { 1: 0, 2: 1.0, 3: 0.25, 4: -0.75, 5: -1.25 },
};

const VARIANTS = [
  { name: "baseline", multiplier: 0 },
  { name: "map-25pct", multiplier: 0.25 },
  { name: "map-50pct", multiplier: 0.5 },
  { name: "map-75pct", multiplier: 0.75 },
  { name: "map-100pct", multiplier: 1 },
  { name: "map-125pct", multiplier: 1.25 },
];

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

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function gameId(game) {
  return String(game.id || "");
}

function readSeriesGames(file) {
  if (!fs.existsSync(file)) return [];
  const raw = readJson(file);
  return Array.isArray(raw.games) ? raw.games : [];
}

function buildMapContext(games) {
  const context = new Map();
  const bo3Raw = readSeriesGames(path.join(DATA_DIR, "bo3-2025-2026-map-position-raw.json"));
  for (const game of bo3Raw) {
    if (Number(game.seasonYear) !== 2026) continue;
    if (!LEAGUES.includes(game.league)) continue;
    if (![1, 2, 3].includes(Number(game.mapNumber))) continue;
    context.set(String(game.id), {
      format: "BO3",
      mapNumber: Number(game.mapNumber),
      seriesLength: Number(game.seriesLength) || null,
      source: "bo3-raw",
    });
  }

  const groups = new Map();
  for (const game of games) {
    const teams = [normalizeName(game.teamA), normalizeName(game.teamB)].sort().join(" vs ");
    const key = [
      game.league || "",
      game.sourceTournament || game.tournament || "",
      game.stage || game.week || "",
      game.date || "",
      teams,
    ].join("||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }

  for (const group of groups.values()) {
    const ordered = group.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    if (ordered.length < 4) continue;
    for (let index = 0; index < ordered.length; index++) {
      const id = gameId(ordered[index]);
      if (context.has(id)) continue;
      context.set(id, {
        format: "BO5",
        mapNumber: index + 1,
        seriesLength: ordered.length,
        source: "expanded-group",
      });
    }
  }

  return context;
}

function mapAdjustment(context, multiplier) {
  if (!context) return 0;
  const base = BASE_MAP_ADJUSTMENTS[context.format]?.[context.mapNumber] || 0;
  return base * multiplier;
}

function mapBucket(context) {
  if (!context) return "unknown";
  return `${context.format} G${context.mapNumber}`;
}

function sideFromEdge(edge) {
  if (edge > 0) return "over";
  if (edge < 0) return "under";
  return "neutral";
}

function topEffects(effects) {
  return effects
    .map((effect) => ({
      champion: effect.champion,
      role: effect.role,
      value: r(effect.value),
      n: effect.n,
      source: effect.source,
    }))
    .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
    .slice(0, 5);
}

function runVariant(games, mapContext, variant) {
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
      const context = mapContext.get(gameId(game));
      const adjustment = mapAdjustment(context, variant.multiplier);
      const line = house.preLine;
      const basePrediction = house.post.prediction + (house.calibration.adjustment || 0);
      const prediction = basePrediction + adjustment;
      const edge = prediction - line;
      const sigma = house.post.sigma || model.leagueSigmas.get(league) || DEFAULT_SIGMA;
      const overProbability = 1 - normalCdf(line, prediction, sigma);
      const underProbability = 1 - overProbability;
      const overEval = evaluateBetSide("over", overProbability, ODDS, edge, DEFAULT_EDGE_THRESHOLD, DEFAULT_BET_POLICY);
      const underEval = evaluateBetSide("under", underProbability, ODDS, edge, DEFAULT_EDGE_THRESHOLD, DEFAULT_BET_POLICY);
      const decision = classifyDecision(overEval, underEval);
      const resultSide = actualSide(game.totalKills, line);
      const isBet = Boolean(decision.side && resultSide !== "push");
      const correct = isBet ? decision.side === resultSide : null;
      const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;

      rows.push({
        variant: variant.name,
        multiplier: variant.multiplier,
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        line,
        basePrediction: r(basePrediction),
        adjustedPrediction: r(prediction),
        baseEdge: r(basePrediction - line),
        edge: r(edge),
        baseMapAdjustment: r(mapAdjustment(context, 1)),
        mapAdjustment: r(adjustment),
        mapKnown: Boolean(context),
        mapFormat: context?.format || "",
        mapNumber: context?.mapNumber || null,
        mapBucket: mapBucket(context),
        mapSource: context?.source || "",
        mapSide: sideFromEdge(adjustment),
        draftDelta: r(house.delta),
        sigma: r(sigma),
        overProbability: r(overProbability, 4),
        underProbability: r(underProbability, 4),
        evOver: r(overEval.ev, 4),
        evUnder: r(underEval.ev, 4),
        decision: decision.label,
        decisionSide: decision.side,
        decisionReason: decision.reason,
        actualSide: resultSide,
        correct,
        profit: r(profit, 4),
        absError: r(Math.abs(game.totalKills - prediction), 4),
        error: r(prediction - game.totalKills, 4),
        trainGames: train.length,
        topPickEffects: topEffects(house.post.draft.effects || []),
      });
    }
  }

  return rows;
}

function predictionSummary(rows) {
  if (!rows.length) return { rows: 0, mae: null, rmse: null, bias: null, within3: null, within5: null };
  const errors = rows.map((row) => row.error).filter(Number.isFinite);
  const absErrors = rows.map((row) => Math.abs(row.error)).filter(Number.isFinite);
  const mse = errors.reduce((sum, value) => sum + value * value, 0) / errors.length;
  return {
    rows: rows.length,
    mae: r(absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length, 4),
    rmse: r(Math.sqrt(mse), 4),
    bias: r(errors.reduce((sum, value) => sum + value, 0) / errors.length, 4),
    within3: r(absErrors.filter((value) => value <= 3).length / absErrors.length, 4),
    within5: r(absErrors.filter((value) => value <= 5).length / absErrors.length, 4),
  };
}

function groupRows(rows, keyFn) {
  const groups = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}

function summarizeBy(rows, keyFn) {
  return Object.fromEntries(
    Object.entries(groupRows(rows, keyFn)).map(([key, group]) => [key, {
      ...summarize(group),
      prediction: predictionSummary(group),
    }])
  );
}

function metricDelta(current, baseline) {
  return {
    bets: current.bets - baseline.bets,
    hitRate: Number.isFinite(current.hitRate) && Number.isFinite(baseline.hitRate) ? r(current.hitRate - baseline.hitRate, 4) : null,
    roi: Number.isFinite(current.roi) && Number.isFinite(baseline.roi) ? r(current.roi - baseline.roi, 4) : null,
    profit: r((current.profit || 0) - (baseline.profit || 0), 4),
    mae: Number.isFinite(current.prediction?.mae) && Number.isFinite(baseline.prediction?.mae)
      ? r(current.prediction.mae - baseline.prediction.mae, 4)
      : null,
  };
}

function buildReport(allRows) {
  const byVariantRows = groupRows(allRows, (row) => row.variant);
  const baselineRows = byVariantRows.baseline || [];
  const baselineOverall = { ...summarize(baselineRows), prediction: predictionSummary(baselineRows) };
  const baselineKnown = { ...summarize(baselineRows.filter((row) => row.mapKnown)), prediction: predictionSummary(baselineRows.filter((row) => row.mapKnown)) };

  const variants = {};
  for (const variant of VARIANTS) {
    const rows = byVariantRows[variant.name] || [];
    const overall = { ...summarize(rows), prediction: predictionSummary(rows) };
    const knownRows = rows.filter((row) => row.mapKnown);
    const known = { ...summarize(knownRows), prediction: predictionSummary(knownRows) };
    variants[variant.name] = {
      multiplier: variant.multiplier,
      overall,
      overallDeltaVsBaseline: metricDelta(overall, baselineOverall),
      knownMapContext: known,
      knownDeltaVsBaseline: metricDelta(known, baselineKnown),
      byLeague: summarizeBy(rows, (row) => row.league),
      byMapBucket: summarizeBy(knownRows, (row) => row.mapBucket),
      byMapSide: summarizeBy(knownRows, (row) => row.mapSide),
      rows: rows.length,
    };
  }

  return {
    createdAt: new Date().toISOString(),
    method: {
      minTrain: MIN_TRAIN,
      odds: ODDS,
      line: "baseline model pre-draft fair line",
      note: "Ajuste de mapa altera apenas a previsao usada para EV/edge.",
      adjustments: BASE_MAP_ADJUSTMENTS,
      variants: VARIANTS,
    },
    mapCoverage: coverageSummary(baselineRows),
    baselineBetMapDiagnostics: baselineMapDiagnostics(baselineRows),
    variants,
  };
}

function baselineMapDiagnostics(rows) {
  const bets = rows.filter((row) => row.correct !== null && row.mapKnown);
  return {
    byMapBucket: summarizeBy(bets, (row) => row.mapBucket),
    byBaseMapSide: summarizeBy(bets, (row) => sideFromEdge(row.baseMapAdjustment)),
    byAlignment: summarizeBy(bets, (row) => {
      const mapSide = sideFromEdge(row.baseMapAdjustment);
      if (mapSide === "neutral") return "neutral-map";
      return mapSide === row.decisionSide ? "aligned" : "against";
    }),
  };
}

function coverageSummary(rows) {
  const known = rows.filter((row) => row.mapKnown);
  return {
    rows: rows.length,
    known: known.length,
    knownPct: rows.length ? r(known.length / rows.length, 4) : null,
    byBucket: Object.fromEntries(
      Object.entries(groupRows(rows, (row) => row.mapBucket)).map(([bucket, group]) => [bucket, group.length])
    ),
    bySource: Object.fromEntries(
      Object.entries(groupRows(known, (row) => row.mapSource)).map(([source, group]) => [source, group.length])
    ),
  };
}

function summaryLine(label, stats, delta) {
  const dRoi = delta?.roi == null ? "" : ` (${delta.roi >= 0 ? "+" : ""}${pct(delta.roi)})`;
  const dMae = delta?.mae == null ? "" : ` (${delta.mae >= 0 ? "+" : ""}${delta.mae.toFixed(2)})`;
  return `| ${label} | ${stats.rows} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)}${dRoi} | ${stats.profit ?? "-"} | ${stats.prediction.mae}${dMae} | ${stats.prediction.bias} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Backtest Ajuste Por Numero Do Mapa");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, minimo ${MIN_TRAIN} jogos de treino. Linha simulada = pre-draft justa do modelo atual. Odds ${ODDS.toFixed(2)}.`);
  lines.push("");
  lines.push("Ajustes testados:");
  lines.push("- BO3: mapa 1 -0.25, mapa 2 +0.50, mapa 3 -1.00.");
  lines.push("- BO5: mapa 1 0.00, mapa 2 +1.00, mapa 3 +0.25, mapa 4 -0.75, mapa 5 -1.25.");
  lines.push("");
  lines.push("## Cobertura Do Contexto");
  lines.push("");
  lines.push(`- Jogos avaliados: ${report.mapCoverage.rows}`);
  lines.push(`- Jogos com mapa/formato identificado: ${report.mapCoverage.known} (${pct(report.mapCoverage.knownPct)})`);
  lines.push(`- Buckets: ${Object.entries(report.mapCoverage.byBucket).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push("");
  lines.push("## Comparacao Geral");
  lines.push("");
  lines.push("| Variante | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const variant of VARIANTS) {
    const stats = report.variants[variant.name].overall;
    const delta = variant.name === "baseline" ? null : report.variants[variant.name].overallDeltaVsBaseline;
    lines.push(summaryLine(variant.name, stats, delta));
  }
  lines.push("");
  lines.push("## Apenas Jogos Com Mapa Identificado");
  lines.push("");
  lines.push("| Variante | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const variant of VARIANTS) {
    const stats = report.variants[variant.name].knownMapContext;
    const delta = variant.name === "baseline" ? null : report.variants[variant.name].knownDeltaVsBaseline;
    lines.push(summaryLine(variant.name, stats, delta));
  }
  lines.push("");
  lines.push("## Map-100pct Por Bucket");
  lines.push("");
  lines.push("| Bucket | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [bucket, stats] of Object.entries(report.variants["map-100pct"].byMapBucket)) {
    lines.push(summaryLine(bucket, stats, null));
  }
  lines.push("");
  lines.push("## Map-100pct Por Liga");
  lines.push("");
  lines.push("| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    const stats = report.variants["map-100pct"].byLeague[league];
    if (stats) lines.push(summaryLine(league, stats, null));
  }
  lines.push("");
  lines.push("## Diagnostico Das Bets Baseline Por Mapa");
  lines.push("");
  lines.push("Aqui o ajuste de mapa ainda nao mexe na previsao; ele so classifica se a bet original estava alinhada ou contra o sinal historico do mapa.");
  lines.push("");
  lines.push("| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [group, stats] of Object.entries(report.baselineBetMapDiagnostics.byAlignment)) {
    lines.push(summaryLine(group, stats, null));
  }
  lines.push("");
  lines.push("### Baseline Por Bucket De Mapa");
  lines.push("");
  lines.push("| Bucket | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE | Bias |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [bucket, stats] of Object.entries(report.baselineBetMapDiagnostics.byMapBucket)) {
    lines.push(summaryLine(bucket, stats, null));
  }
  lines.push("");
  lines.push("## Conclusao Operacional");
  lines.push("");
  const best = Object.entries(report.variants)
    .filter(([name]) => name !== "baseline")
    .sort((a, b) => {
      const roiDiff = (b[1].knownDeltaVsBaseline.roi ?? -99) - (a[1].knownDeltaVsBaseline.roi ?? -99);
      if (roiDiff) return roiDiff;
      return (b[1].knownDeltaVsBaseline.profit || 0) - (a[1].knownDeltaVsBaseline.profit || 0);
    })[0];
  const bestName = best?.[0] || "--";
  const bestKnown = best?.[1]?.knownMapContext;
  const bestDelta = best?.[1]?.knownDeltaVsBaseline;
  lines.push(`Melhor variante no subconjunto com mapa identificado: ${bestName}, ROI ${pct(bestKnown?.roi)} (${bestDelta?.roi >= 0 ? "+" : ""}${pct(bestDelta?.roi)} vs baseline), lucro ${bestKnown?.profit}.`);
  lines.push("");
  if ((bestDelta?.roi || 0) >= 0.02 && (bestDelta?.profit || 0) > 0) {
    lines.push("Resultado preliminar: o ajuste merece ser considerado para o app, mas com multiplicador encolhido se ele preservar ROI e reduzir risco.");
  } else {
    lines.push("Resultado preliminar: nao adicionar ainda. O contexto de mapa pode ser informativo, mas nesta simulacao nao melhorou ROI o suficiente.");
  }
  lines.push("");
  lines.push("Observacao: como a linha simulada e a linha pre-draft do proprio modelo, este teste mede se o mapa melhora nossa decisao relativa. Nao prova que a casa deixara esse edge aberto em linhas reais.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeCsv(file, rows) {
  const headers = [
    "variant",
    "league",
    "date",
    "game",
    "mapBucket",
    "mapAdjustment",
    "actual",
    "line",
    "basePrediction",
    "adjustedPrediction",
    "edge",
    "evOver",
    "evUnder",
    "decisionSide",
    "decisionReason",
    "actualSide",
    "correct",
    "profit",
    "draftDelta",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => {
      const text = String(row[header] ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const games = loadGames();
  const mapContext = buildMapContext(games);
  const allRows = [];
  for (const variant of VARIANTS) {
    allRows.push(...runVariant(games, mapContext, variant));
  }
  const report = buildReport(allRows);

  writeJson(path.join(DATA_DIR, "map-context-adjustment-backtest.json"), { report, rows: allRows });
  writeCsv(path.join(DATA_DIR, "map-context-adjustment-backtest.csv"), allRows);
  fs.writeFileSync(path.join(DATA_DIR, "map-context-adjustment-backtest.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = {
  BASE_MAP_ADJUSTMENTS,
  buildMapContext,
  runVariant,
  main,
};
