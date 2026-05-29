"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo } from "react";
import type { ThemeMode } from "../theme";
import { useI18n } from "../i18n";

type CodeEditorProps = {
  fileName: string;
  themeMode: ThemeMode;
  value: string;
  onChange: (value: string) => void;
};

export function CodeEditor({ fileName, themeMode, value, onChange }: CodeEditorProps) {
  const { t } = useI18n();
  const language = useMemo(() => languageForFile(fileName), [fileName]);
  const monacoTheme = themeMode === "light" ? "exerpt-light" : "exerpt-dark";

  const beforeMount = useCallback<BeforeMount>((monaco) => {
    monaco.editor.defineTheme("exerpt-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6b7280", fontStyle: "italic" },
        { token: "keyword", foreground: "7dd3fc" },
        { token: "number", foreground: "f0abfc" },
        { token: "string", foreground: "86efac" },
        { token: "type", foreground: "c4b5fd" }
      ],
      colors: {
        "editor.background": "#091413",
        "editor.foreground": "#e5fff3",
        "editor.lineHighlightBackground": "#0e1f1b",
        "editor.selectionBackground": "#285a48",
        "editorCursor.foreground": "#b0e4cc",
        "editorGutter.background": "#091413",
        "editorLineNumber.foreground": "#408a71",
        "editorLineNumber.activeForeground": "#b0e4cc",
        "minimap.background": "#091413"
      }
    });

    monaco.editor.defineTheme("exerpt-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6e7781", fontStyle: "italic" },
        { token: "keyword", foreground: "0969da" },
        { token: "number", foreground: "8250df" },
        { token: "string", foreground: "1a7f37" },
        { token: "type", foreground: "953800" }
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#091413",
        "editor.lineHighlightBackground": "#e8f6ef",
        "editor.selectionBackground": "#b0e4cc",
        "editorCursor.foreground": "#285a48",
        "editorGutter.background": "#ffffff",
        "editorLineNumber.foreground": "#408a71",
        "editorLineNumber.activeForeground": "#285a48",
        "minimap.background": "#ffffff"
      }
    });
  }, []);

  const onMount = useCallback<OnMount>((editor) => {
    editor.focus();
  }, []);

  return (
    <Editor
      path={fileName || "untitled.txt"}
      value={value}
      language={language}
      theme={monacoTheme}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      loading={<div className="flex h-full items-center justify-center bg-app text-sm text-muted">{t("loadingEditor")}</div>}
      options={{
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        cursorBlinking: "smooth",
        fontFamily: "\"JetBrains Mono\", \"Fira Code\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontLigatures: true,
        fontSize: 13,
        formatOnPaste: true,
        lineHeight: 22,
        minimap: { enabled: true, scale: 0.85, showSlider: "mouseover" },
        padding: { top: 18, bottom: 24 },
        renderLineHighlight: "all",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: "on"
      }}
    />
  );
}

function languageForFile(name: string) {
  const lowerName = name.toLowerCase();

  if (/\.(ts|tsx|mts|cts)$/.test(lowerName)) {
    return "typescript";
  }
  if (/\.(js|jsx|mjs|cjs)$/.test(lowerName)) {
    return "javascript";
  }
  if (/\.py$/.test(lowerName)) {
    return "python";
  }
  if (/\.(kt|kts)$/.test(lowerName)) {
    return "kotlin";
  }
  if (/\.java$/.test(lowerName)) {
    return "java";
  }
  if (/\.swift$/.test(lowerName)) {
    return "swift";
  }
  if (/\.go$/.test(lowerName)) {
    return "go";
  }
  if (/\.rs$/.test(lowerName)) {
    return "rust";
  }
  if (/\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(lowerName)) {
    return "cpp";
  }
  if (/\.cs$/.test(lowerName)) {
    return "csharp";
  }
  if (/\.php$/.test(lowerName)) {
    return "php";
  }
  if (/\.rb$/.test(lowerName)) {
    return "ruby";
  }
  if (/\.dart$/.test(lowerName)) {
    return "dart";
  }
  if (/\.json$/.test(lowerName)) {
    return "json";
  }
  if (/\.(md|mdx)$/.test(lowerName)) {
    return "markdown";
  }
  if (/\.(yml|yaml)$/.test(lowerName)) {
    return "yaml";
  }
  if (/\.css$/.test(lowerName)) {
    return "css";
  }
  if (/\.html?$/.test(lowerName)) {
    return "html";
  }
  if (/\.(sh|bash|zsh)$/.test(lowerName)) {
    return "shell";
  }

  return "plaintext";
}
