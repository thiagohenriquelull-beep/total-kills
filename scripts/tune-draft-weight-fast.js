/**
 * Varredura rapida de multiplicador do draft.
 *
 * O modelo walk-forward e construido uma vez por jogo. Depois recalculamos o
 * delta do draft usando multiplicadores sobre o peso atual do draft.
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const ODDS = 1.8;
const MULTIPLIERS = [0.75, 1, 1.15, 1.25, 1.35, 1.5, 1.75, 2, 2.25, 2.5];
const MOVES = [0, 0.5, 1, 1.5, 2];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
      const draft = house.post.draft || { effects: [], pairs: [], confidence: 0 };
      const pickMean = mean((draft.effects || []).map((effect) => effect.value).filter(Number.isFinite));
      const pairMean = mean((draft.pairs || []).map((effect) => effect.value).filter(Number.isFinite));
      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        preLine: house.preLine,
        baseDelta: house.delta,
        pickMean,
        pairMean,
        confidence: draft.confidence || 0,
      });
    }
  }
  return rows;
}

function scaledDelta(row, multiplier) {
  const opts = Model.DEFAULT_OPTIONS;
  const raw = (row.pickMean * opts.draftWeight * multiplier) + row.pairMean;
  return clamp(raw * row.confidence, -opts.draftCap, opts.draftCap);
}

function runScenario(baseRows, multiplier, move) {
  return baseRows.map((row) => {
    const delta = scaledDelta(row, multiplier);
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
    const isBet =
      draft.allowed &&
      draft.side &&
      resultSide !== "push" &&
      !Model.DRAFT_MARKET_POLICY.blockedLeagues[row.league];
    const correct = isBet ? draft.side === resultSide : null;
    const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;
    return {
      ...row,
      multiplier,
      move,
      delta: r(delta),
      side: draft.side || side,
      marketLine,
      resultSide,
      decision: isBet ? draft.side : "pass",
      reason: draft.reason,
      correct,
      profit: r(profit, 4),
    };
  });
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

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Draft Weight Sweep");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("Metodo: walk-forward; multiplica apenas o delta do draft e mede a regra de entrada. CBLOL bloqueado como no app.");
  lines.push("");

  for (const move of MOVES) {
    lines.push(`## Movimento casa ${move.toFixed(1)}`);
    lines.push("");
    lines.push("| Mult | Bets | Over | Under | Hit | ROI | Lucro | Hit Over | ROI Over | Hit Under | ROI Under |");
    lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const multiplier of MULTIPLIERS) {
      const item = report.scenarios.find((scenario) => scenario.multiplier === multiplier && scenario.move === move);
      const over = item.bySide.over || summarize([]);
      const under = item.bySide.under || summarize([]);
      lines.push(`| ${multiplier.toFixed(2)}x | ${item.overall.bets} | ${item.overall.overBets} | ${item.overall.underBets} | ${pct(item.overall.hitRate)} | ${pct(item.overall.roi)} | ${item.overall.profit ?? "-"} | ${pct(over.hitRate)} | ${pct(over.roi)} | ${pct(under.hitRate)} | ${pct(under.roi)} |`);
    }
    lines.push("");
  }

  lines.push("## Movimento 0.0 Por Liga");
  lines.push("");
  lines.push("| Mult | Liga | Bets | Hit | ROI | Over | Under |");
  lines.push("|---:|---|---:|---:|---:|---:|---:|");
  for (const multiplier of MULTIPLIERS) {
    const item = report.scenarios.find((scenario) => scenario.multiplier === multiplier && scenario.move === 0);
    for (const league of LEAGUES) {
      const stats = item.byLeague[league] || summarize([]);
      lines.push(`| ${multiplier.toFixed(2)}x | ${league} | ${stats.bets} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.overBets} | ${stats.underBets} |`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const baseRows = buildBaseRows(loadGames());
  const allRows = [];
  const scenarios = [];

  for (const multiplier of MULTIPLIERS) {
    for (const move of MOVES) {
      const rows = runScenario(baseRows, multiplier, move);
      allRows.push(...rows);
      scenarios.push({
        multiplier,
        move,
        overall: summarize(rows),
        bySide: groupSummary(rows.filter((row) => row.correct !== null), "decision"),
        byLeague: groupSummary(rows, "league"),
      });
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    minTrain: MIN_TRAIN,
    odds: ODDS,
    multipliers: MULTIPLIERS,
    moves: MOVES,
    baseRows: baseRows.length,
    scenarios,
  };
  fs.writeFileSync(path.join(DATA_DIR, "draft-weight-sweep.json"), JSON.stringify({ report, rows: allRows }, null, 2), "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "draft-weight-sweep.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = { buildBaseRows, runScenario, summarize, main };
