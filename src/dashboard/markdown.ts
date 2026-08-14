/**
 * Markdown ダッシュボード / Markdown dashboard.
 * 会話内表示・コピペ・印刷向けに整形した Markdown を生成する。
 */

import { ADM_PHASES, findPhase, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  RISK_LEVELS,
  RISK_STATUSES,
  summarizeProgress,
  type Action,
  type Assessment,
  type Engagement,
  type Priority,
  type RiskLevel,
  type RiskStatus,
  type TransitionState,
  type WorkPackage,
} from '../engagement/model.js';
import {
  ACTION_STATUS_LABEL,
  ASSESSMENT_KIND_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  L,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  WORK_PACKAGE_STATUS_LABEL,
  label,
} from './labels.js';

/**
 * この節でだけ使う表示文言 / Strings used only by the Markdown dashboard.
 * 共有ラベル(labels.ts)に無いものはここでローカルに持つ。
 */
const M = {
  unassigned: { ja: '(移行状態 未割当)', en: '(no transition)' },
  total: { ja: '計', en: 'Total' },
  average: { ja: '平均', en: 'Average' },
  overdue: { ja: '期限超過', en: 'overdue' },
  warnings: { ja: '要確認', en: 'Watch-outs' },
  transitionLegend: {
    ja: '太字の行は移行アーキテクチャ。その「状態」欄は進捗ではなく、そこで止めても事業が回るか(単独稼働)を示す。「↳」の行はその状態に属する作業パッケージ。',
    en: 'Bold rows are transition architectures; their Status column shows whether the business can run if work stops there, not progress. Rows marked "↳" are the work packages belonging to that state.',
  },
  scale: { ja: '尺度', en: 'Scale' },
  assessedAt: { ja: '評価日', en: 'Assessed' },
  summary: { ja: '所見', en: 'Summary' },
  standaloneWarning: {
    ja: 'ここで打ち切ると事業が回りません。次の移行状態まで到達する資金と体制を先に確保してください。',
    en: 'Stopping here would leave the business unable to run. Secure the funding and staffing to reach the next transition before you commit.',
  },
  disposalWarning: {
    ja: '暫定の仕組みがあるのに廃棄計画がありません。誰がいつ捨てるかを決めないと、暫定は恒久化します。',
    en: 'An interim mechanism is recorded with no disposal plan. Unless an owner and a date are fixed, the workaround becomes permanent.',
  },
} satisfies Record<string, Bilingual>;

/** Markdown の表セル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * 備考セル内の区切り。`lang: 'both'` ではラベル自体が " / " で日英を繋ぐため、
 * 同じ記号を項目の区切りに使うと境目が読めなくなる。
 */
const SEP = ' • ';

/**
 * JSON 由来の配列を安全に扱う。
 * 永続化された engagement.json は手書き・旧形式のことがあり、
 * `normalizeEngagement` も配列要素の中身までは検証しない。
 * ダッシュボード描画はそれで例外を投げてはならない(MCP ツールが落ちる)。
 */
function list<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** ラベル表を引く。未知のキー(手書き JSON など)はキー名をそのまま表示して落ちない */
function labelOf(map: Record<string, Bilingual>, key: string | undefined, lang: Lang): string {
  if (!key) return '';
  const found: Bilingual | undefined = map[key];
  return found ? label(found, lang) : key;
}

/** 進捗バーを文字で描く */
export function progressBar(percent: number, width = 20): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function formatDate(iso: string): string {
  // ISO 文字列を "YYYY-MM-DD HH:mm" に(タイムゾーンはローカル)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 四半期表記 (YYYY-Qn) の解析結果 */
export interface ParsedQuarter {
  year: number;
  /** 1-4 */
  quarter: number;
}

/** "2027-Q1" 形式を解析する。解釈できなければ null */
export function parseQuarter(value: string | undefined): ParsedQuarter | null {
  if (!value) return null;
  const m = /^(\d{4})[-\s]?Q([1-4])$/i.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), quarter: Number(m[2]) };
}

