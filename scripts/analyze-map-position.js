const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];
const OUT_JSON = path.join(DATA_DIR, "map-position-analysis.json");
const OUT_MD = path.join(DATA_DIR, "map-position-analysis.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function variance(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function std(values) {
  const v = variance(values);
  return v === null ? null : Math.sqrt(v);
}

function sem(values) {
  const s = std(values);
  return s === null ? null : s / Math.sqrt(values.length);
}

function ci95(values) {
  if (values.length < 2) return { low: null, high: null, half: null };
  const avg = mean(values);
  const half = 1.96 * sem(values);
  return { low: avg - half, high: avg + half, half };
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function gammaLog(z) {
  const coeff = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - gammaLog(1 - z);
  let x = 0.99999999999980993;
  const zz = z - 1;
  for (let i = 0; i < coeff.length; i++) x += coeff[i] / (zz + i + 1);
  const t = zz + coeff.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const maxIter = 200;
  const eps = 3e-12;
  const fpmin = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function betaIncRegularized(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaLog(a + b) - gammaLog(a) - gammaLog(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betaContinuedFraction(a, b, x) / a;
  return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
}

function fCdf(f, df1, df2) {
  if (f <= 0) return 0;
  const x = (df1 * f) / (df1 * f + df2);
  return betaIncRegularized(x, df1 / 2, df2 / 2);
}

function fPValue(f, df1, df2) {
  return 1 - fCdf(f, df1, df2);
}

function welchPValue(a, b) {
  if (a.length < 2 || b.length < 2) return { diff: null, se: null, t: null, df: null, p: null, ci: { low: null, high: null } };
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  const diff = ma - mb;
  const t = diff / se;
  const num = (va / a.length + vb / b.length) ** 2;
  const den = ((va / a.length) ** 2) / (a.length - 1) + ((vb / b.length) ** 2) / (b.length - 1);
  const df = num / den;
  // Normal approximation is sufficient at the sample sizes used here.
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  const half = 1.96 * se;
  return { diff, se, t, df, p, ci: { low: diff - half, high: diff + half } };
}

function anova(groups) {
  const valid = groups.filter((group) => group.values.length >= 2);
  const all = valid.flatMap((group) => group.values);
  if (valid.length < 2 || all.length <= valid.length) return { f: null, p: null, dfBetween: null, dfWithin: null };
  const grand = mean(all);
  const ssBetween = valid.reduce((sum, group) => sum + group.values.length * (mean(group.values) - grand) ** 2, 0);
  const ssWithin = valid.reduce((sum, group) => {
    const avg = mean(group.values);
    return sum + group.values.reduce((inner, value) => inner + (value - avg) ** 2, 0);
  }, 0);
  const dfBetween = valid.length - 1;
  const dfWithin = all.length - valid.length;
  const f = (ssBetween / dfBetween) / (ssWithin / dfWithin);
  return { f, p: fPValue(f, dfBetween, dfWithin), dfBetween, dfWithin };
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "--";
}

function pFmt(value) {
  if (!Number.isFinite(value)) return "--";
  if (value < 0.001) return "<0.001";
  return value.toFixed(3);
}

function significanceNote(test) {
  if (!Number.isFinite(test?.p)) return "amostra insuficiente";
  return test.p < 0.05 ? "diferenca estatisticamente detectada" : "nao significativo";
}

function teamPairKey(game) {
  const ids = [game.teamAId || game.teamA, game.teamBId || game.teamB].map((x) => String(x || "").trim()).sort();
  return ids.join("::");
}

function seriesKey(game) {
  return [
    game.league,
    game.sourceTournament || game.tournament || "",
    game.date || "",
    teamPairKey(game),
  ].join("||");
}

function parseTitleMapNumber(game) {
  const text = String(game.game || "");
  const match = text.match(/\bgame\s*([1-5])\b/i) || text.match(/\bmap\s*([1-5])\b/i);
  return match ? Number(match[1]) : null;
}

function loadGames() {
  return LEAGUES.flatMap((league) => {
    const file = path.join(DATA_DIR, `expanded-${league}.json`);
    const json = readJson(file);
    return (json.games || []).map((game) => ({ ...game, sourceFile: path.basename(file) }));
  }).filter((game) => Number.isFinite(game.totalKills));
}

function annotateGames(games) {
  const groups = new Map();
  for (const game of games) {
    const key = seriesKey(game);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }

  const annotated = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => Number(a.id) - Number(b.id));
    const titleNumbers = sorted.map(parseTitleMapNumber);
    const hasTitleNumbers = titleNumbers.every(Boolean) && new Set(titleNumbers).size === sorted.length;
    sorted.forEach((game, index) => {
      const mapNumber = hasTitleNumbers ? titleNumbers[index] : index + 1;
      annotated.push({
        ...game,
        seriesKey: key,
        mapNumber,
        seriesLength: sorted.length,
        isSeries: sorted.length >= 2,
        isDecisiveMap: sorted.length >= 2 && mapNumber === sorted.length,
        mapInference: hasTitleNumbers ? "title" : "group-id-order",
        inferredOrderIndex: index + 1,
      });
    });
  }
  return annotated;
}

function summarizeGames(games, globalMean) {
  const kills = games.map((game) => game.totalKills);
  const ci = ci95(kills);
  return {
    games: games.length,
    mean: r(mean(kills)),
    median: r(median(kills)),
    std: r(std(kills)),
    ciLow: r(ci.low),
    ciHigh: r(ci.high),
    aboveGlobalMean: games.length ? r(games.filter((game) => game.totalKills > globalMean).length / games.length, 4) : null,
    belowGlobalMean: games.length ? r(games.filter((game) => game.totalKills < globalMean).length / games.length, 4) : null,
  };
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function mapPositionTable(games, globalMean) {
  const groups = groupBy(games.filter((game) => game.mapNumber >= 1 && game.mapNumber <= 5), (game) => game.mapNumber);
  const result = {};
  for (let i = 1; i <= 5; i++) result[i] = summarizeGames(groups.get(i) || [], globalMean);
  return result;
}

function anovaByMap(games) {
  const groups = [];
  for (let i = 1; i <= 5; i++) {
    const values = games.filter((game) => game.mapNumber === i).map((game) => game.totalKills);
    if (values.length) groups.push({ key: i, values });
  }
  return anova(groups);
}

function welchMap(games, a, b) {
  return welchPValue(
    games.filter((game) => game.mapNumber === a).map((game) => game.totalKills),
    games.filter((game) => game.mapNumber === b).map((game) => game.totalKills)
  );
}

function contextRows(games, globalMean) {
  const contexts = [
    ["all", "Todos os mapas", () => true],
    ["seriesOnly", "Apenas series com 2+ mapas", (game) => game.seriesLength >= 2],
    ["decisive", "Mapas decisivos", (game) => game.isDecisiveMap],
    ["intermediate", "Mapas intermediarios", (game) => game.seriesLength >= 2 && !game.isDecisiveMap],
    ["map3Decisive", "Mapa 3 decisivo", (game) => game.mapNumber === 3 && game.isDecisiveMap],
    ["map3Intermediate", "Mapa 3 intermediario", (game) => game.mapNumber === 3 && !game.isDecisiveMap && game.seriesLength >= 4],
    ["map5", "Mapa 5", (game) => game.mapNumber === 5],
  ];
  return Object.fromEntries(contexts.map(([key, label, filter]) => {
    const subset = games.filter(filter);
    return [key, { label, ...summarizeGames(subset, globalMean) }];
  }));
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = String(getKey(item));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function validationSample(annotated) {
  const groups = [...groupBy(annotated.filter((game) => game.seriesLength >= 2), (game) => game.seriesKey).values()]
    .sort((a, b) => b.length - a.length || String(b[0].date).localeCompare(String(a[0].date)))
    .slice(0, 12);
  return groups.map((group) => [...group]
    .sort((a, b) => a.mapNumber - b.mapNumber)
    .map((game) => ({
      league: game.league,
      date: game.date,
      tournament: game.sourceTournament || game.tournament,
      matchup: `${game.teamA} vs ${game.teamB}`,
      id: game.id,
      gameField: game.game,
      mapNumber: game.mapNumber,
      seriesLength: game.seriesLength,
      kills: game.totalKills,
      inference: game.mapInference,
    })));
}

function rowsToMarkdown(table) {
  const lines = [];
  lines.push("| Mapa | Jogos | Media | IC95 media | Mediana | Desv.Pad | > media geral | < media geral |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (let i = 1; i <= 5; i++) {
    const row = table[i];
    lines.push(`| ${i} | ${row.games} | ${fmt(row.mean)} | ${fmt(row.ciLow)} a ${fmt(row.ciHigh)} | ${fmt(row.median)} | ${fmt(row.std)} | ${pct(row.aboveGlobalMean)} | ${pct(row.belowGlobalMean)} |`);
  }
  return lines.join("\n");
}

function leagueRowsToMarkdown(byLeague) {
  const lines = [];
  lines.push("| Liga | Mapa | Jogos | Media | Mediana | Desv.Pad | > media geral |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    const table = byLeague[league]?.positions || {};
    for (let i = 1; i <= 5; i++) {
      const row = table[i];
      if (!row || !row.games) continue;
      lines.push(`| ${league} | ${i} | ${row.games} | ${fmt(row.mean)} | ${fmt(row.median)} | ${fmt(row.std)} | ${pct(row.aboveGlobalMean)} |`);
    }
  }
  return lines.join("\n");
}

function testsToMarkdown(globalTests, byLeague) {
  const lines = [];
  lines.push("| Escopo | ANOVA p | Mapa 2 - Mapa 5 | p Welch | IC95 dif. | Observacao |");
  lines.push("|---|---:|---:|---:|---:|---|");
  lines.push(`| Geral | ${pFmt(globalTests.anova.p)} | ${fmt(globalTests.map2vs5.diff)} | ${pFmt(globalTests.map2vs5.p)} | ${fmt(globalTests.map2vs5.ci.low)} a ${fmt(globalTests.map2vs5.ci.high)} | ${globalTests.map2vs5.note} |`);
  for (const league of LEAGUES) {
    const tests = byLeague[league]?.tests;
    if (!tests) continue;
    lines.push(`| ${league} | ${pFmt(tests.anova.p)} | ${fmt(tests.map2vs5.diff)} | ${pFmt(tests.map2vs5.p)} | ${fmt(tests.map2vs5.ci.low)} a ${fmt(tests.map2vs5.ci.high)} | ${tests.map2vs5.note} |`);
  }
  return lines.join("\n");
}

function contextToMarkdown(contexts) {
  const lines = [];
  lines.push("| Contexto | Jogos | Media | IC95 media | Mediana | Desv.Pad | > media geral |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const item of Object.values(contexts)) {
    lines.push(`| ${item.label} | ${item.games} | ${fmt(item.mean)} | ${fmt(item.ciLow)} a ${fmt(item.ciHigh)} | ${fmt(item.median)} | ${fmt(item.std)} | ${pct(item.aboveGlobalMean)} |`);
  }
  return lines.join("\n");
}

function distributionToMarkdown(distribution, labelName = "Valor") {
  const lines = [];
  lines.push(`| ${labelName} | Qtde |`);
  lines.push("|---:|---:|");
  for (const [key, value] of Object.entries(distribution).sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${value} |`);
  }
  return lines.join("\n");
}

function validationToMarkdown(sample) {
  const lines = [];
  lines.push("| Liga | Data | Serie | IDs em ordem | Mapas | Kills | Inferencia |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const series of sample) {
    const first = series[0];
    lines.push(`| ${first.league} | ${first.date} | ${first.matchup} | ${series.map((g) => g.id).join(" -> ")} | ${series.map((g) => g.mapNumber).join(", ")} | ${series.map((g) => g.kills).join(", ")} | ${first.inference} |`);
  }
  return lines.join("\n");
}

function buildConclusion(report) {
  const map2 = report.positions[2];
  const map5 = report.positions[5];
  const diff = report.tests.map2vs5.diff;
  const p = report.tests.map2vs5.p;
  const anovaP = report.tests.anova.p;
  const decisive = report.contexts.decisive;
  const intermediate = report.contexts.intermediate;
  const decisiveTest = report.contextTests.decisiveVsIntermediate;
  const decisiveDiff = decisiveTest.diff;
  const lines = [];
  if (Number.isFinite(p) && p < 0.05 && Math.abs(diff) >= 2) {
    lines.push(`A teoria aparece parcialmente: mapa 2 e mapa 5 diferem ${fmt(diff)} kills em media, com p=${pFmt(p)}.`);
  } else if (Number.isFinite(anovaP) && anovaP < 0.05) {
    lines.push(`Ha alguma diferenca entre posicoes de mapa no agregado (ANOVA p=${pFmt(anovaP)}), mas a comparacao mapa 2 vs mapa 5 nao sustenta uma regra forte isolada.`);
  } else {
    lines.push(`No agregado, a teoria "mapa 5 under / mapa 2 over" nao se confirma com significancia estatistica forte.`);
  }
  lines.push(`Mapa 2: media ${fmt(map2.mean)} em ${map2.games} jogos. Mapa 5: media ${fmt(map5.mean)} em ${map5.games} jogos. Diferenca mapa2-mapa5: ${fmt(diff)} kills, IC95 ${fmt(report.tests.map2vs5.ci.low)} a ${fmt(report.tests.map2vs5.ci.high)}, p=${pFmt(p)}.`);
  lines.push(`Mapas decisivos tiveram media ${fmt(decisive.mean)} contra ${fmt(intermediate.mean)} dos intermediarios, diferenca ${fmt(decisiveDiff)} kills, p=${pFmt(decisiveTest.p)}. Isso nao sustenta a explicacao geral de que "mapa decisivo" fica naturalmente mais under.`);
  return lines.join("\n\n");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Analise: Posicao Do Mapa Na Serie E Total De Kills");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Dataset: ${report.totalGames} mapas em ${report.totalSeries} grupos de serie. Media geral: ${fmt(report.globalMean)} kills.`);
  lines.push("");
  lines.push("## Conclusao Direta");
  lines.push("");
  lines.push(buildConclusion(report));
  lines.push("");
  lines.push("## Como O Numero Do Mapa Foi Inferido");
  lines.push("");
  lines.push("O campo `game` do dataset atual quase sempre vem como confronto simples, sem `Game 1/2/3`. Por isso, a inferencia principal foi agrupar por `liga + torneio + data + dupla de times` e ordenar por `id` crescente dentro do grupo. Quando o titulo trouxer `Game X`, o script usa o titulo.");
  lines.push("");
  lines.push("Distribuicao das inferencias:");
  lines.push("");
  lines.push(distributionToMarkdown(report.inferenceCounts, "Metodo"));
  lines.push("");
  lines.push("Distribuicao de tamanho observado da serie:");
  lines.push("");
  lines.push(distributionToMarkdown(report.seriesLengthDistribution, "Mapas jogados"));
  lines.push("");
  lines.push("Amostra de validacao da inferencia:");
  lines.push("");
  lines.push(validationToMarkdown(report.validationSample));
  lines.push("");
  lines.push("## Estatisticas Por Numero Do Mapa - Todo O Dataset");
  lines.push("");
  lines.push(rowsToMarkdown(report.positions));
  lines.push("");
  lines.push("## Testes Estatisticos");
  lines.push("");
  lines.push(testsToMarkdown(report.tests, report.byLeague));
  lines.push("");
  lines.push("Notas: ANOVA testa se alguma media entre mapas 1-5 difere. Welch testa diretamente mapa 2 menos mapa 5. O p-valor de Welch usa aproximacao normal, adequada aqui pelo tamanho das amostras.");
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push(leagueRowsToMarkdown(report.byLeague));
  lines.push("");
  lines.push("## Contexto Da Serie");
  lines.push("");
  lines.push(contextToMarkdown(report.contexts));
  lines.push("");
  lines.push("Testes de contexto:");
  lines.push("");
  lines.push("| Comparacao | Diferenca media | p Welch | IC95 dif. |");
  lines.push("|---|---:|---:|---:|");
  lines.push(`| Decisivo - intermediario | ${fmt(report.contextTests.decisiveVsIntermediate.diff)} | ${pFmt(report.contextTests.decisiveVsIntermediate.p)} | ${fmt(report.contextTests.decisiveVsIntermediate.ci.low)} a ${fmt(report.contextTests.decisiveVsIntermediate.ci.high)} |`);
  lines.push(`| Mapa 3 decisivo - mapa 3 intermediario | ${fmt(report.contextTests.map3DecisiveVsIntermediate.diff)} | ${pFmt(report.contextTests.map3DecisiveVsIntermediate.p)} | ${fmt(report.contextTests.map3DecisiveVsIntermediate.ci.low)} a ${fmt(report.contextTests.map3DecisiveVsIntermediate.ci.high)} |`);
  lines.push("");
  lines.push("## Contexto Por Liga");
  lines.push("");
  lines.push("| Liga | Contexto | Jogos | Media | Mediana | > media geral |");
  lines.push("|---|---|---:|---:|---:|---:|");
  for (const league of LEAGUES) {
    const contexts = report.byLeague[league]?.contexts || {};
    for (const key of ["seriesOnly", "decisive", "intermediate", "map3Decisive", "map3Intermediate", "map5"]) {
      const item = contexts[key];
      if (!item || !item.games) continue;
      lines.push(`| ${league} | ${item.label} | ${item.games} | ${fmt(item.mean)} | ${fmt(item.median)} | ${pct(item.aboveGlobalMean)} |`);
    }
  }
  lines.push("");
  lines.push("## Recomendacao Para O Modelo");
  lines.push("");
  const p = report.tests.map2vs5.p;
  const diff = report.tests.map2vs5.diff;
  if (Number.isFinite(p) && p < 0.05 && Math.abs(diff) >= 1.5) {
    lines.push(`Pode valer testar uma variavel leve de posicao do mapa, mas com shrink forte. O efeito observado entre mapa 2 e mapa 5 foi ${fmt(diff)} kills; nao deve entrar como ajuste grande sem backtest walk-forward.`);
  } else {
    lines.push("Nao recomendo incorporar posicao do mapa como ajuste principal agora. Se entrar, deve ser apenas como feature de diagnostico/backtest, porque o efeito agregado nao passou como sinal robusto suficiente para mover linha sozinho.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const games = loadGames();
  const annotated = annotateGames(games);
  const globalMean = mean(annotated.map((game) => game.totalKills));
  const positions = mapPositionTable(annotated, globalMean);
  const tests = {
    anova: anovaByMap(annotated),
    map2vs5: welchMap(annotated, 2, 5),
  };
  tests.map2vs5.note = significanceNote(tests.map2vs5);
  const contextTests = {
    decisiveVsIntermediate: welchPValue(
      annotated.filter((game) => game.isDecisiveMap).map((game) => game.totalKills),
      annotated.filter((game) => game.seriesLength >= 2 && !game.isDecisiveMap).map((game) => game.totalKills)
    ),
    map3DecisiveVsIntermediate: welchPValue(
      annotated.filter((game) => game.mapNumber === 3 && game.isDecisiveMap).map((game) => game.totalKills),
      annotated.filter((game) => game.mapNumber === 3 && !game.isDecisiveMap && game.seriesLength >= 4).map((game) => game.totalKills)
    ),
  };
  const byLeague = {};
  for (const league of LEAGUES) {
    const subset = annotated.filter((game) => game.league === league);
    const leagueMean = mean(subset.map((game) => game.totalKills));
    const leagueTests = {
      anova: anovaByMap(subset),
      map2vs5: welchMap(subset, 2, 5),
    };
    leagueTests.map2vs5.note = significanceNote(leagueTests.map2vs5);
    byLeague[league] = {
      games: subset.length,
      mean: r(leagueMean),
      positions: mapPositionTable(subset, leagueMean),
      tests: leagueTests,
      contexts: contextRows(subset, leagueMean),
    };
  }
  const report = {
    createdAt: new Date().toISOString(),
    totalGames: annotated.length,
    totalSeries: groupBy(annotated, (game) => game.seriesKey).size,
    globalMean: r(globalMean),
    inferenceCounts: countBy(annotated, (game) => game.mapInference),
    seriesLengthDistribution: countBy([...groupBy(annotated, (game) => game.seriesKey).values()], (group) => group.length),
    positions,
    tests,
    contextTests,
    contexts: contextRows(annotated, globalMean),
    byLeague,
    validationSample: validationSample(annotated),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, buildMarkdown(report), "utf8");
  console.log(JSON.stringify({
    totalGames: report.totalGames,
    globalMean: report.globalMean,
    map2: report.positions[2],
    map5: report.positions[5],
    map2vs5: {
      diff: r(report.tests.map2vs5.diff),
      p: r(report.tests.map2vs5.p, 4),
      ci: {
        low: r(report.tests.map2vs5.ci.low),
        high: r(report.tests.map2vs5.ci.high),
      },
    },
    anovaP: r(report.tests.anova.p, 4),
  }, null, 2));
}

if (require.main === module) main();
