"use strict";
// Retenta IDs que tiveram "socket hang up" no scan anterior
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const GAMES_FILE = path.resolve(__dirname, "../data/games.js");
const ERROR_IDS  = [78873, 78895, 78896, 78897, 78898, 78899, 78900, 78901,
                    78902, 78903, 78904, 78909, 78910, 78911, 78912, 78913,
                    78915, 78916, 78917, 78920, 78921, 78922, 78923, 78924,
                    78925, 78926, 78927, 78928, 78929, 78930];

const LEAGUE_RULES = [
  { league: "LCK",   include: [/^LCK 20\d{2}\b/i],    exclude: [/\bCL\b/i] },
  { league: "LCKCL", include: [/^LCK CL 20\d{2}\b/i], exclude: [] },
  { league: "LPL",   include: [/^LPL 20\d{2}\b/i],    exclude: [] },
  { league: "CBLOL", include: [/^CBLOL\b/i],           exclude: [] },
  { league: "LEC",   include: [/^LEC\b/i],             exclude: [] },
  { league: "LCS",   include: [/^LCS\b/i],             exclude: [/^NACL\b/i] },
];
function leagueForTournament(t) {
  for (const r of LEAGUE_RULES) {
    if (r.include.some(x => x.test(t)) && !r.exclude.some(x => x.test(t))) return r.league;
  }
  return null;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 20000,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36" },
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function parseGame(html, id) {
  if (!html) return null;
  const titleRaw = (html.match(/<title>(.*?)<\/title>/) || [])[1] || "";
  if (!titleRaw.includes("Games of Legends")) return null;
  const tournamentRaw = titleRaw
    .replace(/ - Games of Legends$/, "")
    .replace(/^[^-]+-\s*/, "")
    .replace(/\s+(ROUND|WEEK|DAY)\d+.*$/i, "")
    .trim();
  const league = leagueForTournament(tournamentRaw);
  if (!league) return null;
  const date  = (html.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  const patch = (html.match(/cdn\/(1[0-9]\.\d+)\.\d+\/img/) || [])[1]
             || (html.match(/v(1[0-9]\.\d+)/) || [])[1] || "";
  const blueM = html.match(/col-12 blue-line-header">[\s\S]{0,300}?title='([^']+) stats'>([^<]+)<\/a>\s*-\s*(WIN|LOSS)/);
  const redM  = html.match(/col-12 red-line-header">[\s\S]{0,300}?title='([^']+) stats'>([^<]+)<\/a>\s*-\s*(WIN|LOSS)/);
  if (!blueM || !redM) return null;
  const teamA = decodeHtml(blueM[2].trim());
  const teamB = decodeHtml(redM[2].trim());
  const blueKillM = html.match(/<span class="score-box blue_line">[\s\S]*?alt='Kills'[^>]*\/>\s*(\d+)/);
  const redKillM  = html.match(/<span class="score-box red_line">[\s\S]*?alt='Kills'[^>]*\/>\s*(\d+)/);
  const killsA = blueKillM ? Number(blueKillM[1]) : NaN;
  const killsB = redKillM  ? Number(redKillM[1])  : NaN;
  if (!Number.isFinite(killsA) || !Number.isFinite(killsB)) return null;
  const picks = { teamA: [], teamB: [] };
  const tableStartRE = /class='[^']*playersInfosLine[^']*'/g;
  const tableStarts = [];
  let tsm;
  while ((tsm = tableStartRE.exec(html)) !== null) tableStarts.push(tsm.index);
  if (tableStarts.length >= 2) {
    const CHAMP_RE = /<img class='champion_icon rounded-circle' alt='([^']+)'/g;
    picks.teamA = [...html.substring(tableStarts[0], tableStarts[1]).matchAll(CHAMP_RE)].map(m => m[1]).slice(0, 5);
    picks.teamB = [...html.substring(tableStarts[1]).matchAll(CHAMP_RE)].map(m => m[1]).slice(0, 5);
  }
  if (picks.teamA.length < 5 || picks.teamB.length < 5) return null;
  const yearM = tournamentRaw.match(/\b(20\d{2})\b/);
  const seasonYear = yearM ? Number(yearM[1]) : 2026;
  const season = `S${seasonYear - 2010}`;
  const stage = /playoffs|finals|grand finals|play-in/i.test(tournamentRaw) ? "playoffs"
              : /cup|lock-in|kickoff/i.test(tournamentRaw) ? "cup"
              : /placements|qualifier/i.test(tournamentRaw) ? "qualifier" : "regular";
  return {
    collectedAt: new Date().toISOString(), collectorVersion: "update-games-v1",
    date, game: (titleRaw.match(/^(.*?) -/) || [])[1]?.trim() || "",
    id: String(id), killsA, killsB, league, patch, picks, season, seasonYear,
    sourceTournament: tournamentRaw, sourceUrl: `https://gol.gg/game/stats/${id}/page-game/`,
    stage, teamA, teamB, totalKills: killsA + killsB, tournament: tournamentRaw, tournamentLine: tournamentRaw,
  };
}

function loadGames() {
  const text = fs.readFileSync(GAMES_FILE, "utf8");
  return JSON.parse(text.replace(/^window\.GOL_GAMES_DATA\s*=\s*/, "").replace(/;\s*$/, ""));
}

async function main() {
  const data = loadGames();
  const existingIds = new Set(data.games.map(g => String(g.id)));

  console.log(`Retentando ${ERROR_IDS.length} IDs com erro anterior...\n`);
  const found = [];

  for (const id of ERROR_IDS) {
    if (existingIds.has(String(id))) {
      console.log(`[${id}] JÁ EXISTE`);
      await sleep(400);
      continue;
    }
    let html;
    try {
      html = await fetchHtml(`https://gol.gg/game/stats/${id}/page-game/`);
    } catch (e) {
      console.log(`[${id}] ERRO: ${e.message}`);
      await sleep(600);
      continue;
    }
    if (!html) { console.log(`[${id}] 404`); await sleep(400); continue; }

    const game = parseGame(html, id);
    if (!game) { console.log(`[${id}] outra liga`); await sleep(400); continue; }

    found.push(game);
    console.log(`[${id}] NOVO  ${game.league} | ${game.date} | p${game.patch} | ${game.teamA} vs ${game.teamB} | ${game.totalKills}k`);
    await sleep(600);
  }

  if (!found.length) { console.log("\nNenhum jogo novo nos IDs de erro."); return; }

  console.log(`\n${found.length} jogos extras encontrados. Adicionando ao games.js...`);
  const byLeague = {};
  for (const g of found) byLeague[g.league] = (byLeague[g.league] || 0) + 1;
  for (const [l, n] of Object.entries(byLeague)) console.log(`  ${l}: +${n}`);

  data.games = [...found, ...data.games];
  data.meta.createdAt = new Date().toISOString();
  fs.writeFileSync(GAMES_FILE, "window.GOL_GAMES_DATA = " + JSON.stringify(data, null, 2) + ";\n");
  console.log(`games.js atualizado. Total: ${data.games.length}`);
}
main().catch(console.error);
