/**
 * エンゲージメント管理ツール / Engagement management tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ADM_PHASES, findDeliverable, findPhase, text, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  ACTION_STATUSES,
  CONFIDENCE_DEFINITIONS,
  CONFIDENCE_LEVELS,
  DECISION_STATUSES,
  DELIVERABLE_STATUSES,
  EngagementInputError,
  EngagementValueError,
  INFLUENCE_LEVELS,
  OUTPUT_LIMITS,
  PHASE_STATUSES,
  PRIORITIES,
  RISK_LEVELS,
  RISK_STATUSES,
  TEXT_LIMITS,
  assertEngagementProfile,
  assertTextLimit,
  assertTextListLimit,
  capCell,
  capNotice,
  capRows,
  checkProvenance,
  createEngagement,
  NO_SOURCE_LABEL,
  NO_SOURCE_MARK,
  hasProvenance,
  makeId,
  mergeProvenance,
  now,
  sourceCell,
  summarizeProgress,
  summarizeProvenance,
  type Action,
  type Decision,
  type DeliverableProgress,
  type Engagement,
  type Provenance,
  type ProvenanceInput,
  type Risk,
  type Stakeholder,
  type TextFieldKind,
} from '../engagement/model.js';
import { deleteEngagement, loadEngagement, saveEngagement } from '../engagement/store.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
// 絞り込みの引数名は get_dashboard と 1 か所で共有する(案内文と実際の引数がずれないため)
import { dashboardCompactSchema, dashboardLimitSchema } from './dashboard.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

// ---------------------------------------------------------------------------
// 入力長の検査 / Input length guards
//
// 上限は `engagement/model.ts` に 1 か所だけ置いてあるが、**保存の直前では手遅れ**。
// `update_engagement` は `createEngagement` を通らず、`saveEngagement` が索引を作るのは
// ファイルを書いた後なので、モデル側からは止められない(実測: name に 10 万字を渡すと
// index.json が 100,216 文字、応答が 101,015 文字になった)。
// そのため**ハンドラの冒頭**、状態を読む前に検査してここで弾く。
//
// ここのヘルパは engagements.ts / roadmap.ts / documents.ts からも使う。
// `tools/common.ts` は他の作業と衝突するため触らず、この 1 か所に集約している。
// ---------------------------------------------------------------------------

/** 上限超過の文面。**入力そのものは絶対に載せない**(会話が入力で埋まるため) */
function tooLongMessage(field: string, limit: number, actual: number, hint: Bilingual, lang: Lang): string {
  return msg(
    `入力が長すぎます: ${field} は ${limit} 文字までですが ${actual.toLocaleString('en-US')} 文字ありました。${hint.ja}`,
    `Input too long: ${field} accepts at most ${limit} characters but received ${actual.toLocaleString('en-US')}. ${hint.en}`,
    lang,
  );
}

/** 件数超過の文面 */
function tooManyMessage(field: string, limit: number, actual: number, lang: Lang): string {
  return msg(
    `項目が多すぎます: ${field} は ${limit} 件までですが ${actual.toLocaleString('en-US')} 件ありました。何回かに分けて渡してください。`,
    `Too many entries: ${field} accepts at most ${limit} but received ${actual.toLocaleString('en-US')}. Send them in several calls.`,
    lang,
  );
}

/**
 * 上限を超えたときの逃がし先。`TEXT_LIMITS` の hint は保存する内容(表題・説明)向けなので、
 * ID・フェーズ・四半期のような「決まった形の短い値」にはこちらを使う。
 * 上限の話だけして「ではどう直すのか」を書かないと、利用者は同じ値を貼り直すしかない。
 */
export const ID_HINT: Bilingual = {
  ja: 'ID は登録時に発行される短い文字列です。`get_engagement` / `get_roadmap` で一覧を確認してください。',
  en: 'An id is the short string issued when the entry was created; list them with `get_engagement` or `get_roadmap`.',
};

export const PHASE_HINT: Bilingual = {
  ja: 'フェーズは短い ID(a〜h など)で指定します。一覧は `reference` に `of: "adm-phase"` を渡すと出ます。',
  en: 'A phase is given as a short id (a to h); list them by calling `reference` with `of: "adm-phase"`.',
};

export const QUARTER_HINT: Bilingual = {
  ja: '時期は四半期表記(例: 2027-Q1)で書きます。',
  en: 'Timing is written as a quarter, for example 2027-Q1.',
};

/**
 * 文字列 1 件の上限検査。問題があれば利用者向けの文面、無ければ null。
 *
 * `hint` を渡すと逃がし先の文言を差し替えられる(ID など、種別の既定 hint が合わない場合)。
 * `EngagementInputError` 以外はここでは握りつぶさず投げ直す。呼び出し側の
 * ハンドラは全体を try/catch しているため、MCP サーバーは落ちない。
 */
export function checkText(
  field: string,
  value: unknown,
  kind: TextFieldKind,
  lang: Lang,
  hint: Bilingual = TEXT_LIMITS[kind].hint,
): string | null {
  try {
    assertTextLimit(field, value, kind);
    return null;
  } catch (error) {
    if (error instanceof EngagementInputError) {
      return tooLongMessage(error.field, error.limit, error.actual, hint, lang);
    }
    throw error;
  }
}

/** 文字列配列の件数と各要素の長さを検査する */
export function checkTextList(
  field: string,
  values: unknown,
  kind: TextFieldKind,
  lang: Lang,
  hint: Bilingual = TEXT_LIMITS[kind].hint,
): string | null {
  try {
    assertTextListLimit(field, values, kind);
    return null;
  } catch (error) {
    if (error instanceof EngagementInputError) {
      // 件数超過は field がそのまま、長さ超過は field[i] になる
      return error.field === field
        ? tooManyMessage(error.field, error.limit, error.actual, lang)
        : tooLongMessage(error.field, error.limit, error.actual, hint, lang);
    }
    throw error;
  }
}

