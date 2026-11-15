const { jStat } = require('jstat');

const ALPHA = 0.05;
const PERMUTATIONS = 4999;
const MIN_REPORT_GROUP_SIZE = 5;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sampleVariance(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
}

function round(value, places = 4) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rankValues(values) {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  const tieCounts = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const rank = ((start + 1) + end) / 2;
    for (let i = start; i < end; i += 1) ranks[ordered[i].index] = rank;
    if (end - start > 1) tieCounts.push(end - start);
    start = end;
  }
  return { ranks, tieCounts };
}

function normalityCheck(values) {
  if (values.length < 8) {
    return { checked: false, passed: false, sampleSize: values.length, reason: 'At least 8 observations are needed for the Jarque–Bera diagnostic.' };
  }
  const center = mean(values);
  const second = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
  if (second === 0) {
    return { checked: true, passed: false, sampleSize: values.length, statistic: null, pValue: 0, reason: 'All values are identical.' };
  }
  const third = values.reduce((sum, value) => sum + (value - center) ** 3, 0) / values.length;
  const fourth = values.reduce((sum, value) => sum + (value - center) ** 4, 0) / values.length;
  const skewness = third / second ** 1.5;
  const excessKurtosis = fourth / second ** 2 - 3;
  const statistic = values.length / 6 * (skewness ** 2 + excessKurtosis ** 2 / 4);
  const pValue = Math.max(0, 1 - jStat.chisquare.cdf(statistic, 2));
  return {
    checked: true,
    passed: pValue >= ALPHA,
    sampleSize: values.length,
    statistic: round(statistic),
    pValue: round(pValue),
    method: 'Jarque–Bera',
  };
}

function oneWayAnova(groups) {
  const all = groups.flatMap((group) => group.values);
  const total = all.length;
  const grandMean = mean(all);
  const between = groups.reduce((sum, group) => sum + group.values.length * (mean(group.values) - grandMean) ** 2, 0);
  const within = groups.reduce((sum, group) => {
    const groupMean = mean(group.values);
    return sum + group.values.reduce((inner, value) => inner + (value - groupMean) ** 2, 0);
  }, 0);
  const dfBetween = groups.length - 1;
  const dfWithin = total - groups.length;
  const msBetween = between / dfBetween;
  const msWithin = within / dfWithin;
  const statistic = msWithin === 0 ? (msBetween === 0 ? 0 : Infinity) : msBetween / msWithin;
  const pValue = Number.isFinite(statistic) ? Math.max(0, 1 - jStat.centralF.cdf(statistic, dfBetween, dfWithin)) : 0;
  return { statistic, pValue, dfBetween, dfWithin, meanSquareWithin: msWithin, between, within };
}

function leveneCheck(groups) {
  const deviations = groups.map((group) => ({
    label: group.label,
    values: group.values.map((value) => Math.abs(value - median(group.values))),
  }));
  const result = oneWayAnova(deviations);
  return {
    checked: true,
    passed: result.pValue >= ALPHA,
    statistic: round(result.statistic),
    pValue: round(result.pValue),
    method: 'Median-centered Levene test',
  };
}

