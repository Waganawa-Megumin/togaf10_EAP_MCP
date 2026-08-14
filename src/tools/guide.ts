/**
 * ガイド付き体験 / Guided experience tools.
 *
 * この製品の中核。TOGAF の「分厚くて、結局いま何をすればいいか分からない」を潰すための層で、
 * 解説ではなく「次に取る行動」を返すことに徹する。
 *
 *   start_here        … 入口。今いる場所と、今週やる 3 つ
 *   next_best_action  … 状態を診断して、優先度順の具体的な行動
 *   tailor_adm        … 自社版 ADM の設計(削る判断を含む)
 *   explain_for       … 同じ内容を相手に合わせて言い換える型
 *   whats_new_for_me  … 動いたもの / 止まっているもの
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  DELIVERABLES,
  findDeliverable,
  findPhase,
  matchConsultRules,
  matchesKeyword,
  searchKnowledge,
  text,
  type Bilingual,
  type KnowledgeKind,
  type Lang,
} from '../knowledge/index.js';
import {
  summarizeProgress,
  type Assessment,
  type Engagement,
  type PhaseStatus,
} from '../engagement/model.js';
import { loadEngagement } from '../engagement/store.js';
import {
  ACTION_STATUS_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  WORK_PACKAGE_STATUS_LABEL,
} from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';
import { capInline, checkFreeText, echoInput, freeTextSchema, HINTS } from './input-limits.js';

// ---------------------------------------------------------------------------
// 共通ヘルパ / Shared helpers
// ---------------------------------------------------------------------------

/** 表のセルや見出しなど、1 行に収めたい箇所の日英併記(`msg` は改行するので表では使えない) */
function inline(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** Bilingual を 1 行として整形する */
function one(value: Bilingual, lang: Lang): string {
  return text(value, lang);
}

/** 見出しや本文に埋め込む前に改行を潰す(利用者が入れた改行で行が割れるのを防ぐ) */
function flat(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\r?\n/g, ' ').trim();
}

/** 表のセルを壊す文字を無害化する(表の外では `flat` を使う — `\|` が見えてしまうため) */
function cell(value: string | undefined): string {
  if (!value) return '';
  return flat(value).replace(/\|/g, '\\|');
}

/** インラインコード(ツール名)を囲む */
function code(value: string): string {
  return '`' + value + '`';
}

/** 0〜max の値をバーで表す */
function bar(value: number, max: number, width = 20): string {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

/** ISO 文字列からの経過日数(不正な値は null) */
function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * 期限まで残り何日か(過去なら負。読めない値は null)。
 * 期限は YYYY-MM-DD で入る想定だが ISO 日時で保存された記録もあるため、
 * dashboard/markdown.ts と同じく先頭 10 文字を日付として読む。
 */
function daysUntil(due: string | undefined): number | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due.trim().slice(0, 10));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const target = Date.UTC(year, month - 1, day);
  // 2026-13-45 のような値は Date.UTC が繰り上げて別日になるので弾く
  const back = new Date(target);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** 0.5 刻みに丸める(最小 0.5) */
function roundHalf(value: number): number {
  return Math.max(0.5, Math.round(value * 2) / 2);
}

