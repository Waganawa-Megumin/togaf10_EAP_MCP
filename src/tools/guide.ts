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
  RISK_STATUS_LABEL,
  WORK_PACKAGE_STATUS_LABEL,
} from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

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
  /** 使うツール */
  tool: string;
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
        tool: 'stakeholder_matrix',
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
      tool: 'risk_matrix',
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
      tool: 'get_roadmap',
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
      tool: 'prioritize_work_packages',
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
      tool: 'generate_review_checklist',
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
        tool: 'generate_deliverable_template',
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
      tool: 'check_engagement_health',
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
    tool: 'check_engagement_health',
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
  });

  return out.sort((a, b) => b.score - a.score);
}

/** 推奨行動を表に整形する */
function renderActions(actions: NextAction[], lang: Lang, horizon: Horizon): string[] {
  const out: string[] = [];
  out.push(
    `| # | ${inline('やること', 'Do this', lang)} | ${inline('なぜ今か', 'Why now', lang)} | ${inline('終わりの判定', 'Done when', lang)} | ${inline('ツール', 'Tool', lang)} |`,
  );
  out.push('| :-: | --- | --- | --- | --- |');
  actions.forEach((a, i) => {
    out.push(
      `| ${i + 1} | **${cell(one(a.title, lang))}** | ${cell(one(a.why, lang))} | ${cell(one(a.done, lang))} | ${code(a.tool)} |`,
    );
  });
  out.push('');
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
    out.push(`> ${cell(goal.trim())}`);
    out.push('');
    if (matches.length === 0) {
      const hits = searchKnowledge(goal, { limit: 4 });
      if (hits.length > 0) {
        out.push(
          msg('定型パターンには当たらなかった。近い項目はこのあたり。', 'No known pattern matched. The closest entries are:', lang),
        );
        out.push('');
        for (const h of hits) {
          out.push(`- ${code(`${KIND_TOOL[h.kind]} ${h.id}`)} — ${cell(one(h.title, lang))}`);
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

  if (goal && goal.trim().length > 0) {
    const matches = matchConsultRules(goal, engagement.currentPhaseId, 1);
    const top = matches[0];
    if (top) {
      out.push(
        msg(
          `**目的からの見立て**: ${one(top.rule.name, 'ja')} — 詳細は ${code('consult')} へ。`,
          `**Read on your goal**: ${one(top.rule.name, 'en')} — full detail from ${code('consult')}.`,
          lang,
        ),
      );
      out.push('');
    }
  }

  const actions = computeNextActions(engagement, 'week').slice(0, 3);
  out.push(msg('## 今週やる 3 つ', '## Three Things This Week', lang));
  out.push('');
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

interface PhasePlan {
  phaseId: string;
  code: string;
  name: Bilingual;
  treatment: Treatment;
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

/** 規模・目的・既存 EA の有無から、フェーズごとの扱いを決める */
function buildPhasePlans(
  scale: Scale,
  hasExistingEa: boolean,
  matchedDomains: ('b' | 'c' | 'd')[],
): PhasePlan[] {
  const plans: PhasePlan[] = [];
  const push = (phaseId: string, treatment: Treatment, reason: Bilingual, continuous = false): void => {
    const p = findPhase(phaseId);
    if (!p) return;
    plans.push({
      phaseId,
      code: p.code,
      name: p.name,
      treatment,
      reason,
      weight: treatmentWeight(treatment),
      continuous,
    });
  };

  // Preliminary
  if (hasExistingEa) {
    push(
      'preliminary',
      scale === 'large' ? 'light' : 'skip',
      scale === 'large'
        ? { ja: '既存の原則とガバナンスを棚卸しし、今回の案件に効く分だけ更新する', en: 'Take stock of existing principles and governance; refresh only what this engagement needs' }
        : { ja: '既存 EA の原則とガバナンスをそのまま流用する。作り直さない', en: 'Reuse the existing principles and governance as-is. Do not rebuild them' },
    );
  } else {
    push(
      'preliminary',
      scale === 'small' ? 'light' : 'core',
      scale === 'small'
        ? { ja: '原則は 5 個だけ、半日で決める。誰がアーキテクチャ決定を覆せるかだけ明文化する', en: 'Five principles, decided in half a day. Write down only who can overturn an architecture decision' }
        : { ja: '承認の経路と原則が無いと、後続の成果物が「誰の承認で正しいのか」を説明できない', en: 'Without an approval path and principles, later deliverables cannot say whose approval makes them right' },
    );
  }

  // A は規模を問わず必須
  push('a', 'core', {
    ja: 'どんなに小さくても省けない。目的・範囲・成功の判定基準の合意がここで固まる',
    en: 'Never cut, at any size. Purpose, scope, and the definition of success are agreed here',
  });

  // B / C / D
  const domainSet = new Set(matchedDomains);
  const domainReason = (hit: boolean): Bilingual => {
    if (hit) {
      return {
        ja: `目的の記述がこの領域を直接指している。ここは現状と目標の両方を描く`,
        en: 'Your stated purpose points straight at this domain. Describe both the baseline and the target here',
      };
    }
    return {
      ja: '目的に直接効かない領域。影響が出る箇所だけ 1 枚の一覧で押さえ、描き込まない',
      en: 'Not on the critical path for your purpose. Capture only the affected items in one list; do not model it',
    };
  };
  for (const id of ['b', 'c', 'd'] as const) {
    const hit = domainSet.size === 0 ? (scale === 'small' ? id === 'b' : true) : domainSet.has(id);
    let treatment: Treatment;
    if (hit) {
      treatment = 'core';
    } else if (scale === 'small') {
      treatment = 'skip';
    } else if (scale === 'large') {
      treatment = 'core';
    } else {
      treatment = 'light';
    }
    push(id, treatment, domainReason(hit));
  }

  // E / F
  push(
    'e',
    'core',
    scale === 'small'
      ? { ja: 'ギャップを実行単位に束ねる作業。ここを省くと「良い絵」で終わる', en: 'This is where gaps become units of work. Cut it and you are left with a nice picture' }
      : { ja: '投資判断の材料(価値・規模・順序)を作る。E が薄いと F はただの日程表になる', en: 'Produces the material for the investment decision: value, size, sequence. A thin E leaves F as a bare calendar' },
  );
  push(
    'f',
    scale === 'small' ? 'skip' : scale === 'large' ? 'core' : 'light',
    scale === 'small'
      ? { ja: '小規模では E と分ける意味が薄い。1 枚のロードマップに統合する', en: 'At this size, separating it from E buys nothing. Fold it into a single roadmap' }
      : { ja: '既存のプロジェクト計画・予算プロセスに接続する。新しい様式は作らない', en: 'Wire into the existing project and budget process. Do not invent a new format' },
  );

  // G
  push(
    'g',
    scale === 'large' ? 'core' : 'light',
    scale === 'large'
      ? { ja: '実装が複数走る。逸脱の受け口と例外の期限を決めないと、統制が形だけになる', en: 'Several builds run in parallel. Without an exception path and expiry dates, governance is decorative' }
      : { ja: 'レビューを 1 回だけ置く。逸脱の許可条件を先に書いておけば会議は短くて済む', en: 'One review, once. Write the conditions for allowing deviations up front and the meeting stays short' },
  );

  // H
  push(
    'h',
    scale === 'large' ? 'core' : 'skip',
    scale === 'large'
      ? { ja: '複数年で回すなら変更管理が本体。変更を止めず、捌く順路を決める', en: 'Over multiple years, change management is the main event. Do not block change — route it' }
      : { ja: '単発の案件は H を回す前に終わる。変更要求の宛先だけ決めて次回へ送る', en: 'A one-off engagement ends before H matters. Just name where change requests go and move on' },
  );

  // Requirements Management
  push(
    'requirements-management',
    scale === 'small' ? 'light' : 'core',
    scale === 'small'
      ? { ja: '要求と決定を 1 つの表で管理する。専用の仕組みは作らない', en: 'One table for requirements and decisions. Do not stand up a dedicated tool' }
      : { ja: '全期間並走。要求の変更が来たとき、どの成果物に跳ねるかを追える状態にしておく', en: 'Runs throughout. Keep it possible to trace which deliverables a requirement change hits' },
    true,
  );

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
  scale: Scale,
  timeboxWeeks: number,
  matchedDomains: ('b' | 'c' | 'd')[],
): { cut: PhasePlan[]; fits: boolean; needWeeks: number } {
  const nominal = NOMINAL_WEEKS[scale];
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

  // 理由は最終的な扱いに合わせて書き直す(「省く」なのに進め方が書いてある状態を避ける)
  for (const plan of cut) {
    plan.reason =
      plan.treatment === 'skip'
        ? {
            ja: `${timeboxWeeks} 週に収めるため今回は外す。必要だと分かった時点で次サイクルに回す`,
            en: `Dropped to fit ${timeboxWeeks} weeks. Move it to the next cycle if it turns out to matter`,
          }
        : {
            ja: `${plan.reason.ja}(${timeboxWeeks} 週に収めるため縮小)`,
            en: `${plan.reason.en} (trimmed to fit ${timeboxWeeks} weeks)`,
          };
  }

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
        goal: z
          .string()
          .optional()
          .describe('やりたいことの自由記述(任意) / What you are trying to achieve, in free text'),
        lang: langSchema,
      },
    },
    async ({ goal, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
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
        out.push(...renderActions(actions, l, h));

        if (all.length > actions.length) {
          const rest = all.slice(actions.length, actions.length + 4);
          out.push(msg('## 次点(この期間では扱わない)', '## Next up (out of scope for this horizon)', l));
          out.push('');
          for (const r of rest) {
            out.push(`- ${cell(one(r.title, l))} — ${code(r.tool)}`);
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
        purpose: z
          .string()
          .min(3)
          .describe('この取り組みの目的(自由記述) / What this engagement is for, in free text'),
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
        const s = scale as Scale;
        const purposeLower = purpose.toLowerCase();
        const matchedDomains = (['b', 'c', 'd'] as const).filter((id) =>
          DOMAIN_KEYWORDS[id].some((k) => matchesKeyword(purposeLower, k)),
        );
        const plans = buildPhasePlans(s, hasExistingEa === true, [...matchedDomains]);

        let cutForTime: PhasePlan[] = [];
        let fits = true;
        if (typeof timeboxWeeks === 'number') {
          const result = compressToTimebox(plans, s, timeboxWeeks, [...matchedDomains]);
          cutForTime = result.cut;
          fits = result.fits;
        }
        // 収まらないときに希望期間で配分すると、表の合計が「収まらない」という警告と矛盾する。
        // 収まらないなら目安期間の方を正として出す。
        const totalWeeks = allocateWeeks(plans, s, fits ? timeboxWeeks : undefined);

        const out: string[] = [];
        out.push(msg('# 自社版 ADM の設計', '# Your Tailored ADM', l));
        out.push('');
        out.push(`> ${flat(purpose)}`);
        out.push('');
        out.push(
          `${inline('規模', 'Scale', l)}: **${one(SCALE_LABEL[s], l)}** ・ ` +
            `${inline('期間', 'Timebox', l)}: **${inline(`約 ${totalWeeks} 週`, `~${totalWeeks} weeks`, l)}**` +
            (fits
              ? ''
              : ` ${inline(`(希望の ${timeboxWeeks} 週には収まらない)`, `(does not fit the requested ${timeboxWeeks} weeks)`, l)}`) +
            ` ・ ${inline('既存 EA', 'Existing EA', l)}: ${hasExistingEa === true ? inline('あり', 'yes', l) : inline('なし', 'no', l)}`,
        );
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
          out.push(
            msg(
              `⚠ ${timeboxWeeks} 週に収めるため、${cutForTime.map((p) => p.code).join(' / ')} の扱いを下げた。`,
              `⚠ To fit ${timeboxWeeks} weeks, ${cutForTime.map((p) => p.code).join(' / ')} were downgraded.`,
              l,
            ),
          );
          out.push('');
        }
        // 削って収めた場合の端数は「余裕」ではないので、削っていないときだけ知らせる
        if (fits && cutForTime.length === 0 && typeof timeboxWeeks === 'number' && timeboxWeeks - totalWeeks >= 1) {
          out.push(
            msg(
              `この設計なら約 ${totalWeeks} 週で終わる(${timeboxWeeks} 週に対して余裕あり)。余りは日程を伸ばすのではなく、省いたフェーズを 1 つ戻すか、対象範囲を 1 段広げるかに使う。`,
              `This design lands in about ${totalWeeks} weeks against your ${timeboxWeeks}. Spend the slack on restoring one cut phase or widening the scope by one step — not on a longer calendar.`,
              l,
            ),
          );
          out.push('');
        }
        if (!fits) {
          out.push(
            msg(
              `⚠ 削れるところまで削っても最短で約 ${totalWeeks} 週かかる(${timeboxWeeks} 週では終わらない)。目的に直接効く領域まで削ると、期間には収まっても案件が目的を果たさなくなるのでここで止めてある。対象を 1 つの事業領域に絞るか、期間を ${totalWeeks} 週まで延ばすかを先に決めること。両方やろうとした案件は必ず中途半端になる。`,
              `⚠ Cut as far as it can go, this still needs about ${totalWeeks} weeks — ${timeboxWeeks} is not enough. Cutting further would remove the domains your purpose points at, so the plan stops here: it would fit the calendar and miss the point. Decide first — narrow to a single business area, or extend to ${totalWeeks} weeks. Attempting both leaves the work half-finished.`,
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
              : inline(`${p.weeks} 週`, `${p.weeks} wks`, l);
          out.push(
            `| **${p.code}.** ${cell(one(p.name, l))} | ${TREATMENT_MARK[p.treatment]} ${one(TREATMENT_LABEL[p.treatment], l)} | ${duration} | ${cell(one(p.reason, l))} |`,
          );
        }
        out.push('');
        const cutPhases = plans.filter((p) => p.treatment === 'skip');
        out.push(
          msg(
            cutPhases.length > 0
              ? `削るのは ${cutPhases.length} フェーズ(${cutPhases.map((p) => p.code).join(', ')})。案件を作ったら ${code('update_engagement')} でこれらの状態を skipped にしておくと、進捗率が実態に合う。`
              : 'この条件では丸ごと省けるフェーズは無い。軽くするなら、フェーズ単位ではなく各フェーズで作る成果物を減らす。',
            cutPhases.length > 0
              ? `${cutPhases.length} phases are cut (${cutPhases.map((p) => p.code).join(', ')}). Once the engagement exists, mark them skipped with ${code('update_engagement')} so the progress figure reflects reality.`
              : 'Under these inputs no phase drops out entirely. To lighten it, cut deliverables inside each phase rather than whole phases.',
            l,
          ),
        );
        out.push('');

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
        out.push(
          `1. ${code('start_engagement')} — ${inline('この設計で案件を作る', 'create the engagement on this design', l)}`,
        );
        out.push(
          `2. ${code('update_engagement')} — ${inline('削ったフェーズを skipped にする', 'mark the cut phases as skipped', l)}`,
        );
        out.push(
          `3. ${code('next_best_action')} — ${inline('作ったら、今週やることを取る', 'then pull this week’s actions', l)}`,
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
        '同じ内容を相手に合わせて言い換えるための型を返す。相手ごとの持ち時間・最初の 1 文・使う単位・見せる図・避けること・話す順序の骨子、および用語の言い換え表を返す。知識ベースから関連項目も引いて材料にする。 / Return a reframing template for one audience: their time budget, the opening sentence, the units to speak in, the diagram to show, what to avoid, the running order, and a plain-language swap table for jargon. Related knowledge-base entries are pulled in as raw material.',
      inputSchema: {
        topic: z
          .string()
          .min(2)
          .describe('説明したい内容 / What you need to explain'),
        audience: z
          .enum(['executive', 'business', 'engineer', 'pmo'])
          .describe('相手 / Audience: executive, business, engineer, or pmo'),
        lang: langSchema,
      },
    },
    async ({ topic, audience, lang }): Promise<ToolResult> => {
      try {
        const l = lang as Lang;
        const a = audience as Audience;
        const profile = AUDIENCES[a];
        const hits = searchKnowledge(topic, { limit: 4 });

        const out: string[] = [];
        out.push(
          msg(
            `# 「${flat(clip(topic, 40))}」を${one(profile.name, 'ja')}に説明する`,
            `# Explaining "${flat(clip(topic, 40))}" to ${one(profile.name, 'en')}`,
            l,
          ),
        );
        out.push('');

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

        // --- 骨子 ---
        out.push(msg('## この順に話す', '## Say It In This Order', l));
        out.push('');
        profile.outline.forEach((o, i) => {
          out.push(`${i + 1}. ${one(o, l)}`);
        });
        out.push('');
        out.push(
          msg(
            `この順序は入れ替えない。特に 1 番を後ろに回した瞬間、${one(profile.name, 'ja')}は聞くのをやめる。`,
            `Do not reorder this. The moment item 1 slides to the back, this audience stops listening.`,
            l,
          ),
        );
        out.push('');

        // --- 言い換え表 ---
        out.push(msg('## 言い換え表', '## Jargon Swap', l));
        out.push('');
        out.push(`| ${inline('使いがちな言葉', 'What you would say', l)} | ${inline('この相手に言う言葉', 'Say this instead', l)} |`);
        out.push('| --- | --- |');
        for (const p of profile.paraphrase) {
          out.push(`| ${cell(one(p.term, l))} | ${cell(one(p.plain, l))} |`);
        }
        out.push('');

        // --- 材料 ---
        out.push(msg('## 材料(知識ベースから)', '## Raw Material From the Knowledge Base', l));
        out.push('');
        if (hits.length === 0) {
          out.push(
            msg(
              '関連項目は見つからなかった。上の骨子だけで組める内容なら、知識ベースを引く必要はない。',
              'Nothing matched. If the outline above is enough to build from, you do not need the knowledge base for this.',
              l,
            ),
          );
        } else {
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
              'これらは材料であって台本ではない。上の言い換え表を通してから使うこと。原文の用語のまま持ち込むと、相手の関心とずれる。',
              'These are material, not a script. Run them through the swap table first — carried over verbatim, the vocabulary misses what this audience cares about.',
              l,
            ),
          );
        }
        out.push('');

        // --- 避けること ---
        out.push(msg('## やってはいけない', '## Do Not', l));
        out.push('');
        for (const v of profile.avoid) {
          out.push(`- ${one(v, l)}`);
        }
        out.push('');

        // --- 次にこれを呼ぶ ---
        out.push(msg('## 次にこれを呼ぶ', '## Call these next', l));
        out.push('');
        out.push(
          `- ${code('generate_deliverable_template')} — ${inline('この骨子を成果物の雛形に落とす', 'turn the outline into a deliverable skeleton', l)}`,
        );
        out.push(
          `- ${code('export_report')} — ${inline('配布用の 1 枚として書き出す', 'export it as a hand-out', l)}`,
        );
        out.push(
          `- ${code('stakeholder_matrix')} — ${inline('この相手が案件のどこに位置するか確認する', 'check where this audience sits on the engagement', l)}`,
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
              `- **${cell(clip(o.a.title, 40))}** — ${inline(`${Math.abs(o.left)} 日超過`, `${Math.abs(o.left)} days past due`, l)}${o.a.owner ? ` (${cell(o.a.owner)})` : ''}`,
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