function createRandom(seedText) {
  let state = 2166136261;
  for (const char of seedText) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function bootstrapEffectSize(groups, effectName) {
  const iterations = 1999;
  const seed = `${effectName}|${groups.map((group) => `${group.label}:${group.values.join(',')}`).join('|')}`;
  const random = createRandom(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = groups.map((group) => ({
      label: group.label,
      values: Array.from({ length: group.values.length }, () => group.values[Math.floor(random() * group.values.length)]),
    }));
    let estimate;
    if (effectName === "Cohen's d" && sampled.length === 2) {
      const [first, second] = sampled;
      const degreesFreedom = first.values.length + second.values.length - 2;
      const pooled = ((first.values.length - 1) * sampleVariance(first.values) + (second.values.length - 1) * sampleVariance(second.values)) / degreesFreedom;
      estimate = pooled > 0 ? (mean(first.values) - mean(second.values)) / Math.sqrt(pooled) : null;
    } else if (effectName === 'Rank-biserial correlation' && sampled.length === 2) {
      const result = mannWhitneyStatistic(sampled);
      estimate = (2 * result.u1) / (result.n1 * result.n2) - 1;
    } else if (effectName === 'Eta squared') {
      const result = oneWayAnova(sampled);
      const total = result.between + result.within;
      estimate = total > 0 ? result.between / total : null;
    } else if (effectName === 'Epsilon squared') {
      const totalN = sampled.reduce((sum, group) => sum + group.values.length, 0);
      const statistic = kruskalStatistic(sampled);
      estimate = totalN > sampled.length ? Math.max(0, (statistic - sampled.length + 1) / (totalN - sampled.length)) : null;
    }
    if (Number.isFinite(estimate)) estimates.push(estimate);
  }
  if (estimates.length < iterations * 0.8) return null;
  estimates.sort((a, b) => a - b);
  const quantile = (probability) => {
    const position = (estimates.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return estimates[lower] + (estimates[upper] - estimates[lower]) * (position - lower);
  };
  return {
    lower: round(quantile(0.025)),
    upper: round(quantile(0.975)),
    method: `Deterministic percentile bootstrap (${estimates.length} resamples)`,
  };
}

function permutationPValue(groups, observed, statisticForGroups) {
  const records = groups.flatMap((group, groupIndex) => group.values.map((value) => ({ value, groupIndex })));
  const sizes = groups.map((group) => group.values.length);
  const seed = records.map((record) => `${record.value}:${record.groupIndex}`).join('|');
  const random = createRandom(seed);
  let extreme = 0;
  for (let iteration = 0; iteration < PERMUTATIONS; iteration += 1) {
    const shuffled = records.map((record) => record.value);
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    let offset = 0;
    const permuted = sizes.map((size) => {
      const values = shuffled.slice(offset, offset + size);
      offset += size;
      return { values };
    });
    const statistic = statisticForGroups(permuted);
    if (statistic >= observed - 1e-12) extreme += 1;
  }
  return (extreme + 1) / (PERMUTATIONS + 1);
}

function mannWhitneyStatistic(groups) {
  const values = groups.flatMap((group) => group.values);
  const { ranks, tieCounts } = rankValues(values);
  const n1 = groups[0].values.length;
  const n2 = groups[1].values.length;
  const rankSum1 = ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0);
  const u1 = rankSum1 - n1 * (n1 + 1) / 2;
  const u2 = n1 * n2 - u1;
  const tieAdjustment = tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0);
  return { statistic: Math.min(u1, u2), u1, n1, n2, tieAdjustment };
}

function mannWhitney(groups) {
  const { statistic, u1, n1, n2, tieAdjustment } = mannWhitneyStatistic(groups);
  const n = n1 + n2;
  const variance = n1 * n2 / 12 * ((n + 1) - tieAdjustment / (n * (n - 1)));
  const meanU = n1 * n2 / 2;
  const pValue = n < 30
    ? permutationPValue(groups, statistic, (permuted) => mannWhitneyStatistic(permuted).statistic)
    : variance <= 0
      ? 1
      : Math.min(1, 2 * jStat.normal.cdf(-Math.max(0, Math.abs(Math.abs(u1 - meanU) - 0.5)) / Math.sqrt(variance), 0, 1));
  const rankBiserial = n1 * n2 ? (2 * u1) / (n1 * n2) - 1 : 0;
  return {
    statistic,
    pValue,
    effectSize: { name: 'Rank-biserial correlation', value: round(rankBiserial) },
    method: n < 30 ? 'Mann–Whitney U (deterministic permutation p-value)' : 'Mann–Whitney U (tie-corrected, asymptotic p-value)',
  };
}

function kruskalStatistic(groups) {
  const values = groups.flatMap((group) => group.values);
  const { ranks, tieCounts } = rankValues(values);
  let offset = 0;
  const rankSums = groups.map((group) => {
    const sum = ranks.slice(offset, offset + group.values.length).reduce((total, rank) => total + rank, 0);
    offset += group.values.length;
    return sum;
  });
  const n = values.length;
  const rawH = 12 / (n * (n + 1)) * rankSums.reduce((sum, rankSum, index) => sum + rankSum ** 2 / groups[index].values.length, 0) - 3 * (n + 1);
  const tieCorrection = 1 - tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0) / (n ** 3 - n);
  return tieCorrection > 0 ? rawH / tieCorrection : 0;
}

