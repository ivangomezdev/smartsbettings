"use client";

import { useEffect } from "react";

export function ScrollReveal() {
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (reducedMotion.matches) {
      return undefined;
    }

    const sections = Array.from(document.querySelectorAll("main > section"));

    sections.forEach((section) => {
      const bounds = section.getBoundingClientRect();
      const isInitiallyVisible =
        bounds.top < window.innerHeight * 0.88 &&
        bounds.bottom > window.innerHeight * 0.12;

      section.classList.toggle(
        "section-reveal--visible",
        isInitiallyVisible,
      );
      section.classList.add("section-reveal");
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle(
            "section-reveal--visible",
            entry.isIntersecting,
          );
        });
      },
      {
        rootMargin: "-12% 0px -12% 0px",
        threshold: 0.06,
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
      sections.forEach((section) => {
        section.classList.remove(
          "section-reveal",
          "section-reveal--visible",
        );
      });
    };
  }, []);

  return null;
}
