import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";
import { TestimonialsCarousel } from "../TestimonialsCarousel/TestimonialsCarousel.jsx";

const testimonials = [
  {
    quote:
      "Lo que más valoro es ver el margen y las cuotas sin tener que saltar entre diez pestañas.",
    name: "Carlos M.",
    role: "Usuario de arbitraje",
    avatar: "/testimonial-carlos.jpg",
  },
  {
    quote:
      "La información llega ordenada. Puedo revisar el contexto y decidir con calma, sin perseguir ruido.",
    name: "Andrea R.",
    role: "Seguidora de predicciones",
    avatar: "/testimonial-andrea.jpg",
  },
  {
    quote:
      "La plataforma se siente hecha para actuar rápido, pero también para mantener control del riesgo.",
    name: "Miguel T.",
    role: "Apostador deportivo",
    avatar: "/testimonial-miguel.jpg",
  },
  {
    quote:
      "El diseño es directo y elegante. Entiendo la oportunidad sin perder tiempo interpretando tablas complicadas.",
    name: "Valeria G.",
    role: "Usuaria de arbitraje",
    avatar: "/testimonial-valeria.jpg",
  },
  {
    quote:
      "Me gusta que el análisis no intenta vender certezas. Presenta los datos y me permite decidir con criterio.",
    name: "Diego S.",
    role: "Seguidor de predicciones",
    avatar: "/testimonial-diego.jpg",
  },
];

export function Testimonials() {
  return (
    <section className="testimonials u-section" id="resenas">
      <div className="testimonials__inner u-container">
        <div className="testimonials__layout">
          <div className="testimonials__intro">
            <SectionHeading
              eyebrow="Reseñas"
              title="Claridad en cada señal."
              description="Experiencias de usuarios que priorizan información, velocidad y control."
              size="compact"
            />
          </div>
          <TestimonialsCarousel testimonials={testimonials} />
        </div>
      </div>
    </section>
  );
}
