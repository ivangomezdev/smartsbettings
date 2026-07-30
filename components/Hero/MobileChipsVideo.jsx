"use client";

import { useCallback, useEffect, useRef } from "react";

export function MobileChipsVideo() {
  const videoRef = useRef(null);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.defaultMuted = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    try {
      await video.play();
    } catch {
      // Safari volverá a intentarlo cuando el video esté listo o al primer toque.
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (!video) {
      return undefined;
    }

    function syncPlayback() {
      if (!mobileViewport.matches || reducedMotion.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      if (document.visibilityState === "visible") {
        startPlayback();
      }
    }

    function handleViewportChange() {
      video.load();
      syncPlayback();
    }

    syncPlayback();
    video.addEventListener("loadedmetadata", syncPlayback);
    video.addEventListener("canplay", syncPlayback);
    window.addEventListener("pageshow", syncPlayback);
    window.addEventListener("touchstart", syncPlayback, { passive: true });
    window.addEventListener("click", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);
    mobileViewport.addEventListener("change", handleViewportChange);

    return () => {
      video.removeEventListener("loadedmetadata", syncPlayback);
      video.removeEventListener("canplay", syncPlayback);
      window.removeEventListener("pageshow", syncPlayback);
      window.removeEventListener("touchstart", syncPlayback);
      window.removeEventListener("click", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
      mobileViewport.removeEventListener("change", handleViewportChange);
      video.pause();
    };
  }, [startPlayback]);

  return (
    <div className="hero__chips-video-frame">
      <video
        className="hero__chips-video"
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        aria-hidden="true"
      >
        <source
          src="/chips.mp4"
          type="video/mp4"
          media="(max-width: 767px)"
        />
      </video>
    </div>
  );
}
