/**
 * Claude Messages API への最小クライアント / Minimal Claude Messages API client.
 *
 * ## なぜ公式 SDK(@anthropic-ai/sdk)を使わないのか
 * このプロジェクトは依存を `@modelcontextprotocol/sdk` と `zod` の 2 つだけに保つ方針
 * (npm 依存の追加禁止)。Claude API 連携は「任意の追加経路」であって必須機能ではないため、
 * そのために依存木を増やす価値がないと判断した。Messages API は HTTP + JSON の薄い API で、
 * ここで使う範囲(1 往復のテキスト生成・構造化出力・トークン数え)は Node 標準の `fetch`
 * だけで過不足なく書ける。将来 SDK を入れる決断をしても、この層を差し替えるだけで済むよう
 * 呼び出し側には `callClaude` / `countClaudeTokens` しか見せていない。
 *
 * Rationale for hand-rolled HTTP instead of the official SDK: this server intentionally keeps
 * its dependency list to two packages. Claude API access is an optional extra path, not a core
 * feature, so it is implemented with Node's built-in `fetch`. Callers only see `callClaude` /
 * `countClaudeTokens`, so swapping in the SDK later would be a local change.
 *
 * ## 秘密情報の扱い
 * API キーは環境変数からのみ読み、ログ・戻り値・エラーメッセージに一切載せない。
 * The API key is read from the environment only and never appears in any output.
 */

/** Messages API エンドポイント */
const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
/** トークン数えエンドポイント */
const COUNT_TOKENS_ENDPOINT = 'https://api.anthropic.com/v1/messages/count_tokens';
/** anthropic-version ヘッダ値 */
const ANTHROPIC_VERSION = '2023-06-01';

/** 既定モデル(日付サフィックスを付けない) */
const DEFAULT_MODEL = 'claude-opus-5';

/**
 * 指定可能なモデル(参考表示用。ここに無い文字列も環境変数で指定できる)。
 * このクライアントは常に `output_config.effort` と構造化出力を送るため、
 * **その 2 つを両方サポートするモデルだけ**を挙げる。
 * 例えば Haiku 4.5 は effort 非対応で、指定すると全リクエストが 400 になるので載せない。
 * Only models that support BOTH `output_config.effort` and structured outputs are listed here,
 * because this client always sends them (Haiku 4.5 rejects `effort`).
 */
export const KNOWN_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8'] as const;

/** API キーの環境変数名 */
export const API_KEY_ENV = 'ANTHROPIC_API_KEY';
/** モデル上書き用の環境変数名 */
export const MODEL_ENV = 'TOGAF_EAP_CLAUDE_MODEL';

/**
 * 既定の max_tokens。
 * claude-opus-5 では thinking が既定でオンで、**思考トークンも max_tokens に含まれる**。
 * 小さく取ると「思考だけで枠を使い切り本文が空/途中切れ」になるため、
 * 非ストリーミングで安全に扱える上限いっぱいを既定にする。
 * On claude-opus-5 thinking is on by default and counts against max_tokens, so the default is
 * the full non-streaming ceiling — a small budget yields truncated or empty answers.
 */
const DEFAULT_MAX_TOKENS = 16000;
/** 非ストリーミングで安全に扱える上限(これ以上はストリーミングが必要) */
const MAX_MAX_TOKENS = 16000;
/**
 * 既定タイムアウト。思考 + 本文で最大 16000 トークン出る可能性があるため長めに取る
 * (呼び出し側は options.timeoutMs で短くできる)。
 * Generous by default because thinking + output can reach max_tokens; callers can shorten it.
 */
const DEFAULT_TIMEOUT_MS = 300_000;
/** 429 の再試行で待ってよい上限 */
const MAX_RETRY_WAIT_MS = 10_000;

/** 思考の深さ / Thinking depth. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeOptions {
  /** システムプロンプト */
  system?: string;
  /** 最大出力トークン(既定 16000。16000 を超える指定は 16000 に丸める。思考トークンも含む) */
  maxTokens?: number;
  /** 思考の深さ(既定 'medium') */
  effort?: ClaudeEffort;
  /** モデル ID(既定は getClaudeModel()) */
  model?: string;
  /** タイムアウト(ミリ秒、既定 300000) */
  timeoutMs?: number;
  /** 指定時は構造化出力(JSON Schema)を要求する */
  jsonSchema?: Record<string, unknown>;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeResult {
  /** 応答テキストが得られたか。false のときは error に理由が入る */
  ok: boolean;
  /** 応答テキスト(text ブロックを連結したもの) */
  text?: string;
  /** jsonSchema 指定時にパースできた JSON */
  json?: unknown;
  /** 'end_turn' | 'max_tokens' | 'refusal' など */
  stopReason?: string;
  usage?: ClaudeUsage;
  /**
   * 失敗理由。ok:true でも警告が入ることがある
   * (max_tokens による途中切れ、構造化出力の JSON パース失敗など)。
   * Populated on failure; may also carry a warning while ok is true.
   */
  error?: string;
}

