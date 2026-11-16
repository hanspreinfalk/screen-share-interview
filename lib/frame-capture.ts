export type CapturedFrame = {
  dataUrl: string;
  width: number;
  height: number;
  fingerprint: string;
  byteEstimate: number;
};

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;

function clampDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Cheap fingerprint for near-duplicate frame detection. */
function fingerprintFromImageData(data: ImageData): string {
  const { data: pixels, width, height } = data;
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 12));
  const buckets: number[] = [];

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const luma = Math.round(
        (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 16,
      );
      buckets.push(luma);
    }
  }

  return buckets.join(".");
}

export function framesAreSimilar(a: string, b: string, tolerance = 8): boolean {
  if (a === b) return true;
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  if (aa.length !== bb.length) return false;

  let drift = 0;
  for (let i = 0; i < aa.length; i++) {
    drift += Math.abs(aa[i] - bb[i]);
    if (drift > tolerance) return false;
  }
  return true;
}

export class ScreenFrameCapture {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;

  attach(stream: MediaStream) {
    this.detach();
    this.stream = stream;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    this.video = video;

    this.canvas = document.createElement("canvas");
  }

  detach() {
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    this.canvas = null;
    this.stream = null;
  }

  get hasStream() {
    return Boolean(this.stream?.getVideoTracks().some((t) => t.readyState === "live"));
  }

  capture(quality = 0.62): CapturedFrame | null {
    const video = this.video;
    const canvas = this.canvas;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const { width, height } = clampDimensions(video.videoWidth, video.videoHeight);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    // Drop pixel buffer promptly; keep only the compressed data URL in memory briefly.
    return {
      dataUrl,
      width,
      height,
      fingerprint: fingerprintFromImageData(imageData),
      byteEstimate: Math.round((dataUrl.length * 3) / 4),
    };
  }
}
