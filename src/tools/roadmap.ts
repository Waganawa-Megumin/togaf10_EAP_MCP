/**
 * ロードマップ・作業パッケージ管理ツール / Roadmap and work package tools.
 *
 * 移行アーキテクチャ(中間状態)と作業パッケージを登録し、
 * 四半期を横軸にしたテキストのタイムラインと、価値 × 規模の優先順位付けを返す。
 *
 * ここでの一貫した立場:
 * - 中間状態は「そこで止めても事業が回る」ことが確認できて初めて中間状態と呼べる。
 * - 便益に責任者がいない作業パッケージは、完了後に誰も効果を測らない。
 * - 時期の書けない作業は、まだ計画ではなく願望である。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findPhase, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  OUTPUT_LIMITS,
  PRIORITIES,
  WORK_PACKAGE_STATUSES,
  capCell,
  makeId,
  now,
  type Engagement,
  type Priority,
  type TransitionState,
  type WorkPackage,
} from '../engagement/model.js';
import { loadEngagement, saveEngagement } from '../engagement/store.js';
// 入力長の検査は engagement.ts に集約している(common.ts は他作業と衝突するため触らない)
import {
  ID_HINT,
  PHASE_HINT,
  QUARTER_HINT,
  checkText,
  checkTextList,
  limitErrorResult,
  runChecks,
  unexpectedErrorResult,
} from './engagement.js';
import { L, PRIORITY_LABEL, WORK_PACKAGE_STATUS_LABEL, label } from '../dashboard/labels.js';
// コストの解析・集計はダッシュボードと同じ実装を使う(数字が 2 か所で食い違わないように)
import {
  formatAmountRange,
  parseCostEstimate,
  renderCostSection,
  summarizeCosts,
} from '../dashboard/markdown.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

// --- このファイル内だけで使うラベル(labels.ts は編集しないためローカルに置く) ---

const R = {
  itemName: { ja: '名称', en: 'Name' },
  workPackage: { ja: '作業パッケージ', en: 'Work package' },
  timeline: { ja: 'タイムライン', en: 'Timeline' },
  legend: { ja: '凡例', en: 'Legend' },
  warnings: { ja: '警告', en: 'Warnings' },
  dependencies: { ja: '依存関係', en: 'Dependencies' },
  benefits: { ja: '各段階で実現する便益', en: 'Benefits realized at each step' },
  unassigned: { ja: '移行状態に未割当', en: 'Not assigned to a transition' },
  noTiming: { ja: '時期未設定', en: 'no timing' },
  criteria: { ja: '判定基準', en: 'Criteria' },
  blockedBy: { ja: '先行待ち', en: 'Blocked by' },
  blocks: { ja: '後続あり', en: 'Blocks' },
  ready: { ja: '着手可能', en: 'Ready to start' },
  // 判定は「事業価値が低ではない」×「規模が高ではない」で行うため、
  // ラベルも “高/低” と断定せずに実際の境界どおりに書く(表の値と矛盾させない)。
  quickWin: { ja: 'まず着手すべき(価値あり × 規模は大きくない)', en: 'Start here (value present, effort not large)' },
  strategic: { ja: '計画的に(価値あり × 大規模)', en: 'Plan properly (value present, large effort)' },
  fillIn: { ja: '余力があれば(価値は低い × 規模は大きくない)', en: 'If capacity allows (low value, effort not large)' },
  drop: { ja: '見送り検討(価値は低い × 大規模)', en: 'Consider dropping (low value, large effort)' },
  added: { ja: '追加しました', en: 'Added' },
  updated: { ja: '更新しました', en: 'Updated' },
  removed: { ja: '削除しました', en: 'Removed' },
} satisfies Record<string, Bilingual>;

/** 作業パッケージの状態アイコン */
const WP_ICON: Record<WorkPackage['status'], string> = {
  proposed: '○',
  planned: '◇',
  in_progress: '◐',
  delivered: '●',
  cancelled: '×',
};

/**
 * 行の途中に埋め込む日英併記。
 * `msg` は改行で連結するため、見出し・強調・括弧の内側に入れると
 * lang="both"(既定)のときに Markdown が壊れる。そこは必ずこちらを使う。
 */
function inline(ja: string, en: string, lang: Lang): string {
  return label({ ja, en }, lang);
}

// --- 保存済み JSON が手で編集されていても表示が壊れないようにする ---

/** 依存 ID の配列を安全に取り出す(欠損・非配列は空扱い) */
function depsOf(w: WorkPackage): string[] {
  return Array.isArray(w.dependsOn) ? w.dependsOn : [];
}

function statusIcon(status: WorkPackage['status']): string {
  return WP_ICON[status] ?? '?';
}

function statusLabel(status: WorkPackage['status'], lang: Lang): string {
  const found = WORK_PACKAGE_STATUS_LABEL[status];
  return found ? label(found, lang) : String(status);
}

function priorityLabel(value: Priority, lang: Lang): string {
  const found = PRIORITY_LABEL[value];
  return found ? label(found, lang) : String(value);
}

/** 警告に並べる名前の一覧(多すぎるときは打ち切る) */
function nameList(names: string[], limit = 8): Bilingual {
  const head = names.slice(0, limit).join('、');
  if (names.length <= limit) {
    return { ja: head, en: names.slice(0, limit).join(', ') };
  }
  const rest = names.length - limit;
  return {
    ja: `${head} ほか ${rest} 件`,
    en: `${names.slice(0, limit).join(', ')} and ${rest} more`,
  };
}

// --- 四半期の解析と整形 ---

/** `2027-Q1` / `2027Q1` / `2027 q1` を受け付ける */
const QUARTER_RE = /^(\d{4})[-_ ]?[Qq]([1-4])$/;

/**
 * 四半期文字列を並べ替え可能な整数に変換する。
 * 解釈できない表記は null(呼び出し側で末尾に寄せる)。
 */
export function parseQuarter(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = QUARTER_RE.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 4 + (Number(m[2]) - 1);
}

/** 整数表現を `YYYY-Qn` に戻す */
export function formatQuarterIndex(index: number): string {
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

/** 保存前の正規化。解釈できるものは `YYYY-Qn` に揃え、できないものは入力のまま残す。 */
function normalizeQuarter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const index = parseQuarter(trimmed);
  return index === null ? trimmed : formatQuarterIndex(index);
}

/** 並べ替えキー。不正・未設定は末尾に寄せる。 */
function quarterSortKey(value: string | undefined): number {
  const index = parseQuarter(value);
  return index === null ? Number.MAX_SAFE_INTEGER : index;
}

// --- 等幅表示のための幅計算 ---

/** 東アジアの全角文字を 2 幅として数える */
function charWidth(codePoint: number): number {
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) width += charWidth(ch.codePointAt(0) ?? 0);
  return width;
}

/** 表示幅で切り詰めて右側を空白で埋める */
function padTo(value: string, width: number): string {
  let out = '';
  let used = 0;
  for (const ch of value) {
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (used + w > width - 1 && displayWidth(value) > width) {
      out += '…';
      used += 1;
      break;
    }
    out += ch;
    used += w;
  }
  return out + ' '.repeat(Math.max(0, width - used));
}

// --- Markdown 表のセル ---

function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// --- 共通の下ごしらえ ---

/** フェーズ参照を正規化する。未知の値は undefined。 */
function resolvePhaseId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return findPhase(value)?.id;
}

function noEngagement(l: Lang): string {
  return msg(
    'エンゲージメントが未作成です。先に `start_engagement` を実行してください。',
    'No engagement yet. Run `start_engagement` first.',
    l,
  );
}

