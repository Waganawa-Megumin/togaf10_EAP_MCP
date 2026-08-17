/**
 * 知識ベースの Markdown 整形 / Markdown rendering for knowledge-base entries.
 */

import {
  bullets,
  findDeliverable,
  findPhase,
  findTechnique,
  text,
  type AdmPhase,
  type Bilingual,
  type Deliverable,
  type GlossaryTerm,
  type Lang,
  type Technique,
} from '../knowledge/index.js';
import { isWrittenByHuman } from '../engagement/model.js';
import type {
  Assessment,
  Engagement,
  Risk,
  Stakeholder,
  TransitionState,
  WorkPackage,
} from '../engagement/model.js';

const H = {
  purpose: { ja: '目的', en: 'Purpose' },
  inputs: { ja: '主な入力', en: 'Key inputs' },
  steps: { ja: '主なステップ', en: 'Key steps' },
  outputs: { ja: '主な成果物', en: 'Key outputs' },
  tips: { ja: '実務のコツ', en: 'Practitioner tips' },
  related: { ja: '関連', en: 'Related' },
  techniques: { ja: '技法', en: 'Techniques' },
  deliverables: { ja: '成果物', en: 'Deliverables' },
  phases: { ja: 'フェーズ', en: 'Phases' },
  summary: { ja: '概要', en: 'Summary' },
  whenToUse: { ja: '適用場面', en: 'When to use' },
  howTo: { ja: '進め方', en: 'How to run it' },
  pitfalls: { ja: '落とし穴', en: 'Pitfalls' },
  contents: { ja: '記載項目', en: 'Contents' },
  createdIn: { ja: '主に作成するフェーズ', en: 'Created in' },
  refinedIn: { ja: '更新・参照するフェーズ', en: 'Refined in' },
  definition: { ja: '定義', en: 'Definition' },
};

/** フェーズ ID の配列を "A: 名称" の一覧に整形する */
function phaseRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findPhase(id))
    .filter((p): p is AdmPhase => Boolean(p))
    .map((p) => `${p.code} (${text(p.name, lang === 'both' ? 'ja' : lang)})`);
  return names.length > 0 ? names.join(', ') : '—';
}

function techniqueRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findTechnique(id))
    .filter((t): t is Technique => Boolean(t))
    .map((t) => `${text(t.name, lang === 'both' ? 'ja' : lang)} (\`${t.id}\`)`);
  return names.length > 0 ? names.join(', ') : '—';
}

function deliverableRefs(ids: string[], lang: Lang): string {
  const names = ids
    .map((id) => findDeliverable(id))
    .filter((d): d is Deliverable => Boolean(d))
    .map((d) => `${text(d.name, lang === 'both' ? 'ja' : lang)} (\`${d.id}\`)`);
  return names.length > 0 ? names.join(', ') : '—';
}

