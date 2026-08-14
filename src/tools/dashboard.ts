/**
 * ダッシュボード系ツール / Dashboard tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Lang } from '../knowledge/index.js';
import { loadEngagement } from '../engagement/store.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
import { openBrowser, startDashboard } from '../dashboard/httpServer.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

export function registerDashboardTools(server: McpServer): void {
  server.registerTool(
    'get_dashboard',
    {
      title: 'Get the dashboard as Markdown',
      description:
        '現在のエンゲージメント状態を、会話内表示・コピペ・印刷に適した Markdown ダッシュボードとして返す。 / Return the current engagement as a Markdown dashboard suited to reading in chat, copying, and printing.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      return textResult(renderDashboardMarkdown(loadEngagement(), lang as Lang));
    },
  );

  server.registerTool(
    'open_dashboard',
    {
      title: 'Open the live dashboard in a browser',
      description:
        'ローカル HTTP サーバー(127.0.0.1)を起動してブラウザでライブダッシュボードを開き、URL を返す。既に起動していれば既存の URL を返す。ページは SSE で状態ファイルの変更を検知して自動更新する。印刷用 CSS 付き。 / Start a local HTTP server on 127.0.0.1, open the live dashboard in a browser, and return the URL. If it is already running, the existing URL is returned. The page live-updates over SSE when the state file changes and carries print CSS.',
      inputSchema: {
        lang: langSchema,
        open: z
          .boolean()
          .default(true)
          .describe('ブラウザを自動で開く / Launch the browser automatically'),
      },
    },
    async ({ lang, open }) => {
      const l = lang as Lang;
      try {
        const info = await startDashboard(l);
        if (open) openBrowser(info.url);

        const engagement = loadEngagement();
        const out: string[] = [];
        out.push(
          msg(
            info.alreadyRunning ? '# ダッシュボードは起動済みです' : '# ダッシュボードを起動しました',
            info.alreadyRunning ? '# Dashboard already running' : '# Dashboard started',
            l,
          ),
        );
        out.push('');
        out.push(`- URL: ${info.url}`);
        out.push(`- ${msg('状態ファイル', 'State file', l)}: \`${info.statePath}\``);
        out.push(
          `- ${msg('ライブ更新', 'Live updates', l)}: SSE (\`${info.url}events\`), API: \`${info.url}api/state\``,
        );
        if (!open) {
          out.push(`- ${msg('ブラウザは開いていません(open=false)', 'Browser not launched (open=false)', l)}`);
        }
        out.push('');
        if (!engagement) {
          out.push(
            msg(
              'エンゲージメントが未作成のため、ページは空の状態を表示します。`start_engagement` で開始すると即座に反映されます。',
              'No engagement exists yet, so the page shows an empty state. Run `start_engagement` and it updates immediately.',
              l,
            ),
          );
        } else {
          out.push(
            msg(
              `案件「${engagement.name}」を表示しています。\`update_engagement\` で更新すると、ブラウザ側は自動で再描画されます。`,
              `Showing "${engagement.name}". Any \`update_engagement\` call redraws the page automatically.`,
              l,
            ),
          );
        }
        return textResult(out.join('\n'));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return errorResult(
          msg(
            `ダッシュボードの起動に失敗しました: ${detail}`,
            `Failed to start the dashboard: ${detail}`,
            l,
          ),
        );
      }
    },
  );
}