/** ANTHROPIC_API_KEY が設定されているか / Whether an API key is configured. */
export function isClaudeApiAvailable(): boolean {
  return readApiKey() !== null;
}

/** 使用するモデル ID / The model id in effect. */
export function getClaudeModel(): string {
  const override = process.env[MODEL_ENV];
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();
  return DEFAULT_MODEL;
}

/**
 * Claude に 1 往復のリクエストを投げる。
 * 例外は投げない。すべての失敗は ok:false と error 文字列で返す。
 * Never throws: every failure is returned as ok:false with an error string.
 */
export async function callClaude(prompt: string, options: ClaudeOptions = {}): Promise<ClaudeResult> {
  const apiKey = readApiKey();
  if (apiKey === null) {
    return {
      ok: false,
      error: `${API_KEY_ENV} が設定されていないため Claude API を呼べません。 / ${API_KEY_ENV} is not set.`,
    };
  }

  const model = pickModel(options.model);
  const timeoutMs = pickTimeout(options.timeoutMs);

  // output_config に effort と format(構造化出力)を同居させる。
  // temperature / top_p / top_k / thinking.budget_tokens は claude-opus-5 では 400 になるため送らない。
  const outputConfig: Record<string, unknown> = { effort: options.effort ?? 'medium' };
  if (options.jsonSchema !== undefined) {
    outputConfig.format = { type: 'json_schema', schema: options.jsonSchema };
  }

  const payload: Record<string, unknown> = {
    model,
    max_tokens: clampMaxTokens(options.maxTokens),
    messages: [{ role: 'user', content: prompt }],
    output_config: outputConfig,
  };
  if (typeof options.system === 'string' && options.system.length > 0) {
    payload.system = options.system;
  }

  let outcome = await postJson(MESSAGES_ENDPOINT, payload, apiKey, timeoutMs);

  // 429 は retry-after を見て 1 回だけ待って再試行する(上限 10 秒)。
  if (outcome.status === 429 && outcome.retryAfterMs !== undefined && outcome.retryAfterMs <= MAX_RETRY_WAIT_MS) {
    await sleep(outcome.retryAfterMs);
    outcome = await postJson(MESSAGES_ENDPOINT, payload, apiKey, timeoutMs);
  }

  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? '不明なエラー / Unknown error' };
  }

  return interpretMessage(outcome.body, options.jsonSchema !== undefined);
}

/**
 * トークン数を数える。API が使えない・失敗した場合は null。
 * Returns null when the API is unavailable or the call fails.
 */
export async function countClaudeTokens(text: string, model?: string): Promise<number | null> {
  const apiKey = readApiKey();
  if (apiKey === null) return null;

  const payload: Record<string, unknown> = {
    model: pickModel(model),
    messages: [{ role: 'user', content: text }],
  };

  const outcome = await postJson(COUNT_TOKENS_ENDPOINT, payload, apiKey, DEFAULT_TIMEOUT_MS);
  if (!outcome.ok) return null;
  if (!isRecord(outcome.body)) return null;
  const n = outcome.body.input_tokens;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// 内部実装 / Internals
// ---------------------------------------------------------------------------

/** API キーを読む。空文字は未設定として扱う。値はここから外に出さない */
function readApiKey(): string | null {
  const raw = process.env[API_KEY_ENV];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickModel(model?: string): string {
  if (typeof model === 'string' && model.trim().length > 0) return model.trim();
  return getClaudeModel();
}

function pickTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DEFAULT_TIMEOUT_MS;
}

function clampMaxTokens(maxTokens?: number): number {
  if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens)) return DEFAULT_MAX_TOKENS;
  return Math.min(MAX_MAX_TOKENS, Math.max(1, Math.floor(maxTokens)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface HttpOutcome {
  ok: boolean;
  /** HTTP ステータス。0 はネットワークエラー/タイムアウト */
  status: number;
  body: unknown;
  retryAfterMs?: number;
  error?: string;
}

/** JSON を POST する。例外は投げず HttpOutcome に畳む */
async function postJson(
  url: string,
  payload: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<HttpOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();
    const body = safeJsonParse(rawText);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        error: describeHttpError(response.status, body),
      };
    }

    return { ok: true, status: response.status, body };
  } catch (err) {
    // API キーがエラー文に混ざらないよう、こちらで文言を組み立てる。
    const detail = timedOut
      ? `${formatDuration(timeoutMs)} でタイムアウトしました / timed out after ${formatDuration(timeoutMs)}`
      : `ネットワークエラー: ${describeUnknownError(err)} / network error`;
    return { ok: false, status: 0, body: undefined, error: `Claude API に接続できませんでした(${detail})。` };
  } finally {
    clearTimeout(timer);
  }
}

