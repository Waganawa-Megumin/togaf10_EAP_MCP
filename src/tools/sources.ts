/**
 * 一次情報への導線と、知識の鮮度の明示 / Provenance, freshness, and links to primary sources.
 *
 * このサーバーはネットワークにアクセスしない。知識ベースは静的で、いつか必ず古くなる。
 * 一方で **ホスト(Claude Code / Claude Desktop)は WebFetch / WebSearch を持っている**ので、
 * 「サーバーが取りに行く」のではなく「ホストにどこを見ればよいかを正確に教える」のが正しい役割分担になる。
 *
 * 参照(閲覧・リンク)は各標準とも制限していない。制限されているのは複製・再配布であり、
 * このサーバーはそれを行わない(名称・構造という事実 + 独自解説のみ)。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { matchesKeyword, text, type Bilingual, type Lang } from '../knowledge/index.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/**
 * 知識ベースが依拠している版と、最後に一次情報と突き合わせた日。
 * **内容を更新したらこの日付も更新すること。** 古い日付を放置する方が、
 * 日付が無いより有害(利用者が最新だと誤認する)。
 */
export const KNOWLEDGE_BASELINE = {
  togafEdition: 'TOGAF Standard, 10th Edition',
  archimateVersion: 'ArchiMate 3.x',
  /** 一次情報の記述(構造・名称)と突き合わせた日 */
  lastVerified: '2026-08-14',
} as const;

interface SourceEntry {
  id: string;
  name: Bilingual;
  owner: Bilingual;
  /** 一次情報の URL(閲覧用。転載はしない) */
  urls: { label: Bilingual; url: string }[];
  /** このサーバーが持っている範囲と、持っていない範囲 */
  coverage: Bilingual;
  /** 一次情報を見に行くべき場面 */
  whenToCheck: Bilingual[];
  keywords: string[];
}

