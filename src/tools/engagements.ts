/**
 * 複数エンゲージメントの管理ツール / Multi-engagement management tools.
 *
 * 実務では複数の案件を並行して見るため、案件を複数保持して切り替えられるようにする。
 * 単一案件向けの `start_engagement` / `update_engagement` は `engagement.ts` 側にある。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ADM_PHASES, findPhase, text, type Lang } from '../knowledge/index.js';
import {
  createEngagement,
  summarizeProgress,
  type Engagement,
  type EngagementIndexEntry,
} from '../engagement/model.js';
import {
  archiveEngagement,
  deleteEngagement,
  getCurrentEngagementId,
  listEngagements,
  loadEngagementById,
  readIndex,
  saveEngagement,
  setCurrentEngagement,
} from '../engagement/store.js';
import { L, label } from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/**
 * 一覧表の「案件名」列ラベル。
 * 共有の `L.name` はステークホルダー氏名向けなので、ここでローカルに定義する。
 */
const ENGAGEMENT_NAME = { ja: '案件名', en: 'Name' };

/** Markdown の表セル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** ISO 文字列を "YYYY-MM-DD HH:mm"(ローカル時刻)に整形する */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** フェーズを "A — アーキテクチャビジョン" の形にする */
function phaseLabel(phaseId: string, lang: Lang): string {
  const phase = findPhase(phaseId);
  if (!phase) return phaseId;
  return `${phase.code} — ${text(phase.name, lang)}`;
}

/** 候補一覧を 1 行ずつ並べる(エラー時の手がかり用) */
function candidateLines(entries: EngagementIndexEntry[], lang: Lang): string[] {
  if (entries.length === 0) {
    return [`- ${msg('保存済みの案件はありません。', 'No engagements are stored yet.', lang)}`];
  }
  return entries.map((e) => `- \`${e.id}\` — ${e.name}${e.archived ? ` (${label(L.archived, lang)})` : ''}`);
}

/**
 * 入力を保存済みエンゲージメントに解決する。
 * ID 完全一致 → ID 前方一致 → 名称完全一致 → 名称部分一致 の順に試す。
 */
function resolveEntry(
  input: string,
  lang: Lang,
): { entry: EngagementIndexEntry } | { error: string } {
  const all = readIndex().engagements;
  const query = input.trim();
  const lower = query.toLowerCase();

  // 空文字は前方一致で全件に当たってしまうため、ここで弾く
  if (query.length === 0) {
    return {
      error: [
        msg(
          '案件 ID(または案件名)を指定してください。',
          'Please pass an engagement id (or name).',
          lang,
        ),
        '',
        ...candidateLines(all, lang),
      ].join('\n'),
    };
  }

  const exact = all.find((e) => e.id === query);
  if (exact) return { entry: exact };

  const buckets: EngagementIndexEntry[][] = [
    all.filter((e) => e.id.toLowerCase().startsWith(lower)),
    all.filter((e) => e.name.toLowerCase() === lower),
    all.filter((e) => e.name.toLowerCase().includes(lower)),
  ];
  for (const bucket of buckets) {
    if (bucket.length === 1) return { entry: bucket[0] };
    if (bucket.length > 1) {
      return {
        error: [
          msg(
            `「${query}」に一致する案件が複数あります。ID を指定してください。`,
            `"${query}" matches more than one engagement. Please pass an exact id.`,
            lang,
          ),
          '',
          ...candidateLines(bucket, lang),
        ].join('\n'),
      };
    }
  }

  return {
    error: [
      msg(
        `案件「${query}」が見つかりません。保存済みの案件は次のとおりです。`,
        `Engagement "${query}" was not found. The stored engagements are:`,
        lang,
      ),
      '',
      ...candidateLines(all, lang),
    ].join('\n'),
  };
}

