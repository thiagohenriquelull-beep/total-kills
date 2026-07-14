const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(DATA_DIR, "bo3-2025-2026-map-position-raw.json");
const SEASONS = ["S15", "S16"];
const BASE = "https://gol.gg/teams";

const RULES = [
  { league: "LCK", include: [/^LCK 20\d{2}\b/i], exclude: [/\bCL\b/i] },
  { league: "LCKCL", include: [/^LCK CL 20\d{2}\b/i], exclude: [] },
  { league: "LPL", include: [/^LPL 20\d{2}\b/i], exclude: [] },
  { league: "LEC", include: [/^LEC 20\d{2}\b/i], exclude: [] },
  { league: "CBLOL/LTA-S", include: [/^CBLOL 20\d{2}\b/i, /^LTA South 20\d{2}\b/i], exclude: [] },
  { league: "LCS/LTA-N", include: [/^LCS 20\d{2}\b/i, /^LTA North 20\d{2}\b/i], exclude: [/^NACL\b/i] },
  { league: "LTA Championship", include: [/^LTA 20\d{2} Championship\b/i], exclude: [] },
];

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
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ")).trim().replace(/\s+/g, " ");
}

function encodeTournament(name) {
  return encodeURIComponent(name).replace(/%20/g, "%20");
}

function leagueForTournament(tournament) {
  for (const rule of RULES) {
    const included = rule.include.some((item) => item.test(tournament));
    const excluded = rule.exclude.some((item) => item.test(tournament));
    if (included && !excluded) return rule.league;
  }
  return "";
}

function parseSeasonYear(season) {
  return 2010 + Number(String(season).replace(/^S/i, ""));
}