/** ADM フェーズの詳細 */
export function renderPhase(phase: AdmPhase, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${phase.code}. ${text(phase.name, lang)}`);
  out.push('');
  out.push(`*${text(phase.tagline, lang)}*`);
  out.push('');
  out.push(`## ${text(H.purpose, lang)}`);
  out.push('');
  out.push(text(phase.purpose, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(phase.purpose.en);
  }
  out.push('');
  out.push(`## ${text(H.inputs, lang)}`);
  out.push('');
  out.push(bullets(phase.inputs, lang));
  out.push('');
  out.push(`## ${text(H.steps, lang)}`);
  out.push('');
  out.push(bullets(phase.steps, lang));
  out.push('');
  out.push(`## ${text(H.outputs, lang)}`);
  out.push('');
  out.push(bullets(phase.outputs, lang));
  out.push('');
  out.push(`## ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(phase.tips, lang));
  out.push('');
  out.push(`## ${text(H.related, lang)}`);
  out.push('');
  out.push(`- **${text(H.techniques, lang)}**: ${techniqueRefs(phase.techniqueIds, lang)}`);
  out.push(`- **${text(H.deliverables, lang)}**: ${deliverableRefs(phase.deliverableIds, lang)}`);
  out.push('');
  return out.join('\n');
}

/** 技法の詳細 */
export function renderTechnique(technique: Technique, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(technique.name, lang)}`);
  out.push('');
  out.push(`## ${text(H.summary, lang)}`);
  out.push('');
  out.push(text(technique.summary, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(technique.summary.en);
  }
  out.push('');
  out.push(`## ${text(H.whenToUse, lang)}`);
  out.push('');
  out.push(bullets(technique.whenToUse, lang));
  out.push('');
  out.push(`## ${text(H.howTo, lang)}`);
  out.push('');
  out.push(bullets(technique.steps, lang));
  out.push('');
  out.push(`## ${text(H.pitfalls, lang)}`);
  out.push('');
  out.push(bullets(technique.pitfalls, lang));
  out.push('');
  out.push(`- **${text(H.phases, lang)}**: ${phaseRefs(technique.phaseIds, lang)}`);
  out.push('');
  return out.join('\n');
}

/** 成果物の詳細 */
export function renderDeliverable(deliverable: Deliverable, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(deliverable.name, lang)}`);
  out.push('');
  out.push(`## ${text(H.summary, lang)}`);
  out.push('');
  out.push(text(deliverable.summary, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(deliverable.summary.en);
  }
  out.push('');
  out.push(`- **${text(H.createdIn, lang)}**: ${phaseRefs(deliverable.createdInPhaseIds, lang)}`);
  out.push(`- **${text(H.refinedIn, lang)}**: ${phaseRefs(deliverable.refinedInPhaseIds, lang)}`);
  out.push('');
  out.push(`## ${text(H.contents, lang)}`);
  out.push('');
  out.push(bullets(deliverable.contents, lang));
  out.push('');
  out.push(`## ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(deliverable.tips, lang));
  out.push('');
  return out.join('\n');
}

/** 用語の詳細 */
export function renderGlossaryTerm(term: GlossaryTerm, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${text(term.term, lang)}`);
  out.push('');
  out.push(text(term.definition, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') {
    out.push('');
    out.push(term.definition.en);
  }
  out.push('');
  return out.join('\n');
}

/**
 * 成果物の Markdown 雛形を生成する。
 * template が定義されていればそれを、なければ contents から節を組み立てる。
 *
 * `engagement` を渡すと、登録済みのステークホルダー・リスク・作業パッケージ・
 * 移行状態などを該当する節に流し込む(手作業の転記をなくすため)。
 * 省略した場合は従来どおり空の雛形を返す(後方互換)。
 */
export function renderDeliverableTemplate(
  deliverable: Deliverable,
  lang: Lang,
  engagementName?: string,
  engagement?: Engagement | null,
): string {
  const out: string[] = [];
  const title = text(deliverable.name, lang);
  const fill = engagement ? buildEngagementFill(deliverable, engagement, lang) : null;

  out.push(`# ${title}${engagementName ? ` — ${engagementName}` : ''}`);
  out.push('');
  out.push(
    lang === 'en'
      ? '> Document control: version / author / date / approver'
      : lang === 'ja'
        ? '> 文書管理: 版数 / 作成者 / 日付 / 承認者'
        : '> 文書管理 / Document control: 版数 (version) / 作成者 (author) / 日付 (date) / 承認者 (approver)',
  );
  out.push('');
  if (fill) {
    out.push(...fillHeader(fill, lang));
  }

  // 未挿入の流し込みブロック(見出しに当たらなかったものは末尾にまとめる)
  const pending = (fill?.blocks ?? []).map((block) => ({ block, done: false }));

  if (deliverable.template && deliverable.template.length > 0) {
    for (const section of deliverable.template) {
      out.push(`## ${text(section.heading, lang)}`);
      out.push('');
      out.push(`> ${text(section.guidance, lang)}`);
      out.push('');
      const hits = pending.filter((p) => !p.done && anchorMatches(section.heading, p.block.anchors));
      const replaced = hits.some((p) => p.block.replaceBullets === true);
      if (section.bullets && section.bullets.length > 0 && !replaced) {
        out.push(bullets(section.bullets, lang));
        out.push('');
      }
      if (replaced) {
        out.push(
          bi(
            '_記入例は、この案件に登録済みの実データに置き換えました。_',
            '_The worked example was replaced by this engagement’s own data._',
            lang,
          ),
        );
        out.push('');
      }
      for (const hit of hits) {
        hit.done = true;
        out.push(...markedBlock(hit.block, lang));
      }
      out.push('');
    }
  } else {
    deliverable.contents.forEach((item, i) => {
      out.push(`## ${i + 1}. ${text(item, lang)}`);
      out.push('');
      out.push('');
    });
  }

  const leftovers = pending.filter((p) => !p.done);
  if (leftovers.length > 0) {
    out.push(bi('## 案件データ(参考)', '## Engagement Data (reference)', lang));
    out.push('');
    for (const hit of leftovers) {
      hit.done = true;
      out.push(...markedBlock(hit.block, lang));
    }
  }

  out.push('---');
  out.push('');
  out.push(`### ${text(H.tips, lang)}`);
  out.push('');
  out.push(bullets(deliverable.tips, lang));
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * 案件データの流し込み / Pre-filling a template from the engagement
 *
 * 方針:
 *   - 登録済みの値だけを入れる。未登録の欄は空のまま残す(勝手に埋めない)。
 *   - 入れた箇所には必ず「案件から自動で入れた値」の印を付ける。
 *   - 流し込む先が見つからなければ末尾にまとめて出す(データを落とさない)。
 * ------------------------------------------------------------------ */

/** 雛形に差し込む 1 ブロック */
interface FillBlock {
  /** 挿入先の見出しに含まれるキーワード(ja / en どちらでも可) */
  anchors: string[];
  /** 一致した節の記入例(bullets)を実データで置き換える */
  replaceBullets?: boolean;
  /** ブロック内の見出し(任意) */
  caption?: Bilingual;
  /**
   * 案件の値そのものではなく、次に使うツールの案内。
   * 「自動で入れた値」の印は付けない(印の意味を薄めないため)。
   */
  pointer?: boolean;
  lines: string[];
}

interface EngagementFill {
  engagementName: string;
  blocks: FillBlock[];
  /** 反映した件数の合計 */
  total: number;
  /** 内訳の表示文字列 */
  parts: string[];
  /** 反映するデータが無いときの「次の一手」 */
  hints: string[];
  /** この成果物が流し込み対象か */
  supported: boolean;
  /** エンゲージメント側に登録されている、この成果物の進捗 */
  progressLine?: string;
}

/** 流し込みに対応している成果物 */
const FILLABLE_DELIVERABLE_IDS = new Set([
  'stakeholder-map',
  'architecture-vision',
  'architecture-roadmap',
  'implementation-migration-plan',
  'architecture-requirements-spec',
  'compliance-assessment',
  'architecture-contract',
]);

const INFLUENCE_TEXT: Record<string, Bilingual> = {
  high: { ja: '高', en: 'High' },
  medium: { ja: '中', en: 'Medium' },
  low: { ja: '低', en: 'Low' },
};

const RISK_LEVEL_TEXT: Record<string, Bilingual> = {
  critical: { ja: '致命的', en: 'Critical' },
  high: { ja: '高', en: 'High' },
  medium: { ja: '中', en: 'Medium' },
  low: { ja: '低', en: 'Low' },
};

const RISK_STATUS_TEXT: Record<string, Bilingual> = {
  open: { ja: '未対応', en: 'Open' },
  mitigating: { ja: '対応中', en: 'Mitigating' },
  closed: { ja: '完了', en: 'Closed' },
  accepted: { ja: '受容', en: 'Accepted' },
};

const WP_STATUS_TEXT: Record<string, Bilingual> = {
  proposed: { ja: '提案', en: 'Proposed' },
  planned: { ja: '計画済', en: 'Planned' },
  in_progress: { ja: '進行中', en: 'In progress' },
  delivered: { ja: '完了', en: 'Delivered' },
  cancelled: { ja: '中止', en: 'Cancelled' },
};

const DELIVERABLE_STATUS_TEXT: Record<string, Bilingual> = {
  not_started: { ja: '未着手', en: 'Not started' },
  drafting: { ja: '作成中', en: 'Drafting' },
  review: { ja: 'レビュー中', en: 'In review' },
  approved: { ja: '承認済', en: 'Approved' },
  baselined: { ja: 'ベースライン化', en: 'Baselined' },
};

const RISK_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** 言語に応じて 1 行に畳む(日英が同じ語なら重ねない) */
function bi(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return ja === en ? ja : `${ja} / ${en}`;
}

/** "単数形|複数形" から件数に合う方を選ぶ(区切りが無ければそのまま) */
function pick(forms: string, n: number): string {
  const parts = forms.split('|');
  if (parts.length < 2) return forms;
  return n === 1 ? parts[0] : parts[1];
}

/** ラベル辞書から 1 語を引く(未知の値はそのまま返す) */
function label(dict: Record<string, Bilingual>, key: string | undefined, lang: Lang): string {
  if (!key) return '';
  const found = dict[key];
  return found ? text(found, lang) : cell(key);
}

/**
 * 外部由来の文字列を表のセルに入れられる形にする。
 * 改行を畳み、長すぎるものを切ってから、パイプをエスケープする。
 */
function cell(value: string | number | undefined | null, max = 120): string {
  if (value === undefined || value === null) return '';
  const flat = String(value).replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '';
  const clipped = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return clipped.replace(/\|/g, '\\|');
}

/** 表の 1 行を組み立てる */
function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** 表の見出し行と区切り行 */
function tableHead(headers: string[]): string[] {
  return [row(headers), `| ${headers.map(() => '---').join(' | ')} |`];
}

/** 見出しに流し込み先のキーワードが含まれるか */
function anchorMatches(heading: Bilingual, anchors: string[]): boolean {
  const hay = `${heading.ja}\n${heading.en}`.toLowerCase();
  return anchors.some((a) => hay.includes(a.toLowerCase()));
}

/** 自動反映であることの印 */
function markedBlock(block: FillBlock, lang: Lang): string[] {
  const out: string[] = [];
  if (block.caption) {
    out.push(`**${text(block.caption, lang)}**`);
    out.push('');
  }
  if (block.pointer !== true) {
    out.push(
      bi(
        '**(案件から自動で入れた値。確認して修正してください)**',
        '**(Pre-filled from the engagement — check and correct)**',
        lang,
      ),
    );
    out.push('');
  }
  out.push(...block.lines);
  out.push('');
  return out;
}

/** 冒頭の「N 件を反映しました」 */
function fillHeader(fill: EngagementFill, lang: Lang): string[] {
  const out: string[] = [];
  if (fill.total > 0) {
    const breakdown = fill.parts.join(' / ');
    out.push(
      `> ${bi(
        `**案件「${cell(fill.engagementName, 60)}」から登録済みの ${fill.total} 件を反映しました。**`,
        `**Pre-filled ${fill.total} ${pick('record|records', fill.total)} from engagement “${cell(fill.engagementName, 60)}”.**`,
        lang,
      )}`,
    );
    if (breakdown.length > 0) out.push(`> ${breakdown}`);
    out.push(
      `> ${bi(
        '反映した箇所には印が付いています。空欄は案件に未登録の項目です(こちらで埋めていません)。',
        'Pre-filled blocks are marked. Blank cells are simply not recorded in the engagement yet — nothing was invented.',
        lang,
      )}`,
    );
  } else if (fill.supported) {
    out.push(
      `> ${bi(
        `案件「${cell(fill.engagementName, 60)}」には、この雛形に流し込めるデータがまだ登録されていません。空の雛形を返します。`,
        `Engagement “${cell(fill.engagementName, 60)}” has nothing recorded that fits this template yet, so this is the blank version.`,
        lang,
      )}`,
    );
    for (const hint of fill.hints) out.push(`> ${hint}`);
  }
  if (fill.progressLine) out.push(`> ${fill.progressLine}`);
  if (out.length > 0) out.push('');
  return out;
}

/** ステークホルダー一覧の表 */
function stakeholderTable(people: Stakeholder[], lang: Lang): string[] {
  const lines = tableHead([
    bi('氏名', 'Name', lang),
    bi('役職', 'Title', lang),
    bi('所属', 'Organization', lang),
    bi('関心事', 'Concerns', lang),
    bi('影響力', 'Influence', lang),
    bi('関心度', 'Interest', lang),
    bi('関与方針', 'Approach', lang),
    bi('担当アーキテクト', 'Owning architect', lang),
  ]);
  for (const s of people) {
    lines.push(
      row([
        cell(s.name, 60),
        cell(s.role, 40),
        cell(s.organization, 40),
        cell((s.concerns ?? []).join(' / '), 160),
        label(INFLUENCE_TEXT, s.influence, lang),
        label(INFLUENCE_TEXT, s.interest, lang),
        cell(s.approach, 80),
        '',
      ]),
    );
  }
  return lines;
}

/** ステークホルダー表の下に付ける、未記入欄の指摘 */
function stakeholderGaps(people: Stakeholder[], lang: Lang): string[] {
  const noConcern = people.filter((s) => (s.concerns ?? []).length === 0).map((s) => s.name);
  // 機械が置いた仮置き文字列(旧 ingest_document の「要確認(自動抽出)」)は未記入として扱う
  const noApproach = people.filter((s) => !isWrittenByHuman(s.approach)).map((s) => s.name);
  const out: string[] = [];
  if (noConcern.length > 0) {
    out.push(
      `- ${bi(
        `関心事が未登録: ${cell(noConcern.join('、'), 200)} — 本人の言葉で 1 文入れてください。`,
        `No concern recorded: ${cell(noConcern.join(', '), 200)} — add one sentence in their own words.`,
        lang,
      )}`,
    );
  }
  if (noApproach.length > 0) {
    out.push(
      `- ${bi(
        `関与方針が未登録: ${cell(noApproach.join('、'), 200)} — 誰がどの頻度で話すかを決めてください。`,
        `No engagement approach recorded: ${cell(noApproach.join(', '), 200)} — decide who talks to them, how often.`,
        lang,
      )}`,
    );
  }
  if (out.length > 0) {
    // 表の直後に地の文を続けると表が壊れるので、空行を必ず挟む
    return [
      '',
      bi(
        '_この表の空欄(案件側でも未登録):_',
        '_Blanks in this table that are also blank in the engagement:_',
        lang,
      ),
      '',
      ...out,
    ];
  }
  return out;
}

/** リスク一覧の表(重い順) */
function riskTable(risks: Risk[], lang: Lang): string[] {
  const lines = tableHead([
    bi('リスク', 'Risk', lang),
    bi('レベル', 'Level', lang),
    bi('残存', 'Residual', lang),
    bi('状態', 'Status', lang),
    bi('担当', 'Owner', lang),
    bi('対策', 'Mitigation', lang),
  ]);
  for (const r of risks) {
    lines.push(
      row([
        cell(r.title, 80),
        label(RISK_LEVEL_TEXT, r.level, lang),
        r.residualLevel ? label(RISK_LEVEL_TEXT, r.residualLevel, lang) : '',
        label(RISK_STATUS_TEXT, r.status, lang),
        cell(r.owner, 40),
        cell(r.mitigation, 120),
      ]),
    );
  }
  return lines;
}

/** 作業パッケージ一覧の表 */
function workPackageTable(packages: WorkPackage[], lang: Lang): string[] {
  const lines = tableHead([
    bi('ID', 'ID', lang),
    bi('作業パッケージ', 'Work package', lang),
    bi('状態', 'Status', lang),
    bi('開始', 'Start', lang),
    bi('終了', 'End', lang),
    bi('事業価値', 'Value', lang),
    bi('工数', 'Effort', lang),
    bi('担当', 'Owner', lang),
    bi('先行', 'Depends on', lang),
  ]);
  for (const w of packages) {
    lines.push(
      row([
        `\`${cell(w.id, 40)}\``,
        cell(w.name, 60),
        label(WP_STATUS_TEXT, w.status, lang),
        cell(w.startQuarter, 20),
        cell(w.endQuarter, 20),
        label(INFLUENCE_TEXT, w.businessValue, lang),
        label(INFLUENCE_TEXT, w.effort, lang),
        cell(w.owner, 40),
        cell((w.dependsOn ?? []).join(', '), 60),
      ]),
    );
  }
  return lines;
}

/** 移行アーキテクチャ(中間状態)の表 */
function transitionTable(states: TransitionState[], lang: Lang): string[] {
  const lines = tableHead([
    bi('順', '#', lang),
    bi('中間状態', 'Transition state', lang),
    bi('到達時期', 'Target', lang),
    bi('実現する能力', 'Capabilities', lang),
    bi('ここで止められるか', 'Can we stop here?', lang),
    bi('暫定の仕組み', 'Interim mechanism', lang),
    bi('廃棄計画', 'Disposal plan', lang),
  ]);
  for (const t of states) {
    lines.push(
      row([
        cell(t.order, 6),
        cell(t.name, 60),
        cell(t.targetQuarter, 20),
        cell((t.capabilities ?? []).join(' / '), 140),
        t.standalone ? bi('はい', 'Yes', lang) : bi('いいえ', 'No', lang),
        cell(t.interim, 80),
        cell(t.disposalPlan, 80),
      ]),
    );
  }
  return lines;
}

/** 便益と便益責任者の表 */
function benefitTable(packages: WorkPackage[], lang: Lang): string[] {
  const lines = tableHead([
    bi('作業パッケージ', 'Work package', lang),
    bi('便益', 'Benefit', lang),
    bi('測定指標', 'Measure', lang),
    bi('便益責任者', 'Benefit owner', lang),
    bi('測定時期', 'Measured when', lang),
  ]);
  for (const w of packages) {
    lines.push(
      row([cell(w.name, 60), cell(w.benefit, 120), '', cell(w.benefitOwner, 40), cell(w.endQuarter, 20)]),
    );
  }
  return lines;
}

/** コスト見積りの表 */
function costTable(packages: WorkPackage[], lang: Lang): string[] {
  const lines = tableHead([
    bi('作業パッケージ', 'Work package', lang),
    bi('コスト見積り', 'Cost estimate', lang),
    bi('期間', 'Period', lang),
    bi('費目', 'Category', lang),
    bi('年度配分', 'By fiscal year', lang),
  ]);
  for (const w of packages) {
    const period = [w.startQuarter, w.endQuarter].filter(Boolean).join(' → ');
    lines.push(row([cell(w.name, 60), cell(w.costEstimate, 60), cell(period, 40), '', '']));
  }
  return lines;
}

/** 変革準備度の弱い因子(差の大きい順に上位 3 件) */
function readinessLines(assessments: Assessment[], lang: Lang): string[] {
  const readiness = assessments.filter((a) => a && a.kind === 'readiness');
  if (readiness.length === 0) return [];
  // 手書き JSON でも落ちないように、評価日の欠損を許容する
  const at = (a: Assessment): string => (typeof a.assessedAt === 'string' ? a.assessedAt : '');
  const latest = readiness.reduce((a, b) => (at(a) >= at(b) ? a : b));
  const scale = typeof latest.scale === 'number' ? latest.scale : 5;
  const factors = [...(latest.factors ?? [])]
    .filter((f) => f && typeof f.current === 'number' && typeof f.target === 'number')
    .sort((a, b) => b.target - b.current - (a.target - a.current))
    .slice(0, 3);
  if (factors.length === 0) return [];
  const asOf = cell(at(latest).slice(0, 10), 12);
  const lines: string[] = [];
  lines.push(
    bi(
      `変革準備度「${cell(latest.title, 60)}」で差の大きい因子${asOf ? `(${asOf} 時点)` : ''}:`,
      `Widest readiness gaps in “${cell(latest.title, 60)}”${asOf ? ` (as of ${asOf})` : ''}:`,
      lang,
    ),
  );
  lines.push('');
  lines.push(
    ...tableHead([
      bi('因子', 'Factor', lang),
      bi('現在', 'Current', lang),
      bi('目標', 'Target', lang),
      bi('差', 'Gap', lang),
      bi('備考', 'Note', lang),
    ]),
  );
  for (const f of factors) {
    lines.push(
      row([
        cell(f.name, 60),
        `${f.current} / ${scale}`,
        `${f.target} / ${scale}`,
        cell(f.target - f.current, 6),
        cell(f.note, 80),
      ]),
    );
  }
  return lines;
}

/** 案件の基本情報のブロック */
function engagementFacts(e: Engagement, lang: Lang): string[] {
  const lines: string[] = [];
  const push = (ja: string, en: string, value: string): void => {
    if (value.length === 0) return;
    lines.push(`- **${bi(ja, en, lang)}**: ${value}`);
  };
  push('案件名', 'Engagement', cell(e.name, 100));
  push('クライアント / 対象組織', 'Client / target organization', cell(e.client, 100));
  push('業界', 'Industry', cell(e.industry, 60));
  const phase = findPhase(e.currentPhaseId);
  if (phase) {
    push('現在のフェーズ', 'Current phase', `${phase.code}. ${text(phase.name, lang)}`);
  }
  push('概要・背景', 'Overview', cell(e.description, 400));
  return lines;
}

/**
 * 登録済みの要件。
 *
 * 現時点の `Engagement` に requirements は無く、`normalizeEngagement` も
 * 未知のフィールドを落とすため、この関数は常に空を返す。
 * 要件管理がモデルに入った時点で(normalizeEngagement が保持すれば)
 * そのまま雛形に流れ込むように、緩く読む形で置いてある。
 * それまでは関心事から起こした要件候補を代わりに出す。
 */
interface RecordedRequirement {
  id?: string;
  statement: string;
  type?: string;
  source?: string;
  priority?: string;
  acceptance?: string;
  status?: string;
}

function readRequirements(e: Engagement): RecordedRequirement[] {
  const raw = (e as unknown as Record<string, unknown>).requirements;
  if (!Array.isArray(raw)) return [];
  const out: RecordedRequirement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const str = (key: string): string | undefined =>
      typeof r[key] === 'string' && (r[key] as string).trim().length > 0 ? (r[key] as string) : undefined;
    const statement = str('statement') ?? str('text') ?? str('title') ?? str('name');
    if (!statement) continue;
    out.push({
      id: str('id'),
      statement,
      type: str('type') ?? str('kind'),
      source: str('source'),
      priority: str('priority'),
      acceptance: str('acceptance') ?? str('acceptanceCriteria'),
      status: str('status') ?? str('state'),
    });
  }
  return out;
}

/** 登録済み要件の表 */
function requirementTable(requirements: RecordedRequirement[], lang: Lang): string[] {
  const lines = tableHead([
    bi('ID', 'ID', lang),
    bi('要件', 'Requirement', lang),
    bi('種別', 'Type', lang),
    bi('出所', 'Source', lang),
    bi('優先度', 'Priority', lang),
    bi('受け入れ基準', 'Acceptance criteria', lang),
    bi('状態', 'State', lang),
  ]);
  requirements.forEach((r, i) => {
    lines.push(
      row([
        cell(r.id ?? `R-${String(i + 1).padStart(3, '0')}`, 20),
        cell(r.statement, 160),
        cell(r.type, 30),
        cell(r.source, 60),
        cell(r.priority, 20),
        cell(r.acceptance, 120),
        cell(r.status, 20),
      ]),
    );
  });
  return lines;
}

/** ステークホルダーの関心事を要件候補として起こした表 */
function requirementSeedTable(people: Stakeholder[], lang: Lang): string[] {
  const lines = tableHead([
    bi('ID', 'ID', lang),
    bi('要件(未記入)', 'Requirement (to write)', lang),
    bi('種別', 'Type', lang),
    bi('出所(関心事)', 'Source (concern)', lang),
    bi('提起者', 'Raised by', lang),
    bi('優先度', 'Priority', lang),
    bi('受け入れ基準', 'Acceptance criteria', lang),
    bi('状態', 'State', lang),
  ]);
  let n = 0;
  for (const s of people) {
    for (const concern of s.concerns ?? []) {
      n += 1;
      lines.push(
        row([
          `R-${String(n).padStart(3, '0')}`,
          '',
          '',
          cell(concern, 160),
          cell(s.name, 40),
          '',
          '',
          bi('候補', 'Candidate', lang),
        ]),
      );
    }
  }
  return lines;
}

/** 関心事の数を数える */
function countConcerns(people: Stakeholder[]): number {
  return people.reduce((sum, s) => sum + (s.concerns ?? []).length, 0);
}

/**
 * 成果物ごとに、案件データから流し込むブロックを組み立てる。
 * 未対応の成果物では空の結果を返し、雛形は従来どおりになる。
 */
function buildEngagementFill(d: Deliverable, e: Engagement, lang: Lang): EngagementFill {
  const blocks: FillBlock[] = [];
  const parts: string[] = [];
  const hints: string[] = [];
  let total = 0;

  const people = e.stakeholders ?? [];
  const risks = [...(e.risks ?? [])].sort(
    (a, b) => (RISK_RANK[b.level] ?? 0) - (RISK_RANK[a.level] ?? 0),
  );
  const packages = [...(e.workPackages ?? [])].sort((a, b) =>
    (a.startQuarter ?? 'zzzz').localeCompare(b.startQuarter ?? 'zzzz') || a.name.localeCompare(b.name),
  );
  const transitions = [...(e.transitions ?? [])].sort((a, b) => a.order - b.order);

  // ja 側は日本語の助数詞を選べるようにする(人は「名」、それ以外は「件」)。
  // en は "単数形|複数形" と書ける。
  const count = (n: number, ja: string, en: string, unit = '件'): void => {
    if (n <= 0) return;
    total += n;
    parts.push(bi(`${ja} ${n} ${unit}`, `${n} ${pick(en, n)}`, lang));
  };

  const hint = (ja: string, en: string): void => {
    hints.push(bi(ja, en, lang));
  };

  switch (d.id) {
    case 'stakeholder-map': {
      if (people.length > 0) {
        blocks.push({
          anchors: ['記入例', 'Worked Example'],
          replaceBullets: true,
          caption: {
            ja: `登録済みステークホルダー ${people.length} 名`,
            en: `${people.length} ${pick('stakeholder|stakeholders', people.length)} on record`,
          },
          lines: [...stakeholderTable(people, lang), ...stakeholderGaps(people, lang)],
        });
        count(people.length, 'ステークホルダー', 'stakeholder|stakeholders', '名');
        blocks.push({
          anchors: ['影響力', 'Influence / Interest', 'マトリクス', 'Matrix'],
          pointer: true,
          lines: [
            bi(
              '4 象限への配置は `stakeholder_matrix` が同じデータから作ります(境界線上の人には `*` が付きます)。',
              'Run `stakeholder_matrix` on the same data for the quadrant placement (people on the boundary are marked `*`).',
              lang,
            ),
          ],
        });
      } else {
        hint(
          '登録するとこの表に自動で入ります: `update_engagement \'{"stakeholders":[{"name":"氏名","role":"役職","influence":"high","interest":"medium","concerns":["本人の言葉で 1 文"]}]}\'`',
          'Record them and this table fills itself: `update_engagement \'{"stakeholders":[{"name":"...","role":"...","influence":"high","interest":"medium","concerns":["one sentence in their words"]}]}\'`',
        );
      }
      break;
    }

    case 'architecture-vision': {
      const facts = engagementFacts(e, lang);
      if (facts.length > 0) {
        blocks.push({ anchors: ['エグゼクティブサマリ', 'Executive Summary'], lines: facts });
        total += 1;
        parts.push(bi('案件の基本情報 1 件', '1 engagement profile', lang));
      }
      if (e.scope && e.scope.trim().length > 0) {
        blocks.push({
          anchors: ['対象範囲', 'Scope'],
          caption: { ja: '登録済みのスコープ', en: 'Scope on record' },
          lines: [
            cell(e.scope, 1000),
            '',
            bi(
              '_対象外・前提・制約は案件に未登録です。この節で埋めてください。_',
              '_Exclusions, assumptions, and constraints are not recorded yet — fill them in here._',
              lang,
            ),
          ],
        });
        total += 1;
        parts.push(bi('スコープ 1 件', '1 scope statement', lang));
      }
      if (people.length > 0) {
        blocks.push({
          anchors: ['ステークホルダー', 'Stakeholders'],
          lines: stakeholderTable(people, lang),
        });
        count(people.length, 'ステークホルダー', 'stakeholder|stakeholders', '名');
      }
      const benefitPackages = packages.filter((w) => w.benefit || w.benefitOwner);
      if (benefitPackages.length > 0) {
        blocks.push({
          anchors: ['期待価値', 'Expected Value'],
          lines: benefitTable(benefitPackages, lang),
        });
      }
      if (transitions.length > 0) {
        blocks.push({
          anchors: ['移行の道筋', 'Transition Path', '高レベルギャップ', 'High-Level Gaps'],
          lines: transitionTable(transitions, lang),
        });
        count(transitions.length, '移行状態', 'transition state|transition states');
      }
      const topRisks = risks.slice(0, 5);
      const readiness = readinessLines(e.assessments ?? [], lang);
      if (topRisks.length > 0 || readiness.length > 0) {
        const lines: string[] = [];
        if (topRisks.length > 0) {
          lines.push(...riskTable(topRisks, lang));
          if (risks.length > topRisks.length) {
            lines.push('');
            lines.push(
              bi(
                `_ほか ${risks.length - topRisks.length} 件は \`risk_matrix\` で全体を確認できます。_`,
                `_${risks.length - topRisks.length} more — see \`risk_matrix\` for the full picture._`,
                lang,
              ),
            );
          }
        }
        if (readiness.length > 0) {
          if (lines.length > 0) lines.push('');
          lines.push(...readiness);
        }
        blocks.push({ anchors: ['リスク', 'Risks'], lines });
        count(topRisks.length, 'リスク(上位)', 'top risk|top risks');
      }
      if (blocks.length === 0) {
        hint(
          'まず `start_engagement` で案件名・クライアント・スコープを登録してください。ここに自動で入ります。',
          'Record the engagement name, client, and scope with `start_engagement` — they land here automatically.',
        );
      }
      break;
    }

    case 'architecture-roadmap': {
      if (packages.length > 0) {
        blocks.push({
          anchors: ['作業パッケージ', 'Work Packages'],
          caption: {
            ja: `登録済みの作業パッケージ ${packages.length} 件`,
            en: `${packages.length} ${pick('work package|work packages', packages.length)} on record`,
          },
          lines: workPackageTable(packages, lang),
        });
        count(packages.length, '作業パッケージ', 'work package|work packages');
        const withDeps = packages.filter((w) => (w.dependsOn ?? []).length > 0);
        if (withDeps.length > 0) {
          blocks.push({
            anchors: ['依存関係', 'Dependencies'],
            lines: [
              ...tableHead([
                bi('作業パッケージ', 'Work package', lang),
                bi('先行', 'Depends on', lang),
                bi('依存の種類', 'Kind of dependency', lang),
              ]),
              ...withDeps.map((w) =>
                row([cell(w.name, 60), cell((w.dependsOn ?? []).join(', '), 80), '']),
              ),
            ],
          });
        }
        const benefitPackages = packages.filter((w) => w.benefit || w.benefitOwner);
        if (benefitPackages.length > 0) {
          blocks.push({
            anchors: ['事業価値', 'Value at Each Step'],
            lines: benefitTable(benefitPackages, lang),
          });
        }
      }
      if (transitions.length > 0) {
        blocks.push({
          anchors: ['移行アーキテクチャ', 'Transition Architectures'],
          caption: {
            ja: `登録済みの移行状態 ${transitions.length} 件`,
            en: `${transitions.length} ${pick('transition state|transition states', transitions.length)} on record`,
          },
          lines: transitionTable(transitions, lang),
        });
        count(transitions.length, '移行状態', 'transition state|transition states');
      }
      if (packages.length > 0 || transitions.length > 0) {
        blocks.push({
          anchors: ['タイムライン', 'Timeline'],
          pointer: true,
          lines: [
            bi(
              '同じデータから `diagram_roadmap_gantt` で四半期の帯を描けます(Mermaid)。ここには図を貼ってください。',
              'Draw the quarterly bars from the same data with `diagram_roadmap_gantt` (Mermaid) and paste the diagram here.',
              lang,
            ),
          ],
        });
      }
      if (packages.length === 0 && transitions.length === 0) {
        hint(
          '`add_work_package` と `add_transition_state` で登録すると、この雛形の表に自動で入ります。',
          'Record them with `add_work_package` and `add_transition_state` and they land in these tables automatically.',
        );
      }
      break;
    }

    case 'implementation-migration-plan': {
      if (packages.length > 0) {
        blocks.push({
          anchors: ['プロジェクト分割', 'Project Breakdown'],
          caption: {
            ja: `登録済みの作業パッケージ ${packages.length} 件`,
            en: `${packages.length} ${pick('work package|work packages', packages.length)} on record`,
          },
          lines: workPackageTable(packages, lang),
        });
        count(packages.length, '作業パッケージ', 'work package|work packages');
        blocks.push({
          anchors: ['コスト', 'Cost'],
          lines: [
            ...costTable(packages, lang),
            '',
            bi(
              '_コスト見積りが空の行は案件に未登録です。運用費の増分も忘れずに。_',
              '_Blank cost cells are simply not recorded yet. Do not forget the increase in run cost._',
              lang,
            ),
          ],
        });
        blocks.push({ anchors: ['便益', 'Benefits'], lines: benefitTable(packages, lang) });
      }
      if (transitions.length > 0) {
        blocks.push({
          anchors: ['マイルストーン', 'Milestones'],
          lines: [
            ...transitionTable(transitions, lang),
            '',
            bi(
              '_中止判断ポイント(kill point)は案件に未登録です。上の各段階に付けてください。_',
              '_Kill points are not recorded yet — attach one to each step above._',
              lang,
            ),
          ],
        });
        count(transitions.length, '移行状態', 'transition state|transition states');
      }
      if (risks.length > 0) {
        blocks.push({ anchors: ['リスク', 'Risk'], lines: riskTable(risks, lang) });
        count(risks.length, 'リスク', 'risk|risks');
      }
      if (blocks.length === 0) {
        hint(
          '`add_work_package` で作業パッケージを登録すると、分割・コスト・便益の表に自動で入ります。',
          'Record work packages with `add_work_package` and the breakdown, cost, and benefit tables fill themselves.',
        );
      }
      break;
    }

    case 'architecture-requirements-spec': {
      const requirements = readRequirements(e);
      if (requirements.length > 0) {
        blocks.push({
          anchors: ['要件一覧', 'Requirement Table'],
          caption: {
            ja: `登録済みの要件 ${requirements.length} 件`,
            en: `${requirements.length} ${pick('requirement|requirements', requirements.length)} on record`,
          },
          lines: requirementTable(requirements, lang),
        });
        count(requirements.length, '要件', 'requirement|requirements');
      } else if (countConcerns(people) > 0) {
        const seeds = countConcerns(people);
        blocks.push({
          anchors: ['要件一覧', 'Requirement Table'],
          caption: {
            ja: `ステークホルダーの関心事から起こした要件候補 ${seeds} 件`,
            en: `${seeds} ${pick('requirement candidate|requirement candidates', seeds)} seeded from stakeholder concerns`,
          },
          lines: [
            ...requirementSeedTable(people, lang),
            '',
            bi(
              '_関心事は「要件そのもの」ではありません。検証できる文に書き直し、書き直せないものは行ごと消してください。_',
              '_A concern is not yet a requirement. Rewrite each into a verifiable statement, and delete the rows you cannot._',
              lang,
            ),
          ],
        });
        count(seeds, '要件候補(関心事から)', 'requirement candidate from concerns|requirement candidates from concerns');
      }
      if (e.scope && e.scope.trim().length > 0) {
        blocks.push({
          anchors: ['スコープ', 'Scope and Sources'],
          lines: [cell(e.scope, 1000)],
        });
        total += 1;
        parts.push(bi('スコープ 1 件', '1 scope statement', lang));
      }
      if (blocks.length === 0) {
        hint(
          'ステークホルダーの関心事を登録すると、それを出所とする要件候補の行を自動で起こします。',
          'Record stakeholder concerns and this tool seeds requirement rows that cite them as the source.',
        );
      }
      break;
    }

    case 'compliance-assessment': {
      const facts = engagementFacts(e, lang);
      if (facts.length > 0) {
        blocks.push({
          anchors: ['評価の対象', 'Subject'],
          lines: [
            ...facts,
            '',
            bi(
              '_評価した設計書の版と評価日は案件に未登録です。ここで埋めてください。_',
              '_The design version reviewed and the assessment date are not recorded — fill them in here._',
              lang,
            ),
          ],
        });
        total += 1;
        parts.push(bi('案件の基本情報 1 件', '1 engagement profile', lang));
      }
      if (people.length > 0) {
        blocks.push({
          anchors: ['評価者', 'Assessors'],
          caption: {
            ja: `出席候補(登録済みステークホルダー ${people.length} 名)`,
            en: `Attendee candidates (${people.length} ${pick('stakeholder|stakeholders', people.length)} on record)`,
          },
          lines: [
            ...tableHead([
              bi('氏名', 'Name', lang),
              bi('役職', 'Title', lang),
              bi('所属', 'Organization', lang),
              bi('役割(評価者/被評価側)', 'Role in the review', lang),
              bi('出席', 'Attended', lang),
            ]),
            ...people.map((s) => row([cell(s.name, 60), cell(s.role, 40), cell(s.organization, 40), '', ''])),
            '',
            bi(
              '_全員が出席するとは限りません。出席しない人の行は消してください。_',
              '_Not everyone attends. Delete the rows for those who do not._',
              lang,
            ),
          ],
        });
        count(people.length, 'ステークホルダー(出席候補)', 'stakeholder as attendee candidate|stakeholders as attendee candidates', '名');
      }
      if (blocks.length === 0) {
        hint(
          '`start_engagement` で案件名・クライアント・スコープを登録すると、評価対象の欄に自動で入ります。',
          'Record the engagement name, client, and scope with `start_engagement` and the subject section fills itself.',
        );
      }
      break;
    }

    case 'architecture-contract': {
      const facts = engagementFacts(e, lang);
      if (facts.length > 0) {
        blocks.push({
          anchors: ['当事者', 'Parties'],
          lines: [
            ...facts,
            '',
            bi(
              '_相手方(実装チーム / 供給者)と有効期間は案件に未登録です。ここで埋めてください。_',
              '_The counterparty (delivery team or supplier) and the term are not recorded — fill them in here._',
              lang,
            ),
          ],
        });
        total += 1;
        parts.push(bi('案件の基本情報 1 件', '1 engagement profile', lang));
      }
      const signers = people.filter((s) => s.influence === 'high');
      if (signers.length > 0) {
        blocks.push({
          anchors: ['署名', 'Signatures'],
          caption: {
            ja: `署名者の候補(影響力「高」で登録されている ${signers.length} 名)`,
            en: `Signatory candidates (${signers.length} ${pick('stakeholder|stakeholders', signers.length)} recorded with high influence)`,
          },
          lines: [
            ...tableHead([
              bi('氏名', 'Name', lang),
              bi('役職', 'Title', lang),
              bi('所属', 'Organization', lang),
              bi('署名日', 'Date', lang),
            ]),
            ...signers.map((s) => row([cell(s.name, 60), cell(s.role, 40), cell(s.organization, 40), ''])),
            '',
            bi(
              '_影響力が高い人が署名者とは限りません。決裁権限で確認してください。_',
              '_High influence does not imply signing authority. Confirm against the approval rules._',
              lang,
            ),
          ],
        });
        count(signers.length, '署名者候補', 'signatory candidate|signatory candidates', '名');
      }
      if (blocks.length === 0) {
        hint(
          '`start_engagement` で案件名・クライアントを登録すると、当事者の欄に自動で入ります。',
          'Record the engagement name and client with `start_engagement` and the parties section fills itself.',
        );
      }
      break;
    }

    default:
      break;
  }

  // この成果物が案件側で管理されていれば、その状況を冒頭に添える
  let progressLine: string | undefined;
  const progress = (e.deliverables ?? []).find(
    (p) => p.deliverableId === d.id || p.name === d.name.ja || p.name === d.name.en,
  );
  if (progress) {
    const bits = [
      label(DELIVERABLE_STATUS_TEXT, progress.status, lang),
      progress.owner ? bi(`担当 ${cell(progress.owner, 40)}`, `owner ${cell(progress.owner, 40)}`, lang) : '',
      progress.link ? cell(progress.link, 120) : '',
    ].filter((s) => s.length > 0);
    progressLine = bi(
      `案件側の登録状況: ${bits.join(' / ')}`,
      `Recorded status in the engagement: ${bits.join(' / ')}`,
      lang,
    );
  }

  return {
    engagementName: e.name,
    blocks,
    total,
    parts,
    hints,
    supported: FILLABLE_DELIVERABLE_IDS.has(d.id),
    progressLine,
  };
}
