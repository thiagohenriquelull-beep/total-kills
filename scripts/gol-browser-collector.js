/*
  Coletor para rodar no navegador do Codex ja logado no GOL.

  Entrada esperada:
  - global `tab` disponivel pelo Browser plugin.
  - sessao logada no https://gol.gg/.

  Saida:
  - objeto com `games`.
*/

const GOL_COLLECTOR_VERSION = "expanded-2026-1";
const GOL_DEFAULT_TARGET_PER_LEAGUE = 300;
const GOL_DEFAULT_MIN_PER_LEAGUE = 250;

const GOL_LEAGUE_RULES = {
  LCK: {
    include: [/^LCK 20\d{2}\b/i],
    exclude: [/\bCL\b/i],
  },
  LCKCL: {
    include: [/^LCK CL 20\d{2}\b/i],
    exclude: [],
  },
  LPL: {
    include: [/^LPL 20\d{2}\b/i],
    exclude: [],
  },
  CBLOL: {
    include: [/^CBLOL\b/i],
    exclude: [],
  },
  LEC: {
    include: [/^LEC\b/i],
    exclude: [],
  },
  LCS: {
    include: [/^LCS\b/i],
    exclude: [/^NACL\b/i],
  },
};

function encodeTournament(name) {
  return encodeURIComponent(name).replace(/%20/g, "%20");
}

function parseSeasonYear(season) {
  const value = String(season || "").replace(/^S/i, "");
  const number = Number(value);
  return Number.isFinite(number) ? 2010 + number : "";
}

function detectStage(tournament) {
  const name = String(tournament || "");
  if (/playoffs|finals|grand finals|regional finals|play-in/i.test(name)) return "playoffs";
  if (/cup|lock-in|kickoff/i.test(name)) return "cup";
  if (/placements|qualifier/i.test(name)) return "qualifier";
  return "regular";
}

function tournamentMatchesLeague(league, tournament) {
  const rules = GOL_LEAGUE_RULES[league];
  if (!rules) return false;
  return rules.include.some((rule) => rule.test(tournament)) && !rules.exclude.some((rule) => rule.test(tournament));
}

function sortTournamentsRecentFirst(a, b) {
  const stageScore = (name) => {
    if (/playoffs|finals|grand finals|regional finals|play-in/i.test(name)) return 3;
    if (/split 3|rounds 3-5|summer|championship/i.test(name)) return 2;
    if (/split 2|spring|rounds 1-2/i.test(name)) return 1;
    return 0;
  };
  return stageScore(b) - stageScore(a) || b.localeCompare(a, undefined, { numeric: true });
}

function parseGameId(url) {
  const match = String(url || "").match(/game\/stats\/(\d+)\//);
  return match ? match[1] : "";
}

function parseTeamId(url) {
  const match = String(url || "").match(/team-(?:stats|matchlist)\/(\d+)\//);
  return match ? match[1] : "";
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function waitPage(tab) {
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 12000 }).catch(() => {});
}

async function discoverTournamentsForSeason(tab, season) {
  const url = `https://gol.gg/teams/list/season-${season}/split-ALL/tournament-ALL/`;
  await tab.goto(url);
  await waitPage(tab);

  return tab.playwright.evaluate(() => {
    return Array.from(document.querySelectorAll("select option"))
      .map((option) => option.innerText.trim().replace(/\s+/g, " "))
      .filter(Boolean);
  }, undefined, { timeoutMs: 10000 });
}

async function discoverLeagueTournamentPlan(tab, options = {}) {
  const seasons = options.seasons || ["S16"];
  const leagues = options.leagues || Object.keys(GOL_LEAGUE_RULES);
  const plan = {};
  const discovered = {};

  for (const season of seasons) {
    const tournaments = await discoverTournamentsForSeason(tab, season);
    discovered[season] = tournaments;
    for (const league of leagues) {
      const matching = tournaments
        .filter((tournament) => tournamentMatchesLeague(league, tournament))
        .sort(sortTournamentsRecentFirst);
      if (!plan[league]) plan[league] = [];
      for (const tournament of matching) {
        plan[league].push({
          season,
          seasonYear: parseSeasonYear(season),
          league,
          tournament,
          stage: detectStage(tournament),
        });
      }
    }
  }

  return { plan, discovered };
}

async function collectTeamsForTournament(tab, item) {
  const url = `https://gol.gg/teams/list/season-${item.season}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
  await tab.goto(url);
  await waitPage(tab);

  return tab.playwright.evaluate(() => {
    return Array.from(document.querySelectorAll('table a[href*="team-stats"]'))
      .map((a) => ({ name: a.innerText.trim().replace(/\s+/g, " "), href: a.href }))
      .filter((team) => team.name && /team-stats\/\d+\//.test(team.href));
  }, undefined, { timeoutMs: 10000 });
}

async function collectMatchLinksForTeam(tab, team, item) {
  const teamId = parseTeamId(team.href);
  if (!teamId) return [];

  const url = `https://gol.gg/teams/team-matchlist/${teamId}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
  await tab.goto(url);
  await waitPage(tab);

  return tab.playwright.evaluate((arg) => {
    return Array.from(document.querySelectorAll("table tr"))
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll("th,td")).map((td) => td.innerText.trim().replace(/\s+/g, " "));
        const link = tr.querySelector('a[href*="/game/stats/"]');
        if (!link || cells.length < 14) return null;
        return {
          league: arg.league,
          season: arg.season,
          seasonYear: arg.seasonYear,
          tournament: arg.tournament,
          sourceTournament: arg.tournament,
          stage: arg.stage,
          focalTeam: arg.teamName,
          focalTeamId: arg.teamId,
          url: link.href,
          id: (link.href.match(/game\/stats\/(\d+)\//) || [])[1] || "",
          gameLabel: cells[13] || link.innerText.trim().replace(/\s+/g, " "),
          patch: cells[14] || "",
          week: cells[15] || "",
        };
      })
      .filter(Boolean);
  }, { ...item, teamName: team.name, teamId }, { timeoutMs: 10000 });
}

