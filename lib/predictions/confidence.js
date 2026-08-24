function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sourceDisagreement(sources) {
  const available = Object.values(sources || {}).filter(Boolean);
  if (available.length < 2) return false;
  const home = available.map((source) => source.lambdaHome).filter(Number.isFinite);
  const away = available.map((source) => source.lambdaAway).filter(Number.isFinite);
  return Math.max(...home) - Math.min(...home) > 1.5 || Math.max(...away) - Math.min(...away) > 1.5;
}

export function assessConfidence(model, snapshot) {
  const reasons = [];
  const homeSample = model.metrics?.recent?.home?.sampleSize || 0;
  const awaySample = model.metrics?.recent?.away?.sampleSize || 0;
  const recentMinimum = Math.min(homeSample, awaySample);
  let score = Math.min(recentMinimum / 10, 1) * 0.40;
  reasons.push(`${recentMinimum} partidos recientes válidos por equipo como muestra mínima.`);

  if (model.sources?.season) {
    score += 0.20;
    reasons.push("Estadísticas de temporada local/visitante disponibles.");
  } else {
    reasons.push("Sin estadísticas de temporada utilizables.");
  }

  const venueReady = model.metrics?.recent?.home?.usedVenueSplit && model.metrics?.recent?.away?.usedVenueSplit;
  if (venueReady) {
    score += 0.10;
    reasons.push("Muestras específicas de local y visitante disponibles.");
  } else {
    reasons.push("La muestra local/visitante fue insuficiente y se utilizó la forma general.");
  }

  if (model.sources?.xg) {
    score += 0.15;
    reasons.push("xG y xGA tienen una muestra válida.");
  } else {
    reasons.push("xG/xGA ausente o con menos de tres observaciones por equipo.");
  }

  if (model.sources?.h2h) {
    score += 0.05;
    reasons.push("H2H disponible con al menos tres encuentros.");
  } else {
    reasons.push("H2H insuficiente; no se incorporó al modelo.");
  }

  const relevantMissing = new Set((snapshot.missingData || []).map((item) => item.section)).size;
  const completeness = 1 - Math.min(relevantMissing / 8, 1);
  score += completeness * 0.10;
  if (relevantMissing) reasons.push(`${relevantMissing} secciones del snapshot contienen datos faltantes.`);
  else reasons.push("El snapshot no reporta secciones faltantes.");

  if (sourceDisagreement(model.sources)) {
    score -= 0.05;
    reasons.push("Las fuentes de goles esperados muestran dispersión elevada.");
  }

  score = clamp(score);
  return {
    level: score >= 0.75 ? "high" : score >= 0.50 ? "medium" : "low",
    score,
    reasons,
  };
}

export function assessCountConfidence(model, snapshot) {
  const reasons = [];
  const homeSample = Number(model.metrics?.recent?.home?.sampleSize || 0);
  const awaySample = Number(model.metrics?.recent?.away?.sampleSize || 0);
  const minimum = Math.min(homeSample, awaySample);
  let score = Math.min(minimum / 6, 1) * 0.55;
  reasons.push(`${minimum} partidos con ${model.statistic} por equipo como muestra mínima.`);

  if (model.sources?.historicalPrior) {
    score += 0.15;
    reasons.push(`Prior histórico de ${model.sources.historicalPrior.sampleSize} partidos disponible.`);
  }
  const missingStatistics = (snapshot.missingData || []).some((item) => item.section === "matchStatistics");
  if (missingStatistics) reasons.push("La muestra de estadísticas recientes es parcial.");
  else score += 0.1;

  const variances = [model.metrics?.recent?.home?.variance, model.metrics?.recent?.away?.variance].filter(Number.isFinite);
  const means = [model.metrics?.recent?.home?.average, model.metrics?.recent?.away?.average].filter(Number.isFinite);
  if (variances.length && means.length && Math.max(...variances) > Math.max(...means) * 2) {
    score -= 0.1;
    reasons.push("La muestra presenta sobredispersión elevada respecto a Poisson.");
  }

  score = clamp(Math.min(score, 0.7));
  return { level: score >= 0.5 ? "medium" : "low", score, reasons };
}
