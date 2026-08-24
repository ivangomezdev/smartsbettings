function dateValue(record) {
  return Date.parse(record.match.matchDate);
}

export function assignTemporalSplits(records, config = {}) {
  const ordered = [...records].sort((left, right) => dateValue(left) - dateValue(right));
  if (!ordered.length) return [];
  const explicitSeasons = [config.trainSeasons, config.validationSeasons, config.testSeasons].some((value) => value?.length);
  if (explicitSeasons) {
    const groups = {
      train: new Set(config.trainSeasons || []),
      validation: new Set(config.validationSeasons || []),
      test: new Set(config.testSeasons || []),
    };
    return ordered.map((record) => {
      const split = Object.entries(groups).find(([, seasons]) => seasons.has(record.match.season))?.[0] || "excluded";
      return { ...record, split };
    });
  }
  if (config.trainThrough || config.validationThrough) {
    const trainThrough = config.trainThrough ? Date.parse(`${config.trainThrough}T23:59:59.999Z`) : -Infinity;
    const validationThrough = config.validationThrough ? Date.parse(`${config.validationThrough}T23:59:59.999Z`) : trainThrough;
    return ordered.map((record) => ({
      ...record,
      split: dateValue(record) <= trainThrough ? "train" : dateValue(record) <= validationThrough ? "validation" : "test",
    }));
  }
  const dates = [...new Set(ordered.map((record) => dateValue(record)))];
  const trainBoundary = dates[Math.max(0, Math.ceil(dates.length * 0.6) - 1)];
  const validationBoundary = dates[Math.max(0, Math.ceil(dates.length * 0.8) - 1)];
  return ordered.map((record) => ({
    ...record,
    split: dateValue(record) <= trainBoundary ? "train" : dateValue(record) <= validationBoundary ? "validation" : "test",
  }));
}
