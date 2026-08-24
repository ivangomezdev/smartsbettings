function factor(code, description, value) {
  return { code, description, value };
}

function combinedFrequency(model, key) {
  const home = model.metrics?.recent?.home?.frequencies?.[key];
  const away = model.metrics?.recent?.away?.frequencies?.[key];
  return Number.isFinite(home) && Number.isFinite(away) ? (home + away) / 2 : null;
}

export function generateDeterministicFactors({ market, model }) {
  const positiveFactors = [];
  const negativeFactors = [];
  const expectedTotal = model.expectedGoals.home + model.expectedGoals.away;
  const marketCode = market.code || market;

  if (marketCode.startsWith("over_")) {
    const frequency = combinedFrequency(model, marketCode);
    if (frequency !== null && frequency >= 0.60) {
      positiveFactors.push(factor("HIGH_RECENT_OVER_FREQUENCY", "La frecuencia reciente del mercado supera 60% en la muestra combinada.", frequency));
    } else if (frequency !== null && frequency <= 0.40) {
      negativeFactors.push(factor("LOW_RECENT_OVER_FREQUENCY", "La frecuencia reciente del mercado no supera 40% en la muestra combinada.", frequency));
    }
    if (expectedTotal >= 2.5) positiveFactors.push(factor("HIGH_EXPECTED_GOAL_TOTAL", "El total de goles esperados del modelo es elevado.", expectedTotal));
    if (expectedTotal < 1.8) negativeFactors.push(factor("LOW_EXPECTED_GOAL_TOTAL", "El total de goles esperados del modelo es reducido.", expectedTotal));
  } else if (marketCode.startsWith("under_")) {
    const overCode = marketCode.replace("under", "over");
    const frequency = combinedFrequency(model, overCode);
    if (frequency !== null && frequency <= 0.40) positiveFactors.push(factor("LOW_RECENT_OVER_FREQUENCY", "La frecuencia reciente de superar la línea es reducida.", frequency));
    if (frequency !== null && frequency >= 0.60) negativeFactors.push(factor("HIGH_RECENT_OVER_FREQUENCY", "La frecuencia reciente de superar la línea es elevada.", frequency));
    if (expectedTotal < 2) positiveFactors.push(factor("LOW_EXPECTED_GOAL_TOTAL", "El total de goles esperados favorece un marcador bajo.", expectedTotal));
    if (expectedTotal >= 3) negativeFactors.push(factor("HIGH_EXPECTED_GOAL_TOTAL", "El total de goles esperados es elevado para un mercado Under.", expectedTotal));
  } else if (marketCode === "btts") {
    const frequency = combinedFrequency(model, "btts");
    if (frequency !== null && frequency >= 0.60) positiveFactors.push(factor("HIGH_RECENT_BTTS_FREQUENCY", "Ambos equipos marcaron con frecuencia elevada en sus muestras recientes.", frequency));
    if (frequency !== null && frequency <= 0.40) negativeFactors.push(factor("LOW_RECENT_BTTS_FREQUENCY", "La frecuencia reciente de ambos equipos marcando es reducida.", frequency));
    if (model.expectedGoals.home < 0.8 || model.expectedGoals.away < 0.8) {
      negativeFactors.push(factor("LOW_TEAM_EXPECTED_GOALS", "Uno de los equipos tiene una expectativa de gol reducida.", Math.min(model.expectedGoals.home, model.expectedGoals.away)));
    }
  } else if (marketCode === "one_x_two") {
    const difference = model.expectedGoals.home - model.expectedGoals.away;
    if (difference >= 0.5) positiveFactors.push(factor("HOME_EXPECTED_GOALS_ADVANTAGE", "El local presenta una ventaja clara en goles esperados.", difference));
    else if (difference <= -0.5) positiveFactors.push(factor("AWAY_EXPECTED_GOALS_ADVANTAGE", "El visitante presenta una ventaja clara en goles esperados.", Math.abs(difference)));
    else negativeFactors.push(factor("BALANCED_EXPECTED_GOALS", "Las expectativas de gol son cercanas y aumentan la incertidumbre del 1X2.", Math.abs(difference)));
  }

  if (model.sources?.h2h && Number.isFinite(model.metrics?.h2h?.averageTotalGoals)) {
    const h2hTotal = model.metrics.h2h.averageTotalGoals;
    if (marketCode.startsWith("over_") && h2hTotal >= 2.5) positiveFactors.push(factor("H2H_GOAL_CONTEXT", "El H2H válido presenta un promedio de goles elevado.", h2hTotal));
    if (marketCode.startsWith("under_") && h2hTotal >= 2.5) negativeFactors.push(factor("H2H_GOAL_CONTEXT", "El H2H válido presenta un promedio de goles elevado para un Under.", h2hTotal));
  }

  return { positiveFactors, negativeFactors };
}

export function deterministicConclusion({ market, selections, confidence, positiveFactors, negativeFactors }) {
  const marketCode = market.code || market;
  const strongest = [...selections].sort((left, right) => right.probability - left.probability)[0];
  const assessment = strongest.probability >= 0.60
    ? `El modelo favorece ${strongest.label}`
    : `El modelo no muestra una ventaja probabilística amplia para ${strongest.label}`;
  const factorText = positiveFactors[0]
    ? ` El principal respaldo calculado es: ${positiveFactors[0].description.toLowerCase()}`
    : negativeFactors[0]
      ? ` El principal riesgo calculado es: ${negativeFactors[0].description.toLowerCase()}`
      : "";
  const confidenceText = confidence.reasons.find((reason) => /Sin |insuficiente|faltantes|dispersión/.test(reason));
  return `${assessment} en el mercado ${marketCode}.${factorText} La confianza es ${confidence.level}${confidenceText ? ` porque ${confidenceText.toLowerCase()}` : "."}`.replace(/\.\./g, ".");
}
