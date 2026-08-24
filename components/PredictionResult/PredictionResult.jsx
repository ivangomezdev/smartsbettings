import { FiAlertTriangle, FiBarChart2, FiCheckCircle, FiExternalLink, FiInfo, FiTrendingUp } from "react-icons/fi";

const statusLabel = { OUT: "Baja", DOUBTFUL: "Duda", QUESTIONABLE: "En evaluación", SUSPENDED: "Suspendido", AVAILABLE: "Disponible", UNKNOWN: "Sin confirmar", CONFIRMED: "Confirmada", PROBABLE: "Probable", PROJECTED: "Proyectada" };
const confidenceLabel = { high: "Alta", medium: "Media", low: "Baja" };
const marketStatusLabel = { SUPPORTED: "Respaldado por benchmark", WEAK: "Evidencia histórica débil", NOT_RECOMMENDED: "No recomendado en V1" };

function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—"; }
function decimal(value) { return Number.isFinite(value) ? value.toFixed(2) : "—"; }
function date(value) { if (!value) return "—"; return new Date(value).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); }

function Factors({ title, items, risk = false }) {
  return <section className={`prediction-result__factor-list${risk ? " is-risk" : ""}`}><h3>{risk ? <FiAlertTriangle /> : <FiCheckCircle />} {title}</h3>{items?.length ? <ul>{items.slice(0, 6).map((item, index) => <li key={item.code || item.title || index}><strong>{item.title || item.code || `Factor ${index + 1}`}</strong><span>{item.description || item.message}</span></li>)}</ul> : <p>No hay factores adicionales documentados.</p>}</section>;
}

function LastSix({ label, team }) {
  const summary = team?.summary || {};
  return <div className="prediction-result__team-form"><h4>{label}</h4><p className="prediction-result__sample">Datos disponibles: {summary.played || 0}/6 partidos</p><div className="prediction-result__table-wrap"><table><thead><tr><th>Fecha</th><th>Rival</th><th>H/A</th><th>Resultado</th></tr></thead><tbody>{(team?.matches || []).map((match, index) => <tr key={`${match.date}-${index}`}><td>{date(match.date)}</td><td>{match.opponent || "—"}</td><td>{match.homeAway === "home" ? "H" : "A"}</td><td>{match.score || "—"}</td></tr>)}</tbody></table></div><div className="prediction-result__form-summary"><span>W-D-L <strong>{summary.wins || 0}-{summary.draws || 0}-{summary.losses || 0}</strong></span><span>GF/GC <strong>{summary.goalsFor || 0}/{summary.goalsAgainst || 0}</strong></span><span>Promedio GF <strong>{decimal(summary.avgGoalsFor)}</strong></span><span>Promedio GC <strong>{decimal(summary.avgGoalsAgainst)}</strong></span><span>O0.5 <strong>{percent(summary.over05Rate)}</strong></span><span>O1.5 <strong>{percent(summary.over15Rate)}</strong></span><span>O2.5 <strong>{percent(summary.over25Rate)}</strong></span><span>BTTS <strong>{percent(summary.bttsRate)}</strong></span></div></div>;
}

function Stats({ stats }) {
  const labels = { corners: "Corners", cards: "Tarjetas", shots: "Tiros", shotsOnTarget: "Tiros a puerta", possession: "Posesión", xg: "xG", xga: "xGA" };
  const block = (team, label) => <div><h4>{label}</h4>{Object.entries(team || {}).map(([key, item]) => item?.average == null ? null : <p key={key}><span>{labels[key] || key}</span><strong>{decimal(item.average)}</strong><small>Muestra: {item.observations}/{item.requestedSample}</small></p>)}</div>;
  return <div className="prediction-result__stats-grid">{block(stats?.home, "Local")}{block(stats?.away, "Visitante")}</div>;
}

function venueStats(team, venue) {
  const fixtures = team?.fixtures || {};
  const goalsFor = team?.goals?.for?.average?.[venue];
  const goalsAgainst = team?.goals?.against?.average?.[venue];
  return [
    ["Partidos", fixtures?.played?.[venue]],
    ["Victorias", fixtures?.wins?.[venue]],
    ["Empates", fixtures?.draws?.[venue]],
    ["Derrotas", fixtures?.loses?.[venue]],
    ["Promedio GF", goalsFor],
    ["Promedio GC", goalsAgainst],
  ].filter(([, value]) => value != null);
}

