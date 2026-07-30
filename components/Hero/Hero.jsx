import { Button } from "../Button/Button.jsx";
import { WinnersCarousel } from "../WinnersCarousel/WinnersCarousel.jsx";
import { HeroBackgroundVideo } from "./HeroBackgroundVideo.jsx";

const heroStats = [
  { value: "24/7", label: "Monitoreo" },
  { value: "+18", label: "Deportes" },
  { value: "USDT", label: "Pagos simples" },
];

const topWinners = [
  {
    rank: 1,
    user: "@nova_27",
    detail: "Arbitraje · Fútbol",
    amount: "+9,840 USDT",
  },
  {
    rank: 2,
    user: "@atlas_mx",
    detail: "Predicción · NBA",
    amount: "+9,320 USDT",
  },
  {
    rank: 3,
    user: "@safira_r",
    detail: "Arbitraje · Tenis",
    amount: "+8,760 USDT",
  },
  {
    rank: 4,
    user: "@delta_x8",
    detail: "Predicción · Fútbol",
    amount: "+7,950 USDT",
  },
  {
    rank: 5,
    user: "@orion_55",
    detail: "Arbitraje · MLB",
    amount: "+6,880 USDT",
  },
  {
    rank: 6,
    user: "@zenit_bet",
    detail: "Predicción · Tenis",
    amount: "+5,740 USDT",
  },
  {
    rank: 7,
    user: "@luna_edge",
    detail: "Arbitraje · NFL",
    amount: "+4,630 USDT",
  },
  {
    rank: 8,
    user: "@vector_11",
    detail: "Predicción · NBA",
    amount: "+3,480 USDT",
  },
  {
    rank: 9,
    user: "@nexo_win",
    detail: "Arbitraje · Fútbol",
    amount: "+2,250 USDT",
  },
  {
    rank: 10,
    user: "@aurea_9",
    detail: "Predicción · UFC",
    amount: "+890 USDT",
  },
];

export function Hero() {
  return (
    <section className="hero" id="inicio">
      <HeroBackgroundVideo />
      <div className="hero__media" aria-hidden="true">
        <div className="hero__background-watermark" />
      </div>
      <div className="hero__ambient" aria-hidden="true" />
      <div className="hero__grid u-container">
        <div className="hero__content">
          <p className="hero__private-label">
            Inteligencia privada{" "}
            <span className="hero__private-divider" aria-hidden="true">◆</span>{" "}
            Liquidación en cripto
          </p>
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

        <div className="hero__visual" aria-label="Vista previa de ganancias de usuarios ficticios">
          <div className="hero__terminal">
            <div className="hero__terminal-bar">
              <div>
                <p className="hero__terminal-kicker">SmartBetting Private Desk</p>
                <p className="hero__terminal-title">TOP 10 WINNERS</p>
              </div>
              <span className="hero__live">
                <span className="hero__live-dot" aria-hidden="true" />
                LIVE
              </span>
            </div>
            <WinnersCarousel winners={topWinners} />
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
