/**
 * ダッシュボードの表示ラベル / Display labels shared by the Markdown and HTML dashboards.
 */

import type { Bilingual, Lang } from '../knowledge/index.js';
import { text } from '../knowledge/index.js';
import type {
  ActionStatus,
  AssessmentKind,
  DecisionStatus,
  DeliverableStatus,
  InfluenceLevel,
  PhaseStatus,
  Priority,
  RiskLevel,
  RiskStatus,
  WorkPackageStatus,
} from '../engagement/model.js';

export const L = {
  dashboard: { ja: 'エンゲージメントダッシュボード', en: 'Engagement Dashboard' },
  client: { ja: 'クライアント', en: 'Client' },
  industry: { ja: '業界', en: 'Industry' },
  currentPhase: { ja: '現在のフェーズ', en: 'Current phase' },
  updatedAt: { ja: '最終更新', en: 'Last updated' },
  scope: { ja: 'スコープ', en: 'Scope' },
  description: { ja: '概要', en: 'Overview' },
  progress: { ja: '進捗', en: 'Progress' },
  admProgress: { ja: 'ADM フェーズ進捗', en: 'ADM Phase Progress' },
  phase: { ja: 'フェーズ', en: 'Phase' },
  status: { ja: '状態', en: 'Status' },
  note: { ja: '備考', en: 'Note' },
  stakeholders: { ja: 'ステークホルダー', en: 'Stakeholders' },
  name: { ja: '氏名', en: 'Name' },
  role: { ja: '役割', en: 'Role' },
  influence: { ja: '影響力', en: 'Influence' },
  interest: { ja: '関心度', en: 'Interest' },
  concerns: { ja: '関心事', en: 'Concerns' },
  approach: { ja: '関与方針', en: 'Approach' },
  risks: { ja: 'リスク', en: 'Risks' },
  title: { ja: '内容', en: 'Title' },
  level: { ja: 'レベル', en: 'Level' },
  residual: { ja: '残存', en: 'Residual' },
  owner: { ja: '担当', en: 'Owner' },
  mitigation: { ja: '緩和策', en: 'Mitigation' },
  decisions: { ja: '決定事項', en: 'Decisions' },
  decision: { ja: '決定', en: 'Decision' },
  rationale: { ja: '根拠', en: 'Rationale' },
  decidedBy: { ja: '決定者', en: 'Decided by' },
  actions: { ja: 'アクション', en: 'Actions' },
  priority: { ja: '優先度', en: 'Priority' },
  due: { ja: '期限', en: 'Due' },
  deliverables: { ja: '成果物', en: 'Deliverables' },
  link: { ja: '保管先', en: 'Location' },
  notes: { ja: 'メモ', en: 'Notes' },
  none: { ja: '(登録なし)', en: '(none)' },
  noEngagement: {
    ja: 'エンゲージメントが未作成です。`start_engagement` で開始してください。',
    en: 'No engagement yet. Start one with `start_engagement`.',
  },
  generated: { ja: '生成', en: 'Generated' },
  openItems: { ja: '未対応', en: 'open' },
  live: { ja: 'ライブ更新中', en: 'Live' },
  reconnecting: { ja: '再接続中…', en: 'Reconnecting…' },
  print: { ja: '印刷', en: 'Print' },
  // --- ロードマップ / 移行アーキテクチャ ---
  roadmap: { ja: 'ロードマップ', en: 'Roadmap' },
  workPackages: { ja: '作業パッケージ', en: 'Work packages' },
  transitions: { ja: '移行アーキテクチャ', en: 'Transition architectures' },
  transition: { ja: '移行状態', en: 'Transition' },
  quarter: { ja: '時期', en: 'Timing' },
  dependsOn: { ja: '依存', en: 'Depends on' },
  businessValue: { ja: '事業価値', en: 'Business value' },
  effort: { ja: '規模', en: 'Effort' },
  cost: { ja: 'コスト', en: 'Cost' },
  benefit: { ja: '便益', en: 'Benefit' },
  benefitOwner: { ja: '便益責任者', en: 'Benefit owner' },
  standalone: { ja: '単独稼働', en: 'Stops safely' },
  standaloneYes: { ja: '可', en: 'Yes' },
  standaloneNo: { ja: '不可', en: 'No' },
  interim: { ja: '暫定の仕組み', en: 'Interim mechanism' },
  disposalPlan: { ja: '廃棄計画', en: 'Disposal plan' },
  capabilities: { ja: '実現する能力', en: 'Capabilities delivered' },
  // --- 評価 ---
  assessments: { ja: '評価', en: 'Assessments' },
  maturity: { ja: '成熟度', en: 'Maturity' },
  readiness: { ja: '変革準備度', en: 'Transformation readiness' },
  factor: { ja: '評価因子', en: 'Factor' },
  current: { ja: '現在', en: 'Current' },
  target: { ja: '目標', en: 'Target' },
  gap: { ja: '差', en: 'Gap' },
  // --- 可視化 ---
  riskMatrix: { ja: 'リスクマトリクス', en: 'Risk matrix' },
  stakeholderMatrix: { ja: 'ステークホルダーマトリクス', en: 'Stakeholder matrix' },
  manageClosely: { ja: '密に関与', en: 'Manage closely' },
  keepSatisfied: { ja: '満足を維持', en: 'Keep satisfied' },
  keepInformed: { ja: '情報提供', en: 'Keep informed' },
  monitor: { ja: '監視', en: 'Monitor' },
  // --- 複数エンゲージメント ---
  engagements: { ja: 'エンゲージメント', en: 'Engagements' },
  switchEngagement: { ja: '切り替え', en: 'Switch' },
  archived: { ja: 'アーカイブ済み', en: 'Archived' },
  // --- 健全性チェック ---
  health: { ja: '健全性チェック', en: 'Health check' },
  findings: { ja: '指摘', en: 'Findings' },
  severity: { ja: '重大度', en: 'Severity' },
  recommendation: { ja: '推奨', en: 'Recommendation' },
} satisfies Record<string, Bilingual>;

