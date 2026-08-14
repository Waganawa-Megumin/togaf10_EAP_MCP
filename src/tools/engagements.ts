/**
 * 複数エンゲージメントの管理ツール / Multi-engagement management tools.
 *
 * 実務では複数の案件を並行して見るため、案件を複数保持して切り替えられるようにする。
 * 単一案件向けの `start_engagement` / `update_engagement` は `engagement.ts` 側にある。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ADM_PHASES, findPhase, text, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  capCell,
  createEngagement,
  summarizeProgress,
  type Engagement,
  type EngagementIndexEntry,
} from '../engagement/model.js';
import { summarizeHealth } from './review.js';
// 入力長の検査は engagement.ts に集約している(common.ts は他作業と衝突するため触らない)
import {
  PHASE_HINT,
  checkProfile,
  checkText,
  limitErrorResult,
  runChecks,
  unexpectedErrorResult,
} from './engagement.js';
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
  return entries.map(
    (e) => `- \`${e.id}\` — ${capCell(e.name, 80)}${e.archived ? ` (${label(L.archived, lang)})` : ''}`,
  );
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
  // 見つからなかった入力はエラー文にそのまま出るので、必ず短縮してから差し込む
  const shown = capCell(query, 60);

  // 長すぎる入力はここで止める。一致しなければそのままエラー文に載るうえ、
  // 前方一致・部分一致を全件に対して回すのも無駄になる。
  const tooLong = checkText('engagementId', query, 'name', lang, {
    ja: '案件は ID か案件名で指定します。`list_engagements` で一覧を確認してください。',
    en: 'Identify an engagement by its id or name; list them with `list_engagements`.',
  });
  if (tooLong) return { error: tooLong };

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
            `「${shown}」に一致する案件が複数あります。ID を指定してください。`,
            `"${shown}" matches more than one engagement. Please pass an exact id.`,
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
        `案件「${shown}」が見つかりません。保存済みの案件は次のとおりです。`,
        `Engagement "${shown}" was not found. The stored engagements are:`,
        lang,
      ),
      '',
      ...candidateLines(all, lang),
    ].join('\n'),
  };
}

/** 切替後などに返す短いサマリ(全文は get_dashboard / get_engagement で) */
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

// ---------------------------------------------------------------------------
// review_all_engagements — 横断ビュー
//
// 「5 件のうちどれが止まっているか」を毎週見つけるための表。
// 判定ルールは出力の中で必ず開示する(数字の出どころが分からない表は使われない)。
// ---------------------------------------------------------------------------

/** 横断ビュー用のローカルラベル */
const RA = {
  title: { ja: '案件横断レビュー', en: 'Cross-engagement review' },
  engagement: { ja: '案件', en: 'Engagement' },
  overdue: { ja: '期限超過', en: 'Overdue' },
  blocked: { ja: 'ブロック', en: 'Blocked' },
  highRisks: { ja: '高リスク', en: 'High risks' },
  idle: { ja: '未更新', en: 'Idle' },
  criticalFindings: { ja: '重大指摘', en: 'Critical' },
  verdict: { ja: '判定', en: 'Verdict' },
  topReason: { ja: '一番の理由', en: 'Top reason' },
  stalled: { ja: '止まっている', en: 'Stalled' },
  attention: { ja: '要注意', en: 'Watch' },
  moving: { ja: '動いている', en: 'Moving' },
  unreadable: { ja: '読み込めない', en: 'Unreadable' },
  rule: { ja: '判定ルール', en: 'How this is judged' },
  detailHeading: { ja: '止まっている案件の中身', en: 'Inside the stalled engagements' },
  detailHeadingWithUnreadable: {
    ja: '止まっている案件・読み込めない案件の中身',
    en: 'Inside the stalled and unreadable engagements',
  },
  nextStep: { ja: '次の一手', en: 'Next step' },
} satisfies Record<string, Bilingual>;

type CrossVerdict = 'stalled' | 'attention' | 'moving' | 'unreadable';

const VERDICT_LABEL: Record<CrossVerdict, Bilingual> = {
  stalled: RA.stalled,
  attention: RA.attention,
  moving: RA.moving,
  unreadable: RA.unreadable,
};

