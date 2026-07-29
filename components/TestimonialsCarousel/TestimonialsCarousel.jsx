"use client";

import { useEffect, useRef } from "react";
import { TestimonialCard } from "../TestimonialCard/TestimonialCard.jsx";

export function TestimonialsCarousel({ testimonials }) {
  const carouselRef = useRef(null);
  const activeIndexRef = useRef(0);
  const isPausedRef = useRef(false);

  useEffect(() => {
    const carousel = carouselRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!carousel || reducedMotion.matches) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      if (isPausedRef.current) {
        return;
      }

      const nextIndex = (activeIndexRef.current + 1) % testimonials.length;
      const nextSlide = carousel.children[nextIndex];

      if (nextSlide) {
        const carouselBounds = carousel.getBoundingClientRect();
        const slideBounds = nextSlide.getBoundingClientRect();
        const nextScrollLeft =
          carousel.scrollLeft +
          slideBounds.left -
          carouselBounds.left -
          (carousel.clientWidth - slideBounds.width) / 2;

        carousel.scrollTo({
          behavior: "smooth",
          left: nextScrollLeft,
        });
      }

      activeIndexRef.current = nextIndex;
    }, 6000);

    return () => window.clearInterval(interval);
  }, [testimonials.length]);

  function syncActiveSlide(event) {
    const carousel = event.currentTarget;
    const firstSlide = carousel.children[0];

    if (!firstSlide) {
      return;
    }

    const carouselStyles = window.getComputedStyle(carousel);
    const carouselGap = Number.parseFloat(carouselStyles.columnGap) || 0;
    const slideWidth = firstSlide.getBoundingClientRect().width + carouselGap;
    const nextIndex = Math.min(
      Math.round(carousel.scrollLeft / slideWidth),
      testimonials.length - 1,
    );

    activeIndexRef.current = nextIndex;
  }

  return (
    <div
      className="testimonials-carousel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Reseñas de usuarios. El movimiento se pausa al enfocar."
    >
      <div
        className="testimonials-carousel__track"
        ref={carouselRef}
        onScroll={syncActiveSlide}
        onMouseEnter={() => {
          isPausedRef.current = true;
        }}
        onMouseLeave={() => {
          isPausedRef.current = false;
        }}
        onFocus={() => {
          isPausedRef.current = true;
        }}
        onBlur={() => {
          isPausedRef.current = false;
        }}
        tabIndex={0}
        aria-live="off"
      >
        {testimonials.map((testimonial, index) => (
          <div
            className="testimonials-carousel__slide"
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${index + 1} de ${testimonials.length}`}
            key={testimonial.name}
          >
            <TestimonialCard {...testimonial} />
          </div>
        ))}
      </div>
    </div>
  );
}
