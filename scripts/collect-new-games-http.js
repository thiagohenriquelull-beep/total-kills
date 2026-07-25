const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CURRENT_FILE = path.join(DATA_DIR, "games.json");
const OUT_FILE = path.join(DATA_DIR, "jogos-novos.json");
const REPORT_FILE = path.join(DATA_DIR, "jogos-novos-report.md");
const SEASON = "S16";
const COLLECTOR_VERSION = "new-games-http-2026-07-25";
// Ate quando coletar: argumento CLI ou env UNTIL_DATE; padrao = hoje.
const UNTIL_DATE = process.argv[2] || process.env.UNTIL_DATE || new Date().toISOString().slice(0, 10);
const HOLES_FILE = path.join(DATA_DIR, "buracos-historicos.json");
const BASE = "https://gol.gg/teams";
const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUP"];

const RULES = {
  MUNDIAL: {
    include: [
      /^MSI 2026$/i,
      /^Esports World Cup 2026$/i,
      /^(?:Worlds|World Championship) 2026$/i,
    ],
    exclude: [],
  },
  LCK: { include: [/^LCK 20\d{2}\b/i], exclude: [/\bCL\b/i] },
  LCKCL: { include: [/^LCK CL 20\d{2}\b/i], exclude: [] },
  LPL: { include: [/^LPL 20\d{2}\b/i], exclude: [] },
  CBLOL: { include: [/^CBLOL\b/i], exclude: [] },
  LEC: { include: [/^LEC\b/i], exclude: [] },
  LCS: { include: [/^LCS\b/i], exclude: [/^NACL\b/i] },
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .trim()
    .replace(/\s+/g, " ");
}

function bodyLines(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, "\n"))
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function encodeTournament(name) {
  return encodeURIComponent(name).replace(/%20/g, "%20");
}

function parseSeasonYear(season) {
  return 2010 + Number(String(season).replace(/^S/i, ""));
}

