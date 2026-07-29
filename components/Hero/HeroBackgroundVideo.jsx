"use client";

import { useEffect, useRef } from "react";

export function HeroBackgroundVideo() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (!video) {
      return undefined;
    }

    function syncPlayback() {
      if (reducedMotion.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      video.play().catch(() => undefined);
    }

    syncPlayback();
    reducedMotion.addEventListener("change", syncPlayback);

    return () => {
      reducedMotion.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, []);

  return (
    <video
      className="hero__background-video"
      ref={videoRef}
      muted
      loop
      playsInline
      poster="/hero-sports-crypto-poster.webp"
      preload="metadata"
      tabIndex={-1}
      aria-hidden="true"
    >
      <source src="/hero-sports-crypto.mp4" type="video/mp4" />
    </video>
  );
}