const SOURCES: SourceEntry[] = [
  {
    id: 'togaf',
    name: { ja: 'TOGAF 標準', en: 'The TOGAF Standard' },
    owner: { ja: 'The Open Group', en: 'The Open Group' },
    urls: [
      {
        label: { ja: 'オンライン版(閲覧無料・ライセンス不要)', en: 'Online edition (free to view, no licence)' },
        url: 'https://pubs.opengroup.org/togaf-standard/',
      },
      {
        label: { ja: 'ダウンロード・ライセンス', en: 'Downloads and licensing' },
        url: 'https://www.opengroup.org/togaf',
      },
      {
        label: { ja: 'TOGAF ライブラリ(ガイド類)', en: 'TOGAF Library (guides)' },
        url: 'https://www.opengroup.org/togaf-library',
      },
    ],
    coverage: {
      ja:
        'このサーバーが持つのは ADM 10 フェーズの構成、技法・成果物の名称、および実務上の使い方の独自解説。' +
        '標準本文の定義・図・チェックリストの原文は持っていない。',
      en:
        'This server holds the ADM phase structure, technique and deliverable names, and original practitioner commentary. ' +
        'It does not hold the standard\'s own definitions, figures, or checklists.',
    },
    whenToCheck: [
      { ja: '版が上がった可能性があるとき(このサーバーの知識は下記の確認日時点)', en: 'When a newer edition may have shipped (this server is current as of the date below)' },
      { ja: '成果物の正式な記載項目を、標準の表現どおりに確認したいとき', en: 'When you need a deliverable\'s formal contents in the standard\'s own wording' },
      { ja: '認定試験の出題範囲など、正確な原文が要る場面', en: 'When exact source wording matters, such as certification scope' },
      { ja: 'このサーバーの説明に疑問を持ったとき(疑ってよい。独自解釈が入っている)', en: 'When you doubt something here — you should; the commentary is interpretation' },
    ],
    keywords: ['togaf', 'adm', 'アーキテクチャ開発手法', '標準', 'phase', 'フェーズ', '成果物', 'deliverable'],
  },
  {
    id: 'archimate',
    name: { ja: 'ArchiMate 仕様', en: 'The ArchiMate Specification' },
    owner: { ja: 'The Open Group', en: 'The Open Group' },
    urls: [
      { label: { ja: '仕様(オンライン)', en: 'Specification (online)' }, url: 'https://pubs.opengroup.org/architecture/archimate3-doc/' },
      { label: { ja: 'Archi(無償のモデリングツール)', en: 'Archi (free modelling tool)' }, url: 'https://www.archimatetool.com/' },
    ],
    coverage: {
      ja:
        '層・要素・関係の名称と、実務での使い分け・混同しやすい点の独自解説を持つ。' +
        '**許可される関係の網羅表(derivation rules を含む)は持っていない。**' +
        'このサーバーの関係判定は意味論からの助言であり、仕様準拠の検証ではない。',
      en:
        'Holds layer/element/relationship names plus original guidance on picking between them. ' +
        '**It does not hold the permitted-relationship tables or derivation rules.** ' +
        'The relationship check here is semantic advice, not conformance validation.',
    },
    whenToCheck: [
      { ja: '関係が仕様上そもそも許可されているかを厳密に確認したいとき(このサーバーでは判定できない)', en: 'To confirm a relationship is permitted at all — this server cannot tell you that' },
      { ja: 'ツールが受け付けない記法に遭遇したとき', en: 'When your modelling tool rejects a notation' },
    ],
    keywords: ['archimate', 'アーキメイト', '関係', 'relationship', 'viewpoint', 'ビューポイント', 'archi'],
  },
  {
    id: 'sabsa',
    name: { ja: 'SABSA', en: 'SABSA' },
    owner: { ja: 'The SABSA Institute', en: 'The SABSA Institute' },
    urls: [{ label: { ja: '公式サイト', en: 'Official site' }, url: 'https://sabsa.org/' }],
    coverage: {
      ja: '6 層 × 6 問いのマトリクス構造と、ADM との対応付けの独自解説を持つ。詳細な属性プロファイルや手法本体は持っていない。',
      en: 'Holds the six-layer by six-question matrix structure and original mapping guidance to the ADM. It does not hold the attribute profiles or the method itself.',
    },
    whenToCheck: [
      { ja: '属性駆動のリスク評価を正式な手順で行うとき', en: 'When running attribute-driven risk analysis by the book' },
      { ja: '認定コースの内容と突き合わせるとき', en: 'When aligning with the certification syllabus' },
    ],
    keywords: ['sabsa', 'セキュリティアーキテクチャ', 'security architecture'],
  },
  {
    id: 'bizbok',
    name: { ja: 'BIZBOK Guide', en: 'BIZBOK Guide' },
    owner: { ja: 'Business Architecture Guild', en: 'Business Architecture Guild' },
    urls: [{ label: { ja: '公式サイト', en: 'Official site' }, url: 'https://www.businessarchitectureguild.org/' }],
    coverage: {
      ja: '能力マップ・バリューストリームの作り方は独自の手順として持つ。BIZBOK の参照モデルや業界別の能力一覧は持っていない。',
      en: 'Holds original method guidance for capability maps and value streams. It does not hold BIZBOK reference models or industry capability catalogs.',
    },
    whenToCheck: [
      { ja: '業界標準の能力モデルを流用したいとき', en: 'When you want an industry-standard capability model to start from' },
    ],
    keywords: ['bizbok', 'business architecture guild', 'ビジネスアーキテクチャ', '能力マップ'],
  },
  {
    id: 'c4',
    name: { ja: 'C4 モデル', en: 'The C4 model' },
    owner: { ja: 'Simon Brown', en: 'Simon Brown' },
    urls: [{ label: { ja: '公式サイト', en: 'Official site' }, url: 'https://c4model.com/' }],
    coverage: {
      ja: '4 階層の考え方と ArchiMate との使い分けを持つ。記法の細部は一次情報が最短。',
      en: 'Holds the four-level idea and how it sits next to ArchiMate. For notation details the source site is quicker.',
    },
    whenToCheck: [{ ja: '記法や表記ルールの細部', en: 'Notation details' }],
    keywords: ['c4', 'c4model', 'コンテキスト図'],
  },
  {
    id: 'nist-csf',
    name: { ja: 'NIST Cybersecurity Framework', en: 'NIST Cybersecurity Framework' },
    owner: { ja: 'NIST(米国立標準技術研究所)', en: 'NIST' },
    urls: [{ label: { ja: 'CSF', en: 'CSF' }, url: 'https://www.nist.gov/cyberframework' }],
    coverage: {
      ja: '名称と位置づけのみ。カテゴリ・サブカテゴリの一覧は持っていない。',
      en: 'Name and positioning only; the category/subcategory catalog is not included.',
    },
    whenToCheck: [{ ja: '統制項目に紐付けた説明が要るとき', en: 'When you need to map to specific controls' }],
    keywords: ['nist', 'csf', 'サイバーセキュリティフレームワーク'],
  },
  {
    id: 'meti-guideline',
    name: { ja: 'サイバーセキュリティ経営ガイドライン', en: 'Cybersecurity Management Guidelines (METI, Japan)' },
    owner: { ja: '経済産業省 / IPA', en: 'METI / IPA, Japan' },
    urls: [
      { label: { ja: '経済産業省', en: 'METI' }, url: 'https://www.meti.go.jp/policy/netsecurity/mng_guide.html' },
      { label: { ja: 'IPA', en: 'IPA' }, url: 'https://www.ipa.go.jp/security/economics/csm-guideline.html' },
    ],
    coverage: {
      ja: '日本で経営層向けの説明に使われることが多い。このサーバーは内容を持っていないため、経営報告に使うなら一次情報を参照すること。',
      en: 'Widely used in Japan for board-level reporting. This server does not carry its content; consult the source when reporting to executives.',
    },
    whenToCheck: [
      { ja: '日本の経営層・監査に対して、国内で通りの良い枠組みで説明したいとき', en: 'When you need a framing that lands with Japanese executives and auditors' },
    ],
    keywords: ['経済産業省', 'meti', 'ipa', '経営ガイドライン', 'サイバーセキュリティ経営'],
  },
];

