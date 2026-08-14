/**
 * ツール共通のヘルパ / Shared tool helpers.
 */

import { z } from 'zod';
import type { Lang } from '../knowledge/index.js';

/** すべての参照系ツールが受け取る言語指定 */
export const langSchema = z
  .enum(['ja', 'en', 'both'])
  .default('both')
  .describe('出力言語 / Output language. "both" returns Japanese and English together.');

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/** テキスト 1 件の成功応答 */
export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** エラー応答(MCP のツールエラーとして返す) */
export function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** 言語に応じてメッセージを選ぶ小さなヘルパ */
export function msg(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja}\n${en}`;
}
