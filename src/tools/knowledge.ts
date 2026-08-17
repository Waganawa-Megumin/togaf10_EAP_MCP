/**
 * 知識・参照系ツール / Knowledge and reference tools.
 *
 * ここには 3 つしかツールを置かない。
 *
 * - `reference`  — 状態を持たない知識の引き出し口。**1 本に統合してある。**
 * - `search_togaf` — ID が分からないときの横断検索。
 * - `generate_deliverable_template` — 成果物の雛形(案件データを流し込むので参照系ではない)。
 *
 * 統合の理由(実測): 参照系だけで 14 本あった時期は `tools/list` が
 * 118,897 文字(約 42,000 トークン)あり、利用者が何か言う前に毎セッション載っていた。
 * 説明文は全体の 26% で、残りはスキーマの構造そのもの。**削るならツール数**にしか効かない。
 * 初見の利用者は「80 件以上が縦に並んでいて選べない」と言った。
 *
 * `of` の enum が、そのまま「この知識ベースに何が入っているか」の目次になる。
 * 各分野のレンダラは元のファイルに残したまま export しており、
 * **出力の中身は統合前と同じ**(`renderFrameworkList` などを呼び出しているだけ)。
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
import { FRAMEWORK_CATEGORIES, type FrameworkCategory } from '../knowledge/frameworks.js';
import {
  renderDeliverable,
  renderDeliverableTemplate,
  renderGlossaryTerm,
  renderPhase,
  renderTechnique,
} from './format.js';
import { renderFrameworkDetail, renderFrameworkList } from './frameworks.js';
import {
  renderArchiMateElementDetail,
  renderArchiMateElementList,
  renderArchiMateRelationshipList,
} from './archimate-reference.js';
import { renderArchiMateLayerList } from './archimate.js';
import { renderSecurityLayerList } from './security.js';
import { loadEngagement } from '../engagement/store.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';
import { checkFreeText, freeTextSchema, HINTS, IDENTIFIER_LIMIT } from './input-limits.js';

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

/* -------------------------------------------------------------------------- *
 * TOGAF 側の一覧レンダラ(統合前の list_* の本体をそのまま移したもの)
 * -------------------------------------------------------------------------- */

/** ADM の全フェーズ */
function renderPhaseList(l: Lang): ToolResult {
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
      '詳細は `id` にフェーズ ID(例: `a`, `preliminary`, `requirements-management`)を渡して再度呼んでください。',
      'Call again with `id` set to a phase id (e.g. `a`, `preliminary`, `requirements-management`) for the details.',
      l,
    ),
  );
  return textResult(lines.join('\n'));
}

