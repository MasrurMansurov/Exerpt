"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const storageKey = "exerpt-theme";

export const themeLabels: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light"
};

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(storageKey);
    if (storedTheme === "dark" || storedTheme === "light") {
      setThemeMode(storedTheme);
      return;
    }

    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
    setThemeMode(prefersLight ? "light" : "dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(storageKey, themeMode);
  }, [themeMode]);

  function toggleTheme() {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }

  return { themeMode, setThemeMode, toggleTheme };
}