function parseTeamId(url) {
  return (String(url || "").match(/team-(?:stats|matchlist)\/(\d+)\//) || [])[1] || "";
}

function parseGameId(url) {
  return (String(url || "").match(/game\/stats\/(\d+)\//) || [])[1] || "";
}

function pairKey(label) {
  const base = stripTags(String(label || "").replace(/\s*\(\d+\)\s*$/, ""));
  const parts = base.split(/\s+vs\s+/i).map((item) => item.trim()).filter(Boolean);
  return parts.length === 2 ? parts.sort((a, b) => a.localeCompare(b)).join(" vs ") : base;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHtml(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return getHtml(url, attempt + 1);
    }
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function parseOptions(html) {
  const options = [];
  for (const match of html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)) {
    const text = stripTags(match[1]);
    if (text) options.push(text);
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

function parseRows(html, item, team) {
  const rows = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = tr[1];
    const link = rowHtml.match(/<a\b[^>]*href=["']([^"']*\/game\/stats\/\d+\/page-game\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const href = decodeHtml(link[1]).startsWith("http") ? decodeHtml(link[1]) : `https://gol.gg${decodeHtml(link[1])}`;
    const id = parseGameId(href);
    const cells = [];
    for (const cell of rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
      cells.push(stripTags(cell[1]));
    }
    if (!id || cells.length < 15) continue;
    const gameLabel = cells[13] || stripTags(link[2]);
    const mapNumber = Number((gameLabel.match(/\((\d+)\)\s*$/) || [])[1] || NaN);
    const ownKills = Number(cells[3]);
    const oppKills = Number(cells[8]);
    if (!Number.isFinite(mapNumber) || !Number.isFinite(ownKills) || !Number.isFinite(oppKills)) continue;
    rows.push({
      id,
      url: href,
      season: item.season,
      seasonYear: item.seasonYear,
      league: item.league,
      tournament: item.tournament,
      focalTeam: team.name,
      focalTeamId: team.id,
      result: cells[0] || "",
      score: cells[1] || "",
      ownKills,
      oppKills,
      totalKills: ownKills + oppKills,
      gameLabel,
      mapNumber,
      patch: cells[14] || "",
      week: cells[15] || "",
      source: "team-matchlist-http",
    });
  }
  return rows;
}

async function discoverTournaments() {
  const out = [];
  for (const season of SEASONS) {
    const url = `${BASE}/list/season-${season}/split-ALL/tournament-ALL/`;
    const html = await getHtml(url);
    for (const tournament of parseOptions(html)) {
      if (tournament === "-- ALL --") continue;
      const league = leagueForTournament(tournament);
      if (!league) continue;
      out.push({ season, seasonYear: parseSeasonYear(season), tournament, league });
    }
  }
  return out;
}

async function collectTournament(item) {
  const teamsUrl = `${BASE}/list/season-${item.season}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
  const teams = parseTeams(await getHtml(teamsUrl));
  const rows = [];
  for (const team of teams) {
    const url = `${BASE}/team-matchlist/${team.id}/split-ALL/tournament-${encodeTournament(item.tournament)}/`;
    rows.push(...parseRows(await getHtml(url), item, team));
  }
  return { ...item, teams: teams.length, rawRows: rows.length, rows };
}

function buildDataset(tournaments, rows) {
  const byId = new Map();
  const duplicateRowsById = new Map();
  for (const row of rows) {
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
  for (const [key, rawGroup] of groups) {
    const group = [...rawGroup].sort((a, b) => a.mapNumber - b.mapNumber || Number(a.id) - Number(b.id));
    const bySequence = [];
    let current = [];
    let previousMap = 0;
    for (const game of group.sort((a, b) => Number(a.id) - Number(b.id))) {
      if (current.length && game.mapNumber <= previousMap) {
        bySequence.push(current);
        current = [];
      }
      current.push(game);
      previousMap = game.mapNumber;
    }
    if (current.length) bySequence.push(current);

    bySequence.forEach((sequence, index) => {
      const sequenceKey = `${key}||series-${index + 1}`;
      const scoreSamples = [...new Set(sequence.flatMap((game) => game.scoreSamples || []))];
      let bestOf = null;
      for (const score of scoreSamples) {
        const [a, b] = score.split("-").map(Number);
        if (Math.max(a, b) === 3) bestOf = 5;
        else if (Math.max(a, b) === 2 && bestOf !== 5) bestOf = 3;
      }
      const maxMap = Math.max(...sequence.map((game) => game.mapNumber));
      const mapsPresent = [...new Set(sequence.map((game) => game.mapNumber))].sort((a, b) => a - b);
      const bo3Confirmed = bestOf === 3 && maxMap <= 3 && mapsPresent[0] === 1 && mapsPresent.includes(2);
      series.push({
        key: sequenceKey,
        season: sequence[0].season,
        seasonYear: sequence[0].seasonYear,
        league: sequence[0].league,
        tournament: sequence[0].tournament,
        week: sequence[0].week,
        matchupKey: sequence[0].matchupKey,
        maxMap,
        bestOf,
        bo3Confirmed,
        scoreSamples,
        mapsPresent,
        gameIds: sequence.map((game) => game.id),
        totalKills: sequence.map((game) => game.totalKills),
      });
    });
  }

  const bo3Series = series.filter((item) => item.bo3Confirmed);
  const gameSeries = new Map();
  for (const item of bo3Series) {
    for (const id of item.gameIds) gameSeries.set(id, { key: item.key, maxMap: item.maxMap });
  }
  const games = gamesAll
    .filter((game) => gameSeries.has(game.id))
    .map((game) => ({
      ...game,
      seriesKey: gameSeries.get(game.id).key,
      seriesLength: gameSeries.get(game.id).maxMap,
    }));

  return {
    meta: {
      source: "GOL team-matchlist HTTP",
      createdAt: new Date().toISOString(),
      seasons: SEASONS,
      tournaments: tournaments.map(({ rows, ...item }) => item),
      rawRows: rows.length,
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

async function main() {
  const plan = await discoverTournaments();
  const reports = [];
  const rows = [];
  for (let index = 0; index < plan.length; index += 1) {
    const report = await collectTournament(plan[index]);
    rows.push(...report.rows);
    reports.push(report);
    console.log(`${index + 1}/${plan.length} ${report.season} ${report.tournament}: teams=${report.teams} rows=${report.rawRows}`);
  }
  const dataset = buildDataset(reports, rows);
  dataset.meta.collectReport = reports.map(({ rows: _rows, ...item }) => item);
  fs.writeFileSync(OUT_FILE, JSON.stringify(dataset, null, 2), "utf8");
  console.log(JSON.stringify({
    tournaments: plan.length,
    rawRows: rows.length,
    bo3Series: dataset.series.length,
    bo3Games: dataset.games.length,
  }, null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