function kruskalWallis(groups) {
  const n = groups.reduce((sum, group) => sum + group.values.length, 0);
  const statistic = kruskalStatistic(groups);
  const degreesFreedom = groups.length - 1;
  const pValue = n < 30
    ? permutationPValue(groups, statistic, kruskalStatistic)
    : Math.max(0, 1 - jStat.chisquare.cdf(statistic, degreesFreedom));
  return {
    statistic,
    pValue,
    degreesFreedom,
    method: n < 30
      ? 'Kruskal–Wallis H (deterministic permutation p-value)'
      : 'Kruskal–Wallis H (tie-corrected, asymptotic p-value)',
  };
}

function pooledTTest(groups) {
  const [first, second] = groups;
  const n1 = first.values.length;
  const n2 = second.values.length;
  const variance1 = sampleVariance(first.values);
  const variance2 = sampleVariance(second.values);
  const degreesFreedom = n1 + n2 - 2;
  const pooledVariance = ((n1 - 1) * variance1 + (n2 - 1) * variance2) / degreesFreedom;
  const standardError = Math.sqrt(pooledVariance * (1 / n1 + 1 / n2));
  const difference = mean(first.values) - mean(second.values);
  const statistic = standardError === 0 ? (difference === 0 ? 0 : Math.sign(difference) * Infinity) : difference / standardError;
  const pValue = Number.isFinite(statistic)
    ? Math.min(1, 2 * (1 - jStat.studentt.cdf(Math.abs(statistic), degreesFreedom)))
    : 0;
  const criticalValue = jStat.studentt.inv(0.975, degreesFreedom);
  const differenceSD = Math.sqrt(pooledVariance);
  return {
    statistic, pValue, degreesFreedom,
    effectSize: { name: "Cohen's d", value: round(differenceSD ? difference / differenceSD : 0) },
    confidenceInterval95: { lower: round(difference - criticalValue * standardError), upper: round(difference + criticalValue * standardError) },
    meanDifference: round(difference),
    method: "Independent samples t-test",
  };
}

function tukeyPostHoc(groups, anova) {
  return groups.flatMap((group, index) => groups.slice(index + 1).map((other) => {
    const standardError = Math.sqrt(anova.meanSquareWithin / 2 * (1 / group.values.length + 1 / other.values.length));
    const q = standardError === 0
      ? (mean(group.values) === mean(other.values) ? 0 : Infinity)
      : Math.abs(mean(group.values) - mean(other.values)) / standardError;
    const pValue = Number.isFinite(q)
      ? Math.max(0, Math.min(1, 1 - jStat.tukey.cdf(q, groups.length, anova.dfWithin)))
      : 0;
    return {
      groupA: group.label,
      groupB: other.label,
      meanDifference: round(mean(group.values) - mean(other.values)),
      statistic: round(q),
      pValue: round(pValue),
      significant: pValue < ALPHA,
    };
  }));
}

