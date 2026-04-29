import { useEffect, useRef } from "react";

export function AudioVisualizer(props: {
  stream: MediaStream | null;
}): JSX.Element {
  const { stream } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const audioContext = new AudioContext();
    ctxRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return undefined;

    const draw = (): void => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      const { width, height } = canvas;
      ctx2d.fillStyle = "#0b1020";
      ctx2d.fillRect(0, 0, width, height);
      ctx2d.lineWidth = 2;
      ctx2d.strokeStyle = "#38bdf8";
      ctx2d.beginPath();
      const slice = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = data[i] ?? 128;
        const y = (v / 128) * height * 0.5;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
        x += slice;
      }
      ctx2d.stroke();
    };
    draw();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
      ctxRef.current = null;
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={120}
      className="w-full max-w-xl rounded-lg border border-slate-800 bg-black/40"
    />
  );
}