function HomeAway({ stats, event }) {
  const block = (team, venue, title) => {
    const items = venueStats(team, venue);
    return <div><h4>{title}</h4>{items.length ? <div className="prediction-result__form-summary">{items.map(([label, value]) => <span key={label}>{label}<strong>{value}</strong></span>)}</div> : <p>Sin corte específico disponible.</p>}</div>;
  };
  return <div className="prediction-result__stats-grid">{block(stats?.home, "home", `${event.homeTeam?.name || "Local"} jugando en casa`)}{block(stats?.away, "away", `${event.awayTeam?.name || "Visitante"} jugando fuera`)}</div>;
}

function H2H({ matches }) {
  const rows = (matches || []).filter((item) => Number.isFinite(item.goals?.home) && Number.isFinite(item.goals?.away));
  const rate = (predicate) => rows.length ? rows.filter(predicate).length / rows.length : null;
  return <><div className="prediction-result__table-wrap"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Resultado</th></tr></thead><tbody>{rows.map((match, index) => <tr key={match.fixtureId || index}><td>{date(match.date)}</td><td>{match.homeTeam?.name} vs {match.awayTeam?.name}</td><td>{match.goals.home}-{match.goals.away}</td></tr>)}</tbody></table></div><div className="prediction-result__form-summary"><span>Muestra<strong>{rows.length}</strong></span><span>Over 1.5<strong>{percent(rate((item) => item.goals.home + item.goals.away > 1.5))}</strong></span><span>Over 2.5<strong>{percent(rate((item) => item.goals.home + item.goals.away > 2.5))}</strong></span><span>BTTS<strong>{percent(rate((item) => item.goals.home > 0 && item.goals.away > 0))}</strong></span></div></>;
}

function Availability({ analysis }) {
  const items = [...(analysis.injuries || []), ...(analysis.suspensions || [])];
  return items.length ? <div className="prediction-result__availability">{items.map((item, index) => <article key={item.id || index}><strong>{item.subject || item.player?.name || "Sin confirmar"}</strong><span>{item.team?.name || item.team || "Equipo no indicado"} · {statusLabel[item.status] || item.status || "Sin confirmar"}</span><small>{item.source?.name || item.provenance?.provider || "Fuente deportiva"} · {date(item.source?.publishedAt)}</small></article>)}</div> : <p>No hay evidencia fiable de bajas o sanciones disponible.</p>;
}

function Lineups({ lineups }) {
  return lineups?.length ? <div className="prediction-result__availability">{lineups.map((item, index) => <article key={item.id || index}><strong>{statusLabel[item.lineupStatus || item.status] || "No disponible"}</strong>{item.formation ? <span>Formación: {item.formation}</span> : null}{item.starters?.length ? <p>{item.starters.join(", ")}</p> : <span>Jugadores no detallados por la fuente.</span>}<small>{item.source?.name || item.provenance?.provider || "Fuente deportiva"}</small></article>)}</div> : <p>Alineación todavía no confirmada.</p>;
}