/** 日付として計算に使える期限だけを通す */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO 文字列から基準日までの経過日数(未来・不正値は 0) */
function daysSince(iso: string | undefined, base: Date): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((base.getTime() - t) / 86_400_000));
}

/** ローカル日付を YYYY-MM-DD で返す */
function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface CrossRow {
  id: string;
  name: string;
  archived: boolean;
  loaded: boolean;
  percent: number;
  phaseId: string;
  overdue: number;
  /** 期限超過の最大日数 */
  overdueWorst: number;
  blocked: number;
  /** 担当が付いていない未完了アクション */
  unowned: number;
  /** 未対応(open / mitigating)の高・重大リスク */
  openHighRisks: number;
  idleDays: number;
  critical: number;
  verdict: CrossVerdict;
  score: number;
  /** 危ない理由(強い順) */
  reasons: Bilingual[];
  /** 具体名つきの内訳(止まっている案件の詳細用) */
  details: Bilingual[];
}

/** 1 案件を横断ビュー 1 行に落とす */
function buildRow(entry: EngagementIndexEntry, today: string, base: Date, staleDays: number): CrossRow {
  const full = loadEngagementById(entry.id);
  const idleDays = daysSince(entry.updatedAt, base);
  if (!full) {
    return {
      id: entry.id,
      name: entry.name,
      archived: entry.archived,
      loaded: false,
      percent: 0,
      phaseId: entry.currentPhaseId,
      overdue: 0,
      overdueWorst: 0,
      blocked: 0,
      unowned: 0,
      openHighRisks: 0,
      idleDays,
      critical: 0,
      verdict: 'unreadable',
      score: 1000,
      reasons: [
        {
          ja: 'JSON を読み込めない(ファイル破損か手動編集)',
          en: 'The JSON cannot be read (corrupted or hand-edited)',
        },
      ],
      details: [],
    };
  }

  const openActions = full.actions.filter((a) => a.status !== 'done');
  const overdueActions = openActions.filter(
    (a) => a.due !== undefined && ISO_DATE.test(a.due) && a.due < today,
  );
  const overdueWorst = overdueActions.reduce(
    (max, a) => Math.max(max, daysSince(`${a.due}T00:00:00Z`, base)),
    0,
  );
  const blockedActions = full.actions.filter((a) => a.status === 'blocked');
  const unownedActions = openActions.filter((a) => !a.owner || a.owner.trim().length === 0);
  const openHighRisks = full.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && (r.status === 'open' || r.status === 'mitigating'),
  );
  const health = summarizeHealth(full, today, base);

  const idlePenalty = idleDays >= staleDays ? 2 + Math.floor((idleDays - staleDays) / 7) : 0;
  const score =
    overdueActions.length * 3 +
    health.critical * 3 +
    blockedActions.length * 2 +
    unownedActions.length +
    openHighRisks.length +
    idlePenalty;

  const stalled = overdueActions.length > 0 || blockedActions.length > 0 || idleDays >= staleDays;
  const verdict: CrossVerdict = stalled ? 'stalled' : score > 0 ? 'attention' : 'moving';

  const reasons: Bilingual[] = [];
  if (overdueActions.length > 0) {
    reasons.push({
      ja: `期限超過 ${overdueActions.length} 件(最長 ${overdueWorst} 日)`,
      en: `${overdueActions.length} overdue (worst ${overdueWorst} days)`,
    });
  }
  if (blockedActions.length > 0) {
    reasons.push({
      ja: `ブロック中 ${blockedActions.length} 件`,
      en: `${blockedActions.length} blocked`,
    });
  }
  if (idleDays >= staleDays) {
    reasons.push({ ja: `${idleDays} 日更新なし`, en: `untouched for ${idleDays} days` });
  }
  if (health.critical > 0) {
    const head = health.topCritical[0];
    reasons.push({
      ja: `重大指摘 ${health.critical} 件${head ? `(${head.ja})` : ''}`,
      en: `${countEn(health.critical, 'critical finding', 'critical findings')}${head ? ` (${head.en})` : ''}`,
    });
  }
  if (unownedActions.length > 0) {
    reasons.push({
      ja: `担当未設定のアクション ${unownedActions.length} 件`,
      en: `${countEn(unownedActions.length, 'action', 'actions')} with no owner`,
    });
  }
  if (openHighRisks.length > 0) {
    reasons.push({
      ja: `未対応の高リスク ${openHighRisks.length} 件`,
      en: `${countEn(openHighRisks.length, 'live high risk', 'live high risks')}`,
    });
  }

  // 具体名まで出す(名前が出れば、誰に何を聞くかがその場で決まる)
  const details: Bilingual[] = [];
  for (const a of overdueActions.slice(0, 3)) {
    const days = daysSince(`${a.due}T00:00:00Z`, base);
    details.push({
      ja: `期限超過 ${days} 日: ${cell(a.title)}(期限 ${cell(a.due)} / 担当 ${cell(a.owner) || '未設定'})`,
      en: `${days} days overdue: ${cell(a.title)} (due ${cell(a.due)}, owner ${cell(a.owner) || 'unassigned'})`,
    });
  }
  for (const a of blockedActions.slice(0, 2)) {
    const idle = daysSince(a.updatedAt, base);
    // 更新直後(0 日)に「0 日更新なし」と書くと読み手が混乱するので、日数は 1 日以上のときだけ添える
    details.push({
      ja: `ブロック中${idle >= 1 ? `(${idle} 日更新なし)` : ''}: ${cell(a.title)}${a.note ? ` — ${cell(a.note)}` : ''}`,
      en: `Blocked${idle >= 1 ? ` (untouched ${idle} days)` : ''}: ${cell(a.title)}${a.note ? ` — ${cell(a.note)}` : ''}`,
    });
  }
  for (const f of health.topCritical.slice(0, 2)) {
    details.push({ ja: `重大: ${f.ja}`, en: `Critical: ${f.en}` });
  }
  // 上の一覧はそれぞれ打ち切ってある。表の件数と食い違って見えないよう、隠した分を明示する。
  const hidden =
    Math.max(0, overdueActions.length - 3) +
    Math.max(0, blockedActions.length - 2) +
    Math.max(0, health.critical - Math.min(health.topCritical.length, 2));
  if (hidden > 0) {
    details.push({
      ja: `ほか ${hidden} 件は上表の件数に含まれる(全件は \`check_engagement_health\` で見る)`,
      en: `${hidden} more ${hidden === 1 ? 'is' : 'are'} counted in the table above; see them all with \`check_engagement_health\``,
    });
  }

  return {
    id: entry.id,
    name: entry.name,
    archived: entry.archived,
    loaded: true,
    percent: summarizeProgress(full).percent,
    phaseId: full.currentPhaseId,
    overdue: overdueActions.length,
    overdueWorst,
    blocked: blockedActions.length,
    unowned: unownedActions.length,
    openHighRisks: openHighRisks.length,
    idleDays,
    critical: health.critical,
    verdict,
    score,
    reasons,
    details,
  };
}

