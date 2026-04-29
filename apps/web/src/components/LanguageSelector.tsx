import type { Language } from "@babel-room/shared";
import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS, SUPPORTED_LANGUAGES } from "../constants";

export function LanguageSelector(props: {
  id: string;
  label: string;
  value: Language;
  onChange: (lang: Language) => void;
  disabled?: boolean;
}): JSX.Element {
  const { id, label, value, onChange, disabled } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opt = LANGUAGE_OPTIONS[value];

  useEffect(() => {
    const fn = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label ? (
        <label
          id={`${id}-label`}
          htmlFor={id}
          className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light"
        >
          {label}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={label ? `${id}-label` : undefined}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className="w-full cursor-pointer select-none bg-paper px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 2,
          border: open ? "1px solid var(--ink)" : "1px solid var(--rule)",
          boxShadow: open ? "2px 2px 0 var(--ink)" : "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span className="text-sm font-medium text-ink">{opt.english}</span>
        <span className="text-[11px] italic text-ink-light">{opt.native}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="ml-2 shrink-0 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="var(--ink)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-[200] max-h-[220px] overflow-y-auto bg-paper"
          style={{
            top: "calc(100% + 2px)",
            border: "1px solid var(--ink)",
            boxShadow: "3px 3px 0 var(--ink)",
            borderRadius: 2,
            animation: "fadeIn 0.12s ease",
          }}
        >
          {SUPPORTED_LANGUAGES.map((code, i) => {
            const o = LANGUAGE_OPTIONS[code];
            return (
              <div key={code}>
                {i > 0 ? <div style={{ height: 1, background: "var(--rule)" }} /> : null}
                <div
                  role="option"
                  aria-selected={code === value}
                  onClick={() => { onChange(code); setOpen(false); }}
                  className="flex cursor-pointer items-center justify-between px-3 py-2 text-[13px] text-ink transition-colors"
                  style={{
                    fontWeight: code === value ? 600 : 400,
                    background: code === value ? "var(--warm-white)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (code !== value) e.currentTarget.style.background = "var(--warm-white)";
                  }}
                  onMouseLeave={(e) => {
                    if (code !== value) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{o.english}</span>
                  <span className="text-xs text-ink-faint">{o.native}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
