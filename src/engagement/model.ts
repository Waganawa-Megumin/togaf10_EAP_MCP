/**
 * エンゲージメント状態モデル / Engagement state model.
 *
 * 1 つの「アーキテクチャ案件」の進行状況を表す。JSON でそのまま永続化される。
 */

import { randomBytes } from 'node:crypto';

import { ADM_PHASES, text, type Bilingual, type Lang } from '../knowledge/index.js';

export const PHASE_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_STATUSES = ['open', 'mitigating', 'closed', 'accepted'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const DECISION_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const ACTION_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INFLUENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export const DELIVERABLE_STATUSES = ['not_started', 'drafting', 'review', 'approved', 'baselined'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const WORK_PACKAGE_STATUSES = ['proposed', 'planned', 'in_progress', 'delivered', 'cancelled'] as const;
export type WorkPackageStatus = (typeof WORK_PACKAGE_STATUSES)[number];

export const ASSESSMENT_KINDS = ['maturity', 'readiness'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

// ---------------------------------------------------------------------------
// 出典と確度 / Provenance and confidence
// ---------------------------------------------------------------------------

/**
 * どこから来た事実かの確度 / How the entry came to be known.
 *
 * これが無いと、**文書から読み取った事実と、こちらの推測が台帳の中で同じ顔をする**。
 * 実際の案件では、書き手が `role` の末尾に「(p.5)」と手で足して凌いでいた。
 * 手で足した出典は表の整形で消えるし、機械で数えられない。だから型に入れる。
 *
 * 3 値の意味は**ここだけ**で定義する(表・図・点検が同じ定義を使うため)。
 */
export const CONFIDENCE_LEVELS = ['stated', 'inferred', 'unknown'] as const;
export type ProvenanceConfidence = (typeof CONFIDENCE_LEVELS)[number];

/** 確度 1 値の表示・意味 / Display and meaning of one confidence level. */
export interface ConfidenceDefinition {
  value: ProvenanceConfidence;
  /** 表の見出しやセルに出す短いラベル */
  label: Bilingual;
  /** 「どういうときにこれを選ぶか」 */
  meaning: Bilingual;
  /** 一覧で目を引かせるための印(絵文字は使わない) */
  marker: string;
}

export const CONFIDENCE_DEFINITIONS: Record<ProvenanceConfidence, ConfidenceDefinition> = {
  stated: {
    value: 'stated',
    label: { ja: '記載あり', en: 'stated' },
    meaning: {
      ja: '出典にそう書いてある。原文を指させる(ページ・行・発言者)。数字や固有名詞はここに入っていなければ会議で使えない。',
      en: 'The source says so and the passage can be pointed at (page, line, speaker). Figures and proper nouns are unusable in a meeting unless they sit here.',
    },
    marker: '●',
  },
  inferred: {
    value: 'inferred',
    label: { ja: '推測', en: 'inferred' },
    meaning: {
      ja: '書かれてはいないが、書かれていることから導いた。導いた根拠を source に書く。相手に確認するまで確定させない。',
      en: 'Not written down, but derived from what is. Record what it was derived from in source, and treat it as unconfirmed until the client agrees.',
    },
    marker: '△',
  },
  unknown: {
    value: 'unknown',
    label: { ja: '出所不明', en: 'unknown' },
    meaning: {
      ja: '出所が辿れない。後から消す判断ができないので、放置せず出典を足すか消すかを決める。',
      en: 'The origin cannot be traced. It can never be safely deleted later, so either attach a source or remove the entry.',
    },
    marker: '×',
  },
};

/**
 * 出典と確度 / Where an entry came from.
 *
 * 台帳に載る項目すべてが任意で持つ。**任意である**ことが重要で、
 * この欄が無い保存済み JSON も今までどおり読める。
 */
export interface Provenance {
  /** 出典の短い呼び名。例: `security-report.pdf p.5` / `2026-08-14 ヒアリング(情シス部長)` */
  source?: string;
  /** 記載あり / 推測 / 出所不明 */
  confidence?: ProvenanceConfidence;
}

/** `Provenance` を任意で持つ入力(ツールの引数など) */
export interface ProvenanceInput {
  source?: unknown;
  confidence?: unknown;
}

/** 確度のラベルを引く(未指定・未知の値は「未設定」) */
export function confidenceLabel(value: ProvenanceConfidence | undefined | null, lang: Lang = 'both'): string {
  const found = value ? CONFIDENCE_DEFINITIONS[value] : undefined;
  if (!found) return text({ ja: '未設定', en: 'not set' }, lang);
  return text(found.label, lang);
}

/** 確度の意味(「どういうときにこれを選ぶか」)を引く */
export function confidenceMeaning(value: ProvenanceConfidence | undefined | null, lang: Lang = 'both'): string {
  const found = value ? CONFIDENCE_DEFINITIONS[value] : undefined;
  if (!found) {
    return text(
      {
        ja: '確度が未設定です。出典を辿れるなら stated、導いたものなら inferred、辿れないなら unknown を入れてください。',
        en: 'Confidence is not set. Use stated when the source can be pointed at, inferred when it was derived, unknown when it cannot be traced.',
      },
      lang,
    );
  }
  return text(found.meaning, lang);
}

/** 出典が付いているか(空白だけの source は付いていない扱い) */
export function hasProvenance(entity: Provenance | null | undefined): boolean {
  if (!entity || typeof entity !== 'object') return false;
  return typeof entity.source === 'string' && entity.source.trim().length > 0;
}

/**
 * 出典を表示用に短く整える。改行と連続空白を畳み、長ければ切る。
 *
 * **パイプはエスケープしない。** Markdown の表に入れるときは、
 * 各ファイルが持つ `cell()` 相当を通すか、`provenanceCell` を使うこと。
 */
export function shortSource(value: string | undefined | null, max = 40): string {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '';
  const limit = Number.isFinite(max) && max > 1 ? Math.floor(max) : 40;
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * 表の 1 セルに入れる出典表示を作る(パイプはエスケープ済み。そのまま行に置ける)。
 * 出典も確度も無ければ `—`。
 */
export function provenanceCell(entity: Provenance | null | undefined, lang: Lang = 'both', max = 40): string {
  const src = shortSource(entity?.source, max).replace(/\|/g, '\\|');
  const conf = entity?.confidence ? CONFIDENCE_DEFINITIONS[entity.confidence] : undefined;
  if (!src && !conf) return '—';
  if (!conf) return src;
  const marked = `${conf.marker} ${text(conf.label, lang === 'both' ? 'ja' : lang)}`;
  if (src) return `${marked} ${src}`;
  // 確度だけが入っていて出典が空の行。とくに `● 記載あり` を単独で出すと
  // 「原文を指させる = 確認済み」に読めてしまうが、指す先が無い。
  // どこにも辿れないことを、印と同じセルの中で言い切る。
  //
  // ここで使う語は `NO_SOURCE_LABEL`(出所未記入)に揃える。以前は「出典なし」と
  // 書いていたが、凡例と `check_engagement_health` は同じ状態を「? 出所未記入」と
  // 呼ぶため、同じ状態に 2 つの語が付き、凡例に載っていない語が表に出ていた。
  // 印も `NO_SOURCE_MARK` を付けて、凡例の 4 つの印だけで読み切れるようにする。
  return `${marked}(${NO_SOURCE_MARK} ${text(NO_SOURCE_LABEL, lang === 'both' ? 'ja' : lang)})`;
}

/**
 * 「出典が 1 文字も書かれていない」行の印。
 *
 * `CONFIDENCE_DEFINITIONS.unknown.marker`(`×` 出所不明 = 出典は書いたが辿れない)とは**別物**。
 * 書き忘れと「書いたが辿れない」を同じ見た目にすると、埋めるべき行が見分けられなくなる。
 */
export const NO_SOURCE_MARK = '?';

export const NO_SOURCE_LABEL: Bilingual = { ja: '出所未記入', en: 'no source' };

/**
 * 表の出典セル 1 つ。**空欄は返さない。**
 *
 * `provenanceCell` は何も無いときに `—` を返すが、表の中では
 * 「未記入」と「そもそも欄が無い」の区別が付かず読み飛ばされる。
 * 出典列を出す表はこちらを使い、直後に凡例を置くこと。
 */
export function sourceCell(entity: Provenance | null | undefined, lang: Lang = 'both', max = 40): string {
  if (!hasProvenance(entity) && !entity?.confidence) {
    return `${NO_SOURCE_MARK} ${text(NO_SOURCE_LABEL, lang)}`;
  }
  return provenanceCell(entity, lang, max);
}

/**
 * 不正な値のエラー(長さではなく**値そのもの**が許されない場合)。
 *
 * `EngagementInputError` とは別の型にしてある。あちらは「長すぎる」専用で、
 * 受け手が `limit` / `actual` を文面に埋める前提になっているため。
 * `detail` は日英を分けて持たせてあり、呼び出し側が `lang` に合わせて出せる。
 */
export class EngagementValueError extends Error {
  readonly field: string;
  readonly allowed: readonly string[];
  readonly detail: Bilingual;

  constructor(field: string, allowed: readonly string[], detail: Bilingual) {
    super(`${detail.ja} / ${detail.en}`);
    this.name = 'EngagementValueError';
    this.field = field;
    this.allowed = allowed;
    this.detail = detail;
  }
}

/**
 * `confidence: "stated"` なのに出典が空、という**矛盾**のエラー。
 *
 * 「原文にそう書いてある」と宣言しながら、指す先が 1 文字も無い状態を保存させない。
 * この状態は後から誰にも検証できず、消す判断もできない(残り続ける)。
 *
 * `message` を**英語だけ**にしてあるのが肝。この例外はツール側の最後の受け皿
 * (`unexpectedErrorResult`)まで飛ぶことがあり、そこは `lang` を持たないまま
 * `error.message` をそのまま応答に埋める。`EngagementValueError` の既定どおり
 * 「日本語 / 英語」を連結すると、`lang: "en"` の応答に日本語が混ざる。
 * 日英そろった文面が要る呼び出し側は `detail` を `lang` で引くこと
 * (`checkProvenance` はそうしている)。
 */
export class ProvenanceConflictError extends EngagementValueError {
  constructor(field: string, detail: Bilingual, message: string) {
    super(field, ['inferred', 'unknown'], detail);
    this.name = 'ProvenanceConflictError';
    this.message = message;
  }
}

/** `field` に接頭辞を付ける(`risks[0]` → `risks[0].source`) */
function provenanceField(field: string, key: 'source' | 'confidence'): string {
  return field && field.length > 0 ? `${field}.${key}` : key;
}

/**
 * 出典・確度の入力を検査する。問題があれば投げる。
 *
 * - `source` が文字列でない → `EngagementValueError`
 * - `source` が長すぎる → `EngagementInputError`(長さ系と同じ扱いにする)
 * - `confidence` が 3 値以外 → `EngagementValueError`
 *
 * 空文字・空白だけの値は「未指定」として通す(正規化で落ちる)。
 */
export function assertProvenance(field: string, input: ProvenanceInput | null | undefined): void {
  if (!input || typeof input !== 'object') return;
  const { source, confidence } = input;
  if (source !== undefined && source !== null) {
    if (typeof source !== 'string') {
      throw new EngagementValueError(provenanceField(field, 'source'), [], {
        ja: `${provenanceField(field, 'source')} は文字列で渡してください(例: "security-report.pdf p.5")。`,
        en: `${provenanceField(field, 'source')} must be a string (for example "security-report.pdf p.5").`,
      });
    }
    assertTextLimit(provenanceField(field, 'source'), source, 'source');
  }
  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== 'string') {
      throw new EngagementValueError(provenanceField(field, 'confidence'), CONFIDENCE_LEVELS, {
        ja: `${provenanceField(field, 'confidence')} は ${CONFIDENCE_LEVELS.join(' / ')} のいずれかです。`,
        en: `${provenanceField(field, 'confidence')} must be one of ${CONFIDENCE_LEVELS.join(' / ')}.`,
      });
    }
    // 大文字小文字は問わない(`STATED` は通す。正規化で小文字に揃える)
    const trimmed = confidence.trim();
    if (trimmed.length > 0 && !isConfidence(trimmed.toLowerCase())) {
      throw new EngagementValueError(provenanceField(field, 'confidence'), CONFIDENCE_LEVELS, {
        ja:
          `${provenanceField(field, 'confidence')} に "${shortSource(trimmed, 40)}" は使えません。` +
          `${CONFIDENCE_LEVELS.join(' / ')} のいずれかを渡してください(記載あり / 推測 / 出所不明)。`,
        en:
          `${provenanceField(field, 'confidence')} does not accept "${shortSource(trimmed, 40)}". ` +
          `Pass one of ${CONFIDENCE_LEVELS.join(' / ')} (stated in the source / inferred / origin unknown).`,
      });
    }
  }
}

/** 3 値のどれかか */
export function isConfidence(value: unknown): value is ProvenanceConfidence {
  return typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 「stated なのに出典が空」を書き込ませない / A "stated" entry must carry a source
//
// 実測された問題: `confidence: "stated"`(=原文にそう書いてある)を宣言しながら
// `source` が 1 文字も無い項目が、そのまま保存できていた。
// 表示(`provenanceCell`)と `inspect_findings` は指摘するが、**書き込みは通っていた**。
// 出所不明のものを「原文にそう書いてある」と台帳に残すと、後から誰も裏を取れず、
// かといって根拠が無いので消す判断もできない。だから**書き込み時に止める**。
//
// 3 値のうち止めるのは `stated` だけ:
//  - `unknown` は「出所を辿れない」という意味そのものなので、出典が無くて当然。要求しない。
//  - `inferred` は「何から導いたか」を `source` に書くのが望ましいが、**必須にしない**。
//    機械抽出(`ingest_document` 由来の取り込み)は既定で `inferred` を付けるため、
//    必須にすると取り込みが丸ごと止まり、結果として「確度を付けない」運用に逃げられる。
//    未記入の `inferred` は `check_engagement_health` / `inspect_findings` が名指しで残す。
//
// 読み込み(`sanitizeProvenance` / `normalizeEngagement`)は**寛容のまま**。
// 既に矛盾を含んだ保存データがあっても、そこで案件全体が開けなくなる方が害が大きい。
// ---------------------------------------------------------------------------

/** `stated` を名乗っているのに出典が空か(既存データの点検にも使える) */
export function statedWithoutSource(entity: Provenance | null | undefined): boolean {
  if (!entity || typeof entity !== 'object') return false;
  return entity.confidence === 'stated' && !hasProvenance(entity);
}

// ---------------------------------------------------------------------------
// 「機械が置いた仮置き文字列」を人が書いた内容として数えない
//
// 実測された問題: `ingest_document` が関与方針(`approach`)に
// 「要確認(自動抽出) / to be confirmed — 出典 / source: doc.md:27」という定型文を入れており、
// 欄が空でないことを根拠に `check_engagement_health` が
// 「影響力の高いステークホルダー全員に関与方針が書かれている。合意形成が設計されている」と
// **褒めていた**。誰も何も決めていない案件に対する褒めで、そのまま客先資料に出る。
//
// 定型文の投入そのものは `documents.ts` 側で止めたが、**既に保存されたデータには残っている**。
// 保存データを書き換えるのは危険なので、読む側で「これは人が書いた内容ではない」と判定する。
// 判定は取りこぼしより誤判定(人が書いた文を仮置き扱いする)を避けるほうを優先し、
// 機械が出す定型文の形そのものと、欄全体が「未定」「TBD」等 1 語だけの場合に限る。
// ---------------------------------------------------------------------------

/** 機械が置いた定型文(`ingest_document` の旧版が入れていたもの) */
// 丸括弧は半角・全角どちらも来る(書いた側の入力環境で変わる)ので両方見る
const PLACEHOLDER_PREFIX_RE = /^要確認\s*[(（]\s*自動抽出\s*[)）]/;

/** 同じ定型文の英語側だけが残っている場合(欄を英語で埋め直した保存データ) */
const PLACEHOLDER_EN_RE = /^to be confirmed\b\s*(—|-|–|\/|$)/i;

/** 欄全体がこれだけなら「何も書かれていない」と同じ(前後の記号は落として比較する) */
const PLACEHOLDER_WHOLE = new Set(['tbd', 'tba', 'n/a', 'na', '未定', '未記入', '未設定', '要確認', 'なし', '-', '—', '?', '？']);

/**
 * 人が書いた内容が入っているか。空欄・空白だけ・機械の定型文・「未定」1 語は false。
 *
 * 関与方針(`approach`)のように「欄が埋まっている＝仕事が済んでいる」と数えられる欄で使う。
 * 通常の自由記述に対しては真になる(「月次で要確認事項を報告する」のような文は人の記述)。
 */
export function isWrittenByHuman(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return false;
  if (PLACEHOLDER_WHOLE.has(flat.toLowerCase().replace(/[。.、,]+$/u, ''))) return false;
  return !PLACEHOLDER_PREFIX_RE.test(flat) && !PLACEHOLDER_EN_RE.test(flat);
}

/** 部分更新の `source` 欄の読み取り(`given` は欄が渡されたか、`value` は空でない値) */
function readPatchSource(input: ProvenanceInput): { given: boolean; value?: string } {
  if (input.source === undefined || input.source === null) return { given: false };
  const flat = typeof input.source === 'string' ? input.source.replace(/\s+/g, ' ').trim() : '';
  return flat.length > 0 ? { given: true, value: flat } : { given: true };
}

/** 部分更新の `confidence` 欄の読み取り(`given` は欄が渡されたか、`value` は有効な 3 値) */
function readPatchConfidence(input: ProvenanceInput): { given: boolean; value?: ProvenanceConfidence } {
  if (input.confidence === undefined || input.confidence === null) return { given: false };
  const value = typeof input.confidence === 'string' ? input.confidence.trim().toLowerCase() : '';
  return isConfidence(value) ? { given: true, value } : { given: true };
}

/** 出典・確度以外の欄(= 項目そのものの中身)を持つ入力か */
function hasEntryBody(input: ProvenanceInput): boolean {
  return Object.keys(input).some((key) => key !== 'id' && key !== 'source' && key !== 'confidence');
}

/** 既存項目を名指ししている入力か(`id` があれば、出典は既に付いているかもしれない) */
function referencesExistingEntry(input: ProvenanceInput): boolean {
  const id = (input as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0;
}

/** 日英そろった説明。**どうすれば直るか**を必ず入れる(「駄目です」だけでは動けない) */
function statedNeedsSourceDetail(field: string): Bilingual {
  const f = provenanceField(field, 'confidence');
  return {
    ja:
      `${f}: confidence="stated" は「原文にそう書いてある」という意味なので、出典なしでは保存できません。` +
      `直し方は 3 つのどれか: (1) source にどこに書いてあるかを書く(例 "security-report.pdf p.5")。` +
      `この項目に既に出典が付いているなら、source も一緒に渡してください。` +
      `(2) 書かれてはいないが導いたものなら confidence="inferred" にして、source に何から導いたかを書く。` +
      `(3) 出所を辿れないなら confidence="unknown" にする。` +
      `出典の無い「記載あり」は、後から誰も裏を取れず、根拠が無いので消す判断もできません。`,
    en:
      `${f}: confidence="stated" claims the source says so, so it cannot be saved without a source. ` +
      `Do one of three things: (1) put where it is written into source (for example "security-report.pdf p.5") — ` +
      `if the entry already carries a source, pass it again alongside the confidence; ` +
      `(2) use confidence="inferred" and record in source what it was derived from; ` +
      `(3) use confidence="unknown" when the origin cannot be traced. ` +
      `A "stated" entry with no source can never be verified later, and never safely deleted either.`,
  };
}

/**
 * 例外の `message` 用の 1 行(**英語のみ**)。
 * `unexpectedErrorResult` が 200 字で切って応答に埋めるので、短く保つこと。
 */
function statedNeedsSourceMessage(field: string): string {
  const f = provenanceField(field, 'confidence');
  return (
    `${f}: confidence="stated" needs a source. Pass source with it (e.g. "security-report.pdf p.5"), ` +
    `or use confidence="inferred" / "unknown". Nothing was saved.`
  );
}

/**
 * 「stated なのに出典が空」になるかを、**分かる範囲で**判定する(投げない)。
 *
 * `current`(保存済みの項目)を渡せば**マージ後の状態**をそのまま見るので、誤判定は起きない。
 * 渡さない場合は差分しか見えないため、次の 3 つだけを矛盾と断定する:
 *
 *  1. `stated` を宣言し、同じ呼び出しで `source` を空文字にしている(マージ後も必ず空)
 *  2. `stated` を宣言し、`id` が無く、項目本体の欄がある(= 新規追加。継ぐ出典が存在しない)
 *  3. それ以外は判定しない(既存項目に出典が付いている可能性を潰さないため)
 *
 * 3 の取りこぼしは `mergeProvenance` が受け止める。あちらは現物と突き合わせるので確実。
 */
export function provenanceConflict(
  field: string,
  input: ProvenanceInput | null | undefined,
  current?: Provenance | null,
): Bilingual | null {
  if (!input || typeof input !== 'object') return null;
  const src = readPatchSource(input);
  const conf = readPatchConfidence(input);

  // 現物が分かるなら推測しない。マージ後の状態だけを見る。
  if (current !== undefined) {
    const mergedSource = src.given ? src.value : current?.source;
    const mergedConfidence = conf.given
      ? conf.value
      : isConfidence(current?.confidence)
        ? current?.confidence
        : undefined;
    return statedWithoutSource({ source: mergedSource, confidence: mergedConfidence })
      ? statedNeedsSourceDetail(field)
      : null;
  }

  if (conf.value !== 'stated') return null; // stated を名乗っていない呼び出しには口を出さない
  if (src.value !== undefined) return null; // 同じ呼び出しで出典が付いている
  if (src.given) return statedNeedsSourceDetail(field); // 出典を明示的に消しながら stated
  if (hasEntryBody(input) && !referencesExistingEntry(input)) return statedNeedsSourceDetail(field);
  return null;
}

/**
 * 出典・確度を検査し、保存できる形に整える(**厳格**。不正な値は投げる)。
 *
 * - 前後の空白を落とし、改行と連続空白を 1 つに畳む
 * - 空文字・空白だけは `undefined`(欄ごと無かったことにする)
 * - `confidence` は小文字化して 3 値に合わせる
 * - `stated` なのに出典が空なら投げる(この関数は差分ではなく**値そのもの**を受けるので、
 *   継ぐ出典は存在しない。ここを通った戻り値に矛盾は入っていない)
 */
export function normalizeProvenance(input: ProvenanceInput | null | undefined, field = ''): Provenance {
  if (!input || typeof input !== 'object') return {};
  assertProvenance(field, input);
  const out: Provenance = {};
  if (typeof input.source === 'string') {
    const flat = input.source.replace(/\s+/g, ' ').trim();
    if (flat.length > 0) out.source = flat;
  }
  if (typeof input.confidence === 'string') {
    const value = input.confidence.trim().toLowerCase();
    if (isConfidence(value)) out.confidence = value;
  }
  if (statedWithoutSource(out)) {
    throw new ProvenanceConflictError(field, statedNeedsSourceDetail(field), statedNeedsSourceMessage(field));
  }
  return out;
}

/**
 * 保存済みデータの出典・確度を読める形に直す(**寛容**。決して投げない)。
 *
 * 読み込み経路で使う。手で編集された JSON に `confidence: "high"` のような
 * 値が入っていても、そこで読み込み全体を落とすわけにはいかないため、
 * 読めない値は黙って落とす(欄が無いのと同じ状態にする)。
 */
export function sanitizeProvenance(input: ProvenanceInput | null | undefined): Provenance {
  if (!input || typeof input !== 'object') return {};
  const out: Provenance = {};
  if (typeof input.source === 'string') {
    const flat = input.source.replace(/\s+/g, ' ').trim();
    if (flat.length > 0) out.source = flat.slice(0, TEXT_LIMITS.source.limit);
  }
  if (typeof input.confidence === 'string') {
    const value = input.confidence.trim().toLowerCase();
    if (isConfidence(value)) out.confidence = value;
  }
  return out;
}

/**
 * 既存の項目に出典・確度の部分更新を当てる。
 *
 * - 引数を渡さなければ(`undefined`)今の値を保つ
 * - 空文字・空白だけを渡すと**消す**(間違って付けた出典を外せるようにする)
 * - 不正な値は投げる(`normalizeProvenance` と同じ)
 * - **この呼び出しで `confidence: "stated"` を宣言したのに、マージ後に出典が無い**なら投げる
 *
 * 最後の 1 つが「差分しか見えない」問題への答え。`checkProvenance` は保存済みの項目を
 * 知らないので、`{ id, confidence: "stated" }`(既に出典が付いている項目の確度だけを直す
 * 正当な呼び出し)を弾けない/弾いてはいけない。ここは `current` と突き合わせた後なので、
 * 出典を継げたかどうかが確定している。**宣言した呼び出しだけ**を見るので、
 * 既存データに元から入っていた矛盾(読み込んで別の欄を直しただけ)は素通りする。
 */
export function mergeProvenance(
  current: Provenance | null | undefined,
  patch: ProvenanceInput | null | undefined,
  field = '',
): Provenance {
  const base: Provenance = {};
  if (current && typeof current === 'object') {
    if (typeof current.source === 'string' && current.source.trim().length > 0) base.source = current.source;
    if (isConfidence(current.confidence)) base.confidence = current.confidence;
  }
  if (!patch || typeof patch !== 'object') return base;
  assertProvenance(field, patch);
  const next: Provenance = { ...base };
  if (patch.source !== undefined && patch.source !== null) {
    const flat = typeof patch.source === 'string' ? patch.source.replace(/\s+/g, ' ').trim() : '';
    if (flat.length > 0) next.source = flat;
    else delete next.source;
  }
  if (patch.confidence !== undefined && patch.confidence !== null) {
    const value = typeof patch.confidence === 'string' ? patch.confidence.trim().toLowerCase() : '';
    if (isConfidence(value)) next.confidence = value;
    else delete next.confidence;
  }
  // この呼び出しが `stated` を宣言したときだけ見る。マージ後に出典が無ければ、
  // 「原文にそう書いてある」を裏付け無しで書き込むことになるので止める。
  if (readPatchConfidence(patch).value === 'stated' && statedWithoutSource(next)) {
    throw new ProvenanceConflictError(field, statedNeedsSourceDetail(field), statedNeedsSourceMessage(field));
  }
  return next;
}

/**
 * 出典・確度の入力を検査して、利用者に見せる文面を返す(問題が無ければ null)。
 *
 * ツール側は例外を投げてはならない決まりなので、**投げない入口**を用意しておく。
 * `checkText` と同じ使い勝手で `runChecks` に並べられる。
 *
 * `current` に保存済みの項目を渡せば、**マージ後の状態**で
 * 「`stated` なのに出典が空」を判定する(誤判定が起きない)。渡さないときは
 * `provenanceConflict` が確実な場合だけを弾き、残りは `mergeProvenance` に委ねる。
 */
export function checkProvenance(
  field: string,
  input: ProvenanceInput | null | undefined,
  lang: Lang = 'both',
  current?: Provenance | null,
): string | null {
  try {
    assertProvenance(field, input);
    const conflict = provenanceConflict(field, input, current);
    if (conflict) return text(conflict, lang);
    return null;
  } catch (error) {
    if (error instanceof EngagementValueError) return text(error.detail, lang);
    if (error instanceof EngagementInputError) {
      const { hint } = TEXT_LIMITS.source;
      return text(
        {
          ja: `入力が長すぎます: ${error.field} は ${error.limit} 文字までです(受け取った長さ: ${error.actual} 文字)。${hint.ja}`,
          en: `Input too long: ${error.field} accepts at most ${error.limit} characters (received ${error.actual}). ${hint.en}`,
        },
        lang,
      );
    }
    throw error;
  }
}

export interface PhaseProgress {
  phaseId: string;
  status: PhaseStatus;
  note?: string;
  updatedAt: string;
}

export interface Risk extends Provenance {
  id: string;
  title: string;
  description?: string;
  /** 対策前のリスクレベル */
  level: RiskLevel;
  /** 対策後に残るリスクレベル */
  residualLevel?: RiskLevel;
  status: RiskStatus;
  owner?: string;
  mitigation?: string;
  phaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Decision extends Provenance {
  id: string;
  title: string;
  /** 背景・検討した選択肢 */
  context?: string;
  /** 決定内容 */
  decision: string;
  /** 根拠 */
  rationale?: string;
  status: DecisionStatus;
  decidedBy?: string;
  phaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Action extends Provenance {
  id: string;
  title: string;
  owner?: string;
  /** 期限 (YYYY-MM-DD) */
  due?: string;
  status: ActionStatus;
  priority: Priority;
  phaseId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stakeholder extends Provenance {
  id: string;
  name: string;
  role?: string;
  organization?: string;
  influence: InfluenceLevel;
  interest: InfluenceLevel;
  /** 関心事(本人の言葉で) */
  concerns: string[];
  /** 関与方針 */
  approach?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableProgress extends Provenance {
  id: string;
  /** 知識ベースの成果物 ID(任意) */
  deliverableId?: string;
  name: string;
  status: DeliverableStatus;
  owner?: string;
  phaseId?: string;
  /** 保管場所(URL / パス) */
  link?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 移行アーキテクチャ(中間状態)。
 * `standalone` は「ここで止めても事業が回るか」— フェーズ E の必須確認事項。
 */
export interface TransitionState extends Provenance {
  id: string;
  name: string;
  /** ロードマップ上の並び順 */
  order: number;
  /** 到達目標時期。四半期表記を推奨(例: 2027-Q1) */
  targetQuarter?: string;
  /** その状態で実現している能力 */
  capabilities: string[];
  /** ここで止めても事業が回るか */
  standalone: boolean;
  /** 暫定的な仕組み(二重運用・暫定連携など) */
  interim?: string;
  /** 暫定の仕組みの廃棄計画と期限 */
  disposalPlan?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** 作業パッケージ(ギャップを束ねた実行単位) */
export interface WorkPackage extends Provenance {
  id: string;
  name: string;
  description?: string;
  status: WorkPackageStatus;
  /** 属する移行アーキテクチャ(TransitionState.id) */
  transitionId?: string;
  phaseId?: string;
  owner?: string;
  /** 四半期表記(例: 2026-Q3) */
  startQuarter?: string;
  endQuarter?: string;
  /** 先行する作業パッケージ ID */
  dependsOn: string[];
  /** 事業価値と実現容易性(優先順位付けの 2 軸) */
  businessValue: Priority;
  effort: Priority;
  costEstimate?: string;
  /** 実現する便益と、その刈り取り責任者 */
  benefit?: string;
  benefitOwner?: string;
  createdAt: string;
  updatedAt: string;
}

/** 評価因子(現在水準 / 目標水準) */
export interface AssessmentFactor extends Provenance {
  name: string;
  current: number;
  target: number;
  note?: string;
}

/** 成熟度評価 / 変革準備度評価の記録 */
export interface Assessment extends Provenance {
  id: string;
  kind: AssessmentKind;
  title: string;
  /** 評価尺度の最大値(既定 5) */
  scale: number;
  factors: AssessmentFactor[];
  summary?: string;
  assessedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Engagement {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  /** 現在注力しているフェーズ ID */
  currentPhaseId: string;
  /** アーカイブ済み(一覧では既定で非表示) */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  phases: PhaseProgress[];
  risks: Risk[];
  decisions: Decision[];
  actions: Action[];
  stakeholders: Stakeholder[];
  deliverables: DeliverableProgress[];
  transitions: TransitionState[];
  workPackages: WorkPackage[];
  assessments: Assessment[];
  notes: string[];
}

/** 複数エンゲージメントの索引 / Index entry for the multi-engagement store. */
export interface EngagementIndexEntry {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  currentPhaseId: string;
  archived: boolean;
  updatedAt: string;
}

export interface EngagementIndex {
  /** いま選択されているエンゲージメント ID */
  currentId: string | null;
  engagements: EngagementIndexEntry[];
}

/** エンゲージメントから索引エントリを作る */
export function toIndexEntry(engagement: Engagement): EngagementIndexEntry {
  return {
    id: engagement.id,
    name: engagement.name,
    client: engagement.client,
    industry: engagement.industry,
    currentPhaseId: engagement.currentPhaseId,
    archived: engagement.archived === true,
    updatedAt: engagement.updatedAt,
  };
}

/** 現在時刻を ISO 文字列で返す */
export function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ID 採番 / Identifier allocation
// ---------------------------------------------------------------------------

/**
 * ID の形は `<種別>-<通し番号>-<乱数>`(例: `risk-3-k7f2qa`)。
 *
 * **通し番号の意味は全種類で同じ**: 「その入れ物の中で何番目に作られたか」。
 * 入れ物は 2 段しかない。
 *
 * - 案件の中の項目(`risk` / `dec` / `act` / `stk` / `dlv` / `trn` / `wp` / `asmt`)
 *   → その**案件の中**での通し番号。種別ごとに 1 から数える。
 * - 案件そのもの(`eng`)→ **保存先全体**での通し番号。ただし採番表に入るのは
 *   そのプロセスが読み込んだ案件だけなので、索引しか読まずに新規作成する経路では
 *   番号が 1 に戻る(ID 自体は乱数部で必ず異なる)。`store.readIndex()` が
 *   `registerExistingIds(索引の ID 一覧)` を呼べば番号も通しになる。
 *
 * 以前はモジュール変数のカウンタだけで採番していたため、番号は
 * 「そのプロセスが何個 ID を作ったか」でしかなかった。1 回の呼び出しで
 * まとめて登録するツール(取り込みなど)では連番に見える一方、
 * `add_work_package` のように 1 件ずつ別プロセスで呼ばれるものは毎回 1 に戻り、
 * 同じ台帳の中で番号の意味が場所によって違っていた。
 *
 * いまは**保存済みの状態から採番する**。読み込み時(`normalizeEngagement`)に
 * 既存 ID を採番表へ取り込み、次の番号をその最大値の次に押し上げる。
 * したがって取り込みを 2 回走らせても `risk-1` が 2 つできることはない。
 *
 * 乱数部は残す。プロセスをまたいで同時に書き込まれた場合(番号だけでは
 * 衝突しうる)と、外部で編集された ID との衝突に対する保険。
 */
const ID_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 案件そのものの ID 種別 */
const ENGAGEMENT_ID_PREFIX = 'eng';

/** 案件 ID を数える入れ物のキー(案件 ID とは衝突しない名前にする) */
const ENGAGEMENT_SCOPE_KEY = '#engagements';

/**
 * 採番表に取り込む番号の上限。外部で編集された `risk-99999999999-x` のような
 * ID に引きずられて、以降の番号が読めない桁数になるのを防ぐ。
 */
const MAX_SEED_SEQUENCE = 1_000_000;

/** `<種別>-<番号>` を取り出す。番号が無い ID(`eng-legacy-1` など)は一致しない */
const ID_SEQUENCE_PATTERN = /^([a-z][a-z0-9]*)-(\d{1,12})(?:-|$)/i;

interface IdScope {
  /** この入れ物で既に使われている ID */
  used: Set<string>;
  /** 種別ごとの次の番号 */
  next: Map<string, number>;
}

/** 入れ物(案件 ID か `#engagements`)ごとの採番状態 */
const idScopes = new Map<string, IdScope>();

/** このプロセスが見た・作った全 ID。入れ物を取り違えても衝突させないための保険 */
const knownIds = new Set<string>();

/** 直近に読み込まれた案件。`makeId` に入れ物が渡されなかったときの既定 */
let activeScopeKey: string | null = null;

function getIdScope(key: string): IdScope {
  let scope = idScopes.get(key);
  if (!scope) {
    scope = { used: new Set<string>(), next: new Map<string, number>() };
    idScopes.set(key, scope);
  }
  return scope;
}

/** 入れ物の指定(案件そのもの / 案件 ID / 未指定)をキーに直す */
function scopeKeyFor(prefix: string, scope?: Engagement | string): string {
  if (typeof scope === 'string' && scope.length > 0) return scope;
  if (scope && typeof scope === 'object' && typeof scope.id === 'string' && scope.id.length > 0) {
    return scope.id;
  }
  if (prefix === ENGAGEMENT_ID_PREFIX) return ENGAGEMENT_SCOPE_KEY;
  return activeScopeKey ?? ENGAGEMENT_SCOPE_KEY;
}

/** ファイル名にもそのまま使える種別名に整える */
function normalizePrefix(prefix: string): string {
  const cleaned = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : 'id';
}

function randomIdSuffix(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ID_SUFFIX_ALPHABET[(bytes[i] ?? 0) % ID_SUFFIX_ALPHABET.length];
  }
  return out;
}

/** ID 1 件を採番表に取り込む(既存の番号を追い越すように次の番号を上げる) */
function registerId(id: string, scope: IdScope): void {
  if (typeof id !== 'string' || id.length === 0) return;
  scope.used.add(id);
  knownIds.add(id);
  const match = ID_SEQUENCE_PATTERN.exec(id);
  if (!match) return;
  const prefix = normalizePrefix(match[1] ?? '');
  const seq = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(seq) || seq < 1 || seq > MAX_SEED_SEQUENCE) return;
  const next = scope.next.get(prefix) ?? 1;
  if (seq + 1 > next) scope.next.set(prefix, seq + 1);
}

/**
 * 保存済みの ID を採番表に取り込む。
 *
 * 呼ぶ必要があるのは「model.ts の外で ID を読み込んだ」場合だけ
 * (案件そのものの読み込みは `normalizeEngagement` が済ませる)。
 *
 * @param ids   既に存在する ID
 * @param scope 入れ物。案件かその ID。未指定なら案件 ID の入れ物として扱う
 */
export function registerExistingIds(ids: Iterable<string>, scope?: Engagement | string): void {
  const key = typeof scope === 'string' || scope ? scopeKeyFor(ENGAGEMENT_ID_PREFIX, scope) : ENGAGEMENT_SCOPE_KEY;
  const target = getIdScope(key);
  for (const id of ids) registerId(id, target);
}

/** 案件 1 件ぶんの ID(案件自身と全項目)を採番表に取り込み、既定の入れ物にする */
export function registerEngagementIds(engagement: Engagement): void {
  registerId(engagement.id, getIdScope(ENGAGEMENT_SCOPE_KEY));
  const scope = getIdScope(engagement.id);
  const lists: { id?: unknown }[][] = [
    engagement.risks,
    engagement.decisions,
    engagement.actions,
    engagement.stakeholders,
    engagement.deliverables,
    engagement.transitions,
    engagement.workPackages,
    engagement.assessments,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item.id === 'string') registerId(item.id, scope);
    }
  }
  activeScopeKey = engagement.id;
}

/**
 * 種別ごとの一意 ID を作る(例: `risk-3-k7f2qa`)。
 *
 * 番号は**保存済みの状態の続き**から始まる。読み込み済みの案件があれば
 * その案件の中での通し番号、無ければ案件 ID の通し番号。
 *
 * @param prefix 種別(`risk` / `act` / `wp` など)
 * @param scope  どの案件の中で数えるか。省略時は直近に読み込まれた案件
 */
export function makeId(prefix: string, scope?: Engagement | string): string {
  const kind = normalizePrefix(prefix);
  const target = getIdScope(scopeKeyFor(kind, scope));
  let seq = target.next.get(kind) ?? 1;
  // 番号 + 乱数の両方が一致したときだけ番号を進める(通常は 1 周目で確定する)
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = `${kind}-${seq}-${randomIdSuffix()}`;
    if (!knownIds.has(candidate) && !target.used.has(candidate)) {
      target.used.add(candidate);
      knownIds.add(candidate);
      target.next.set(kind, seq + 1);
      return candidate;
    }
    seq += 1;
  }
  // ここには到達しない想定。到達しても衝突しないよう乱数部を伸ばす。
  const fallback = `${kind}-${seq}-${randomIdSuffix(16)}`;
  target.used.add(fallback);
  knownIds.add(fallback);
  target.next.set(kind, seq + 1);
  return fallback;
}

/**
 * 採番表を空にする(テスト用)。
 * 実行中のサーバーからは呼ばない — 呼ぶと番号が 1 に戻る。
 */
export function resetIdAllocationForTests(): void {
  idScopes.clear();
  knownIds.clear();
  activeScopeKey = null;
}

/** 全 ADM フェーズを未着手で初期化する */
export function initialPhases(timestamp: string): PhaseProgress[] {
  return ADM_PHASES.map((p) => ({
    phaseId: p.id,
    status: 'not_started' as PhaseStatus,
    updatedAt: timestamp,
  }));
}

// ---------------------------------------------------------------------------
// 入力長の上限 / Input length limits
// ---------------------------------------------------------------------------

/**
 * 文字列フィールドの上限 / Per-field character limits.
 *
 * 上限が無いと、数万文字の案件名や関心事がそのまま JSON に保存され、
 * 以降すべてのダッシュボード・表・書き出しが読めなくなる(1 セルが画面を埋める)。
 * ここは**黙って切り詰めず、明確なエラーで弾く**。切り詰めると利用者は
 * 何が失われたか分からないまま保存が完了してしまうため。
 *
 * `hint` には「ではどこに書けばよいか」を必ず入れる。上限を伝えるだけでは
 * 利用者は同じ内容を貼り直すしかない。
 */
export interface TextFieldLimit {
  /** 上限文字数 */
  limit: number;
  /** 超えたときの逃がし先 */
  hint: Bilingual;
}

export const TEXT_LIMITS = {
  /** 案件名。一覧・見出し・ファイル名に出るので短く */
  name: {
    limit: 200,
    hint: {
      ja: '短い呼び名を name に入れ、背景や詳細は description に書いてください。',
      en: 'Put a short label in name and move the background and detail into description.',
    },
  },
  client: {
    limit: 200,
    hint: {
      ja: '組織名だけを client に入れ、補足は description に書いてください。',
      en: 'Keep client to the organisation name and put anything else in description.',
    },
  },
  industry: {
    limit: 100,
    hint: {
      ja: '業界名だけを industry に入れてください(例: 銀行、製造)。',
      en: 'Keep industry to the industry name alone (for example: banking, manufacturing).',
    },
  },
  /** 表の 1 行になる見出し。長いと表が崩れる */
  title: {
    limit: 300,
    hint: {
      ja: '1 行で読める見出しにし、詳細は description / note 側に書いてください。',
      en: 'Keep the title readable on one line and move the detail into description or note.',
    },
  },
  /** ステークホルダーの関心事 1 件 */
  concern: {
    limit: 500,
    hint: {
      ja: '関心事は 1 件ずつ短く分けて登録し、長い経緯は approach に書いてください。',
      en: 'Record concerns as short separate entries and put the long background into approach.',
    },
  },
  /**
   * 出典の呼び名。表の 1 セルに入る長さに抑える。
   * 上限は `title` と揃えてある(取り込み側の `source` 引数と同じ長さで通るように)。
   */
  source: {
    limit: 300,
    hint: {
      ja: 'source は出典の短い呼び名です(例: "報告書.pdf p.12-18"、"2026-08-14 ヒアリング(情シス部長)")。引用や本文は note / description に書いてください。',
      en: 'source is a short label for the origin (for example "report.pdf p.12-18" or "2026-08-14 interview (Head of IT)"). Put quotations and body text into note or description.',
    },
  },
  /** 自由記述(説明・背景・対策・メモなど) */
  text: {
    limit: 4000,
    hint: {
      ja: 'この長さを超える内容は文書として別に保管し、link に場所を書いてください。',
      en: 'Store anything longer as its own document and record where it lives in link.',
    },
  },
} as const satisfies Record<string, TextFieldLimit>;

/** `TEXT_LIMITS` に定義のある種別 */
export type TextFieldKind = keyof typeof TEXT_LIMITS;

/** 1 つの配列フィールドに入れられる要素数の上限(関心事・能力・依存など) */
export const MAX_LIST_ITEMS = 100;

/**
 * 入力が上限を超えたときのエラー。
 *
 * MCP SDK はツールコールバックの例外を捕捉して `isError: true` の結果に変換するため、
 * これを投げてもサーバーは落ちない。メッセージは利用者がそのまま読む前提で日英併記。
 */
export class EngagementInputError extends Error {
  readonly field: string;
  readonly limit: number;
  readonly actual: number;

  constructor(message: string, field: string, limit: number, actual: number) {
    super(message);
    this.name = 'EngagementInputError';
    this.field = field;
    this.limit = limit;
    this.actual = actual;
  }
}

/**
 * 文字列フィールドの長さを検査する。超えていれば `EngagementInputError` を投げる。
 *
 * @param field 利用者に見せるフィールド名(例: `name`, `risks[0].title`)
 * @param value 検査対象。undefined / null は「未指定」として通す
 * @param kind  上限の種別。既定は `text`(自由記述)
 */
export function assertTextLimit(field: string, value: unknown, kind: TextFieldKind = 'text'): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') return;
  const { limit, hint } = TEXT_LIMITS[kind];
  const actual = value.length;
  if (actual <= limit) return;
  throw new EngagementInputError(
    `入力が長すぎます: ${field} は ${limit} 文字までです(受け取った長さ: ${actual} 文字)。${hint.ja}` +
      ` / Input too long: ${field} accepts at most ${limit} characters (received ${actual}). ${hint.en}`,
    field,
    limit,
    actual,
  );
}

/**
 * 文字列配列の要素数と各要素の長さを検査する。
 * 関心事のような「いくらでも足せる」項目が保存 JSON を壊さないようにする。
 */
export function assertTextListLimit(
  field: string,
  values: unknown,
  kind: TextFieldKind = 'text',
  maxItems: number = MAX_LIST_ITEMS,
): void {
  if (values === undefined || values === null) return;
  if (!Array.isArray(values)) return;
  if (values.length > maxItems) {
    throw new EngagementInputError(
      `項目が多すぎます: ${field} は ${maxItems} 件までです(受け取った件数: ${values.length} 件)。` +
        '束ねるか、複数回に分けて登録してください。' +
        ` / Too many entries: ${field} accepts at most ${maxItems} (received ${values.length}). Group them, or register them in several calls.`,
      field,
      maxItems,
      values.length,
    );
  }
  values.forEach((v, i) => assertTextLimit(`${field}[${i}]`, v, kind));
}

/** 案件の基本情報(名称・クライアント・概要・スコープ)をまとめて検査する */
export function assertEngagementProfile(input: {
  name?: unknown;
  client?: unknown;
  industry?: unknown;
  description?: unknown;
  scope?: unknown;
}): void {
  assertTextLimit('name', input.name, 'name');
  assertTextLimit('client', input.client, 'client');
  assertTextLimit('industry', input.industry, 'industry');
  assertTextLimit('description', input.description, 'text');
  assertTextLimit('scope', input.scope, 'text');
}

// ---------------------------------------------------------------------------
// 出力量の上限 / Output size limits
// ---------------------------------------------------------------------------

/**
 * 表 1 つあたりに出す最大件数 / How many rows one table may show.
 *
 * 関係者 60 名・リスク 60 件の案件では、全件を出すと 1 回の応答が数万文字になり、
 * 会話がそれだけで埋まる(実測: `get_dashboard` 15,000 字 / 22KB、`stakeholder_matrix` 32KB)。
 * 表示側はこの値で切り、切ったことと全件の見方を必ず添える。
 *
 * 上限は**ここ 1 か所**に置く。表ごとに別々の数字を直書きすると、
 * 「どこまで出るのか」が利用者にも実装者にも分からなくなるため。
 * 取り込み先(未適用): `dashboard/markdown.ts` の `renderDashboardMarkdown`
 * (`compact` / `limit` を件数に応じて自動で立てる)、`tools/analysis.ts` の
 * `stakeholder_matrix` / `risk_matrix` の一覧表。
 */
export const OUTPUT_LIMITS = {
  /** 通常の表(リスク・アクション・関係者など) */
  rows: 20,
  /** 診断系ツールの「指摘」など、上位だけ見れば足りるもの */
  highlights: 10,
  /** 1 セルに入れる文字数 */
  cell: 120,
} as const;

/** 上限で切った結果 / A list after the cap has been applied. */
export interface CappedRows<T> {
  rows: T[];
  /** 元の件数 */
  total: number;
  /** 表示しなかった件数 */
  hidden: number;
  /** 切ったかどうか */
  capped: boolean;
}

/**
 * 一覧を上位 N 件に切る。切った件数を必ず返すので、呼び出し側は
 * 「黙って切る」ことができない(`hidden` を無視すると型は通るが、
 * `capNotice` を添えるのが本来の使い方)。
 */
export function capRows<T>(rows: readonly T[], limit: number = OUTPUT_LIMITS.rows): CappedRows<T> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : OUTPUT_LIMITS.rows;
  const all = Array.isArray(rows) ? rows : [];
  if (all.length <= safeLimit) {
    return { rows: [...all], total: all.length, hidden: 0, capped: false };
  }
  return {
    rows: all.slice(0, safeLimit),
    total: all.length,
    hidden: all.length - safeLimit,
    capped: true,
  };
}

/**
 * 切ったことを利用者に伝える 1 行を作る。切っていなければ空文字。
 *
 * @param capped   `capRows` の結果
 * @param seeAll   全件を見る方法(ツール名と引数)。例: `{ ja: '全件は `get_engagement` に format="json" を渡す', en: ... }`
 */
export function capNotice(capped: CappedRows<unknown>, seeAll: Bilingual, lang: Lang = 'both'): string {
  if (!capped.capped) return '';
  const ja = `上位 ${capped.rows.length} 件を表示(全 ${capped.total} 件、残り ${capped.hidden} 件は非表示)。${seeAll.ja}`;
  const en = `Showing the top ${capped.rows.length} of ${capped.total} (${capped.hidden} hidden). ${seeAll.en}`;
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 1 セルが表を壊さない長さに収める(切ったことが分かる印を残す) */
export function capCell(value: string, limit: number = OUTPUT_LIMITS.cell): string {
  const flat = value.replace(/\r?\n+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit)}…(+${flat.length - limit})`;
}

export interface CreateEngagementInput {
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  currentPhaseId?: string;
}

/**
 * 新しいエンゲージメントを作る。
 * 上限を超える入力は保存前に `EngagementInputError` で弾く(切り詰めない)。
 */
export function createEngagement(input: CreateEngagementInput): Engagement {
  assertEngagementProfile(input);
  const timestamp = now();
  const id = makeId(ENGAGEMENT_ID_PREFIX);
  // 作った直後にこの案件へ項目を足す呼び出し元のために、既定の入れ物を移す
  activeScopeKey = id;
  return {
    id,
    name: input.name,
    client: input.client,
    industry: input.industry,
    description: input.description,
    scope: input.scope,
    currentPhaseId: input.currentPhaseId ?? 'a',
    createdAt: timestamp,
    updatedAt: timestamp,
    phases: initialPhases(timestamp),
    risks: [],
    decisions: [],
    actions: [],
    stakeholders: [],
    deliverables: [],
    transitions: [],
    workPackages: [],
    assessments: [],
    notes: [],
  };
}

/** フェーズ進捗の集計 / Roll up phase progress for the dashboard. */
export interface ProgressSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  skipped: number;
  /** skipped を除いた完了率(0-100) */
  percent: number;
}

export function summarizeProgress(engagement: Engagement): ProgressSummary {
  const counts = { completed: 0, in_progress: 0, not_started: 0, skipped: 0 };
  for (const p of engagement.phases) counts[p.status] += 1;
  const effective = engagement.phases.length - counts.skipped;
  const percent = effective > 0
    ? Math.round(((counts.completed + counts.in_progress * 0.5) / effective) * 100)
    : 0;
  return {
    total: engagement.phases.length,
    completed: counts.completed,
    inProgress: counts.in_progress,
    notStarted: counts.not_started,
    skipped: counts.skipped,
    percent,
  };
}

/**
 * 保存済みの一覧から、出典・確度だけを読める形に直す。
 *
 * 他の欄には一切触らない(知らない欄も落とさない)。`source` / `confidence` の
 * どちらも持たない項目はそのまま返すので、**この欄が無い既存データは
 * オブジェクトの同一性まで含めて今までどおり**。
 */
function sanitizeProvenanceList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item as T;
    const record = item as Record<string, unknown>;
    if (!('source' in record) && !('confidence' in record)) return item as T;
    const cleaned = sanitizeProvenance(record as ProvenanceInput);
    const next: Record<string, unknown> = { ...record };
    if (cleaned.source === undefined) delete next.source;
    else next.source = cleaned.source;
    if (cleaned.confidence === undefined) delete next.confidence;
    else next.confidence = cleaned.confidence;
    return next as T;
  });
}

/** 評価は因子側にも出典が付くので、1 段深く見る */
function sanitizeAssessments(value: unknown): Assessment[] {
  return sanitizeProvenanceList<Assessment>(value).map((assessment) => {
    if (!assessment || typeof assessment !== 'object') return assessment;
    if (!Array.isArray(assessment.factors)) return assessment;
    return { ...assessment, factors: sanitizeProvenanceList<AssessmentFactor>(assessment.factors) };
  });
}

/** 出典の付き具合の集計 / How much of the ledger can be traced back to a source. */
export interface ProvenanceSummary {
  /** 出典を持ちうる項目の総数 */
  total: number;
  /** 出典が書かれている件数 */
  withSource: number;
  /** 出典が無い件数 */
  withoutSource: number;
  /** 確度ごとの件数(`unset` は確度未設定) */
  byConfidence: Record<ProvenanceConfidence | 'unset', number>;
  /** 出典が無い項目(種別・ID・見出し)。表示側で `capRows` に通すこと */
  missing: { kind: string; id: string; label: string }[];
}

/** 項目の見出しに使える文字列を拾う(title → name → id の順) */
function entityLabel(item: { title?: unknown; name?: unknown; id?: unknown }): string {
  if (typeof item.title === 'string' && item.title.trim().length > 0) return item.title;
  if (typeof item.name === 'string' && item.name.trim().length > 0) return item.name;
  return typeof item.id === 'string' ? item.id : '';
}

/**
 * 案件全体で「出典が辿れる項目がどれだけあるか」を数える。
 *
 * 人が目で照合していたことを機械にやらせるための土台。
 * 出典が無い項目は後から真偽を確かめられないので、件数ではなく**一覧で**返す。
 */
export function summarizeProvenance(engagement: Engagement): ProvenanceSummary {
  const byConfidence: Record<ProvenanceConfidence | 'unset', number> = {
    stated: 0,
    inferred: 0,
    unknown: 0,
    unset: 0,
  };
  const missing: { kind: string; id: string; label: string }[] = [];
  let total = 0;
  let withSource = 0;
  const groups: [string, unknown[]][] = [
    ['risk', engagement.risks],
    ['decision', engagement.decisions],
    ['action', engagement.actions],
    ['stakeholder', engagement.stakeholders],
    ['deliverable', engagement.deliverables],
    ['transition', engagement.transitions],
    ['workPackage', engagement.workPackages],
    ['assessment', engagement.assessments],
  ];
  for (const [kind, list] of groups) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Provenance & { id?: unknown; title?: unknown; name?: unknown };
      total += 1;
      if (hasProvenance(item)) withSource += 1;
      else missing.push({ kind, id: typeof item.id === 'string' ? item.id : '', label: entityLabel(item) });
      if (isConfidence(item.confidence)) byConfidence[item.confidence] += 1;
      else byConfidence.unset += 1;
    }
  }
  return { total, withSource, withoutSource: total - withSource, byConfidence, missing };
}

/** 未読み込みの古い JSON でも壊れないように欠損フィールドを補う */
export function normalizeEngagement(raw: unknown): Engagement | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Engagement>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string') return null;
  const timestamp = typeof e.updatedAt === 'string' ? e.updatedAt : now();
  const knownPhaseIds = new Set(ADM_PHASES.map((p) => p.id));
  const phases = Array.isArray(e.phases) ? e.phases.filter((p) => knownPhaseIds.has(p?.phaseId)) : [];
  // 知識ベース側にフェーズが増えた場合に備えて不足分を補完する
  for (const p of ADM_PHASES) {
    if (!phases.some((x) => x.phaseId === p.id)) {
      phases.push({ phaseId: p.id, status: 'not_started', updatedAt: timestamp });
    }
  }
  const engagement: Engagement = {
    id: e.id,
    name: e.name,
    client: e.client,
    industry: e.industry,
    description: e.description,
    scope: e.scope,
    currentPhaseId: typeof e.currentPhaseId === 'string' ? e.currentPhaseId : 'a',
    archived: e.archived === true,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : timestamp,
    updatedAt: timestamp,
    phases,
    // 出典・確度だけは読み込み時に整える(手で編集された JSON に読めない値が
    // 入っていても、そこで案件全体が読めなくなることは無いようにする)
    risks: sanitizeProvenanceList<Risk>(e.risks),
    decisions: sanitizeProvenanceList<Decision>(e.decisions),
    actions: sanitizeProvenanceList<Action>(e.actions),
    stakeholders: sanitizeProvenanceList<Stakeholder>(e.stakeholders),
    deliverables: sanitizeProvenanceList<DeliverableProgress>(e.deliverables),
    transitions: sanitizeProvenanceList<TransitionState>(e.transitions),
    workPackages: sanitizeProvenanceList<WorkPackage>(e.workPackages),
    assessments: sanitizeAssessments(e.assessments),
    notes: Array.isArray(e.notes) ? e.notes : [],
  };
  // 読み込みは必ずここを通る。保存済みの ID を採番表に取り込むのはこの 1 か所。
  registerEngagementIds(engagement);
  return engagement;
}
