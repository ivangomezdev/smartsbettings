import { Button } from "../Button/Button.jsx";

export function FinalCta() {
  return (
    <section className="final-cta u-section" id="acceso">
      <div className="final-cta__inner u-container">
        <div className="final-cta__panel">
          <p className="final-cta__eyebrow">Tu siguiente jugada</p>
          <h2 className="final-cta__title">
            Menos intuición. Más información.
          </h2>
          <p className="final-cta__copy">
            Conoce el plan que encaja contigo y prepárate para el lanzamiento
            de la plataforma SmartBetting.
          </p>
          <div className="final-cta__actions">
            <Button href="#precios">Comparar planes</Button>
            <span className="final-cta__availability">
              Acceso anticipado próximamente
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
