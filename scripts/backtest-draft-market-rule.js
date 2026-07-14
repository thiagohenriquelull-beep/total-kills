/**
 * Backtest da regra de edge do draft ao vivo.
 *
 * Linha base simulada: linha pre-draft justa do modelo.
 * Movimento simulado: a casa anda a linha na mesma direcao do draft.
 * A regra testada e a mesma usada pelo app via Model.evaluateDraftMarket().
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const MIN_TRAIN = 30;
const ODDS = 1.8;
const MOVES = [0, 0.5, 1, 1.5, 2, 3];

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
  if (side === "under") return preLine - move;
  return preLine + move;
}

function runScenario(games, move) {
  const rows = [];

  for (const league of LEAGUES) {
    const leagueChronological = games
      .filter((game) => game.league === league)
      .sort(Model.sortRecent)
      .reverse();

    for (let index = 0; index < leagueChronological.length; index++) {
      const game = leagueChronological[index];
      // Cross-league training: all games (any league) strictly before this game
      const train = games.filter((g) => {
        if (String(g.id) === String(game.id)) return false;
        const dateCmp = String(g.date || "").localeCompare(String(game.date || ""));
        if (dateCmp < 0) return true;
        if (dateCmp === 0) return Number(g.id || 0) < Number(game.id || 0);
        return false;
      });
      // Require MIN_TRAIN same-league games so the league component is well-fitted
      if (train.filter((g) => g.league === league).length < MIN_TRAIN) continue;

      const model = Model.buildModel(train);
      const house = model.houseLine(game, train);
      const side = house.delta > 0 ? "over" : house.delta < 0 ? "under" : null;
      const marketLine = side ? simulatedMarketLine(house.preLine, side, move) : house.preLine;
      const draft = Model.evaluateDraftMarket({
        league,
        preLine: house.preLine,
        marketLine,
        delta: house.delta,
        oddsOver: ODDS,
        oddsUnder: ODDS,
      });
      const resultSide = actualSide(game.totalKills, marketLine);
      const isBet = Boolean(draft.allowed && draft.side && resultSide !== "push");
      const correct = isBet ? draft.side === resultSide : null;
      const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;

      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        preLine: house.preLine,
        marketLine,
        move,
        draftDelta: r(house.delta),
        side: draft.side,
        bucket: draft.bucketLabel,
        sameDirectionMove: r(draft.sameDirectionMove),
        hitRate: r(draft.hitRate, 4),
        empiricalEv: r(draft.ev, 4),
        decision: draft.allowed ? draft.side : "pass",
        reason: draft.reason,
        resultSide,
        correct,
        profit: r(profit, 4),
        trainGames: train.length,
      });
    }
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
    profit: r(profit, 4),
    roi: bets.length ? r(profit / bets.length, 4) : null,
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

function summaryLine(label, stats) {
  return `| ${label} | ${stats.rows} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.profit ?? "-"} |`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = [
    "scenarioMove",
    "league",
    "date",
    "game",
    "actual",
    "preLine",
    "marketLine",
    "draftDelta",
    "side",
    "bucket",
    "hitRate",
    "empiricalEv",
    "decision",
    "reason",
    "resultSide",
    "correct",
    "profit",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.move,
      row.league,
      row.date,
      row.game,
      row.actual,
      row.preLine,
      row.marketLine,
      row.draftDelta,
      row.side,
      row.bucket,
      row.hitRate,
      row.empiricalEv,
      row.decision,
      row.reason,
      row.resultSide,
      row.correct,
      row.profit,
    ].map(csvEscape).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Backtest Draft Market Rule");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward, minimo ${MIN_TRAIN} jogos de treino. Odds ${ODDS.toFixed(2)}.`);
  lines.push("Linha simulada: pre-draft do modelo. Movimento: casa anda a linha na direcao do draft.");
  lines.push("");
  lines.push("## Por Movimento Da Casa");
  lines.push("");
  lines.push("| Movimento | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const move of MOVES) {
    lines.push(summaryLine(move.toFixed(1), report.byMove[move]));
  }
  lines.push("");
  lines.push("## Movimento 0.0 Por Liga");
  lines.push("");
  lines.push("| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    lines.push(summaryLine(league, report.byLeagueAtMove0[league] || summarize([])));
  }
  lines.push("");
  lines.push("## Movimento 1.0 Por Liga");
  lines.push("");
  lines.push("| Liga | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    lines.push(summaryLine(league, report.byLeagueAtMove1[league] || summarize([])));
  }
  lines.push("");
  lines.push("## Por Faixa De Draft (movimento 0.0)");
  lines.push("");
  lines.push("| Faixa | Jogos | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [bucket, stats] of Object.entries(report.byBucketAtMove0)) {
    lines.push(summaryLine(bucket, stats));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const allRows = [];
  const byMove = {};

  for (const move of MOVES) {
    const rows = runScenario(games, move);
    allRows.push(...rows);
    byMove[move] = summarize(rows);
  }

  const move0Rows = allRows.filter((row) => row.move === 0);
  const move1Rows = allRows.filter((row) => row.move === 1);
  const report = {
    createdAt: new Date().toISOString(),
    minTrain: MIN_TRAIN,
    odds: ODDS,
    moves: MOVES,
    policy: Model.DRAFT_MARKET_POLICY,
    byMove,
    byLeagueAtMove0: groupSummary(move0Rows, "league"),
    byLeagueAtMove1: groupSummary(move1Rows, "league"),
    byBucketAtMove0: groupSummary(move0Rows.filter((row) => row.correct !== null), "bucket"),
  };

  writeJson(path.join(DATA_DIR, "draft-market-rule-backtest.json"), { report, rows: allRows });
  writeCsv(path.join(DATA_DIR, "draft-market-rule-backtest.csv"), allRows);
  fs.writeFileSync(path.join(DATA_DIR, "draft-market-rule-backtest.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = { runScenario, summarize, main };
