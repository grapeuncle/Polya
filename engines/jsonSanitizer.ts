// 信任 LLM 在 JSON 字符串中正确转义 LaTeX 反斜杠（\\frac、\\sqrt 等）。
// 不再对原始文本做预处理，避免正则误伤合法的 JSON 转义序列（如 \\n 换行被错误转义）。
// 关于 LaTeX 转义的明确要求已放在 SYSTEM_PROMPT 中。

export function sanitizeLatexJson(jsonText: string): string {
  // no-op：信任 LLM 输出，原样返回
  return jsonText;
}
