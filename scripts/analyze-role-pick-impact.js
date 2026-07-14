/**
 * Analise criteriosa de impacto por role e campeao.
 *
 * Role impact: walk-forward sem vazamento. Cada jogo usa apenas jogos
 * anteriores para calcular o sinal de cada role.
 *
 * Pick impact: modelo atual completo, com amostra minima, para listar os
 * campeoes por role que mais puxam over/under no app.
 */

const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const ROLES = Model.ROLES;
const MIN_TRAIN = 30;
const ROLE_SIGNAL_MIN = 0.15;
const MIN_PICK_SAMPLE = 20;

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

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) {
    games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  }
  return games.filter((game) => LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
}

function roleSignal(model, game, role) {
  const index = ROLES.indexOf(role);
  const picks = [game.picks?.teamA?.[index], game.picks?.teamB?.[index]].filter(Boolean);
  if (!picks.length) return { role, picks: [], rawMean: 0, contribution: 0, avgN: 0 };
  const effects = picks.map((champion) => model.championRoleEffect(champion, role, game.league));
  const sum = effects.reduce((total, effect) => total + (effect.value || 0), 0);
  const contribution = (sum / 10) * Model.DEFAULT_OPTIONS.draftWeight;
  return {
    role,
    picks: effects,
    rawMean: mean(effects.map((effect) => effect.value || 0)),
    contribution,
    avgN: mean(effects.map((effect) => effect.n || 0)),
  };
}

function roleRowsWalkForward(games) {
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
      const deviation = game.totalKills - house.preLine;

      for (const role of ROLES) {
        const signal = roleSignal(model, game, role);
        const contribution = signal.contribution;
        const side = contribution > ROLE_SIGNAL_MIN ? "over" : contribution < -ROLE_SIGNAL_MIN ? "under" : "neutral";
        rows.push({
          league,
          role,
          gameId: game.id,
          game: `${game.teamA} vs ${game.teamB}`,
          actual: game.totalKills,
          preLine: house.preLine,
          deviation,
          contribution,
          absContribution: Math.abs(contribution),
          side,
          hit: side === "neutral" ? null : (side === "over" ? deviation > 0 : deviation < 0),
          avgN: signal.avgN,
          picks: signal.picks.map((effect) => ({
            champion: effect.champion,
            role: effect.role,
            value: r(effect.value),
            n: effect.n,
          })),
        });
      }
    }
  }

  return rows;
}

function summarizeRole(rows) {
  const active = rows.filter((row) => row.side !== "neutral");
  const over = active.filter((row) => row.side === "over");
  const under = active.filter((row) => row.side === "under");
  const correct = active.filter((row) => row.hit).length;
  return {
    rows: rows.length,
    active: active.length,
    activeRate: rows.length ? r(active.length / rows.length, 4) : null,
    avgAbsContribution: r(mean(rows.map((row) => row.absContribution)), 4),
    medianAbsContribution: r(median(rows.map((row) => row.absContribution)), 4),
    avgOverContribution: r(mean(over.map((row) => row.contribution)), 4),
    avgUnderContribution: r(mean(under.map((row) => Math.abs(row.contribution))), 4),
    overSignals: over.length,
    underSignals: under.length,
    hitRate: active.length ? r(correct / active.length, 4) : null,
    overHitRate: over.length ? r(over.filter((row) => row.hit).length / over.length, 4) : null,
    underHitRate: under.length ? r(under.filter((row) => row.hit).length / under.length, 4) : null,
  };
}

function groupBy(rows, key) {
  const groups = {};
  for (const row of rows) {
    const value = row[key] || "--";
    if (!groups[value]) groups[value] = [];
    groups[value].push(row);
  }
  return groups;
}

