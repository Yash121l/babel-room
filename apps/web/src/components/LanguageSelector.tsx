import type { Language } from "@babel-room/shared";
import { LANGUAGE_OPTIONS, SUPPORTED_LANGUAGES } from "../constants";

export function LanguageSelector(props: {
  id: string;
  label: string;
  value: Language;
  onChange: (lang: Language) => void;
  disabled?: boolean;
}): JSX.Element {
  const { id, label, value, onChange, disabled } = props;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={id}>
      <span className="text-room-muted">{label}</span>
      <select
        id={id}
        className="rounded-lg border border-slate-700 bg-room-panel px-3 py-2 text-slate-100 outline-none focus:border-room-accent"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Language)}
      >
        {SUPPORTED_LANGUAGES.map((code) => {
          const opt = LANGUAGE_OPTIONS[code];
          return (
            <option key={code} value={code}>
              {opt.native} ({opt.english})
            </option>
          );
        })}
      </select>
    </label>
  );
}