/** オブジェクト配列の件数だけを検査する(各要素の中身は呼び出し側で個別に見る) */
export function checkCount(field: string, values: unknown, lang: Lang): string | null {
  try {
    assertTextListLimit(field, values);
    return null;
  } catch (error) {
    if (error instanceof EngagementInputError) {
      return tooManyMessage(error.field, error.limit, error.actual, lang);
    }
    throw error;
  }
}

/** フィールド名から `TEXT_LIMITS` の種別を引く(案件の基本情報用) */
const PROFILE_KIND: Record<string, TextFieldKind> = {
  name: 'name',
  client: 'client',
  industry: 'industry',
  description: 'text',
  scope: 'text',
};

/** 案件の基本情報(名称・クライアント・業界・概要・スコープ)をまとめて検査する */
export function checkProfile(
  input: { name?: unknown; client?: unknown; industry?: unknown; description?: unknown; scope?: unknown },
  lang: Lang,
): string | null {
  try {
    assertEngagementProfile(input);
    return null;
  } catch (error) {
    if (error instanceof EngagementInputError) {
      const kind = PROFILE_KIND[error.field] ?? 'text';
      return tooLongMessage(error.field, error.limit, error.actual, TEXT_LIMITS[kind].hint, lang);
    }
    throw error;
  }
}

/** 検査を順に走らせ、最初に見つかった問題を返す(遅延評価なので無駄な文面を作らない) */
export function runChecks(checks: (() => string | null)[]): string | null {
  for (const check of checks) {
    const problem = check();
    if (problem) return problem;
  }
  return null;
}

/**
 * 上限超過をツールのエラー応答に整える。
 * 「保存していない」ことを必ず添える — これが無いと、利用者は一部だけ書き込まれたのかを疑う。
 */
export function limitErrorResult(problem: string, lang: Lang): ToolResult {
  return errorResult(
    // 「長さを直して」とは書かない。この経路には出典・確度の矛盾など長さと無関係な指摘も乗る。
    // 実測: stated なのに出典が空という指摘の直後に「長さを直して」と出ていた。
    `${problem}\n\n${msg(
      'この呼び出しでは何も保存していません。上の指摘を直して、もう一度同じ内容を渡してください。',
      'Nothing was saved by this call. Fix the point above and send the same request again.',
      lang,
    )}`,
  );
}

/**
 * 想定外の例外をツールのエラー応答に整える(ハンドラから例外を投げないための最後の受け皿)。
 *
 * ただし `EngagementValueError` は**想定内**の入力の誤りなので、ここで別扱いにする。
 * 実測: 既存項目に `confidence:"stated"` だけを渡すと(出典は付いていない)、
 * この受け皿まで飛んで「想定外のエラーが発生しました」+ 英語だけの本文 +
 * 「保存内容は変わっていない可能性が高い」と出ていた。実際には値を検査して
 * **確実に何も保存していない**ので、利用者に現状確認をさせる理由が無い。
 */
export function unexpectedErrorResult(tool: string, error: unknown, lang: Lang): ToolResult {
  if (error instanceof EngagementValueError) {
    return limitErrorResult(`${error.field}: ${msg(error.detail.ja, error.detail.en, lang)}`, lang);
  }
  const detail = capCell(error instanceof Error ? error.message : String(error), 200);
  return errorResult(
    msg(
      `\`${tool}\` の処理中に想定外のエラーが発生しました: ${detail}。保存内容は変わっていない可能性が高いので、\`get_engagement\` で現状を確認してください。`,
      `\`${tool}\` hit an unexpected error: ${detail}. The stored data is most likely unchanged; check it with \`get_engagement\`.`,
      lang,
    ),
  );
}

/** エラー文に差し込む利用者入力の短縮(60 字 + 残り字数) */
function echo(value: string): string {
  return capCell(value, 60);
}

/** フェーズ参照を正規化する。未知の値は undefined。 */
function resolvePhaseId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return findPhase(value)?.id;
}

// ---------------------------------------------------------------------------
// 出典と確度の入力 / Provenance input
//
// 台帳に載る項目は「文書にそう書いてあった」ものと「こちらが導いた」ものが混ざる。
// 欄が無いと両者が同じ顔をして、後から**どちらだったか誰も分からなくなる**。
// 実際の案件では書き手が `role` の末尾に「(p.5)」と手で足していた。
// 手書きの出典は表の整形で消え、機械で数えられない。だから引数として受ける。
// ---------------------------------------------------------------------------

/**
 * `source` の説明文。**具体例を必ず入れる。**
 * 「出典」とだけ書くと "NEC" や "報告書" のような、後から辿れない値が入ってくる。
 *
 * **短く保つこと。** この文字列は `provenanceFields()` 経由で 5 種別
 * (risks / decisions / actions / stakeholders / deliverables)に複製されるので、
 * ここで 1 文字増やすと tools/list は 5 文字増える。詳しい約束事は
 * `update_engagement` のツール説明に 1 回だけ書く。
 *
 * 英語側に例を再掲しない。例はファイル名・ページ番号でほぼラテン文字なので、
 * 日本語側の 1 組をそのまま読める(再掲は 5 か所ぶん重複するだけだった)。
 */
export const SOURCE_DESC =
  '出典。例 "csr2026.pdf p.17 図3" / "2026-08-14 ヒアリング(情シス部長)"' +
  ' / Where it came from';

/**
 * `confidence` の説明文。**省略時に何が起きるか**をここで約束する。
 * SOURCE_DESC と同じく 5 種別に複製されるので短く保つ。
 */
export const CONFIDENCE_DESC =
  '確度。省略は未設定のまま(stated にしない) / omitted stays unset, never stated';

/**
 * 5 種類の入力に同じ形で足す(欄名が種別ごとに違うと機械で数えられない)。
 *
 * **毎回あたらしい zod インスタンスを作る**のが肝。1 個のインスタンスを 5 か所に
 * 使い回すと zod-to-json-schema が重複を検出して
 * `{"$ref":"#/properties/risks/items/properties/source"}` に畳んでしまい、
 * risks 以外の 4 種別から説明文が消える(実測)。$ref を解決しない読み手には
 * 「何を書く欄なのか」が届かなくなるので、ここは意図的に複製する。
 */
