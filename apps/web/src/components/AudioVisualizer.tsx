export function AudioVisualizer(props: {
  active: boolean;
  color?: string;
}): JSX.Element {
  const { active, color = "var(--ink)" } = props;
  return (
    <div className="flex h-7 items-center" style={{ gap: 2 }}>
      {Array.from({ length: 32 }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: color,
            borderRadius: 1,
            transformOrigin: "center",
            height: active ? "100%" : 2,
            opacity: active ? 0.5 + ((i * 17 + 3) % 10) * 0.05 : 0.2,
            animation: active
              ? `waveBar ${0.35 + (i % 6) * 0.08}s ease-in-out infinite`
              : "none",
            animationDelay: `${(i * 0.05) % 0.5}s`,
            transition: "height 0.4s",
          }}
        />
      ))}
    </div>
  );
}
