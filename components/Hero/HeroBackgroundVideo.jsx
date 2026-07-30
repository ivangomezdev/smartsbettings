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

    video.defaultMuted = true;
    video.muted = true;

    function syncPlayback() {
      if (reducedMotion.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      video.play().catch(() => undefined);
    }

    syncPlayback();
    video.addEventListener("loadedmetadata", syncPlayback);
    video.addEventListener("canplay", syncPlayback);
    window.addEventListener("pageshow", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);

    return () => {
      video.removeEventListener("loadedmetadata", syncPlayback);
      video.removeEventListener("canplay", syncPlayback);
      window.removeEventListener("pageshow", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, []);

  return (
    <video
      className="hero__background-video"
      ref={videoRef}
      autoPlay
      defaultMuted
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
      aria-hidden="true"
    >
      <source src="/luxury.mp4" type="video/mp4" />
    </video>
  );
}