/** 英文の単複を揃える(件数付きの語) */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** 長い文字列を表に入る長さへ丸める */
function clip(value: string, max = 40): string {
  const v = value.trim();
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

/** フェーズの状態を引く(記録が無ければ未着手扱い) */
function phaseStatus(engagement: Engagement, phaseId: string): PhaseStatus {
  return engagement.phases.find((p) => p.phaseId === phaseId)?.status ?? 'not_started';
}

/** 並行して回る Requirements Management を除いた、順序付きのフェーズ列 */
function sequentialPhases(): typeof ADM_PHASES {
  return ADM_PHASES.filter((p) => p.id !== 'requirements-management').sort((a, b) => a.order - b.order);
}

/** 次に進むフェーズ(最後なら undefined) */
function nextPhaseOf(phaseId: string): (typeof ADM_PHASES)[number] | undefined {
  const seq = sequentialPhases();
  const idx = seq.findIndex((p) => p.id === phaseId);
  if (idx < 0) return undefined;
  return seq[idx + 1];
}

/** フェーズ進捗を 1 行の帯にする(状態が一目で分かる視覚要素) */
function phaseStrip(engagement: Engagement, lang: Lang): string {
  const parts = sequentialPhases().map((p) => {
    const st = phaseStatus(engagement, p.id);
    const mark = PHASE_STATUS_ICON[st];
    const current = engagement.currentPhaseId === p.id ? '[' + p.code + ']' : p.code;
    return `${mark}${current}`;
  });
  const rm = phaseStatus(engagement, 'requirements-management');
  const legend = inline(
    '● 完了 / ◐ 進行中 / ○ 未着手 / – 対象外',
    '● done / ◐ in progress / ○ not started / – skipped',
    lang,
  );
  return [
    parts.join('  '),
    `RM ${PHASE_STATUS_ICON[rm]} (${inline('全期間並走', 'runs throughout', lang)})`,
    `*${legend}*`,
  ].join('\n');
}

/** ギャップ分析の記録が案件に残っているか(gap_analysis 自体は保存しないので痕跡で判定する) */
const GAP_HINT = /gap|ギャップ/i;

function hasGapEvidence(engagement: Engagement): boolean {
  if (engagement.notes.some((n) => GAP_HINT.test(n))) return true;
  if (engagement.deliverables.some((d) => GAP_HINT.test(d.name) || GAP_HINT.test(d.note ?? ''))) return true;
  if (engagement.workPackages.some((w) => GAP_HINT.test(w.name) || GAP_HINT.test(w.description ?? ''))) return true;
  if (engagement.decisions.some((d) => GAP_HINT.test(d.title) || GAP_HINT.test(d.context ?? ''))) return true;
  return false;
}

/** 成果物の記録を ID か名前で探す */
function findDeliverableProgress(engagement: Engagement, deliverableId: string, namePattern: RegExp) {
  return engagement.deliverables.find(
    (d) => d.deliverableId === deliverableId || namePattern.test(d.name),
  );
}

/** 知識ベースの種別ごとの参照ツール */
const KIND_TOOL: Record<KnowledgeKind, string> = {
  phase: 'get_adm_phase',
  technique: 'get_technique',
  deliverable: 'get_deliverable',
  glossary: 'get_glossary_term',
};

/** 小数第 1 位まで */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// 変革準備度の読み取り / Transformation readiness
//
// EAP の中核。準備度の評価が案件に残っているなら、着手可否の助言はすべてそこを
// 起点にしなければならない(評価だけ取って無視される、が最も多い失敗)。
// 判定の帯は assess_readiness と同じ閾値(到達度 85 / 60)に揃えてある。
// ---------------------------------------------------------------------------

type ReadinessBand = 'ready' | 'conditional' | 'not_ready';

interface WeakFactor {
  name: string;
  current: number;
  target: number;
  gap: number;
}

interface ReadinessRead {
  assessment: Assessment;
  scale: number;
  avgCurrent: number;
  avgTarget: number;
  /** 目標に対する到達度(%) */
  achievement: number;
  band: ReadinessBand;
  /** ギャップの大きい順(gap > 0 のみ) */
  weak: WeakFactor[];
  /** 変革リスクとして扱うギャップの目安 */
  riskThreshold: number;
  daysOld: number | null;
}

const READINESS_VERDICT: Record<ReadinessBand, Bilingual> = {
  ready: { ja: '着手できる', en: 'Ready to start' },
  conditional: { ja: '条件付きで着手できる', en: 'Can start, with conditions' },
  not_ready: { ja: '着手前に手当てが必要', en: 'Remedies needed before kickoff' },
};

const READINESS_MARK: Record<ReadinessBand, string> = { ready: '●', conditional: '◐', not_ready: '▲' };

/** 案件に残っている最新の変革準備度評価を読む(無ければ null) */
function latestReadiness(engagement: Engagement): ReadinessRead | null {
  const candidates = engagement.assessments.filter(
    (a) => a.kind === 'readiness' && Array.isArray(a.factors) && a.factors.length > 0,
  );
  if (candidates.length === 0) return null;
  // 同じ案件で何度も測り直す前提なので、最も新しいものだけを見る
  const assessment = candidates.reduce((a, b) =>
    (Date.parse(b.assessedAt ?? b.updatedAt) || 0) >= (Date.parse(a.assessedAt ?? a.updatedAt) || 0) ? b : a,
  );
  const scale = assessment.scale > 0 ? assessment.scale : 5;
  const factors = assessment.factors;
  const avgCurrent = factors.reduce((acc, f) => acc + f.current, 0) / factors.length;
  const avgTarget = factors.reduce((acc, f) => acc + f.target, 0) / factors.length;
  const achievement = avgTarget > 0 ? Math.round((avgCurrent / avgTarget) * 100) : 100;
  const band: ReadinessBand = achievement >= 85 ? 'ready' : achievement >= 60 ? 'conditional' : 'not_ready';
  const weak = factors
    .map((f) => ({ name: f.name, current: f.current, target: f.target, gap: f.target - f.current }))
    .filter((f) => f.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.current - b.current);
  return {
    assessment,
    scale,
    avgCurrent,
    avgTarget,
    achievement,
    band,
    weak,
    riskThreshold: Math.max(1, Math.round(scale * 0.3)),
    daysOld: daysSince(assessment.assessedAt ?? assessment.updatedAt),
  };
}

/** 記録から読み取れる変革の大きさ(実態ではなく「記録されている規模」) */
type RecordedSize = 'small' | 'medium' | 'large';

function recordedSize(engagement: Engagement): RecordedSize {
  let s = 0;
  s += engagement.workPackages.length >= 8 ? 2 : engagement.workPackages.length >= 3 ? 1 : 0;
  s += engagement.transitions.length >= 3 ? 2 : engagement.transitions.length >= 1 ? 1 : 0;
  s += engagement.stakeholders.length >= 10 ? 2 : engagement.stakeholders.length >= 5 ? 1 : 0;
  s += engagement.risks.some((r) => r.level === 'critical') ? 1 : 0;
  s += engagement.phases.filter((p) => p.status === 'in_progress' || p.status === 'completed').length >= 5 ? 1 : 0;
  return s >= 5 ? 'large' : s >= 2 ? 'medium' : 'small';
}

/** 準備度の弱点が、リスクとして登録されているか(名前の部分一致で照合する) */
function unregisteredWeakFactors(engagement: Engagement, read: ReadinessRead): WeakFactor[] {
  const haystack = engagement.risks
    .map((r) => `${r.title} ${r.description ?? ''} ${r.mitigation ?? ''}`.toLowerCase())
    .join(' | ');
  return read.weak
    .filter((f) => f.gap >= read.riskThreshold)
    .filter((f) => {
      const name = f.name.trim().toLowerCase();
      if (name.length === 0) return false;
      return !haystack.includes(name);
    });
}

/** 準備度を 1 行に畳む(見出し行・表のセル用) */
function readinessHeadline(read: ReadinessRead, lang: Lang): string {
  return `${READINESS_MARK[read.band]} ${inline('変革準備度', 'Transformation readiness', lang)} ` +
    `**${round1(read.avgCurrent)} / ${round1(read.avgTarget)}**` +
    `(${inline('到達度', 'progress to target', lang)} ${read.achievement}%)` +
    ` — **${one(READINESS_VERDICT[read.band], lang)}**`;
}

/**
 * 「この状態で着手して大丈夫か」に正面から答えるブロック。
 * 記録されている規模で答えを変える — 同じ準備度でも、小さく始めるなら答えは違う。
 */
function renderReadinessBlock(read: ReadinessRead, engagement: Engagement, lang: Lang): string[] {
  const out: string[] = [];
  const size = recordedSize(engagement);
  const wp = engagement.workPackages.length;
  const tr = engagement.transitions.length;

  out.push(`> ${readinessHeadline(read, lang)}`);
  out.push(
    `> \`${bar(read.avgCurrent, read.scale)}\` ${inline('現在', 'now', lang)} ・ ` +
      `\`${bar(read.avgTarget, read.scale)}\` ${inline('目標', 'target', lang)}`,
  );
  const top = read.weak.slice(0, 2);
  if (top.length > 0) {
    const listed = top
      .map((f) => `${flat(f.name)} ${round1(f.current)}→${round1(f.target)}(+${round1(f.gap)})`)
      .join(' / ');
    out.push(`> ${inline('最も低い因子', 'Weakest factors', lang)}: ${listed}`);
  }

  // 着手可否そのものへの回答。規模で言うことを変える
  let answer: Bilingual;
  if (read.band === 'not_ready') {
    answer =
      size === 'large'
        ? {
            ja: `**この規模(作業パッケージ ${wp} 件・移行状態 ${tr} 件)を、この準備度で始めない。** 中間状態で予算か人が止まり、二重運用が固定化する形で失敗する。範囲を削って 1 つ目の移行状態だけに絞るのが、いま取れる唯一の現実解。`,
            en: `**Do not start work at this size (${wp} work packages, ${tr} transition states) from this readiness.** It fails by stalling mid-transition, with dual operation frozen in place. Cutting scope down to the first transition state only is the one realistic move available.`,
          }
        : {
            ja: `**この準備度のまま範囲を広げない。** いま記録されている実行単位は ${wp} 件と小さいので、逆に手はある — この範囲だけで成果を 1 つ出し、それを材料に準備度そのものを上げる順番にする。広げるのはその後。`,
            en: `**Do not widen the scope at this readiness.** Only ${wp} work packages are recorded, which is the opening: deliver one result inside that narrow scope and use it to raise readiness itself. Widen after that, not before.`,
          };
  } else if (read.band === 'conditional') {
    answer = {
      ja: `着手はできる。条件は 1 つ — 上のギャップの大きい因子に**手当てを付けた状態で**始めること。手当てが付かない因子があるなら、その因子が効く範囲を今回のスコープから外す。`,
      en: `You can start. One condition: begin **with a remedy already attached** to the wide-gap factors above. Where no remedy is possible, take the area that factor governs out of this round's scope.`,
    };
  } else {
    answer = {
      ja: `着手できる状態。ただし最低点の因子は変革の途中で必ず表面化するので、監視対象として計画に載せておく。`,
      en: `Ready to start. The lowest-scoring factor still surfaces mid-change, so carry it in the plan as something you watch.`,
    };
  }
  out.push(`> ${flat(one(answer, lang))}`);

  const age =
    read.daysOld === null
      ? ''
      : read.daysOld >= 120
        ? ` ・ ${inline(`${read.daysOld} 日前の評価なので測り直す`, `assessed ${read.daysOld} days ago — re-measure`, lang)}`
        : read.daysOld === 0
          ? ` ・ ${inline('本日', 'today', lang)}`
          : ` ・ ${inline(`${read.daysOld} 日前`, `${read.daysOld}d ago`, lang)}`;
  out.push(
    `> ${inline('出典', 'Source', lang)}: ${flat(read.assessment.title)}${age} ・ ` +
      `${inline('測り直しは', 're-measure with', lang)} ${code('assess_readiness')}`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// 次の一手の算出 / Next-best-action engine
// ---------------------------------------------------------------------------

type Horizon = 'today' | 'week' | 'month';

const HORIZON_DAYS: Record<Horizon, number> = { today: 1, week: 7, month: 30 };

const HORIZON_LABEL: Record<Horizon, Bilingual> = {
  today: { ja: '今日', en: 'Today' },
  week: { ja: '今週', en: 'This week' },
  month: { ja: '今月', en: 'This month' },
};

const HORIZON_LIMIT: Record<Horizon, number> = { today: 3, week: 4, month: 5 };

/** 1 つの推奨行動 */
interface NextAction {
  /** 大きいほど先にやる */
  score: number;
  /** 何をするか(動詞で終える) */
  title: Bilingual;
  /** なぜ今それか */
  why: Bilingual;
  /** 終わったと判断する条件 */
  done: Bilingual;
  /**
   * その作業を**実際に登録・更新できる**ツール。
   * 表示専用ツール(risk_matrix / stakeholder_matrix など)をここに置かない —
   * 「言われたとおり呼んだが登録できなかった」が起きる。
   * どうしても表示専用ツールが本体になる行動(ダッシュボードを出す等)だけ
   * `viewOnly: true` を付け、出力側で「表示専用」と明示する。
   */
  tool: string;
  /**
   * 先に見ておくと判断が速い**表示専用**ツール(任意)。
   * ここに update_engagement のような登録できるツールを置かない —
   * 出力で「下見 = 表示専用・登録できない」と説明しているため、嘘になる。
   */
  support?: string;
  /** tool が表示専用である(登録・更新はできない)ことを明示する */
  viewOnly?: boolean;
}

/**
 * エンゲージメントの状態から推奨行動を作る。
 * 判定は「記録が無い / 埋まっていない / 動いていない」の 3 種類に集約している。
 * 記録が無いものは提案できないので、まず記録させる方向に倒す。
 */
function computeNextActions(engagement: Engagement, horizon: Horizon): NextAction[] {
  const out: NextAction[] = [];
  const window = HORIZON_DAYS[horizon];
  const current = findPhase(engagement.currentPhaseId);
  const currentStatus = phaseStatus(engagement, engagement.currentPhaseId);
  const currentCode = current ? current.code : engagement.currentPhaseId;
  const currentOrder = current ? current.order : 1;

  // --- 0. 変革準備度(評価が残っているなら、着手可否の話が何よりも先) ---
  const readiness = latestReadiness(engagement);
  if (readiness) {
    const worst = readiness.weak[0];
    const size = recordedSize(engagement);
    if (readiness.band === 'not_ready') {
      out.push({
        score: 99,
        title: {
          ja: size === 'large'
            ? `着手範囲を 1 つの移行状態まで削るか、着手を止める判断をする(準備度 ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)})`
            : `準備度を上げる小さな取り組みを 1 つ決めて登録する(準備度 ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)})`,
          en: size === 'large'
            ? `Cut the scope down to a single transition state, or decide to hold (readiness ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)})`
            : `Pick and record one small effort that raises readiness itself (readiness ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)})`,
        },
        why: {
          ja: `保存済みの評価「${clip(readiness.assessment.title, 22)}」の判定は「${one(READINESS_VERDICT.not_ready, 'ja')}」(到達度 ${readiness.achievement}%)。${worst ? `最も低いのは ${clip(worst.name, 16)}(${round1(worst.current)}→${round1(worst.target)})。` : ''}この状態で規模を保ったまま進めると、設計の巧拙に関係なく中間状態で止まる。`,
          en: `The stored assessment "${clip(readiness.assessment.title, 22)}" reads "${one(READINESS_VERDICT.not_ready, 'en').toLowerCase()}" at ${readiness.achievement}% of target.${worst ? ` The weakest factor is ${clip(worst.name, 16)} (${round1(worst.current)}→${round1(worst.target)}).` : ''} Pressing on at full scope stalls mid-transition no matter how good the design is.`,
        },
        done: {
          ja: '削った範囲(または止める判断)が決定事項として登録され、根拠にこの準備度評価が引かれている',
          en: 'The narrowed scope — or the decision to hold — is recorded as a decision, citing this readiness assessment as its rationale',
        },
        tool: 'update_engagement',
        support: 'assess_readiness',
      });
    } else if (readiness.band === 'conditional' && worst) {
      out.push({
        score: 78,
        title: {
          ja: `準備度で最も低い「${clip(worst.name, 20)}」に手当てを 1 つ決める`,
          en: `Decide one remedy for the weakest readiness factor, "${clip(worst.name, 20)}"`,
        },
        why: {
          ja: `判定は「${one(READINESS_VERDICT.conditional, 'ja')}」(到達度 ${readiness.achievement}%)。条件付きの「条件」を書かないまま始めると、条件は無かったことになる。`,
          en: `The verdict is "${one(READINESS_VERDICT.conditional, 'en').toLowerCase()}" at ${readiness.achievement}% of target. Start without writing the condition down and the condition quietly ceases to exist.`,
        },
        done: {
          ja: '手当ての内容・担当・期限が入っている。手当てが付かないなら、その領域がスコープ外だと書かれている',
          en: 'The remedy has content, an owner, and a date — or the area it governs is written down as out of scope',
        },
        tool: 'update_engagement',
        support: 'assess_readiness',
      });
    }
    const unregistered = unregisteredWeakFactors(engagement, readiness);
    if (unregistered.length > 0) {
      out.push({
        score: 72,
        title: {
          ja: `準備度の弱点 ${unregistered.length} 件をリスクとして登録する(例:「${clip(unregistered[0].name, 20)}」)`,
          en: `Record ${plural(unregistered.length, 'readiness shortfall', 'readiness shortfalls')} as risks (e.g. "${clip(unregistered[0].name, 20)}")`,
        },
        why: {
          ja: `ギャップが目安(+${readiness.riskThreshold})を超えているのに、リスク一覧に同じ言葉が見当たらない。準備不足は「そのうち何とかなる」形で放置されるので、リスク台帳に載せた時点で初めて管理対象になる。`,
          en: `The gap exceeds the +${readiness.riskThreshold} threshold, yet nothing in the risk list mentions it. Readiness shortfalls persist on the assumption they sort themselves out; they only become managed once they sit in the risk register.`,
        },
        done: {
          ja: '各因子がリスクとして登録され、レベル・担当・対策が入っている',
          en: 'Each factor is a recorded risk with a level, an owner, and a mitigation',
        },
        tool: 'update_engagement',
        support: 'risk_matrix',
      });
    }
    if (readiness.daysOld !== null && readiness.daysOld >= 120) {
      out.push({
        score: 42,
        title: {
          ja: `${readiness.daysOld} 日前の準備度評価を測り直す`,
          en: `Re-measure readiness — the stored assessment is ${readiness.daysOld} days old`,
        },
        why: {
          ja: '準備度は体制変更・予算見直し・人の入れ替えで簡単に下がる。古い評価を根拠に着手可否を語ると、根拠のほうが先に壊れている。',
          en: 'Readiness drops easily with reorganizations, budget reviews, and turnover. Arguing go/no-go from a stale assessment means the argument broke before the plan did.',
        },
        done: {
          ja: '同じ因子で測り直され、前回との差が見えている',
          en: 'It is re-scored on the same factors and the change since last time is visible',
        },
        tool: 'assess_readiness',
      });
    }
  } else if (
    engagement.workPackages.length > 0 ||
    engagement.transitions.length > 0 ||
    // フェーズ A から始めない案件(B や C を現在フェーズにして開始したもの)でも促す。
    // A 固定にすると、いちばん測るべき「途中から入った案件」で一度も促されない。
    engagement.phases.some((p) => p.status === 'in_progress' || p.status === 'completed')
  ) {
    out.push({
      score: 70,
      title: {
        ja: '変革準備度を 30 分で測る(まだ 1 度も測っていない)',
        en: 'Spend 30 minutes measuring transformation readiness — it has never been measured',
      },
      why: {
        ja: '計画の巧拙より、受け入れ側の準備が足りているかで結果が決まる場面がある。予算・体制・業務部門の受容度は、設計では解けない。先に測れば、範囲を削る判断が根拠つきでできる。',
        en: 'Outcomes often hinge less on plan quality than on whether the receiving side is ready. Funding, organization, and business acceptance cannot be solved by design. Measure first and scope cuts become defensible.',
      },
      done: {
        ja: '因子ごとの現在/目標が入り、save=true で案件に保存されている',
        en: 'Each factor has a current and target score and the result is saved to the engagement with save=true',
      },
      tool: 'assess_readiness',
    });
  }

  // --- 1. 期限超過のアクション(何を差し置いても先) ---
  const openActions = engagement.actions.filter((a) => a.status !== 'done');
  const overdue = openActions
    .map((a) => ({ action: a, left: daysUntil(a.due) }))
    .filter((x): x is { action: (typeof openActions)[number]; left: number } => x.left !== null && x.left < 0)
    .sort((a, b) => a.left - b.left);
  if (overdue.length > 0) {
    const worst = overdue[0];
    const rest = overdue.length - 1;
    out.push({
      score: 100,
      title: {
        ja: `期限超過「${clip(worst.action.title, 30)}」${rest > 0 ? `ほか ${rest} 件` : ''}を片付けるか、期限を引き直す`,
        en: `Clear the overdue action "${clip(worst.action.title, 30)}"${rest > 0 ? ` and ${rest} more` : ''}, or reset its due date`,
      },
      why: {
        ja: `最長 ${Math.abs(worst.left)} 日超過。期限切れを放置した瞬間から、この案件の期限は誰にも信じられなくなる。`,
        en: `The worst is ${Math.abs(worst.left)} days past due. Once a missed date is left standing, no date on this engagement is believed again.`,
      },
      done: {
        ja: '全件が done になっているか、担当と新しい期限が入っている',
        en: 'Every overdue item is either done or carries a new owner and date',
      },
      tool: 'update_engagement',
    });
  }

  // --- 2. ブロック中のアクション ---
  const blocked = openActions.filter((a) => a.status === 'blocked');
  if (blocked.length > 0) {
    out.push({
      score: 94,
      title: {
        ja: `ブロック中の ${blocked.length} 件について、外す人を名指しで決める`,
        en: `Name the person who can unblock each of the ${plural(blocked.length, 'blocked action', 'blocked actions')}`,
      },
      why: {
        ja: 'ブロックは待っていても外れない。外せる人が特定されていないブロックは、実質「中止」と同じ。',
        en: 'Blocked work does not unblock itself. A blocker with no named remover is a cancellation in disguise.',
      },
      done: {
        ja: '各ブロックに「誰が」「いつまでに」外すかが書かれている',
        en: 'Each blocker records who removes it and by when',
      },
      tool: 'update_engagement',
    });
  }

  // --- 3. ステークホルダー ---
  if (engagement.stakeholders.length === 0) {
    out.push({
      score: 96,
      title: {
        ja: 'ステークホルダーを 5〜10 名洗い出して登録する',
        en: 'Identify and record 5-10 stakeholders',
      },
      why: {
        ja: '合意形成のすべてがここに乗る。誰の承認で進むのか決まっていない状態で作った成果物は、後から全部やり直しになる。',
        en: 'Every agreement rides on this list. Anything produced before you know whose approval matters gets redone later.',
      },
      done: {
        ja: '各人の影響力・関心度・関心事が 1 行ずつ埋まっている',
        en: 'Each person has influence, interest, and concerns filled in',
      },
      tool: 'update_engagement',
    });
  } else {
    const highInfluence = engagement.stakeholders.filter((s) => s.influence === 'high');
    if (highInfluence.length === 0) {
      out.push({
        score: 92,
        title: {
          ja: '決裁権を持つスポンサーを 1 名確保して登録する',
          en: 'Secure one sponsor with decision authority and record them',
        },
        why: {
          ja: '影響力 high の関係者が 0 件。予算と優先順位を動かせる人がいない案件は、途中で必ず止まる。',
          en: 'No high-influence stakeholder is recorded. An engagement with nobody who can move budget or priority stalls partway through.',
        },
        done: {
          ja: 'スポンサーの名前・関心事・関与方針が登録されている',
          en: 'A sponsor is recorded with their concerns and how you will engage them',
        },
        tool: 'update_engagement',
      });
    }
    const unattended = highInfluence.filter((s) => !s.approach || s.concerns.length === 0);
    if (unattended.length > 0) {
      out.push({
        score: 66,
        title: {
          ja: `影響力の高い ${unattended.length} 名に、関心事と関与方針を 1 行ずつ入れる`,
          en: `Fill in concerns and an engagement approach for ${plural(unattended.length, 'high-influence stakeholder', 'high-influence stakeholders')}`,
        },
        why: {
          ja: '関心事が書けていない相手は、まだ話を聞けていない相手。反対は最後の会議で出る。',
          en: 'A stakeholder with no recorded concern is one you have not actually talked to. Their objection surfaces in the final meeting.',
        },
        done: {
          ja: '本人の言葉で関心事が書かれ、関与の頻度と手段が決まっている',
          en: 'Concerns are captured in their own words, with a cadence and channel for engagement',
        },
        tool: 'update_engagement',
        support: 'stakeholder_matrix',
      });
    }
  }

  // --- 4. 現在フェーズの状態 ---
  if (!current) {
    // 知識ベースに無い ID を指している。進捗率も以降の判定もここを起点にしているので最優先で直す
    out.push({
      score: 98,
      title: {
        ja: `現在フェーズの ID「${clip(engagement.currentPhaseId, 24)}」が実在しない。実在するフェーズに指し直す`,
        en: `The current phase id "${clip(engagement.currentPhaseId, 24)}" does not exist — point it at a real phase`,
      },
      why: {
        ja: '進捗率もこのツールが返す助言も、現在フェーズを起点に組み立てている。ここがずれている間はどちらも当てにならない。',
        en: 'Both the progress figure and every recommendation here are built from the current phase. While it points nowhere, neither can be trusted.',
      },
      done: {
        ja: `currentPhaseId が実在するフェーズ ID になっている(一覧は ${code('list_adm_phases')})`,
        en: `currentPhaseId holds a real phase id (list them with ${code('list_adm_phases')})`,
      },
      tool: 'update_engagement',
    });
  } else if (currentStatus === 'not_started') {
    out.push({
      score: 90,
      title: {
        ja: `フェーズ ${currentCode} を開始し、今回の到達点を 1 行で書く`,
        en: `Start phase ${currentCode} and write its finish line in one sentence`,
      },
      why: {
        ja: '現在フェーズが未着手のまま。着手日と到達点が無いフェーズは、進んでいるのか判断できない。',
        en: 'The current phase is still not started. Without a start date and a finish line, nobody can tell whether it is progressing.',
      },
      done: {
        ja: 'フェーズが in_progress になり、備考に到達点が書かれている',
        en: 'The phase is in_progress and its note states the finish line',
      },
      tool: 'update_engagement',
    });
  } else if (currentStatus === 'skipped') {
    out.push({
      score: 88,
      title: {
        ja: '注力するフェーズを選び直す(現在フェーズが対象外になっている)',
        en: 'Pick a different phase to focus on — the current one is marked skipped',
      },
      why: {
        ja: '対象外にしたフェーズを現在フェーズにしたままだと、進捗も次の一手も意味を持たない。',
        en: 'Pointing at a skipped phase makes both the progress figure and every recommendation meaningless.',
      },
      done: {
        ja: 'currentPhaseId が実際に作業するフェーズを指している',
        en: 'currentPhaseId points at a phase you are actually working on',
      },
      tool: 'update_engagement',
    });
  } else if (currentStatus === 'completed') {
    const next = nextPhaseOf(engagement.currentPhaseId);
    out.push({
      score: 64,
      title: {
        ja: next
          ? `フェーズ ${next.code} へ移す判断をする(${currentCode} は完了済み)`
          : `全フェーズを回し終えた。次サイクルの起点を決める`,
        en: next
          ? `Decide to move into phase ${next.code} — ${currentCode} is already complete`
          : 'The cycle is complete. Decide where the next one starts',
      },
      why: {
        ja: '完了したフェーズに留まっている間、案件は止まって見える。移るか、意図して止めるかを明示する。',
        en: 'While you sit on a completed phase the engagement looks stalled. Either move on, or say out loud that you are pausing.',
      },
      done: {
        ja: '次フェーズが in_progress になっている、または停止の理由が決定事項として残っている',
        en: 'The next phase is in_progress, or the pause is recorded as a decision',
      },
      tool: 'update_engagement',
    });
  }

  // --- 5. 重いリスクの空欄 ---
  const liveRisks = engagement.risks.filter((r) => r.status === 'open' || r.status === 'mitigating');
  const heavyThin = liveRisks.filter(
    (r) => (r.level === 'critical' || r.level === 'high') && (!r.owner || !r.mitigation),
  );
  if (heavyThin.length > 0) {
    out.push({
      score: 84,
      title: {
        ja: `重大リスク ${heavyThin.length} 件に、担当と緩和策を入れる(例:「${clip(heavyThin[0].title, 24)}」)`,
        en: `Add an owner and a mitigation to ${plural(heavyThin.length, 'severe risk', 'severe risks')} (e.g. "${clip(heavyThin[0].title, 24)}")`,
      },
      why: {
        ja: '担当か対策の欄が空いた重大リスクは、記録されているだけで管理はされていない。監査でもレビューでも最初に突かれる。',
        en: 'A severe risk missing an owner or a mitigation is recorded but not managed. It is the first thing any review picks at.',
      },
      done: {
        ja: '全件に担当者名と、いつまでに何をするかが入っている',
        en: 'Every one names an owner and states what happens by when',
      },
      tool: 'update_engagement',
      support: 'risk_matrix',
    });
  }
  if (engagement.risks.length === 0 && currentOrder >= 1) {
    out.push({
      score: 50,
      title: {
        ja: 'リスクを 3 件書き出す(まだ 1 件も記録が無い)',
        en: 'Write down three risks — none are recorded yet',
      },
      why: {
        ja: 'リスクゼロの案件は存在しない。書けていないのは、まだ見ていないだけ。',
        en: 'No engagement has zero risks. An empty list means nobody has looked yet.',
      },
      done: {
        ja: '3 件それぞれにレベルと担当が入っている',
        en: 'Three risks are recorded, each with a level and an owner',
      },
      tool: 'update_engagement',
    });
  }

  // --- 6. フェーズ A 完了なのにビジョンが承認されていない ---
  if (phaseStatus(engagement, 'a') === 'completed') {
    const vision = findDeliverableProgress(engagement, 'architecture-vision', /vision|ビジョン/i);
    if (!vision) {
      out.push({
        score: 82,
        title: {
          ja: 'Architecture Vision を成果物として登録し、承認状態を記録する',
          en: 'Record the Architecture Vision as a deliverable and track its approval',
        },
        why: {
          ja: 'フェーズ A を完了扱いにしているのに、合意の証跡が残っていない。後続フェーズの前提が宙に浮く。',
          en: 'Phase A is marked complete but no evidence of agreement exists, leaving every later phase resting on nothing.',
        },
        done: {
          ja: '成果物として登録され、保管先と承認者が入っている',
          en: 'It is recorded with a location and an approver',
        },
        tool: 'update_engagement',
      });
    } else if (vision.status !== 'approved' && vision.status !== 'baselined') {
      out.push({
        score: 80,
        title: {
          ja: 'Architecture Vision の承認を取り切る(スポンサーの署名まで)',
          en: 'Get the Architecture Vision signed off by the sponsor',
        },
        why: {
          ja: `未承認のまま(現在: ${vision.status})。ここで合意していない範囲は、フェーズ B 以降の作業がすべて空振りになる。`,
          en: `It is still unapproved (currently ${vision.status}). Anything not agreed here makes the work in Phase B onward wasted effort.`,
        },
        done: {
          ja: '状態が approved になり、承認者と日付が残っている',
          en: 'Status is approved, with the approver and date recorded',
        },
        tool: 'update_engagement',
      });
    }
  }

  // --- 7. B/C/D 進行中なのにギャップの記録が無い ---
  const domainActive = (['b', 'c', 'd'] as const).filter((id) => phaseStatus(engagement, id) === 'in_progress');
  if (domainActive.length > 0 && !hasGapEvidence(engagement)) {
    out.push({
      score: 76,
      title: {
        ja: `フェーズ ${domainActive.map((x) => x.toUpperCase()).join('/')} のギャップ分析を 1 回通す`,
        en: `Run a gap analysis for phase ${domainActive.map((x) => x.toUpperCase()).join('/')}`,
      },
      why: {
        ja: 'アーキテクチャ記述だけあってギャップが無いと、作業パッケージが作れない。現状と目標の差こそが計画の材料。',
        en: 'Descriptions without gaps produce no work packages. The difference between today and the target is the raw material of the plan.',
      },
      done: {
        ja: '新規・廃止・改修の 3 分類でギャップが列挙され、案件のメモか成果物に残っている',
        en: 'Gaps are listed as new, eliminated, and modified, and recorded on the engagement',
      },
      // gap_analysis は save=true で案件に書ける。下見は付けない
      // (update_engagement は登録できるツールなので「下見」枠に置くと説明と矛盾する)
      tool: 'gap_analysis',
    });
  }

  // --- 8. E/F なのに作業パッケージが無い ---
  const planningActive = (['e', 'f'] as const).some((id) => {
    const st = phaseStatus(engagement, id);
    return st === 'in_progress' || st === 'completed';
  });
  if (planningActive && engagement.workPackages.length === 0) {
    out.push({
      score: 86,
      title: {
        ja: '作業パッケージを 5〜8 個に束ねて登録する',
        en: 'Group the work into 5-8 work packages and record them',
      },
      why: {
        ja: 'フェーズ E/F に入っているのに実行単位が 0 件。この状態のロードマップは、線が引いてあるだけで誰も動けない。',
        en: 'You are in phase E/F with zero units of execution. A roadmap in that state is a set of bars nobody can act on.',
      },
      done: {
        ja: '各パッケージに担当 1 名・成果 1 つ・便益 1 つが付いている',
        en: 'Each package has one owner, one outcome, and one benefit',
      },
      tool: 'add_work_package',
    });
  }

  // --- 9. 単独で止まれない移行状態 ---
  const fragile = engagement.transitions.filter((t) => t.standalone === false);
  if (fragile.length > 0) {
    out.push({
      score: 74,
      title: {
        ja: `単独稼働できない移行状態 ${fragile.length} 件を切り直す(例:「${clip(fragile[0].name, 24)}」)`,
        en: `Re-cut ${plural(fragile.length, 'transition state', 'transition states')} that cannot stand alone (e.g. "${clip(fragile[0].name, 24)}")`,
      },
      why: {
        ja: 'そこで予算が止まったら事業が回らない中間状態は、実質「引き返せない一本道」。分割し直すか、止まらない前提を明文化する。',
        en: 'An intermediate state the business cannot live in is a one-way road with no exit. Split it, or write down explicitly why funding cannot stop there.',
      },
      done: {
        ja: '各移行状態が単独稼働可になっている、または止まれない理由と回避策が記録されている',
        en: 'Each state either stands alone, or records why it cannot and what covers that',
      },
      tool: 'add_transition_state',
      support: 'get_roadmap',
    });
  }

  // --- 10. 作業パッケージの空欄 ---
  const thinPackages = engagement.workPackages.filter(
    (w) => (w.status === 'planned' || w.status === 'in_progress' || w.status === 'proposed') && (!w.owner || !w.benefit),
  );
  if (thinPackages.length > 0) {
    out.push({
      score: 58,
      title: {
        ja: `作業パッケージ ${thinPackages.length} 件に、担当と便益(誰が刈り取るか)を入れる`,
        en: `Add an owner and a benefit owner to ${plural(thinPackages.length, 'work package', 'work packages')}`,
      },
      why: {
        ja: '便益の刈り取り責任者がいない投資は、完了報告だけ出て効果測定が行われない。',
        en: 'An investment with no benefit owner produces a completion report and no measured effect.',
      },
      done: {
        ja: '全件に担当・便益・便益責任者が入っている',
        en: 'Every package names an owner, a benefit, and who is accountable for realising it',
      },
      tool: 'add_work_package',
      support: 'prioritize_work_packages',
    });
  }

  // --- 11. レビューで止まっている成果物 ---
  const stuckReview = engagement.deliverables
    .filter((d) => d.status === 'review')
    .map((d) => ({ d, days: daysSince(d.updatedAt) ?? 0 }))
    .filter((x) => x.days >= 10)
    .sort((a, b) => b.days - a.days);
  if (stuckReview.length > 0) {
    out.push({
      score: 62,
      title: {
        ja: `レビュー中で ${stuckReview[0].days} 日動いていない「${clip(stuckReview[0].d.name, 24)}」を閉じる`,
        en: `Close out "${clip(stuckReview[0].d.name, 24)}", stuck in review for ${stuckReview[0].days} days`,
      },
      why: {
        ja: 'レビュー滞留は指摘が多いからではなく、判断する場が設定されていないから起きる。会議を 1 本入れれば大半は終わる。',
        en: 'Reviews stall not because of the volume of comments but because no forum is scheduled to decide. One meeting usually clears it.',
      },
      done: {
        ja: '承認済みになっている、または「条件付き承認+条件の期限」が記録されている',
        en: 'It is approved, or conditionally approved with the condition and its date recorded',
      },
      tool: 'update_engagement',
      support: 'generate_review_checklist',
    });
  }

  // --- 12. 期間内に期限が来るアクション ---
  const dueSoon = openActions
    .map((a) => ({ a, left: daysUntil(a.due) }))
    .filter((x): x is { a: (typeof openActions)[number]; left: number } => x.left !== null && x.left >= 0 && x.left <= window);
  if (dueSoon.length > 0) {
    out.push({
      score: 56,
      title: {
        ja: `${one(HORIZON_LABEL[horizon], 'ja')}が期限のアクション ${dueSoon.length} 件を進める`,
        en: `Work the ${plural(dueSoon.length, 'action', 'actions')} due within ${plural(window, 'day', 'days')}`,
      },
      why: {
        ja: `期限が ${window} 日以内。ここを落とすと来週の「期限超過」に変わる。`,
        en: `They come due within ${plural(window, 'day', 'days')}. Missing them converts them into next week's overdue list.`,
      },
      done: {
        ja: '全件が done か in_progress で、遅れるものは期限が引き直されている',
        en: 'All are done or in progress, and anything slipping has a reset date',
      },
      tool: 'update_engagement',
    });
  }

  // --- 13. 決定事項が残っていない ---
  if (engagement.decisions.length === 0 && currentOrder >= 2) {
    out.push({
      score: 44,
      title: {
        ja: 'ここまでに決めたことを 3 件、決定事項として書き残す',
        en: 'Write down three decisions you have already made',
      },
      why: {
        ja: '決定が残っていないと、半年後に同じ議論をやり直すことになる。記録されるのは決定内容より「根拠」。',
        en: 'Undocumented decisions get re-argued in six months. What matters in the record is the rationale, not the choice.',
      },
      done: {
        ja: '各決定に背景・決定内容・根拠・決定者が入っている',
        en: 'Each decision records context, the choice, the rationale, and who decided',
      },
      tool: 'update_engagement',
    });
  }

  // --- 14. フェーズ G/H 固有 ---
  if (phaseStatus(engagement, 'g') === 'in_progress') {
    const contract = findDeliverableProgress(engagement, 'architecture-contract', /contract|契約/i);
    if (!contract) {
      out.push({
        score: 60,
        title: {
          ja: '実装側と守る内容(逸脱時の扱いを含む)を 1 枚に合意する',
          en: 'Agree one page with the delivery team on what must hold, including how deviations are handled',
        },
        why: {
          ja: 'フェーズ G の実効性は「逸脱をどう扱うか」で決まる。禁止だけ書いた規約は黙って破られる。',
          en: 'Phase G lives or dies on how deviations are handled. A rulebook that only forbids gets quietly ignored.',
        },
        done: {
          ja: '守る項目・例外申請の手順・承認者が書かれ、実装側が読んでいる',
          en: 'The constraints, the exception path, and the approver are written down and read by the delivery team',
        },
        // 雛形生成は表示専用。合意した契約を案件に残せるのは update_engagement 側
        tool: 'update_engagement',
        support: 'generate_deliverable_template',
      });
    }
  }
  if (phaseStatus(engagement, 'h') === 'in_progress') {
    out.push({
      score: 52,
      title: {
        ja: '変更要求の受け口と、次サイクルへ送る基準を決める',
        en: 'Define where change requests land and what gets pushed to the next cycle',
      },
      why: {
        ja: 'フェーズ H で決めるのは「変更を止める方法」ではなく「変更を捌く順路」。入口が無いと現場が勝手に変える。',
        en: 'Phase H is about routing change, not stopping it. With no intake, teams change things on their own anyway.',
      },
      done: {
        ja: '受付窓口・分類基準・次サイクル送りの判断者が決まっている',
        en: 'The intake point, the classification rule, and who defers items are all decided',
      },
      tool: 'update_engagement',
    });
  }

  // --- 15. 全体が健全なときの底上げ ---
  const stale = daysSince(engagement.updatedAt);
  if (stale !== null && stale >= 14) {
    out.push({
      score: 68,
      title: {
        ja: `${stale} 日更新が止まっている案件記録を、30 分で現状に合わせる`,
        en: `Spend 30 minutes bringing the record — untouched for ${stale} days — back in line with reality`,
      },
      why: {
        ja: '記録と実態がずれた瞬間、このダッシュボードは誰も見なくなる。ずれは戻すより広がる方が速い。',
        en: 'The moment the record diverges from reality, nobody looks at the dashboard again. Divergence widens faster than it closes.',
      },
      done: {
        ja: 'フェーズ状態・アクション・リスクが今週の実態と一致している',
        en: 'Phase statuses, actions, and risks match what is actually true this week',
      },
      tool: 'update_engagement',
      support: 'check_engagement_health',
    });
  }
  out.push({
    score: 26,
    title: {
      ja: '健全性チェックを 1 回かけて、抜けを潰す',
      en: 'Run one health check and close the holes it finds',
    },
    why: {
      ja: '大きな問題は見えているが、空欄は見えない。空欄を機械に探させる。',
      en: 'Big problems are visible; empty fields are not. Let the machine find the empty fields.',
    },
    done: { ja: '重大度「高」の指摘が 0 件', en: 'No high-severity findings remain' },
    // 診断そのものは表示専用。潰した結果を残すのは update_engagement
    tool: 'check_engagement_health',
    viewOnly: true,
  });
  out.push({
    score: 22,
    title: {
      ja: 'ダッシュボードを 1 枚出して、スポンサーに共有する',
      en: 'Publish the dashboard and share it with the sponsor',
    },
    why: {
      ja: '進捗は聞かれてから出すと弁明になる。先に出せば材料になる。',
      en: 'Progress reported on request reads as an excuse; progress reported first reads as evidence.',
    },
    done: { ja: '共有済みで、次に見る日が決まっている', en: 'It is shared and the next review date is set' },
    tool: 'open_dashboard',
    support: 'get_dashboard',
    viewOnly: true,
  });

  return out.sort((a, b) => b.score - a.score);
}

/** 推奨行動を表に整形する */
function renderActions(actions: NextAction[], lang: Lang, horizon: Horizon): string[] {
  const out: string[] = [];
  out.push(
    `| # | ${inline('やること', 'Do this', lang)} | ${inline('なぜ今か', 'Why now', lang)} | ${inline('終わりの判定', 'Done when', lang)} | ${inline('登録・更新するツール', 'Tool that does it', lang)} |`,
  );
  out.push('| :-: | --- | --- | --- | --- |');
  actions.forEach((a, i) => {
    const head = a.viewOnly
      ? `${code(a.tool)}${inline('(表示専用)', ' (view only)', lang)}`
      : code(a.tool);
    const tools = a.support ? `${head}<br>${inline('下見', 'look first', lang)}: ${code(a.support)}` : head;
    out.push(
      `| ${i + 1} | **${cell(one(a.title, lang))}** | ${cell(one(a.why, lang))} | ${cell(one(a.done, lang))} | ${tools} |`,
    );
  });
  out.push('');
  // 「言われたとおり呼んだら表示専用だった」を潰すための明示
  if (actions.length > 0) {
    out.push(
      msg(
        '右端は**その作業を実際に登録・更新できる**ツール。「下見」は先に見ると判断が速い表示用ツールで、そこからは登録できない。「(表示専用)」が付いた行だけは本体も表示用で、結果を残すには `update_engagement` を続けて呼ぶ。',
        'The right column is the tool that actually **records or updates** the work. "Look first" names a read-only view worth checking beforehand — nothing can be recorded from it. Rows marked "(view only)" are the exception: the tool only shows, so follow it with `update_engagement` to record the outcome.',
        lang,
      ),
    );
    out.push('');
  }
  const first = actions[0];
  if (first) {
    out.push(
      msg(
        `**最初の一手**: ${flat(one(first.title, 'ja'))} → ${code(first.tool)} を呼ぶ(${one(HORIZON_LABEL[horizon], 'ja')}中)。`,
        `**Start here**: ${flat(one(first.title, 'en'))} — call ${code(first.tool)} (${one(HORIZON_LABEL[horizon], 'en').toLowerCase()}).`,
        lang,
      ),
    );
    out.push('');
  }
  return out;
}

// ---------------------------------------------------------------------------
// 目的 × 案件の突き合わせ / Reconciling a stated goal against the recorded state
//
// 「目的を渡したのに出力が変わらない」を潰すための層。
// 目的の語からレンズを選び、そのレンズが要求するものを案件の実データに問い合わせる。
// 出力は「その目的なら、いまの状態で足りないのはこれ」に限定する。
// ---------------------------------------------------------------------------

type FitLevel = 'ok' | 'thin' | 'missing';

const FIT_MARK: Record<FitLevel, string> = { ok: '●', thin: '◐', missing: '○' };

const FIT_LABEL: Record<FitLevel, Bilingual> = {
  ok: { ja: '足りている', en: 'in place' },
  thin: { ja: '薄い', en: 'thin' },
  missing: { ja: '無い', en: 'missing' },
};

interface FitResult {
  level: FitLevel;
  /** いまの状態(実データを引用する) */
  state: Bilingual;
  /** 足りないなら何をするか */
  fix: Bilingual;
  tool: string;
}

interface GoalCheck {
  /** その目的に必要なもの */
  need: Bilingual;
  evaluate: (engagement: Engagement) => FitResult;
}

interface GoalLens {
  id: string;
  /** 目的の記述に含まれていたらこのレンズを使う語 */
  keywords: string[];
  label: Bilingual;
  checks: GoalCheck[];
}

/** 決裁権を持つ関係者(影響力 high) */
function decisionMakers(engagement: Engagement) {
  return engagement.stakeholders.filter((s) => s.influence === 'high');
}

const LENS_APPROVAL: GoalLens = {
  id: 'approval',
  keywords: [
    '承認', '決裁', '稟議', '予算', '投資委員会', '経営会議', '取締役会', 'ゴーサイン', '合意を取', '再開',
    'approval', 'approve', 'budget', 'funding', 'steering', 'board', 'sign-off', 'signoff', 'green light',
  ],
  label: { ja: '承認・予算を取りに行く目的', en: 'Getting an approval or funding' },
  checks: [
    {
      need: { ja: '決裁できる人が特定され、関与方針まで書けている', en: 'Someone who can decide, with an engagement approach written down' },
      evaluate: (e) => {
        const high = decisionMakers(e);
        if (high.length === 0) {
          return {
            level: 'missing',
            state: { ja: '影響力 high の関係者が 0 名', en: 'No high-influence stakeholder recorded' },
            fix: { ja: '予算と優先順位を動かせる人を 1 名、関心事つきで登録する', en: 'Record one person who can move budget and priority, with their concerns' },
            tool: 'update_engagement',
          };
        }
        const ready = high.filter((s) => s.approach && s.concerns.length > 0);
        if (ready.length === 0) {
          return {
            level: 'thin',
            state: {
              ja: `${high.length} 名いるが、関心事と関与方針が両方入っているのは 0 名(例: ${clip(high[0].name, 18)})`,
              en: `${high.length} recorded, but none has both concerns and an approach (e.g. ${clip(high[0].name, 18)})`,
            },
            fix: { ja: '承認を出す側が何を心配しているのかを本人の言葉で 1 行入れる', en: 'Capture, in their own words, what the approver is worried about' },
            tool: 'update_engagement',
          };
        }
        return {
          level: 'ok',
          state: {
            ja: ready.length === 1
              ? `${clip(ready[0].name, 18)} に関心事と関与方針あり`
              : `${clip(ready[0].name, 18)} ほか ${ready.length - 1} 名に関心事と関与方針あり`,
            en: `${plural(ready.length, 'decision-maker carries', 'decision-makers carry')} concerns and an approach (e.g. ${clip(ready[0].name, 18)})`,
          },
          fix: { ja: '当日の議題を、その関心事の順に並べ替える', en: 'Reorder the agenda to follow those concerns' },
          tool: 'explain_for',
        };
      },
    },
    {
      need: { ja: '金額の桁が言える(投資の規模)', en: 'You can state the order of magnitude of the investment' },
      evaluate: (e) => {
        const priced = e.workPackages.filter((w) => w.costEstimate && w.costEstimate.trim().length > 0);
        if (e.workPackages.length === 0) {
          return {
            level: 'missing',
            state: { ja: '作業パッケージが 0 件なので、金額の根拠が積み上がっていない', en: 'Zero work packages, so there is nothing to build a number from' },
            fix: { ja: '実行単位を 5〜8 個に束ね、それぞれに概算を入れる', en: 'Group the work into 5-8 packages and put a rough number on each' },
            tool: 'add_work_package',
          };
        }
        if (priced.length === 0) {
          return {
            level: 'thin',
            state: { ja: `作業パッケージ ${e.workPackages.length} 件のうち、概算費用が入っているのは 0 件`, en: `None of the ${e.workPackages.length} work packages carries a cost estimate` },
            fix: { ja: '桁が合っていればよい。幅つき(例: 2〜3 億)で入れる', en: 'The order of magnitude is enough — record it as a range' },
            tool: 'add_work_package',
          };
        }
        return {
          level: 'ok',
          state: { ja: `${priced.length}/${e.workPackages.length} 件に概算あり(例: ${clip(priced[0].costEstimate ?? '', 18)})`, en: `${priced.length}/${e.workPackages.length} packages priced (e.g. ${clip(priced[0].costEstimate ?? '', 18)})` },
          fix: { ja: '見積の幅と、外したときの振れ幅を添える', en: 'Add the range and how far the number could be off' },
          tool: 'prioritize_work_packages',
        };
      },
    },
    {
      need: { ja: '着手して大丈夫かに答えられる(変革準備度)', en: 'You can answer whether it is safe to start (readiness)' },
      evaluate: (e) => {
        const r = latestReadiness(e);
        if (!r) {
          return {
            level: 'missing',
            state: { ja: '準備度の評価が無い', en: 'No readiness assessment on record' },
            fix: { ja: '30 分で測る。承認の場で必ず聞かれるのはここ', en: 'Measure it in 30 minutes — this is what the room will ask about' },
            tool: 'assess_readiness',
          };
        }
        if (r.band === 'not_ready') {
          return {
            level: 'thin',
            state: { ja: `測ってある(到達度 ${r.achievement}%)が、判定は「${one(READINESS_VERDICT.not_ready, 'ja')}」`, en: `Measured at ${r.achievement}% of target — the verdict is "${one(READINESS_VERDICT.not_ready, 'en').toLowerCase()}"` },
            fix: { ja: '承認を取りに行くなら、範囲を削った案を一緒に出す。この数字は隠すより先に出したほうが通る', en: 'If you go for approval, bring a narrowed option with you. This number lands better volunteered than discovered' },
            tool: 'update_engagement',
          };
        }
        return {
          level: 'ok',
          state: { ja: `到達度 ${r.achievement}% — 判定「${one(READINESS_VERDICT[r.band], 'ja')}」`, en: `${r.achievement}% of target — "${one(READINESS_VERDICT[r.band], 'en').toLowerCase()}"` },
          fix: { ja: '最低点の因子を「監視対象」として資料に 1 行残す', en: 'Carry the weakest factor into the pack as one line of watch-list' },
          tool: 'explain_for',
        };
      },
    },
  ],
};

const LENS_DEADLINE: GoalLens = {
  id: 'deadline',
  keywords: [
    '期限', '年度内', '今期', '来月', '来週', '納期', '間に合', 'いつまで', 'スケジュール', '遅れ', '遅延',
    'deadline', 'schedule', 'on time', 'by q', 'timeline', 'slip', 'delay',
  ],
  label: { ja: '期限に間に合わせる目的', en: 'Hitting a date' },
  checks: [
    {
      need: { ja: '期限超過が 0 件(超過を放置していない)', en: 'Nothing is overdue' },
      evaluate: (e) => {
        const open = e.actions.filter((a) => a.status !== 'done');
        const overdue = open.filter((a) => {
          const left = daysUntil(a.due);
          return left !== null && left < 0;
        });
        if (overdue.length === 0) {
          return {
            level: open.length === 0 ? 'thin' : 'ok',
            state: open.length === 0
              ? { ja: '未完了アクションが 0 件。期限で管理できる形になっていない', en: 'No open actions at all — there is nothing here a date can govern' }
              : { ja: `未完了 ${open.length} 件、いずれも期限内`, en: `${open.length} open, none overdue` },
            fix: open.length === 0
              ? { ja: '今週動かす作業を 3 件、担当と期限つきで入れる', en: 'Add three items you move this week, each with an owner and a date' }
              : { ja: '次の期限に一番近いものから片付ける', en: 'Work the nearest date first' },
            tool: 'update_engagement',
          };
        }
        const worst = overdue
          .map((a) => ({ a, left: daysUntil(a.due) ?? 0 }))
          .sort((x, y) => x.left - y.left)[0];
        return {
          level: 'missing',
          state: { ja: `${overdue.length} 件超過(最長 ${Math.abs(worst.left)} 日:「${clip(worst.a.title, 20)}」)`, en: `${overdue.length} overdue, worst by ${Math.abs(worst.left)} days ("${clip(worst.a.title, 20)}")` },
          fix: { ja: '片付けるか期限を引き直す。超過を残したまま新しい期限を約束しても信用されない', en: 'Clear them or reset the dates. A new promise made over an unresolved miss is not believed' },
          tool: 'update_engagement',
        };
      },
    },
    {
      need: { ja: '到達点に時期が入っている(移行状態の目標時期)', en: 'The milestones carry dates' },
      evaluate: (e) => {
        if (e.transitions.length === 0) {
          return {
            level: 'missing',
            state: { ja: '移行状態が 0 件。期限の前にどこまで行くのかが決まっていない', en: 'No transition states — there is no agreed "how far by then"' },
            fix: { ja: '期限までに到達する中間状態を 1 つ置き、単独稼働できるか確認する', en: 'Place one intermediate state reachable by the date and check it can stand alone' },
            tool: 'add_transition_state',
          };
        }
        const dated = e.transitions.filter((t) => t.targetQuarter && t.targetQuarter.trim().length > 0);
        if (dated.length < e.transitions.length) {
          return {
            level: 'thin',
            state: { ja: `${e.transitions.length} 件中 ${dated.length} 件にしか目標時期が入っていない`, en: `Only ${dated.length} of ${e.transitions.length} transition states carry a target quarter` },
            fix: { ja: '四半期表記(YYYY-Qn)で入れる。時期の書けない到達点は、まだ計画ではない', en: 'Record it as YYYY-Qn. A milestone with no date is not yet a plan' },
            tool: 'add_transition_state',
          };
        }
        return {
          level: 'ok',
          state: { ja: `${dated.length} 件すべてに目標時期あり`, en: `All ${dated.length} transition states are dated` },
          fix: { ja: '依存関係の矛盾をロードマップで確認する', en: 'Check the roadmap for dependency conflicts' },
          tool: 'get_roadmap',
        };
      },
    },
  ],
};

const LENS_CONSENSUS: GoalLens = {
  id: 'consensus',
  keywords: [
    '合意', '反対', '巻き込', '説得', '説明', '納得', '根回し', '調整', '抵抗', '現場', '受容',
    'alignment', 'buy-in', 'buy in', 'consensus', 'resistance', 'stakeholder', 'engage',
  ],
  label: { ja: '合意を作りに行く目的', en: 'Building agreement' },
  checks: [
    {
      need: { ja: '影響力が高く関心が低い層に手が打ててある(最も危険な象限)', en: 'The high-influence / low-interest quadrant is handled — the dangerous one' },
      evaluate: (e) => {
        const danger = e.stakeholders.filter((s) => s.influence === 'high' && s.interest === 'low');
        if (e.stakeholders.length === 0) {
          return {
            level: 'missing',
            state: { ja: '関係者が 0 名。合意の相手が特定されていない', en: 'No stakeholders recorded — there is nobody to agree with' },
            fix: { ja: '5〜10 名を影響力・関心度つきで登録する', en: 'Record 5-10 people with influence and interest' },
            tool: 'update_engagement',
          };
        }
        if (danger.length === 0) {
          return {
            level: 'ok',
            state: { ja: '影響力高 × 関心低 の層は登録上 0 名', en: 'Nobody sits in the high-influence / low-interest quadrant' },
            fix: { ja: '本当に 0 名か確認する。この層は「まだ見つけていない」ことのほうが多い', en: 'Check that this is real — an empty dangerous quadrant usually means you have not found them yet' },
            tool: 'stakeholder_matrix',
          };
        }
        const unattended = danger.filter((s) => !s.approach);
        return {
          level: unattended.length > 0 ? 'missing' : 'ok',
          state: { ja: `${danger.length} 名(例: ${clip(danger[0].name, 18)})、うち関与方針が空なのが ${unattended.length} 名`, en: `${danger.length} in that quadrant (e.g. ${clip(danger[0].name, 18)}); ${unattended.length} have no approach recorded` },
          fix: { ja: 'この層は最終盤にひっくり返す力を持つ。関心が低いうちに関与方針を決める', en: 'This quadrant can overturn the decision late. Fix an approach while their interest is still low' },
          tool: 'update_engagement',
        };
      },
    },
    {
      need: { ja: '相手の関心事が本人の言葉で残っている', en: 'Concerns are captured in their own words' },
      evaluate: (e) => {
        const withConcerns = e.stakeholders.filter((s) => s.concerns.length > 0);
        if (e.stakeholders.length === 0) {
          return {
            level: 'missing',
            state: { ja: '関係者が 0 名', en: 'No stakeholders recorded' },
            fix: { ja: 'まず名前を並べる。関心事はその後で聞きに行く', en: 'List the names first; go ask for the concerns after' },
            tool: 'update_engagement',
          };
        }
        const ratio = Math.round((withConcerns.length / e.stakeholders.length) * 100);
        return {
          level: ratio >= 70 ? 'ok' : ratio > 0 ? 'thin' : 'missing',
          state: { ja: `${e.stakeholders.length} 名中 ${withConcerns.length} 名(${ratio}%)に関心事あり`, en: `${withConcerns.length} of ${e.stakeholders.length} (${ratio}%) have recorded concerns` },
          fix: ratio >= 70
            ? { ja: '説明の順序を関心事の重い順に組み替える', en: 'Order the pitch by the weight of those concerns' }
            : { ja: '関心事が空欄の人は、まだ話を聞けていない人。反対は最後の会議で出る', en: 'An empty concerns field means you have not actually talked to them. The objection lands in the final meeting' },
          tool: ratio >= 70 ? 'explain_for' : 'update_engagement',
        };
      },
    },
  ],
};

const LENS_TECH: GoalLens = {
  id: 'tech',
  keywords: [
    '移行', 'クラウド', '技術選定', 'ベンダー選定', '選定', 'インフラ', '基盤', '統合', '連携', 'システム刷新',
    'リプレース', 'アーキテクチャ設計', '内製', 'saas', 'erp',
    'cloud', 'migration', 'migrate', 'integration', 'infrastructure', 'platform', 'vendor selection', 'replatform',
  ],
  label: { ja: '技術・移行の方式を決める目的', en: 'Settling a technical or migration approach' },
  checks: [
    {
      need: { ja: '現状と目標の差が洗い出されている(ギャップ)', en: 'The distance between today and the target is written down' },
      evaluate: (e) => {
        if (hasGapEvidence(e)) {
          return {
            level: 'ok',
            state: { ja: 'ギャップの記録が案件に残っている', en: 'Gap evidence is present on the engagement' },
            fix: { ja: '廃止側(やめるもの)が抜けていないか見直す。コスト削減の根拠はそこにある', en: 'Check the eliminated side is not missing — that is where the savings case lives' },
            tool: 'gap_analysis',
          };
        }
        return {
          level: 'missing',
          state: { ja: 'ギャップの記録が案件に見当たらない', en: 'No gap evidence recorded' },
          fix: { ja: '技術方式を先に決めると、後から「そもそも何が足りないのか」に戻される。先に差を出す', en: 'Choosing the technology first sends you back to "what was missing anyway?". Produce the gaps first' },
          tool: 'gap_analysis',
        };
      },
    },
    {
      need: { ja: '途中で止まれる到達点がある(単独稼働できる中間状態)', en: 'There is a stopping point you can survive at' },
      evaluate: (e) => {
        if (e.transitions.length === 0) {
          return {
            level: 'missing',
            state: { ja: '移行状態が 0 件。一発切替の計画になっている', en: 'No transition states — this is a big-bang plan' },
            fix: { ja: '止まっても事業が回る中間状態を 1 つは置く。予算はだいたい途中で止まる', en: 'Place at least one state the business can live in. Funding usually stops midway' },
            tool: 'add_transition_state',
          };
        }
        const fragile = e.transitions.filter((t) => t.standalone === false);
        if (fragile.length > 0) {
          return {
            level: 'thin',
            state: { ja: `${fragile.length} 件が単独稼働不可(例: ${clip(fragile[0].name, 18)})`, en: `${fragile.length} states cannot stand alone (e.g. ${clip(fragile[0].name, 18)})` },
            fix: { ja: '切り直すか、そこで止まれない理由と回避策を書く', en: 'Re-cut them, or write down why stopping there is impossible and what covers it' },
            tool: 'add_transition_state',
          };
        }
        return {
          level: 'ok',
          state: { ja: `${e.transitions.length} 件すべて単独稼働可`, en: `All ${e.transitions.length} states stand alone` },
          fix: { ja: '暫定の仕組みに廃棄期限が入っているか確認する', en: 'Check every interim mechanism carries a disposal date' },
          tool: 'get_roadmap',
        };
      },
    },
  ],
};

const LENS_VALUE: GoalLens = {
  id: 'value',
  keywords: [
    'コスト削減', '効果', '投資対効果', 'roi', '費用対効果', '削減', '収益', '売上', '便益', '価値',
    'cost reduction', 'savings', 'benefit', 'value', 'return on investment', 'business case',
  ],
  label: { ja: '効果・便益を示す目的', en: 'Showing the benefit' },
  checks: [
    {
      need: { ja: '便益に刈り取り責任者がいる', en: 'Every benefit has someone accountable for realising it' },
      evaluate: (e) => {
        if (e.workPackages.length === 0) {
          return {
            level: 'missing',
            state: { ja: '作業パッケージが 0 件。効果を紐づける先が無い', en: 'No work packages — nothing to attach a benefit to' },
            fix: { ja: '実行単位を作り、1 つずつに便益を書く', en: 'Create the units of work and write one benefit against each' },
            tool: 'add_work_package',
          };
        }
        const owned = e.workPackages.filter((w) => w.benefit && w.benefitOwner);
        return {
          level: owned.length === e.workPackages.length ? 'ok' : owned.length > 0 ? 'thin' : 'missing',
          state: { ja: `${e.workPackages.length} 件中 ${owned.length} 件に便益と責任者あり`, en: `${owned.length} of ${e.workPackages.length} packages carry both a benefit and an owner for it` },
          fix: owned.length === e.workPackages.length
            ? { ja: '測る時期と測り方を 1 行足す', en: 'Add when it gets measured and how' }
            : { ja: '刈り取り責任者のいない投資は、完了報告だけ出て効果測定が行われない', en: 'An investment with no benefit owner produces a completion report and no measurement' },
          tool: 'add_work_package',
        };
      },
    },
    {
      need: { ja: '廃止するもの(やめること)が言える', en: 'You can name what gets switched off' },
      evaluate: (e) => {
        if (hasGapEvidence(e)) {
          return {
            level: 'ok',
            state: { ja: 'ギャップの記録あり。廃止側が含まれているか確認する', en: 'Gap evidence exists — confirm the eliminated side is in it' },
            fix: { ja: '廃止する現行要素と、その運用費を並べる。削減額はここからしか出ない', en: 'List the retired elements with their run cost. The savings number comes from nowhere else' },
            tool: 'gap_analysis',
          };
        }
        return {
          level: 'missing',
          state: { ja: 'ギャップの記録が無い', en: 'No gap evidence recorded' },
          fix: { ja: '新規に足すものだけ並べた効果試算は、必ず「で、何が減るのか」で止まる', en: 'A benefit case listing only additions always stalls on "so what actually goes away?"' },
          tool: 'gap_analysis',
        };
      },
    },
  ],
};

const LENS_RISK: GoalLens = {
  id: 'risk',
  keywords: [
    'リスク', '監査', '指摘', 'セキュリティ', '規制', 'コンプラ', '個人情報', 'インシデント', '障害', '統制',
    'risk', 'audit', 'finding', 'security', 'compliance', 'regulation', 'incident', 'governance', 'control',
  ],
  label: { ja: 'リスク・統制に答える目的', en: 'Answering on risk or control' },
  checks: [
    {
      need: { ja: '重大リスクに担当と対策が入っている', en: 'Severe risks carry an owner and a mitigation' },
      evaluate: (e) => {
        const live = e.risks.filter((r) => r.status === 'open' || r.status === 'mitigating');
        const heavy = live.filter((r) => r.level === 'critical' || r.level === 'high');
        if (e.risks.length === 0) {
          return {
            level: 'missing',
            state: { ja: 'リスクが 1 件も登録されていない', en: 'No risks recorded at all' },
            fix: { ja: 'まず 3 件書き出す。リスクゼロの案件は存在しない', en: 'Write down three. No engagement has zero risks' },
            tool: 'update_engagement',
          };
        }
        const thin = heavy.filter((r) => !r.owner || !r.mitigation);
        return {
          level: thin.length === 0 ? 'ok' : 'missing',
          state: { ja: `重大 ${heavy.length} 件中 ${thin.length} 件が担当か対策が空(例: ${heavy[0] ? clip(heavy[0].title, 18) : '—'})`, en: `${thin.length} of ${heavy.length} severe risks lack an owner or a mitigation (e.g. ${heavy[0] ? clip(heavy[0].title, 18) : '—'})` },
          fix: thin.length === 0
            ? { ja: '残存リスクの受容者が決まっているか確認する', en: 'Confirm someone accepts the residual risk' }
            : { ja: '空欄の重大リスクは、監査でもレビューでも最初に突かれる', en: 'A severe risk with a blank field is the first thing any review picks at' },
          tool: thin.length === 0 ? 'risk_matrix' : 'update_engagement',
        };
      },
    },
    {
      need: { ja: '対策後に残るリスク(残存レベル)が評価されている', en: 'Residual risk after mitigation is scored' },
      evaluate: (e) => {
        const live = e.risks.filter((r) => r.status === 'open' || r.status === 'mitigating');
        if (live.length === 0) {
          return {
            level: 'thin',
            state: { ja: '未対応のリスクが 0 件', en: 'No live risks' },
            fix: { ja: '本当に 0 件か、書けていないだけかを確認する', en: 'Check whether that is true or simply unrecorded' },
            tool: 'risk_matrix',
          };
        }
        const scored = live.filter((r) => r.residualLevel);
        return {
          level: scored.length === live.length ? 'ok' : scored.length > 0 ? 'thin' : 'missing',
          state: { ja: `未対応 ${live.length} 件中 ${scored.length} 件に残存レベルあり`, en: `${scored.length} of ${live.length} live risks carry a residual level` },
          fix: { ja: '「対策する」と書いただけでは、どこまで下がるのかが誰にも分からない', en: '"We will mitigate" tells nobody how far the risk actually drops' },
          tool: 'update_engagement',
        };
      },
    },
  ],
};

const GOAL_LENSES: GoalLens[] = [
  LENS_APPROVAL,
  LENS_DEADLINE,
  LENS_CONSENSUS,
  LENS_TECH,
  LENS_VALUE,
  LENS_RISK,
];

/** 目的の記述に当たるレンズを選ぶ(当たらなければ空) */
function matchGoalLenses(goal: string, limit = 2): GoalLens[] {
  const g = goal.toLowerCase();
  return GOAL_LENSES.map((lens) => ({
    lens,
    hits: lens.keywords.filter((k) => matchesKeyword(g, k)),
  }))
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.lens.id.localeCompare(b.lens.id))
    .slice(0, limit)
    .map((x) => x.lens);
}

/** どのレンズにも当たらなかったときの、目的によらない最低限の確認 */
const BASELINE_CHECKS: GoalCheck[] = [
  {
    need: { ja: '決裁できる人がいる', en: 'Somebody can decide' },
    evaluate: (e) => {
      const high = decisionMakers(e);
      return high.length > 0
        ? {
            level: 'ok',
            state: { ja: `影響力 high が ${high.length} 名(例: ${clip(high[0].name, 18)})`, en: `${high.length} high-influence stakeholders (e.g. ${clip(high[0].name, 18)})` },
            fix: { ja: 'その人の関心事の順に話を組む', en: 'Build the story in the order of their concerns' },
            tool: 'explain_for',
          }
        : {
            level: 'missing',
            state: { ja: '影響力 high の関係者が 0 名', en: 'No high-influence stakeholder' },
            fix: { ja: '予算と優先順位を動かせる人を 1 名確保する', en: 'Secure one person who can move budget and priority' },
            tool: 'update_engagement',
          };
    },
  },
  {
    need: { ja: '今週動かすものが決まっている', en: 'Something is moving this week' },
    evaluate: (e) => {
      const open = e.actions.filter((a) => a.status !== 'done');
      return open.length > 0
        ? {
            level: 'ok',
            state: { ja: `未完了アクション ${open.length} 件`, en: `${open.length} open actions` },
            fix: { ja: '期限の近い順に片付ける', en: 'Work them nearest-date first' },
            tool: 'update_engagement',
          }
        : {
            level: 'missing',
            state: { ja: '未完了アクションが 0 件', en: 'No open actions' },
            fix: { ja: '今週動かす作業を 3 件、担当と期限つきで入れる', en: 'Add three items for this week with owners and dates' },
            tool: 'update_engagement',
          };
    },
  },
];

/**
 * 目的と案件の実データを突き合わせた節を作る。
 * ここが返す表は、goal と保存済みデータの両方が変われば必ず中身が変わる。
 */
function renderGoalFit(engagement: Engagement, goal: string, lang: Lang): string[] {
  const out: string[] = [];
  const trimmed = goal.trim();
  const lenses = matchGoalLenses(trimmed);
  const checks = lenses.length > 0 ? lenses.flatMap((l) => l.checks) : BASELINE_CHECKS;
  const results = checks.map((c) => ({ need: c.need, result: c.evaluate(engagement) }));

  out.push(msg('## その目的に照らすと、いま足りないもの', '## Measured Against That Goal', lang));
  out.push('');
  out.push(`> ${flat(clip(trimmed, 120))}`);
  out.push('');

  if (lenses.length > 0) {
    out.push(
      msg(
        `読み取った目的の型: **${lenses.map((l) => one(l.label, 'ja')).join(' / ')}**`,
        `Goal read as: **${lenses.map((l) => one(l.label, 'en')).join(' / ')}**`,
        lang,
      ),
    );
  } else {
    out.push(
      msg(
        '目的の型は特定できなかったので、どの目的でも要る 2 点だけ見ている。金額・期限・相手・技術のどれが論点かを書き足すと、見る観点が変わる。',
        'The goal did not resolve to a known shape, so only the two things every goal needs are checked. Naming money, a date, an audience, or a technology changes what gets examined.',
        lang,
      ),
    );
  }
  out.push('');

  out.push(
    `| | ${inline('その目的に要るもの', 'What that goal needs', lang)} | ${inline('いまの案件の状態', 'What your engagement holds', lang)} | ${inline('埋め方', 'How to close it', lang)} | ${inline('ツール', 'Tool', lang)} |`,
  );
  out.push('| :-: | --- | --- | --- | --- |');
  for (const r of results) {
    out.push(
      `| ${FIT_MARK[r.result.level]} | ${cell(one(r.need, lang))} | ${cell(one(r.result.state, lang))} | ${cell(one(r.result.fix, lang))} | ${code(r.result.tool)} |`,
    );
  }
  out.push('');
  out.push(
    `*${inline(
      `${FIT_MARK.ok} ${one(FIT_LABEL.ok, 'ja')} / ${FIT_MARK.thin} ${one(FIT_LABEL.thin, 'ja')} / ${FIT_MARK.missing} ${one(FIT_LABEL.missing, 'ja')}`,
      `${FIT_MARK.ok} ${one(FIT_LABEL.ok, 'en')} / ${FIT_MARK.thin} ${one(FIT_LABEL.thin, 'en')} / ${FIT_MARK.missing} ${one(FIT_LABEL.missing, 'en')}`,
      lang,
    )}*`,
  );
  out.push('');

  const blocking = results.filter((r) => r.result.level === 'missing');
  if (blocking.length > 0) {
    const first = blocking[0];
    out.push(
      msg(
        `**この目的の律速はここ**: ${flat(one(first.need, 'ja'))} — ${flat(one(first.result.state, 'ja'))}。${flat(one(first.result.fix, 'ja'))}(${code(first.result.tool)})。`,
        `**This is what gates the goal**: ${flat(one(first.need, 'en'))} — ${flat(one(first.result.state, 'en'))}. ${flat(one(first.result.fix, 'en'))} (${code(first.result.tool)}).`,
        lang,
      ),
    );
  } else {
    out.push(
      msg(
        'この目的に必要なものは、記録上はそろっている。次は中身の質 — 数字の出どころと、外したときの振れ幅を用意する。',
        'On the record, this goal has what it needs. The remaining question is quality: where the numbers came from and how far they could be off.',
        lang,
      ),
    );
  }
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// start_here
// ---------------------------------------------------------------------------

/** エンゲージメント未作成時の入口 */
function renderColdStart(goal: string | undefined, lang: Lang): string {
  const out: string[] = [];
  out.push(msg('# ここから始める', '# Start Here', lang));
  out.push('');
  out.push(
    msg(
      'このサーバーは TOGAF を読むためではなく、**次の一手を決めるため**に使う。まだ案件が無いので、決めることは 3 つだけ。',
      'This server exists to decide **the next move**, not to read TOGAF. No engagement exists yet, so there are only three things to settle.',
      lang,
    ),
  );
  out.push('');
  out.push(
    `| # | ${inline('決めること', 'Settle this', lang)} | ${inline('決まった状態', 'Settled looks like', lang)} | ${inline('ツール', 'Tool', lang)} |`,
  );
  out.push('| :-: | --- | --- | --- |');
  out.push(
    `| 1 | ${cell(inline('何を解決するのか', 'What you are solving', lang))} | ${cell(inline('課題が 1 文で書け、解けたと分かる指標が 1 つある', 'The problem fits in one sentence and has one measure of success', lang))} | ${code('consult')} |`,
  );
  out.push(
    `| 2 | ${cell(inline('どこまでやるのか', 'How far you go', lang))} | ${cell(inline('対象組織・対象領域・期限が決まり、やらないことが言える', 'Target org, domains, and deadline are set — and you can say what is out', lang))} | ${code('tailor_adm')} |`,
  );
  out.push(
    `| 3 | ${cell(inline('記録を始める', 'Start recording', lang))} | ${cell(inline('案件が作られ、現在フェーズが 1 つ指定されている', 'An engagement exists with one current phase', lang))} | ${code('start_engagement')} |`,
  );
  out.push('');

  if (goal && goal.trim().length > 0) {
    const matches = matchConsultRules(goal, undefined, 2);
    out.push(msg('## あなたの目的からの見立て', '## First read on your goal', lang));
    out.push('');
    // 全文エコーはしない(実測: 30 万字の goal → 99 万バイトの応答)
    for (const line of echoInput(goal, lang).split('\n')) out.push(`> ${flat(line)}`);
    out.push('');
    // 案件が無くても目的レンズは読める。案件を作った後に何が判定されるかを先に見せる
    const lenses = matchGoalLenses(goal, 2);
    if (lenses.length > 0) {
      out.push(
        msg(
          `読み取った目的の型: **${lenses.map((x) => one(x.label, 'ja')).join(' / ')}**`,
          `Goal read as: **${lenses.map((x) => one(x.label, 'en')).join(' / ')}**`,
          lang,
        ),
      );
      out.push('');
      out.push(
        msg(
          'この目的なら、最終的に次が揃っている必要がある。案件を作れば、以下が実データで ●/◐/○ 判定される。',
          'A goal of this shape eventually needs all of the following. Once an engagement exists, each one gets marked ●/◐/○ against your actual data.',
          lang,
        ),
      );
      out.push('');
      const seen = new Set<string>();
      for (const lens of lenses) {
        for (const check of lens.checks) {
          const key = one(check.need, 'ja');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(`- ${flat(one(check.need, lang))}`);
        }
      }
      out.push('');
    }
    if (matches.length === 0) {
      const hits = searchKnowledge(goal, { limit: 4 });
      if (hits.length > 0) {
        out.push(
          msg('定型パターンには当たらなかった。近い項目はこのあたり。', 'No known pattern matched. The closest entries are:', lang),
        );
        out.push('');
        for (const h of hits) {
          out.push(`- ${code(`${KIND_TOOL[h.kind]} ${h.id}`)} — ${flat(one(h.title, lang))}`);
        }
        out.push('');
      }
      out.push(
        msg(
          `${code('consult')} に「何が起きていて、誰が困っていて、何を決めたいのか」を書いて渡すと、見立てが具体的になる。`,
          `Pass ${code('consult')} what is happening, who is stuck, and what decision you need — the read gets much sharper.`,
          lang,
        ),
      );
      out.push('');
    } else {
      out.push(
        `| ${inline('見立て', 'Read', lang)} | ${inline('着目するフェーズ', 'Phases in play', lang)} | ${inline('最初のアクション', 'First action', lang)} |`,
      );
      out.push('| --- | --- | --- |');
      for (const m of matches) {
        const phases = m.rule.phaseIds
          .map((id) => findPhase(id)?.code)
          .filter((x): x is string => Boolean(x))
          .join(', ');
        const firstAction = m.rule.actions[0];
        out.push(
          `| **${cell(one(m.rule.name, lang))}** | ${cell(phases)} | ${cell(firstAction ? one(firstAction, lang) : '')} |`,
        );
      }
      out.push('');
      out.push(
        msg(
          `詳しい見立て(推奨技法・成果物・確認質問)は ${code('consult')} が返す。`,
          `Full diagnosis — techniques, deliverables, and questions to ask — comes from ${code('consult')}.`,
          lang,
        ),
      );
      out.push('');
    }
  }

  out.push(msg('## 次にこれを呼ぶ', '## Call these next', lang));
  out.push('');
  out.push(
    `1. ${code('consult')} — ${inline('状況を渡して見立てを取る', 'hand it the situation, get a read', lang)}`,
  );
  out.push(
    `2. ${code('tailor_adm')} — ${inline('規模と目的から、やるフェーズと削るフェーズを決める', 'decide which phases to run and which to cut', lang)}`,
  );
  out.push(
    `3. ${code('start_engagement')} — ${inline('案件を作る。ここから先は状態を見て助言できる', 'create the engagement; from here the advice reads your actual state', lang)}`,
  );
  out.push(
    `4. ${code('next_best_action')} — ${inline('作ったら毎週これを呼ぶ', 'call this every week once it exists', lang)}`,
  );
  out.push('');
  return out.join('\n');
}

/** エンゲージメントがあるときの入口 */
function renderWarmStart(engagement: Engagement, goal: string | undefined, lang: Lang): string {
  const out: string[] = [];
  const progress = summarizeProgress(engagement);
  const current = findPhase(engagement.currentPhaseId);
  const currentStatus = phaseStatus(engagement, engagement.currentPhaseId);

  const engName = flat(engagement.name);
  out.push(msg(`# ${engName} — いまここ`, `# ${engName} — You Are Here`, lang));
  out.push('');
  out.push(
    `${bar(progress.percent, 100)} **${progress.percent}%** ` +
      `(${inline('完了', 'done', lang)} ${progress.completed} / ${inline('進行中', 'in progress', lang)} ${progress.inProgress} / ${inline('未着手', 'not started', lang)} ${progress.notStarted}${progress.skipped > 0 ? ` / ${inline('対象外', 'skipped', lang)} ${progress.skipped}` : ''})`,
  );
  out.push('');
  out.push(phaseStrip(engagement, lang));
  out.push('');
  const currentLine = current
    ? `**${current.code}. ${one(current.name, lang)}** — ${one(current.tagline, lang)} (${one(PHASE_STATUS_LABEL[currentStatus], lang)})`
    : `**${engagement.currentPhaseId}** (${one(PHASE_STATUS_LABEL[currentStatus], lang)})`;
  out.push(`${inline('現在フェーズ', 'Current phase', lang)}: ${currentLine}`);
  const counts = [
    `${inline('関係者', 'stakeholders', lang)} ${engagement.stakeholders.length}`,
    `${inline('未対応リスク', 'open risks', lang)} ${engagement.risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length}`,
    `${inline('未完了アクション', 'open actions', lang)} ${engagement.actions.filter((a) => a.status !== 'done').length}`,
    `${inline('作業パッケージ', 'work packages', lang)} ${engagement.workPackages.length}`,
  ];
  out.push(`${counts.join(' ・ ')}`);
  out.push('');

  // 変革準備度は「着手して大丈夫か」に直接答えるので、何よりも先に出す
  const readiness = latestReadiness(engagement);
  if (readiness) {
    out.push(...renderReadinessBlock(readiness, engagement, lang));
    out.push('');
  }

  if (goal && goal.trim().length > 0) {
    const trimmed = goal.trim();
    // 1) 定型パターンの見立て(consult ルール)
    const matches = matchConsultRules(trimmed, engagement.currentPhaseId, 2);
    if (matches.length > 0) {
      out.push(
        msg(
          `**目的からの見立て**: ${matches.map((m) => one(m.rule.name, 'ja')).join(' / ')} — 詳細は ${code('consult')} へ。`,
          `**Read on your goal**: ${matches.map((m) => one(m.rule.name, 'en')).join(' / ')} — full detail from ${code('consult')}.`,
          lang,
        ),
      );
      // 見立てが指すフェーズと、いま注力しているフェーズがずれていたら言う
      const wanted = Array.from(new Set(matches.flatMap((m) => m.rule.phaseIds)));
      if (wanted.length > 0 && !wanted.includes(engagement.currentPhaseId)) {
        const codes = wanted
          .map((id) => findPhase(id)?.code)
          .filter((x): x is string => Boolean(x));
        if (codes.length > 0) {
          out.push('');
          out.push(
            msg(
              `その目的が効くのはフェーズ ${codes.join(' / ')} だが、いま注力しているのは ${current ? current.code : engagement.currentPhaseId}。意図した回り道でないなら、${code('update_engagement')} で注力フェーズを移すか、この目的を今回のスコープから外す。`,
              `That goal plays out in phase ${codes.join(' / ')}, but the current focus is ${current ? current.code : engagement.currentPhaseId}. Unless the detour is deliberate, move the focus with ${code('update_engagement')} or take this goal out of scope for now.`,
              lang,
            ),
          );
        }
      }
      out.push('');
    }
    // 2) 目的 × 保存済みデータの突き合わせ(見立てが当たらなくても必ず出す)
    out.push(...renderGoalFit(engagement, trimmed, lang));
  }

  const actions = computeNextActions(engagement, 'week').slice(0, 3);
  out.push(msg('## 今週やる 3 つ', '## Three Things This Week', lang));
  out.push('');
  if (goal && goal.trim().length > 0) {
    out.push(
      msg(
        '(以下は目的とは独立に、案件の状態そのものから出している。上の表と重なるところが本当の優先順位。)',
        '(These come from the state of the engagement itself, independent of the goal. Where they overlap with the table above is the real priority.)',
        lang,
      ),
    );
    out.push('');
  }
  out.push(...renderActions(actions, lang, 'week'));

  out.push(msg('## 次にこれを呼ぶ', '## Call these next', lang));
  out.push('');
  out.push(
    `- ${code('next_best_action')} — ${inline('もっと細かく、期間を指定して', 'more items, with a horizon you choose', lang)}`,
  );
  out.push(
    `- ${code('whats_new_for_me')} — ${inline('止まっているものを洗い出す', 'find what has stopped moving', lang)}`,
  );
  out.push(
    `- ${code('get_dashboard')} / ${code('open_dashboard')} — ${inline('共有用の 1 枚', 'the shareable one-pager', lang)}`,
  );
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// tailor_adm
// ---------------------------------------------------------------------------

type Scale = 'small' | 'medium' | 'large';
type Treatment = 'core' | 'light' | 'skip';

const TREATMENT_LABEL: Record<Treatment, Bilingual> = {
  core: { ja: '必須', en: 'Core' },
  light: { ja: '軽量', en: 'Light' },
  skip: { ja: '省く', en: 'Cut' },
};

const TREATMENT_MARK: Record<Treatment, string> = { core: '●', light: '◐', skip: '–' };

/** 英語側の「週」。timeboxWeeks は 1 も取れるので単複を分ける */
function weeksEn(n: number): string {
  return `${n} ${n === 1 ? 'week' : 'weeks'}`;
}

const SCALE_LABEL: Record<Scale, Bilingual> = {
  small: { ja: '小規模(1 部門・数名)', en: 'Small (one unit, a few people)' },
  medium: { ja: '中規模(複数部門)', en: 'Medium (several units)' },
  large: { ja: '大規模(全社・複数年)', en: 'Large (enterprise-wide, multi-year)' },
};

/** 目的の記述からどのドメインを厚くするかを判定するキーワード */
const DOMAIN_KEYWORDS: Record<'b' | 'c' | 'd', string[]> = {
  b: [
    '業務', 'プロセス', 'ケイパビリティ', '組織', '人材', 'オペレーション', '事業モデル', '顧客体験',
    'business', 'process', 'capability', 'operating model', 'organization', 'organisation', 'workflow', 'customer experience',
  ],
  c: [
    'データ', 'アプリ', 'システム統合', '連携', '統合', 'マスタ', '情報', '基幹', '販売管理',
    'application', 'data', 'integration', 'master data', 'information', 'erp', 'crm', 'api', 'interface',
  ],
  d: [
    'インフラ', '基盤', 'クラウド', 'ネットワーク', 'オンプレ', '技術', '移行', 'コンテナ', '仮想化',
    'cloud', 'infrastructure', 'network', 'platform', 'technology', 'migration', 'datacenter', 'kubernetes', 'hosting',
  ],
};

/**
 * 領域(B/C/D)を対象と見なした根拠。理由文はこの根拠と「最終的な扱い」の両方から作る。
 * 根拠が無いときに、それらしい理由をでっち上げないための型でもある。
 */
type DomainEvidence =
  /** 目的の記述にこの領域の語が出た(hits に出典を残す) */
  | { kind: 'matched'; hits: string[] }
  /** 他の領域は当たったが、この領域の語は出ていない */
  | { kind: 'not-mentioned' }
  /** どの領域の語も出ていない。目的の記述からは何も判断できない */
  | { kind: 'no-signal' };

interface TailorContext {
  scale: Scale;
  hasExistingEa: boolean;
  evidence: Record<'b' | 'c' | 'd', DomainEvidence>;
  /** 指定があれば理由文に「期間のために下げた」と書ける */
  timeboxWeeks?: number;
}

/** 目的の記述から、領域ごとの根拠を読む(当たったキーワードを出典として残す) */
function readDomainEvidence(purpose: string): Record<'b' | 'c' | 'd', DomainEvidence> {
  const lower = purpose.toLowerCase();
  const hits: Record<'b' | 'c' | 'd', string[]> = {
    b: DOMAIN_KEYWORDS.b.filter((k) => matchesKeyword(lower, k)),
    c: DOMAIN_KEYWORDS.c.filter((k) => matchesKeyword(lower, k)),
    d: DOMAIN_KEYWORDS.d.filter((k) => matchesKeyword(lower, k)),
  };
  const anyHit = (['b', 'c', 'd'] as const).some((id) => hits[id].length > 0);
  const make = (id: 'b' | 'c' | 'd'): DomainEvidence =>
    hits[id].length > 0
      ? { kind: 'matched', hits: hits[id] }
      : anyHit
        ? { kind: 'not-mentioned' }
        : { kind: 'no-signal' };
  return { b: make('b'), c: make('c'), d: make('d') };
}

function matchedDomainsOf(ctx: TailorContext): ('b' | 'c' | 'd')[] {
  return (['b', 'c', 'd'] as const).filter((id) => ctx.evidence[id].kind === 'matched');
}

interface PhasePlan {
  phaseId: string;
  code: string;
  name: Bilingual;
  treatment: Treatment;
  /** 常に treatment と整合させる。treatment を変えたら applyReasons で作り直す */
  reason: Bilingual;
  /** 期間配分の重み(skip は 0) */
  weight: number;
  /** 全期間並走(RM) */
  continuous: boolean;
  weeks?: number;
}

const NOMINAL_WEEKS: Record<Scale, { core: number; light: number }> = {
  small: { core: 1.5, light: 0.5 },
  medium: { core: 2.5, light: 1 },
  large: { core: 4, light: 1.5 },
};

/**
 * 期間が足りないときに削る順序(価値の低いものから)。
 * 目的が直接指しているドメインは最後まで残す — そこを削ると案件そのものが目的を失う。
 */
function compressOrder(matched: ('b' | 'c' | 'd')[]): string[] {
  const inScope = new Set<string>(matched);
  const domains = ['d', 'c', 'b'] as const;
  return [
    'h',
    'f',
    'preliminary',
    'g',
    ...domains.filter((id) => !inScope.has(id)),
    'e',
    ...domains.filter((id) => inScope.has(id)),
  ];
}

function downgrade(t: Treatment): Treatment {
  return t === 'core' ? 'light' : 'skip';
}

function treatmentWeight(t: Treatment): number {
  return t === 'core' ? 3 : t === 'light' ? 1 : 0;
}

/** 領域(B/C/D)の扱いを、根拠と規模から決める */
function domainTreatment(id: 'b' | 'c' | 'd', ctx: TailorContext): Treatment {
  const ev = ctx.evidence[id];
  if (ev.kind === 'matched') return 'core';
  if (ev.kind === 'no-signal') {
    // 目的からは何も読めない。小規模だけは全部やる余裕が無いので業務側から当たりを付ける
    return ctx.scale === 'small' ? (id === 'b' ? 'core' : 'skip') : 'core';
  }
  if (ctx.scale === 'small') return 'skip';
  if (ctx.scale === 'large') return 'core';
  return 'light';
}

/**
 * 領域(B/C/D)の理由。**扱いと根拠の両方**から作るので、
 * 「軽量」なのに「両方を描く」といった逆向きの説明は出ない。
 * 根拠が無い場合は、無いと書く(それらしい理由を作らない)。
 */
function domainReason(id: 'b' | 'c' | 'd', treatment: Treatment, ctx: TailorContext): Bilingual {
  const ev = ctx.evidence[id];
  const src = ev.kind === 'matched' ? ev.hits.slice(0, 3).join(' / ') : '';
  if (treatment === 'core') {
    if (ev.kind === 'matched') {
      return {
        ja: `目的の記述がこの領域を直接指している(該当語: ${src})。現状と目標の両方を描く`,
        en: `Your stated purpose points straight at this domain (matched: ${src}). Describe both the baseline and the target here`,
      };
    }
    if (ev.kind === 'not-mentioned') {
      return {
        ja: '目的の記述にこの領域を指す語は無い。ただし全社規模では他領域の変更が必ずここを通るので、既定として残している。他領域と接点が無いと確認が取れた時点で扱いを見直す',
        en: 'Your purpose does not name this domain, but at enterprise scale changes in the other domains always land here, so it stays in by default. Revisit its treatment once you can show the other domains do not reach into it',
      };
    }
    return {
      ja: '目的の記述からは対象領域を判断する材料が無い。材料が無いまま削ると根拠の無い削減になるため、既定として残している。A で範囲が固まった時点で見直す',
      en: 'The purpose gives no signal about which domains are in play. Cutting with no evidence would be an unfounded cut, so it stays by default — revisit once phase A fixes the scope',
    };
  }
  if (treatment === 'light') {
    if (ev.kind === 'matched') {
      return {
        ja: `目的が指す領域(該当語: ${src})なので外さない。ただし現状の記述は見出しだけに留め、目標側と差分に手数を寄せる`,
        en: `Kept, because your purpose points here (matched: ${src}) — but keep the baseline at headline level and spend the effort on the target and the gaps`,
      };
    }
    if (ev.kind === 'not-mentioned') {
      return {
        ja: '目的の記述にこの領域を指す語が無い。他領域から参照される項目だけ一覧で押さえ、モデルは描かない',
        en: 'Your purpose does not name this domain. List only the items the other domains reach into; do not model it',
      };
    }
    return {
      ja: '目的の記述からは対象かどうか判断する材料が無い。材料が無いので描き込まず、影響が出た箇所を一覧に足すところまでに留める',
      en: 'The purpose gives no signal either way. With nothing to go on, do not model it — just add whatever turns out to be affected to a list',
    };
  }
  if (ev.kind === 'matched') {
    return {
      ja: `目的が指す領域(該当語: ${src})だが、期間の制約でこの回では扱えない。外すと目的そのものが未達になるので、次サイクルの先頭に置く`,
      en: `Your purpose points here (matched: ${src}), but the calendar cannot hold it this round. Dropping it means missing the point of the engagement — put it first in the next cycle`,
    };
  }
  if (ev.kind === 'not-mentioned') {
    return {
      ja: 'このドメインを指す語が目的の記述に無く、この規模なら対象外にできる。影響が出たら他領域の一覧に 1 行足すだけにする',
      en: 'Nothing in your purpose names this domain, and at this size it can stay out of scope. If something turns out to touch it, add one line to the other domains list',
    };
  }
  return {
    ja: '目的の記述からは対象領域を判断する材料が無い。小さく始めるため今回は外すが、これは根拠のある除外ではない。A で範囲が固まった時点で戻すか決める',
    en: 'The purpose gives no signal about scope. It is left out to keep the first pass small — this is not an evidenced exclusion. Decide whether to restore it once phase A fixes the scope',
  };
}

/**
 * フェーズの理由。**必ず最終的な treatment を受け取り**、その扱いと整合した文を返す。
 * 扱いを変えたあとにこれを呼び直さないと、表の記号と説明がずれる。
 * `cut` には最終的に省くフェーズの id が入る — 他フェーズに任せる書き方は、
 * その相手が生きているときだけ使う(落としたフェーズに任せると同じ表の中で矛盾する)。
 */
function phaseReason(
  phaseId: string,
  treatment: Treatment,
  ctx: TailorContext,
  cut: ReadonlySet<string> = new Set<string>(),
): Bilingual {
  const { scale, hasExistingEa } = ctx;
  if (phaseId === 'b' || phaseId === 'c' || phaseId === 'd') {
    return domainReason(phaseId, treatment, ctx);
  }
  switch (phaseId) {
    case 'preliminary':
      if (treatment === 'core') {
        return hasExistingEa
          ? { ja: '既存の原則が今回の対象範囲を覆えていない。使える部分を確かめ、足りない分だけ足す', en: 'The existing principles do not cover this scope. Check what still applies and add only what is missing' }
          : { ja: '承認の経路と原則がまだ無い。ここを飛ばすと、後続の成果物が「誰の承認で正しいのか」を説明できない', en: 'There is no approval path or principle set yet. Skip this and later deliverables cannot say whose approval makes them right' };
      }
      if (treatment === 'light') {
        return hasExistingEa
          ? { ja: '既存の原則とガバナンスがある。棚卸しに留め、今回の案件に効く分だけ更新する', en: 'Principles and governance already exist. Just take stock and refresh only what this engagement needs' }
          : { ja: '原則は 5 個だけ、半日で決める。誰がアーキテクチャ決定を覆せるかだけ明文化すれば足りる', en: 'Five principles, decided in half a day. Writing down who can overturn an architecture decision is enough' };
      }
      return hasExistingEa
        ? { ja: '既存 EA の原則とガバナンスをそのまま流用できる。作り直さない', en: 'The existing principles and governance can be reused as-is. Do not rebuild them' }
        : { ja: '原則を新規に作らず、A で決める範囲と判定基準に統合する。判断が割れた時点で戻す', en: 'Do not author principles; fold them into the scope and success criteria set in A. Restore this the first time a decision splits' };
    case 'a':
      if (treatment === 'core') {
        return {
          ja: 'どんなに小さくても省けない。目的・範囲・成功の判定基準の合意がここで固まる',
          en: 'Never cut, at any size. Purpose, scope, and the definition of success are agreed here',
        };
      }
      return {
        ja: '合意すべきは目的・範囲・判定基準の 3 点だけ。1 回のワークショップで閉じる',
        en: 'Only three things need agreement: purpose, scope, success criteria. Close them in a single workshop',
      };
    case 'e':
      // F を落としているのに「F に任せる」「F が日程表になる」と書くと、同じ表の中で矛盾する
      if (treatment === 'core') {
        if (scale === 'small') {
          return { ja: 'ギャップを実行単位に束ねる作業。ここを省くと「良い絵」で終わる', en: 'This is where gaps become units of work. Cut it and you are left with a nice picture' };
        }
        return cut.has('f')
          ? { ja: '投資判断の材料(価値・規模・順序)を作る。F を今回外している分、着手順と費用の根拠はここだけで揃える', en: 'Produces the material for the investment decision: value, size, sequence. With F cut this round, sequence and cost have to stand up on E alone' }
          : { ja: '投資判断の材料(価値・規模・順序)を作る。E が薄いと F はただの日程表になる', en: 'Produces the material for the investment decision: value, size, sequence. A thin E leaves F as a bare calendar' };
      }
      if (treatment === 'light') {
        return cut.has('f')
          ? {
              ja: '作業パッケージの一覧と粗い着手順までで止める。F は今回外しているので、費用の精緻化は既存の予算プロセスに預ける',
              en: 'Stop at a list of work packages and a rough order. F is cut this round, so cost refinement goes to the existing budget process',
            }
          : {
              ja: '作業パッケージの一覧と粗い着手順までで止める。費用の精緻化は F か既存の予算プロセスに任せる',
              en: 'Stop at a list of work packages and a rough order. Leave cost refinement to F or the existing budget process',
            };
      }
      return {
        ja: '外したが、E が無いとギャップは実行単位にならない。ロードマップは A の合意事項から直接引く前提になる',
        en: 'Dropped — but without E the gaps never become units of work. The roadmap will have to be drawn straight from what A agreed',
      };
    case 'f':
      if (treatment === 'core') {
        return {
          ja: '実装が複数走るので、着手順・予算・体制をここで確定させる。既存のプロジェクト計画プロセスに接続する',
          en: 'Several builds run in parallel, so sequence, budget, and staffing are fixed here. Wire it into the existing project planning process',
        };
      }
      if (treatment === 'light') {
        return {
          ja: '既存のプロジェクト計画・予算プロセスに接続するだけ。新しい様式は作らない',
          en: 'Just wire into the existing project and budget process. Do not invent a new format',
        };
      }
      return scale === 'small'
        ? { ja: '小規模では E と分ける意味が薄い。1 枚のロードマップに統合する', en: 'At this size, separating it from E buys nothing. Fold it into a single roadmap' }
        : { ja: '移行計画を独立して作らず、E のロードマップに着手日と担当の列を足すだけにする', en: 'No standalone migration plan; just add start-date and owner columns to the E roadmap' };
    case 'g':
      if (treatment === 'core') {
        return {
          ja: '実装が複数走る。逸脱の受け口と例外の期限を決めないと、統制が形だけになる',
          en: 'Several builds run in parallel. Without an exception path and expiry dates, governance is decorative',
        };
      }
      if (treatment === 'light') {
        return {
          ja: 'レビューを 1 回だけ置く。逸脱の許可条件を先に書いておけば会議は短くて済む',
          en: 'One review, once. Write the conditions for allowing deviations up front and the meeting stays short',
        };
      }
      return {
        ja: '専用のガバナンスを立てず、既存の設計レビューに相乗りする。逸脱を判断する人だけ 1 名決めておく',
        en: 'No dedicated governance; ride on the existing design review. Just name one person who rules on deviations',
      };
    case 'h':
      if (treatment === 'core') {
        return {
          ja: '複数年で回すなら変更管理が本体。変更を止めず、捌く順路を決める',
          en: 'Over multiple years, change management is the main event. Do not block change — route it',
        };
      }
      if (treatment === 'light') {
        return {
          ja: '変更要求の受け口と、次サイクル送りにする判断者だけ決める。専用の会議体は作らない',
          en: 'Name only the intake point and who defers a request to the next cycle. No dedicated forum',
        };
      }
      return scale === 'large'
        ? {
            ja: '複数年で回す前提だが、今回の期間では変更管理まで届かない。変更要求の受け口と、次サイクルをいつ始めるかだけ決めて閉じる',
            en: 'This is meant to run for years, but the calendar does not reach change management. Close out by naming the intake point and when the next cycle starts',
          }
        : {
            ja: '単発の案件は H を回す前に終わる。変更要求の宛先だけ決めて次回へ送る',
            en: 'A one-off engagement ends before H matters. Just name where change requests go and move on',
          };
    case 'requirements-management':
      if (treatment === 'core') {
        return {
          ja: '要求の変更が来たとき、どの成果物に跳ねるかを追える状態にしておく',
          en: 'Keep it possible to trace which deliverables a requirement change hits',
        };
      }
      if (treatment === 'light') {
        return {
          ja: '要求と決定を 1 つの表で管理する。専用の仕組みは作らない',
          en: 'One table for requirements and decisions. Do not stand up a dedicated tool',
        };
      }
      return {
        ja: '要求の記録を独立させず、A の作業範囲記述書の中で管理する。変更が増えたら分離する',
        en: 'No separate requirements log; track them inside the statement of architecture work. Split it out if changes pile up',
      };
    default:
      // 知らないフェーズが来たら、扱いだけを述べて理由を捏造しない
      return treatment === 'core'
        ? { ja: '標準の扱いのまま残している(この入力からは削る根拠が無い)', en: 'Kept at standard depth — this input gives no basis for cutting it' }
        : treatment === 'light'
          ? { ja: '軽くしている(この入力からは厚くする根拠が無い)', en: 'Lightened — this input gives no basis for going deeper' }
          : { ja: '今回は外している(この入力からは残す根拠が無い)', en: 'Left out — this input gives no basis for keeping it' };
  }
}

/** 最終的な扱いに合わせて理由を作り直す。**扱いを変えたら必ず呼ぶ** */
function applyReasons(plans: PhasePlan[], ctx: TailorContext, timeboxDriven: Set<string>): void {
  const cut = new Set(plans.filter((p) => p.treatment === 'skip').map((p) => p.phaseId));
  for (const p of plans) {
    const base = phaseReason(p.phaseId, p.treatment, ctx, cut);
    const weeks = ctx.timeboxWeeks;
    if (weeks === undefined || !timeboxDriven.has(p.phaseId)) {
      p.reason = base;
      continue;
    }
    const note: Bilingual =
      p.treatment === 'skip'
        ? { ja: `${weeks} 週に収めるため、削る対象をここから取った`, en: `dropped here to fit ${weeksEn(weeks)}` }
        : { ja: `${weeks} 週に収めるため縮小`, en: `trimmed to fit ${weeksEn(weeks)}` };
    p.reason = { ja: `${base.ja}(${note.ja})`, en: `${base.en} (${note.en})` };
  }
}

/** そのフェーズを軽くする / 外すことで何を失い、どう埋めるか(トレードオフを 1 行で) */
interface PhaseTradeoff {
  lose: Bilingual;
  cover: Bilingual;
}

function phaseTradeoff(phaseId: string, treatment: Treatment): PhaseTradeoff | null {
  if (treatment === 'core') return null;
  const light = treatment === 'light';
  switch (phaseId) {
    case 'preliminary':
      return light
        ? {
            lose: { ja: '原則の議論が浅くなり、判断が割れたときの拠り所が弱い', en: 'Thin principles, so there is little to fall back on when a decision splits' },
            cover: { ja: '割れた判断はその場で 1 行の原則として書き足す', en: 'Write each split decision up as a one-line principle on the spot' },
          }
        : {
            lose: { ja: 'アーキテクチャ判断を誰が覆せるかが未定のまま進む', en: 'You proceed without knowing who can overturn an architecture decision' },
            cover: { ja: 'A の作業範囲記述書に決裁者を 1 名だけ書く', en: 'Name exactly one decision maker in the statement of architecture work in A' },
          };
    case 'b':
      return light
        ? {
            lose: { ja: '業務側の現状が粗いまま、システム側の目標を決めることになる', en: 'You set the system-side target while the business baseline is still coarse' },
            cover: { ja: 'E のギャップに「業務手順の変更が要る」行を必ず 1 行入れる', en: 'Force one gap row that says the process itself has to change' },
          }
        : {
            lose: { ja: '業務手順が変わることに現場が気付くのが実装後になりやすい', en: 'The people doing the work often find out their process changed only after go-live' },
            cover: { ja: 'A のステークホルダーに業務側の責任者を 1 名入れ、レビューに呼ぶ', en: 'Put one business owner in the A stakeholder list and bring them to the review' },
          };
    case 'c':
      return light
        ? {
            lose: { ja: 'データとアプリの依存が見えず、統合の手戻りが後で出る', en: 'Data and application dependencies stay invisible, so integration rework surfaces late' },
            cover: { ja: '触るインターフェースだけ一覧にして E のギャップに乗せる', en: 'List just the interfaces you touch and carry them into the E gaps' },
          }
        : {
            lose: { ja: '既存システムのどこに触るかが実装着手まで分からない', en: 'Which existing systems you touch stays unknown until build starts' },
            cover: { ja: 'A で影響しそうなシステム名だけ列挙し、レビューで確認する', en: 'List the likely-affected system names in A and confirm them at the review' },
          };
    case 'd':
      return light
        ? {
            lose: { ja: '非機能(性能・可用性・運用)の要求が後出しになる', en: 'Non-functional needs — performance, availability, operability — arrive late' },
            cover: { ja: 'A の時点で非機能の上限値を 3 つだけ決めておく', en: 'Fix just three non-functional limits back in A' },
          }
        : {
            lose: { ja: '基盤側の制約が着手後に判明し、設計をやり直す危険がある', en: 'Platform constraints surface after build starts and force a redesign' },
            cover: { ja: '運用チームに現行の制約を 1 枚で出してもらう', en: 'Ask the operations team for the current constraints on one page' },
          };
    case 'e':
      return light
        ? {
            lose: { ja: '作業パッケージの費用と価値の見積りが粗くなる', en: 'Cost and value estimates per work package stay coarse' },
            cover: { ja: '着手順だけは確定させ、費用は既存の予算プロセスで詰める', en: 'Fix the order at least, and settle cost in the existing budget process' },
          }
        : {
            lose: { ja: 'ギャップが実行単位に落ちず、ロードマップが希望の一覧になる', en: 'Gaps never become units of work and the roadmap turns into a wish list' },
            cover: { ja: 'ギャップ 1 件につき担当を 1 名付けるところまではやる', en: 'At minimum, put one owner against every gap' },
          };
    case 'f':
      return light
        ? {
            lose: { ja: '予算と体制の確定が後ろにずれる', en: 'Budget and staffing get locked in later than you would like' },
            cover: { ja: '既存の予算サイクルの締切日を A の時点で押さえる', en: 'Pin the existing budget cycle deadline back in A' },
          }
        : {
            lose: { ja: '着手順と担当が文書に残らない', en: 'Nothing on paper records the order of work or who owns each piece' },
            cover: { ja: 'E のロードマップに着手日と担当の 2 列を足す', en: 'Add start-date and owner columns to the E roadmap' },
          };
    case 'g':
      return light
        ? {
            lose: { ja: '実装中の逸脱が記録されず、次の案件で同じ判断を繰り返す', en: 'Deviations during build go unrecorded, so the next engagement re-litigates them' },
            cover: { ja: '逸脱は 1 行でよいので記録し、解消の期限を切る', en: 'Log each deviation in one line with an expiry date' },
          }
        : {
            lose: { ja: '設計どおりに作られたかを確認する場が無い', en: 'There is no point at which anyone checks that what was built matches the design' },
            cover: { ja: '既存の設計レビューにアーキテクトが 1 回出る', en: 'Have the architect attend the existing design review once' },
          };
    case 'h':
      return light
        ? {
            lose: { ja: '変更要求の扱いが属人的になる', en: 'How change requests get handled depends on who catches them' },
            cover: { ja: '受け口 1 名と、次サイクル送りの基準を 1 行決める', en: 'Name one intake owner and write one line of deferral criteria' },
          }
        : {
            lose: { ja: '案件終了後に来た変更要求の宛先が無くなる', en: 'Change requests arriving after the engagement ends have nowhere to go' },
            cover: { ja: '終了報告に「変更要求はここへ」の 1 行を残す', en: 'Leave one line in the closing report saying where change requests go' },
          };
    case 'requirements-management':
      return light
        ? {
            lose: { ja: '要求の変更がどの成果物に跳ねるかを追えない', en: 'You cannot trace which deliverables a requirement change hits' },
            cover: { ja: '要求と決定の表に「跳ねる成果物」の列を 1 つ足す', en: 'Add an affected-deliverable column to the requirements and decisions table' },
          }
        : {
            lose: { ja: '要求が誰の合意で決まったのかが残らない', en: 'No record of whose agreement settled each requirement' },
            cover: { ja: 'A の作業範囲記述書に要求と承認者を並べて書く', en: 'List requirements next to their approver in the statement of architecture work' },
          };
    default:
      return null;
  }
}

/** 規模・目的・既存 EA の有無から、フェーズごとの扱いを決める(理由は applyReasons が付ける) */
function buildPhasePlans(ctx: TailorContext): PhasePlan[] {
  const plans: PhasePlan[] = [];
  const push = (phaseId: string, treatment: Treatment, continuous = false): void => {
    const p = findPhase(phaseId);
    if (!p) return;
    plans.push({
      phaseId,
      code: p.code,
      name: p.name,
      treatment,
      reason: { ja: '', en: '' },
      weight: treatmentWeight(treatment),
      continuous,
    });
  };

  const { scale, hasExistingEa } = ctx;
  push(
    'preliminary',
    hasExistingEa ? (scale === 'large' ? 'light' : 'skip') : scale === 'small' ? 'light' : 'core',
  );
  // A は規模を問わず必須
  push('a', 'core');
  for (const id of ['b', 'c', 'd'] as const) push(id, domainTreatment(id, ctx));
  push('e', 'core');
  push('f', scale === 'small' ? 'skip' : scale === 'large' ? 'core' : 'light');
  push('g', scale === 'large' ? 'core' : 'light');
  push('h', scale === 'large' ? 'core' : 'skip');
  push('requirements-management', scale === 'small' ? 'light' : 'core', true);

  applyReasons(plans, ctx, new Set());
  return plans;
}

/**
 * 期間が足りない場合に、価値の低いフェーズから順に落とす。
 * 1 周では core → light にしか下がらないので、下げられるものが無くなるまで繰り返す。
 * ただし E と「目的が直接指しているドメイン」は light 止まり — そこまで消すと
 * 期間には収まっても案件が目的を果たせなくなり、収まったという結論自体が嘘になる。
 */
function compressToTimebox(
  plans: PhasePlan[],
  ctx: TailorContext,
  timeboxWeeks: number,
): { cut: PhasePlan[]; fits: boolean; needWeeks: number } {
  const matchedDomains = matchedDomainsOf(ctx);
  const nominal = NOMINAL_WEEKS[ctx.scale];
  const weeksOf = (t: Treatment): number => (t === 'core' ? nominal.core : t === 'light' ? nominal.light : 0);
  const estimate = (): number =>
    plans.filter((p) => !p.continuous).reduce((acc, p) => acc + weeksOf(p.treatment), 0);

  const floor = new Set<string>(['e', ...matchedDomains]);
  const order = compressOrder(matchedDomains);
  const cut: PhasePlan[] = [];
  const seen = new Set<string>();

  let changed = true;
  while (estimate() > timeboxWeeks && changed) {
    changed = false;
    for (const id of order) {
      if (estimate() <= timeboxWeeks) break;
      const plan = plans.find((p) => p.phaseId === id);
      if (!plan || plan.treatment === 'skip') continue;
      if (plan.treatment === 'light' && floor.has(id)) continue;
      plan.treatment = downgrade(plan.treatment);
      plan.weight = treatmentWeight(plan.treatment);
      if (!seen.has(id)) {
        seen.add(id);
        cut.push(plan);
      }
      changed = true;
    }
  }

  // 理由は最終的な扱いから作り直す。文を継ぎ足すと「軽量」なのに「両方を描く」のような
  // 逆向きの説明が残ってしまう(レッドチーム指摘)。
  applyReasons(plans, { ...ctx, timeboxWeeks }, seen);

  const needWeeks = estimate();
  return { cut, fits: needWeeks <= timeboxWeeks, needWeeks };
}

/** フェーズごとの目安期間を配分する */
function allocateWeeks(plans: PhasePlan[], scale: Scale, timeboxWeeks: number | undefined): number {
  const nominal = NOMINAL_WEEKS[scale];
  const weeksOf = (p: PhasePlan): number => (p.treatment === 'core' ? nominal.core : nominal.light);
  const active = plans.filter((p) => !p.continuous && p.treatment !== 'skip');
  const nominalTotal = active.reduce((acc, p) => acc + weeksOf(p), 0);
  // 期間に余裕があるなら引き伸ばさない — 早く終わるだけで、フェーズが長くなるわけではない
  const box = timeboxWeeks !== undefined && timeboxWeeks < nominalTotal ? timeboxWeeks : null;
  const weightSum = active.reduce((acc, p) => acc + p.weight, 0);
  for (const p of plans) {
    if (p.continuous || p.treatment === 'skip') {
      p.weeks = undefined;
      continue;
    }
    // 押し込む必要があるときだけ重み配分。それ以外は標準の目安をそのまま使う
    p.weeks =
      box === null
        ? roundHalf(weeksOf(p))
        : weightSum > 0
          ? roundHalf((box * p.weight) / weightSum)
          : roundHalf(box / Math.max(1, active.length));
  }
  // 見出しの合計は丸めたあとの各フェーズの合計に合わせる(表と数字がずれないように)
  return active.reduce((acc, p) => acc + (p.weeks ?? 0), 0);
}

/** レビューをどこに置くかを組む */
interface ReviewGate {
  when: Bilingual;
  who: Bilingual;
  what: Bilingual;
  fail: Bilingual;
}

function buildReviewGates(plans: PhasePlan[], scale: Scale): ReviewGate[] {
  const alive = (id: string): boolean => plans.find((p) => p.phaseId === id)?.treatment !== 'skip';
  const gates: ReviewGate[] = [];

  gates.push({
    when: { ja: 'フェーズ A の終わり', en: 'End of phase A' },
    who: { ja: 'スポンサー + 事業側の責任者', en: 'Sponsor + business owner' },
    what: { ja: '範囲と、成功したと言える判定基準', en: 'The scope, and what will count as success' },
    fail: { ja: '範囲を削る(期間を延ばさない)', en: 'Cut scope — do not extend the calendar' },
  });

  if (scale !== 'small' && (alive('b') || alive('c') || alive('d'))) {
    gates.push({
      when: { ja: 'アーキテクチャ記述が固まった時点', en: 'When the architecture description settles' },
      who: { ja: '業務・IT それぞれの実務責任者', en: 'Hands-on leads from both business and IT' },
      what: { ja: 'ギャップの妥当性と、影響を受ける既存資産', en: 'Whether the gaps are real, and which existing assets they hit' },
      fail: { ja: '対象領域を 1 つ外して描き直す', en: 'Drop one domain and redraw' },
    });
  }

  gates.push({
    when: { ja: '実装着手の前', en: 'Before build starts' },
    who: { ja: '投資判断者 + PMO', en: 'Investment decision maker + PMO' },
    what: { ja: '順序・費用・便益の刈り取り責任者', en: 'Sequence, cost, and who is accountable for the benefit' },
    fail: { ja: '着手を止め、作業パッケージの順序を組み直す', en: 'Hold the start and re-sequence the work packages' },
  });

  if (alive('g')) {
    gates.push({
      when: scale === 'large' ? { ja: '実装中(月次)', en: 'During build (monthly)' } : { ja: '実装の中間で 1 回', en: 'Once, midway through build' },
      who: { ja: 'アーキテクト + 開発リード', en: 'Architect + delivery lead' },
      what: { ja: '逸脱の有無と、逸脱を許してよい条件', en: 'Deviations, and which of them are acceptable' },
      fail: { ja: '例外として記録し、解消の期限を切る', en: 'Log it as an exception with an expiry date' },
    });
  }

  if (alive('h')) {
    gates.push({
      when: { ja: '変更要求が来たとき', en: 'On each change request' },
      who: { ja: '変更を受ける窓口 + アーキテクト', en: 'Change intake owner + architect' },
      what: { ja: '今回の範囲で捌くか、次サイクルに送るか', en: 'Handle it now, or defer to the next cycle' },
      fail: { ja: '次サイクル送りにして、送った事実を残す', en: 'Defer it — and record that you deferred it' },
    });
  }

  return gates;
}

// ---------------------------------------------------------------------------
// explain_for
// ---------------------------------------------------------------------------

type Audience = 'executive' | 'business' | 'engineer' | 'pmo';

interface AudienceProfile {
  name: Bilingual;
  time: Bilingual;
  opener: Bilingual;
  unit: Bilingual;
  visual: Bilingual;
  ask: Bilingual;
  convinced: Bilingual;
  outline: Bilingual[];
  avoid: Bilingual[];
  paraphrase: { term: Bilingual; plain: Bilingual }[];
}

const AUDIENCES: Record<Audience, AudienceProfile> = {
  executive: {
    name: { ja: '経営層', en: 'Executives' },
    time: { ja: '3 分・スライド 1 枚', en: '3 minutes, one slide' },
    opener: {
      ja: '「この判断を◯月までにしないと、△△が起きます」— 結論と期限から入る',
      en: '"If this is not decided by <date>, <consequence> happens." — lead with the conclusion and the deadline',
    },
    unit: { ja: '金額・期間・件数・止まるリスク。フェーズ名や成果物名は出さない', en: 'Money, time, counts, and what stops. No phase names, no deliverable names' },
    visual: { ja: '選択肢 2〜3 案を並べた比較表 1 枚(費用 / 期間 / 残るリスク)', en: 'One comparison table of 2-3 options: cost, time, residual risk' },
    ask: { ja: 'どの案を選ぶか、いつまでに、誰が予算を持つか', en: 'Which option, by when, and who holds the budget' },
    convinced: { ja: '数字の出どころと、外したときの振れ幅が示されたとき', en: 'When they see where the numbers came from and how far they could be off' },
    outline: [
      { ja: '結論と、決めてほしいこと(1 文)', en: 'The conclusion and the decision you need (one sentence)' },
      { ja: '決めなかった場合に起きること(金額か期間で)', en: 'What happens if it is not decided — in money or time' },
      { ja: '選択肢の比較(2〜3 案。推奨を明示する)', en: 'Option comparison — 2-3 options, with your recommendation stated' },
      { ja: '判断の期日と、次に報告する日', en: 'The decision date and when you will report back' },
    ],
    avoid: [
      { ja: 'フレームワークの用語をそのまま使う(相手は手法ではなく結果を買っている)', en: 'Using framework vocabulary — they are buying an outcome, not a method' },
      { ja: '前提と背景の説明から始める(結論が出る前に時間が尽きる)', en: 'Opening with background — you run out of time before the conclusion' },
      { ja: '選択肢を 1 つしか出さない(選ばせない提案は承認ではなく保留になる)', en: 'Offering one option — a proposal with no choice gets deferred, not approved' },
    ],
    paraphrase: [
      { term: { ja: 'ギャップ分析', en: 'Gap analysis' }, plain: { ja: '今のままでは足りないものの一覧', en: 'The list of what today cannot do' } },
      { term: { ja: '移行アーキテクチャ', en: 'Transition architecture' }, plain: { ja: '途中で一度止まれる到達点', en: 'A stopping point you can safely rest at' } },
      { term: { ja: 'ベースライン', en: 'Baseline' }, plain: { ja: '今の状態', en: 'How things are today' } },
      { term: { ja: 'アーキテクチャ原則', en: 'Architecture principles' }, plain: { ja: '迷ったときの判断ルール', en: 'The tie-breaker rules' } },
    ],
  },
  business: {
    name: { ja: '事業・業務部門', en: 'Business / operations' },
    time: { ja: '15 分・具体例中心', en: '15 minutes, driven by examples' },
    opener: {
      ja: '「いまの◯◯の作業が、こう変わります」— 相手の日常業務から入る',
      en: '"Here is how your <task> changes." — start from their daily work',
    },
    unit: { ja: '手順・帳票・担当・所要時間・例外ケース', en: 'Steps, forms, who does it, how long it takes, and the exceptions' },
    visual: { ja: '変更前 / 変更後の業務フローを 1 対で並べる', en: 'Before and after process flows, side by side' },
    ask: { ja: 'この手順で本当に回るか、抜けている例外は何か', en: 'Whether this actually works, and which exceptions are missing' },
    convinced: { ja: '自分の担当業務の実例が 1 つ最後まで通ったとき', en: 'When one real case from their own work runs end to end' },
    outline: [
      { ja: 'いまの困りごと(相手の言葉のまま)', en: 'The current pain, in their own words' },
      { ja: '変更後の 1 日(具体的な手順で)', en: 'A day after the change, as concrete steps' },
      { ja: '変わらない部分(不安の大半はここで消える)', en: 'What does not change — this removes most of the anxiety' },
      { ja: '移行期に起きる不便と、それが続く期間', en: 'The friction during transition, and how long it lasts' },
      { ja: '決めてほしいこと(例外を誰が判断するか)', en: 'What you need from them — who rules on exceptions' },
    ],
    avoid: [
      { ja: 'システム名やレイヤ名で話す(相手の地図と一致していない)', en: 'Talking in system or layer names — that is not the map they hold' },
      { ja: '「標準化します」だけ言って手順を見せない', en: 'Saying "we will standardise" without showing the steps' },
      { ja: '例外ケースを「後で詰めます」で流す(現場が最も恐れる点)', en: 'Waving off exceptions as "to be worked out later" — the thing they fear most' },
    ],
    paraphrase: [
      { term: { ja: 'ビジネスケイパビリティ', en: 'Business capability' }, plain: { ja: 'この組織ができること', en: 'Something this organisation can do' } },
      { term: { ja: 'ターゲットアーキテクチャ', en: 'Target architecture' }, plain: { ja: '変わったあとの仕事のやり方', en: 'How the work runs after the change' } },
      { term: { ja: 'ステークホルダー', en: 'Stakeholder' }, plain: { ja: '関係する人', en: 'The people involved' } },
      { term: { ja: '要求', en: 'Requirement' }, plain: { ja: '守ってほしい条件', en: 'A condition that must hold' } },
    ],
  },
  engineer: {
    name: { ja: 'エンジニア', en: 'Engineers' },
    time: { ja: '30 分・資料より図と実例', en: '30 minutes, diagrams and examples over slides' },
    opener: {
      ja: '「守ってほしい制約はこの 3 つ。理由はこうです」— 制約と根拠から入る',
      en: '"Three constraints, and here is why." — lead with the constraints and their rationale',
    },
    unit: { ja: '制約・インターフェース・非機能要件の数値・既存資産への影響', en: 'Constraints, interfaces, non-functional numbers, and the blast radius on existing assets' },
    visual: { ja: 'C4 のコンテナ図、または ArchiMate のアプリケーション協調ビュー', en: 'A C4 container diagram, or an ArchiMate application co-operation view' },
    ask: { ja: '実装上壊れる箇所の指摘と、より良い代替案', en: 'Where this breaks in practice, and a better alternative' },
    convinced: { ja: '根拠が示され、例外を出す手順が用意されているとき', en: 'When the rationale is visible and there is a documented way to request an exception' },
    outline: [
      { ja: '決まった制約(3 つまで)と、それぞれの根拠', en: 'The constraints — at most three — each with its rationale' },
      { ja: '決まっていないこと(いつ・誰が決めるか)', en: 'What is not decided yet, with who decides and when' },
      { ja: '例外の出し方(申請先・判断基準・期限)', en: 'How to raise an exception: where, on what criteria, and for how long' },
      { ja: '動く具体例を 1 つ(構成・コード・設定のいずれか)', en: 'One worked example — config, code, or topology' },
      { ja: '影響を受ける既存資産と、移行の順番', en: 'Which existing assets are hit, and in what order they move' },
    ],
    avoid: [
      { ja: '根拠を書かずに規約だけ配る(守られないだけでなく信用を失う)', en: 'Handing down rules with no rationale — it loses trust, not just compliance' },
      { ja: '抽象度の高い図だけで済ませる(実装できる粒度まで 1 枚は下ろす)', en: 'Stopping at high-level diagrams — bring at least one down to buildable detail' },
      { ja: '未決事項を既決のように話す(後で全部疑われる)', en: 'Presenting undecided things as decided — everything else gets doubted later' },
    ],
    paraphrase: [
      { term: { ja: 'アーキテクチャ原則', en: 'Architecture principles' }, plain: { ja: '設計判断の優先順位', en: 'Which way to lean when design choices conflict' } },
      { term: { ja: 'アーキテクチャ契約', en: 'Architecture contract' }, plain: { ja: '守る条件と、例外の出し方', en: 'What must hold, and how to request an exception' } },
      { term: { ja: 'ビューポイント', en: 'Viewpoint' }, plain: { ja: '誰の関心に答える図か', en: 'Whose question the diagram answers' } },
      { term: { ja: '移行アーキテクチャ', en: 'Transition architecture' }, plain: { ja: '一度リリースして止まれる状態', en: 'A state you can ship and pause at' } },
    ],
  },
  pmo: {
    name: { ja: 'PMO・計画管理', en: 'PMO / planning' },
    time: { ja: '20 分・表中心', en: '20 minutes, tables over prose' },
    opener: {
      ja: '「作業単位・依存・判断ポイントはこの表の通りです」— 表を先に出す',
      en: '"Here are the work units, the dependencies, and the decision points." — put the table up first',
    },
    unit: { ja: '作業パッケージ・依存関係・マイルストーン・担当・見積の幅', en: 'Work packages, dependencies, milestones, owners, and estimate ranges' },
    visual: { ja: '依存関係を書き込んだロードマップ表(四半期単位)', en: 'A roadmap table by quarter with dependencies written in' },
    ask: { ja: '既存計画との衝突箇所と、リソースの取り合い', en: 'Where this collides with existing plans, and where resources contend' },
    convinced: { ja: '誰がいつ何を決めるかが日付で埋まっているとき', en: 'When who decides what, and on which date, is fully filled in' },
    outline: [
      { ja: '作業パッケージ一覧(担当・期間・成果)', en: 'The work package list: owner, window, outcome' },
      { ja: '依存関係と前提(崩れたら何が止まるか)', en: 'Dependencies and assumptions — and what stops if they break' },
      { ja: '判断ポイント(日付・決定者・決めること)', en: 'Decision points: date, decider, and the question' },
      { ja: '見積が固まっていない範囲と、その幅', en: 'Where the estimates are soft, and by how much' },
      { ja: '報告の頻度と様式(既存の会議体に乗せる)', en: 'Reporting cadence and format — riding an existing forum' },
    ],
    avoid: [
      { ja: '依存関係を書かずに順序だけ出す(組み替えの判断ができない)', en: 'Giving a sequence with no dependencies — nobody can re-plan from it' },
      { ja: '判断ポイントに日付と決定者を入れない', en: 'Leaving decision points without a date and a named decider' },
      { ja: '新しい報告様式を作る(既存の様式に載せた方が続く)', en: 'Inventing a new reporting format — one that rides the existing format survives' },
    ],
    paraphrase: [
      { term: { ja: '作業パッケージ', en: 'Work package' }, plain: { ja: '担当 1 名・成果 1 つの実行単位', en: 'One owner, one outcome, one unit of execution' } },
      { term: { ja: '移行計画', en: 'Migration plan' }, plain: { ja: '順序と、止まれる場所', en: 'The order, and where you can pause' } },
      { term: { ja: 'アーキテクチャガバナンス', en: 'Architecture governance' }, plain: { ja: '判断の場と、逸脱の扱い', en: 'Where decisions happen and how deviations are handled' } },
      { term: { ja: '成果物', en: 'Deliverable' }, plain: { ja: '納品して残るもの', en: 'The thing that gets handed over and kept' } },
    ],
  },
};

// --- 相手の解決(自由記述を受ける) ----------------------------------------

/** 役職の高さ。同じ「業務部門」でも、決裁者と実務担当では話す内容が変わる */
type Seniority = 'exec' | 'head' | 'ic';

const SENIORITY_LABEL: Record<Seniority, Bilingual> = {
  exec: { ja: '役員級(決裁できる)', en: 'Executive level (can decide)' },
  head: { ja: '部門長級(部内は動かせる)', en: 'Department head (can move their own unit)' },
  ic: { ja: '実務担当(手を動かす)', en: 'Individual contributor (does the work)' },
};

const SENIORITY_HINTS: [Seniority, string[]][] = [
  ['exec', ['役員', '取締役', '社長', '会長', '執行', '常務', '専務', '本部長', '事業部長', 'ceo', 'cfo', 'cio', 'cto', 'coo', 'chief', 'president', 'vp', 'board']],
  ['head', ['部長', '課長', '室長', '所長', '工場長', '支店長', 'マネージャ', 'マネジャ', 'リーダー', '責任者', 'head of', 'manager', 'director', 'lead']],
  ['ic', ['担当', 'メンバー', '現場', '実務', 'スタッフ', 'staff', 'member', 'individual']],
];

/** 相手の持ち場。ここが違えば、同じ話でも刺さる単位が変わる */
type DomainId =
  | 'sales' | 'production' | 'finance' | 'hr' | 'it' | 'procurement'
  | 'logistics' | 'quality' | 'legal' | 'support' | 'planning' | 'dev';

interface DomainProfile {
  name: Bilingual;
  /** その持ち場の人が守っている数字 */
  currency: Bilingual;
  /** 変革の話で最初に頭に浮かぶ不安 */
  fear: Bilingual;
  /** その持ち場の人にだけ効く一言 */
  hook: Bilingual;
}

const DOMAIN_HINTS: [DomainId, string[]][] = [
  ['sales', ['営業', '販売', 'セールス', '受注', '商談', '顧客対応', 'sales', 'account']],
  ['production', ['生産', '製造', '工場', '製造部', '生産管理', '製番', 'ライン', 'production', 'manufacturing', 'plant', 'shop floor']],
  ['finance', ['経理', '財務', '会計', '原価', '予実', 'cfo', 'finance', 'accounting', 'controller']],
  ['hr', ['人事', '労務', '人材', '教育', 'hr', 'human resources', 'people']],
  ['it', ['情シス', '情報システム', 'it部', 'インフラ', '運用', '保守', 'ヘルプデスク', 'it department', 'infrastructure', 'operations team']],
  ['procurement', ['調達', '購買', '仕入', 'ベンダー管理', 'procurement', 'purchasing', 'sourcing']],
  ['logistics', ['物流', '倉庫', '配送', '出荷', '在庫', 'logistics', 'warehouse', 'shipping', 'supply chain']],
  ['quality', ['品質', 'qa', '検査', 'トレーサビリティ', 'quality', 'inspection']],
  ['legal', ['法務', 'コンプラ', '契約', '知財', 'legal', 'compliance officer']],
  ['support', ['サポート', 'カスタマー', 'コールセンター', '問い合わせ', 'cs部', 'support desk', 'customer service', 'call centre', 'call center']],
  ['planning', ['経営企画', '企画', '事務局', '統括', 'pmo', 'planning', 'strategy office', 'programme office', 'program office']],
  ['dev', ['開発', '設計', 'アーキテクト', 'sre', 'エンジニア', 'developer', 'engineer', 'architect', 'devops']],
];

const DOMAIN_PROFILES: Record<DomainId, DomainProfile> = {
  sales: {
    name: { ja: '営業・販売', en: 'Sales' },
    currency: { ja: '受注件数・見積のリードタイム・失注理由', en: 'Orders won, quote lead time, reasons deals are lost' },
    fear: { ja: '移行の最中に見積が出せなくなり、その分の商談が落ちること', en: 'Being unable to quote during the cutover, and losing the deals that fall in that window' },
    hook: { ja: '「顧客に返す時間が何分から何分になるか」で話すと、その場で判断できる', en: 'Frame it as "the reply time to a customer goes from X minutes to Y" and they can decide on the spot' },
  },
  production: {
    name: { ja: '生産・製造', en: 'Production' },
    currency: { ja: '生産計画の確定日・納期遵守率・ライン停止時間・在庫', en: 'Plan freeze date, on-time delivery, line downtime, inventory' },
    fear: { ja: '切替の週に生産計画が立たず、ラインが止まること', en: 'Losing the production plan in cutover week and stopping the line' },
    hook: { ja: '「計画を確定する日が何日ずれるか」を最初に言う。ここがずれなければ大抵は通る', en: 'Lead with how many days the plan freeze moves. If it does not move, most objections disappear' },
  },
  finance: {
    name: { ja: '経理・財務', en: 'Finance' },
    currency: { ja: '月次締めの日数・監査対応の工数・原価の精度', en: 'Days to close, audit effort, cost accuracy' },
    fear: { ja: '締めが 1 日でも延びること、監査で説明できない数字が出ること', en: 'The close slipping by even one day, or a number nobody can explain to the auditor' },
    hook: { ja: '「締めの日数」と「証跡がどう残るか」の 2 点だけで話が進む', en: 'Two points move this conversation: days to close, and how the audit trail is kept' },
  },
  hr: {
    name: { ja: '人事・労務', en: 'HR' },
    currency: { ja: '要員数・教育工数・入退社の処理時間', en: 'Headcount, training hours, joiner/leaver processing time' },
    fear: { ja: '新しい仕組みの教育が現場の負担として丸ごと乗ってくること', en: 'Training for the new system landing entirely on the operating units' },
    hook: { ja: '教育の総工数と、誰がその時間を出すのかを先に決めておく', en: 'Settle the total training hours and whose budget covers them before the meeting' },
  },
  it: {
    name: { ja: '情報システム・運用', en: 'IT / operations' },
    currency: { ja: '障害件数・復旧時間・保守費・問い合わせ件数', en: 'Incidents, recovery time, maintenance spend, ticket volume' },
    fear: { ja: '新旧が並走する期間に、運用の負荷だけが二重になること', en: 'Carrying double the operational load through the parallel-run window' },
    hook: { ja: '二重運用の期間と、その間の当番をどう増やすかを数字で出す', en: 'Put a number on the parallel-run window and on the extra on-call it needs' },
  },
  procurement: {
    name: { ja: '調達・購買', en: 'Procurement' },
    currency: { ja: '発注リードタイム・仕入単価・取引先数', en: 'Order lead time, unit price, supplier count' },
    fear: { ja: '取引先に新しい手順を強いることになり、断られること', en: 'Having to push a new process onto suppliers and being refused' },
    hook: { ja: '取引先側の手順が変わるか変わらないかを、最初に断言する', en: 'State up front whether anything changes on the supplier side' },
  },
  logistics: {
    name: { ja: '物流・倉庫', en: 'Logistics' },
    currency: { ja: '出荷リードタイム・誤出荷率・在庫差異', en: 'Ship lead time, mis-ship rate, inventory variance' },
    fear: { ja: '切替直後に在庫数が合わなくなり、出荷が止まること', en: 'Stock counts diverging right after cutover and shipping halting' },
    hook: { ja: '在庫の突合をいつ・誰がやるかを、切替計画に明記しておく', en: 'Name the date and the person for the stock reconciliation inside the cutover plan' },
  },
  quality: {
    name: { ja: '品質保証', en: 'Quality' },
    currency: { ja: '不良率・是正処置の期間・トレーサビリティの追跡時間', en: 'Defect rate, corrective-action time, traceability lookup time' },
    fear: { ja: '過去データの追跡が切れて、監査や回収に答えられなくなること', en: 'Losing the trace back through historical data when an audit or recall hits' },
    hook: { ja: '「過去何年分を、何秒で追えるか」を数字で示す', en: 'Give the number: how many years back, retrievable in how many seconds' },
  },
  legal: {
    name: { ja: '法務・コンプライアンス', en: 'Legal / compliance' },
    currency: { ja: '契約の改訂件数・規制対応の期限・証跡の保存年数', en: 'Contract amendments, regulatory deadlines, retention periods' },
    fear: { ja: '規制上の要件が設計に落ちておらず、後から作り直しになること', en: 'A regulatory requirement missing from the design and forcing a rebuild later' },
    hook: { ja: '要件を「守る/守らない」ではなく「どう証明するか」で書く', en: 'Write requirements as how you prove them, not whether you meet them' },
  },
  support: {
    name: { ja: 'カスタマーサポート', en: 'Customer support' },
    currency: { ja: '一次回答時間・エスカレーション率・問い合わせ件数', en: 'First response time, escalation rate, ticket volume' },
    fear: { ja: '切替直後の問い合わせ急増を、増員なしで受けさせられること', en: 'Absorbing the post-cutover ticket spike with no extra people' },
    hook: { ja: '切替後 2 週間の問い合わせ増を見込み、その期間の増員を先に約束する', en: 'Forecast the two-week spike and commit the extra hands before you ask for anything' },
  },
  planning: {
    name: { ja: '経営企画・事務局', en: 'Corporate planning' },
    currency: { ja: '既存計画との整合・報告様式・投資枠', en: 'Fit with existing plans, reporting format, the funding envelope' },
    fear: { ja: '既に走っている別の施策と資源を取り合うこと', en: 'Contending for resources with programmes already in flight' },
    hook: { ja: '既存の会議体と様式に載せる形で出す。新しい枠を作らない', en: 'Deliver it inside the existing forum and format. Do not create a new envelope' },
  },
  dev: {
    name: { ja: '開発・設計', en: 'Development' },
    currency: { ja: 'リリース間隔・障害率・技術的負債の量', en: 'Release cadence, change failure rate, accumulated debt' },
    fear: { ja: '根拠のない制約が降ってきて、実装が回らなくなること', en: 'Constraints arriving without rationale and making the build impossible' },
    hook: { ja: '制約は 3 つまで。それぞれに理由と、例外を出す手順を添える', en: 'At most three constraints, each with its rationale and a documented exception path' },
  },
};

const AUDIENCE_HINTS: [Audience, string[]][] = [
  ['executive', ['経営層', '経営陣', '経営会議', '役員', '取締役', '社長', '会長', '執行', '常務', '専務', 'ceo', 'cfo', 'cio', 'cto', 'coo', 'スポンサー', '決裁者', '投資委員会', 'executive', 'exec', 'chief', 'president', 'board', 'sponsor', 'c-level']],
  ['business', ['営業', '販売', '生産', '製造', '工場', '調達', '購買', '物流', '倉庫', '品質', '人事', '労務', '経理', '財務', '法務', '業務', '現場', '店舗', 'サポート', 'カスタマー', '利用部門', '事業部', 'ユーザー', '利用者', 'business', 'operations', 'sales', 'manufacturing', 'plant', 'procurement', 'logistics', 'quality', 'hr', 'legal', 'end user', 'user']],
  ['engineer', ['エンジニア', '開発', '設計', 'アーキテクト', 'インフラ', 'sre', '情シス', '情報システム', '技術者', 'ベンダー', 'ベンダ', '運用チーム', 'engineer', 'developer', 'architect', 'infrastructure', 'devops', 'technical', 'implementation team']],
  ['pmo', ['pmo', 'プロジェクトマネージャ', 'プロジェクトマネジャ', '事務局', '経営企画', '企画部', '計画管理', '進捗管理', '統括', 'project manager', 'programme office', 'program office', 'portfolio', 'planning office']],
];

interface ResolvedAudience {
  archetype: Audience;
  /** 表示に使う呼び名(自由記述ならその文字列) */
  label: string;
  seniority: Seniority | null;
  domain: DomainId | null;
  /** 役割から型を判定できたか */
  resolved: boolean;
  /** 4 択そのものが渡されたか */
  exact: boolean;
}

/** 語の合計文字数でスコアリングする(長い語ほど具体的とみなす) */
function hintScore(text: string, hints: string[]): number {
  return hints.filter((h) => matchesKeyword(text, h)).reduce((acc, h) => acc + h.length, 0);
}

/**
 * audience の自由記述から、話し方の型・役職の高さ・持ち場を読む。
 * 4 択だけでは「営業本部長」と「生産管理部長」が同じ出力になるため、持ち場を別に取る。
 */
function resolveAudience(raw: string): ResolvedAudience {
  // 60 文字を超える相手の書き方はそのまま見出しに載せられないが、
  // 黙って切ると「自分が書いた肩書きと違うものが返ってきた」と読める。切った旨と残り字数を出す。
  const label = capInline(flat(raw), 60) || 'business';
  const lower = label.toLowerCase();
  const exact = (['executive', 'business', 'engineer', 'pmo'] as const).includes(lower as Audience);
  if (exact) {
    return {
      archetype: lower as Audience,
      label,
      seniority: lower === 'executive' ? 'exec' : null,
      domain: null,
      resolved: true,
      exact: true,
    };
  }
  const scored = AUDIENCE_HINTS.map(([a, hints]) => ({ a, score: hintScore(lower, hints) })).sort(
    (x, y) => y.score - x.score,
  );
  const best = scored[0];
  const archetype: Audience = best && best.score > 0 ? best.a : 'business';
  const seniority = SENIORITY_HINTS.find(([, hints]) => hintScore(lower, hints) > 0)?.[0] ?? null;
  const domainScored = DOMAIN_HINTS.map(([d, hints]) => ({ d, score: hintScore(lower, hints) })).sort(
    (x, y) => y.score - x.score,
  );
  const domain = domainScored[0] && domainScored[0].score > 0 ? domainScored[0].d : null;
  return { archetype, label, seniority, domain, resolved: Boolean(best && best.score > 0), exact: false };
}

// --- topic から論点を拾う ---------------------------------------------------

type SignalId = 'money' | 'deadline' | 'failure' | 'scale' | 'people' | 'tech' | 'risk' | 'decision' | 'unsettled';

interface SignalDef {
  id: SignalId;
  label: Bilingual;
  patterns: RegExp[];
  /** 相手の型ごとの「この論点の意味」と「話し方」 */
  per: Record<Audience, { meaning: Bilingual; say: Bilingual }>;
}

const SIGNAL_DEFS: SignalDef[] = [
  {
    id: 'money',
    label: { ja: '金額が書かれている', en: 'A money figure is stated' },
    patterns: [
      /\d[\d,.]*\s*(?:兆|億|千万|百万|万)\s*円/,
      /[¥$€]\s?\d[\d,.]*\s*(?:億|万|billion|million|bn|m|k)?/i,
      /\d[\d,.]*\s*(?:billion|million|bn|usd|jpy|yen|dollars?|pounds?)/i,
      /(?:予算|投資額|投資規模|費用|コスト|金額|budget|capex|opex|investment)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '判断の重さがここで決まる。桁が違えば会議体も承認者も変わる', en: 'This sets the weight of the decision. A different order of magnitude means a different forum and a different approver' },
        say: { ja: '桁と振れ幅を先に言う。内訳は聞かれてから出す', en: 'Lead with the order of magnitude and the range. Hold the breakdown until asked' },
      },
      business: {
        meaning: { ja: '現場には金額そのものはほぼ効かない。自部門の工数に翻訳して初めて意味を持つ', en: 'The figure itself lands weakly here. It only means something once translated into their own hours' },
        say: { ja: '金額ではなく「この作業が何分減るか」に置き換える', en: 'Swap the money for "this task drops from X minutes to Y"' },
      },
      engineer: {
        meaning: { ja: '金額は制約として効く。使える範囲が決まり、選べる方式が絞られる', en: 'Money lands as a constraint: it fixes the envelope and narrows the viable approaches' },
        say: { ja: '「この金額だと選べるのはこの 2 方式」まで落として渡す', en: 'Take it down to "at this number, these two approaches remain"' },
      },
      pmo: {
        meaning: { ja: '見積の幅と、どの費目に載るかが計画の前提になる', en: 'The estimate range and which budget line it sits on become planning assumptions' },
        say: { ja: '金額は幅で出し、幅が縮む時期(いつ確定するか)を添える', en: 'Give it as a range, with the date the range narrows' },
      },
    },
  },
  {
    id: 'deadline',
    label: { ja: '期日・時期が書かれている', en: 'A date or deadline is stated' },
    patterns: [
      /\d{4}\s*[-年/]\s*\d{1,2}\s*月?/,
      /(?:来月|来週|今月中|今期|来期|年度内|年度末|期末|上期|下期|第[1-4一二三四]四半期|Q[1-4])/i,
      /\d{1,2}\s*月末?まで/,
      /(?:期限|納期|いつまで|締切|deadline|due date|by the end of)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '期日は「決めない」という選択肢を潰す唯一の道具', en: 'A date is the only tool that removes "do nothing" from the options' },
        say: { ja: '「◯月までに決めないと△△が起きる」の形にする。期日だけ言っても動かない', en: 'Say "if this is not decided by <date>, <consequence> happens". A date alone moves nobody' },
      },
      business: {
        meaning: { ja: '期日は不安に変わる。「その日に何が変わるのか」が分からないと反対に回る', en: 'A date turns into anxiety. Without knowing what changes on the day, they oppose it' },
        say: { ja: 'その日に現場の何が変わり、何が変わらないかを 2 行で書く', en: 'Write two lines: what changes for them on the day, and what does not' },
      },
      engineer: {
        meaning: { ja: '期日は品質か範囲のどちらかを削る合図。どちらを削るかを決めるのは相手ではない', en: 'A date is a signal that quality or scope gets cut. Which one is not theirs to decide' },
        say: { ja: '期日を守るために何を削るのかを、選択肢として先に出す', en: 'Present up front, as options, what gets cut to hold the date' },
      },
      pmo: {
        meaning: { ja: '逆算の起点。ここから判断ポイントと依存関係が全部決まる', en: 'The anchor for backward planning: decision points and dependencies all fall out of it' },
        say: { ja: 'その日付から逆算した判断ポイントを、日付と決定者つきで表にする', en: 'Table the decision points derived backward from it, each with a date and a named decider' },
      },
    },
  },
  {
    id: 'failure',
    label: { ja: '過去の失敗・停滞に触れている', en: 'A past failure or stall is mentioned' },
    patterns: [
      /(?:頓挫|失敗|中止|白紙|炎上|やり直し|作り直し|リカバリ|失注|凍結|延期|遅延|撤退|見送り)/,
      /(?:stalled|failed|failure|cancelled|canceled|abandoned|overrun|rework|write-?off|delayed|shelved)/i,
    ],
    per: {
      executive: {
        meaning: { ja: 'いま最大の論点はこれ。「今回は何が違うのか」に答えない提案は、内容に関係なく通らない', en: 'This is the live question. A proposal that does not answer "what is different this time" fails regardless of its content' },
        say: { ja: '前回止まった理由を 1 文で認め、今回それが再発しない根拠を 1 文で置く。この 2 文を冒頭に', en: 'One sentence naming why it stopped, one sentence on why that cannot recur. Both in the opening' },
      },
      business: {
        meaning: { ja: '現場は前回の作業が無駄になった記憶を持っている。協力を取りに行く前にそこを外せない', en: 'The operating units remember the wasted effort. You cannot ask for cooperation without addressing it' },
        say: { ja: '前回集めた要件・資料のどれを今回も使うかを具体的に挙げる。捨てないと言う', en: 'Name which of the requirements and material from last time you are reusing. Say it is not being thrown away' },
      },
      engineer: {
        meaning: { ja: '前回止まった技術的な理由が残っていれば、今回も同じ場所で止まる', en: 'If the technical reason it stopped is still there, it stops in the same place again' },
        say: { ja: '前回の詰まった箇所を名指しし、今回その箇所をどう回避するかを図で見せる', en: 'Name the exact place it jammed and show, in a diagram, how this design routes around it' },
      },
      pmo: {
        meaning: { ja: '過去の停滞は見積の根拠になる。前回の実績はどんな類推見積より当てになる', en: 'A past stall is estimating evidence. Last time is more reliable than any analogy' },
        say: { ja: '前回どこで何か月止まったかを表に入れ、今回のバッファの根拠にする', en: 'Put where and for how long it stalled into the table, and use it as the basis for this plan\'s buffer' },
      },
    },
  },
  {
    id: 'scale',
    label: { ja: '全社規模・基幹の話である', en: 'It is enterprise-scale or mission-critical' },
    patterns: [
      /(?:全社|基幹|全部門|全拠点|複数拠点|グループ全体|全国|全世界|数千|数万|止まると)/,
      /(?:enterprise[- ]wide|company[- ]wide|group[- ]wide|mission[- ]critical|core system|nationwide)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '規模は「失敗したときの損害」に直結する。承認の重さがここで跳ね上がる', en: 'Scale maps straight onto the cost of failure, and that raises the bar for approval' },
        say: { ja: '止まったときに何が何日止まるかを、金額ではなく事業の言葉で 1 行', en: 'One line, in business terms rather than money: what stops, and for how many days' },
      },
      business: {
        meaning: { ja: '全社の話は「自分の部門の都合が聞かれない」という警戒を生む', en: 'Anything enterprise-wide triggers the fear that their unit\'s specifics will be ignored' },
        say: { ja: '例外は後で詰めます、と言わない。その部門の例外を 1 つ、その場で扱う', en: 'Never say exceptions are for later. Take one of their exceptions and work it on the spot' },
      },
      engineer: {
        meaning: { ja: '規模は非機能要件の数値に翻訳される。同時接続・データ量・停止許容時間', en: 'Scale translates into non-functional numbers: concurrency, data volume, tolerable downtime' },
        say: { ja: '規模を形容詞ではなく数値で渡す。「大規模」では設計できない', en: 'Hand over numbers, not adjectives. "Large-scale" is not a design input' },
      },
      pmo: {
        meaning: { ja: '規模は依存関係の数として現れる。他施策との資源の取り合いが最大の敵', en: 'Scale shows up as dependency count. Resource contention with other programmes is the main threat' },
        say: { ja: '既に走っている施策との衝突箇所を先に挙げる。後から出ると計画ごと崩れる', en: 'List the collisions with in-flight programmes first. Surfaced late, they take the whole plan with them' },
      },
    },
  },
  {
    id: 'people',
    label: { ja: '現場・利用者への影響が論点', en: 'The impact on the people doing the work is at stake' },
    patterns: [
      /(?:現場|従業員|社員|職員|ユーザー|ユーザ|利用者|運用|オペレーション|工数|人手|要員|負担|教育|定着)/,
      /(?:end ?user|employee|staff|operator|adoption|training|workload|change fatigue)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '定着しない仕組みへの投資は、会計上は資産でも実態は損失', en: 'An investment nobody adopts is an asset on paper and a loss in practice' },
        say: { ja: '定着をどう測るのか(指標 1 つ)と、測る時期を 1 行で置く', en: 'One line: the single metric for adoption, and when it gets read' },
      },
      business: {
        meaning: { ja: 'ここが本題。相手が本当に聞きたいのは「私の 1 日がどう変わるか」だけ', en: 'This is the whole conversation. The only question they have is how their day changes' },
        say: { ja: '実在する 1 件の業務を、変更前と変更後で最後まで通して見せる', en: 'Take one real case from their work and run it end to end, before and after' },
      },
      engineer: {
        meaning: { ja: '利用者の実際の手順は、設計上の前提を静かに壊す最大の要因', en: 'How people actually work is the main thing that quietly breaks design assumptions' },
        say: { ja: '例外ケースを 3 つ現場から取り、それが動くことを実例で示す', en: 'Take three exception cases from the floor and demonstrate they run' },
      },
      pmo: {
        meaning: { ja: '教育と移行期の増員は、計画から最も落ちやすい費目', en: 'Training and parallel-run staffing are the line items most often missing from the plan' },
        say: { ja: '教育工数と移行期の増員を、独立した作業パッケージとして計画に載せる', en: 'Carry training hours and cutover staffing as their own work packages' },
      },
    },
  },
  {
    id: 'tech',
    label: { ja: '技術方式・移行方式が論点', en: 'A technical or migration approach is at stake' },
    patterns: [
      /(?:クラウド|オンプレ|saas|erp|crm|api|マイクロサービス|コンテナ|kubernetes|データ連携|マスタ|レガシー|移行|統合|内製|生成ai|llm|パッケージ|スクラッチ)/i,
      /(?:cloud|on-?prem|legacy|microservice|integration|migration|replatform|in-?house build)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '技術の選択そのものは経営層の関心ではない。関心は「乗り換えの自由が残るか」', en: 'The technology choice itself is not their concern. Whether you can switch later is' },
        say: { ja: '製品名を出さず、「この選択で後から変えられなくなるもの」を 1 行だけ言う', en: 'Skip product names. One line on what this choice locks in' },
      },
      business: {
        meaning: { ja: '技術の話は業務の話に翻訳されない限り、聞き流される', en: 'Technology talk is tuned out unless it is translated into the work' },
        say: { ja: '方式の名前を出さずに、業務手順がどう変わるかだけを話す', en: 'Drop the approach name entirely and talk only about how the steps change' },
      },
      engineer: {
        meaning: { ja: 'ここが本題。ただし相手が知りたいのは結論ではなく、その結論に至った制約', en: 'This is the conversation — but what they want is the constraints behind the conclusion, not the conclusion' },
        say: { ja: '制約 3 つと、それぞれの根拠。加えて例外を出す手順を必ず添える', en: 'Three constraints with their rationale, plus the documented path to request an exception' },
      },
      pmo: {
        meaning: { ja: '方式の違いは、期間と依存関係の違いとして計画に出る', en: 'Different approaches show up in the plan as different durations and dependencies' },
        say: { ja: '方式ごとに「期間・依存・止まれる場所」を並べた比較表にする', en: 'Compare approaches by duration, dependencies, and where you can pause' },
      },
    },
  },
  {
    id: 'risk',
    label: { ja: 'リスク・規制・統制が絡む', en: 'Risk, regulation, or control is involved' },
    patterns: [
      /(?:リスク|監査|指摘|規制|コンプラ|個人情報|情報漏|インシデント|障害|停止|セキュリティ|統制|内部統制|認証)/,
      /(?:risk|audit|finding|compliance|regulat|incident|outage|breach|security|control)/i,
    ],
    per: {
      executive: {
        meaning: { ja: 'リスクは「誰が引き受けるのか」まで言わないと、判断ではなく報告で終わる', en: 'Risk without a named acceptor is a report, not a decision' },
        say: { ja: '残るリスクを 1 つに絞り、それを誰が受容するかを名指しで確認する', en: 'Reduce it to one residual risk and ask, by name, who accepts it' },
      },
      business: {
        meaning: { ja: '統制の強化は、現場には「手間が増える」としか見えない', en: 'Tighter control reads, from the floor, as nothing but extra steps' },
        say: { ja: '増える手間を正直に言い、その代わり何が減るのかを同じ行に書く', en: 'State the extra steps honestly, and on the same line what goes away in return' },
      },
      engineer: {
        meaning: { ja: '規制要件は「守る/守らない」ではなく「どう証明するか」の設計問題', en: 'A regulatory requirement is a design problem about proof, not about compliance intent' },
        say: { ja: '要件ごとに検証方法(何を見れば満たしていると言えるか)を併記する', en: 'Pair every requirement with how it gets verified — what you look at to say it holds' },
      },
      pmo: {
        meaning: { ja: '規制の期限は交渉できない。計画上、唯一動かせない日付になる', en: 'Regulatory dates are not negotiable — the one immovable date in the plan' },
        say: { ja: '規制期限を先に置き、他の日程をそこから逆算する', en: 'Place the regulatory date first and derive everything else backward from it' },
      },
    },
  },
  {
    id: 'decision',
    label: { ja: '判断・承認を求める話である', en: 'You are asking for a decision' },
    patterns: [
      /(?:判断|承認|決裁|稟議|選定|意思決定|再開|可否|方針を決|go\b|ゴーサイン)/i,
      /(?:approve|approval|decide|decision|select|sign-?off|go\/no-?go|green ?light)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '相手の仕事は選ぶこと。選択肢が 1 つなら、それは承認ではなく保留になる', en: 'Their job is to choose. With one option on the table, you get deferral, not approval' },
        say: { ja: '2〜3 案を並べ、推奨を明示する。推奨しない案の欠点も書く', en: 'Put 2-3 options up and state your recommendation, including what is wrong with the ones you did not pick' },
      },
      business: {
        meaning: { ja: '業務部門に求める判断は「例外を誰が裁くか」に絞ると通りやすい', en: 'The decision worth asking of an operating unit is who rules on exceptions' },
        say: { ja: '大きな承認を求めない。例外の判断者を 1 名決めてもらう', en: 'Do not ask for a big approval. Ask them to name one person who rules on exceptions' },
      },
      engineer: {
        meaning: { ja: '決めてほしいのは実装可否ではなく、選んだ制約で本当に作れるかの検証', en: 'What you need is not their approval but a check that the chosen constraints are buildable' },
        say: { ja: '「壊れる箇所を挙げてほしい」と依頼の形で渡す。承認を求めない', en: 'Ask them to name where it breaks. Do not ask for sign-off' },
      },
      pmo: {
        meaning: { ja: '判断は日付と決定者がセットで初めて計画に載る', en: 'A decision only enters the plan once it has a date and a named decider' },
        say: { ja: '判断ポイントを表にし、日付・決定者・決める内容の 3 列を埋める', en: 'Table the decision points with three columns filled: date, decider, and the question' },
      },
    },
  },
  {
    id: 'unsettled',
    label: { ja: 'まだ決まっていない部分がある', en: 'Parts of it are still undecided' },
    patterns: [
      /(?:未定|検討中|要検討|たたき台|ドラフト|仮に|仮の|不明|わからない|模索|見えていない)/,
      /(?:tbd|undecided|unclear|draft|to be determined|not yet decided)/i,
    ],
    per: {
      executive: {
        meaning: { ja: '未決を隠すと、他の全部の話も疑われる。先に出せば信用の材料になる', en: 'Hidden unknowns cast doubt on everything else you said. Volunteered, they buy credibility' },
        say: { ja: '「まだ決まっていないのはこの 2 つ。いつ誰が決めるか」を先に置く', en: 'Open with the two things not yet settled, and who settles them when' },
      },
      business: {
        meaning: { ja: '未決部分は現場の想像で埋められ、たいてい最悪の形で伝わる', en: 'Unknowns get filled in by imagination, and the version that spreads is the worst one' },
        say: { ja: '未決の範囲を明示し、決まるまで現在の運用が続くことを明言する', en: 'Bound the unknown and state plainly that today\'s process continues until it is settled' },
      },
      engineer: {
        meaning: { ja: '未決事項を既決のように話すと、他の決定も全部疑われる', en: 'Presenting an open question as settled makes every other decision suspect' },
        say: { ja: '未決の一覧を「いつ・誰が決めるか」つきで渡す。仮決めなら仮決めと書く', en: 'Hand over the open list with who decides and when. If it is provisional, label it provisional' },
      },
      pmo: {
        meaning: { ja: '未決事項は前提として計画に載せる。崩れたら何が止まるかまで書く', en: 'Open items belong in the plan as assumptions, with what stops if they break' },
        say: { ja: '前提の一覧を作り、それぞれに「確定期限」と「崩れたときの影響」を付ける', en: 'List the assumptions, each with a date it firms up and what happens if it does not' },
      },
    },
  },
];

