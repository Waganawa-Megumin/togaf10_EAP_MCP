/**
 * セキュリティ EA ツール / Security enterprise-architecture tools.
 *
 * TOGAF ADM の各フェーズに、SABSA の層構造を借りたセキュリティ検討を並走させるための道具。
 * 「今のフェーズで何を必ず答えておくべきか」「何を作るべきか」を毎回明示するのが目的。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  bullets,
  findPhase,
  matchesKeyword,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import {
  REGULATORY_KEYWORDS,
  SABSA_LAYERS,
  SABSA_QUESTIONS,
  SECURITY_KEYWORDS,
  SECURITY_ROLE_KEYWORDS,
  THREAT_LENSES,
  findSabsaLayer,
  findSecurityArtifact,
  securityArtifactsForPhase,
  securityMappingFor,
  securityPitfallsForPhase,
  securityRequirementsFor,
} from '../knowledge/security-ea.js';
import { loadEngagement } from '../engagement/store.js';
import type { Engagement } from '../engagement/model.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/* ------------------------------------------------------------------ *
 * 共通のヘルパ
 * ------------------------------------------------------------------ */

/** 出力全体に添える注意書き。法的助言ではないことを毎回明示する。 */
const DISCLAIMER: Bilingual = {
  ja: 'この出力は検討の出発点となる草案であり、法的助言ではありません。規制の適用範囲の判断と統制の妥当性は、必ず自組織のセキュリティ担当・法務と対話して確定させてください。',
  en: 'This output is a starting draft, not legal advice. Confirm how any regulation applies, and whether the controls are adequate, in conversation with your own security and legal functions.',
};

/** 表のセルなど、1 行に収めたい場所で使う短い表記 */
function compact(value: Bilingual, lang: Lang): string {
  return text(value, lang === 'both' ? 'ja' : lang);
}

/**
 * 行の途中に置くラベル。`msg` は日英を改行で返すため、表のセルや
 * 「ラベル: 値」の形では表が崩れる。ここでは 1 行に収める。
 */
