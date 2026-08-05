export const plans = [
  {
    id: "starter",
    eyebrow: "Para comenzar",
    name: "Starter",
    price: "19.99 USDT",
    amount: "19.99",
    currency: "USDT",
    suffix: "/ mes",
    billing: "Mensual",
    accessDays: 30,
    includesPredictions: true,
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
    id: "arbitraje",
    eyebrow: "Mensual",
    name: "Arbitraje",
    price: "30 USDT",
    amount: "30.00",
    currency: "USDT",
    suffix: "/ mes",
    billing: "Mensual",
    accessDays: 30,
    includesPredictions: false,
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
    id: "predicciones",
    eyebrow: "Por resultado",
    name: "Predicciones",
    price: "70 USDT",
    amount: "70.00",
    currency: "USDT",
    suffix: "por ganadora",
    billing: "Por resultado ganador",
    accessDays: 30,
    includesPredictions: true,
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

export function getPlanById(planId) {
  return plans.find((plan) => plan.id === planId) || null;
}
