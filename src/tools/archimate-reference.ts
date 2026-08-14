/**
 * ArchiMate 要素リファレンス / ArchiMate element reference.
 *
 * `src/knowledge/archimate.ts` が持つ要素の解説(何を表すか / 実務での使い方 /
 * 混同されやすい要素との違い)を引くためのツール。
 *
 * 関係の妥当性判定は `src/tools/archimate.ts` が担当し、そちらは判定用の
 * 分類(aspect)を別に持つ。**要素の説明はこのファイル経由の知識ベースが
 * 単一の情報源**であり、両者の要素 ID・名称・層の一致は
 * `tests/archimate.test.ts` が検査している。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ARCHIMATE_ELEMENTS,
  ARCHIMATE_LAYERS,
  ARCHIMATE_RELATIONSHIPS,
  elementsByLayer,
  findArchiMateElement,
  findArchiMateLayer,
  matchesKeyword,
  text,
  type ArchiMateElement,
  type ArchiMateLayerId,
  type Lang,
} from '../knowledge/index.js';
import { errorResult, langSchema, msg, textResult } from './common.js';
import {
  capInline,
  checkFreeText,
  freeTextSchema,
  HINTS,
  IDENTIFIER_LIMIT,
} from './input-limits.js';

/** Markdown の表セルを壊さないようにする */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 要素 1 件を詳しく描く */
function renderElement(element: ArchiMateElement, lang: Lang): string[] {
  const layer = findArchiMateLayer(element.layer);
  const out: string[] = [];
  out.push(`## ${text(element.name, lang)} — \`${element.id}\``);
  out.push('');
  out.push(
    `- **${msg('層', 'Layer', lang)}**: ${layer ? text(layer.name, lang) : element.layer}`,
  );
  out.push('');
  out.push(`**${msg('何を表すか', 'What it represents', lang)}**`);
  out.push('');
  out.push(text(element.meaning, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') out.push(`\n${element.meaning.en}`);
  out.push('');
  out.push(`**${msg('実務での使い方', 'How to use it', lang)}**`);
  out.push('');
  out.push(text(element.usage, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') out.push(`\n${element.usage.en}`);
  if (element.confusedWith) {
    out.push('');
    out.push(`**${msg('混同されやすい要素との違い', 'Commonly confused with', lang)}**`);
    out.push('');
    out.push(text(element.confusedWith, lang === 'both' ? 'ja' : lang));
    if (lang === 'both') out.push(`\n${element.confusedWith.en}`);
  }
  return out;
}

export function registerArchiMateReferenceTools(server: McpServer): void {
  server.registerTool(
    'list_archimate_elements',
    {
      title: 'List ArchiMate elements',
      description:
        'ArchiMate の要素を層ごとに一覧する。層を指定するとその層だけに絞り込む。要素の詳細は get_archimate_element。 / List ArchiMate elements grouped by layer; pass a layer to narrow it down. Use get_archimate_element for the detail.',
      inputSchema: {
        layer: freeTextSchema(
          '層 ID(motivation / strategy / business / application / technology / physical / implementation)',
          IDENTIFIER_LIMIT,
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ layer, lang }) => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText(
          [{ field: 'layer', value: layer, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier }],
          l,
        );
        if (tooLong) return tooLong;
        if (layer) {
          const found = findArchiMateLayer(layer);
          if (!found) {
            // 見つからなかった値はそのまま返さず短縮する(長い値の全文エコー防止)
            const shown = capInline(layer);
            return errorResult(
              msg(
                `層「${shown}」が見つかりません。利用可能: ${ARCHIMATE_LAYERS.map((x) => x.id).join(', ')}`,
                `Layer "${shown}" not found. Available: ${ARCHIMATE_LAYERS.map((x) => x.id).join(', ')}`,
                l,
              ),
            );
          }
          const items = elementsByLayer(found.id);
          const out: string[] = [`# ${text(found.name, l)}`, ''];
          out.push(text(found.purpose, l === 'both' ? 'ja' : l));
          out.push('');
          out.push(`| ID | ${msg('要素', 'Element', l)} | ${msg('何を表すか', 'Represents', l)} |`);
          out.push('| --- | --- | --- |');
          for (const element of items) {
            out.push(
              `| \`${element.id}\` | ${cell(text(element.name, l))} | ${cell(text(element.meaning, l === 'both' ? 'ja' : l))} |`,
            );
          }
          out.push('');
          out.push(
            msg(
              '詳細(実務での使い方・混同しやすい要素との違い)は `get_archimate_element` に ID を渡してください。',
              'Pass an id to `get_archimate_element` for usage notes and the elements it is commonly confused with.',
              l,
            ),
          );
          return textResult(out.join('\n'));
        }

        const out: string[] = [msg('# ArchiMate 要素一覧', '# ArchiMate elements', l), ''];
        for (const layerDef of ARCHIMATE_LAYERS) {
          const items = elementsByLayer(layerDef.id);
          if (items.length === 0) continue;
          out.push(`## ${text(layerDef.name, l)} (\`${layerDef.id}\`) — ${items.length}`);
          out.push('');
          out.push(items.map((e) => `\`${e.id}\` ${text(e.name, l === 'both' ? 'en' : l)}`).join(' · '));
          out.push('');
        }
        out.push(
          msg(
            '層を指定すると解説付きで一覧します(例: `layer: "business"`)。関係の引き方が妥当かは `validate_archimate_relationship`。',
            'Pass a layer to get the annotated list (e.g. `layer: "business"`). To check whether a relationship is sound, use `validate_archimate_relationship`.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `要素一覧の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to list elements: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  server.registerTool(
    'get_archimate_element',
    {
      title: 'Get an ArchiMate element',
      description:
        'ArchiMate 要素 1 件の「何を表すか」「実務での使い方」「混同されやすい要素との違い」を返す。名称・キーワードでも引ける。 / Return what one ArchiMate element represents, how to use it in practice, and which elements it is commonly confused with. Accepts ids, names, and keywords.',
      inputSchema: {
        element: freeTextSchema(
          '要素 ID または名称(例: "business-process", "Application Component", "能力")',
          IDENTIFIER_LIMIT,
        ),
        lang: langSchema,
      },
    },
    async ({ element, lang }) => {
      try {
        const l = lang as Lang;
        const tooLong = checkFreeText(
          [{ field: 'element', value: element, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier }],
          l,
        );
        if (tooLong) return tooLong;
        const query = element.trim();
        const direct = findArchiMateElement(query);
        if (direct) return textResult(renderElement(direct, l).join('\n'));

        // ID で引けない場合は名称・キーワードで候補を探す
        const lower = query.toLowerCase();
        const candidates = ARCHIMATE_ELEMENTS.filter((e) => {
          const haystack = `${e.name.ja} ${e.name.en} ${e.keywords.join(' ')}`.toLowerCase();
          return haystack.includes(lower) || e.keywords.some((k) => matchesKeyword(lower, k));
        });

        if (candidates.length === 1) return textResult(renderElement(candidates[0], l).join('\n'));
        if (candidates.length > 1) {
          const out: string[] = [
            msg(
              `「${capInline(query)}」に一致する要素が複数あります。`,
              `Several elements match "${capInline(query)}".`,
              l,
            ),
            '',
          ];
          for (const candidate of candidates.slice(0, 12)) {
            out.push(`- \`${candidate.id}\` — ${text(candidate.name, l)}`);
          }
          return textResult(out.join('\n'));
        }

        return errorResult(
          msg(
            `要素「${capInline(query)}」が見つかりません。層ごとの一覧は \`list_archimate_elements\` で確認できます。`,
            `Element "${capInline(query)}" not found. Use \`list_archimate_elements\` to browse them by layer.`,
            l,
          ),
        );
      } catch (error) {
        return errorResult(
          msg(
            `要素の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to get the element: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  server.registerTool(
    'list_archimate_relationships',
    {
      title: 'List ArchiMate relationships',
      description:
        'ArchiMate の関係の種類を「何を意味するか」「使いどころと間違えやすい点」付きで一覧する。個別の妥当性判定は validate_archimate_relationship。 / List the ArchiMate relationship types with what each one means and where people get them wrong. For a specific judgement use validate_archimate_relationship.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const out: string[] = [msg('# ArchiMate の関係', '# ArchiMate relationships', l), ''];
        const categories: { id: string; label: { ja: string; en: string } }[] = [
          { id: 'structural', label: { ja: '構造的な関係', en: 'Structural' } },
          { id: 'dependency', label: { ja: '依存の関係', en: 'Dependency' } },
          { id: 'dynamic', label: { ja: '動的な関係', en: 'Dynamic' } },
          { id: 'other', label: { ja: 'その他', en: 'Other' } },
        ];
        for (const category of categories) {
          const items = ARCHIMATE_RELATIONSHIPS.filter((r) => r.category === category.id);
          if (items.length === 0) continue;
          out.push(`## ${text(category.label, l)}`);
          out.push('');
          for (const relationship of items) {
            out.push(`### ${text(relationship.name, l)} — \`${relationship.id}\``);
            out.push('');
            out.push(text(relationship.meaning, l === 'both' ? 'ja' : l));
            if (l === 'both') out.push(`\n${relationship.meaning.en}`);
            out.push('');
            out.push(`> ${text(relationship.usage, l === 'both' ? 'ja' : l)}`);
            out.push('');
          }
        }
        out.push(
          msg(
            '個別の組み合わせが妥当かは `validate_archimate_relationship` に source / target / relationship を渡してください。',
            'To judge a specific combination, pass source / target / relationship to `validate_archimate_relationship`.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `関係一覧の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to list relationships: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );
}

/** 層 ID の一覧(テストと他モジュールの参照用) */
export const ARCHIMATE_LAYER_ID_LIST: ArchiMateLayerId[] = ARCHIMATE_LAYERS.map((l) => l.id);