/** ADM の技法。within にフェーズ ID を渡すとそのフェーズの分だけ */
function renderTechniqueList(phase: string | undefined, l: Lang): ToolResult {
  let items = TECHNIQUES;
  if (phase) {
    const p = findPhase(phase);
    if (!p) {
      return errorResult(msg(`フェーズ「${phase}」が見つかりません。`, `Phase "${phase}" not found.`, l));
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
  lines.push(
    msg(
      '手順と落とし穴まで読むには `id` に技法 ID を渡して再度呼んでください。',
      'Call again with `id` set to a technique id for the steps and pitfalls.',
      l,
    ),
  );
  return textResult(lines.join('\n'));
}

/** 成果物。within にフェーズ ID を渡すとそのフェーズで作る/更新する分だけ */
function renderDeliverableList(phase: string | undefined, l: Lang): ToolResult {
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
    const codes = d.createdInPhaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
    lines.push(`| \`${d.id}\` | ${text(d.name, l)} | ${codes} |`);
  }
  if (items.length === 0) lines.push(msg('該当なし', 'No matching deliverables.', l));
  lines.push('');
  lines.push(
    msg(
      '記載項目まで読むには `id` に成果物 ID を渡して再度呼んでください。雛形が欲しいときは `generate_deliverable_template`。',
      'Call again with `id` set to a deliverable id for its contents, or use `generate_deliverable_template` for a Markdown skeleton.',
      l,
    ),
  );
  return textResult(lines.join('\n'));
}

/** 用語集の全件 */
function renderGlossaryList(l: Lang): ToolResult {
  const lines: string[] = [msg('# 用語集', '# Glossary', l), ''];
  for (const g of GLOSSARY) {
    lines.push(`- \`${g.id}\` — ${text(g.term, l)}`);
  }
  lines.push('');
  lines.push(
    msg(
      '定義を読むには `id` に用語 ID を渡して再度呼んでください。',
      'Call again with `id` set to a term id for the definition.',
      l,
    ),
  );
  return textResult(lines.join('\n'));
}

/* -------------------------------------------------------------------------- *
 * 統合ツール reference
 * -------------------------------------------------------------------------- */

/** `of` に指定できる分野。この enum がそのまま知識ベースの目次になる */
const SUBJECTS = [
  'adm-phase',
  'technique',
  'deliverable',
  'glossary',
  'framework',
  'archimate-layer',
  'archimate-element',
  'archimate-relationship',
  'security-layer',
] as const;

type Subject = (typeof SUBJECTS)[number];

/** `within` をカンマで割る(フレームワークは分類とフェーズの併用があるため) */
function splitWithin(within: string | undefined): string[] {
  if (!within) return [];
  return within
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isFrameworkCategory(value: string): value is FrameworkCategory {
  return (FRAMEWORK_CATEGORIES as readonly string[]).includes(value);
}

const PHASE_IDS = ADM_PHASES.map((p) => p.id).join(', ');
const CATEGORY_IDS = FRAMEWORK_CATEGORIES.join(', ');

/**
 * `within` が効く分野と、その絞り込み軸。
 *
 * ここに載っていない分野に `within` を渡しても絞り込みようがない。
 * 黙って全件返すと「絞ったつもりの全件」を掴まされるので、必ずエラーにする。
 */
const WITHIN_AXIS: Record<Subject, { ja: string; en: string } | null> = {
  'adm-phase': null,
  technique: { ja: `フェーズ ID(${PHASE_IDS})`, en: `a phase id (${PHASE_IDS})` },
  deliverable: { ja: `フェーズ ID(${PHASE_IDS})`, en: `a phase id (${PHASE_IDS})` },
  glossary: null,
  framework: {
    ja: `フェーズ ID(${PHASE_IDS})か分類(${CATEGORY_IDS})。カンマで 1 つずつ併用可`,
    en: `a phase id (${PHASE_IDS}) or a category (${CATEGORY_IDS}); one of each may be combined with a comma`,
  },
  'archimate-element': { ja: '層 ID(例 business)', en: 'a layer id (e.g. business)' },
  'archimate-layer': null,
  'archimate-relationship': null,
  'security-layer': null,
};

/** `within` を受け付ける分野の一覧(エラー文の道案内に使う) */
const WITHIN_SUBJECTS = SUBJECTS.filter((s) => WITHIN_AXIS[s] !== null).join(' / ');

/**
 * `within` の妥当性検査。問題があればエラーを返し、無ければ undefined。
 *
 * 黙って無視される引数を残さないための関門。ここを通った `within` だけが
 * 各レンダラに渡る。
 */
function checkWithin(of: Subject, key: string | undefined, filters: string[], l: Lang): ToolResult | undefined {
  if (filters.length === 0) return undefined;

  const axis = WITHIN_AXIS[of];
  if (!axis) {
    return errorResult(
      msg(
        `\`of: "${of}"\` に \`within\` は使えません(この分野は絞り込む軸を持ちません)。\`within\` を外せば全件、1 件だけ欲しいときは \`id\` を渡してください。\`within\` が効くのは ${WITHIN_SUBJECTS} です。`,
        `\`within\` does not apply to \`of: "${of}"\` — this subject has nothing to narrow by. Drop \`within\` for the full list, or pass \`id\` for a single entry. \`within\` works with ${WITHIN_SUBJECTS}.`,
        l,
      ),
    );
  }

  if (key) {
    return errorResult(
      msg(
        `\`id\` と \`within\` は同時に使えません。\`id\` を渡した時点でその 1 件だけを返すため \`within\` は効きません。1 件が欲しいなら \`within\` を外し、一覧を絞りたいなら \`id\` を外してください。`,
        `\`id\` and \`within\` cannot be combined: passing \`id\` returns that one entry, so \`within\` would be ignored. Drop \`within\` for the single entry, or drop \`id\` to narrow the list.`,
        l,
      ),
    );
  }

  if (of === 'framework') {
    const categories = filters.filter(isFrameworkCategory);
    const rest = filters.filter((f) => !isFrameworkCategory(f));
    const badPhase = rest.find((f) => !findPhase(f));
    if (badPhase !== undefined) {
      return errorResult(
        msg(
          `\`within\` の「${badPhase}」は分類でもフェーズ ID でもありません。分類: ${CATEGORY_IDS}。フェーズ ID: ${PHASE_IDS}。`,
          `"${badPhase}" in \`within\` is neither a category nor a phase id. Categories: ${CATEGORY_IDS}. Phase ids: ${PHASE_IDS}.`,
          l,
        ),
      );
    }
    if (categories.length > 1 || rest.length > 1) {
      return errorResult(
        msg(
          `\`within\` に指定できるのは分類 1 つとフェーズ ID 1 つまでです(受け取った値: ${filters.join(', ')})。`,
          `\`within\` takes at most one category and one phase id (received: ${filters.join(', ')}).`,
          l,
        ),
      );
    }
    return undefined;
  }

  if (filters.length > 1) {
    return errorResult(
      msg(
        `\`of: "${of}"\` の \`within\` に指定できるのは 1 つだけです(受け取った値: ${filters.join(', ')})。絞り込み軸は ${axis.ja}。`,
        `\`within\` takes a single value for \`of: "${of}"\` (received: ${filters.join(', ')}). It narrows by ${axis.en}.`,
        l,
      ),
    );
  }

  if ((of === 'technique' || of === 'deliverable') && !findPhase(filters[0]!)) {
    return errorResult(
      msg(
        `フェーズ「${filters[0]}」が見つかりません。利用可能な ID: ${PHASE_IDS}`,
        `Phase "${filters[0]}" not found. Available ids: ${PHASE_IDS}`,
        l,
      ),
    );
  }

  return undefined;
}

/** 分野ごとの振り分け。id を省略したら一覧、渡したら 1 件 */
function dispatch(of: Subject, id: string | undefined, within: string | undefined, l: Lang): ToolResult {
  const key = id?.trim();
  const filters = splitWithin(within);

  const badWithin = checkWithin(of, key, filters, l);
  if (badWithin) return badWithin;

  switch (of) {
    case 'adm-phase': {
      if (!key) return renderPhaseList(l);
      const found = findPhase(key);
      if (!found) {
        return errorResult(
          msg(
            `フェーズ「${key}」が見つかりません。利用可能な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            `Phase "${key}" not found. Available ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
            l,
          ),
        );
      }
      return textResult(renderPhase(found, l));
    }

    case 'technique': {
      if (!key) return renderTechniqueList(filters[0], l);
      const found = findTechnique(key);
      if (!found) {
        return errorResult(
          msg(
            `技法「${key}」が見つかりません。利用可能な ID: ${TECHNIQUES.map((t) => t.id).join(', ')}`,
            `Technique "${key}" not found. Available ids: ${TECHNIQUES.map((t) => t.id).join(', ')}`,
            l,
          ),
        );
      }
      return textResult(renderTechnique(found, l));
    }

    case 'deliverable': {
      if (!key) return renderDeliverableList(filters[0], l);
      const found = findDeliverable(key);
      if (!found) {
        return errorResult(
          msg(
            `成果物「${key}」が見つかりません。利用可能な ID: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            `Deliverable "${key}" not found. Available ids: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            l,
          ),
        );
      }
      return textResult(renderDeliverable(found, l));
    }

    case 'glossary': {
      if (!key) return renderGlossaryList(l);
      const found = findTerm(key);
      if (!found) {
        const hits = searchKnowledge(key, { kinds: ['glossary'], limit: 5 });
        const suggestion = hits.length > 0 ? hits.map((h) => `\`${h.id}\``).join(', ') : '—';
        return errorResult(
          msg(
            `用語「${key}」が見つかりません。近い候補: ${suggestion}`,
            `Term "${key}" not found. Closest matches: ${suggestion}`,
            l,
          ),
        );
      }
      return textResult(renderGlossaryTerm(found, l));
    }

    case 'framework': {
      if (key) return renderFrameworkDetail(key, l);
      // 分類とフェーズはカンマで併用できる(`within: "modeling,b"`)
      let category: FrameworkCategory | undefined;
      let phase: string | undefined;
      for (const f of filters) {
        if (isFrameworkCategory(f)) category = f;
        else phase = f;
      }
      return renderFrameworkList({ category, phase, lang: l });
    }

    case 'archimate-layer':
      return renderArchiMateLayerList(key, l);

    case 'archimate-element':
      return key ? renderArchiMateElementDetail(key, l) : renderArchiMateElementList(filters[0], l);

    case 'archimate-relationship':
      return renderArchiMateRelationshipList(key, l);

    case 'security-layer':
      return renderSecurityLayerList(key, l);
  }
}

export function registerKnowledgeTools(server: McpServer): void {
  server.registerTool(
    'reference',
    {
      title: 'Look up the knowledge base',
      description:
        'TOGAF・ArchiMate・セキュリティの知識をこの 1 本で引く。`of` で分野を選び、`id` を省略すると一覧、渡すとその 1 件。分野: adm-phase(ADM の 10 フェーズ)/ technique(ADM 技法)/ deliverable(成果物と記載項目)/ glossary(用語の日英定義)/ framework(TOGAF と併用する周辺フレームワーク: ArchiMate / BIZBOK / Zachman / C4 / Wardley / BPMN / ITIL / COBIT / NIST CSF など)/ archimate-layer(ArchiMate の 7 層)/ archimate-element(ArchiMate の要素と混同しやすい相手)/ archimate-relationship(ArchiMate の関係の種類)/ security-layer(SABSA 由来のセキュリティアーキテクチャ 6 層 — 文脈・概念・論理・物理・コンポーネント・運用 — と ADM 対応)。ID が分からないときは先に `search_togaf` で当たりを付ける(あちらは横断検索、こちらはピンポイント取得)。 / One tool for the whole knowledge base. Choose a subject with `of`; omit `id` for the list, pass it for a single entry. Subjects: adm-phase, technique, deliverable, glossary, framework (ArchiMate, BIZBOK, Zachman, C4, Wardley, BPMN, ITIL, COBIT, NIST CSF and more), archimate-layer, archimate-element, archimate-relationship, security-layer (the six SABSA-derived security-architecture layers: contextual, conceptual, logical, physical, component, operational). When you do not know the id, find it with `search_togaf` first — that one searches across subjects, this one fetches.',
      inputSchema: {
        of: z
          .enum(SUBJECTS)
          .describe('引きたい分野。この一覧が知識ベースの目次 / Subject to look up; this list is the table of contents'),
        id: freeTextSchema(
          '省略で一覧、指定でその 1 件。ID・名称のどちらでもよい(例: "a" / "gap-analysis" / "architecture-vision" / "business-process" / "BIZBOK")/ Omit for the list, pass an id or a name for one entry',
          IDENTIFIER_LIMIT,
        ).optional(),
        within: freeTextSchema(
          '一覧を絞り込む(`id` 省略時のみ)。technique / deliverable はフェーズ ID(例 "b")、framework はフェーズ ID か分類(modeling / method / business-architecture / delivery / operations / governance / domain、カンマで 1 つずつ併用可)、archimate-element は層 ID(例 "business")。他の 5 分野(adm-phase / glossary / archimate-layer / archimate-relationship / security-layer)は絞り込む軸を持たないため、渡すとエラーになる(黙って全件は返さない)/ Narrows the list when `id` is omitted: a phase id for technique and deliverable, a phase id and/or a category for framework, a layer id for archimate-element. The other five subjects have nothing to narrow by and reject it rather than silently returning everything',
          IDENTIFIER_LIMIT,
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ of, id, within, lang }) => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText(
          [
            { field: 'id', value: id, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier },
            { field: 'within', value: within, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier },
          ],
          l,
        );
        if (tooLong) return tooLong;
        return dispatch(of as Subject, id, within, l);
      } catch (err) {
        return errorResult(
          msg(
            `参照に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
            `Lookup failed: ${err instanceof Error ? err.message : String(err)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  server.registerTool(
    'search_togaf',
    {
      title: 'Search the TOGAF knowledge base',
      description:
        'フェーズ・技法・成果物・用語集をキーワードで横断検索(日英どちらでも可)。ID が分かっているなら `reference` で直接引く方が速い。 / Search phases, techniques, deliverables, and the glossary by keyword, in Japanese or English. If you already know the id, `reference` fetches it directly and faster.',
      inputSchema: {
        query: z.string().min(1).describe('検索キーワード / Search keywords'),
        kinds: z
          .array(z.enum(['phase', 'technique', 'deliverable', 'glossary']))
          .optional()
          .describe('種別で絞り込む / Restrict the kinds searched'),
        limit: z.number().int().min(1).max(50).default(10).describe('最大件数 / Maximum hits'),
        lang: langSchema,
      },
    },
    async ({ query, kinds, limit, lang }) => {
      const l = lang as Lang;
      try {
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
          const kind = text(KIND_LABEL[hit.kind]!, l);
          lines.push(`## [${kind}] ${text(hit.title, l)} — \`${hit.id}\``);
          lines.push('');
          lines.push(text(hit.snippet, l === 'both' ? 'ja' : l));
          if (l === 'both') lines.push(`\n${hit.snippet.en}`);
          lines.push('');
        }
        lines.push(
          msg(
            '詳細は `reference` に `of`(phase → `adm-phase` / technique / deliverable / glossary)と上記の ID を渡してください。',
            'For details call `reference` with `of` (phase → `adm-phase`, technique, deliverable, glossary) and one of the ids above.',
            l,
          ),
        );
        return textResult(lines.join('\n'));
      } catch (err) {
        return errorResult(
          msg(
            `検索に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
            `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            l,
          ),
        );
      }
    },
  );

  server.registerTool(
    'generate_deliverable_template',
    {
      title: 'Generate a deliverable template',
      description:
        '成果物の Markdown 雛形(節構成 + 記入の手引き)を生成する。既定では現在の案件のステークホルダー・リスク・作業パッケージ・移行状態を該当節に流し込むので転記が要らない。 / Generate a Markdown skeleton for a deliverable, pre-filled by default with the stakeholders, risks, work packages, and transition states already in the current engagement.',
      inputSchema: {
        deliverable: z
          .string()
          .optional()
          .describe('成果物 ID または名称。省略で一覧 / Deliverable id or name; omit to list'),
        engagementName: z
          .string()
          .optional()
          .describe('見出しの案件名。既定は現在の案件 / Engagement name for the title'),
        useEngagement: z
          .boolean()
          .default(true)
          .describe('案件データを流し込む(既定 true)。false で空の雛形 / Pre-fill from the engagement; false = blank skeleton'),
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
