/**
 * Markdown ダッシュボード / Markdown dashboard.
 * 会話内表示・コピペ・印刷向けに整形した Markdown を生成する。
 */

import { ADM_PHASES, findPhase, type Lang } from '../knowledge/index.js';
import { summarizeProgress, type Engagement } from '../engagement/model.js';
import {
  ACTION_STATUS_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  L,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  label,
} from './labels.js';

/** Markdown の表セル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
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

/** エンゲージメント未作成時のメッセージ */
export function emptyDashboard(lang: Lang): string {
  return `# ${label(L.dashboard, lang)}\n\n${label(L.noEngagement, lang)}\n`;
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
  out.push(`\`${progressBar(progress.percent)}\` **${progress.percent}%**`);
  out.push('');
  out.push(
    [
      `${label(L.progress, lang)}: ${progress.completed}/${progress.total - progress.skipped}`,
      `${label(L.risks, lang)}: ${openRisks} ${label(L.openItems, lang)}`,
      `${label(L.actions, lang)}: ${openActions} ${label(L.openItems, lang)}`,
      `${label(L.decisions, lang)}: ${e.decisions.length}`,
      `${label(L.deliverables, lang)}: ${e.deliverables.length}`,
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
    const marker = phase.id === e.currentPhaseId ? '**→**' : PHASE_STATUS_ICON[status];
    out.push(
      `| ${marker} | ${phase.code}. ${cell(label(phase.name, lang))} | ${PHASE_STATUS_ICON[status]} ${label(PHASE_STATUS_LABEL[status], lang)} | ${cell(p?.note)} |`,
    );
  }
  out.push('');

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
        `| ${cell(s.name)} | ${cell([s.role, s.organization].filter(Boolean).join(' / '))} | ${label(INFLUENCE_LABEL[s.influence], lang)} | ${label(INFLUENCE_LABEL[s.interest], lang)} | ${cell(s.concerns.join('; '))} | ${cell(s.approach)} |`,
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
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (const r of [...e.risks].sort((a, b) => order[a.level] - order[b.level])) {
      out.push(
        `| ${cell(r.title)} | ${label(RISK_LEVEL_LABEL[r.level], lang)} | ${r.residualLevel ? label(RISK_LEVEL_LABEL[r.residualLevel], lang) : ''} | ${label(RISK_STATUS_LABEL[r.status], lang)} | ${cell(r.owner)} | ${cell(r.mitigation)} |`,
      );
    }
  }
  out.push('');

  // --- 決定事項 ---
  out.push(`## ${label(L.decisions, lang)}`);
  out.push('');
  if (e.decisions.length === 0) {
    out.push(label(L.none, lang));
  } else {
    for (const d of e.decisions) {
      out.push(`### ${d.title} — ${label(DECISION_STATUS_LABEL[d.status], lang)}`);
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
    const prio = { high: 0, medium: 1, low: 2 };
    const sorted = [...e.actions].sort(
      (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || prio[a.priority] - prio[b.priority],
    );
    for (const a of sorted) {
      out.push(
        `| ${cell(a.title)} | ${cell(a.owner)} | ${cell(a.due)} | ${label(PRIORITY_LABEL[a.priority], lang)} | ${label(ACTION_STATUS_LABEL[a.status], lang)} |`,
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
        `| ${cell(d.name)} | ${ph ? ph.code : ''} | ${label(DELIVERABLE_STATUS_LABEL[d.status], lang)} | ${cell(d.owner)} | ${cell(d.link)} |`,
      );
    }
  }
  out.push('');

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
