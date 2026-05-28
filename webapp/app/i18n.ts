"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export type Locale = "en" | "ru" | "zh" | "ja" | "hi";

type Dictionary = typeof en;
type TranslationKey = keyof Dictionary;

const storageKey = "codepact-locale";
const languageChangeEvent = "codepact-languagechange";
const dictionaries: Record<Locale, Dictionary> = { en, ru, zh, ja, hi };

export const localeOptions: Array<{ code: Locale; label: string; nativeLabel: string }> = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" }
];

export function useI18n() {
  const [language, setLanguage] = useState<Locale>("en");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(storageKey);
    if (isLocale(storedLocale)) {
      setLanguage(storedLocale);
      return;
    }

    const browserLocale = navigator.language.split("-")[0];
    if (isLocale(browserLocale)) {
      setLanguage(browserLocale);
    }
  }, []);

  useEffect(() => {
    function handleLanguageChange(event: Event) {
      const nextLanguage = (event as CustomEvent<Locale>).detail;
      if (isLocale(nextLanguage)) {
        setLanguage(nextLanguage);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey && isLocale(event.newValue)) {
        setLanguage(event.newValue);
      }
    }

    window.addEventListener(languageChangeEvent, handleLanguageChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(languageChangeEvent, handleLanguageChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(storageKey, language);
  }, [language]);

  const changeLanguage = useCallback((nextLanguage: Locale) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(storageKey, nextLanguage);
    window.dispatchEvent(new CustomEvent(languageChangeEvent, { detail: nextLanguage }));
  }, []);

  const dictionary = dictionaries[language];
  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => {
      let message = dictionary[key] ?? dictionaries.en[key] ?? key;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          message = message.replaceAll(`{${name}}`, String(value));
        }
      }
      return message;
    },
    [dictionary]
  );

  return useMemo(
    () => ({
      language,
      localeOptions,
      setLanguage: changeLanguage,
      t
    }),
    [changeLanguage, language, t]
  );
}

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "ru" || value === "zh" || value === "ja" || value === "hi";
}