function renderSource(entry: SourceEntry, lang: Lang): string[] {
  const out: string[] = [];
  out.push(`### ${text(entry.name, lang)}`);
  out.push('');
  out.push(`- ${msg('管理主体', 'Maintained by', lang)}: ${text(entry.owner, lang)}`);
  for (const link of entry.urls) out.push(`- ${text(link.label, lang)}: ${link.url}`);
  out.push('');
  out.push(`**${msg('このサーバーが持っている範囲', 'What this server holds', lang)}**`);
  out.push('');
  out.push(text(entry.coverage, lang === 'both' ? 'ja' : lang));
  if (lang === 'both') out.push(`\n${entry.coverage.en}`);
  out.push('');
  out.push(`**${msg('一次情報を見に行くべき場面', 'When to go to the source', lang)}**`);
  out.push('');
  for (const item of entry.whenToCheck) out.push(`- ${text(item, lang)}`);
  return out;
}

function hostHint(lang: Lang): string {
  return msg(
    '**このサーバーはネットワークにアクセスしません。** 上記 URL の内容確認は、クライアント側の Web 取得機能で行ってください' +
      '(Claude Code / Claude Desktop なら、URL をそのまま渡せば読み取れます)。' +
      '確認した結果このサーバーの記述が古い・誤っていた場合は、知識ベース側の修正が必要です。',
    '**This server never accesses the network.** Fetch the URLs above with your client\'s web capability ' +
      '(in Claude Code / Claude Desktop, just hand it the URL). ' +
      'If what you find contradicts this server, the knowledge base is what needs fixing.',
    lang,
  );
}