/** 切替後などに返す短いサマリ(全文は show_dashboard / get_engagement で) */
function renderSummary(e: Engagement, lang: Lang): string {
  const progress = summarizeProgress(e);
  const openRisks = e.risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length;
  const openActions = e.actions.filter((a) => a.status !== 'done').length;
  const out: string[] = [];
  const meta: string[] = [`ID: \`${e.id}\`${e.archived ? ` (${label(L.archived, lang)})` : ''}`];
  if (e.client) meta.push(`**${label(L.client, lang)}**: ${e.client}`);
  if (e.industry) meta.push(`**${label(L.industry, lang)}**: ${e.industry}`);
  meta.push(`**${label(L.currentPhase, lang)}**: ${phaseLabel(e.currentPhaseId, lang)}`);
  meta.push(`**${label(L.updatedAt, lang)}**: ${formatDate(e.updatedAt)}`);
  out.push(meta.join('  \n'));
  out.push('');
  out.push(
    [
      `${label(L.progress, lang)}: ${progress.percent}% (${progress.completed}/${progress.total - progress.skipped})`,
      `${label(L.risks, lang)}: ${openRisks} ${label(L.openItems, lang)}`,
      `${label(L.actions, lang)}: ${openActions} ${label(L.openItems, lang)}`,
      `${label(L.decisions, lang)}: ${e.decisions.length}`,
      `${label(L.deliverables, lang)}: ${e.deliverables.length}`,
    ].join(' | '),
  );
  return out.join('\n');
}

/** 一覧テーブルを描く。current は選択中の ID。 */
function renderList(entries: EngagementIndexEntry[], currentId: string | null, lang: Lang): string {
  const out: string[] = [];
  out.push(
    `| | ID | ${label(ENGAGEMENT_NAME, lang)} | ${label(L.client, lang)} | ${label(L.currentPhase, lang)} | ${label(L.progress, lang)} | ${label(L.risks, lang)} | ${label(L.actions, lang)} | ${label(L.updatedAt, lang)} | ${label(L.archived, lang)} |`,
  );
  out.push('| :-: | --- | --- | --- | --- | --: | --: | --: | --- | :-: |');
  for (const entry of entries) {
    const full = loadEngagementById(entry.id);
    const progress = full ? `${summarizeProgress(full).percent}%` : '';
    const openRisks = full
      ? String(full.risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length)
      : '';
    const openActions = full ? String(full.actions.filter((a) => a.status !== 'done').length) : '';
    const marker = entry.id === currentId ? '**→**' : '';
    out.push(
      `| ${marker} | \`${entry.id}\` | ${cell(entry.name)} | ${cell(entry.client)} | ${cell(phaseLabel(entry.currentPhaseId, lang))} | ${progress} | ${openRisks} | ${openActions} | ${formatDate(entry.updatedAt)} | ${entry.archived ? '✓' : ''} |`,
    );
  }
  return out.join('\n');
}

