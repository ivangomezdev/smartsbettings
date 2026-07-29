import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";

const benefits = [
  {
    number: "01",
    title: "Oportunidades filtradas",
    description:
      "Prioriza señales relevantes por deporte, mercado y margen estimado.",
  },
  {
    number: "02",
    title: "Lectura inmediata",
    description:
      "Cuotas, casas y distribución sugerida en una sola vista accionable.",
  },
  {
    number: "03",
    title: "Historial transparente",
    description:
      "Consulta resultados y contexto para evaluar cada decisión con criterio.",
  },
];

export function Platform() {
  return (
    <section className="platform u-section" id="plataforma">
      <div className="platform__inner u-container">
        <SectionHeading
          eyebrow="La plataforma"
          title="Todo lo importante. Nada de ruido."
          description="Una interfaz diseñada para identificar rápido qué está pasando, por qué importa y cuál es el siguiente paso."
        />
        <div className="platform__layout">
          <div className="platform__dashboard" aria-label="Vista conceptual de la plataforma">
            <div className="platform__sidebar" aria-hidden="true">
              <span className="platform__mini-logo">∞</span>
              <span className="platform__side-dot platform__side-dot--active" />
              <span className="platform__side-dot" />
              <span className="platform__side-dot" />
              <span className="platform__side-dot" />
            </div>
            <div className="platform__screen">
              <div className="platform__topbar">
                <div>
                  <span className="platform__screen-label">Centro de control</span>
                  <strong className="platform__screen-title">Arbitrajes</strong>
                </div>
                <span className="platform__online">● En línea</span>
              </div>
              <div className="platform__metrics">
                <div className="platform__metric">
                  <span className="platform__metric-label">Detectadas hoy</span>
                  <strong className="platform__metric-value">26</strong>
                </div>
                <div className="platform__metric">
                  <span className="platform__metric-label">Margen promedio</span>
                  <strong className="platform__metric-value">3.7%</strong>
                </div>
                <div className="platform__metric">
                  <span className="platform__metric-label">Mercados activos</span>
                  <strong className="platform__metric-value">12</strong>
                </div>
              </div>
              <div className="platform__table">
                <div className="platform__table-head">
                  <span>Evento</span>
                  <span>Mercado</span>
                  <span>Margen</span>
                </div>
                <div className="platform__table-row">
                  <span>Barcelona / Milán</span>
                  <span>Ganador</span>
                  <strong className="platform__table-value">4.8%</strong>
                </div>
                <div className="platform__table-row">
                  <span>Boston / Miami</span>
                  <span>Moneyline</span>
                  <strong className="platform__table-value">3.5%</strong>
                </div>
                <div className="platform__table-row">
                  <span>París / Roma</span>
                  <span>Set 1</span>
                  <strong className="platform__table-value">2.9%</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="platform__benefits">
            {benefits.map((benefit) => (
              <article className="platform__benefit" key={benefit.number}>
                <span className="platform__benefit-number">{benefit.number}</span>
                <div>
                  <h3 className="platform__benefit-title">{benefit.title}</h3>
                  <p className="platform__benefit-copy">{benefit.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
