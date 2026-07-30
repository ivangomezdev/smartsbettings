import { Button } from "../Button/Button.jsx";
import { HeroBackgroundVideo } from "./HeroBackgroundVideo.jsx";

const heroStats = [
  { value: "24/7", label: "Monitoreo" },
  { value: "+18", label: "Deportes" },
  { value: "USDT", label: "Pagos simples" },
];

const userGains = [
  {
    initials: "NV",
    user: "@nova_27",
    detail: "Arbitraje · Fútbol",
    amount: "+9,480 USDT",
  },
  {
    initials: "AM",
    user: "@atlas_mx",
    detail: "Predicción · NBA",
    amount: "+7,265 USDT",
  },
  {
    initials: "SR",
    user: "@safira_r",
    detail: "Arbitraje · Tenis",
    amount: "+4,890 USDT",
  },
  {
    initials: "DX",
    user: "@delta_x8",
    detail: "Predicción · Fútbol",
    amount: "+875 USDT",
  },
];

const cryptoCoins = [
  { symbol: "₿", label: "Bitcoin", tone: "bitcoin" },
  { symbol: "Ξ", label: "Ethereum", tone: "ethereum" },
  { symbol: "₮", label: "Tether", tone: "tether" },
  { symbol: "◎", label: "Solana", tone: "solana" },
  { symbol: "BNB", label: "BNB", tone: "bnb" },
  { symbol: "$", label: "USD Coin", tone: "usdc" },
  { symbol: "XRP", label: "XRP", tone: "xrp" },
];

export function Hero() {
  return (
    <section className="hero" id="inicio">
      <HeroBackgroundVideo />
      <div className="hero__media" aria-hidden="true">
        <div className="hero__background-watermark" />
        <div className="hero__crypto-layer">
          {cryptoCoins.map((coin) => (
            <span
              className={`hero__crypto-coin hero__crypto-coin--${coin.tone}`}
              key={coin.label}
            >
              <span className="hero__crypto-symbol">{coin.symbol}</span>
            </span>
          ))}
        </div>
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
                <p className="hero__terminal-title">Ganancias recientes</p>
              </div>
              <span className="hero__live">
                <span className="hero__live-dot" aria-hidden="true" />
                LIVE
              </span>
            </div>
            <div className="hero__vault">
              <div>
                <p className="hero__vault-label">Actividad de la comunidad</p>
                <p className="hero__vault-value">Resultados en USDT</p>
              </div>
              <div className="hero__vault-coins" aria-hidden="true">
                <span className="hero__vault-coin">₿</span>
                <span className="hero__vault-coin">Ξ</span>
                <span className="hero__vault-coin">₮</span>
              </div>
            </div>
            <div className="hero__earnings">
              {userGains.map((gain) => (
                <article className="hero__earning" key={gain.user}>
                  <span className="hero__earning-avatar" aria-hidden="true">
                    {gain.initials}
                  </span>
                  <div className="hero__earning-user">
                    <h2 className="hero__earning-name">{gain.user}</h2>
                    <p className="hero__earning-detail">{gain.detail}</p>
                  </div>
                  <strong className="hero__earning-amount">{gain.amount}</strong>
                </article>
              ))}
            </div>
            <div className="hero__terminal-footer">
              <span>Perfiles y montos ilustrativos</span>
              <span className="hero__scan">Actualización en vivo</span>
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