/** 英文の単複を揃える小さなヘルパ */
function countEn(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** 判定の重い順(止まっているものを必ず上に固める) */
const VERDICT_RANK: Record<CrossVerdict, number> = {
  unreadable: 0,
  stalled: 1,
  attention: 2,
  moving: 3,
};

/**
 * 危ない順に並べる。
 * まず判定でまとめる(「止まっている」が表の途中に散らばると探す表として使えない)。
 * その中を点数 → 期限超過 → 未更新 → 名前 の順で並べる。
 */
function sortRows(rows: CrossRow[]): CrossRow[] {
  return rows.slice().sort((a, b) => {
    if (VERDICT_RANK[a.verdict] !== VERDICT_RANK[b.verdict]) {
      return VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    }
    if (b.score !== a.score) return b.score - a.score;
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    if (b.idleDays !== a.idleDays) return b.idleDays - a.idleDays;
    return a.name.localeCompare(b.name);
  });
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
          '切り替えは `switch_engagement`(engagementId に上表の ID を指定)。どれが止まっているかを危ない順に見るには `review_all_engagements`。',
          'Switch with `switch_engagement`, passing an id from the table above. To see which ones have stalled, worst first, use `review_all_engagements`.',
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
      try {
        // 上限検査を先に済ませる。ここを通れば createEngagement は投げない。
        const problem = runChecks([
          () => checkProfile({ name, client, industry, description, scope }, l),
          () => checkText('currentPhase', currentPhase, 'title', l, PHASE_HINT),
        ]);
        if (problem) return limitErrorResult(problem, l);

        const phaseId = currentPhase ? findPhase(currentPhase)?.id : undefined;
        if (currentPhase && !phaseId) {
          return errorResult(
            msg(
              `フェーズ「${capCell(currentPhase, 60)}」が見つかりません。利用可能: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              `Phase "${capCell(currentPhase, 60)}" not found. Available: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
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
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。
        return unexpectedErrorResult('create_engagement', error, l);
      }
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
      try {
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
            '全体を見るには `get_dashboard`、生データは `get_engagement`、いま何をすべきかは `next_best_action`。',
            'Use `get_dashboard` for the full view, `get_engagement` for the raw data, or `next_best_action` for what to do now.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。SDK 任せにすると生の Node エラー
        // (一時ファイルのパスを含む)がそのまま利用者に出る。
        return unexpectedErrorResult('switch_engagement', error, l);
      }
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
      try {
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
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。SDK 任せにすると生の Node エラー
        // (一時ファイルのパスを含む)がそのまま利用者に出る。
        return unexpectedErrorResult('archive_engagement', error, l);
      }
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
      try {
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
      } catch (error) {
        // CLAUDE.md: ハンドラは例外を投げない。SDK 任せにすると生の Node エラー
        // (一時ファイルのパスを含む)がそのまま利用者に出る。
        return unexpectedErrorResult('delete_engagement', error, l);
      }
    },
  );

  server.registerTool(
    'review_all_engagements',
    {
      title: 'Review every engagement at once, worst first',
      description:
        '保存済みの全案件を 1 つの表にまとめ、危ない順に並べる。案件ごとに 進捗・期限超過アクション・ブロック中アクション・未対応の高リスク・最終更新からの日数・健全性チェックの重大指摘数 を集計し、「止まっている / 要注意 / 動いている」を判定して、止まっている案件については具体的な件名まで出す。複数案件を横断で見るための唯一のツール。 / Roll every stored engagement into one table, worst first. For each: progress, overdue actions, blocked actions, live high risks, days since last update, and the count of critical health findings — plus a stalled / watch / moving verdict and the named items behind it.',
      inputSchema: {
        includeArchived: z
          .boolean()
          .default(false)
          .describe('アーカイブ済みも含める / Include archived engagements'),
        staleDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(14)
          .describe(
            '何日更新が無ければ「止まっている」とみなすか(既定 14) / Days without an update before an engagement counts as stalled (default 14)',
          ),
        asOf: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('基準日 (YYYY-MM-DD)。省略時は today / Reference date; defaults to today'),
        lang: langSchema,
      },
    },
    async ({ includeArchived, staleDays, asOf, lang }) => {
      const l = lang as Lang;
      try {
        let base = new Date();
        if (asOf) {
          const parsed = new Date(`${asOf}T00:00:00Z`);
          // 正規表現を通っても 2026-13-45 のような日付があり得る
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

        const entries = listEngagements(includeArchived);
        const currentId = getCurrentEngagementId();
        const out: string[] = [];
        out.push(`# ${label(RA.title, l)}`);
        out.push('');

        if (entries.length === 0) {
          const archivedCount = includeArchived ? 0 : listEngagements(true).length;
          out.push(
            archivedCount > 0
              ? msg(
                  `未アーカイブの案件はありません。アーカイブ済みが ${archivedCount} 件あります(includeArchived=true で含められます)。`,
                  `No active engagements. ${countEn(archivedCount, 'archived engagement exists', 'archived engagements exist')}; pass includeArchived=true to include them.`,
                  l,
                )
              : msg(
                  '保存済みの案件が 1 件もありません。`create_engagement` で 1 件目を作ると、この横断ビューが使えるようになります。',
                  'No engagements are stored. Create the first one with `create_engagement` and this cross view becomes useful.',
                  l,
                ),
          );
          return textResult(out.join('\n'));
        }

        const rows = sortRows(entries.map((e) => buildRow(e, today, base, staleDays)));
        const unreadable = rows.filter((r) => r.verdict === 'unreadable');
        const stalledOnly = rows.filter((r) => r.verdict === 'stalled');
        const attention = rows.filter((r) => r.verdict === 'attention');
        // 詳細節では「読み込めない」も同じ扱いにする(どちらも手当てが要る)
        const stalled = [...unreadable, ...stalledOnly];

        const headlineJa =
          `基準日 ${today} ・ 対象 ${rows.length} 件 ・ 止まっている ${stalledOnly.length} 件 ・ 要注意 ${attention.length} 件` +
          (unreadable.length > 0 ? ` ・ 読み込めない ${unreadable.length} 件` : '');
        const headlineEn =
          `As of ${today} · ${countEn(rows.length, 'engagement', 'engagements')} · ${stalledOnly.length} stalled · ${attention.length} to watch` +
          (unreadable.length > 0 ? ` · ${unreadable.length} unreadable` : '');
        out.push(`*${l === 'en' ? headlineEn : headlineJa}*`);
        if (l === 'both') {
          out.push('');
          out.push(`*${headlineEn}*`);
        }
        out.push('');

        out.push(
          `| | ${label(RA.engagement, l)} | ${label(L.currentPhase, l)} | ${label(L.progress, l)} | ${label(RA.overdue, l)} | ${label(RA.blocked, l)} | ${label(RA.highRisks, l)} | ${label(RA.idle, l)} | ${label(RA.criticalFindings, l)} | ${label(RA.verdict, l)} | ${label(RA.topReason, l)} |`,
        );
        out.push('| :-: | --- | --- | --: | --: | --: | --: | --: | --: | --- | --- |');
        for (const row of rows) {
          const marker = row.id === currentId ? '**→**' : '';
          const top = row.reasons[0];
          const num = (n: number) => (n > 0 ? String(n) : '—');
          out.push(
            [
              '',
              marker,
              `${cell(row.name)}${row.archived ? ` (${label(L.archived, l)})` : ''}<br>\`${row.id}\``,
              cell(phaseLabel(row.phaseId, l)),
              row.loaded ? `${row.percent}%` : '—',
              num(row.overdue),
              num(row.blocked),
              num(row.openHighRisks),
              row.idleDays > 0 ? msg(`${row.idleDays} 日`, `${row.idleDays}d`, l === 'both' ? 'en' : l) : '—',
              num(row.critical),
              label(VERDICT_LABEL[row.verdict], l),
              top ? cell(label(top, l === 'both' ? 'ja' : l)) : '—',
              '',
            ].join(' | ').trim(),
          );
        }
        out.push('');
        out.push(
          `> **${label(RA.rule, l)}**: ${msg(
            `期限超過アクション・ブロック中アクション・${staleDays} 日以上更新なし のいずれか 1 つでもあれば「止まっている」。どれも無くても、重大指摘・担当未設定・未対応の高リスクが残っていれば「要注意」。並び順は 判定(止まっている → 要注意 → 動いている)が先で、同じ判定の中は 期限超過×3・重大指摘×3・ブロック×2・担当未設定×1・高リスク×1・停滞日数 の合計点の高い順。取りこぼすより過剰に拾うほうが安い。`,
            `An engagement is "stalled" if any one of these holds: an overdue action, a blocked action, or no update for ${staleDays} days. Without those, it is "watch" while critical findings, unowned actions, or live high risks remain. Rows are grouped by verdict (stalled, then watch, then moving); inside a group they are ranked by a score: overdue×3, critical findings×3, blocked×2, unowned×1, high risk×1, plus an idleness penalty. Over-flagging is cheaper than missing one.`,
            l === 'both' ? 'ja' : l,
          )}`,
        );
        out.push('');

        if (stalled.length > 0) {
          // 読み込めない案件もこの節に出るので、見出しでそれを隠さない
          out.push(
            `## ${label(unreadable.length > 0 ? RA.detailHeadingWithUnreadable : RA.detailHeading, l)}`,
          );
          out.push('');
          for (const row of stalled.slice(0, 5)) {
            out.push(`### ${cell(row.name)} (\`${row.id}\`)`);
            out.push('');
            if (row.details.length === 0) {
              for (const r of row.reasons.slice(0, 3)) out.push(`- ${label(r, l === 'both' ? 'ja' : l)}`);
            } else {
              for (const d of row.details) out.push(`- ${label(d, l === 'both' ? 'ja' : l)}`);
            }
            out.push('');
            out.push(
              row.verdict === 'unreadable'
                ? msg(
                    `→ 保存ファイル(既定 \`~/.togaf-eap/engagements/${row.id}.json\`、\`TOGAF_EAP_DATA_DIR\` で変更可)を直接開いて JSON を直す。復旧できないなら \`delete_engagement\` で索引から外す(他の案件には影響しない)。`,
                    `→ Open the stored file (by default \`~/.togaf-eap/engagements/${row.id}.json\`, relocatable with \`TOGAF_EAP_DATA_DIR\`) and repair the JSON. If it cannot be recovered, drop the entry with \`delete_engagement\` — the other engagements are unaffected.`,
                    l,
                  )
                : msg(
                    `→ \`switch_engagement {"engagementId":"${row.id}"}\` で切り替え、\`check_engagement_health\` で中身を見る。`,
                    `→ Switch with \`switch_engagement {"engagementId":"${row.id}"}\`, then run \`check_engagement_health\`.`,
                    l,
                  ),
            );
            out.push('');
          }
          if (stalled.length > 5) {
            out.push(
              msg(
                `残り ${stalled.length - 5} 件の内訳は上表を参照。`,
                `See the table above for the remaining ${stalled.length - 5}.`,
                l,
              ),
            );
            out.push('');
          }
        }

        out.push(`## ${label(RA.nextStep, l)}`);
        out.push('');
        if (unreadable.length > 0) {
          out.push(
            msg(
              `${unreadable.length} 件の案件記録が読み込めない。集計から外れているので、この表の数字はその分だけ楽観に見えている。先にファイルを直す。`,
              `${countEn(unreadable.length, 'engagement record', 'engagement records')} cannot be read. They are excluded from every count above, so this table currently reads more optimistic than reality. Repair the files first.`,
              l,
            ),
          );
          out.push('');
        }
        if (stalledOnly.length > 0) {
          const worst = stalledOnly[0];
          out.push(
            msg(
              `今週は「${cell(worst.name)}」から手を付ける。${
                worst.reasons[0] ? `理由: ${worst.reasons[0].ja}。` : ''
              }止まっている案件を全部同時に動かそうとすると、どれも動かない。1 件ずつ、止めている当人に直接聞く。`,
              `Start with "${cell(worst.name)}" this week.${
                worst.reasons[0] ? ` Why: ${worst.reasons[0].en}.` : ''
              } Trying to restart every stalled engagement at once restarts none of them — take them one at a time and ask the person who is actually holding it.`,
              l,
            ),
          );
        } else if (unreadable.length > 0) {
          // 読み込めない案件の手当ては 1 つ上の段落で示している
          out.push(
            msg(
              '読める範囲の案件はどれも止まっていない。まず壊れた記録を直し、そのうえでもう一度この表を見る。',
              'Nothing that can be read has stalled. Repair the broken record first, then look at this table again.',
              l,
            ),
          );
        } else if (attention.length > 0) {
          out.push(
            msg(
              '止まっている案件は無い。要注意の案件は、次の定例までに担当と期限を埋めておけば止まらない。',
              'Nothing is stalled. The ones on watch stay that way if you fill in owners and dates before the next checkpoint.',
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '全案件が動いている。この状態を保つには、毎週このビューを同じ曜日に見るのが一番安い。',
              'Every engagement is moving. The cheapest way to keep it that way is to look at this view on the same day each week.',
              l,
            ),
          );
        }
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `横断レビューの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}。\`list_engagements\` で保存状態を確認してください。`,
            `Failed to build the cross-engagement review: ${error instanceof Error ? error.message : String(error)}. Check the stored state with \`list_engagements\`.`,
            l,
          ),
        );
      }
    },
  );
}
