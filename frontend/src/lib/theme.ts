export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "actio_theme";

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Storage can be disabled; follow the device until the user chooses a theme.
    return "system";
  }
}

export function applyTheme(preference: ThemePreference): void {
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
}

export function saveThemePreference(preference: ThemePreference): void {
  applyTheme(preference);
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // The current page still supports theme switching when storage is unavailable.
  }
}
