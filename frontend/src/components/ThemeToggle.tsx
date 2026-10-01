import { useState } from "react";
import { getThemePreference, saveThemePreference } from "../lib/theme";
import type { ThemePreference } from "../lib/theme";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "端末設定" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference);
  return (
    <div className="theme-switch" role="group" aria-label="表示モード">
      {THEMES.map(({ value, label }) => (
        <button key={value} type="button" aria-pressed={preference === value}
          onClick={() => { saveThemePreference(value); setPreference(value); }}>
          {label}
        </button>
      ))}
    </div>
  );
}
