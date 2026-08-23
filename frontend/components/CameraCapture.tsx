"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { enhanceDocumentCanvas } from "@/lib/enhanceCapture";

export type CameraHandle = {
  capture: () => Promise<{ blob: Blob } | null>;
  start: () => Promise<boolean>;
  stop: () => void;
};

type CameraCaptureProps = {
  onCapture: (blob: Blob) => void;
  ref?: Ref<CameraHandle>;
};

export function CameraCapture({
  onCapture,
  ref,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const isStreamLive = useCallback(() => {
    const video = videoRef.current;
    const live = streamRef.current
      ?.getVideoTracks()
      .some((t) => t.readyState === "live");
    return Boolean(live && video && video.videoWidth > 0);
  }, []);

  const waitForFrame = useCallback(async (video: HTMLVideoElement) => {
    if (video.videoWidth > 0) return;
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 2500;
      const tick = () => {
        if (
          !mountedRef.current ||
          video.videoWidth > 0 ||
          Date.now() > deadline
        ) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStarting(false);
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (isStreamLive()) {
      setCameraReady(true);
      return true;
    }

    if (streamRef.current && videoRef.current) {
      await waitForFrame(videoRef.current);
      if (isStreamLive()) {
        setCameraReady(true);
        return true;
      }
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setCameraError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraReady(false);
        return false;
      }
      video.srcObject = stream;
      await video.play();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
        });
      }
      await waitForFrame(video);
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        video.srcObject = null;
        return false;
      }
      if (video.videoWidth === 0) {
        setCameraError("Camera started but no picture yet. Try again.");
        setCameraReady(false);
        return false;
      }
      await new Promise((r) => setTimeout(r, 400));
      setCameraReady(true);
      return true;
    } catch {
      setCameraError("Camera unavailable. Allow camera access and try again.");
      setCameraReady(false);
      return false;
    } finally {
      setStarting(false);
    }
  }, [isStreamLive, waitForFrame]);

  useEffect(() => {
    mountedRef.current = true;
    const onVis = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      stopCamera();
    };
  }, [stopCamera]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const live = streamRef.current
      ?.getVideoTracks()
      .some((t) => t.readyState === "live");
    if (!video || !live || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const enhanced = enhanceDocumentCanvas(canvas);

    const blob = await new Promise<Blob | null>((resolve) =>
      enhanced.toBlob(resolve, "image/jpeg", 0.95)
    );
    if (!blob) return null;
    onCapture(blob);
    return { blob };
  }, [onCapture]);

  useImperativeHandle(
    ref,
    () => ({
      capture: captureFrame,
      start: startCamera,
      stop: stopCamera,
    }),
    [captureFrame, startCamera, stopCamera]
  );

  const overlay = cameraError
    ? cameraError
    : starting
      ? "Starting…"
      : "Camera off";

  return (
    <section className="capture" aria-label="Camera">
      <div className="viewfinder">
        <video
          ref={videoRef}
          className="viewfinder-video"
          playsInline
          muted
          aria-hidden="true"
        />
        {!cameraReady && (
          <div className="viewfinder-overlay" role="status">
            {overlay}
          </div>
        )}
        <button
          type="button"
          className={`cam-icon${cameraReady ? " is-on" : ""}`}
          onClick={() => {
            if (cameraReady) stopCamera();
            else void startCamera();
          }}
          disabled={starting}
          aria-label={cameraReady ? "Turn camera off" : "Turn camera on"}
          aria-pressed={cameraReady}
        >
          {cameraReady ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 7h3.2l1.3-2h7l1.3 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 3.2A3.8 3.8 0 1 0 15.8 14 3.8 3.8 0 0 0 12 10.2z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.3 2.5 21 20.2l-1.4 1.4-3.1-3.1H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h.3L1.9 3.9 3.3 2.5zM20 7h-3.2l-1.3-2h-4.1l8.6 8.6V9a2 2 0 0 0-2-2z"
              />
            </svg>
          )}
        </button>
      </div>
    </section>
  );
}
