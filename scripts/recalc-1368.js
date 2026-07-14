"use strict";
/**
 * recalc-1368.js
 * Walk-forward backtest sobre o dataset completo de 1368 jogos (games.js).
 * Calcula MAE/RMSE, viés direcional por liga, ROI por faixa de EV e hit rate.
 * NÃO modifica nenhum arquivo de modelo ou dados.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

// --- Carrega games.js com mock de window (igual outros scripts) ---
const gamesText = fs.readFileSync(path.join(DATA_DIR, "games.js"), "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;

// --- Carrega model-core.js ---
const Model = require("../model-core.js");
const LEAGUES = Model.TARGET_LEAGUES;

// --- Parâmetros ---
const MIN_TRAIN = 30;
const ODDS_OVER = 1.80;
const ODDS_UNDER = 1.80;

// --- Utilitários ---
function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function rmse(errors) {
  return Math.sqrt(mean(errors.map((e) => e * e)));
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-abs * abs));
  return sign * y;
}

function normalCdf(x, mu, sigma) {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))));
}

// --- Walk-forward principal ---
const cleanGames = allGames.filter(
  (g) => LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);

console.log(`Dataset carregado: ${cleanGames.length} jogos válidos de ${allGames.length} totais`);
console.log(`Ligas: ${LEAGUES.join(", ")}`);

const rows = [];

for (const league of LEAGUES) {
  const leagueGames = cleanGames
    .filter((g) => g.league === league)
    .sort(Model.sortRecent)
    .reverse(); // ordem cronológica (mais antigo primeiro)

  console.log(`  ${league}: ${leagueGames.length} jogos`);

  for (let i = 0; i < leagueGames.length; i++) {
    const game = leagueGames[i];
    const train = leagueGames.slice(0, i);

    if (train.length < MIN_TRAIN) continue;

    const model = Model.buildModel(train);
    const house = model.houseLine(game, train);

    // Previsão pós-draft com calibração
    const prediction = house.post.prediction + (house.calibration.adjustment || 0);
    const prePrediction = house.pre.prediction + (house.calibration.adjustment || 0);

    // Linha de referência: preLine do modelo
    const line = house.preLine;

    const sigma =
      house.post.sigma ||
      (Model.LEAGUE_PREDICTION_RMSE ? Model.LEAGUE_PREDICTION_RMSE[league] : null) ||
      8.3;

    // Probabilidades
    const pOver = 1 - normalCdf(line, prediction, sigma);
    const pUnder = 1 - pOver;

    // EV
    const evOver = pOver * ODDS_OVER - 1;
    const evUnder = pUnder * ODDS_UNDER - 1;

    // Erro de previsão
    const error = prediction - game.totalKills;
    const preError = prePrediction - game.totalKills;

    rows.push({
      league,
      date: game.date || "",
      patch: game.patch || "",
      game: `${game.teamA} vs ${game.teamB}`,
      actual: game.totalKills,
      line,
      prediction: round(prediction),
      prePrediction: round(prePrediction),
      error: round(error),
      preError: round(preError),
      absError: round(Math.abs(error)),
      sigma: round(sigma),
      pOver: round(pOver),
      pUnder: round(pUnder),
      evOver: round(evOver),
      evUnder: round(evUnder),
      trainGames: train.length,
    });
  }
}

console.log(`\nTotal de previsões geradas: ${rows.length}`);

// =============================================================================
// MÉTRICAS
// =============================================================================

// 1. MAE e RMSE geral
const errors = rows.map((r) => r.error);
const absErrors = rows.map((r) => r.absError);
const maeGeral = round(mean(absErrors), 4);
const rmseGeral = round(rmse(errors), 4);

// 2. Viés direcional por liga
const biasByLeague = {};
for (const league of LEAGUES) {
  const leagueRows = rows.filter((r) => r.league === league);
  if (!leagueRows.length) continue;
  const signed = leagueRows.map((r) => r.error);
  biasByLeague[league] = {
    n: leagueRows.length,
    bias: round(mean(signed), 4),
    mae: round(mean(leagueRows.map((r) => r.absError)), 4),
    rmse: round(rmse(signed), 4),
  };
}

// Viés geral
const biasGeral = round(mean(errors), 4);

// 3. ROI por faixa de EV
// Para cada jogo, escolhe o lado com maior EV. Se ambos negativos, é PASS.
// Apostamos sempre que o melhor EV for > threshold de cada faixa.

function evBucket(ev) {
  if (ev < 0) return "<0%";
  if (ev < 0.05) return "0-5%";
  if (ev < 0.10) return "5-10%";
  if (ev < 0.15) return "10-15%";
  return ">15%";
}

const evBuckets = { "<0%": [], "0-5%": [], "5-10%": [], "10-15%": [], ">15%": [] };

for (const row of rows) {
  // Escolhe o lado com maior EV
  let betSide, betOdds, betEv;
  if (row.evOver >= row.evUnder) {
    betSide = "over";
    betOdds = ODDS_OVER;
    betEv = row.evOver;
  } else {
    betSide = "under";
    betOdds = ODDS_UNDER;
    betEv = row.evUnder;
  }

  const bucket = evBucket(betEv);
  const actualSide = row.actual > row.line ? "over" : row.actual < row.line ? "under" : "push";
  const win = actualSide !== "push" && actualSide === betSide;
  const profit = actualSide === "push" ? 0 : win ? betOdds - 1 : -1;

  evBuckets[bucket].push({
    betSide,
    betEv,
    actualSide,
    win,
    profit,
    league: row.league,
  });
}

const roiByEv = {};
for (const [bucket, bets] of Object.entries(evBuckets)) {
  const validBets = bets.filter((b) => b.actualSide !== "push");
  if (!validBets.length) {
    roiByEv[bucket] = { bets: 0, hits: 0, hitRate: null, profit: 0, roi: null };
    continue;
  }
  const hits = validBets.filter((b) => b.win).length;
  const profit = validBets.reduce((s, b) => s + b.profit, 0);
  roiByEv[bucket] = {
    bets: validBets.length,
    hits,
    hitRate: round(hits / validBets.length, 4),
    profit: round(profit, 4),
    roi: round(profit / validBets.length, 4),
  };
}

// 4. Hit rate under vs over (quando o modelo aposta aquele lado — pelo EV)
const overBets = rows.filter((r) => r.evOver >= r.evUnder && r.evOver > 0);
const underBets = rows.filter((r) => r.evUnder > r.evOver && r.evUnder > 0);

const overHits = overBets.filter(
  (r) => r.actual > r.line
).length;
const underHits = underBets.filter(
  (r) => r.actual < r.line
).length;

const hitRateOver = overBets.length ? round(overHits / overBets.length, 4) : null;
const hitRateUnder = underBets.length ? round(underHits / underBets.length, 4) : null;

// 5. Range de patches por liga
const patchRangeByLeague = {};
for (const league of LEAGUES) {
  const leagueRows = rows.filter((r) => r.league === league && r.patch);
  const patches = [...new Set(leagueRows.map((r) => r.patch))].sort();
  patchRangeByLeague[league] = {
    oldest: patches[0] || null,
    newest: patches[patches.length - 1] || null,
    count: patches.length,
    patches,
  };
}

// 6. Hit rate global por lado (over/under) sobre todos os jogos com linha
const allOverActual = rows.filter((r) => r.actual > r.line).length;
const allUnderActual = rows.filter((r) => r.actual < r.line).length;
const allPush = rows.filter((r) => r.actual === r.line).length;
const totalNoPush = rows.filter((r) => r.actual !== r.line).length;

// =============================================================================
// RESULTADO FINAL
// =============================================================================

const results = {
  createdAt: new Date().toISOString(),
  dataset: {
    totalInFile: allGames.length,
    validGames: cleanGames.length,
    predictionsGenerated: rows.length,
    minTrain: MIN_TRAIN,
  },
  byLeague: biasByLeague,
  patchRange: patchRangeByLeague,
  overall: {
    mae: maeGeral,
    rmse: rmseGeral,
    bias: biasGeral,
    n: rows.length,
  },
  roiByEvBucket: roiByEv,
  sideStats: {
    overBets: overBets.length,
    overHits,
    hitRateOver,
    underBets: underBets.length,
    underHits,
    hitRateUnder,
    actualOverRate: round(allOverActual / (totalNoPush || 1), 4),
    actualUnderRate: round(allUnderActual / (totalNoPush || 1), 4),
    pushCount: allPush,
  },
};

// Salva JSON
const outPath = path.join(DATA_DIR, "recalc-1368-results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\nResultados salvos em: ${outPath}`);

// =============================================================================
// RESUMO NO CONSOLE
// =============================================================================

console.log("\n========================================");
console.log("  RECALC-1368 — RESUMO DOS RESULTADOS");
console.log("========================================");

console.log(`\nDataset: ${results.dataset.validGames} jogos válidos → ${results.dataset.predictionsGenerated} previsões (mín. ${MIN_TRAIN} treino)`);

console.log("\n--- ERRO GERAL (POST-DRAFT) ---");
console.log(`MAE:  ${maeGeral}`);
console.log(`RMSE: ${rmseGeral}`);
console.log(`Viés: ${biasGeral} (positivo = modelo superestima; negativo = subestima)`);

console.log("\n--- VIÉS DIRECIONAL POR LIGA ---");
console.log("Liga     | N    |  Viés  |  MAE   |  RMSE");
console.log("---------|------|--------|--------|------");
for (const [league, stats] of Object.entries(biasByLeague)) {
  const bias = stats.bias >= 0 ? `+${stats.bias.toFixed(2)}` : stats.bias.toFixed(2);
  console.log(
    `${league.padEnd(8)} | ${String(stats.n).padEnd(4)} | ${bias.padStart(6)} | ${stats.mae.toFixed(2).padStart(6)} | ${stats.rmse.toFixed(2)}`
  );
}

console.log("\n--- ROI POR FAIXA DE EV (odds 1.80) ---");
console.log("Faixa EV  | Apostas | Hit%  | ROI    | Lucro");
console.log("----------|---------|-------|--------|------");
for (const [bucket, stats] of Object.entries(roiByEv)) {
  if (!stats.bets) continue;
  const hitPct = stats.hitRate !== null ? `${(stats.hitRate * 100).toFixed(1)}%` : "-";
  const roiPct = stats.roi !== null ? `${(stats.roi * 100).toFixed(1)}%` : "-";
  console.log(
    `${bucket.padEnd(9)} | ${String(stats.bets).padEnd(7)} | ${hitPct.padStart(5)} | ${roiPct.padStart(6)} | ${stats.profit.toFixed(2)}`
  );
}

console.log("\n--- HIT RATE OVER vs UNDER (apostas EV positivo) ---");
console.log(`Over  bets: ${overBets.length.toString().padStart(5)}  hits: ${overHits}  hit%: ${hitRateOver !== null ? (hitRateOver * 100).toFixed(1) + "%" : "-"}`);
console.log(`Under bets: ${underBets.length.toString().padStart(5)}  hits: ${underHits}  hit%: ${hitRateUnder !== null ? (hitRateUnder * 100).toFixed(1) + "%" : "-"}`);
console.log(`\nDistribuição real: ${(results.sideStats.actualOverRate * 100).toFixed(1)}% over / ${(results.sideStats.actualUnderRate * 100).toFixed(1)}% under (${allPush} push)`);

console.log("\n--- RANGE DE PATCHES POR LIGA ---");
for (const [league, pr] of Object.entries(patchRangeByLeague)) {
  console.log(`${league.padEnd(8)}: patch ${pr.oldest} → ${pr.newest} (${pr.count} patches distintos)`);
}

console.log("\n========================================");
console.log("COMPARAÇÃO COM BASELINE (1305 jogos)");
console.log("========================================");
console.log("Faixa EV  | ROI baseline | ROI atual");
console.log("----------|-------------|----------");
const baseline = { "<0%": -0.369, "0-5%": 0.103, "5-10%": 0.152, "10-15%": 0.636, ">15%": 0.500 };
for (const [bucket, roi] of Object.entries(baseline)) {
  const curr = roiByEv[bucket];
  const currRoi = curr && curr.roi !== null ? `${(curr.roi * 100).toFixed(1)}%` : "-";
  console.log(`${bucket.padEnd(9)} | ${(roi * 100).toFixed(1)}%`.padEnd(25) + ` | ${currRoi}`);
}
console.log("\nViés direcional — baseline vs atual:");
const baselineBias = { LCS: -3.53, LPL: -2.29, LCK: -0.12, geral: -1.58 };
for (const [league, biasBase] of Object.entries(baselineBias)) {
  const currBias = league === "geral" ? biasGeral : biasByLeague[league]?.bias;
  const currStr = currBias !== undefined ? (currBias >= 0 ? `+${currBias.toFixed(2)}` : currBias.toFixed(2)) : "-";
  const baseStr = biasBase >= 0 ? `+${biasBase.toFixed(2)}` : biasBase.toFixed(2);
  console.log(`  ${league.padEnd(8)}: baseline ${baseStr} → atual ${currStr}`);
}

console.log("\nScript concluído.");
