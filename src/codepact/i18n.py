"""Small localization layer for generated Codepact output."""

from __future__ import annotations

from typing import Literal

Locale = Literal["en", "ru", "zh", "ja", "hi"]

SUPPORTED_LOCALES: set[str] = {"en", "ru", "zh", "ja", "hi"}

MESSAGES: dict[Locale, dict[str, str]] = {
    "en": {
        "codepact_context": "Codepact Context",
        "table_of_contents": "Table of Contents",
        "project_map": "Project Map",
        "task_context": "Task Context",
        "in_depth_code": "In-depth Code",
        "system_instructions": "System Instructions",
        "priority": "Priority",
        "file": "File",
        "detected_language": "Detected Language",
        "reason": "Reason",
        "graph_distance": "Graph Distance",
        "local_dependencies": "Local Dependencies",
        "task": "Task",
        "token_budget": "Token budget",
        "model_tokenizer": "Model tokenizer",
        "files_ranked_high": "Files ranked high",
        "files_ranked_medium": "Files ranked medium",
        "files_ranked_low": "Files ranked low",
        "priority_heading": "{priority} Priority",
        "summary": "Summary",
        "none": "none",
        "not_available": "n/a",
        "minimal_compressed": "Context was aggressively compressed to fit the token limit.",
        "emergency_compressed": "Aggressively compressed to fit the token limit.",
        "code_omitted": "Code omitted because the token limit is too small for even one snippet.",
        "debug": "[Debug] Budget: {budget}, Used: {used}, Strategy: {strategy}.",
        "strategy_full_code": "FullCode",
        "strategy_snipped": "Snipped",
        "compression_warning": "Aggressively compressed to fit {limit} limit",
        "system_instruction_body": (
            "Use this sifted repository context to solve the task. Treat HIGH files as "
            "authoritative implementation detail, MEDIUM files as dependency contracts, "
            "and LOW files as compressed orientation. Do not assume omitted implementation "
            "details unless they follow directly from visible signatures, docstrings, "
            "imports, or dependency relationships."
        ),
    },
    "ru": {
        "codepact_context": "Контекст Codepact",
        "table_of_contents": "Содержание",
        "project_map": "Карта проекта",
        "task_context": "Контекст задачи",
        "in_depth_code": "Код подробно",
        "system_instructions": "Системные инструкции",
        "priority": "Приоритет",
        "file": "Файл",
        "detected_language": "Обнаруженный язык",
        "reason": "Причина",
        "graph_distance": "Дистанция в графе",
        "local_dependencies": "Локальные зависимости",
        "task": "Задача",
        "token_budget": "Лимит токенов",
        "model_tokenizer": "Токенизатор модели",
        "files_ranked_high": "Файлы с высоким приоритетом",
        "files_ranked_medium": "Файлы со средним приоритетом",
        "files_ranked_low": "Файлы с низким приоритетом",
        "priority_heading": "Приоритет {priority}",
        "summary": "Сводка",
        "none": "нет",
        "not_available": "н/д",
        "minimal_compressed": "Контекст был агрессивно сжат, чтобы уложиться в лимит токенов.",
        "emergency_compressed": "Агрессивно сжато, чтобы уложиться в лимит токенов.",
        "code_omitted": "Код опущен: лимит токенов слишком мал даже для одного фрагмента.",
        "debug": "[Отладка] Лимит: {budget}, Использовано: {used}, Стратегия: {strategy}.",
        "strategy_full_code": "ПолныйКод",
        "strategy_snipped": "Фрагменты",
        "compression_warning": "Агрессивно сжато, чтобы уложиться в лимит {limit}",
        "system_instruction_body": (
            "Используй этот отфильтрованный контекст репозитория для решения задачи. "
            "Считай файлы HIGH авторитетными деталями реализации, MEDIUM - контрактами "
            "зависимостей, а LOW - сжатой ориентацией. Не додумывай скрытые детали, "
            "если они напрямую не следуют из видимых сигнатур, docstring, импортов "
            "или связей зависимостей."
        ),
    },
    "zh": {
        "codepact_context": "Codepact 上下文",
        "table_of_contents": "目录",
        "project_map": "项目地图",
        "task_context": "任务上下文",
        "in_depth_code": "深入代码",
        "system_instructions": "系统指令",
        "priority": "优先级",
        "file": "文件",
        "detected_language": "检测到的语言",
        "reason": "原因",
        "graph_distance": "图距离",
        "local_dependencies": "本地依赖",
        "task": "任务",
        "token_budget": "Token 预算",
        "model_tokenizer": "模型分词器",
        "files_ranked_high": "高优先级文件",
        "files_ranked_medium": "中优先级文件",
        "files_ranked_low": "低优先级文件",
        "priority_heading": "{priority} 优先级",
        "summary": "摘要",
        "none": "无",
        "not_available": "不可用",
        "minimal_compressed": "上下文已被强力压缩以适配 token 限制。",
        "emergency_compressed": "已强力压缩以适配 token 限制。",
        "code_omitted": "由于 token 限制过小，连一个代码片段也无法包含。",
        "debug": "[调试] 预算: {budget}, 已用: {used}, 策略: {strategy}.",
        "strategy_full_code": "完整代码",
        "strategy_snipped": "片段",
        "compression_warning": "已强力压缩以适配 {limit} 限制",
        "system_instruction_body": (
            "使用这个筛选后的仓库上下文来完成任务。将 HIGH 文件视为权威实现细节，"
            "MEDIUM 文件视为依赖契约，LOW 文件视为压缩后的方向信息。除非隐藏细节"
            "能直接从可见签名、文档字符串、导入或依赖关系推出，否则不要假设它们。"
        ),
    },
    "ja": {
        "codepact_context": "Codepact コンテキスト",
        "table_of_contents": "目次",
        "project_map": "プロジェクトマップ",
        "task_context": "タスクコンテキスト",
        "in_depth_code": "詳細コード",
        "system_instructions": "システム指示",
        "priority": "優先度",
        "file": "ファイル",
        "detected_language": "検出言語",
        "reason": "理由",
        "graph_distance": "グラフ距離",
        "local_dependencies": "ローカル依存",
        "task": "タスク",
        "token_budget": "トークン予算",
        "model_tokenizer": "モデル tokenizer",
        "files_ranked_high": "高優先度ファイル",
        "files_ranked_medium": "中優先度ファイル",
        "files_ranked_low": "低優先度ファイル",
        "priority_heading": "{priority} 優先度",
        "summary": "概要",
        "none": "なし",
        "not_available": "n/a",
        "minimal_compressed": "トークン上限に収めるため、コンテキストを強く圧縮しました。",
        "emergency_compressed": "トークン上限に収めるため強く圧縮しました。",
        "code_omitted": "トークン上限が小さすぎるため、コード片も含められませんでした。",
        "debug": "[Debug] 予算: {budget}, 使用: {used}, 戦略: {strategy}.",
        "strategy_full_code": "FullCode",
        "strategy_snipped": "Snipped",
        "compression_warning": "{limit} 上限に収めるため強く圧縮しました",
        "system_instruction_body": (
            "この選別済みリポジトリコンテキストを使ってタスクを解決してください。"
            "HIGH ファイルは実装の正本、MEDIUM ファイルは依存契約、LOW ファイルは"
            "圧縮された方向づけとして扱ってください。見えているシグネチャ、docstring、"
            "import、依存関係から直接導けない実装詳細は仮定しないでください。"
        ),
    },
    "hi": {
        "codepact_context": "Codepact संदर्भ",
        "table_of_contents": "विषय सूची",
        "project_map": "प्रोजेक्ट मैप",
        "task_context": "टास्क संदर्भ",
        "in_depth_code": "विस्तृत कोड",
        "system_instructions": "सिस्टम निर्देश",
        "priority": "प्राथमिकता",
        "file": "फाइल",
        "detected_language": "पहचानी गई भाषा",
        "reason": "कारण",
        "graph_distance": "ग्राफ दूरी",
        "local_dependencies": "स्थानीय dependencies",
        "task": "टास्क",
        "token_budget": "टोकन बजट",
        "model_tokenizer": "मॉडल tokenizer",
        "files_ranked_high": "High priority फाइलें",
        "files_ranked_medium": "Medium priority फाइलें",
        "files_ranked_low": "Low priority फाइलें",
        "priority_heading": "{priority} प्राथमिकता",
        "summary": "सारांश",
        "none": "कोई नहीं",
        "not_available": "लागू नहीं",
        "minimal_compressed": "टोकन सीमा में फिट करने के लिए संदर्भ को आक्रामक रूप से compress किया गया।",
        "emergency_compressed": "टोकन सीमा में फिट करने के लिए आक्रामक compression किया गया।",
        "code_omitted": "टोकन सीमा इतनी छोटी है कि एक snippet भी शामिल नहीं हो सकता।",
        "debug": "[Debug] बजट: {budget}, उपयोग: {used}, रणनीति: {strategy}.",
        "strategy_full_code": "FullCode",
        "strategy_snipped": "Snipped",
        "compression_warning": "{limit} सीमा में फिट करने के लिए आक्रामक compression किया गया",
        "system_instruction_body": (
            "इस sifted repository context से टास्क हल करें। HIGH files को authoritative "
            "implementation detail, MEDIUM files को dependency contracts, और LOW files को "
            "compressed orientation मानें। Visible signatures, docstrings, imports या "
            "dependency relationships से सीधे न निकले details assume न करें।"
        ),
    },
}


def normalize_locale(locale: str | None) -> Locale:
    """Return a supported locale, defaulting to English."""
    value = (locale or "en").lower().split("-")[0]
    if value in SUPPORTED_LOCALES:
        return value  # type: ignore[return-value]
    return "en"


def translate(locale: str | None, key: str, **values: object) -> str:
    """Translate a known UI/output label for generated Markdown."""
    normalized = normalize_locale(locale)
    template = MESSAGES[normalized].get(key) or MESSAGES["en"].get(key) or key
    if values:
        return template.format(**values)
    return template
