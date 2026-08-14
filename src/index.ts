#!/usr/bin/env node
/**
 * エントリポイント / Entry point.
 * stdio トランスポートで MCP サーバーを起動する。
 *
 * stdout は JSON-RPC 専用のため、ログはすべて stderr に出す。
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { stopDashboard } from './dashboard/httpServer.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${SERVER_VERSION} ready on stdio`);

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[${SERVER_NAME}] received ${signal}, shutting down`);
    await stopDashboard().catch(() => undefined);
    await server.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] fatal:`, error);
  process.exit(1);
});
