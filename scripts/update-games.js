"use strict";
/**
 * update-games.js
 * Busca jogos novos no gol.gg (pages públicas via HTTPS) a partir do último
 * ID registrado no games.js e adiciona ao games.js sem tocar na lógica do modelo.
 *
 * Uso: node scripts/update-games.js
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

const ROOT       = path.resolve(__dirname, "..");
const GAMES_FILE = path.join(ROOT, "data", "games.js");
const OUT_FILE   = path.join(ROOT, "data", "jogos-novos.json");

// ── Ligas alvo e regras de identificação por torneio ──────────────────────────
const LEAGUE_RULES = [
  { league: "LCK",   include: [/^LCK 20\d{2}\b/i],    exclude: [/\bCL\b/i] },
  { league: "LCKCL", include: [/^LCK CL 20\d{2}\b/i], exclude: [] },
  { league: "LPL",   include: [/^LPL 20\d{2}\b/i],    exclude: [] },
  { league: "CBLOL", include: [/^CBLOL\b/i],           exclude: [] },
  { league: "LEC",   include: [/^LEC\b/i],             exclude: [] },
  { league: "LCS",   include: [/^LCS\b/i],             exclude: [/^NACL\b/i] },
];

function leagueForTournament(tournament) {
  for (const rule of LEAGUE_RULES) {
    if (rule.include.some(r => r.test(tournament)) &&
        !rule.exclude.some(r => r.test(tournament))) return rule.league;
  }
  return null;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 20000,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36" },
    }, (res) => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
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

// ── Parse ─────────────────────────────────────────────────────────────────────
function parseGame(html, id) {
  // title: "TeamA vs TeamB game N - Tournament Name - Games of Legends"
  const titleRaw = (html.match(/<title>(.*?)<\/title>/) || [])[1] || "";
  if (!titleRaw.includes("Games of Legends")) return null;

  // tournament: second segment, strip " - Games of Legends" and game/round info
  const tournamentRaw = titleRaw
    .replace(/ - Games of Legends$/, "")
    .replace(/^[^-]+-\s*/, "")           // remove "TeamA vs TeamB game N - "
    .replace(/\s+(ROUND|WEEK|DAY)\d+.*$/i, "")
    .trim();

  const league = leagueForTournament(tournamentRaw);
  if (!league) return null;              // not a target league

  // date 2026-MM-DD (first occurrence)
  const date = (html.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  if (!date) return null;

  // patch from ddragon CDN url (e.g. cdn/16.10.1/img)
  const patch = (html.match(/cdn\/(1[0-9]\.\d+)\.\d+\/img/) || [])[1]
             || (html.match(/v(1[0-9]\.\d+)/) || [])[1]
             || "";

  // teams from line-header divs
  const blueM = html.match(/col-12 blue-line-header">[\s\S]{0,300}?title='([^']+) stats'>([^<]+)<\/a>\s*-\s*(WIN|LOSS)/);
  const redM  = html.match(/col-12 red-line-header">[\s\S]{0,300}?title='([^']+) stats'>([^<]+)<\/a>\s*-\s*(WIN|LOSS)/);
  if (!blueM || !redM) return null;

  const teamA   = decodeHtml(blueM[2].trim());   // blue side = teamA convention
  const teamB   = decodeHtml(redM[2].trim());
  const teamAId = (html.match(new RegExp(`team-stats/(\\d+)/[^']*'\\s+title='${escapeRe(teamA)} stats'`)) || [])[1] || "";
  const teamBId = (html.match(new RegExp(`team-stats/(\\d+)/[^']*'\\s+title='${escapeRe(teamB)} stats'`)) || [])[1] || "";

  // kills: first score-box for blue, first for red
  const blueKillM = html.match(/<span class="score-box blue_line">[\s\S]*?alt='Kills'[^>]*\/>\s*(\d+)/);
  const redKillM  = html.match(/<span class="score-box red_line">[\s\S]*?alt='Kills'[^>]*\/>\s*(\d+)/);
  const killsA = blueKillM ? Number(blueKillM[1]) : NaN;
  const killsB = redKillM  ? Number(redKillM[1])  : NaN;
  if (!Number.isFinite(killsA) || !Number.isFinite(killsB)) return null;

  // picks from playersInfosLine tables (role-ordered, TOP/JG/MID/ADC/SUP)
  // champion_icon rounded-circle (without _medium) = only player-table icons, not bans
  // Use table start positions to split blue vs red sections (avoids nested-table regex issue)
  const picks = { teamA: [], teamB: [] };
  const tableStartRE = /class='[^']*playersInfosLine[^']*'/g;
  const tableStarts = [];
  let tsm;
  while ((tsm = tableStartRE.exec(html)) !== null) tableStarts.push(tsm.index);

  if (tableStarts.length >= 2) {
    const CHAMP_RE = /<img class='champion_icon rounded-circle' alt='([^']+)'/g;
    const section1 = html.substring(tableStarts[0], tableStarts[1]);
    const section2 = html.substring(tableStarts[1]);  // até o fim — slice(0,5) garante só 5
    picks.teamA = [...section1.matchAll(CHAMP_RE)].map(m => m[1]).slice(0, 5);
    picks.teamB = [...section2.matchAll(CHAMP_RE)].map(m => m[1]).slice(0, 5);
  }
  if (picks.teamA.length < 5 || picks.teamB.length < 5) return null;

  // season from tournament year
  const yearM = tournamentRaw.match(/\b(20\d{2})\b/);
  const seasonYear = yearM ? Number(yearM[1]) : 2026;
  const season = `S${seasonYear - 2010}`;

  // stage
  const stage = /playoffs|finals|grand finals|play-in/i.test(tournamentRaw) ? "playoffs"
              : /cup|lock-in|kickoff/i.test(tournamentRaw) ? "cup"
              : /placements|qualifier/i.test(tournamentRaw) ? "qualifier"
              : "regular";

  // game label from title (before first " - ")
  const game = (titleRaw.match(/^(.*?) -/) || [])[1] || titleRaw;

  return {
    collectedAt:     new Date().toISOString(),
    collectorVersion: "update-games-v1",
    date,
    game:            game.trim(),
    id:              String(id),
    killsA,
    killsB,
    league,
    patch,
    picks,
    season,
    seasonYear:      seasonYear || 2026,
    sourceTournament: tournamentRaw,
    sourceUrl:       `https://gol.gg/game/stats/${id}/page-game/`,
    stage,
    teamA,
    teamAId,
    teamB,
    teamBId,
    totalKills:      killsA + killsB,
    tournament:      tournamentRaw,
    tournamentLine:  tournamentRaw,
  };
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ── Carrega games.js ──────────────────────────────────────────────────────────
function loadGames() {
  const text = fs.readFileSync(GAMES_FILE, "utf8");
  const json = text.replace(/^window\.GOL_GAMES_DATA\s*=\s*/, "").replace(/;\s*$/, "");
  return JSON.parse(json);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Carregando games.js...");
  const data = loadGames();
  const games = data.games;

  const existingIds = new Set(games.map(g => String(g.id)));
  const maxId = Math.max(...games.map(g => Number(g.id)));

  const lastDateByLeague = {};
  for (const g of games) {
    if (!lastDateByLeague[g.league] || g.date > lastDateByLeague[g.league])
      lastDateByLeague[g.league] = g.date;
  }

  console.log(`Dataset atual: ${games.length} jogos | Maior ID: ${maxId}`);
  console.log("Últimas datas:");
  for (const [l, d] of Object.entries(lastDateByLeague)) console.log(`  ${l}: ${d}`);

  const START_ID  = maxId + 1;
  const END_ID    = maxId + 700;   // ~5 dias de margem generosa
  const MAX_MISS  = 80;            // para após 80 IDs consecutivos sem acerto
  const THROTTLE  = 600;           // ms entre requests

  const newGames = [];
  let consecutiveMiss = 0;
  let checked = 0;
  let skippedLeague = 0;
  let notFound = 0;

  console.log(`\nVarrendo IDs ${START_ID}–${END_ID}...\n`);

  for (let id = START_ID; id <= END_ID; id++) {
    if (consecutiveMiss >= MAX_MISS) {
      console.log(`\nParando: ${MAX_MISS} IDs consecutivos sem jogo das ligas alvo.`);
      break;
    }

    const url = `https://gol.gg/game/stats/${id}/page-game/`;
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      process.stdout.write(`[${id}] ERRO: ${err.message}\n`);
      consecutiveMiss++;
      checked++;
      await sleep(THROTTLE);
      continue;
    }

    if (!html) {
      process.stdout.write(`[${id}] 404\n`);
      notFound++;
      consecutiveMiss++;
      checked++;
      await sleep(THROTTLE);
      continue;
    }

    if (existingIds.has(String(id))) {
      process.stdout.write(`[${id}] JÁ EXISTE\n`);
      consecutiveMiss = 0;
      checked++;
      await sleep(THROTTLE);
      continue;
    }

    const game = parseGame(html, id);
    if (!game) {
      skippedLeague++;
      consecutiveMiss++;
      checked++;
      await sleep(THROTTLE);
      continue;
    }

    // Só inclui se for após a última data desta liga (dedup por data)
    const lastDate = lastDateByLeague[game.league] || "0000-00-00";
    if (game.date <= lastDate && !existingIds.has(String(id))) {
      process.stdout.write(`[${id}] ANTIGO (${game.league} ${game.date} <= ${lastDate}) — skip\n`);
      consecutiveMiss++;
      checked++;
      await sleep(THROTTLE);
      continue;
    }

    consecutiveMiss = 0;
    newGames.push(game);
    process.stdout.write(`[${id}] NOVO  ${game.league} | ${game.date} | p${game.patch} | ${game.teamA} vs ${game.teamB} | ${game.totalKills}k\n`);

    checked++;
    await sleep(THROTTLE);
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  console.log("\n═══ RESULTADO ════════════════════════════════════════");
  console.log(`IDs verificados : ${checked}`);
  console.log(`404 / não existe: ${notFound}`);
  console.log(`Outra liga      : ${skippedLeague}`);
  console.log(`Jogos novos     : ${newGames.length}`);

  const byLeague = {};
  const byPatch  = {};
  for (const g of newGames) {
    byLeague[g.league] = (byLeague[g.league] || 0) + 1;
    byPatch[`${g.league}:${g.patch}`] = (byPatch[`${g.league}:${g.patch}`] || 0) + 1;
  }
  console.log("\nNovos por liga:");
  for (const [l, n] of Object.entries(byLeague)) console.log(`  ${l}: +${n}`);
  console.log("\nPatches observados:");
  for (const [k, n] of Object.entries(byPatch)) console.log(`  ${k} (${n} jogos)`);

  if (!newGames.length) {
    console.log("\nNenhum jogo novo encontrado. games.js não foi alterado.");
    return;
  }

  // Salva jogos-novos.json para inspeção
  fs.writeFileSync(OUT_FILE, JSON.stringify(newGames, null, 2));
  console.log(`\nSalvo em ${OUT_FILE}`);

  // Adiciona ao games.js
  const allGames = [...newGames, ...games];  // novos primeiro (mais recentes)
  data.games = allGames;
  data.meta.createdAt = new Date().toISOString();
  data.meta.collectorVersion = "update-games-v1";

  // Atualiza contagens no meta.leagues
  const leagueCounts = {};
  for (const g of allGames) leagueCounts[g.league] = (leagueCounts[g.league] || 0) + 1;
  for (const entry of (data.meta.leagues || [])) {
    if (leagueCounts[entry.league] !== undefined) entry.games = leagueCounts[entry.league];
  }

  const newContent = "window.GOL_GAMES_DATA = " + JSON.stringify(data, null, 2) + ";\n";
  fs.writeFileSync(GAMES_FILE, newContent);
  console.log(`games.js atualizado. Total: ${allGames.length} jogos (+${newGames.length})`);
}

main().catch(err => { console.error("ERRO FATAL:", err); process.exit(1); });