export function registerEngagementListTools(server: McpServer): void {
  server.registerTool(
    'list_engagements',
    {
      title: 'List stored engagements',
      description:
        '保存済みのエンゲージメントを一覧する。選択中の案件には → 印が付く。既定ではアーカイブ済みを除く。 / List the stored engagements; the current one is marked with an arrow. Archived engagements are hidden unless includeArchived is true.',
      inputSchema: {
        includeArchived: z
          .boolean()
          .default(false)
          .describe('アーカイブ済みも含める / Include archived engagements'),
        lang: langSchema,
      },
    },
    async ({ includeArchived, lang }) => {
      const l = lang as Lang;
      const entries = listEngagements(includeArchived);
      const currentId = getCurrentEngagementId();

      const out: string[] = [];
      out.push(`# ${label(L.engagements, l)}`);
      out.push('');
      if (entries.length === 0) {
        // 全件アーカイブ済みのときに「1 件も無い」と誤解させない
        const archivedCount = includeArchived ? 0 : listEngagements(true).length;
        out.push(
          archivedCount > 0
            ? msg(
                `未アーカイブの案件はありません。アーカイブ済みが ${archivedCount} 件あります(includeArchived=true で表示、\`archive_engagement\` の archived=false で復帰)。`,
                `No active engagements. ${archivedCount} archived engagement(s) exist; pass includeArchived=true to list them, or restore one with \`archive_engagement\` (archived=false).`,
                l,
              )
            : msg(
                '保存済みの案件はありません。`create_engagement` か `start_engagement` で開始してください。',
                'No engagements are stored yet. Start one with `create_engagement` or `start_engagement`.',
                l,
              ),
        );
        return textResult(out.join('\n'));
      }
      out.push(renderList(entries, currentId, l));
      out.push('');
      const hiddenCount = listEngagements(true).length - entries.length;
      if (!includeArchived && hiddenCount > 0) {
        out.push(
          msg(
            `アーカイブ済み ${hiddenCount} 件は非表示です(includeArchived=true で表示)。`,
            `${hiddenCount} archived engagement(s) hidden; pass includeArchived=true to show them.`,
            l,
          ),
        );
        out.push('');
      }
      out.push(
        msg(
          '切り替えは `switch_engagement`(engagementId に上表の ID を指定)。',
          'Switch with `switch_engagement`, passing an id from the table above.',
          l,
        ),
      );
      return textResult(out.join('\n'));
    },
  );

  server.registerTool(
    'create_engagement',
    {
      title: 'Create an additional engagement',
      description:
        '新しいエンゲージメントを追加し、それを選択中にする。既存の案件は保持されるので、複数案件を並行して扱える。 / Create an additional engagement and make it current. Existing engagements are kept, so several can run in parallel.',
      inputSchema: {
        name: z.string().min(1).describe('案件名 / Engagement name'),
        client: z.string().optional().describe('クライアント・対象組織 / Client or target organization'),
        industry: z.string().optional().describe('業界 / Industry'),
        description: z.string().optional().describe('概要・背景 / Overview and background'),
        scope: z.string().optional().describe('スコープ(対象外も書くとよい) / Scope, ideally including exclusions'),
        currentPhase: z.string().optional().describe('開始フェーズ ID(既定: a) / Starting phase id, default "a"'),
        lang: langSchema,
      },
    },
    async ({ name, client, industry, description, scope, currentPhase, lang }) => {
      const l = lang as Lang;
      const phaseId = currentPhase ? findPhase(currentPhase)?.id : undefined;
      if (currentPhase && !phaseId) {
        return errorResult(
          msg(
            `フェーズ「${currentPhase}」が見つかりません。利用可能: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            `Phase "${currentPhase}" not found. Available: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            l,
          ),
        );
      }
      const previous = getCurrentEngagementId();
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
      out.push(msg(`# 案件を追加しました: ${saved.name}`, `# Engagement created: ${saved.name}`, l));
      out.push('');
      out.push(renderSummary(saved, l));
      out.push('');
      if (previous && previous !== saved.id) {
        const prev = loadEngagementById(previous);
        out.push(
          msg(
            `この案件が選択中になりました。前の案件「${prev?.name ?? previous}」(\`${previous}\`)は残っています。`,
            `This engagement is now current. The previous one, "${prev?.name ?? previous}" (\`${previous}\`), is still stored.`,
            l,
          ),
        );
        out.push('');
      }
      out.push(
        msg(
          '以降の `update_engagement` などはこの案件に適用されます。切り替えは `switch_engagement`。',
          'Subsequent calls such as `update_engagement` apply to this engagement. Use `switch_engagement` to change.',
          l,
        ),
      );
      return textResult(out.join('\n'));
    },
  );

  server.registerTool(
    'switch_engagement',
    {
      title: 'Switch the current engagement',
      description:
        '選択中のエンゲージメントを切り替える。以降の参照・更新ツールは切替後の案件に対して働く。 / Switch the current engagement; later read and update tools operate on the newly selected one.',
      inputSchema: {
        engagementId: z
          .string()
          .min(1)
          .describe('切り替え先の案件 ID(案件名でも可) / Target engagement id (a name also works)'),
        lang: langSchema,
      },
    },
    async ({ engagementId, lang }) => {
      const l = lang as Lang;
      const resolved = resolveEntry(engagementId, l);
      if ('error' in resolved) return errorResult(resolved.error);

      const previousId = getCurrentEngagementId();
      if (!setCurrentEngagement(resolved.entry.id)) {
        return errorResult(
          msg(
            `案件「${resolved.entry.id}」に切り替えられませんでした。ファイルが削除された可能性があります。`,
            `Could not switch to "${resolved.entry.id}"; its file may have been removed.`,
            l,
          ),
        );
      }
      const engagement = loadEngagementById(resolved.entry.id);
      if (!engagement) {
        return errorResult(
          msg(
            `案件「${resolved.entry.id}」の読み込みに失敗しました(JSON が壊れている可能性があります)。`,
            `Failed to read engagement "${resolved.entry.id}"; its JSON may be corrupted.`,
            l,
          ),
        );
      }

      const out: string[] = [];
      out.push(
        msg(
          `# 案件を切り替えました: ${engagement.name}`,
          `# Switched engagement: ${engagement.name}`,
          l,
        ),
      );
      out.push('');
      if (previousId && previousId !== engagement.id) {
        const prev = loadEngagementById(previousId);
        out.push(
          `${msg('切替前', 'Previously', l)}: ${prev?.name ?? previousId} (\`${previousId}\`)`,
        );
        out.push('');
      }
      out.push(renderSummary(engagement, l));
      if (engagement.archived) {
        out.push('');
        out.push(
          msg(
            'この案件はアーカイブ済みです。作業を再開するなら `archive_engagement` で archived=false にしてください。',
            'This engagement is archived. Call `archive_engagement` with archived=false to resume work on it.',
            l,
          ),
        );
      }
      out.push('');
      out.push(
        msg(
          '全体を見るには `show_dashboard`、生データは `get_engagement`。',
          'Use `show_dashboard` for the full view, or `get_engagement` for the raw data.',
          l,
        ),
      );
      return textResult(out.join('\n'));
    },
  );

  server.registerTool(
    'archive_engagement',
    {
      title: 'Archive or unarchive an engagement',
      description:
        'エンゲージメントをアーカイブする(既定の一覧から隠す)。archived=false で元に戻す。データは消えない。 / Archive an engagement so it drops out of the default list, or restore it with archived=false. No data is deleted.',
      inputSchema: {
        engagementId: z.string().min(1).describe('対象の案件 ID(案件名でも可) / Target engagement id (a name also works)'),
        archived: z
          .boolean()
          .default(true)
          .describe('true でアーカイブ、false で解除 / true archives, false restores'),
        lang: langSchema,
      },
    },
    async ({ engagementId, archived, lang }) => {
      const l = lang as Lang;
      const resolved = resolveEntry(engagementId, l);
      if ('error' in resolved) return errorResult(resolved.error);

      if (!archiveEngagement(resolved.entry.id, archived)) {
        return errorResult(
          msg(
            `案件「${resolved.entry.id}」の更新に失敗しました。ファイルが削除された可能性があります。`,
            `Could not update engagement "${resolved.entry.id}"; its file may have been removed.`,
            l,
          ),
        );
      }

      const out: string[] = [];
      out.push(
        archived
          ? msg(
              `# アーカイブしました: ${resolved.entry.name}`,
              `# Archived: ${resolved.entry.name}`,
              l,
            )
          : msg(
              `# アーカイブを解除しました: ${resolved.entry.name}`,
              `# Restored from archive: ${resolved.entry.name}`,
              l,
            ),
      );
      out.push('');
      out.push(`- ID: \`${resolved.entry.id}\``);
      out.push(
        `- ${
          archived
            ? msg(
                '既定の一覧には出なくなります(includeArchived=true で表示)。データは残っています。',
                'It no longer appears in the default list; pass includeArchived=true to see it. The data is kept.',
                l,
              )
            : msg('通常の一覧に戻りました。', 'It appears in the default list again.', l)
        }`,
      );
      if (getCurrentEngagementId() === resolved.entry.id && archived) {
        out.push('');
        out.push(
          msg(
            'この案件は選択中のままです。別の案件で作業するなら `switch_engagement` を使ってください。',
            'It is still the current engagement. Use `switch_engagement` to work on another one.',
            l,
          ),
        );
      }
      out.push('');
      out.push(renderList(listEngagements(true), getCurrentEngagementId(), l));
      return textResult(out.join('\n'));
    },
  );

  server.registerTool(
    'delete_engagement',
    {
      title: 'Delete an engagement',
      description:
        'エンゲージメントを完全に削除する(元に戻せない)。confirm=true が必要。残したいだけなら archive_engagement を使う。 / Permanently delete an engagement; requires confirm=true and cannot be undone. Use archive_engagement instead if you only want it out of the way.',
      inputSchema: {
        engagementId: z.string().min(1).describe('削除する案件 ID(案件名でも可) / Engagement id to delete (a name also works)'),
        confirm: z
          .boolean()
          .default(false)
          .describe('true でなければ削除しない / Nothing is deleted unless this is true'),
        lang: langSchema,
      },
    },
    async ({ engagementId, confirm, lang }) => {
      const l = lang as Lang;
      const resolved = resolveEntry(engagementId, l);
      if ('error' in resolved) return errorResult(resolved.error);
      const entry = resolved.entry;

      if (!confirm) {
        const detail = loadEngagementById(entry.id);
        const out: string[] = [];
        out.push(
          msg(
            `削除は実行していません。「${entry.name}」(\`${entry.id}\`)を本当に消すなら confirm=true を指定してください。`,
            `Nothing was deleted. Pass confirm=true to really remove "${entry.name}" (\`${entry.id}\`).`,
            l,
          ),
        );
        if (detail) {
          out.push('');
          out.push(
            `${msg('失われる内容', 'What would be lost', l)}: ` +
              [
                `${label(L.risks, l)} ${detail.risks.length}`,
                `${label(L.decisions, l)} ${detail.decisions.length}`,
                `${label(L.actions, l)} ${detail.actions.length}`,
                `${label(L.stakeholders, l)} ${detail.stakeholders.length}`,
                `${label(L.deliverables, l)} ${detail.deliverables.length}`,
                `${label(L.notes, l)} ${detail.notes.length}`,
              ].join(' / '),
          );
        }
        out.push('');
        out.push(
          msg(
            '記録を残したまま一覧から隠すだけなら `archive_engagement` を使ってください。',
            'To keep the record but hide it from the list, use `archive_engagement` instead.',
            l,
          ),
        );
        return errorResult(out.join('\n'));
      }

      if (!deleteEngagement(entry.id)) {
        return errorResult(
          msg(
            `案件「${entry.id}」を削除できませんでした。既に削除されている可能性があります。`,
            `Could not delete engagement "${entry.id}"; it may already be gone.`,
            l,
          ),
        );
      }

      const remaining = listEngagements(true);
      const currentId = getCurrentEngagementId();
      const out: string[] = [];
      out.push(msg(`# 削除しました: ${entry.name}`, `# Deleted: ${entry.name}`, l));
      out.push('');
      out.push(`- ID: \`${entry.id}\``);
      out.push('');
      if (remaining.length === 0) {
        out.push(
          msg(
            '保存済みの案件は無くなりました。`create_engagement` で新しく開始できます。',
            'No engagements remain. Start a new one with `create_engagement`.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      }
      const current = currentId ? loadEngagementById(currentId) : null;
      if (current) {
        out.push(
          `${msg('現在の選択', 'Now current', l)}: ${current.name} (\`${current.id}\`)`,
        );
        out.push('');
      }
      out.push(renderList(remaining, currentId, l));
      return textResult(out.join('\n'));
    },
  );
}
