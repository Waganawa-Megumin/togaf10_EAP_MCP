/**
 * レビュー・健全性チェックツール / Review and health-check tools.
 *
 * - `generate_review_checklist` — 知識ベースを「これが満たされていなければ差し戻す」という
 *   レビュー観点に翻訳し、1 ページに収まるチェックリストを生成する。
 * - `check_engagement_health` — 保存済みエンゲージメントを監査し、実務上の危険信号を
 *   重大度付きで指摘する。
 *
 * ここに書かれた解説・チェック観点はすべて独自の記述であり、TOGAF 標準の原文は含まない。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  findDeliverable,
  findPhase,
  text,
  type AdmPhase,
  type Bilingual,
  type Deliverable,
  type Lang,
} from '../knowledge/index.js';
import { loadEngagement } from '../engagement/store.js';
import {
  CONFIDENCE_DEFINITIONS,
  hasProvenance,
  isConfidence,
  summarizeProgress,
  summarizeProvenance,
  type Assessment,
  type AssessmentFactor,
  type AssessmentKind,
  type DeliverableProgress,
  type Engagement,
  type Provenance,
  type ProvenanceConfidence,
} from '../engagement/model.js';
import { DELIVERABLE_STATUS_LABEL, L, PHASE_STATUS_LABEL, RISK_LEVEL_LABEL } from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult } from './common.js';
import { capInline, checkFreeText, freeTextSchema, HINTS, IDENTIFIER_LIMIT } from './input-limits.js';

// ---------------------------------------------------------------------------
// 共通ヘルパ / Small shared helpers
// ---------------------------------------------------------------------------

function take<T>(values: T[], n: number): T[] {
  return values.slice(0, Math.max(0, n));
}

/** 英文の単複を揃える小さなヘルパ */
function countEn(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function isAre(n: number): string {
  return n === 1 ? 'is' : 'are';
}

/**
 * 状態ラベルを引く。保存済み JSON は列挙値の検証を通っていないため
 * (`normalizeEngagement` は欠損の補完のみ)、未知の値でも落ちないようにする。
 */
function statusLabel(map: Record<string, Bilingual>, key: string): Bilingual {
  return map[key] ?? { ja: key, en: key };
}

/** 期限として日付計算に使える書式か / Only ISO dates take part in date arithmetic */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 日付として扱える期限だけを返す(自由記述の期限は計算に混ぜない) */
function isoDue(due: string | undefined): string | undefined {
  return due && ISO_DATE.test(due) ? due : undefined;
}

/**
 * 外部由来の文字列を 1 行に畳み、パイプを無害化する。
 * 表セルにも本文にもそのまま置ける形にする。
 */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** 小数第 1 位まで(整数はそのまま) */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 水準を視覚化する簡易バー */
function bar(value: number, scale: number, width = 10): string {
  const ratio = scale <= 0 ? 0 : Math.max(0, Math.min(1, value / scale));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

/** 一覧を「, 」でつなぎ、多すぎる場合は「ほか N 件」で丸める */
function joinNames(names: string[], max: number, lang: Lang): string {
  if (names.length === 0) return '—';
  const head = names.slice(0, max).join(', ');
  const rest = names.length - max;
  if (rest <= 0) return head;
  return `${head}${msg(` ほか ${rest} 件`, ` and ${rest} more`, lang === 'both' ? 'ja' : lang)}`;
}

// ---------------------------------------------------------------------------
// generate_review_checklist
// ---------------------------------------------------------------------------

/** 判定記入欄。レビュアがこの中の 1 つを丸で囲む / 書き換える想定 */
const RATING_SLOT = '[ C / PC / NC / IR ]';

/** ローカル表示ラベル(labels.ts に無いもののみここで定義する) */
const RL = {
  checklist: {
    ja: 'アーキテクチャ適合性レビュー チェックリスト',
    en: 'Architecture Compliance Review Checklist',
  },
  target: { ja: '対象', en: 'Target' },
  reviewDate: { ja: 'レビュー日', en: 'Review date' },
  reviewer: { ja: 'レビュア', en: 'Reviewer' },
  scale: { ja: '判定尺度', en: 'Rating scale' },
  ratingLegend: {
    ja: 'C = 準拠 / PC = 一部準拠 / NC = 非準拠 / IR = 非適合(アーキテクチャ側の改訂が必要)',
    en: 'C = conformant / PC = partially conformant / NC = non-conformant / IR = irreconcilable (the architecture itself must change)',
  },
  howToUse: {
    ja: '各項目に C / PC / NC / IR を記入する。PC・NC・IR は「是正計画」か「期限付きの例外承認」のどちらかに着地させ、空欄のまま閉じない。',
    en: 'Fill in C / PC / NC / IR for every line. Anything below C must end up as either a remediation plan or a time-boxed exception — never left blank.',
  },
  rating: { ja: '判定', en: 'Rating' },
  wrapUp: { ja: '総括', en: 'Wrap-up' },
  overall: { ja: '総合判定', en: 'Overall rating' },
  belowConformant: { ja: 'PC / NC / IR の件数', en: 'Count of PC / NC / IR' },
  remediation: { ja: '是正が必要な項目と期限', en: 'Items needing remediation, with dates' },
  exceptions: { ja: '例外承認する項目(期限必須)', en: 'Items granted an exception (expiry date required)' },
  nextReview: { ja: '次回レビュー時期', en: 'Next review' },
  operating: { ja: 'このチェックリストの運用', en: 'How to keep this checklist useful' },
  // --- セクション見出し ---
  secScope: { ja: 'スコープと前提', en: 'Scope and premises' },
  secInputs: { ja: '入力の確認', en: 'Inputs' },
  secWork: { ja: '作業の実施状況', en: 'Execution of the work' },
  secDeliverables: { ja: '成果物', en: 'Deliverables' },
  secExit: { ja: '出口条件と品質', en: 'Exit criteria and quality' },
  secDocument: { ja: '文書としての体裁', en: 'The document as a document' },
  secContents: { ja: '記載項目', en: 'Required content' },
  secQuality: { ja: '内容の質', en: 'Quality of the content' },
  secTrace: { ja: '整合性と追跡性', en: 'Consistency and traceability' },
  secApproval: { ja: '承認と周知', en: 'Approval and communication' },
  secContract: { ja: '前提と合意', en: 'Premises and agreement' },
  secDesign: { ja: '設計の適合', en: 'Design conformance' },
  secNonFunctional: { ja: '非機能と運用', en: 'Non-functional and operations' },
  secDeviation: { ja: '逸脱と例外', en: 'Deviations and exceptions' },
  secBenefit: { ja: '便益と次の一手', en: 'Benefits and next step' },
} satisfies Record<string, Bilingual>;

interface CheckSection {
  heading: Bilingual;
  items: Bilingual[];
}

/** チェックボックス 1 行を整形する(both では英語を子項目に置く) */
function checkboxLine(no: number, item: Bilingual, lang: Lang): string {
  const slot = lang === 'en' ? `${RL.rating.en}: ${RATING_SLOT}` : `${RL.rating.ja}: ${RATING_SLOT}`;
  if (lang === 'ja') return `- [ ] **${no}.** ${item.ja} — ${slot}`;
  if (lang === 'en') return `- [ ] **${no}.** ${item.en} — ${slot}`;
  return `- [ ] **${no}.** ${item.ja} — ${slot}\n  - ${item.en}`;
}

/**
 * 総項目数を上限内に収める。
 * 1 ページを超えたチェックリストは中身を見ずに埋められるので、
 * 大きいセクションから 1 つずつ削って上限に合わせる。
 */
function capSections(sections: CheckSection[], max: number): CheckSection[] {
  const work = sections.map((s) => ({ heading: s.heading, items: [...s.items] }));
  let total = work.reduce((acc, s) => acc + s.items.length, 0);
  while (total > max) {
    let biggest = work[0];
    for (const s of work) {
      if (s.items.length > biggest.items.length) biggest = s;
    }
    if (biggest.items.length <= 1) break;
    biggest.items.pop();
    total -= 1;
  }
  return work.filter((s) => s.items.length > 0);
}

/** フェーズ用のチェック観点を組み立てる */
function phaseSections(phase: AdmPhase): CheckSection[] {
  const scope: Bilingual[] = [
    {
      ja: 'このフェーズで答えを出すべき問いが文書で定義され、スポンサーが合意しているか',
      en: 'The questions this phase must answer are written down and agreed with the sponsor',
    },
    {
      ja: '対象範囲と「対象外」が明記され、レビュー参加者の理解が一致しているか',
      en: 'Both the scope and the explicit out-of-scope list are stated, and reviewers read them the same way',
    },
    {
      ja: '前フェーズからの前提・制約の変化が反映されているか(古い前提で作業していないか)',
      en: 'Changes to assumptions and constraints since the previous phase are reflected — the work is not running on stale premises',
    },
  ];

  const inputs: Bilingual[] = take(phase.inputs, 3).map((i) => ({
    ja: `${i.ja} を最新版で参照できるか`,
    en: `${i.en} — available and current`,
  }));

  const work: Bilingual[] = take(phase.steps, 5).map((s) => ({
    ja: `${s.ja} — 実施され、判断の根拠が記録されているか`,
    en: `${s.en} — actually done, with the reasoning recorded`,
  }));

  const deliverables: Bilingual[] = take(phase.deliverableIds, 5)
    .map((id) => findDeliverable(id))
    .filter((d): d is Deliverable => Boolean(d))
    .map((d) => ({
      ja: `${d.name.ja} が作成され、レビューと承認を経ているか(草案のままなら差し戻し)`,
      en: `${d.name.en} exists and has been reviewed and approved — a draft is grounds for sending it back`,
    }));

  const exit: Bilingual[] = [
    ...take(phase.tips, 4).map((t) => ({
      ja: `${t.ja} — この観点に照らして問題ないか`,
      en: `${t.en} — does the work hold up against this?`,
    })),
    {
      ja: '未解決の指摘すべてに担当者と期限が付いているか',
      en: 'Every open finding has a named owner and a date',
    },
    {
      ja: '次フェーズへ持ち越す前提・制約・リスクが明示されているか',
      en: 'Assumptions, constraints, and risks carried into the next phase are stated explicitly',
    },
  ];

  return [
    { heading: RL.secScope, items: scope },
    { heading: RL.secInputs, items: inputs },
    { heading: RL.secWork, items: work },
    { heading: RL.secDeliverables, items: deliverables },
    { heading: RL.secExit, items: exit },
  ];
}

/** 成果物用のチェック観点を組み立てる */
function deliverableSections(deliverable: Deliverable): CheckSection[] {
  const document: Bilingual[] = [
    {
      ja: '版数・作成者・日付・承認者が文書の先頭で分かるか',
      en: 'Version, author, date, and approver are visible at the top of the document',
    },
    {
      ja: '想定読者と、その読者にしてほしい判断が冒頭で分かるか',
      en: 'The intended reader — and the decision that reader is expected to make — is clear from the opening',
    },
    {
      ja: '用語と略語が定義され、組織内で意味が割れる言葉に説明が付いているか',
      en: 'Terms and acronyms are defined, especially the ones that mean different things to different teams',
    },
  ];

  const contents: Bilingual[] = take(deliverable.contents, 8).map((c) => ({
    ja: `${c.ja} が記載され、空欄や「TBD」のままになっていないか`,
    en: `${c.en} is filled in — no blanks and no lingering "TBD"`,
  }));

  const quality: Bilingual[] = take(deliverable.tips, 4).map((t) => ({
    ja: `${t.ja} — この観点に照らして問題ないか`,
    en: `${t.en} — does the document hold up against this?`,
  }));

  const trace: Bilingual[] = [
    {
      ja: '記述が要件・原則・事業目標のどれに紐づくか追えるか',
      en: 'Each statement can be traced back to a requirement, a principle, or a business goal',
    },
    {
      ja: '他の成果物と矛盾していないか(同じ事実が別の値で書かれていないか)',
      en: 'Nothing contradicts the other deliverables — the same fact is not stated with two different values',
    },
    {
      ja: '図と本文が一致しているか(図だけ更新されて本文が古い、の逆も)',
      en: 'Diagrams and prose agree — neither one has been updated without the other',
    },
    {
      ja: '数値・前提の出典が示され、後から検証できるか',
      en: 'Figures and assumptions cite their source so they can be checked later',
    },
  ];

  const approval: Bilingual[] = [
    {
      ja: '承認者が特定され、承認の期日が決まっているか',
      en: 'The approver is named and the approval date is set',
    },
    {
      ja: 'レビューコメントがすべて処理済み(反映 / 却下の理由付き)か',
      en: 'Every review comment is closed — either applied or rejected with a reason',
    },
    {
      ja: '内容が変わったときに再周知する相手が決まっているか',
      en: 'It is decided who gets re-notified when the content changes',
    },
  ];

  return [
    { heading: RL.secDocument, items: document },
    { heading: RL.secContents, items: contents },
    { heading: RL.secQuality, items: quality },
    { heading: RL.secTrace, items: trace },
    { heading: RL.secApproval, items: approval },
  ];
}

/** 実装(プロジェクト)用のチェック観点を組み立てる */
function implementationSections(): CheckSection[] {
  const contract: Bilingual[] = [
    {
      ja: 'アーキテクチャ契約(守るべき制約と例外申請の手順)が締結され、実装チームが内容を説明できるか',
      en: 'An architecture contract — the constraints to honour plus the route to request an exception — is in place, and the delivery team can explain it',
    },
    {
      ja: 'レビューの時点が設計段階か(実装完了後の指摘は直せない)',
      en: 'The review happens at design time — findings raised after build cannot be acted on',
    },
    {
      ja: 'レビュー対象と対象外が事前に共有され、判定基準を実装チームが知っているか',
      en: 'What is in and out of review scope, and the rating criteria, were shared before the session',
    },
    {
      ja: '前回レビューの指摘が処理済みか(同じ指摘を繰り返していないか)',
      en: 'Findings from the previous review are closed — the same point is not being raised again',
    },
  ];

  const design: Bilingual[] = [
    {
      ja: 'アーキテクチャ原則からの逸脱が無いか、あるなら根拠が示されているか',
      en: 'No departure from the architecture principles — or, where there is one, the reasoning is stated',
    },
    {
      ja: '採用技術が技術標準の現行版に収まっているか(版まで確認したか)',
      en: 'The chosen technologies sit inside the current technology standards — checked down to the version',
    },
    {
      ja: '既存資産の再利用を検討した形跡があるか(新規構築の理由が説明できるか)',
      en: 'Reuse of existing assets was considered, and building new can be justified',
    },
    {
      ja: '外部インタフェースの仕様が相手方と合意済みで、変更時の連絡経路が決まっているか',
      en: 'External interface specs are agreed with the counterparty, with a channel for notifying changes',
    },
  ];

  const nonFunctional: Bilingual[] = [
    {
      ja: '性能・可用性の目標値が事業要求から導かれ、測定方法まで決まっているか',
      en: 'Performance and availability targets derive from business need, and the way to measure them is defined',
    },
    {
      ja: 'セキュリティ・法規制・監査上の要件が設計に落ちているか(方針の引用で終わっていないか)',
      en: 'Security, regulatory, and audit requirements are designed in, not merely cited as policy',
    },
    {
      ja: 'データの移行・整合・保持期間が設計され、移行失敗時の戻し方があるか',
      en: 'Data migration, consistency, and retention are designed, including how to roll back a failed migration',
    },
    {
      ja: '運用引き継ぎ(監視・障害対応・受け入れ条件)が運用部門と合意済みか',
      en: 'Handover to operations — monitoring, incident response, acceptance criteria — is agreed with the operations side',
    },
  ];

  const deviation: Bilingual[] = [
    {
      ja: '逸脱が漏れなく列挙され、それぞれ「なぜ起きたか」の理由が記録されているか',
      en: 'Every deviation is listed, each with a recorded reason for why it happened',
    },
    {
      ja: '各逸脱が是正か例外承認かに振り分けられ、判断者が記録されているか',
      en: 'Each deviation is routed to remediation or exception, with the decision maker recorded',
    },
    {
      ja: '例外に期限と解消計画が付いているか(期限の無い例外は恒久の標準になる)',
      en: 'Every exception carries an expiry date and a plan to close it — an open-ended exception becomes the permanent standard',
    },
    {
      ja: '同じ種類の逸脱が繰り返されていないか(繰り返すならアーキテクチャ側を疑う)',
      en: 'The same class of deviation is not recurring — if it is, suspect the architecture rather than the team',
    },
  ];

  const benefit: Bilingual[] = [
    {
      ja: '実現するはずの便益と測定時期が定義され、刈り取りの責任者がいるか',
      en: 'The intended benefit, when it will be measured, and who is accountable for realizing it are all defined',
    },
    {
      ja: '実装から生じた変更要求が、正式な受付窓口に起票されているか',
      en: 'Change requests arising from implementation are raised through the single formal intake',
    },
    {
      ja: '今回の学びをアーキテクチャ側へ戻す担当と期限が決まっているか',
      en: 'Someone owns feeding the lessons back into the architecture, by a date',
    },
    {
      ja: '次回レビューの時点(節目)が決まっているか',
      en: 'The milestone for the next review is fixed',
    },
  ];

  return [
    { heading: RL.secContract, items: contract },
    { heading: RL.secDesign, items: design },
    { heading: RL.secNonFunctional, items: nonFunctional },
    { heading: RL.secDeviation, items: deviation },
    { heading: RL.secBenefit, items: benefit },
  ];
}

/** チェックリスト全体を Markdown に整形する */
function renderChecklist(
  targetLine: string,
  sections: CheckSection[],
  lang: Lang,
  extraNotes: Bilingual[],
): string {
  const out: string[] = [];
  out.push(`# ${text(RL.checklist, lang)}`);
  out.push('');
  out.push(`**${text(RL.target, lang)}**: ${targetLine}`);
  out.push('');
  out.push(`| ${text(RL.reviewDate, lang)} | ${text(RL.reviewer, lang)} | ${text(RL.overall, lang)} |`);
  out.push('| --- | --- | --- |');
  out.push(`|  |  | ${RATING_SLOT} |`);
  out.push('');
  out.push(`**${text(RL.scale, lang)}**: ${text(RL.ratingLegend, lang === 'both' ? 'ja' : lang)}`);
  if (lang === 'both') out.push(`  ${RL.ratingLegend.en}`);
  out.push('');
  out.push(`> ${text(RL.howToUse, lang === 'both' ? 'ja' : lang)}`);
  if (lang === 'both') out.push(`> ${RL.howToUse.en}`);
  out.push('');

  let no = 0;
  sections.forEach((section, index) => {
    out.push(`## ${index + 1}. ${text(section.heading, lang)}`);
    out.push('');
    for (const item of section.items) {
      no += 1;
      out.push(checkboxLine(no, item, lang));
    }
    out.push('');
  });

  out.push(`## ${text(RL.wrapUp, lang)}`);
  out.push('');
  out.push(`- **${text(RL.overall, lang)}**: ${RATING_SLOT}`);
  out.push(`- **${text(RL.belowConformant, lang)}**: ____`);
  out.push(`- **${text(RL.remediation, lang)}**: `);
  out.push(`- **${text(RL.exceptions, lang)}**: `);
  out.push(`- **${text(RL.nextReview, lang)}**: `);
  out.push('');
  out.push('---');
  out.push('');
  out.push(`### ${text(RL.operating, lang)}`);
  out.push('');

  const notes: Bilingual[] = [
    {
      ja: `全 ${no} 項目。1 ページに収まる分量を維持する。項目を足したくなったら、代わりに落とす項目を先に決める。`,
      en: `${no} items — keep it to one page. If you want to add a line, decide first which line comes out.`,
    },
    {
      ja: 'レビューは合否判定の場ではなく設計相談の場として運営する。査問会になった瞬間、実装チームは早い段階で相談に来なくなる。',
      en: 'Run the review as a design consultation, not a pass/fail hearing. The moment it feels like a tribunal, teams stop coming early.',
    },
    {
      ja: '判定が C でない項目は、是正計画か期限付きの例外承認のどちらかに必ず着地させる。',
      en: 'Anything rated below C must land on either a remediation plan or a time-boxed exception.',
    },
    ...extraNotes,
    {
      ja: '評価記録そのものの雛形は `generate_deliverable_template` に `compliance-assessment` を渡すと得られる。指摘は `update_engagement` でアクション化すると追跡できる。',
      en: 'Get a skeleton for the assessment record itself by passing `compliance-assessment` to `generate_deliverable_template`, and turn findings into tracked actions with `update_engagement`.',
    },
  ];
  for (const n of notes) {
    if (lang === 'both') {
      out.push(`- ${n.ja}`);
      out.push(`  - ${n.en}`);
    } else {
      out.push(`- ${text(n, lang)}`);
    }
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// check_engagement_health
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'warning' | 'info';

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const SEVERITY_LABEL: Record<Severity, Bilingual> = {
  critical: { ja: '重大', en: 'Critical' },
  warning: { ja: '警告', en: 'Warning' },
  info: { ja: '情報', en: 'Info' },
};

interface Finding {
  severity: Severity;
  /** 安定した識別子(将来の抑制設定などに使えるように付けておく) */
  code: string;
  title: Bilingual;
  detail: Bilingual;
  recommendation: Bilingual;
}

/** ローカル表示ラベル(健全性チェック用) */
const HL = {
  summary: { ja: '集計', en: 'Summary' },
  count: { ja: '件数', en: 'Count' },
  situation: { ja: '状況', en: 'What is happening' },
  goodPoints: { ja: '良好な点(記録に根拠のあるものだけ)', en: 'What is working (only what the record proves)' },
  notJudgeable: { ja: 'まだ判断できないこと(記録が無い)', en: 'What cannot be judged yet (no record)' },
  noGoodPoints: {
    ja: '記録に根拠のある良好な点は 0 件。悪いという意味ではなく、褒める材料がまだ記録に無いという意味。下の「まだ判断できないこと」が、何を埋めれば判断できるようになるかを示している。',
    en: 'Nothing here is backed by the record yet. That is not a negative verdict — there is simply nothing recorded to praise. The list below says which evidence is missing.',
  },
  allJudgeable: {
    ja: '記録が無くて判断を保留した観点は無い(準備度・関係者・リスク・アクション・成果物・決定・進捗のいずれにも記録がある)。',
    en: 'No dimension had to be left unjudged — readiness, stakeholders, risks, actions, deliverables, decisions, and progress all carry records.',
  },
  allClear: {
    ja: '危険信号は検出されませんでした。記録の粒度・鮮度ともに追跡可能な状態です。',
    en: 'No red flags found. The record is detailed and current enough to be trackable.',
  },
  allClearButBlind: {
    ja: '危険信号は検出されませんでしたが、これは「問題が無い」ことの証明にはなりません。記録が空で検査対象にならなかった観点があります(下の「まだ判断できないこと」)。',
    en: 'No red flags were found, but that is not evidence that nothing is wrong: some dimensions have no record at all and were never examined. See "What cannot be judged yet" below.',
  },
  nextStep: { ja: '次の一手', en: 'Next step' },
  auditedAt: { ja: '監査基準日', en: 'Audited as of' },
  kind: { ja: '種別', en: 'Kind' },
  achievement: { ja: '到達度', en: 'Progress to target' },
  verdict: { ja: '判定', en: 'Verdict' },
  assessedAt: { ja: '評価日', en: 'Assessed' },
  provenance: { ja: '出典と確度', en: 'Sources and confidence' },
  metric: { ja: '指標', en: 'Measure' },
  share: { ja: '割合', en: 'Share' },
  withSource: { ja: '出典あり', en: 'With a source' },
  withoutSource: { ja: '出典なし', en: 'Without a source' },
  confidenceUnset: { ja: '確度未設定', en: 'Confidence not set' },
  provenanceBreakdown: { ja: '出典なしの内訳', en: 'Where the sources are missing' },
  provenanceEmpty: {
    ja: '出典を持ちうる項目(リスク・決定事項・アクション・ステークホルダー・成果物・移行状態・作業パッケージ・評価)が 1 件も登録されていないため、この観点は判断できない。出典 0 件は管理が良いことを意味しない。',
    en: 'Nothing that can carry a source — risks, decisions, actions, stakeholders, deliverables, transitions, work packages, assessments — is recorded, so this dimension cannot be judged. Zero sources is not a sign of good practice here.',
  },
} satisfies Record<string, Bilingual>;

/** ローカル日付を YYYY-MM-DD で返す */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 文字列から基準日までの経過日数(不正な値は 0) */
function daysSince(iso: string | undefined, base: Date): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((base.getTime() - t) / 86_400_000);
}

/** 成果物が登録済みか(知識ベース ID か名称の部分一致で判定) */
function findRecordedDeliverable(
  engagement: Engagement,
  deliverableId: string,
  nameHints: string[],
): DeliverableProgress | undefined {
  return engagement.deliverables.find((d) => {
    if (d.deliverableId === deliverableId) return true;
    const name = d.name.toLowerCase();
    return nameHints.some((h) => name.includes(h.toLowerCase()));
  });
}

const APPROVED_STATUSES = new Set(['approved', 'baselined']);

// ---------------------------------------------------------------------------
// 評価(変革準備度 / 成熟度)の読み取り
//
// 保存された評価を健全性チェックの側から読み直す。
// 「評価したのに誰も見ない」状態を避けるため、判定の区切りは
// assess_readiness / assess_maturity と同じ値を使う(両者の結論をずらさない)。
// ---------------------------------------------------------------------------

/** 評価 1 件を読み解いた結果 */
interface AssessmentView {
  assessment: Assessment;
  scale: number;
  avgCurrent: number;
  avgTarget: number;
  /** 目標に対する到達度 (%) */
  achievement: number;
  /** 最も水準の低い因子 */
  weakest: AssessmentFactor;
  /** ギャップが目安以上の因子(大きい順) */
  wideGaps: AssessmentFactor[];
  /** 変革リスクとして扱うギャップの目安 */
  riskThreshold: number;
  /** 評価日からの経過日数 */
  ageDays: number;
}

/** 準備度の判定区分 */
type ReadinessBand = 'ready' | 'conditional' | 'notReady';

const READINESS_VERDICT: Record<ReadinessBand, Bilingual> = {
  ready: { ja: '着手できる', en: 'ready to start' },
  conditional: { ja: '条件付きで着手できる', en: 'can start with conditions' },
  notReady: { ja: '着手前に手当てが必要', en: 'remedies needed before kickoff' },
};

const MATURITY_VERDICT: Record<ReadinessBand, Bilingual> = {
  ready: { ja: 'ほぼ目標水準', en: 'close to target' },
  conditional: { ja: '届く距離', en: 'within reach' },
  notReady: { ja: '差が大きい', en: 'a wide gap' },
};

/** 到達度を判定区分に落とす(準備度と成熟度で境目が異なる) */
function bandOf(kind: AssessmentKind, achievement: number): ReadinessBand {
  const high = kind === 'readiness' ? 85 : 90;
  if (achievement >= high) return 'ready';
  if (achievement >= 60) return 'conditional';
  return 'notReady';
}

/** 判定文(短い方)を返す */
function verdictLabel(kind: AssessmentKind, achievement: number): Bilingual {
  const band = bandOf(kind, achievement);
  return kind === 'readiness' ? READINESS_VERDICT[band] : MATURITY_VERDICT[band];
}

/** 保存済みの評価 1 件を集計する(因子が無い/数値が壊れている記録は捨てる) */
function viewAssessment(assessment: Assessment, base: Date): AssessmentView | undefined {
  const factors = (assessment.factors ?? []).filter(
    (f) => f && typeof f.name === 'string' && Number.isFinite(f.current) && Number.isFinite(f.target),
  );
  if (factors.length === 0) return undefined;
  const scale = Number.isFinite(assessment.scale) && assessment.scale > 0 ? assessment.scale : 5;
  const avgCurrent = factors.reduce((a, f) => a + f.current, 0) / factors.length;
  const avgTarget = factors.reduce((a, f) => a + f.target, 0) / factors.length;
  const achievement = avgTarget > 0 ? Math.round((avgCurrent / avgTarget) * 100) : 100;
  const riskThreshold = Math.max(1, Math.round(scale * 0.3));
  // 最も低い因子。同点なら目標との差が大きいほうを選ぶ(手当ての優先順位が高い側)
  const weakest = factors.reduce((a, b) => {
    if (b.current < a.current) return b;
    if (b.current === a.current && b.target - b.current > a.target - a.current) return b;
    return a;
  });
  const wideGaps = factors
    .filter((f) => f.target - f.current >= riskThreshold)
    .sort((a, b) => b.target - b.current - (a.target - a.current));
  return {
    assessment,
    scale,
    avgCurrent,
    avgTarget,
    achievement,
    weakest,
    wideGaps,
    riskThreshold,
    ageDays: daysSince(assessment.assessedAt || assessment.updatedAt, base),
  };
}

/** 指定種別のうち最新の評価を読む */
function latestAssessment(
  engagement: Engagement,
  kind: AssessmentKind,
  base: Date,
): AssessmentView | undefined {
  const sorted = engagement.assessments
    .filter((a) => a && a.kind === kind)
    .slice()
    .sort((a, b) => (a.assessedAt ?? '').localeCompare(b.assessedAt ?? ''));
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const view = viewAssessment(sorted[i], base);
    if (view) return view;
  }
  return undefined;
}

/** 実行段階に入っている兆候 / Signals that delivery has already started */
interface ExecutionSignals {
  /** 計画済み・進行中・完了の作業パッケージ数 */
  activeWorkPackages: number;
  /** 定義済みの移行状態数 */
  transitions: number;
  /** 進行中・完了になっている実行系フェーズ(E/F/G)のコード */
  executingPhases: string[];
  /** いずれかが当てはまるか */
  any: boolean;
}

const EXECUTION_PHASE_IDS = new Set(['e', 'f', 'g']);

function executionSignals(engagement: Engagement): ExecutionSignals {
  const activeWorkPackages = engagement.workPackages.filter(
    (w) => w.status === 'planned' || w.status === 'in_progress' || w.status === 'delivered',
  ).length;
  const transitions = engagement.transitions.length;
  const executingPhases = engagement.phases
    .filter(
      (p) =>
        EXECUTION_PHASE_IDS.has(p.phaseId) && (p.status === 'in_progress' || p.status === 'completed'),
    )
    .map((p) => findPhase(p.phaseId)?.code ?? p.phaseId);
  return {
    activeWorkPackages,
    transitions,
    executingPhases,
    any: activeWorkPackages > 0 || transitions > 0 || executingPhases.length > 0,
  };
}

/** 実行段階の兆候を読める文にする */
function describeExecution(signals: ExecutionSignals, lang: 'ja' | 'en'): string {
  const parts: string[] = [];
  if (signals.activeWorkPackages > 0) {
    parts.push(
      lang === 'ja'
        ? `作業パッケージ ${signals.activeWorkPackages} 件が計画済み以上`
        : `${countEn(signals.activeWorkPackages, 'work package is', 'work packages are')} planned or further`,
    );
  }
  if (signals.transitions > 0) {
    parts.push(
      lang === 'ja'
        ? `移行状態 ${signals.transitions} 件が定義済み`
        : `${countEn(signals.transitions, 'transition state is', 'transition states are')} defined`,
    );
  }
  if (signals.executingPhases.length > 0) {
    parts.push(
      lang === 'ja'
        ? `フェーズ ${signals.executingPhases.join(', ')} に入っている`
        : `phase ${signals.executingPhases.join(', ')} has been entered`,
    );
  }
  if (parts.length === 0) return lang === 'ja' ? '移行計画はまだ動いていない' : 'delivery has not started yet';
  return parts.join(lang === 'ja' ? '、' : '; ');
}

/** 因子名がリスク台帳のどこかで言及されているか */
function riskMentions(engagement: Engagement, factorName: string): boolean {
  const needle = factorName.trim().toLowerCase();
  if (needle.length < 2) return false;
  return engagement.risks.some((r) =>
    [r.title, r.description, r.mitigation]
      .filter((v): v is string => typeof v === 'string')
      .some((v) => v.toLowerCase().includes(needle)),
  );
}

/** 評価に関する指摘を集める(この案件で着手して大丈夫かに答える部分) */
function assessmentFindings(engagement: Engagement, base: Date): Finding[] {
  const findings: Finding[] = [];
  const readiness = latestAssessment(engagement, 'readiness', base);
  const maturity = latestAssessment(engagement, 'maturity', base);
  const exec = executionSignals(engagement);
  const execJa = describeExecution(exec, 'ja');
  const execEn = describeExecution(exec, 'en');

  if (!readiness) {
    findings.push({
      severity: exec.any ? 'warning' : 'info',
      code: 'readiness-not-assessed',
      title: {
        ja: '変革準備度が一度も評価されていない',
        en: 'Transformation readiness has never been assessed',
      },
      detail: exec.any
        ? {
            ja: `${execJa}。それでも、この組織がその変革に耐えられるかを測った記録が無い。準備できていない組織に計画を渡すと、折れるのは計画ではなく組織のほう。`,
            en: `${execEn}. Yet nothing records whether this organization can absorb the change. Hand a plan to an unready organization and it is the organization, not the plan, that breaks.`,
          }
        : {
            ja: '着手可否を判断する材料が無い。準備度は感覚で語ると必ず楽観に寄るので、因子に分けて点を付けておく。',
            en: 'There is nothing to judge go/no-go against. Readiness discussed by feel always drifts optimistic; score it factor by factor instead.',
          },
      recommendation: {
        ja: '`assess_readiness` を引数なし(`{}`)で呼ぶと既定の因子セットとコピペできる入力例が出る。埋めて save=true で保存すると、以降この健全性チェックにも反映される。',
        en: 'Call `assess_readiness` with no arguments (`{}`) to get the default factor set and a ready-to-paste example. Fill it in and save with save=true, and this health check will pick it up from then on.',
      },
    });
  } else {
    const band = bandOf('readiness', readiness.achievement);
    const verdict = READINESS_VERDICT[band];
    const scoreJa = `${readiness.achievement}%(平均 ${round1(readiness.avgCurrent)} / ${readiness.scale}、判定「${verdict.ja}」)`;
    const scoreEn = `${readiness.achievement}% (average ${round1(readiness.avgCurrent)} of ${readiness.scale} — "${verdict.en}")`;
    const weakJa = `${cell(readiness.weakest.name)}(${round1(readiness.weakest.current)} → ${round1(readiness.weakest.target)})`;
    const weakEn = `${cell(readiness.weakest.name)} (${round1(readiness.weakest.current)} → ${round1(readiness.weakest.target)})`;

    if (band !== 'ready' && exec.any) {
      // 組み合わせの検出: 準備度が足りないのに移行計画だけ先に進んでいる
      findings.push({
        severity: band === 'notReady' ? 'critical' : 'warning',
        code: 'readiness-below-plan',
        title: {
          ja: '変革準備度が足りないまま移行計画が進んでいる',
          en: 'Delivery is moving ahead of transformation readiness',
        },
        detail: {
          ja: `変革準備度は ${scoreJa}。一方で${execJa}。計画の側だけが先行している。最も低い因子は${weakJa}で、ここが動かないまま移行に入ると、止まるのは計画ではなく現場の運用。`,
          en: `Readiness stands at ${scoreEn}, while ${execEn}. Only the plan has moved. The weakest factor is ${weakEn}; enter the transition without shifting it and what stalls is day-to-day operations, not the plan.`,
        },
        recommendation: {
          ja: `着手可否をスポンサーと決め直す。${weakJa}への手当て(誰が何をいつまでに)を \`update_engagement\` のアクションとして登録し、それが決まるまで新規の作業パッケージを増やさない。準備度が短期に上がらないなら、\`add_transition_state\` で単独稼働できる区切りを作り、そこまでに範囲を絞る。`,
          en: `Re-decide go/no-go with the sponsor. Record the remedy for ${weakEn} — who does what by when — as an action via \`update_engagement\`, and add no further work packages until it exists. If readiness cannot rise quickly, use \`add_transition_state\` to carve out a milestone that stands on its own and cut the scope back to it.`,
        },
      });
    } else if (band !== 'ready') {
      findings.push({
        severity: band === 'notReady' ? 'warning' : 'info',
        code: 'readiness-low',
        title: { ja: '変革準備度が着手水準に届いていない', en: 'Transformation readiness is below the level to start' },
        detail: {
          ja: `変革準備度は ${scoreJa}。最も低い因子は${weakJa}。移行計画はまだ動いていないので、いま手当てを決めれば間に合う。`,
          en: `Readiness stands at ${scoreEn}, weakest at ${weakEn}. Delivery has not started, so deciding the remedy now is still in time.`,
        },
        recommendation: {
          ja: `準備度を上げる小さな取り組みを${weakJa}から始め、フェーズ E に入る前に \`assess_readiness\` で測り直す。上がらない因子については、その領域を今回のスコープから外すことを検討する。`,
          en: `Start with one small effort against ${weakEn}, then re-measure with \`assess_readiness\` before entering Phase E. For factors that refuse to move, consider taking that area out of scope this time.`,
        },
      });
    }

    const unregistered = readiness.wideGaps.filter((f) => !riskMentions(engagement, f.name));
    if (unregistered.length > 0) {
      const names = unregistered.map((f) => cell(f.name));
      findings.push({
        severity: 'warning',
        code: 'readiness-gap-not-tracked',
        title: {
          ja: '準備度で開いた因子がリスクとして起票されていない',
          en: 'Wide readiness gaps are not on the risk register',
        },
        detail: {
          ja: `ギャップ +${readiness.riskThreshold} 以上と評価された因子(${joinNames(names, 3, 'ja')})が、リスク台帳のどこにも出てこない。評価はされたが、追跡される形になっていない。`,
          en: `Factors scored with a gap of +${readiness.riskThreshold} or more (${joinNames(names, 3, 'en')}) appear nowhere on the risk register. They were assessed but never made trackable.`,
        },
        recommendation: {
          ja: `\`update_engagement\` に次を渡すとそのまま起票できる: \`{"risks":[{"title":"変革準備度: ${names[0]}","level":"high","status":"open","owner":"(氏名)","mitigation":"(誰が何をいつまでに)"}]}\``,
          en: `Register them directly by passing this to \`update_engagement\`: \`{"risks":[{"title":"Readiness: ${names[0]}","level":"high","status":"open","owner":"(name)","mitigation":"(who does what by when)"}]}\``,
        },
      });
    }

    if (readiness.ageDays >= 180) {
      findings.push({
        severity: 'info',
        code: 'readiness-stale',
        title: { ja: '準備度の評価が古い', en: 'The readiness assessment has aged' },
        detail: {
          ja: `評価から ${readiness.ageDays} 日。準備度は体制変更・予算見直し・キーパーソンの異動で簡単に下がるので、この数値は現状の証拠にならない。`,
          en: `${readiness.ageDays} days since it was taken. Readiness drops easily on a reorganization, a budget review, or one key person leaving, so this figure is no longer evidence of the present.`,
        },
        recommendation: {
          ja: '同じ因子で `assess_readiness` を測り直し、前回との差を見る。下がった因子があれば、その原因が最優先の論点になる。',
          en: 'Re-run `assess_readiness` on the same factors and look at the delta. Any factor that fell is the most important thing on the agenda.',
        },
      });
    }
  }

  if (maturity && bandOf('maturity', maturity.achievement) === 'notReady') {
    findings.push({
      severity: 'info',
      code: 'maturity-low',
      title: { ja: 'EA 実践の成熟度が低い水準にある', en: 'EA practice maturity is at a low level' },
      detail: {
        ja: `成熟度は ${maturity.achievement}%(平均 ${round1(maturity.avgCurrent)} / ${maturity.scale})。この水準で重厚な手続きと大量の成果物を導入すると、書式だけが残って中身が形骸化する。`,
        en: `Maturity is ${maturity.achievement}% (average ${round1(maturity.avgCurrent)} of ${maturity.scale}). Imposing heavy process and a long deliverable list at this level leaves the templates and loses the substance.`,
      },
      recommendation: {
        ja: '`tailor_adm` で作る成果物を絞り、まず 1 案件で回して型を作る。成熟度は手続きを増やすことではなく、回した回数で上がる。',
        en: 'Cut the deliverable list with `tailor_adm` and prove the shape on one engagement first. Maturity rises with repetitions, not with added procedure.',
      },
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 出典と確度の点検 / Provenance checks
//
// 実際の案件では、p.31 の「101,800 名」と p.17 の「12 万人」の食い違いを人が手で
// 照合して見つけていた。**照合は機械の仕事**であり、その前提が「どの項目がどの資料の
// どこから来たか」を持っていること。ここでは持っているかどうかを数え、
// 持っていない項目を名指しする(直させるのではなく、確認させる)。
// ---------------------------------------------------------------------------

/** 台帳の種別ラベル(`summarizeProvenance` の kind と 1 対 1) */
const KIND_LABEL: Record<string, Bilingual> = {
  risk: { ja: 'リスク', en: 'risk' },
  decision: { ja: '決定事項', en: 'decision' },
  action: { ja: 'アクション', en: 'action' },
  stakeholder: { ja: 'ステークホルダー', en: 'stakeholder' },
  deliverable: { ja: '成果物', en: 'deliverable' },
  transition: { ja: '移行状態', en: 'transition state' },
  workPackage: { ja: '作業パッケージ', en: 'work package' },
  assessment: { ja: '評価', en: 'assessment' },
};

function kindLabel(kind: string, lang: 'ja' | 'en'): string {
  return KIND_LABEL[kind]?.[lang] ?? kind;
}

/** 出典の観点から見た台帳の 1 項目 */
interface ProvenanceItem {
  kind: string;
  /** 見出し(パイプ escape 済み) */
  label: string;
  source?: string;
  confidence?: ProvenanceConfidence;
  /**
   * すでに意思決定に効いている項目か。
   * 出典の無い項目でも、まだ誰も使っていないものと、承認済みの決定に化けているものでは
   * 意味がまるで違う。ここが true の項目を優先して確認させる。
   */
  loadBearing: boolean;
}

/**
 * 出典を持ちうる項目を 1 列に並べる。
 * 種別と順序は `summarizeProvenance`(model.ts)と揃えてある。
 */
function provenanceItems(engagement: Engagement): ProvenanceItem[] {
  const items: ProvenanceItem[] = [];
  const push = (kind: string, entity: unknown, label: unknown, loadBearing: boolean): void => {
    if (!entity || typeof entity !== 'object') return;
    const p = entity as Provenance;
    items.push({
      kind,
      label: cell(typeof label === 'string' && label.trim().length > 0 ? label : '(無題 / untitled)'),
      source: typeof p.source === 'string' ? p.source : undefined,
      confidence: isConfidence(p.confidence) ? p.confidence : undefined,
      loadBearing,
    });
  };
  for (const r of engagement.risks ?? []) {
    push(
      'risk',
      r,
      r?.title,
      (r?.level === 'critical' || r?.level === 'high') && (r?.status === 'open' || r?.status === 'mitigating'),
    );
  }
  for (const d of engagement.decisions ?? []) push('decision', d, d?.title, d?.status === 'accepted');
  for (const a of engagement.actions ?? []) push('action', a, a?.title, a?.status !== 'done');
  for (const s of engagement.stakeholders ?? []) push('stakeholder', s, s?.name, s?.influence === 'high');
  for (const d of engagement.deliverables ?? []) {
    push('deliverable', d, d?.name, d ? APPROVED_STATUSES.has(d.status) : false);
  }
  // 移行状態と評価は、存在する時点で計画や着手可否の判断に使われている
  for (const t of engagement.transitions ?? []) push('transition', t, t?.name, true);
  for (const w of engagement.workPackages ?? []) {
    push('workPackage', w, w?.name, w?.status === 'planned' || w?.status === 'in_progress' || w?.status === 'delivered');
  }
  for (const a of engagement.assessments ?? []) push('assessment', a, a?.title, true);
  return items;
}

/** 出典の付き具合を読み解いた結果 */
interface ProvenanceView {
  /** 出典を持ちうる項目の総数 */
  total: number;
  withSource: number;
  withoutSource: number;
  /** 出典が付いている割合 (%)。total が 0 のときは 0 */
  coverage: number;
  byConfidence: Record<ProvenanceConfidence | 'unset', number>;
  items: ProvenanceItem[];
  /** 出典が無い項目 */
  missing: ProvenanceItem[];
  /** 出典が無く、かつ既に意思決定に効いている項目 */
  missingLoadBearing: ProvenanceItem[];
  /** 種別ごとの「出典なし」件数(多い順) */
  missingByKind: { kind: string; count: number }[];
  /** 確度が inferred のまま残っている項目 */
  inferred: ProvenanceItem[];
  /** inferred のまま意思決定に効いている項目 */
  inferredLoadBearing: ProvenanceItem[];
  /** 確度が unknown(出所不明)の項目 */
  unknownOrigin: ProvenanceItem[];
  /** 出典はあるが確度が入っていない項目 */
  sourcedWithoutConfidence: ProvenanceItem[];
}

/** 一覧を「種別: 見出し」の形の文字列にする */
function itemNames(items: ProvenanceItem[], lang: 'ja' | 'en'): string[] {
  return items.map((i) => `${kindLabel(i.kind, lang)}: ${i.label}`);
}

/** 「まずこの 1 件から」を指すための先頭 1 件(空なら —) */
function firstName(items: ProvenanceItem[], lang: 'ja' | 'en'): string {
  return items.length > 0 ? `${kindLabel(items[0].kind, lang)}: ${items[0].label}` : '—';
}

function viewProvenance(engagement: Engagement): ProvenanceView {
  // 件数の権威は model.ts 側に置く(表・図・点検で数字がずれないようにするため)
  const summary = summarizeProvenance(engagement);
  const items = provenanceItems(engagement);
  const missing = items.filter((i) => !hasProvenance(i));
  const counts = new Map<string, number>();
  for (const m of missing) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const inferred = items.filter((i) => i.confidence === 'inferred');
  return {
    total: summary.total,
    withSource: summary.withSource,
    withoutSource: summary.withoutSource,
    coverage: summary.total > 0 ? Math.round((summary.withSource / summary.total) * 100) : 0,
    byConfidence: summary.byConfidence,
    items,
    missing,
    missingLoadBearing: missing.filter((i) => i.loadBearing),
    missingByKind: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    inferred,
    inferredLoadBearing: inferred.filter((i) => i.loadBearing),
    unknownOrigin: items.filter((i) => i.confidence === 'unknown'),
    sourcedWithoutConfidence: items.filter((i) => hasProvenance(i) && i.confidence === undefined),
  };
}

/** 「出典なし」の内訳を 1 行にする(リスク 3 件 / 決定事項 1 件) */
function describeMissingByKind(view: ProvenanceView, lang: 'ja' | 'en'): string {
  if (view.missingByKind.length === 0) return lang === 'ja' ? 'なし' : 'none';
  return view.missingByKind
    .map((m) => (lang === 'ja' ? `${kindLabel(m.kind, 'ja')} ${m.count} 件` : `${countEn(m.count, kindLabel(m.kind, 'en'), `${kindLabel(m.kind, 'en')}s`)}`))
    .join(lang === 'ja' ? ' / ' : ', ');
}

/**
 * 出典に関する指摘を集める。
 *
 * **データが無いことを根拠に褒めない。** 出典 0 件の案件は「出典管理が良好」ではなく、
 * 出典が 1 件も無い案件として扱う。台帳自体が空(total = 0)の場合はここでは何も言わない
 * ——空の台帳は既に他の指摘が扱っているので、二重に鳴らさない。
 */
function provenanceFindings(view: ProvenanceView): Finding[] {
  const findings: Finding[] = [];
  if (view.total === 0) return findings;

  const loadNoteJa = '意思決定に効いている項目(対応中の高リスク・承認済みの決定・未完了のアクション・影響力の高い関係者・承認済み成果物・計画済み以上の作業パッケージ・移行状態・評価)';
  const loadNoteEn = 'entries that already carry weight — live high risks, accepted decisions, open actions, high-influence stakeholders, approved deliverables, planned-or-later work packages, transition states, assessments';

  if (view.withSource === 0) {
    findings.push({
      severity: 'warning',
      code: 'no-provenance-recorded',
      title: {
        ja: '出典が記録されている項目が 1 件も無い',
        en: 'Not one entry records where it came from',
      },
      detail: {
        ja: `台帳の ${view.total} 件すべてに出典が無い(内訳: ${describeMissingByKind(view, 'ja')})。どれが資料に書いてあったことで、どれがこちら側の解釈なのかを、後から区別できない。「その数字はどこに書いてありますか」と聞かれて答えられない項目が ${view.total} 件あるという意味。`,
        en: `All ${view.total} entries in the ledger carry no source (${describeMissingByKind(view, 'en')}). Nothing separates what a document actually said from what was read into it. Put plainly: ${view.total} entries have no answer to "where does that figure come from?".`,
      },
      recommendation: {
        ja: `全部を埋めようとしないこと。${loadNoteJa}から順に、原文の該当箇所を開いて確認してください。確認できたものは source に「文書名 p.5」「2026-08-14 ヒアリング(情シス部長)」の形で、資料に書かれていない項目は confidence を inferred にして推測であることを残す(記録の入り口は種別ごとに違う: リスク・決定事項・アクション・関係者・成果物は \`update_engagement\`、移行状態は \`add_transition_state\`、作業パッケージは \`add_work_package\`、評価は \`assess_readiness\` / \`assess_maturity\`。いずれも既存の id を渡せば出典だけを後から足せる)。次の一手: いま最も重い 3 件を選び、その 3 件だけ原文と突き合わせる。`,
        en: `Do not try to fill them all. Start with ${loadNoteEn}, and open the original passage to check each one. Record what you can point at in source as "doc p.5" or "2026-08-14 interview (Head of IT)"; where the document does not say it, set confidence to inferred so the guess stays visible (the entry point differs by kind: \`update_engagement\` for risks, decisions, actions, stakeholders and deliverables; \`add_transition_state\`; \`add_work_package\`; \`assess_readiness\` / \`assess_maturity\` — each accepts an existing id, so a source can be added afterwards). Next step: pick the three heaviest entries and check only those against the source.`,
      },
    });
  } else if (view.withoutSource > 0) {
    const heavy = view.missingLoadBearing.length;
    findings.push({
      severity: heavy > 0 || view.coverage < 50 ? 'warning' : 'info',
      code: 'entries-without-provenance',
      title: { ja: '出典の付いていない項目が残っている', en: 'Entries are still missing a source' },
      detail: {
        ja: `全 ${view.total} 件のうち出典があるのは ${view.withSource} 件(${view.coverage}%)、残り ${view.withoutSource} 件に出典が無い。内訳: ${describeMissingByKind(view, 'ja')}。${heavy > 0 ? `うち ${heavy} 件は既に意思決定に効いている: ${joinNames(itemNames(view.missingLoadBearing, 'ja'), 5, 'ja')}。` : `該当: ${joinNames(itemNames(view.missing, 'ja'), 5, 'ja')}。`}出典の無い項目は、後から真偽を確かめられないため、消す判断も残す判断もできなくなる。`,
        en: `${view.withSource} of ${view.total} entries carry a source (${view.coverage}%); ${view.withoutSource} do not — ${describeMissingByKind(view, 'en')}. ${heavy > 0 ? `${heavy} of them already carry weight: ${joinNames(itemNames(view.missingLoadBearing, 'en'), 5, 'en')}.` : `Affected: ${joinNames(itemNames(view.missing, 'en'), 5, 'en')}.`} An entry with no source can never be verified later, so it can be neither safely kept nor safely deleted.`,
      },
      recommendation: {
        ja: `${heavy > 0 ? '重い側から' : '上から'}順に、その記述が資料のどこから来たのかを確認してください。原文を指させるものは source に出典を、指させないものは confidence を inferred か unknown にして、推測であることを台帳に残す。次の一手: 「${firstName(heavy > 0 ? view.missingLoadBearing : view.missing, 'ja')}」の出典を 1 件だけ確認するところから始める。`,
        en: `Work ${heavy > 0 ? 'from the heaviest entries' : 'from the top'} and confirm where each statement came from. Where the passage can be pointed at, record it in source; where it cannot, set confidence to inferred or unknown so the guess stays on the record. Next step: confirm the source for exactly one entry — "${firstName(heavy > 0 ? view.missingLoadBearing : view.missing, 'en')}".`,
      },
    });
  }

  if (view.inferred.length > 0) {
    const heavy = view.inferredLoadBearing.length;
    findings.push({
      severity: heavy > 0 ? 'warning' : 'info',
      code: 'inferred-entries-unconfirmed',
      title: {
        ja: '推測(inferred)のまま残っている項目がある',
        en: 'Entries are still marked as inferred',
      },
      detail: {
        ja: `確度が inferred の項目が ${view.inferred.length} 件${heavy > 0 ? `、うち ${heavy} 件は既に意思決定に効いている: ${joinNames(itemNames(view.inferredLoadBearing, 'ja'), 5, 'ja')}` : `: ${joinNames(itemNames(view.inferred, 'ja'), 5, 'ja')}`}。inferred は「資料には書かれていないが、書かれていることから導いた」という意味であり、相手に確認するまで事実ではない。推測のまま合意の根拠に使うと、後で覆るのは合意のほう。`,
        en: `${countEn(view.inferred.length, 'entry is', 'entries are')} marked inferred${heavy > 0 ? `, and ${heavy} of them already carry weight: ${joinNames(itemNames(view.inferredLoadBearing, 'en'), 5, 'en')}` : `: ${joinNames(itemNames(view.inferred, 'en'), 5, 'en')}`}. Inferred means derived from what the source says, not stated by it — it is not a fact until the client confirms it. Build an agreement on one and it is the agreement that gets overturned later.`,
      },
      recommendation: {
        ja: '各項目を「そう書いてある」「そうは書いていない」で仕分けしてください。書いてあるなら confidence を stated にして出典を指す。書いていないなら、確認する相手と場をその場で決める(決められないなら、確認できていないこと自体をリスクとして起票する)。次の一手: 次の打ち合わせの冒頭 5 分で、この一覧をそのまま読み上げて確認を取る。',
        en: 'Sort each one into "the source says this" or "it does not". Where it does, move confidence to stated and point at the passage. Where it does not, decide there and then who confirms it and when — and if that cannot be decided, register the lack of confirmation itself as a risk. Next step: read this list out in the first five minutes of the next meeting and get each line confirmed.',
      },
    });
  }

  if (view.unknownOrigin.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'unknown-origin-entries',
      title: { ja: '出所不明(unknown)のまま残っている項目がある', en: 'Entries are marked as untraceable' },
      detail: {
        ja: `確度が unknown の項目が ${view.unknownOrigin.length} 件: ${joinNames(itemNames(view.unknownOrigin, 'ja'), 5, 'ja')}。出所が辿れない項目は真偽を確かめられないので、残す判断も消す判断もできない。放置すると、誰も根拠を知らないまま前提として使われ続ける。`,
        en: `${countEn(view.unknownOrigin.length, 'entry is', 'entries are')} marked unknown: ${joinNames(itemNames(view.unknownOrigin, 'en'), 5, 'en')}. An entry whose origin cannot be traced cannot be verified, so it can be neither kept nor dropped with confidence — and left alone it quietly becomes a premise nobody can justify.`,
      },
      recommendation: {
        ja: 'この一覧を持って、書いた本人か案件の古株に「これはどこから来たか」を確認してください。出所が分かれば source に書いて confidence を上げ、分からなければその場で削除する。次の一手: 1 件ずつ「残す / 消す」を決め、決めた結果を決定事項として記録する。',
        en: 'Take this list to whoever wrote it, or to the longest-serving person on the engagement, and ask where each line came from. If the origin turns up, record it in source and raise the confidence; if it does not, delete the entry there and then. Next step: rule keep-or-delete on each one and record the ruling as a decision.',
      },
    });
  }

  if (view.sourcedWithoutConfidence.length > 0) {
    findings.push({
      severity: 'info',
      code: 'source-without-confidence',
      title: {
        ja: '出典はあるが「記載あり」か「推測」かが区別されていない',
        en: 'Sources are recorded but not marked stated or inferred',
      },
      detail: {
        ja: `出典が書かれている ${view.withSource} 件のうち ${view.sourcedWithoutConfidence.length} 件で確度が未設定: ${joinNames(itemNames(view.sourcedWithoutConfidence, 'ja'), 5, 'ja')}。出典が付いていても、その資料に「そう書いてある」のか「そこから導いた」のかが区別されていないと、読み手は結局その 1 件ずつを原文で確かめ直すことになる。`,
        en: `${view.sourcedWithoutConfidence.length} of the ${view.withSource} entries that do carry a source leave confidence unset: ${joinNames(itemNames(view.sourcedWithoutConfidence, 'en'), 5, 'en')}. A source without that distinction still forces the reader back to the original passage for every single line, because nothing says whether the document stated it or someone derived it.`,
      },
      recommendation: {
        ja: `各項目の confidence に ${CONFIDENCE_DEFINITIONS.stated.marker} stated(原文を指させる)/ ${CONFIDENCE_DEFINITIONS.inferred.marker} inferred(導いた)/ ${CONFIDENCE_DEFINITIONS.unknown.marker} unknown(辿れない)のいずれかを入れてください。次の一手: 会議で数字を出す予定の項目だけ先に stated かどうかを確認する。`,
        en: `Set confidence on each entry to ${CONFIDENCE_DEFINITIONS.stated.marker} stated (the passage can be pointed at), ${CONFIDENCE_DEFINITIONS.inferred.marker} inferred (it was derived), or ${CONFIDENCE_DEFINITIONS.unknown.marker} unknown (it cannot be traced). Next step: check only the entries whose figures you plan to quote in a meeting.`,
      },
    });
  }

  return findings;
}

/** エンゲージメントを監査して指摘を集める */
function collectFindings(engagement: Engagement, today: string, base: Date): Finding[] {
  // --- 評価(変革準備度 / 成熟度)---
  // 「この状態で着手して大丈夫か」に最初に答えるため、先頭に置く。
  const findings: Finding[] = assessmentFindings(engagement, base);

  // --- ステークホルダー ---
  const highInfluence = engagement.stakeholders.filter((s) => s.influence === 'high');
  if (engagement.stakeholders.length === 0) {
    findings.push({
      severity: 'critical',
      code: 'no-stakeholders',
      title: { ja: 'ステークホルダーが 1 人も登録されていない', en: 'No stakeholders are recorded' },
      detail: {
        ja: '誰の関心事に応えるアーキテクチャなのかが記録されていない。合意形成の相手が特定できていない案件は、成果物の出来に関わらず承認されない。',
        en: 'There is no record of whose concerns this architecture answers. Work with no identified audience does not get approved, however good the documents are.',
      },
      recommendation: {
        ja: '`update_engagement` で少なくともスポンサー・意思決定者・主要な利用部門を登録し、それぞれの関心事を本人の言葉で書く。',
        en: 'Record at least the sponsor, the decision makers, and the main user organizations with `update_engagement`, capturing each concern in their own words.',
      },
    });
  } else if (highInfluence.length === 0) {
    findings.push({
      severity: 'critical',
      code: 'no-sponsor',
      title: { ja: '影響力の高いステークホルダー(スポンサー)が不在', en: 'No high-influence stakeholder (sponsor) is identified' },
      detail: {
        ja: `登録済み ${engagement.stakeholders.length} 名のうち influence が high の人物がいない。予算と優先順位を動かせる人がいない状態では、指摘も提案も実行に移らない。`,
        en: `None of the ${countEn(engagement.stakeholders.length, 'recorded stakeholder', 'recorded stakeholders')} has high influence. Without someone who can move budget and priorities, neither findings nor proposals turn into action.`,
      },
      recommendation: {
        ja: '意思決定権を持つ人物を特定して influence: high で登録する。見つからない場合、それ自体が最大のリスクなのでリスクとして起票する。',
        en: 'Identify who actually holds the decision right and record them with influence: high. If no such person exists, that is itself the biggest risk — raise it as one.',
      },
    });
  }

  const noApproach = highInfluence.filter((s) => !s.approach || s.approach.trim().length === 0);
  if (noApproach.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'high-influence-no-approach',
      title: { ja: '影響力の高いステークホルダーに関与方針が無い', en: 'High-influence stakeholders have no engagement approach' },
      detail: {
        ja: `${noApproach.map((s) => s.name).slice(0, 3).join('、')} について、いつ何を伝えて何を承認してもらうかが未定。`,
        en: `For ${noApproach.map((s) => s.name).slice(0, 3).join(', ')}, there is no plan for what to tell them, when, and what to have them approve.`,
      },
      recommendation: {
        ja: '各人について「何を承認してほしいか」「いつ・どの形式で報告するか」を approach に書く。',
        en: 'For each of them write, in the approach field, what you need approved and how and when you will report.',
      },
    });
  }

  // --- 現在フェーズ ---
  const currentPhase = findPhase(engagement.currentPhaseId);
  const currentProgress = engagement.phases.find((p) => p.phaseId === engagement.currentPhaseId);
  if (!currentPhase) {
    findings.push({
      severity: 'critical',
      code: 'current-phase-unknown',
      title: { ja: '現在フェーズ ID が未知の値', en: 'Current phase id is unknown' },
      detail: {
        ja: `currentPhaseId = "${engagement.currentPhaseId}" は ADM のフェーズ ID と一致しない。ダッシュボードの集計もこの案件では正しく出ない。`,
        en: `currentPhaseId = "${engagement.currentPhaseId}" matches no ADM phase, so the dashboard roll-up for this engagement will be wrong.`,
      },
      recommendation: {
        ja: `\`update_engagement\` で有効な ID(${ADM_PHASES.map((p) => p.id).join(', ')})に直す。`,
        en: `Set it to a valid id with \`update_engagement\`: ${ADM_PHASES.map((p) => p.id).join(', ')}.`,
      },
    });
  } else if (currentProgress && currentProgress.status !== 'in_progress') {
    findings.push({
      severity: 'warning',
      code: 'current-phase-not-in-progress',
      title: { ja: '現在フェーズが進行中になっていない', en: 'The current phase is not marked in progress' },
      detail: {
        ja: `注力中とされる ${currentPhase.code} の状態が「${statusLabel(PHASE_STATUS_LABEL, currentProgress.status).ja}」。実態と記録がずれているか、次に何をするのかが決まっていない。`,
        en: `Phase ${currentPhase.code} is said to be the focus but its status is "${statusLabel(PHASE_STATUS_LABEL, currentProgress.status).en}". Either the record lags reality, or nobody has decided what happens next.`,
      },
      recommendation: {
        ja: '実態に合わせてフェーズ状態を更新するか、次に着手するフェーズへ currentPhaseId を進める。',
        en: 'Either update the phase status to match reality, or move currentPhaseId to the phase you are actually starting.',
      },
    });
  }

  // --- フェーズ A の要となる成果物 ---
  const phaseA = engagement.phases.find((p) => p.phaseId === 'a');
  if (phaseA?.status === 'completed') {
    const checks: { id: string; hints: string[] }[] = [
      { id: 'architecture-vision', hints: ['architecture vision', 'ビジョン'] },
      {
        id: 'statement-of-architecture-work',
        hints: ['statement of architecture work', '作業範囲', 'soaw'],
      },
    ];
    const missing: Bilingual[] = [];
    const unapproved: Bilingual[] = [];
    for (const c of checks) {
      const kb = findDeliverable(c.id);
      const recorded = findRecordedDeliverable(engagement, c.id, c.hints);
      if (!recorded) {
        missing.push(kb ? kb.name : { ja: c.id, en: c.id });
      } else if (!APPROVED_STATUSES.has(recorded.status)) {
        unapproved.push({
          ja: `${recorded.name}(${statusLabel(DELIVERABLE_STATUS_LABEL, recorded.status).ja})`,
          en: `${recorded.name} (${statusLabel(DELIVERABLE_STATUS_LABEL, recorded.status).en})`,
        });
      }
    }
    if (missing.length > 0) {
      findings.push({
        severity: 'critical',
        code: 'phase-a-outputs-missing',
        title: { ja: 'フェーズ A 完了なのに要となる成果物が登録されていない', en: 'Phase A is complete but its key deliverables are missing' },
        detail: {
          ja: `未登録: ${missing.map((m) => m.ja).join('、')}。これらが無いまま先へ進むと、後で「そんな話は聞いていない」と言われたときに拠り所が無い。`,
          en: `Not recorded: ${missing.map((m) => m.en).join(', ')}. Moving on without them leaves you with nothing to point to when someone later says they never agreed to this.`,
        },
        recommendation: {
          ja: '`generate_deliverable_template` で雛形を出して埋め、`update_engagement` で登録する。既に文書がある場合は保管先リンク付きで登録する。',
          en: 'Produce a skeleton with `generate_deliverable_template`, fill it in, and register it with `update_engagement` — including the storage link if the document already exists.',
        },
      });
    }
    if (unapproved.length > 0) {
      findings.push({
        severity: 'warning',
        code: 'phase-a-outputs-unapproved',
        title: { ja: 'フェーズ A の成果物が未承認のまま', en: 'Phase A deliverables are not approved' },
        detail: {
          ja: `${unapproved.map((u) => u.ja).join('、')} が承認済み(approved / baselined)になっていない。承認されていない作業範囲は、いつでも一方的に広げられる。`,
          en: `${unapproved.map((u) => u.en).join(', ')} — not approved or baselined. An unapproved statement of work can be widened unilaterally at any time.`,
        },
        recommendation: {
          ja: '承認者と承認期日を決め、承認後に成果物の status を approved / baselined に更新する。',
          en: 'Fix the approver and the approval date, then move the deliverable status to approved / baselined once signed.',
        },
      });
    }
  }

  // --- リスク ---
  const activeHighRisks = engagement.risks.filter(
    (r) => (r.level === 'critical' || r.level === 'high') && (r.status === 'open' || r.status === 'mitigating'),
  );
  const unownedRisks = activeHighRisks.filter(
    (r) => !r.owner || r.owner.trim().length === 0 || !r.mitigation || r.mitigation.trim().length === 0,
  );
  if (unownedRisks.length > 0) {
    findings.push({
      severity: 'critical',
      code: 'risk-missing-owner-or-mitigation',
      title: { ja: '高リスクに担当または緩和策が無い', en: 'High risks lack an owner or a mitigation' },
      detail: {
        ja: `${unownedRisks.length} 件が該当(例: ${unownedRisks.map((r) => `${r.title}[${RISK_LEVEL_LABEL[r.level].ja}]`).slice(0, 3).join('、')})。担当のいないリスクは「全員の問題」であり、実際には誰も見ていない。`,
        en: `${countEn(unownedRisks.length, 'risk', 'risks')} affected (e.g. ${unownedRisks.map((r) => `${r.title} [${RISK_LEVEL_LABEL[r.level].en}]`).slice(0, 3).join(', ')}). A risk owned by everyone is watched by no one.`,
      },
      recommendation: {
        ja: '各リスクに 1 名の owner と、具体的な mitigation(誰が何をいつまでに)を書く。書けないなら accepted として明示的に受容する。',
        en: 'Give each risk a single owner and a concrete mitigation — who does what by when. If you cannot write one, accept the risk explicitly instead.',
      },
    });
  }
  if (engagement.risks.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'no-risks',
      title: { ja: 'リスクが 1 件も登録されていない', en: 'No risks are recorded' },
      detail: {
        ja: 'リスクゼロの変革案件は存在しない。記録が無いのは、リスクが無いのではなく見えていない状態を意味する。',
        en: 'No transformation carries zero risk. An empty register means the risks are invisible, not absent.',
      },
      recommendation: {
        ja: '「今の計画が崩れるとしたら何が原因か」を関係者に 3 つ挙げてもらい、そのまま起票する。',
        en: 'Ask the team for the three things most likely to break the plan, and register those verbatim.',
      },
    });
  }

  // --- 決定事項 ---
  if (engagement.decisions.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'no-decisions',
      title: { ja: '決定事項が 1 件も記録されていない', en: 'No decisions are recorded' },
      detail: {
        ja: '何を、誰が、どういう根拠で決めたのかが残っていない。人が入れ替わった時点で同じ議論を最初からやり直すことになる。',
        en: 'There is no record of what was decided, by whom, or on what grounds. The moment people rotate, the same debate restarts from zero.',
      },
      recommendation: {
        ja: '直近で決まったことを 1 件でも良いので背景・決定・根拠の形で記録する習慣を作る。',
        en: 'Start the habit by recording even a single recent decision as context, decision, and rationale.',
      },
    });
  }
  const staleProposed = engagement.decisions.filter(
    (d) => d.status === 'proposed' && daysSince(d.updatedAt, base) >= 14,
  );
  if (staleProposed.length > 0) {
    const oldest = Math.max(...staleProposed.map((d) => daysSince(d.updatedAt, base)));
    findings.push({
      severity: 'warning',
      code: 'stale-proposed-decisions',
      title: { ja: '提案中のまま動いていない決定事項がある', en: 'Proposed decisions have gone quiet' },
      detail: {
        ja: `${staleProposed.length} 件が提案中のまま(最長 ${oldest} 日)。例: ${joinNames(staleProposed.map((d) => d.title), 3, 'ja')}。決まらないこと自体が、事実上「やらない」という決定になっている。`,
        en: `${countEn(staleProposed.length, 'decision', 'decisions')} still sitting as proposed, the oldest for ${oldest} days (e.g. ${joinNames(staleProposed.map((d) => d.title), 3, 'en')}). Not deciding has quietly become a decision not to act.`,
      },
      recommendation: {
        ja: '各件について決裁者と決裁の場を指定する。期日までに決まらない場合の既定の扱い(見送り)も併せて決める。',
        en: 'Name the decision maker and the forum for each one, and agree the default outcome (drop it) if the date passes.',
      },
    });
  }

  // --- アクション ---
  const openActions = engagement.actions.filter((a) => a.status !== 'done');
  const overdue = openActions.filter((a) => {
    const due = isoDue(a.due);
    return due !== undefined && due < today;
  });
  if (overdue.length > 0) {
    findings.push({
      severity: 'critical',
      code: 'overdue-actions',
      title: { ja: '期限を過ぎた未完了アクションがある', en: 'Actions are past their due date' },
      detail: {
        ja: `${overdue.length} 件が期限超過(基準日 ${today})。例: ${joinNames(overdue.map((a) => `${a.title}(期限 ${a.due ?? '—'}${a.owner ? ` / ${a.owner}` : ''})`), 3, 'ja')}。`,
        en: `${countEn(overdue.length, 'action', 'actions')} ${isAre(overdue.length)} overdue as of ${today}. For example: ${joinNames(overdue.map((a) => `${a.title} (due ${a.due ?? '—'}${a.owner ? `, ${a.owner}` : ''})`), 3, 'en')}.`,
      },
      recommendation: {
        ja: '期限を切り直すか、やらないと決めて閉じる。放置された期限は他のすべての期限の重みも下げる。',
        en: 'Either re-date them or close them as "not doing". Ignored dates devalue every other date on the list.',
      },
    });
  }
  const blocked = engagement.actions.filter((a) => a.status === 'blocked');
  if (blocked.length > 0) {
    const longest = Math.max(...blocked.map((a) => daysSince(a.updatedAt, base)));
    findings.push({
      severity: longest >= 7 ? 'warning' : 'info',
      code: 'blocked-actions',
      title: { ja: 'ブロック中のアクションがある', en: 'Actions are blocked' },
      detail: {
        ja: `${blocked.length} 件がブロック中(最長 ${longest} 日更新なし)。例: ${joinNames(blocked.map((a) => a.title), 3, 'ja')}。ブロックの解除は担当者では出来ないことが多い。`,
        en: `${countEn(blocked.length, 'action', 'actions')} ${isAre(blocked.length)} blocked, the longest untouched for ${longest} days (e.g. ${joinNames(blocked.map((a) => a.title), 3, 'en')}). Unblocking is usually beyond the assignee's authority.`,
      },
      recommendation: {
        ja: '何が障害で、誰なら外せるのかを note に書き、その人物をステークホルダーとして登録して直接依頼する。',
        en: 'Write down what the blocker is and who can remove it, register that person as a stakeholder, and ask them directly.',
      },
    });
  }
  const dueSoon = openActions.filter((a) => {
    const due = isoDue(a.due);
    if (due === undefined || due < today) return false;
    return daysSince(`${due}T00:00:00Z`, base) >= -7;
  });
  if (dueSoon.length > 0 && overdue.length === 0) {
    findings.push({
      severity: 'info',
      code: 'due-soon-actions',
      title: { ja: '1 週間以内に期限を迎えるアクションがある', en: 'Actions fall due within a week' },
      detail: {
        ja: `${dueSoon.length} 件: ${joinNames(dueSoon.map((a) => `${a.title}(${a.due ?? '—'})`), 3, 'ja')}。`,
        en: `${countEn(dueSoon.length, 'action', 'actions')}: ${joinNames(dueSoon.map((a) => `${a.title} (${a.due ?? '—'})`), 3, 'en')}.`,
      },
      recommendation: {
        ja: '担当者に着手状況を確認し、間に合わないものは今のうちに期限を引き直す。',
        en: 'Check progress with the owners now, and re-date anything that clearly will not land.',
      },
    });
  }
  // 期限が無いアクションは定義上「期限超過」にならない。超過 0 件をそのまま健全と読むと、
  // 記録の欠落が実績に化けるので、期限そのものの欠落をここで指摘しておく。
  const undatedOpen = openActions.filter((a) => a.due === undefined || a.due.trim().length === 0);
  if (undatedOpen.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'undated-actions',
      title: { ja: '期限の入っていない未完了アクションがある', en: 'Open actions carry no due date' },
      detail: {
        ja: `未完了 ${openActions.length} 件のうち ${undatedOpen.length} 件に期限が入っていない: ${joinNames(undatedOpen.map((a) => a.title), 3, 'ja')}。期限が無いアクションは定義上「期限超過」にならないため、監査では「守られている」ように見えてしまう。`,
        en: `${undatedOpen.length} of ${openActions.length} open actions have no due date: ${joinNames(undatedOpen.map((a) => a.title), 3, 'en')}. An action with no date can never be overdue, so an audit reads it as "on track" when nothing is being tracked at all.`,
      },
      recommendation: {
        ja: '`update_engagement` で 1 件ずつ YYYY-MM-DD の期限を入れる。日付を今決められないものは「いつ決めるか」を決め、その日を期限にする。',
        en: 'Give each one a YYYY-MM-DD due date with `update_engagement`. Where the real date is not knowable yet, set the date by which the date will be decided.',
      },
    });
  }
  // 空文字は上で「未設定」として扱っているので、ここでは書式不正だけを見る(二重報告を避ける)
  const malformedDue = openActions.filter(
    (a) => a.due !== undefined && a.due.trim().length > 0 && isoDue(a.due) === undefined,
  );
  if (malformedDue.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'malformed-due-date',
      title: { ja: '期限の書式が日付として読めない', en: 'Due dates are not machine-readable' },
      detail: {
        ja: `${joinNames(malformedDue.map((a) => `${a.title}(${a.due ?? '—'})`), 3, 'ja')} の期限が YYYY-MM-DD 形式ではないため、期限超過の判定から外れている。読めない期限は監視されない期限と同じ。`,
        en: `The due dates on ${joinNames(malformedDue.map((a) => `${a.title} (${a.due ?? '—'})`), 3, 'en')} are not in YYYY-MM-DD form, so they are excluded from the overdue check. A date nothing can read is a date nothing watches.`,
      },
      recommendation: {
        ja: '`update_engagement` で期限を YYYY-MM-DD に書き直す(例: 2026-09-30)。四半期などの粗い期限しか無い場合は、その四半期の末日を入れて note に粒度を書く。',
        en: 'Rewrite them as YYYY-MM-DD with `update_engagement` (e.g. 2026-09-30). If the real commitment is only a quarter, record the last day of that quarter and note the granularity.',
      },
    });
  }

  // --- フェーズと成果物の対応 ---
  const completedPhases = engagement.phases.filter((p) => p.status === 'completed');
  const orphanPhases = completedPhases.filter(
    (p) => !engagement.deliverables.some((d) => d.phaseId === p.phaseId),
  );
  if (orphanPhases.length > 0) {
    const codes = orphanPhases.map((p) => findPhase(p.phaseId)?.code ?? p.phaseId);
    findings.push({
      severity: 'warning',
      code: 'completed-phase-without-deliverable',
      title: { ja: '完了フェーズに紐づく成果物が無い', en: 'Completed phases have no deliverables attached' },
      detail: {
        ja: `${codes.join(', ')} が完了扱いだが、そのフェーズに紐づく成果物が 1 件も登録されていない。「終わった」と言えるだけの物証が無い状態。`,
        en: `${codes.join(', ')} ${isAre(orphanPhases.length)} marked complete, yet no deliverable is attached. There is nothing to show for the claim that the work finished.`,
      },
      recommendation: {
        ja: '既にある文書を phaseId 付きで登録する。本当に何も作っていないなら、そのフェーズは完了ではなく skipped として扱う。',
        en: 'Register the documents that do exist with a phaseId. If genuinely nothing was produced, mark the phase skipped rather than complete.',
      },
    });
  }

  const orderable = ADM_PHASES.filter((p) => p.id !== 'requirements-management').sort((a, b) => a.order - b.order);
  const statusOf = new Map(engagement.phases.map((p) => [p.phaseId, p.status] as const));
  let lastActive = -1;
  for (let i = 0; i < orderable.length; i += 1) {
    const s = statusOf.get(orderable[i].id);
    if (s === 'completed' || s === 'in_progress') lastActive = i;
  }
  const leftBehind =
    lastActive > 0
      ? orderable.slice(0, lastActive).filter((p) => statusOf.get(p.id) === 'not_started')
      : [];
  if (leftBehind.length > 0) {
    const reached = orderable[lastActive].code;
    const codes = leftBehind.map((p) => p.code).join(', ');
    findings.push({
      severity: 'warning',
      code: 'phase-order-gap',
      title: { ja: '前段のフェーズが未着手のまま先へ進んでいる', en: 'Later phases advanced while earlier ones are untouched' },
      detail: {
        ja: `${codes} が未着手のまま ${reached} まで進んでいる。意図的に飛ばしたのであれば skipped と記録するべきで、未着手のまま先へ進んでいる状態は前提の欠落を意味する。`,
        en: `Work has reached ${reached} while ${codes} ${isAre(leftBehind.length)} still not started. A deliberate omission should be recorded as skipped — left as not started, it signals a missing premise.`,
      },
      recommendation: {
        ja: '意図的に省いたフェーズは skipped にして理由を note に書く。省いていないなら、その作業がどこで行われたのかを確認する。',
        en: 'Mark deliberately omitted phases as skipped with the reason in the note. Otherwise, find out where that work actually happened.',
      },
    });
  }

  // --- 移行アーキテクチャ / 作業パッケージ ---
  const interimNoDisposal = engagement.transitions.filter(
    (t) => t.interim && t.interim.trim().length > 0 && (!t.disposalPlan || t.disposalPlan.trim().length === 0),
  );
  if (interimNoDisposal.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'interim-without-disposal',
      title: { ja: '暫定の仕組みに廃棄計画が無い', en: 'Interim mechanisms have no disposal plan' },
      detail: {
        ja: `対象: ${joinNames(interimNoDisposal.map((t) => t.name), 3, 'ja')}。二重運用や暫定連携は、廃棄の期限と担当が決まっていないとそのまま恒久化する。`,
        en: `Affected: ${joinNames(interimNoDisposal.map((t) => t.name), 3, 'en')}. Dual running and stop-gap integrations become permanent unless a date and an owner for removing them exist.`,
      },
      recommendation: {
        ja: '各移行状態の disposalPlan に「いつ、誰が、何をもって廃棄するか」を書き、廃棄自体を作業パッケージとして計上する。',
        en: 'Write when, who, and on what trigger each interim mechanism is removed, and budget the removal as its own work package.',
      },
    });
  }
  if (engagement.transitions.length > 0 && !engagement.transitions.some((t) => t.standalone)) {
    findings.push({
      severity: 'info',
      code: 'no-standalone-transition',
      title: { ja: '単独稼働できる移行状態が 1 つも無い', en: 'No transition state can stand on its own' },
      detail: {
        ja: '全ての移行状態が「途中で止められない」設計になっている。予算凍結や優先順位の変更が起きると、投資が丸ごと無駄になる。',
        en: 'Every transition state assumes the programme runs to completion. A budget freeze or a change of priorities would strand the whole investment.',
      },
      recommendation: {
        ja: '少なくとも 1 つは、そこで止めても事業が回る状態を作る。刻み方を見直して standalone を true にできる区切りを探す。',
        en: 'Design at least one state where the business still works if you stop there — re-slice the roadmap until one milestone can be marked standalone.',
      },
    });
  }
  const noBenefitOwner = engagement.workPackages.filter(
    (w) => (w.status === 'in_progress' || w.status === 'delivered') && (!w.benefitOwner || w.benefitOwner.trim().length === 0),
  );
  if (noBenefitOwner.length > 0) {
    findings.push({
      severity: 'info',
      code: 'workpackage-no-benefit-owner',
      title: { ja: '進行中・完了の作業パッケージに便益責任者が無い', en: 'Active work packages have no benefit owner' },
      detail: {
        ja: `対象: ${joinNames(noBenefitOwner.map((w) => w.name), 3, 'ja')}。作ることの責任者はいても、便益を刈り取る責任者がいない。`,
        en: `Affected: ${joinNames(noBenefitOwner.map((w) => w.name), 3, 'en')}. Someone owns building it; nobody owns realizing the benefit.`,
      },
      recommendation: {
        ja: '事業側に便益責任者を置き、測定指標と測定時期を合意する。稼働=完了ではない。',
        en: 'Put a benefit owner on the business side and agree the metric and the measurement date. Go-live is not completion.',
      },
    });
  }

  // --- 成果物の保管先 ---
  const approvedNoLink = engagement.deliverables.filter(
    (d) => APPROVED_STATUSES.has(d.status) && (!d.link || d.link.trim().length === 0),
  );
  if (approvedNoLink.length > 0) {
    findings.push({
      severity: 'info',
      code: 'approved-deliverable-without-link',
      title: { ja: '承認済み成果物に保管先が記録されていない', en: 'Approved deliverables have no recorded location' },
      detail: {
        ja: `対象: ${joinNames(approvedNoLink.map((d) => d.name), 3, 'ja')}。どこにあるか分からない成果物は、参照されないという意味では存在しないのと同じ。`,
        en: `Affected: ${joinNames(approvedNoLink.map((d) => d.name), 3, 'en')}. A document nobody can locate is, in practice, a document that does not exist.`,
      },
      recommendation: {
        ja: '`update_engagement` で link に保管先 URL / パスを記録する。',
        en: 'Record the URL or path in the link field with `update_engagement`.',
      },
    });
  }

  // --- 出典と確度 ---
  // 台帳の中身の良し悪しではなく、「その中身がどこから来たか辿れるか」を見る。
  findings.push(...provenanceFindings(viewProvenance(engagement)));

  // --- 鮮度 ---
  const stale = daysSince(engagement.updatedAt, base);
  if (stale >= 30) {
    findings.push({
      severity: 'warning',
      code: 'engagement-stale',
      title: { ja: '案件の記録が長期間更新されていない', en: 'The engagement record has not been updated in a long time' },
      detail: {
        ja: `最終更新から ${stale} 日。実態が進んでいるなら記録が信頼できず、実態も止まっているなら案件自体が停滞している。`,
        en: `${stale} days since the last update. If the work moved on, the record cannot be trusted; if it did not, the engagement has stalled.`,
      },
      recommendation: {
        ja: 'フェーズ状態・アクション・リスクを一度棚卸しする。停滞しているならスポンサーに継続可否を確認する。',
        en: 'Do one sweep over phase status, actions, and risks. If it really has stalled, ask the sponsor whether to continue.',
      },
    });
  }

  if (engagement.archived) {
    findings.push({
      severity: 'info',
      code: 'archived-engagement',
      title: { ja: 'この案件はアーカイブ済み', en: 'This engagement is archived' },
      detail: {
        ja: 'アーカイブ済みの案件を監査している。現行案件の健全性を見たい場合は対象を切り替える。',
        en: 'You are auditing an archived engagement. Switch the target if you meant to check a live one.',
      },
      recommendation: {
        ja: '現行案件に切り替えるか、参照目的であればそのまま読み進めて良い。',
        en: 'Switch to the current engagement, or carry on if you are reading it for reference.',
      },
    });
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * 横断ビュー用の要約 / A compact health summary for the cross-engagement view.
 *
 * 表示は `check_engagement_health` に任せ、ここでは件数と重大な指摘の見出しだけ返す。
 * `review_all_engagements`(engagements.ts)から呼ばれる。
 */
export interface HealthSummary {
  critical: number;
  warning: number;
  info: number;
  /** 重大な指摘の見出し(重大度順) */
  topCritical: Bilingual[];
}

export function summarizeHealth(engagement: Engagement, today: string, base: Date): HealthSummary {
  const findings = collectFindings(engagement, today, base);
  const critical = findings.filter((f) => f.severity === 'critical');
  return {
    critical: critical.length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
    topCritical: critical.map((f) => f.title),
  };
}

/**
 * 「良好な点」と「まだ判断できないこと」/ What the record proves, and what it cannot.
 *
 * 監査目的の道具なので、**データが無いことを根拠に褒めない**。
 * 観点ごとに、記録に裏付けがあれば褒め、記録が無ければ「判断できない」と明示する。
 * 沈黙させないのは、褒める材料が無いことと問題が無いことを読み手が取り違えるため。
 */
interface GoodPointsResult {
  /**
   * 記録に裏付けのある良好な点。観点ごとに最大 1 件しか積まないので件数で切らない
   * (件数で切ると、正当に得られた「期限が守られている」が押し出されて消える)。
   */
  goods: Bilingual[];
  /**
   * 記録が無いために判断を保留した観点。ここは特に件数で切ってはいけない —
   * 切った件数を「判断を保留したのは N 件」として下流が使うので、
   * 監査対象の見えていない範囲を実際より小さく報告することになる。
   */
  unknowns: Bilingual[];
}

function collectGoodPoints(engagement: Engagement, today: string, base: Date): GoodPointsResult {
  const goods: Bilingual[] = [];
  const unknowns: Bilingual[] = [];

  // --- 変革準備度: 数値が実在する場合だけ評価する ---
  const readiness = latestAssessment(engagement, 'readiness', base);
  if (readiness) {
    if (bandOf('readiness', readiness.achievement) === 'ready') {
      goods.push({
        ja: `変革準備度 ${readiness.achievement}%(平均 ${round1(readiness.avgCurrent)} / ${readiness.scale}、評価日 ${readiness.assessment.assessedAt.slice(0, 10)})。着手できる水準にあり、判断の根拠が数値で残っている。`,
        en: `Readiness is ${readiness.achievement}% (average ${round1(readiness.avgCurrent)} of ${readiness.scale}, assessed ${readiness.assessment.assessedAt.slice(0, 10)}) — at a level where you can start, with the judgement backed by numbers.`,
      });
    }
  } else {
    unknowns.push({
      ja: '着手して大丈夫かは判断できない — 変革準備度の評価記録が 0 件。低い点数が付いているのではなく、点数が存在しない。`assess_readiness` を引数なし(`{}`)で呼ぶと入力例が出る。',
      en: 'Whether it is safe to start cannot be judged: there is no readiness assessment on record — not a low score, no score at all. Call `assess_readiness` with `{}` for a ready-to-fill example.',
    });
  }

  // --- 合意形成: 影響力の高い相手が登録され、その全員に関与方針がある場合だけ ---
  const highInfluence = engagement.stakeholders.filter((s) => s.influence === 'high');
  const highWithApproach = highInfluence.filter((s) => s.approach && s.approach.trim().length > 0);
  if (highInfluence.length > 0 && highWithApproach.length === highInfluence.length) {
    goods.push({
      ja: `影響力の高いステークホルダー ${highInfluence.length} 名全員に関与方針が書かれている(未記入 0 名)。合意形成が設計されている。`,
      en: `All ${countEn(highInfluence.length, 'high-influence stakeholder', 'high-influence stakeholders')} carry a written engagement approach, with none left blank — buy-in is being designed, not hoped for.`,
    });
  } else if (engagement.stakeholders.length === 0) {
    unknowns.push({
      ja: '合意形成が設計されているかは判断できない — ステークホルダーが 1 人も登録されていない。誰が決めるのかが記録に無い状態。',
      en: 'Whether buy-in is being designed cannot be judged: the stakeholder register is empty, so the record does not say who decides anything.',
    });
  } else if (highInfluence.length === 0) {
    unknowns.push({
      ja: `合意形成が設計されているかは判断できない — 登録 ${engagement.stakeholders.length} 名のうち影響力「高」が 0 名。全員が低〜中影響という記録は、影響力の評価がまだ行われていない兆候であることが多い。`,
      en: `Whether buy-in is being designed cannot be judged: none of the ${engagement.stakeholders.length} recorded stakeholders is marked high-influence. A register where nobody has influence usually means influence has not been assessed yet.`,
    });
  }

  const activeHighRisks = engagement.risks.filter(
    (r) => (r.level === 'critical' || r.level === 'high') && (r.status === 'open' || r.status === 'mitigating'),
  );
  if (
    activeHighRisks.length > 0 &&
    activeHighRisks.every((r) => r.owner && r.owner.trim().length > 0 && r.mitigation && r.mitigation.trim().length > 0)
  ) {
    goods.push({
      ja: `対応中の高リスク ${activeHighRisks.length} 件すべてに担当と緩和策が付いている。`,
      en:
        activeHighRisks.length === 1
          ? 'The one live high risk carries both an owner and a mitigation.'
          : `All ${activeHighRisks.length} live high risks carry both an owner and a mitigation.`,
    });
  } else if (engagement.risks.length === 0) {
    unknowns.push({
      ja: 'リスク管理の質は判断できない — リスクが 1 件も登録されていない。リスクの無い案件ではなく、リスクをまだ洗い出していない案件として扱うべき状態。',
      en: 'The quality of risk management cannot be judged: the risk register is empty. Treat that as risks not yet identified, never as an engagement without risk.',
    });
  }

  // --- 期限: 「超過 0 件」は、日付として読める期限が実在するときにしか意味を持たない ---
  const openActions = engagement.actions.filter((a) => a.status !== 'done');
  const doneActions = engagement.actions.filter((a) => a.status === 'done');
  const datedOpen = openActions.filter((a) => isoDue(a.due) !== undefined);
  const overdueOpen = datedOpen.filter((a) => (isoDue(a.due) as string) < today);
  const undatedOpen = openActions.filter((a) => isoDue(a.due) === undefined);
  if (datedOpen.length > 0 && overdueOpen.length === 0 && undatedOpen.length === 0) {
    goods.push({
      ja: `未完了アクション ${openActions.length} 件すべてに日付として読める期限が入っており、基準日 ${today} 時点で超過は 0 件${doneActions.length > 0 ? `(完了済み ${doneActions.length} 件)` : ''}。期限が無いから超過していないのではなく、置いた期限が守られている。`,
      en: `All ${countEn(openActions.length, 'open action', 'open actions')} carry a machine-readable due date and none is past it as of ${today}${doneActions.length > 0 ? ` (${doneActions.length} already closed)` : ''}. Dates are being met, not merely absent.`,
    });
  } else if (datedOpen.length > 0 && overdueOpen.length === 0) {
    goods.push({
      ja: `期限が入っている未完了アクション ${datedOpen.length} 件は、基準日 ${today} 時点で全件が期限内。ただし期限未設定が ${undatedOpen.length} 件あるため、案件全体で期限が守られているとまでは言えない。`,
      en: `The ${datedOpen.length} open actions that do carry a date are all inside it as of ${today}. This does not extend to the engagement as a whole: ${undatedOpen.length} open actions carry no date at all.`,
    });
  } else if (engagement.actions.length === 0) {
    unknowns.push({
      ja: '期限が守られているかは判断できない — アクションが 1 件も登録されていない。期限超過 0 件は実績ではなく、一覧が空であることの表れ。',
      en: 'Whether dates are met cannot be judged: the action register is empty. Zero overdue here is not a track record, it is an empty list.',
    });
  } else if (datedOpen.length === 0) {
    unknowns.push({
      ja: `期限が守られているかは判断できない — 未完了 ${openActions.length} 件のうち、日付として読める期限が付いているものが 0 件。期限が無いアクションは定義上「超過」にならないため、超過 0 件は何の保証にもならない。`,
      en: `Whether dates are met cannot be judged: none of the ${countEn(openActions.length, 'open action', 'open actions')} carries a machine-readable due date. An action with no date can never be overdue, so "zero overdue" guarantees nothing here.`,
    });
  }

  // --- 成果物 ---
  const approved = engagement.deliverables.filter((d) => APPROVED_STATUSES.has(d.status));
  if (approved.length > 0) {
    goods.push({
      ja: `成果物 ${approved.length} 件が承認済み / ベースライン化されている。後戻りの基準点がある。`,
      en: `${countEn(approved.length, 'deliverable', 'deliverables')} ${isAre(approved.length)} approved or baselined, giving you a fixed point to fall back to.`,
    });
  } else if (engagement.deliverables.length === 0) {
    unknowns.push({
      ja: '成果が出ているかは判断できない — 成果物が 1 件も登録されていない。戻れる基準点(ベースライン)がまだ存在しない。',
      en: 'Whether anything has been produced cannot be judged: no deliverables are recorded, so there is no baseline to fall back to.',
    });
  }

  // --- 決定の追跡性 ---
  const accepted = engagement.decisions.filter((d) => d.status === 'accepted');
  if (accepted.length > 0) {
    goods.push({
      ja: `決定事項 ${accepted.length} 件が承認済みとして記録されている。誰が何を決めたかを後から辿れる。`,
      en: `${countEn(accepted.length, 'decision', 'decisions')} ${isAre(accepted.length)} recorded as accepted, so who decided what can be traced later.`,
    });
  } else if (engagement.decisions.length === 0) {
    unknowns.push({
      ja: '決定が辿れるかは判断できない — 決定事項が 1 件も登録されていない。後から「誰がそう決めたのか」を答えられない状態。',
      en: 'Whether decisions can be traced cannot be judged: no decisions are recorded, so "who decided this?" has no answer on file.',
    });
  }

  // --- 移行計画 ---
  if (engagement.transitions.some((t) => t.standalone)) {
    goods.push({
      ja: '途中で止めても事業が回る移行状態が定義されている。計画変更に耐えられる刻み方になっている。',
      en: 'At least one transition state stands on its own, so the plan survives being cut short.',
    });
  }

  // --- 進捗: 完了フェーズが実在し、記録も新しい場合だけ ---
  const progress = summarizeProgress(engagement);
  if (progress.completed > 0 && daysSince(engagement.updatedAt, base) < 14) {
    goods.push({
      ja: `ADM 進捗 ${progress.percent}%(完了 ${progress.completed} / 全 ${progress.total} フェーズ)で、記録も最近更新されている。`,
      en: `ADM progress is ${progress.percent}% (${progress.completed} of ${progress.total} phases complete) and the record is current.`,
    });
  } else if (progress.completed === 0) {
    unknowns.push({
      ja: `進み方の良し悪しは判断できない — 完了したフェーズが 0 / ${progress.total}。実績が 1 件も無いので、速い・遅いを比べる対象が存在しない。`,
      en: `Whether this is progressing well cannot be judged: 0 of ${progress.total} phases are complete, so there is no track record to compare anything against.`,
    });
  }

  // --- 出典: 「出典が 0 件」を静けさと取り違えないこと ---
  // 褒めるのは、出典を持ちうる項目が実在し、その**全件**に出典が付いている場合だけ。
  // 一部だけ付いている状態は指摘側で扱うので、ここでは褒めない。
  const prov = viewProvenance(engagement);
  if (prov.total === 0) {
    unknowns.push({
      ja: `記録が辿れるかは判断できない — 出典を持ちうる項目(リスク・決定事項・アクション・ステークホルダー・成果物・移行状態・作業パッケージ・評価)が 0 件。出典 0 件は出典管理が良いという意味ではなく、台帳が空という意味。`,
      en: 'Whether the record can be traced cannot be judged: there are no entries that could carry a source — no risks, decisions, actions, stakeholders, deliverables, transitions, work packages, or assessments. Zero sources here means an empty ledger, not clean sourcing.',
    });
  } else if (prov.withoutSource === 0) {
    const stated = prov.byConfidence.stated;
    const unset = prov.sourcedWithoutConfidence.length;
    goods.push(
      unset === 0
        ? {
            ja: `台帳の全 ${prov.total} 件に出典が記録され、確度も全件に入っている(${CONFIDENCE_DEFINITIONS.stated.marker} 記載あり ${stated} / ${CONFIDENCE_DEFINITIONS.inferred.marker} 推測 ${prov.byConfidence.inferred} / ${CONFIDENCE_DEFINITIONS.unknown.marker} 出所不明 ${prov.byConfidence.unknown})。どの記述がどこから来たかを 1 件ずつ辿れる。`,
            en: `All ${prov.total} entries carry a source and a confidence (${CONFIDENCE_DEFINITIONS.stated.marker} stated ${stated}, ${CONFIDENCE_DEFINITIONS.inferred.marker} inferred ${prov.byConfidence.inferred}, ${CONFIDENCE_DEFINITIONS.unknown.marker} unknown ${prov.byConfidence.unknown}) — every statement can be traced back one by one.`,
          }
        : {
            ja: `台帳の全 ${prov.total} 件に出典が記録されている(確度未設定が ${unset} 件残るため、「記載あり」と「推測」の区別まではまだ付いていない)。`,
            en: `All ${prov.total} entries carry a source — though ${unset} still leave confidence unset, so stated and inferred are not yet told apart.`,
          },
    );
  }

  // 観点は 9 個しかなく、1 観点 1 行なので全件出しても長くならない。
  // 件数で切ると監査結果が静かに欠落する(良好な点は消え、判断保留は過少報告になる)。
  return { goods, unknowns };
}

/**
 * 評価(準備度・成熟度)の現在地を 1 つの表にする。
 * 指摘とは別に、数値そのものを必ず目に入れるための節。
 */
function renderAssessmentSnapshot(engagement: Engagement, base: Date, lang: Lang): string[] {
  const out: string[] = [];
  const rows: { kind: AssessmentKind; view: AssessmentView }[] = [];
  for (const kind of ['readiness', 'maturity'] as AssessmentKind[]) {
    const view = latestAssessment(engagement, kind, base);
    if (view) rows.push({ kind, view });
  }

  out.push(`## ${text(L.assessments, lang)}`);
  out.push('');
  if (rows.length === 0) {
    out.push(
      msg(
        '変革準備度も成熟度も未評価。着手して大丈夫かを判断する数値がまだ無い。`assess_readiness` を引数なし(`{}`)で呼ぶと、埋めるべき因子とコピペできる入力例が出る。',
        'Neither readiness nor maturity has been assessed, so there is no number behind the go/no-go call. Call `assess_readiness` with no arguments (`{}`) to see the factors to fill in and a ready-to-paste example.',
        lang,
      ),
    );
    out.push('');
    return out;
  }

  out.push(
    `| ${text(HL.kind, lang)} | ${text(L.current, lang)} | ${text(L.target, lang)} | ${text(HL.achievement, lang)} | ${text(HL.verdict, lang)} | ${text(HL.assessedAt, lang)} |`,
  );
  out.push('| --- | --- | --- | ---: | --- | --- |');
  for (const { kind, view } of rows) {
    const kindLabel = text(kind === 'readiness' ? L.readiness : L.maturity, lang);
    const verdict = text(verdictLabel(kind, view.achievement), lang);
    out.push(
      `| ${kindLabel} | \`${bar(view.avgCurrent, view.scale)}\` ${round1(view.avgCurrent)} / ${view.scale} | ${round1(view.avgTarget)} | ${view.achievement}% | ${verdict} | ${cell(view.assessment.assessedAt).slice(0, 10)} |`,
    );
  }
  out.push('');
  for (const { kind, view } of rows) {
    const kindLabel = text(kind === 'readiness' ? L.readiness : L.maturity, lang);
    out.push(
      `- ${kindLabel} — ${msg(
        `最も低い因子: ${cell(view.weakest.name)}(${round1(view.weakest.current)} → ${round1(view.weakest.target)})`,
        `weakest factor: ${cell(view.weakest.name)} (${round1(view.weakest.current)} → ${round1(view.weakest.target)})`,
        lang === 'both' ? 'ja' : lang,
      )}`,
    );
  }
  out.push('');
  return out;
}

/**
 * 出典の付き具合を 1 つの表にする。
 *
 * 指摘とは別に数字そのものを目に入れるための節。
 * 出典を持ちうる項目が 0 件のときは、割合を出さずに「判断できない」と書く
 * (0 / 0 を 100% と読ませないため)。
 */
function renderProvenanceSnapshot(view: ProvenanceView, lang: Lang): string[] {
  const out: string[] = [];
  out.push(`## ${text(HL.provenance, lang)}`);
  out.push('');
  if (view.total === 0) {
    out.push(text(HL.provenanceEmpty, lang === 'both' ? 'ja' : lang));
    if (lang === 'both') {
      out.push('');
      out.push(HL.provenanceEmpty.en);
    }
    out.push('');
    return out;
  }

  const pct = (n: number): string => `${Math.round((n / view.total) * 100)}%`;
  out.push(`| ${text(HL.metric, lang)} | ${text(HL.count, lang)} | ${text(HL.share, lang)} |`);
  out.push('| --- | ---: | ---: |');
  out.push(`| ${text(HL.withSource, lang)} | ${view.withSource} / ${view.total} | ${pct(view.withSource)} |`);
  out.push(`| ${text(HL.withoutSource, lang)} | ${view.withoutSource} / ${view.total} | ${pct(view.withoutSource)} |`);
  for (const level of ['stated', 'inferred', 'unknown'] as ProvenanceConfidence[]) {
    const def = CONFIDENCE_DEFINITIONS[level];
    const n = view.byConfidence[level];
    // ja のときだけ英語の値を添える(en / both のラベルには既に値そのものが入っている)
    const label = `${def.marker} ${text(def.label, lang)}${lang === 'ja' ? ` (${level})` : ''}`;
    out.push(`| ${label} | ${n} | ${pct(n)} |`);
  }
  out.push(`| ${text(HL.confidenceUnset, lang)} | ${view.byConfidence.unset} | ${pct(view.byConfidence.unset)} |`);
  out.push('');
  if (view.withoutSource > 0) {
    // `msg` は both で改行を挟むため、箇条書きが割れないようここでは自前で並べる
    out.push(
      `- **${text(HL.provenanceBreakdown, lang)}**: ${
        lang === 'en' ? describeMissingByKind(view, 'en') : describeMissingByKind(view, 'ja')
      }`,
    );
    if (lang === 'both') out.push(`  - ${describeMissingByKind(view, 'en')}`);
    out.push('');
  }
  return out;
}

/** 健全性チェックの結果を Markdown に整形する */
function renderHealth(
  engagement: Engagement,
  findings: Finding[],
  praise: GoodPointsResult,
  today: string,
  base: Date,
  lang: Lang,
): string {
  const out: string[] = [];
  const phase = findPhase(engagement.currentPhaseId);
  out.push(`# ${text(L.health, lang)} — ${engagement.name}`);
  out.push('');
  const meta: string[] = [];
  if (engagement.client) meta.push(`${text(L.client, lang)}: ${engagement.client}`);
  meta.push(`${text(L.currentPhase, lang)}: ${phase ? `${phase.code}. ${text(phase.name, lang)}` : engagement.currentPhaseId}`);
  meta.push(`${text(L.updatedAt, lang)}: ${engagement.updatedAt.slice(0, 10)}`);
  meta.push(`${text(HL.auditedAt, lang)}: ${today}`);
  out.push(`*${meta.join(' ・ ')}*`);
  out.push('');

  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  out.push(`| ${text(L.severity, lang)} | ${text(HL.count, lang)} |`);
  out.push('| --- | ---: |');
  for (const s of ['critical', 'warning', 'info'] as Severity[]) {
    out.push(`| ${text(SEVERITY_LABEL[s], lang)} | ${counts[s]} |`);
  }
  out.push('');

  out.push(...renderAssessmentSnapshot(engagement, base, lang));
  const prov = viewProvenance(engagement);
  out.push(...renderProvenanceSnapshot(prov, lang));

  if (findings.length === 0) {
    out.push(`## ${text(L.findings, lang)}`);
    out.push('');
    // 「指摘 0 件」が安心材料になるのは、見た結果として問題が無かった場合だけ。
    // 記録が空で見る対象そのものが無かった場合は、そう書く。
    const clear = praise.unknowns.length > 0 ? HL.allClearButBlind : HL.allClear;
    out.push(text(clear, lang === 'both' ? 'ja' : lang));
    if (lang === 'both') {
      out.push('');
      out.push(clear.en);
    }
    out.push('');
  } else {
    out.push(`## ${text(L.findings, lang)}`);
    out.push('');
    findings.forEach((f, i) => {
      out.push(
        `### ${i + 1}. [${f.severity.toUpperCase()}] ${text(f.title, lang)}`,
      );
      out.push('');
      out.push(`- **${text(HL.situation, lang)}**: ${text(f.detail, lang === 'both' ? 'ja' : lang)}`);
      if (lang === 'both') out.push(`  - ${f.detail.en}`);
      out.push(`- **${text(L.recommendation, lang)}**: ${text(f.recommendation, lang === 'both' ? 'ja' : lang)}`);
      if (lang === 'both') out.push(`  - ${f.recommendation.en}`);
      out.push('');
    });
  }

  // 良好な点は「記録に裏付けのあるもの」に限る。
  // 裏付けが無いものは黙って落とさず、次の節で「なぜ判断できないか」を明示する。
  const pushBilingualList = (items: Bilingual[]): void => {
    for (const item of items) {
      if (lang === 'both') {
        out.push(`- ${item.ja}`);
        out.push(`  - ${item.en}`);
      } else {
        out.push(`- ${text(item, lang)}`);
      }
    }
  };

  out.push(`## ${text(HL.goodPoints, lang)}`);
  out.push('');
  if (praise.goods.length === 0) {
    out.push(`- ${text(HL.noGoodPoints, lang === 'both' ? 'ja' : lang)}`);
    if (lang === 'both') out.push(`  - ${HL.noGoodPoints.en}`);
  } else {
    pushBilingualList(praise.goods);
  }
  out.push('');

  out.push(`## ${text(HL.notJudgeable, lang)}`);
  out.push('');
  if (praise.unknowns.length === 0) {
    out.push(`- ${text(HL.allJudgeable, lang === 'both' ? 'ja' : lang)}`);
    if (lang === 'both') out.push(`  - ${HL.allJudgeable.en}`);
  } else {
    pushBilingualList(praise.unknowns);
  }
  out.push('');

  out.push(`## ${text(HL.nextStep, lang)}`);
  out.push('');
  const critical = counts.critical;
  // 着手可否が論点になっているときは、そちらを先に言う
  const readinessBlocker = findings.find(
    (f) => f.code === 'readiness-below-plan' && f.severity === 'critical',
  );
  if (readinessBlocker) {
    out.push(
      msg(
        '論点は個別の指摘ではなく着手可否そのもの。準備度の最低因子への手当てを決め、それが決まるまで新規の作業パッケージを増やさない。決めた内容は決定事項として記録する。',
        'The question here is not any single finding but whether to start at all. Fix the remedy for the weakest readiness factor, add no new work packages until it exists, and record what you decide as a decision.',
        lang,
      ),
    );
    out.push('');
  }
  if (critical > 0) {
    out.push(
      msg(
        `重大な指摘が ${critical} 件ある。上から順に 1 件ずつ、担当と期限を付けて \`update_engagement\` でアクション化する。すべてを同時に直そうとしないこと。`,
        `There ${isAre(critical)} ${countEn(critical, 'critical finding', 'critical findings')}. Take them one at a time from the top, turning each into an owned, dated action with \`update_engagement\`. Do not try to fix them all at once.`,
        lang,
      ),
    );
  } else if (counts.warning > 0) {
    out.push(
      msg(
        '重大な問題は無い。警告は次の定例までに片付ける想定で担当を割り当てる。',
        'Nothing critical. Assign the warnings with the next regular checkpoint as the target.',
        lang,
      ),
    );
  } else if (praise.unknowns.length > 0) {
    // 指摘が 0 件でも、記録が無くて判断を保留した観点が残っているなら「問題なし」とは言わない
    out.push(
      msg(
        `指摘は 0 件だが、記録が無いために判断を保留した観点が ${praise.unknowns.length} 件ある。まずその ${praise.unknowns.length} 件を埋めること — 現時点の「指摘 0 件」は、健全である証拠ではなく、見えていないという意味。`,
        `No findings — but ${praise.unknowns.length} ${praise.unknowns.length === 1 ? 'dimension was' : 'dimensions were'} left unjudged for lack of a record. Fill ${praise.unknowns.length === 1 ? 'that one' : 'those'} in first: right now "zero findings" means nothing was visible, not that nothing is wrong.`,
        lang,
      ),
    );
  } else {
    out.push(
      msg(
        '追跡可能な状態が保たれている。この粒度を維持したまま次のフェーズへ進める。',
        'The engagement is in a trackable state. Keep this level of detail as you move into the next phase.',
        lang,
      ),
    );
  }
  // 出典は「直せ」ではなく「確認せよ」の話なので、次の一手の中で 1 行だけ添える。
  // 0 件の区分は挙げない(「推測 0 件」と書くと、確認すべき対象がぼやける)。
  if (prov.total > 0) {
    const provJa: string[] = [];
    const provEn: string[] = [];
    if (prov.withoutSource > 0) {
      provJa.push(`出典なし ${prov.withoutSource} 件`);
      provEn.push(`${prov.withoutSource} with no source`);
    }
    if (prov.inferred.length > 0) {
      provJa.push(`推測 ${prov.inferred.length} 件`);
      provEn.push(`${prov.inferred.length} marked inferred`);
    }
    if (prov.unknownOrigin.length > 0) {
      provJa.push(`出所不明 ${prov.unknownOrigin.length} 件`);
      provEn.push(`${prov.unknownOrigin.length} untraceable`);
    }
    if (provJa.length > 0) {
      out.push('');
      out.push(
        msg(
          `出典の確認は別枠で 1 回にまとめる。次の打ち合わせで、${provJa.join('・')}のうち、その場で数字や固有名詞を出す予定のものだけを読み上げて確認する(全件を一度に埋めようとしない)。`,
          `Handle the sourcing in one dedicated pass. At the next meeting, out of the ${provEn.join(', ')}, read out and confirm only the entries whose figures or names you actually plan to quote. Do not try to close them all at once.`,
          lang,
        ),
      );
    }
  }
  out.push('');
  out.push(
    msg(
      'レビュー本体を実施する場合は `generate_review_checklist` でチェックリストを出す。',
      'When you run the review itself, produce a checklist with `generate_review_checklist`.',
      lang,
    ),
  );
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

export function registerReviewTools(server: McpServer): void {
  server.registerTool(
    'generate_review_checklist',
    {
      title: 'Generate an architecture compliance review checklist',
      description:
        'アーキテクチャ適合性レビュー用のチェックリストを Markdown のチェックボックス形式で生成する。フェーズ・成果物・実装プロジェクトのいずれかを対象に、知識ベースの記載項目や実務のコツを「これが満たされていなければ差し戻す」観点へ翻訳し、1 ページに収まる分量に絞る。判定は 準拠 / 一部準拠 / 非準拠 / 非適合 の 4 段階。 / Generate a one-page architecture compliance review checklist as Markdown checkboxes for a phase, a deliverable, or an implementation project. Knowledge-base content is translated into "send it back if this is missing" criteria, each rated conformant / partially conformant / non-conformant / irreconcilable.',
      inputSchema: {
        scope: z
          .enum(['phase', 'deliverable', 'implementation'])
          .describe(
            'レビュー対象の種類 / What is being reviewed: an ADM phase, a deliverable, or an implementation project',
          ),
        target: freeTextSchema(
          'フェーズ ID / 成果物 ID(implementation ではプロジェクト名などの自由記述)。省略時は現在のエンゲージメントのフェーズを使う / Phase id or deliverable id; free text for implementation. Defaults to the current engagement phase.',
          IDENTIFIER_LIMIT,
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ scope, target, lang }) => {
      const l = lang as Lang;
      // 上限超過は案内付きで返す(巨大入力そのものはエラー文に載せない)
      const tooLong = checkFreeText(
        [{ field: 'target', value: target, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier }],
        l,
      );
      if (tooLong) return tooLong;

      try {
        const engagement = loadEngagement();

        if (scope === 'phase') {
          const wanted = target ?? engagement?.currentPhaseId;
          const phase = wanted ? findPhase(wanted) : undefined;
          if (!phase) {
            return errorResult(
              msg(
                `フェーズ「${wanted ? capInline(wanted, 60) : '(未指定)'}」が見つかりません。有効な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
                `Phase "${wanted ? capInline(wanted, 60) : '(not given)'}" not found. Valid ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
                l,
              ),
            );
          }
          const sections = capSections(phaseSections(phase), 22);
          const targetLine = `${phase.code}. ${text(phase.name, l)} (\`${phase.id}\`) — ${text(phase.tagline, l)}`;
          const extra: Bilingual[] = [
            {
              ja: `このフェーズの詳細は \`get_adm_phase\` に \`${phase.id}\` を渡すと読める。`,
              en: `Read the full phase entry by passing \`${phase.id}\` to \`get_adm_phase\`.`,
            },
          ];
          return textResult(renderChecklist(targetLine, sections, l, extra));
        }

        if (scope === 'deliverable') {
          if (!target) {
            return errorResult(
              msg(
                '成果物 ID を `target` に指定してください。ID の一覧は `list_deliverables` で確認できます。',
                'Pass a deliverable id in `target`. Use `list_deliverables` to see the available ids.',
                l,
              ),
            );
          }
          const deliverable = findDeliverable(target);
          if (!deliverable) {
            return errorResult(
              msg(
                `成果物「${capInline(target, 60)}」が見つかりません。ID の一覧は \`list_deliverables\` で確認できます。`,
                `Deliverable "${capInline(target, 60)}" not found. Use \`list_deliverables\` to see the available ids.`,
                l,
              ),
            );
          }
          const sections = capSections(deliverableSections(deliverable), 22);
          const targetLine = `${text(deliverable.name, l)} (\`${deliverable.id}\`)`;
          const extra: Bilingual[] = [
            {
              ja: `記載項目の全体像は \`get_deliverable\` に \`${deliverable.id}\` を渡すと読める。`,
              en: `See the full content list by passing \`${deliverable.id}\` to \`get_deliverable\`.`,
            },
          ];
          return textResult(renderChecklist(targetLine, sections, l, extra));
        }

        // scope === 'implementation'
        const sections = capSections(implementationSections(), 22);
        // 見出しに出す名前は 120 文字で切る(切ったことは末尾の … と残り字数で分かる)
        const name = target && target.trim().length > 0 ? capInline(target, 120) : undefined;
        const targetLine = name
          ? msg(`実装プロジェクト「${name}」`, `Implementation project "${name}"`, l)
          : msg('実装プロジェクト(名称未指定)', 'Implementation project (unnamed)', l);
        const extra: Bilingual[] = [
          {
            ja: 'ガバナンスの進め方はフェーズ G を参照する(`get_adm_phase` に `g`)。',
            en: 'For how to run governance, see Phase G — pass `g` to `get_adm_phase`.',
          },
        ];
        return textResult(renderChecklist(targetLine, sections, l, extra));
      } catch (error) {
        // 知識ベース・保存済み JSON のどちらが原因でも、サーバーを落とさずに返す
        return errorResult(
          msg(
            `チェックリストの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}。有効な ID は \`list_adm_phases\` / \`list_deliverables\` で確認できます。`,
            `Failed to build the checklist: ${error instanceof Error ? error.message : String(error)}. Check the valid ids with \`list_adm_phases\` / \`list_deliverables\`.`,
            l,
          ),
        );
      }
    },
  );

  server.registerTool(
    'check_engagement_health',
    {
      title: 'Audit the current engagement for red flags',
      description:
        '現在のエンゲージメントを監査し、実務上の危険信号(スポンサー不在、担当のいない高リスク、期限超過アクション、承認されていない要成果物、記録の欠落など)を重大度付きで指摘する。出典の付き具合(出典なしの件数と内訳、推測・出所不明のまま残っている項目)も数え、確認すべき項目を名指しする。各指摘には具体的な推奨アクションを添え、良好な点も併せて返す。 / Audit the current engagement and report practical red flags — missing sponsor, unowned high risks, overdue actions, unapproved key deliverables, empty registers — with a severity and a concrete recommendation for each. It also counts how much of the ledger can be traced to a source, names the entries left as inferred or untraceable, and reports what is working well.',
      inputSchema: {
        asOf: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('監査の基準日 (YYYY-MM-DD)。省略時は today / Audit date (YYYY-MM-DD); defaults to today'),
        lang: langSchema,
      },
    },
    async ({ asOf, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();
      if (!engagement) {
        return textResult(text(L.noEngagement, l));
      }

      let base = new Date();
      if (asOf) {
        const parsed = new Date(`${asOf}T00:00:00Z`);
        // 正規表現を通っても 2026-13-45 のような存在しない日付があり得る。
        // 基準日と日数計算がずれると全アクションが期限超過に見えるので弾く。
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== asOf) {
          return errorResult(
            msg(
              `\`asOf\` に指定された「${asOf}」は存在しない日付です。YYYY-MM-DD 形式の実在する日付を指定してください。`,
              `\`asOf\` value "${asOf}" is not a real date. Pass an existing date in YYYY-MM-DD form.`,
              l,
            ),
          );
        }
        base = parsed;
      }
      const today = asOf ?? localDateString(base);

      try {
        const findings = collectFindings(engagement, today, base);
        const praise = collectGoodPoints(engagement, today, base);
        return textResult(renderHealth(engagement, findings, praise, today, base, l));
      } catch (error) {
        // 保存済み JSON は列挙値の検証を通っていないため、想定外の値でも落とさない
        return errorResult(
          msg(
            `健全性チェックの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}。\`get_engagement\` に format="json" を渡して保存内容を確認してください。`,
            `Failed to build the health check: ${error instanceof Error ? error.message : String(error)}. Inspect the stored record by passing format="json" to \`get_engagement\`.`,
            l,
          ),
        );
      }
    },
  );
}
