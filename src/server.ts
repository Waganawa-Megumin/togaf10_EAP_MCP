/**
 * MCP サーバーの生成と全ツールの登録 / MCP server construction and tool registration.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerConsultTool } from './tools/consult.js';
import { registerEngagementTools } from './tools/engagement.js';
import { registerEngagementListTools } from './tools/engagements.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerReviewTools } from './tools/review.js';
import { registerRoadmapTools } from './tools/roadmap.js';
import { registerExportTools } from './tools/export.js';
import { registerPrompts } from './tools/prompts.js';
import { registerResources } from './tools/resources.js';
import { registerArchiMateTools } from './tools/archimate.js';
import { registerArchiMateReferenceTools } from './tools/archimate-reference.js';
import { registerArchiMateExportTools } from './tools/archimate-export.js';
import { registerDiagramTools } from './tools/diagrams.js';
import { registerFrameworkTools } from './tools/frameworks.js';
import { registerBusinessArchitectureTools } from './tools/business-architecture.js';
import { registerGuideTools } from './tools/guide.js';
import { registerSecurityTools } from './tools/security.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerLlmTools } from './tools/llm.js';
import { registerSourceTools } from './tools/sources.js';
import { registerIntakeTools } from './tools/intake.js';
import { registerInspectTools } from './tools/inspect.js';

export const SERVER_NAME = 'togaf10-eap-mcp';
export const SERVER_VERSION = '0.2.0';

const INSTRUCTIONS = `TOGAF 10 EAP MCP — TOGAF Standard 10th Edition (Enterprise Architecture Practitioner) をベースにした非公式のコンサルティングサーバー。

使い分け:
- 状況を相談されたら、まず \`consult\` に状況を自由記述で渡す。関連フェーズ・技法・成果物・アクション・確認質問が返る。
- 個別の知識は \`get_adm_phase\` / \`get_technique\` / \`get_deliverable\` / \`get_glossary_term\`、横断検索は \`search_togaf\`。
- 案件として追跡するなら \`start_engagement\` → \`update_engagement\`。状態は JSON に永続化される。
- 進捗を見せるときは \`get_dashboard\`(Markdown)、ブラウザで常時表示するなら \`open_dashboard\`(SSE ライブ更新・印刷用 CSS 付き)。

注記: 本サーバーは非公式であり The Open Group とは無関係。知識ベースは独自の要約・解説であり、TOGAF 標準の原文の複製を含まない。TOGAF は The Open Group の登録商標。

An unofficial TOGAF-based consulting server. Start with \`consult\` for situational advice, use the reference tools for specifics, track work with the engagement tools, and show progress with the Markdown or live browser dashboard. Not affiliated with The Open Group; the knowledge base is original summary material, not a reproduction of the standard.`;

/**
 * 全ツールの入力スキーマを strict にする。
 *
 * SDK の既定では、生シェイプ(`{ a: z.string() }`)は `z.object()` に包まれ、
 * **未知のキーは黙って捨てられる**。そのため `relations` を `relationships` と
 * 打ち間違えても「関係 0 件」の空の結果が返るだけで、原因が利用者に分からない。
 * ここで一括して `.strict()` を付け、綴り違いをその場でエラーとして返す。
 *
 * 各ツール側は生シェイプのまま書けるので、型推論(引数の型付け)は一切変わらない。
 */
function strictifyToolSchemas(server: McpServer): void {
  /**
   * 入れ子の中まで strict にする。
   *
   * トップレベルだけを `.strict()` にしても、`risks[0].levle` のような
   * **配列要素の中の綴り違いは黙って捨てられる**。critical のリスクが medium で
   * 保存され、しかも「更新しました」と返るため利用者は気づけない。
   *
   * zod のスキーマは複数のツールで共有されているので、その場で書き換えて全体に効かせる。
   * 循環参照に備えて訪問済みを記録する。
   */
  const deepStrict = (node: unknown, seen: Set<unknown>): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const def = (node as { _def?: Record<string, unknown> })._def;
    if (!def) return;

    if (def.typeName === 'ZodObject') {
      def.unknownKeys = 'strict';
      const shape = typeof def.shape === 'function' ? (def.shape as () => unknown)() : def.shape;
      if (shape && typeof shape === 'object') {
        for (const child of Object.values(shape)) deepStrict(child, seen);
      }
      return;
    }
    // 配列・任意・既定値・null 許容・union・intersection・record などを辿る
    for (const key of ['type', 'innerType', 'schema', 'valueType', 'keyType', 'left', 'right']) {
      deepStrict(def[key], seen);
    }
    for (const key of ['options', 'items']) {
      const list = def[key];
      if (Array.isArray(list)) for (const child of list) deepStrict(child, seen);
    }
  };

  type ToolConfig = { inputSchema?: unknown } & Record<string, unknown>;
  const original = server.registerTool.bind(server) as (
    name: string,
    config: ToolConfig,
    cb: unknown,
  ) => unknown;

  (server as unknown as { registerTool: unknown }).registerTool = (
    name: string,
    config: ToolConfig,
    cb: unknown,
  ) => {
    const shape = config?.inputSchema;
    // 生シェイプ(プレーンオブジェクト)のときだけ包む。既に Zod スキーマなら触らない。
    const isRawShape =
      shape !== null &&
      typeof shape === 'object' &&
      !('_def' in (shape as object)) &&
      !('_zod' in (shape as object));
    if (isRawShape) {
      const seen = new Set<unknown>();
      for (const child of Object.values(shape as z.ZodRawShape)) deepStrict(child, seen);
      const strict = z.object(shape as z.ZodRawShape).strict();
      return original(name, { ...config, inputSchema: strict }, cb);
    }
    if (shape) deepStrict(shape, new Set());
    return original(name, config, cb);
  };
}

/** 全ツールを登録した McpServer を返す */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  strictifyToolSchemas(server);

  // 入口: 何をすればいいか分からない人はここから
  registerGuideTools(server);
  // 知識・参照系
  registerKnowledgeTools(server);
  registerFrameworkTools(server);
  registerBusinessArchitectureTools(server);
  registerArchiMateTools(server);
  registerArchiMateReferenceTools(server);
  registerSecurityTools(server);
  // コンサルティング
  registerConsultTool(server);
  // エンゲージメント(単数の作成/更新 + 複数案件の一覧・切替)
  registerEngagementTools(server);
  registerEngagementListTools(server);
  // 分析・レビュー・ロードマップ
  registerAnalysisTools(server);
  // Claude が構造化した項目の機械的な突き合わせ(矛盾・表記ゆれ・数値/単位の食い違い)
  registerInspectTools(server);
  registerReviewTools(server);
  registerRoadmapTools(server);
  // 図・ダッシュボード・書き出し
  registerDiagramTools(server);
  registerDashboardTools(server);
  // Start 画面(ブラウザで預かる)と、その預かりものを Claude が受け取る経路
  registerIntakeTools(server);
  registerExportTools(server);
  registerArchiMateExportTools(server);
  // 既存ドキュメントの取り込みと、任意の Claude API 連携
  registerDocumentTools(server);
  registerLlmTools(server);
  // 知識の鮮度と一次情報への導線
  registerSourceTools(server);
  // MCP prompts / resources
  registerPrompts(server);
  registerResources(server);

  return server;
}