export function registerSourceTools(server: McpServer): void {
  server.registerTool(
    'about_knowledge',
    {
      title: 'What this knowledge is based on, and how fresh it is',
      description:
        'この知識ベースが何に基づき、いつ一次情報と突き合わせ、何を持っていないか。原文が必要なときの参照先も示す。 / ' +
        'What this knowledge base is based on, when it was last checked against the primary sources, what it lacks, and where to find authoritative wording.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const out: string[] = [];
        out.push(msg('# この知識ベースについて', '# About this knowledge base', l));
        out.push('');
        out.push(`- ${msg('依拠している版', 'Based on', l)}: ${KNOWLEDGE_BASELINE.togafEdition} / ${KNOWLEDGE_BASELINE.archimateVersion}`);
        out.push(`- ${msg('一次情報と最後に突き合わせた日', 'Last checked against the sources', l)}: **${KNOWLEDGE_BASELINE.lastVerified}**`);
        out.push('');
        out.push(
          msg(
            'この日付より後に版が上がっている可能性があります。**重要な判断に使う前に一次情報を確認してください。**',
            'A newer edition may have shipped since that date. **Check the source before betting a decision on anything here.**',
            l,
          ),
        );
        out.push('');
        out.push(msg('## 何を持ち、何を持っていないか', '## What is and is not included', l));
        out.push('');
        out.push(
          msg(
            '収録しているのは、**名称・構成・章立てといった事実情報**と、**実務でどう使うか・どこで間違えるかという独自の解説**だけです。' +
              '各標準の定義文・図・チェックリストの原文は収録していません(複製が許諾されていないため)。' +
              'したがって「標準に何と書いてあるか」を正確に知りたい場合、このサーバーは答えられません。一次情報を見てください。',
            'Only factual structure (names, phases, chapter organisation) plus original commentary on how to use it and where people go wrong. ' +
              'None of the standards\' own definitions, figures, or checklists are reproduced, because that is not licensed. ' +
              'So if you need to know what the standard literally says, this server cannot tell you — go to the source.',
            l,
          ),
        );
        out.push('');
        out.push(msg('## 一次情報', '## Primary sources', l));
        out.push('');
        for (const entry of SOURCES) {
          out.push(...renderSource(entry, l));
          out.push('');
        }
        out.push('---');
        out.push('');
        out.push(hostHint(l));
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `情報の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the report: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  server.registerTool(
    'check_official_source',
    {
      title: 'Find the primary source for a topic',
      description:
        '話題を渡すと一次情報の URL と「このサーバーが持っていない範囲」を返す。答えが疑わしいとき・版が古い疑いがあるとき・原文が必要なときに使う。' +
        '**サーバーは取得しない。読むのはクライアント側。** / ' +
        'Return the primary source URLs for a topic, plus what this server deliberately lacks. Use it when you doubt an answer here, suspect a newer edition, or need authoritative wording. This server does not fetch; your client does.',
      inputSchema: {
        topic: z.string().min(1).describe('調べたい話題。例 "ADM フェーズ B の成果物" / The topic to look up'),
        lang: langSchema,
      },
    },
    async ({ topic, lang }) => {
      try {
        const l = lang as Lang;
        const query = topic.toLowerCase();
        const hits = SOURCES.filter(
          (entry) =>
            entry.keywords.some((k) => matchesKeyword(query, k)) ||
            query.includes(entry.id) ||
            entry.name.ja.split('').some(() => false),
        );
        const matched = hits.length > 0 ? hits : SOURCES.filter((e) => e.id === 'togaf');

        const out: string[] = [];
        out.push(msg(`# 一次情報の当たり先: ${topic}`, `# Where to check: ${topic}`, l));
        out.push('');
        if (hits.length === 0) {
          out.push(
            msg(
              '話題から出典を特定できなかったため、既定として TOGAF の一次情報を示します。他の標準が関係する場合は `about_knowledge` で全件を確認してください。',
              'Could not pin the topic to a specific source, so the TOGAF source is shown by default. Use `about_knowledge` to see them all.',
              l,
            ),
          );
          out.push('');
        }
        for (const entry of matched) {
          out.push(...renderSource(entry, l));
          out.push('');
        }
        out.push(
          `- ${msg('このサーバーの知識の基準日', 'This server was last checked on', l)}: **${KNOWLEDGE_BASELINE.lastVerified}**`,
        );
        out.push('');
        out.push(hostHint(l));
        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Lookup failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );
}

/** 「見つからない」系の応答に添える一次情報への一行案内 */
export function sourceFallbackHint(lang: Lang): string {
  return msg(
    'このサーバーに無い事項は `check_official_source` で一次情報の場所を確認できます(閲覧はクライアント側の Web 取得機能で)。',
    'For anything this server does not carry, `check_official_source` points at the primary source; fetch it with your client.',
    lang,
  );
}