async function collectGameDetails(tab, candidate) {
  await tab.goto(candidate.url);
  await waitPage(tab);

  return tab.playwright.evaluate((candidate) => {
    const lines = document.body.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = document.querySelector("h1")?.innerText?.trim() || candidate.gameLabel;
    const teamLinks = [];

    for (const a of document.querySelectorAll('a[href*="/teams/team-stats/"]')) {
      const name = a.innerText.trim().replace(/\s+/g, " ");
      const id = (a.href.match(/team-stats\/(\d+)\//) || [])[1] || "";
      if (name && id && !teamLinks.some((team) => team.id === id)) teamLinks.push({ name, id });
      if (teamLinks.length >= 2) break;
    }

    const teamA = teamLinks[0]?.name || (title.split(" vs ")[0] || "").trim();
    const teamB = teamLinks[1]?.name || ((title.split(" vs ")[1] || "").replace(/\s+game\s+\d+.*/i, "").trim());
    const findTeamIndex = (team) => lines.findIndex((line) => line === `${team} - WIN` || line === `${team} - LOSS`);
    const teamAIndex = findTeamIndex(teamA);
    const teamBIndex = findTeamIndex(teamB);
    const killsA = teamAIndex >= 0 ? Number(lines[teamAIndex + 1]) : NaN;
    const killsB = teamBIndex >= 0 ? Number(lines[teamBIndex + 1]) : NaN;
    const patchLine = lines.find((line) => /^v\d+\.\d+/.test(line)) || `v${candidate.patch || ""}`;
    const dateLine = lines.find((line) => /^20\d{2}-\d{2}-\d{2}/.test(line)) || "";
    const tournamentLine = lines.find((line) => /2026|2025/.test(line) && /\(/.test(line) && !/^20\d{2}-/.test(line)) || candidate.tournament;
    const playerTables = Array.from(document.querySelectorAll("table.playersInfosLine"));
    const tablePicks = playerTables.map((table) => {
      return Array.from(table.querySelectorAll('a[href*="champion-stats"] img'))
        .map((img) => img.alt)
        .filter(Boolean)
        .slice(0, 5);
    });

    return {
      id: candidate.id,
      league: candidate.league,
      tournament: candidate.tournament,
      season: candidate.season,
      seasonYear: candidate.seasonYear,
      stage: candidate.stage || "",
      sourceTournament: candidate.sourceTournament || candidate.tournament,
      tournamentLine,
      date: dateLine.split(" ")[0] || "",
      week: candidate.week || (dateLine.match(/\(([^)]+)\)/) || [])[1] || "",
      patch: patchLine.replace(/^v/i, ""),
      game: title,
      sourceUrl: candidate.url,
      teamA,
      teamB,
      teamAId: teamLinks[0]?.id || "",
      teamBId: teamLinks[1]?.id || "",
      killsA,
      killsB,
      totalKills: Number.isFinite(killsA) && Number.isFinite(killsB) ? killsA + killsB : NaN,
      collectedAt: new Date().toISOString(),
      collectorVersion: "expanded-2026-1",
      picks: {
        teamA: tablePicks[0] || [],
        teamB: tablePicks[1] || [],
      },
    };
  }, candidate, { timeoutMs: 10000 });
}

function isValidGame(game) {
  return Boolean(
    game
      && game.id
      && game.league
      && game.teamA
      && game.teamB
      && game.date
      && Number.isFinite(game.totalKills)
      && game.picks?.teamA?.length === 5
      && game.picks?.teamB?.length === 5
  );
}

async function collectGolKillsDataset(tab, options = {}) {
  const maxPerLeague = options.maxPerLeague || options.targetPerLeague || GOL_DEFAULT_TARGET_PER_LEAGUE;
  const minPerLeague = options.minPerLeague || GOL_DEFAULT_MIN_PER_LEAGUE;
  const tournamentPlan = options.tournamentPlan || (await discoverLeagueTournamentPlan(tab, { seasons: ["S16"], ...options })).plan;
  const collectedGames = [];
  const report = [];

  for (const [league, tournaments] of Object.entries(tournamentPlan)) {
    let candidates = [];
    let teamsSeen = 0;
    const leagueGames = [];
    const seenGames = new Set();
    const tournamentReports = [];

    for (const item of tournaments) {
      if (leagueGames.length >= maxPerLeague) break;
      const teams = uniqueBy(await collectTeamsForTournament(tab, item), (team) => parseTeamId(team.href));
      teamsSeen += teams.length;
      for (const team of teams) {
        candidates.push(...await collectMatchLinksForTeam(tab, team, item));
      }

      const itemCandidates = uniqueBy(candidates, (candidate) => candidate.id)
        .filter((candidate) => !seenGames.has(String(candidate.id)))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, maxPerLeague - leagueGames.length);

      let validFromTournament = 0;
      for (const candidate of itemCandidates) {
        const game = await collectGameDetails(tab, candidate);
        seenGames.add(String(candidate.id));
        if (isValidGame(game)) {
          validFromTournament += 1;
          game.stage = game.stage || item.stage;
          game.sourceTournament = game.sourceTournament || item.tournament;
          game.collectorVersion = GOL_COLLECTOR_VERSION;
          game.collectedAt = game.collectedAt || new Date().toISOString();
          game.season = game.season || item.season;
          game.seasonYear = game.seasonYear || item.seasonYear;
          leagueGames.push(game);
        }
        if (leagueGames.length >= maxPerLeague) break;
      }

      tournamentReports.push({
        league,
        season: item.season,
        tournament: item.tournament,
        stage: item.stage,
        teams: teams.length,
        candidates: itemCandidates.length,
        validGames: validFromTournament,
        cumulativeGames: leagueGames.length,
      });

      if (leagueGames.length >= maxPerLeague) break;
    }

    if (leagueGames.length < minPerLeague) {
      console.warn(`Liga ${league} ficou abaixo do minimo: ${leagueGames.length}/${minPerLeague}`);
    }

    collectedGames.push(...leagueGames);
    report.push({
      league,
      teamsSeen,
      candidates: uniqueBy(candidates, (candidate) => candidate.id).length,
      games: leagueGames.length,
      target: maxPerLeague,
      minimum: minPerLeague,
      tournaments: tournamentReports,
    });
  }

  collectedGames.sort((a, b) => a.league.localeCompare(b.league) || Number(b.id) - Number(a.id));
  return {
    meta: {
      source: "GOL logged session",
      createdAt: new Date().toISOString(),
      collectorVersion: GOL_COLLECTOR_VERSION,
      maxPerLeague,
      minPerLeague,
      report,
      modelExcludes: ["duration", "side", "bans"],
    },
    games: collectedGames,
  };
}

// Example for the Codex browser runtime:
// const dataset = await collectGolKillsDataset(tab, { maxPerLeague: 30 });
// const fs = await import("node:fs/promises");
// await fs.writeFile("C:/Users/Leal Tec/Documents/Planilha 2026/gol-kills-predictor/data/games.js", `window.GOL_GAMES_DATA = ${JSON.stringify(dataset, null, 2)};\n`, "utf8");

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GOL_COLLECTOR_VERSION,
    GOL_LEAGUE_RULES,
    discoverLeagueTournamentPlan,
    collectGolKillsDataset,
    collectTeamsForTournament,
    collectMatchLinksForTeam,
    collectGameDetails,
    isValidGame,
    detectStage,
    tournamentMatchesLeague,
    uniqueBy,
    parseTeamId,
  };
}
