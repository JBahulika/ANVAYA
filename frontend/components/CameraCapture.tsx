"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraCaptureProps = {
  onCapture: (blob: Blob, previewUrl: string) => void;
  disabled?: boolean;
};

export function CameraCapture({ onCapture, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError(
        "Camera unavailable. You can still upload an image below."
      );
      setCameraReady(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    onCapture(blob, url);
  }, [cameraReady, onCapture]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onCapture(file, url);
    event.target.value = "";
  };

  return (
    <section className="capture" aria-label="Camera and image capture">
      <div className="viewfinder">
        <video
          ref={videoRef}
          className="viewfinder-video"
          playsInline
          muted
          aria-label="Live camera preview"
        />
        {!cameraReady && (
          <div className="viewfinder-overlay" role="status">
            {cameraError || "Starting camera…"}
          </div>
        )}
      </div>

      <div className="capture-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void captureFrame()}
          disabled={disabled || !cameraReady}
          aria-label="Capture photo from camera"
        >
          Capture
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Upload an image from your device"
        >
          Upload
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void startCamera()}
          disabled={disabled}
          aria-label="Retry camera access"
        >
          Retry camera
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onFileChange}
          aria-hidden
          tabIndex={-1}
        />
      </div>
    </section>
  );
}