interface DetectedSignal {
  def: SignalDef;
  /** topic から実際に拾った文字列 */
  evidence: string;
}

/** topic から論点を拾う(拾えなかった論点は出さない) */
function detectSignals(topic: string): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const def of SIGNAL_DEFS) {
    for (const pattern of def.patterns) {
      const m = pattern.exec(topic);
      if (m && m[0].trim().length > 0) {
        out.push({ def, evidence: clip(m[0], 24) });
        break;
      }
    }
  }
  return out;
}

/** 話の重さ。同じ相手でも、重い話と軽い話では組み立てが違う */
type Weight = 'heavy' | 'medium' | 'light';

function topicWeight(topic: string, signals: DetectedSignal[]): Weight {
  const has = (id: SignalId): boolean => signals.some((s) => s.def.id === id);
  const bigMoney = /(?:兆|億)/.test(topic) || /(?:billion|bn\b)/i.test(topic);
  if (bigMoney || (has('failure') && has('scale')) || (has('scale') && has('risk'))) return 'heavy';
  if (!has('money') && !has('deadline') && !has('failure') && !has('scale') && !has('risk')) return 'light';
  return 'medium';
}

/** 重さ × 相手の型から、話す前の見立てを 1 段落で返す */
const WEIGHT_READ: Record<Weight, Record<Audience, Bilingual>> = {
  heavy: {
    executive: {
      ja: 'この topic は、金額か規模か過去の失敗のどれかを抱えている。経営層の議題としては「重い」側。3 分のうち最初の 20 秒を結論と期限に使い、背景は一切話さないこと。背景から入ると、結論に着く前に質問で会議が終わる。',
      en: 'This topic carries money, scale, or a past failure. It is a heavy item for an executive forum. Spend the first 20 seconds of your three minutes on the conclusion and the date, and give no background at all — background invites questions that consume the meeting before the conclusion lands.',
    },
    business: {
      ja: '重い案件ほど、現場は「また上で決まった話が降ってくる」と身構える。規模の話を一切せず、その部門の 1 業務だけを最後まで通して見せるほうが早い。',
      en: 'The heavier the programme, the more the floor braces for another decision handed down from above. Say nothing about scale; walk one of their own tasks end to end instead.',
    },
    engineer: {
      ja: '重い案件では制約が多くなりがちだが、渡す制約は 3 つまでに絞る。4 つ目からは守られず、守られない規約は他の 3 つの信用も落とす。',
      en: 'Heavy programmes breed constraints. Hand over at most three. From the fourth onward they get ignored, and ignored rules discredit the three that mattered.',
    },
    pmo: {
      ja: '重い案件は、既存の施策との資源の取り合いで壊れる。先に衝突箇所を出すこと。後から出た衝突は、計画の作り直しではなく計画への不信になる。',
      en: 'Heavy programmes break on resource contention with what is already running. Surface the collisions first; a collision found late costs trust, not just a replan.',
    },
  },
  medium: {
    executive: {
      ja: '判断材料は出せる規模の話。選択肢を 2〜3 案並べ、推奨を明示すること。1 案しか出さない提案は、承認ではなく「持ち帰り」になる。',
      en: 'This is sized so a decision can actually be made. Put 2-3 options up with your recommendation stated. A single-option proposal comes back as "let us take that away", not as approval.',
    },
    business: {
      ja: '相手の日常業務から入れる規模。変更前・変更後の手順を 1 対で見せ、「変わらない部分」を必ず言うこと。不安の大半はそこで消える。',
      en: 'Small enough to open from their daily work. Show before and after side by side, and always name what does not change — that is where most of the anxiety goes.',
    },
    engineer: {
      ja: '制約と根拠を渡せば動く規模。決まっていないことを先に言えば、後の設計判断が疑われずに済む。',
      en: 'Sized so constraints plus rationale are enough to get moving. Naming the open questions first keeps later design decisions from being second-guessed.',
    },
    pmo: {
      ja: '既存の会議体と様式に載せられる規模。新しい報告フォーマットを作らないこと。既存様式に載ったものだけが続く。',
      en: 'Sized to ride the existing forum and format. Do not invent a new report — only the ones that ride an existing format survive.',
    },
  },
  light: {
    executive: {
      ja: '**この topic には金額も期日も止まるリスクも書かれていない。** その状態で経営層の時間を取る理由が必要になる。部門長の決裁で通るなら、そちらのほうが速い。どうしても上げるなら、論点を「他部門へ横展開するか」「全社標準にするか」に置き換えること — 経営層が判断できる形はそちらだけ。',
      en: '**No money, no date, and no stoppage risk appear in this topic.** You then need a reason to take executive time at all. If a department head can approve it, that route is faster. If it must go up, convert the question into "do we roll this out to other units" or "does this become the company standard" — those are the shapes an executive can actually decide.',
    },
    business: {
      ja: '軽い話ほど、現場の合意は速く取れる。1 日の手順が具体的に見えれば、それで足りる。資料を厚くすると逆に警戒される。',
      en: 'Light topics get agreement fastest. Show what a day looks like concretely and that is enough. A thick deck here reads as something being hidden.',
    },
    engineer: {
      ja: '軽い話に重い制約を付けない。守るべき点が 1 つで済むなら 1 つにする。過剰な統制は、次に本当に必要な統制を通せなくする。',
      en: 'Do not hang heavy constraints on a light topic. If one rule suffices, ship one rule. Over-governing here is what makes the next necessary rule impossible to land.',
    },
    pmo: {
      ja: '軽い話を正式な作業パッケージに切ると、管理コストのほうが高くつく。既存の作業の中に入れられないか先に確認すること。',
      en: 'Cutting a light topic into a formal work package can cost more to administer than to do. Check first whether it fits inside work that is already running.',
    },
  },
};

