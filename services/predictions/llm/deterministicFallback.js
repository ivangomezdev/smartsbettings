function factor(item, index) {
  if (typeof item === "string") return { title: `Factor ${index + 1}`, description: item };
  return { title: item?.title || item?.type || `Factor ${index + 1}`, description: item?.description || item?.message || "Dato considerado por el modelo." };
}

function teamForm(team, label) {
  const summary = team?.summary;
  if (!summary?.played) return `No hay una muestra reciente suficiente para ${label}.`;
  return `${label}: ${summary.wins}-${summary.draws}-${summary.losses} en ${summary.played} partidos, con ${summary.goalsFor} goles a favor y ${summary.goalsAgainst} en contra.`;
}

export function buildDeterministicExplanation({ context, language = "es" } = {}) {
  const english = language === "en";
  const positive = (context.positiveFactors || []).slice(0, 6).map(factor);
  const negative = (context.negativeFactors || []).slice(0, 6).map(factor);
  const missing = context.missingData || [];
  return {
    summary: {
      headline: english ? "Statistical match assessment" : "Evaluación estadística del partido",
      conclusion: context.conclusion || (english ? "The available data supports a cautious statistical reading." : "Los datos disponibles permiten una lectura estadística prudente."),
      mainReason: positive[0]?.description || (english ? "No dominant positive factor is available." : "No hay un factor favorable dominante disponible."),
      mainRisk: negative[0]?.description || (english ? "Incomplete data is the main limitation." : "La disponibilidad incompleta de datos es el principal riesgo."),
    },
    positiveFactors: positive,
    negativeFactors: negative,
    recentFormCommentary: {
      home: teamForm(context.lastSix?.home, english ? "Home team" : "Local"),
      away: teamForm(context.lastSix?.away, english ? "Away team" : "Visitante"),
    },
    homeAwayCommentary: context.homeAwayStats ? (english ? "Home and away splits are included in the structured section." : "Los cortes de local y visitante están incluidos en la sección estructurada.") : (english ? "Home/away splits are unavailable." : "No hay cortes de local/visitante disponibles."),
    statsCommentary: context.statsSummary ? (english ? "Available statistics retain their real sample size." : "Las estadísticas disponibles conservan el tamaño real de su muestra.") : (english ? "Detailed statistics are unavailable." : "No hay estadísticas detalladas disponibles."),
    h2hCommentary: context.h2h?.length ? (english ? "Recent head-to-head matches are shown with limited model weight." : "Se muestran los H2H recientes, con peso limitado dentro del modelo.") : (english ? "No recent head-to-head sample is available." : "No hay una muestra H2H reciente disponible."),
    injuriesCommentary: context.injuries?.length || context.suspensions?.length ? (english ? "Availability evidence is listed as context and does not alter the model mathematically." : "La disponibilidad se muestra como contexto y no altera matemáticamente el modelo.") : (english ? "Reliable availability information was not found." : "No se encontró información fiable de bajas."),
    lineupCommentary: context.lineups?.length ? (english ? "Available lineup status is shown without upgrading probable information to confirmed." : "Se muestra el estado disponible sin convertir alineaciones probables en confirmadas.") : (english ? "No lineup is confirmed yet." : "Todavía no hay alineación confirmada."),
    newsCommentary: context.news?.length ? (english ? "Recent sourced team context is available below." : "Hay contexto reciente del equipo con fuentes en la sección correspondiente.") : (english ? "No relevant recent news was available." : "No hubo noticias recientes relevantes disponibles."),
    missingDataCommentary: missing.length ? `${english ? "Missing information" : "Información no disponible"}: ${missing.join(", ")}.` : (english ? "No material missing-data warning was recorded." : "No se registraron carencias materiales adicionales."),
    finalAssessment: context.conclusion || (english ? "Use the estimate as a statistical reference, not a guarantee." : "Usa la estimación como referencia estadística, no como garantía."),
  };
}

