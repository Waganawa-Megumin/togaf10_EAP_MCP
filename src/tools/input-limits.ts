/**
 * 助言系ツールの入力上限とエコーの切り詰め / Input limits and echo capping for the advisory tools.
 *
 * 書き込み系(`src/engagement/model.ts` の `TEXT_LIMITS`)には以前から上限があったが、
 * 助言系のツールには無く、渡された本文をそのまま出力に混ぜていた。その結果
 * 「30 万字の入力 → 90 万バイトの応答」が実際に起きた。ここで二段構えにする。
 *
 * 1. zod の `.max(HARD_CHAR_CAP)` — 最後の防波堤。ここを超える文字列は
 *    ハンドラに届く前に弾く(巨大文字列の走査でメモリを食わないため)。
 *    zod のメッセージは `lang` を知らないので日英併記にせざるを得ない。
 * 2. ハンドラ内の `checkFreeText()` — 実際の上限(既定 20,000 文字)。
 *    `lang` が分かる場所なので、指定言語だけで「何文字までか / 何文字来たか /
 *    どうすればいいか」を返せる。通常はこちらが先に反応する。
 *
 * エラー文には巨大入力そのものを入れない(入れると応答がまた巨大になる)。
 */

import { z } from 'zod';
import type { Bilingual, Lang } from '../knowledge/index.js';
import { errorResult, msg, type ToolResult } from './common.js';

/** 自由記述の既定の上限。長い報告書 1 章ぶんは通る長さ */
export const FREE_TEXT_LIMIT = 20_000;

/**
 * 「手元の資料をそのまま入力に」を担う引数(`ingest_document` などの `text`)の上限。
 * ここだけは資料 1 本ぶんを受け取る前提なので大きい。
 */
export const DOCUMENT_TEXT_LIMIT = 500_000;

/** ID・名称・パスなど、1 行に収まるべき引数の上限 */
export const IDENTIFIER_LIMIT = 300;

/** ファイルパスの上限(OS の PATH_MAX より十分大きい) */
export const PATH_LIMIT = 4_096;

/** 最後の防波堤。zod で弾くので、ここを超える文字列はハンドラに届かない */
export const HARD_CHAR_CAP = 1_000_000;

/** 入力を出力にエコーするときの最大文字数 */
export const ECHO_LIMIT = 600;

/** 配列引数の既定の要素数上限 */
export const MAX_ITEMS = 100;

/** よく使う「どうすればいいか」。実在するツール名・引数名だけを書くこと */
export const HINTS = {
  /** 長い資料を渡したい場合の正規ルート */
  document: {
    ja: '章・節に切って渡すか、資料そのものを読ませたい場合は `ingest_document` / `summarize_document_for_architecture` に `text` (またはファイルなら `path`) で渡してください。',
    en: 'Split it into sections, or pass the material itself to `ingest_document` / `summarize_document_for_architecture` as `text` (or `path` for a file).',
  },
  /** 状況説明のような「要点を書く」引数 */
  situation: {
    ja: '要点だけを書いて渡すか、資料そのものは `summarize_document_for_architecture` に `text` で渡してから、その結果を要約して渡してください。',
    en: 'Send the key points only, or pass the material to `summarize_document_for_architecture` as `text` first and send its output instead.',
  },
  /** ID・名称のように短いはずの引数 */
  identifier: {
    ja: 'ここには ID か名称だけを入れてください(1 行に収まる長さ)。',
    en: 'Pass only the id or the name here (short enough to fit on one line).',
  },
  /** 一覧に並べる項目 */
  listItem: {
    ja: '1 項目 1 行の短い名前にして、背景や根拠は別の引数か別の呼び出しに分けてください。',
    en: 'Keep each entry to a short one-line name and move the background into another argument or another call.',
  },
} as const satisfies Record<string, Bilingual>;

/**
 * 自由記述の引数に使う zod スキーマ。
 *
 * `.max()` は最後の防波堤で、利用者に見せる本来の上限は `limit`(JSON Schema の
 * `description` にも書くので、クライアントは送る前に気づける)。
 */
export function freeTextSchema(description: string, limit: number = FREE_TEXT_LIMIT) {
  // **zod に上限を持たせない。** 理由は 2 つある。
  //
  // 1. 以前は `.max(HARD_CHAR_CAP)` を張っていたため、JSON Schema には
  //    `maxLength: 1000000` が出るのにハンドラは 20,000 で断る、という食い違いがあった。
  //    ツール一覧を読んで呼び出しを組み立てる側(= Claude)はスキーマを信じるので、
  //    嘘の上限を広告してはいけない。
  // 2. かといって `.max(limit)` にすると zod が先に弾き、**引数名を挙げた
  //    lang 準拠のエラー**(どのツールに渡し直せばいいかの案内つき)が出せなくなる。
  //    zod は呼び出し時の lang を知らないため、英語で呼ばれても日本語が混ざる。
  //
  // よって上限は説明文で正直に述べ、実際の判定はハンドラの `checkFreeText` が行う。
  // ハンドラは最初に長さを見るので、巨大な文字列が処理に流れることはない。
  return z.string().describe(
    `${description} — ${msg(
      `最大 ${limit.toLocaleString('en-US')} 文字`,
      `at most ${limit.toLocaleString('en-US')} characters`,
      'both',
    )}`,
  );
}

