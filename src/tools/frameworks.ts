/**
 * 周辺フレームワーク・参照ガイドのツール / Adjacent framework reference tools.
 *
 * TOGAF だけで全部やろうとすると必ず詰まる。ここでは「いつ TOGAF を使い、
 * いつ別の道具に持ち替えるか」を、表と優先順位で即断できる形で返す。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findPhase, matchesKeyword, text, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  CATEGORY_LABELS,
  FRAMEWORKS,
  FRAMEWORK_CATEGORIES,
  TOGAF_BASELINE,
  findFramework,
  frameworksForPhase,
  recommendRank,
  type Framework,
  type FrameworkCategory,
} from '../knowledge/frameworks.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

// ---------------------------------------------------------------- 小さな道具

/** 表のセルに入れられる形にする(改行と縦棒を潰す) */
function cell(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * 表の見出し・セル用のラベル。
 * msg() は both のとき改行で連結するため、そのまま表に入れると行が壊れる。
 */
function label(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 見出しに入れる自由記述を 1 行に潰す(改行・見出し記号で文書構造が壊れるのを防ぐ) */
function inlineOneLine(s: string, max = 120): string {
  const flat = s.replace(/\s+/g, ' ').replace(/^[#>\-*\s]+/, '').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 1 文目だけ取り出す(表の 1 行に収めるため) */
function firstSentence(s: string): string {
  const ja = s.indexOf('。');
  const en = s.indexOf('. ');
  const candidates = [ja >= 0 ? ja + 1 : -1, en >= 0 ? en + 1 : -1].filter((i) => i > 0);
  if (candidates.length === 0) return s;
  return s.slice(0, Math.min(...candidates));
}

/** Bilingual の 1 文目を指定言語で返す */
function oneLiner(value: Bilingual, lang: Lang): string {
  return text({ ja: firstSentence(value.ja), en: firstSentence(value.en) }, lang);
}

/** フェーズ ID 群を表示用コードに変換する(未知の ID はそのまま出す) */
function phaseCodes(ids: string[]): string {
  if (ids.length === 0) return '—';
  return ids.map((id) => findPhase(id)?.code ?? id).join(', ');
}

/** フェーズ ID 群を「コード: 名称」の箇条書きにする */
function phaseLines(ids: string[], lang: Lang): string[] {
  return ids.map((id) => {
    const p = findPhase(id);
    if (!p) return `- \`${id}\``;
    return `- **${p.code}** \`${p.id}\` — ${text(p.name, lang)}`;
  });
}

/** 日英が同じ名称は both でも 1 回だけ出す(「ArchiMate / ArchiMate」を避ける) */
function nameOf(f: Framework, lang: Lang): string {
  return f.name.ja === f.name.en ? f.name.ja : text(f.name, lang);
}

/** 分類ラベル */
function categoryLabel(category: FrameworkCategory, lang: Lang): string {
  return text(CATEGORY_LABELS[category], lang);
}

/** 例外を errorResult に落とす */
function toError(e: unknown, lang: Lang): ReturnType<typeof errorResult> {
  const detail = e instanceof Error ? e.message : String(e);
  return errorResult(msg(`処理に失敗しました: ${detail}`, `Failed to process the request: ${detail}`, lang));
}

/** 見つからないときの候補提示 */
function notFound(input: string, lang: Lang): ReturnType<typeof errorResult> {
  const ids = FRAMEWORKS.map((f) => `\`${f.id}\``).join(', ');
  return errorResult(
    msg(
      `フレームワーク「${input}」が見つかりません。利用可能な ID: ${ids}`,
      `Framework "${input}" not found. Available ids: ${ids}`,
      lang,
    ),
  );
}

/**
 * 分類ごとの当たり判定キーワード。
 * 具体名を出さずに「やりたいこと」だけ書かれた相談を拾うための保険。
 * 分類の全メンバーに当てはまる語だけを入れること(1 件だけに効く語は各フレームワークの
 * keywords 側に書く。ここに混ぜると、無関係な同分類のものまで釣れてノイズになる)。
 */
const CATEGORY_HINTS: Record<FrameworkCategory, string[]> = {
  modeling: ['図', '作図', '描く', '可視化', '記法', 'diagram', 'draw', 'notation', 'visualize', 'visualise'],
  method: ['設計手法', '分割', 'decompose', '設計方針'],
  'business-architecture': ['事業', '経営', '戦略', 'strategy', '投資判断', '事業構造'],
  delivery: ['開発体制', 'デリバリ', 'delivery', 'スケール', '大規模開発'],
  operations: ['運用', '保守', '監視', 'monitoring', 'operations'],
  governance: ['ガバナンス', 'governance', '統制', '承認プロセス'],
  // データ/セキュリティ/クラウドは各フレームワーク固有の keywords 側で拾う
  domain: [],
};

/**
 * 日本語キーワードは部分一致で判定されるため、より長い別語の一部として現れる語は誤爆する。
 * ここに挙げた「囲い語」を外した上でもう一度当たるかを見て、単なる部分一致を落とす。
 * 例: 「アーキテクチャレビュー」「インタビュー」で 'ビュー' が当たってしまうのを防ぐ。
 */
const SUBSTRING_TRAPS: Record<string, string[]> = {
  ビュー: ['レビュー', 'インタビュー'],
};

/** キーワード一致(日本語の部分一致による誤爆を除く) */
function hits(haystackLower: string, keyword: string): boolean {
  if (!matchesKeyword(haystackLower, keyword)) return false;
  const traps = SUBSTRING_TRAPS[keyword];
  if (!traps) return true;
  let masked = haystackLower;
  for (const t of traps) masked = masked.split(t.toLowerCase()).join(' ');
  return matchesKeyword(masked, keyword);
}

interface Scored {
  fw: Framework;
  score: number;
  matched: string[];
  phaseHit: boolean;
  /** 分類の当たりだけで拾われた(具体的な語の一致は無い) */
  hintOnly: boolean;
}

/** 相談内容とフェーズからフレームワークを採点する */
function scoreFrameworks(need: string, phaseId: string | undefined, limit: number): Scored[] {
  const haystack = need.toLowerCase();
  const keywordHits: Scored[] = [];
  const hintHits: Scored[] = [];

  for (const fw of FRAMEWORKS) {
    const matched = fw.keywords.filter((k) => hits(haystack, k));
    const hintHit = CATEGORY_HINTS[fw.category].some((h) => hits(haystack, h));
    // フェーズ指定だけで挙げると全部出てしまうので、語か分類のどちらかの当たりを必須にする
    if (matched.length === 0 && !hintHit) continue;

    let score = matched.length * 10;
    // 長いキーワードほど具体的とみなして加点(短い一般語で上位に来るのを防ぐ)
    score += matched.reduce((acc, k) => acc + Math.min(k.length, 12), 0);
    if (hintHit) score += 6;

    const phaseHit = phaseId !== undefined && fw.phaseIds.includes(phaseId);
    if (phaseHit) score += 8;

    const entry: Scored = { fw, score, matched, phaseHit, hintOnly: matched.length === 0 };
    (entry.hintOnly ? hintHits : keywordHits).push(entry);
  }

  // 同点は「実務で出番が多い順」で割る(ID のアルファベット順で決めると助言として無意味になる)
  const byScore = (a: Scored, b: Scored): number =>
    b.score - a.score || recommendRank(a.fw.id) - recommendRank(b.fw.id);
  keywordHits.sort(byScore);
  hintHits.sort(byScore);

  // 具体的な語で当たったものを常に上に置き、分類だけの当たりは補欠として最大 2 件まで
  return [...keywordHits, ...hintHits.slice(0, 2)].slice(0, limit);
}

// ------------------------------------------------------------------ ツール群

export function registerFrameworkTools(server: McpServer): void {
  server.registerTool(
    'list_frameworks',
    {
      title: 'List adjacent frameworks',
      description:
        'TOGAF と併用する周辺フレームワーク(ArchiMate / BIZBOK / C4 / Wardley / BPMN / ITIL / NIST CSF など)を分類別に一覧する。 / List the frameworks worth pairing with TOGAF, grouped by category.',
      inputSchema: {
        category: z
          .enum(['modeling', 'method', 'business-architecture', 'delivery', 'operations', 'governance', 'domain'])
          .optional()
          .describe('分類で絞り込む / Filter by category'),
        phase: z
          .string()
          .optional()
          .describe('ADM フェーズ ID で絞り込む。例: "b", "d" / Filter by ADM phase id'),
        lang: langSchema,
      },
    },
    async ({ category, phase, lang }) => {
      try {
        const l = lang as Lang;
        let items = FRAMEWORKS;

        if (category) items = items.filter((f) => f.category === category);
        if (phase) {
          const p = findPhase(phase);
          if (!p) {
            return errorResult(
              msg(`フェーズ「${phase}」が見つかりません。`, `Phase "${phase}" not found.`, l),
            );
          }
          const inPhase = new Set(frameworksForPhase(p.id).map((f) => f.id));
          items = items.filter((f) => inPhase.has(f.id));
        }

        const lines: string[] = [];
        lines.push(msg('# 周辺フレームワーク・カタログ', '# Adjacent framework catalogue', l));
        lines.push('');
        lines.push(
          msg(
            'TOGAF は「進め方」を決める道具。記法・見積り・運用の具体は外から持ってくる。',
            'TOGAF decides how you proceed. Notation, sizing, and operations come from outside it.',
            l,
          ),
        );
        lines.push('');

        if (items.length === 0) {
          const covered = Array.from(new Set(FRAMEWORKS.flatMap((f) => f.phaseIds))).sort(
            (a, b) => (findPhase(a)?.order ?? 99) - (findPhase(b)?.order ?? 99),
          );
          lines.push(msg('**該当なし。**', '**No matching frameworks.**', l));
          lines.push('');
          lines.push(
            msg(
              `この条件では併用すべき道具は無い。ADM の技法だけで進めてよい。カタログが道具を挙げているフェーズは ${phaseCodes(covered)}。分類を外す・別のフェーズを指定して再実行するか、やりたいことを文章で \`recommend_frameworks\` に渡す方が早い。`,
              `Nothing to pair under these filters — the ADM's own techniques are enough. The phases this catalogue does cover are ${phaseCodes(covered)}. Re-run without the category filter or with another phase, or describe the goal to \`recommend_frameworks\` instead.`,
              l,
            ),
          );
          return textResult(lines.join('\n'));
        }

        for (const cat of FRAMEWORK_CATEGORIES) {
          const group = items.filter((f) => f.category === cat);
          if (group.length === 0) continue;
          lines.push(`## ${categoryLabel(cat, l)}`);
          lines.push('');
          lines.push(
            `| ID | ${label('名称', 'Name', l)} | ${label('策定主体', 'Owner', l)} | ${label('併用フェーズ', 'ADM phases', l)} | ${label('何をする道具か', 'What it is for', l)} |`,
          );
          lines.push('| --- | --- | --- | :-: | --- |');
          for (const f of group) {
            lines.push(
              `| \`${f.id}\` | ${cell(nameOf(f, l))} | ${cell(text(f.owner, l))} | ${phaseCodes(f.phaseIds)} | ${cell(oneLiner(f.summary, l))} |`,
            );
          }
          lines.push('');
        }

        lines.push('---');
        lines.push('');
        lines.push(
          msg(
            `収録 ${items.length} 件。詳細は \`get_framework\`、目的から選ぶなら \`recommend_frameworks\`、TOGAF との棲み分けは \`compare_with_togaf\` を使う。`,
            `${items.length} entries. Use \`get_framework\` for details, \`recommend_frameworks\` to pick by goal, and \`compare_with_togaf\` for the split of responsibilities.`,
            l,
          ),
        );
        return textResult(lines.join('\n'));
      } catch (e) {
        return toError(e, lang as Lang);
      }
    },
  );

  server.registerTool(
    'get_framework',
    {
      title: 'Get an adjacent framework',
      description:
        'フレームワーク 1 件の概要・TOGAF より得意なこと・限界・ADM との組み合わせ方・入手性を返す。 / Return summary, strengths over TOGAF, honest limits, how to combine it with the ADM, and availability.',
      inputSchema: {
        framework: z
          .string()
          .min(1)
          .describe('フレームワーク ID または名称。例: "archimate", "BIZBOK", "c4-model"'),
        lang: langSchema,
      },
    },
    async ({ framework, lang }) => {
      try {
        const l = lang as Lang;
        const f = findFramework(framework);
        if (!f) return notFound(framework, l);

        const lines: string[] = [];
        lines.push(`# ${nameOf(f, l)} — \`${f.id}\``);
        lines.push('');
        lines.push(`| ${label('項目', 'Item', l)} | ${label('内容', 'Value', l)} |`);
        lines.push('| --- | --- |');
        lines.push(`| ${label('分類', 'Category', l)} | ${cell(categoryLabel(f.category, l))} |`);
        lines.push(`| ${label('策定・管理主体', 'Owner', l)} | ${cell(text(f.owner, l))} |`);
        lines.push(`| ${label('併用が効く ADM フェーズ', 'ADM phases', l)} | ${phaseCodes(f.phaseIds)} |`);
        lines.push(`| ${label('入手性・ライセンス', 'Availability', l)} | ${cell(text(f.availability, l))} |`);
        lines.push('');

        lines.push(`## ${msg('何をする道具か', 'What it is for', l)}`);
        lines.push('');
        lines.push(text(f.summary, l === 'both' ? 'ja' : l));
        if (l === 'both') {
          lines.push('');
          lines.push(f.summary.en);
        }
        lines.push('');

        lines.push(`## ${msg('TOGAF より得意なこと', 'Where it beats TOGAF', l)}`);
        lines.push('');
        for (const s of f.strengths) lines.push(`- ${text(s, l)}`);
        lines.push('');

        lines.push(`## ${msg('限界・使わない方がよい場面', 'Limits and when not to use it', l)}`);
        lines.push('');
        for (const s of f.limits) lines.push(`- ${text(s, l)}`);
        lines.push('');

        lines.push(`## ${msg('ADM との組み合わせ方', 'How to combine it with the ADM', l)}`);
        lines.push('');
        lines.push(text(f.combineWithAdm, l === 'both' ? 'ja' : l));
        if (l === 'both') {
          lines.push('');
          lines.push(f.combineWithAdm.en);
        }
        lines.push('');
        lines.push(...phaseLines(f.phaseIds, l));
        lines.push('');

        lines.push('---');
        lines.push('');
        lines.push(
          msg(
            `次の一手: \`compare_with_togaf\` に \`${f.id}\` を渡すと棲み分け表が出る。フェーズ側の詳細は \`get_adm_phase\`。`,
            `Next: pass \`${f.id}\` to \`compare_with_togaf\` for the side-by-side split, and use \`get_adm_phase\` for the phase itself.`,
            l,
          ),
        );
        return textResult(lines.join('\n'));
      } catch (e) {
        return toError(e, lang as Lang);
      }
    },
  );

  server.registerTool(
    'recommend_frameworks',
    {
      title: 'Recommend frameworks for a need',
      description:
        'やりたいことを自由記述で渡すと、TOGAF のどこを使い、どの周辺フレームワークを併用すべきかを優先順位付きで返す。該当が無ければ「TOGAF だけで足りる」と正直に返す。 / Given a free-text need, return which part of TOGAF to use and which adjacent frameworks to pair with it, ranked. Says so plainly when TOGAF alone is enough.',
      inputSchema: {
        need: z
          .string()
          .min(1)
          .describe('やりたいこと・困っていること。例: "業務プロセスを部門横断で可視化したい"'),
        phase: z
          .string()
          .optional()
          .describe('現在の ADM フェーズ ID(分かっていれば) / Current ADM phase id, if known'),
        limit: z.number().int().min(1).max(10).default(4).describe('最大提示件数 / Maximum recommendations'),
        lang: langSchema,
      },
    },
    async ({ need, phase, limit, lang }) => {
      try {
        const l = lang as Lang;
        let phaseId: string | undefined;
        if (phase) {
          const p = findPhase(phase);
          if (!p) {
            return errorResult(
              msg(`フェーズ「${phase}」が見つかりません。`, `Phase "${phase}" not found.`, l),
            );
          }
          phaseId = p.id;
        }

        const scored = scoreFrameworks(need, phaseId, limit);

        const lines: string[] = [];
        const needLine = inlineOneLine(need);
        lines.push(msg(`# 道具の選定: ${needLine}`, `# Tool selection: ${needLine}`, l));
        lines.push('');

        // TOGAF 側の主軸を先に決める(指定フェーズ、無ければ候補群の最頻フェーズ)
        let anchorId = phaseId;
        if (!anchorId && scored.length > 0) {
          const counts = new Map<string, number>();
          for (const s of scored) {
            for (const id of s.fw.phaseIds) counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          let best = '';
          let bestCount = 0;
          for (const [id, c] of counts) {
            if (c > bestCount) {
              best = id;
              bestCount = c;
            }
          }
          anchorId = best.length > 0 ? best : undefined;
        }

        lines.push(`## 1. ${msg('TOGAF のどこを使うか', 'Which part of TOGAF to use', l)}`);
        lines.push('');
        const anchor = anchorId ? findPhase(anchorId) : undefined;
        if (anchor) {
          lines.push(`- **${anchor.code}** \`${anchor.id}\` — ${text(anchor.name, l)}`);
          lines.push(`  - ${text(anchor.tagline, l)}`);
          lines.push(
            `  - ${msg(`手順は \`get_adm_phase\` に \`${anchor.id}\` を渡す。`, `Run \`get_adm_phase\` with \`${anchor.id}\` for the steps.`, l)}`,
          );
        } else {
          lines.push(
            msg(
              'フェーズを特定できなかった。`search_togaf` で関連するフェーズ・技法を先に当たること。',
              'Could not pin a phase. Start with `search_togaf` to locate the relevant phase and technique.',
              l,
            ),
          );
        }
        lines.push('');

        lines.push(`## 2. ${msg('併用する道具', 'What to pair it with', l)}`);
        lines.push('');

        if (scored.length === 0) {
          lines.push(
            msg(
              '**この相談に、外から持ち込むべき道具は見当たらない。TOGAF の ADM と技法だけで足りる。**',
              '**Nothing here needs an outside tool. The ADM and its own techniques cover this.**',
              l,
            ),
          );
          lines.push('');
          lines.push(
            msg(
              '- `search_togaf` でフェーズ・技法・成果物を横断検索する\n- `list_techniques` に該当フェーズを渡して技法を絞る\n- 道具を増やす前に、まず成果物の雛形(`generate_deliverable_template`)で書き始める方が早い',
              '- Use `search_togaf` across phases, techniques, and deliverables\n- Pass the phase to `list_techniques` to narrow the technique\n- Before adding a tool, start writing: `generate_deliverable_template` is usually faster',
              l,
            ),
          );
          return textResult(lines.join('\n'));
        }

        lines.push(
          `| ${label('順位', 'Rank', l)} | ${label('道具', 'Tool', l)} | ${label('分類', 'Category', l)} | ${label('フェーズ一致', 'Phase fit', l)} | ${label('効く理由', 'Why it fits', l)} |`,
        );
        lines.push('| :-: | --- | --- | :-: | --- |');
        scored.forEach((s, i) => {
          const why = s.matched.length > 0
            ? s.matched.slice(0, 4).map((k) => `\`${k}\``).join(' ')
            : label('分類が一致', 'category match', l);
          lines.push(
            `| ${i + 1} | ${cell(nameOf(s.fw, l))} \`${s.fw.id}\` | ${cell(categoryLabel(s.fw.category, l))} | ${s.phaseHit ? '◎' : phaseCodes(s.fw.phaseIds)} | ${cell(why)} |`,
          );
        });
        lines.push('');

        lines.push(`## 3. ${msg('使い方と注意', 'How to use each, and the catch', l)}`);
        lines.push('');
        for (const s of scored) {
          lines.push(`### ${nameOf(s.fw, l)} — \`${s.fw.id}\``);
          lines.push('');
          lines.push(`- ${msg('組み合わせ方', 'How to combine', l)}: ${text(s.fw.combineWithAdm, l)}`);
          const limit0 = s.fw.limits[0];
          if (limit0) lines.push(`- ${msg('注意', 'Watch out', l)}: ${text(limit0, l)}`);
          lines.push(`- ${msg('入手性', 'Availability', l)}: ${text(s.fw.availability, l)}`);
          lines.push('');
        }

        lines.push('---');
        lines.push('');
        lines.push(
          msg(
            '道具は増やすほど維持コストが上がる。上の 1 位だけ導入し、足りないと分かってから 2 位を足すこと。詳細は `get_framework`、TOGAF との棲み分けは `compare_with_togaf`。',
            'Every added tool costs maintenance. Adopt the top entry only, and add the second once you can name what is missing. Use `get_framework` for detail and `compare_with_togaf` for the split.',
            l,
          ),
        );
        return textResult(lines.join('\n'));
      } catch (e) {
        return toError(e, lang as Lang);
      }
    },
  );

  server.registerTool(
    'compare_with_togaf',
    {
      title: 'Compare a framework with TOGAF',
      description:
        '指定したフレームワークと TOGAF の棲み分けを、目的・粒度・成果物・学習コスト・併用時の注意の 5 観点で表にして返す。 / Return a side-by-side table of TOGAF versus the named framework across purpose, granularity, artifacts, learning cost, and what to watch when combining them.',
      inputSchema: {
        framework: z.string().min(1).describe('フレームワーク ID または名称。例: "archimate", "safe"'),
        lang: langSchema,
      },
    },
    async ({ framework, lang }) => {
      try {
        const l = lang as Lang;
        const f = findFramework(framework);
        if (!f) return notFound(framework, l);

        const fallback: Bilingual = {
          ja: '(この道具については未整理。`get_framework` の本文を参照)',
          en: '(not tabulated for this tool; see the body of `get_framework`)',
        };
        const granularity = f.comparison?.granularity ?? fallback;
        const artifacts = f.comparison?.artifacts ?? fallback;
        const learning = f.comparison?.learningCurve ?? fallback;
        const caution = f.limits[0] ?? fallback;

        const lines: string[] = [];
        lines.push(msg(`# TOGAF 10 と ${text(f.name, 'ja')} の棲み分け`, `# TOGAF 10 versus ${text(f.name, 'en')}`, l));
        lines.push('');
        lines.push(
          `| ${label('観点', 'Aspect', l)} | TOGAF 10 (ADM) | ${cell(nameOf(f, l))} |`,
        );
        lines.push('| --- | --- | --- |');
        lines.push(
          `| ${label('目的', 'Purpose', l)} | ${cell(text(TOGAF_BASELINE.purpose, l))} | ${cell(oneLiner(f.summary, l))} |`,
        );
        lines.push(
          `| ${label('粒度', 'Granularity', l)} | ${cell(text(TOGAF_BASELINE.granularity, l))} | ${cell(text(granularity, l))} |`,
        );
        lines.push(
          `| ${label('成果物', 'Artifacts', l)} | ${cell(text(TOGAF_BASELINE.artifacts, l))} | ${cell(text(artifacts, l))} |`,
        );
        lines.push(
          `| ${label('学習コスト', 'Learning cost', l)} | ${cell(text(TOGAF_BASELINE.learningCurve, l))} | ${cell(text(learning, l))} |`,
        );
        lines.push(
          `| ${label('併用時の注意', 'Watch out when combining', l)} | ${cell(text(TOGAF_BASELINE.caution, l))} | ${cell(text(caution, l))} |`,
        );
        lines.push('');

        lines.push(`## ${msg('結論: どう使い分けるか', 'Verdict: how to split the work', l)}`);
        lines.push('');
        lines.push(text(f.combineWithAdm, l === 'both' ? 'ja' : l));
        if (l === 'both') {
          lines.push('');
          lines.push(f.combineWithAdm.en);
        }
        lines.push('');
        lines.push(`### ${msg('併用が効く ADM フェーズ', 'ADM phases where the pairing pays', l)}`);
        lines.push('');
        lines.push(...phaseLines(f.phaseIds, l));
        lines.push('');

        lines.push(`### ${msg('置き換えではない点', 'It is not a replacement', l)}`);
        lines.push('');
        for (const s of f.limits) lines.push(`- ${text(s, l)}`);
        lines.push('');
        lines.push(
          msg(
            `${text(f.name, 'ja')} を採用しても、ADM が担う「誰の承認で、いつ次に進むか」は代替されない。ガバナンスの経路は TOGAF 側に残すこと。`,
            `Adopting ${text(f.name, 'en')} does not replace what the ADM carries: whose approval moves the work to the next step. Keep the governance path on the TOGAF side.`,
            l,
          ),
        );
        return textResult(lines.join('\n'));
      } catch (e) {
        return toError(e, lang as Lang);
      }
    },
  );
}