/** ミリ秒を読める長さ表記にする(1 秒未満は ms のまま出す) */
function formatDuration(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`;
}

function safeJsonParse(raw: string): unknown {
  if (raw.trim().length === 0) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** 例外オブジェクトから安全な短い説明だけを取り出す */
function describeUnknownError(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message.slice(0, 200);
  return 'unknown';
}

/** retry-after(秒)をミリ秒に。日付形式や不正値は undefined */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number.parseFloat(value.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.ceil(seconds * 1000);
}

/** HTTP エラー本文から error.message を拾って読める文にする */
function describeHttpError(status: number, body: unknown): string {
  let message = '';
  if (isRecord(body) && isRecord(body.error)) {
    const m = body.error.message;
    if (typeof m === 'string') message = m;
  }
  const hint = status === 401 || status === 403
    ? ` ${API_KEY_ENV} の値が正しいか確認してください。 / Check the configured API key.`
    : status === 429
      ? ' レート制限に達しました。しばらく待って再試行してください。 / Rate limited.'
      : status >= 500
        ? ' サーバー側の一時的な問題の可能性があります。 / Server-side issue; retry later.'
        : '';
  const detail = message.length > 0 ? `: ${message}` : '';
  return `Claude API が HTTP ${status} を返しました / The Claude API returned HTTP ${status}${detail}。${hint}`.trim();
}

/** Messages API の成功レスポンスを ClaudeResult に変換する */
function interpretMessage(body: unknown, expectJson: boolean): ClaudeResult {
  if (!isRecord(body)) {
    return { ok: false, error: 'Claude API のレスポンスを解釈できませんでした / Unparseable response.' };
  }

  const stopReason = typeof body.stop_reason === 'string' ? body.stop_reason : undefined;
  const usage = extractUsage(body.usage);

  // content[0] を無条件に読まない。まず stop_reason を見る。
  if (stopReason === 'refusal') {
    const category = extractRefusalCategory(body.stop_details);
    const suffix = category !== undefined ? `(理由カテゴリ: ${category})` : '';
    return {
      ok: false,
      stopReason,
      usage,
      error:
        `モデルがこの依頼への回答を控えました${suffix}。入力内容を見直すか、ホスト側の LLM で解釈してください。 / ` +
        'The model declined this request; revise the input or interpret it with the host LLM.',
    };
  }

  const text = extractText(body.content);

  if (text.length === 0) {
    return {
      ok: false,
      stopReason,
      usage,
      error: `Claude API がテキストを返しませんでした(stop_reason=${stopReason ?? 'unknown'}) / No text returned.`,
    };
  }

  const result: ClaudeResult = { ok: true, text, stopReason, usage };

  if (stopReason === 'max_tokens') {
    result.error =
      '出力が max_tokens に達して途中で切れています。max_tokens を増やすか対象テキストを分割してください。 / ' +
      'Output was truncated at max_tokens.';
  }

  if (expectJson) {
    const parsed = safeJsonParse(text);
    if (parsed === undefined) {
      const note = '構造化出力を JSON として解釈できませんでした(テキストとして扱います) / Could not parse structured output as JSON.';
      result.error = result.error === undefined ? note : `${result.error} ${note}`;
    } else {
      result.json = parsed;
    }
  }

  return result;
}

function extractRefusalCategory(stopDetails: unknown): string | undefined {
  if (!isRecord(stopDetails)) return undefined;
  const category = stopDetails.category;
  return typeof category === 'string' && category.length > 0 ? category : undefined;
}

/** text ブロックをすべて連結する(複数あり得る) */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type !== 'text') continue;
    if (typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('').trim();
}

function extractUsage(usage: unknown): ClaudeUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (typeof input !== 'number' || typeof output !== 'number') return undefined;
  return { inputTokens: input, outputTokens: output };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