/** 検査したい 1 つのフィールド */
export interface FreeTextCheck {
  /** 利用者に見せる引数名(例: `situation`, `assets[3]`) */
  field: string;
  /** 検査対象。undefined / null / 文字列以外は「未指定」として通す */
  value: unknown;
  /** 上限。既定は `FREE_TEXT_LIMIT` */
  limit?: number;
  /** 「どうすればいいか」。既定は `HINTS.document` */
  hint?: Bilingual;
}

/** 上限超過を 1 件見つけたときの内訳 */
export interface FreeTextViolation {
  field: string;
  limit: number;
  actual: number;
  hint: Bilingual;
}

/** 最初に上限を超えたフィールドを返す。無ければ null */
export function findFreeTextViolation(checks: readonly FreeTextCheck[]): FreeTextViolation | null {
  for (const check of checks) {
    if (typeof check.value !== 'string') continue;
    const limit = check.limit ?? FREE_TEXT_LIMIT;
    if (check.value.length <= limit) continue;
    return {
      field: check.field,
      limit,
      actual: check.value.length,
      hint: check.hint ?? HINTS.document,
    };
  }
  return null;
}

/** 配列の要素数が多すぎないか調べる。無ければ null */
export function findTooManyItems(
  field: string,
  values: unknown,
  maxItems: number = MAX_ITEMS,
): { field: string; limit: number; actual: number } | null {
  if (!Array.isArray(values)) return null;
  if (values.length <= maxItems) return null;
  return { field, limit: maxItems, actual: values.length };
}

/**
 * 自由記述の上限をまとめて検査し、超えていればエラー応答を返す。
 *
 * 巨大入力そのものはエラー文に入れない — 入れると応答がまた巨大になり、
 * この修正の意味が無くなる。
 */
export function checkFreeText(checks: readonly FreeTextCheck[], lang: Lang): ToolResult | null {
  const violation = findFreeTextViolation(checks);
  if (!violation) return null;
  return tooLongResult(violation, lang);
}

/** 上限超過をツールのエラー応答に整える */
export function tooLongResult(violation: FreeTextViolation, lang: Lang): ToolResult {
  const { field, limit, actual, hint } = violation;
  const over = actual - limit;
  return errorResult(
    msg(
      `入力が長すぎます: \`${field}\` は ${limit.toLocaleString('en-US')} 文字までですが、` +
        `${actual.toLocaleString('en-US')} 文字ありました(${over.toLocaleString('en-US')} 文字超過)。\n` +
        `この呼び出しでは何も処理していません。${hint.ja}`,
      `Input too long: \`${field}\` accepts at most ${limit.toLocaleString('en-US')} characters but received ` +
        `${actual.toLocaleString('en-US')} (${over.toLocaleString('en-US')} over).\n` +
        `Nothing was processed by this call. ${hint.en}`,
      lang,
    ),
  );
}

/** 要素数超過をツールのエラー応答に整える */
export function tooManyItemsResult(
  violation: { field: string; limit: number; actual: number },
  lang: Lang,
): ToolResult {
  const { field, limit, actual } = violation;
  return errorResult(
    msg(
      `項目が多すぎます: \`${field}\` は ${limit.toLocaleString('en-US')} 件までですが、` +
        `${actual.toLocaleString('en-US')} 件ありました。\n` +
        'この呼び出しでは何も処理していません。重要なものに絞るか、何回かに分けて渡してください。',
      `Too many entries: \`${field}\` accepts at most ${limit.toLocaleString('en-US')} but received ` +
        `${actual.toLocaleString('en-US')}.\n` +
        'Nothing was processed by this call. Narrow it down to the important ones, or send them in several calls.',
      lang,
    ),
  );
}

/**
 * 利用者の入力を出力に載せるときの切り詰め。
 * 改行を畳み、`limit` 文字で切り、切ったことと全長を明示する。
 */
export function echoInput(value: string, lang: Lang, limit: number = ECHO_LIMIT): string {
  const flat = value.replace(/\s*\r?\n\s*/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return (
    `${flat.slice(0, limit)}…` +
    msg(
      `\n\n【全 ${flat.length.toLocaleString('en-US')} 文字のうち先頭 ${limit.toLocaleString('en-US')} 文字だけ表示しています】`,
      `\n\n[Showing the first ${limit.toLocaleString('en-US')} of ${flat.length.toLocaleString('en-US')} characters.]`,
      lang,
    )
  );
}

/**
 * 表のセル・エラー文に入れる短い引用。改行を畳み、`limit` 文字で切って残り字数を添える。
 * `echoInput` と違い 1 行に収まることを優先する。
 */
export function capInline(value: string, limit = 120): string {
  const flat = value.replace(/\s*\r?\n\s*/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit)}…(+${(flat.length - limit).toLocaleString('en-US')})`;
}
