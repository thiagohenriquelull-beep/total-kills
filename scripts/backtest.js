const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];
const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUP"];
const LINES = Array.from({ length: 15 }, (_, index) => 20.5 + index);
const HOLDOUT_PER_LEAGUE = 15;
const EDGE_THRESHOLD = 0.75;
const DEFAULT_ODDS = 1.8;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shrink(n, k) {
  return n / (n + k);
}

function addSample(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function allPicks(game) {
  return [...(game.picks?.teamA || []), ...(game.picks?.teamB || [])].filter(Boolean);
}

function sortRecent(a, b) {
  const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
  if (dateCompare !== 0) return dateCompare;
  return Number(b.id) - Number(a.id);
}

function buildIndexes(games) {
  const leagueGames = new Map();
  const teamGames = new Map();
  const championRoleResiduals = new Map();
  const championRoleTotals = new Map();

  for (const game of games) {
    if (!leagueGames.has(game.league)) leagueGames.set(game.league, []);
    leagueGames.get(game.league).push(game);

    for (const team of [game.teamA, game.teamB]) {
      const key = `${game.league}::${team}`;
      if (!teamGames.has(key)) teamGames.set(key, []);
      teamGames.get(key).push(game);
    }
  }

  for (const list of teamGames.values()) {
    list.sort(sortRecent);
  }

  const leagueMeans = new Map();
  for (const [league, list] of leagueGames) {
    leagueMeans.set(league, mean(list.map((game) => game.totalKills)));
  }

  for (const game of games) {
    const residual = game.totalKills - (leagueMeans.get(game.league) || mean(games.map((item) => item.totalKills)));
    for (const side of ["teamA", "teamB"]) {
      (game.picks?.[side] || []).forEach((champion, index) => {
        const role = ROLES[index] || "UNK";
        const key = `${role}::${champion}`;
        addSample(championRoleResiduals, key, residual);
        addSample(championRoleTotals, key, game.totalKills);
      });
    }
  }

  return {
    leagueGames,
    leagueMeans,
    teamGames,
    championRoleResiduals,
    championRoleTotals,
  };
}

function patchAdjustment(indexes, league, patch, leagueMean) {
  if (!patch) return { value: 0, n: 0, raw: 0 };
  const list = (indexes.leagueGames.get(league) || []).filter((game) => game.patch === patch);
  if (!list.length) return { value: 0, n: 0, raw: 0 };
  const raw = mean(list.map((game) => game.totalKills)) - leagueMean;
  return { value: raw * shrink(list.length, 12), n: list.length, raw };
}

function teamAdjustment(indexes, league, team, baseline) {
  const list = (indexes.teamGames.get(`${league}::${team}`) || []).slice(0, 20);
  if (!list.length) return { team, n: 0, mean: baseline, value: 0, raw: 0 };
  const teamMean = mean(list.map((game) => game.totalKills));
  const raw = teamMean - baseline;
  return {
    team,
    n: list.length,
    mean: teamMean,
    raw,
    value: raw * shrink(list.length, 8) * 0.5,
  };
}

function championRoleEffect(indexes, champion, role) {
  const key = `${role}::${champion}`;
  const residuals = indexes.championRoleResiduals.get(key) || [];
  const totals = indexes.championRoleTotals.get(key) || [];
  if (!residuals.length) return { champion, role, n: 0, average: 0, value: 0, raw: 0 };
  const raw = mean(residuals);
  return {
    champion,
    role,
    n: residuals.length,
    average: mean(totals),
    raw,
    value: raw * shrink(residuals.length, 24),
  };
}

function draftAdjustment(indexes, game) {
  const effects = [];
  for (const side of ["teamA", "teamB"]) {
    (game.picks?.[side] || []).forEach((champion, index) => {
      effects.push(championRoleEffect(indexes, champion, ROLES[index] || "UNK"));
    });
  }
  const value = effects.reduce((sum, effect) => sum + effect.value, 0) / 10 * 0.9;
  return { value, effects };
}

function predict(indexes, game, includePicks) {
  const leagueMean = indexes.leagueMeans.get(game.league) || 0;
  const patch = patchAdjustment(indexes, game.league, game.patch, leagueMean);
  const baseline = leagueMean + patch.value;
  const teamA = teamAdjustment(indexes, game.league, game.teamA, baseline);
  const teamB = teamAdjustment(indexes, game.league, game.teamB, baseline);
  const draft = includePicks ? draftAdjustment(indexes, game) : { value: 0, effects: [] };

  return {
    prediction: baseline + teamA.value + teamB.value + draft.value,
    leagueMean,
    patch,
    teamA,
    teamB,
    draft,
  };
}

function evaluateLine(prediction, actual, line) {
  const edge = prediction - line;
  if (Math.abs(edge) < EDGE_THRESHOLD) {
    return { line, edge, side: "PASS", hit: null, roi: 0 };
  }
  const side = edge > 0 ? "OVER" : "UNDER";
  const hit = side === "OVER" ? actual > line : actual < line;
  return { line, edge, side, hit, roi: hit ? DEFAULT_ODDS - 1 : -1 };
}

function summarizeLineDecisions(rows, phase) {
  const decisions = rows.flatMap((row) => row[phase].lineResults).filter((result) => result.side !== "PASS");
  const hits = decisions.filter((result) => result.hit).length;
  return {
    decisions: decisions.length,
    hits,
    accuracy: decisions.length ? hits / decisions.length : 0,
    roi: decisions.length ? decisions.reduce((sum, result) => sum + result.roi, 0) / decisions.length : 0,
  };
}

function summarizeDefaultLine(rows, phase) {
  const decisions = rows.map((row) => row[phase].defaultLine).filter((result) => result.side !== "PASS");
  const hits = decisions.filter((result) => result.hit).length;
  return {
    line: 24.5,
    decisions: decisions.length,
    hits,
    accuracy: decisions.length ? hits / decisions.length : 0,
    roi: decisions.length ? decisions.reduce((sum, result) => sum + result.roi, 0) / decisions.length : 0,
  };
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildMarkdown(summary, rows) {
  const lines = [];
  lines.push("# Backtest Over/Under Kills");
  lines.push("");
  lines.push(`Gerado em: ${summary.createdAt}`);
  lines.push(`Holdout: ${HOLDOUT_PER_LEAGUE} mapas mais recentes por liga.`);
  lines.push("Treino: todos os mapas coletados anteriores ao holdout da propria liga.");
  lines.push("Sem duracao, side ou bans. Picks sempre avaliados pela role indicada.");
  lines.push("");
  lines.push("## Resumo por liga");
  lines.push("");
  lines.push("| Liga | Testes | MAE pre | MAE picks | Linhas pre acc | Linhas picks acc | Linha 24.5 pre | Linha 24.5 picks |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of summary.byLeague) {
    lines.push(`| ${item.league} | ${item.tests} | ${item.pre.mae.toFixed(2)} | ${item.post.mae.toFixed(2)} | ${formatPct(item.pre.allLines.accuracy)} (${item.pre.allLines.decisions}) | ${formatPct(item.post.allLines.accuracy)} (${item.post.allLines.decisions}) | ${formatPct(item.pre.defaultLine.accuracy)} (${item.pre.defaultLine.decisions}) | ${formatPct(item.post.defaultLine.accuracy)} (${item.post.defaultLine.decisions}) |`);
  }
  lines.push("");
  lines.push("## Geral");
  lines.push("");
  lines.push(`- Testes: ${summary.overall.tests}`);
  lines.push(`- MAE pre-draft: ${summary.overall.pre.mae.toFixed(2)} kills`);
  lines.push(`- MAE com picks: ${summary.overall.post.mae.toFixed(2)} kills`);
  lines.push(`- Acuracia em todas as linhas com edge >= ${EDGE_THRESHOLD}: pre ${formatPct(summary.overall.pre.allLines.accuracy)} (${summary.overall.pre.allLines.decisions} decisoes), picks ${formatPct(summary.overall.post.allLines.accuracy)} (${summary.overall.post.allLines.decisions} decisoes)`);
  lines.push(`- Acuracia linha 24.5: pre ${formatPct(summary.overall.pre.defaultLine.accuracy)} (${summary.overall.pre.defaultLine.decisions} decisoes), picks ${formatPct(summary.overall.post.defaultLine.accuracy)} (${summary.overall.post.defaultLine.decisions} decisoes)`);
  lines.push("");
  lines.push("## Jogos testados");
  lines.push("");
  lines.push("| Liga | Jogo | Data | Patch | Kills | Pre | Erro pre | Picks | Erro picks |");
  lines.push("|---|---|---|---|---:|---:|---:|---:|---:|");
  for (const row of rows) {
    lines.push(`| ${row.league} | ${row.game} | ${row.date || ""} | ${row.patch || ""} | ${row.actual} | ${row.pre.prediction.toFixed(2)} | ${row.pre.error.toFixed(2)} | ${row.post.prediction.toFixed(2)} | ${row.post.error.toFixed(2)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function loadExpandedGames() {
  const games = [];
  for (const league of LEAGUES) {
    const file = path.join(DATA_DIR, `expanded-${league}.json`);
    const payload = readJson(file);
    games.push(...payload.games);
  }
  const byId = new Map();
  for (const game of games) byId.set(String(game.id), game);
  return [...byId.values()].sort((a, b) => a.league.localeCompare(b.league) || sortRecent(a, b));
}

function main() {
  const games = loadExpandedGames();
  const rows = [];

  for (const league of LEAGUES) {
    const leagueGames = games.filter((game) => game.league === league).sort(sortRecent);
    const test = leagueGames.slice(0, HOLDOUT_PER_LEAGUE);
    const train = leagueGames.slice(HOLDOUT_PER_LEAGUE);
    const indexes = buildIndexes(train);

    for (const game of test) {
      const pre = predict(indexes, game, false);
      const post = predict(indexes, game, true);
      rows.push({
        id: game.id,
        league: game.league,
        tournament: game.tournament,
        date: game.date,
        patch: game.patch,
        game: `${game.teamA} vs ${game.teamB}`,
        teamA: game.teamA,
        teamB: game.teamB,
        actual: game.totalKills,
        picks: game.picks,
        pre: {
          prediction: pre.prediction,
          error: Math.abs(pre.prediction - game.totalKills),
          defaultLine: evaluateLine(pre.prediction, game.totalKills, 24.5),
          lineResults: LINES.map((line) => evaluateLine(pre.prediction, game.totalKills, line)),
          components: pre,
        },
        post: {
          prediction: post.prediction,
          error: Math.abs(post.prediction - game.totalKills),
          defaultLine: evaluateLine(post.prediction, game.totalKills, 24.5),
          lineResults: LINES.map((line) => evaluateLine(post.prediction, game.totalKills, line)),
          components: post,
        },
      });
    }
  }

  const summarizeRows = (targetRows) => ({
    tests: targetRows.length,
    pre: {
      mae: mean(targetRows.map((row) => row.pre.error)),
      allLines: summarizeLineDecisions(targetRows, "pre"),
      defaultLine: summarizeDefaultLine(targetRows, "pre"),
    },
    post: {
      mae: mean(targetRows.map((row) => row.post.error)),
      allLines: summarizeLineDecisions(targetRows, "post"),
      defaultLine: summarizeDefaultLine(targetRows, "post"),
    },
  });

  const summary = {
    createdAt: new Date().toISOString(),
    methodology: {
      holdoutPerLeague: HOLDOUT_PER_LEAGUE,
      edgeThreshold: EDGE_THRESHOLD,
      testedLines: LINES,
      defaultLine: 24.5,
      defaultOdds: DEFAULT_ODDS,
      noLeakage: "Each league trains on collected games outside the 15-game holdout.",
    },
    data: {
      totalGames: games.length,
      byLeague: LEAGUES.map((league) => ({ league, games: games.filter((game) => game.league === league).length })),
    },
    byLeague: LEAGUES.map((league) => ({ league, ...summarizeRows(rows.filter((row) => row.league === league)) })),
    overall: summarizeRows(rows),
  };

  const dataset = {
    meta: {
      source: "GOL logged session",
      createdAt: new Date().toISOString(),
      leagues: LEAGUES,
      gamesPerLeague: LEAGUES.map((league) => ({ league, games: games.filter((game) => game.league === league).length })),
      modelExcludes: ["duration", "side", "bans"],
    },
    games,
  };

  writeJson(path.join(DATA_DIR, "games.json"), dataset);
  fs.writeFileSync(path.join(DATA_DIR, "games.js"), `window.GOL_GAMES_DATA = ${JSON.stringify(dataset, null, 2)};\n`, "utf8");
  writeJson(path.join(DATA_DIR, "backtest-results.json"), { summary, rows });
  fs.writeFileSync(path.join(DATA_DIR, "backtest-summary.md"), buildMarkdown(summary, rows), "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main();