export function PredictionResult({ analysis }) {
  const event = analysis.event || {};
  const selections = analysis.prediction?.selections || [];
  const primary = [...selections].sort((a, b) => b.probability - a.probability)[0] || {};
  const explanation = analysis.explanation || {};
  return <article className="prediction-result">
    <header className="prediction-result__summary">
      <div><p>{event.league?.name || "FÚTBOL"}</p><h2>{event.homeTeam?.name || "Local"} <span>vs</span> {event.awayTeam?.name || "Visitante"}</h2><strong>{analysis.market?.label || analysis.market?.code}</strong></div>
      <div className="prediction-result__probability"><strong>{percent(primary.probability)}</strong><span>Probabilidad estimada</span></div>
      <div className="prediction-result__badges"><span>Confianza: {confidenceLabel[analysis.prediction?.confidence?.level] || "Baja"}</span><span>{marketStatusLabel[analysis.prediction?.marketStatus] || analysis.prediction?.marketStatus}</span></div>
    </header>
    <section className="prediction-result__conclusion"><p>CONCLUSIÓN</p><h3>{explanation.summary?.headline || "Lectura del modelo"}</h3><p>{explanation.summary?.conclusion || explanation.finalAssessment}</p><div><span><strong>Razón principal</strong>{explanation.summary?.mainReason}</span><span><strong>Riesgo principal</strong>{explanation.summary?.mainRisk}</span></div></section>
    {selections.map((selection) => <section className="prediction-result__odds" key={selection.key}><div><FiTrendingUp /><span>{selection.label}</span><strong>{percent(selection.probability)}</strong></div><span>Cuota justa <strong>{decimal(selection.fairOdds)}</strong></span><span>Mejor cuota <strong>{decimal(selection.marketOdds)}</strong>{selection.bookmaker ? <small>{selection.bookmaker}</small> : null}</span><span>Edge teórico <strong>{percent(selection.theoreticalEdge)}</strong><em>Experimental</em></span></section>)}
    {selections.some((item) => item.theoreticalEdge != null) ? <p className="prediction-result__edge-warning"><FiInfo /> El edge es experimental y nuestros backtests históricos no demuestran rentabilidad sostenida.</p> : null}
    <div className="prediction-result__factors"><Factors title="A favor" items={explanation.positiveFactors?.length ? explanation.positiveFactors : analysis.factors?.positive} /><Factors title="Riesgos" items={explanation.negativeFactors?.length ? explanation.negativeFactors : analysis.factors?.negative} risk /></div>
    <details><summary><FiBarChart2 /> Últimos 6</summary><div className="prediction-result__forms"><LastSix label={event.homeTeam?.name || "Local"} team={analysis.recentForm?.home} /><LastSix label={event.awayTeam?.name || "Visitante"} team={analysis.recentForm?.away} /></div></details>
    <details><summary>Casa / fuera</summary><p>{explanation.homeAwayCommentary}</p><HomeAway event={event} stats={analysis.homeAwayStats} /></details>
    <details><summary>Estadísticas</summary><p>{explanation.statsCommentary}</p><Stats stats={analysis.stats} /></details>
    <details><summary>H2H</summary><p>{explanation.h2hCommentary}</p><H2H matches={analysis.h2h} /><p>El H2H tiene un peso limitado dentro del modelo.</p></details>
    <details><summary>Bajas y disponibilidad</summary><p>{explanation.injuriesCommentary}</p><Availability analysis={analysis} /><small>Esta información se muestra como contexto y todavía no modifica matemáticamente la estimación.</small></details>
    <details><summary>Alineaciones</summary><p>{explanation.lineupCommentary}</p><Lineups lineups={analysis.lineups} /></details>
    <details><summary>Rotaciones y noticias</summary><p>{explanation.newsCommentary}</p><div className="prediction-result__news">{[...(analysis.rotations || []), ...(analysis.news || [])].map((item, index) => <article key={item.id || index}><p>{item.claim || item.evidenceSummary}</p><small>{item.source?.name || "Fuente web"} · {date(item.source?.publishedAt)}</small></article>)}</div></details>
    <details><summary>Información no disponible</summary><p>{explanation.missingDataCommentary}</p><ul>{(analysis.missingData || []).map((item) => <li key={item}>{String(item).replaceAll("_", " ")}</li>)}</ul></details>
    <details><summary>Fuentes</summary><h4>Datos estructurados</h4><ul><li>API deportiva / PostgreSQL cache</li><li>Base histórica del modelo</li></ul><h4>Investigación web</h4><ul>{(analysis.sources || []).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name || "Fuente"} <FiExternalLink /></a><span>{source.usedFor?.join(", ")} · {date(source.publishedAt)}</span></li>)}</ul></details>
    <details><summary>Información técnica</summary><p>Modelo: {analysis.model?.version || "—"}</p><p>Router: {analysis.model?.routerVersion || "—"}</p><p>{analysis.llm?.fallbackUsed ? `LLM_FALLBACK_USED · ${analysis.llm?.warning || "provider no disponible"}` : `Explicación: ${analysis.llm?.provider} / ${analysis.llm?.model}`}</p></details>
    <footer><span>Modelo: {analysis.model?.version}</span><span>{analysis.llm?.fallbackUsed ? "Explicación determinista" : `Explicado con ${analysis.llm?.model}`}</span></footer>
  </article>;
}