export function provenanceFields() {
  return {
    source: z.string().optional().describe(SOURCE_DESC),
    confidence: z.enum(CONFIDENCE_LEVELS).optional().describe(CONFIDENCE_DESC),
  };
}

/**
 * 出典・確度を項目に反映する。
 *
 * 引数を渡さなければ今の値を保ち、空文字を渡すと消す(`mergeProvenance` の約束)。
 * 検査は `runChecks` で先に済ませてあるので、ここで投げることは無い。
 */
export function applyProvenance<T extends Provenance>(item: T, input: ProvenanceInput, field: string): void {
  if (input.source === undefined && input.confidence === undefined) return;
  const merged = mergeProvenance(item, input, field);
  if (merged.source === undefined) delete item.source;
  else item.source = merged.source;
  if (merged.confidence === undefined) delete item.confidence;
  else item.confidence = merged.confidence;
}

/** この呼び出しで触った項目(出典の付き具合をその場で見せるため) */
export interface TouchedEntry {
  kind: string;
  label: string;
  id: string;
  entity: Provenance;
}

/**
 * 出典の付き具合を返す節を組み立てる。
 *
 * ここが**この機能の要**。入力欄を足しただけでは誰も埋めない。
 * 「いま入れた分のうち何件が出典なしか」「台帳全体で何件残っているか」を毎回突き返し、
 * 最後に **id を差した具体的な次の一手**で終える。
 */
export function renderProvenanceSection(engagement: Engagement, touched: TouchedEntry[], l: Lang): string[] {
  const out: string[] = [];
  const summary = summarizeProvenance(engagement);
  if (summary.total === 0) return out;

  const noSource = touched.filter((t) => !hasProvenance(t.entity));
  const noConfidence = touched.filter((t) => !t.entity.confidence);

  out.push('');
  out.push(`**${msg('出典', 'Provenance', l)}**`);
  out.push('');

  if (touched.length > 0) {
    out.push(
      `- ${msg(
        // 語は表・凡例・健全性チェックと揃える(`? 出所未記入`)。同じ状態を
        // 「出典なし」とここだけ別の語で呼ぶと、凡例に載っていない語が最初に目に入る。
        `この呼び出しで登録・更新: ${touched.length} 件(${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja} ${noSource.length} 件 / 確度未設定 ${noConfidence.length} 件)`,
        `This call touched ${touched.length} entr${touched.length === 1 ? 'y' : 'ies'} (${noSource.length} without a source, ${noConfidence.length} with confidence unset)`,
        l,
      )}`,
    );
    if (noConfidence.length > 0) {
      // 省略された確度を黙って stated にはしない。何をしたかをここで言い切る。
      out.push(
        `  - ${msg(
          '確度が省略された項目は**未設定のまま**保存しました(stated にはしていません)。',
          'Entries with confidence omitted were stored with it **unset** — they were not recorded as stated.',
          l,
        )}`,
      );
    }
  }

  const c = summary.byConfidence;
  const marks = CONFIDENCE_DEFINITIONS;
  // 括弧まで日英で分ける。en に全角括弧が混ざると `lang="en"` の約束が崩れる。
  const counts = (one: 'ja' | 'en'): string =>
    `${marks.stated.marker} ${text(marks.stated.label, one)} ${c.stated} / ` +
    `${marks.inferred.marker} ${text(marks.inferred.label, one)} ${c.inferred} / ` +
    `${marks.unknown.marker} ${text(marks.unknown.label, one)} ${c.unknown} / ` +
    `${one === 'ja' ? '未設定' : 'unset'} ${c.unset}`;
  out.push(
    `- ${msg(
      `台帳全体: ${summary.total} 件中 ${summary.withoutSource} 件が ${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}(${counts('ja')})`,
      `Whole ledger: ${summary.withoutSource} of ${summary.total} entries have no source (${counts('en')})`,
      l,
    )}`,
  );

  if (touched.length > 0) {
    out.push('');
    out.push(`| ${msg('種別', 'Kind', l)} | ${msg('項目', 'Entry', l)} | ${msg('出典・確度', 'Source / confidence', l)} |`);
    out.push('| --- | --- | --- |');
    const capped = capRows(touched, OUTPUT_LIMITS.rows);
    for (const t of capped.rows) {
      const label = capCell(t.label, 60).replace(/\|/g, '\\|');
      // `sourceCell` を使う。`provenanceCell` は出典も確度も無い行に `—` を返すため、
      // 同じ応答の中でダッシュボードの表は `? 出所未記入`、こちらは `—` と割れていた。
      out.push(`| ${t.kind} | ${label} \`${t.id}\` | ${sourceCell(t.entity, l)} |`);
    }
    const notice = capNotice(
      capped,
      { ja: '全件は `get_engagement` で確認してください。', en: 'See them all with `get_engagement`.' },
      l,
    );
    if (notice) out.push('');
    if (notice) out.push(notice);
  }

  out.push('');
  if (summary.withoutSource === 0) {
    out.push(
      c.unset > 0
        ? msg(
            `次の一手: ${summary.total} 件すべてに出典が付いています。残りは確度が未設定の ${c.unset} 件です。` +
              '原文を指させるものは confidence="stated"、導いたものは confidence="inferred" を付けてください。',
            `Next: all ${summary.total} entries carry a source. What remains is the ${c.unset} with confidence unset: ` +
              'set confidence="stated" where the passage can be pointed at, confidence="inferred" where it was derived.',
            l,
          )
        : msg(
            `次の一手: ${summary.total} 件すべてに出典と確度が付いています。` +
              '△ 推測の項目はまだ相手に確認できていない項目です。次の打ち合わせで確認し、確認できたら confidence="stated" に、否定されたら消してください。',
            `Next: all ${summary.total} entries carry both a source and a confidence. ` +
              'The △ inferred ones are the unconfirmed ones: raise them at the next meeting, then set confidence="stated" once confirmed, or delete them if the client says otherwise.',
            l,
          ),
    );
    return out;
  }

  // 具体例は実在の id を差す。「出典を付けましょう」だけでは誰も動かない。
  // 例に使えるのは update_engagement が受ける 5 種別だけ。ロードマップ側の項目
  // (transition / workPackage / assessment)を例に出すと、そのまま打って必ず止まる。
  const argNames: Record<string, string> = {
    risk: 'risks',
    decision: 'decisions',
    action: 'actions',
    stakeholder: 'stakeholders',
    deliverable: 'deliverables',
  };
  const example =
    noSource.find((t) => argNames[t.kind]) ?? summary.missing.find((m) => argNames[m.kind] && m.id.length > 0);
  const exampleId = example?.id ?? '';
  const argName = example ? argNames[example.kind] ?? 'risks' : 'risks';
  out.push(
    msg(
      `次の一手: 出典が無い ${summary.withoutSource} 件に出典を足してください。` +
        (exampleId
          ? `例: \`update_engagement\` に \`${argName}: [{ id: "${exampleId}", source: "csr2026.pdf p.5", confidence: "stated" }]\` を渡す。`
          : '') +
        '文書に書かれていないものは confidence="inferred" にして source に「何から導いたか」を書き、' +
        '出所を辿れないものは confidence="unknown" にしたうえで、確認するか消すかをその場で決めてください。',
      `Next: attach a source to the ${summary.withoutSource} ${summary.withoutSource === 1 ? 'entry that lacks' : 'entries that lack'} one. ` +
        (exampleId
          ? `For example, call \`update_engagement\` with \`${argName}: [{ id: "${exampleId}", source: "csr2026.pdf p.5", confidence: "stated" }]\`. `
          : '') +
        'Use confidence="inferred" with what it was derived from in source when the document does not say it, ' +
        'and confidence="unknown" when the origin cannot be traced — then decide, there and then, to confirm it or delete it.',
      l,
    ),
  );
  return out;
}

