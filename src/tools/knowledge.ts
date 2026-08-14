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
import { errorResult, langSchema, msg, textResult } from './common.js';

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
      lines.push(`| # | ID | ${msg('フェーズ', 'Phase', l)} | ${msg('要約', 'Summary', l)} |`);
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
      lines.push(`| ID | ${msg('成果物', 'Deliverable', l)} | ${msg('作成フェーズ', 'Created in', l)} |`);
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
        '成果物の Markdown 雛形(節構成 + 記入の手引き)を生成する。 / Generate a Markdown skeleton for a deliverable, with section headings and guidance.',
      inputSchema: {
        deliverable: z.string().describe('成果物 ID または名称。例: "architecture-vision"'),
        engagementName: z
          .string()
          .optional()
          .describe('見出しに入れる案件名 / Engagement name to put in the title'),
        lang: langSchema,
      },
    },
    async ({ deliverable, engagementName, lang }) => {
      const found = findDeliverable(deliverable);
      if (!found) {
        return errorResult(
          msg(
            `成果物「${deliverable}」が見つかりません。`,
            `Deliverable "${deliverable}" not found.`,
            lang as Lang,
          ),
        );
      }
      return textResult(renderDeliverableTemplate(found, lang as Lang, engagementName));
    },
  );
}
