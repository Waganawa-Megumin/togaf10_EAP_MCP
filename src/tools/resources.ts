/**
 * MCP リソース / MCP resources.
 *
 * ツール呼び出しを介さずに、クライアントが直接参照できるコンテンツを公開する。
 * 知識ベース(フェーズ・技法・成果物・用語)は静的な一覧 + テンプレート URI で、
 * エンゲージメントの現状はダッシュボード Markdown で提供する。
 *
 * Exposes read-only content the client can attach directly: the knowledge base
 * (phases, techniques, deliverables, glossary) and the current engagement dashboard.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ADM_PHASES,
  DELIVERABLES,
  GLOSSARY,
  TECHNIQUES,
  findDeliverable,
  findPhase,
  findTechnique,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import { renderDeliverable, renderPhase, renderTechnique } from './format.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
import { loadEngagement } from '../engagement/store.js';

/** リソースは常に日英併記で返す(クライアント側で言語指定ができないため) */
const LANG: Lang = 'both';

const MIME = 'text/markdown';

/**
 * このファイルでだけ使う表示文言 / Strings used only by the resource layer.
 * 共有ラベル(labels.ts)は編集しないため、足りないものはここに置く。
 */
const R = {
  notFoundTitle: { ja: '見つかりません', en: 'Not found' },
  availableIds: { ja: '利用できる ID', en: 'Available ids' },
  phaseList: { ja: 'ADM フェーズ一覧', en: 'ADM phases' },
  techniqueList: { ja: '技法一覧', en: 'Techniques' },
  deliverableList: { ja: '成果物一覧', en: 'Deliverables' },
  glossaryTitle: { ja: '用語集', en: 'Glossary' },
  dashboardError: {
    ja: 'エンゲージメント状態の読み込みに失敗しました。',
    en: 'Failed to load the engagement state.',
  },
  loadHint: {
    ja: '保存先のファイルが壊れている可能性があります。`get_engagement` を呼ぶか、保存ディレクトリを確認してください。',
    en: 'The saved state file may be corrupt. Call `get_engagement` or inspect the data directory.',
  },
  code: { ja: 'コード', en: 'Code' },
  name: { ja: '名称', en: 'Name' },
  summary: { ja: '要約', en: 'Summary' },
  uri: { ja: 'URI', en: 'URI' },
  term: { ja: '用語', en: 'Term' },
  definition: { ja: '定義', en: 'Definition' },
  disclaimer: {
    ja: '本サーバーは非公式です。TOGAF 標準の原文は含まず、事実情報と独自の要約のみで構成しています。',
    en: 'Unofficial server. It contains no verbatim TOGAF text - only factual names plus original summaries.',
  },
} satisfies Record<string, Bilingual>;

/** 日英併記の見出し行 */
function h(value: Bilingual): string {
  return `${value.ja} / ${value.en}`;
}

/** Markdown の表セル用にパイプと改行を無害化する */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * テンプレート変数を 1 つの文字列に正規化する。
 * 配列で来る場合があり、パーセントエンコードされたまま渡ることもあるためデコードも試みる。
 */
function firstValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  try {
    return decodeURIComponent(raw);
  } catch {
    // 不正なエスケープ列はそのまま扱う(ここで例外を投げない)
    return raw;
  }
}

/**
 * ID 補完。前方一致を先に、次に部分一致を返す。
 * (例: "map" で `stakeholder-map` / `business-capability-map` も拾えるようにする)
 */
function completeIds(ids: string[], value: string): string[] {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return ids;
  const prefix = ids.filter((id) => id.startsWith(v));
  const rest = ids.filter((id) => !id.startsWith(v) && id.includes(v));
  return [...prefix, ...rest];
}

