/**
 * MCP サーバーの生成と全ツールの登録 / MCP server construction and tool registration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerConsultTool } from './tools/consult.js';
import { registerEngagementTools } from './tools/engagement.js';
import { registerDashboardTools } from './tools/dashboard.js';

export const SERVER_NAME = 'togaf10-eap-mcp';
export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = `TOGAF 10 EAP MCP — TOGAF Standard 10th Edition (Enterprise Architecture Practitioner) をベースにした非公式のコンサルティングサーバー。

使い分け:
- 状況を相談されたら、まず \`consult\` に状況を自由記述で渡す。関連フェーズ・技法・成果物・アクション・確認質問が返る。
- 個別の知識は \`get_adm_phase\` / \`get_technique\` / \`get_deliverable\` / \`get_glossary_term\`、横断検索は \`search_togaf\`。
- 案件として追跡するなら \`start_engagement\` → \`update_engagement\`。状態は JSON に永続化される。
- 進捗を見せるときは \`get_dashboard\`(Markdown)、ブラウザで常時表示するなら \`open_dashboard\`(SSE ライブ更新・印刷用 CSS 付き)。

注記: 本サーバーは非公式であり The Open Group とは無関係。知識ベースは独自の要約・解説であり、TOGAF 標準の原文の複製を含まない。TOGAF は The Open Group の登録商標。

An unofficial TOGAF-based consulting server. Start with \`consult\` for situational advice, use the reference tools for specifics, track work with the engagement tools, and show progress with the Markdown or live browser dashboard. Not affiliated with The Open Group; the knowledge base is original summary material, not a reproduction of the standard.`;

/** 全ツールを登録した McpServer を返す */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerKnowledgeTools(server);
  registerConsultTool(server);
  registerEngagementTools(server);
  registerDashboardTools(server);

  return server;
}
