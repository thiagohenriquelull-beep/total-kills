/**
 * Backtest da regra final do app.
 *
 * O objetivo aqui nao e testar 15 linhas sinteticas. O teste simula uma unica
 * linha por mapa: a linha justa pre-draft do proprio modelo, arredondada em x.5.
 * Depois aplica a decisao final do app com picks, EV e filtros de edge.
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const DEFAULT_SIGMA = 6.4;
const DEFAULT_EDGE_THRESHOLD = 1.0;
const DEFAULT_ODDS_OVER = 1.8;
const DEFAULT_ODDS_UNDER = 1.8;
const EXCLUDED_DRAFT_LEAGUES = [];
const DEFAULT_BET_POLICY = {
  minEv: 0.05,
  contrarianMinEv: 0.12,
  contrarianMaxAgainstEdge: 2.5,
  minContrarianProbability: 0.28,
};

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

function evaluateBetSide(side, probability, odds, edge, minEdge, policy = DEFAULT_BET_POLICY) {
  if (!Number.isFinite(probability) || !Number.isFinite(edge)) {
    return { side, ev: null, allowed: false, score: -Infinity, reason: "sem probabilidade" };
  }
  const ev = probability * odds - 1;
  const sideEdge = side === "over" ? edge : -edge;
  const againstEdge = sideEdge < 0;
  const label = side === "over" ? "Over" : "Under";
  let allowed = false;
  let reason = "";
  let score = ev;

  if (ev < policy.minEv) {
    reason = "EV baixo";
  } else if (sideEdge >= minEdge) {
    allowed = true;
    reason = "EV + edge";
  } else if (sideEdge >= 0) {
    reason = "edge baixo";
  } else if (
    ev >= policy.contrarianMinEv &&
    Math.abs(sideEdge) <= policy.contrarianMaxAgainstEdge &&
    probability >= policy.minContrarianProbability
  ) {
    allowed = true;
    reason = "odd alta";
    score = ev - 0.04;
  } else {
    reason = "contra a linha";
  }

  return { side, label, ev, sideEdge, againstEdge, allowed, score, reason, probability, odds };
}

function classifyDecision(overEval, underEval) {
  const allowed = [overEval, underEval].filter((item) => item.allowed);
  if (!allowed.length) {
    const best = [overEval, underEval]
      .filter((item) => Number.isFinite(item.ev))
      .sort((a, b) => b.ev - a.ev)[0];
    return {
      label: best ? `PASS ${best.reason}` : "--",
      side: null,
      reason: best?.reason || "sem valor",
      ev: best?.ev ?? null,
    };
  }
  allowed.sort((a, b) => b.score - a.score);
  const best = allowed[0];
  const strength = best.ev >= 0.2 ? "forte" : best.ev >= 0.08 ? "medio" : "leve";
  return {
    label: `${best.label} ${strength}`,
    side: best.side,
    reason: best.reason,
    ev: best.ev,
    againstEdge: best.againstEdge,
  };
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function actualSide(totalKills, line) {
  if (totalKills > line) return "over";
  if (totalKills < line) return "under";
  return "push";
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

function runBacktest(games, options = {}) {
  const oddsOver = options.oddsOver || DEFAULT_ODDS_OVER;
  const oddsUnder = options.oddsUnder || DEFAULT_ODDS_UNDER;
  const minEdge = options.minEdge || DEFAULT_EDGE_THRESHOLD;
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
      const line = house.preLine;
      const prediction = house.post.prediction + (house.calibration.adjustment || 0);
      const edge = prediction - line;
      const sigma = house.post.sigma || model.leagueSigmas.get(league) || DEFAULT_SIGMA;
      const overProbability = 1 - normalCdf(line, prediction, sigma);
      const underProbability = 1 - overProbability;
      const overEval = evaluateBetSide("over", overProbability, oddsOver, edge, minEdge);
      const underEval = evaluateBetSide("under", underProbability, oddsUnder, edge, minEdge);
      let decision = classifyDecision(overEval, underEval);
      if (EXCLUDED_DRAFT_LEAGUES.includes(league)) {
        decision = { label: "PASS - liga excluida", side: null, reason: "liga bloqueada", ev: null };
      }

      const side = actualSide(game.totalKills, line);
      const isBet = Boolean(decision.side && side !== "push");
      const odds = decision.side === "under" ? oddsUnder : oddsOver;
      const correct = isBet ? decision.side === side : null;
      const profit = !isBet ? 0 : correct ? odds - 1 : -1;

      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        line,
        prePrediction: r(house.pre.prediction + (house.calibration.adjustment || 0)),
        postPrediction: r(prediction),
        draftDelta: r(house.delta),
        draftConfidence: r(house.post.draft.confidence || 0, 3),
        edge: r(edge),
        sigma: r(sigma),
        overProbability: r(overProbability, 4),
        underProbability: r(underProbability, 4),
        evOver: r(overEval.ev, 4),
        evUnder: r(underEval.ev, 4),
        overReason: overEval.reason,
        underReason: underEval.reason,
        decision: decision.label,
        decisionSide: decision.side,
        decisionReason: decision.reason,
        actualSide: side,
        correct,
        profit: r(profit, 4),
        trainGames: train.length,
        draftSignal: house.signal?.lean || "neutral",
        draftSignalAction: Boolean(house.signal?.action),
        draftSignalReason: house.signal?.reason || "",
        topPickEffects: topEffects(house.post.draft.effects || []),
      });
    }
  }

  return rows;
}

function summarize(rows) {
  const betRows = rows.filter((row) => row.correct !== null);
  const correct = betRows.filter((row) => row.correct).length;
  const profit = betRows.reduce((sum, row) => sum + (row.profit || 0), 0);
  return {
    rows: rows.length,
    bets: betRows.length,
    pass: rows.length - betRows.length,
    correct,
    hitRate: betRows.length ? r(correct / betRows.length, 4) : null,
    profit: r(profit, 4),
    roi: betRows.length ? r(profit / betRows.length, 4) : null,
    overBets: betRows.filter((row) => row.decisionSide === "over").length,
    underBets: betRows.filter((row) => row.decisionSide === "under").length,
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
    "line",
    "postPrediction",
    "edge",
    "overProbability",
    "underProbability",
    "evOver",
    "evUnder",
    "decisionSide",
    "decisionReason",
    "actualSide",
    "correct",
    "profit",
    "draftDelta",
    "draftConfidence",
    "draftSignal",
    "draftSignalReason",
    "topPickEffects",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.league,
      row.date,
      row.game,
      row.actual,
      row.line,
      row.postPrediction,
      row.edge,
      row.overProbability,
      row.underProbability,
      row.evOver,
      row.evUnder,
      row.decisionSide || "",
      row.decisionReason,
      row.actualSide,
      row.correct,
      row.profit,
      row.draftDelta,
      row.draftConfidence,
      row.draftSignal,
      row.draftSignalReason,
      row.topPickEffects.map((effect) => `${effect.role} ${effect.champion} ${effect.value >= 0 ? "+" : ""}${effect.value}`).join(" | "),
    ].map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function summaryLine(label, stats) {
  return `| ${label} | ${stats.rows} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.profit ?? "-"} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Backtest Da Regra Final");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, minimo ${MIN_TRAIN} jogos de treino. Linha simulada = linha pre-draft justa do modelo.`);
  lines.push(`Odds usadas: over ${report.oddsOver.toFixed(2)} / under ${report.oddsUnder.toFixed(2)}. Break-even @1.80 = 55.6%.`);
  lines.push("");
  lines.push("A regra testada e a mesma do app: EV primeiro, edge como filtro de confianca, e contrarian apenas para odd alta com EV maior.");
  lines.push("");
  lines.push("## Geral");
  lines.push("");
  lines.push("| Grupo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  lines.push(summaryLine("Todos", report.overall));
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push("| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    lines.push(summaryLine(league, report.byLeague[league] || summarize([])));
  }
  lines.push("");
  lines.push("## Por Motivo");
  lines.push("");
  lines.push("| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [reason, stats] of Object.entries(report.byDecisionReason)) {
    lines.push(summaryLine(reason, stats));
  }
  lines.push("");
  lines.push("## Pass Por Motivo");
  lines.push("");
  lines.push("| Motivo | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [reason, stats] of Object.entries(report.byPassReason)) {
    lines.push(summaryLine(reason, stats));
  }
  lines.push("");
  lines.push("## Por Lado");
  lines.push("");
  lines.push("| Lado | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [side, stats] of Object.entries(report.byDecisionSide)) {
    lines.push(summaryLine(side, stats));
  }
  lines.push("");
  lines.push("## Observacao");
  lines.push("");
  lines.push("Este teste nao prova odd 3.00 historica, porque nao temos historico real de odds. Ele valida a regra com odds padrao 1.80. As odds altas entram corretamente no app pela formula de EV e precisam ser confirmadas no historico real das apostas registradas.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const rows = runBacktest(loadGames());
  const report = {
    createdAt: new Date().toISOString(),
    minTrain: MIN_TRAIN,
    oddsOver: DEFAULT_ODDS_OVER,
    oddsUnder: DEFAULT_ODDS_UNDER,
    edgeThreshold: DEFAULT_EDGE_THRESHOLD,
    betPolicy: DEFAULT_BET_POLICY,
    excludedDraftLeagues: EXCLUDED_DRAFT_LEAGUES,
    overall: summarize(rows),
    byLeague: groupSummary(rows, "league"),
    byDecisionReason: groupSummary(rows.filter((row) => row.correct !== null), "decisionReason"),
    byPassReason: groupSummary(rows.filter((row) => row.correct === null), "decisionReason"),
    byDecisionSide: groupSummary(rows.filter((row) => row.correct !== null), "decisionSide"),
  };

  writeJson(path.join(DATA_DIR, "final-rule-backtest.json"), { report, rows });
  writeCsv(path.join(DATA_DIR, "final-rule-backtest.csv"), rows);
  fs.writeFileSync(path.join(DATA_DIR, "final-rule-backtest.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = {
  DEFAULT_BET_POLICY,
  evaluateBetSide,
  classifyDecision,
  runBacktest,
  summarize,
  main,
};
