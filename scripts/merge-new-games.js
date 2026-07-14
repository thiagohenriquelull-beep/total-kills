// Merge seguro de jogos novos no dataset canonico.
// Implementa o fluxo da secao 3.7/3.8 do PROJETO-CONTEXTO.md em um passo so:
//   validar (checklist 3.8) -> backup -> merge em games.json -> regenerar games.js
//   -> atualizar meta -> validar resultado. Aborta em QUALQUER falha antes de escrever.
// Uso: node scripts/merge-new-games.js [caminho/jogos-novos.json]
//      (padrao: data/jogos-novos.json; tambem aceita data/buracos-historicos.json)
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const GAMES_JSON = path.join(DATA_DIR, "games.json");
const GAMES_JS = path.join(DATA_DIR, "games.js");
const BACKUP_DIR = path.join(ROOT, "backups");
const KNOWN_LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];
const ROLES_PER_SIDE = 5;

const inputPath = path.resolve(process.argv[2] || path.join(DATA_DIR, "jogos-novos.json"));

function fail(message) {
  console.error(`ERRO: ${message}`);
  console.error("Nada foi alterado em games.json/games.js.");
  process.exit(1);
}

function datestamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ── 1. Carregar entradas ─────────────────────────────────────────────────────
if (!fs.existsSync(inputPath)) fail(`arquivo de entrada nao existe: ${inputPath}`);
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const newGames = input.games || [];
if (!newGames.length) {
  console.log("Nenhum jogo novo no arquivo de entrada. Nada a fazer.");
  process.exit(0);
}

const current = JSON.parse(fs.readFileSync(GAMES_JSON, "utf8"));
const currentGames = current.games || [];
const existingIds = new Set(currentGames.map((g) => String(g.id)));

// ── 2. Checklist 3.8 sobre os jogos novos ────────────────────────────────────
const problems = [];
const seenNew = new Set();
for (const g of newGames) {
  const tag = `id ${g.id} (${g.teamA} vs ${g.teamB})`;
  if (!g.id) problems.push("jogo sem id");
  if (seenNew.has(String(g.id))) problems.push(`id duplicado dentro do arquivo novo: ${tag}`);
  seenNew.add(String(g.id));
  if (existingIds.has(String(g.id))) problems.push(`id ja existe no dataset: ${tag}`);
  if (!KNOWN_LEAGUES.includes(g.league)) problems.push(`liga desconhecida "${g.league}": ${tag}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || "")) problems.push(`data invalida "${g.date}": ${tag}`);
  if (!g.patch || !String(g.patch).trim()) problems.push(`patch vazio: ${tag}`);
  if (!Number.isFinite(g.totalKills)) problems.push(`totalKills invalido: ${tag}`);
  if (Number.isFinite(g.killsA) && Number.isFinite(g.killsB) && g.totalKills !== g.killsA + g.killsB) {
    problems.push(`totalKills != killsA+killsB: ${tag}`);
  }
  if (!g.teamA || !g.teamB) problems.push(`time vazio: ${tag}`);
  if ((g.picks?.teamA || []).filter(Boolean).length !== ROLES_PER_SIDE) problems.push(`picks teamA != 5: ${tag}`);
  if ((g.picks?.teamB || []).filter(Boolean).length !== ROLES_PER_SIDE) problems.push(`picks teamB != 5: ${tag}`);
  if (!g.sourceUrl || !String(g.sourceUrl).startsWith("http")) problems.push(`sourceUrl invalida: ${tag}`);
  for (const name of [g.teamA, g.teamB, ...(g.picks?.teamA || []), ...(g.picks?.teamB || [])]) {
    if (/&#?\w+;/.test(String(name))) problems.push(`entidade HTML nao decodificada "${name}": ${tag}`);
  }
}
if (problems.length) {
  console.error(`Validacao falhou com ${problems.length} problema(s):`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  if (problems.length > 30) console.error(`  ... e mais ${problems.length - 30}`);
  fail("corrija o arquivo de entrada antes do merge");
}
console.log(`Validacao OK: ${newGames.length} jogos novos validos.`);

// ── 3. Backup ────────────────────────────────────────────────────────────────
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = datestamp();
fs.copyFileSync(GAMES_JSON, path.join(BACKUP_DIR, `games.before-merge-${stamp}.json`));
fs.copyFileSync(GAMES_JS, path.join(BACKUP_DIR, `games.before-merge-${stamp}.js`));
console.log(`Backup criado em backups/games.before-merge-${stamp}.{json,js}`);

// ── 4. Merge ─────────────────────────────────────────────────────────────────
const merged = [...currentGames, ...newGames].sort(
  (a, b) => a.league.localeCompare(b.league) || String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
);

const counts = {};
for (const g of merged) counts[g.league] = (counts[g.league] || 0) + 1;
const meta = { ...(current.meta || {}) };
meta.createdAt = new Date().toISOString();
meta.totalGames = merged.length;
for (const entry of meta.leagues || []) {
  if (counts[entry.league] !== undefined) entry.games = counts[entry.league];
}

const output = { meta, games: merged };

// ── 5. Escrever games.json e regenerar games.js ──────────────────────────────
fs.writeFileSync(GAMES_JSON, JSON.stringify(output, null, 2) + "\n", "utf8");
fs.writeFileSync(GAMES_JS, "window.GOL_GAMES_DATA = " + JSON.stringify(output, null, 2) + ";\n", "utf8");

// ── 6. Validar resultado ─────────────────────────────────────────────────────
execFileSync(process.execPath, ["--check", GAMES_JS], { stdio: "inherit" });
const reread = JSON.parse(fs.readFileSync(GAMES_JSON, "utf8"));
if (reread.games.length !== currentGames.length + newGames.length) {
  fail(`contagem pos-merge inesperada: ${reread.games.length} != ${currentGames.length} + ${newGames.length} — restaure o backup`);
}
const finalIds = new Set(reread.games.map((g) => String(g.id)));
if (finalIds.size !== reread.games.length) fail("duplicatas apos merge — restaure o backup");

console.log(`\nMerge concluido: ${currentGames.length} -> ${reread.games.length} jogos.`);
const newByLeague = {};
for (const g of newGames) newByLeague[g.league] = (newByLeague[g.league] || 0) + 1;
for (const [league, n] of Object.entries(newByLeague).sort()) console.log(`  ${league}: +${n} (total ${counts[league]})`);
console.log("\nProximos passos: node --test tests/ && node scripts/refresh-analytics.js");
