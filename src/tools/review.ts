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
import { summarizeProgress, type DeliverableProgress, type Engagement } from '../engagement/model.js';
import { DELIVERABLE_STATUS_LABEL, L, PHASE_STATUS_LABEL, RISK_LEVEL_LABEL } from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

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
  goodPoints: { ja: '良好な点', en: 'What is working' },
  allClear: {
    ja: '危険信号は検出されませんでした。記録の粒度・鮮度ともに追跡可能な状態です。',
    en: 'No red flags found. The record is detailed and current enough to be trackable.',
  },
  nextStep: { ja: '次の一手', en: 'Next step' },
  auditedAt: { ja: '監査基準日', en: 'Audited as of' },
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

/** エンゲージメントを監査して指摘を集める */
function collectFindings(engagement: Engagement, today: string, base: Date): Finding[] {
  const findings: Finding[] = [];

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
  const malformedDue = openActions.filter((a) => a.due !== undefined && isoDue(a.due) === undefined);
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

/** 良好な点を最大 3 件挙げる */
function collectGoodPoints(engagement: Engagement, today: string, base: Date): Bilingual[] {
  const goods: Bilingual[] = [];
  const highInfluence = engagement.stakeholders.filter((s) => s.influence === 'high');
  const highWithApproach = highInfluence.filter((s) => s.approach && s.approach.trim().length > 0);
  if (highWithApproach.length > 0) {
    goods.push({
      ja: `影響力の高いステークホルダー ${highWithApproach.length} 名について関与方針まで書かれている。合意形成が設計されている。`,
      en: `${countEn(highWithApproach.length, 'high-influence stakeholder', 'high-influence stakeholders')} ${highWithApproach.length === 1 ? 'has' : 'have'} a written engagement approach — buy-in is being designed, not hoped for.`,
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
  }

  const openActions = engagement.actions.filter((a) => a.status !== 'done');
  const anyOverdue = openActions.some((a) => {
    const due = isoDue(a.due);
    return due !== undefined && due < today;
  });
  if (engagement.actions.length > 0 && !anyOverdue) {
    goods.push({
      ja: `期限超過のアクションが 0 件(未完了 ${openActions.length} 件)。期限が守られる文化が保たれている。`,
      en: `No overdue actions (${openActions.length} still open). Dates on this engagement still mean something.`,
    });
  }

  const approved = engagement.deliverables.filter((d) => APPROVED_STATUSES.has(d.status));
  if (approved.length > 0) {
    goods.push({
      ja: `成果物 ${approved.length} 件が承認済み / ベースライン化されている。後戻りの基準点がある。`,
      en: `${countEn(approved.length, 'deliverable', 'deliverables')} ${isAre(approved.length)} approved or baselined, giving you a fixed point to fall back to.`,
    });
  }

  const accepted = engagement.decisions.filter((d) => d.status === 'accepted');
  if (accepted.length > 0) {
    goods.push({
      ja: `決定事項 ${accepted.length} 件が承認済みとして記録されている。誰が何を決めたかを後から辿れる。`,
      en: `${countEn(accepted.length, 'decision', 'decisions')} ${isAre(accepted.length)} recorded as accepted, so who decided what can be traced later.`,
    });
  }

  if (engagement.transitions.some((t) => t.standalone)) {
    goods.push({
      ja: '途中で止めても事業が回る移行状態が定義されている。計画変更に耐えられる刻み方になっている。',
      en: 'At least one transition state stands on its own, so the plan survives being cut short.',
    });
  }

  const progress = summarizeProgress(engagement);
  if (progress.completed > 0 && daysSince(engagement.updatedAt, base) < 14) {
    goods.push({
      ja: `ADM 進捗 ${progress.percent}%(完了 ${progress.completed} / 全 ${progress.total} フェーズ)で、記録も最近更新されている。`,
      en: `ADM progress is ${progress.percent}% (${progress.completed} of ${progress.total} phases complete) and the record is current.`,
    });
  }

  return take(goods, 3);
}

/** 健全性チェックの結果を Markdown に整形する */
function renderHealth(
  engagement: Engagement,
  findings: Finding[],
  goods: Bilingual[],
  today: string,
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

  if (findings.length === 0) {
    out.push(`## ${text(L.findings, lang)}`);
    out.push('');
    out.push(text(HL.allClear, lang === 'both' ? 'ja' : lang));
    if (lang === 'both') {
      out.push('');
      out.push(HL.allClear.en);
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

  out.push(`## ${text(HL.goodPoints, lang)}`);
  out.push('');
  if (goods.length === 0) {
    out.push(`- ${text(L.none, lang)}`);
  } else {
    for (const g of goods) {
      if (lang === 'both') {
        out.push(`- ${g.ja}`);
        out.push(`  - ${g.en}`);
      } else {
        out.push(`- ${text(g, lang)}`);
      }
    }
  }
  out.push('');

  out.push(`## ${text(HL.nextStep, lang)}`);
  out.push('');
  const critical = counts.critical;
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
  } else {
    out.push(
      msg(
        '追跡可能な状態が保たれている。この粒度を維持したまま次のフェーズへ進める。',
        'The engagement is in a trackable state. Keep this level of detail as you move into the next phase.',
        lang,
      ),
    );
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
        target: z
          .string()
          .optional()
          .describe(
            'フェーズ ID / 成果物 ID(implementation ではプロジェクト名などの自由記述)。省略時は現在のエンゲージメントのフェーズを使う / Phase id or deliverable id; free text for implementation. Defaults to the current engagement phase.',
          ),
        lang: langSchema,
      },
    },
    async ({ scope, target, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();

      if (scope === 'phase') {
        const wanted = target ?? engagement?.currentPhaseId;
        const phase = wanted ? findPhase(wanted) : undefined;
        if (!phase) {
          return errorResult(
            msg(
              `フェーズ「${wanted ?? '(未指定)'}」が見つかりません。有効な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              `Phase "${wanted ?? '(not given)'}" not found. Valid ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
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
              `成果物「${target}」が見つかりません。ID の一覧は \`list_deliverables\` で確認できます。`,
              `Deliverable "${target}" not found. Use \`list_deliverables\` to see the available ids.`,
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
      const name = target && target.trim().length > 0 ? target.trim() : undefined;
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
    },
  );

  server.registerTool(
    'check_engagement_health',
    {
      title: 'Audit the current engagement for red flags',
      description:
        '現在のエンゲージメントを監査し、実務上の危険信号(スポンサー不在、担当のいない高リスク、期限超過アクション、承認されていない要成果物、記録の欠落など)を重大度付きで指摘する。各指摘には具体的な推奨アクションを添え、良好な点も併せて返す。 / Audit the current engagement and report practical red flags — missing sponsor, unowned high risks, overdue actions, unapproved key deliverables, empty registers — with a severity, a concrete recommendation for each, and what is working well.',
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

      const findings = collectFindings(engagement, today, base);
      const goods = collectGoodPoints(engagement, today, base);
      return textResult(renderHealth(engagement, findings, goods, today, l));
    },
  );
}
