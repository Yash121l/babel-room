export function LatencyIndicator(props: { pipelineMs: number | null }): JSX.Element {
  const { pipelineMs } = props;
  return (
    <div className="rounded-lg border border-slate-800 bg-room-panel px-3 py-2 text-xs text-room-muted">
      Pipeline latency{" "}
      <span className="font-mono text-room-accent">
        {pipelineMs === null ? "—" : `${pipelineMs} ms`}
      </span>
    </div>
  );
}
