export type ThemePreference = "system" | "light" | "dark";

const storageKey = "simfiment-theme";

export function resolveTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(storageKey, preference);
  } catch {
    /* Storage may be disabled. */
  }
}

export function applyCachedTheme() {
  let preference: ThemePreference = "system";
  try {
    const cached = window.localStorage.getItem(storageKey);
    if (cached === "light" || cached === "dark" || cached === "system") preference = cached;
  } catch {
    /* Use the system preference. */
  }
  applyTheme(preference);
}

applyCachedTheme();
