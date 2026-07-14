/**
 * Testa confluencia entre a regra atual de draft completo e sinais parciais.
 *
 * Pergunta: quando o draft completo ja gera entrada, melhora exigir que
 * certas lanes/picks tambem apontem para o mesmo lado?
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
const PARTIAL_SETS = [
  { name: "adc-sup", label: "ADC+SUP", roles: ["ADC", "SUP"] },
  { name: "mid-jungle", label: "MID+JUNGLE", roles: ["MID", "JUNGLE"] },
  { name: "top-jungle", label: "TOP+JUNGLE", roles: ["TOP", "JUNGLE"] },
  { name: "adc-only", label: "ADC only", roles: ["ADC"] },
  { name: "sup-only", label: "SUP only", roles: ["SUP"] },
  { name: "mid-only", label: "MID only", roles: ["MID"] },
  { name: "jungle-only", label: "JUNGLE only", roles: ["JUNGLE"] },
  { name: "bot-or-midjungle", label: "ADC+SUP ou MID+JUNGLE", union: ["adc-sup", "mid-jungle"] },
  { name: "topjungle-or-adc", label: "TOP+JUNGLE ou ADC", union: ["top-jungle", "adc-only"] },
];
const PARTIAL_THRESHOLD = 0.45;

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

function shrink(n, k) {
  return n / (n + k);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
      const effects = [];
      for (const side of ["teamA", "teamB"]) {
        (game.picks?.[side] || []).forEach((champion, indexRole) => {
          if (!champion) return;
          const role = ROLES[indexRole] || "UNK";
          const effect = model.championRoleEffect(champion, role, game.league);
          effects.push({ champion, role, value: effect.value || 0, n: effect.n || 0 });
        });
      }
      rows.push({
        id: game.id,
        league,
        date: game.date || "",
        game: `${game.teamA} vs ${game.teamB}`,
        actual: game.totalKills,
        preLine: house.preLine,
        fullDelta: house.delta,
        effects,
      });
    }
  }
  return rows;
}

function partialDelta(row, roles) {
  const selected = row.effects.filter((effect) => roles.includes(effect.role));
  if (!selected.length) return 0;
  const pickMean = mean(selected.map((effect) => effect.value || 0));
  const countConfidence = Math.sqrt(selected.length / 10);
  const sampleConfidence = shrink(mean(selected.map((effect) => effect.n || 0)), Model.DEFAULT_OPTIONS.champShrink);
  const confidence = clamp(countConfidence * sampleConfidence, 0.1, 1);
  const raw = pickMean * Model.DEFAULT_OPTIONS.draftWeight;
  return clamp(raw * confidence, -Model.DEFAULT_OPTIONS.draftCap, Model.DEFAULT_OPTIONS.draftCap);
}

function partialPasses(row, partial, side) {
  if (partial.union) {
    return partial.union.some((name) => {
      const child = PARTIAL_SETS.find((item) => item.name === name);
      return child && partialPasses(row, child, side);
    });
  }
  const delta = partialDelta(row, partial.roles);
  if (side === "over") return delta >= PARTIAL_THRESHOLD;
  if (side === "under") return delta <= -PARTIAL_THRESHOLD;
  return false;
}

function runScenario(baseRows, move, partial = null) {
  const rows = [];
  for (const row of baseRows) {
    const fullSide = row.fullDelta > 0 ? "over" : row.fullDelta < 0 ? "under" : null;
    const marketLine = fullSide ? simulatedMarketLine(row.preLine, fullSide, move) : row.preLine;
    const fullDraft = Model.evaluateDraftMarket({
      league: row.league,
      preLine: row.preLine,
      marketLine,
      delta: row.fullDelta,
      oddsOver: ODDS,
      oddsUnder: ODDS,
    });
    const confluenceOk = !partial || (fullDraft.side && partialPasses(row, partial, fullDraft.side));
    const resultSide = actualSide(row.actual, marketLine);
    const isBet = Boolean(fullDraft.allowed && confluenceOk && fullDraft.side && resultSide !== "push");
    const correct = isBet ? fullDraft.side === resultSide : null;
    const profit = !isBet ? 0 : correct ? ODDS - 1 : -1;
    rows.push({
      id: row.id,
      league: row.league,
      date: row.date,
      game: row.game,
      actual: row.actual,
      preLine: row.preLine,
      marketLine,
      move,
      fullDelta: r(row.fullDelta, 4),
      partial: partial?.name || "baseline",
      partialLabel: partial?.label || "Sem filtro",
      confluenceOk,
      decision: isBet ? fullDraft.side : "pass",
      reason: isBet ? "confluencia" : fullDraft.reason,
      resultSide,
      correct,
      profit: r(profit, 4),
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
  return `| ${label} | ${stats.bets} | ${stats.overBets} | ${stats.underBets} | ${stats.correct} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.profit ?? "-"} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Draft Confluence Test");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo: walk-forward. Entrada = regra atual do draft completo + filtro parcial no mesmo lado. Threshold parcial abs >= ${PARTIAL_THRESHOLD}.`);
  lines.push("");
  for (const move of MOVES) {
    lines.push(`## Movimento ${move.toFixed(1)}`);
    lines.push("");
    lines.push("| Filtro | Bets | Over | Under | Greens | Hit | ROI | Lucro |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const item of report.scenarios) {
      lines.push(summaryLine(item.label, item.byMove[String(move)]));
    }
    lines.push("");
  }
  lines.push("## Melhor Por Liga - Movimento 0");
  lines.push("");
  lines.push("| Liga | Filtro | Bets | Hit | ROI | Over | Under |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const [league, item] of Object.entries(report.bestByLeagueMove0)) {
    const stats = item.stats;
    lines.push(`| ${league} | ${item.label} | ${stats.bets} | ${pct(stats.hitRate)} | ${pct(stats.roi)} | ${stats.overBets} | ${stats.underBets} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function bestBy(scenarios, selector) {
  return [...scenarios]
    .filter((item) => selector(item).bets > 0)
    .sort((a, b) => {
      const as = selector(a);
      const bs = selector(b);
      const scoreA = (as.roi || -1) * Math.log10(as.bets + 1);
      const scoreB = (bs.roi || -1) * Math.log10(bs.bets + 1);
      return scoreB - scoreA;
    })[0] || null;
}

function main() {
  const baseRows = buildBaseRows(loadGames());
  const filters = [{ name: "baseline", label: "Sem filtro" }, ...PARTIAL_SETS];
  const scenarios = filters.map((partial) => {
    const filter = partial.name === "baseline" ? null : partial;
    const byMove = {};
    const byMoveSide = {};
    const byLeagueMove0 = {};
    for (const move of MOVES) {
      const rows = runScenario(baseRows, move, filter);
      byMove[String(move)] = summarize(rows);
      byMoveSide[String(move)] = groupSummary(rows.filter((row) => row.correct !== null), "decision");
      if (move === 0) Object.assign(byLeagueMove0, groupSummary(rows, "league"));
    }
    return { name: partial.name, label: partial.label, byMove, byMoveSide, byLeagueMove0 };
  });
  const best = {
    move0: bestBy(scenarios, (item) => item.byMove["0"]),
    move1: bestBy(scenarios, (item) => item.byMove["1"]),
    overMove1: bestBy(scenarios, (item) => item.byMoveSide["1"]?.over || summarize([])),
    underMove1: bestBy(scenarios, (item) => item.byMoveSide["1"]?.under || summarize([])),
  };
  const bestByLeagueMove0 = {};
  for (const league of LEAGUES) {
    const winner = bestBy(scenarios, (item) => item.byLeagueMove0[league] || summarize([]));
    if (winner) bestByLeagueMove0[league] = { label: winner.label, stats: winner.byLeagueMove0[league] };
  }
  const report = {
    createdAt: new Date().toISOString(),
    minTrain: MIN_TRAIN,
    odds: ODDS,
    moves: MOVES,
    partialThreshold: PARTIAL_THRESHOLD,
    baseRows: baseRows.length,
    scenarios,
    best,
    bestByLeagueMove0,
  };
  fs.writeFileSync(path.join(DATA_DIR, "draft-confluence-test.json"), JSON.stringify({ report }, null, 2), "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "draft-confluence-test.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify({
    best: {
      move0: best.move0?.label,
      move1: best.move1?.label,
      overMove1: best.overMove1?.label,
      underMove1: best.underMove1?.label,
    },
  }, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = { buildBaseRows, runScenario, summarize, main };
