"use client";

import { useEffect, useRef, useState } from "react";

const carouselDelay = 3600;
const transitionDuration = 680;

const restingSlots = ["incoming", "first", "second", "third"];
const movingSlots = ["first", "second", "third", "outgoing"];

export function WinnersCarousel({ winners }) {
  const [headIndex, setHeadIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const settleTimerRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (isPaused || reducedMotion.matches) {
      return undefined;
    }

    const rotationTimer = window.setInterval(() => {
      setIsAnimating(true);
      settleTimerRef.current = window.setTimeout(() => {
        setHeadIndex(
          (currentIndex) =>
            (currentIndex - 1 + winners.length) % winners.length,
        );
        setIsAnimating(false);
      }, transitionDuration);
    }, carouselDelay);

    return () => {
      window.clearInterval(rotationTimer);
      window.clearTimeout(settleTimerRef.current);
    };
  }, [isPaused, winners.length]);

  const visibleWinners = [-1, 0, 1, 2].map((offset) => {
    const winnerIndex = (headIndex + offset + winners.length) % winners.length;
    return winners[winnerIndex];
  });

  return (
    <section
      className="winners-carousel"
      aria-label="Carrusel de los diez usuarios con mayores ganancias"
    >
      <div className="winners-carousel__toolbar">
        <span className="winners-carousel__count">
          3 en pantalla · 10 totales
        </span>
        <button
          className="winners-carousel__toggle"
          type="button"
          aria-pressed={isPaused}
          disabled={isAnimating}
          onClick={() => setIsPaused((currentValue) => !currentValue)}
        >
          <span
            className={`winners-carousel__toggle-icon${
              isPaused ? " winners-carousel__toggle-icon--play" : ""
            }`}
            aria-hidden="true"
          />
          {isPaused ? "Reanudar" : "Pausar"}
        </button>
      </div>
      <div className="winners-carousel__track" aria-live="off">
        {visibleWinners.map((winner, index) => {
          const slot = isAnimating ? movingSlots[index] : restingSlots[index];

          return (
            <article
              className={`winners-carousel__notification winners-carousel__notification--${slot}`}
              key={winner.user}
            >
              <span className="winners-carousel__rank" aria-label={`Posición ${winner.rank}`}>
                #{winner.rank}
              </span>
              <div className="winners-carousel__identity">
                <h2 className="winners-carousel__user">{winner.user}</h2>
                <p className="winners-carousel__detail">{winner.detail}</p>
              </div>
              <strong className="winners-carousel__amount">
                {winner.amount}
              </strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
