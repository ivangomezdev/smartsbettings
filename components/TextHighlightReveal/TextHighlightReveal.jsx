"use client";

import { useEffect, useRef, useState } from "react";

export function TextHighlightReveal({ children }) {
  const highlightRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const highlight = highlightRef.current;

    if (!highlight) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.45,
      },
    );

    observer.observe(highlight);

    return () => observer.disconnect();
  }, []);

  return (
    <span
      className={`text-highlight-reveal${
        isVisible ? " text-highlight-reveal--visible" : ""
      }`}
      ref={highlightRef}
    >
      <span className="text-highlight-reveal__text">{children}</span>
    </span>
  );
}
