const DEFAULT_RULES = [
  { league: "LCK", include: [/^LCK 20\d{2}\b/i], exclude: [/\bCL\b/i] },
  { league: "LCKCL", include: [/^LCK CL 20\d{2}\b/i], exclude: [] },
  { league: "LPL", include: [/^LPL 20\d{2}\b/i], exclude: [] },
  { league: "LEC", include: [/^LEC 20\d{2}\b/i], exclude: [] },
  { league: "CBLOL/LTA-S", include: [/^CBLOL 20\d{2}\b/i, /^LTA South 20\d{2}\b/i], exclude: [] },
  { league: "LCS/LTA-N", include: [/^LCS 20\d{2}\b/i, /^LTA North 20\d{2}\b/i], exclude: [/^NACL\b/i] },
  { league: "LTA Championship", include: [/^LTA 20\d{2} Championship\b/i], exclude: [] },
];

function encodeTournament(name) {
  return encodeURIComponent(name).replace(/%20/g, "%20");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseTeamId(url) {
  return (String(url || "").match(/team-(?:stats|matchlist)\/(\d+)\//) || [])[1] || "";
}

function pairKey(label) {
  const base = cleanText(String(label || "").replace(/\s*\(\d+\)\s*$/, ""));
  const parts = base.split(/\s+vs\s+/i).map(cleanText).filter(Boolean);
  return parts.length === 2 ? parts.sort((a, b) => a.localeCompare(b)).join(" vs ") : base;
}

function leagueForTournament(tournament, rules = DEFAULT_RULES) {
  for (const rule of rules) {
    const included = rule.include.some((item) => item.test(tournament));
    const excluded = rule.exclude.some((item) => item.test(tournament));
    if (included && !excluded) return rule.league;
  }
  return "";
}

async function gotoWait(tab, url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await tab.goto(url);
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await tab.playwright.waitForTimeout(700).catch(() => {});
    }
  }
}

export async function discoverTournaments(tab, season, options = {}) {
  await gotoWait(tab, `https://gol.gg/teams/list/season-${season}/split-ALL/tournament-ALL/`);
  const tournaments = await tab.playwright.evaluate(() => {
    return Array.from(document.querySelectorAll("select option"))
      .map((option) => option.innerText.trim().replace(/\s+/g, " "))
      .filter(Boolean);
  }, undefined, { timeoutMs: 10000 });
  const seasonYear = 2010 + Number(String(season).replace(/^S/i, ""));
  return tournaments
    .filter((tournament) => tournament !== "-- ALL --")
    .map((tournament) => ({
      season,
      seasonYear,
      tournament,
      league: leagueForTournament(tournament, options.rules || DEFAULT_RULES),
    }))
    .filter((item) => item.league && (!options.leagues || options.leagues.includes(item.league)));
}

export async function collectTeams(tab, item) {
  await gotoWait(tab, `https://gol.gg/teams/list/season-${item.season}/split-ALL/tournament-${encodeTournament(item.tournament)}/`);
  const teams = await tab.playwright.evaluate(() => {
    return Array.from(document.querySelectorAll('table a[href*="team-stats"]'))
      .map((a) => ({ name: a.innerText.trim().replace(/\s+/g, " "), href: a.href }))
      .filter((team) => team.name && /team-stats\/\d+\//.test(team.href));
  }, undefined, { timeoutMs: 10000 });
  const seen = new Set();
  return teams.filter((team) => {
    const id = parseTeamId(team.href);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    team.id = id;
    return true;
  });
}

export async function collectTeamMatches(tab, team, item) {
  await gotoWait(tab, `https://gol.gg/teams/team-matchlist/${team.id}/split-ALL/tournament-${encodeTournament(item.tournament)}/`);
  return tab.playwright.evaluate((arg) => {
    return Array.from(document.querySelectorAll("table tr"))
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll("th,td")).map((td) => td.innerText.trim().replace(/\s+/g, " "));
        const link = tr.querySelector('a[href*="/game/stats/"]');
        if (!link || cells.length < 15) return null;
        const id = (link.href.match(/game\/stats\/(\d+)\//) || [])[1] || "";
        const gameLabel = cells[13] || link.innerText.trim().replace(/\s+/g, " ");
        const mapNumber = Number((gameLabel.match(/\((\d+)\)\s*$/) || [])[1] || NaN);
        const ownKills = Number(cells[3]);
        const oppKills = Number(cells[8]);
        if (!id || !Number.isFinite(mapNumber) || !Number.isFinite(ownKills) || !Number.isFinite(oppKills)) return null;
        return {
          id,
          url: link.href,
          season: arg.season,
          seasonYear: arg.seasonYear,
          league: arg.league,
          tournament: arg.tournament,
          focalTeam: arg.teamName,
          focalTeamId: arg.teamId,
          result: cells[0] || "",
          score: cells[1] || "",
          ownKills,
          oppKills,
          totalKills: ownKills + oppKills,
          gameLabel,
          mapNumber,
          patch: cells[14] || "",
          week: cells[15] || "",
          source: "team-matchlist",
        };
      })
      .filter(Boolean);
  }, { ...item, teamName: team.name, teamId: team.id }, { timeoutMs: 10000 });
}

export async function collectTournamentRows(tab, item) {
  const teams = await collectTeams(tab, item).catch(() => []);
  const rows = [];
  for (const team of teams) {
    rows.push(...await collectTeamMatches(tab, team, item).catch(() => []));
  }
  return { item, teams: teams.length, rows };
}

export function buildBo3Dataset(items, allRows) {
  const duplicateRowsById = new Map();
  const byId = new Map();
  for (const row of allRows) {
    if (!duplicateRowsById.has(row.id)) duplicateRowsById.set(row.id, []);
    duplicateRowsById.get(row.id).push(row);
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const gamesAll = [...byId.values()].map((row) => ({
    id: row.id,
    season: row.season,
    seasonYear: row.seasonYear,
    league: row.league,
    tournament: row.tournament,
    week: row.week,
    gameLabel: row.gameLabel,
    matchupKey: pairKey(row.gameLabel),
    mapNumber: row.mapNumber,
    totalKills: row.totalKills,
    patch: row.patch,
    sourceUrl: row.url,
    scoreSamples: [...new Set((duplicateRowsById.get(row.id) || []).map((item) => item.score).filter((score) => /^\d+-\d+$/.test(score)))],
  }));

  const groups = new Map();
  for (const game of gamesAll) {
    const key = [game.season, game.league, game.tournament, game.week, game.matchupKey].join("||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }

  const series = [];
  for (const [key, groupRaw] of groups) {
    const group = [...groupRaw].sort((a, b) => a.mapNumber - b.mapNumber || Number(a.id) - Number(b.id));
    const scoreSamples = [...new Set(group.flatMap((game) => game.scoreSamples || []))];
    let bestOf = null;
    for (const score of scoreSamples) {
      const [a, b] = score.split("-").map(Number);
      if (Math.max(a, b) === 3) bestOf = 5;
      else if (Math.max(a, b) === 2 && bestOf !== 5) bestOf = 3;
    }
    const maxMap = Math.max(...group.map((game) => game.mapNumber));
    const mapsPresent = [...new Set(group.map((game) => game.mapNumber))].sort((a, b) => a - b);
    const bo3Confirmed = bestOf === 3 && maxMap <= 3 && mapsPresent[0] === 1 && mapsPresent.includes(2);
    series.push({
      key,
      season: group[0].season,
      seasonYear: group[0].seasonYear,
      league: group[0].league,
      tournament: group[0].tournament,
      week: group[0].week,
      matchupKey: group[0].matchupKey,
      maxMap,
      bestOf,
      bo3Confirmed,
      scoreSamples,
      mapsPresent,
      gameIds: group.map((game) => game.id),
      totalKills: group.map((game) => game.totalKills),
    });
  }

  const bo3Series = series.filter((item) => item.bo3Confirmed);
  const bo3Ids = new Set(bo3Series.flatMap((item) => item.gameIds));
  const games = gamesAll.filter((game) => bo3Ids.has(game.id));
  return {
    meta: {
      source: "GOL team-matchlist via Chrome logged/browser session",
      createdAt: new Date().toISOString(),
      tournaments: items,
      rawRows: allRows.length,
      uniqueGamesInTargetTournaments: gamesAll.length,
      bo3Series: bo3Series.length,
      bo3Games: games.length,
      notes: [
        "MD3/Bo3 confirmado apenas quando placar de serie chega a 2 vitorias (2-0 ou 2-1) e maximo mapa observado <= 3.",
        "Series com placar 3-x foram excluidas para nao misturar Bo5 3-0 com Bo3.",
      ],
    },
    series: bo3Series,
    games,
  };
}
