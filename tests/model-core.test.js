// Golden tests do modelo: rodam sobre um fixture CONGELADO (tests/fixtures/)
// e comparam com valores capturados em 2026-07-13. Se algum destes testes
// quebrar sem que voce tenha mudado model-core.js de proposito, uma regressao
// silenciosa entrou no calculo de previsao/EV — nao ajuste o golden, investigue.
// Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const Model = require(path.join(__dirname, "..", "model-core.js"));
const fixture = require(path.join(__dirname, "fixtures", "games-fixture.json"));

function close(actual, expected, tol = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `esperado ${expected}, obtido ${actual} (tolerancia ${tol})`
  );
}

const model = Model.buildModel(fixture.games);

test("fixture congelado: 240 jogos, 40 por liga", () => {
  assert.equal(fixture.games.length, 240);
  const byLeague = new Map();
  for (const g of fixture.games) byLeague.set(g.league, (byLeague.get(g.league) || 0) + 1);
  for (const [league, count] of byLeague) assert.equal(count, 40, league);
});

test("medias de liga (golden)", () => {
  close(model.leagueMeans.get("LCK"), 29.300824);
  close(model.leagueMeans.get("LCKCL"), 31.117335);
  close(model.leagueMeans.get("LPL"), 32.761362);
  close(model.leagueMeans.get("CBLOL"), 29.711324);
  close(model.leagueMeans.get("LEC"), 28.344456);
  close(model.leagueMeans.get("LCS"), 26.874665);
  close(model.leagueMeans.get("MUNDIAL"), 29.170491);
});

test("campeoes indexados no fixture (golden)", () => {
  assert.equal(model.champions.length, 114);
});

const refGame = fixture.games.find((g) => g.league === "LCK");

test("jogo de referencia continua o mesmo no fixture", () => {
  assert.equal(refGame.id, "75819");
});

test("previsao pre-draft do jogo de referencia (golden)", () => {
  const pre = model.predictPreDraft(refGame);
  close(pre.prediction, 30.927986);
});

test("previsao com draft completo do jogo de referencia (golden)", () => {
  const post = model.predictWithDraft(refGame);
  close(post.prediction, 30.823405);
  close(post.draft.value, -0.104581);
  close(post.draft.confidence, 0.848714);
  assert.equal(post.sigma, 8.36); // RMSE LCK
});

test("houseLine do jogo de referencia (golden)", () => {
  const house = model.houseLine(refGame, fixture.games);
  assert.equal(house.preLine, 29.5);
  assert.equal(house.postLine, 29.5);
  close(house.delta, -0.104581);
  assert.equal(house.signal.lean, "neutral");
  assert.equal(house.signal.action, false);
});

test("championRoleEffect Vi JUNGLE LCK (golden)", () => {
  const eff = model.championRoleEffect("Vi", "JUNGLE", "LCK");
  assert.equal(eff.n, 59);
  close(eff.value, 1.005365);
});

test("evaluateDraftMarket: cenario forte permitido (golden, funcao pura)", () => {
  const dm = Model.evaluateDraftMarket({
    delta: 1.3,
    marketLine: 27.5,
    preLine: 26.5,
    league: "LCK",
    oddsOver: 1.85,
  });
  assert.equal(dm.allowed, true);
  assert.equal(dm.side, "over");
  assert.equal(dm.bucketLabel, "forte");
  close(dm.hitRate, 0.611);
  close(dm.ev, 0.13035);
});

test("evaluateDraftMarket: CBLOL bloqueado por politica", () => {
  const dm = Model.evaluateDraftMarket({
    delta: 2,
    marketLine: 27.5,
    preLine: 27.5,
    league: "CBLOL",
  });
  assert.equal(dm.allowed, false);
  assert.equal(dm.leagueBlocked, true);
});

test("politicas e constantes estruturais nao mudaram", () => {
  assert.deepEqual(Model.TARGET_LEAGUES, ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"]);
  assert.deepEqual(Model.ROLES, ["TOP", "JUNGLE", "MID", "ADC", "SUP"]);
  assert.equal(Model.DRAFT_MARKET_POLICY.minEv, 0.02);
  assert.equal(Model.DEFAULT_OPTIONS.draftWeight, 1.25);
  assert.equal(Model.DEFAULT_OPTIONS.teamWeight, 0.34);
  assert.equal(Model.DEFAULT_HOUSE_POLICY.minDraftConfidence, 0.55);
});

test("funcoes puras basicas", () => {
  assert.equal(Model.fairLine(28.9), 28.5);
  assert.equal(Model.fairLine(28.1), 28.5);
  assert.equal(Model.shrink(10, 10), 0.5);
  assert.equal(Model.draftMoveBucket(0.2), 0);
  assert.equal(Model.draftMoveBucket(0.8), 1);
  assert.equal(Model.draftMoveBucket(2.4), 3);
  assert.equal(Model.median([1, 2, 3, 4]), 2.5);
});