const riskInput = z.object({
  id: z.string().optional().describe('既存リスクの ID。省略すると新規追加 / Existing risk id; omit to add a new one'),
  ...provenanceFields(),
  title: z.string().optional(),
  description: z.string().optional(),
  level: z.enum(RISK_LEVELS).optional().describe('対策前 / Before mitigation'),
  residualLevel: z.enum(RISK_LEVELS).optional().describe('対策後の残存 / Residual'),
  status: z.enum(RISK_STATUSES).optional(),
  owner: z.string().optional(),
  mitigation: z.string().optional(),
  phase: z.string().optional(),
});

const decisionInput = z.object({
  id: z.string().optional(),
  ...provenanceFields(),
  // 決定だけは新規登録に 2 欄要る。どちらが欠けても登録されないので、スキーマ側で言っておく
  title: z.string().optional().describe('見出し(新規は decision と併せて必須) / Title, required with decision for a new entry'),
  context: z.string().optional().describe('背景・選択肢 / Background, options'),
  decision: z.string().optional().describe('決定内容(新規は必須) / The decision, required for a new entry'),
  rationale: z.string().optional().describe('根拠 / Why'),
  status: z.enum(DECISION_STATUSES).optional(),
  decidedBy: z.string().optional(),
  phase: z.string().optional(),
});

