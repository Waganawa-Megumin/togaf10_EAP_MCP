/**
 * 知識・参照系ツール / Knowledge and reference tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  DELIVERABLES,
  GLOSSARY,
  TECHNIQUES,
  findDeliverable,
  findPhase,
  findTechnique,
  findTerm,
  searchKnowledge,
  text,
  type Lang,
} from '../knowledge/index.js';
import {
  renderDeliverable,
  renderDeliverableTemplate,
  renderGlossaryTerm,
  renderPhase,
  renderTechnique,
} from './format.js';
import { loadEngagement } from '../engagement/store.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/**
 * 表のセルに入れる見出し。`msg` は "both" のとき改行で連結するため、
 * 表の中で使うと行が割れて Markdown の表が壊れる。ここでは 1 行に畳む。
 */
function inline(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

const KIND_LABEL: Record<string, { ja: string; en: string }> = {
  phase: { ja: 'フェーズ', en: 'Phase' },
  technique: { ja: '技法', en: 'Technique' },
  deliverable: { ja: '成果物', en: 'Deliverable' },
  glossary: { ja: '用語', en: 'Glossary' },
};

export function registerKnowledgeTools(server: McpServer): void {
  server.registerTool(
    'list_adm_phases',
    {
      title: 'List ADM phases',
      description:
        'TOGAF ADM の全フェーズ(予備フェーズ、A〜H、要件管理)を一覧する。各フェーズの ID・コード・名称・一行要約を返す。 / List all ADM phases with id, code, name, and a one-line summary.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      const l = lang as Lang;
      const lines: string[] = [];
      lines.push(msg('# ADM フェーズ一覧', '# ADM Phases', l));
      lines.push('');
      lines.push(`| # | ID | ${inline('フェーズ', 'Phase', l)} | ${inline('要約', 'Summary', l)} |`);
      lines.push('| :-: | --- | --- | --- |');
      for (const p of ADM_PHASES) {
        lines.push(`| ${p.code} | \`${p.id}\` | ${text(p.name, l)} | ${text(p.tagline, l)} |`);
      }
      lines.push('');
      lines.push(
        msg(
          '詳細は `get_adm_phase` に ID(例: `a`, `preliminary`, `requirements-management`)を渡してください。',
          'Call `get_adm_phase` with an id (e.g. `a`, `preliminary`, `requirements-management`) for details.',
          l,
        ),
      );
      return textResult(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_adm_phase',
    {
      title: 'Get an ADM phase',
      description:
        'ADM フェーズ 1 件の目的・主な入力・主なステップ・主な成果物・実務のコツ・関連技法/成果物を返す。 / Return purpose, inputs, steps, outputs, practitioner tips, and related techniques and deliverables for one ADM phase.',
      inputSchema: {
        phase: z
          .string()
          .describe('フェーズ ID / コード。例: "a", "Phase A", "preliminary", "requirements-management"'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      const found = findPhase(phase);
      if (!found) {
        return errorResult(
          msg(
            `フェーズ「${phase}」が見つかりません。利用可能な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            `Phase "${phase}" not found. Available ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            lang as Lang,
          ),
        );
      }
      return textResult(renderPhase(found, lang as Lang));
    },
  );

  server.registerTool(
    'list_techniques',
    {
      title: 'List ADM techniques',
      description:
        'ADM の主要技法(ギャップ分析、ビジネスシナリオ、ステークホルダー管理など)を一覧する。 / List the ADM techniques with a short summary each.',
      inputSchema: {
        phase: z.string().optional().describe('指定するとそのフェーズで使う技法に絞り込む / Filter by phase id'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      const l = lang as Lang;
      let items = TECHNIQUES;
      if (phase) {
        const p = findPhase(phase);
        if (!p) {
          return errorResult(
            msg(`フェーズ「${phase}」が見つかりません。`, `Phase "${phase}" not found.`, l),
          );
        }
        items = TECHNIQUES.filter((t) => t.phaseIds.includes(p.id));
      }
      const lines: string[] = [];
      lines.push(msg('# ADM 技法一覧', '# ADM Techniques', l));
      lines.push('');
      for (const t of items) {
        lines.push(`## ${text(t.name, l)} — \`${t.id}\``);
        lines.push('');
        lines.push(text(t.summary, l === 'both' ? 'ja' : l));
        if (l === 'both') lines.push(`\n${t.summary.en}`);
        lines.push('');
      }
      if (items.length === 0) lines.push(msg('該当なし', 'No matching techniques.', l));
      return textResult(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_technique',
    {
      title: 'Get an ADM technique',
      description:
        '技法 1 件の概要・適用場面・進め方・落とし穴・関連フェーズを返す。 / Return summary, when to use, how to run it, pitfalls, and related phases for one technique.',
      inputSchema: {
        technique: z.string().describe('技法 ID または名称。例: "gap-analysis", "ギャップ分析"'),
        lang: langSchema,
      },
    },
    async ({ technique, lang }) => {
      const found = findTechnique(technique);
      if (!found) {
        return errorResult(
          msg(
            `技法「${technique}」が見つかりません。利用可能な ID: ${TECHNIQUES.map((t) => t.id).join(', ')}`,
            `Technique "${technique}" not found. Available ids: ${TECHNIQUES.map((t) => t.id).join(', ')}`,
            lang as Lang,
          ),
        );
      }
      return textResult(renderTechnique(found, lang as Lang));
    },
  );

  server.registerTool(
    'list_deliverables',
    {
      title: 'List deliverables',
      description:
        'TOGAF の主要成果物を一覧する。フェーズを指定するとそのフェーズで作成・更新する成果物に絞り込む。 / List the main deliverables, optionally filtered by phase.',
      inputSchema: {
        phase: z.string().optional().describe('フェーズ ID で絞り込む / Filter by phase id'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      const l = lang as Lang;
      let items = DELIVERABLES;
      if (phase) {
        const p = findPhase(phase);
        if (!p) {
          return errorResult(msg(`フェーズ「${phase}」が見つかりません。`, `Phase "${phase}" not found.`, l));
        }
        items = DELIVERABLES.filter(
          (d) => d.createdInPhaseIds.includes(p.id) || d.refinedInPhaseIds.includes(p.id),
        );
      }
      const lines: string[] = [];
      lines.push(msg('# 成果物一覧', '# Deliverables', l));
      lines.push('');
      lines.push(`| ID | ${inline('成果物', 'Deliverable', l)} | ${inline('作成フェーズ', 'Created in', l)} |`);
      lines.push('| --- | --- | :-: |');
      for (const d of items) {
        const codes = d.createdInPhaseIds
          .map((id) => findPhase(id)?.code ?? id)
          .join(', ');
        lines.push(`| \`${d.id}\` | ${text(d.name, l)} | ${codes} |`);
      }
      if (items.length === 0) lines.push(msg('該当なし', 'No matching deliverables.', l));
      lines.push('');
      lines.push(
        msg(
          '詳細は `get_deliverable`、雛形は `generate_deliverable_template` を使ってください。',
          'Use `get_deliverable` for details and `generate_deliverable_template` for a Markdown skeleton.',
          l,
        ),
      );
      return textResult(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_deliverable',
    {
      title: 'Get a deliverable',
      description:
        '成果物 1 件の説明・作成/更新フェーズ・記載項目・作成のコツを返す。 / Return the description, phases, contents, and tips for one deliverable.',
      inputSchema: {
        deliverable: z.string().describe('成果物 ID または名称。例: "architecture-vision"'),
        lang: langSchema,
      },
    },
    async ({ deliverable, lang }) => {
      const found = findDeliverable(deliverable);
      if (!found) {
        return errorResult(
          msg(
            `成果物「${deliverable}」が見つかりません。利用可能な ID: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            `Deliverable "${deliverable}" not found. Available ids: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            lang as Lang,
          ),
        );
      }
      return textResult(renderDeliverable(found, lang as Lang));
    },
  );

  server.registerTool(
    'search_togaf',
    {
      title: 'Search the TOGAF knowledge base',
      description:
        'フェーズ・技法・成果物・用語集を横断して日英どちらのキーワードでも検索する。 / Search phases, techniques, deliverables, and the glossary in Japanese or English.',
      inputSchema: {
        query: z.string().min(1).describe('検索キーワード / Search keywords'),
        kinds: z
          .array(z.enum(['phase', 'technique', 'deliverable', 'glossary']))
          .optional()
          .describe('検索対象の種別を絞り込む / Restrict the kinds searched'),
        limit: z.number().int().min(1).max(50).default(10).describe('最大件数 / Maximum hits'),
        lang: langSchema,
      },
    },
    async ({ query, kinds, limit, lang }) => {
      const l = lang as Lang;
      const hits = searchKnowledge(query, { kinds, limit });
      if (hits.length === 0) {
        return textResult(
          msg(`「${query}」に該当する項目はありませんでした。`, `No entries matched "${query}".`, l),
        );
      }
      const lines: string[] = [];
      lines.push(msg(`# 検索結果: ${query}`, `# Search results: ${query}`, l));
      lines.push('');
      for (const hit of hits) {
        const kind = text(KIND_LABEL[hit.kind], l);
        lines.push(`## [${kind}] ${text(hit.title, l)} — \`${hit.id}\``);
        lines.push('');
        lines.push(text(hit.snippet, l === 'both' ? 'ja' : l));
        if (l === 'both') lines.push(`\n${hit.snippet.en}`);
        lines.push('');
      }
      lines.push(
        msg(
          '詳細は `get_adm_phase` / `get_technique` / `get_deliverable` に上記の ID を渡してください。',
          'Pass the ids above to `get_adm_phase`, `get_technique`, or `get_deliverable` for details.',
          l,
        ),
      );
      return textResult(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_glossary_term',
    {
      title: 'Get a glossary term',
      description:
        'EA / TOGAF 頻出用語の日英定義を返す。引数なしで全件一覧。 / Return the bilingual definition of a term; omit the argument to list all terms.',
      inputSchema: {
        term: z.string().optional().describe('用語 ID または名称 / Term id or name'),
        lang: langSchema,
      },
    },
    async ({ term, lang }) => {
      const l = lang as Lang;
      if (!term) {
        const lines: string[] = [msg('# 用語集', '# Glossary', l), ''];
        for (const g of GLOSSARY) {
          lines.push(`- \`${g.id}\` — ${text(g.term, l)}`);
        }
        return textResult(lines.join('\n'));
      }
      const found = findTerm(term);
      if (!found) {
        const hits = searchKnowledge(term, { kinds: ['glossary'], limit: 5 });
        const suggestion = hits.length > 0 ? hits.map((h) => `\`${h.id}\``).join(', ') : '—';
        return errorResult(
          msg(
            `用語「${term}」が見つかりません。近い候補: ${suggestion}`,
            `Term "${term}" not found. Closest matches: ${suggestion}`,
            l,
          ),
        );
      }
      return textResult(renderGlossaryTerm(found, l));
    },
  );

  server.registerTool(
    'generate_deliverable_template',
    {
      title: 'Generate a deliverable template',
      description:
        '成果物の Markdown 雛形(節構成 + 記入の手引き)を生成する。既定では現在の案件に登録済みのステークホルダー・リスク・作業パッケージ・移行状態を該当する節に流し込むので、他のツールの出力から転記する必要がない。 / Generate a Markdown skeleton for a deliverable. By default it pre-fills the sections with the stakeholders, risks, work packages, and transition states already recorded in the current engagement, so nothing has to be transcribed by hand.',
      inputSchema: {
        deliverable: z
          .string()
          .optional()
          .describe('成果物 ID または名称。省略すると一覧を返す / Deliverable id or name; omit to list them'),
        engagementName: z
          .string()
          .optional()
          .describe(
            '見出しに入れる案件名。省略時は現在の案件名 / Engagement name for the title; defaults to the current engagement',
          ),
        useEngagement: z
          .boolean()
          .default(true)
          .describe(
            '現在の案件の登録済みデータを雛形に流し込む(既定 true)。false で空の雛形 / Pre-fill from the current engagement (default true); false returns the blank skeleton',
          ),
        lang: langSchema,
      },
    },
    async ({ deliverable, engagementName, useEngagement, lang }) => {
      const l = lang as Lang;
      try {
        if (!deliverable || deliverable.trim().length === 0) {
          return textResult(templateUsage(l));
        }
        const found = findDeliverable(deliverable);
        if (!found) {
          const hits = searchKnowledge(deliverable, { kinds: ['deliverable'], limit: 5 });
          // 当たりが無いときに先頭 5 件を「近い候補」と偽らない(見当違いの ID を勧めることになる)
          const ids = hits.map((h) => `\`${h.id}\``).join(', ');
          const leadJa = hits.length > 0 ? `近い候補: ${ids}` : '近い候補は見つかりませんでした。';
          const leadEn = hits.length > 0 ? `Closest matches: ${ids}` : 'No close match was found.';
          return errorResult(
            msg(
              `成果物「${deliverable}」が見つかりません。${leadJa}\n引数なしで呼ぶと全 ${DELIVERABLES.length} 件の一覧を返します。`,
              `Deliverable "${deliverable}" not found. ${leadEn}\nCall it with no arguments to list all ${DELIVERABLES.length} deliverables.`,
              l,
            ),
          );
        }
        // 案件が読めない・未作成でも雛形は返す(従来どおりの空の雛形になる)
        const engagement = useEngagement === false ? null : loadEngagement();
        const name = engagementName ?? engagement?.name;
        return textResult(renderDeliverableTemplate(found, l, name, engagement));
      } catch (err) {
        return errorResult(
          msg(
            `雛形の生成に失敗しました: ${err instanceof Error ? err.message : String(err)}\n\`useEngagement: false\` を付けて呼ぶと、案件データを読まずに空の雛形を返します。`,
            `Could not generate the template: ${err instanceof Error ? err.message : String(err)}\nCall it again with \`useEngagement: false\` to get the blank skeleton without reading engagement data.`,
            l,
          ),
        );
      }
    },
  );
}

/** 引数なしで呼ばれたときの案内(何を入れればよいかとコピペできる JSON) */
function templateUsage(lang: Lang): string {
  const lines: string[] = [];
  lines.push(msg('# 成果物の雛形を作る', '# Generate a deliverable template', lang));
  lines.push('');
  lines.push(
    msg(
      '`deliverable` に下の ID を 1 つ渡してください。既定では、現在の案件に登録済みのステークホルダー・リスク・作業パッケージ・移行状態が該当する節に自動で入ります。',
      'Pass one of the ids below as `deliverable`. By default the stakeholders, risks, work packages, and transition states already recorded in the current engagement are dropped into the matching sections.',
      lang,
    ),
  );
  lines.push('');
  lines.push('```json');
  lines.push('{ "deliverable": "architecture-vision" }');
  lines.push('```');
  lines.push('');
  lines.push(`| ID | ${inline('成果物', 'Deliverable', lang)} | ${inline('作成フェーズ', 'Created in', lang)} |`);
  lines.push('| --- | --- | :-: |');
  for (const d of DELIVERABLES) {
    const codes = d.createdInPhaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
    lines.push(`| \`${d.id}\` | ${text(d.name, lang)} | ${codes} |`);
  }
  lines.push('');
  lines.push(
    msg(
      '案件データを入れずに空の雛形が欲しいときは `useEngagement: false` を付けてください。',
      'Add `useEngagement: false` when you want the blank skeleton with no engagement data.',
      lang,
    ),
  );
  return lines.join('\n');
}
