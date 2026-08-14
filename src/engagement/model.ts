/**
 * エンゲージメント状態モデル / Engagement state model.
 *
 * 1 つの「アーキテクチャ案件」の進行状況を表す。JSON でそのまま永続化される。
 */

import { ADM_PHASES } from '../knowledge/index.js';

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

export interface PhaseProgress {
  phaseId: string;
  status: PhaseStatus;
  note?: string;
  updatedAt: string;
}

export interface Risk {
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

export interface Decision {
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

export interface Action {
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

export interface Stakeholder {
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

export interface DeliverableProgress {
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

export interface Engagement {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  /** 現在注力しているフェーズ ID */
  currentPhaseId: string;
  createdAt: string;
  updatedAt: string;
  phases: PhaseProgress[];
  risks: Risk[];
  decisions: Decision[];
  actions: Action[];
  stakeholders: Stakeholder[];
  deliverables: DeliverableProgress[];
  notes: string[];
}

/** 現在時刻を ISO 文字列で返す */
export function now(): string {
  return new Date().toISOString();
}

let idCounter = 0;

/** 種別ごとの短い一意 ID を作る(例: risk-3-lq8f2k) */
export function makeId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${idCounter}-${rand}`;
}

/** 全 ADM フェーズを未着手で初期化する */
export function initialPhases(timestamp: string): PhaseProgress[] {
  return ADM_PHASES.map((p) => ({
    phaseId: p.id,
    status: 'not_started' as PhaseStatus,
    updatedAt: timestamp,
  }));
}

export interface CreateEngagementInput {
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  currentPhaseId?: string;
}

/** 新しいエンゲージメントを作る */
export function createEngagement(input: CreateEngagementInput): Engagement {
  const timestamp = now();
  return {
    id: makeId('eng'),
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
  return {
    id: e.id,
    name: e.name,
    client: e.client,
    industry: e.industry,
    description: e.description,
    scope: e.scope,
    currentPhaseId: typeof e.currentPhaseId === 'string' ? e.currentPhaseId : 'a',
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : timestamp,
    updatedAt: timestamp,
    phases,
    risks: Array.isArray(e.risks) ? e.risks : [],
    decisions: Array.isArray(e.decisions) ? e.decisions : [],
    actions: Array.isArray(e.actions) ? e.actions : [],
    stakeholders: Array.isArray(e.stakeholders) ? e.stakeholders : [],
    deliverables: Array.isArray(e.deliverables) ? e.deliverables : [],
    notes: Array.isArray(e.notes) ? e.notes : [],
  };
}