const actionInput = z.object({
  id: z.string().optional(),
  ...provenanceFields(),
  title: z.string().optional(),
  owner: z.string().optional(),
  due: z.string().optional().describe('期限 / Due YYYY-MM-DD'),
  status: z.enum(ACTION_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  phase: z.string().optional(),
  note: z.string().optional(),
});

const stakeholderInput = z.object({
  id: z.string().optional(),
  ...provenanceFields(),
  name: z.string().optional(),
  role: z.string().optional(),
  organization: z.string().optional(),
  influence: z.enum(INFLUENCE_LEVELS).optional(),
  interest: z.enum(INFLUENCE_LEVELS).optional(),
  concerns: z.array(z.string()).optional().describe('関心事(本人の言葉で)/ Concerns, verbatim'),
  approach: z.string().optional().describe('関与方針 / How to engage'),
});

const deliverableInput = z.object({
  id: z.string().optional(),
  ...provenanceFields(),
  deliverableId: z.string().optional().describe('知識ベースの成果物 ID / KB deliverable id, e.g. architecture-vision'),
  name: z.string().optional(),
  status: z.enum(DELIVERABLE_STATUSES).optional(),
  owner: z.string().optional(),
  phase: z.string().optional(),
  link: z.string().optional(),
  note: z.string().optional(),
});

interface ChangeLog {
  added: string[];
  updated: string[];
  removed: string[];
}

/** id 付きなら更新、なければ新規作成する汎用処理 */
function upsert<T extends { id: string; updatedAt: string }>(
  list: T[],
  input: { id?: string },
  build: () => T | null,
  apply: (item: T) => void,
  changes: ChangeLog,
  kind: string,
  labelOf: (item: T) => string,
  // 新規追加に要る欄の名前。「必須項目が足りません」だけでは何を足せばよいか分からない
  required: string,
): string | null {
  if (input.id) {
    const found = list.find((x) => x.id === input.id);
    if (!found) return `${kind}: id "${echo(input.id)}" not found`;
    apply(found);
    found.updatedAt = now();
    changes.updated.push(`${kind} ${labelOf(found)}`);
    return null;
  }
  const created = build();
  if (!created) {
    return (
      `${kind}: 新規追加には ${required} が要ります(渡されていないので、この項目は登録していません)。` +
      `既存の項目を直すつもりなら id を渡してください。 / ` +
      `A new ${kind} needs ${required}; this entry was not created. Pass id instead to update an existing one.`
    );
  }
  apply(created);
  list.push(created);
  changes.added.push(`${kind} ${labelOf(created)}`);
  return null;
}

export function registerEngagementTools(server: McpServer): void {
  server.registerTool(
    'start_engagement',
    {
      title: 'Start an engagement',
      description:
        'アーキテクチャ案件(エンゲージメント)を開始し、ADM フェーズ進捗を初期化して保存する。既存の案件がある場合は overwrite=true が必要。 / Start an engagement, initialize ADM phase progress, and persist it. Pass overwrite=true to replace an existing engagement.',
      inputSchema: {
        name: z.string().min(1).describe('案件名 / Engagement name'),
        client: z.string().optional().describe('クライアント・対象組織 / Client or target organization'),
        industry: z.string().optional().describe('業界 / Industry'),
        description: z.string().optional().describe('概要・背景 / Overview and background'),
        scope: z.string().optional().describe('スコープ(対象外も書くとよい) / Scope, ideally including exclusions'),
        currentPhase: z.string().optional().describe('開始フェーズ ID(既定: a) / Starting phase id, default "a"'),
        overwrite: z.boolean().default(false).describe('既存の案件を上書きする / Replace the existing engagement'),
        lang: langSchema,
      },
    },
    async ({ name, client, industry, description, scope, currentPhase, overwrite, lang }) => {
      const l = lang as Lang;
      try {
        // 上限検査は状態を読む前に済ませる。ここを通れば createEngagement は投げない。
        const problem = runChecks([
          () => checkProfile({ name, client, industry, description, scope }, l),
          () => checkText('currentPhase', currentPhase, 'title', l, PHASE_HINT),
        ]);
        if (problem) return limitErrorResult(problem, l);

        const existing = loadEngagement();
        if (existing && !overwrite) {
          return errorResult(
            msg(
              `既に案件「${echo(existing.name)}」が選択されています。別の案件を並行して持つなら \`create_engagement\`、切り替えるなら \`switch_engagement\` を使ってください。この案件を破棄して作り直す場合のみ overwrite=true を指定します(既存データは失われます)。参照だけなら \`get_engagement\` です。`,
              `The engagement "${echo(existing.name)}" is already selected. Use \`create_engagement\` to run another one alongside it, or \`switch_engagement\` to change the selection. Pass overwrite=true only to discard this engagement and start over (its data is lost). To just read it, use \`get_engagement\`.`,
              l,
            ),
          );
        }
        const phaseId = resolvePhaseId(currentPhase);
        if (currentPhase && !phaseId) {
          return errorResult(
            msg(
              `フェーズ「${echo(currentPhase)}」が見つかりません。利用可能: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              `Phase "${echo(currentPhase)}" not found. Available: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              l,
            ),
          );
        }
        // overwrite=true は「置き換え」。複数案件を保持できるようになったため、
        // 削除せずに保存すると旧案件が一覧に residue として残り、説明文と実態が食い違う。
        if (existing && overwrite) deleteEngagement(existing.id);

        const engagement = createEngagement({
          name,
          client,
          industry,
          description,
          scope,
          currentPhaseId: phaseId ?? 'a',
        });
        // 開始フェーズは進行中にしておく
        const startPhase = engagement.phases.find((p) => p.phaseId === engagement.currentPhaseId);
        if (startPhase) startPhase.status = 'in_progress';
        const saved = saveEngagement(engagement);

        const out: string[] = [];
        out.push(msg(`# 案件を開始しました: ${saved.name}`, `# Engagement started: ${saved.name}`, l));
        out.push('');
        out.push(`- ID: \`${saved.id}\``);
        const cur = findPhase(saved.currentPhaseId);
        if (cur) out.push(`- ${msg('現在フェーズ', 'Current phase', l)}: ${cur.code}. ${text(cur.name, l)}`);
        out.push('');
        // 台帳が空のいま、出典の約束を先に置く。項目が溜まってから遡って付けるのは実務上できない。
        out.push(
          msg(
            `次の一手: \`update_engagement\` で項目を登録します。**登録するときに必ず source と confidence を付けてください。** ` +
              `source は「どの資料のどこか / 誰にいつ聞いたか」(例: "csr2026.pdf p.5"、"2026-08-14 ヒアリング(情シス部長)")。` +
              `confidence は ${CONFIDENCE_DEFINITIONS.stated.marker} stated(原文を指させる) / ` +
              `${CONFIDENCE_DEFINITIONS.inferred.marker} inferred(書かれていないが導いた) / ` +
              `${CONFIDENCE_DEFINITIONS.unknown.marker} unknown(出所が辿れない)の 3 値です。` +
              `省略すると未設定のまま保存し、応答が ${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja} として数え続けます。`,
            `Next: register entries with \`update_engagement\`, and **attach source and confidence as you go.** ` +
              `source says which document and where, or who said it and when (for example "csr2026.pdf p.5", "2026-08-14 interview (Head of IT)"). ` +
              `confidence is one of ${CONFIDENCE_DEFINITIONS.stated.marker} stated (the passage can be pointed at), ` +
              `${CONFIDENCE_DEFINITIONS.inferred.marker} inferred (derived, not written), ` +
              `${CONFIDENCE_DEFINITIONS.unknown.marker} unknown (origin cannot be traced). ` +
              `Omit it and it stays unset, and every response keeps counting the entry as missing a source.`,
            l,
          ),
        );
        out.push('');
        out.push(renderDashboardMarkdown(saved, l));
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。SDK 任せにすると文面が制御できない。
        return unexpectedErrorResult('start_engagement', error, l);
      }
    },
  );

  server.registerTool(
    'get_engagement',
    {
      title: 'Get the current engagement',
      description:
        '保存されているエンゲージメントの内容を返す。format="json" を指定すると生の JSON を全件返す。Markdown では登録件数が多いと各表を上位のみに自動で絞り(切った旨と全件の見方を必ず表示)、compact=false で全件、limit で件数を変えられる。 / Return the stored engagement; pass format="json" for the complete raw JSON. In Markdown, large engagements have each table trimmed to its top rows automatically (always saying so and how to see the rest); pass compact=false for every row or limit to change how many.',
      inputSchema: {
        format: z.enum(['markdown', 'json']).default('markdown').describe('出力形式 / Output format'),
        compact: dashboardCompactSchema,
        limit: dashboardLimitSchema,
        lang: langSchema,
      },
    },
    async ({ format, compact, limit, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();
      if (!engagement) {
        return textResult(
          msg(
            'エンゲージメントが未作成です。`start_engagement` で開始してください。',
            'No engagement yet. Start one with `start_engagement`.',
            l,
          ),
        );
      }
      try {
        // json は「全件の見方」として案内している経路なので、絞り込みを一切かけない
        if (format === 'json') return textResult(JSON.stringify(engagement, null, 2));
        return textResult(renderDashboardMarkdown(engagement, l, { compact, limit }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return errorResult(
          msg(`案件の表示に失敗しました: ${detail}`, `Failed to render the engagement: ${detail}`, l),
        );
      }
    },
  );

  server.registerTool(
    'update_engagement',
    {
      title: 'Update the engagement',
      description:
        'エンゲージメントを部分更新する。フェーズ状態の変更、リスク・決定事項・アクション・ステークホルダー・成果物の追加/更新、メモの追記ができる。各項目は id を指定すれば更新、省略すれば新規追加。各項目には出典 source(例 "csr2026.pdf p.5")と確度 confidence(stated / inferred / unknown)を付けられる — 応答が出典の付いていない件数を毎回返す。 / Partially update the engagement: change phase statuses and add or update risks, decisions, actions, stakeholders, deliverables, and notes. Supply an id to update an entry, omit it to add one. Every entry can carry source (for example "csr2026.pdf p.5") and confidence (stated / inferred / unknown); the response reports how many entries still have no source. With confidence="inferred", record in source what the entry was derived from (e.g. "from the headcount on p.5 and the org chart on p.9").',
      inputSchema: {
        name: z.string().optional(),
        client: z.string().optional(),
        industry: z.string().optional(),
        description: z.string().optional(),
        scope: z.string().optional(),
        currentPhase: z.string().optional().describe('注力フェーズを切り替える / Switch the current phase'),
        phases: z
          .array(
            z.object({
              phase: z.string().describe('フェーズ ID / Phase id'),
              status: z.enum(PHASE_STATUSES),
              note: z.string().optional(),
            }),
          )
          .optional()
          .describe('フェーズ進捗の更新 / Phase progress updates'),
        risks: z.array(riskInput).optional(),
        decisions: z.array(decisionInput).optional(),
        actions: z.array(actionInput).optional(),
        stakeholders: z.array(stakeholderInput).optional(),
        deliverables: z.array(deliverableInput).optional(),
        notes: z.array(z.string()).optional().describe('メモを追記する / Append notes'),
        removeIds: z
          .array(z.string())
          .optional()
          .describe('削除する項目の ID(種別を問わず) / Ids to remove, any kind'),
        lang: langSchema,
      },
    },
    async (input) => {
      const l = input.lang as Lang;
      try {
        // --- 上限検査 ---
        // 読み込みも変更もする前に、渡された全フィールドの長さと件数を見る。
        // 1 か所でも超えていたら何も書かずに返す(部分的に保存された状態を作らない)。
        const problem = runChecks([
          () => checkProfile(input, l),
          () => checkText('currentPhase', input.currentPhase, 'title', l, PHASE_HINT),
          () => checkCount('phases', input.phases, l),
          () => checkCount('risks', input.risks, l),
          () => checkCount('decisions', input.decisions, l),
          () => checkCount('actions', input.actions, l),
          () => checkCount('stakeholders', input.stakeholders, l),
          () => checkCount('deliverables', input.deliverables, l),
          () => checkTextList('notes', input.notes, 'text', l),
          () => checkTextList('removeIds', input.removeIds, 'title', l, ID_HINT),
          ...(input.phases ?? []).flatMap((p, i) => [
            () => checkText(`phases[${i}].phase`, p.phase, 'title', l, PHASE_HINT),
            () => checkText(`phases[${i}].note`, p.note, 'text', l),
          ]),
          ...(input.risks ?? []).flatMap((r, i) => [
            () => checkText(`risks[${i}].id`, r.id, 'title', l, ID_HINT),
            () => checkText(`risks[${i}].title`, r.title, 'title', l),
            () => checkText(`risks[${i}].description`, r.description, 'text', l),
            () => checkText(`risks[${i}].owner`, r.owner, 'title', l),
            () => checkText(`risks[${i}].mitigation`, r.mitigation, 'text', l),
            () => checkText(`risks[${i}].phase`, r.phase, 'title', l, PHASE_HINT),
            () => checkProvenance(`risks[${i}]`, r, l),
          ]),
          ...(input.decisions ?? []).flatMap((d, i) => [
            () => checkText(`decisions[${i}].id`, d.id, 'title', l, ID_HINT),
            () => checkText(`decisions[${i}].title`, d.title, 'title', l),
            () => checkText(`decisions[${i}].context`, d.context, 'text', l),
            () => checkText(`decisions[${i}].decision`, d.decision, 'text', l),
            () => checkText(`decisions[${i}].rationale`, d.rationale, 'text', l),
            () => checkText(`decisions[${i}].decidedBy`, d.decidedBy, 'title', l),
            () => checkText(`decisions[${i}].phase`, d.phase, 'title', l, PHASE_HINT),
            () => checkProvenance(`decisions[${i}]`, d, l),
          ]),
          ...(input.actions ?? []).flatMap((a, i) => [
            () => checkText(`actions[${i}].id`, a.id, 'title', l, ID_HINT),
            () => checkText(`actions[${i}].title`, a.title, 'title', l),
            () => checkText(`actions[${i}].owner`, a.owner, 'title', l),
            () => checkText(`actions[${i}].due`, a.due, 'title', l),
            () => checkText(`actions[${i}].note`, a.note, 'text', l),
            () => checkText(`actions[${i}].phase`, a.phase, 'title', l, PHASE_HINT),
            () => checkProvenance(`actions[${i}]`, a, l),
          ]),
          ...(input.stakeholders ?? []).flatMap((s, i) => [
            () => checkText(`stakeholders[${i}].id`, s.id, 'title', l, ID_HINT),
            () => checkText(`stakeholders[${i}].name`, s.name, 'title', l),
            () => checkText(`stakeholders[${i}].role`, s.role, 'title', l),
            () => checkText(`stakeholders[${i}].organization`, s.organization, 'title', l),
            () => checkTextList(`stakeholders[${i}].concerns`, s.concerns, 'concern', l),
            () => checkText(`stakeholders[${i}].approach`, s.approach, 'text', l),
            () => checkProvenance(`stakeholders[${i}]`, s, l),
          ]),
          ...(input.deliverables ?? []).flatMap((d, i) => [
            () => checkText(`deliverables[${i}].id`, d.id, 'title', l, ID_HINT),
            () => checkText(`deliverables[${i}].deliverableId`, d.deliverableId, 'title', l, ID_HINT),
            () => checkText(`deliverables[${i}].name`, d.name, 'title', l),
            () => checkText(`deliverables[${i}].owner`, d.owner, 'title', l),
            () => checkText(`deliverables[${i}].link`, d.link, 'title', l),
            () => checkText(`deliverables[${i}].note`, d.note, 'text', l),
            () => checkText(`deliverables[${i}].phase`, d.phase, 'title', l, PHASE_HINT),
            () => checkProvenance(`deliverables[${i}]`, d, l),
          ]),
        ]);
        if (problem) return limitErrorResult(problem, l);

        const current = loadEngagement();
        if (!current) {
          return errorResult(
            msg(
              'エンゲージメントが未作成です。先に `start_engagement` を実行してください。',
              'No engagement yet. Run `start_engagement` first.',
              l,
            ),
          );
        }

        const e: Engagement = current;
        const changes: ChangeLog = { added: [], updated: [], removed: [] };
        const problems: string[] = [];
        // この呼び出しで触った項目。出典の付き具合を「いま入れた分」について即座に返すため。
        const touched: TouchedEntry[] = [];
        const timestamp = now();

        if (input.name) { e.name = input.name; changes.updated.push('name'); }
        if (input.client !== undefined) { e.client = input.client; changes.updated.push('client'); }
        if (input.industry !== undefined) { e.industry = input.industry; changes.updated.push('industry'); }
        if (input.description !== undefined) { e.description = input.description; changes.updated.push('description'); }
        if (input.scope !== undefined) { e.scope = input.scope; changes.updated.push('scope'); }

        if (input.currentPhase) {
          const id = resolvePhaseId(input.currentPhase);
          if (!id) problems.push(`currentPhase: "${echo(input.currentPhase)}" not found`);
          else {
            e.currentPhaseId = id;
            changes.updated.push(`currentPhase → ${findPhase(id)?.code ?? id}`);
          }
        }

        for (const p of input.phases ?? []) {
          const id = resolvePhaseId(p.phase);
          if (!id) {
            problems.push(`phases: "${echo(p.phase)}" not found`);
            continue;
          }
          let entry = e.phases.find((x) => x.phaseId === id);
          if (!entry) {
            entry = { phaseId: id, status: p.status, updatedAt: timestamp };
            e.phases.push(entry);
          }
          entry.status = p.status;
          if (p.note !== undefined) entry.note = p.note;
          entry.updatedAt = timestamp;
          changes.updated.push(`phase ${findPhase(id)?.code ?? id} → ${p.status}`);
        }

        for (const [i, r] of (input.risks ?? []).entries()) {
          const err = upsert<Risk>(
            e.risks,
            r,
            () =>
              r.title
                ? {
                    id: makeId('risk'),
                    title: r.title,
                    level: r.level ?? 'medium',
                    status: r.status ?? 'open',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }
                : null,
            (item) => {
              if (r.title !== undefined) item.title = r.title;
              if (r.description !== undefined) item.description = r.description;
              if (r.level !== undefined) item.level = r.level;
              if (r.residualLevel !== undefined) item.residualLevel = r.residualLevel;
              if (r.status !== undefined) item.status = r.status;
              if (r.owner !== undefined) item.owner = r.owner;
              if (r.mitigation !== undefined) item.mitigation = r.mitigation;
              if (r.phase !== undefined) item.phaseId = resolvePhaseId(r.phase);
              applyProvenance(item, r, `risks[${i}]`);
              touched.push({ kind: 'risk', label: item.title, id: item.id, entity: item });
            },
            changes,
            'risk',
            (item) => `"${echo(item.title)}" (\`${item.id}\`)`,
            'title',
          );
          if (err) problems.push(err);
        }

        for (const [i, d] of (input.decisions ?? []).entries()) {
          const err = upsert<Decision>(
            e.decisions,
            d,
            () =>
              d.title && d.decision
                ? {
                    id: makeId('dec'),
                    title: d.title,
                    decision: d.decision,
                    status: d.status ?? 'proposed',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }
                : null,
            (item) => {
              if (d.title !== undefined) item.title = d.title;
              if (d.context !== undefined) item.context = d.context;
              if (d.decision !== undefined) item.decision = d.decision;
              if (d.rationale !== undefined) item.rationale = d.rationale;
              if (d.status !== undefined) item.status = d.status;
              if (d.decidedBy !== undefined) item.decidedBy = d.decidedBy;
              if (d.phase !== undefined) item.phaseId = resolvePhaseId(d.phase);
              applyProvenance(item, d, `decisions[${i}]`);
              touched.push({ kind: 'decision', label: item.title, id: item.id, entity: item });
            },
            changes,
            'decision',
            (item) => `"${echo(item.title)}" (\`${item.id}\`)`,
            'title と decision / title and decision',
          );
          if (err) problems.push(err);
        }

        for (const [i, a] of (input.actions ?? []).entries()) {
          const err = upsert<Action>(
            e.actions,
            a,
            () =>
              a.title
                ? {
                    id: makeId('act'),
                    title: a.title,
                    status: a.status ?? 'todo',
                    priority: a.priority ?? 'medium',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }
                : null,
            (item) => {
              if (a.title !== undefined) item.title = a.title;
              if (a.owner !== undefined) item.owner = a.owner;
              if (a.due !== undefined) item.due = a.due;
              if (a.status !== undefined) item.status = a.status;
              if (a.priority !== undefined) item.priority = a.priority;
              if (a.note !== undefined) item.note = a.note;
              if (a.phase !== undefined) item.phaseId = resolvePhaseId(a.phase);
              applyProvenance(item, a, `actions[${i}]`);
              touched.push({ kind: 'action', label: item.title, id: item.id, entity: item });
            },
            changes,
            'action',
            (item) => `"${echo(item.title)}" (\`${item.id}\`)`,
            'title',
          );
          if (err) problems.push(err);
        }

        for (const [i, s] of (input.stakeholders ?? []).entries()) {
          const err = upsert<Stakeholder>(
            e.stakeholders,
            s,
            () =>
              s.name
                ? {
                    id: makeId('stk'),
                    name: s.name,
                    influence: s.influence ?? 'medium',
                    interest: s.interest ?? 'medium',
                    concerns: s.concerns ?? [],
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }
                : null,
            (item) => {
              if (s.name !== undefined) item.name = s.name;
              if (s.role !== undefined) item.role = s.role;
              if (s.organization !== undefined) item.organization = s.organization;
              if (s.influence !== undefined) item.influence = s.influence;
              if (s.interest !== undefined) item.interest = s.interest;
              if (s.concerns !== undefined) item.concerns = s.concerns;
              if (s.approach !== undefined) item.approach = s.approach;
              applyProvenance(item, s, `stakeholders[${i}]`);
              touched.push({ kind: 'stakeholder', label: item.name, id: item.id, entity: item });
            },
            changes,
            'stakeholder',
            (item) => `"${echo(item.name)}" (\`${item.id}\`)`,
            'name',
          );
          if (err) problems.push(err);
        }

        for (const [i, d] of (input.deliverables ?? []).entries()) {
          const known = d.deliverableId ? findDeliverable(d.deliverableId) : undefined;
          if (d.deliverableId && !known) {
            problems.push(`deliverables: knowledge-base id "${echo(d.deliverableId)}" not found`);
          }
          const err = upsert<DeliverableProgress>(
            e.deliverables,
            d,
            () => {
              const name = d.name ?? (known ? text(known.name, 'ja') : undefined);
              return name
                ? {
                    id: makeId('dlv'),
                    name,
                    status: d.status ?? 'not_started',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }
                : null;
            },
            (item) => {
              if (d.name !== undefined) item.name = d.name;
              if (known) {
                item.deliverableId = known.id;
                if (!d.phase && known.createdInPhaseIds.length > 0 && !item.phaseId) {
                  item.phaseId = known.createdInPhaseIds[0];
                }
              }
              if (d.status !== undefined) item.status = d.status;
              if (d.owner !== undefined) item.owner = d.owner;
              if (d.link !== undefined) item.link = d.link;
              if (d.note !== undefined) item.note = d.note;
              if (d.phase !== undefined) item.phaseId = resolvePhaseId(d.phase);
              applyProvenance(item, d, `deliverables[${i}]`);
              touched.push({ kind: 'deliverable', label: item.name, id: item.id, entity: item });
            },
            changes,
            'deliverable',
            (item) => `"${echo(item.name)}" (\`${item.id}\`)`,
            'name か deliverableId / name or deliverableId',
          );
          if (err) problems.push(err);
        }

        if (input.notes && input.notes.length > 0) {
          e.notes.push(...input.notes);
          changes.added.push(`${input.notes.length} note(s)`);
        }

        for (const id of input.removeIds ?? []) {
          let removed = false;
          const lists: [keyof Engagement, { id: string }[]][] = [
            ['risks', e.risks],
            ['decisions', e.decisions],
            ['actions', e.actions],
            ['stakeholders', e.stakeholders],
            ['deliverables', e.deliverables],
          ];
          for (const [kind, list] of lists) {
            const index = list.findIndex((x) => x.id === id);
            if (index >= 0) {
              list.splice(index, 1);
              changes.removed.push(`${String(kind)} \`${id}\``);
              removed = true;
              break;
            }
          }
          if (!removed) problems.push(`removeIds: "${echo(id)}" not found`);
        }

        const saved = saveEngagement(e);
        const progress = summarizeProgress(saved);

        const out: string[] = [];
        out.push(msg('# エンゲージメントを更新しました', '# Engagement updated', l));
        out.push('');
        // 1 回の呼び出しで 100 件まで更新できるので、変更一覧も警告も上限で切る。
        // 切ったことは capNotice が必ず書く(黙って落とさない)。
        const seeAll: Bilingual = {
          ja: '全件は `get_engagement` で確認してください。',
          en: 'See them all with `get_engagement`.',
        };
        const pushChanges = (heading: string, items: string[]): void => {
          if (items.length === 0) return;
          const capped = capRows(items, OUTPUT_LIMITS.rows);
          out.push(`- ${heading}: ${capped.rows.join(', ')}`);
          const notice = capNotice(capped, seeAll, l);
          if (notice) out.push(`  - ${notice}`);
        };
        pushChanges(msg('追加', 'Added', l), changes.added);
        pushChanges(msg('更新', 'Updated', l), changes.updated);
        pushChanges(msg('削除', 'Removed', l), changes.removed);
        if (changes.added.length + changes.updated.length + changes.removed.length === 0) {
          out.push(`- ${msg('変更なし', 'No changes applied', l)}`);
        }
        if (problems.length > 0) {
          out.push('');
          out.push(`**${msg('警告', 'Warnings', l)}**`);
          const capped = capRows(problems, OUTPUT_LIMITS.highlights);
          for (const p of capped.rows) out.push(`- ${p}`);
          const notice = capNotice(capped, {
            ja: '残りも同じ種類の問題です。上を直してから再実行してください。',
            en: 'The rest are the same kind of problem; fix these and run it again.',
          }, l);
          if (notice) out.push(`- ${notice}`);
        }
        out.push('');
        out.push(`${msg('進捗', 'Progress', l)}: ${progress.percent}% (${progress.completed}/${progress.total - progress.skipped})`);
        out.push(...renderProvenanceSection(saved, touched, l));
        out.push('');
        out.push(renderDashboardMarkdown(saved, l));
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。
        return unexpectedErrorResult('update_engagement', error, l);
      }
    },
  );
}