// --- 言い換え(topic に出てきた語だけ) --------------------------------------

interface JargonEntry {
  term: Bilingual;
  /** topic 内で探す語 */
  patterns: string[];
  /** 相手の型ごとの言い換え(無ければ fallback) */
  plain: Partial<Record<Audience, Bilingual>>;
  fallback: Bilingual;
}

const JARGON: JargonEntry[] = [
  {
    term: { ja: 'ギャップ分析', en: 'Gap analysis' },
    patterns: ['ギャップ', 'gap analysis'],
    plain: {
      executive: { ja: '今のままでは足りないものの一覧', en: 'The list of what today cannot do' },
      business: { ja: '今のやり方で困っていることの棚卸し', en: 'A stocktake of what does not work today' },
      pmo: { ja: '作業を洗い出すための差分一覧', en: 'The difference list that work items come from' },
    },
    fallback: { ja: '現状と目標の差の一覧', en: 'The list of differences between today and the target' },
  },
  {
    term: { ja: '移行アーキテクチャ / 中間状態', en: 'Transition architecture' },
    patterns: ['移行アーキテクチャ', '中間状態', 'transition architecture'],
    plain: {
      executive: { ja: '途中で一度止まれる到達点', en: 'A stopping point you can safely rest at' },
      business: { ja: '一部だけ新しいやり方に変わっている期間', en: 'The period when only part of the work has changed' },
      engineer: { ja: '一度リリースして止まれる状態', en: 'A state you can ship and pause at' },
    },
    fallback: { ja: '途中で一度止まれる到達点', en: 'A stopping point you can pause at' },
  },
  {
    term: { ja: 'ベースライン / 現行', en: 'Baseline' },
    patterns: ['ベースライン', '現行', 'baseline', 'as-is', 'as is'],
    plain: { executive: { ja: '今の状態', en: 'How things are today' } },
    fallback: { ja: '今の状態', en: 'How things are today' },
  },
  {
    term: { ja: 'ターゲット / 目標状態', en: 'Target architecture' },
    patterns: ['ターゲットアーキテクチャ', '目標状態', 'to-be', 'to be', 'target architecture'],
    plain: { business: { ja: '変わったあとの仕事のやり方', en: 'How the work runs after the change' } },
    fallback: { ja: '目指す状態', en: 'The state you are aiming at' },
  },
  {
    term: { ja: 'アーキテクチャ原則', en: 'Architecture principles' },
    patterns: ['原則', 'principle'],
    plain: {
      executive: { ja: '迷ったときの判断ルール', en: 'The tie-breaker rules' },
      engineer: { ja: '設計判断がぶつかったときにどちらへ倒すか', en: 'Which way to lean when design choices conflict' },
    },
    fallback: { ja: '判断が割れたときの優先順位', en: 'What takes precedence when opinions split' },
  },
  {
    term: { ja: 'ケイパビリティ / 能力', en: 'Business capability' },
    patterns: ['ケイパビリティ', 'capability', '能力マップ'],
    plain: { executive: { ja: 'この会社ができること', en: 'What this company is able to do' } },
    fallback: { ja: 'この組織ができること', en: 'Something this organisation can do' },
  },
  {
    term: { ja: 'ステークホルダー', en: 'Stakeholder' },
    patterns: ['ステークホルダー', 'stakeholder'],
    plain: {},
    fallback: { ja: '関係する人', en: 'The people involved' },
  },
  {
    term: { ja: '要件 / 要求', en: 'Requirement' },
    patterns: ['要件', '要求', 'requirement'],
    plain: {
      business: { ja: '守ってほしい条件', en: 'A condition that must hold' },
      executive: { ja: '外せない条件', en: 'The conditions that cannot be dropped' },
    },
    fallback: { ja: '守るべき条件', en: 'A condition that must hold' },
  },
  {
    term: { ja: '作業パッケージ', en: 'Work package' },
    patterns: ['作業パッケージ', 'work package'],
    plain: {},
    fallback: { ja: '担当 1 名・成果 1 つの実行単位', en: 'One owner, one outcome, one unit of execution' },
  },
  {
    term: { ja: 'ロードマップ', en: 'Roadmap' },
    patterns: ['ロードマップ', 'roadmap'],
    plain: { executive: { ja: 'いつ何が使えるようになるかの順番', en: 'The order in which things become usable' } },
    fallback: { ja: '順序と、止まれる場所', en: 'The order, and where you can pause' },
  },
  {
    term: { ja: 'ガバナンス / 統制', en: 'Governance' },
    patterns: ['ガバナンス', '統制', 'governance'],
    plain: { engineer: { ja: '判断の場と、逸脱を出す手順', en: 'Where decisions happen and how to request a deviation' } },
    fallback: { ja: '誰がどこで決め、外れたときにどう扱うか', en: 'Who decides where, and what happens when something falls outside' },
  },
  {
    term: { ja: '成果物', en: 'Deliverable' },
    patterns: ['成果物', 'deliverable'],
    plain: {},
    fallback: { ja: '納品して残るもの', en: 'The thing that gets handed over and kept' },
  },
  {
    term: { ja: 'レガシー / 技術的負債', en: 'Legacy / technical debt' },
    patterns: ['レガシー', '技術的負債', '老朽', 'legacy', 'technical debt'],
    plain: {
      executive: { ja: '直さない限り毎年費用が増える古い仕組み', en: 'Old plumbing whose cost rises every year it is left alone' },
      business: { ja: '長く使ってきて、今のやり方に合わなくなった仕組み', en: 'A long-serving system that no longer fits how the work is done' },
    },
    fallback: { ja: '手を入れにくくなった既存の仕組み', en: 'Existing plumbing that has become hard to change' },
  },
  {
    term: { ja: '基幹システム', en: 'Core system' },
    patterns: ['基幹システム', '基幹', 'core system', 'erp'],
    plain: {
      executive: { ja: '止まると受注も出荷も止まる仕組み', en: 'The system whose failure stops both orders and shipments' },
      engineer: { ja: '停止許容時間が最も短い系', en: 'The system with the tightest tolerable downtime' },
    },
    fallback: { ja: '事業の中心で動いている仕組み', en: 'The system the business runs on' },
  },
  {
    term: { ja: 'クラウド移行', en: 'Cloud migration' },
    patterns: ['クラウド', 'cloud'],
    plain: {
      executive: { ja: '設備を買わずに借りる形に変えること(費用の出方が変わる)', en: 'Renting capacity instead of buying it — it changes the shape of the spend, not just the tooling' },
      business: { ja: '置き場所が変わるだけで、画面や手順は別途決める話', en: 'Where it runs changes; whether your screens change is a separate decision' },
    },
    fallback: { ja: '自社設備で動かすのをやめ、借りた基盤で動かすこと', en: 'Running on rented platform capacity instead of owned equipment' },
  },
  {
    term: { ja: 'データ連携 / 統合', en: 'Integration' },
    patterns: ['データ連携', '連携', '統合', 'api', 'integration', 'interface'],
    plain: {
      executive: { ja: '別々の仕組みが同じ数字を見られるようにすること', en: 'Making separate systems agree on the same numbers' },
      business: { ja: '二重入力をやめるための仕組み', en: 'The plumbing that removes double entry' },
    },
    fallback: { ja: '別々の仕組みの間でデータを渡す仕掛け', en: 'The plumbing that passes data between separate systems' },
  },
  {
    term: { ja: '非機能要件', en: 'Non-functional requirements' },
    patterns: ['非機能', 'non-functional', 'nfr', 'sla'],
    plain: {
      executive: { ja: '速さ・止まらなさ・守りの水準', en: 'How fast, how available, and how well protected' },
      business: { ja: '「何秒で返るか」「いつ止まるか」の約束', en: 'The promise on response time and on when it is unavailable' },
    },
    fallback: { ja: '機能ではなく水準の約束(速さ・可用性・保全)', en: 'Promises about levels rather than features: speed, availability, protection' },
  },
  {
    term: { ja: '二重運用 / 並行稼働', en: 'Parallel run' },
    patterns: ['二重運用', '並行稼働', '並行運用', 'parallel run', 'dual operation'],
    plain: {
      executive: { ja: '新旧を同時に動かす期間(費用も手間も一時的に倍になる)', en: 'The window where old and new both run — cost and effort temporarily double' },
      business: { ja: '同じ入力を 2 か所にする期間', en: 'The window where the same entry happens in two places' },
    },
    fallback: { ja: '新旧を同時に動かす期間', en: 'The window where old and new both run' },
  },
  {
    term: { ja: 'PoC / 実証', en: 'PoC' },
    patterns: ['poc', '実証', 'proof of concept', 'パイロット', 'pilot'],
    plain: { executive: { ja: '小さく試して、続けるか止めるかを決める工程', en: 'A small trial whose purpose is deciding whether to continue' } },
    fallback: { ja: '本格導入の前に小さく試すこと', en: 'A small trial before committing' },
  },
  {
    term: { ja: '内製', en: 'In-house build' },
    patterns: ['内製', 'in-house', 'inhouse'],
    plain: { executive: { ja: '外注せず自社の人員で作ること(人が抜けたときの継続性が論点)', en: 'Building with your own people — the question it raises is continuity when they leave' } },
    fallback: { ja: '自社の人員で作ること', en: 'Building with your own people' },
  },
  {
    term: { ja: 'DX', en: 'DX / digital transformation' },
    patterns: ['dx', 'デジタルトランスフォーメーション', 'digital transformation'],
    plain: {
      executive: { ja: '(この語は範囲が広すぎて判断できない。何を変えるのか 1 文で置き換える)', en: '(Too broad to decide on. Replace it with one sentence naming what changes)' },
      business: { ja: '(この語は現場では意味を持たない。変わる作業の名前で言い換える)', en: '(Meaningless on the floor. Name the actual task that changes instead)' },
    },
    fallback: { ja: '(範囲が広すぎる語。何がどう変わるのかに言い換える)', en: '(Too broad. Replace it with what specifically changes)' },
  },
  {
    term: { ja: '標準化', en: 'Standardisation' },
    patterns: ['標準化', 'standardis', 'standardiz'],
    plain: {
      business: { ja: '(この語だけでは現場に何も伝わらない。どの手順を、どの部門のやり方に揃えるのかまで言う)', en: '(Says nothing on its own. Name which steps get aligned to which unit\'s way of working)' },
    },
    fallback: { ja: 'ばらばらの手順を 1 つに揃えること(どれに揃えるかまで言う)', en: 'Aligning divergent processes onto one — say which one' },
  },
];