/** Markdown のインラインコード用にバッククォートを無害化する */
function code(value: string): string {
  return value.replace(/`/g, "'");
}

/** 該当 ID が無いときに返す Markdown(例外は投げない) */
function notFoundMarkdown(kind: Bilingual, requested: string, ids: string[]): string {
  const asked = code(requested);
  const lines: string[] = [];
  lines.push(`# ${h(R.notFoundTitle)}`);
  lines.push('');
  lines.push(
    `${h(kind)}: \`${asked}\` に該当するエントリはありません。 / No entry matches \`${asked}\`.`,
  );
  lines.push('');
  lines.push(`## ${h(R.availableIds)}`);
  lines.push('');
  lines.push(ids.map((id) => `- \`${id}\``).join('\n'));
  lines.push('');
  return lines.join('\n');
}

/** Markdown 1 件を返すヘルパ */
function markdown(uri: URL, body: string): ReadResourceResult {
  return { contents: [{ uri: uri.href, mimeType: MIME, text: body }] };
}

/** ADM フェーズ一覧 */
function phasesMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${h(R.phaseList)}`);
  lines.push('');
  lines.push(`> ${h(R.disclaimer)}`);
  lines.push('');
  lines.push(
    `| ${h(R.code)} | ID | ${h(R.name)} | ${h(R.summary)} | ${h(R.uri)} |`,
  );
  lines.push('| :-: | --- | --- | --- | --- |');
  for (const p of ADM_PHASES) {
    lines.push(
      `| ${cell(p.code)} | \`${p.id}\` | ${cell(text(p.name, LANG))} | ${cell(text(p.tagline, LANG))} | \`togaf://phase/${p.id}\` |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** 技法一覧 */
function techniquesMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${h(R.techniqueList)}`);
  lines.push('');
  lines.push(`> ${h(R.disclaimer)}`);
  lines.push('');
  lines.push(`| ID | ${h(R.name)} | ${h(R.summary)} | ${h(R.uri)} |`);
  lines.push('| --- | --- | --- | --- |');
  for (const t of TECHNIQUES) {
    lines.push(
      `| \`${t.id}\` | ${cell(text(t.name, LANG))} | ${cell(text(t.summary, LANG))} | \`togaf://technique/${t.id}\` |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** 成果物一覧 */
function deliverablesMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${h(R.deliverableList)}`);
  lines.push('');
  lines.push(`> ${h(R.disclaimer)}`);
  lines.push('');
  lines.push(`| ID | ${h(R.name)} | ${h(R.summary)} | ${h(R.uri)} |`);
  lines.push('| --- | --- | --- | --- |');
  for (const d of DELIVERABLES) {
    lines.push(
      `| \`${d.id}\` | ${cell(text(d.name, LANG))} | ${cell(text(d.summary, LANG))} | \`togaf://deliverable/${d.id}\` |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** 用語集全体 */
function glossaryMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${h(R.glossaryTitle)}`);
  lines.push('');
  lines.push(`> ${h(R.disclaimer)}`);
  lines.push('');
  lines.push(`| ID | ${h(R.term)} | ${h(R.definition)} |`);
  lines.push('| --- | --- | --- |');
  const sorted = [...GLOSSARY].sort((a, b) => a.term.en.localeCompare(b.term.en));
  for (const g of sorted) {
    lines.push(
      `| \`${g.id}\` | ${cell(text(g.term, LANG))} | ${cell(text(g.definition, LANG))} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** 現在のエンゲージメントのダッシュボード Markdown(失敗しても例外を投げない) */
function engagementMarkdown(): string {
  try {
    return renderDashboardMarkdown(loadEngagement(), LANG);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [
      `# ${h(R.dashboardError)}`,
      '',
      `\`${detail}\``,
      '',
      h(R.loadHint),
      '',
    ].join('\n');
  }
}

export function registerResources(server: McpServer): void {
  // --- 一覧系(静的 URI) -----------------------------------------------------
  server.registerResource(
    'togaf-phases',
    'togaf://phases',
    {
      title: 'ADM フェーズ一覧 / ADM phases',
      description:
        'TOGAF ADM の全フェーズ(予備フェーズ、A〜H、要件管理)の一覧。 / Index of all ADM phases with ids and one-line summaries.',
      mimeType: MIME,
    },
    async (uri) => markdown(uri, phasesMarkdown()),
  );

  server.registerResource(
    'togaf-techniques',
    'togaf://techniques',
    {
      title: '技法一覧 / Techniques',
      description: 'このサーバーが収録する ADM 技法の一覧。 / Index of the ADM techniques covered here.',
      mimeType: MIME,
    },
    async (uri) => markdown(uri, techniquesMarkdown()),
  );

  server.registerResource(
    'togaf-deliverables',
    'togaf://deliverables',
    {
      title: '成果物一覧 / Deliverables',
      description: 'このサーバーが収録する成果物の一覧。 / Index of the deliverables covered here.',
      mimeType: MIME,
    },
    async (uri) => markdown(uri, deliverablesMarkdown()),
  );

  server.registerResource(
    'togaf-glossary',
    'togaf://glossary',
    {
      title: '用語集 / Glossary',
      description: 'EA 実務でよく使う用語の日英対訳と独自の定義。 / Bilingual glossary with original definitions.',
      mimeType: MIME,
    },
    async (uri) => markdown(uri, glossaryMarkdown()),
  );

  // --- 明細系(テンプレート URI) ---------------------------------------------
  server.registerResource(
    'togaf-phase',
    new ResourceTemplate('togaf://phase/{id}', {
      list: undefined,
      complete: {
        id: (value: string) => completeIds(ADM_PHASES.map((p) => p.id), value),
      },
    }),
    {
      title: 'ADM フェーズ詳細 / ADM phase detail',
      description:
        'フェーズ 1 件の目的・入力・ステップ・成果物・実務のコツ。ID は togaf://phases を参照。 / One phase in detail.',
      mimeType: MIME,
    },
    async (uri, params) => {
      const id = firstValue(params['id']);
      const phase = findPhase(id);
      if (!phase) {
        return markdown(
          uri,
          notFoundMarkdown({ ja: 'フェーズ', en: 'Phase' }, id, ADM_PHASES.map((p) => p.id)),
        );
      }
      return markdown(uri, renderPhase(phase, LANG));
    },
  );

  server.registerResource(
    'togaf-technique',
    new ResourceTemplate('togaf://technique/{id}', {
      list: undefined,
      complete: {
        id: (value: string) => completeIds(TECHNIQUES.map((t) => t.id), value),
      },
    }),
    {
      title: '技法詳細 / Technique detail',
      description:
        '技法 1 件の概要・適用場面・進め方・落とし穴。ID は togaf://techniques を参照。 / One technique in detail.',
      mimeType: MIME,
    },
    async (uri, params) => {
      const id = firstValue(params['id']);
      const technique = findTechnique(id);
      if (!technique) {
        return markdown(
          uri,
          notFoundMarkdown({ ja: '技法', en: 'Technique' }, id, TECHNIQUES.map((t) => t.id)),
        );
      }
      return markdown(uri, renderTechnique(technique, LANG));
    },
  );

  server.registerResource(
    'togaf-deliverable',
    new ResourceTemplate('togaf://deliverable/{id}', {
      list: undefined,
      complete: {
        id: (value: string) => completeIds(DELIVERABLES.map((d) => d.id), value),
      },
    }),
    {
      title: '成果物詳細 / Deliverable detail',
      description:
        '成果物 1 件の概要・記載項目・作成のコツ・作成フェーズ。ID は togaf://deliverables を参照。 / One deliverable in detail.',
      mimeType: MIME,
    },
    async (uri, params) => {
      const id = firstValue(params['id']);
      const deliverable = findDeliverable(id);
      if (!deliverable) {
        return markdown(
          uri,
          notFoundMarkdown({ ja: '成果物', en: 'Deliverable' }, id, DELIVERABLES.map((d) => d.id)),
        );
      }
      return markdown(uri, renderDeliverable(deliverable, LANG));
    },
  );

  // --- エンゲージメント -------------------------------------------------------
  server.registerResource(
    'togaf-engagement-current',
    'togaf://engagement/current',
    {
      title: '現在のエンゲージメント / Current engagement',
      description:
        '進行中のエンゲージメントのダッシュボード(進捗・リスク・決定・アクション)を Markdown で返す。 / Live dashboard of the current engagement.',
      mimeType: MIME,
    },
    async (uri) => markdown(uri, engagementMarkdown()),
  );
}
