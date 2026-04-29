export function EndCallDialog(props: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}): JSX.Element | null {
  const { open, onClose, onConfirm, busy, error } = props;
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={busy ? undefined : onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-call-title"
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-room-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="end-call-title"
          className="text-lg font-semibold text-white"
        >
          End call for everyone?
        </h2>
        <p className="mt-3 text-sm text-room-muted">
          This closes the room for all participants and starts generating call
          notes. Anyone with the room link can end the call.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-room-danger px-4 py-2 text-sm font-medium text-slate-950 hover:brightness-110 disabled:opacity-50"
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? "Ending…" : "End call"}
          </button>
        </div>
      </div>
    </div>
  );
}
