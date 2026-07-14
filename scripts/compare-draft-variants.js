/**
 * Comparacao honesta de variantes do modelo de draft.
 *
 * O script primeiro cria uma base walk-forward: cada mapa usa apenas mapas
 * anteriores para calcular pre-line, efeitos dos picks e pares. Depois aplica
 * variantes sobre essa base e mede a regra de entrada do app.
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const ROLES = Model.ROLES;
const MIN_TRAIN = 30;
const ODDS = 1.8;
const MOVES = [0, 0.5, 1, 1.5, 2];
const BASELINE_MOVE0 = { bets: 345, roi: 0.1478 };
const BASELINE_MOVE1 = { bets: 261, roi: 0.0966 };
const MIN_VOLUME_RATIO = 0.8;
const MIN_ROI_GAIN = 0.02;
const ROLE_SIDE_WEIGHTS = {
  over: { TOP: 0.9, JUNGLE: 0.95, MID: 1.1, ADC: 1.0, SUP: 1.08 },
  under: { TOP: 1.12, JUNGLE: 1.08, MID: 1.05, ADC: 1.03, SUP: 1.02 },
};
const PARTIAL_SETS = [
  { name: "partial-adc-sup", label: "ADC+SUP", roles: ["ADC", "SUP"] },
  { name: "partial-mid-jungle", label: "MID+JUNGLE", roles: ["MID", "JUNGLE"] },
  { name: "partial-sup-only", label: "SUP only", roles: ["SUP"] },
  { name: "partial-adc-only", label: "ADC only", roles: ["ADC"] },
  { name: "partial-top-jungle", label: "TOP+JUNGLE", roles: ["TOP", "JUNGLE"] },
  { name: "partial-all-known", label: "Todas roles conhecidas", roles: ROLES },
];

const VARIANTS = [
  { name: "baseline", label: "Baseline atual" },
  { name: "role-side", label: "A: peso por role/lado", roleSide: true },
  { name: "sample-confidence", label: "B: confianca por amostra", sampleConfidence: true },
  { name: "min-league-8", label: "C: minLeagueN 8", minLeagueN: 8 },
  { name: "min-league-12", label: "C: minLeagueN 12", minLeagueN: 12 },
  { name: "min-league-20", label: "C: minLeagueN 20", minLeagueN: 20 },
  { name: "role-side+sample", label: "A+B", roleSide: true, sampleConfidence: true },
  { name: "role-side+min12", label: "A+C12", roleSide: true, minLeagueN: 12 },
  { name: "sample+min12", label: "B+C12", sampleConfidence: true, minLeagueN: 12 },
  { name: "role-side+sample+min12", label: "A+B+C12", roleSide: true, sampleConfidence: true, minLeagueN: 12 },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shrink(n, k) {
  return n / (n + k);
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function sampleEffect(residuals, totals, shrinkValue, cap, weight = 1) {
  if (!residuals.length) return { n: 0, average: 0, raw: 0, value: 0 };
  const raw = mean(residuals);
  const value = clamp(raw * shrink(residuals.length, shrinkValue) * weight, -cap, cap);
  return { n: residuals.length, average: mean(totals), raw, value };
}

function championRoleEffectWithMinLeague(model, champion, role, league, minLeagueN) {
  const opts = model.options || Model.DEFAULT_OPTIONS;
  const globalEffect = sampleEffect(
    model.championRoleResiduals.get(`${role}::${champion}`) || [],
    model.championRoleTotals.get(`${role}::${champion}`) || [],
    opts.champShrink,
    opts.champCap,
    opts.champWeight
  );
  const leagueEffect = sampleEffect(
    model.championLeagueRoleResiduals.get(`${league}::${role}::${champion}`) || [],
    model.championLeagueRoleTotals.get(`${league}::${role}::${champion}`) || [],
    opts.champLeagueShrink,
    opts.champCap,
    opts.champWeight
  );
  if (!minLeagueN || leagueEffect.n < minLeagueN) {
    return {
      champion,
      role,
      league,
      value: globalEffect.value,
      n: globalEffect.n,
      leagueN: leagueEffect.n,
      globalN: globalEffect.n,
      source: "global",
    };
  }
  const leagueTrust = shrink(leagueEffect.n, opts.champLeagueShrink);
  return {
    champion,
    role,
    league,
    value: clamp((leagueTrust * leagueEffect.value) + ((1 - leagueTrust) * globalEffect.value), -opts.champCap, opts.champCap),
    n: leagueEffect.n + globalEffect.n,
    leagueN: leagueEffect.n,
    globalN: globalEffect.n,
    source: "liga+global",
  };
}

function sampleConfidenceFactor(n) {
  if (n < 20) return 0.65;
  if (n < 40) return 0.85;
  if (n < 80) return 1.0;
  return 1.08;
}

function pairKeysForSide(picks) {
  const pairs = [
    ["TOP", "JUNGLE"],
    ["JUNGLE", "MID"],
    ["ADC", "SUP"],
  ];
  return pairs
    .map(([roleA, roleB]) => {
      const champA = picks[ROLES.indexOf(roleA)];
      const champB = picks[ROLES.indexOf(roleB)];
      if (!champA || !champB) return null;
      return `${roleA}:${champA}||${roleB}:${champB}`;
    })
    .filter(Boolean);
}

function getPairEffect(model, key) {
  const opts = model.options || Model.DEFAULT_OPTIONS;
  const residuals = model.pairResiduals.get(key) || [];
  const totals = model.pairTotals.get(key) || [];
  if (!residuals.length) return { key, n: 0, value: 0 };
  const raw = mean(residuals);
  return {
    key,
    n: residuals.length,
    value: clamp(raw * shrink(residuals.length, opts.pairShrink) * opts.pairWeight, -opts.pairCap, opts.pairCap),
  };
}

function actualSide(totalKills, line) {
  if (totalKills > line) return "over";
  if (totalKills < line) return "under";
  return "push";
}

function simulatedMarketLine(preLine, side, move) {
  return side === "under" ? preLine - move : preLine + move;
}

function buildBaseRows(games) {
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
      const lineAdjustment = house.calibration.adjustment || 0;
      const prePrediction = house.pre.prediction + lineAdjustment;
      const pickEffects = [];
      const pairEffects = [];

      for (const side of ["teamA", "teamB"]) {
        const picks = game.picks?.[side] || [];
        picks.forEach((champion, indexRole) => {
          if (!champion) return;
          const role = ROLES[indexRole] || "UNK";
          const current = model.championRoleEffect(champion, role, league);
          const alternatives = {};
          for (const minLeagueN of [8, 12, 20]) {
            alternatives[minLeagueN] = championRoleEffectWithMinLeague(model, champion, role, league, minLeagueN).value;
          }
          pickEffects.push({
            champion,
            role,
            side,
            value: current.value || 0,
            n: current.n || 0,
            leagueN: current.leagueN || 0,
            globalN: current.globalN || 0,
            alternatives,
          });
        });
        for (const key of pairKeysForSide(picks)) pairEffects.push(getPairEffect(model, key));
      }

      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        preLine: house.preLine,
        prePrediction,
        baseDelta: house.delta,
        basePostPrediction: prePrediction + house.delta,
        confidence: house.post.draft?.confidence || 0,
        pickEffects,
        pairMean: mean(pairEffects.map((effect) => effect.value || 0)),
      });
    }
  }
  return rows;
}

function pickValueForVariant(effect, variant) {
  let value = variant.minLeagueN ? effect.alternatives[String(variant.minLeagueN)] : effect.value;
  if (variant.sampleConfidence) value *= sampleConfidenceFactor(effect.n || 0);
  if (variant.roleSide) {
    const side = value > 0 ? "over" : value < 0 ? "under" : null;
    if (side) value *= ROLE_SIDE_WEIGHTS[side][effect.role] ?? 1;
  }
  return value;
}

function deltaForVariant(row, variant, partialRoles = null) {
  const opts = Model.DEFAULT_OPTIONS;
  const effects = partialRoles
    ? row.pickEffects.filter((effect) => partialRoles.includes(effect.role))
    : row.pickEffects;
  if (!effects.length) return 0;
  const pickMean = mean(effects.map((effect) => pickValueForVariant(effect, variant)));
  const pairMean = partialRoles ? 0 : row.pairMean;
  const countConfidence = Math.sqrt(effects.length / 10);
  const sampleConfidence = shrink(mean(effects.map((effect) => effect.n || 0)), opts.champShrink);
  const confidence = partialRoles ? clamp(countConfidence * sampleConfidence, 0.1, 1) : row.confidence;
  const raw = (pickMean * opts.draftWeight) + pairMean;
  return clamp(raw * confidence, -opts.draftCap, opts.draftCap);
}

function runRows(baseRows, variant, move, partial = null) {
  const rows = [];
  for (const row of baseRows) {
    const delta = deltaForVariant(row, variant, partial?.roles || null);
    const side = delta > 0 ? "over" : delta < 0 ? "under" : null;
    const marketLine = side ? simulatedMarketLine(row.preLine, side, move) : row.preLine;
    const draft = Model.evaluateDraftMarket({
      league: row.league,
      preLine: row.preLine,
      marketLine,
      delta,
      oddsOver: ODDS,
      oddsUnder: ODDS,
    });
    const resultSide = actualSide(row.actual, marketLine);
    const isBet = Boolean(draft.allowed && draft.side && resultSide !== "push");
    const correct = isBet ? draft.side === resultSide : null;
    const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;
    rows.push({
      id: row.id,
      league: row.league,
      date: row.date,
      game: row.game,
      actual: row.actual,
      preLine: row.preLine,
      marketLine,
      variant: partial?.name || variant.name,
      variantLabel: partial?.label || variant.label,
      move,
      delta: r(delta, 4),
      decision: isBet ? draft.side : "pass",
      reason: draft.reason,
      resultSide,
      correct,
      profit: r(profit, 4),
      preAbsError: Math.abs(row.actual - row.prePrediction),
      postAbsError: Math.abs(row.actual - (row.prePrediction + delta)),
    });
  }
  return rows;
}

function summarize(rows) {
  const bets = rows.filter((row) => row.correct !== null);
  const correct = bets.filter((row) => row.correct).length;
  const profit = bets.reduce((sum, row) => sum + (row.profit || 0), 0);
  return {
    rows: rows.length,
    bets: bets.length,
    pass: rows.length - bets.length,
    correct,
    hitRate: bets.length ? r(correct / bets.length, 4) : null,
    roi: bets.length ? r(profit / bets.length, 4) : null,
    profit: r(profit, 4),
    overBets: bets.filter((row) => row.decision === "over").length,
    underBets: bets.filter((row) => row.decision === "under").length,
    preMae: r(mean(rows.map((row) => row.preAbsError)), 4),
    postMae: r(mean(rows.map((row) => row.postAbsError)), 4),
  };
}

function groupSummary(rows, key) {
  const groups = {};
  for (const row of rows) {
    const value = row[key] || "--";
    if (!groups[value]) groups[value] = [];
    groups[value].push(row);
  }
  return Object.fromEntries(Object.entries(groups).map(([value, group]) => [value, summarize(group)]));
}

function passesCriteria(item) {
  const move0 = item.byMove["0"];
  const move1 = item.byMove["1"];
  const overMove1 = item.byMoveSide["1"]?.over || summarize([]);
  const underMove1 = item.byMoveSide["1"]?.under || summarize([]);
  const move0Pass = move0.bets >= BASELINE_MOVE0.bets * MIN_VOLUME_RATIO && (move0.roi || 0) >= BASELINE_MOVE0.roi + MIN_ROI_GAIN;
  const move1Pass = move1.bets >= BASELINE_MOVE1.bets * MIN_VOLUME_RATIO && (move1.roi || 0) >= BASELINE_MOVE1.roi + MIN_ROI_GAIN;
  const sidesOk = (overMove1.bets === 0 || (overMove1.roi || 0) >= 0) && (underMove1.bets === 0 || (underMove1.roi || 0) >= 0);
  return (move0Pass || move1Pass) && sidesOk;
}

function bestBy(scenarios, selector) {
  return [...scenarios]
    .filter((item) => selector(item).bets > 0)
    .sort((a, b) => {
      const aStats = selector(a);
      const bStats = selector(b);
      const scoreA = (aStats.roi || -1) * Math.log10(aStats.bets + 1);
      const scoreB = (bStats.roi || -1) * Math.log10(bStats.bets + 1);
      return scoreB - scoreA;
    })[0] || null;
}

function summaryLine(label, stats) {
  return `| ${label} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.profit ?? "-"} | ${stats.preMae?.toFixed(2) ?? "-"} | ${stats.postMae?.toFixed(2) ?? "-"} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Draft Variant Comparison");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, min treino ${MIN_TRAIN}, odd ${ODDS.toFixed(2)}. Linha base = pre-line do modelo.`);
  lines.push(`Criterio: ROI +2 p.p. vs baseline em movimento 0 ou 1, volume >= ${Math.round(MIN_VOLUME_RATIO * 100)}%, OVER/UNDER nao negativos no movimento 1.`);
  lines.push("");
  lines.push("## Veredito");
  lines.push("");
  lines.push(`- Melhor geral movimento 0: ${report.best.move0?.label || "--"} (${report.best.move0 ? pct(report.best.move0.byMove["0"].roi) : "-"})`);
  lines.push(`- Melhor geral movimento 1: ${report.best.move1?.label || "--"} (${report.best.move1 ? pct(report.best.move1.byMove["1"].roi) : "-"})`);
  lines.push(`- Variantes aprovadas: ${report.approved.length ? report.approved.map((item) => item.label).join(", ") : "nenhuma"}`);
  lines.push("");
  lines.push("## Variantes Com Draft Completo");
  for (const move of MOVES) {
    lines.push("");
    lines.push(`### Movimento ${move.toFixed(1)}`);
    lines.push("");
    lines.push("| Variante | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE pre | MAE pos |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const item of report.fullDraft) {
      lines.push(summaryLine(item.label, item.byMove[String(move)]));
    }
  }
  lines.push("");
  lines.push("## Sinais Parciais");
  for (const move of [0, 1]) {
    lines.push("");
    lines.push(`### Movimento ${move.toFixed(1)}`);
    lines.push("");
    lines.push("| Sinal | Bets | Over | Under | Greens | Hit | ROI | Lucro | MAE pre | MAE pos |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const item of report.partialSignals) {
      lines.push(summaryLine(item.label, item.byMove[String(move)]));
    }
  }
  lines.push("");
  lines.push("## Melhor Por Liga No Movimento 0");
  lines.push("");
  lines.push("| Liga | Variante | Bets | Hit | ROI | Over | Under |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const [league, item] of Object.entries(report.bestByLeagueMove0)) {
    const stats = item.stats;
    lines.push(`| ${league} | ${item.label} | ${stats.bets} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.overBets} | ${stats.underBets} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const baseRows = buildBaseRows(loadGames());

  function buildScenario(variant, partial = null) {
    const byMove = {};
    const byMoveSide = {};
    const byLeagueMove0 = {};
    for (const move of MOVES) {
      const rows = runRows(baseRows, variant, move, partial);
      byMove[String(move)] = summarize(rows);
      byMoveSide[String(move)] = groupSummary(rows.filter((row) => row.correct !== null), "decision");
      if (move === 0) Object.assign(byLeagueMove0, groupSummary(rows, "league"));
    }
    return {
      name: partial?.name || variant.name,
      label: partial?.label || variant.label,
      type: partial ? "partial" : "full",
      config: partial || variant,
      byMove,
      byMoveSide,
      byLeagueMove0,
    };
  }

  const fullDraft = VARIANTS.map((variant) => buildScenario(variant));
  const partialSignals = PARTIAL_SETS.map((partial) => buildScenario(VARIANTS[0], partial));
  const approved = fullDraft.filter(passesCriteria);
  const best = {
    move0: bestBy(fullDraft, (item) => item.byMove["0"]),
    move1: bestBy(fullDraft, (item) => item.byMove["1"]),
    overMove1: bestBy(fullDraft, (item) => item.byMoveSide["1"]?.over || summarize([])),
    underMove1: bestBy(fullDraft, (item) => item.byMoveSide["1"]?.under || summarize([])),
    partialMove0: bestBy(partialSignals, (item) => item.byMove["0"]),
    partialMove1: bestBy(partialSignals, (item) => item.byMove["1"]),
  };
  const bestByLeagueMove0 = {};
  for (const league of LEAGUES) {
    const winner = bestBy(fullDraft, (item) => item.byLeagueMove0[league] || summarize([]));
    if (winner) bestByLeagueMove0[league] = { label: winner.label, stats: winner.byLeagueMove0[league] };
  }

  const report = {
    createdAt: new Date().toISOString(),
    minTrain: MIN_TRAIN,
    odds: ODDS,
    moves: MOVES,
    criteria: { minRoiGain: MIN_ROI_GAIN, minVolumeRatio: MIN_VOLUME_RATIO },
    baseline: { move0: BASELINE_MOVE0, move1: BASELINE_MOVE1 },
    baseRows: baseRows.length,
    fullDraft,
    partialSignals,
    approved,
    best,
    bestByLeagueMove0,
  };

  fs.writeFileSync(path.join(DATA_DIR, "draft-variant-comparison.json"), JSON.stringify({ report }, null, 2), "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "draft-variant-comparison.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify({
    approved: approved.map((item) => item.label),
    best: {
      move0: best.move0?.label,
      move1: best.move1?.label,
      overMove1: best.overMove1?.label,
      underMove1: best.underMove1?.label,
      partialMove0: best.partialMove0?.label,
      partialMove1: best.partialMove1?.label,
    },
  }, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = { buildBaseRows, runRows, summarize, main };