/** 並べ替え用のキー。不正表記・未記入は末尾に送る */
function quarterKey(value: string | undefined): number {
  const q = parseQuarter(value);
  if (!q) return Number.POSITIVE_INFINITY;
  return q.year * 4 + (q.quarter - 1);
}

/** 四半期文字列を時系列に比較する(未記入・不正表記は末尾) */
export function compareQuarter(a: string | undefined, b: string | undefined): number {
  const ka = quarterKey(a);
  const kb = quarterKey(b);
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

/** 開始〜終了の四半期を 1 セルに収める */
function quarterRange(start: string | undefined, end: string | undefined): string {
  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end ?? '';
}

/** ローカル日付を YYYY-MM-DD で返す(期限判定用) */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 期限を過ぎた未完了アクションか */
function isOverdue(action: Action, reference: string): boolean {
  if (action.status === 'done' || !action.due) return false;
  const due = action.due.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < reference;
}

/** エンゲージメント未作成時のメッセージ */
export function emptyDashboard(lang: Lang): string {
  return `# ${label(L.dashboard, lang)}\n\n${label(L.noEngagement, lang)}\n`;
}

/** 移行状態 1 件の警告文を集める(単独稼働不可・廃棄計画なし) */
function transitionWarnings(t: TransitionState, lang: Lang): string[] {
  const warnings: string[] = [];
  if (!t.standalone) {
    warnings.push(`⚠ **${t.name}** — ${label(M.standaloneWarning, lang)}`);
  }
  if (t.interim && !t.disposalPlan) {
    warnings.push(`⚠ **${t.name}** — ${label(M.disposalWarning, lang)}`);
  }
  return warnings;
}

/** 移行状態の備考セル */
function transitionNote(t: TransitionState, lang: Lang): string {
  const parts: string[] = [];
  const capabilities = list(t.capabilities);
  if (capabilities.length > 0) parts.push(`${label(L.capabilities, lang)}: ${capabilities.join('; ')}`);
  if (t.interim) {
    parts.push(`${label(L.interim, lang)}: ${t.interim}`);
    parts.push(
      t.disposalPlan ? `${label(L.disposalPlan, lang)}: ${t.disposalPlan}` : `⚠ ${label(L.disposalPlan, lang)}: —`,
    );
  }
  if (t.note) parts.push(t.note);
  return cell(parts.join(SEP));
}

/** 作業パッケージの備考セル */
function workPackageNote(w: WorkPackage, lang: Lang, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  const dependsOn = list(w.dependsOn);
  if (dependsOn.length > 0) {
    parts.push(`${label(L.dependsOn, lang)}: ${dependsOn.map(nameOf).join(', ')}`);
  }
  if (w.benefit) {
    const owner = w.benefitOwner ? ` (${label(L.benefitOwner, lang)}: ${w.benefitOwner})` : '';
    parts.push(`${label(L.benefit, lang)}: ${w.benefit}${owner}`);
  }
  if (w.costEstimate) parts.push(`${label(L.cost, lang)}: ${w.costEstimate}`);
  return cell(parts.join(SEP));
}

/**
 * ロードマップ節 / Roadmap section.
 * 移行状態を四半期順に並べ、その下に属する作業パッケージをぶら下げる。
 */
function roadmapSection(e: Engagement, lang: Lang): string[] {
  const allTransitions = list(e.transitions);
  const allWorkPackages = list(e.workPackages);
  if (allTransitions.length === 0 && allWorkPackages.length === 0) return [];

  const nameById = new Map(allWorkPackages.map((w) => [w.id, w.name]));
  const nameOf = (id: string): string => nameById.get(id) ?? id;

  // 移行アーキテクチャの並びは利用者が指定した order が正(HTML ダッシュボードも order 順)。
  // 目標時期は order が同じときの補助キーに留める。
  const transitions = [...allTransitions].sort(
    (a, b) =>
      (a.order || 0) - (b.order || 0) ||
      compareQuarter(a.targetQuarter, b.targetQuarter) ||
      a.name.localeCompare(b.name),
  );
  const known = new Set(allTransitions.map((t) => t.id));
  const grouped = new Map<string, WorkPackage[]>();
  const unassigned: WorkPackage[] = [];
  for (const w of allWorkPackages) {
    if (w.transitionId && known.has(w.transitionId)) {
      const list = grouped.get(w.transitionId);
      if (list) list.push(w);
      else grouped.set(w.transitionId, [w]);
    } else {
      unassigned.push(w);
    }
  }
  const byStart = (a: WorkPackage, b: WorkPackage): number =>
    compareQuarter(a.startQuarter ?? a.endQuarter, b.startQuarter ?? b.endQuarter) || a.name.localeCompare(b.name);

  const out: string[] = [];
  out.push(`## ${label(L.roadmap, lang)}`);
  out.push('');
  out.push(
    `| ${label(L.quarter, lang)} | ${label(L.title, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.businessValue, lang)} | ${label(L.effort, lang)} | ${label(L.note, lang)} |`,
  );
  out.push('| --- | --- | :-: | --- | :-: | :-: | --- |');

  const wpRow = (w: WorkPackage, nested: boolean): string => {
    const cells = [
      cell(quarterRange(w.startQuarter, w.endQuarter)),
      `${nested ? '↳ ' : ''}${cell(w.name)}`,
      labelOf(WORK_PACKAGE_STATUS_LABEL, w.status, lang),
      cell(w.owner),
      labelOf(PRIORITY_LABEL, w.businessValue, lang),
      labelOf(PRIORITY_LABEL, w.effort, lang),
      workPackageNote(w, lang, nameOf),
    ];
    return `| ${cells.join(' | ')} |`;
  };

  const warnings: string[] = [];
  for (const t of transitions) {
    const flagged = !t.standalone || Boolean(t.interim && !t.disposalPlan);
    const standalone = `${t.standalone ? '✔' : '⚠'} ${label(t.standalone ? L.standaloneYes : L.standaloneNo, lang)}`;
    const cells = [
      cell(t.targetQuarter),
      `**${flagged ? '⚠ ' : ''}${cell(t.name)}**`,
      standalone,
      '',
      '',
      '',
      transitionNote(t, lang),
    ];
    out.push(`| ${cells.join(' | ')} |`);
    for (const w of (grouped.get(t.id) ?? []).sort(byStart)) out.push(wpRow(w, true));
    warnings.push(...transitionWarnings(t, lang));
  }

  if (unassigned.length > 0) {
    if (transitions.length > 0) {
      out.push(`|  | **${label(M.unassigned, lang)}** |  |  |  |  |  |`);
    }
    for (const w of [...unassigned].sort(byStart)) out.push(wpRow(w, transitions.length > 0));
  }

  out.push('');
  if (transitions.length > 0) {
    // 表の読み方(移行状態の行の「状態」欄は進捗ではなく単独稼働の可否)を添える
    out.push(`_${label(M.transitionLegend, lang)}_`);
    out.push('');
  }
  if (warnings.length > 0) {
    out.push(`**${label(M.warnings, lang)}**`);
    out.push('');
    for (const w of warnings) out.push(`- ${w}`);
    out.push('');
  }
  return out;
}

/** リスクマトリクス節 / Risk matrix (level x status counts). */
function riskMatrixSection(e: Engagement, lang: Lang): string[] {
  if (e.risks.length === 0) return [];

  const levels: RiskLevel[] = [...RISK_LEVELS].reverse(); // 致命的 → 低
  const statuses: readonly RiskStatus[] = RISK_STATUSES;
  const counts = new Map<string, number>();
  for (const r of e.risks) {
    const key = `${r.level}/${r.status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const at = (level: RiskLevel, status: RiskStatus): number => counts.get(`${level}/${status}`) ?? 0;
  const show = (n: number): string => (n === 0 ? '·' : String(n));

  const out: string[] = [];
  out.push(`## ${label(L.riskMatrix, lang)}`);
  out.push('');
  out.push(
    `| ${label(L.level, lang)} | ${statuses.map((s) => label(RISK_STATUS_LABEL[s], lang)).join(' | ')} | ${label(M.total, lang)} |`,
  );
  out.push(`| --- |${statuses.map(() => ' :-: |').join('')} :-: |`);
  for (const level of levels) {
    const row = statuses.map((s) => at(level, s));
    const sum = row.reduce((a, b) => a + b, 0);
    out.push(
      `| ${label(RISK_LEVEL_LABEL[level], lang)} | ${row.map(show).join(' | ')} | ${sum === 0 ? '·' : `**${sum}**`} |`,
    );
  }
  const totals = statuses.map((s) => levels.reduce((sum, level) => sum + at(level, s), 0));
  out.push(
    `| **${label(M.total, lang)}** | ${totals.map((n) => (n === 0 ? '·' : `**${n}**`)).join(' | ')} | **${e.risks.length}** |`,
  );
  out.push('');
  return out;
}

/** 評価 1 件を表に描く */
function assessmentBlock(a: Assessment, lang: Lang): string[] {
  const out: string[] = [];
  const factors = list(a.factors);
  const scale = Number.isFinite(a.scale) && a.scale > 0 ? a.scale : 5;
  const heading = `${labelOf(ASSESSMENT_KIND_LABEL, a.kind, lang)}: ${a.title}`;
  out.push(`### ${heading}`);
  out.push('');
  const meta = [`${label(M.scale, lang)}: 1–${scale}`];
  if (a.assessedAt) meta.push(`${label(M.assessedAt, lang)}: ${a.assessedAt.slice(0, 10)}`);
  out.push(`_${meta.join(' | ')}_`);
  out.push('');

  if (factors.length > 0) {
    const withNote = factors.some((f) => Boolean(f.note));
    const noteHead = withNote ? ` ${label(L.note, lang)} |` : '';
    const noteAlign = withNote ? ' --- |' : '';
    out.push(
      `| ${label(L.factor, lang)} | ${label(L.current, lang)} | ${label(L.target, lang)} | ${label(L.gap, lang)} |${noteHead}`,
    );
    out.push(`| --- | --- | --- | :-: |${noteAlign}`);
    const bar = (value: number): string => {
      const clamped = Math.max(0, Math.min(scale, value));
      return `\`${progressBar((clamped / scale) * 100, 10)}\` ${value}`;
    };
    for (const f of factors) {
      const gap = f.target - f.current;
      const gapCell = gap > 0 ? `+${gap}` : String(gap);
      const note = withNote ? ` ${cell(f.note)} |` : '';
      out.push(`| ${cell(f.name)} | ${bar(f.current)} | ${bar(f.target)} | ${gapCell} |${note}`);
    }
    if (factors.length > 1) {
      const avg = (pick: (n: { current: number; target: number }) => number): number =>
        Math.round((factors.reduce((sum, f) => sum + pick(f), 0) / factors.length) * 10) / 10;
      const current = avg((f) => f.current);
      const target = avg((f) => f.target);
      const gap = Math.round((target - current) * 10) / 10;
      const note = withNote ? ' |' : '';
      out.push(
        `| **${label(M.average, lang)}** | ${bar(current)} | ${bar(target)} | ${gap > 0 ? `+${gap}` : gap} |${note}`,
      );
    }
    out.push('');
  }
  if (a.summary) {
    out.push(`**${label(M.summary, lang)}**: ${a.summary}`);
    out.push('');
  }
  return out;
}

/** 評価節 / Assessments section. */
function assessmentsSection(e: Engagement, lang: Lang): string[] {
  const assessments = list(e.assessments);
  if (assessments.length === 0) return [];
  const out: string[] = [];
  out.push(`## ${label(L.assessments, lang)}`);
  out.push('');
  // 新しい評価から順に(評価日が無いものは末尾)
  const at = (a: Assessment): string => a.assessedAt ?? '';
  const sorted = [...assessments].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
  for (const a of sorted) out.push(...assessmentBlock(a, lang));
  return out;
}

/** ダッシュボードの Markdown を生成する */
export function renderDashboardMarkdown(engagement: Engagement | null, lang: Lang = 'both'): string {
  if (!engagement) return emptyDashboard(lang);

  const e = engagement;
  const progress = summarizeProgress(e);
  const currentPhase = findPhase(e.currentPhaseId);
  const out: string[] = [];

  out.push(`# ${label(L.dashboard, lang)}: ${e.name}`);
  out.push('');

  const meta: string[] = [];
  if (e.client) meta.push(`**${label(L.client, lang)}**: ${e.client}`);
  if (e.industry) meta.push(`**${label(L.industry, lang)}**: ${e.industry}`);
  meta.push(
    `**${label(L.currentPhase, lang)}**: ${currentPhase ? `${currentPhase.code} — ${label(currentPhase.name, lang)}` : e.currentPhaseId}`,
  );
  meta.push(`**${label(L.updatedAt, lang)}**: ${formatDate(e.updatedAt)}`);
  out.push(meta.join('  \n'));
  out.push('');

  if (e.description) {
    out.push(`**${label(L.description, lang)}**: ${e.description}`);
    out.push('');
  }
  if (e.scope) {
    out.push(`**${label(L.scope, lang)}**: ${e.scope}`);
    out.push('');
  }

  // --- 進捗サマリ ---
  const openRisks = e.risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length;
  const openActions = e.actions.filter((a) => a.status !== 'done').length;
  const reference = today();
  const overdueActions = e.actions.filter((a) => isOverdue(a, reference)).length;
  const overdueSuffix = overdueActions > 0 ? ` (⚠ ${overdueActions} ${label(M.overdue, lang)})` : '';
  out.push(`\`${progressBar(progress.percent)}\` **${progress.percent}%**`);
  out.push('');
  out.push(
    [
      `${label(L.progress, lang)}: ${progress.completed}/${progress.total - progress.skipped}`,
      `${label(L.risks, lang)}: ${openRisks} ${label(L.openItems, lang)}`,
      `${label(L.actions, lang)}: ${openActions} ${label(L.openItems, lang)}${overdueSuffix}`,
      `${label(L.decisions, lang)}: ${e.decisions.length}`,
      `${label(L.deliverables, lang)}: ${e.deliverables.length}`,
      `${label(L.workPackages, lang)}: ${e.workPackages.length}`,
    ].join(' | '),
  );
  out.push('');

  // --- ADM フェーズ進捗 ---
  out.push(`## ${label(L.admProgress, lang)}`);
  out.push('');
  out.push(`| | ${label(L.phase, lang)} | ${label(L.status, lang)} | ${label(L.note, lang)} |`);
  out.push('| :-: | --- | --- | --- |');
  for (const phase of ADM_PHASES) {
    const p = e.phases.find((x) => x.phaseId === phase.id);
    const status = p?.status ?? 'not_started';
    const icon = PHASE_STATUS_ICON[status] ?? '?';
    const marker = phase.id === e.currentPhaseId ? '**→**' : icon;
    out.push(
      `| ${marker} | ${phase.code}. ${cell(label(phase.name, lang))} | ${icon} ${labelOf(PHASE_STATUS_LABEL, status, lang)} | ${cell(p?.note)} |`,
    );
  }
  out.push('');

  // --- ロードマップ(移行アーキテクチャ + 作業パッケージ) ---
  out.push(...roadmapSection(e, lang));

  // --- ステークホルダー ---
  out.push(`## ${label(L.stakeholders, lang)}`);
  out.push('');
  if (e.stakeholders.length === 0) {
    out.push(label(L.none, lang));
  } else {
    out.push(
      `| ${label(L.name, lang)} | ${label(L.role, lang)} | ${label(L.influence, lang)} | ${label(L.interest, lang)} | ${label(L.concerns, lang)} | ${label(L.approach, lang)} |`,
    );
    out.push('| --- | --- | :-: | :-: | --- | --- |');
    for (const s of e.stakeholders) {
      out.push(
        `| ${cell(s.name)} | ${cell([s.role, s.organization].filter(Boolean).join(' / '))} | ${labelOf(INFLUENCE_LABEL, s.influence, lang)} | ${labelOf(INFLUENCE_LABEL, s.interest, lang)} | ${cell(list(s.concerns).join('; '))} | ${cell(s.approach)} |`,
      );
    }
  }
  out.push('');

  // --- リスク ---
  out.push(`## ${label(L.risks, lang)}`);
  out.push('');
  if (e.risks.length === 0) {
    out.push(label(L.none, lang));
  } else {
    out.push(
      `| ${label(L.title, lang)} | ${label(L.level, lang)} | ${label(L.residual, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.mitigation, lang)} |`,
    );
    out.push('| --- | :-: | :-: | :-: | --- | --- |');
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const rank = (level: RiskLevel): number => order[level] ?? 9;
    for (const r of [...e.risks].sort((a, b) => rank(a.level) - rank(b.level))) {
      out.push(
        `| ${cell(r.title)} | ${labelOf(RISK_LEVEL_LABEL, r.level, lang)} | ${labelOf(RISK_LEVEL_LABEL, r.residualLevel, lang)} | ${labelOf(RISK_STATUS_LABEL, r.status, lang)} | ${cell(r.owner)} | ${cell(r.mitigation)} |`,
      );
    }
  }
  out.push('');

  // --- リスクマトリクス ---
  out.push(...riskMatrixSection(e, lang));

  // --- 決定事項 ---
  out.push(`## ${label(L.decisions, lang)}`);
  out.push('');
  if (e.decisions.length === 0) {
    out.push(label(L.none, lang));
  } else {
    for (const d of e.decisions) {
      out.push(`### ${d.title} — ${labelOf(DECISION_STATUS_LABEL, d.status, lang)}`);
      out.push('');
      if (d.context) out.push(`- ${d.context}`);
      out.push(`- **${label(L.decision, lang)}**: ${d.decision}`);
      if (d.rationale) out.push(`- **${label(L.rationale, lang)}**: ${d.rationale}`);
      if (d.decidedBy) out.push(`- **${label(L.decidedBy, lang)}**: ${d.decidedBy}`);
      out.push('');
    }
  }
  out.push('');

  // --- アクション ---
  out.push(`## ${label(L.actions, lang)}`);
  out.push('');
  if (e.actions.length === 0) {
    out.push(label(L.none, lang));
  } else {
    out.push(
      `| ${label(L.title, lang)} | ${label(L.owner, lang)} | ${label(L.due, lang)} | ${label(L.priority, lang)} | ${label(L.status, lang)} |`,
    );
    out.push('| --- | --- | --- | :-: | :-: |');
    const prio: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const rank = (p: Priority): number => prio[p] ?? 9;
    const sorted = [...e.actions].sort(
      (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || rank(a.priority) - rank(b.priority),
    );
    for (const a of sorted) {
      // 期限を過ぎた未完了アクションは期限欄に印を付ける
      const due = isOverdue(a, reference) ? `⚠ ${cell(a.due)}` : cell(a.due);
      out.push(
        `| ${cell(a.title)} | ${cell(a.owner)} | ${due} | ${labelOf(PRIORITY_LABEL, a.priority, lang)} | ${labelOf(ACTION_STATUS_LABEL, a.status, lang)} |`,
      );
    }
  }
  out.push('');

  // --- 成果物 ---
  out.push(`## ${label(L.deliverables, lang)}`);
  out.push('');
  if (e.deliverables.length === 0) {
    out.push(label(L.none, lang));
  } else {
    out.push(
      `| ${label(L.title, lang)} | ${label(L.phase, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.link, lang)} |`,
    );
    out.push('| --- | :-: | :-: | --- | --- |');
    for (const d of e.deliverables) {
      const ph = d.phaseId ? findPhase(d.phaseId) : undefined;
      out.push(
        `| ${cell(d.name)} | ${ph ? ph.code : ''} | ${labelOf(DELIVERABLE_STATUS_LABEL, d.status, lang)} | ${cell(d.owner)} | ${cell(d.link)} |`,
      );
    }
  }
  out.push('');

  // --- 評価(成熟度 / 変革準備度) ---
  out.push(...assessmentsSection(e, lang));

  // --- メモ ---
  if (e.notes.length > 0) {
    out.push(`## ${label(L.notes, lang)}`);
    out.push('');
    for (const n of e.notes) out.push(`- ${n}`);
    out.push('');
  }

  out.push('---');
  out.push(`_${label(L.generated, lang)}: ${formatDate(new Date().toISOString())} — TOGAF 10 EAP MCP_`);
  out.push('');

  return out.join('\n');
}
