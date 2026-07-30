"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function HeroBackgroundVideo() {
  const videoRef = useRef(null);
  const [needsTap, setNeedsTap] = useState(false);

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
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const mobileViewport = window.matchMedia("(max-width: 575px)");

    if (!video) {
      return undefined;
    }

    function syncPlayback() {
      if (reducedMotion.matches) {
        video.pause();
        video.currentTime = 0;
        setNeedsTap(true);
        return;
      }

      if (document.visibilityState === "visible") {
        startPlayback();
      }
    }

    function handlePlaying() {
      setNeedsTap(false);
    }

    function handlePause() {
      if (
        document.visibilityState === "visible" &&
        !reducedMotion.matches &&
        !video.ended
      ) {
        setNeedsTap(true);
      }
    }

    function handleViewportChange() {
      video.poster = mobileViewport.matches
        ? "/luxmobile-poster.webp"
        : "/luxury-poster.webp";
      video.load();
      syncPlayback();
    }

    video.poster = mobileViewport.matches
      ? "/luxmobile-poster.webp"
      : "/luxury-poster.webp";
    syncPlayback();
    video.addEventListener("loadedmetadata", syncPlayback);
    video.addEventListener("canplay", syncPlayback);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    window.addEventListener("pageshow", syncPlayback);
    window.addEventListener("touchstart", syncPlayback, { passive: true });
    window.addEventListener("click", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);
    mobileViewport.addEventListener("change", handleViewportChange);

    return () => {
      video.removeEventListener("loadedmetadata", syncPlayback);
      video.removeEventListener("canplay", syncPlayback);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
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
    <>
      <div className="hero__video-frame" aria-hidden="true">
        <video
          className="hero__background-video"
          ref={videoRef}
          autoPlay
          defaultMuted
          muted
          loop
          playsInline
          poster="/luxury-poster.webp"
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
        >
          <source
            src="/luxmobile-safari.mp4"
            type="video/mp4"
            media="(max-width: 575px)"
          />
          <source
            src="/luxury-safari.mp4"
            type="video/mp4"
            media="(min-width: 576px)"
          />
        </video>
      </div>
      {needsTap ? (
        <button
          className="hero__video-play"
          type="button"
          onClick={startPlayback}
          aria-label="Reproducir el video de fondo"
        >
          <span className="hero__video-play-icon" aria-hidden="true" />
          Activar video
        </button>
      ) : null}
    </>
  );
}
