"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

export type CameraHandle = {
  capture: () => Promise<{ blob: Blob; url: string } | null>;
};

type CameraCaptureProps = {
  onCapture: (blob: Blob, previewUrl: string) => void;
  onUpload: (blob: Blob, previewUrl: string) => void;
  onReadyChange?: (ready: boolean) => void;
  disabled?: boolean;
  ref?: Ref<CameraHandle>;
};

export function CameraCapture({
  onCapture,
  onUpload,
  onReadyChange,
  disabled,
  ref,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const setReady = useCallback(
    (ready: boolean) => {
      setCameraReady(ready);
      onReadyChange?.(ready);
    },
    [onReadyChange]
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, [setReady]);

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
        setReady(true);
      }
    } catch {
      setCameraError(
        "Camera unavailable. You can still upload an image below."
      );
      setReady(false);
    }
  }, [setReady, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    onCapture(blob, url);
    return { blob, url };
  }, [cameraReady, onCapture]);

  useImperativeHandle(ref, () => ({ capture: captureFrame }), [captureFrame]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpload(file, url);
    event.target.value = "";
  };

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
            {cameraError || "Starting camera…"}
          </div>
        )}
      </div>

      <div className="capture-actions">
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
