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
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{
        background: "rgba(249,249,247,0.88)",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.15s ease",
      }}
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
        className="w-full max-w-[400px] bg-paper p-10"
        style={{
          border: "1px solid var(--ink)",
          boxShadow: "4px 4px 0 var(--ink)",
          borderRadius: 2,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rule */}
        <div
          className="mb-5"
          style={{ height: 1, background: "var(--ink)" }}
        />

        <h2
          id="end-call-title"
          className="mb-3 font-serif text-2xl"
        >
          End this call?
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-ink-light">
          The room will close for all participants. A summary will be
          generated and saved.
        </p>

        {error ? (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 cursor-pointer border border-ink bg-transparent py-2.5 text-sm font-semibold text-ink transition-[transform,box-shadow] duration-75 disabled:opacity-50"
            style={{ borderRadius: 2, boxShadow: "2px 2px 0 var(--ink)" }}
            onMouseDown={(e) =>
              (e.currentTarget.style.cssText +=
                ";transform:translate(2px,2px);box-shadow:none")
            }
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 cursor-pointer py-2.5 text-sm font-semibold text-paper transition-[transform,box-shadow] duration-75 disabled:opacity-50"
            style={{
              background: "#C0392B",
              border: "1px solid #C0392B",
              borderRadius: 2,
              boxShadow: "2px 2px 0 rgba(0,0,0,0.3)",
            }}
            onMouseDown={(e) =>
              (e.currentTarget.style.cssText +=
                ";transform:translate(2px,2px);box-shadow:none")
            }
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 rgba(0,0,0,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 rgba(0,0,0,0.3)";
            }}
          >
            {busy ? "Ending…" : "End call"}
          </button>
        </div>
      </div>
    </div>
  );
}