function pickRankings(games) {
  const model = Model.buildModel(games);
  const global = { over: [], under: [] };
  const byLeague = {};

  function addRanking(target, effect, league) {
    if (!effect.n || effect.n < MIN_PICK_SAMPLE) return;
    const item = {
      champion: effect.champion,
      role: effect.role,
      league,
      value: r(effect.value, 3),
      average: r(effect.average, 2),
      n: effect.n,
      leagueN: effect.leagueN || 0,
      globalN: effect.globalN || 0,
      source: effect.source || "global",
    };
    if (effect.value > 0) target.over.push(item);
    if (effect.value < 0) target.under.push(item);
  }

  for (const champion of model.champions) {
    for (const role of ROLES) {
      addRanking(global, model.championRoleEffect(champion, role, ""), "GLOBAL");
    }
  }

  global.over.sort((a, b) => b.value - a.value);
  global.under.sort((a, b) => a.value - b.value);

  for (const league of LEAGUES) {
    const target = { over: [], under: [] };
    for (const champion of model.champions) {
      for (const role of ROLES) {
        addRanking(target, model.championRoleEffect(champion, role, league), league);
      }
    }
    target.over.sort((a, b) => b.value - a.value);
    target.under.sort((a, b) => a.value - b.value);
    byLeague[league] = {
      over: target.over.slice(0, 20),
      under: target.under.slice(0, 20),
    };
  }

  return {
    global: {
      over: global.over.slice(0, 25),
      under: global.under.slice(0, 25),
    },
    byLeague,
  };
}

function lineForRole(role, item) {
  return `| ${role} | ${item.active} | ${pct(item.activeRate)} | ${item.avgAbsContribution.toFixed(3)} | ${item.overSignals} | ${pct(item.overHitRate)} | ${item.underSignals} | ${pct(item.underHitRate)} | ${pct(item.hitRate)} |`;
}

function pickTable(title, rows) {
  const lines = [];
  lines.push(`### ${title}`);
  lines.push("");
  lines.push("| Rank | Campeao | Role | Ajuste | Media | n | Liga n | Fonte |");
  lines.push("|---:|---|---|---:|---:|---:|---:|---|");
  rows.slice(0, 15).forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.champion} | ${row.role} | ${row.value >= 0 ? "+" : ""}${row.value.toFixed(2)} | ${row.average.toFixed(1)} | ${row.n} | ${row.leagueN} | ${row.source} |`);
  });
  lines.push("");
  return lines;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Role And Pick Impact Analysis");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Metodo role: walk-forward, min treino ${MIN_TRAIN}, sinal ativo quando contribuicao abs >= ${ROLE_SIGNAL_MIN}.`);
  lines.push(`Metodo picks: modelo atual completo, ranking principal com n >= ${MIN_PICK_SAMPLE}.`);
  lines.push("");
  lines.push("## Impacto Por Role");
  lines.push("");
  lines.push("| Role | Sinais | Ativo | Abs medio | Over sinais | Hit over | Under sinais | Hit under | Hit geral |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const role of ROLES) lines.push(lineForRole(role, report.roleSummary[role]));
  lines.push("");
  lines.push("## Picks Globais Mais Over");
  lines.push("");
  lines.push(...pickTable("GLOBAL OVER", report.pickRankings.global.over));
  lines.push("## Picks Globais Mais Under");
  lines.push("");
  lines.push(...pickTable("GLOBAL UNDER", report.pickRankings.global.under));
  lines.push("## Picks Por Liga");
  lines.push("");
  for (const league of LEAGUES) {
    lines.push(`## ${league}`);
    lines.push("");
    lines.push(...pickTable(`${league} OVER`, report.pickRankings.byLeague[league].over));
    lines.push(...pickTable(`${league} UNDER`, report.pickRankings.byLeague[league].under));
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const rows = roleRowsWalkForward(games);
  const roleGroups = groupBy(rows, "role");
  const roleSummary = Object.fromEntries(ROLES.map((role) => [role, summarizeRole(roleGroups[role] || [])]));
  const byLeagueRole = {};
  for (const league of LEAGUES) {
    const leagueRows = rows.filter((row) => row.league === league);
    const groups = groupBy(leagueRows, "role");
    byLeagueRole[league] = Object.fromEntries(ROLES.map((role) => [role, summarizeRole(groups[role] || [])]));
  }
  const report = {
    createdAt: new Date().toISOString(),
    games: games.length,
    roleRows: rows.length,
    minTrain: MIN_TRAIN,
    roleSignalMin: ROLE_SIGNAL_MIN,
    minPickSample: MIN_PICK_SAMPLE,
    roleSummary,
    byLeagueRole,
    pickRankings: pickRankings(games),
  };
  fs.writeFileSync(path.join(DATA_DIR, "role-pick-impact-analysis.json"), JSON.stringify({ report, rows }, null, 2), "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "role-pick-impact-analysis.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();

module.exports = { roleRowsWalkForward, summarizeRole, pickRankings, main };