interface JargonHit {
  term: Bilingual;
  plain: Bilingual;
  evidence: string;
}

/** topic に実際に出てきた用語だけを言い換え表にする */
function detectJargon(topic: string, archetype: Audience): JargonHit[] {
  const lower = topic.toLowerCase();
  const out: JargonHit[] = [];
  for (const entry of JARGON) {
    const hit = entry.patterns.find((p) => matchesKeyword(lower, p.toLowerCase()));
    if (!hit) continue;
    out.push({ term: entry.term, plain: entry.plain[archetype] ?? entry.fallback, evidence: hit });
  }
  return out;
}

/** 誰にでも通じるカタカナ語(専門語として拾わない) */
const COMMON_KATAKANA = new Set([
  'システム', 'サービス', 'プロジェクト', 'メンバー', 'スケジュール', 'マニュアル', 'ミーティング',
  'アプリケーション', 'ソフトウェア', 'ハードウェア', 'ネットワーク', 'コンピュータ', 'パスワード',
  'グループ', 'チェック', 'ポイント', 'コスト', 'リスク', 'ユーザー', 'メーカー', 'センター',
]);

/** 辞書に無い専門語らしきもの(長いカタカナ語・英大文字略語)を拾う */
function detectUnknownJargon(topic: string, known: JargonHit[]): string[] {
  const seen = new Set(known.map((k) => k.evidence.toLowerCase()));
  const out: string[] = [];
  const add = (word: string): void => {
    const w = word.trim();
    if (w.length === 0) return;
    const lower = w.toLowerCase();
    if (seen.has(lower)) return;
    // 既知の語の一部なら出さない(「クラウド移行」の中の「クラウド」など)
    if (Array.from(seen).some((k) => k.includes(lower) || lower.includes(k))) return;
    seen.add(lower);
    out.push(w);
  };
  for (const m of topic.match(/[ァ-ヴー]{5,}/g) ?? []) {
    if (!COMMON_KATAKANA.has(m)) add(m);
  }
  for (const m of topic.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []) add(m);
  return out.slice(0, 5);
}

