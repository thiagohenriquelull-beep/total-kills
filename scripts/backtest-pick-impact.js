/**
 * Compara acurácia e ROI do modelo SEM picks vs COM picks.
 * Metodologia cross-league idêntica ao backtest-draft-market-rule.js.
 *
 * Mercado de referência para apostas forçadas = média da liga no treino.
 * Isso isola o valor marginal de cada camada: times/patch → picks.
 *
 * Também mede: acurácia direcional pura do sinal de draft
 * (sign(delta) == sign(actual - pre_pred)).
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const ODDS = 1.8;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function rmse(arr) {
  if (!arr.length) return NaN;
  return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((g) => LEAGUES.includes(g.league) && Number.isFinite(g.totalKills));
}

function collectRows(games) {
  const rows = [];

  for (const league of LEAGUES) {
    const leagueChronological = games
      .filter((g) => g.league === league)
      .sort(Model.sortRecent)
      .reverse();

    for (let index = 0; index < leagueChronological.length; index++) {
      const game = leagueChronological[index];
      const train = games.filter((g) => {
        if (String(g.id) === String(game.id)) return false;
        const dc = String(g.date || "").localeCompare(String(game.date || ""));
        if (dc < 0) return true;
        if (dc === 0) return Number(g.id || 0) < Number(game.id || 0);
        return false;
      });
      if (train.filter((g) => g.league === league).length < MIN_TRAIN) continue;

      const model = Model.buildModel(train);
      const house = model.houseLine(game, train);

      // league mean from the training model (pre-draft result exposes it)
      const leagueMean = house.pre.leagueMean;
      const prePred = house.pre.prediction; // no picks, no calib
      const postPred = house.post.prediction; // with picks, no calib
      const delta = house.delta; // picks contribution (postPred - prePred)
      const actual = game.totalKills;

      // Draft market evaluation (filtered, same policy as production)
      const draftMarket = Model.evaluateDraftMarket({
        league,
        preLine: house.preLine,
        marketLine: house.preLine, // move 0: market = pre-draft line
        delta,
        oddsOver: ODDS,
        oddsUnder: ODDS,
      });

      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        actual,
        leagueMean,
        prePred,
        postPred,
        preLine: house.preLine, // calibrated + rounded, used as market in filtered bets
        delta,
        draftAllowed: draftMarket.allowed,
        draftSide: draftMarket.side,
        draftBucket: draftMarket.bucketLabel,
      });
    }
  }

  return rows;
}

function sideVsRef(pred, ref) {
  if (pred > ref) return "over";
  if (pred < ref) return "under";
  return "push";
}

function scoreGroup(rows) {
  const n = rows.length;
  if (!n) return null;

  // ---- MAE / RMSE ----
  const preErrors = rows.map((r) => r.actual - r.prePred);
  const postErrors = rows.map((r) => r.actual - r.postPred);
  const preMae = mean(preErrors.map(Math.abs));
  const postMae = mean(postErrors.map(Math.abs));
  const preRmse = rmse(preErrors);
  const postRmse = rmse(postErrors);

  // ---- Acurácia direcional do sinal de picks ----
  // P(sign(delta) == sign(actual - prePred)) — mede se o delta de picks aponta o lado certo
  const deltaRows = rows.filter((r) => r.delta !== 0);
  const deltaCorrect = deltaRows.filter((r) => Math.sign(r.delta) === Math.sign(r.actual - r.prePred)).length;
  const deltaAcc = deltaRows.length ? deltaCorrect / deltaRows.length : NaN;

  // ---- Apostas forçadas: mercado = leagueMean ----
  // Sem picks: direção = sign(prePred - leagueMean)
  // Com picks: direção = sign(postPred - leagueMean)
  // Resultado: sign(actual - leagueMean)
  function forcedBetStats(predKey) {
    const bets = rows.filter((r) => {
      const side = sideVsRef(r[predKey], r.leagueMean);
      const result = sideVsRef(r.actual, r.leagueMean);
      return side !== "push" && result !== "push";
    });
    const correct = bets.filter((r) => {
      const side = sideVsRef(r[predKey], r.leagueMean);
      const result = sideVsRef(r.actual, r.leagueMean);
      return side === result;
    }).length;
    const profit = bets.reduce((s, r) => {
      const side = sideVsRef(r[predKey], r.leagueMean);
      const result = sideVsRef(r.actual, r.leagueMean);
      return s + (side === result ? ODDS - 1 : -1);
    }, 0);
    return {
      bets: bets.length,
      correct,
      hitRate: bets.length ? correct / bets.length : NaN,
      roi: bets.length ? profit / bets.length : NaN,
      profit: r(profit),
    };
  }

  const semPicks = forcedBetStats("prePred");
  const comPicksForced = forcedBetStats("postPred");

  // ---- Apostas filtradas com picks (evaluateDraftMarket, move 0) ----
  const filteredBets = rows.filter((r) => r.draftAllowed && r.draftSide);
  const filteredCorrect = filteredBets.filter((r) => {
    const result = sideVsRef(r.actual, r.preLine); // market = preLine (calibrated, rounded)
    return r.draftSide === result;
  });
  const filteredProfit = filteredBets.reduce((s, fb) => {
    const result = sideVsRef(fb.actual, fb.preLine);
    return s + (fb.draftSide === result ? ODDS - 1 : -1);
  }, 0);

  return {
    n,
    // accuracy
    preMae: r(preMae),
    postMae: r(postMae),
    preRmse: r(preRmse),
    postRmse: r(postRmse),
    maeGain: r(preMae - postMae),
    // directional accuracy of delta
    deltaRows: deltaRows.length,
    deltaAcc: r(deltaAcc, 4),
    // forced bets vs league mean
    semBets: semPicks.bets,
    semHit: r(semPicks.hitRate, 4),
    semRoi: r(semPicks.roi, 4),
    semProfit: semPicks.profit,
    comForcedBets: comPicksForced.bets,
    comForcedHit: r(comPicksForced.hitRate, 4),
    comForcedRoi: r(comPicksForced.roi, 4),
    comForcedProfit: comPicksForced.profit,
    // filtered (draft policy) vs prePred as market
    filteredBets: filteredBets.length,
    filteredHit: filteredBets.length ? r(filteredCorrect.length / filteredBets.length, 4) : null,
    filteredRoi: filteredBets.length ? r(filteredProfit / filteredBets.length, 4) : null,
    filteredProfit: r(filteredProfit),
  };
}

function buildMarkdown(overall, byLeague) {
  const lines = [];
  lines.push("# Impacto dos Picks — Sem vs Com Draft");
  lines.push("");
  lines.push(`Gerado em: ${new Date().toISOString()}`);
  lines.push(`Metodo: walk-forward cross-league, min ${MIN_TRAIN} jogos de treino. Movimento 0.0. Odds ${ODDS.toFixed(2)}.`);
  lines.push("Mercado referencia (apostas forcadas): media da liga no treino.");
  lines.push("Mercado referencia (filtrado por policy): linha pre-draft do modelo.");
  lines.push("");

  lines.push("## Precisao de Predicao (MAE / RMSE)");
  lines.push("");
  lines.push("| Liga | N | MAE sem picks | MAE com picks | Ganho MAE | RMSE sem | RMSE com |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [league, s] of Object.entries(byLeague)) {
    lines.push(`| ${league} | ${s.n} | ${s.preMae} | ${s.postMae} | **${s.maeGain}** | ${s.preRmse} | ${s.postRmse} |`);
  }
  lines.push(`| **TOTAL** | ${overall.n} | ${overall.preMae} | ${overall.postMae} | **${overall.maeGain}** | ${overall.preRmse} | ${overall.postRmse} |`);
  lines.push("");

  lines.push("## Acurácia Direcional do Sinal de Picks");
  lines.push("");
  lines.push("P(sign(delta) == sign(actual - prePred)): com que frequencia o delta dos picks");
  lines.push("aponta o lado certo do residuo (o que o modelo sem picks nao conseguiu prever).");
  lines.push("");
  lines.push("| Liga | Jogos com delta | Acerto direcional |");
  lines.push("|---|---:|---:|");
  for (const [league, s] of Object.entries(byLeague)) {
    lines.push(`| ${league} | ${s.deltaRows} | ${pct(s.deltaAcc)} |`);
  }
  lines.push(`| **TOTAL** | ${overall.deltaRows} | ${pct(overall.deltaAcc)} |`);
  lines.push("");

  lines.push("## ROI: Sem Picks vs Com Picks (Apostas Forcadas, Mercado = Media Liga)");
  lines.push("");
  lines.push("Ambos apostam em toda partida na direcao que o modelo aponta versus a media da liga.");
  lines.push("Sem picks: usa predicao times+patch. Com picks: usa predicao times+patch+draft.");
  lines.push("");
  lines.push("| Liga | Bets | Sem picks Hit | Sem picks ROI | Com picks Hit | Com picks ROI | Ganho ROI |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [league, s] of Object.entries(byLeague)) {
    const gain = Number.isFinite(s.comForcedRoi) && Number.isFinite(s.semRoi) ? r(s.comForcedRoi - s.semRoi, 4) : null;
    lines.push(`| ${league} | ${s.semBets} | ${pct(s.semHit)} | ${pct(s.semRoi)} | ${pct(s.comForcedHit)} | ${pct(s.comForcedRoi)} | ${gain !== null ? pct(gain) : "-"} |`);
  }
  {
    const gain = Number.isFinite(overall.comForcedRoi) && Number.isFinite(overall.semRoi) ? r(overall.comForcedRoi - overall.semRoi, 4) : null;
    lines.push(`| **TOTAL** | ${overall.semBets} | ${pct(overall.semHit)} | ${pct(overall.semRoi)} | ${pct(overall.comForcedHit)} | ${pct(overall.comForcedRoi)} | ${gain !== null ? pct(gain) : "-"} |`);
  }
  lines.push("");

  lines.push("## ROI: Com Picks Filtrado por Policy (Mercado = Linha Pre-Draft)");
  lines.push("");
  lines.push("Usa evaluateDraftMarket (mesma logica do app). So aposta quando ha sinal claro.");
  lines.push("");
  lines.push("| Liga | Bets | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const [league, s] of Object.entries(byLeague)) {
    lines.push(`| ${league} | ${s.filteredBets} | ${pct(s.filteredHit)} | ${pct(s.filteredRoi)} | ${s.filteredProfit} |`);
  }
  lines.push(`| **TOTAL** | ${overall.filteredBets} | ${pct(overall.filteredHit)} | ${pct(overall.filteredRoi)} | ${overall.filteredProfit} |`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const rows = collectRows(games);

  const overall = scoreGroup(rows);
  const byLeague = {};
  for (const league of LEAGUES) {
    byLeague[league] = scoreGroup(rows.filter((r) => r.league === league));
  }

  const md = buildMarkdown(overall, byLeague);
  const outPath = path.join(DATA_DIR, "pick-impact-backtest.md");
  fs.writeFileSync(outPath, md, "utf8");
  console.log(md);
}

if (require.main === module) main();
module.exports = { collectRows, scoreGroup };
