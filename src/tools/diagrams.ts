/**
 * 図生成ツール / Diagram tools.
 *
 * TOGAF の実務が「分厚くて退屈」になる最大の原因は、成果物が文章の塊で返ってくることにある。
 * このモジュールは同じ情報を Mermaid の図として返し、図の下に必ず
 * 「この図から読み取ること」と「次の一手」を添える。図を出して終わりにしない。
 *
 * Mermaid は Claude / GitHub / Artifacts でそのまま描画されるため、追加の作図ツールを
 * 立ち上げずに会話の中で図が出る。ノード ID は連番の英数字に正規化し、表示名はラベルに逃がす
 * (日本語・空白・記号は Mermaid の ID に使えない)。
 *
 * Diagram-first output. Every tool returns a Mermaid code block plus a short
 * "what to read from it / what to do next" section, in Japanese and English.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  bullets,
  findPhase,
  text,
  type AdmPhase,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import { loadEngagement } from '../engagement/store.js';
import {
  INFLUENCE_LEVELS,
  PHASE_STATUSES,
  RISK_LEVELS,
  RISK_STATUSES,
  WORK_PACKAGE_STATUSES,
} from '../engagement/model.js';
import type {
  Engagement,
  InfluenceLevel,
  PhaseStatus,
  RiskLevel,
  RiskStatus,
  WorkPackageStatus,
} from '../engagement/model.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

// ---------------------------------------------------------------------------
// 小さな共通ヘルパ / Small shared helpers
// ---------------------------------------------------------------------------

/** 日英ペアを 1 行で作る */
function bi(ja: string, en: string): Bilingual {
  return { ja, en };
}

/** 見出しなど 1 行の日英併記 */
function line(ja: string, en: string, lang: Lang): string {
  return text(bi(ja, en), lang);
}

/**
 * Mermaid のラベルとして安全な文字列にする。
 * ここが図生成で最も壊れやすい箇所なので、入口で一括して潰しておく。
 */