function label(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** 引用ブロック。両言語のときも各行に "> " を付ける */
function quote(ja: string, en: string, lang: Lang): string {
  return msg(ja, en, lang)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** フェーズ ID を "A (フェーズ A: ...)" のような表示に変える */
function phaseLabel(id: string, lang: Lang): string {
  const p = findPhase(id);
  if (!p) return `\`${id}\``;
  return `${p.code} — ${compact(p.name, lang)}`;
}

/** セキュリティ成果物 ID を表示名に変える */
function artifactLabel(id: string, lang: Lang): string {
  const a = findSecurityArtifact(id);
  return a ? `${compact(a.name, lang)} (\`${a.id}\`)` : `\`${id}\``;
}

/** 番号付きの箇条書き(必ず答えるべき問いは番号を振ったほうが会話で参照しやすい) */
function numbered(values: Bilingual[], lang: Lang): string {
  if (values.length === 0) return `- ${label('(なし)', '(none)', lang)}`;
  return values
    .map((v, i) =>
      lang === 'both' ? `${i + 1}. ${v.ja}\n   - ${v.en}` : `${i + 1}. ${text(v, lang)}`,
    )
    .join('\n');
}

/** 文字列にキーワード群のどれかが含まれるか */
function matchesAny(haystack: string, keywords: string[]): boolean {
  const h = haystack.toLowerCase();
  return keywords.some((k) => matchesKeyword(h, k));
}

/** 空白のみの文字列を未設定とみなす */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * 利用者入力・エンゲージメント由来の文字列を 1 行に潰す。
 * 改行が混ざると「ラベル: 値」の行や箇条書きが途中で切れるため、必ず通す。
 */
function oneLine(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, ' ').trim();
}

/**
 * Markdown の表のセルに入れる値。縦棒をエスケープしないと列がずれ、
 * 資産名に含まれる `|` だけで表全体が壊れる。
 */
function cell(value: string): string {
  return oneLine(value).replace(/\|/g, '\\|');
}

/**
 * 利用者が貼り付けた本文をそのまま出力に混ぜない。引用ブロックに閉じ込めて、
 * 見出しや指示文が本ツールの出力と区別できない形で並ぶことを防ぐ。
 */
function quoteRaw(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

/** 一覧が長くなりすぎないように先頭 n 件だけ出し、残りは件数で示す */
function firstFew(items: string[], limit: number, lang: Lang): string {
  const head = items.slice(0, limit).map((s) => `  - ${s}`);
  if (items.length > limit) {
    head.push(
      `  - ${label(`ほか ${items.length - limit} 件`, `and ${items.length - limit} more`, lang)}`,
    );
  }
  return head.join('\n');
}

/* ------------------------------------------------------------------ *
 * ツール登録
 * ------------------------------------------------------------------ */

export function registerSecurityTools(server: McpServer): void {
  /* ---------------------------------------------------------------- *
   * list_sabsa_layers
   * ---------------------------------------------------------------- */
  server.registerTool(
    'list_sabsa_layers',
    {
      title: 'List the SABSA layers with their ADM counterparts',
      description:
        'セキュリティアーキテクチャの検討で使う 6 つの層(文脈・概念・論理・物理・コンポーネント・運用)を、「その層で何を決めるのか」「決めそこねると何が起きるか」「並走させる ADM フェーズ」付きで一覧する。6 つの問い(資産・動機・プロセス・人・場所・時間)も返す。 / List the six security-architecture layers — contextual, conceptual, logical, physical, component, operational — with what each layer decides, what breaks if it is skipped, and which ADM phases it runs alongside. Also returns the six questions: assets, motivation, process, people, location, time.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const out: string[] = [];

        out.push(msg('# セキュリティアーキテクチャの 6 層', '# The six security-architecture layers', l));
        out.push('');
        out.push(
          msg(
            'The SABSA Institute が公開しているセキュリティアーキテクチャの手法は、6 つの層 × 6 つの問い(資産 / 動機 / プロセス / 人 / 場所 / 時間)のマトリクスとして構成されている。TOGAF ADM はセキュリティを一つの関心事として扱うだけで手順を持たないため、実務ではこの層構造を借りて補うことが多い。以下は「ADM のどこでどの層を回すか」に絞った実務向けの整理で、原典の定義そのものではない。',
            'The security-architecture method published by The SABSA Institute is organized as a matrix of six layers against six questions — assets, motivation, process, people, location, time. The TOGAF ADM treats security as one concern but carries no procedure for it, so practitioners commonly borrow this layer structure to fill the gap. What follows is a practice-oriented take focused on which layer runs where in the ADM; it is not the original definitions.',
            l,
          ),
        );
        out.push('');

        // 一覧表(全体像を先に見せる)
        out.push(`| ${label('層', 'Layer', l)} | ID | ${label('何を決める層か', 'What it decides', l)} | ${label('並走する ADM フェーズ', 'Runs alongside', l)} |`);
        out.push('| --- | --- | --- | --- |');
        for (const layer of SABSA_LAYERS) {
          const phases = layer.phaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
          out.push(
            `| ${compact(layer.name, l)} | \`${layer.id}\` | ${compact(layer.viewpoint, l)} | ${phases} |`,
          );
        }
        out.push('');

        for (const layer of SABSA_LAYERS) {
          out.push(`## ${text(layer.name, l)} (\`${layer.id}\`)`);
          out.push('');
          out.push(`- ${label('目線', 'Viewpoint', l)}: ${text(layer.viewpoint, l)}`);
          out.push('');
          out.push(text(layer.purpose, l));
          out.push('');
          out.push(`**${label('この層で決めきるもの', 'Decided in this layer', l)}**`);
          out.push(bullets(layer.decisions, l));
          out.push('');
          out.push(`**${label('決めそこねると起きること', 'What happens if you skip it', l)}**`);
          out.push(bullets(layer.pitfalls, l));
          out.push('');
          out.push(
            `- ${label('並走する ADM フェーズ', 'ADM phases', l)}: ${layer.phaseIds.map((id) => phaseLabel(id, l)).join(' / ')}`,
          );
          out.push('');
        }

        out.push(msg('## 6 つの問い(マトリクスの列)', '## The six questions (matrix columns)', l));
        out.push('');
        out.push(
          msg(
            '各層でこの 6 列を埋める。埋まらない列がその層の弱点で、たいてい「時間」の列が空のまま稼働して、半年後に統制が劣化する。',
            'Fill these six columns at every layer. An empty column is that layer\'s weak spot — and it is almost always the time column, which is why controls decay about six months after go-live.',
            l,
          ),
        );
        out.push('');
        for (const q of SABSA_QUESTIONS) {
          out.push(`### ${text(q.name, l)}`);
          out.push('');
          out.push(text(q.focus, l));
          out.push('');
          out.push(bullets(q.askInPractice, l));
          out.push('');
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: `map_security_to_adm` に今のフェーズを渡すと、そのフェーズで必ず答えておくべきセキュリティ上の問いと、作るべき成果物が出ます。',
            'Next: pass your current phase to `map_security_to_adm` to get the security questions that must be answered there and the artifacts to produce.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `層一覧の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to render the layer list: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * map_security_to_adm
   * ---------------------------------------------------------------- */
  server.registerTool(
    'map_security_to_adm',
    {
      title: 'Map security work onto an ADM phase',
      description:
        '指定した ADM フェーズで並走させるセキュリティ層、そのフェーズを抜ける前に必ず答えておくべきセキュリティ上の問い、作成・更新すべきセキュリティ成果物、そのフェーズで起きやすい失敗を返す。 / For a given ADM phase, return the security layers to run alongside it, the security questions that must be answered before leaving the phase, the security artifacts to produce or update, and the failures that typically happen there.',
      inputSchema: {
        phase: z
          .string()
          .describe('フェーズ ID / コード。例: "a", "Phase A", "preliminary", "requirements-management"'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      try {
        const l = lang as Lang;
        const found = findPhase(phase);
        if (!found) {
          return errorResult(
            msg(
              `フェーズ「${phase}」が見つかりません。利用可能な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              `Phase "${phase}" not found. Available ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              l,
            ),
          );
        }

        const mapping = securityMappingFor(found.id);
        if (!mapping) {
          return errorResult(
            msg(
              `フェーズ「${found.id}」のセキュリティ対応表がまだありません。`,
              `No security mapping is defined for phase "${found.id}" yet.`,
              l,
            ),
          );
        }

        const out: string[] = [];
        out.push(
          msg(
            `# セキュリティ並走計画: ${found.code} — ${found.name.ja}`,
            `# Security work alongside ${found.code} — ${found.name.en}`,
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(found.tagline, l)}`);
        out.push('');

        out.push(msg('## 並走させる層', '## Layers to run alongside', l));
        out.push('');
        for (const layerId of mapping.layerIds) {
          const layer = findSabsaLayer(layerId);
          if (!layer) continue;
          out.push(`- **${compact(layer.name, l)}** (\`${layer.id}\`) — ${text(layer.viewpoint, l)}`);
          out.push(`  - ${text(layer.purpose, l)}`);
        }
        out.push('');

        out.push(
          msg(
            '## このフェーズを抜ける前に必ず答えておくべき問い',
            '## Questions that must be answered before leaving this phase',
            l,
          ),
        );
        out.push('');
        out.push(numbered(mapping.mustAnswer, l));
        out.push('');
        out.push(
          msg(
            '答えが「まだ決まっていない」なら、それはリスクではなく**未決事項**です。アクションとして登録し、期限と担当を付けてください。',
            'An answer of "not decided yet" is not a risk — it is an **open decision**. Register it as an action with an owner and a date.',
            l,
          ),
        );
        out.push('');

        const artifacts = securityArtifactsForPhase(found.id);
        out.push(msg('## 作成・更新するセキュリティ成果物', '## Security artifacts to create or update', l));
        out.push('');
        if (artifacts.length === 0) {
          out.push(msg('- (このフェーズ固有のものはありません)', '- (none specific to this phase)', l));
        } else {
          for (const a of artifacts) {
            out.push(`### ${text(a.name, l)} (\`${a.id}\`)`);
            out.push('');
            out.push(text(a.summary, l));
            out.push('');
            out.push(`**${label('記載項目', 'Contents', l)}**`);
            out.push(bullets(a.contents, l));
            out.push('');
            out.push(`**${label('作成のコツ', 'Tips', l)}**`);
            out.push(bullets(a.tips, l));
            out.push('');
          }
        }

        out.push(msg('## 「終わった」と言ってよい条件', '## What lets you call it done', l));
        out.push('');
        out.push(bullets(mapping.exitCriteria, l));
        out.push('');

        const pitfalls = securityPitfallsForPhase(found.id);
        if (pitfalls.length > 0) {
          out.push(msg('## このフェーズで起きやすい失敗', '## Failures that typically happen here', l));
          out.push('');
          for (const p of pitfalls) {
            out.push(`### ${text(p.name, l)}`);
            out.push('');
            out.push(`- ${label('症状', 'Symptom', l)}: ${text(p.symptom, l)}`);
            out.push(`- ${label('放置した結果', 'Consequence', l)}: ${text(p.consequence, l)}`);
            out.push(`- ${label('直し方', 'Fix', l)}: ${text(p.fix, l)}`);
            out.push('');
          }
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: 対象システムが決まっているなら `threat_model_starter`、要件を台帳に落とすなら `security_requirements_checklist`、いま抱えている案件の抜けを見るなら `review_security_posture`。',
            'Next: `threat_model_starter` once a target system is known, `security_requirements_checklist` to get requirements into the register, or `review_security_posture` to inspect the engagement you already have.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `対応表の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the mapping: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * threat_model_starter
   * ---------------------------------------------------------------- */
  server.registerTool(
    'threat_model_starter',
    {
      title: 'Start a threat model',
      description:
        '対象システムの説明から、脅威モデリングの出発点を作る。信頼境界の引き方、資産 × 6 観点(なりすまし/改ざん/否認/情報漏えい/サービス妨害/権限昇格)の空表、各観点で問うべき質問、次に作るべき成果物を返す。出力は草案であり、セキュリティ担当との対話で確定させる前提。 / Build a starting point for threat modelling from a description of the target system: how to draw the trust boundaries, an empty asset-by-lens matrix over the six lenses (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), the questions to ask under each lens, and what to produce next. The output is a draft to be settled in conversation with a security owner.',
      inputSchema: {
        system: z
          .string()
          .describe('対象システムの説明。利用者・扱うデータ・外部連携が分かる程度に / A description of the target system: its users, the data it holds, and its external connections'),
        assets: z
          .array(z.string())
          .optional()
          .describe('守る対象。省略すると一般的な候補を出す / What is being protected; omitted, a generic candidate set is used'),
        actors: z
          .array(z.string())
          .optional()
          .describe('登場する主体・攻撃者。省略すると一般的な候補を出す / Subjects and adversaries; omitted, a generic candidate set is used'),
        lang: langSchema,
      },
    },
    async ({ system, assets, actors, lang }) => {
      try {
        const l = lang as Lang;
        const target = system.trim();
        if (target.length === 0) {
          return errorResult(
            msg(
              'system に対象システムの説明を入れてください。',
              'Provide a description of the target system in `system`.',
              l,
            ),
          );
        }

        const defaultAssets: Bilingual[] = [
          { ja: '利用者の資格情報とセッション', en: 'User credentials and sessions' },
          { ja: '業務データ本体', en: 'The core business data' },
          { ja: '個人に関するデータ', en: 'Data about individuals' },
          { ja: '設定と秘密情報(鍵・トークン)', en: 'Configuration and secrets: keys and tokens' },
          { ja: '監査ログ・操作証跡', en: 'Audit logs and operation records' },
          { ja: 'サービスが動いていること自体(可用性)', en: 'The service being available at all' },
        ];
        const defaultActors: Bilingual[] = [
          { ja: '未認証の外部利用者', en: 'Unauthenticated outsider' },
          { ja: '認証済みの一般利用者', en: 'Authenticated ordinary user' },
          { ja: '特権を持つ管理者・運用担当', en: 'Privileged administrator or operator' },
          { ja: '委託先および連携する外部システム', en: 'Contractor and connected external system' },
          { ja: '正規の権限を持つ内部関係者(悪意または過失)', en: 'Legitimate insider, malicious or careless' },
        ];

        // 空白だけの要素しか無い場合も未入力として扱う(表が 0 行になるのを防ぐ)
        const givenAssets = (assets ?? []).map((a) => oneLine(a)).filter((a) => a.length > 0);
        const givenActors = (actors ?? []).map((a) => oneLine(a)).filter((a) => a.length > 0);
        const usingDefaultAssets = givenAssets.length === 0;
        const usingDefaultActors = givenActors.length === 0;

        const assetList: string[] = usingDefaultAssets
          ? defaultAssets.map((a) => compact(a, l))
          : givenAssets;
        const actorList: string[] = usingDefaultActors
          ? defaultActors.map((a) => compact(a, l))
          : givenActors;

        const out: string[] = [];
        out.push(msg('# 脅威モデルの出発点(草案)', '# Threat model starting point (draft)', l));
        out.push('');
        out.push(
          quote(
            '**これは草案です。** 資産・攻撃者・境界の妥当性は、必ずセキュリティ担当と対話して確定させてください。この表がそのまま脅威モデルになるわけではありません。',
            '**This is a draft.** The assets, adversaries, and boundaries must be settled in conversation with a security owner. This table is not itself the threat model.',
            l,
          ),
        );
        out.push('');
        out.push(`## ${label('対象', 'Target', l)}`);
        out.push('');
        out.push(quoteRaw(target));
        out.push('');

        out.push(msg('## 1. 信頼境界の引き方', '## 1. Drawing the trust boundaries', l));
        out.push('');
        out.push(
          bullets(
            [
              { ja: '運用主体が変わるところに線を引く(自社 / 委託先 / SaaS 事業者)。ネットワークが同じでも境界として扱う。', en: 'Draw a line wherever the operator changes — you, a contractor, a SaaS provider — even when the network is shared.' },
              { ja: '認証の有無が変わるところに線を引く。未認証で到達できる面を必ず一つ明示する。', en: 'Draw a line where the authentication state changes, and explicitly mark the surface reachable without authentication.' },
              { ja: '権限の水準が変わるところに線を引く(一般利用者 → 管理機能、アプリ → データストア)。', en: 'Draw a line where the privilege level changes: ordinary user to admin function, application to data store.' },
              { ja: 'データの分類区分が変わるところに線を引く(区分の高いデータが低い区分の環境へ流れる箇所)。', en: 'Draw a line where the classification changes — anywhere higher-tier data flows into a lower-tier environment.' },
              { ja: '法域・地域が変わるところに線を引く。保管先が国をまたぐ場合はここで拾う。', en: 'Draw a line where the jurisdiction changes; cross-border storage gets caught here.' },
              { ja: '線を引いたら、その線をまたぐデータと「またぐときに何を検査するか」を必ず併記する。検査を書かない境界は実装時に素通りする。', en: 'For each line, write what crosses it and what is inspected as it crosses. A boundary without an inspection is one implementers will walk straight through.' },
            ],
            l,
          ),
        );
        out.push('');

        out.push(msg('## 2. 資産と主体', '## 2. Assets and subjects', l));
        out.push('');
        out.push(`**${label('資産(守る対象)', 'Assets', l)}**`);
        if (usingDefaultAssets) {
          out.push(
            msg(
              '(入力が無かったため一般的な候補を置いています。対象システムの言葉に置き換えてください。)',
              '(No input given, so generic candidates are shown. Replace them with this system\'s own terms.)',
              l,
            ),
          );
        }
        out.push(assetList.map((a) => `- ${a}`).join('\n'));
        out.push('');
        out.push(`**${label('主体・攻撃者', 'Subjects and adversaries', l)}**`);
        if (usingDefaultActors) {
          out.push(
            msg(
              '(入力が無かったため一般的な候補を置いています。委託先・バッチ処理・連携システムを忘れずに足してください。)',
              '(No input given, so generic candidates are shown. Remember to add contractors, batch jobs, and connected systems.)',
              l,
            ),
          );
        }
        out.push(actorList.map((a) => `- ${a}`).join('\n'));
        out.push('');

        out.push(msg('## 3. 資産 × 脅威観点の表', '## 3. The asset-by-lens matrix', l));
        out.push('');
        out.push(
          msg(
            '各セルに「打ち手」または「受容(理由付き)」のどちらかを書き込む。空欄が残っているうちは検討が終わっていません。対策不要と判断したセルにも理由を残すと、後任が同じ検討をやり直さずに済みます。',
            'Write either a control or an acceptance-with-reason in every cell. Blank cells mean the analysis is unfinished. Recording the reason even where you decide nothing is needed saves your successor from redoing the work.',
            l,
          ),
        );
        out.push('');
        const lensHeads = THREAT_LENSES.map((t) => compact(t.name, l));
        out.push(`| ${label('資産', 'Asset', l)} | ${lensHeads.join(' | ')} |`);
        out.push(`| --- | ${THREAT_LENSES.map(() => ':-:').join(' | ')} |`);
        for (const a of assetList) {
          out.push(`| ${cell(a)} | ${THREAT_LENSES.map(() => '  ').join(' | ')} |`);
        }
        out.push('');

        out.push(msg('## 4. 各観点で問うべき質問', '## 4. What to ask under each lens', l));
        out.push('');
        for (const lens of THREAT_LENSES) {
          out.push(`### ${text(lens.name, l)}`);
          out.push('');
          out.push(text(lens.meaning, l));
          out.push('');
          out.push(`**${label('問い', 'Questions', l)}**`);
          out.push(bullets(lens.questions, l));
          out.push('');
          out.push(`**${label('打ち手の型', 'Control types', l)}**`);
          out.push(bullets(lens.controlTypes, l));
          out.push('');
        }

        out.push(msg('## 5. 次に作るべき成果物', '## 5. What to produce next', l));
        out.push('');
        for (const id of ['trust-boundary-diagram', 'threat-model', 'security-requirements-spec', 'residual-risk-acceptance']) {
          const a = findSecurityArtifact(id);
          if (!a) continue;
          out.push(`- **${artifactLabel(a.id, l)}** — ${text(a.summary, l)}`);
        }
        out.push('');
        out.push(
          msg(
            '順番としては、信頼境界図を先に 1 枚に収めてから脅威モデルに入ると手戻りが少なくなります。完璧な列挙を目指すより、まず「境界をまたぐデータフロー」だけで 1 周してください。',
            'Get the boundary diagram onto one page before starting the model; it reduces rework. Rather than chasing completeness, do one full pass over just the flows that cross a boundary.',
            l,
          ),
        );
        out.push('');

        out.push('---');
        out.push('');
        out.push(
          quote(
            '**確定は対話で。** ここで挙げた観点は出発点にすぎません。実際の脅威・優先度・受容の判断は、対象業務を知っているセキュリティ担当と一緒に決めてください。',
            '**Settle it in conversation.** These lenses are only a starting point. The real threats, their priority, and what gets accepted must be decided together with a security owner who knows the business.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `脅威モデルの草案生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the threat model draft: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * security_requirements_checklist
   * ---------------------------------------------------------------- */
  server.registerTool(
    'security_requirements_checklist',
    {
      title: 'Security requirements checklist',
      description:
        '非機能要件として ID 管理すべきセキュリティ要件のチェックリストを返す。各項目に「どう検証するか」を併記する。regulated を true にすると、規制対象の案件で追加になる項目も含める。 / Return the checklist of security requirements that should be registered and tracked as non-functional requirements, each with its verification method. Set `regulated` to true to include the items that regulated engagements additionally need.',
      inputSchema: {
        scope: z
          .string()
          .describe('対象範囲。システム名・業務範囲など / The scope: system name, business area, or similar'),
        regulated: z
          .boolean()
          .default(false)
          .describe('規制対象の案件かどうか / Whether the engagement is subject to regulation'),
        lang: langSchema,
      },
    },
    async ({ scope, regulated, lang }) => {
      try {
        const l = lang as Lang;
        const target = scope.trim();
        if (target.length === 0) {
          return errorResult(
            msg('scope に対象範囲を入れてください。', 'Provide the scope in `scope`.', l),
          );
        }

        const items = securityRequirementsFor(regulated);
        const out: string[] = [];

        out.push(msg('# セキュリティ要件チェックリスト', '# Security requirements checklist', l));
        out.push('');
        out.push(`- ${label('対象', 'Scope', l)}: ${oneLine(target)}`);
        out.push(
          `- ${label('規制対象', 'Regulated', l)}: ${regulated ? label('はい', 'yes', l) : label('いいえ', 'no', l)}`,
        );
        out.push(`- ${label('項目数', 'Items', l)}: ${items.length}`);
        out.push('');
        out.push(
          msg(
            'これらは**そのまま貼り付ける要件文ではありません**。対象システムの言葉に書き換え、他の非機能要件と同じ採番体系・同じ台帳に入れてください。セキュリティ要件を別紙に隔離した瞬間に、テスト計画にも受入条件にも入らなくなります。',
            'These are **not requirement text to paste in as-is**. Rewrite them in this system\'s terms and register them with the same numbering, in the same register, as every other non-functional requirement. The moment security requirements are exiled to an appendix they stop reaching the test plan and the acceptance criteria.',
            l,
          ),
        );
        out.push('');

        out.push(
          `| ${label('区分', 'Category', l)} | ${label('要件', 'Requirement', l)} | ${label('検証方法', 'Verification', l)} | ${label('該当フェーズ', 'Phases', l)} |`,
        );
        out.push('| --- | --- | --- | --- |');
        for (const item of items) {
          const phases = item.phaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
          const marker = item.regulatedOnly === true ? ` ${label('(規制)', '(regulated)', l)}` : '';
          out.push(
            `| ${compact(item.category, l)}${marker} | ${compact(item.requirement, l)} | ${compact(item.verification, l)} | ${phases} |`,
          );
        }
        out.push('');

        if (l === 'both') {
          // 表は日本語に寄せているので、英語の要件本文を別立てで出す
          out.push('### English requirement text');
          out.push('');
          for (const item of items) {
            out.push(`- **${item.category.en}** — ${item.requirement.en}`);
            out.push(`  - Verification: ${item.verification.en}`);
          }
          out.push('');
        }

        out.push(msg('## 台帳に入れるときの注意', '## Notes for getting these into the register', l));
        out.push('');
        out.push(
          bullets(
            [
              { ja: '検証方法を先に書くと、要件本文が自然に測定可能になる。「適切に管理する」のような検証不能な文は要件ではない。', en: 'Write the verification first and the requirement text becomes measurable by itself. A sentence you cannot test — "shall be managed appropriately" — is not a requirement.' },
              { ja: '各要件に出典(事業要求 / 規制 / 契約 / 脅威モデル)を付ける。出典の無い要件は削られたときに誰も止められない。', en: 'Attach a source to each — business demand, regulation, contract, or threat model. Requirements without a source have nobody to defend them when they get cut.' },
              { ja: '落とした要件も履歴に残す。落とした理由と承認者は、稼働後に必ず聞かれる。', en: 'Keep dropped requirements in the history with the reason and the approver; both are asked for after go-live.' },
              { ja: '優先度は「守れなかったときの事業影響」で付ける。技術的な難易度で付けない。', en: 'Prioritize by the business impact of failing the requirement, not by how hard it is to implement.' },
            ],
            l,
          ),
        );
        out.push('');

        if (!regulated) {
          out.push(
            msg(
              '規制・業界要求・大口顧客との契約が絡む案件では、`regulated: true` で再実行してください。データの所在、保持期間、監査証跡、事故時の報告、委託先への要求の伝播といった項目が追加されます。',
              'If regulation, an industry requirement, or a major customer contract is in play, re-run with `regulated: true` to add items on data location, retention, audit trail, incident reporting, and flow-down to third parties.',
              l,
            ),
          );
          out.push('');
        } else {
          out.push(
            msg(
              '規制項目については、どの規制がこの範囲に適用されるかの判断を法務・コンプライアンス部門に確認してください。アーキテクトが単独で決める範囲ではありません。',
              'For the regulated items, confirm with legal or compliance which obligations actually apply to this scope. That determination is not an architect\'s to make alone.',
              l,
            ),
          );
          out.push('');
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: `update_engagement` の `deliverables` にセキュリティ要件仕様を登録しておくと、`review_security_posture` の点検対象になります。',
            'Next: register a security requirements specification through `update_engagement` (`deliverables`) so that `review_security_posture` can check against it.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `チェックリストの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the checklist: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * review_security_posture
   * ---------------------------------------------------------------- */
  server.registerTool(
    'review_security_posture',
    {
      title: 'Review the engagement for security gaps',
      description:
        '現在のエンゲージメントを読み、セキュリティ観点の抜けを指摘する。セキュリティ担当のステークホルダー不在、重大リスクの担当者・対策の欠落、残存リスクの受容者未設定、セキュリティ成果物の不在、規制関連アクションの期限漏れ、暫定措置の廃棄期限漏れなどを見る。 / Read the current engagement and report security gaps: no security stakeholder, severe risks without an owner or mitigation, accepted risk with no named acceptor, no security deliverables, regulatory actions without a deadline, interim measures with no disposal date, and more.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const engagement = loadEngagement();
        if (!engagement) {
          const guide: string[] = [];
          guide.push(msg('# セキュリティ観点のレビュー', '# Security posture review', l));
          guide.push('');
          guide.push(
            msg(
              'エンゲージメントがまだありません。`start_engagement` で案件を作ってから、もう一度実行してください。',
              'There is no engagement yet. Create one with `start_engagement`, then run this again.',
              l,
            ),
          );
          guide.push('');
          guide.push(
            msg(
              'エンゲージメントを作らずに進めたい場合は、次のツールが単体で使えます。',
              'If you want to proceed without one, these tools work standalone:',
              l,
            ),
          );
          guide.push('');
          guide.push(
            bullets(
              [
                { ja: '`map_security_to_adm` — いまのフェーズで答えておくべきセキュリティ上の問い', en: '`map_security_to_adm` — the security questions to answer in your current phase' },
                { ja: '`threat_model_starter` — 対象システムから脅威モデルの草案', en: '`threat_model_starter` — a threat model draft from a system description' },
                { ja: '`security_requirements_checklist` — 台帳に入れるべきセキュリティ要件', en: '`security_requirements_checklist` — the security requirements to register' },
              ],
              l,
            ),
          );
          return textResult(guide.join('\n'));
        }

        const findings = collectSecurityFindings(engagement, l);
        const good = collectSecurityStrengths(engagement);

        const out: string[] = [];
        out.push(msg('# セキュリティ観点のレビュー', '# Security posture review', l));
        out.push('');
        out.push(`- ${label('対象', 'Engagement', l)}: ${oneLine(engagement.name)}`);
        out.push(`- ${label('現在フェーズ', 'Current phase', l)}: ${phaseLabel(engagement.currentPhaseId, l)}`);
        out.push(
          `- ${label('指摘', 'Findings', l)}: ${findings.length} (${severityLabel('high', l)} ${findings.filter((f) => f.severity === 'high').length}, ${severityLabel('medium', l)} ${findings.filter((f) => f.severity === 'medium').length}, ${severityLabel('low', l)} ${findings.filter((f) => f.severity === 'low').length})`,
        );
        out.push('');

        if (findings.length === 0) {
          out.push(
            msg(
              'このツールが機械的に見ている範囲では、抜けは見つかりませんでした。ただしこれは登録されている情報の形式的な点検であって、統制の中身が妥当かどうかは判断していません。',
              'Nothing was found within what this tool can check mechanically. Note that this inspects the shape of what is recorded; it says nothing about whether the controls themselves are adequate.',
              l,
            ),
          );
          out.push('');
        } else {
          out.push(msg('## 指摘', '## Findings', l));
          out.push('');
          const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
          const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
          for (const f of sorted) {
            out.push(`### ${severityLabel(f.severity, l)} ${text(f.title, l)}`);
            out.push('');
            out.push(text(f.detail, l));
            if (f.evidence.length > 0) {
              out.push('');
              out.push(firstFew(f.evidence, 5, l));
            }
            out.push('');
            out.push(`- ${label('次の一手', 'Next move', l)}: ${text(f.action, l)}`);
            out.push('');
          }
        }

        if (good.length > 0) {
          out.push(msg('## 押さえられている点', '## Already in place', l));
          out.push('');
          out.push(bullets(good, l));
          out.push('');
        }

        out.push(msg('## この点検が見ていないこと', '## What this review does not check', l));
        out.push('');
        out.push(
          bullets(
            [
              { ja: '統制の中身の妥当性(登録されているかどうかしか見ていない)', en: 'Whether the controls are adequate — only whether they are recorded' },
              { ja: '実装が設計どおりかどうか(実機の確認は別途必要)', en: 'Whether the build matches the design — that needs inspection of the running system' },
              { ja: 'どの規制がこの案件に適用されるか(法務・コンプライアンス部門の判断)', en: 'Which regulations apply to this engagement — that is for legal and compliance to determine' },
            ],
            l,
          ),
        );
        out.push('');
        out.push('---');
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `レビューに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `The review failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );
}

/* ------------------------------------------------------------------ *
 * review_security_posture の中身
 * ------------------------------------------------------------------ */

type Severity = 'high' | 'medium' | 'low';

interface SecurityFinding {
  severity: Severity;
  title: Bilingual;
  detail: Bilingual;
  /** 根拠になった項目(タイトルや ID) */
  evidence: string[];
  action: Bilingual;
}

function severityLabel(severity: Severity, lang: Lang): string {
  if (severity === 'high') return msg('[高]', '[High]', lang === 'both' ? 'ja' : lang);
  if (severity === 'medium') return msg('[中]', '[Medium]', lang === 'both' ? 'ja' : lang);
  return msg('[低]', '[Low]', lang === 'both' ? 'ja' : lang);
}

/**
 * 組織名・会議体名の末尾に来る語。
 * 「部」「課」を部分一致で見ると阿部・服部・渡部といった姓を組織と誤判定するため、
 * 末尾一致でのみ使い、2 文字の値(姓だけの入力)は対象外にする。
 */
const ORG_SUFFIXES = [
  '部', '課', '室', '本部', '部門', '事業部', 'チーム', '委員会', '会議', '会議体',
  'グループ', 'センター',
];

/** 位置に関係なく組織を強く示す語(個人名には現れない) */
const ORG_WORDS = [
  '全社', '委員会', '本部', '事業部', '経営会議',
  'team', 'department', 'committee', 'division', 'board', 'group', 'office',
];

/** 受容者が個人ではなく組織を指していそうかの簡易判定 */
function looksOrgLike(owner: string): boolean {
  const value = oneLine(owner);
  if (value.length === 0) return false;
  if (value.length >= 3 && ORG_SUFFIXES.some((s) => value.endsWith(s))) return true;
  return matchesAny(value, ORG_WORDS);
}

/** エンゲージメントにセキュリティ成果物が登録されているか */
function securityDeliverables(engagement: Engagement): { name: string; id: string }[] {
  const hits: { name: string; id: string }[] = [];
  for (const d of engagement.deliverables) {
    const byId = d.deliverableId ? findSecurityArtifact(d.deliverableId) : undefined;
    if (byId || matchesAny(`${d.name} ${d.note ?? ''}`, SECURITY_KEYWORDS)) {
      hits.push({ name: d.name, id: d.id });
    }
  }
  return hits;
}

function collectSecurityFindings(engagement: Engagement, lang: Lang): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  /* 1. セキュリティ担当のステークホルダーが不在 */
  const securityStakeholders = engagement.stakeholders.filter((s) =>
    matchesAny([s.name, s.role ?? '', s.organization ?? '', ...s.concerns].join(' '), SECURITY_ROLE_KEYWORDS),
  );
  if (securityStakeholders.length === 0) {
    findings.push({
      severity: 'high',
      title: { ja: 'セキュリティ担当のステークホルダーが登録されていない', en: 'No security stakeholder is registered' },
      detail: {
        ja: `登録されているステークホルダー ${engagement.stakeholders.length} 名のうち、セキュリティ・リスク・コンプライアンス・監査のいずれかを担う人が見当たりません。この状態で設計を進めると、セキュリティは最後にレビューする役になり、指摘が構造に関わるものだったときに直せません。`,
        en: `None of the ${engagement.stakeholders.length} registered stakeholders appears to carry security, risk, compliance, or audit. Design proceeding from here puts security in the position of reviewing last, at which point structural findings can no longer be fixed.`,
      },
      evidence: [],
      action: {
        ja: 'セキュリティ側の意思決定者を 1 名特定し、関心事(規制順守 / 事故ゼロ / 運用負荷のどれか)を書いて `update_engagement` の `stakeholders` に登録する。フェーズ A のうちに 1 時間だけ同席させる。',
        en: 'Identify one decision-maker on the security side, write down what they actually care about — compliance, zero incidents, or operational load — and register them via `update_engagement` (`stakeholders`). Get them in the room for an hour while still in Phase A.',
      },
    });
  }

  /* 2. 重大リスクに担当者または対策が無い */
  const severeOpen = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && r.status !== 'closed',
  );
  const severeIncomplete = severeOpen.filter((r) => isBlank(r.owner) || isBlank(r.mitigation));
  if (severeIncomplete.length > 0) {
    findings.push({
      severity: 'high',
      title: { ja: '重大リスクに担当者または対策が入っていない', en: 'Severe risks lack an owner or a mitigation' },
      detail: {
        ja: `critical / high のリスク ${severeOpen.length} 件のうち ${severeIncomplete.length} 件で、担当者か対策のどちらかが空です。担当者のいないリスクは進捗が測れず、対策の無いリスクは実質的に受容しているのと同じですが、受容の記録も残っていません。`,
        en: `Of ${severeOpen.length} critical/high risks, ${severeIncomplete.length} are missing either an owner or a mitigation. A risk with no owner cannot be tracked, and a risk with no mitigation is being accepted in practice — without any record of acceptance.`,
      },
      evidence: severeIncomplete.map((r) => {
        const missing: string[] = [];
        if (isBlank(r.owner)) missing.push(msg('担当者', 'owner', lang === 'both' ? 'ja' : lang));
        if (isBlank(r.mitigation)) missing.push(msg('対策', 'mitigation', lang === 'both' ? 'ja' : lang));
        return `${oneLine(r.title)} (\`${r.id}\`, ${r.level}) — ${msg('未設定', 'missing', lang === 'both' ? 'ja' : lang)}: ${missing.join(', ')}`;
      }),
      action: {
        ja: '各リスクに個人名の担当者を付ける。対策が決まらないものは、対策を考えるためのアクションを期限付きで作るか、残存リスクとして受容手続きに回す。',
        en: 'Give each risk a named individual. Where no mitigation is settled, either raise a dated action to decide one or move it into the residual-risk acceptance path.',
      },
    });
  }

  /* 3. 受容したリスクに受容者がいない / 組織名になっている */
  const accepted = engagement.risks.filter((r) => r.status === 'accepted');
  const acceptedNoOwner = accepted.filter((r) => isBlank(r.owner));
  if (acceptedNoOwner.length > 0) {
    findings.push({
      severity: 'high',
      title: { ja: '残存リスクの受容者が設定されていない', en: 'Accepted risks have no acceptor' },
      detail: {
        ja: `受容済みとされているリスク ${accepted.length} 件のうち ${acceptedNoOwner.length} 件に受容者がいません。受容者のいない受容は、事故が起きたときに誰も自分の判断だと認識せず、対応が止まります。`,
        en: `Of ${accepted.length} risks marked accepted, ${acceptedNoOwner.length} name nobody. An acceptance with no acceptor means that when the incident lands, nobody recognizes it as their decision and the response stalls.`,
      },
      evidence: acceptedNoOwner.map((r) => `${oneLine(r.title)} (\`${r.id}\`, ${r.level})`),
      action: {
        ja: '個人名と役職を `owner` に入れ、受容の有効期限と再確認の担当を決定事項として `decisions` に記録する。埋まらないなら、それはまだ受容されていない。',
        en: 'Put an individual name and role in `owner`, and record the acceptance expiry plus the re-confirmation owner as a decision. If those fields cannot be filled, the risk is not actually accepted.',
      },
    });
  }

  const acceptedOrgLike = accepted.filter((r) => !isBlank(r.owner) && looksOrgLike(r.owner ?? ''));
  if (acceptedOrgLike.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '残存リスクの受容者が組織名になっている可能性', en: 'The residual-risk acceptor may be an org chart box' },
      detail: {
        ja: '受容者の欄が部門名・会議体名に見えます。組織は署名できません。事故後に「あれは自分の判断ではない」と全員が言える状態になります。',
        en: 'The acceptor field reads as a department or a committee. Organizations cannot sign. After an incident, everyone can truthfully say it was not their call.',
      },
      evidence: acceptedOrgLike.map((r) => `${oneLine(r.title)} (\`${r.id}\`) — ${oneLine(r.owner ?? '')}`),
      action: {
        ja: '会議体で決めた場合でも、署名する個人を 1 名決めて `owner` に書く(役職も併記する)。',
        en: 'Even when a committee decided, name the one individual who signs and put them in `owner`, with their role.',
      },
    });
  }

  /* 4. セキュリティ成果物が 1 件も無い */
  const secDeliverables = securityDeliverables(engagement);
  if (secDeliverables.length === 0) {
    findings.push({
      severity: 'high',
      title: { ja: 'セキュリティ成果物が 1 件も登録されていない', en: 'No security deliverable is registered' },
      detail: {
        ja: `登録されている成果物 ${engagement.deliverables.length} 件の中に、セキュリティに関するものが見当たりません。セキュリティの検討は行われていても、成果物として残っていなければ引き継げず、監査でも示せません。`,
        en: `None of the ${engagement.deliverables.length} registered deliverables appears to be about security. Even if the thinking happened, without an artifact it cannot be handed over and cannot be shown at audit.`,
      },
      evidence: [],
      action: {
        ja: 'まずは信頼境界図 (`trust-boundary-diagram`) と脅威モデル (`threat-model`) の 2 点を `update_engagement` の `deliverables` に登録する。`map_security_to_adm` に現在フェーズを渡すと、そのフェーズで作るべきものが分かる。',
        en: 'Start by registering the trust boundary diagram (`trust-boundary-diagram`) and the threat model (`threat-model`) via `update_engagement` (`deliverables`). Pass your current phase to `map_security_to_adm` to see what belongs there.',
      },
    });
  }

  /* 5. 規制関連のアクションに期限が無い */
  const regActions = engagement.actions.filter(
    (a) => a.status !== 'done' && matchesAny(`${a.title} ${a.note ?? ''}`, REGULATORY_KEYWORDS),
  );
  const regNoDue = regActions.filter((a) => isBlank(a.due));
  if (regNoDue.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '規制関連のアクションに期限が入っていない', en: 'Regulatory actions carry no deadline' },
      detail: {
        ja: `規制・監査・コンプライアンスに関係しそうなアクション ${regActions.length} 件のうち ${regNoDue.length} 件が期限なしです。規制由来の作業は期日が外から与えられるため、期限が無いと他の施策と同じ優先度で扱われ、リソース調整のたびに後ろへずれます。`,
        en: `Of ${regActions.length} actions that look regulatory, audit-, or compliance-related, ${regNoDue.length} have no due date. Regulatory work has its deadline imposed from outside; without one recorded it sits at the same priority as everything else and slips at every resourcing conversation.`,
      },
      evidence: regNoDue.map((a) => `${oneLine(a.title)} (\`${a.id}\`)`),
      action: {
        ja: '外部から与えられている期日を確認し、そこから逆算した社内の期限を `due` に入れる。さらに、移行アーキテクチャの目標時期そのものに埋め込んで固定制約にする。',
        en: 'Confirm the externally imposed date, work backwards to an internal deadline, and put it in `due`. Then bake it into the target date of a transition state so it becomes a fixed constraint.',
      },
    });
  }

  /* 6. 暫定措置に廃棄期限が無い */
  const interimNoDisposal = engagement.transitions.filter(
    (t) => !isBlank(t.interim) && isBlank(t.disposalPlan),
  );
  if (interimNoDisposal.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '暫定措置に廃棄計画・期限が無い', en: 'Interim measures have no disposal plan' },
      detail: {
        ja: '移行期間だけのはずの仮の連携や広めの権限は、廃棄期限と責任者が無いと必ず残ります。数年後には用途を誰も説明できない経路になり、攻撃面が恒久的に広がります。',
        en: 'Temporary interfaces and over-broad permissions meant only for the cutover always survive when nobody owns a disposal date. Years later they are paths nobody can explain, and the attack surface has widened permanently.',
      },
      evidence: interimNoDisposal.map((t) => `${oneLine(t.name)} (\`${t.id}\`) — ${oneLine(t.interim ?? '')}`),
      action: {
        ja: '各暫定措置に廃棄期限と責任者を書き、その期限をアクションとしても登録する(移行完了時に自動で消えることはない)。',
        en: 'Give each interim measure a disposal date and an owner, and register that date as an action too — it will not disappear on its own when the migration finishes.',
      },
    });
  }

  /* 7. 設計・実装フェーズに入っているのに脅威モデルが無い */
  const latePhases = ['d', 'e', 'f', 'g', 'h'];
  const hasThreatModel = engagement.deliverables.some(
    (d) =>
      d.deliverableId === 'threat-model' ||
      matchesAny(`${d.name} ${d.note ?? ''}`, ['脅威', 'threat', 'threat model']),
  );
  if (latePhases.includes(engagement.currentPhaseId) && !hasThreatModel) {
    findings.push({
      severity: 'medium',
      title: { ja: '技術設計以降のフェーズなのに脅威モデルが無い', en: 'Past technology design with no threat model' },
      detail: {
        ja: `現在フェーズは ${phaseLabel(engagement.currentPhaseId, 'ja')} ですが、脅威モデルにあたる成果物が登録されていません。この時点で構造に関わる指摘が出ると、設計をやり直せず例外承認で押し切ることになります。`,
        en: `The current phase is ${phaseLabel(engagement.currentPhaseId, 'en')} but no threat model is registered. A structural finding arriving now cannot be designed away, so it gets pushed through on a waiver instead.`,
      },
      evidence: [],
      action: {
        ja: '`threat_model_starter` に対象システムの説明を渡して草案を作り、境界をまたぐデータフローだけで 1 周する。完璧な列挙は狙わない。',
        en: 'Pass a system description to `threat_model_starter` and do one pass over just the flows that cross a boundary. Do not chase completeness.',
      },
    });
  }

  /* 8. リスクが 1 件も登録されていない */
  if (engagement.risks.length === 0) {
    findings.push({
      severity: 'medium',
      title: { ja: 'リスクが 1 件も登録されていない', en: 'No risks are registered at all' },
      detail: {
        ja: 'リスク台帳が空です。リスクが無い案件はまず存在しないので、これは「見つかっていない」か「口頭で共有されているだけ」のどちらかです。どちらも引き継げません。',
        en: 'The risk register is empty. Engagements with no risks essentially do not exist, so this means either they have not been found or they are only being shared verbally. Neither survives a handover.',
      },
      evidence: [],
      action: {
        ja: 'まず現時点で分かっている懸念を 3 件でよいので登録する。レベル・担当者・対策の 3 列を埋められないものは、そのこと自体が指摘になる。',
        en: 'Register just three known concerns to begin with. Any of them where you cannot fill level, owner, and mitigation is itself the finding.',
      },
    });
  }

  /* 9. セキュリティに関する決定事項が残っていない */
  const secDecisions = engagement.decisions.filter((d) =>
    matchesAny(`${d.title} ${d.decision} ${d.context ?? ''} ${d.rationale ?? ''}`, SECURITY_KEYWORDS),
  );
  if (secDecisions.length === 0 && engagement.decisions.length > 0) {
    findings.push({
      severity: 'low',
      title: { ja: 'セキュリティに関する決定事項が記録されていない', en: 'No security decision has been recorded' },
      detail: {
        ja: `決定事項 ${engagement.decisions.length} 件のうち、セキュリティに関するものが見当たりません。認証方式・情報分類・鍵の扱い・残存リスクの受容といった判断は、後から必ず根拠を問われます。`,
        en: `None of the ${engagement.decisions.length} recorded decisions concerns security. Choices about authentication, classification, key handling, and residual-risk acceptance are exactly the ones whose rationale gets questioned later.`,
      },
      evidence: [],
      action: {
        ja: 'すでに決まっているセキュリティ上の判断(認証方式、情報分類の区分、鍵の保管場所など)を、検討した選択肢と根拠込みで `decisions` に残す。',
        en: 'Record the security choices already made — authentication method, classification tiers, where keys live — into `decisions` with the options considered and the rationale.',
      },
    });
  }

  /* 10. 残存リスクの水準が記録されていない */
  const withoutResidual = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && r.status !== 'closed' && r.residualLevel === undefined,
  );
  if (withoutResidual.length > 0) {
    findings.push({
      severity: 'low',
      title: { ja: '対策後に残るリスク水準が記録されていない', en: 'The post-mitigation risk level is not recorded' },
      detail: {
        ja: `重大リスク ${withoutResidual.length} 件で、対策後に残る水準 (residualLevel) が空です。ここが空だと「対策したので大丈夫」という言い方が通ってしまい、受容の判断が発生しません。`,
        en: `${withoutResidual.length} severe risks have no residual level recorded. With that field empty, "we mitigated it" passes as an answer and no acceptance decision ever takes place.`,
      },
      evidence: withoutResidual.map((r) => `${oneLine(r.title)} (\`${r.id}\`, ${r.level})`),
      action: {
        ja: '対策後に残る水準を入れる。high 以上が残るなら、受容者・有効期限・再確認担当を決めて残存リスク受容記録に落とす。',
        en: 'Fill in the level that remains after mitigation. If it is still high or above, take it to a residual-risk acceptance record with an acceptor, an expiry, and a re-confirmation owner.',
      },
    });
  }

  return findings;
}

/** 押さえられている点(指摘だけだと現状が読めないので併記する) */
function collectSecurityStrengths(engagement: Engagement): Bilingual[] {
  const good: Bilingual[] = [];

  const securityStakeholders = engagement.stakeholders.filter((s) =>
    matchesAny([s.name, s.role ?? '', s.organization ?? '', ...s.concerns].join(' '), SECURITY_ROLE_KEYWORDS),
  );
  if (securityStakeholders.length > 0) {
    good.push({
      ja: `セキュリティ側のステークホルダーが ${securityStakeholders.length} 名登録されている(${securityStakeholders.map((s) => oneLine(s.name)).join(', ')})`,
      en: `${securityStakeholders.length} security-side stakeholders are registered (${securityStakeholders.map((s) => oneLine(s.name)).join(', ')})`,
    });
  }

  const secDeliverables = securityDeliverables(engagement);
  if (secDeliverables.length > 0) {
    good.push({
      ja: `セキュリティ関連の成果物が ${secDeliverables.length} 件登録されている(${secDeliverables.map((d) => oneLine(d.name)).slice(0, 3).join(', ')}${secDeliverables.length > 3 ? ' ほか' : ''})`,
      en: `${secDeliverables.length} security-related deliverables are registered (${secDeliverables.map((d) => oneLine(d.name)).slice(0, 3).join(', ')}${secDeliverables.length > 3 ? ', and more' : ''})`,
    });
  }

  const ownedSevere = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && !isBlank(r.owner) && !isBlank(r.mitigation),
  );
  if (ownedSevere.length > 0) {
    good.push({
      ja: `重大リスク ${ownedSevere.length} 件に担当者と対策の両方が入っている`,
      en: `${ownedSevere.length} severe risks carry both an owner and a mitigation`,
    });
  }

  const disposalPlanned = engagement.transitions.filter(
    (t) => !isBlank(t.interim) && !isBlank(t.disposalPlan),
  );
  if (disposalPlanned.length > 0) {
    good.push({
      ja: `暫定措置 ${disposalPlanned.length} 件に廃棄計画が付いている`,
      en: `${disposalPlanned.length} interim measures carry a disposal plan`,
    });
  }

  const secDecisions = engagement.decisions.filter((d) =>
    matchesAny(`${d.title} ${d.decision} ${d.context ?? ''} ${d.rationale ?? ''}`, SECURITY_KEYWORDS),
  );
  if (secDecisions.length > 0) {
    good.push({
      ja: `セキュリティに関する決定事項が ${secDecisions.length} 件記録されている`,
      en: `${secDecisions.length} security-related decisions are on record`,
    });
  }

  return good;
}
