export function LatencyIndicator(props: {
  pipelineMs: number | null;
}): JSX.Element {
  const { pipelineMs } = props;
  return (
    <div
      style={{ border: "1px solid var(--rule)", borderRadius: 2 }}
      className="px-2.5 py-1.5 font-mono text-[11px] text-ink-light"
    >
      {pipelineMs === null ? "—" : `${pipelineMs}ms`} pipeline
    </div>
  );
}
