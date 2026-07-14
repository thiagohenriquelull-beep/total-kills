const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];
const TARGET_PER_LEAGUE = 300;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function validGame(game) {
  const issues = [];
  if (!game.id) issues.push("missing id");
  if (!game.league) issues.push("missing league");
  if (!game.date) issues.push("missing date");
  if (!game.teamA) issues.push("missing teamA");
  if (!game.teamB) issues.push("missing teamB");
  if (!Number.isFinite(game.totalKills)) issues.push("invalid totalKills");
  if (!Array.isArray(game.picks?.teamA) || game.picks.teamA.length !== 5) issues.push("teamA picks != 5");
  if (!Array.isArray(game.picks?.teamB) || game.picks.teamB.length !== 5) issues.push("teamB picks != 5");
  return issues;
}

function summarize(games) {
  const duplicates = [];
  const seen = new Set();
  const invalid = [];
  const byLeague = LEAGUES.map((league) => {
    const leagueGames = games.filter((game) => game.league === league);
    const seasons = [...new Set(leagueGames.map((game) => game.season || String(game.seasonYear || "")).filter(Boolean))].sort();
    const tournaments = [...new Set(leagueGames.map((game) => game.sourceTournament || game.tournament).filter(Boolean))].sort();
    return {
      league,
      games: leagueGames.length,
      target: TARGET_PER_LEAGUE,
      reachedTarget: leagueGames.length >= TARGET_PER_LEAGUE,
      seasons,
      tournaments,
    };
  });

  for (const game of games) {
    const key = String(game.id || "");
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
    const issues = validGame(game);
    if (issues.length) invalid.push({ id: game.id, league: game.league, game: game.game, issues });
  }

  return {
    createdAt: new Date().toISOString(),
    totalGames: games.length,
    byLeague,
    duplicates,
    invalid,
    ok: duplicates.length === 0 && invalid.length === 0,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Dataset Validation");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push("");
  lines.push("## Contagem por Liga");
  lines.push("");
  lines.push("| Liga | Jogos | Meta | Temporadas | Torneios |");
  lines.push("|---|---:|---:|---|---|");
  for (const item of report.byLeague) {
    lines.push(`| ${item.league} | ${item.games} | ${item.target} | ${item.seasons.join(", ") || "-"} | ${item.tournaments.join("; ") || "-"} |`);
  }
  lines.push("");
  lines.push(`- Total de jogos: ${report.totalGames}`);
  lines.push(`- Duplicatas: ${report.duplicates.length}`);
  lines.push(`- Invalidos: ${report.invalid.length}`);
  lines.push(`- Status: ${report.ok ? "OK" : "REVISAR"}`);
  lines.push("");
  if (report.invalid.length) {
    lines.push("## Invalidos");
    lines.push("");
    for (const item of report.invalid.slice(0, 50)) {
      lines.push(`- ${item.league} ${item.id}: ${item.issues.join(", ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const payload = readJson(path.join(DATA_DIR, "games.json"));
  const report = summarize(payload.games || []);
  writeJson(path.join(DATA_DIR, "dataset-validation.json"), report);
  fs.writeFileSync(path.join(DATA_DIR, "dataset-validation-summary.md"), buildMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { summarize, buildMarkdown, main };