function parseGameId(url) {
  return (String(url || "").match(/game\/stats\/(\d+)\//) || [])[1] || "";
}

function parseTeamId(url) {
  return (String(url || "").match(/team-(?:stats|matchlist)\/(\d+)\//) || [])[1] || "";
}

function detectStage(tournament) {
  const name = String(tournament || "");
  if (/playoffs|finals|grand finals|regional finals|play-in/i.test(name)) return "playoffs";
  if (/cup|lock-in|kickoff/i.test(name)) return "cup";
  if (/placements|qualifier/i.test(name)) return "qualifier";
  return "regular";
}

function tournamentMatchesLeague(league, tournament) {
  const rules = RULES[league];
  if (!rules) return false;
  return rules.include.some((rule) => rule.test(tournament)) && !rules.exclude.some((rule) => rule.test(tournament));
}

function sortTournamentsRecentFirst(a, b) {
  const score = (name) => {
    if (/playoffs|finals|grand finals|regional finals|play-in/i.test(name)) return 4;
    if (/split 3|rounds 3-5|summer|championship/i.test(name)) return 3;
    if (/split 2|spring|rounds 1-2/i.test(name)) return 2;
    if (/cup|lock-in|kickoff/i.test(name)) return 1;
    return 0;
  };
  return score(b) - score(a) || b.localeCompare(a, undefined, { numeric: true });
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHtml(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`HTTP 404 for ${url}`);
    }
    if (attempt < 3) {
      await sleep(600 * attempt);
      return getHtml(url, attempt + 1);
    }
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function getHtmlOrNull(url) {
  try {
    return await getHtml(url);
  } catch (error) {
    if (String(error?.message || error).includes("HTTP 404")) return null;
    throw error;
  }
}

function parseOptions(html) {
  const options = [];
  for (const match of html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)) {
    const text = stripTags(match[1]);
    if (text && text !== "-- ALL --") options.push(text);
  }
  return options;
}

function parseTeams(html) {
  const teams = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*team-stats\/\d+\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    const id = parseTeamId(href);
    const name = stripTags(match[2]);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    teams.push({ id, name, href });
  }
  return teams;
}

function parseMatchRows(html, item, team) {
  const rows = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = tr[1];
    const link = rowHtml.match(/<a\b[^>]*href=["']([^"']*\/game\/stats\/\d+\/page-game\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const rawHref = decodeHtml(link[1]);
    const href = new URL(rawHref, "https://gol.gg/teams/").href;
    const id = parseGameId(href);
    const cells = [];
    for (const cell of rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
      cells.push(stripTags(cell[1]));
    }
    if (!id || cells.length < 15) continue;
    rows.push({
      id,
      url: href,
      season: item.season,
      seasonYear: item.seasonYear,
      league: item.league,
      tournament: item.tournament,
      sourceTournament: item.tournament,
      stage: detectStage(item.tournament),
      focalTeam: team.name,
      focalTeamId: team.id,
      gameLabel: cells[13] || stripTags(link[2]),
      patch: cells[14] || "",
      week: cells[15] || "",
    });
  }
  return rows;
}

function parseTournamentMatchRows(html, item, sinceDate) {
  const series = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = tr[1];
    const link = rowHtml.match(/<a\b[^>]*href=["']([^"']*\/game\/stats\/\d+\/page-(?:summary|preview)\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const id = parseGameId(link[1]);
    const cells = [];
    for (const cell of rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
      cells.push(stripTags(cell[1]));
    }
    const date = cells.at(-1) || "";
    if (!id || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || date < sinceDate || date > UNTIL_DATE) continue;
    series.push({
      startId: Number(id),
      gameLabel: cells[0] || stripTags(link[2]),
      date,
      patch: cells[5] || "",
      week: cells[4] || "",
    });
  }

  series.sort((a, b) => a.startId - b.startId);
  const gaps = series
    .slice(1)
    .map((entry, index) => entry.startId - series[index].startId)
    .filter((gap) => gap >= 1 && gap <= 5);
  const defaultBlockSize = gaps.length
    ? [...new Set(gaps)].sort((a, b) => gaps.filter((gap) => gap === b).length - gaps.filter((gap) => gap === a).length)[0]
    : (/playoffs|finals/i.test(item.tournament) ? 5 : 3);

  const rows = [];
  for (let index = 0; index < series.length; index += 1) {
    const current = series[index];
    const next = series[index + 1];
    const gap = next ? next.startId - current.startId : defaultBlockSize;
    const blockSize = gap >= 1 && gap <= 5 ? gap : defaultBlockSize;
    for (let offset = 0; offset < blockSize; offset += 1) {
      const id = String(current.startId + offset);
      rows.push({
        id,
        url: `https://gol.gg/game/stats/${id}/page-game/`,
        season: item.season,
        seasonYear: item.seasonYear,
        league: item.league,
        tournament: item.tournament,
        sourceTournament: item.tournament,
        stage: detectStage(item.tournament),
        gameLabel: current.gameLabel,
        scheduledDate: current.date,
        patch: current.patch,
        week: current.week,
      });
    }
  }
  return rows;
}

function parseTeamLinks(html) {
  const teams = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*team-stats\/\d+\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    const id = parseTeamId(href);
    const name = stripTags(match[2]);
    if (id && name && !teams.some((team) => team.id === id)) teams.push({ id, name });
    if (teams.length >= 2) break;
  }
  return teams;
}

function parsePickTables(html) {
  const markers = [...String(html || "").matchAll(/<table\b[^>]*class=["'][^"']*playersInfosLine[^"']*["'][^>]*>/gi)]
    .map((match) => match.index)
    .slice(0, 2);
  return markers.map((start, index) => {
    const end = markers[index + 1] || html.length;
    const table = html.slice(start, end);
    const picks = [];
    for (const match of table.matchAll(/<img\b[^>]*class=["'][^"']*champion_icon rounded-circle[^"']*["'][^>]*alt=["']([^"']+)["'][^>]*>/gi)) {
      const champion = decodeHtml(match[1]).trim();
      if (champion && !picks.includes(champion)) picks.push(champion);
      if (picks.length >= 5) break;
    }
    return picks;
  });
}

function parseGameDetails(html, candidate) {
  const lines = bodyLines(html);
  const title = stripTags((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || candidate.gameLabel)
    .replace(/\s+-\s+Games of Legends\s*$/i, "")
    .replace(/\s+game\s+\d+\s+-\s+.*$/i, "")
    .trim() || candidate.gameLabel;
  const teamLinks = parseTeamLinks(html);
  const resultIndexes = lines
    .map((line, index) => (/^-\s+(WIN|LOSS)$/i.test(line) ? index : -1))
    .filter((index) => index >= 1);
  const teamBlocks = resultIndexes.slice(0, 2).map((index) => ({
    name: lines[index - 1],
    result: lines[index],
    kills: Number(lines[index + 1]),
  }));
  const teamA = teamBlocks[0]?.name || teamLinks[0]?.name || (title.split(" vs ")[0] || "").trim();
  const teamB = teamBlocks[1]?.name || teamLinks[1]?.name || ((title.split(" vs ")[1] || "").replace(/\s+game\s+\d+.*/i, "").trim());
  const killsA = teamBlocks[0]?.kills;
  const killsB = teamBlocks[1]?.kills;
  const dateLine = lines.find((line) => /^20\d{2}-\d{2}-\d{2}/.test(line)) || "";
  const patchLine = lines.find((line) => /^v\d+\.\d+/.test(line)) || `v${candidate.patch || ""}`;
  const tournamentIndex = lines.findIndex((line) => line === title);
  const tournamentLine = tournamentIndex >= 0 ? [lines[tournamentIndex + 1], lines[tournamentIndex + 2]].filter(Boolean).join(" ") : candidate.tournament;
  const pickTables = parsePickTables(html);

  return {
    id: candidate.id,
    league: candidate.league,
    tournament: candidate.tournament,
    season: candidate.season,
    seasonYear: candidate.seasonYear,
    stage: candidate.stage,
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
    collectorVersion: COLLECTOR_VERSION,
    picks: {
      teamA: pickTables[0] || [],
      teamB: pickTables[1] || [],
    },
    roles: {
      teamA: Object.fromEntries(ROLES.map((role, index) => [role, pickTables[0]?.[index] || ""])),
      teamB: Object.fromEntries(ROLES.map((role, index) => [role, pickTables[1]?.[index] || ""])),
    },
  };
}

function isValidGame(game) {
  return Boolean(
    game
      && game.id
      && game.league
      && game.date
      && game.teamA
      && game.teamB
      && Number.isFinite(game.totalKills)
      && game.totalKills > 0
      && game.picks?.teamA?.length === 5
      && game.picks?.teamB?.length === 5
  );
}

function latestByLeague(games) {
  const out = {};
  for (const game of games) {
    if (!game.league || !game.date) continue;
    const current = out[game.league];
    if (!current || String(game.date).localeCompare(current.date) > 0 || (game.date === current.date && Number(game.id) > Number(current.id))) {
      out[game.league] = { date: game.date, id: game.id, game: game.game || `${game.teamA} vs ${game.teamB}` };
    }
  }
  return out;
}

async function discoverPlan(leagues) {
  const html = await getHtml(`${BASE}/list/season-${SEASON}/split-ALL/tournament-ALL/`);
  const tournaments = parseOptions(html);
  const plan = {};
  for (const league of leagues) {
    plan[league] = tournaments
      .filter((tournament) => tournamentMatchesLeague(league, tournament))
      .sort(sortTournamentsRecentFirst)
      .map((tournament) => ({
        season: SEASON,
        seasonYear: parseSeasonYear(SEASON),
        league,
        tournament,
        sourceTournament: tournament,
        stage: detectStage(tournament),
      }));
  }
  return plan;
}

async function collectCandidatesForTournament(item, sinceDate) {
  const teamsUrl = `${BASE}/list/season-${item.season}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
  const teams = parseTeams(await getHtml(teamsUrl));
  const rows = [];
  for (const team of teams) {
    const url = `${BASE}/team-matchlist/${team.id}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
    rows.push(...parseMatchRows(await getHtml(url), item, team));
  }
  const tournamentUrl = `https://gol.gg/tournament/tournament-matchlist/${encodeTournament(item.tournament)}/`;
  const tournamentRows = parseTournamentMatchRows(await getHtml(tournamentUrl), item, sinceDate);
  rows.push(...tournamentRows);
  return {
    teams: teams.length,
    tournamentCandidates: tournamentRows.length,
    candidates: uniqueBy(rows, (row) => row.id),
  };
}

async function main() {
  const current = JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8"));
  const currentGames = current.games || [];
  const existingIds = new Set(currentGames.map((game) => String(game.id)));
  const latest = latestByLeague(currentGames);
  const leagues = Object.keys(RULES).sort();
  const plan = await discoverPlan(leagues);
  const newGames = [];
  const holeGames = [];
  const report = [];

  console.log("Ultima data por liga:");
  console.table(Object.entries(latest).filter(([league]) => leagues.includes(league)).map(([league, item]) => ({ league, ...item })));

  for (const league of leagues) {
    const leagueLatest = latest[league] || { date: "0000-00-00", id: "", game: "" };
    const leagueReport = {
      league,
      latestDate: leagueLatest.date,
      latestId: leagueLatest.id,
      tournaments: [],
      candidateIds: 0,
      pendingIncomplete: 0,
      pendingIncompleteExamples: [],
      newGames: 0,
      skippedBeforeLatest: 0,
      skippedBeforeLatestExamples: [],
      skippedBeforeLatestByDate: {},
      invalidNewRange: [],
      latestSeenOnGol: null,
      patches: new Set(),
    };
    const leagueCandidates = [];

    for (const item of plan[league] || []) {
      console.log(`[${league}] lendo ${item.tournament}`);
      const collected = await collectCandidatesForTournament(item, leagueLatest.date);
      leagueCandidates.push(...collected.candidates);
      leagueReport.tournaments.push({
        tournament: item.tournament,
        teams: collected.teams,
        tournamentCandidates: collected.tournamentCandidates,
        candidates: collected.candidates.length,
      });
    }

    const allLeagueCandidates = uniqueBy(leagueCandidates, (candidate) => candidate.id)
      .sort((a, b) => Number(b.id) - Number(a.id));
    for (const candidate of allLeagueCandidates.slice(0, 15)) {
      const html = await getHtmlOrNull(candidate.url);
      if (!html) continue;
      const game = parseGameDetails(html, candidate);
      if (!isValidGame(game)) continue;
      if (!leagueReport.latestSeenOnGol || game.date > leagueReport.latestSeenOnGol.date || (game.date === leagueReport.latestSeenOnGol.date && Number(game.id) > Number(leagueReport.latestSeenOnGol.id))) {
        leagueReport.latestSeenOnGol = {
          date: game.date,
          id: game.id,
          game: `${game.teamA} vs ${game.teamB}`,
          tournament: game.tournament,
          patch: game.patch,
          totalKills: game.totalKills,
          sourceUrl: game.sourceUrl,
          alreadyInDataset: existingIds.has(String(game.id)),
        };
      }
    }

    const uniqueCandidates = allLeagueCandidates
      .filter((candidate) => !existingIds.has(String(candidate.id)))
      .sort((a, b) => Number(a.id) - Number(b.id));
    leagueReport.candidateIds = uniqueCandidates.length;

    for (const candidate of uniqueCandidates) {
      const html = await getHtmlOrNull(candidate.url);
      if (!html) continue;
      const game = parseGameDetails(html, candidate);
      if (!isValidGame(game)) {
        leagueReport.pendingIncomplete += 1;
        if (leagueReport.pendingIncompleteExamples.length < 12) {
          leagueReport.pendingIncompleteExamples.push({
            date: candidate.scheduledDate || game.date || "",
            id: candidate.id,
            game: candidate.gameLabel,
            tournament: candidate.tournament,
            sourceUrl: candidate.url,
          });
        }
        leagueReport.tournaments.push({ tournament: candidate.tournament, invalidGame: candidate.id, reason: "invalid parsed fields" });
        continue;
      }
      if (game.date < leagueLatest.date) {
        holeGames.push(game);
        leagueReport.skippedBeforeLatest += 1;
        leagueReport.skippedBeforeLatestByDate[game.date] = (leagueReport.skippedBeforeLatestByDate[game.date] || 0) + 1;
        if (leagueReport.skippedBeforeLatestExamples.length < 12) {
          leagueReport.skippedBeforeLatestExamples.push({
            date: game.date,
            id: game.id,
            league: game.league,
            game: `${game.teamA} vs ${game.teamB}`,
            tournament: game.tournament,
            patch: game.patch,
            totalKills: game.totalKills,
            sourceUrl: game.sourceUrl,
          });
        }
        continue;
      }
      if (game.date > UNTIL_DATE) continue;
      newGames.push(game);
      leagueReport.newGames += 1;
      if (game.patch) leagueReport.patches.add(game.patch);
      existingIds.add(String(game.id));
      console.log(`[${league}] novo ${game.date} ${game.id} ${game.teamA} vs ${game.teamB} kills=${game.totalKills}`);
    }

    leagueReport.patches = [...leagueReport.patches].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    report.push(leagueReport);
  }

  newGames.sort((a, b) => a.league.localeCompare(b.league) || String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id));
  const output = {
    meta: {
      source: "GOL HTTP public pages",
      createdAt: new Date().toISOString(),
      collectorVersion: COLLECTOR_VERSION,
      season: SEASON,
      untilDate: UNTIL_DATE,
      existingDataset: path.basename(CURRENT_FILE),
      note: "Coleta incremental. Nao foi adicionada ao games.js.",
      latestByLeague: latest,
      report: report.map((item) => ({ ...item, patches: item.patches })),
    },
    games: newGames,
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  // Buracos historicos (jogos validos ANTERIORES a ultima data da liga) vao para
  // arquivo separado — secao 3.7 do PROJETO-CONTEXTO.md. Merge deles e decisao manual.
  if (holeGames.length) {
    holeGames.sort((a, b) => a.league.localeCompare(b.league) || String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id));
    fs.writeFileSync(HOLES_FILE, `${JSON.stringify({
      meta: {
        source: "GOL HTTP public pages",
        createdAt: new Date().toISOString(),
        note: "Jogos anteriores a ultima data registrada por liga (buracos). Validar e mergear separadamente.",
      },
      games: holeGames,
    }, null, 2)}\n`, "utf8");
    console.log(`Buracos historicos: ${holeGames.length} jogos salvos em ${HOLES_FILE}`);
  } else if (fs.existsSync(HOLES_FILE)) {
    fs.unlinkSync(HOLES_FILE);
  }
  const lines = [
    "# Jogos novos - coleta incremental",
    "",
    `Criado em: ${output.meta.createdAt}`,
    `Temporada: ${SEASON}`,
    `Periodo ate: ${UNTIL_DATE}`,
    "",
    "| Liga | Ultima data base | Mais recente completo no GOL | Candidatos fora da base | Pendentes no GOL | Antes da ultima data | Jogos novos validos | Patches |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...report.map((item) => `| ${item.league} | ${item.latestDate === "0000-00-00" ? "--" : item.latestDate} | ${item.latestSeenOnGol?.date || "--"} | ${item.candidateIds} | ${item.pendingIncomplete} | ${item.skippedBeforeLatest} | ${item.newGames} | ${item.patches.length ? item.patches.join(", ") : "--"} |`),
    "",
    `Total de jogos novos validos: ${newGames.length}`,
    "",
    "Arquivo gerado: `data/jogos-novos.json`",
    "",
    "Observacao: `games.js` e `games.json` nao foram alterados.",
    "",
  ];
  fs.writeFileSync(REPORT_FILE, `${lines.join("\n")}\n`, "utf8");
  console.table(report.map((item) => ({
    league: item.league,
    latestDate: item.latestDate,
    latestSeenOnGol: item.latestSeenOnGol?.date || "--",
    candidates: item.candidateIds,
    pendingIncomplete: item.pendingIncomplete,
    skippedBeforeLatest: item.skippedBeforeLatest,
    newGames: item.newGames,
    patches: item.patches.join(", ") || "--",
  })));
  console.log(`Salvo: ${OUT_FILE}`);
  console.log(`Relatorio: ${REPORT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
