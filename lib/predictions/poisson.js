const DEFAULT_MIN_GOALS = 10;
const DEFAULT_MAX_GOALS = 60;
const DEFAULT_TOLERANCE = 1e-10;

function validLambda(lambda) {
  return Number.isFinite(lambda) && lambda >= 0;
}

export function poissonPmf(lambda, goals) {
  if (!validLambda(lambda) || !Number.isInteger(goals) || goals < 0) return null;
  if (lambda === 0) return goals === 0 ? 1 : 0;
  let probability = Math.exp(-lambda);
  for (let index = 1; index <= goals; index += 1) probability *= lambda / index;
  return probability;
}

export function poissonDistribution(lambda, {
  minGoals = DEFAULT_MIN_GOALS,
  maxGoals = DEFAULT_MAX_GOALS,
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  if (!validLambda(lambda)) throw new RangeError("Lambda debe ser un número finito mayor o igual a cero.");
  const probabilities = [Math.exp(-lambda)];
  let cumulative = probabilities[0];
  let goals = 0;

  while (goals < maxGoals && (goals < minGoals || 1 - cumulative > tolerance)) {
    goals += 1;
    const next = lambda === 0 ? 0 : probabilities[goals - 1] * lambda / goals;
    probabilities.push(next);
    cumulative += next;
  }

  return {
    lambda,
    probabilities,
    cumulative,
    tail: Math.max(0, 1 - cumulative),
    maxGoals: probabilities.length - 1,
  };
}

export function buildScoreMatrix(lambdaHome, lambdaAway, options = {}) {
  const home = poissonDistribution(lambdaHome, options);
  const away = poissonDistribution(lambdaAway, options);
  const rawMass = home.cumulative * away.cumulative;
  if (!Number.isFinite(rawMass) || rawMass <= 0) throw new RangeError("La matriz Poisson no tiene masa válida.");

  const matrix = home.probabilities.map((homeProbability, homeGoals) =>
    away.probabilities.map((awayProbability, awayGoals) => ({
      homeGoals,
      awayGoals,
      probability: homeProbability * awayProbability / rawMass,
    })),
  );

  return {
    matrix,
    homeDistribution: home,
    awayDistribution: away,
    rawMass,
    omittedMass: Math.max(0, 1 - rawMass),
  };
}

export function probabilitiesFromMatrix(scoreMatrix) {
  const totals = {
    over_0_5: 0,
    over_1_5: 0,
    over_2_5: 0,
    under_1_5: 0,
    under_2_5: 0,
    btts: 0,
    home: 0,
    draw: 0,
    away: 0,
    mass: 0,
  };

  for (const row of scoreMatrix.matrix || []) {
    for (const cell of row) {
      const totalGoals = cell.homeGoals + cell.awayGoals;
      const probability = cell.probability;
      totals.mass += probability;
      if (totalGoals > 0.5) totals.over_0_5 += probability;
      if (totalGoals > 1.5) totals.over_1_5 += probability;
      if (totalGoals > 2.5) totals.over_2_5 += probability;
      if (totalGoals < 1.5) totals.under_1_5 += probability;
      if (totalGoals < 2.5) totals.under_2_5 += probability;
      if (cell.homeGoals > 0 && cell.awayGoals > 0) totals.btts += probability;
      if (cell.homeGoals > cell.awayGoals) totals.home += probability;
      else if (cell.homeGoals === cell.awayGoals) totals.draw += probability;
      else totals.away += probability;
    }
  }

  return totals;
}
