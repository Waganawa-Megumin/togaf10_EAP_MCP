/**
 * 知識ベース共通型 / Shared knowledge-base types.
 *
 * 本ファイル以下の知識ベースは TOGAF 標準の構造(フェーズ名・成果物名などの事実情報)と
 * 独自の要約・解説のみで構成する。原文の転載は行わない。
 *
 * The knowledge base contains only factual structure (phase/deliverable names) plus
 * original summaries. It does not reproduce the official TOGAF text.
 */

/** 出力言語 / Output language selector. */
export type Lang = 'ja' | 'en' | 'both';

/** 日英併記の文字列 / A string carried in both Japanese and English. */
export interface Bilingual {
  ja: string;
  en: string;
}

/** ADM フェーズ / An ADM phase. */
export interface AdmPhase {
  /** 安定 ID(例: 'preliminary', 'a', 'requirements-management') */
  id: string;
  /** 表示用コード(例: 'Preliminary', 'A', 'RM') */
  code: string;
  /** 並び順 */
  order: number;
  name: Bilingual;
  /** 一行要約 */
  tagline: Bilingual;
  purpose: Bilingual;
  /** 主な入力 */
  inputs: Bilingual[];
  /** 主なステップ */
  steps: Bilingual[];
  /** 主な成果物(自由記述ラベル) */
  outputs: Bilingual[];
  /** 実務のコツ */
  tips: Bilingual[];
  /** 関連する成果物 ID */
  deliverableIds: string[];
  /** 関連する技法 ID */
  techniqueIds: string[];
  /** 検索用キーワード(日英混在) */
  keywords: string[];
}

/** ADM 技法 / An ADM technique. */
export interface Technique {
  id: string;
  name: Bilingual;
  summary: Bilingual;
  /** 適用場面 */
  whenToUse: Bilingual[];
  /** 進め方 */
  steps: Bilingual[];
  /** 落とし穴 */
  pitfalls: Bilingual[];
  /** 主に使うフェーズ ID */
  phaseIds: string[];
  keywords: string[];
}

/** 成果物テンプレートの節 / A section of a deliverable template. */
export interface TemplateSection {
  heading: Bilingual;
  /** 記入の手引き(テンプレートに引用ブロックとして入る) */
  guidance: Bilingual;
  /** 記入例の箇条書き(任意) */
  bullets?: Bilingual[];
}

/** 成果物 / A deliverable. */
export interface Deliverable {
  id: string;
  name: Bilingual;
  summary: Bilingual;
  /** 主に作成されるフェーズ ID */
  createdInPhaseIds: string[];
  /** 更新・参照されるフェーズ ID */
  refinedInPhaseIds: string[];
  /** 記載項目 */
  contents: Bilingual[];
  /** 作成のコツ */
  tips: Bilingual[];
  keywords: string[];
  /** Markdown 雛形の節構成 */
  template?: TemplateSection[];
}

/** 用語 / A glossary term. */
export interface GlossaryTerm {
  id: string;
  term: Bilingual;
  definition: Bilingual;
  keywords: string[];
}

/** コンサルティングルール / A situation-to-guidance rule. */
export interface ConsultRule {
  id: string;
  name: Bilingual;
  /** 状況文にマッチさせるキーワード(小文字で比較。日本語はそのまま部分一致) */
  keywords: string[];
  /** 状況の見立て */
  diagnosis: Bilingual;
  phaseIds: string[];
  techniqueIds: string[];
  deliverableIds: string[];
  /** 推奨アクション */
  actions: Bilingual[];
  /** ステークホルダーへの確認質問 */
  questions: Bilingual[];
}

/** 検索結果の種別 / Kind of a search hit. */
export type KnowledgeKind = 'phase' | 'technique' | 'deliverable' | 'glossary';

/** 検索結果 / A search hit. */
export interface SearchHit {
  kind: KnowledgeKind;
  id: string;
  title: Bilingual;
  snippet: Bilingual;
  score: number;
}

/** 指定言語で 1 行に整形する / Render one bilingual value for the requested language. */
export function text(value: Bilingual, lang: Lang): string {
  if (lang === 'ja') return value.ja;
  if (lang === 'en') return value.en;
  return `${value.ja} / ${value.en}`;
}

/** 箇条書きに整形する / Render a bilingual list as Markdown bullets. */
export function bullets(values: Bilingual[], lang: Lang, indent = ''): string {
  if (values.length === 0) return `${indent}- (なし / none)`;
  if (lang === 'both') {
    return values.map((v) => `${indent}- ${v.ja}\n${indent}  - ${v.en}`).join('\n');
  }
  return values.map((v) => `${indent}- ${text(v, lang)}`).join('\n');
}

/** 見出しを言語に応じて整形する / Render a heading for the requested language. */
export function heading(level: number, value: Bilingual, lang: Lang): string {
  return `${'#'.repeat(level)} ${text(value, lang)}`;
}
