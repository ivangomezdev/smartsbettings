import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";
import { PricingCard } from "../PricingCard/PricingCard";
import { plans } from "../../lib/plans.js";

export function Pricing() {
  return (
    <section className="pricing u-section" id="precios">
      <div className="pricing__inner u-container">
        <SectionHeading
          eyebrow="Precios simples"
          title="Elige cómo quieres encontrar tu ventaja."
          description="Tres modalidades claras, pago en USDT y sin costos escondidos."
          align="center"
        />
        <div className="pricing__grid">
          {plans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>
        <p className="pricing__note">
          Las apuestas implican riesgo. SmartBetting ofrece análisis e
          información, no garantiza rendimientos ni elimina variaciones de
          cuotas, límites o disponibilidad.
        </p>
      </div>
    </section>
  );
}