function compareGroups(variable, label, inputGroups) {
  const validGroups = inputGroups.filter((group) => group.values.length >= MIN_REPORT_GROUP_SIZE);
  const groupSummary = validGroups.map((group) => ({
    label: group.label,
    sampleSize: group.values.length,
    mean: round(mean(group.values)),
    standardDeviation: group.values.length > 1 ? round(Math.sqrt(sampleVariance(group.values))) : null,
    confidenceInterval95: group.values.length > 1 ? (() => {
      const standardError = Math.sqrt(sampleVariance(group.values) / group.values.length);
      const criticalValue = jStat.studentt.inv(0.975, group.values.length - 1);
      return { lower: round(mean(group.values) - criticalValue * standardError), upper: round(mean(group.values) + criticalValue * standardError) };
    })() : null,
  }));

  const empty = {
    variable,
    label,
    alpha: ALPHA,
    groups: groupSummary,
    suppressedSmallGroups: inputGroups.some((group) => group.values.length < MIN_REPORT_GROUP_SIZE),
    minimumGroupSize: MIN_REPORT_GROUP_SIZE,
    postHoc: [],
  };
  if (validGroups.length < 2) {
    return { ...empty, method: 'Not computed', statistic: null, degreesFreedom: null, pValue: null, decision: `Insufficient data: at least two groups with ${MIN_REPORT_GROUP_SIZE} completed responses each are required.` };
  }

  const normality = validGroups.map((group) => ({ group: group.label, ...normalityCheck(group.values) }));
  const variance = leveneCheck(validGroups);
  const assumptionsPassed = normality.every((check) => check.checked && check.passed) && variance.passed;
  let result;
  let postHoc = [];
  if (validGroups.length === 2) {
    result = assumptionsPassed ? pooledTTest(validGroups) : mannWhitney(validGroups);
  } else if (assumptionsPassed) {
    const anova = oneWayAnova(validGroups);
    result = {
      statistic: anova.statistic,
      pValue: anova.pValue,
      degreesFreedom: `${anova.dfBetween}, ${anova.dfWithin}`,
      effectSize: { name: 'Eta squared', value: round(anova.between + anova.within ? anova.between / (anova.between + anova.within) : 0) },
      method: 'One-way ANOVA',
    };
    if (anova.pValue < ALPHA) postHoc = tukeyPostHoc(validGroups, anova);
  } else {
    result = kruskalWallis(validGroups);
    const totalN = validGroups.reduce((sum, group) => sum + group.values.length, 0);
    result.effectSize = {
      name: 'Epsilon squared',
      value: round(totalN > validGroups.length ? Math.max(0, (result.statistic - validGroups.length + 1) / (totalN - validGroups.length)) : 0),
    };
  }

  return {
    ...empty,
    method: result.method,
    statistic: round(result.statistic),
    degreesFreedom: result.degreesFreedom,
    pValue: round(result.pValue),
      meanDifference: result.meanDifference,
      effectSize: result.effectSize || null,
      effectSizeConfidenceInterval95: result.effectSize ? bootstrapEffectSize(validGroups, result.effectSize.name) : null,
      confidenceInterval95: result.confidenceInterval95 || null,
    decision: result.pValue < ALPHA ? 'Reject H₀ (unadjusted)' : 'Fail to reject H₀ (unadjusted)',
    normality,
    equalVariance: variance,
    postHoc,
    interpretation: result.pValue < ALPHA
      ? 'Evidence of a difference was found among the compared profile groups.'
      : 'The analysis did not find sufficient evidence of a difference among the compared profile groups.',
  };
}

function buildInferentialComparisons(records) {
  const groupDefinitions = [
    { key: 'sex', label: 'Sex' },
    { key: 'age_group', label: 'Age group' },
    { key: 'municipality_group', label: 'Municipality group' },
    { key: 'junior_school_type', label: 'Junior high school type' },
    { key: 'senior_school_type', label: 'Senior high school type' },
    { key: 'income_group', label: 'Monthly family income' },
    { key: 'home_pc_internet', label: 'Home computer and internet access' },
    { key: 'home_internet', label: 'Internet access at home' },
  ];
  const results = groupDefinitions.map(({ key, label }) => {
    const grouped = new Map();
    for (const row of records) {
      const category = row[key] || 'Not specified';
      if (category === 'Not specified') continue;
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(row.overall_mean);
    }
    const groups = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupLabel, values]) => ({ label: groupLabel, values }));
    return compareGroups(key, label, groups);
  });
  const ranked = results.map((comparison, index) => ({ index, p: comparison.pValue }))
    .filter((item) => Number.isFinite(item.p))
    .sort((a, b) => a.p - b.p);
  let adjusted = 1;
  for (let rank = ranked.length; rank >= 1; rank -= 1) {
    const item = ranked[rank - 1];
    adjusted = Math.min(adjusted, item.p * ranked.length / rank);
    results[item.index] = {
      ...results[item.index],
      pValueAdjusted: round(Math.min(1, adjusted)),
      decisionAdjusted: adjusted < ALPHA ? 'Reject H₀ after FDR adjustment' : 'Fail to reject H₀ after FDR adjustment',
    };
  }
  return results;
}

module.exports = { ALPHA, buildInferentialComparisons };
