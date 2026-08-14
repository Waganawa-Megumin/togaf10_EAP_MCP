/**
 * エンゲージメント管理ツール / Engagement management tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ADM_PHASES, findDeliverable, findPhase, text, type Lang } from '../knowledge/index.js';
import {
  ACTION_STATUSES,
  DECISION_STATUSES,
  DELIVERABLE_STATUSES,
  INFLUENCE_LEVELS,
  PHASE_STATUSES,
  PRIORITIES,
  RISK_LEVELS,
  RISK_STATUSES,
  createEngagement,
  makeId,
  now,
  summarizeProgress,
  type Action,
  type Decision,
  type DeliverableProgress,
  type Engagement,
  type Risk,
  type Stakeholder,
} from '../engagement/model.js';
import { deleteEngagement, loadEngagement, saveEngagement } from '../engagement/store.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/** フェーズ参照を正規化する。未知の値は undefined。 */
function resolvePhaseId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return findPhase(value)?.id;
}

const riskInput = z.object({
  id: z.string().optional().describe('既存リスクの ID。省略すると新規追加 / Existing risk id; omit to add a new one'),
  title: z.string().optional(),
  description: z.string().optional(),
  level: z.enum(RISK_LEVELS).optional().describe('対策前のリスクレベル'),
  residualLevel: z.enum(RISK_LEVELS).optional().describe('対策後の残存リスクレベル'),
  status: z.enum(RISK_STATUSES).optional(),
  owner: z.string().optional(),
  mitigation: z.string().optional(),
  phase: z.string().optional(),
});

const decisionInput = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  context: z.string().optional().describe('背景・検討した選択肢'),
  decision: z.string().optional().describe('決定内容'),
  rationale: z.string().optional().describe('根拠'),
  status: z.enum(DECISION_STATUSES).optional(),
  decidedBy: z.string().optional(),
  phase: z.string().optional(),
});

const actionInput = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  owner: z.string().optional(),
  due: z.string().optional().describe('期限 YYYY-MM-DD'),
  status: z.enum(ACTION_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  phase: z.string().optional(),
  note: z.string().optional(),
});

const stakeholderInput = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  organization: z.string().optional(),
  influence: z.enum(INFLUENCE_LEVELS).optional(),
  interest: z.enum(INFLUENCE_LEVELS).optional(),
  concerns: z.array(z.string()).optional().describe('関心事(本人の言葉で)'),
  approach: z.string().optional().describe('関与方針'),
});

const deliverableInput = z.object({
  id: z.string().optional(),
  deliverableId: z.string().optional().describe('知識ベースの成果物 ID(例: architecture-vision)'),
  name: z.string().optional(),
  status: z.enum(DELIVERABLE_STATUSES).optional(),
  owner: z.string().optional(),
  phase: z.string().optional(),
  link: z.string().optional(),
  note: z.string().optional(),
});

interface ChangeLog {
  added: string[];
  updated: string[];
  removed: string[];
}

/** id 付きなら更新、なければ新規作成する汎用処理 */
function upsert<T extends { id: string; updatedAt: string }>(
  list: T[],
  input: { id?: string },
  build: () => T | null,
  apply: (item: T) => void,
  changes: ChangeLog,
  kind: string,
  labelOf: (item: T) => string,
): string | null {
  if (input.id) {
    const found = list.find((x) => x.id === input.id);
    if (!found) return `${kind}: id "${input.id}" not found`;
    apply(found);
    found.updatedAt = now();
    changes.updated.push(`${kind} ${labelOf(found)}`);
    return null;
  }
  const created = build();
  if (!created) return `${kind}: 新規追加には必須項目が足りません / missing required field for a new entry`;
  apply(created);
  list.push(created);
  changes.added.push(`${kind} ${labelOf(created)}`);
  return null;
}

