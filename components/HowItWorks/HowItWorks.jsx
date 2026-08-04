"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "../SectionHeading/SectionHeading.jsx";

const steps = [
  {
    number: "01",
    title: "Recibe la señal",
    description:
      "La plataforma organiza las oportunidades y destaca lo que requiere atención inmediata.",
  },
  {
    number: "02",
    title: "Valida el contexto",
    description:
      "Revisa cuotas, mercado, margen y distribución sugerida antes de tomar una decisión.",
  },
  {
    number: "03",
    title: "Actúa con control",
    description:
      "Define tu monto, respeta tus límites y registra el resultado para mantener perspectiva.",
  },
];

export function HowItWorks() {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      const visibilityTimer = window.setTimeout(() => setIsVisible(true), 0);
      return () => window.clearTimeout(visibilityTimer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.28 },
    );

    observer.observe(sectionRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={`how-it-works u-section${
        isVisible ? " how-it-works--visible" : ""
      }`}
      id="como-funciona"
      ref={sectionRef}
    >
      <div className="how-it-works__inner u-container">
        <SectionHeading
          eyebrow="Cómo funciona"
          title={
            <>
              De la señal a la decisión,{" "}
              <span className="how-it-works__title-highlight">
                en tres pasos.
              </span>
            </>
          }
          align="center"
        />
        <div className="how-it-works__steps">
          {steps.map((step) => (
            <article className="how-it-works__step" key={step.number}>
              <span className="how-it-works__number">{step.number}</span>
              <h3 className="how-it-works__title">{step.title}</h3>
              <p className="how-it-works__copy">
                <span className="how-it-works__copy-highlight">
                  {step.description}
                </span>
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