// --- 案件の実データを相手向けに翻訳する -------------------------------------

interface EngagementFact {
  fact: Bilingual;
  /** この相手にどう言うか */
  say: Bilingual;
}

/**
 * 保存済みの案件から、この相手にこの topic を話すときに実際に使う事実を拾う。
 * 一般論ではなく、登録されている値をそのまま引用することに意味がある。
 */
function engagementFacts(
  engagement: Engagement,
  archetype: Audience,
  who: ResolvedAudience,
  lang: Lang,
): EngagementFact[] {
  const facts: EngagementFact[] = [];

  // 相手が関係者として登録されていれば、その人の関心事がそのまま台本になる
  const label = who.label.toLowerCase();
  const matched = engagement.stakeholders.find((s) => {
    const name = s.name.toLowerCase();
    const role = (s.role ?? '').toLowerCase();
    if (name.length > 1 && (label.includes(name) || name.includes(label))) return true;
    return role.length > 1 && (label.includes(role) || role.includes(label));
  });
  if (matched) {
    facts.push({
      fact: {
        ja: `この相手は関係者として登録済み: ${flat(matched.name)}(影響力 ${one(INFLUENCE_LABEL[matched.influence], 'ja')} / 関心 ${one(INFLUENCE_LABEL[matched.interest], 'ja')})`,
        en: `Already recorded as a stakeholder: ${flat(matched.name)} (influence ${one(INFLUENCE_LABEL[matched.influence], 'en')}, interest ${one(INFLUENCE_LABEL[matched.interest], 'en')})`,
      },
      say:
        matched.concerns.length > 0
          ? {
              ja: `登録されている関心事「${flat(clip(matched.concerns[0], 34))}」から入る。この 1 文を最初に置くだけで、聞く姿勢が変わる`,
              en: `Open on their recorded concern: "${flat(clip(matched.concerns[0], 34))}". Leading with that one line changes how the rest is heard`,
            }
          : {
              ja: '関心事が未記入。話す前に「何が一番気になりますか」を 1 問だけ聞き、その答えを登録する',
              en: 'No concern recorded. Ask one question — what worries you most — before you present, and record the answer',
            },
    });
  }

  const readiness = latestReadiness(engagement);
  if (readiness) {
    const worst = readiness.weak[0];
    const sayByAudience: Record<Audience, Bilingual> = {
      executive: {
        ja: '着手可否そのものなので最初に言う。隠して後から出ると、他の数字も疑われる',
        en: 'This is the go/no-go itself — say it first. Discovered later, it discredits every other number you gave',
      },
      business: {
        ja: '受容度の低さは現場に対する批判ではなく、こちらの準備不足として話す',
        en: 'Frame a low acceptance score as our failure to prepare, never as a criticism of the floor',
      },
      engineer: {
        ja: '準備度は設計では解けない。範囲を削る判断の根拠として渡す',
        en: 'Readiness cannot be designed around. Hand it over as the basis for cutting scope',
      },
      pmo: {
        ja: 'バッファと段階分けの根拠になる。計画の前提欄にこの数字を引く',
        en: 'It justifies the buffer and the phasing. Cite this number in the assumptions section',
      },
    };
    facts.push({
      fact: {
        ja: `変革準備度 ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)}(到達度 ${readiness.achievement}%)— 判定「${one(READINESS_VERDICT[readiness.band], 'ja')}」${worst ? `。最も低いのは ${flat(clip(worst.name, 16))}` : ''}`,
        en: `Readiness ${round1(readiness.avgCurrent)}/${round1(readiness.avgTarget)} (${readiness.achievement}% of target) — "${one(READINESS_VERDICT[readiness.band], 'en').toLowerCase()}"${worst ? `; weakest factor ${flat(clip(worst.name, 16))}` : ''}`,
      },
      say: sayByAudience[archetype],
    });
  }

  const live = engagement.risks.filter((r) => r.status === 'open' || r.status === 'mitigating');
  const heavy = live.filter((r) => r.level === 'critical' || r.level === 'high');
  if (heavy.length > 0) {
    const orphan = heavy.filter((r) => !r.owner || !r.mitigation);
    // 経営層には 1 件しか出さないので、その 1 件は必ず最も重いものにする。
    // 登録順で先頭を取ると、後から登録された critical を飛ばして high を出してしまう。
    // 並びは 重大度 → 担当/対策の欠落 → 登録順(安定)。
    const criticalFirst = (r: (typeof heavy)[number]): number => (r.level === 'critical' ? 0 : 1);
    const orphanFirst = (r: (typeof heavy)[number]): number => (!r.owner || !r.mitigation ? 0 : 1);
    const ranked = heavy
      .map((risk, index) => ({ risk, index }))
      .sort(
        (a, b) =>
          criticalFirst(a.risk) - criticalFirst(b.risk) ||
          orphanFirst(a.risk) - orphanFirst(b.risk) ||
          a.index - b.index,
      );
    const top = ranked[0].risk;
    const topLevel = one(RISK_LEVEL_LABEL[top.level] ?? { ja: top.level, en: top.level }, lang);
    const criticalCount = heavy.filter((r) => r.level === 'critical').length;
    facts.push({
      fact: {
        ja: `重大リスク ${heavy.length} 件(うち critical ${criticalCount} 件)。最上位は重大度で選んだ ${topLevel} の「${flat(clip(top.title, 28))}」${top.owner ? `・担当 ${flat(clip(top.owner, 12))}` : '・担当未設定'}${top.mitigation ? '' : '・対策未記入'}`,
        en: `${heavy.length} severe risks (${criticalCount} of them critical). The one below is the top by severity, not by entry order: ${topLevel} — "${flat(clip(top.title, 28))}"${top.owner ? `, owner ${flat(clip(top.owner, 12))}` : ', no owner'}${top.mitigation ? '' : ', no mitigation'}`,
      },
      say:
        archetype === 'executive'
          ? {
              ja: orphan.length > 0
                ? `担当が空いたまま経営層に出すと、その場で「で、誰がやるの」で止まる。名前を入れてから出す(${code('update_engagement')})`
                : '1 つに絞って出し、「これを誰が受容するか」を名指しで確認する',
              en: orphan.length > 0
                ? `Taken upstairs with an empty owner field, it stalls on "so who owns this?". Fill the name in first (${code('update_engagement')})`
                : 'Bring one, and ask by name who accepts it',
            }
          : archetype === 'business'
            ? { ja: 'リスクは現場への警告ではなく、こちらが何を手当てするかの宣言として話す', en: 'Present risk as a declaration of what you are covering, not a warning to them' }
            : archetype === 'engineer'
              ? { ja: '技術で潰せるリスクと、そうでないリスクを分けて渡す', en: 'Separate the risks a design can kill from the ones it cannot' }
              : { ja: 'リスクごとに、顕在化したとき何が何週間止まるかを計画に紐づける', en: 'Tie each risk to what stops, and for how many weeks, if it lands' },
    });
  }

  const overdue = engagement.actions.filter((a) => {
    if (a.status === 'done') return false;
    const left = daysUntil(a.due);
    return left !== null && left < 0;
  });
  if (overdue.length > 0) {
    facts.push({
      fact: {
        ja: `期限超過のアクション ${overdue.length} 件(例:「${flat(clip(overdue[0].title, 28))}」)`,
        en: `${plural(overdue.length, 'overdue action', 'overdue actions')} (e.g. "${flat(clip(overdue[0].title, 28))}")`,
      },
      say:
        archetype === 'pmo'
          ? { ja: 'PMO には隠せない。先に出して、引き直した期限とセットで渡す', en: 'A PMO will find these. Volunteer them, paired with the reset dates' }
          : { ja: '新しい期日を約束する前に、超過分をどう処理したかを 1 行言う', en: 'Before promising a new date, give one line on how the missed ones were handled' },
    });
  }

  const priced = engagement.workPackages.filter((w) => w.costEstimate && w.costEstimate.trim().length > 0);
  if (engagement.workPackages.length > 0) {
    facts.push({
      fact: {
        ja: `作業パッケージ ${engagement.workPackages.length} 件(概算費用あり ${priced.length} 件${priced[0]?.costEstimate ? `・例 ${flat(clip(priced[0].costEstimate, 16))}` : ''})`,
        en: `${engagement.workPackages.length} work packages (${priced.length} priced${priced[0]?.costEstimate ? `, e.g. ${flat(clip(priced[0].costEstimate, 16))}` : ''})`,
      },
      say:
        archetype === 'executive'
          ? { ja: '個別のパッケージ名は出さない。合計の桁と、最初の 1 つが終わる時期だけ', en: 'Do not name individual packages. Give the total order of magnitude and when the first one lands' }
          : archetype === 'pmo'
            ? { ja: 'そのまま表で渡せる。依存関係の列を足すこと', en: 'Hand the table over as-is, with a dependency column added' }
            : { ja: '相手の持ち場に関係するものだけ抜き出して見せる', en: 'Pull out only the ones that touch their patch' },
    });
  } else {
    facts.push({
      fact: { ja: '作業パッケージが 0 件(実行単位がまだ無い)', en: 'Zero work packages — there are no units of execution yet' },
      say:
        archetype === 'pmo' || archetype === 'executive'
          ? { ja: 'この状態で日程や金額を聞かれたら、「まだ答えられない」と言うほうが安全。推測で答えると、その数字が独り歩きする', en: 'If asked for dates or money in this state, say you cannot answer yet. A guessed number takes on a life of its own' }
          : { ja: 'まだ実行単位が無いので、話せるのは方針までだと先に断る', en: 'Say up front that with no units of work defined, you can only speak to direction' },
    });
  }

  const current = findPhase(engagement.currentPhaseId);
  if (current) {
    facts.push({
      fact: {
        ja: `現在フェーズ ${current.code}(${one(current.name, lang)})`,
        en: `Current phase ${current.code} (${one(current.name, lang)})`,
      },
      say:
        archetype === 'executive' || archetype === 'business'
          ? { ja: 'フェーズ名は出さない。「いま何を決めている段階か」に言い換える', en: 'Do not use the phase name. Translate it into what is being decided right now' }
          : { ja: 'フェーズ名で通じる相手。この段階で確定していない範囲も併せて伝える', en: 'This audience reads phase names. Pair it with what is still open at this stage' },
    });
  }

  return facts;
}