export function registerEngagementTools(server: McpServer): void {
  server.registerTool(
    'start_engagement',
    {
      title: 'Start an engagement',
      description:
        'アーキテクチャ案件(エンゲージメント)を開始し、ADM フェーズ進捗を初期化して保存する。既存の案件がある場合は overwrite=true が必要。 / Start an engagement, initialize ADM phase progress, and persist it. Pass overwrite=true to replace an existing engagement.',
      inputSchema: {
        name: z.string().min(1).describe('案件名 / Engagement name'),
        client: z.string().optional().describe('クライアント・対象組織 / Client or target organization'),
        industry: z.string().optional().describe('業界 / Industry'),
        description: z.string().optional().describe('概要・背景 / Overview and background'),
        scope: z.string().optional().describe('スコープ(対象外も書くとよい) / Scope, ideally including exclusions'),
        currentPhase: z.string().optional().describe('開始フェーズ ID(既定: a) / Starting phase id, default "a"'),
        overwrite: z.boolean().default(false).describe('既存の案件を上書きする / Replace the existing engagement'),
        lang: langSchema,
      },
    },
    async ({ name, client, industry, description, scope, currentPhase, overwrite, lang }) => {
      const l = lang as Lang;
      const existing = loadEngagement();
      if (existing && !overwrite) {
        return errorResult(
          msg(
            `既に案件「${existing.name}」が選択されています。別の案件を並行して持つなら \`create_engagement\`、切り替えるなら \`switch_engagement\` を使ってください。この案件を破棄して作り直す場合のみ overwrite=true を指定します(既存データは失われます)。参照だけなら \`get_engagement\` です。`,
            `The engagement "${existing.name}" is already selected. Use \`create_engagement\` to run another one alongside it, or \`switch_engagement\` to change the selection. Pass overwrite=true only to discard this engagement and start over (its data is lost). To just read it, use \`get_engagement\`.`,
            l,
          ),
        );
      }
      const phaseId = resolvePhaseId(currentPhase);
      if (currentPhase && !phaseId) {
        return errorResult(
          msg(
            `フェーズ「${currentPhase}」が見つかりません。利用可能: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            `Phase "${currentPhase}" not found. Available: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            l,
          ),
        );
      }
      // overwrite=true は「置き換え」。複数案件を保持できるようになったため、
      // 削除せずに保存すると旧案件が一覧に residue として残り、説明文と実態が食い違う。
      if (existing && overwrite) deleteEngagement(existing.id);

      const engagement = createEngagement({
        name,
        client,
        industry,
        description,
        scope,
        currentPhaseId: phaseId ?? 'a',
      });
      // 開始フェーズは進行中にしておく
      const startPhase = engagement.phases.find((p) => p.phaseId === engagement.currentPhaseId);
      if (startPhase) startPhase.status = 'in_progress';
      const saved = saveEngagement(engagement);

      const out: string[] = [];
      out.push(msg(`# 案件を開始しました: ${saved.name}`, `# Engagement started: ${saved.name}`, l));
      out.push('');
      out.push(`- ID: \`${saved.id}\``);
      const cur = findPhase(saved.currentPhaseId);
      if (cur) out.push(`- ${msg('現在フェーズ', 'Current phase', l)}: ${cur.code}. ${text(cur.name, l)}`);
      out.push('');
      out.push(renderDashboardMarkdown(saved, l));
      return textResult(out.join('\n'));
    },
  );

  server.registerTool(
    'get_engagement',
    {
      title: 'Get the current engagement',
      description:
        '保存されているエンゲージメントの内容を返す。format="json" を指定すると生の JSON を返す。 / Return the stored engagement; pass format="json" for the raw JSON.',
      inputSchema: {
        format: z.enum(['markdown', 'json']).default('markdown').describe('出力形式 / Output format'),
        lang: langSchema,
      },
    },
    async ({ format, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();
      if (!engagement) {
        return textResult(
          msg(
            'エンゲージメントが未作成です。`start_engagement` で開始してください。',
            'No engagement yet. Start one with `start_engagement`.',
            l,
          ),
        );
      }
      if (format === 'json') return textResult(JSON.stringify(engagement, null, 2));
      return textResult(renderDashboardMarkdown(engagement, l));
    },
  );

  server.registerTool(
    'update_engagement',
    {
      title: 'Update the engagement',
      description:
        'エンゲージメントを部分更新する。フェーズ状態の変更、リスク・決定事項・アクション・ステークホルダー・成果物の追加/更新、メモの追記ができる。各項目は id を指定すれば更新、省略すれば新規追加。 / Partially update the engagement: change phase statuses and add or update risks, decisions, actions, stakeholders, deliverables, and notes. Supply an id to update an entry, omit it to add one.',
      inputSchema: {
        name: z.string().optional(),
        client: z.string().optional(),
        industry: z.string().optional(),
        description: z.string().optional(),
        scope: z.string().optional(),
        currentPhase: z.string().optional().describe('注力フェーズを切り替える / Switch the current phase'),
        phases: z
          .array(
            z.object({
              phase: z.string().describe('フェーズ ID / Phase id'),
              status: z.enum(PHASE_STATUSES),
              note: z.string().optional(),
            }),
          )
          .optional()
          .describe('フェーズ進捗の更新 / Phase progress updates'),
        risks: z.array(riskInput).optional(),
        decisions: z.array(decisionInput).optional(),
        actions: z.array(actionInput).optional(),
        stakeholders: z.array(stakeholderInput).optional(),
        deliverables: z.array(deliverableInput).optional(),
        notes: z.array(z.string()).optional().describe('メモを追記する / Append notes'),
        removeIds: z
          .array(z.string())
          .optional()
          .describe('削除する項目の ID(種別を問わず) / Ids to remove, any kind'),
        lang: langSchema,
      },
    },
    async (input) => {
      const l = input.lang as Lang;
      const current = loadEngagement();
      if (!current) {
        return errorResult(
          msg(
            'エンゲージメントが未作成です。先に `start_engagement` を実行してください。',
            'No engagement yet. Run `start_engagement` first.',
            l,
          ),
        );
      }

      const e: Engagement = current;
      const changes: ChangeLog = { added: [], updated: [], removed: [] };
      const problems: string[] = [];
      const timestamp = now();

      if (input.name) { e.name = input.name; changes.updated.push('name'); }
      if (input.client !== undefined) { e.client = input.client; changes.updated.push('client'); }
      if (input.industry !== undefined) { e.industry = input.industry; changes.updated.push('industry'); }
      if (input.description !== undefined) { e.description = input.description; changes.updated.push('description'); }
      if (input.scope !== undefined) { e.scope = input.scope; changes.updated.push('scope'); }

      if (input.currentPhase) {
        const id = resolvePhaseId(input.currentPhase);
        if (!id) problems.push(`currentPhase: "${input.currentPhase}" not found`);
        else {
          e.currentPhaseId = id;
          changes.updated.push(`currentPhase → ${findPhase(id)?.code ?? id}`);
        }
      }

      for (const p of input.phases ?? []) {
        const id = resolvePhaseId(p.phase);
        if (!id) {
          problems.push(`phases: "${p.phase}" not found`);
          continue;
        }
        let entry = e.phases.find((x) => x.phaseId === id);
        if (!entry) {
          entry = { phaseId: id, status: p.status, updatedAt: timestamp };
          e.phases.push(entry);
        }
        entry.status = p.status;
        if (p.note !== undefined) entry.note = p.note;
        entry.updatedAt = timestamp;
        changes.updated.push(`phase ${findPhase(id)?.code ?? id} → ${p.status}`);
      }

      for (const r of input.risks ?? []) {
        const err = upsert<Risk>(
          e.risks,
          r,
          () =>
            r.title
              ? {
                  id: makeId('risk'),
                  title: r.title,
                  level: r.level ?? 'medium',
                  status: r.status ?? 'open',
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : null,
          (item) => {
            if (r.title !== undefined) item.title = r.title;
            if (r.description !== undefined) item.description = r.description;
            if (r.level !== undefined) item.level = r.level;
            if (r.residualLevel !== undefined) item.residualLevel = r.residualLevel;
            if (r.status !== undefined) item.status = r.status;
            if (r.owner !== undefined) item.owner = r.owner;
            if (r.mitigation !== undefined) item.mitigation = r.mitigation;
            if (r.phase !== undefined) item.phaseId = resolvePhaseId(r.phase);
          },
          changes,
          'risk',
          (item) => `"${item.title}" (\`${item.id}\`)`,
        );
        if (err) problems.push(err);
      }

      for (const d of input.decisions ?? []) {
        const err = upsert<Decision>(
          e.decisions,
          d,
          () =>
            d.title && d.decision
              ? {
                  id: makeId('dec'),
                  title: d.title,
                  decision: d.decision,
                  status: d.status ?? 'proposed',
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : null,
          (item) => {
            if (d.title !== undefined) item.title = d.title;
            if (d.context !== undefined) item.context = d.context;
            if (d.decision !== undefined) item.decision = d.decision;
            if (d.rationale !== undefined) item.rationale = d.rationale;
            if (d.status !== undefined) item.status = d.status;
            if (d.decidedBy !== undefined) item.decidedBy = d.decidedBy;
            if (d.phase !== undefined) item.phaseId = resolvePhaseId(d.phase);
          },
          changes,
          'decision',
          (item) => `"${item.title}" (\`${item.id}\`)`,
        );
        if (err) problems.push(err);
      }

      for (const a of input.actions ?? []) {
        const err = upsert<Action>(
          e.actions,
          a,
          () =>
            a.title
              ? {
                  id: makeId('act'),
                  title: a.title,
                  status: a.status ?? 'todo',
                  priority: a.priority ?? 'medium',
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : null,
          (item) => {
            if (a.title !== undefined) item.title = a.title;
            if (a.owner !== undefined) item.owner = a.owner;
            if (a.due !== undefined) item.due = a.due;
            if (a.status !== undefined) item.status = a.status;
            if (a.priority !== undefined) item.priority = a.priority;
            if (a.note !== undefined) item.note = a.note;
            if (a.phase !== undefined) item.phaseId = resolvePhaseId(a.phase);
          },
          changes,
          'action',
          (item) => `"${item.title}" (\`${item.id}\`)`,
        );
        if (err) problems.push(err);
      }

      for (const s of input.stakeholders ?? []) {
        const err = upsert<Stakeholder>(
          e.stakeholders,
          s,
          () =>
            s.name
              ? {
                  id: makeId('stk'),
                  name: s.name,
                  influence: s.influence ?? 'medium',
                  interest: s.interest ?? 'medium',
                  concerns: s.concerns ?? [],
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : null,
          (item) => {
            if (s.name !== undefined) item.name = s.name;
            if (s.role !== undefined) item.role = s.role;
            if (s.organization !== undefined) item.organization = s.organization;
            if (s.influence !== undefined) item.influence = s.influence;
            if (s.interest !== undefined) item.interest = s.interest;
            if (s.concerns !== undefined) item.concerns = s.concerns;
            if (s.approach !== undefined) item.approach = s.approach;
          },
          changes,
          'stakeholder',
          (item) => `"${item.name}" (\`${item.id}\`)`,
        );
        if (err) problems.push(err);
      }

      for (const d of input.deliverables ?? []) {
        const known = d.deliverableId ? findDeliverable(d.deliverableId) : undefined;
        if (d.deliverableId && !known) {
          problems.push(`deliverables: knowledge-base id "${d.deliverableId}" not found`);
        }
        const err = upsert<DeliverableProgress>(
          e.deliverables,
          d,
          () => {
            const name = d.name ?? (known ? text(known.name, 'ja') : undefined);
            return name
              ? {
                  id: makeId('dlv'),
                  name,
                  status: d.status ?? 'not_started',
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : null;
          },
          (item) => {
            if (d.name !== undefined) item.name = d.name;
            if (known) {
              item.deliverableId = known.id;
              if (!d.phase && known.createdInPhaseIds.length > 0 && !item.phaseId) {
                item.phaseId = known.createdInPhaseIds[0];
              }
            }
            if (d.status !== undefined) item.status = d.status;
            if (d.owner !== undefined) item.owner = d.owner;
            if (d.link !== undefined) item.link = d.link;
            if (d.note !== undefined) item.note = d.note;
            if (d.phase !== undefined) item.phaseId = resolvePhaseId(d.phase);
          },
          changes,
          'deliverable',
          (item) => `"${item.name}" (\`${item.id}\`)`,
        );
        if (err) problems.push(err);
      }

      if (input.notes && input.notes.length > 0) {
        e.notes.push(...input.notes);
        changes.added.push(`${input.notes.length} note(s)`);
      }

      for (const id of input.removeIds ?? []) {
        let removed = false;
        const lists: [keyof Engagement, { id: string }[]][] = [
          ['risks', e.risks],
          ['decisions', e.decisions],
          ['actions', e.actions],
          ['stakeholders', e.stakeholders],
          ['deliverables', e.deliverables],
        ];
        for (const [kind, list] of lists) {
          const index = list.findIndex((x) => x.id === id);
          if (index >= 0) {
            list.splice(index, 1);
            changes.removed.push(`${String(kind)} \`${id}\``);
            removed = true;
            break;
          }
        }
        if (!removed) problems.push(`removeIds: "${id}" not found`);
      }

      const saved = saveEngagement(e);
      const progress = summarizeProgress(saved);

      const out: string[] = [];
      out.push(msg('# エンゲージメントを更新しました', '# Engagement updated', l));
      out.push('');
      if (changes.added.length > 0) out.push(`- ${msg('追加', 'Added', l)}: ${changes.added.join(', ')}`);
      if (changes.updated.length > 0) out.push(`- ${msg('更新', 'Updated', l)}: ${changes.updated.join(', ')}`);
      if (changes.removed.length > 0) out.push(`- ${msg('削除', 'Removed', l)}: ${changes.removed.join(', ')}`);
      if (changes.added.length + changes.updated.length + changes.removed.length === 0) {
        out.push(`- ${msg('変更なし', 'No changes applied', l)}`);
      }
      if (problems.length > 0) {
        out.push('');
        out.push(`**${msg('警告', 'Warnings', l)}**`);
        for (const p of problems) out.push(`- ${p}`);
      }
      out.push('');
      out.push(`${msg('進捗', 'Progress', l)}: ${progress.percent}% (${progress.completed}/${progress.total - progress.skipped})`);
      out.push('');
      out.push(renderDashboardMarkdown(saved, l));
      return textResult(out.join('\n'));
    },
  );
}
