"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function MobileChipsVideo() {
  const videoRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
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
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobile(mobileViewport.matches);

    syncViewport();
    mobileViewport.addEventListener("change", syncViewport);

    return () => mobileViewport.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (!isMobile || !video) {
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
      video.pause();
    };
  }, [isMobile, startPlayback]);

  if (!isMobile) {
    return null;
  }

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
        <source src="/chips.mp4" type="video/mp4" />
      </video>
      {needsTap ? (
        <button
          className="hero__chips-video-play"
          type="button"
          onClick={startPlayback}
          aria-label="Reproducir el video de fichas"
        >
          <span className="hero__video-play-icon" aria-hidden="true" />
          Activar video
        </button>
      ) : null}
    </div>
  );
}
