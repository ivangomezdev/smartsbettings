import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";
import { TestimonialCard } from "../TestimonialCard/TestimonialCard";

const testimonials = [
  {
    quote:
      "Lo que más valoro es ver el margen y las cuotas sin tener que saltar entre diez pestañas.",
    name: "Carlos M.",
    role: "Usuario de arbitraje",
    initials: "CM",
  },
  {
    quote:
      "La información llega ordenada. Puedo revisar el contexto y decidir con calma, sin perseguir ruido.",
    name: "Andrea R.",
    role: "Seguidora de predicciones",
    initials: "AR",
  },
  {
    quote:
      "La plataforma se siente hecha para actuar rápido, pero también para mantener control del riesgo.",
    name: "Miguel T.",
    role: "Apostador deportivo",
    initials: "MT",
  },
];

export function Testimonials() {
  return (
    <section className="testimonials u-section" id="resenas">
      <div className="testimonials__inner u-container">
        <SectionHeading
          eyebrow="Reseñas"
          title="Claridad que se siente desde la primera señal."
          description="Experiencias de usuarios que priorizan información, velocidad y control."
        />
        <div className="testimonials__grid">
          {testimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.name} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