function labelOf(raw: string, max = 44): string {
  const cleaned = (raw ?? '')
    .replace(/[\r\n\t]+/g, ' ') // 改行はラベルを破壊する
    .replace(/"/g, "'") // ダブルクォートはラベルの終端記号
    .replace(/#/g, '＃') // '#' は Mermaid のエンティティ記法の開始文字
    .replace(/[[\]{}<>]/g, ' ') // ノード形状を表す記号
    .replace(/[|\\]/g, '/') // '|' はエッジラベルの区切り
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/** 空になったラベルを代替名で埋める */
function safeLabel(raw: string, fallback: string, max = 44): string {
  const value = labelOf(raw, max);
  return value.length > 0 ? value : fallback;
}

/** quadrantChart / gantt の項目名。コロンとカンマは構文の区切りなので落とす。 */
function plainOf(raw: string, fallback: string, max = 30): string {
  const value = labelOf(raw, max)
    .replace(/[:,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length > 0 ? value : fallback;
}

/** 日英併記のラベル(both のときは 2 行にする) */
function biLabel(value: Bilingual, lang: Lang, max = 32): string {
  const ja = safeLabel(value.ja, '(未設定)', max);
  const en = safeLabel(value.en, '(unnamed)', max);
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return ja === en ? ja : `${ja}<br/>${en}`;
}

/** 英語側の単数・複数を選ぶ小さなヘルパ */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Markdown の表・箇条書きに素の名前を入れるときの整形。
 * 改行は行を割り、`|` は列を増やして表を丸ごと崩すので、図と同じく入口で潰す。
 */
function md(raw: string | undefined | null, fallback = '-', max = 60): string {
  const cleaned = (raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return fallback;
  const trimmed = cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
  return trimmed.replace(/\|/g, '\\|');
}

/**
 * 保存済み JSON から読んだ値を既知の候補に丸める。
 * 状態ファイルは手で編集できるうえ、版が上がれば知らない値も入る。
 * 未知の値でそのまま索引を引くと undefined が図の座標に流れ込み、壊れた Mermaid を吐く。
 */
function oneOf<T extends string>(values: readonly T[], raw: unknown, fallback: T): T {
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** 未知の値を集めて 1 行で報告する(黙って既定値に丸めると原因が追えない) */
function unknownValueNote(unknown: string[], lang: Lang): string[] {
  if (unknown.length === 0) return [];
  const list = Array.from(new Set(unknown)).slice(0, 8).map((v) => md(v, '(空)', 24)).join(', ');
  return [
    msg(
      `案件データに未知の値が含まれていたため、既定値として描画しました: ${list}。保存ファイルを手で編集した場合は綴りを確認してください。`,
      `The engagement data contains values this tool does not know, so they were drawn with defaults: ${list}. If you edited the saved file by hand, check the spelling.`,
      lang,
    ),
    '',
  ];
}

/** 連番のノード ID を払い出す(日本語名をそのまま ID にしないため) */
function idGen(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${n}`;
  };
}

/** Mermaid のコードブロックに包む */
function mermaid(lines: string[]): string {
  return ['```mermaid', ...lines, '```'].join('\n');
}

/** 名前の突き合わせ用に正規化する(大文字小文字・前後空白・全角空白を吸収) */
function normalizeName(raw: string): string {
  return raw.replace(/[\s　]+/g, ' ').trim().toLowerCase();
}

/**
 * 図の下に必ず付ける「読み取ること / 次の一手」。
 * 図だけ出して解釈を読み手に丸投げするのが、既存の EA ツールの一番の失敗パターン。
 */
function readingGuide(lang: Lang, items: Bilingual[]): string {
  return [
    '',
    `## ${line('この図の読み方と次の一手', 'How to read this and what to do next', lang)}`,
    '',
    bullets(items, lang),
  ].join('\n');
}

/** 引数が足りないときに「何を渡せばよいか」を返す(空の壊れた図を出さない) */
function needInput(lang: Lang, titleJa: string, titleEn: string, hints: Bilingual[], example: string): ToolResult {
  return textResult(
    [
      `# ${line(titleJa, titleEn, lang)}`,
      '',
      msg(
        '図を描くためのデータがまだありません。次のどちらかを渡してください。',
        'There is no data to draw yet. Provide one of the following.',
        lang,
      ),
      '',
      bullets(hints, lang),
      '',
      msg('引数の例:', 'Example arguments:', lang),
      '',
      '```json',
      example,
      '```',
    ].join('\n'),
  );
}

/** ツールハンドラの例外を必ず errorResult に落とす */
function guard(lang: Lang, fn: () => ToolResult): ToolResult {
  try {
    return fn();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResult(
      msg(`図の生成に失敗しました: ${detail}`, `Failed to generate the diagram: ${detail}`, lang),
    );
  }
}

/** 現在のエンゲージメントを安全に読む(壊れていても図は出す) */
function tryLoadEngagement(): Engagement | null {
  try {
    return loadEngagement();
  } catch {
    return null;
  }
}

/** データ元を 1 行で明示する */
function sourceLine(engagement: Engagement | null, usedEngagement: boolean, lang: Lang): string {
  if (usedEngagement && engagement) {
    return msg(
      `> データ元: 案件「${md(engagement.name, '(名称未設定)', 40)}」の登録内容`,
      `> Source: registered data of engagement "${md(engagement.name, '(unnamed)', 40)}"`,
      lang,
    );
  }
  return msg('> データ元: 引数で渡された内容', '> Source: the arguments passed to this tool', lang);
}

// ---------------------------------------------------------------------------
// 1. ADM 循環図 / ADM cycle
// ---------------------------------------------------------------------------

/** フェーズ状態ごとの Mermaid クラス名 */
const PHASE_CLASS: Record<PhaseStatus, string> = {
  completed: 'donePhase',
  in_progress: 'doingPhase',
  not_started: 'todoPhase',
  skipped: 'skipPhase',
};

/** 状態の表示記号(絵文字を使わず印刷でも潰れない記号にする) */
const PHASE_MARK: Record<PhaseStatus, Bilingual> = {
  completed: bi('● 完了', '● done'),
  in_progress: bi('◐ 進行中', '◐ in progress'),
  not_started: bi('○ 未着手', '○ not started'),
  skipped: bi('— 対象外', '— skipped'),
};

/** 「フェーズ A: 」のような接頭辞を落として短い表示名にする */
function shortPhaseLabel(phase: AdmPhase, lang: Lang): string {
  const ja = phase.name.ja.replace(/^フェーズ\s*[A-H]\s*[:：]\s*/, '');
  const en = phase.name.en.replace(/^Phase\s+[A-H]\s*:\s*/, '');
  const body = biLabel(bi(ja, en), lang, 26);
  // 'Preliminary' のような長いコードは名前と重複するので付けない
  return phase.code.length <= 2 ? `${phase.code}. ${body}` : body;
}

function registerAdmCycle(server: McpServer): void {
  server.registerTool(
    'diagram_adm_cycle',
    {
      title: 'Draw the ADM cycle with current progress',
      description:
        'ADM の循環を Mermaid の図で返す。要件管理を中心に置き、完了・進行中・未着手・対象外を色分けし、現在フェーズを強調する。エンゲージメントがあればその進捗を自動で反映し、無ければ引数から描く。図の下に現在フェーズでやることを添える。 / Draw the ADM cycle as a Mermaid diagram with Requirements Management at the centre, colour-coded by phase status and highlighting the current phase. Uses the current engagement when one exists, otherwise the arguments, and lists what to do in the current phase.',
      inputSchema: {
        currentPhase: z
          .string()
          .optional()
          .describe('現在のフェーズ ID (preliminary, a〜h, requirements-management) / Current ADM phase id'),
        completed: z
          .array(z.string())
          .default([])
          .describe('完了済みフェーズ ID の配列 / Phase ids already completed'),
        lang: langSchema,
      },
    },
    async ({ currentPhase, completed, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        const engagement = tryLoadEngagement();
        const unknown: string[] = [];
        const unknownValues: string[] = [];

        // 既定は全フェーズ未着手。エンゲージメントがあればその状態で上書きする。
        const statuses = new Map<string, PhaseStatus>();
        for (const phase of ADM_PHASES) statuses.set(phase.id, 'not_started');
        if (engagement) {
          for (const progress of engagement.phases) {
            if (!statuses.has(progress.phaseId)) continue;
            const status = oneOf(PHASE_STATUSES, progress.status, 'not_started');
            if (status !== progress.status) unknownValues.push(String(progress.status));
            statuses.set(progress.phaseId, status);
          }
        }
        // 引数は最後に効かせる(その場の仮説を試せるように)
        for (const raw of completed) {
          const phase = findPhase(raw);
          if (!phase) {
            unknown.push(raw);
            continue;
          }
          statuses.set(phase.id, 'completed');
        }

        const currentRaw = currentPhase ?? engagement?.currentPhaseId;
        const current = currentRaw ? findPhase(currentRaw) : undefined;
        if (currentRaw && !current) unknown.push(currentRaw);
        if (current && statuses.get(current.id) !== 'completed') {
          statuses.set(current.id, 'in_progress');
        }

        const ordered = [...ADM_PHASES].sort((a, b) => a.order - b.order);
        const ring = ordered.filter((p) => p.id !== 'requirements-management');
        const rm = ordered.find((p) => p.id === 'requirements-management');

        // ノード ID は order 由来の連番にする(フェーズ ID にはハイフンが含まれるため)
        const nodeId = new Map<string, string>();
        ring.forEach((phase, index) => nodeId.set(phase.id, `p${index}`));
        if (rm) nodeId.set(rm.id, 'rm');

        const lines: string[] = ['flowchart TD'];
        for (const phase of ring) {
          lines.push(`  ${nodeId.get(phase.id)}["${shortPhaseLabel(phase, l)}"]`);
        }
        if (rm) lines.push(`  rm(["${biLabel(rm.name, l, 24)}"])`);

        // 予備フェーズ → A → … → H、H から次サイクルへ戻す
        for (let i = 0; i < ring.length - 1; i += 1) {
          lines.push(`  ${nodeId.get(ring[i].id)} --> ${nodeId.get(ring[i + 1].id)}`);
        }
        const first = ring.find((p) => p.id === 'a');
        const last = ring[ring.length - 1];
        if (first && last && first.id !== last.id) {
          lines.push(
            `  ${nodeId.get(last.id)} -.->|"${labelOf(line('次サイクル', 'next cycle', l), 20)}"| ${nodeId.get(first.id)}`,
          );
        }
        // 要件管理は全フェーズと双方向にやり取りする関係なので、破線で中心に据える
        if (rm) {
          for (const phase of ring) {
            if (phase.id === 'preliminary') continue;
            lines.push(`  ${nodeId.get(phase.id)} -.- rm`);
          }
        }

        lines.push('  classDef donePhase fill:#d4efdf,stroke:#1e8449,color:#145a32;');
        lines.push('  classDef doingPhase fill:#fdebd0,stroke:#ca6f1e,color:#7e5109,stroke-width:3px;');
        lines.push('  classDef todoPhase fill:#f4f6f6,stroke:#aab7b8,color:#566573;');
        lines.push('  classDef skipPhase fill:#eaeded,stroke:#ccd1d1,color:#909497;');
        lines.push('  classDef rmNode fill:#e8daef,stroke:#7d3c98,color:#4a235a;');

        const byClass = new Map<string, string[]>();
        for (const phase of ring) {
          const status = statuses.get(phase.id) ?? 'not_started';
          const cls = PHASE_CLASS[status];
          const list = byClass.get(cls) ?? [];
          list.push(nodeId.get(phase.id) ?? '');
          byClass.set(cls, list);
        }
        for (const [cls, ids] of byClass) {
          if (ids.length > 0) lines.push(`  class ${ids.join(',')} ${cls};`);
        }
        if (rm) lines.push('  class rm rmNode;');
        if (current && current.id !== 'requirements-management') {
          lines.push(`  style ${nodeId.get(current.id)} stroke-width:4px,stroke:#b9770e;`);
        }

        const out: string[] = [];
        out.push(`# ${line('ADM サイクルと進捗', 'ADM cycle and progress', l)}`);
        out.push('');
        out.push(sourceLine(engagement, engagement !== null, l));
        out.push('');
        out.push(mermaid(lines));
        out.push('');

        // 状態一覧。図だけだと「どれがどの状態か」を目で追う手間が残る。
        out.push(`| ${line('フェーズ', 'Phase', l)} | ${line('状態', 'Status', l)} |`);
        out.push('| --- | --- |');
        for (const phase of ordered) {
          const status = statuses.get(phase.id) ?? 'not_started';
          const mark = text(PHASE_MARK[status], l);
          const isCurrent = current?.id === phase.id ? ' ←' : '';
          out.push(`| ${text(phase.name, l)}${isCurrent} | ${mark} |`);
        }
        out.push('');

        if (unknown.length > 0) {
          const ignored = unknown.map((u) => md(u, '(空)', 24)).join(', ');
          out.push(
            msg(
              `未知のフェーズ ID を無視しました: ${ignored}(有効な ID: ${ADM_PHASES.map((p) => p.id).join(', ')})`,
              `Ignored unknown phase ids: ${ignored} (valid ids: ${ADM_PHASES.map((p) => p.id).join(', ')})`,
              l,
            ),
          );
          out.push('');
        }
        out.push(...unknownValueNote(unknownValues, l));

        if (current) {
          out.push(`### ${line(`いま「${current.code}」でやること`, `What to do in phase ${current.code} now`, l)}`);
          out.push('');
          out.push(bullets(current.steps.slice(0, 3), l));
          out.push('');
        }

        const guideItems: Bilingual[] = [];
        const doneCount = ring.filter((p) => statuses.get(p.id) === 'completed').length;
        guideItems.push(
          bi(
            `循環図の外周が作業の順序、中心の要件管理は全フェーズと常時やり取りする関係。完了 ${doneCount}/${ring.length} フェーズ。`,
            `The outer ring is the working order; Requirements Management at the centre exchanges with every phase throughout. ${doneCount} of ${ring.length} phases complete.`,
          ),
        );
        if (current) {
          guideItems.push(
            bi(
              `色が濃い ${current.code} が現在地。上の「いまやること」を今週の作業に落とし、終わったら次フェーズを進行中にする。`,
              `The highlighted ${current.code} is where you are. Turn the steps above into this week's work, then move the next phase to in progress.`,
            ),
          );
        } else {
          guideItems.push(
            bi(
              '現在フェーズが未設定。まず currentPhase を指定するか、案件を作って現在フェーズを登録する。',
              'No current phase is set. Pass currentPhase, or create an engagement and record the current phase.',
            ),
          );
        }
        guideItems.push(
          bi(
            '未着手のまま飛ばしたフェーズが後半に固まっているなら、それは省略ではなく先送り。対象外にするなら理由を決定記録に残す。',
            'If the not-started phases cluster in the second half, that is deferral rather than tailoring. If you really skip one, record why as a decision.',
          ),
        );
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 2. ビジネス能力マップ / Business capability map
// ---------------------------------------------------------------------------

type Heat = 'low' | 'medium' | 'high';

const HEAT_CLASS: Record<Heat, string> = {
  low: 'heatLow',
  medium: 'heatMid',
  high: 'heatHigh',
};

const HEAT_FILL: Record<Heat, string> = {
  low: 'fill:#d4efdf,stroke:#1e8449,color:#145a32',
  medium: 'fill:#fdebd0,stroke:#ca6f1e,color:#7e5109',
  high: 'fill:#fadbd8,stroke:#c0392b,color:#7b241c',
};

const HEAT_LABEL: Record<Heat, Bilingual> = {
  low: bi('低(現状で足りている)', 'low (adequate today)'),
  medium: bi('中(改善余地あり)', 'medium (needs improvement)'),
  high: bi('高(投資の焦点)', 'high (investment focus)'),
};

interface CapabilityInput {
  name: string;
  level?: number;
  parent?: string;
  heat?: Heat;
}

interface CapabilityNode {
  id: string;
  name: string;
  heat?: Heat;
  level: number;
  parent: number | null;
  children: number[];
}

/**
 * 入力を木に組み立てる。
 * parent 指定と level 指定のどちらでも書けるようにする(現場のメモはたいてい混在する)。
 */
function buildCapabilityTree(input: CapabilityInput[]): CapabilityNode[] {
  const nextId = idGen('c');
  const nodes: CapabilityNode[] = input.map((cap) => ({
    id: nextId(),
    name: cap.name,
    heat: cap.heat,
    level: 1,
    parent: null,
    children: [],
  }));

  const byName = new Map<string, number>();
  input.forEach((cap, index) => {
    const key = normalizeName(cap.name);
    if (key.length > 0 && !byName.has(key)) byName.set(key, index);
  });

  // 明示された親名を解決する(自分自身は無視)
  const explicitParent: (number | null)[] = input.map((cap, index) => {
    if (!cap.parent) return null;
    const found = byName.get(normalizeName(cap.parent));
    return found === undefined || found === index ? null : found;
  });

  // level だけが書かれている場合は、直前の 1 つ上の階層にぶら下げる
  const lastAtLevel = new Map<number, number>();
  input.forEach((cap, index) => {
    const parentIndex = explicitParent[index];
    let level: number;
    if (typeof cap.level === 'number' && Number.isFinite(cap.level)) {
      level = Math.min(Math.max(Math.trunc(cap.level), 1), 5);
    } else {
      level = parentIndex !== null ? nodes[parentIndex].level + 1 : 1;
    }
    let parent = parentIndex;
    if (parent === null && level > 1) {
      const candidate = lastAtLevel.get(level - 1);
      parent = candidate === undefined ? null : candidate;
    }
    if (parent === null) level = 1;
    nodes[index].level = level;
    nodes[index].parent = parent;
    lastAtLevel.set(level, index);
    for (const key of Array.from(lastAtLevel.keys())) {
      if (key > level) lastAtLevel.delete(key);
    }
  });

  // 循環参照は根に戻す(手書きの親子指定は必ずどこかで循環する)
  nodes.forEach((node, index) => {
    const seen = new Set<number>([index]);
    let cursor = node.parent;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        node.parent = null;
        node.level = 1;
        break;
      }
      seen.add(cursor);
      cursor = nodes[cursor].parent;
    }
  });

  nodes.forEach((node, index) => {
    if (node.parent !== null) nodes[node.parent].children.push(index);
  });
  return nodes;
}

function registerCapabilityMap(server: McpServer): void {
  server.registerTool(
    'diagram_capability_map',
    {
      title: 'Draw a business capability map',
      description:
        'ビジネス能力マップを Mermaid の階層図で返す。親子関係を subgraph で表し、ヒート(低/中/高)で投資の焦点を色分けする。フェーズ B の議論を文章ではなく 1 枚の図に載せるためのツール。 / Draw a business capability map as a nested Mermaid diagram, with hierarchy shown as subgraphs and heat (low/medium/high) shown as colour. Turns the Phase B conversation into one picture instead of prose.',
      inputSchema: {
        capabilities: z
          .array(
            z.object({
              name: z.string().min(1).describe('能力の名前 / Capability name'),
              level: z
                .number()
                .int()
                .min(1)
                .max(5)
                .optional()
                .describe('階層 (1 が最上位) / Level, 1 being the top'),
              parent: z.string().optional().describe('親能力の名前 / Name of the parent capability'),
              heat: z
                .enum(['low', 'medium', 'high'])
                .optional()
                .describe('ヒート(改善の必要度) / Heat, i.e. how badly it needs investment'),
            }),
          )
          .default([])
          .describe('能力の一覧 / The capabilities to map'),
        title: z.string().optional().describe('図のタイトル / Diagram title'),
        lang: langSchema,
      },
    },
    async ({ capabilities, title, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        if (capabilities.length === 0) {
          return needInput(
            l,
            'ビジネス能力マップ',
            'Business capability map',
            [
              bi(
                'capabilities に能力を並べる。親子は parent(親の名前)か level(1 が最上位)のどちらでも書ける。',
                'List the capabilities. Express hierarchy with parent (the parent name) or with level, where 1 is the top.',
              ),
              bi(
                'heat は low / medium / high。「今つらいところ」だけ high にする。全部 high にすると図が意思決定に使えなくなる。',
                'Set heat to low / medium / high. Mark only what actually hurts today as high; a map where everything is high cannot drive a decision.',
              ),
            ],
            `{
  "capabilities": [
    { "name": "顧客管理", "level": 1 },
    { "name": "顧客情報の統合", "parent": "顧客管理", "heat": "high" },
    { "name": "問い合わせ対応", "parent": "顧客管理", "heat": "medium" },
    { "name": "商品供給", "level": 1 },
    { "name": "需要予測", "parent": "商品供給", "heat": "high" }
  ]
}`,
          );
        }

        const nodes = buildCapabilityTree(capabilities as CapabilityInput[]);
        const roots = nodes
          .map((node, index) => ({ node, index }))
          .filter((entry) => entry.node.parent === null)
          .map((entry) => entry.index);

        const heatMembers: Record<Heat, string[]> = { low: [], medium: [], high: [] };
        const groupStyles: string[] = [];

        const render = (index: number, depth: number, indent: string): string[] => {
          const node = nodes[index];
          const label = safeLabel(node.name, '(名称未設定)', 30);
          if (node.children.length === 0) {
            if (node.heat) heatMembers[node.heat].push(node.id);
            return [`${indent}${node.id}["${label}"]`];
          }
          // 深すぎる入れ子は読めなくなるので、3 段目からは平らに並べる
          if (depth >= 2) {
            const out = [`${indent}${node.id}["${label}"]`];
            if (node.heat) heatMembers[node.heat].push(node.id);
            for (const child of node.children) {
              out.push(...render(child, depth + 1, indent));
              // 入れ子をやめた分、親子関係は線で残す。並べただけでは兄弟に見えてしまう。
              out.push(`${indent}${node.id} --> ${nodes[child].id}`);
            }
            return out;
          }
          if (node.heat) groupStyles.push(`  style ${node.id} ${HEAT_FILL[node.heat]};`);
          const out = [`${indent}subgraph ${node.id}["${label}"]`];
          if (depth === 0) out.push(`${indent}  direction TB`);
          for (const child of node.children) out.push(...render(child, depth + 1, `${indent}  `));
          out.push(`${indent}end`);
          return out;
        };

        const lines: string[] = ['flowchart LR'];
        for (const root of roots) lines.push(...render(root, 0, '  '));
        lines.push('  classDef heatLow fill:#d4efdf,stroke:#1e8449,color:#145a32;');
        lines.push('  classDef heatMid fill:#fdebd0,stroke:#ca6f1e,color:#7e5109;');
        lines.push('  classDef heatHigh fill:#fadbd8,stroke:#c0392b,color:#7b241c;');
        for (const heat of ['low', 'medium', 'high'] as Heat[]) {
          const ids = heatMembers[heat];
          if (ids.length > 0) lines.push(`  class ${ids.join(',')} ${HEAT_CLASS[heat]};`);
        }
        lines.push(...groupStyles);

        const highNames = nodes.filter((n) => n.heat === 'high').map((n) => n.name);
        const noHeat = nodes.filter((n) => !n.heat && n.children.length === 0).length;

        const out: string[] = [];
        out.push(`# ${title ? labelOf(title, 60) : line('ビジネス能力マップ', 'Business capability map', l)}`);
        out.push('');
        out.push(
          msg(
            `能力 ${nodes.length} 件 / 最上位 ${roots.length} 件 / ヒート「高」${highNames.length} 件`,
            `${nodes.length} ${plural(nodes.length, 'capability', 'capabilities')}, ${roots.length} top-level ${plural(roots.length, 'group', 'groups')}, ${highNames.length} marked high`,
            l,
          ),
        );
        out.push('');
        out.push(mermaid(lines));
        out.push('');
        out.push(`${line('凡例', 'Legend', l)}:`);
        out.push('');
        out.push(bullets((['high', 'medium', 'low'] as Heat[]).map((h) => HEAT_LABEL[h]), l));
        out.push('');

        if (nodes.length > 40) {
          out.push(
            msg(
              `能力が ${nodes.length} 件あります。1 枚に 40 件を超えると読み手が全体を把握できません。最上位ごとに分割して描き直すことを勧めます。`,
              `There are ${nodes.length} capabilities. Past about 40 on one page the reader stops seeing the whole. Split the map by top-level group.`,
              l,
            ),
          );
          out.push('');
        }

        const guideItems: Bilingual[] = [];
        guideItems.push(
          bi(
            '能力は「何ができるか」であって組織図でも system 一覧でもない。部署名がそのまま並んでいたら、それは能力マップではなく組織図。',
            'A capability is what the business can do — not an org chart and not a system list. If the boxes read like department names, you drew an org chart.',
          ),
        );
        if (highNames.length > 0) {
          const shown = highNames.slice(0, 3).map((n) => labelOf(n, 20));
          const moreJa = highNames.length > shown.length ? ' ほか' : '';
          const moreEn = highNames.length > shown.length ? ' and others' : '';
          guideItems.push(
            bi(
              `赤い ${highNames.length} 件(${shown.join('、')}${moreJa})が投資の候補。次はこの能力を支えるアプリケーションとデータを洗い出し、ギャップ分析につなげる。`,
              `The ${highNames.length} red ${plural(highNames.length, 'item', 'items')} (${shown.join(', ')}${moreEn}) ${plural(highNames.length, 'is', 'are')} the investment ${plural(highNames.length, 'candidate', 'candidates')}. Next, list the applications and data behind those capabilities and feed the gap analysis.`,
            ),
          );
        } else {
          guideItems.push(
            bi(
              'ヒートが未設定のため、どこに投資すべきかが図から読み取れない。関係者に「今いちばん困っている能力」を 3 つ選ばせて high を付ける。',
              'No heat is set, so the map cannot say where to invest. Ask the stakeholders to name the three capabilities that hurt most today and mark them high.',
            ),
          );
        }
        if (noHeat > 0) {
          guideItems.push(
            bi(
              `ヒート未設定の末端が ${noHeat} 件。全部に色を付ける必要はないが、白いままの能力は「議論していない能力」として扱う。`,
              `${noHeat} leaf ${plural(noHeat, 'capability has', 'capabilities have')} no heat. You do not need to colour everything, but treat the uncoloured ones as "not yet discussed".`,
            ),
          );
        }
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 3. バリューストリーム / Value stream
// ---------------------------------------------------------------------------

function registerValueStream(server: McpServer): void {
  server.registerTool(
    'diagram_value_stream',
    {
      title: 'Draw a value stream',
      description:
        'バリューストリームを左から右への Mermaid 図で返す。各段階に紐づくビジネス能力をぶら下げ、能力が紐づいていない段階を指摘する。能力マップと組み合わせると「どの段階のどの能力が弱いか」まで一気に見える。 / Draw a value stream left to right in Mermaid, hanging the supporting capabilities under each stage and flagging stages with no capability attached. Paired with the capability map it shows which capability in which stage is weak.',
      inputSchema: {
        name: z.string().min(1).describe('バリューストリームの名前 / Name of the value stream'),
        stages: z
          .array(
            z.object({
              name: z.string().min(1).describe('段階の名前 / Stage name'),
              capabilities: z
                .array(z.string())
                .default([])
                .describe('その段階を支える能力 / Capabilities that enable the stage'),
            }),
          )
          .default([])
          .describe('段階の一覧(左から右の順) / Stages in order, left to right'),
        lang: langSchema,
      },
    },
    async ({ name, stages, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        if (stages.length === 0) {
          return needInput(
            l,
            'バリューストリーム',
            'Value stream',
            [
              bi(
                'stages に段階を左から右の順で並べる。段階名は動詞で書く(「受注する」「出荷する」)。名詞だと工程表になり、価値の流れが見えなくなる。',
                'List the stages in order. Name them with verbs ("take the order", "ship"). Nouns turn it into a process list and the flow of value disappears.',
              ),
              bi(
                '各段階の capabilities に、その段階を支える能力名を書く。能力マップと同じ名前を使うと 2 枚の図がつながる。',
                'Under each stage, list the capabilities that enable it. Reuse the names from the capability map so the two diagrams line up.',
              ),
            ],
            `{
  "name": "受注から出荷まで",
  "stages": [
    { "name": "引き合いを受ける", "capabilities": ["顧客管理", "見積作成"] },
    { "name": "受注する", "capabilities": ["与信判定", "受注管理"] },
    { "name": "出荷する", "capabilities": ["在庫管理", "配送手配"] }
  ]
}`,
          );
        }

        const nextStageId = idGen('s');
        const nextCapId = idGen('vc');
        const lines: string[] = ['flowchart LR'];
        const stageIds: string[] = [];
        const emptyStages: string[] = [];
        let capabilityCount = 0;

        stages.forEach((stage, index) => {
          const id = nextStageId();
          stageIds.push(id);
          const stageLabel = `${index + 1}. ${safeLabel(stage.name, '(名称未設定)', 26)}`;
          const caps = stage.capabilities.filter((c) => labelOf(c, 26).length > 0);
          if (caps.length === 0) {
            emptyStages.push(stage.name);
            lines.push(`  ${id}["${stageLabel}"]`);
            return;
          }
          lines.push(`  subgraph ${id}["${stageLabel}"]`);
          lines.push('    direction TB');
          for (const cap of caps) {
            capabilityCount += 1;
            lines.push(`    ${nextCapId()}(["${safeLabel(cap, '(名称未設定)', 26)}"])`);
          }
          lines.push('  end');
        });

        for (let i = 0; i < stageIds.length - 1; i += 1) {
          lines.push(`  ${stageIds[i]} --> ${stageIds[i + 1]}`);
        }
        // 1 段階しかない場合でもノードは出ているので図は壊れない

        const out: string[] = [];
        out.push(`# ${line('バリューストリーム', 'Value stream', l)}: ${labelOf(name, 60)}`);
        out.push('');
        out.push(
          msg(
            `段階 ${stages.length} 件 / 紐づく能力 ${capabilityCount} 件`,
            `${stages.length} ${plural(stages.length, 'stage', 'stages')}, ${capabilityCount} ${plural(capabilityCount, 'capability', 'capabilities')} attached`,
            l,
          ),
        );
        out.push('');
        out.push(mermaid(lines));
        out.push('');

        if (emptyStages.length > 0) {
          out.push(
            msg(
              `能力が紐づいていない段階: ${emptyStages.map((s) => labelOf(s, 20)).join('、')}。ここは「誰がどうやってこの段階を回しているか」が誰も説明できない箇所である可能性が高い。`,
              `Stages with no capability attached: ${emptyStages.map((s) => labelOf(s, 20)).join(', ')}. These are usually the steps nobody can explain who actually performs, or how.`,
              l,
            ),
          );
          out.push('');
        }
        if (stages.length > 7) {
          out.push(
            msg(
              `段階が ${stages.length} 件あります。バリューストリームの段階が 7 を超えると、それは業務フロー図に近づいています。粒度を上げるか、別のストリームに割ってください。`,
              `There are ${stages.length} stages. Past seven, a value stream turns into a process flow. Raise the level of abstraction or split it into separate streams.`,
              l,
            ),
          );
          out.push('');
        }

        const guideItems: Bilingual[] = [
          bi(
            '左端の入力から右端の成果まで、価値が誰に届くのかを一直線で確認する。途中で受け手が変わっていたら 2 本のストリームが混ざっている。',
            'Trace the value from the input on the left to the outcome on the right, and check who receives it. If the recipient changes mid-stream, two streams got merged into one.',
          ),
          bi(
            '各段階の下の能力が、その段階の実行主体。同じ能力が複数段階にぶら下がっているなら、そこは全社で最適化する価値がある共通能力。',
            'The capabilities under each stage are what actually performs it. A capability that appears under several stages is a shared one worth optimising enterprise-wide.',
          ),
          bi(
            '次の一手: 各段階のリードタイムと手戻り率を 1 つずつ聞き取り、最も詰まっている段階の能力をヒート「高」にして能力マップへ戻す。',
            'Next: ask for the lead time and rework rate of each stage, then mark the capabilities of the worst stage as high heat on the capability map.',
          ),
        ];
        out.push(readingGuide(l, guideItems));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 4. アプリケーション連携図 / Application landscape
// ---------------------------------------------------------------------------

type AppLayer = 'front' | 'core' | 'back';

const LAYER_ORDER: AppLayer[] = ['front', 'core', 'back'];

const LAYER_LABEL: Record<AppLayer | 'external', Bilingual> = {
  front: bi('フロント(顧客接点・チャネル)', 'Front (channels and customer touchpoints)'),
  core: bi('基幹(業務の中核)', 'Core (systems of record)'),
  back: bi('バックオフィス・情報系', 'Back office and analytics'),
  external: bi('外部(社外・未登録)', 'External or unregistered'),
};

const LAYER_FILL: Record<AppLayer | 'external', string> = {
  front: 'fill:#d6eaf8,stroke:#2471a3,color:#1b4f72',
  core: 'fill:#fdebd0,stroke:#ca6f1e,color:#7e5109',
  back: 'fill:#e8daef,stroke:#7d3c98,color:#4a235a',
  external: 'fill:#eaeded,stroke:#909497,color:#566573',
};

/** 連携本数がこれを超えたら統合基盤の検討を促す */
const INTERFACE_WARN_THRESHOLD = 15;

function registerApplicationLandscape(server: McpServer): void {
  server.registerTool(
    'diagram_application_landscape',
    {
      title: 'Draw an application landscape',
      description:
        'アプリケーションと連携を層ごとの Mermaid 図で返す。接続数の多いアプリを特定し、連携が 15 本を超える場合は点対点連携の限界として統合基盤の検討を促す。フェーズ C の現状把握をそのまま議論できる 1 枚にする。 / Draw applications and their interfaces as a layered Mermaid diagram, identify the most connected applications, and warn past 15 interfaces that point-to-point integration is reaching its limit. Turns the Phase C baseline into one discussable picture.',
      inputSchema: {
        applications: z
          .array(
            z.object({
              name: z.string().min(1).describe('アプリケーション名 / Application name'),
              layer: z
                .enum(['front', 'core', 'back'])
                .optional()
                .describe('層 / Layer: front, core, or back'),
              owner: z.string().optional().describe('所管部門・責任者 / Owning department or person'),
            }),
          )
          .default([])
          .describe('アプリケーションの一覧 / The applications'),
        interfaces: z
          .array(
            z.object({
              from: z.string().min(1).describe('連携元のアプリ名 / Source application name'),
              to: z.string().min(1).describe('連携先のアプリ名 / Target application name'),
              kind: z
                .string()
                .optional()
                .describe('連携の種類(日次バッチ、REST API など) / Kind of interface'),
            }),
          )
          .default([])
          .describe('連携の一覧 / The interfaces'),
        lang: langSchema,
      },
    },
    async ({ applications, interfaces, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        if (applications.length === 0 && interfaces.length === 0) {
          return needInput(
            l,
            'アプリケーション連携図',
            'Application landscape',
            [
              bi(
                'applications にアプリ名と層(front / core / back)を並べる。層を省くと基幹として扱う。',
                'List the applications with a layer (front / core / back). Anything without a layer is treated as core.',
              ),
              bi(
                'interfaces に from / to / kind を並べる。台帳が無い場合は「毎日動いているバッチ」から挙げると漏れが少ない。',
                'List the interfaces as from / to / kind. With no register to work from, start from the batches that run every night — that catches most of them.',
              ),
            ],
            `{
  "applications": [
    { "name": "EC サイト", "layer": "front" },
    { "name": "受注管理", "layer": "core", "owner": "営業部" },
    { "name": "会計", "layer": "back" }
  ],
  "interfaces": [
    { "from": "EC サイト", "to": "受注管理", "kind": "REST API" },
    { "from": "受注管理", "to": "会計", "kind": "日次バッチ" }
  ]
}`,
          );
        }

        const nextAppId = idGen('a');
        const byName = new Map<string, { id: string; name: string; layer: AppLayer | 'external'; owner?: string }>();
        const groups: Record<AppLayer | 'external', string[]> = { front: [], core: [], back: [], external: [] };

        const register = (rawName: string, layer: AppLayer | 'external', owner?: string): string => {
          const key = normalizeName(rawName);
          const existing = byName.get(key);
          if (existing) return existing.id;
          const entry = { id: nextAppId(), name: rawName, layer, owner };
          byName.set(key, entry);
          groups[layer].push(entry.id);
          return entry.id;
        };

        for (const app of applications) {
          register(app.name, app.layer ?? 'core', app.owner);
        }

        // 連携先が未登録なら「外部」として拾う(台帳が不完全なのは常態)
        const edges: { from: string; to: string; kind?: string }[] = [];
        const seenEdges = new Set<string>();
        const degree = new Map<string, number>();
        const bump = (id: string): void => {
          degree.set(id, (degree.get(id) ?? 0) + 1);
        };

        for (const iface of interfaces) {
          const fromId = register(iface.from, 'external');
          const toId = register(iface.to, 'external');
          if (fromId === toId) continue; // 自己ループは図を汚すだけ
          const key = `${fromId}>${toId}>${normalizeName(iface.kind ?? '')}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          edges.push({ from: fromId, to: toId, kind: iface.kind });
          bump(fromId);
          bump(toId);
        }

        const lines: string[] = ['flowchart TB'];
        const layers: (AppLayer | 'external')[] = [...LAYER_ORDER, 'external'];
        const nextGroupId = idGen('lg');
        for (const layer of layers) {
          const ids = groups[layer];
          if (ids.length === 0) continue;
          const groupId = nextGroupId();
          lines.push(`  subgraph ${groupId}["${labelOf(text(LAYER_LABEL[layer], l), 64)}"]`);
          lines.push('    direction LR');
          for (const id of ids) {
            const entry = Array.from(byName.values()).find((e) => e.id === id);
            if (!entry) continue;
            const owner = entry.owner ? `<br/>(${safeLabel(entry.owner, '-', 18)})` : '';
            lines.push(`    ${id}["${safeLabel(entry.name, '(名称未設定)', 26)}${owner}"]`);
          }
          lines.push('  end');
          lines.push(`  style ${groupId} ${LAYER_FILL[layer]};`);
        }
        for (const edge of edges) {
          const kind = edge.kind ? labelOf(edge.kind, 20) : '';
          lines.push(kind.length > 0 ? `  ${edge.from} -->|"${kind}"| ${edge.to}` : `  ${edge.from} --> ${edge.to}`);
        }

        const apps = Array.from(byName.values());
        const hotspots = apps
          .map((app) => ({ app, count: degree.get(app.id) ?? 0 }))
          .filter((entry) => entry.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        const isolated = apps.filter((app) => (degree.get(app.id) ?? 0) === 0);
        const externals = groups.external.length;

        const out: string[] = [];
        out.push(`# ${line('アプリケーション連携図', 'Application landscape', l)}`);
        out.push('');
        out.push(
          msg(
            `アプリ ${apps.length} 件(うち未登録・外部 ${externals} 件) / 連携 ${edges.length} 本`,
            `${apps.length} ${plural(apps.length, 'application', 'applications')} (${externals} external or unregistered), ${edges.length} ${plural(edges.length, 'interface', 'interfaces')}`,
            l,
          ),
        );
        out.push('');
        out.push(mermaid(lines));
        out.push('');

        if (hotspots.length > 0) {
          out.push(`### ${line('接続数の多いアプリケーション', 'Most connected applications', l)}`);
          out.push('');
          out.push(`| ${line('アプリケーション', 'Application', l)} | ${line('接続数', 'Connections', l)} |`);
          out.push('| --- | ---: |');
          for (const entry of hotspots) {
            out.push(`| ${md(entry.app.name, '(名称未設定)', 40)} | ${entry.count} |`);
          }
          out.push('');
        }

        if (edges.length > INTERFACE_WARN_THRESHOLD) {
          const pointToPoint = edges.length;
          out.push(`### ${line('警告: 点対点連携が限界に近い', 'Warning: point-to-point integration is at its limit', l)}`);
          out.push('');
          out.push(
            bullets(
              [
                bi(
                  `連携が ${pointToPoint} 本あります。点対点で繋ぐ限り、保守すべき接続はアプリを 1 つ足すたびに増え続けます。`,
                  `There are ${pointToPoint} interfaces. As long as they are point-to-point, the number of connections to maintain grows every time an application is added.`,
                ),
                bi(
                  '統合基盤(API ゲートウェイ、イベント基盤、データ連携基盤のいずれか)を 1 枚挟むと、接続数はアプリ数に近づきます。まずは接続数の多い上位のアプリから寄せます。',
                  'Putting one integration layer in the middle — an API gateway, an event backbone, or a data integration platform — brings the count closer to the number of applications. Start with the most connected ones.',
                ),
                bi(
                  'ただし統合基盤の導入自体が目的化しやすい点に注意。「どの連携を廃止できるか」を先に決めてから基盤を選ぶこと。',
                  'Beware of making the platform itself the goal. Decide which interfaces you can retire first, then choose the platform.',
                ),
                bi(
                  'この判断はフェーズ E(機会とソリューション)の作業パッケージとして登録し、移行アーキテクチャに位置づけます。',
                  'Record this as a Phase E work package and place it in a transition architecture.',
                ),
              ],
              l,
            ),
          );
          out.push('');
        }

        if (isolated.length > 0) {
          out.push(
            msg(
              `どこともつながっていないアプリ: ${isolated.map((a) => labelOf(a.name, 20)).join('、')}。本当に孤立しているのか、連携が台帳に載っていないだけかを確認してください。後者であることがほとんどです。`,
              `Applications with no interface: ${isolated.map((a) => labelOf(a.name, 20)).join(', ')}. Check whether they are genuinely isolated or the interface is simply missing from the register. It is usually the latter.`,
              l,
            ),
          );
          out.push('');
        }

        const guideItems: Bilingual[] = [];
        guideItems.push(
          bi(
            '層をまたいで矢印が飛び交っているほど、変更の影響範囲が読めない状態。フロントから基幹を飛ばしてバックへ直結している線は特に危険。',
            'The more arrows cross layers, the harder it is to predict the blast radius of a change. A line that jumps from front straight to back, bypassing core, is the dangerous one.',
          ),
        );
        if (hotspots.length > 0) {
          guideItems.push(
            bi(
              `${labelOf(hotspots[0].app.name, 20)} が事実上の統合ハブになっています。ここを止める変更は全社に波及するため、変更手順とオーナーを先に決めます。`,
              `${labelOf(hotspots[0].app.name, 20)} is acting as the de facto integration hub. Any change that stops it ripples across the company, so agree its change procedure and owner first.`,
            ),
          );
        }
        if (externals > 0) {
          guideItems.push(
            bi(
              `applications に登録が無い相手が ${externals} 件あります。外部サービスなら契約とデータの越境を、社内なら台帳の抜けを確認します。`,
              `${externals} ${plural(externals, 'endpoint is', 'endpoints are')} not in the application list. If they are external services, check the contract and any data leaving the organisation; if internal, the register has gaps.`,
            ),
          );
        }
        guideItems.push(
          bi(
            '次の一手: 各連携に「何のデータが、どの頻度で、誰の責任で流れているか」を 1 行ずつ足す。これが揃った時点でデータアーキテクチャの議論が始められる。',
            'Next: add one line per interface saying what data flows, how often, and who owns it. Once that exists you can start the data architecture conversation.',
          ),
        );
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 5. ロードマップのガントチャート / Roadmap gantt
// ---------------------------------------------------------------------------

interface QuarterRange {
  start: string;
  end: string;
  /** 並べ替え用の通し番号 */
  key: number;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** 'YYYY-Qn' を日付の範囲に変換する(例: 2026-Q3 → 2026-07-01 〜 2026-09-30) */
function parseQuarter(raw: string | undefined | null): QuarterRange | null {
  if (!raw) return null;
  const match = /^\s*(\d{4})\s*[-/ ]?\s*[Qq]\s*([1-4])\s*$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const endDay = endMonth === 3 || endMonth === 12 ? 31 : 30;
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${endDay}`,
    key: year * 4 + quarter,
  };
}

/**
 * 開始と終了が逆転していたら入れ替える。
 * そのまま棒にすると Mermaid は長さが負の棒を描こうとし、図が黙って嘘をつく。
 */
function orderRange(a: QuarterRange, b: QuarterRange): { from: QuarterRange; to: QuarterRange; swapped: boolean } {
  return b.key < a.key ? { from: b, to: a, swapped: true } : { from: a, to: b, swapped: false };
}

/** 作業パッケージの状態を gantt のタグに写す */
const WP_TAG: Record<WorkPackageStatus, string> = {
  proposed: '',
  planned: '',
  in_progress: 'active',
  delivered: 'done',
  cancelled: 'crit',
};

/**
 * 中止した作業は crit タグで赤く出る。赤い棒は「緊急」と読まれるので、名前側にも書いておく。
 */
function statusMark(status: WorkPackageStatus, name: string, lang: Lang): string {
  if (status !== 'cancelled') return name;
  return `${name} (${plainOf(line('中止', 'cancelled', lang), 'cancelled', 20)})`;
}

interface GanttTask {
  section: string;
  name: string;
  tag: string;
  start: string;
  end: string;
  sortKey: number;
  milestone: boolean;
}

function registerRoadmapGantt(server: McpServer): void {
  server.registerTool(
    'diagram_roadmap_gantt',
    {
      title: 'Draw the roadmap as a Gantt chart',
      description:
        '移行ロードマップを Mermaid のガントチャートで返す。エンゲージメントの作業パッケージ(YYYY-Qn 表記)と移行アーキテクチャから自動生成し、四半期を日付に変換して移行状態をマイルストーンとして置く。日付未設定の項目と依存関係の矛盾も指摘する。 / Render the migration roadmap as a Mermaid Gantt chart from the engagement work packages (quarters written as YYYY-Qn) and transition architectures, converting quarters to dates and placing transitions as milestones. Also flags undated items and dependency conflicts.',
      inputSchema: {
        items: z
          .array(
            z.object({
              name: z.string().min(1).describe('項目名 / Item name'),
              startQuarter: z.string().optional().describe('開始四半期 (YYYY-Qn) / Start quarter'),
              endQuarter: z.string().optional().describe('終了四半期 (YYYY-Qn) / End quarter'),
              status: z
                .enum(['proposed', 'planned', 'in_progress', 'delivered', 'cancelled'])
                .optional()
                .describe('状態 / Status'),
              section: z.string().optional().describe('区分(移行状態名など) / Section, e.g. transition name'),
              milestone: z.boolean().optional().describe('マイルストーンとして置く / Render as a milestone'),
            }),
          )
          .default([])
          .describe('エンゲージメントを使わない場合の項目 / Items to use when no engagement data exists'),
        title: z.string().optional().describe('図のタイトル / Chart title'),
        useEngagement: z
          .boolean()
          .default(true)
          .describe('エンゲージメントの登録内容を優先する / Prefer the engagement data when it exists'),
        lang: langSchema,
      },
    },
    async ({ items, title, useEngagement, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        const engagement = tryLoadEngagement();
        const fromEngagement =
          useEngagement === true &&
          engagement !== null &&
          (engagement.workPackages.length > 0 || engagement.transitions.length > 0);

        const tasks: GanttTask[] = [];
        const undated: Bilingual[] = [];
        const conflicts: Bilingual[] = [];
        const reversed: Bilingual[] = [];
        const unknownValues: string[] = [];
        const unnamedSection = line('未割当', 'Unassigned', l);

        if (fromEngagement && engagement) {
          const transitionById = new Map(engagement.transitions.map((t) => [t.id, t]));
          const ranges = new Map<string, QuarterRange>();

          for (const wp of engagement.workPackages) {
            const rawStart = parseQuarter(wp.startQuarter) ?? parseQuarter(wp.endQuarter);
            const rawEnd = parseQuarter(wp.endQuarter) ?? rawStart;
            const transition = wp.transitionId ? transitionById.get(wp.transitionId) : undefined;
            const section = transition ? plainOf(transition.name, unnamedSection, 40) : unnamedSection;
            if (!rawStart || !rawEnd) {
              undated.push(
                bi(
                  `${md(wp.name, '(名称未設定)', 40)}(開始/終了の四半期が未設定)`,
                  `${md(wp.name, '(unnamed)', 40)} (no start or end quarter set)`,
                ),
              );
              continue;
            }
            const { from, to, swapped } = orderRange(rawStart, rawEnd);
            if (swapped) {
              reversed.push(
                bi(
                  `${md(wp.name, '(名称未設定)', 40)}: 終了四半期が開始より前。入れ替えて描いています。`,
                  `${md(wp.name, '(unnamed)', 40)}: the end quarter is before the start. Drawn with the two swapped.`,
                ),
              );
            }
            const status = oneOf(WORK_PACKAGE_STATUSES, wp.status, 'planned');
            if (status !== wp.status) unknownValues.push(String(wp.status));
            ranges.set(wp.id, { start: from.start, end: to.end, key: from.key });
            tasks.push({
              section,
              name: statusMark(status, plainOf(wp.name, '(名称未設定)', 40), l),
              tag: WP_TAG[status],
              start: from.start,
              end: to.end,
              sortKey: from.key,
              milestone: false,
            });
          }

          // 依存関係の矛盾(先行の終わりより前に始まっている)を洗い出す
          for (const wp of engagement.workPackages) {
            const own = ranges.get(wp.id);
            if (!own) continue;
            for (const depId of Array.isArray(wp.dependsOn) ? wp.dependsOn : []) {
              const dep = ranges.get(depId);
              if (!dep) continue;
              if (dep.end > own.start) {
                const depName = engagement.workPackages.find((w) => w.id === depId)?.name ?? depId;
                conflicts.push(
                  bi(
                    `「${md(wp.name, '(名称未設定)', 40)}」は「${md(depName, '(名称未設定)', 40)}」の完了前に始まる予定になっている`,
                    `"${md(wp.name, '(unnamed)', 40)}" is scheduled to start before "${md(depName, '(unnamed)', 40)}" finishes`,
                  ),
                );
              }
            }
          }

          // 移行アーキテクチャの到達時期はマイルストーンとして置く
          for (const transition of [...engagement.transitions].sort((a, b) => a.order - b.order)) {
            const range = parseQuarter(transition.targetQuarter);
            const section = plainOf(transition.name, unnamedSection, 40);
            if (!range) {
              undated.push(
                bi(
                  `${md(transition.name, '(名称未設定)', 40)}(到達目標の四半期が未設定)`,
                  `${md(transition.name, '(unnamed)', 40)} (no target quarter set)`,
                ),
              );
              continue;
            }
            tasks.push({
              section,
              name: plainOf(
                `${transition.name} ${transition.standalone ? line('到達', 'reached', l) : line('到達 (単独では成立しない)', 'reached (not standalone)', l)}`,
                '(milestone)',
                44,
              ),
              tag: 'milestone',
              start: range.end,
              end: range.end,
              sortKey: range.key + 0.5,
              milestone: true,
            });
          }
        } else {
          for (const item of items) {
            const rawStart = parseQuarter(item.startQuarter) ?? parseQuarter(item.endQuarter);
            const rawEnd = parseQuarter(item.endQuarter) ?? rawStart;
            if (!rawStart || !rawEnd) {
              undated.push(
                bi(
                  `${md(item.name, '(名称未設定)', 40)}(四半期が未設定または形式が不正)`,
                  `${md(item.name, '(unnamed)', 40)} (quarter missing or malformed)`,
                ),
              );
              continue;
            }
            const { from, to, swapped } = orderRange(rawStart, rawEnd);
            if (swapped) {
              reversed.push(
                bi(
                  `${md(item.name, '(名称未設定)', 40)}: 終了四半期が開始より前。入れ替えて描いています。`,
                  `${md(item.name, '(unnamed)', 40)}: the end quarter is before the start. Drawn with the two swapped.`,
                ),
              );
            }
            const isMilestone = item.milestone === true;
            const name = plainOf(item.name, '(名称未設定)', 40);
            tasks.push({
              section: item.section ? plainOf(item.section, unnamedSection, 40) : unnamedSection,
              name: item.status && !isMilestone ? statusMark(item.status, name, l) : name,
              tag: isMilestone ? 'milestone' : item.status ? WP_TAG[item.status] : '',
              start: isMilestone ? to.end : from.start,
              end: to.end,
              sortKey: from.key,
              milestone: isMilestone,
            });
          }
        }

        if (tasks.length === 0) {
          const hints: Bilingual[] = [
            bi(
              '案件に作業パッケージを登録し、startQuarter / endQuarter を YYYY-Qn 形式(例: 2026-Q3)で入れる。',
              'Register work packages on the engagement with startQuarter / endQuarter written as YYYY-Qn, for example 2026-Q3.',
            ),
            bi(
              'または items に項目を直接渡す。四半期が入っていない項目は線が引けないため描画されない。',
              'Or pass items directly. Anything without a quarter cannot be drawn as a bar and is skipped.',
            ),
          ];
          if (undated.length > 0) {
            hints.push(
              bi(
                `日付が読み取れなかった項目: ${undated.map((u) => u.ja).join(' / ')}`,
                `Items whose dates could not be read: ${undated.map((u) => u.en).join(' / ')}`,
              ),
            );
          }
          return needInput(
            l,
            'ロードマップ(ガントチャート)',
            'Roadmap Gantt chart',
            hints,
            `{
  "title": "基幹刷新ロードマップ",
  "items": [
    { "name": "現行分析", "startQuarter": "2026-Q3", "endQuarter": "2026-Q4", "status": "in_progress", "section": "移行状態 1" },
    { "name": "受注基盤の切替", "startQuarter": "2027-Q1", "endQuarter": "2027-Q2", "section": "移行状態 1" },
    { "name": "移行状態 1 到達", "endQuarter": "2027-Q2", "milestone": true, "section": "移行状態 1" }
  ]
}`,
          );
        }

        // 区分ごとにまとめ、各区分の中は開始時期順に並べる
        const sections = new Map<string, GanttTask[]>();
        for (const task of tasks) {
          const list = sections.get(task.section) ?? [];
          list.push(task);
          sections.set(task.section, list);
        }
        const sectionOrder = Array.from(sections.entries()).sort((a, b) => {
          const minA = Math.min(...a[1].map((t) => t.sortKey));
          const minB = Math.min(...b[1].map((t) => t.sortKey));
          return minA - minB || a[0].localeCompare(b[0]);
        });

        const chartTitle = plainOf(
          title ?? (fromEngagement && engagement ? engagement.name : line('移行ロードマップ', 'Migration roadmap', l)),
          'Roadmap',
          60,
        );
        const nextTaskId = idGen('t');
        const lines: string[] = ['gantt', `    title ${chartTitle}`, '    dateFormat YYYY-MM-DD', '    axisFormat %Y-%m'];
        for (const [section, list] of sectionOrder) {
          lines.push(`    section ${section}`);
          for (const task of [...list].sort((a, b) => a.sortKey - b.sortKey)) {
            const id = nextTaskId();
            if (task.milestone) {
              lines.push(`    ${task.name} :milestone, ${id}, ${task.start}, 0d`);
              continue;
            }
            const tag = task.tag.length > 0 ? `${task.tag}, ` : '';
            lines.push(`    ${task.name} :${tag}${id}, ${task.start}, ${task.end}`);
          }
        }

        const barCount = tasks.filter((t) => !t.milestone).length;
        const milestoneCount = tasks.length - barCount;
        const span = tasks.reduce(
          (acc, t) => ({
            min: t.start < acc.min ? t.start : acc.min,
            max: t.end > acc.max ? t.end : acc.max,
          }),
          { min: tasks[0].start, max: tasks[0].end },
        );

        const out: string[] = [];
        out.push(`# ${line('移行ロードマップ', 'Migration roadmap', l)}`);
        out.push('');
        out.push(sourceLine(engagement, fromEngagement, l));
        out.push('');
        out.push(
          msg(
            `作業パッケージ ${barCount} 件 / マイルストーン ${milestoneCount} 件 / 期間 ${span.min} 〜 ${span.max}`,
            `${barCount} work ${plural(barCount, 'package', 'packages')}, ${milestoneCount} ${plural(milestoneCount, 'milestone', 'milestones')}, spanning ${span.min} to ${span.max}`,
            l,
          ),
        );
        out.push('');
        out.push(mermaid(lines));
        out.push('');

        if (undated.length > 0) {
          out.push(`### ${line('日付が入っていないため描けなかった項目', 'Items that could not be drawn (no dates)', l)}`);
          out.push('');
          out.push(bullets(undated, l));
          out.push('');
          out.push(
            msg(
              '四半期は `YYYY-Qn` 形式で入れてください(例: 2026-Q3)。時期が決まらない項目は、決めるためのアクションを立てるのが先です。',
              'Write quarters as `YYYY-Qn`, for example 2026-Q3. For anything whose timing is genuinely undecided, the first task is the decision itself.',
              l,
            ),
          );
          out.push('');
        }

        if (reversed.length > 0) {
          out.push(`### ${line('開始と終了が逆転している項目', 'Items whose start and end are reversed', l)}`);
          out.push('');
          out.push(bullets(reversed, l));
          out.push('');
        }

        if (conflicts.length > 0) {
          out.push(`### ${line('依存関係の矛盾', 'Dependency conflicts', l)}`);
          out.push('');
          out.push(bullets(conflicts, l));
          out.push('');
        }

        out.push(...unknownValueNote(unknownValues, l));

        const guideItems: Bilingual[] = [];
        guideItems.push(
          bi(
            '横棒が重なっている期間は、同じ要員と同じ承認者を取り合う期間。ロードマップが破綻するのはたいていここ。',
            'Where the bars overlap, the same people and the same approvers are being contended for. This is where roadmaps usually break.',
          ),
        );
        guideItems.push(
          bi(
            'マイルストーン(◆)は移行アーキテクチャの到達点。そこで一度止めても事業が回る状態になっているかを、線の切れ目ごとに確認する。',
            'Each milestone marks a transition architecture. At every one, check that the business could stop there and still run.',
          ),
        );
        if (conflicts.length > 0) {
          guideItems.push(
            bi(
              '依存関係の矛盾が残っています。前倒しするのか、依存を切るのかを決めるまで、この計画は合意対象になりません。',
              'Dependency conflicts remain. Until you decide whether to pull work forward or break the dependency, this plan is not ready to be agreed.',
            ),
          );
        } else {
          guideItems.push(
            bi(
              '次の一手: 各作業パッケージに便益とその刈り取り責任者を付ける。責任者のいない便益は実現しない。',
              'Next: attach a benefit and a benefit owner to each work package. A benefit with no owner does not get realised.',
            ),
          );
        }
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 6. ステークホルダーマトリクス / Stakeholder matrix
// ---------------------------------------------------------------------------

const LEVEL_VALUE: Record<InfluenceLevel, number> = { low: 0.15, medium: 0.5, high: 0.85 };

const LEVEL_LABEL: Record<InfluenceLevel, Bilingual> = {
  low: bi('低', 'low'),
  medium: bi('中', 'medium'),
  high: bi('高', 'high'),
};

/** 同じ座標に重なった点をわずかにずらす(重なると誰がどこにいるか読めない) */
const JITTER: [number, number][] = [
  [0, 0],
  [0.07, 0.05],
  [-0.07, -0.05],
  [0.07, -0.05],
  [-0.07, 0.05],
  [0, 0.1],
  [0, -0.1],
  [0.12, 0],
  [-0.12, 0],
];

function clamp01(value: number): number {
  return Math.min(0.97, Math.max(0.03, value));
}

interface StakeholderPoint {
  name: string;
  role?: string;
  influence: InfluenceLevel;
  interest: InfluenceLevel;
  concerns: string[];
}

/** 4 象限それぞれの関与方針 */
function engagementApproach(s: StakeholderPoint): Bilingual {
  const highInfluence = s.influence === 'high';
  const highInterest = s.interest === 'high';
  if (highInfluence && highInterest) {
    return bi('密に巻き込む(意思決定の場に同席させる)', 'Manage closely — put them in the decision room');
  }
  if (highInfluence && !highInterest) {
    return bi('満足を保つ(短い要約を定期的に届ける)', 'Keep satisfied — send short summaries on a regular beat');
  }
  if (!highInfluence && highInterest) {
    return bi('情報を届け続ける(詳細の相談相手にする)', 'Keep informed — use them as the detail sounding board');
  }
  return bi('必要最小限の通知にとどめる', 'Monitor with minimal effort');
}

function registerStakeholderMatrix(server: McpServer): void {
  server.registerTool(
    'diagram_stakeholder_matrix',
    {
      title: 'Draw the stakeholder influence/interest matrix',
      description:
        'ステークホルダーを影響力 × 関心度の 4 象限に Mermaid の quadrantChart で配置する。エンゲージメントに登録されていればそれを使い、無ければ引数から描く。象限ごとの関与方針と、最も危険な象限(影響力が高く関心が低い層)への手当てを添える。 / Plot stakeholders on an influence-versus-interest quadrant chart in Mermaid, using the engagement data when it exists and the arguments otherwise, with the engagement approach for each quadrant and specific advice for the most dangerous one: high influence, low interest.',
      inputSchema: {
        stakeholders: z
          .array(
            z.object({
              name: z.string().min(1).describe('氏名または役職 / Name or role'),
              role: z.string().optional().describe('役割 / Role'),
              influence: z.enum(['low', 'medium', 'high']).describe('影響力 / Influence'),
              interest: z.enum(['low', 'medium', 'high']).describe('関心度 / Interest'),
            }),
          )
          .default([])
          .describe('エンゲージメントを使わない場合の一覧 / Stakeholders to use when no engagement data exists'),
        lang: langSchema,
      },
    },
    async ({ stakeholders, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        const engagement = tryLoadEngagement();
        const fromEngagement = engagement !== null && engagement.stakeholders.length > 0;
        const unknownValues: string[] = [];
        const points: StakeholderPoint[] = fromEngagement && engagement
          ? engagement.stakeholders.map((s) => {
              const influence = oneOf(INFLUENCE_LEVELS, s.influence, 'medium');
              const interest = oneOf(INFLUENCE_LEVELS, s.interest, 'medium');
              if (influence !== s.influence) unknownValues.push(String(s.influence));
              if (interest !== s.interest) unknownValues.push(String(s.interest));
              return {
                name: s.name,
                role: s.role,
                influence,
                interest,
                concerns: Array.isArray(s.concerns) ? s.concerns : [],
              };
            })
          : stakeholders.map((s) => ({
              name: s.name,
              role: s.role,
              influence: s.influence,
              interest: s.interest,
              concerns: [],
            }));

        if (points.length === 0) {
          return needInput(
            l,
            'ステークホルダーマトリクス',
            'Stakeholder matrix',
            [
              bi(
                '案件にステークホルダーを登録するか、stakeholders に name / influence / interest を並べる。',
                'Register stakeholders on the engagement, or pass name / influence / interest in stakeholders.',
              ),
              bi(
                '影響力は「この人が反対したら止まるか」、関心度は「自分から状況を聞いてくるか」で判定すると迷わない。',
                'Judge influence by "does it stop if they object?" and interest by "do they ask you for status unprompted?".',
              ),
            ],
            `{
  "stakeholders": [
    { "name": "CFO", "influence": "high", "interest": "low" },
    { "name": "営業本部長", "influence": "high", "interest": "high" },
    { "name": "現場リーダー", "role": "受注業務", "influence": "low", "interest": "high" }
  ]
}`,
          );
        }

        // 同じ座標の重なりを数えてずらす
        const occupancy = new Map<string, number>();
        const usedNames = new Set<string>();
        const pointLines: string[] = [];
        for (const point of points) {
          const key = `${point.influence}|${point.interest}`;
          const seen = occupancy.get(key) ?? 0;
          occupancy.set(key, seen + 1);
          const jitter = JITTER[seen % JITTER.length];
          const extra = Math.floor(seen / JITTER.length) * 0.02;
          const x = clamp01(LEVEL_VALUE[point.interest] + jitter[0] + extra);
          const y = clamp01(LEVEL_VALUE[point.influence] + jitter[1] + extra);
          let name = plainOf(point.name, '(名称未設定)', 24);
          // 同名が並ぶと Mermaid 側で点が上書きされるので連番を付ける
          let suffix = 2;
          while (usedNames.has(name)) {
            name = `${plainOf(point.name, '(名称未設定)', 20)} ${suffix}`;
            suffix += 1;
          }
          usedNames.add(name);
          pointLines.push(`    "${name}": [${x.toFixed(2)}, ${y.toFixed(2)}]`);
        }

        const lines: string[] = [
          'quadrantChart',
          `    title ${plainOf(line('ステークホルダー 影響力 x 関心度', 'Stakeholders: influence x interest', l), 'Stakeholders', 60)}`,
          `    x-axis ${plainOf(line('関心が低い', 'Low interest', l), 'Low interest', 36)} --> ${plainOf(line('関心が高い', 'High interest', l), 'High interest', 36)}`,
          `    y-axis ${plainOf(line('影響力が小さい', 'Low influence', l), 'Low influence', 36)} --> ${plainOf(line('影響力が大きい', 'High influence', l), 'High influence', 36)}`,
          `    quadrant-1 ${plainOf(line('密に巻き込む', 'Manage closely', l), 'Manage closely', 36)}`,
          `    quadrant-2 ${plainOf(line('満足を保つ', 'Keep satisfied', l), 'Keep satisfied', 36)}`,
          `    quadrant-3 ${plainOf(line('必要最小限', 'Monitor', l), 'Monitor', 36)}`,
          `    quadrant-4 ${plainOf(line('情報を届ける', 'Keep informed', l), 'Keep informed', 36)}`,
          ...pointLines,
        ];

        const dangerous = points.filter((p) => p.influence === 'high' && p.interest !== 'high');
        const champions = points.filter((p) => p.influence === 'high' && p.interest === 'high');

        const out: string[] = [];
        out.push(`# ${line('ステークホルダーマトリクス', 'Stakeholder matrix', l)}`);
        out.push('');
        out.push(sourceLine(engagement, fromEngagement, l));
        out.push('');
        if (fromEngagement && stakeholders.length > 0) {
          // 引数を黙って捨てると「渡したのに出てこない」と読み手が混乱する
          out.push(
            msg(
              `引数で渡した ${stakeholders.length} 件は描いていません。案件に登録済みの内容を優先します。引数だけで試す場合は、登録内容を更新するか別の案件に切り替えてください。`,
              `The ${stakeholders.length} ${plural(stakeholders.length, 'stakeholder', 'stakeholders')} passed as arguments ${plural(stakeholders.length, 'was', 'were')} not drawn: the data registered on the engagement takes precedence. To work from arguments alone, update the registered data or switch engagement.`,
              l,
            ),
          );
          out.push('');
        }
        out.push(...unknownValueNote(unknownValues, l));
        out.push(mermaid(lines));
        out.push('');
        out.push(
          `| ${line('氏名・役職', 'Name', l)} | ${line('影響力', 'Influence', l)} | ${line('関心度', 'Interest', l)} | ${line('関与方針', 'Approach', l)} |`,
        );
        out.push('| --- | --- | --- | --- |');
        for (const point of points) {
          const role = point.role ? ` (${md(point.role, '-', 30)})` : '';
          out.push(
            `| ${md(point.name, '(名称未設定)', 40)}${role} | ${text(LEVEL_LABEL[point.influence], l)} | ${text(LEVEL_LABEL[point.interest], l)} | ${text(engagementApproach(point), l)} |`,
          );
        }
        out.push('');

        const withConcerns = points.filter((p) => p.concerns.length > 0);
        if (withConcerns.length > 0) {
          out.push(`### ${line('関心事', 'Concerns', l)}`);
          out.push('');
          for (const point of withConcerns) {
            out.push(`- **${md(point.name, '(名称未設定)', 40)}**: ${md(point.concerns.join(' / '), '-', 200)}`);
          }
          out.push('');
        }

        const guideItems: Bilingual[] = [];
        if (dangerous.length > 0) {
          guideItems.push(
            bi(
              `左上(影響力が高く関心が低い)に ${dangerous.length} 名: ${dangerous.map((p) => md(p.name, '(名称未設定)', 24)).join('、')}。この層が最も危険で、終盤に一言で計画をひっくり返す。今のうちに 1 枚もので合意を取っておく。`,
              `${dangerous.length} ${plural(dangerous.length, 'person sits', 'people sit')} top-left, with high influence and low interest: ${dangerous.map((p) => md(p.name, '(unnamed)', 24)).join(', ')}. This is the dangerous quadrant — they overturn the plan late, in one sentence. Get their agreement now, on a single page.`,
            ),
          );
        }
        if (champions.length > 0) {
          guideItems.push(
            bi(
              `右上の ${champions.map((p) => md(p.name, '(名称未設定)', 24)).join('、')} は推進の中核。この人たちの言葉で書かれた懸念事項がビューポイントの出発点になる。`,
              `Top-right — ${champions.map((p) => md(p.name, '(unnamed)', 24)).join(', ')} — ${plural(champions.length, 'is the driver', 'are the drivers')}. Their concerns, in their own words, are the starting point for your viewpoints.`,
            ),
          );
        }
        guideItems.push(
          bi(
            '象限は固定ではない。関心は説明の頻度と内容で動かせるので、右方向に動かしたい人を 2 名決めて働きかける。',
            'The quadrants are not fixed. Interest moves with how often and how well you explain, so pick two people you want to move to the right and work on them.',
          ),
        );
        guideItems.push(
          bi(
            '次の一手: 各ステークホルダーの懸念事項を 1 つずつ言葉で書き取り、それに応えるビューを成果物に含める。懸念が書けない相手は、まだ会話が足りていない。',
            'Next: write down one concern per stakeholder in their own words, and include a view that answers it. Anyone whose concern you cannot write down has not been talked to enough.',
          ),
        );
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 7. C4 コンテキスト図 / C4 context diagram
// ---------------------------------------------------------------------------

function registerC4Context(server: McpServer): void {
  server.registerTool(
    'diagram_c4_context',
    {
      title: 'Draw a C4 level 1 (system context) diagram',
      description:
        'C4 モデルのコンテキスト図(レベル 1)を Mermaid で返す。人・対象システム・外部システムを描き分け、関係に短いラベルを付ける。C4 は Simon Brown が考案した軽量な記法で、経営層に 30 秒で伝えたいときに向く。 / Draw a C4 model system context diagram (level 1) in Mermaid, distinguishing people, the system in scope, and external systems, with short relationship labels. C4 is a lightweight notation devised by Simon Brown and suits the case where an executive has to understand the picture in thirty seconds.',
      inputSchema: {
        system: z.string().min(1).describe('対象システムの名前 / The system in scope'),
        systemDescription: z
          .string()
          .optional()
          .describe('対象システムの一行説明 / One-line description of the system'),
        users: z
          .array(z.string())
          .default([])
          .describe('利用者・役割の一覧 / People or roles that use the system'),
        externalSystems: z
          .array(
            z.object({
              name: z.string().min(1).describe('外部システム名 / External system name'),
              relation: z
                .string()
                .optional()
                .describe('関係の説明(短く) / Short description of the relationship'),
            }),
          )
          .default([])
          .describe('連携する外部システム / External systems it integrates with'),
        lang: langSchema,
      },
    },
    async ({ system, systemDescription, users, externalSystems, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        if (users.length === 0 && externalSystems.length === 0) {
          return needInput(
            l,
            'C4 コンテキスト図',
            'C4 system context diagram',
            [
              bi(
                'users に「誰が使うか」を役割で並べる(氏名ではなく役割)。',
                'List who uses it, by role rather than by personal name.',
              ),
              bi(
                'externalSystems に社外・他部門のシステムと、その関係を短く書く。関係は動詞で書くと図が読める。',
                'List the external or other-department systems and describe each relationship briefly, using a verb so the diagram reads as sentences.',
              ),
            ],
            `{
  "system": "受注管理システム",
  "systemDescription": "受注から出荷指示までを扱う",
  "users": ["営業担当", "受注オペレーター"],
  "externalSystems": [
    { "name": "会計システム", "relation": "売上仕訳を連携する" },
    { "name": "配送業者 API", "relation": "配送状況を取得する" }
  ]
}`,
          );
        }

        const nextId = idGen('c4');
        const systemId = nextId();
        const lines: string[] = ['flowchart TB'];

        const personIds: string[] = [];
        for (const user of users) {
          const id = nextId();
          personIds.push(id);
          // C4 の作法にならい、要素の種別を角括弧付きで併記する
          // (Mermaid の半角角括弧はノード形状の記号になるため全角を使う)
          lines.push(`  ${id}(["${safeLabel(user, '(役割未設定)', 26)}<br/>［${line('人', 'Person', l)}］"])`);
        }

        const systemLabel = safeLabel(system, '(対象システム)', 30);
        const desc = systemDescription ? `<br/>${safeLabel(systemDescription, '', 34)}` : '';
        lines.push(
          `  ${systemId}["${systemLabel}<br/>［${line('対象システム', 'System in scope', l)}］${desc}"]`,
        );

        const externalIds: string[] = [];
        for (const ext of externalSystems) {
          const id = nextId();
          externalIds.push(id);
          lines.push(
            `  ${id}["${safeLabel(ext.name, '(外部システム)', 26)}<br/>［${line('外部システム', 'External system', l)}］"]`,
          );
        }

        const usesLabel = labelOf(line('利用する', 'uses', l), 18);
        for (const id of personIds) lines.push(`  ${id} -->|"${usesLabel}"| ${systemId}`);
        externalSystems.forEach((ext, index) => {
          const relation = ext.relation ? labelOf(ext.relation, 24) : labelOf(line('連携する', 'integrates with', l), 24);
          lines.push(`  ${systemId} -->|"${relation}"| ${externalIds[index]}`);
        });

        lines.push('  classDef person fill:#08427b,stroke:#052e56,color:#ffffff;');
        lines.push('  classDef focus fill:#1168bd,stroke:#0b4884,color:#ffffff;');
        lines.push('  classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff;');
        if (personIds.length > 0) lines.push(`  class ${personIds.join(',')} person;`);
        lines.push(`  class ${systemId} focus;`);
        if (externalIds.length > 0) lines.push(`  class ${externalIds.join(',')} external;`);

        const out: string[] = [];
        out.push(`# ${line('C4 コンテキスト図(レベル 1)', 'C4 system context diagram (level 1)', l)}: ${labelOf(system, 40)}`);
        out.push('');
        out.push(
          msg(
            'C4 は Simon Brown が考案した軽量な記法で、システムを 4 段階(コンテキスト / コンテナ / コンポーネント / コード)の詳しさで描き分けます。TOGAF の一部ではありませんが、対象範囲を経営層と共有する場面では正式なモデリング記法より速く伝わります。',
            'C4 is a lightweight notation devised by Simon Brown that describes a system at four levels of detail: context, container, component, and code. It is not part of TOGAF, but for agreeing scope with executives it lands faster than a formal modelling notation.',
            l,
          ),
        );
        out.push('');
        out.push(mermaid(lines));
        out.push('');
        out.push(`${line('凡例', 'Legend', l)}:`);
        out.push('');
        out.push(
          bullets(
            [
              bi('濃い青 = 人(利用者・役割)', 'dark blue = a person, i.e. a user or role'),
              bi('明るい青 = 対象システム(今回の範囲)', 'blue = the system in scope'),
              bi('灰色 = 外部システム(範囲の外)', 'grey = an external system, outside the scope'),
            ],
            l,
          ),
        );
        out.push('');

        const guideItems: Bilingual[] = [
          bi(
            'この図が答えるのは「何が範囲の内側で、何が外側か」の 1 点だけ。中の作りは描かない。矢印が多すぎると感じたら、それは既にレベル 2 の話をしている。',
            'This diagram answers exactly one question: what is inside the scope and what is outside. It does not show internals. If the arrows feel too many, you have already drifted into level 2.',
          ),
        ];
        if (externalSystems.length > 0) {
          guideItems.push(
            bi(
              `外部システムが ${externalSystems.length} 件。外部との線 1 本ごとに、契約・データの越境・障害時の縮退運転の 3 点を確認する。`,
              `There ${plural(externalSystems.length, 'is', 'are')} ${externalSystems.length} external ${plural(externalSystems.length, 'system', 'systems')}. For each external line, check three things: the contract, whether data crosses an organisational boundary, and how you degrade when it fails.`,
            ),
          );
        } else {
          guideItems.push(
            bi(
              '外部システムが 1 件も挙がっていない。単独で完結するシステムは稀なので、認証・通知・会計・データ連携の相手を洗い直す。',
              'No external system is listed. Very few systems stand alone, so go back over authentication, notification, accounting, and data feeds.',
            ),
          );
        }
        guideItems.push(
          bi(
            '次の一手: この図をそのままアーキテクチャビジョンの範囲図に使い、合意が取れたらレベル 2(コンテナ図)に降りる。',
            'Next: use this as the scope picture in the architecture vision, and once it is agreed, descend to level 2, the container diagram.',
          ),
        );
        out.push(readingGuide(l, guideItems));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 8. リスクマトリクス / Risk matrix
// ---------------------------------------------------------------------------

const RISK_LEVEL_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
const RISK_STATUS_ORDER: RiskStatus[] = ['open', 'mitigating', 'accepted', 'closed'];

const RISK_LEVEL_LABEL: Record<RiskLevel, Bilingual> = {
  critical: bi('致命的', 'critical'),
  high: bi('高', 'high'),
  medium: bi('中', 'medium'),
  low: bi('低', 'low'),
};

const RISK_STATUS_LABEL: Record<RiskStatus, Bilingual> = {
  open: bi('未対応', 'open'),
  mitigating: bi('対応中', 'mitigating'),
  accepted: bi('受容', 'accepted'),
  closed: bi('クローズ', 'closed'),
};

/** レベルごとの記号(印刷しても潰れない) */
const RISK_MARK: Record<RiskLevel, string> = {
  critical: '■',
  high: '▲',
  medium: '◆',
  low: '·',
};

const RISK_LEVEL_VALUE: Record<RiskLevel, number> = { low: 0.15, medium: 0.4, high: 0.65, critical: 0.9 };
const RISK_STATUS_VALUE: Record<RiskStatus, number> = { open: 0.12, mitigating: 0.4, accepted: 0.65, closed: 0.88 };

interface RiskPoint {
  title: string;
  level: RiskLevel;
  status: RiskStatus;
  owner?: string;
  mitigation?: string;
}

function registerRiskMatrix(server: McpServer): void {
  server.registerTool(
    'diagram_risk_matrix',
    {
      title: 'Draw the risk level/status matrix',
      description:
        'リスクを「レベル × 対応状況」のマトリクス表と Mermaid の quadrantChart の両方で返す。エンゲージメントに登録されたリスクを使い、無ければ引数から描く。左上(重大なのに未対応)に何が残っているかを一目で分かる形にする。 / Show risks both as a level-versus-status matrix table and as a Mermaid quadrant chart, using the risks registered on the engagement or the arguments. Makes the top-left cell — severe but untouched — impossible to miss.',
      inputSchema: {
        risks: z
          .array(
            z.object({
              title: z.string().min(1).describe('リスクの内容 / What the risk is'),
              level: z.enum(['low', 'medium', 'high', 'critical']).describe('リスクレベル / Risk level'),
              status: z
                .enum(['open', 'mitigating', 'closed', 'accepted'])
                .describe('対応状況 / Status'),
              owner: z.string().optional().describe('担当者 / Owner'),
            }),
          )
          .default([])
          .describe('エンゲージメントを使わない場合の一覧 / Risks to use when no engagement data exists'),
        lang: langSchema,
      },
    },
    async ({ risks, lang }) => {
      const l = lang as Lang;
      return guard(l, () => {
        const engagement = tryLoadEngagement();
        const fromEngagement = engagement !== null && engagement.risks.length > 0;
        const unknownValues: string[] = [];
        const points: RiskPoint[] = fromEngagement && engagement
          ? engagement.risks.map((r) => {
              const level = oneOf(RISK_LEVELS, r.level, 'medium');
              const status = oneOf(RISK_STATUSES, r.status, 'open');
              if (level !== r.level) unknownValues.push(String(r.level));
              if (status !== r.status) unknownValues.push(String(r.status));
              return { title: r.title, level, status, owner: r.owner, mitigation: r.mitigation };
            })
          : risks.map((r) => ({ title: r.title, level: r.level, status: r.status, owner: r.owner }));

        if (points.length === 0) {
          return needInput(
            l,
            'リスクマトリクス',
            'Risk matrix',
            [
              bi(
                '案件にリスクを登録するか、risks に title / level / status を並べる。',
                'Register risks on the engagement, or pass title / level / status in risks.',
              ),
              bi(
                'リスクが 0 件なのは、リスクが無いのではなく洗い出していない状態。まずフェーズごとに 3 つずつ挙げてみる。',
                'Zero risks means they have not been surfaced, not that there are none. Start by naming three per phase.',
              ),
            ],
            `{
  "risks": [
    { "title": "現行仕様を知る担当者が来期に退職", "level": "critical", "status": "open", "owner": "情報システム部" },
    { "title": "データ移行の品質が不明", "level": "high", "status": "mitigating" },
    { "title": "外部 API の仕様変更", "level": "medium", "status": "accepted" }
  ]
}`,
          );
        }

        // レベル × 状態の集計
        const grid = new Map<string, RiskPoint[]>();
        for (const point of points) {
          const key = `${point.level}|${point.status}`;
          const list = grid.get(key) ?? [];
          list.push(point);
          grid.set(key, list);
        }

        const header = `| ${line('レベル ＼ 状態', 'Level x Status', l)} | ${RISK_STATUS_ORDER.map((s) => text(RISK_STATUS_LABEL[s], l)).join(' | ')} |`;
        const separator = `| --- | ${RISK_STATUS_ORDER.map(() => '---').join(' | ')} |`;
        const rows: string[] = [header, separator];
        for (const level of RISK_LEVEL_ORDER) {
          const cells = RISK_STATUS_ORDER.map((status) => {
            const list = grid.get(`${level}|${status}`) ?? [];
            if (list.length === 0) return '–';
            const marks = RISK_MARK[level].repeat(Math.min(list.length, 5));
            return `${marks} ${list.length}`;
          });
          rows.push(`| ${RISK_MARK[level]} ${text(RISK_LEVEL_LABEL[level], l)} | ${cells.join(' | ')} |`);
        }

        // quadrantChart 側。重なりを避けるため同一セル内で少しずらす。
        const occupancy = new Map<string, number>();
        const usedNames = new Set<string>();
        const pointLines: string[] = [];
        for (const point of points) {
          const key = `${point.level}|${point.status}`;
          const seen = occupancy.get(key) ?? 0;
          occupancy.set(key, seen + 1);
          const jitter = JITTER[seen % JITTER.length];
          const extra = Math.floor(seen / JITTER.length) * 0.02;
          const x = clamp01(RISK_STATUS_VALUE[point.status] + jitter[0] + extra);
          const y = clamp01(RISK_LEVEL_VALUE[point.level] + jitter[1] + extra);
          let name = plainOf(point.title, '(内容未設定)', 22);
          let suffix = 2;
          while (usedNames.has(name)) {
            name = `${plainOf(point.title, '(内容未設定)', 18)} ${suffix}`;
            suffix += 1;
          }
          usedNames.add(name);
          pointLines.push(`    "${name}": [${x.toFixed(2)}, ${y.toFixed(2)}]`);
        }

        const chart: string[] = [
          'quadrantChart',
          `    title ${plainOf(line('リスク レベル x 対応状況', 'Risks: level x status', l), 'Risks', 60)}`,
          `    x-axis ${plainOf(line('未対応', 'Untouched', l), 'Untouched', 36)} --> ${plainOf(line('対応済み', 'Handled', l), 'Handled', 36)}`,
          `    y-axis ${plainOf(line('影響が小さい', 'Low impact', l), 'Low impact', 36)} --> ${plainOf(line('影響が大きい', 'High impact', l), 'High impact', 36)}`,
          `    quadrant-1 ${plainOf(line('再発監視', 'Watch for recurrence', l), 'Watch', 36)}`,
          `    quadrant-2 ${plainOf(line('今週の最優先', 'Top priority this week', l), 'Top priority', 36)}`,
          `    quadrant-3 ${plainOf(line('定例で棚卸し', 'Review periodically', l), 'Review periodically', 36)}`,
          `    quadrant-4 ${plainOf(line('完了', 'Done', l), 'Done', 36)}`,
          ...pointLines,
        ];

        const urgent = points.filter(
          (p) => (p.level === 'critical' || p.level === 'high') && (p.status === 'open' || p.status === 'mitigating'),
        );
        const ownerless = urgent.filter((p) => !p.owner || p.owner.trim().length === 0);
        const accepted = points.filter((p) => p.status === 'accepted');

        const out: string[] = [];
        out.push(`# ${line('リスクマトリクス', 'Risk matrix', l)}`);
        out.push('');
        out.push(sourceLine(engagement, fromEngagement, l));
        out.push('');
        if (fromEngagement && risks.length > 0) {
          // 引数を黙って捨てると「渡したのに出てこない」と読み手が混乱する
          out.push(
            msg(
              `引数で渡した ${risks.length} 件は描いていません。案件に登録済みのリスクを優先します。引数だけで試す場合は、登録内容を更新するか別の案件に切り替えてください。`,
              `The ${risks.length} ${plural(risks.length, 'risk', 'risks')} passed as arguments ${plural(risks.length, 'was', 'were')} not drawn: the risks registered on the engagement take precedence. To work from arguments alone, update the registered data or switch engagement.`,
              l,
            ),
          );
          out.push('');
        }
        out.push(...unknownValueNote(unknownValues, l));
        out.push(
          msg(
            `リスク ${points.length} 件 / 重大かつ未クローズ ${urgent.length} 件`,
            `${points.length} risks, ${urgent.length} of them severe and not yet closed`,
            l,
          ),
        );
        out.push('');
        out.push(...rows);
        out.push('');
        out.push(
          `${line('記号', 'Marks', l)}: ${RISK_LEVEL_ORDER.map((lv) => `${RISK_MARK[lv]} ${text(RISK_LEVEL_LABEL[lv], l)}`).join(' | ')}`,
        );
        out.push('');
        out.push(mermaid(chart));
        out.push('');

        if (urgent.length > 0) {
          out.push(`### ${line('先に手を打つべきリスク', 'Risks to act on first', l)}`);
          out.push('');
          out.push(
            `| ${line('内容', 'Risk', l)} | ${line('レベル', 'Level', l)} | ${line('状況', 'Status', l)} | ${line('担当', 'Owner', l)} |`,
          );
          out.push('| --- | --- | --- | --- |');
          for (const point of urgent) {
            const owner = point.owner && point.owner.trim().length > 0
              ? md(point.owner, '-', 30)
              : line('未設定', 'unassigned', l);
            out.push(
              `| ${md(point.title, '(内容未設定)', 60)} | ${text(RISK_LEVEL_LABEL[point.level], l)} | ${text(RISK_STATUS_LABEL[point.status], l)} | ${owner} |`,
            );
          }
          out.push('');
        }

        const guideItems: Bilingual[] = [];
        guideItems.push(
          bi(
            '左上の象限(影響が大きいのに未対応)だけを見る。ここが空でないうちは、他の象限の議論をしても意味がない。',
            'Look only at the top-left quadrant — high impact, untouched. While anything sits there, debating the other quadrants is wasted time.',
          ),
        );
        if (ownerless.length > 0) {
          guideItems.push(
            bi(
              `重大リスクのうち ${ownerless.length} 件に担当者がいない。担当者のいないリスクは対応されないので、今日のうちに名前を入れる。`,
              `${ownerless.length} severe ${plural(ownerless.length, 'risk has', 'risks have')} no owner. An unowned risk does not get worked on — put a name against each one today.`,
            ),
          );
        }
        if (accepted.length > 0) {
          guideItems.push(
            bi(
              `「受容」が ${accepted.length} 件。受容は放置とは違う。誰がいつ受容を決めたかを決定記録に残していなければ、それは放置。`,
              `${accepted.length} ${plural(accepted.length, 'risk is', 'risks are')} accepted. Acceptance is not the same as neglect: if no decision record says who accepted it and when, it is neglect.`,
            ),
          );
        }
        guideItems.push(
          bi(
            '次の一手: 未対応の重大リスクごとに「対策」ではなく「今週の一手」を 1 つ決める。対策の検討自体が動いていないリスクが最も危ない。',
            'Next: for each severe open risk, decide not a mitigation strategy but one action for this week. The most dangerous risks are the ones where even the analysis has not started.',
          ),
        );
        out.push(readingGuide(l, guideItems.slice(0, 4)));

        return textResult(out.join('\n'));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

/** 図生成ツールをすべて登録する */
export function registerDiagramTools(server: McpServer): void {
  registerAdmCycle(server);
  registerCapabilityMap(server);
  registerValueStream(server);
  registerApplicationLandscape(server);
  registerRoadmapGantt(server);
  registerStakeholderMatrix(server);
  registerC4Context(server);
  registerRiskMatrix(server);
}
