"use client";

import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 9;
const IDLE_SHAPE = [0.28, 0.42, 0.62, 0.85, 1, 0.85, 0.62, 0.42, 0.28];

function createEmptyLevels() {
  return IDLE_SHAPE.map((v) => v * 0.18);
}

/**
 * Live frequency bars from the local mic and/or remote AI audio stream.
 * Prefers the louder source each frame so the wave follows whoever is talking.
 */
export function useVoiceLevels({
  micStream,
  remoteStream,
  enabled,
  muted = false,
}: {
  micStream: MediaStream | null;
  remoteStream: MediaStream | null;
  enabled: boolean;
  muted?: boolean;
}) {
  const [levels, setLevels] = useState<number[]>(() => createEmptyLevels());
  const smoothedRef = useRef<number[]>(createEmptyLevels());

  useEffect(() => {
    if (!enabled || (!micStream && !remoteStream)) {
      // Reset on the next frame rather than synchronously in the effect body,
      // so flattening the wave cannot cascade a render.
      const reset = requestAnimationFrame(() => {
        smoothedRef.current = createEmptyLevels();
        setLevels(createEmptyLevels());
      });
      return () => cancelAnimationFrame(reset);
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();

    const micAnalyser = micStream ? attachAnalyser(ctx, micStream) : null;
    const remoteAnalyser = remoteStream
      ? attachAnalyser(ctx, remoteStream)
      : null;

    const micData = micAnalyser
      ? (new Uint8Array(micAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>)
      : null;
    const remoteData = remoteAnalyser
      ? (new Uint8Array(
          remoteAnalyser.frequencyBinCount,
        ) as Uint8Array<ArrayBuffer>)
      : null;

    let frame = 0;
    let alive = true;

    const tick = () => {
      if (!alive) return;

      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }

      const micBars =
        micAnalyser && micData && !muted
          ? sampleBars(micAnalyser, micData)
          : null;
      const remoteBars =
        remoteAnalyser && remoteData
          ? sampleBars(remoteAnalyser, remoteData)
          : null;

      const micEnergy = micBars ? average(micBars) : 0;
      const remoteEnergy = remoteBars ? average(remoteBars) : 0;

      // Follow whoever is louder, with a slight bias to remote while AI talks.
      const useRemote =
        remoteBars &&
        (remoteEnergy > micEnergy * 0.85 ||
          (remoteEnergy > 0.08 && remoteEnergy >= micEnergy * 0.55));
      const source = useRemote ? remoteBars : micBars;
      const next = source ?? createEmptyLevels();

      const smoothed = smoothedRef.current.map((prev, i) => {
        const target = next[i] ?? 0;
        // Attack fast, release slower so speech feels snappy without jitter.
        const rate = target > prev ? 0.55 : 0.22;
        return prev + (target - prev) * rate;
      });
      smoothedRef.current = smoothed;
      setLevels([...smoothed]);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      void ctx.close().catch(() => undefined);
    };
  }, [enabled, micStream, remoteStream, muted]);

  return levels;
}

function attachAnalyser(ctx: AudioContext, stream: MediaStream) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.55;
  analyser.minDecibels = -75;
  analyser.maxDecibels = -20;
  source.connect(analyser);
  // Do not connect to destination: mic would echo, remote already plays via <audio>.
  return analyser;
}

function sampleBars(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteFrequencyData(data);
  const bars: number[] = [];
  // Speech lives mostly in the lower-mid bins; ignore the very top.
  const usable = Math.max(BAR_COUNT, Math.floor(data.length * 0.55));
  const slice = Math.max(1, Math.floor(usable / BAR_COUNT));

  for (let i = 0; i < BAR_COUNT; i += 1) {
    // Center-weighted order: outer bars use higher bins a bit less.
    const centerBias = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
    const start = i * slice;
    const end = Math.min(usable, start + slice + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += data[j] ?? 0;
      count += 1;
    }
    const raw = count ? sum / count / 255 : 0;
    const shaped = Math.pow(Math.min(1, raw * 1.45), 0.8);
    bars.push(0.07 + shaped * (0.7 + centerBias * 0.23));
  }

  return bars;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const VOICE_BAR_COUNT = BAR_COUNT;
