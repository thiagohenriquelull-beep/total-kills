(function attachModel(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GOLPredictorModel = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const WORLD_LEAGUE = "MUNDIAL";
  const TARGET_LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];
  const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUP"];
  const DEFAULT_SIGMA = 8.3;
  // Per-league prediction RMSE derived from cross-league walk-forward backtest
  const LEAGUE_PREDICTION_RMSE = {
    LCK: 8.36,
    LCKCL: 9.15,
    LPL: 8.12,
    CBLOL: 7.64,
    LEC: 8.30,
    LCS: 7.09,
    MUNDIAL: DEFAULT_SIGMA,
  };
  const BLOCKED_THRESHOLD = 99;
  const DRAFT_MARKET_POLICY = {
    minEv: 0.02,
    blockedLeagues: {
      CBLOL: "draft ruim no historico atual",
    },
    warnedLeagues: {
      LCS: "amostra menor",
    },
    buckets: [
      {
        label: "fraco",
        min: 0.5,
        max: 0.6,
        maxMove: -1,
        sample: 83,
        hitByMove: { 0: 0.518, 1: 0.47, 1.5: 0.458, 2: 0.458, 3: 0.434 },
      },
      {
        label: "leve",
        min: 0.6,
        max: 0.75,
        maxMove: 0,
        sample: 94,
        hitByMove: { 0: 0.564, 1: 0.489, 1.5: 0.447, 2: 0.447, 3: 0.426 },
      },
      {
        label: "bom",
        min: 0.75,
        max: 1,
        maxMove: 1,
        sample: 137,
        hitByMove: { 0: 0.642, 1: 0.584, 1.5: 0.54, 2: 0.54, 3: 0.489 },
      },
      {
        label: "medio",
        min: 1,
        max: 1.25,
        maxMove: 1,
        sample: 89,
        hitByMove: { 0: 0.573, 1: 0.562, 1.5: 0.506, 2: 0.506, 3: 0.472 },
      },
      {
        label: "forte",
        min: 1.25,
        max: 1.5,
        maxMove: 2,
        sample: 54,
        hitByMove: { 0: 0.648, 1: 0.611, 1.5: 0.574, 2: 0.574, 3: 0.537 },
      },
      {
        label: "muito forte",
        min: 1.5,
        max: Infinity,
        maxMove: 2,
        sample: 92,
        hitByMove: { 0: 0.652, 1: 0.63, 1.5: 0.598, 2: 0.598, 3: 0.533 },
      },
    ],
  };

  const DEFAULT_OPTIONS = {
    calibrationWindow: 15,
    offsetWeight: 0.85,
    offsetShrink: 8,
    offsetCap: 5,
    globalOffsetWeight: 0.55,
    globalOffsetShrink: 25,
    globalOffsetCap: 3,
    leagueRecentWeight: 0.9,
    leagueHalfLife: 7,
    leagueHalfLifeByLeague: {
      LPL: 12,
      CBLOL: 12,
      LCK: 20,
      LCKCL: 20,
      LEC: 20,
      LCS: 20,
    },
    patchWeight: 0.14,
    patchShrink: 18,
    patchCap: 1.6,
    teamWeight: 0.34,
    teamWindow: 24,
    teamHalfLife: 7,
    teamShrink: 14,
    teamCap: 2.4,
    champWeight: 1,
    draftWeight: 1.25,
    champShrink: 10,
    champLeagueShrink: 14,
    champCap: 2.8,
    pairWeight: 0.45,
    pairShrink: 10,
    pairCap: 1.8,
    draftCap: 4.8,
  };

  const DEFAULT_HOUSE_POLICY = {
    calibrationWindow: 30,
    lineAdjustmentWeight: 0.45,
    lineAdjustmentCap: 2.5,
    minDraftConfidence: 0.55,
    sideThresholds: {
      LCK: { over: 0.5, under: BLOCKED_THRESHOLD },
      LCKCL: { over: BLOCKED_THRESHOLD, under: BLOCKED_THRESHOLD },
      LPL: { over: 1.0, under: BLOCKED_THRESHOLD },
      CBLOL: { over: BLOCKED_THRESHOLD, under: 0 },
      LEC: { over: 0, under: BLOCKED_THRESHOLD },
      LCS: { over: 0, under: 0 },
      MUNDIAL: { over: 1, under: 1 },
    },
    validationStats: {
      LCK: {
        over: { games: 8, hitRate: 0.875 },
        under: { games: 39, hitRate: 0.538 },
      },
      LCKCL: {
        over: { games: 0, hitRate: 0 },
        under: { games: 0, hitRate: 0 },
      },
      LPL: {
        over: { games: 20, hitRate: 0.65 },
        under: { games: 19, hitRate: 0.526 },
      },
      CBLOL: {
        over: { games: 40, hitRate: 0.5 },
        under: { games: 20, hitRate: 0.65 },
      },
      LEC: {
        over: { games: 10, hitRate: 0.6 },
        under: { games: 50, hitRate: 0.54 },
      },
      LCS: {
        over: { games: 28, hitRate: 0.643 },
        under: { games: 32, hitRate: 0.594 },
      },
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function std(values) {
    if (values.length < 2) return DEFAULT_SIGMA;
    const avg = mean(values);
    const variance = mean(values.map((value) => (value - avg) ** 2));
    return Math.max(3.5, Math.sqrt(variance));
  }

  function shrink(n, k) {
    return n / (n + k);
  }

  function sortRecent(a, b) {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b.id || 0) - Number(a.id || 0);
  }
  function getLeagueHalfLife(opts, league) {
    return opts.leagueHalfLifeByLeague?.[league] || opts.leagueHalfLife;
  }

  function weightedMean(gamesOrValues, getValue, halfLife) {
    const values = gamesOrValues.map((item, index) => {
      const value = getValue(item);
      const weight = Math.pow(0.5, index / halfLife);
      return { value, weight };
    }).filter((item) => Number.isFinite(item.value));
    const weightSum = values.reduce((sum, item) => sum + item.weight, 0);
    if (!weightSum) return 0;
    return values.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum;
  }

  function addSample(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function addTotalSample(residualMap, totalMap, key, residual, totalKills) {
    addSample(residualMap, key, residual);
    addSample(totalMap, key, totalKills);
  }

  function getAllPicks(game) {
    return [...(game.picks?.teamA || []), ...(game.picks?.teamB || [])].filter(Boolean);
  }

  function pairKeysForSide(picks) {
    const pairs = [
      ["TOP", "JUNGLE"],
      ["JUNGLE", "MID"],
      ["ADC", "SUP"],
    ];
    return pairs
      .map(([roleA, roleB]) => {
        const champA = picks[ROLES.indexOf(roleA)];
        const champB = picks[ROLES.indexOf(roleB)];
        if (!champA || !champB) return null;
        return `${roleA}:${champA}||${roleB}:${champB}`;
      })
      .filter(Boolean);
  }

  function normalizeOptions(options) {
    return { ...DEFAULT_OPTIONS, ...(options || {}) };
  }

  function fairLine(prediction) {
    return Math.floor(prediction) + 0.5;
  }

  function mergeDraftMarketPolicy(policy) {
    const provided = policy || {};
    return {
      ...DRAFT_MARKET_POLICY,
      ...provided,
      blockedLeagues: {
        ...DRAFT_MARKET_POLICY.blockedLeagues,
        ...(provided.blockedLeagues || {}),
      },
      warnedLeagues: {
        ...DRAFT_MARKET_POLICY.warnedLeagues,
        ...(provided.warnedLeagues || {}),
      },
      buckets: provided.buckets || DRAFT_MARKET_POLICY.buckets,
    };
  }

  function draftMoveBucket(move) {
    const safeMove = Math.max(0, Number.isFinite(move) ? move : 0);
    if (safeMove <= 0.25) return 0;
    if (safeMove <= 1) return 1;
    if (safeMove <= 1.5) return 1.5;
    if (safeMove <= 2) return 2;
    return 3;
  }

  function draftBucketForDelta(absDelta, policy) {
    const opts = mergeDraftMarketPolicy(policy);
    return opts.buckets.find((bucket) => absDelta >= bucket.min && absDelta < bucket.max) || null;
  }

  function evaluateDraftMarket(input, policy) {
    const opts = mergeDraftMarketPolicy(policy);
    const delta = Number(input?.delta);
    const marketLine = Number(input?.marketLine);
    const preLine = Number(input?.preLine);
    const league = input?.league || "";
    const side = delta > 0 ? "over" : delta < 0 ? "under" : null;
    const odds = side === "under" ? Number(input?.oddsUnder || 1.8) : Number(input?.oddsOver || 1.8);
    const absDelta = Math.abs(delta);
    const className = side === "under" ? "lean-under" : side === "over" ? "lean-over" : "lean-pass";

    if (!side || !Number.isFinite(absDelta)) {
      return { allowed: false, side: null, reason: "draft neutro", className: "lean-pass" };
    }
    if (!Number.isFinite(marketLine) || !Number.isFinite(preLine)) {
      return { allowed: false, side, reason: "sem linha da casa", className };
    }

    const bucket = draftBucketForDelta(absDelta, opts);
    const rawMove = side === "over" ? marketLine - preLine : preLine - marketLine;
    const sameDirectionMove = Math.max(0, rawMove);
    const moveKey = draftMoveBucket(sameDirectionMove);
    const hitRate = bucket?.hitByMove?.[moveKey] || null;
    const ev = Number.isFinite(hitRate) ? hitRate * odds - 1 : null;
    const fairOdds = hitRate ? 1 / hitRate : null;
    const remainingDelta = absDelta - sameDirectionMove;
    const blockedReason = opts.blockedLeagues[league] || "";
    const warning = opts.warnedLeagues[league] || "";

    let allowed = false;
    let reason = "";

    if (blockedReason) {
      reason = blockedReason;
    } else if (!bucket || absDelta < 0.6) {
      reason = "delta draft baixo";
    } else if (sameDirectionMove > bucket.maxMove) {
      reason = `linha ja moveu ${sameDirectionMove.toFixed(1)}`;
    } else if (!Number.isFinite(ev) || ev < opts.minEv) {
      reason = "EV historico baixo";
    } else {
      allowed = true;
      reason = "edge draft valido";
    }

    return {
      allowed,
      side,
      label: side === "over" ? "OVER" : "UNDER",
      className,
      reason,
      warning,
      leagueBlocked: Boolean(blockedReason),
      delta,
      absDelta,
      rawMove,
      sameDirectionMove,
      moveKey,
      remainingDelta,
      bucketLabel: bucket?.label || "sem faixa",
      bucketMin: bucket?.min || null,
      bucketMax: bucket?.max === Infinity ? null : bucket?.max || null,
      maxMove: bucket?.maxMove ?? null,
      sample: bucket?.sample || 0,
      hitRate,
      odds,
      ev,
      fairOdds,
    };
  }

  function normalizeHousePolicy(policy) {
    const providedStats = (policy || {}).validationStats || {};
    return {
      ...DEFAULT_HOUSE_POLICY,
      ...(policy || {}),
      sideThresholds: {
        ...DEFAULT_HOUSE_POLICY.sideThresholds,
        ...((policy || {}).sideThresholds || {}),
      },
      validationStats: Object.fromEntries(TARGET_LEAGUES.map((league) => [
        league,
        {
          ...(DEFAULT_HOUSE_POLICY.validationStats[league] || {}),
          ...(providedStats[league] || {}),
        },
      ])),
    };
  }

  function buildRawIndex(games, options) {
    const opts = normalizeOptions(options);
    const leagues = new Map();
    const patchesByLeague = new Map();
    const teamsByLeague = new Map();
    const teamGames = new Map();
    const champions = new Set();

    for (const game of games) {
      if (!TARGET_LEAGUES.includes(game.league) || !Number.isFinite(game.totalKills)) continue;
      if (!leagues.has(game.league)) leagues.set(game.league, []);
      leagues.get(game.league).push(game);

      if (!patchesByLeague.has(game.league)) patchesByLeague.set(game.league, new Set());
      patchesByLeague.get(game.league).add(game.patch || "ALL");

      if (!teamsByLeague.has(game.league)) teamsByLeague.set(game.league, new Set());
      teamsByLeague.get(game.league).add(game.teamA);
      teamsByLeague.get(game.league).add(game.teamB);

      for (const team of [game.teamA, game.teamB]) {
        const key = `${game.league}::${team}`;
        if (!teamGames.has(key)) teamGames.set(key, []);
        teamGames.get(key).push(game);
      }

      if (!leagues.has(WORLD_LEAGUE)) leagues.set(WORLD_LEAGUE, []);
      leagues.get(WORLD_LEAGUE).push(game);

      if (!patchesByLeague.has(WORLD_LEAGUE)) patchesByLeague.set(WORLD_LEAGUE, new Set());
      patchesByLeague.get(WORLD_LEAGUE).add(game.patch || "ALL");

      if (!teamsByLeague.has(WORLD_LEAGUE)) teamsByLeague.set(WORLD_LEAGUE, new Set());
      teamsByLeague.get(WORLD_LEAGUE).add(game.teamA);
      teamsByLeague.get(WORLD_LEAGUE).add(game.teamB);

      for (const team of [game.teamA, game.teamB]) {
        const key = `${WORLD_LEAGUE}::${team}`;
        if (!teamGames.has(key)) teamGames.set(key, []);
        teamGames.get(key).push(game);
      }

      for (const champion of getAllPicks(game)) champions.add(champion);
    }

    for (const list of leagues.values()) list.sort(sortRecent);
    for (const list of teamGames.values()) list.sort(sortRecent);

    const leagueStats = new Map();
    const leagueMeans = new Map();
    const leagueSigmas = new Map();
    for (const [league, list] of leagues) {
      const totals = list.map((game) => game.totalKills);
      const allMean = mean(totals);
      const recentMean = weightedMean(list, (game) => game.totalKills, getLeagueHalfLife(opts, league));
      const leagueMean = opts.leagueRecentWeight * recentMean + (1 - opts.leagueRecentWeight) * allMean;
      const sigma = std(totals);
      leagueStats.set(league, { league, n: list.length, allMean, recentMean, mean: leagueMean, sigma });
      leagueMeans.set(league, leagueMean);
      leagueSigmas.set(league, sigma);
    }

    const index = {
      options: opts,
      games,
      leagues,
      leagueStats,
      leagueMeans,
      leagueSigmas,
      patchesByLeague,
      teamsByLeague,
      teamGames,
      championRoleResiduals: new Map(),
      championRoleTotals: new Map(),
      championLeagueRoleResiduals: new Map(),
      championLeagueRoleTotals: new Map(),
      pairResiduals: new Map(),
      pairTotals: new Map(),
      champions: [...champions].sort((a, b) => a.localeCompare(b)),
      offsets: new Map(),
      globalOffset: { value: 0, raw: 0, n: 0 },
    };

    for (const game of games) {
      const pre = predictRaw(index, game, false);
      const residual = game.totalKills - pre.prediction;
      for (const side of ["teamA", "teamB"]) {
        (game.picks?.[side] || []).forEach((champion, indexRole) => {
          const role = ROLES[indexRole] || "UNK";
          addTotalSample(index.championRoleResiduals, index.championRoleTotals, `${role}::${champion}`, residual, game.totalKills);
          addTotalSample(index.championLeagueRoleResiduals, index.championLeagueRoleTotals, `${game.league}::${role}::${champion}`, residual, game.totalKills);
        });
        for (const key of pairKeysForSide(game.picks?.[side] || [])) {
          addTotalSample(index.pairResiduals, index.pairTotals, key, residual, game.totalKills);
        }
      }
    }

    return index;
  }

  function getLeagueMean(index, league) {
    return index.leagueStats.get(league)?.mean || mean(index.games.map((game) => game.totalKills));
  }

  function getPatchAdjustment(index, league, patch, leagueMean) {
    const opts = index.options;
    if (!patch || patch === "ALL") return { value: 0, n: 0, raw: 0, mean: leagueMean };
    const list = (index.leagues.get(league) || []).filter((game) => game.patch === patch);
    if (!list.length) return { value: 0, n: 0, raw: 0, mean: leagueMean };
    const patchMean = weightedMean(list.sort(sortRecent), (game) => game.totalKills, opts.leagueHalfLife);
    const raw = patchMean - leagueMean;
    const value = clamp(raw * shrink(list.length, opts.patchShrink) * opts.patchWeight, -opts.patchCap, opts.patchCap);
    return { value, n: list.length, raw, mean: patchMean };
  }

  function getTeamAdjustment(index, league, team, baseline) {
    const opts = index.options;
    const list = (index.teamGames.get(`${league}::${team}`) || []).slice(0, opts.teamWindow);
    if (!list.length) return { team, n: 0, mean: baseline, value: 0, raw: 0 };
    const teamMean = weightedMean(list, (game) => game.totalKills, opts.teamHalfLife);
    const raw = teamMean - baseline;
    const value = clamp(raw * shrink(list.length, opts.teamShrink) * opts.teamWeight, -opts.teamCap, opts.teamCap);
    return { team, n: list.length, mean: teamMean, raw, value };
  }

  function sampleEffect(residuals, totals, shrinkValue, cap, weight = 1) {
    if (!residuals.length) return { n: 0, average: 0, raw: 0, value: 0 };
    const raw = mean(residuals);
    const value = clamp(raw * shrink(residuals.length, shrinkValue) * weight, -cap, cap);
    return { n: residuals.length, average: mean(totals), raw, value };
  }

  function championRoleEffect(index, champion, role, league = "") {
    const opts = index.options;
    const globalKey = `${role}::${champion}`;
    const leagueKey = `${league}::${role}::${champion}`;
    const globalEffect = sampleEffect(
      index.championRoleResiduals.get(globalKey) || [],
      index.championRoleTotals.get(globalKey) || [],
      opts.champShrink,
      opts.champCap,
      opts.champWeight
    );
    const leagueEffect = league
      ? sampleEffect(
        index.championLeagueRoleResiduals.get(leagueKey) || [],
        index.championLeagueRoleTotals.get(leagueKey) || [],
        opts.champLeagueShrink,
        opts.champCap,
        opts.champWeight
      )
      : { n: 0, average: 0, raw: 0, value: 0 };
    const leagueTrust = shrink(leagueEffect.n, opts.champLeagueShrink);
    const value = clamp((leagueTrust * leagueEffect.value) + ((1 - leagueTrust) * globalEffect.value), -opts.champCap, opts.champCap);
    const n = leagueEffect.n + globalEffect.n;
    const average = leagueEffect.n ? leagueEffect.average : globalEffect.average;
    const raw = leagueTrust * leagueEffect.raw + (1 - leagueTrust) * globalEffect.raw;
    const source = leagueEffect.n >= 8 ? "liga+global" : "global";
    return { champion, role, league, n, leagueN: leagueEffect.n, globalN: globalEffect.n, average, raw, value, source };
  }

  function pairEffect(index, key) {
    const opts = index.options;
    const residuals = index.pairResiduals.get(key) || [];
    const totals = index.pairTotals.get(key) || [];
    if (!residuals.length) return { key, n: 0, average: 0, raw: 0, value: 0 };
    const raw = mean(residuals);
    const value = clamp(raw * shrink(residuals.length, opts.pairShrink) * opts.pairWeight, -opts.pairCap, opts.pairCap);
    return { key, n: residuals.length, average: mean(totals), raw, value };
  }

  function getDraftAdjustment(index, game) {
    const opts = index.options;
    const effects = [];
    const pairs = [];
    for (const side of ["teamA", "teamB"]) {
      (game.picks?.[side] || []).forEach((champion, indexRole) => {
        if (!champion) return;
        effects.push(championRoleEffect(index, champion, ROLES[indexRole] || "UNK", game.league));
      });
      for (const key of pairKeysForSide(game.picks?.[side] || [])) pairs.push(pairEffect(index, key));
    }
    if (!effects.length) return { value: 0, effects, pairs, count: 0, raw: 0, confidence: 0 };
    const pickMean = mean(effects.map((effect) => effect.value));
    const pairMean = pairs.length ? mean(pairs.map((effect) => effect.value)) : 0;
    const countConfidence = Math.sqrt(effects.length / 10);
    const sampleConfidence = shrink(mean(effects.map((effect) => effect.n)), opts.champShrink);
    const confidence = clamp(countConfidence * sampleConfidence, 0.1, 1);
    const raw = (pickMean * opts.draftWeight) + pairMean;
    const value = clamp(raw * confidence, -opts.draftCap, opts.draftCap);
    return { value, effects, pairs, count: effects.length, raw, confidence };
  }

  function predictRaw(index, game, includePicks) {
    const leagueMean = getLeagueMean(index, game.league);
    const patch = getPatchAdjustment(index, game.league, game.patch, leagueMean);
    const baseline = leagueMean + patch.value;
    const teamA = getTeamAdjustment(index, game.league, game.teamA, baseline);
    const teamB = getTeamAdjustment(index, game.league, game.teamB, baseline);
    const draft = includePicks ? getDraftAdjustment(index, game) : { value: 0, effects: [], count: 0 };
    const prediction = baseline + teamA.value + teamB.value + draft.value;
    return {
      prediction,
      leagueMean,
      baseline,
      patch,
      teamA,
      teamB,
      draft,
      correction: { value: 0, raw: 0, n: 0 },
      sigma: LEAGUE_PREDICTION_RMSE[game.league] || DEFAULT_SIGMA,
    };
  }

  function computeOffsets(games, options) {
    const opts = normalizeOptions(options);
    const calibrationIds = new Set();
    const byLeague = new Map();
    for (const game of games) {
      if (!byLeague.has(game.league)) byLeague.set(game.league, []);
      byLeague.get(game.league).push(game);
    }
    for (const list of byLeague.values()) {
      list.sort(sortRecent).slice(0, opts.calibrationWindow).forEach((game) => calibrationIds.add(String(game.id)));
    }

    const coreGames = games.filter((game) => !calibrationIds.has(String(game.id)));
    const coreIndex = buildRawIndex(coreGames, opts);
    const offsets = new Map();
    const globalErrors = [];

    for (const [league, list] of byLeague) {
      const calibration = list.slice(0, opts.calibrationWindow);
      if (!calibration.length || coreGames.filter((game) => game.league === league).length < 20) {
        offsets.set(league, { value: 0, raw: 0, n: 0 });
        continue;
      }
      const errors = calibration.map((game) => game.totalKills - predictRaw(coreIndex, game, true).prediction);
      globalErrors.push(...errors);
      const raw = mean(errors);
      const value = clamp(raw * shrink(errors.length, opts.offsetShrink) * opts.offsetWeight, -opts.offsetCap, opts.offsetCap);
      offsets.set(league, { value, raw, n: errors.length });
    }
    const raw = mean(globalErrors);
    const value = globalErrors.length
      ? clamp(raw * shrink(globalErrors.length, opts.globalOffsetShrink) * opts.globalOffsetWeight, -opts.globalOffsetCap, opts.globalOffsetCap)
      : 0;
    return { offsets, globalOffset: { value, raw, n: globalErrors.length } };
  }

  function buildModel(games, options) {
    const opts = normalizeOptions(options);
    const cleanGames = games.filter((game) => TARGET_LEAGUES.includes(game.league) && Number.isFinite(game.totalKills));
    const index = buildRawIndex(cleanGames, opts);
    const calibration = computeOffsets(cleanGames, opts);
    index.offsets = calibration.offsets;
    index.globalOffset = calibration.globalOffset;
    index.predict = function predict(game, includePicks = true) {
      const result = predictRaw(index, game, includePicks);
      const offset = index.offsets.get(game.league) || { value: 0, raw: 0, n: 0 };
      const globalOffset = index.globalOffset || { value: 0, raw: 0, n: 0 };
      result.prediction += offset.value + globalOffset.value;
      result.correction = {
        value: offset.value + globalOffset.value,
        raw: offset.raw,
        n: offset.n,
        league: offset,
        global: globalOffset,
      };
      return result;
    };
    index.championRoleEffect = (champion, role, league = "") => championRoleEffect(index, champion, role, league);
    index.pairEffect = (key) => pairEffect(index, key);
    index.predictPreDraft = (game) => index.predict(game, false);
    index.predictWithDraft = (game) => index.predict(game, true);
    index.houseLine = (game, calibrationGames, policy) => getHouseLine(index, game, calibrationGames, policy);
    return index;
  }

  function getLineCalibration(model, calibrationGames, league, policy) {
    const opts = normalizeHousePolicy(policy);
    const recent = (calibrationGames || [])
      .filter((game) => (league === WORLD_LEAGUE || game.league === league) && Number.isFinite(game.totalKills))
      .sort(sortRecent)
      .slice(0, opts.calibrationWindow);
    if (!recent.length) return { adjustment: 0, raw: 0, n: 0, overRateBefore: 0 };
    const margins = recent.map((game) => {
      const pre = model.predictPreDraft(game);
      return game.totalKills - fairLine(pre.prediction);
    });
    const raw = median(margins);
    const adjustment = clamp(raw * opts.lineAdjustmentWeight, -opts.lineAdjustmentCap, opts.lineAdjustmentCap);
    const overRateBefore = margins.filter((margin) => margin > 0).length / margins.length;
    return { adjustment, raw, n: margins.length, overRateBefore };
  }

  function draftSignal(league, delta, confidence, policy) {
    const opts = normalizeHousePolicy(policy);
    if (!Number.isFinite(delta)) return { lean: "neutral", action: false, threshold: 0, reason: "sem delta" };
    if (confidence < opts.minDraftConfidence) {
      return { lean: "neutral", action: false, threshold: 0, reason: "confiança baixa" };
    }
    const side = delta > 0 ? "over" : delta < 0 ? "under" : "neutral";
    if (side === "neutral") return { lean: "neutral", action: false, threshold: 0, reason: "delta neutro" };
    const thresholds = opts.sideThresholds[league] || { over: 1, under: 1 };
    const threshold = thresholds[side] ?? 1;
    const stats = opts.validationStats?.[league]?.[side] || { games: 0, hitRate: 0 };
    if (threshold >= BLOCKED_THRESHOLD) {
      return { lean: "neutral", action: false, side, threshold, stats, reason: `${side} bloqueado` };
    }
    const action = Math.abs(delta) >= threshold;
    return { lean: action ? side : "neutral", action, side, threshold, stats, reason: action ? "edge valido" : "delta fraco" };
  }

  function getHouseLine(model, game, calibrationGames, policy) {
    const pre = model.predictPreDraft(game);
    const post = model.predictWithDraft(game);
    const calibration = getLineCalibration(model, calibrationGames, game.league, policy);
    const preLine = fairLine(pre.prediction + calibration.adjustment);
    const postLine = fairLine(post.prediction + calibration.adjustment);
    const delta = post.prediction - pre.prediction;
    const signal = draftSignal(game.league, delta, post.draft.confidence || 0, policy);
    return { pre, post, calibration, preLine, postLine, delta, signal };
  }

  return {
    WORLD_LEAGUE,
    TARGET_LEAGUES,
    ROLES,
    DEFAULT_OPTIONS,
    DEFAULT_HOUSE_POLICY,
    DRAFT_MARKET_POLICY,
    buildModel,
    buildRawIndex,
    predictRaw,
    fairLine,
    getLineCalibration,
    draftSignal,
    getHouseLine,
    evaluateDraftMarket,
    draftBucketForDelta,
    draftMoveBucket,
    sortRecent,
    mean,
    median,
    std,
    shrink,
  };
});

