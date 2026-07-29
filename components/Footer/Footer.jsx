import Image from "next/image";
import { shouldSkipImageOptimization } from "../../lib/image.js";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner u-container">
        <div className="footer__brand-row">
          <a className="footer__brand" href="#inicio" aria-label="Volver al inicio">
            <Image
              className="footer__logo"
              src="/smartbettting-logotrans.png"
              alt="SmartBetting"
              width={1024}
              height={1024}
              unoptimized={shouldSkipImageOptimization}
            />
          </a>
          <p className="footer__tagline">
            Inteligencia deportiva para decisiones con criterio.
          </p>
        </div>
        <div className="footer__bottom">
          <p>© 2026 SmartBetting. Todos los derechos reservados.</p>
          <p className="footer__disclaimer">
            Solo para mayores de edad. Juega con responsabilidad.
          </p>
        </div>
      </div>
    </footer>
  );
}
