// Sanidade do dataset VIVO (data/games.json + data/games.js).
// Sem goldens de valores: estes testes devem continuar passando conforme o
// dataset cresce. Validam a checklist da secao 3.8 do PROJETO-CONTEXTO.md.
// Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const data = require(path.join(root, "data", "games.json"));
const games = data.games;

const ROLES_COUNT = 5;
const KNOWN_LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];

test("dataset carrega e nao esta vazio", () => {
  assert.ok(Array.isArray(games) && games.length >= 1465, `esperado >= 1465 jogos, ha ${games.length}`);
});

test("zero duplicatas por id", () => {
  const ids = new Set();
  for (const g of games) {
    assert.ok(!ids.has(g.id), `id duplicado: ${g.id}`);
    ids.add(g.id);
  }
});

test("todos os jogos tem campos obrigatorios validos", () => {
  for (const g of games) {
    assert.ok(KNOWN_LEAGUES.includes(g.league), `liga desconhecida: ${g.league} (id ${g.id})`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(g.date || ""), `data invalida no id ${g.id}: ${g.date}`);
    assert.ok(g.patch && String(g.patch).trim(), `patch vazio no id ${g.id}`);
    assert.ok(Number.isFinite(g.totalKills), `totalKills invalido no id ${g.id}`);
    assert.ok(g.teamA && g.teamB, `time vazio no id ${g.id}`);
    assert.equal((g.picks?.teamA || []).filter(Boolean).length, ROLES_COUNT, `picks teamA != 5 no id ${g.id}`);
    assert.equal((g.picks?.teamB || []).filter(Boolean).length, ROLES_COUNT, `picks teamB != 5 no id ${g.id}`);
    assert.ok(g.sourceUrl && g.sourceUrl.startsWith("http"), `sourceUrl invalida no id ${g.id}`);
  }
});

test("nomes decodificados: sem entidades HTML nem apostrofo perdido", () => {
  for (const g of games) {
    for (const name of [g.teamA, g.teamB, ...(g.picks?.teamA || []), ...(g.picks?.teamB || [])]) {
      assert.ok(!/&#?\w+;/.test(String(name)), `entidade HTML nao decodificada: "${name}" (id ${g.id})`);
    }
    // bug historico: "Anyone's Legend" virava "Anyone s Legend"
    assert.ok(!/\b\w+ s /.test(g.teamA) || g.teamA.includes("'"), `possivel apostrofo perdido: "${g.teamA}" (id ${g.id})`);
  }
});

test("totalKills consistente com killsA + killsB quando presentes", () => {
  for (const g of games) {
    if (Number.isFinite(g.killsA) && Number.isFinite(g.killsB)) {
      assert.equal(g.totalKills, g.killsA + g.killsB, `totalKills != killsA+killsB no id ${g.id}`);
    }
  }
});

test("games.js espelha games.json (mesma contagem e mesmos ids)", () => {
  const source = fs.readFileSync(path.join(root, "data", "games.js"), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const browserData = sandbox.window.GOL_GAMES_DATA || sandbox.GOL_GAMES_DATA;
  assert.ok(browserData && Array.isArray(browserData.games), "games.js nao definiu GOL_GAMES_DATA.games");
  assert.equal(browserData.games.length, games.length, "contagem difere entre games.js e games.json");
  const jsonIds = new Set(games.map((g) => String(g.id)));
  for (const g of browserData.games) {
    assert.ok(jsonIds.has(String(g.id)), `id ${g.id} em games.js mas nao em games.json`);
  }
});

test("metadata de ligas bate com a contagem real", () => {
  const metaLeagues = data.meta?.leagues || [];
  if (!metaLeagues.length) return; // metadata opcional
  const counts = new Map();
  for (const g of games) counts.set(g.league, (counts.get(g.league) || 0) + 1);
  for (const entry of metaLeagues) {
    assert.equal(
      counts.get(entry.league) || 0,
      entry.games,
      `metadata diz ${entry.games} jogos de ${entry.league}, dataset tem ${counts.get(entry.league) || 0}`
    );
  }
});

test("modelo constroi sobre o dataset vivo e preve valores plausiveis", () => {
  const Model = require(path.join(root, "model-core.js"));
  const model = Model.buildModel(games);
  for (const league of KNOWN_LEAGUES) {
    const m = model.leagueMeans.get(league);
    assert.ok(Number.isFinite(m) && m > 15 && m < 45, `media implausivel em ${league}: ${m}`);
  }
  const sample = games[games.length - 1];
  const pred = model.predictWithDraft(sample);
  assert.ok(Number.isFinite(pred.prediction) && pred.prediction > 10 && pred.prediction < 50, `previsao implausivel: ${pred.prediction}`);
});
