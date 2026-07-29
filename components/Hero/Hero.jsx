import Image from "next/image";
import { shouldSkipImageOptimization } from "../../lib/image.js";
import { Button } from "../Button/Button.jsx";
import { HeroBackgroundVideo } from "./HeroBackgroundVideo.jsx";

const heroStats = [
  { value: "24/7", label: "Monitoreo" },
  { value: "+18", label: "Deportes" },
  { value: "USDT", label: "Pagos simples" },
];

const opportunities = [
  {
    sport: "Fútbol",
    event: "Madrid vs. Londres",
    market: "Resultado final",
    edge: "+4.8%",
    status: "Alta",
  },
  {
    sport: "Tenis",
    event: "Roma — Cuartos",
    market: "Ganador del partido",
    edge: "+3.2%",
    status: "Nueva",
  },
];

export function Hero() {
  return (
    <section className="hero" id="inicio">
      <div className="hero__media" aria-hidden="true">
        <HeroBackgroundVideo />
        <div className="hero__background-watermark" />
        <div className="hero__crypto-layer">
          <span>₿</span>
          <span>Ξ</span>
          <span>₮</span>
        </div>
      </div>
      <div className="hero__ambient" aria-hidden="true" />
      <div className="hero__grid u-container">
        <div className="hero__content">
          <div className="hero__status">
            <span className="hero__status-dot" aria-hidden="true" />
            Sistema de análisis activo
          </div>
          <h1 className="hero__title">
            Tu ventaja no es suerte.{" "}
            <span className="hero__title-accent">Son datos.</span>
          </h1>
          <p className="hero__lead">
            Detectamos oportunidades de arbitraje y seleccionamos predicciones
            deportivas para que decidas con información clara, a tiempo y sin
            ruido.
          </p>
          <div className="hero__actions">
            <Button href="#precios">Explorar planes</Button>
            <Button href="#plataforma" variant="secondary">
              Ver plataforma
            </Button>
          </div>
          <ul className="hero__stats" aria-label="Características principales">
            {heroStats.map((stat) => (
              <li className="hero__stat" key={stat.label}>
                <strong className="hero__stat-value">{stat.value}</strong>
                <span className="hero__stat-label">{stat.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero__visual" aria-label="Vista previa de oportunidades">
          <div className="hero__logo-halo" aria-hidden="true">
            <Image
              className="hero__brand-image"
              src="/smartbetting-logo.jpeg"
              alt=""
              width={1254}
              height={1254}
              priority
              unoptimized={shouldSkipImageOptimization}
            />
          </div>
          <div className="hero__terminal">
            <div className="hero__terminal-bar">
              <div>
                <p className="hero__terminal-kicker">SmartBetting Radar</p>
                <p className="hero__terminal-title">Oportunidades en vivo</p>
              </div>
              <span className="hero__live">
                <span className="hero__live-dot" aria-hidden="true" />
                LIVE
              </span>
            </div>
            <div className="hero__opportunities">
              {opportunities.map((opportunity) => (
                <article className="hero__opportunity" key={opportunity.event}>
                  <div className="hero__opportunity-meta">
                    <span className="hero__sport">{opportunity.sport}</span>
                    <span className="hero__tag">{opportunity.status}</span>
                  </div>
                  <h2 className="hero__event">{opportunity.event}</h2>
                  <div className="hero__market-row">
                    <span className="hero__market">{opportunity.market}</span>
                    <strong className="hero__edge">{opportunity.edge}</strong>
                  </div>
                </article>
              ))}
            </div>
            <div className="hero__terminal-footer">
              <span>Actualización automática</span>
              <span className="hero__scan">Escaneando 42 casas</span>
            </div>
          </div>
        </div>
      </div>
      <div className="hero__ticker" aria-label="Deportes disponibles">
        <div className="hero__ticker-track">
          <span className="hero__ticker-item">FÚTBOL</span>
          <span className="hero__ticker-item">NBA</span>
          <span className="hero__ticker-item">MLB</span>
          <span className="hero__ticker-item">TENIS</span>
          <span className="hero__ticker-item">NFL</span>
          <span className="hero__ticker-item">NHL</span>
          <span className="hero__ticker-item">BOXEO</span>
          <span className="hero__ticker-item">UFC</span>
          <span className="hero__ticker-item" aria-hidden="true">FÚTBOL</span>
          <span className="hero__ticker-item" aria-hidden="true">NBA</span>
          <span className="hero__ticker-item" aria-hidden="true">MLB</span>
          <span className="hero__ticker-item" aria-hidden="true">TENIS</span>
          <span className="hero__ticker-item" aria-hidden="true">NFL</span>
          <span className="hero__ticker-item" aria-hidden="true">NHL</span>
          <span className="hero__ticker-item" aria-hidden="true">BOXEO</span>
          <span className="hero__ticker-item" aria-hidden="true">UFC</span>
        </div>
      </div>
    </section>
  );
}
