/**
 * ダッシュボード系ツール / Dashboard tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Lang } from '../knowledge/index.js';
import { loadEngagement } from '../engagement/store.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
import { browserSuppressed, openBrowser, startDashboard } from '../dashboard/httpServer.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/**
 * 表の絞り込み指定 / How much of each table to show.
 * `get_dashboard` と `get_engagement` で同じ引数名にする(片方にしか無い引数を案内文に書くと、
 * 利用者はその通りに呼べない)。
 */
export const dashboardCompactSchema = z
  .boolean()
  .optional()
  .describe(
    '各表を上位のみに絞る。未指定なら多いときだけ自動、false で全件 / Trim each table to its top rows; omit for automatic, false for every row.',
  );

export const dashboardLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe(
    '1 表あたりの件数(既定 20、compact=true なら 5)。指定でその件数に絞る / Rows per table (default 20; 5 when compact=true).',
  );

export function registerDashboardTools(server: McpServer): void {
  server.registerTool(
    'get_dashboard',
    {
      title: 'Get the dashboard as Markdown',
      description:
        '現在の案件の状態を Markdown ダッシュボードで返す(会話内表示・コピペ・印刷向け)。件数が多いと各表を上位のみに絞り、絞った旨を表示する。 / Return the current engagement as a Markdown dashboard for chat, copy, and print. Large tables are trimmed to their top rows, always saying so.',
      inputSchema: {
        lang: langSchema,
        compact: dashboardCompactSchema,
        limit: dashboardLimitSchema,
      },
    },
    async ({ lang, compact, limit }) => {
      try {
        return textResult(
          renderDashboardMarkdown(loadEngagement(), lang as Lang, { compact, limit }),
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return errorResult(
          msg(
            `ダッシュボードの生成に失敗しました: ${detail}`,
            `Failed to render the dashboard: ${detail}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  server.registerTool(
    'open_dashboard',
    {
      title: 'Open the live dashboard in a browser',
      description:
        'ローカル HTTP サーバー(127.0.0.1)を起動し、ブラウザでライブダッシュボードを開いて URL を返す。SSE で状態変更を検知して自動更新、印刷用 CSS 付き。 / Start a local HTTP server on 127.0.0.1, open the live dashboard in a browser, and return the URL. It live-updates over SSE and carries print CSS.',
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
        } else if (browserSuppressed()) {
          out.push(
            `- ${msg(
              'ブラウザは開いていません(環境変数 TOGAF_EAP_NO_BROWSER が設定されています)。上の URL を手で開いてください。',
              'Browser not launched (TOGAF_EAP_NO_BROWSER is set). Open the URL above manually.',
              l,
            )}`,
          );
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
