import Image from "next/image";
import Link from "next/link";
import {
  FiArrowRight,
  FiCheck,
  FiExternalLink,
  FiMousePointer,
  FiShield,
  FiTarget,
  FiUserPlus,
} from "react-icons/fi";

const hardRockOfficialUrl = "https://hardrock.bet/";

function getHardRockUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_HARD_ROCK_REFERRAL_URL;
  if (!configuredUrl) return hardRockOfficialUrl;

  try {
    const parsed = new URL(configuredUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : hardRockOfficialUrl;
  } catch {
    return hardRockOfficialUrl;
  }
}

export function GettingStarted() {
  const hardRockUrl = getHardRockUrl();

  return (
    <main className="getting-started">
      <header className="getting-started__hero">
        <p>GUÍA DE INICIO</p>
        <h1>De tu cuenta a tu primera selección.</h1>
        <span>
          Sigue esta ruta para preparar la casa de apuestas, revisar cada pick y llegar al mercado correcto sin perder tiempo.
        </span>
      </header>

      <section className="getting-started__steps" aria-label="Tres pasos para comenzar">
        <article className="start-step start-step--partner">
          <div className="start-step__topline">
            <span>01</span>
            <FiUserPlus aria-hidden="true" />
          </div>
          <div className="start-step__visual start-step__visual--hard-rock">
            <a
              className="hard-rock-partner"
              href={hardRockUrl}
              target="_blank"
              rel="sponsored noopener noreferrer"
              aria-label="Registrarme en Hard Rock Bet"
            >
              <Image
                src="/hard-rock-bet-logo.jpg"
                alt="Hard Rock Bet"
                width={512}
                height={512}
                priority
              />
              <span>TOCA EL LOGO PARA REGISTRARTE <FiExternalLink aria-hidden="true" /></span>
            </a>
          </div>
          <div className="start-step__content">
            <p>PREPARA TU CUENTA</p>
            <h2>Regístrate en la casa disponible.</h2>
            <span>
              Crea tu cuenta, completa la verificación solicitada y define tus límites antes de depositar. El acceso se abre al presionar el logo.
            </span>
          </div>
        </article>

        <article className="start-step">
          <div className="start-step__topline">
            <span>02</span>
            <FiTarget aria-hidden="true" />
          </div>
          <div className="start-step__visual">
            <Image
              src="/how-it-works-signal.webp"
              alt="Análisis de una oportunidad deportiva"
              fill
              sizes="(max-width: 767px) 100vw, 32vw"
            />
            <div className="start-step__pick-preview">
              <small>PICK DISPONIBLE</small>
              <strong>Mercado + cuota + análisis</strong>
              <span><i /> PLAN ACTIVO</span>
            </div>
          </div>
          <div className="start-step__content">
            <p>REVISA LA SELECCIÓN</p>
            <h2>Consulta el pick desde tu panel privado.</h2>
            <span>
              Entra a Predicciones y revisa el evento, la apuesta sugerida, la cuota, el análisis y la captura del ticket antes de continuar.
            </span>
            <Link href="/predictions?view=picks">Ver picks disponibles <FiArrowRight aria-hidden="true" /></Link>
          </div>
        </article>

        <article className="start-step">
          <div className="start-step__topline">
            <span>03</span>
            <FiMousePointer aria-hidden="true" />
          </div>
          <div className="start-step__visual">
            <Image
              src="/how-it-works-control.webp"
              alt="Deportista preparándose para ejecutar una decisión"
              fill
              sizes="(max-width: 767px) 100vw, 32vw"
            />
            <div className="start-step__action-preview">
              <FiMousePointer aria-hidden="true" />
              <span>IR A COLOCAR APUESTA</span>
              <FiExternalLink aria-hidden="true" />
            </div>
          </div>
          <div className="start-step__content">
            <p>ABRE EL MERCADO INDICADO</p>
            <h2>Llega a la apuesta con un solo toque.</h2>
            <span>
              Dentro del pick, presiona “Ir a colocar apuesta”. Se abrirá la casa correspondiente para que confirmes mercado, cuota y monto antes de enviar.
            </span>
            <Link href="/predictions">Continuar a Predicciones <FiArrowRight aria-hidden="true" /></Link>
          </div>
        </article>
      </section>

      <section className="getting-started__responsible">
        <span className="getting-started__shield"><FiShield aria-hidden="true" /></span>
        <div>
          <p>ANTES DE CONFIRMAR</p>
          <h2>Verifica siempre los datos de la selección.</h2>
          <ul>
            <li><FiCheck aria-hidden="true" /> El evento y mercado coinciden con el pick.</li>
            <li><FiCheck aria-hidden="true" /> La cuota sigue dentro del rango indicado.</li>
            <li><FiCheck aria-hidden="true" /> El monto respeta tus límites personales.</li>
          </ul>
        </div>
      </section>

      <p className="getting-started__disclosure">
        El enlace de Hard Rock Bet puede ser un enlace de referido y SmartBetting podría recibir una compensación sin costo adicional para ti. Debes cumplir la edad legal y encontrarte en una ubicación donde el servicio esté autorizado. Apostar implica riesgo; nunca apuestes dinero que no puedas permitirte perder.
      </p>
    </main>
  );
}
