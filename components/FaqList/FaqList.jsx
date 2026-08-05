import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";

const faqs = [
  {
    question: "¿Qué es un arbitraje o surebet?",
    answer:
      "Es una combinación de apuestas en distintas casas y resultados de un mismo evento que, cuando las cuotas y condiciones se mantienen, busca cubrir todos los escenarios. Las cuotas pueden cambiar y las casas pueden aplicar límites.",
  },
  {
    question: "¿Qué incluye la suscripción de 30 USDT?",
    answer:
      "Incluye acceso mensual al radar de oportunidades de arbitraje, datos de cuotas, margen estimado, distribución sugerida e historial dentro de la plataforma.",
  },
  {
    question: "¿Cómo funciona el pago de predicciones?",
    answer:
      "La modalidad cuesta 70 USDT por predicción ganadora. No es una suscripción mensual; el cargo se genera únicamente cuando la selección comunicada obtiene el resultado indicado.",
  },
  {
    question: "¿SmartBetting garantiza ganancias?",
    answer:
      "No. Ninguna apuesta está libre de riesgo. La plataforma organiza análisis y oportunidades, pero las cuotas cambian, pueden existir límites y cada usuario es responsable de validar y decidir.",
  },
  {
    question: "¿Cómo se realizan los pagos?",
    answer:
      "Los pagos se realizan en USDT. Al solicitar acceso recibirás las instrucciones y la red habilitada antes de transferir.",
  },
  {
    question: "¿Ya puedo crear mi cuenta?",
    answer:
      "Sí. Desde mobile puedes crear tu cuenta, elegir un plan y entrar a tu dashboard para administrar tus datos y consultar los picks incluidos en tu acceso.",
  },
];

export function FaqList() {
  return (
    <section className="faq u-section" id="faq">
      <div className="faq__inner u-container">
        <SectionHeading
          eyebrow="Preguntas frecuentes"
          title="Antes de comenzar, despejemos lo importante."
          description="Información directa sobre el servicio, los pagos y el uso responsable."
        />
        <div className="faq__list">
          {faqs.map((faq, index) => (
            <details className="faq__item" key={faq.question}>
              <summary className="faq__question">
                <span className="faq__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="faq__question-text">{faq.question}</span>
                <span className="faq__icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="faq__answer">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