// ---------------------------------------------------------------------------
// whats_new_for_me
// ---------------------------------------------------------------------------

interface ActivityItem {
  kind: Bilingual;
  subject: string;
  status: string;
  days: number;
  /** 未完了か(止まっている判定はこれが true のものだけ) */
  open: boolean;
  hint: Bilingual;
  tool: string;
}

/** エンゲージメントの全要素を更新日つきの一覧に落とす */
function collectActivity(engagement: Engagement, lang: Lang): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const p of engagement.phases) {
    // 未着手のフェーズは案件作成時の日付を持つだけで、実際には一度も動いていない
    if (p.status === 'not_started') continue;
    const days = daysSince(p.updatedAt);
    if (days === null) continue;
    const phase = findPhase(p.phaseId);
    items.push({
      kind: { ja: 'フェーズ', en: 'Phase' },
      subject: phase ? `${phase.code}. ${one(phase.name, lang)}` : p.phaseId,
      status: one(PHASE_STATUS_LABEL[p.status], lang),
      days,
      open: p.status === 'in_progress',
      hint: { ja: '今週の到達点を 1 つに絞る', en: 'Narrow this week down to one finish line' },
      tool: 'next_best_action',
    });
  }
  for (const r of engagement.risks) {
    const days = daysSince(r.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: 'リスク', en: 'Risk' },
      subject: clip(r.title, 34),
      status: one(RISK_STATUS_LABEL[r.status], lang),
      days,
      open: r.status === 'open' || r.status === 'mitigating',
      hint: { ja: '対策の期限を切るか、受容として閉じる', en: 'Put a date on the mitigation, or close it as accepted' },
      tool: 'risk_matrix',
    });
  }
  for (const d of engagement.decisions) {
    const days = daysSince(d.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '決定事項', en: 'Decision' },
      subject: clip(d.title, 34),
      status: one(DECISION_STATUS_LABEL[d.status], lang),
      days,
      open: d.status === 'proposed',
      hint: { ja: '決めるか、決めない理由を書いて閉じる', en: 'Decide it, or record why you are not deciding and close it' },
      tool: 'update_engagement',
    });
  }
  for (const a of engagement.actions) {
    const days = daysSince(a.updatedAt);
    if (days === null) continue;
    const left = daysUntil(a.due);
    items.push({
      kind: { ja: 'アクション', en: 'Action' },
      subject: clip(a.title, 34),
      status:
        left !== null && left < 0 && a.status !== 'done'
          ? `${one(ACTION_STATUS_LABEL[a.status], lang)} (${inline(`${Math.abs(left)} 日超過`, `${Math.abs(left)}d overdue`, lang)})`
          : one(ACTION_STATUS_LABEL[a.status], lang),
      days,
      open: a.status !== 'done',
      hint: { ja: '担当と期限を入れ直す', en: 'Reset the owner and the date' },
      tool: 'update_engagement',
    });
  }
  for (const s of engagement.stakeholders) {
    const days = daysSince(s.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '関係者', en: 'Stakeholder' },
      subject: clip(s.name, 34),
      status: `${inline('影響力', 'influence', lang)} ${one(INFLUENCE_LABEL[s.influence], lang)}`,
      days,
      open: s.influence === 'high' && (!s.approach || s.concerns.length === 0),
      hint: { ja: '関心事と関与方針を 1 行で埋める', en: 'Fill in their concern and how you will engage them' },
      tool: 'stakeholder_matrix',
    });
  }
  for (const d of engagement.deliverables) {
    const days = daysSince(d.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '成果物', en: 'Deliverable' },
      subject: clip(d.name, 34),
      status: one(DELIVERABLE_STATUS_LABEL[d.status], lang),
      days,
      open: d.status !== 'approved' && d.status !== 'baselined',
      hint: { ja: '判断する場を 1 回設定して閉じる', en: 'Book one forum to decide it and close it out' },
      tool: 'generate_review_checklist',
    });
  }
  for (const w of engagement.workPackages) {
    const days = daysSince(w.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '作業パッケージ', en: 'Work package' },
      subject: clip(w.name, 34),
      status: one(WORK_PACKAGE_STATUS_LABEL[w.status], lang),
      days,
      open: w.status === 'proposed' || w.status === 'planned' || w.status === 'in_progress',
      hint: { ja: '開始条件と便益責任者を確定する', en: 'Nail down the start condition and the benefit owner' },
      tool: 'prioritize_work_packages',
    });
  }
  for (const t of engagement.transitions) {
    const days = daysSince(t.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '移行状態', en: 'Transition' },
      subject: clip(t.name, 34),
      status: t.standalone
        ? inline('単独稼働 可', 'stops safely', lang)
        : inline('単独稼働 不可', 'cannot stop here', lang),
      days,
      open: !t.standalone || (Boolean(t.interim) && !t.disposalPlan),
      hint: { ja: 'ここで止まっても事業が回るか確認し、暫定の廃棄期限を書く', en: 'Confirm the business survives a stop here, and date the disposal of any interim' },
      tool: 'get_roadmap',
    });
  }
  for (const a of engagement.assessments) {
    const days = daysSince(a.updatedAt);
    if (days === null) continue;
    items.push({
      kind: { ja: '評価', en: 'Assessment' },
      subject: clip(a.title, 34),
      status: a.kind === 'maturity' ? inline('成熟度', 'maturity', lang) : inline('準備度', 'readiness', lang),
      days,
      open: false,
      hint: { ja: '差の大きい因子に対策を 1 つ当てる', en: 'Put one remedy against the widest-gap factor' },
      tool: a.kind === 'maturity' ? 'assess_maturity' : 'assess_readiness',
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

export function registerGuideTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // 1. start_here
  // -------------------------------------------------------------------------
  server.registerTool(
    'start_here',
    {
      title: 'Start here',
      description:
        'このサーバーの入口。案件が無ければ「まず決めるべき 3 つ」を、あれば現在地(フェーズ・進捗)と今週やる 3 つを 1 画面で返す。goal を渡すと目的に沿った見立てが付く。迷ったら最初にこれを呼ぶ。 / The entry point. With no engagement it returns the three things to settle first; with one it returns where you are and the three things to do this week, in a single screen. Pass a goal for a tailored read. Call this first when unsure.',
      inputSchema: {
        goal: freeTextSchema(
          'やりたいことの自由記述(任意) / What you are trying to achieve, in free text',
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ goal, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText([{ field: 'goal', value: goal, hint: HINTS.situation }], l);
        if (tooLong) return tooLong;
        const engagement = loadEngagement();
        if (!engagement) return textResult(renderColdStart(goal, l));
        return textResult(renderWarmStart(engagement, goal, l));
      } catch (error) {
        return errorResult(
          msg(
            `start_here の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `start_here failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. next_best_action
  // -------------------------------------------------------------------------
  server.registerTool(
    'next_best_action',
    {
      title: 'Next best action',
      description:
        '保存済みの案件の状態(フェーズ・関係者・リスク・アクション・作業パッケージ・移行状態)を診断し、優先度順に 3〜5 個の具体的な行動を、根拠・完了条件・使うツールつきで返す。「第 7 章を読め」ではなく「今週これをやれ」を返すためのツール。 / Diagnose the stored engagement — phases, stakeholders, risks, actions, work packages, transitions — and return 3-5 concrete actions in priority order, each with the reason it is next, the condition that means it is done, and the tool to use.',
      inputSchema: {
        horizon: z
          .enum(['today', 'week', 'month'])
          .default('week')
          .describe('対象期間 / Planning horizon: today, week (default), or month'),
        lang: langSchema,
      },
    },
    async ({ horizon, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const h = horizon as Horizon;
        const engagement = loadEngagement();
        if (!engagement) {
          return textResult(
            [
              msg('# 次の一手', '# Next Best Action', l),
              '',
              msg(
                '案件がまだ無いので、状態から助言できません。まず入口から始めてください。',
                'There is no engagement yet, so there is no state to advise on. Start from the entry point.',
                l,
              ),
              '',
              `- ${code('start_here')} — ${inline('最初に決めるべき 3 つ', 'the three things to settle first', l)}`,
              `- ${code('start_engagement')} — ${inline('案件を作る', 'create the engagement', l)}`,
              '',
            ].join('\n'),
          );
        }

        const all = computeNextActions(engagement, h);
        const actions = all.slice(0, HORIZON_LIMIT[h]);
        const progress = summarizeProgress(engagement);
        const current = findPhase(engagement.currentPhaseId);

        const out: string[] = [];
        out.push(
          msg(
            `# ${one(HORIZON_LABEL[h], 'ja')}の一手 — ${flat(engagement.name)}`,
            `# ${one(HORIZON_LABEL[h], 'en')} — ${flat(engagement.name)}`,
            l,
          ),
        );
        out.push('');
        out.push(
          `${inline('現在フェーズ', 'Current phase', l)}: **${current ? `${current.code}. ${one(current.name, l)}` : engagement.currentPhaseId}** ・ ` +
            `${inline('進捗', 'Progress', l)}: ${progress.percent}% ・ ` +
            `${inline('候補', 'Candidates', l)}: ${all.length} → ${inline('上位', 'top', l)} ${actions.length}`,
        );
        out.push('');
        // 準備度は着手可否そのものなので、行動一覧より前に置く
        const readiness = latestReadiness(engagement);
        if (readiness) {
          out.push(...renderReadinessBlock(readiness, engagement, l));
          out.push('');
        }
        out.push(...renderActions(actions, l, h));

        if (all.length > actions.length) {
          const rest = all.slice(actions.length, actions.length + 4);
          out.push(msg('## 次点(この期間では扱わない)', '## Next up (out of scope for this horizon)', l));
          out.push('');
          for (const r of rest) {
            out.push(`- ${flat(one(r.title, l))} — ${code(r.tool)}`);
          }
          out.push('');
        }

        out.push(
          msg(
            `終わったら ${code('update_engagement')} で状態を更新してから、次にまた ${code('next_best_action')} を呼ぶ。この助言は保存された状態だけを見ているので、更新しない限り次回もまったく同じ内容が返る。`,
            `Record the result with ${code('update_engagement')} before calling ${code('next_best_action')} again. This reads nothing but the stored state, so without an update the next answer is identical.`,
            l,
          ),
        );
        out.push('');
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `next_best_action の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `next_best_action failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // 3. tailor_adm
  // -------------------------------------------------------------------------
  server.registerTool(
    'tailor_adm',
    {
      title: 'Tailor the ADM',
      description:
        '規模・目的・期間から「自社版 ADM」を設計して返す。使うフェーズと省くフェーズ(それぞれ理由つき)、作る成果物と作らない成果物、各フェーズの目安期間、レビューを置く場所を表で返す。TOGAF は全部やるものではなく、削って使うものという前提で組む。 / Design a tailored ADM from scale, purpose, and timebox: which phases to run and which to cut (with reasons), which deliverables to produce and which to skip, an indicative duration per phase, and where to place reviews. Built on the premise that the ADM is meant to be cut down, not run whole.',
      inputSchema: {
        scale: z
          .enum(['small', 'medium', 'large'])
          .describe('規模 / Scale: small (one unit), medium (several units), large (enterprise-wide)'),
        purpose: freeTextSchema(
          'この取り組みの目的(自由記述) / What this engagement is for, in free text',
        ).min(3),
        timeboxWeeks: z
          .number()
          .int()
          .min(1)
          .max(260)
          .optional()
          .describe('使える期間(週)。指定すると期間内に収まるまでフェーズを削る / Available weeks; phases get cut until the plan fits'),
        hasExistingEa: z
          .boolean()
          .optional()
          .describe('既存の EA 実践(原則・ガバナンス)があるか / Whether an EA practice already exists'),
        lang: langSchema,
      },
    },
    async ({ scale, purpose, timeboxWeeks, hasExistingEa, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText([{ field: 'purpose', value: purpose, hint: HINTS.situation }], l);
        if (tooLong) return tooLong;
        const s = scale as Scale;
        const ctx: TailorContext = {
          scale: s,
          hasExistingEa: hasExistingEa === true,
          evidence: readDomainEvidence(purpose),
          timeboxWeeks,
        };
        const matchedDomains = matchedDomainsOf(ctx);
        const plans = buildPhasePlans(ctx);

        let cutForTime: PhasePlan[] = [];
        let fits = true;
        if (typeof timeboxWeeks === 'number') {
          const result = compressToTimebox(plans, ctx, timeboxWeeks);
          cutForTime = result.cut;
          fits = result.fits;
        }
        // 収まらないときに希望期間で配分すると、表の合計が「収まらない」という警告と矛盾する。
        // 収まらないなら目安期間の方を正として出す。
        const totalWeeks = allocateWeeks(plans, s, fits ? timeboxWeeks : undefined);
        // 「省いたフェーズ」「軽くしたフェーズ」は本文の各所で参照するので先に確定させる。
        // 実際には 1 つも省いていないのに「省いたフェーズを戻せ」と書くと、次の一手が空振りになる。
        const cutPhases = plans.filter((p) => p.treatment === 'skip');
        const lightPhases = plans.filter((p) => p.treatment === 'light');

        const out: string[] = [];
        out.push(msg('# 自社版 ADM の設計', '# Your Tailored ADM', l));
        out.push('');
        // 全文エコーはしない(purpose をそのまま返すと出力が入力より大きくなる)
        for (const line of echoInput(purpose, l).split('\n')) out.push(`> ${flat(line)}`);
        out.push('');
        out.push(
          `${inline('規模', 'Scale', l)}: **${one(SCALE_LABEL[s], l)}** ・ ` +
            `${inline('期間', 'Timebox', l)}: **${inline(`約 ${totalWeeks} 週`, `~${totalWeeks} ${totalWeeks === 1 ? 'week' : 'weeks'}`, l)}**` +
            (fits
              ? ''
              : ` ${inline(`(希望の ${timeboxWeeks} 週には収まらない)`, `(does not fit the requested ${weeksEn(timeboxWeeks ?? 0)})`, l)}`) +
            ` ・ ${inline('既存 EA', 'Existing EA', l)}: ${hasExistingEa === true ? inline('あり', 'yes', l) : inline('なし', 'no', l)}`,
        );
        out.push('');
        // 何を根拠に領域を決めたのかを先に出す。根拠が無いときは「無い」と書く。
        if (matchedDomains.length > 0) {
          const shown = matchedDomains.map((id) => {
            const ev = ctx.evidence[id];
            const hits = ev.kind === 'matched' ? ev.hits.slice(0, 3).join(' / ') : '';
            return `**${id.toUpperCase()}** (${hits})`;
          });
          out.push(
            msg(
              `目的の記述から読み取れた対象領域: ${shown.join(' ・ ')}。ここが外れているなら purpose を書き直してもう一度呼ぶこと — 以下の削る判断はすべてこの読み取りに乗っている。`,
              `Domains read out of your purpose: ${shown.join(' · ')}. If that is wrong, rewrite the purpose and call again — every cut below rests on this reading.`,
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '目的の記述からは対象領域(業務 / データ・アプリ / 技術)を判断できなかった。以下の領域の扱いは規模から決めた既定であって、目的に基づく判断ではない。',
              'Your purpose gave no signal about which domains (business / data-application / technology) are in play. The domain treatments below are size-based defaults, not judgements drawn from your purpose.',
              l,
            ),
          );
        }
        out.push('');
        out.push(
          msg(
            '**立場を先に書く。TOGAF は全部やるものではない。** 全フェーズ・全成果物を通そうとした時点で、この取り組みは書類仕事に変わる。以下は「何を削るか」を先に決めた設計。削った理由も残してあるので、後から聞かれたときに説明できる。',
            '**Position first: the ADM is not meant to be run whole.** The moment you try to run every phase and produce every deliverable, this turns into paperwork. What follows is designed by deciding what to cut first — and the reasons are kept, so you can defend them later.',
            l,
          ),
        );
        out.push('');

        if (typeof timeboxWeeks === 'number' && cutForTime.length > 0) {
          const dropped = cutForTime.filter((p) => p.treatment === 'skip').map((p) => p.code);
          const trimmed = cutForTime.filter((p) => p.treatment !== 'skip').map((p) => p.code);
          // inline() を msg() の中で使うと both のときに日英が入り混じるので、ja/en を別々に組む
          const jaParts: string[] = [];
          const enParts: string[] = [];
          if (dropped.length > 0) {
            jaParts.push(`${dropped.join(' / ')} を落とし`);
            enParts.push(`dropped ${dropped.join(' / ')}`);
          }
          if (trimmed.length > 0) {
            jaParts.push(`${trimmed.join(' / ')} を軽量に下げた`);
            enParts.push(`trimmed ${trimmed.join(' / ')} to light`);
          }
          out.push(
            msg(
              `⚠ ${timeboxWeeks} 週に収めるため、${jaParts.join('、')}。何を失うかは下の「削って失うもの」に書いてある。`,
              `⚠ To fit ${weeksEn(timeboxWeeks)}, ${enParts.join(' and ')}. What that costs you is in "What the cuts cost you" below.`,
              l,
            ),
          );
          out.push('');
        }
        // 削って収めた場合の端数は「余裕」ではないので、削っていないときだけ知らせる
        if (fits && cutForTime.length === 0 && typeof timeboxWeeks === 'number' && timeboxWeeks - totalWeeks >= 1) {
          // 余りの使い道は、この設計に実際に存在するものだけを挙げる
          const slackJa =
            cutPhases.length > 0
              ? `省いたフェーズ(${cutPhases.map((p) => p.code).join(', ')})を 1 つ戻すか、対象範囲を 1 段広げるか`
              : lightPhases.length > 0
                ? `軽量にしたフェーズ(${lightPhases.map((p) => p.code).join(', ')})を 1 つ厚くするか、対象範囲を 1 段広げるか`
                : 'この設計では省いたフェーズも軽量にしたフェーズも無いので、対象範囲を 1 段広げるか、次サイクルの準備に';
          const slackEn =
            cutPhases.length > 0
              ? `restoring one of the cut phases (${cutPhases.map((p) => p.code).join(', ')}) or widening the scope by one step`
              : lightPhases.length > 0
                ? `deepening one of the lightened phases (${lightPhases.map((p) => p.code).join(', ')}) or widening the scope by one step`
                : 'nothing is cut or lightened here, so spend it on widening the scope by one step or preparing the next cycle';
          out.push(
            msg(
              `この設計なら約 ${totalWeeks} 週で終わる(${timeboxWeeks} 週に対して余裕あり)。余りは日程を伸ばすのではなく、${slackJa}に使う。`,
              `This design lands in about ${weeksEn(totalWeeks)} against your ${timeboxWeeks}. Spend the slack on ${slackEn} — not on a longer calendar.`,
              l,
            ),
          );
          out.push('');
        }
        if (!fits) {
          // 「なぜここで止まるのか」は根拠によって違う。目的が領域を指していないのに
          // 「目的が指す領域を守るため」と書くと嘘になる。
          const stopJa =
            matchedDomains.length > 0
              ? `目的が直接指している領域(${matchedDomains.map((id) => id.toUpperCase()).join(' / ')})と E をこれ以上削ると、期間には収まっても案件が目的を果たさなくなるのでここで止めてある`
              : 'これ以上削ると E まで消える。E が無いとギャップが実行単位にならず、期間には収まっても実行できる計画が残らないのでここで止めてある';
          const stopEn =
            matchedDomains.length > 0
              ? `Cutting past the domains your purpose points at (${matchedDomains.map((id) => id.toUpperCase()).join(' / ')}) and E would fit the calendar and miss the point, so the plan stops here`
              : 'Cutting further would take out E itself, and without E the gaps never become units of work — you would fit the calendar and have nothing executable, so the plan stops here';
          out.push(
            msg(
              `⚠ 削れるところまで削っても最短で約 ${totalWeeks} 週かかる(${timeboxWeeks} 週では終わらない)。${stopJa}。対象を 1 つの事業領域に絞るか、期間を ${totalWeeks} 週まで延ばすかを先に決めること。両方やろうとした案件は必ず中途半端になる。`,
              `⚠ Cut as far as it can go, this still needs about ${weeksEn(totalWeeks)} — ${timeboxWeeks} is not enough. ${stopEn}. Decide first — narrow to a single business area, or extend to ${weeksEn(totalWeeks)}. Attempting both leaves the work half-finished.`,
              l,
            ),
          );
          out.push('');
        }

        // --- フェーズ表 ---
        out.push(msg('## フェーズの扱い', '## Phase Treatment', l));
        out.push('');
        out.push(
          `| ${inline('フェーズ', 'Phase', l)} | ${inline('扱い', 'Treatment', l)} | ${inline('目安', 'Duration', l)} | ${inline('この判断の理由', 'Why', l)} |`,
        );
        out.push('| --- | :-: | :-: | --- |');
        for (const p of plans) {
          const duration = p.continuous
            ? inline('全期間並走', 'throughout', l)
            : p.treatment === 'skip'
              ? '—'
              : inline(`${p.weeks} 週`, `${p.weeks} ${p.weeks === 1 ? 'wk' : 'wks'}`, l);
          out.push(
            `| **${p.code}.** ${cell(one(p.name, l))} | ${TREATMENT_MARK[p.treatment]} ${one(TREATMENT_LABEL[p.treatment], l)} | ${duration} | ${cell(one(p.reason, l))} |`,
          );
        }
        out.push('');
        out.push(
          msg(
            cutPhases.length > 0
              ? `削るのは ${cutPhases.length} フェーズ(${cutPhases.map((p) => p.code).join(', ')})。案件を作ったら ${code('update_engagement')} でこれらの状態を skipped にしておくと、進捗率が実態に合う。`
              : 'この条件では丸ごと省けるフェーズは無い。軽くするなら、フェーズ単位ではなく各フェーズで作る成果物を減らす。',
            cutPhases.length > 0
              ? `${cutPhases.length === 1 ? '1 phase is cut' : `${cutPhases.length} phases are cut`} (${cutPhases.map((p) => p.code).join(', ')}). Once the engagement exists, mark ${cutPhases.length === 1 ? 'it' : 'them'} skipped with ${code('update_engagement')} so the progress figure reflects reality.`
              : 'Under these inputs no phase drops out entirely. To lighten it, cut deliverables inside each phase rather than whole phases.',
            l,
          ),
        );
        out.push('');

        // --- 削って失うもの(トレードオフ) ---
        const tradeoffs = plans
          .map((p) => ({ plan: p, t: phaseTradeoff(p.phaseId, p.treatment) }))
          .filter((x): x is { plan: PhasePlan; t: PhaseTradeoff } => x.t !== null);
        if (tradeoffs.length > 0) {
          out.push(msg('## 削って失うもの', '## What the Cuts Cost You', l));
          out.push('');
          out.push(
            `| ${inline('フェーズ', 'Phase', l)} | ${inline('扱い', 'Treatment', l)} | ${inline('失うもの', 'What you lose', l)} | ${inline('埋め方', 'How to cover it', l)} |`,
          );
          out.push('| --- | :-: | --- | --- |');
          for (const { plan, t } of tradeoffs) {
            out.push(
              `| **${plan.code}.** ${cell(one(plan.name, l))} | ${TREATMENT_MARK[plan.treatment]} ${one(TREATMENT_LABEL[plan.treatment], l)} | ${cell(one(t.lose, l))} | ${cell(one(t.cover, l))} |`,
            );
          }
          out.push('');
          out.push(
            msg(
              'この表に 1 行でも許容できないものがあるなら、選べるのは 3 つだけ — そのフェーズを戻して期間を延ばす、対象範囲を 1 段狭めて `tailor_adm` を呼び直す、または「埋め方」を誰かの担当として引き受ける。何もしないと、失うものは失ったまま実装に入る。',
              'If even one row here is unacceptable, you have exactly three moves: restore that phase and extend the calendar, narrow the scope by one step and call `tailor_adm` again, or assign the "how to cover it" column to a named person. Do nothing and you enter build having lost these for real.',
              l,
            ),
          );
          out.push('');
        }

        // --- 作る成果物 ---
        // 「どのフェーズで作るか」は拾った時点で確定させる(後から探すと別フェーズに帰属してしまう)
        const make: { id: string; code: string }[] = [];
        for (const p of plans) {
          if (p.treatment === 'skip') continue;
          const phase = findPhase(p.phaseId);
          if (!phase) continue;
          const take = p.treatment === 'core' ? 2 : 1;
          for (const id of phase.deliverableIds.slice(0, take)) {
            if (!make.some((m) => m.id === id)) make.push({ id, code: p.code });
          }
        }
        const makeIds = make.map((m) => m.id);
        out.push(msg('## 作る成果物', '## Deliverables You Produce', l));
        out.push('');
        out.push(
          `| ${inline('成果物', 'Deliverable', l)} | ${inline('作るフェーズ', 'Phase', l)} | ${inline('何のために', 'What it is for', l)} |`,
        );
        out.push('| --- | :-: | --- |');
        for (const m of make) {
          const d = findDeliverable(m.id);
          if (!d) continue;
          out.push(
            `| **${cell(one(d.name, l))}** (${code(d.id)}) | ${m.code} | ${cell(one(d.summary, l))} |`,
          );
        }
        out.push('');
        out.push(
          msg(
            `雛形は ${code('generate_deliverable_template')} に上の ID を渡せば出る。書き始める前に、それぞれ「誰が読んで、何を判断するのか」を 1 行で決めること。読み手のいない成果物は作らない。`,
            `Get skeletons by passing the ids above to ${code('generate_deliverable_template')}. Before writing, state in one line who reads each one and what they decide with it. If there is no reader, do not produce it.`,
            l,
          ),
        );
        out.push('');

        // --- 作らない成果物 ---
        const skipIds = DELIVERABLES.filter((d) => !makeIds.includes(d.id));
        out.push(msg('## 今回は作らない成果物', '## Deliverables You Skip This Round', l));
        out.push('');
        if (skipIds.length === 0) {
          out.push(msg('(すべて作る対象)', '(none — all are in scope)', l));
        } else {
          const shown = skipIds.slice(0, 12);
          out.push(shown.map((d) => `${one(d.name, l)} (${code(d.id)})`).join(' ・ '));
          if (skipIds.length > shown.length) {
            out.push('');
            out.push(inline(`ほか ${skipIds.length - shown.length} 件`, `and ${skipIds.length - shown.length} more`, l));
          }
        }
        out.push('');
        out.push(
          msg(
            'これらを作らないのは手抜きではなく設計。必要になった時点で 1 件ずつ足す方が、最初に全部並べて 8 割を空欄のまま放置するより速い。',
            'Skipping these is a design choice, not a shortcut. Adding one when it is actually needed beats lining them all up front and leaving 80% of them blank.',
            l,
          ),
        );
        out.push('');

        // --- レビューの置き方 ---
        const gates = buildReviewGates(plans, s);
        out.push(msg('## レビューをどこに置くか', '## Where the Reviews Go', l));
        out.push('');
        out.push(
          `| ${inline('タイミング', 'When', l)} | ${inline('誰が見るか', 'Who', l)} | ${inline('何を見るか', 'What they check', l)} | ${inline('通らなかったとき', 'If it fails', l)} |`,
        );
        out.push('| --- | --- | --- | --- |');
        for (const g of gates) {
          out.push(
            `| ${cell(one(g.when, l))} | ${cell(one(g.who, l))} | ${cell(one(g.what, l))} | ${cell(one(g.fail, l))} |`,
          );
        }
        out.push('');
        out.push(
          msg(
            `レビューは ${gates.length} 回だけ置く。会議を増やすほど統制が効くわけではなく、「通らなかったときに何が起きるか」が決まっている回だけが効く。既存の会議体に相乗りできるなら新設しない。`,
            `Only ${gates.length} reviews. More meetings do not mean more control — only the ones with a defined consequence for failing do anything. If an existing forum can host them, do not create a new one.`,
            l,
          ),
        );
        out.push('');

        // --- 次にこれを呼ぶ ---
        out.push(msg('## 次にこれを呼ぶ', '## Call these next', l));
        out.push('');
        let step = 0;
        if (tradeoffs.length > 0) {
          out.push(
            `${++step}. ${inline(`**「削って失うもの」の ${tradeoffs.length} 行を上から読み、許容できない行に印を付ける**`, `**Read ${tradeoffs.length === 1 ? 'the single row' : `all ${tradeoffs.length} rows`} of "What the cuts cost you" and mark what you cannot accept**`, l)} — ${inline('印が 0 ならこの設計のまま進めてよい。1 つでも付いたら、その行だけを持ってスポンサーに期間か範囲かを選ばせる', 'no marks means this design is safe to run as-is; one or more, and you take just those rows to the sponsor and make them choose calendar or scope', l)}`,
          );
        }
        out.push(
          `${++step}. ${code('start_engagement')} — ${inline('この設計で案件を作る', 'create the engagement on this design', l)}`,
        );
        // 省いたフェーズが無いのに「skipped にしろ」と言わない(この設計には該当する行が無い)
        if (cutPhases.length > 0) {
          out.push(
            `${++step}. ${code('update_engagement')} — ${inline(`削った ${cutPhases.length} フェーズ(${cutPhases.map((p) => p.code).join(', ')})を skipped にする`, `mark the ${cutPhases.length} cut ${cutPhases.length === 1 ? 'phase' : 'phases'} (${cutPhases.map((p) => p.code).join(', ')}) as skipped`, l)}`,
          );
        }
        out.push(
          `${++step}. ${code('next_best_action')} — ${inline('作ったら、今週やることを取る', 'then pull this week’s actions', l)}`,
        );
        out.push('');
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `tailor_adm の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `tailor_adm failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // 4. explain_for
  // -------------------------------------------------------------------------
  server.registerTool(
    'explain_for',
    {
      title: 'Explain it for this audience',
      description:
        'topic に書いた内容と、保存済みの案件の実データ(準備度・リスク・関係者・作業パッケージ・期限)を読んで、その相手にどう話すかを組み立てて返す。topic から論点(金額・期日・過去の失敗・規模・現場影響・技術・リスク・未決)を拾い、相手ごとの刺さり方に翻訳する。audience は executive / business / engineer / pmo のほか「営業本部長」「生産管理部長」のような自由記述でもよく、役職の高さと持ち場を読み分ける。言い換え表は topic に出てきた用語だけを載せる。 / Build the pitch from what you wrote in topic plus the stored engagement (readiness, risks, stakeholders, work packages, dates). Signals in the topic — money, dates, past failures, scale, impact on staff, technology, risk, open questions — are translated into what each audience does with them. audience takes executive / business / engineer / pmo or free text such as "head of sales", from which seniority and functional patch are read. The jargon table lists only terms that actually appear in your topic.',
      inputSchema: {
        topic: freeTextSchema(
          '説明したい内容。金額・期日・過去の経緯・規模まで書くほど出力が具体的になる / What you need to explain. The more you include — money, dates, history, scale — the more specific the answer',
        ).optional(),
        audience: freeTextSchema(
          '相手。executive / business / engineer / pmo のいずれか、または「営業本部長」「工場の生産管理担当」のような自由記述 / The audience: executive, business, engineer, pmo, or free text such as "head of sales" or "production planner at the plant"',
          300,
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ topic, audience, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText(
          [
            { field: 'topic', value: topic, hint: HINTS.situation },
            { field: 'audience', value: audience, limit: 300, hint: HINTS.identifier },
          ],
          l,
        );
        if (tooLong) return tooLong;
        const rawTopic = (topic ?? '').trim();
        const rawAudience = (audience ?? '').trim();

        // --- 引数が足りないときは、何を入れればよいかとコピペできる JSON を返す ---
        if (rawTopic.length < 2 || rawAudience.length === 0) {
          const guide: string[] = [];
          guide.push(msg('# 相手に合わせて説明を組む', '# Build the Pitch for One Audience', l));
          guide.push('');
          guide.push(
            msg(
              '2 つだけ渡せば動く。topic に書いた内容がそのまま出力を変えるので、思いつく限り具体的に書くほうが得。',
              'Two inputs are enough. What you write in topic is what changes the answer, so the more concrete it is the better.',
              l,
            ),
          );
          guide.push('');
          guide.push(
            `| ${inline('引数', 'Field', l)} | ${inline('何を書くか', 'What to write', l)} | ${inline('書くと変わること', 'What it changes', l)} |`,
          );
          guide.push('| --- | --- | --- |');
          guide.push(
            `| ${code('topic')} | ${cell(inline('説明したい中身。金額・期日・これまでの経緯・規模まで', 'What you need to explain — include money, dates, history, and scale', l))} | ${cell(inline('拾う論点が変わり、話す順序と避けることが変わる', 'Which signals get picked up, and with them the running order and the pitfalls', l))} |`,
          );
          guide.push(
            `| ${code('audience')} | ${cell(inline('相手。役職名や部署名をそのまま書いてよい', 'The audience — a job title or department name is fine', l))} | ${cell(inline('話す単位・見せる図・言い換え先が変わる', 'The units, the diagram, and what the jargon becomes', l))} |`,
          );
          guide.push('');
          guide.push(msg('## そのまま使える例', '## Copy one of these', l));
          guide.push('');
          guide.push('```json');
          guide.push('{"topic": "12億円かけた基幹システム刷新を、2回の頓挫のあと再開したい。来月の投資委員会に諮る", "audience": "経営層"}');
          guide.push('```');
          guide.push('');
          guide.push('```json');
          guide.push('{"topic": "受注入力の画面が変わり、移行期は3か月ほど二重入力が発生する", "audience": "営業本部長"}');
          guide.push('```');
          guide.push('');
          guide.push('```json');
          guide.push('{"topic": "クラウド移行に伴い、生産計画の締め時刻を1時間前倒しする必要がある", "audience": "生産管理部長"}');
          guide.push('```');
          guide.push('');
          const eng = loadEngagement();
          if (eng) {
            guide.push(
              msg(
                `案件「${flat(eng.name)}」が保存されているので、呼べば登録済みのリスク・関係者・準備度をそのまま材料にする。`,
                `The engagement "${flat(eng.name)}" is stored, so a real call will pull its recorded risks, stakeholders, and readiness straight in.`,
                l,
              ),
            );
            const named = eng.stakeholders.slice(0, 3).map((s) => flat(clip(s.name, 20)));
            if (named.length > 0) {
              guide.push('');
              guide.push(
                msg(
                  `登録済みの関係者をそのまま audience に書くと、その人の関心事から組む: ${named.join(' / ')}`,
                  `Put a recorded stakeholder in audience and the pitch is built from their concerns: ${named.join(' / ')}`,
                  l,
                ),
              );
            }
          } else {
            guide.push(
              msg(
                `案件を ${code('start_engagement')} で作っておくと、登録済みのリスク・関係者・準備度を材料に使えるようになる。`,
                `Create an engagement with ${code('start_engagement')} and the answer starts drawing on your recorded risks, stakeholders, and readiness.`,
                l,
              ),
            );
          }
          guide.push('');
          return textResult(guide.join('\n'));
        }

        const who = resolveAudience(rawAudience);
        const a = who.archetype;
        const profile = AUDIENCES[a];
        // 4 択をそのまま渡されたときは、生の enum 値ではなく型の名称で呼ぶ
        const whoLabel = who.exact ? one(profile.name, l) : who.label;
        const signals = detectSignals(rawTopic);
        const weight = topicWeight(rawTopic, signals);
        const engagement = loadEngagement();
        const hits = searchKnowledge(rawTopic, { limit: 3 });
        const jargon = detectJargon(rawTopic, a);
        const unknownJargon = detectUnknownJargon(rawTopic, jargon);

        const out: string[] = [];
        out.push(
          msg(
            `# 「${clip(flat(rawTopic), 44)}」を ${whoLabel} に説明する`,
            `# Explaining "${clip(flat(rawTopic), 44)}" to ${whoLabel}`,
            l,
          ),
        );
        out.push('');

        // --- 相手の読み取り結果(自由記述をどう解釈したかを開示する) ---
        const readParts = [
          `${inline('話し方の型', 'Shape', l)}: **${one(profile.name, l)}**`,
          who.seniority ? `${inline('役職の高さ', 'Level', l)}: ${one(SENIORITY_LABEL[who.seniority], l)}` : '',
          who.domain ? `${inline('持ち場', 'Patch', l)}: ${one(DOMAIN_PROFILES[who.domain].name, l)}` : '',
        ].filter((x) => x.length > 0);
        out.push(readParts.join(' ・ '));
        if (!who.resolved) {
          out.push('');
          out.push(
            msg(
              `⚠ 「${whoLabel}」から相手の型を特定できなかったので、事業・業務部門向けとして組んである。違う場合は audience に ${code('executive')} / ${code('engineer')} / ${code('pmo')} のいずれか、または役職名(「経営企画部長」など)を書き足すと組み立てが変わる。`,
              `⚠ Could not read an audience type from "${whoLabel}", so this is built for a business/operations audience. If that is wrong, pass ${code('executive')}, ${code('engineer')}, or ${code('pmo')} — or a job title — and the whole build changes.`,
              l,
            ),
          );
        }
        out.push('');

        // --- 話の重さの見立て(topic 依存) ---
        out.push(one(WEIGHT_READ[weight][a], l));
        out.push('');

        // --- topic から拾った論点 ---
        out.push(msg('## この topic の何が論点か', '## What Is Actually At Stake Here', l));
        out.push('');
        if (signals.length === 0) {
          out.push(
            msg(
              'topic からは論点を 1 つも拾えなかった(金額・期日・過去の経緯・規模・現場影響・技術方式・リスク・未決事項のどれも書かれていない)。この状態で組める説明は一般論にしかならない。次の 1 問だけ自分に問うて topic に書き足すと、以降の出力が具体的になる — **「これを説明した結果、相手に何をしてほしいのか」**。',
              'No signals could be read from the topic — no money, date, history, scale, impact on people, technology, risk, or open question appears in it. Anything built from this can only be generic. Answer one question and add it to the topic, and everything below sharpens: **what do you want this audience to do as a result?**',
              l,
            ),
          );
          out.push('');
        } else {
          out.push(
            `| ${inline('拾った論点', 'Signal read', l)} | ${inline('topic 中の記述', 'From your topic', l)} | ${inline('この相手にとっての意味', 'What it means to them', l)} | ${inline('だからこう話す', 'So say it this way', l)} |`,
          );
          out.push('| --- | --- | --- | --- |');
          for (const s of signals) {
            const per = s.def.per[a];
            out.push(
              `| **${cell(one(s.def.label, l))}** | ${cell(s.evidence)} | ${cell(one(per.meaning, l))} | ${cell(one(per.say, l))} |`,
            );
          }
          out.push('');
          const lead = signals[0];
          out.push(
            msg(
              `冒頭に置くのは **${flat(one(lead.def.label, 'ja'))}**(「${flat(lead.evidence)}」)。${flat(one(lead.def.per[a].say, 'ja'))}`,
              `Open on **${flat(one(lead.def.label, 'en')).toLowerCase()}** ("${flat(lead.evidence)}"). ${flat(one(lead.def.per[a].say, 'en'))}`,
              l,
            ),
          );
          out.push('');
        }

        // --- 相手の持ち場(自由記述で持ち場が読めたときだけ) ---
        if (who.domain) {
          const d = DOMAIN_PROFILES[who.domain];
          out.push(msg('## この相手固有の事情', '## What Is Specific To This Person', l));
          out.push('');
          out.push(`| ${inline('観点', 'Aspect', l)} | ${inline('この持ち場では', 'On this patch', l)} |`);
          out.push('| --- | --- |');
          out.push(`| ${cell(inline('守っている数字', 'Numbers they are held to', l))} | ${cell(one(d.currency, l))} |`);
          out.push(`| ${cell(inline('最初に浮かぶ不安', 'Their first fear', l))} | ${cell(one(d.fear, l))} |`);
          out.push(`| ${cell(inline('この人にだけ効く一手', 'The move that works here', l))} | ${cell(one(d.hook, l))} |`);
          out.push('');
          if (who.seniority === 'ic') {
            out.push(
              msg(
                '実務担当が相手なので、承認を求めないこと。求めるのは「この手順で本当に回るか」の検証と、抜けている例外の指摘。',
                'This is the person who does the work, so do not ask for approval. Ask whether the process actually runs, and which exceptions are missing.',
                l,
              ),
            );
            out.push('');
          } else if (who.seniority === 'head') {
            out.push(
              msg(
                '部門長は自部門の範囲なら即決できる。全社の話に広げず、その部門で決められることに絞って持っていくと、その場で 1 つ決まる。',
                'A department head can decide inside their own unit on the spot. Keep it to what they can settle themselves rather than widening to the enterprise, and you leave with one decision made.',
                l,
              ),
            );
            out.push('');
          }
        }

        // --- 案件の実データ ---
        out.push(msg('## あなたの案件から使える材料', '## Material From Your Own Engagement', l));
        out.push('');
        if (!engagement) {
          out.push(
            msg(
              `案件が保存されていないので、ここは一般論しか出せない。${code('start_engagement')} で案件を作り、リスク・関係者・準備度を登録してからもう一度呼ぶと、この節が「あなたの案件では最大のリスクは X で担当が未設定。この相手には最初にこれを言う」に変わる。`,
              `No engagement is stored, so this section can only be generic. Create one with ${code('start_engagement')}, record risks, stakeholders, and readiness, then call this again — the section turns into "your biggest risk is X and it has no owner; lead with that for this audience".`,
              l,
            ),
          );
          out.push('');
        } else {
          const facts = engagementFacts(engagement, a, who, l);
          out.push(
            msg(
              `案件「${flat(engagement.name)}」に登録されている値をそのまま引いている。`,
              `Pulled straight from the values recorded on "${flat(engagement.name)}".`,
              l,
            ),
          );
          out.push('');
          out.push(`| ${inline('登録されている事実', 'What is on record', l)} | ${inline('この相手にはこう出す', 'How to use it with this audience', l)} |`);
          out.push('| --- | --- |');
          for (const f of facts) {
            out.push(`| ${cell(one(f.fact, l))} | ${cell(one(f.say, l))} |`);
          }
          out.push('');
        }

        // --- 相手の型 ---
        out.push(msg('## 相手の型', '## The Shape of This Audience', l));
        out.push('');
        out.push(`| ${inline('項目', 'Aspect', l)} | ${inline('この相手向けの答え', 'For this audience', l)} |`);
        out.push('| --- | --- |');
        const rows: [Bilingual, Bilingual][] = [
          [{ ja: '持ち時間', en: 'Time budget' }, profile.time],
          [{ ja: '最初の 1 文', en: 'Opening line' }, profile.opener],
          [{ ja: '使う単位・言葉', en: 'Units and vocabulary' }, profile.unit],
          [{ ja: '見せる図', en: 'The one diagram' }, profile.visual],
          [{ ja: '相手に求めること', en: 'What you need from them' }, profile.ask],
          [{ ja: '納得する瞬間', en: 'What convinces them' }, profile.convinced],
        ];
        for (const [k, v] of rows) {
          out.push(`| ${cell(one(k, l))} | ${cell(one(v, l))} |`);
        }
        out.push('');

        // --- 骨子(相手の型 + topic 固有の差し込み) ---
        out.push(msg('## この順に話す', '## Say It In This Order', l));
        out.push('');
        interface OutlineItem {
          at: number;
          text: Bilingual;
          topical: boolean;
        }
        const outline: OutlineItem[] = profile.outline.map((o, i) => ({ at: i, text: o, topical: false }));
        const hasSignal = (id: SignalId): boolean => signals.some((s) => s.def.id === id);
        const insert = (at: number, text: Bilingual): void => {
          outline.push({ at, text, topical: true });
        };
        if (hasSignal('failure')) {
          insert(0.1, {
            ja: '前回止まった理由(1 文)と、今回それが再発しない根拠(1 文)',
            en: 'One sentence on why it stopped last time, one on why that cannot recur',
          });
        }
        if (hasSignal('unsettled')) {
          insert(0.2, {
            ja: 'まだ決まっていないこと(誰がいつ決めるかまで)',
            en: 'What is still open — including who settles it and when',
          });
        }
        if (hasSignal('deadline') && (a === 'executive' || a === 'pmo')) {
          insert(0.3, {
            ja: 'その期日から逆算した「今日決めないと間に合わないこと」',
            en: 'Working back from that date: what must be decided today to still make it',
          });
        }
        if (hasSignal('people') && (a === 'business' || a === 'executive')) {
          insert(2.5, {
            ja: '移行期に現場が余分に負う手間と、それが終わる日',
            en: 'The extra load the floor carries during transition, and the date it ends',
          });
        }
        if (hasSignal('risk') && a === 'engineer') {
          insert(0.5, {
            ja: '規制・セキュリティ由来の制約(検証方法を併記する)',
            en: 'Constraints coming from regulation or security, each paired with how it is verified',
          });
        }
        if (hasSignal('money') && a === 'executive') {
          insert(1.5, {
            ja: '金額の桁と振れ幅(内訳は聞かれるまで出さない)',
            en: 'The order of magnitude and the range — no breakdown until asked',
          });
        }
        outline.sort((x, y) => x.at - y.at);
        outline.forEach((o, i) => {
          const tag = o.topical
            ? ` ${inline('← この topic だから足す', '← added because of this topic', l)}`
            : '';
          out.push(`${i + 1}. ${one(o.text, l)}${tag}`);
        });
        out.push('');
        out.push(
          msg(
            `この順序は入れ替えない。特に 1 番を後ろに回した瞬間、${whoLabel}は聞くのをやめる。`,
            `Do not reorder this. The moment item 1 slides to the back, ${whoLabel} stops listening.`,
            l,
          ),
        );
        out.push('');

        // --- 言い換え表(topic に出てきた語だけ) ---
        out.push(msg('## 言い換え表(topic に出てきた語だけ)', '## Jargon Swap — Only Words In Your Topic', l));
        out.push('');
        if (jargon.length === 0) {
          out.push(
            msg(
              'topic に言い換えるべき専門用語は見当たらなかった。言い換え表は不要。',
              'No jargon that needs swapping appears in your topic, so there is no table to run.',
              l,
            ),
          );
          out.push('');
        } else {
          out.push(`| ${inline('topic 中の語', 'Word in your topic', l)} | ${inline('この相手に言う言葉', 'Say this instead', l)} |`);
          out.push('| --- | --- |');
          for (const j of jargon) {
            out.push(`| ${cell(one(j.term, l))} | ${cell(one(j.plain, l))} |`);
          }
          out.push('');
        }
        if (unknownJargon.length > 0) {
          out.push(
            msg(
              `辞書に無い語も topic に入っている: ${unknownJargon.map((w) => `**${flat(w)}**`).join(' / ')}。この相手に通じるかは自分で確かめること。通じない語は、言い換えるか一度も使わないかの二択で、説明の途中で定義するのが最も悪い。`,
              `Your topic also carries words this tool has no swap for: ${unknownJargon.map((w) => `**${flat(w)}**`).join(' / ')}. Check yourself whether they land with this audience. For a word that does not land, either swap it or never say it — defining it mid-pitch is the worst of the three.`,
              l,
            ),
          );
          out.push('');
        }

        // --- やってはいけない(型 + topic 由来) ---
        out.push(msg('## やってはいけない', '## Do Not', l));
        out.push('');
        for (const v of profile.avoid) {
          out.push(`- ${one(v, l)}`);
        }
        const extraAvoid: Bilingual[] = [];
        if (hasSignal('failure')) {
          extraAvoid.push({
            ja: '過去の失敗に触れずに進める(触れないほうが不誠実に見え、内容ごと疑われる)',
            en: 'Skating past the previous failure — silence reads as evasion and takes the rest of the content down with it',
          });
        }
        if (hasSignal('money') && a === 'executive') {
          extraAvoid.push({
            ja: '「概算です」とだけ言って幅を示さない(幅の無い概算は、後で必ず約束として扱われる)',
            en: 'Saying "rough estimate" without giving the range — a rangeless estimate is later treated as a commitment',
          });
        }
        if (hasSignal('tech') && (a === 'executive' || a === 'business')) {
          extraAvoid.push({
            ja: '製品名・方式名で話す(相手の地図に載っていない語は、そこで話が止まる)',
            en: 'Talking in product or approach names — a word that is not on their map stops the conversation there',
          });
        }
        if (hasSignal('unsettled')) {
          extraAvoid.push({
            ja: '未決事項を既決のように話す(1 つ露見すると、他の決定も全部疑われる)',
            en: 'Presenting an open question as settled — one exposure makes every other decision suspect',
          });
        }
        if (weight === 'light' && a === 'executive') {
          extraAvoid.push({
            ja: '軽い案件を大きく見せようとする(この場で最も損な振る舞い。規模ではなく横展開の可否で語る)',
            en: 'Inflating a light item to look big — the costliest move in this room. Argue rollout, not scale',
          });
        }
        for (const v of extraAvoid) {
          out.push(`- ${one(v, l)} ${inline('← この topic 固有', '← specific to this topic', l)}`);
        }
        out.push('');

        // --- 材料 ---
        if (hits.length > 0) {
          out.push(msg('## 参考(知識ベース)', '## Reference Entries', l));
          out.push('');
          out.push(`| ${inline('項目', 'Entry', l)} | ${inline('要約', 'Summary', l)} | ${inline('引くツール', 'Fetch with', l)} |`);
          out.push('| --- | --- | --- |');
          for (const h of hits) {
            out.push(
              `| **${cell(one(h.title, l))}** | ${cell(one(h.snippet, l))} | ${code(`${KIND_TOOL[h.kind]} ${h.id}`)} |`,
            );
          }
          out.push('');
          out.push(
            msg(
              'これは材料であって台本ではない。上の言い換え表を通してから使うこと。',
              'Material, not a script. Run it through the swap table above before it goes anywhere near the room.',
              l,
            ),
          );
          out.push('');
        }

        // --- 次にこれを呼ぶ(案件の状態で変える) ---
        out.push(msg('## 次にこれを呼ぶ', '## Call these next', l));
        out.push('');
        if (a === 'executive' && engagement && engagement.workPackages.length === 0) {
          out.push(
            `- ${code('add_work_package')} — ${inline('金額と時期を聞かれる前に、実行単位を作っておく(いま 0 件)', 'create the units of work before you are asked for money and dates — there are none yet', l)}`,
          );
        }
        if (engagement && !latestReadiness(engagement)) {
          out.push(
            `- ${code('assess_readiness')} — ${inline('「本当に着手できるのか」に数字で答えられるようにする', 'so that "can we actually start" has a number behind it', l)}`,
          );
        }
        if (a === 'engineer') {
          out.push(
            `- ${code('suggest_archimate_view')} — ${inline('この相手の関心に答える図の構成を決める', 'decide the structure of the diagram that answers their question', l)}`,
          );
          out.push(
            `- ${code('diagram_c4_context')} — ${inline('30 秒で全体像を見せる 1 枚', 'the one picture that shows the whole shape in 30 seconds', l)}`,
          );
        } else if (a === 'pmo') {
          out.push(
            `- ${code('get_roadmap')} — ${inline('依存関係と止まれる場所を含めた計画表', 'the plan with dependencies and the places you can pause', l)}`,
          );
          out.push(
            `- ${code('diagram_roadmap_gantt')} — ${inline('そのまま貼れるガントチャート', 'a Gantt chart you can paste in', l)}`,
          );
        } else if (a === 'executive') {
          out.push(
            `- ${code('diagram_c4_context')} — ${inline('全体像を 1 枚で(製品名を出さずに済む)', 'the whole shape in one picture, with no product names', l)}`,
          );
          out.push(
            `- ${code('export_report')} — ${inline('配布用の 1 枚として書き出す', 'export it as a hand-out', l)}`,
          );
        } else {
          out.push(
            `- ${code('diagram_value_stream')} — ${inline('変更前後の業務の流れを 1 枚に', 'the flow of work, before and after, on one page', l)}`,
          );
          out.push(
            `- ${code('generate_deliverable_template')} — ${inline('この骨子を成果物の雛形に落とす', 'turn the outline into a deliverable skeleton', l)}`,
          );
        }
        out.push(
          `- ${code('update_engagement')} — ${inline('話した結果(相手の反応・出た懸念)をその場で関係者の関心事に追記する', 'record what came back — their reaction and any new concern — onto that stakeholder', l)}`,
        );
        out.push('');
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `explain_for の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `explain_for failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  // -------------------------------------------------------------------------
  // 5. whats_new_for_me
  // -------------------------------------------------------------------------
  server.registerTool(
    'whats_new_for_me',
    {
      title: "What's new (and what stopped)",
      description:
        '直近 N 日で動いたものと、未完了のまま N 日以上動いていないものを一覧で返す。主目的は後者 — 止まっているものの発見。進捗報告で最も価値がある情報がここにある。 / List what moved in the last N days and what has been sitting unfinished for longer than that. The second list is the point: finding what stopped is the most useful thing in any status report.',
      inputSchema: {
        sinceDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(7)
          .describe('何日分を「直近」とみなすか(既定 7) / How many days count as recent (default 7)'),
        lang: langSchema,
      },
    },
    async ({ sinceDays, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const days = sinceDays;
        const engagement = loadEngagement();
        if (!engagement) {
          return textResult(
            [
              msg('# 動いたもの / 止まっているもの', '# What Moved, What Stopped', l),
              '',
              msg(
                '案件がまだ無いので、比べる更新履歴がありません。',
                'There is no engagement yet, so there is no history to compare.',
                l,
              ),
              '',
              `- ${code('start_here')} — ${inline('ここから始める', 'start here', l)}`,
              '',
            ].join('\n'),
          );
        }

        const items = collectActivity(engagement, l);
        const moved = items.filter((i) => i.days <= days).sort((a, b) => a.days - b.days);
        const stalled = items.filter((i) => i.open && i.days > days).sort((a, b) => b.days - a.days);
        const engagementAge = daysSince(engagement.updatedAt);

        const overdue = engagement.actions
          .filter((a) => a.status !== 'done')
          .map((a) => ({ a, left: daysUntil(a.due) }))
          .filter((x): x is { a: (typeof engagement.actions)[number]; left: number } => x.left !== null && x.left < 0)
          .sort((a, b) => a.left - b.left);

        const out: string[] = [];
        out.push(
          msg(
            `# 動いたもの / 止まっているもの — ${flat(engagement.name)}`,
            `# What Moved, What Stopped — ${flat(engagement.name)}`,
            l,
          ),
        );
        out.push('');
        out.push(
          `${inline('対象期間', 'Window', l)}: ${inline(`直近 ${days} 日`, `last ${days} days`, l)} ・ ` +
            `${inline('動いた', 'moved', l)}: **${moved.length}** ・ ` +
            `${inline('止まっている', 'stalled', l)}: **${stalled.length}**` +
            (engagementAge !== null
              ? ` ・ ${inline('案件の最終更新', 'record last touched', l)}: ${inline(`${engagementAge} 日前`, `${engagementAge}d ago`, l)}`
              : ''),
        );
        out.push('');

        // --- 種別ごとの内訳 ---
        const kinds = Array.from(new Set(items.map((i) => i.kind.ja)));
        if (kinds.length > 0) {
          out.push(
            `| ${inline('種別', 'Kind', l)} | ${inline('動いた', 'Moved', l)} | ${inline('止まっている', 'Stalled', l)} |`,
          );
          out.push('| --- | :-: | :-: |');
          for (const k of kinds) {
            const kindItem = items.find((i) => i.kind.ja === k);
            if (!kindItem) continue;
            const m = moved.filter((i) => i.kind.ja === k).length;
            const st = stalled.filter((i) => i.kind.ja === k).length;
            if (m === 0 && st === 0) continue;
            out.push(`| ${cell(one(kindItem.kind, l))} | ${m} | ${st > 0 ? `**${st}**` : '0'} |`);
          }
          out.push('');
        }

        // --- 期限超過 ---
        if (overdue.length > 0) {
          out.push(msg('## 期限超過(先に処理する)', '## Overdue (handle these first)', l));
          out.push('');
          for (const o of overdue.slice(0, 8)) {
            out.push(
              `- **${flat(clip(o.a.title, 40))}** — ${inline(`${Math.abs(o.left)} 日超過`, `${Math.abs(o.left)} days past due`, l)}${o.a.owner ? ` (${flat(o.a.owner)})` : ''}`,
            );
          }
          out.push('');
        }

        // --- 止まっているもの(本題) ---
        out.push(msg('## 止まっているもの', '## What Stopped Moving', l));
        out.push('');
        if (stalled.length === 0) {
          out.push(
            msg(
              `未完了のまま ${days} 日以上放置されているものは無い。この状態は長くは続かないので、次の一手を取りに行く。`,
              `Nothing unfinished has been sitting for more than ${days} days. That state never lasts long — go pull the next actions.`,
              l,
            ),
          );
          out.push('');
        } else {
          out.push(
            `| ${inline('種別', 'Kind', l)} | ${inline('対象', 'Item', l)} | ${inline('停滞', 'Stalled', l)} | ${inline('状態', 'Status', l)} | ${inline('動かし方', 'How to move it', l)} |`,
          );
          out.push('| --- | --- | :-: | --- | --- |');
          for (const i of stalled.slice(0, 12)) {
            out.push(
              `| ${cell(one(i.kind, l))} | ${cell(i.subject)} | ${inline(`${i.days} 日`, `${i.days}d`, l)} | ${cell(i.status)} | ${cell(one(i.hint, l))} ${code(i.tool)} |`,
            );
          }
          if (stalled.length > 12) {
            out.push('');
            out.push(inline(`ほか ${stalled.length - 12} 件`, `and ${stalled.length - 12} more`, l));
          }
          out.push('');
          const worst = stalled[0];
          out.push(
            msg(
              `**まずこの 1 件**: 「${flat(worst.subject)}」が ${worst.days} 日動いていない。${one(worst.hint, 'ja')} → ${code(worst.tool)}。全部を一度に動かそうとすると、また同じ状態に戻る。`,
              `**Start with one**: "${flat(worst.subject)}" has not moved in ${worst.days} days. ${one(worst.hint, 'en')} — ${code(worst.tool)}. Trying to restart everything at once puts you right back here.`,
              l,
            ),
          );
          out.push('');
        }

        // --- 動いたもの ---
        out.push(msg(`## 直近 ${days} 日で動いたもの`, `## Moved in the Last ${days} Days`, l));
        out.push('');
        if (moved.length === 0) {
          const age = daysSince(engagement.createdAt);
          out.push(
            age !== null && age <= days
              ? msg(
                  `この案件は${age === 0 ? '今日' : `${age} 日前に`}作られたばかりで、まだ記録が入っていない。${code('next_best_action')} の 1 番から埋め始める。`,
                  `This engagement was created ${age === 0 ? 'today' : `${age} day(s) ago`} and has no entries yet. Start filling it from item 1 of ${code('next_best_action')}.`,
                  l,
                )
              : msg(
                  'この期間の更新は 0 件。記録が止まっているのか、案件そのものが止まっているのかを先に切り分けること。前者なら 30 分で追いつく。',
                  'Nothing was updated in this window. Work out first whether the record stopped or the engagement stopped. If it is the record, 30 minutes catches it up.',
                  l,
                ),
          );
        } else {
          out.push(
            `| ${inline('種別', 'Kind', l)} | ${inline('対象', 'Item', l)} | ${inline('いつ', 'When', l)} | ${inline('状態', 'Status', l)} |`,
          );
          out.push('| --- | --- | :-: | --- |');
          for (const i of moved.slice(0, 12)) {
            const whenLabel =
              i.days === 0 ? inline('今日', 'today', l) : inline(`${i.days} 日前`, `${i.days}d ago`, l);
            out.push(`| ${cell(one(i.kind, l))} | ${cell(i.subject)} | ${whenLabel} | ${cell(i.status)} |`);
          }
          if (moved.length > 12) {
            out.push('');
            out.push(inline(`ほか ${moved.length - 12} 件`, `and ${moved.length - 12} more`, l));
          }
        }
        out.push('');

        out.push(
          msg(
            `そのまま進捗報告に使える。次は ${code('next_best_action')} で今週の一手を取り、${code('get_dashboard')} で共有用の 1 枚を出す。`,
            `This doubles as your status report. Next, pull this week’s moves with ${code('next_best_action')} and produce the shareable page with ${code('get_dashboard')}.`,
            l,
          ),
        );
        out.push('');
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `whats_new_for_me の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `whats_new_for_me failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );
}