export const WORK_PACKAGE_STATUS_LABEL: Record<WorkPackageStatus, Bilingual> = {
  proposed: { ja: '提案', en: 'Proposed' },
  planned: { ja: '計画済', en: 'Planned' },
  in_progress: { ja: '進行中', en: 'In progress' },
  delivered: { ja: '完了', en: 'Delivered' },
  cancelled: { ja: '中止', en: 'Cancelled' },
};

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, Bilingual> = {
  maturity: { ja: '成熟度評価', en: 'Maturity assessment' },
  readiness: { ja: '変革準備度評価', en: 'Readiness assessment' },
};

export const PHASE_STATUS_LABEL: Record<PhaseStatus, Bilingual> = {
  not_started: { ja: '未着手', en: 'Not started' },
  in_progress: { ja: '進行中', en: 'In progress' },
  completed: { ja: '完了', en: 'Completed' },
  skipped: { ja: '対象外', en: 'Skipped' },
};

export const PHASE_STATUS_ICON: Record<PhaseStatus, string> = {
  not_started: '○',
  in_progress: '◐',
  completed: '●',
  skipped: '–',
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, Bilingual> = {
  low: { ja: '低', en: 'Low' },
  medium: { ja: '中', en: 'Medium' },
  high: { ja: '高', en: 'High' },
  critical: { ja: '致命的', en: 'Critical' },
};

export const RISK_STATUS_LABEL: Record<RiskStatus, Bilingual> = {
  open: { ja: '未対応', en: 'Open' },
  mitigating: { ja: '対応中', en: 'Mitigating' },
  closed: { ja: '解消', en: 'Closed' },
  accepted: { ja: '受容', en: 'Accepted' },
};

export const DECISION_STATUS_LABEL: Record<DecisionStatus, Bilingual> = {
  proposed: { ja: '提案中', en: 'Proposed' },
  accepted: { ja: '承認', en: 'Accepted' },
  rejected: { ja: '却下', en: 'Rejected' },
  superseded: { ja: '差し替え', en: 'Superseded' },
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, Bilingual> = {
  todo: { ja: '未着手', en: 'To do' },
  in_progress: { ja: '進行中', en: 'In progress' },
  done: { ja: '完了', en: 'Done' },
  blocked: { ja: 'ブロック', en: 'Blocked' },
};

export const PRIORITY_LABEL: Record<Priority, Bilingual> = {
  low: { ja: '低', en: 'Low' },
  medium: { ja: '中', en: 'Medium' },
  high: { ja: '高', en: 'High' },
};

export const INFLUENCE_LABEL: Record<InfluenceLevel, Bilingual> = {
  low: { ja: '低', en: 'Low' },
  medium: { ja: '中', en: 'Medium' },
  high: { ja: '高', en: 'High' },
};

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, Bilingual> = {
  not_started: { ja: '未着手', en: 'Not started' },
  drafting: { ja: '作成中', en: 'Drafting' },
  review: { ja: 'レビュー中', en: 'In review' },
  approved: { ja: '承認済', en: 'Approved' },
  baselined: { ja: 'ベースライン化', en: 'Baselined' },
};

/** ラベルを言語に応じて 1 行に整形する(短い表示向けに ja/en を「/」で連結) */
export function label(value: Bilingual, lang: Lang): string {
  return text(value, lang);
}