/** order 昇順、同順は名前順で移行状態を並べる */
function sortedTransitions(e: Engagement): TransitionState[] {
  return [...e.transitions].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** 開始四半期→終了四半期→名前の順で作業パッケージを並べる */
function sortedWorkPackages(list: WorkPackage[]): WorkPackage[] {
  return [...list].sort(
    (a, b) =>
      quarterSortKey(a.startQuarter) - quarterSortKey(b.startQuarter) ||
      quarterSortKey(a.endQuarter) - quarterSortKey(b.endQuarter) ||
      a.name.localeCompare(b.name),
  );
}

/** 依存関係の循環を 1 つ見つける(見つからなければ null) */
function findDependencyCycle(packages: WorkPackage[]): string[] | null {
  const byId = new Map(packages.map((w) => [w.id, w] as const));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const current = state.get(id);
    if (current === 'visiting') {
      const at = stack.indexOf(id);
      return [...stack.slice(at), id];
    }
    if (current === 'done') return null;
    state.set(id, 'visiting');
    stack.push(id);
    const node = byId.get(id);
    for (const dep of node ? depsOf(node) : []) {
      if (!byId.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const w of packages) {
    const found = visit(w.id);
    if (found) return found;
  }
  return null;
}

/** ID を人間が読める名前に(見つからなければ ID そのまま) */
function nameOf(e: Engagement, id: string): string {
  return e.workPackages.find((w) => w.id === id)?.name ?? e.transitions.find((t) => t.id === id)?.name ?? id;
}

// --- タイムライン描画 ---

const CELL_WIDTH = 3;
const NAME_WIDTH = 26;
const MAX_COLUMNS = 24;
const EMPTY_CELL = '·'.repeat(CELL_WIDTH);

interface TimelineRow {
  label: string;
  /** 塗る区間(整数表現の四半期)。null なら区間なし */
  from: number | null;
  to: number | null;
  /** 到達点(移行状態の目標時期)。区間より優先して描く */
  milestone?: number | null;
  /** 区間の塗り文字 */
  glyph: string;
}

/** 四半期を横軸にしたテキストのタイムラインを描く */
function renderTimeline(rows: TimelineRow[], quarters: number[], lang: Lang): string[] {
  const out: string[] = [];
  if (quarters.length === 0 || rows.length === 0) return out;

  const gutter = ' '.repeat(NAME_WIDTH + 1);
  // 年の行(1 列 = 4 文字ちょうどなので連結するだけで桁が揃う)
  const yearRow = quarters
    .map((q, i) => (i === 0 || q % 4 === 0 ? String(Math.floor(q / 4)).padEnd(CELL_WIDTH + 1) : ' '.repeat(CELL_WIDTH + 1)))
    .join('');
  const quarterRow = quarters.map((q) => padTo(`Q${(q % 4) + 1}`, CELL_WIDTH)).join(' ');

  out.push('```text');
  out.push(gutter + yearRow.trimEnd());
  out.push(padTo('', NAME_WIDTH) + ' ' + quarterRow);
  out.push(padTo('', NAME_WIDTH) + ' ' + quarters.map(() => '-'.repeat(CELL_WIDTH)).join(' '));
  for (const row of rows) {
    const cells = quarters.map((q) => {
      if (row.milestone !== undefined && row.milestone !== null && q === row.milestone) {
        return '█'.repeat(CELL_WIDTH);
      }
      if (row.from === null && row.to === null) return EMPTY_CELL;
      const start = row.from ?? (row.to as number);
      const end = row.to ?? (row.from as number);
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      return q >= lo && q <= hi ? row.glyph.repeat(CELL_WIDTH) : EMPTY_CELL;
    });
    out.push(padTo(row.label, NAME_WIDTH) + ' ' + cells.join(' '));
  }
  out.push('```');
  out.push('');
  out.push(
    msg(
      '凡例: `███` 到達点 / `░░░` 移行状態に至る期間 / `▓▓▓` 作業パッケージの期間 / `···` 該当なし',
      'Legend: `███` target state reached, `░░░` run-up to a transition, `▓▓▓` work package span, `···` nothing scheduled',
      lang,
    ),
  );
  return out;
}

/** タイムラインに載せる四半期の並びを決める(最小〜最大を隙間なく埋める) */
function buildAxis(indices: number[]): { quarters: number[]; truncated: boolean } {
  const valid = indices.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return { quarters: [], truncated: false };
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min + 1;
  const limit = Math.min(span, MAX_COLUMNS);
  const quarters: number[] = [];
  for (let i = 0; i < limit; i += 1) quarters.push(min + i);
  return { quarters, truncated: span > MAX_COLUMNS };
}

// --- ロードマップ全体の健全性チェック ---

/** 保存済みデータから、ロードマップとして見たときの問題点を集める */
function collectRoadmapWarnings(e: Engagement, lang: Lang): string[] {
  const warnings: string[] = [];
  const ordered = sortedTransitions(e);

  for (const t of ordered) {
    if (!t.standalone) {
      warnings.push(
        msg(
          `移行状態「${t.name}」は単独稼働が「不可」。ここで止めても事業が回らない中間状態は、予算が切れた時点で負債になる。`,
          `Transition "${t.name}" cannot stand on its own. An intermediate state the business cannot run on becomes debt the moment funding stops.`,
          lang,
        ),
      );
    }
    if (t.interim && !t.disposalPlan) {
      warnings.push(
        msg(
          `移行状態「${t.name}」に暫定の仕組みがあるが廃棄計画がない。暫定が恒久化する典型。廃棄の期限と責任者を決めること。`,
          `Transition "${t.name}" has an interim mechanism but no disposal plan. This is how "temporary" becomes permanent. Name a date and an owner for removing it.`,
          lang,
        ),
      );
    }
    if (t.capabilities.length === 0) {
      warnings.push(
        msg(
          `移行状態「${t.name}」に実現する能力が書かれていない。何ができるようになるかを言えない状態は、状態ではなく日付にすぎない。`,
          `Transition "${t.name}" lists no capabilities. A state you cannot describe in terms of new capability is just a date.`,
          lang,
        ),
      );
    }
    if (t.targetQuarter && parseQuarter(t.targetQuarter) === null) {
      warnings.push(
        msg(
          `移行状態「${t.name}」の時期「${t.targetQuarter}」は四半期表記(YYYY-Qn)として解釈できない。タイムライン上では末尾に寄せる。`,
          `Transition "${t.name}" has timing "${t.targetQuarter}" which is not a quarter (YYYY-Qn). It is pushed to the end of the timeline.`,
          lang,
        ),
      );
    }
  }

  // 並び順と目標時期の矛盾
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = parseQuarter(ordered[i - 1].targetQuarter);
    const cur = parseQuarter(ordered[i].targetQuarter);
    if (prev !== null && cur !== null && cur < prev) {
      warnings.push(
        msg(
          `移行状態の順序と時期が矛盾している:「${ordered[i - 1].name}」(${ordered[i - 1].targetQuarter})の後の「${ordered[i].name}」(${ordered[i].targetQuarter})の方が早い。`,
          `Transition order contradicts timing: "${ordered[i].name}" (${ordered[i].targetQuarter}) comes after "${ordered[i - 1].name}" (${ordered[i - 1].targetQuarter}) but is scheduled earlier.`,
          lang,
        ),
      );
    }
  }

  const orders = new Map<number, string[]>();
  for (const t of e.transitions) {
    orders.set(t.order, [...(orders.get(t.order) ?? []), t.name]);
  }
  for (const [order, names] of orders) {
    if (names.length > 1) {
      warnings.push(
        msg(
          `並び順 ${order} が重複している(${names.join(', ')})。順番が決まっていない移行計画は、実行時に交渉で決まる。`,
          `Order ${order} is used more than once (${names.join(', ')}). A sequence that is not fixed here gets decided by whoever argues loudest during delivery.`,
          lang,
        ),
      );
    }
  }

  // 作業パッケージの指摘は同じ形のものが件数分だけ並びやすい。
  // 1 件ずつ並べると本当に効く指摘(循環・単独稼働不可)が埋もれるので、種類ごとにまとめる。
  const noBenefit: string[] = [];
  const noBenefitOwner: string[] = [];
  const noTransition: string[] = [];
  const noTiming: string[] = [];
  const badQuarter: string[] = [];

  for (const w of e.workPackages) {
    if (w.status === 'cancelled') continue;
    if (w.benefit && !w.benefitOwner) noBenefitOwner.push(w.name);
    if (!w.benefit) noBenefit.push(w.name);
    if (!w.transitionId) noTransition.push(w.name);
    if (!w.startQuarter && !w.endQuarter) noTiming.push(w.name);

    for (const value of [w.startQuarter, w.endQuarter]) {
      if (value && parseQuarter(value) === null) badQuarter.push(`${w.name}(${value})`);
    }

    const start = parseQuarter(w.startQuarter);
    const end = parseQuarter(w.endQuarter);
    if (start !== null && end !== null && end < start) {
      warnings.push(
        msg(
          `作業パッケージ「${w.name}」の終了(${w.endQuarter})が開始(${w.startQuarter})より前になっている。`,
          `Work package "${w.name}" ends (${w.endQuarter}) before it starts (${w.startQuarter}).`,
          lang,
        ),
      );
    }
    const missing = depsOf(w).filter((id) => !e.workPackages.some((x) => x.id === id));
    if (missing.length > 0) {
      warnings.push(
        msg(
          `作業パッケージ「${w.name}」が存在しない ID に依存している: ${missing.join(', ')}`,
          `Work package "${w.name}" depends on unknown ids: ${missing.join(', ')}`,
          lang,
        ),
      );
    }
  }

  if (noBenefit.length > 0) {
    const n = nameList(noBenefit);
    warnings.push(
      msg(
        `便益が書かれていない作業パッケージが ${noBenefit.length} 件(${n.ja})。便益のない作業は、予算表の上ではコスト行にしか見えない。`,
        `${noBenefit.length} work package(s) state no benefit (${n.en}). On a budget sheet, work without a stated benefit is only a cost line.`,
        lang,
      ),
    );
  }
  if (noBenefitOwner.length > 0) {
    const n = nameList(noBenefitOwner);
    warnings.push(
      msg(
        `便益はあるが便益責任者がいない作業パッケージが ${noBenefitOwner.length} 件(${n.ja})。責任者のいない便益は、完了後に誰も測らない。`,
        `${noBenefitOwner.length} work package(s) state a benefit but name no benefit owner (${n.en}). Nobody measures a benefit that belongs to nobody.`,
        lang,
      ),
    );
  }
  if (noTransition.length > 0) {
    const n = nameList(noTransition);
    warnings.push(
      msg(
        `どの移行状態にも属していない作業パッケージが ${noTransition.length} 件(${n.ja})。どの中間状態を作るための作業かを決めること。`,
        `${noTransition.length} work package(s) belong to no transition state (${n.en}). Decide which intermediate state each one is building.`,
        lang,
      ),
    );
  }
  if (noTiming.length > 0) {
    const n = nameList(noTiming);
    warnings.push(
      msg(
        `時期が入っていない作業パッケージが ${noTiming.length} 件(${n.ja})。時期の書けない作業は、まだ計画ではなく願望。`,
        `${noTiming.length} work package(s) have no timing (${n.en}). Work without a quarter is not yet a plan.`,
        lang,
      ),
    );
  }
  if (badQuarter.length > 0) {
    const n = nameList(badQuarter);
    warnings.push(
      msg(
        `四半期表記(YYYY-Qn)として解釈できない時期が ${badQuarter.length} 件ある(${n.ja})。この作業はタイムラインに描かれない。`,
        `${badQuarter.length} timing value(s) could not be read as a quarter (YYYY-Qn): ${n.en}. That work is left out of the timeline.`,
        lang,
      ),
    );
  }

  const cycle = findDependencyCycle(e.workPackages);
  if (cycle) {
    warnings.push(
      msg(
        `依存関係が循環している: ${cycle.map((id) => nameOf(e, id)).join(' → ')}。この順序では誰も着手できない。`,
        `Dependencies form a cycle: ${cycle.map((id) => nameOf(e, id)).join(' → ')}. Nobody can start under this ordering.`,
        lang,
      ),
    );
  }

  return warnings;
}

// --- 優先順位付け ---

const VALUE_SCORE: Record<WorkPackage['businessValue'], number> = { low: 1, medium: 2, high: 3 };
const EFFORT_SCORE: Record<WorkPackage['effort'], number> = { low: 1, medium: 2, high: 3 };

type QuadrantKey = 'quickWin' | 'strategic' | 'fillIn' | 'drop';

function quadrantOf(w: WorkPackage): QuadrantKey {
  const highValue = w.businessValue !== 'low';
  const largeEffort = w.effort === 'high';
  if (highValue && !largeEffort) return 'quickWin';
  if (highValue && largeEffort) return 'strategic';
  if (!highValue && !largeEffort) return 'fillIn';
  return 'drop';
}

export function registerRoadmapTools(server: McpServer): void {
  // ------------------------------------------------------------------
  // 1. 移行アーキテクチャ(中間状態)の追加・更新
  // ------------------------------------------------------------------
  server.registerTool(
    'add_transition_state',
    {
      title: 'Add or update a transition architecture',
      description:
        '移行アーキテクチャ(中間状態)を追加または更新する。id を渡すと更新、省略すると新規追加。「そこで止めても事業が回るか(standalone)」と「暫定の仕組みの廃棄計画」を必ず確認し、危うい場合は警告を返す。 / Add or update a transition architecture (intermediate state). Pass an id to update, omit it to add. The tool insists on whether the business can run if delivery stops there, and on a disposal plan for any interim mechanism, warning when either is missing.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('既存の移行状態 ID。省略すると新規追加 / Existing transition id; omit to add a new one'),
        name: z.string().min(1).describe('移行状態の名前 / Transition state name'),
        order: z.number().int().optional().describe('ロードマップ上の並び順(省略時は末尾) / Order on the roadmap; appended when omitted'),
        targetQuarter: z.string().optional().describe('到達目標時期。四半期表記 YYYY-Qn / Target timing as YYYY-Qn'),
        capabilities: z
          .array(z.string())
          .optional()
          .describe('その状態で実現している能力 / Capabilities available once this state is reached'),
        standalone: z
          .boolean()
          .optional()
          .describe('ここで止めても事業が回るか / Whether the business can run if delivery stops here'),
        interim: z.string().optional().describe('暫定的な仕組み(二重運用・暫定連携など) / Interim mechanism such as dual running'),
        disposalPlan: z.string().optional().describe('暫定の仕組みの廃棄計画と期限 / Disposal plan and deadline for the interim mechanism'),
        note: z.string().optional(),
        lang: langSchema,
      },
    },
    async (input) => {
      const l = input.lang as Lang;
      try {
        // 上限検査は状態を読む前に。長い名前は保存 JSON とタイムラインの両方を壊す。
        const problem = runChecks([
          () => checkText('id', input.id, 'title', l, ID_HINT),
          () => checkText('name', input.name, 'title', l),
          () => checkText('targetQuarter', input.targetQuarter, 'title', l, QUARTER_HINT),
          () => checkTextList('capabilities', input.capabilities, 'title', l),
          () => checkText('interim', input.interim, 'text', l),
          () => checkText('disposalPlan', input.disposalPlan, 'text', l),
          () => checkText('note', input.note, 'text', l),
        ]);
        if (problem) return limitErrorResult(problem, l);

        const e = loadEngagement();
        if (!e) return errorResult(noEngagement(l));

        const timestamp = now();
        const warnings: string[] = [];
        let transition: TransitionState;
        let created = false;

        if (input.id) {
          const found = e.transitions.find((t) => t.id === input.id);
          if (!found) {
            return errorResult(
              msg(
                `移行状態 ID「${capCell(input.id, 60)}」が見つかりません。get_roadmap で一覧を確認してください。`,
                `Transition id "${capCell(input.id, 60)}" not found. Use get_roadmap to list them.`,
                l,
              ),
            );
          }
          transition = found;
        } else {
          const maxOrder = e.transitions.reduce((max, t) => Math.max(max, t.order), 0);
          transition = {
            id: makeId('trn'),
            name: input.name,
            order: maxOrder + 1,
            capabilities: [],
            standalone: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          e.transitions.push(transition);
          created = true;
          if (input.standalone === undefined) {
            warnings.push(
              msg(
                '単独稼働の可否が指定されていないため「不可」として登録した。フェーズ E では、各中間状態がそれ自体で事業を回せるかを明示的に確認する。確認できたら standalone=true で更新すること。',
                'You did not say whether the business can run at this state, so it was recorded as "no". Phase E expects an explicit answer for every intermediate state. Update with standalone=true once you have confirmed it.',
                l,
              ),
            );
          }
        }

        transition.name = input.name;
        if (input.order !== undefined) transition.order = input.order;
        if (input.targetQuarter !== undefined) transition.targetQuarter = normalizeQuarter(input.targetQuarter);
        if (input.capabilities !== undefined) transition.capabilities = input.capabilities;
        if (input.standalone !== undefined) transition.standalone = input.standalone;
        if (input.interim !== undefined) transition.interim = input.interim;
        if (input.disposalPlan !== undefined) transition.disposalPlan = input.disposalPlan;
        if (input.note !== undefined) transition.note = input.note;
        transition.updatedAt = timestamp;

        // --- 中間状態としての妥当性 ---
        if (!transition.standalone) {
          warnings.push(
            msg(
              'ここで止めても事業が回らない中間状態は、予算が切れた時点で負債になる。分割の仕方を見直すか、事業が回る単位まで作業を前倒しすること。',
              'An intermediate state the business cannot run on becomes debt the moment the budget stops. Either re-cut the increments or pull work forward until the state can stand alone.',
              l,
            ),
          );
        }
        if (transition.interim && !transition.disposalPlan) {
          warnings.push(
            msg(
              '暫定の仕組みがあるのに廃棄計画がない。暫定が恒久化する典型的な入り口。廃棄の期限・責任者・費用をいま決めて disposalPlan に書くこと。',
              'There is an interim mechanism but no disposal plan. This is the standard entry point for "temporary" becoming permanent. Fix the date, the owner, and the cost of removal now and record them in disposalPlan.',
              l,
            ),
          );
        }
        if (transition.capabilities.length === 0) {
          warnings.push(
            msg(
              '実現する能力が書かれていない。何ができるようになるかを言えない状態は、状態ではなく日付にすぎない。',
              'No capabilities recorded. A state you cannot describe in terms of new capability is just a date.',
              l,
            ),
          );
        }
        if (!transition.targetQuarter) {
          warnings.push(
            msg('到達目標時期が未設定。四半期(YYYY-Qn)で置くこと。月単位は精度を装った嘘になる。', 'No target timing. Use quarters (YYYY-Qn); months fake a precision you do not have.', l),
          );
        } else if (parseQuarter(transition.targetQuarter) === null) {
          warnings.push(
            msg(
              `時期「${transition.targetQuarter}」は四半期表記として解釈できないため、タイムラインでは末尾に寄せる。`,
              `Timing "${transition.targetQuarter}" is not a quarter, so it is pushed to the end of the timeline.`,
              l,
            ),
          );
        }

        saveEngagement(e);

        const out: string[] = [];
        out.push(
          `# ${label(L.transition, l)}: ${transition.name} — ${created ? label(R.added, l) : label(R.updated, l)}`,
        );
        out.push('');
        out.push(`- ID: \`${transition.id}\``);
        out.push(`- ${label(L.roadmap, l)} #${transition.order}`);
        out.push(`- ${label(L.quarter, l)}: ${transition.targetQuarter ?? label(L.none, l)}`);
        out.push(
          `- ${label(L.standalone, l)}: ${transition.standalone ? label(L.standaloneYes, l) : `**${label(L.standaloneNo, l)}**`}`,
        );
        if (transition.capabilities.length > 0) {
          out.push(`- ${label(L.capabilities, l)}:`);
          for (const c of transition.capabilities) out.push(`  - ${c}`);
        }
        if (transition.interim) out.push(`- ${label(L.interim, l)}: ${transition.interim}`);
        if (transition.disposalPlan) out.push(`- ${label(L.disposalPlan, l)}: ${transition.disposalPlan}`);
        if (transition.note) out.push(`- ${label(L.note, l)}: ${transition.note}`);

        if (warnings.length > 0) {
          out.push('');
          out.push(`## ${label(R.warnings, l)}`);
          out.push('');
          for (const w of warnings) out.push(`- ${w}`);
        }
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。
        return unexpectedErrorResult('add_transition_state', error, l);
      }
    },
  );

  // ------------------------------------------------------------------
  // 2. 作業パッケージの追加・更新
  // ------------------------------------------------------------------
  server.registerTool(
    'add_work_package',
    {
      title: 'Add or update a work package',
      description:
        '作業パッケージ(ギャップを束ねた実行単位)を追加または更新する。id を渡すと更新、省略すると新規追加。依存先 ID が存在しない場合と循環依存はエラー。便益に責任者がいない場合は警告する。 / Add or update a work package. Pass an id to update, omit it to add. Unknown dependency ids and dependency cycles are rejected; a benefit without a named owner raises a warning.',
      inputSchema: {
        id: z.string().optional().describe('既存の作業パッケージ ID / Existing work package id'),
        name: z.string().min(1).describe('作業パッケージ名 / Work package name'),
        description: z.string().optional(),
        status: z.enum(WORK_PACKAGE_STATUSES).optional().describe('状態 / Status'),
        transitionId: z.string().optional().describe('属する移行状態の ID / Transition state id this belongs to'),
        phase: z.string().optional().describe('関連する ADM フェーズ ID / Related ADM phase id'),
        owner: z.string().optional(),
        startQuarter: z.string().optional().describe('開始四半期 YYYY-Qn / Start quarter'),
        endQuarter: z.string().optional().describe('終了四半期 YYYY-Qn / End quarter'),
        dependsOn: z.array(z.string()).optional().describe('先行する作業パッケージ ID / Ids of prerequisite work packages'),
        businessValue: z.enum(PRIORITIES).optional().describe('事業価値 / Business value'),
        effort: z.enum(PRIORITIES).optional().describe('規模・工数 / Effort'),
        costEstimate: z.string().optional().describe('概算コスト / Rough cost estimate'),
        benefit: z.string().optional().describe('実現する便益 / Benefit delivered'),
        benefitOwner: z.string().optional().describe('便益の刈り取り責任者 / Person accountable for realizing the benefit'),
        lang: langSchema,
      },
    },
    async (input) => {
      const l = input.lang as Lang;
      try {
        // 上限検査は状態を読む前に。作業パッケージ名はタイムラインの行頭に出るので特に短く保つ。
        const problem = runChecks([
          () => checkText('id', input.id, 'title', l, ID_HINT),
          () => checkText('name', input.name, 'title', l),
          () => checkText('description', input.description, 'text', l),
          () => checkText('transitionId', input.transitionId, 'title', l, ID_HINT),
          () => checkText('phase', input.phase, 'title', l, PHASE_HINT),
          () => checkText('owner', input.owner, 'title', l),
          () => checkText('startQuarter', input.startQuarter, 'title', l, QUARTER_HINT),
          () => checkText('endQuarter', input.endQuarter, 'title', l, QUARTER_HINT),
          () => checkTextList('dependsOn', input.dependsOn, 'title', l, ID_HINT),
          () => checkText('costEstimate', input.costEstimate, 'title', l),
          () => checkText('benefit', input.benefit, 'text', l),
          () => checkText('benefitOwner', input.benefitOwner, 'title', l),
        ]);
        if (problem) return limitErrorResult(problem, l);

        const e = loadEngagement();
        if (!e) return errorResult(noEngagement(l));

        const timestamp = now();
        const warnings: string[] = [];

        // --- 参照先の検証(先に済ませ、壊れた状態を保存しない) ---
        if (input.transitionId && !e.transitions.some((t) => t.id === input.transitionId)) {
          return errorResult(
            msg(
              `移行状態 ID「${capCell(input.transitionId, 60)}」が見つかりません。先に add_transition_state で登録してください。`,
              `Transition id "${capCell(input.transitionId, 60)}" not found. Register it with add_transition_state first.`,
              l,
            ),
          );
        }

        let target: WorkPackage;
        let created = false;
        if (input.id) {
          const found = e.workPackages.find((w) => w.id === input.id);
          if (!found) {
            return errorResult(
              msg(
                `作業パッケージ ID「${capCell(input.id, 60)}」が見つかりません。get_roadmap で一覧を確認してください。`,
                `Work package id "${capCell(input.id, 60)}" not found. Use get_roadmap to list them.`,
                l,
              ),
            );
          }
          target = found;
        } else {
          target = {
            id: makeId('wp'),
            name: input.name,
            status: 'proposed',
            dependsOn: [],
            businessValue: 'medium',
            effort: 'medium',
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          created = true;
        }

        if (input.dependsOn) {
          const unknown = input.dependsOn.filter(
            (id) => id !== target.id && !e.workPackages.some((w) => w.id === id),
          );
          if (unknown.length > 0) {
            // 100 件まで渡せるので、そのまま並べるとエラー文が ID の羅列で埋まる
            const shown = unknown.slice(0, OUTPUT_LIMITS.highlights).map((id) => capCell(id, 40)).join(', ');
            const rest = unknown.length - Math.min(unknown.length, OUTPUT_LIMITS.highlights);
            return errorResult(
              msg(
                `依存先の作業パッケージ ID が見つかりません(${unknown.length} 件): ${shown}${rest > 0 ? ` ほか ${rest} 件` : ''}。存在する ID だけを dependsOn に指定してください。`,
                `Unknown work package ids in dependsOn (${unknown.length}): ${shown}${rest > 0 ? ` and ${rest} more` : ''}. Only existing ids may be referenced.`,
                l,
              ),
            );
          }
          if (input.dependsOn.includes(target.id)) {
            return errorResult(
              msg('作業パッケージが自分自身に依存することはできません。', 'A work package cannot depend on itself.', l),
            );
          }
        }

        // --- 反映 ---
        target.name = input.name;
        if (input.description !== undefined) target.description = input.description;
        if (input.status !== undefined) target.status = input.status;
        if (input.transitionId !== undefined) target.transitionId = input.transitionId;
        if (input.owner !== undefined) target.owner = input.owner;
        if (input.startQuarter !== undefined) target.startQuarter = normalizeQuarter(input.startQuarter);
        if (input.endQuarter !== undefined) target.endQuarter = normalizeQuarter(input.endQuarter);
        target.dependsOn =
          input.dependsOn !== undefined ? Array.from(new Set(input.dependsOn)) : depsOf(target);
        if (input.businessValue !== undefined) target.businessValue = input.businessValue;
        if (input.effort !== undefined) target.effort = input.effort;
        if (input.costEstimate !== undefined) target.costEstimate = input.costEstimate;
        if (input.benefit !== undefined) target.benefit = input.benefit;
        if (input.benefitOwner !== undefined) target.benefitOwner = input.benefitOwner;
        if (input.phase !== undefined) {
          const phaseId = resolvePhaseId(input.phase);
          if (!phaseId) {
            warnings.push(
              msg(
                `フェーズ「${capCell(input.phase, 60)}」が見つからないため設定しなかった。`,
                `Phase "${capCell(input.phase, 60)}" not found, so it was not set.`,
                l,
              ),
            );
          } else {
            target.phaseId = phaseId;
          }
        }
        target.updatedAt = timestamp;

        const candidate = created ? [...e.workPackages, target] : e.workPackages;
        const cycle = findDependencyCycle(candidate);
        if (cycle) {
          return errorResult(
            msg(
              `依存関係が循環します: ${cycle.map((id) => nameOf(e, id)).join(' → ')}。この形では誰も着手できないため保存しませんでした。`,
              `This would create a dependency cycle: ${cycle.map((id) => nameOf(e, id)).join(' → ')}. Nothing was saved, because nobody could start under this ordering.`,
              l,
            ),
          );
        }
        if (created) e.workPackages.push(target);

        // --- 助言 ---
        if (target.benefit && !target.benefitOwner) {
          warnings.push(
            msg(
              '便益が書かれているのに便益責任者がいない。責任者のいない便益は、完了報告の後に誰も測らない。名前を 1 つ入れること。',
              'A benefit is stated but no benefit owner is named. Nobody measures a benefit that belongs to nobody. Put one name against it.',
              l,
            ),
          );
        }
        if (!target.benefit) {
          warnings.push(
            msg(
              '便益が未記入。便益のない作業パッケージは、予算表の上ではコスト行にしか見えない。',
              'No benefit recorded. On a budget sheet, a work package without a stated benefit is only a cost line.',
              l,
            ),
          );
        }
        if (!target.transitionId) {
          warnings.push(
            msg(
              'どの移行状態にも属していない。どの中間状態を作るための作業かを決めると、順序と打ち切り判断がしやすくなる。',
              'Not tied to any transition state. Deciding which intermediate state this builds makes both sequencing and stop/go decisions easier.',
              l,
            ),
          );
        }
        if (!target.startQuarter && !target.endQuarter) {
          warnings.push(
            msg('時期が未設定。時期の書けない作業は、まだ計画ではなく願望。', 'No timing set. Work without a quarter is not yet a plan.', l),
          );
        }
        for (const value of [target.startQuarter, target.endQuarter]) {
          if (value && parseQuarter(value) === null) {
            warnings.push(
              msg(
                `時期「${capCell(value, 60)}」は四半期表記(YYYY-Qn)として解釈できないため、そのまま保存したがタイムラインには描かれない。`,
                `Timing "${capCell(value, 60)}" could not be read as a quarter (YYYY-Qn). It was stored as typed, but this work will not appear on the timeline.`,
                l,
              ),
            );
          }
        }
        const start = parseQuarter(target.startQuarter);
        const end = parseQuarter(target.endQuarter);
        if (start !== null && end !== null && end < start) {
          warnings.push(
            msg(
              `終了(${target.endQuarter})が開始(${target.startQuarter})より前になっている。`,
              `The end (${target.endQuarter}) is before the start (${target.startQuarter}).`,
              l,
            ),
          );
        }
        // --- コスト表記が合計に載るか ---
        // 合計を出すのはこちらの仕事だが、読めない書き方をされたら黙って落とさずその場で言う。
        const parsedCost = parseCostEstimate(target.costEstimate);
        if (!target.costEstimate) {
          warnings.push(
            msg(
              '概算コストが未記入。金額の入っていない作業パッケージがある限り、ロードマップの合計は「下限」であって総額ではない。桁が合っていればよいので costEstimate に「約 2 億円」程度で入れること。',
              'No rough cost. While any work package carries no figure, the roadmap total is a floor, not the bill. An order-of-magnitude entry such as "約 2 億円" in costEstimate is enough.',
              l,
            ),
          );
        } else if (!parsedCost) {
          warnings.push(
            msg(
              `コスト「${target.costEstimate}」を金額として読めなかったため、合計には含めない(「約 2.1 億円」「4,000 万円」「50,000,000 円」「$1.2M」「2〜3 億円」の形なら読める)。`,
              `The cost "${target.costEstimate}" could not be read as an amount, so it is excluded from the total. Forms such as "約 2.1 億円", "4,000 万円", "50,000,000 円", "$1.2M" and "2〜3 億円" are understood.`,
              l,
            ),
          );
        } else if (parsedCost.recurring) {
          warnings.push(
            msg(
              `コスト「${target.costEstimate}」は期間あたりの費用と読んだため、総額には足していない。総額に載せたいなら期間分を掛けた一括額で書くこと。`,
              `The cost "${target.costEstimate}" reads as a per-period figure, so it is not added to the total. Enter the multiplied lump sum if you want it counted.`,
              l,
            ),
          );
        }
        if (target.businessValue === 'high' && target.effort === 'high') {
          warnings.push(
            msg(
              '高価値かつ大規模。分割できないか検討すること。1 つの大玉は、途中で予算が切れたときに何も残らない。',
              'High value and large effort. Look for a split: one big lump leaves nothing behind if the money stops halfway.',
              l,
            ),
          );
        }

        saveEngagement(e);

        const transition = target.transitionId ? e.transitions.find((t) => t.id === target.transitionId) : undefined;
        const out: string[] = [];
        out.push(`# ${label(R.workPackage, l)}: ${target.name} — ${created ? label(R.added, l) : label(R.updated, l)}`);
        out.push('');
        out.push(`- ID: \`${target.id}\``);
        out.push(`- ${label(L.status, l)}: ${statusIcon(target.status)} ${statusLabel(target.status, l)}`);
        if (transition) out.push(`- ${label(L.transition, l)}: ${transition.name} (\`${transition.id}\`)`);
        out.push(
          `- ${label(L.quarter, l)}: ${target.startQuarter ?? '?'} → ${target.endQuarter ?? '?'}`,
        );
        out.push(
          `- ${label(L.businessValue, l)}: ${priorityLabel(target.businessValue, l)} / ${label(L.effort, l)}: ${priorityLabel(target.effort, l)}`,
        );
        if (target.owner) out.push(`- ${label(L.owner, l)}: ${target.owner}`);
        if (target.costEstimate) {
          // 入力そのままと、合計に載る金額の両方を見せる(どう読まれたかが分かるように)
          const counted = parsedCost
            ? ` → ${formatAmountRange(parsedCost.min, parsedCost.max, parsedCost.currency, l)}${
                parsedCost.recurring ? ` (${inline('期間あたり・総額には未算入', 'per period, not in the total', l)})` : ''
              }`
            : ` → ${inline('金額として読めず合計に未算入', 'not readable as an amount; excluded from the total', l)}`;
          out.push(`- ${label(L.cost, l)}: ${target.costEstimate}${counted}`);
        }
        if (target.benefit) {
          out.push(`- ${label(L.benefit, l)}: ${target.benefit}${target.benefitOwner ? ` (${label(L.benefitOwner, l)}: ${target.benefitOwner})` : ''}`);
        }
        if (depsOf(target).length > 0) {
          out.push(`- ${label(L.dependsOn, l)}: ${depsOf(target).map((id) => `${nameOf(e, id)} (\`${id}\`)`).join(', ')}`);
        }
        if (target.description) {
          out.push('');
          out.push(target.description);
        }

        if (warnings.length > 0) {
          out.push('');
          out.push(`## ${label(R.warnings, l)}`);
          out.push('');
          for (const w of warnings) out.push(`- ${w}`);
        }
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。
        return unexpectedErrorResult('add_work_package', error, l);
      }
    },
  );

  // ------------------------------------------------------------------
  // 3. ロードマップの可視化
  // ------------------------------------------------------------------
  server.registerTool(
    'get_roadmap',
    {
      title: 'Get the roadmap',
      description:
        '四半期を横軸にしたテキストのタイムライン、移行状態ごとの作業パッケージ、依存関係、各段階で実現する便益を Markdown で返す。四半期表記(YYYY-Qn)として解釈できない時期は末尾に寄せる。 / Return the roadmap as Markdown: a text timeline with quarters across the top, work packages grouped by transition state, the dependency list, and the benefits realized at each step. Timings that are not valid quarters (YYYY-Qn) sort last.',
      inputSchema: {
        includeCancelled: z
          .boolean()
          .default(false)
          .describe('中止した作業パッケージも表示する / Include cancelled work packages'),
        lang: langSchema,
      },
    },
    async ({ includeCancelled, lang }) => {
      const l = lang as Lang;
      const e = loadEngagement();
      if (!e) return textResult(noEngagement(l));

      const packages = includeCancelled ? e.workPackages : e.workPackages.filter((w) => w.status !== 'cancelled');
      const transitions = sortedTransitions(e);
      // 消えた移行状態を指している作業パッケージも「未割当」として扱う
      const transitionIds = new Set(transitions.map((t) => t.id));
      const groupKey = (w: WorkPackage): string =>
        w.transitionId && transitionIds.has(w.transitionId) ? w.transitionId : '';

      const out: string[] = [];
      out.push(`# ${label(L.roadmap, l)}: ${e.name}`);
      out.push('');

      if (transitions.length === 0 && packages.length === 0) {
        out.push(
          msg(
            'ロードマップがまだ空です。`add_transition_state` で中間状態を置き、`add_work_package` でそこに至る作業を登録してください。順序は「いつ何ができるようになるか」から決めること。',
            'The roadmap is empty. Place intermediate states with `add_transition_state`, then register the work that reaches them with `add_work_package`. Sequence by "what becomes possible when", not by team convenience.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      }

      // 役員の最初の質問は「いくらかかるのか」。見出し直下の 1 行目に金額を置く。
      // 中止した作業は積まない(includeCancelled で表示していても金額には入れない)。
      const costPackages = packages.filter((w) => w.status !== 'cancelled');
      const rollup = summarizeCosts(costPackages);
      const summary = [
        `${label(L.transitions, l)}: ${transitions.length}`,
        `${label(L.workPackages, l)}: ${packages.length}`,
        `${label(WORK_PACKAGE_STATUS_LABEL.delivered, l)}: ${packages.filter((w) => w.status === 'delivered').length}`,
      ];
      for (const total of rollup.totals) {
        summary.push(
          `${label(L.cost, l)}: **${formatAmountRange(total.min, total.max, total.currency, l)}** (${total.count}/${costPackages.length})`,
        );
      }
      out.push(summary.join(' | '));
      out.push('');

      // --- タイムライン ---
      const indices: number[] = [];
      for (const t of transitions) {
        const q = parseQuarter(t.targetQuarter);
        if (q !== null) indices.push(q);
      }
      for (const w of packages) {
        const s = parseQuarter(w.startQuarter);
        const en = parseQuarter(w.endQuarter);
        if (s !== null) indices.push(s);
        if (en !== null) indices.push(en);
      }
      const axis = buildAxis(indices);

      out.push(`## ${label(R.timeline, l)}`);
      out.push('');
      if (axis.quarters.length === 0) {
        out.push(
          msg(
            '四半期(YYYY-Qn)として解釈できる時期が 1 つもないため、タイムラインを描けません。',
            'No timing could be read as a quarter (YYYY-Qn), so there is no timeline to draw.',
            l,
          ),
        );
      } else {
        const rows: TimelineRow[] = [];
        const grouped = new Map<string, WorkPackage[]>();
        for (const w of packages) {
          const key = groupKey(w);
          grouped.set(key, [...(grouped.get(key) ?? []), w]);
        }

        let previousTarget: number | null = null;
        for (const t of transitions) {
          const target = parseQuarter(t.targetQuarter);
          const members = sortedWorkPackages(grouped.get(t.id) ?? []);
          const memberStarts = members
            .map((w) => parseQuarter(w.startQuarter) ?? parseQuarter(w.endQuarter))
            .filter((n): n is number => n !== null);
          const runUpFrom =
            target === null
              ? null
              : Math.min(target, previousTarget !== null ? previousTarget + 1 : target, ...(memberStarts.length > 0 ? memberStarts : [target]));
          rows.push({
            label: `▶ ${t.name}${target === null ? ` (${label(R.noTiming, l)})` : ''}`,
            from: runUpFrom,
            to: target,
            milestone: target,
            glyph: '░',
          });
          for (const w of members) {
            rows.push({
              label: `  ${statusIcon(w.status)} ${w.name}`,
              from: parseQuarter(w.startQuarter),
              to: parseQuarter(w.endQuarter),
              milestone: null,
              glyph: '▓',
            });
          }
          if (target !== null) previousTarget = target;
        }

        const orphans = sortedWorkPackages(grouped.get('') ?? []);
        if (orphans.length > 0) {
          rows.push({ label: `▶ ${label(R.unassigned, l)}`, from: null, to: null, milestone: null, glyph: '░' });
          for (const w of orphans) {
            rows.push({
              label: `  ${statusIcon(w.status)} ${w.name}`,
              from: parseQuarter(w.startQuarter),
              to: parseQuarter(w.endQuarter),
              milestone: null,
              glyph: '▓',
            });
          }
        }

        out.push(...renderTimeline(rows, axis.quarters, l));
        if (axis.truncated) {
          out.push('');
          out.push(
            msg(
              `期間が長いため最初の ${MAX_COLUMNS} 四半期だけを表示している。これより先まで伸びる計画は、そもそも 1 本のロードマップとして扱わない方がよい。`,
              `Only the first ${MAX_COLUMNS} quarters are drawn. A plan that runs longer than this is usually better split into separate roadmaps.`,
              l,
            ),
          );
        }
      }
      out.push('');

      // --- 概算コスト(合計・年ごとの山積み・予算との照合) ---
      out.push(...renderCostSection(e, l, { detail: 'full' }));

      // --- 移行状態ごとの作業パッケージ ---
      out.push(`## ${label(L.transitions, l)}`);
      out.push('');
      if (transitions.length === 0) {
        out.push(label(L.none, l));
        out.push('');
      }
      for (const t of transitions) {
        const members = sortedWorkPackages(packages.filter((w) => groupKey(w) === t.id));
        out.push(
          `### ${t.order}. ${t.name}${t.targetQuarter ? ` — ${t.targetQuarter}` : ''}`,
        );
        out.push('');
        out.push(
          `- ${label(L.standalone, l)}: ${t.standalone ? label(L.standaloneYes, l) : `**${label(L.standaloneNo, l)}**`}`,
        );
        if (t.capabilities.length > 0) {
          out.push(`- ${label(L.capabilities, l)}: ${t.capabilities.join(' / ')}`);
        }
        if (t.interim) {
          out.push(`- ${label(L.interim, l)}: ${t.interim}`);
          out.push(`- ${label(L.disposalPlan, l)}: ${t.disposalPlan ?? `**${label(L.none, l)}**`}`);
        }
        if (t.note) out.push(`- ${label(L.note, l)}: ${t.note}`);
        out.push('');
        if (members.length === 0) {
          out.push(label(L.none, l));
        } else {
          out.push(
            `| | ${label(R.itemName, l)} | ${label(L.quarter, l)} | ${label(L.owner, l)} | ${label(L.businessValue, l)} | ${label(L.effort, l)} | ${label(L.benefit, l)} |`,
          );
          out.push('| :-: | --- | --- | --- | :-: | :-: | --- |');
          for (const w of members) {
            const timing = `${w.startQuarter ?? '?'} → ${w.endQuarter ?? '?'}`;
            const benefit = w.benefit
              ? `${cell(w.benefit)}${w.benefitOwner ? ` (${cell(w.benefitOwner)})` : ` ⚠`}`
              : '';
            out.push(
              `| ${statusIcon(w.status)} | ${cell(w.name)} | ${timing} | ${cell(w.owner)} | ${priorityLabel(w.businessValue, l)} | ${priorityLabel(w.effort, l)} | ${benefit} |`,
            );
          }
        }
        out.push('');
      }

      const orphanPackages = sortedWorkPackages(packages.filter((w) => groupKey(w) === ''));
      if (orphanPackages.length > 0) {
        out.push(`### ${label(R.unassigned, l)}`);
        out.push('');
        for (const w of orphanPackages) {
          out.push(`- ${statusIcon(w.status)} ${w.name} (\`${w.id}\`)`);
        }
        out.push('');
      }

      // --- 依存関係 ---
      out.push(`## ${label(R.dependencies, l)}`);
      out.push('');
      const edges = packages.filter((w) => depsOf(w).length > 0);
      if (edges.length === 0) {
        out.push(
          msg(
            '依存関係は登録されていない。本当に何も先行条件がないのか、まだ洗い出していないだけなのかを区別すること。',
            'No dependencies recorded. Decide whether there genuinely are none, or whether nobody has looked yet.',
            l,
          ),
        );
      } else {
        for (const w of edges) {
          for (const id of depsOf(w)) {
            const dep = e.workPackages.find((x) => x.id === id);
            const mark = dep ? (dep.status === 'delivered' ? '●' : '◐') : '⚠';
            const statusText = dep ? statusLabel(dep.status, l) : inline('不明な ID', 'unknown id', l);
            out.push(`- ${mark} ${dep?.name ?? id} (${statusText}) → **${w.name}**`);
          }
        }
      }
      out.push('');

      // --- 便益 ---
      out.push(`## ${label(R.benefits, l)}`);
      out.push('');
      let anyBenefit = false;
      for (const t of transitions) {
        const members = packages.filter((w) => groupKey(w) === t.id && w.benefit);
        if (members.length === 0) continue;
        anyBenefit = true;
        out.push(`### ${t.order}. ${t.name}${t.targetQuarter ? ` — ${t.targetQuarter}` : ''}`);
        out.push('');
        for (const w of members) {
          const owner = w.benefitOwner
            ? `${label(L.benefitOwner, l)}: ${w.benefitOwner}`
            : `**${inline('便益責任者なし', 'no benefit owner', l)}**`;
          out.push(`- ${w.benefit} — ${owner} (${w.name})`);
        }
        out.push('');
      }
      const orphanBenefits = packages.filter((w) => groupKey(w) === '' && w.benefit);
      if (orphanBenefits.length > 0) {
        anyBenefit = true;
        out.push(`### ${label(R.unassigned, l)}`);
        out.push('');
        for (const w of orphanBenefits) {
          out.push(`- ${w.benefit} (${w.name})`);
        }
        out.push('');
      }
      if (!anyBenefit) {
        out.push(
          msg(
            '便益が 1 つも登録されていない。段階ごとに何が良くなるかを言えないロードマップは、途中で止められたときに守れない。',
            'No benefits are recorded. A roadmap that cannot say what improves at each step has no defence when someone proposes stopping it.',
            l,
          ),
        );
        out.push('');
      }

      // --- 警告 ---
      const warnings = collectRoadmapWarnings(e, l);
      if (warnings.length > 0) {
        out.push(`## ${label(R.warnings, l)}`);
        out.push('');
        for (const w of warnings) out.push(`- ${w}`);
        out.push('');
      }

      return textResult(out.join('\n'));
    },
  );

  // ------------------------------------------------------------------
  // 4. 優先順位付け
  // ------------------------------------------------------------------
  server.registerTool(
    'prioritize_work_packages',
    {
      title: 'Prioritize work packages',
      description:
        '作業パッケージを事業価値 × 規模の 4 象限(まず着手すべき / 計画的に / 余力があれば / 見送り検討)に分類し、依存関係により先行が必要なものには注記を付けて返す。 / Sort work packages into four quadrants of business value against effort (start here, plan properly, if capacity allows, consider dropping), annotating anything that cannot start until a prerequisite is delivered.',
      inputSchema: {
        includeDelivered: z
          .boolean()
          .default(false)
          .describe('完了済みも対象に含める / Include delivered work packages'),
        lang: langSchema,
      },
    },
    async ({ includeDelivered, lang }) => {
      const l = lang as Lang;
      const e = loadEngagement();
      if (!e) return textResult(noEngagement(l));

      const packages = e.workPackages.filter(
        (w) => w.status !== 'cancelled' && (includeDelivered || w.status !== 'delivered'),
      );

      const out: string[] = [];
      out.push(`# ${inline('作業パッケージの優先順位', 'Work package priorities', l)}: ${e.name}`);
      out.push('');

      if (packages.length === 0) {
        out.push(
          msg(
            '対象の作業パッケージがありません。`add_work_package` で登録してください。',
            'No work packages to rank. Register some with `add_work_package`.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      }

      out.push(
        `**${label(R.criteria, l)}**: ` +
          msg(
            '事業価値が「中」以上を「価値あり」、規模が「高」のものだけを「大規模」として 4 象限に分ける(価値 中 × 規模 中 は「まず着手すべき」の下端に入る)。象限内の順序は 価値 × 2 − 規模。',
            'Business value of medium or above counts as "value present"; only effort of "high" counts as "large". Medium value with medium effort therefore lands at the bottom of "start here". Within a quadrant the order is value x 2 - effort.',
            l,
          ),
      );
      out.push('');

      // 依存の解決状況
      const byId = new Map(e.workPackages.map((w) => [w.id, w] as const));
      const blockedBy = new Map<string, WorkPackage[]>();
      const blocks = new Map<string, number>();
      for (const w of packages) {
        const unresolved: WorkPackage[] = [];
        for (const id of depsOf(w)) {
          const dep = byId.get(id);
          if (!dep) continue;
          blocks.set(id, (blocks.get(id) ?? 0) + 1);
          if (dep.status !== 'delivered') unresolved.push(dep);
        }
        blockedBy.set(w.id, unresolved);
      }

      const quadrants: Record<QuadrantKey, WorkPackage[]> = { quickWin: [], strategic: [], fillIn: [], drop: [] };
      for (const w of packages) quadrants[quadrantOf(w)].push(w);

      const score = (w: WorkPackage): number => VALUE_SCORE[w.businessValue] * 2 - EFFORT_SCORE[w.effort];
      const order: QuadrantKey[] = ['quickWin', 'strategic', 'fillIn', 'drop'];

      for (const key of order) {
        const list = quadrants[key].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
        out.push(`## ${label(R[key], l)} — ${list.length}`);
        out.push('');
        if (list.length === 0) {
          out.push(label(L.none, l));
          out.push('');
          continue;
        }
        for (const w of list) {
          const transition = w.transitionId ? e.transitions.find((t) => t.id === w.transitionId) : undefined;
          const meta = [
            `${label(L.businessValue, l)} ${priorityLabel(w.businessValue, l)}`,
            `${label(L.effort, l)} ${priorityLabel(w.effort, l)}`,
            `${statusIcon(w.status)} ${statusLabel(w.status, l)}`,
          ];
          if (w.startQuarter || w.endQuarter) {
            meta.push(`${w.startQuarter ?? '?'} → ${w.endQuarter ?? '?'}`);
          }
          if (transition) meta.push(transition.name);
          out.push(`- **${w.name}** (\`${w.id}\`) — ${meta.join(' | ')}`);

          const waiting = blockedBy.get(w.id) ?? [];
          if (waiting.length > 0) {
            out.push(
              `  - ⚠ ${label(R.blockedBy, l)}: ${waiting.map((d) => `${d.name} (${statusLabel(d.status, l)})`).join(', ')} — ` +
                inline('これらが完了するまで着手できない。', 'cannot start until these are delivered.', l),
            );
          }
          const blockCount = blocks.get(w.id) ?? 0;
          if (blockCount > 0) {
            out.push(
              `  - ${label(R.blocks, l)}: ${blockCount} — ` +
                inline('ここが遅れると後続がまとめて遅れる。', 'a slip here slips everything behind it.', l),
            );
          }
          if (w.benefit && !w.benefitOwner) {
            out.push(`  - ⚠ ${inline('便益責任者がいない。', 'No benefit owner named.', l)}`);
          }
        }
        out.push('');
      }

      // --- いま着手できるもの ---
      const ready = packages
        .filter((w) => (blockedBy.get(w.id) ?? []).length === 0 && w.status !== 'delivered')
        .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
        .slice(0, 10);
      out.push(`## ${label(R.ready, l)}`);
      out.push('');
      if (ready.length === 0) {
        out.push(
          msg(
            '未完了の先行作業がないものが 1 つもない。依存関係を見直すか、依存の一部を切って並行化できないか検討すること。',
            'Nothing is free of unfinished prerequisites. Re-examine the dependencies, or look for a cut that lets some work run in parallel.',
            l,
          ),
        );
      } else {
        for (const w of ready) {
          out.push(
            `- ${statusIcon(w.status)} **${w.name}** — ${label(R[quadrantOf(w)], l)}`,
          );
        }
      }
      out.push('');

      const cycle = findDependencyCycle(e.workPackages);
      if (cycle) {
        out.push(`## ${label(R.warnings, l)}`);
        out.push('');
        out.push(
          `- ${msg(
            `依存関係が循環している: ${cycle.map((id) => nameOf(e, id)).join(' → ')}。この順序では誰も着手できない。`,
            `Dependencies form a cycle: ${cycle.map((id) => nameOf(e, id)).join(' → ')}. Nobody can start under this ordering.`,
            l,
          )}`,
        );
        out.push('');
      }

      return textResult(out.join('\n'));
    },
  );

  // ------------------------------------------------------------------
  // 5. 削除
  // ------------------------------------------------------------------
  server.registerTool(
    'remove_roadmap_item',
    {
      title: 'Remove a roadmap item',
      description:
        '移行状態または作業パッケージを削除する。confirm=false(既定)のときは削除せず、影響範囲だけを返す。移行状態を消すと、それを参照する作業パッケージの割当が外れる。 / Remove a transition state or a work package. With confirm=false (the default) nothing is deleted and only the impact is reported. Deleting a transition state detaches the work packages that referenced it.',
      inputSchema: {
        id: z.string().min(1).describe('削除する移行状態または作業パッケージの ID / Id of the transition state or work package'),
        confirm: z
          .boolean()
          .default(false)
          .describe('true で実際に削除する / Pass true to actually delete'),
        lang: langSchema,
      },
    },
    async ({ id, confirm, lang }) => {
      const l = lang as Lang;
      try {
        const problem = checkText('id', id, 'title', l, ID_HINT);
        if (problem) return limitErrorResult(problem, l);

        const e = loadEngagement();
        if (!e) return errorResult(noEngagement(l));

        const transitionIndex = e.transitions.findIndex((t) => t.id === id);
        const packageIndex = e.workPackages.findIndex((w) => w.id === id);

        if (transitionIndex < 0 && packageIndex < 0) {
          return errorResult(
            msg(
              `ID「${capCell(id, 60)}」の移行状態・作業パッケージが見つかりません。get_roadmap で一覧を確認してください。`,
              `No transition state or work package with id "${capCell(id, 60)}". Use get_roadmap to list them.`,
              l,
            ),
          );
        }

        const out: string[] = [];
        const impacts: string[] = [];

        if (transitionIndex >= 0) {
          const transition = e.transitions[transitionIndex];
          const referencing = e.workPackages.filter((w) => w.transitionId === transition.id);
          if (referencing.length > 0) {
            impacts.push(
              msg(
                `${referencing.length} 件の作業パッケージがこの移行状態を参照している(${referencing.map((w) => w.name).join(', ')})。削除すると割当が外れ、どの中間状態を作る作業なのかが不明になる。`,
                `${referencing.length} work package(s) reference this transition (${referencing.map((w) => w.name).join(', ')}). Deleting it detaches them, leaving no record of which intermediate state they were building.`,
                l,
              ),
            );
          }
          if (!confirm) {
            out.push(`# ${inline('削除の確認', 'Confirm deletion', l)}: ${transition.name}`);
            out.push('');
            out.push(`- ${label(L.transition, l)} \`${transition.id}\``);
            if (impacts.length > 0) for (const i of impacts) out.push(`- ${i}`);
            out.push('');
            out.push(msg('削除するには confirm=true を指定してください。', 'Pass confirm=true to delete it.', l));
            return textResult(out.join('\n'));
          }
          for (const w of referencing) {
            w.transitionId = undefined;
            w.updatedAt = now();
          }
          e.transitions.splice(transitionIndex, 1);
          saveEngagement(e);
          out.push(`# ${label(R.removed, l)}: ${transition.name}`);
          out.push('');
          out.push(`- ${label(L.transition, l)} \`${transition.id}\``);
          if (referencing.length > 0) {
            out.push('');
            out.push(`## ${label(R.warnings, l)}`);
            out.push('');
            for (const i of impacts) out.push(`- ${i}`);
            out.push(
              `- ${msg(
                `参照を外した作業パッケージ: ${referencing.map((w) => `${w.name} (\`${w.id}\`)`).join(', ')}。別の移行状態に割り当て直すこと。`,
                `Detached work packages: ${referencing.map((w) => `${w.name} (\`${w.id}\`)`).join(', ')}. Reassign them to another transition state.`,
                l,
              )}`,
            );
          }
          return textResult(out.join('\n'));
        }

        const target = e.workPackages[packageIndex];
        const dependents = e.workPackages.filter((w) => w.id !== target.id && depsOf(w).includes(target.id));
        if (dependents.length > 0) {
          impacts.push(
            msg(
              `${dependents.length} 件の作業パッケージがこれに依存している(${dependents.map((w) => w.name).join(', ')})。削除すると依存が外れ、先行条件が失われる。`,
              `${dependents.length} work package(s) depend on this one (${dependents.map((w) => w.name).join(', ')}). Deleting it drops those links and the prerequisite disappears from the plan.`,
              l,
            ),
          );
        }
        if (!confirm) {
          out.push(`# ${inline('削除の確認', 'Confirm deletion', l)}: ${target.name}`);
          out.push('');
          out.push(`- ${label(R.workPackage, l)} \`${target.id}\``);
          if (impacts.length > 0) for (const i of impacts) out.push(`- ${i}`);
          out.push('');
          out.push(msg('削除するには confirm=true を指定してください。', 'Pass confirm=true to delete it.', l));
          return textResult(out.join('\n'));
        }
        for (const w of dependents) {
          w.dependsOn = depsOf(w).filter((x) => x !== target.id);
          w.updatedAt = now();
        }
        e.workPackages.splice(packageIndex, 1);
        saveEngagement(e);

        out.push(`# ${label(R.removed, l)}: ${target.name}`);
        out.push('');
        out.push(`- ${label(R.workPackage, l)} \`${target.id}\``);
        if (dependents.length > 0) {
          out.push('');
          out.push(`## ${label(R.warnings, l)}`);
          out.push('');
          for (const i of impacts) out.push(`- ${i}`);
          out.push(
            `- ${msg(
              `依存を外した作業パッケージ: ${dependents.map((w) => `${w.name} (\`${w.id}\`)`).join(', ')}。先行条件を別途確認すること。`,
              `Dependency links removed from: ${dependents.map((w) => `${w.name} (\`${w.id}\`)`).join(', ')}. Re-check what they now wait for.`,
              l,
            )}`,
          );
        }
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。
        return unexpectedErrorResult('remove_roadmap_item', error, l);
      }
    },
  );
}
