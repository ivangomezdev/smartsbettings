import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";
import { PricingCard } from "../PricingCard/PricingCard";

const plans = [
  {
    eyebrow: "Para comenzar",
    name: "Starter",
    price: "19.99 USDT",
    suffix: "/ mes",
    description:
      "Una entrada simple para quienes están comenzando en el mundo de las apuestas deportivas.",
    features: [
      "1 pick diario",
      "5 días a la semana",
      "Selección explicada paso a paso",
      "Seguimiento de cada pick",
    ],
  },
  {
    eyebrow: "Mensual",
    name: "Arbitraje",
    price: "30 USDT",
    suffix: "/ mes",
    description:
      "Acceso continuo a oportunidades de surebet detectadas por la plataforma.",
    features: [
      "Radar de oportunidades 24/7",
      "Datos de cuotas y margen",
      "Distribución sugerida",
      "Historial de oportunidades",
    ],
    featured: true,
  },
  {
    eyebrow: "Por resultado",
    name: "Predicciones",
    price: "70 USDT",
    suffix: "por ganadora",
    description:
      "Paga únicamente cuando la predicción comunicada resulta ganadora.",
    features: [
      "Selección deportiva analizada",
      "Contexto y mercado indicado",
      "Seguimiento del resultado",
      "Sin suscripción mensual",
    ],
  },
];

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
