/**
 * 分析ツール / Analysis tools.
 *
 * ギャップ分析・リスクマトリクス・ステークホルダーマトリクス・
 * 成熟度評価・変革準備度評価を、読みやすい Markdown(表と記号による図)で返す。
 * いずれも「結果の解釈」と「次に何をすべきか」を必ず添える。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  bullets,
  findDeliverable,
  findTechnique,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import {
  makeId,
  now,
  type Assessment,
  type AssessmentFactor,
  type AssessmentKind,
  type Engagement,
  type InfluenceLevel,
  type Risk,
  type RiskLevel,
  type RiskStatus,
  type Stakeholder,
} from '../engagement/model.js';
import { loadEngagement, saveEngagement } from '../engagement/store.js';
import {
  ASSESSMENT_KIND_LABEL,
  INFLUENCE_LABEL,
  L,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  label,
} from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

// ---------------------------------------------------------------------------
// 共通ヘルパ / Shared helpers
// ---------------------------------------------------------------------------

/**
 * 見出し・表のセル・箇条書きの前置きなど、1 行に収めたい箇所の日英併記。
 * `msg` は日英を改行で並べるため、表の中で使うと行が壊れる。こちらは「/」で連結する。
 */
function inline(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** Markdown 表のセル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 0〜scale の値を █░ のバーで表す */
function bar(value: number, scale: number, width = 10): string {
  const ratio = scale <= 0 ? 0 : Math.max(0, Math.min(1, value / scale));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

/** 比較用に名前を正規化する(前後空白除去・小文字化・連続空白の圧縮) */
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 重複を除いた文字列配列(最初の表記を残す) */
function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v.length === 0) continue;
    const key = normalizeName(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** ISO 文字列から経過日数を求める(不正な値は null) */
function daysSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** 小数 1 桁に丸める */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 英文の単複を揃える(件数付きの語) */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** 技法・成果物への参照行(知識ベースに無ければ null) */
function techniquePointer(id: string, lang: Lang): string | null {
  const t = findTechnique(id);
  if (!t) return null;
  return `\`get_technique ${t.id}\` — ${text(t.name, lang)}`;
}

function deliverablePointer(id: string, lang: Lang): string | null {
  const d = findDeliverable(id);
  if (!d) return null;
  return `\`get_deliverable ${d.id}\` — ${text(d.name, lang)}`;
}

/** 参照行をまとめて「参考」節にする */
function referenceSection(lines: (string | null)[], lang: Lang): string[] {
  const valid = lines.filter((x): x is string => x !== null);
  if (valid.length === 0) return [];
  const out: string[] = [];
  out.push(`## ${inline('参考', 'References', lang)}`);
  out.push('');
  for (const line of valid) out.push(`- ${line}`);
  out.push('');
  return out;
}

/** 指摘の重大度 / Severity of a finding. */
type Severity = 'high' | 'medium' | 'low';

const SEVERITY_LABEL: Record<Severity, Bilingual> = {
  high: { ja: '高', en: 'High' },
  medium: { ja: '中', en: 'Medium' },
  low: { ja: '低', en: 'Low' },
};

const SEVERITY_MARK: Record<Severity, string> = {
  high: '!!',
  medium: '!',
  low: '·',
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

interface Finding {
  severity: Severity;
  /** 指摘の対象(リスク名・ステークホルダー名など) */
  subject: string;
  issue: Bilingual;
  recommendation: Bilingual;
}

/** 指摘一覧を表に整形する */
function renderFindings(findings: Finding[], lang: Lang): string[] {
  const out: string[] = [];
  out.push(`## ${label(L.findings, lang)}`);
  out.push('');
  if (findings.length === 0) {
    out.push(
      msg(
        '要対応の指摘はありません。記入は一通り揃っています。',
        'No findings. The records are complete enough to work from.',
        lang,
      ),
    );
    out.push('');
    return out;
  }
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  out.push(
    `| ${label(L.severity, lang)} | ${inline('対象', 'Subject', lang)} | ${inline('指摘', 'Issue', lang)} | ${label(L.recommendation, lang)} |`,
  );
  out.push('| :-: | --- | --- | --- |');
  for (const f of sorted) {
    out.push(
      `| ${SEVERITY_MARK[f.severity]} ${label(SEVERITY_LABEL[f.severity], lang)} | ${cell(f.subject)} | ${cell(text(f.issue, lang))} | ${cell(text(f.recommendation, lang))} |`,
    );
  }
  out.push('');
  return out;
}

/** エンゲージメント未作成時の案内(見出しは呼び出し元の分析名にする) */
function noEngagementResult(lang: Lang, heading: Bilingual = L.dashboard): ToolResult {
  return textResult(
    [
      `# ${label(heading, lang)}`,
      '',
      label(L.noEngagement, lang),
      '',
      msg(
        'この分析は保存済みの案件データを読みます。`start_engagement` で案件を作り、`update_engagement` で内容を登録してから再実行してください。',
        'This analysis reads the stored engagement. Create one with `start_engagement`, record entries with `update_engagement`, then run this again.',
        lang,
      ),
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// 1. gap_analysis — 現行 × 目標のギャップ分析
// ---------------------------------------------------------------------------

/** 現行要素と目標要素の対応関係の種別 */
const MAPPING_KINDS = ['retained', 'modified', 'replaced'] as const;
type MappingKind = (typeof MAPPING_KINDS)[number];

const MAPPING_MARK: Record<MappingKind, string> = {
  retained: '=',
  modified: '~',
  replaced: '→',
};

const MAPPING_LABEL: Record<MappingKind, Bilingual> = {
  retained: { ja: '維持(そのまま流用)', en: 'Retained (carried over as-is)' },
  modified: { ja: '改修(手を入れて流用)', en: 'Modified (carried over with changes)' },
  replaced: { ja: '置換(別のもので置き換え)', en: 'Replaced (swapped for something else)' },
};

const NEW_MARK = '+';
const ELIMINATED_MARK = 'x';

/** ギャップ種別ごとの推奨アクション(独自の実務指針) */
const GAP_ACTION: Record<'new' | 'eliminated' | MappingKind, Bilingual> = {
  new: {
    ja: '作業パッケージに切り出し、必要な能力・調達方針・責任者・初回リリース範囲を決める。最初から全部作らず、価値が出る最小の単位に割る。',
    en: 'Carve it into a work package and decide the capability needed, sourcing approach, owner, and first release scope. Do not build all of it at once; slice it to the smallest piece that delivers value.',
  },
  eliminated: {
    ja: '利用者と連携先を洗い出し、停止日・データ移行・契約解約・要員再配置までを 1 つの作業パッケージにする。止め切るまでコスト削減は実現しない。',
    en: 'Identify every consumer and interface, then bundle the shutdown date, data migration, contract termination, and staff reassignment into one work package. The savings do not exist until it is actually switched off.',
  },
  retained: {
    ja: '流用の前提(性能・保守期限・ライセンス)が目標時点でも成り立つか確認する。「そのまま使える」は劣化の見落としを生みやすい。',
    en: 'Confirm the assumptions behind reuse (capacity, support end-of-life, licensing) still hold at the target date. "It just carries over" is where quiet decay hides.',
  },
  modified: {
    ja: '変更範囲と後方互換を保つ期間を決め、既存利用者への影響評価を先に行う。改修は新規より安く見えるが、影響範囲の調査で逆転することがある。',
    en: 'Define the change scope and how long backward compatibility is kept, and assess the impact on current consumers first. Modification looks cheaper than new build until the impact survey says otherwise.',
  },
  replaced: {
    ja: '新旧の並行期間・切替判定基準・旧側の停止日を、切替前に決めて合意する。停止日を決めない置換は二重運用として固定化する。',
    en: 'Agree the parallel-run period, cutover criteria, and the shutdown date of the old side before switching. A replacement without a shutdown date freezes into permanent dual operation.',
  },
};

const GAP_KIND_TITLE: Record<'new' | 'eliminated' | MappingKind, Bilingual> = {
  new: { ja: '新規に必要なもの (New)', en: 'New — to be created' },
  eliminated: { ja: '廃止されるもの (Eliminated)', en: 'Eliminated — to be retired' },
  retained: { ja: '維持されるもの (Retained)', en: 'Retained' },
  modified: { ja: '改修が必要なもの (Modified)', en: 'Modified' },
  replaced: { ja: '置き換えられるもの (Replaced)', en: 'Replaced' },
};

/** 表示に使う建築ドメイン名 */
const DOMAIN_LABEL: Record<string, Bilingual> = {
  business: { ja: 'ビジネス', en: 'Business' },
  data: { ja: 'データ', en: 'Data' },
  application: { ja: 'アプリケーション', en: 'Application' },
  technology: { ja: 'テクノロジー', en: 'Technology' },
};

interface ResolvedMapping {
  fromIndex: number;
  toIndex: number;
  kind: MappingKind;
}

/** マトリクスを表として描ける上限(超えたら一覧表示に切り替える) */
const MATRIX_MAX = 12;

interface GapAnalysisInput {
  baseline: string[];
  target: string[];
  mappings?: { from: string; to: string; kind: MappingKind }[];
  domain?: string;
  lang: string;
}

function runGapAnalysis(input: GapAnalysisInput): ToolResult {
  const lang = input.lang as Lang;
  const baseline = uniqueNames(input.baseline);
  const target = uniqueNames(input.target);

  if (baseline.length === 0 && target.length === 0) {
    return errorResult(
      msg(
        'baseline と target のどちらにも有効な要素がありません。現行構成と目標構成の要素名を渡してください。',
        'Neither baseline nor target contains a usable element. Pass the element names of the current and target states.',
        lang,
      ),
    );
  }

  const baselineKeys = baseline.map(normalizeName);
  const targetKeys = target.map(normalizeName);

  // --- 対応関係の解決 ---
  const resolved: ResolvedMapping[] = [];
  const warnings: string[] = [];
  for (const m of input.mappings ?? []) {
    const fromIndex = baselineKeys.indexOf(normalizeName(m.from));
    const toIndex = targetKeys.indexOf(normalizeName(m.to));
    if (fromIndex < 0) {
      warnings.push(
        inline(
          `対応関係の from「${m.from}」は baseline に見つかりません(無視しました)。`,
          `Mapping source "${m.from}" is not in baseline; it was ignored.`,
          lang,
        ),
      );
      continue;
    }
    if (toIndex < 0) {
      warnings.push(
        inline(
          `対応関係の to「${m.to}」は target に見つかりません(無視しました)。`,
          `Mapping destination "${m.to}" is not in target; it was ignored.`,
          lang,
        ),
      );
      continue;
    }
    if (resolved.some((r) => r.fromIndex === fromIndex && r.toIndex === toIndex)) continue;
    resolved.push({ fromIndex, toIndex, kind: m.kind });
  }

  // 明示の対応が無い現行要素は、同名の目標要素があれば「維持」とみなす
  const autoMatched: string[] = [];
  for (let i = 0; i < baseline.length; i += 1) {
    if (resolved.some((r) => r.fromIndex === i)) continue;
    const toIndex = targetKeys.indexOf(baselineKeys[i]);
    if (toIndex >= 0 && !resolved.some((r) => r.toIndex === toIndex)) {
      resolved.push({ fromIndex: i, toIndex, kind: 'retained' });
      autoMatched.push(baseline[i]);
    }
  }

  const outgoing = baseline.map((_, i) => resolved.filter((r) => r.fromIndex === i));
  const incoming = target.map((_, j) => resolved.filter((r) => r.toIndex === j));

  const eliminatedIdx = baseline.map((_, i) => i).filter((i) => outgoing[i].length === 0);
  const newIdx = target.map((_, j) => j).filter((j) => incoming[j].length === 0);
  const byKind: Record<MappingKind, ResolvedMapping[]> = {
    retained: resolved.filter((r) => r.kind === 'retained'),
    modified: resolved.filter((r) => r.kind === 'modified'),
    replaced: resolved.filter((r) => r.kind === 'replaced'),
  };

  const out: string[] = [];
  const domainLabel = input.domain
    ? DOMAIN_LABEL[normalizeName(input.domain)]
      ? text(DOMAIN_LABEL[normalizeName(input.domain)], lang)
      : input.domain
    : null;

  out.push(
    `# ${inline('ギャップ分析', 'Gap Analysis', lang)}${domainLabel ? ` (${domainLabel})` : ''}`,
  );
  out.push('');
  out.push(
    inline(
      `現行 ${baseline.length} 要素 × 目標 ${target.length} 要素 / 対応関係 ${resolved.length} 件`,
      `${plural(baseline.length, 'baseline element', 'baseline elements')} x ${plural(target.length, 'target element', 'target elements')}, ${plural(resolved.length, 'mapping', 'mappings')}`,
      lang,
    ),
  );
  out.push('');

  if (warnings.length > 0) {
    for (const w of warnings) out.push(`> ${w}`);
    out.push('');
  }
  if (autoMatched.length > 0) {
    out.push(
      `> ${inline(
        `同名のため自動で「維持」とみなした要素: ${autoMatched.join(', ')}`,
        `Treated as retained by name match: ${autoMatched.join(', ')}`,
        lang,
      )}`,
    );
    out.push('');
  }

  // --- マトリクス ---
  out.push(`## ${inline('現行 × 目標 マトリクス', 'Baseline x Target matrix', lang)}`);
  out.push('');
  if (baseline.length > MATRIX_MAX || target.length > MATRIX_MAX) {
    out.push(
      msg(
        `要素数が多い(上限 ${MATRIX_MAX})ため、マトリクス表は省略し、下のギャップ一覧で示します。ドメインや業務領域で分割して再実行すると、マトリクスとして読める粒度になります。`,
        `There are more elements than the matrix limit (${MATRIX_MAX}), so the grid is omitted and the gaps are listed below. Re-run per domain or business area to get a readable grid.`,
        lang,
      ),
    );
    out.push('');
  } else {
    const header = [
      `${inline('現行 \\ 目標', 'Baseline \\ Target', lang)}`,
      ...target.map((t) => cell(t)),
      inline('廃止 (Eliminated)', 'Eliminated', lang),
    ];
    out.push(`| ${header.join(' | ')} |`);
    out.push(`| --- |${target.map(() => ' :-: |').join('')} :-: |`);
    for (let i = 0; i < baseline.length; i += 1) {
      const row: string[] = [cell(baseline[i])];
      for (let j = 0; j < target.length; j += 1) {
        const m = resolved.find((r) => r.fromIndex === i && r.toIndex === j);
        row.push(m ? MAPPING_MARK[m.kind] : '');
      }
      row.push(outgoing[i].length === 0 ? ELIMINATED_MARK : '');
      out.push(`| ${row.join(' | ')} |`);
    }
    const newRow: string[] = [inline('新規 (New)', 'New', lang)];
    for (let j = 0; j < target.length; j += 1) {
      newRow.push(incoming[j].length === 0 ? NEW_MARK : '');
    }
    newRow.push('-');
    out.push(`| ${newRow.join(' | ')} |`);
    out.push('');
    out.push(
      msg(
        `凡例: \`=\` 維持 / \`~\` 改修 / \`→\` 置換 / \`${NEW_MARK}\` 新規に必要 / \`${ELIMINATED_MARK}\` 廃止`,
        `Legend: \`=\` retained, \`~\` modified, \`→\` replaced, \`${NEW_MARK}\` newly required, \`${ELIMINATED_MARK}\` eliminated`,
        lang,
      ),
    );
    out.push('');
  }

  // --- 集計 ---
  out.push(`## ${inline('集計', 'Summary', lang)}`);
  out.push('');
  out.push(
    `| ${inline('区分', 'Category', lang)} | ${inline('件数', 'Count', lang)} | ${inline('意味', 'Meaning', lang)} |`,
  );
  out.push('| --- | :-: | --- |');
  const summaryRows: { kind: 'new' | 'eliminated' | MappingKind; count: number; meaning: Bilingual }[] = [
    {
      kind: 'new',
      count: newIdx.length,
      meaning: {
        ja: '目標にあって現行に無い。作る・買う・借りるの判断が要る',
        en: 'In the target, absent today. Needs a build/buy/rent decision',
      },
    },
    {
      kind: 'modified',
      count: byKind.modified.length,
      meaning: { ja: '現行を手直しして目標に届かせる', en: 'Existing element reworked to meet the target' },
    },
    {
      kind: 'replaced',
      count: byKind.replaced.length,
      meaning: { ja: '現行を別のもので置き換える', en: 'Existing element swapped for something else' },
    },
    {
      kind: 'eliminated',
      count: eliminatedIdx.length,
      meaning: { ja: '目標に居場所が無い。止める計画が要る', en: 'No place in the target. Needs a shutdown plan' },
    },
    {
      kind: 'retained',
      count: byKind.retained.length,
      meaning: { ja: '変更なしで持ち越す', en: 'Carried over unchanged' },
    },
  ];
  for (const row of summaryRows) {
    out.push(`| ${text(GAP_KIND_TITLE[row.kind], lang)} | ${row.count} | ${text(row.meaning, lang)} |`);
  }
  out.push('');

  const workItems = newIdx.length + byKind.modified.length + byKind.replaced.length + eliminatedIdx.length;
  out.push(
    msg(
      `作業を伴うギャップは合計 ${workItems} 件です(維持 ${byKind.retained.length} 件を除く)。`,
      `${workItems} gaps require work (excluding ${byKind.retained.length} retained elements).`,
      lang,
    ),
  );
  out.push('');

  // --- ギャップ一覧と推奨アクション ---
  out.push(`## ${inline('検出したギャップと推奨アクション', 'Detected gaps and recommended actions', lang)}`);
  out.push('');

  const gapRows: { kind: 'new' | 'eliminated' | MappingKind; subject: string }[] = [];
  for (const j of newIdx) gapRows.push({ kind: 'new', subject: target[j] });
  for (const i of eliminatedIdx) gapRows.push({ kind: 'eliminated', subject: baseline[i] });
  for (const m of byKind.modified) gapRows.push({ kind: 'modified', subject: `${baseline[m.fromIndex]} → ${target[m.toIndex]}` });
  for (const m of byKind.replaced) gapRows.push({ kind: 'replaced', subject: `${baseline[m.fromIndex]} → ${target[m.toIndex]}` });

  if (gapRows.length === 0) {
    out.push(
      msg(
        '作業を伴うギャップは検出されませんでした。現行と目標が同じ、あるいは目標の記述が現行をなぞっているだけの可能性があります。目標側に「やめること」と「新しく必要になること」が書かれているか点検してください。',
        'No gaps requiring work were detected. Either the two states are identical, or the target simply restates the baseline. Check that the target says what stops and what becomes newly necessary.',
        lang,
      ),
    );
    out.push('');
  } else {
    out.push(
      `| ${inline('区分', 'Category', lang)} | ${inline('対象', 'Element', lang)} | ${label(L.recommendation, lang)} |`,
    );
    out.push('| --- | --- | --- |');
    for (const row of gapRows) {
      out.push(
        `| ${text(GAP_KIND_TITLE[row.kind], lang)} | ${cell(row.subject)} | ${cell(text(GAP_ACTION[row.kind], lang))} |`,
      );
    }
    out.push('');
  }

  if (byKind.retained.length > 0) {
    out.push(
      `${inline('維持される要素の注意点', 'A note on retained elements', lang)}: ${text(GAP_ACTION.retained, lang)}`,
    );
    out.push('');
  }

  // --- 解釈と次の一手 ---
  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');

  const reading: Bilingual[] = [];
  if (eliminatedIdx.length === 0 && baseline.length > 0) {
    reading.push({
      ja: '廃止が 0 件です。現行が一切減らない目標像は、増えた分の費用と運用だけが積み上がります。「本当に全部残すのか」「残すなら誰がその費用を持つのか」を先に問い直してください。コスト削減を根拠に投資を通すつもりなら、この状態では通りません。',
      en: 'Nothing is eliminated. A target that removes nothing only adds cost and operational load. Re-ask whether every current element truly has to stay and, if so, who pays for it. If the investment case rests on savings, it does not stand up in this shape.',
    });
  } else if (eliminatedIdx.length > 0) {
    reading.push({
      ja: `廃止 ${eliminatedIdx.length} 件が、この計画の費用削減の源泉です。停止日と停止の責任者を決めていない廃止は、ほぼ確実に残ります。廃止だけを束ねた作業パッケージを作り、進捗を単独で追ってください。`,
      en: `The ${eliminatedIdx.length} eliminated elements are where the savings come from. Retirements without a shutdown date and a named owner almost always survive. Bundle the retirements into their own work package and track it separately.`,
    });
  }
  if (newIdx.length > 0 && eliminatedIdx.length > 0 && newIdx.length >= eliminatedIdx.length * 2) {
    reading.push({
      ja: '新規が廃止の 2 倍以上あります。移行期間中は新旧が並走し、運用負荷が一時的に最大化します。並走のピークがいつで、そこに人が足りるかを移行計画で確認してください。',
      en: 'New elements outnumber retirements by more than two to one. Old and new run side by side during the transition, so operational load peaks mid-way. Check in the migration plan when that peak lands and whether staffing covers it.',
    });
  }
  const consolidations = target.filter((_, j) => incoming[j].length >= 2).length;
  const splits = baseline.filter((_, i) => outgoing[i].length >= 2).length;
  if (consolidations > 0) {
    reading.push({
      ja: `複数の現行要素が 1 つの目標要素に集約される箇所が ${consolidations} 件あります。集約は効果が大きい反面、要件の最大公約数ではなく最小公倍数になりがちです。どの要件を捨てるかを先に決めてください。`,
      en: `${plural(consolidations, 'target element consolidates', 'target elements consolidate')} several baseline elements. Consolidation pays well but tends to accumulate every requirement instead of dropping any. Decide up front which requirements will not be carried over.`,
    });
  }
  if (splits > 0) {
    reading.push({
      ja: `1 つの現行要素が複数の目標要素に分割される箇所が ${splits} 件あります。分割時はデータの持ち主と整合性の責任範囲が曖昧になりやすいので、境界をデータ単位で明記してください。`,
      en: `${plural(splits, 'baseline element splits', 'baseline elements split')} into several target elements. Splits blur who owns which data and who guarantees consistency, so state the boundary at the data level.`,
    });
  }
  if (byKind.replaced.length > 0) {
    reading.push({
      ja: '置換がある計画では、旧側の停止判断が先送りされやすい。切替判定基準(何が満たされたら旧を止めるか)を、置換ごとに 1 行で書けるまで具体化してください。',
      en: 'Where replacements exist, the decision to switch the old side off tends to slip. Make the cutover criteria concrete enough to state in one line per replacement.',
    });
  }
  reading.push({
    ja: 'ギャップは、それ単体では作業計画になりません。関連するギャップを束ねて作業パッケージにし、依存関係と順序を付けて初めて実行できます。',
    en: 'A gap list is not yet a plan. Group related gaps into work packages, then add dependencies and sequence before anything can be executed.',
  });
  out.push(bullets(reading, lang));
  out.push('');

  const nextSteps: Bilingual[] = [
    {
      ja: 'ギャップを束ねて作業パッケージにする。1 パッケージ = 1 責任者 = 1 つの成果と便益になるよう割る。',
      en: 'Group the gaps into work packages, sized so each has one owner, one outcome, and one benefit.',
    },
    {
      ja: '廃止のパッケージには、停止日・移行対象データ・契約解約・利用者への通知をすべて含める。',
      en: 'Give each retirement package a shutdown date, the data to migrate, contracts to terminate, and consumer notifications.',
    },
    {
      ja: '中間の到達点(移行アーキテクチャ)を置き、そこで止めても事業が回るかを確認する。回らないなら区切り方が誤っている。',
      en: 'Define interim milestones (transition architectures) and check the business still runs if you stop there. If it does not, the slicing is wrong.',
    },
    {
      ja: '確定した内容を `update_engagement` で案件に記録し、`get_dashboard` で全体像として共有する。',
      en: 'Record what you settle with `update_engagement` and share the whole picture with `get_dashboard`.',
    },
  ];
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(bullets(nextSteps, lang));
  out.push('');

  out.push(
    ...referenceSection(
      [
        techniquePointer('gap-analysis', lang),
        techniquePointer('migration-planning-techniques', lang),
        deliverablePointer('architecture-roadmap', lang),
        deliverablePointer('transition-architecture', lang),
      ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 2. risk_matrix — リスクのレベル × 状態マトリクス
// ---------------------------------------------------------------------------

/** マトリクスの行(深刻な順) */
const RISK_LEVEL_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
/** マトリクスの列(未対応 → 解消の順) */
const RISK_STATUS_ORDER: RiskStatus[] = ['open', 'mitigating', 'accepted', 'closed'];

const RISK_LEVEL_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** 未対応リスクとみなす状態 */
function isActive(risk: Risk): boolean {
  return risk.status === 'open' || risk.status === 'mitigating';
}

/** リスク 1 件の短い表示名 */
function riskSubject(risk: Risk): string {
  return `${risk.title} (\`${risk.id}\`)`;
}

const STALE_DAYS = 30;

function runRiskMatrix(lang: Lang): ToolResult {
  const engagement = loadEngagement();
  if (!engagement) return noEngagementResult(lang, L.riskMatrix);

  const risks = engagement.risks;
  const out: string[] = [];
  out.push(`# ${label(L.riskMatrix, lang)}: ${engagement.name}`);
  out.push('');

  if (risks.length === 0) {
    out.push(
      msg(
        'リスクが 1 件も登録されていません。これは「リスクが無い」ではなく「まだ洗い出していない」状態です。リスクゼロのアーキテクチャ計画は存在しません。',
        'No risks are recorded. That does not mean there are none; it means none have been identified yet. No architecture plan has zero risk.',
        lang,
      ),
    );
    out.push('');
    out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
    out.push('');
    out.push(
      bullets(
        [
          {
            ja: '最低限、次の 4 種を洗い出す: 業務が止まるリスク、移行に失敗するリスク、費用が超過するリスク、人が足りないリスク。',
            en: 'At minimum, identify four kinds: business interruption, migration failure, cost overrun, and insufficient staffing.',
          },
          {
            ja: '各リスクに、対策前レベル(level)・対策(mitigation)・対策後の残存レベル(residualLevel)・受容者(owner)を必ず付ける。',
            en: 'Give every risk an initial level, a mitigation, a residual level, and an owner.',
          },
          {
            ja: '`update_engagement` の risks で登録し、この分析をもう一度実行する。',
            en: 'Record them via the risks field of `update_engagement`, then run this analysis again.',
          },
        ],
        lang,
      ),
    );
    out.push('');
    out.push(...referenceSection([techniquePointer('risk-management', lang)], lang));
    return textResult(out.join('\n'));
  }

  // --- レベル × 状態 マトリクス ---
  out.push(`## ${inline('レベル × 状態', 'Level x status', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.level, lang)} \\ ${label(L.status, lang)} | ${RISK_STATUS_ORDER.map((s) => label(RISK_STATUS_LABEL[s], lang)).join(' | ')} | ${inline('計', 'Total', lang)} |`,
  );
  out.push(`| --- |${RISK_STATUS_ORDER.map(() => ' :-: |').join('')} :-: |`);
  for (const level of RISK_LEVEL_ORDER) {
    const cells = RISK_STATUS_ORDER.map((status) => {
      const n = risks.filter((r) => r.level === level && r.status === status).length;
      return n === 0 ? '·' : String(n);
    });
    const rowTotal = risks.filter((r) => r.level === level).length;
    out.push(
      `| **${label(RISK_LEVEL_LABEL[level], lang)}** | ${cells.join(' | ')} | ${rowTotal === 0 ? '·' : rowTotal} |`,
    );
  }
  const colTotals = RISK_STATUS_ORDER.map((status) => {
    const n = risks.filter((r) => r.status === status).length;
    return n === 0 ? '·' : String(n);
  });
  out.push(`| ${inline('計', 'Total', lang)} | ${colTotals.join(' | ')} | ${risks.length} |`);
  out.push('');

  // --- 対策後の見通し(レベル → 残存レベル) ---
  const withResidual = risks.filter((r) => r.residualLevel !== undefined);
  out.push(`## ${inline('対策後の見通し(現在 → 残存)', 'After mitigation (current → residual)', lang)}`);
  out.push('');
  if (withResidual.length === 0) {
    out.push(
      msg(
        '残存リスクが 1 件も評価されていません。対策を打った後にどこまで下がるのかが不明なため、この計画は「対策すれば大丈夫」以上のことを言えていません。',
        'No residual risk has been assessed. Without knowing how far each risk drops after mitigation, the plan says no more than "we will handle it".',
        lang,
      ),
    );
    out.push('');
  } else {
    out.push(
      `| ${inline('現在', 'Current', lang)} \\ ${label(L.residual, lang)} | ${RISK_LEVEL_ORDER.map((l) => label(RISK_LEVEL_LABEL[l], lang)).join(' | ')} | ${inline('未評価', 'Not assessed', lang)} |`,
    );
    out.push(`| --- |${RISK_LEVEL_ORDER.map(() => ' :-: |').join('')} :-: |`);
    for (const level of RISK_LEVEL_ORDER) {
      const cells = RISK_LEVEL_ORDER.map((residual) => {
        const n = risks.filter((r) => r.level === level && r.residualLevel === residual).length;
        return n === 0 ? '·' : String(n);
      });
      const unknown = risks.filter((r) => r.level === level && r.residualLevel === undefined).length;
      out.push(
        `| **${label(RISK_LEVEL_LABEL[level], lang)}** | ${cells.join(' | ')} | ${unknown === 0 ? '·' : unknown} |`,
      );
    }
    out.push('');
    out.push(
      msg(
        '行が対策前、列が対策後です。対角線より右にあるものが「対策で下がるリスク」。対角線上は対策を打っても下がらないリスクなので、対策の中身か前提を疑ってください。対角線より左は対策後のほうが高いという評価であり、評価の誤りか対策自体の副作用を意味します。',
        'Rows are the level before mitigation, columns the level after. Cells to the right of the diagonal are the risks the mitigation actually reduces. Cells on the diagonal do not drop at all, so question the mitigation or its assumptions. Cells to the left claim a higher level after mitigation, which means either a rating error or a side effect of the mitigation itself.',
        lang,
      ),
    );
    out.push('');
  }

  // --- リスク一覧 ---
  out.push(`## ${label(L.risks, lang)}`);
  out.push('');
  out.push(
    `| ID | ${label(L.title, lang)} | ${label(L.level, lang)} | ${label(L.residual, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.mitigation, lang)} |`,
  );
  out.push('| --- | --- | :-: | :-: | :-: | --- | --- |');
  const sortedRisks = [...risks].sort(
    (a, b) =>
      RISK_LEVEL_RANK[b.level] - RISK_LEVEL_RANK[a.level] ||
      Number(isActive(b)) - Number(isActive(a)) ||
      a.title.localeCompare(b.title),
  );
  for (const r of sortedRisks) {
    out.push(
      [
        '',
        `\`${r.id}\``,
        cell(r.title),
        label(RISK_LEVEL_LABEL[r.level], lang),
        r.residualLevel ? label(RISK_LEVEL_LABEL[r.residualLevel], lang) : '—',
        label(RISK_STATUS_LABEL[r.status], lang),
        cell(r.owner) || '—',
        cell(r.mitigation) || '—',
        '',
      ].join(' | ').trim(),
    );
  }
  out.push('');

  // --- 要対応の指摘 ---
  const findings: Finding[] = [];
  for (const r of risks) {
    const active = isActive(r);
    const severe = r.level === 'critical' || r.level === 'high';
    const ownerMissing = !(r.owner && r.owner.trim().length > 0);

    if (severe && active && !(r.mitigation && r.mitigation.trim().length > 0)) {
      findings.push({
        severity: 'high',
        subject: riskSubject(r),
        issue: {
          ja: '重大なリスクだが対策が空欄',
          en: 'Severe risk with no mitigation recorded',
        },
        recommendation: {
          ja: '対策を 1 つ決めて書く。決められないなら「受容」に変え、誰が受容したかを owner に書く。空欄のままにしない。',
          en: 'Decide and write one mitigation. If you cannot, change the status to accepted and name who accepted it in owner. Do not leave it blank.',
        },
      });
    }
    // 受容者不明は「担当未設定」より重い指摘なので、両方は出さず重い側だけを出す
    const acceptedWithoutOwner = r.status === 'accepted' && severe && ownerMissing;
    if (acceptedWithoutOwner) {
      findings.push({
        severity: 'high',
        subject: riskSubject(r),
        issue: {
          ja: '重大なリスクを受容しているが受容者が不明',
          en: 'A severe risk is accepted but nobody is named as accepting it',
        },
        recommendation: {
          ja: '受容は判断であり、判断には名前が要る。受容した役職者を owner に記載し、決定事項としても残す。',
          en: 'Acceptance is a decision and a decision needs a name. Put the accepting executive in owner and log it as a decision too.',
        },
      });
    }
    if (r.status !== 'closed' && r.residualLevel === undefined) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: { ja: '残存リスクが未評価', en: 'Residual risk not assessed' },
        recommendation: {
          ja: '対策を実施した後に残る水準(residualLevel)を見積もる。ここが下がらない対策は、やる意味を再検討する。',
          en: 'Estimate the level that remains after mitigation. If it does not drop, question whether the mitigation is worth doing.',
        },
      });
    }
    if (ownerMissing && r.status !== 'closed' && !acceptedWithoutOwner) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: { ja: '担当・受容者が未設定', en: 'No owner assigned' },
        recommendation: {
          ja: '個人名で担当を置く。組織名だけの担当は、実際には誰も見ていないのと同じ。',
          en: 'Assign a named individual. An owner recorded as a team name means nobody is actually watching it.',
        },
      });
    }
    // 低リスクが低のままなのは正常なので、中以上のリスクだけを対象にする
    if (
      r.residualLevel !== undefined &&
      RISK_LEVEL_RANK[r.level] >= RISK_LEVEL_RANK.medium &&
      RISK_LEVEL_RANK[r.residualLevel] >= RISK_LEVEL_RANK[r.level] &&
      active
    ) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: {
          ja: '対策後もレベルが下がらない見込み',
          en: 'The level is not expected to drop after mitigation',
        },
        recommendation: {
          ja: '対策の実効性か、リスクの分解の仕方を見直す。下がらないなら、回避(やり方を変える)か移転(契約・保険)を検討する。',
          en: 'Revisit the mitigation or how the risk is decomposed. If it will not drop, consider avoidance (change the approach) or transfer (contract, insurance).',
        },
      });
    }
    const age = daysSince(r.updatedAt);
    if (active && age !== null && age >= STALE_DAYS) {
      findings.push({
        severity: 'low',
        subject: riskSubject(r),
        issue: {
          ja: `未対応のまま ${age} 日更新されていない`,
          en: `Open for ${age} days with no update`,
        },
        recommendation: {
          ja: '状況が変わっていないか確認し、変わっていないなら「なぜ動いていないのか」を課題として扱う。',
          en: 'Check whether anything changed; if not, treat the lack of movement itself as the issue.',
        },
      });
    }
  }
  out.push(...renderFindings(findings, lang));

  // --- 解釈と次の一手 ---
  const activeCount = risks.filter(isActive).length;
  const severeActive = risks.filter((r) => isActive(r) && (r.level === 'critical' || r.level === 'high')).length;
  const acceptedSevere = risks.filter(
    (r) => r.status === 'accepted' && (r.level === 'critical' || r.level === 'high'),
  ).length;

  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');
  const reading: Bilingual[] = [];
  reading.push({
    ja: `未対応(未対応 + 対応中)は ${activeCount} 件、うち重大(高・致命的)は ${severeActive} 件です。`,
    en: `${activeCount} risks are live (open or mitigating), ${severeActive} of them severe (high or critical).`,
  });
  if (severeActive > 0) {
    reading.push({
      ja: '重大リスクが未処理のまま次フェーズへ進むと、後工程で必ず設計のやり直しに化けます。フェーズの完了判定に「重大リスクが対応中以上であること」を入れてください。',
      en: 'Carrying severe risks into the next phase reliably turns into rework later. Make "no severe risk left untouched" part of the phase exit criteria.',
    });
  } else {
    reading.push({
      ja: '重大リスクは残っていません。ただし低・中のリスクが同時に顕在化すると重大になる組み合わせがないかを点検してください。',
      en: 'No severe risks remain. Still, check whether any combination of low and medium risks becomes severe if they occur together.',
    });
  }
  if (acceptedSevere > 0) {
    reading.push({
      ja: `重大リスクを ${acceptedSevere} 件受容しています。受容は正当な選択ですが、受容した事実・理由・受容者を決定事項として残さないと、後から「聞いていない」になります。`,
      en: `${acceptedSevere} severe risks are accepted. Acceptance is legitimate, but unless the fact, the reason, and the accepting person are logged as a decision, it later becomes "nobody told me".`,
    });
  }
  if (withResidual.length > 0 && withResidual.length < risks.length) {
    reading.push({
      ja: `残存レベルを評価済みなのは ${withResidual.length}/${risks.length} 件です。未評価の分は、対策の費用対効果を議論できません。`,
      en: `Residual levels exist for ${withResidual.length} of ${risks.length} risks. For the rest, you cannot discuss whether the mitigation is worth its cost.`,
    });
  }
  out.push(bullets(reading, lang));
  out.push('');
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      [
        {
          ja: '上の指摘を、担当と期限のあるアクションに変換する(`update_engagement` の actions)。',
          en: 'Convert the findings above into actions with an owner and a due date (`update_engagement` actions).',
        },
        {
          ja: '重大リスクは、対応中に格上げして週次で状況を追う。動かないリスクは対策が机上のままの証拠。',
          en: 'Move severe risks to mitigating and review them weekly. A risk that never moves is proof the mitigation exists only on paper.',
        },
        {
          ja: '受容したリスクは決定事項として記録し、受容者・受容日・見直し時期を書く。',
          en: 'Log accepted risks as decisions with who accepted, when, and when it will be revisited.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(...referenceSection([techniquePointer('risk-management', lang)], lang));

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 3. stakeholder_matrix — 影響力 × 関心度
// ---------------------------------------------------------------------------

type Quadrant = 'manageClosely' | 'keepSatisfied' | 'keepInformed' | 'monitor';

const QUADRANT_LABEL: Record<Quadrant, Bilingual> = {
  manageClosely: L.manageClosely,
  keepSatisfied: L.keepSatisfied,
  keepInformed: L.keepInformed,
  monitor: L.monitor,
};

const QUADRANT_CONDITION: Record<Quadrant, Bilingual> = {
  manageClosely: { ja: '影響力 高 × 関心度 高', en: 'High influence x high interest' },
  keepSatisfied: { ja: '影響力 高 × 関心度 低', en: 'High influence x low interest' },
  keepInformed: { ja: '影響力 低 × 関心度 高', en: 'Low influence x high interest' },
  monitor: { ja: '影響力 低 × 関心度 低', en: 'Low influence x low interest' },
};

/** 象限ごとの関与方針(独自の実務指針) */
const QUADRANT_APPROACH: Record<Quadrant, Bilingual> = {
  manageClosely: {
    ja: '意思決定の場に必ず入れる。成果物のレビュー者に指名し、異論は早い段階で出してもらう。この層の合意が取れない案は、後半で必ず止まる。',
    en: 'Put them in the decision forum. Name them as reviewers of the deliverables and get their objections early. Anything this group has not agreed to stalls later.',
  },
  keepSatisfied: {
    ja: '要点だけを短く定期的に。関心が低いうちに前提を握っておく。関心を持った時に初めて反対されるのが最悪の形なので、先に懸念を聞き出して潰しておく。',
    en: 'Short, regular, headline-level updates. Lock in the premises while their attention is low. The worst case is a first objection raised the moment they do start paying attention, so surface their concerns in advance.',
  },
  keepInformed: {
    ja: '詳細情報の提供先であり、現場知識の供給源。検討の入力をもらい、決まったことは理由付きで返す。ここを情報から切ると、実装段階で抵抗になる。',
    en: 'Give them detail and take their operational knowledge as input; return decisions with the reasoning. Cutting them out of the loop turns into resistance during implementation.',
  },
  monitor: {
    ja: '過剰な工数をかけない。ただし象限は固定ではないので、スコープや体制が変わる節目で位置付けを見直す。',
    en: 'Do not over-invest. Positions are not fixed, though, so re-check them whenever scope or organization changes.',
  },
};

const INFLUENCE_RANK: Record<InfluenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** medium 以上を「高側」として扱う(取りこぼしのほうが痛いため) */
function isHighSide(level: InfluenceLevel): boolean {
  return INFLUENCE_RANK[level] >= 1;
}

function quadrantOf(s: Stakeholder): Quadrant {
  const inf = isHighSide(s.influence);
  const int = isHighSide(s.interest);
  if (inf && int) return 'manageClosely';
  if (inf && !int) return 'keepSatisfied';
  if (!inf && int) return 'keepInformed';
  return 'monitor';
}

/** medium を含む(境界線上の)ステークホルダーか */
function isBorderline(s: Stakeholder): boolean {
  return s.influence === 'medium' || s.interest === 'medium';
}

function stakeholderTag(s: Stakeholder): string {
  return `${s.name}${isBorderline(s) ? '*' : ''}`;
}

function runStakeholderMatrix(lang: Lang): ToolResult {
  const engagement = loadEngagement();
  if (!engagement) return noEngagementResult(lang, L.stakeholderMatrix);

  const people = engagement.stakeholders;
  const out: string[] = [];
  out.push(`# ${label(L.stakeholderMatrix, lang)}: ${engagement.name}`);
  out.push('');

  if (people.length === 0) {
    out.push(
      msg(
        'ステークホルダーが 1 件も登録されていません。誰の関心事に答えるためのアーキテクチャなのかが定まっていない状態です。',
        'No stakeholders are recorded. Without them, there is no statement of whose concerns the architecture is meant to answer.',
        lang,
      ),
    );
    out.push('');
    out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
    out.push('');
    out.push(
      bullets(
        [
          {
            ja: '最低限、次を特定する: 予算を出す人、業務を止められる人、運用を引き受ける人、規制・監査で見る人。',
            en: 'At minimum identify: who funds it, who can halt the business, who will operate it, and who reviews it for regulation or audit.',
          },
          {
            ja: '各人に影響力(influence)・関心度(interest)・関心事(concerns)を付けて `update_engagement` の stakeholders で登録する。',
            en: 'Record influence, interest, and concerns for each via the stakeholders field of `update_engagement`.',
          },
        ],
        lang,
      ),
    );
    out.push('');
    out.push(
      ...referenceSection(
        [techniquePointer('stakeholder-management', lang), deliverablePointer('stakeholder-map', lang)],
        lang,
      ),
    );
    return textResult(out.join('\n'));
  }

  const groups: Record<Quadrant, Stakeholder[]> = {
    manageClosely: [],
    keepSatisfied: [],
    keepInformed: [],
    monitor: [],
  };
  for (const s of people) groups[quadrantOf(s)].push(s);

  // --- 2 × 2 マトリクス ---
  out.push(`## ${inline('影響力 × 関心度', 'Influence x interest', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.influence, lang)} \\ ${label(L.interest, lang)} | ${inline('高', 'High', lang)} | ${inline('低', 'Low', lang)} |`,
  );
  out.push('| :-: | --- | --- |');
  out.push(
    `| **${inline('高', 'High', lang)}** | **${label(L.manageClosely, lang)}**<br>${groups.manageClosely.map((s) => cell(stakeholderTag(s))).join('<br>') || '·'} | **${label(L.keepSatisfied, lang)}**<br>${groups.keepSatisfied.map((s) => cell(stakeholderTag(s))).join('<br>') || '·'} |`,
  );
  out.push(
    `| **${inline('低', 'Low', lang)}** | **${label(L.keepInformed, lang)}**<br>${groups.keepInformed.map((s) => cell(stakeholderTag(s))).join('<br>') || '·'} | **${label(L.monitor, lang)}**<br>${groups.monitor.map((s) => cell(stakeholderTag(s))).join('<br>') || '·'} |`,
  );
  out.push('');
  out.push(
    msg(
      '判定は「中(medium)以上を高側」として行っています(取りこぼしより過剰配慮のほうが安いため)。`*` 付きは中を含む境界線上の人で、実際の影響力を本人・周囲に確認する価値があります。',
      'Anything at medium or above counts as the high side, because over-engaging costs less than missing someone. Names marked `*` sit on the boundary; it is worth confirming their real influence.',
      lang,
    ),
  );
  out.push('');

  // --- 象限ごとの方針 ---
  out.push(`## ${inline('象限ごとの関与方針', 'Engagement approach per quadrant', lang)}`);
  out.push('');
  const quadrantOrder: Quadrant[] = ['manageClosely', 'keepSatisfied', 'keepInformed', 'monitor'];
  for (const q of quadrantOrder) {
    const members = groups[q];
    out.push(
      `### ${label(QUADRANT_LABEL[q], lang)} — ${text(QUADRANT_CONDITION[q], lang)} (${members.length})`,
    );
    out.push('');
    out.push(text(QUADRANT_APPROACH[q], lang));
    out.push('');
    if (members.length === 0) {
      out.push(label(L.none, lang));
      out.push('');
      continue;
    }
    out.push(
      `| ${label(L.name, lang)} | ${label(L.role, lang)} | ${label(L.influence, lang)} | ${label(L.interest, lang)} | ${label(L.concerns, lang)} | ${label(L.approach, lang)} |`,
    );
    out.push('| --- | --- | :-: | :-: | --- | --- |');
    for (const s of members) {
      out.push(
        [
          '',
          cell(stakeholderTag(s)),
          cell(s.role) || '—',
          label(INFLUENCE_LABEL[s.influence], lang),
          label(INFLUENCE_LABEL[s.interest], lang),
          cell(s.concerns.join(' / ')) || '—',
          cell(s.approach) || '—',
          '',
        ].join(' | ').trim(),
      );
    }
    out.push('');
  }

  // --- 指摘 ---
  const findings: Finding[] = [];
  for (const s of people) {
    const q = quadrantOf(s);
    if (s.concerns.length === 0) {
      findings.push({
        severity: q === 'manageClosely' || q === 'keepSatisfied' ? 'high' : 'medium',
        subject: s.name,
        issue: { ja: '関心事が未記入', en: 'No concerns recorded' },
        recommendation: {
          ja: '本人の言葉で関心事を 2〜3 個聞き取る。関心事が無いまま作った成果物は、その人のレビューを通らない。',
          en: 'Interview them for two or three concerns in their own words. Deliverables built without them will not survive that person’s review.',
        },
      });
    }
    if (!(s.approach && s.approach.trim().length > 0)) {
      findings.push({
        severity: q === 'manageClosely' || q === 'keepSatisfied' ? 'high' : 'low',
        subject: s.name,
        issue: { ja: '関与方針が未設定', en: 'No engagement approach set' },
        recommendation: {
          ja: `「誰が・どの頻度で・何を渡すか」を 1 行で決める。「${QUADRANT_LABEL[q].ja}」の方針を出発点にする。`,
          en: `Write one line covering who contacts them, how often, and with what. Start from the "${QUADRANT_LABEL[q].en}" approach.`,
        },
      });
    }
  }
  const highInfluence = people.filter((s) => s.influence === 'high').length;
  if (highInfluence === 0) {
    findings.push({
      severity: 'high',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: '影響力「高」の人が 1 人もいない',
        en: 'Nobody is recorded with high influence',
      },
      recommendation: {
        ja: '予算・体制・優先順位を最終的に決める人を特定して登録する。決裁者が居ないまま進む案件は、承認段階で必ず止まる。',
        en: 'Identify and record whoever finally decides budget, staffing, and priority. An engagement without a decision-maker stalls at approval.',
      },
    });
  }
  if (people.length >= 4 && groups.manageClosely.length / people.length > 0.6) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: '大半が「密に関与」に集中しており、優先順位が付いていない',
        en: 'Most stakeholders land in "manage closely", so no priority is expressed',
      },
      recommendation: {
        ja: '影響力を「この人の反対で計画が止まるか」で、関心度を「自分から状況を聞きに来るか」で付け直す。全員が最重要なら、誰にも十分な時間を割けない。',
        en: 'Re-rate influence by "can this person stop the plan" and interest by "do they come asking for status". If everyone is top priority, nobody gets enough of your time.',
      },
    });
  }
  if (groups.monitor.length === people.length) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: { ja: '全員が「監視」象限にいる', en: 'Everyone falls into the "monitor" quadrant' },
      recommendation: {
        ja: '評価が低すぎるか、本当の関係者がまだ登録されていない。決裁者と業務側の責任者を追加する。',
        en: 'Either the ratings are too low or the real stakeholders are missing. Add the decision-maker and the business-side owner.',
      },
    });
  }
  out.push(...renderFindings(findings, lang));

  // --- 解釈と次の一手 ---
  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');
  const reading: Bilingual[] = [];
  reading.push({
    ja: `登録 ${people.length} 名 — 密に関与 ${groups.manageClosely.length} / 満足を維持 ${groups.keepSatisfied.length} / 情報提供 ${groups.keepInformed.length} / 監視 ${groups.monitor.length}。`,
    en: `${people.length} stakeholders — manage closely ${groups.manageClosely.length}, keep satisfied ${groups.keepSatisfied.length}, keep informed ${groups.keepInformed.length}, monitor ${groups.monitor.length}.`,
  });
  if (groups.keepSatisfied.length > 0) {
    reading.push({
      ja: '「満足を維持」の層が最も事故になりやすい層です。影響力が大きいのに関心が低いため、意思決定の直前に初めて中身を見て反対する、という形で表面化します。節目の前に個別に当てておいてください。',
      en: 'The "keep satisfied" group is where surprises come from: high influence, low attention, so they first look at the content right before a decision and object. Brief them individually ahead of each milestone.',
    });
  }
  if (groups.keepInformed.length > 0) {
    reading.push({
      ja: '「情報提供」の層は現場の実態を最もよく知っています。要件の抜けを見つける相手として使うと、後戻りが減ります。',
      en: 'The "keep informed" group knows day-to-day reality best. Using them to find requirement gaps cuts rework later.',
    });
  }
  reading.push({
    ja: 'この配置は固定ではありません。スコープの拡大、体制変更、予算削減のたびに人の位置は動きます。フェーズの切り替え時に見直してください。',
    en: 'These positions are not fixed. Scope growth, reorganizations, and budget cuts all move people. Re-check at each phase boundary.',
  });
  out.push(bullets(reading, lang));
  out.push('');
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      [
        {
          ja: '象限ごとの方針を各人の approach として `update_engagement` に書き戻し、担当者を割り当てる。',
          en: 'Write the per-quadrant approach back into each person’s approach field via `update_engagement`, and assign who owns the relationship.',
        },
        {
          ja: '関心事を成果物の記述内容に対応付ける(誰の関心に、どの図・どの章で答えるか)。',
          en: 'Map each concern to where it is answered (which view, which section of which deliverable).',
        },
        {
          ja: '報告頻度・形式・担当を一覧にしてコミュニケーション計画としてまとめる。',
          en: 'Collect the cadence, format, and owner per stakeholder into a communications plan.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      [
        techniquePointer('stakeholder-management', lang),
        deliverablePointer('stakeholder-map', lang),
        deliverablePointer('communications-plan', lang),
      ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 4/5. assess_maturity / assess_readiness — 評価
// ---------------------------------------------------------------------------

interface DefaultFactor {
  name: Bilingual;
  /** 何を見るか */
  description: Bilingual;
  /** 差が大きいときの改善のヒント */
  hint: Bilingual;
}

/** EA 実践の成熟度を測る既定因子(独自の因子セット) */
const MATURITY_FACTORS: DefaultFactor[] = [
  {
    name: { ja: 'ガバナンスと決定の場', en: 'Governance and decision forum' },
    description: {
      ja: 'アーキテクチャ上の決定を、誰がどこで下し、逸脱をどう扱うかが決まっているか',
      en: 'Whether it is settled who decides architecture matters, where, and how deviations are handled',
    },
    hint: {
      ja: '会議体を増やす前に、既存の投資判断・設計レビューの場に「アーキテクチャ観点の議題」を 1 つ差し込むほうが早い。逸脱時の扱い(期限付き許容)を先に決める。',
      en: 'Rather than adding a new board, insert one architecture item into the existing investment or design review. Decide up front how deviations are handled (time-boxed exceptions).',
    },
  },
  {
    name: { ja: '手法のテーラリング', en: 'Method tailoring' },
    description: {
      ja: 'ADM を自組織の規模・文化・調達方式に合わせて調整し、実際に回せているか',
      en: 'Whether the ADM is tailored to the organization’s size, culture, and procurement style and actually runs',
    },
    hint: {
      ja: '全フェーズを厳密にやろうとして止まる例が多い。案件規模別に「必ずやる成果物」を 3 つに絞った軽量版を先に定義する。',
      en: 'Trying to run every phase in full is where teams stall. Define a light version first: three mandatory deliverables per engagement size.',
    },
  },
  {
    name: { ja: '現行・目標の記述と最新性', en: 'Baseline and target descriptions kept current' },
    description: {
      ja: '現行と目標のアーキテクチャが記述され、古くならずに参照されているか',
      en: 'Whether baseline and target architectures are documented, current, and actually referenced',
    },
    hint: {
      ja: '全体を最新に保とうとすると必ず腐る。変更が入る領域だけを更新対象にし、更新の引き金(リリース・調達)に紐づける。',
      en: 'Keeping everything current always rots. Limit updates to areas that change, and tie updates to triggers such as releases or procurements.',
    },
  },
  {
    name: { ja: 'リポジトリと再利用', en: 'Repository and reuse' },
    description: {
      ja: '成果物が集約され、次の案件で実際に再利用されているか',
      en: 'Whether deliverables are collected in one place and genuinely reused on the next engagement',
    },
    hint: {
      ja: '置き場所より「探し方」が問題であることが多い。分類より、案件別に「最初に読む 1 枚」を決めるほうが再利用が進む。',
      en: 'The problem is usually findability, not storage. Naming one "read this first" page per engagement beats elaborate taxonomies.',
    },
  },
  {
    name: { ja: '事業戦略との結び付き', en: 'Link to business strategy' },
    description: {
      ja: 'アーキテクチャ活動が事業目標・投資判断と結び付いているか',
      en: 'Whether architecture work connects to business goals and investment decisions',
    },
    hint: {
      ja: '事業計画の言葉(売上・コスト・リードタイム)に翻訳できていない資料は読まれない。1 つの目標に対する寄与を 1 行で書く練習から始める。',
      en: 'Material that is not translated into business language (revenue, cost, lead time) does not get read. Start by writing one line on the contribution to one goal.',
    },
  },
  {
    name: { ja: '体制とスキル', en: 'People and skills' },
    description: {
      ja: '担当する人数・力量・育成の仕組みが、扱う範囲に見合っているか',
      en: 'Whether headcount, capability, and development match the scope being covered',
    },
    hint: {
      ja: '人を増やす前に扱う範囲を絞るほうが現実的。優先領域を 1〜2 に限定し、そこだけ深く見る体制にする。',
      en: 'Narrowing scope is more realistic than adding headcount. Limit to one or two priority areas and cover those properly.',
    },
  },
  {
    name: { ja: 'ツールと現況の把握', en: 'Tooling and visibility of the estate' },
    description: {
      ja: '構成情報の管理・可視化・現況取得がどれだけ手作業から離れているか',
      en: 'How far inventory, visualization, and current-state discovery have moved off manual effort',
    },
    hint: {
      ja: '高機能なツールより、既にある台帳(資産管理・監視・課金)を突き合わせるほうが早く効く。手入力の台帳は必ずずれる。',
      en: 'Reconciling existing sources (asset management, monitoring, billing) beats buying a sophisticated tool. Hand-maintained inventories always drift.',
    },
  },
  {
    name: { ja: '効果の測定', en: 'Measuring the value delivered' },
    description: {
      ja: 'アーキテクチャ活動の効果を測り、次の判断に使えているか',
      en: 'Whether the effect of architecture work is measured and fed back into decisions',
    },
    hint: {
      ja: '測る指標を後から作ると必ず有利な数字になる。着手時に「この案件で何が下がれば成功か」を 1 つ決めて記録しておく。',
      en: 'Metrics invented afterwards always flatter the result. At kickoff, fix one number that must go down for the work to count as successful.',
    },
  },
];

/** 変革準備度を測る既定因子(独自の因子セット) */
const READINESS_FACTORS: DefaultFactor[] = [
  {
    name: { ja: '経営の意思とスポンサー', en: 'Executive intent and sponsorship' },
    description: {
      ja: '変革を主導する経営層が居て、抵抗が出たときに前へ出るか',
      en: 'Whether an executive owns the change and will step forward when resistance appears',
    },
    hint: {
      ja: 'スポンサーが名目だけの場合、最初の対立で計画が止まる。着手前に「揉めたときに何を判断してもらうか」を具体的に握る。',
      en: 'A sponsor in name only means the plan halts at the first conflict. Before starting, agree specifically what they will rule on when it gets contested.',
    },
  },
  {
    name: { ja: '予算の確保', en: 'Funding commitment' },
    description: {
      ja: '複数年にわたる費用が、単年度の思いつきではなく計画として確保されているか',
      en: 'Whether multi-year cost is committed as a plan rather than a single-year impulse',
    },
    hint: {
      ja: '初年度だけ付いた予算で始める変革は、中間状態で止まって最悪の形(二重運用)で固定化する。最低限、中間の到達点までの費用を確保する。',
      en: 'A transformation funded only for year one freezes mid-way in the worst shape: dual operation. Secure funding at least to the first interim state.',
    },
  },
  {
    name: { ja: '推進体制と権限', en: 'Change organization and authority' },
    description: {
      ja: '専任の推進役が居て、部門をまたいで決められる権限があるか',
      en: 'Whether dedicated change leads exist with authority that crosses departments',
    },
    hint: {
      ja: '兼任だけの体制は、通常業務が忙しくなった瞬間に止まる。工数の何割を割くかを人事上の合意として取る。',
      en: 'A team of part-timers stops the moment day-to-day work spikes. Get the percentage of their time agreed as a staffing commitment.',
    },
  },
  {
    name: { ja: 'スキルと経験', en: 'Skills and experience' },
    description: {
      ja: '目標状態を作り、運用するために必要な技術・業務知識が組織内にあるか',
      en: 'Whether the technical and domain skills to build and run the target state exist in-house',
    },
    hint: {
      ja: '外部調達で埋める場合、引き継ぎ先が居ないと運用開始後に破綻する。内製化の対象範囲を先に決めてから調達する。',
      en: 'If you buy the skills in, decide who takes them over first; otherwise it breaks once operations start. Fix what stays in-house before contracting.',
    },
  },
  {
    name: { ja: '過去の変革実績', en: 'Track record of past change' },
    description: {
      ja: '過去に同規模の変革をやり切った経験があり、その学びが残っているか',
      en: 'Whether the organization has finished a change of similar size and kept what it learned',
    },
    hint: {
      ja: '失敗の記憶が強い組織では、計画の正しさより「今回は何が違うのか」の説明が効く。前回止まった原因を 1 つ挙げ、対処を明示する。',
      en: 'Where past failure is fresh, explaining what is different this time beats arguing the plan is correct. Name one reason the last attempt stopped and how it is handled now.',
    },
  },
  {
    name: { ja: '業務部門の受容度', en: 'Acceptance by the business' },
    description: {
      ja: '業務のやり方が変わることを現場が受け入れられる状態にあるか',
      en: 'Whether the front line can absorb a change to how the work is done',
    },
    hint: {
      ja: '反対の正体は「不便になる」ではなく「評価が下がる」であることが多い。移行期の評価・目標をどう扱うかを人事側と決める。',
      en: 'Objections are usually about performance ratings, not inconvenience. Settle with HR how targets and appraisals work during the transition.',
    },
  },
  {
    name: { ja: '変革の必要性の共有', en: 'Shared sense of necessity' },
    description: {
      ja: 'なぜ今変えるのかが、経営から現場まで同じ言葉で語られているか',
      en: 'Whether why-now is told in the same words from the executive floor to the front line',
    },
    hint: {
      ja: '説明資料を増やすより、現場が実際に困っている事象を 1 つ選び、それが解消される形で語るほうが伝わる。',
      en: 'Rather than more slides, pick one problem the front line actually suffers and frame the change as removing it.',
    },
  },
  {
    name: { ja: 'IT 環境の変更容易性', en: 'Ability to change the IT estate' },
    description: {
      ja: '既存システムに手を入れられる状態か(構成情報・テスト環境・保守契約)',
      en: 'Whether existing systems can actually be changed (inventory, test environments, support contracts)',
    },
    hint: {
      ja: '変更できない理由が「技術」ではなく「保守契約と検証環境の不足」であることは多い。着手前に契約と環境を点検する。',
      en: 'The blocker is often support contracts and missing test environments rather than technology. Audit contracts and environments before starting.',
    },
  },
];

interface FactorInput {
  name: string;
  current: number;
  target: number;
  note?: string;
}

interface AssessmentInput {
  factors?: FactorInput[];
  scale: number;
  save: boolean;
  title?: string;
  lang: string;
}

const ASSESSMENT_INTRO: Record<AssessmentKind, Bilingual> = {
  maturity: {
    ja: 'EA 実践がどこまで組織に根付いているかを因子ごとに測ります。点数そのものより、「どの因子が足を引っ張っているか」と「その差が事業にどう効くか」を読むための道具です。',
    en: 'Measures how far EA practice has taken root, factor by factor. The score matters less than which factor holds the rest back and what that costs the business.',
  },
  readiness: {
    ja: '変革に着手できる状態かを因子ごとに測ります。準備度が低い因子は、計画の巧拙に関係なく変革を止める要因になるため、着手前の手当てが要ります。',
    en: 'Measures whether the organization can start the change. A weak factor stops a transformation regardless of how good the plan is, so it needs handling before kickoff.',
  },
};

const GENERIC_HINT: Record<AssessmentKind, Bilingual> = {
  maturity: {
    ja: '差の原因を「決め事が無い」「決めたが守られていない」「人手が足りない」のどれかに切り分ける。原因が違えば打ち手も費用も変わる。',
    en: 'Separate the cause into "no rule exists", "the rule is ignored", or "not enough people". The remedy and its cost differ for each.',
  },
  readiness: {
    ja: '不足の原因を「意思」「資源」「能力」のどれかに切り分け、着手前に埋める手当てを決める。埋まらないなら、その範囲は今回のスコープから外す。',
    en: 'Separate the shortfall into intent, resources, or capability, and decide how it is closed before kickoff. If it cannot be closed, take that area out of scope.',
  },
};

function defaultFactorsFor(kind: AssessmentKind): DefaultFactor[] {
  return kind === 'maturity' ? MATURITY_FACTORS : READINESS_FACTORS;
}

/** 入力された因子名から既定因子を引く(完全一致 → 部分一致) */
function findDefaultFactor(name: string, set: DefaultFactor[]): DefaultFactor | undefined {
  const key = normalizeName(name);
  const exact = set.find((f) => normalizeName(f.name.ja) === key || normalizeName(f.name.en) === key);
  if (exact) return exact;
  if (key.length < 3) return undefined;
  return set.find((f) => {
    const ja = normalizeName(f.name.ja);
    const en = normalizeName(f.name.en);
    return key.includes(ja) || ja.includes(key) || key.includes(en) || en.includes(key);
  });
}

/** 因子未指定のとき、既定の因子セットを提示して評価を促す */
function renderFactorTemplate(kind: AssessmentKind, scale: number, lang: Lang): string {
  const set = defaultFactorsFor(kind);
  const out: string[] = [];
  out.push(`# ${label(ASSESSMENT_KIND_LABEL[kind], lang)}`);
  out.push('');
  out.push(text(ASSESSMENT_INTRO[kind], lang));
  out.push('');
  out.push(
    msg(
      `因子が指定されていないため、既定の因子セット(${set.length} 件)を提示します。0〜${scale} で現在(current)と目標(target)を付けて、もう一度このツールを呼んでください。`,
      `No factors were supplied, so here is the default set (${set.length} factors). Rate current and target from 0 to ${scale} and call this tool again.`,
      lang,
    ),
  );
  out.push('');
  out.push(`| # | ${label(L.factor, lang)} | ${inline('何を見るか', 'What to look at', lang)} |`);
  out.push('| :-: | --- | --- |');
  set.forEach((f, i) => {
    out.push(`| ${i + 1} | ${cell(text(f.name, lang))} | ${cell(text(f.description, lang))} |`);
  });
  out.push('');
  out.push(`## ${inline('評点の目安', 'How to score', lang)}`);
  out.push('');
  // 尺度が 4 未満だと中間の目安が端の値と重なるため、目安の刻みを変える
  const scoreAnchors: Bilingual =
    scale >= 4
      ? {
          ja: `0 = まったく無い / 1 = 個人の努力に依存 / ${Math.round(scale / 2)} 前後 = 決まってはいるが例外が多い / ${scale - 1} = 定着して回っている / ${scale} = 測って改善まで回っている`,
          en: `0 = absent; 1 = depends on individuals; around ${Math.round(scale / 2)} = defined but frequently bypassed; ${scale - 1} = established and running; ${scale} = measured and continuously improved`,
        }
      : {
          ja: `0 = まったく無い / ${scale - 1} = 決まってはいるが例外が多い / ${scale} = 定着し、測って改善まで回っている(${scale} 段階の尺度なので中間の目安は置いていません。細かく見たい場合は scale を 5 前後にしてください)`,
          en: `0 = absent; ${scale - 1} = defined but frequently bypassed; ${scale} = established, measured, and improving (a ${scale}-point scale leaves no room for intermediate anchors; use a scale of about 5 if you need finer steps)`,
        };
  out.push(
    bullets(
      [
        scoreAnchors,
        {
          ja: '目標は「理想」ではなく「次の 12〜18 か月で到達したい水準」を入れる。全因子を最高値にした目標は計画として使えない。',
          en: 'Set the target to where you intend to be in 12–18 months, not to the ideal. A target of maximum everywhere cannot be planned against.',
        },
        {
          ja: '現在の評点は、複数人に別々に付けてもらうと差が出る。その差自体が実態を語る。',
          en: 'Have several people score current levels independently. The spread between them is itself informative.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(`## ${inline('呼び出し例', 'Example call', lang)}`);
  out.push('');
  out.push('```json');
  out.push(
    JSON.stringify(
      {
        scale,
        factors: set.slice(0, 3).map((f) => ({
          name: lang === 'en' ? f.name.en : f.name.ja,
          current: 2,
          target: 4,
          note: '',
        })),
      },
      null,
      2,
    ),
  );
  out.push('```');
  out.push('');
  out.push(
    msg(
      '因子は自由に差し替えて構いません。自組織で議論になっている論点を因子にしたほうが、評価結果が使われます。',
      'Feel free to replace the factors. Assessments get used when the factors match what the organization actually argues about.',
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      kind === 'maturity'
        ? [techniquePointer('architecture-maturity', lang), techniquePointer('architecture-governance', lang)]
        : [
            techniquePointer('business-transformation-readiness', lang),
            techniquePointer('capability-based-planning', lang),
          ],
      lang,
    ),
  );
  return out.join('\n');
}

function runAssessment(kind: AssessmentKind, input: AssessmentInput): ToolResult {
  const lang = input.lang as Lang;
  const scale = input.scale;
  const raw = input.factors ?? [];

  if (raw.length === 0) {
    return textResult(renderFactorTemplate(kind, scale, lang));
  }

  // --- 入力検証 ---
  const problems: string[] = [];
  raw.forEach((f, i) => {
    const position = `#${i + 1}${f.name ? ` (${f.name})` : ''}`;
    if (!f.name || f.name.trim().length === 0) {
      problems.push(inline(`${position}: 因子名が空です。`, `${position}: the factor name is empty.`, lang));
    }
    for (const [key, value] of [
      ['current', f.current],
      ['target', f.target],
    ] as const) {
      if (!Number.isFinite(value)) {
        problems.push(inline(`${position}: ${key} が数値ではありません。`, `${position}: ${key} is not a number.`, lang));
      } else if (value < 0 || value > scale) {
        problems.push(
          inline(
            `${position}: ${key}=${value} は 0〜${scale} の範囲外です。`,
            `${position}: ${key}=${value} is outside the range 0–${scale}.`,
            lang,
          ),
        );
      }
    }
  });
  if (problems.length > 0) {
    return errorResult(
      [
        msg('入力に誤りがあります。', 'The input is invalid.', lang),
        '',
        ...problems.map((p) => `- ${p}`),
        '',
        msg(
          `評点は 0 以上 ${scale} 以下で指定してください(scale を変えたい場合は scale パラメータで指定します)。`,
          `Scores must be between 0 and ${scale}. Pass a different scale parameter if you need another range.`,
          lang,
        ),
      ].join('\n'),
    );
  }

  const factors: AssessmentFactor[] = raw.map((f) => ({
    name: f.name.trim(),
    current: f.current,
    target: f.target,
    note: f.note,
  }));

  const defaults = defaultFactorsFor(kind);
  const gaps = factors.map((f) => f.target - f.current);
  const avgCurrent = factors.reduce((a, f) => a + f.current, 0) / factors.length;
  const avgTarget = factors.reduce((a, f) => a + f.target, 0) / factors.length;
  const achievement = avgTarget > 0 ? Math.round((avgCurrent / avgTarget) * 100) : 100;
  const maxGap = Math.max(...gaps);
  const weakest = factors.reduce((a, b) => (a.current <= b.current ? a : b));
  /** 変革リスクとして扱うギャップの目安 */
  const riskThreshold = Math.max(1, Math.round(scale * 0.3));

  const customTitle = input.title && input.title.trim().length > 0 ? input.title.trim() : null;
  // 保存する記録には必ず名前を持たせる(未指定なら評価種別をそのまま名前にする)
  const title = customTitle ?? label(ASSESSMENT_KIND_LABEL[kind], lang === 'both' ? 'ja' : lang);

  const out: string[] = [];
  out.push(`# ${label(ASSESSMENT_KIND_LABEL[kind], lang)}${customTitle ? `: ${customTitle}` : ''}`);
  out.push('');
  out.push(text(ASSESSMENT_INTRO[kind], lang));
  out.push('');
  out.push(
    inline(
      `評価尺度 0〜${scale} / 因子 ${factors.length} 件`,
      `Scale 0–${scale}, ${factors.length} factors`,
      lang,
    ),
  );
  out.push('');

  // --- 因子ごとの表 ---
  out.push(`## ${inline('因子ごとの評価', 'Factor scores', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.factor, lang)} | ${label(L.current, lang)} | ${label(L.target, lang)} | ${label(L.gap, lang)} | ${label(L.note, lang)} |`,
  );
  out.push('| --- | --- | --- | :-: | --- |');
  factors.forEach((f, i) => {
    out.push(
      [
        '',
        cell(f.name),
        `\`${bar(f.current, scale)}\` ${round1(f.current)}`,
        `\`${bar(f.target, scale)}\` ${round1(f.target)}`,
        gaps[i] > 0 ? `+${round1(gaps[i])}` : String(round1(gaps[i])),
        cell(f.note) || '',
        '',
      ].join(' | ').trim(),
    );
  });
  out.push('');

  // --- 総合 ---
  out.push(`## ${inline('総合', 'Overall', lang)}`);
  out.push('');
  out.push(`- ${label(L.current, lang)}: \`${bar(avgCurrent, scale, 20)}\` ${round1(avgCurrent)} / ${scale}`);
  out.push(`- ${label(L.target, lang)}: \`${bar(avgTarget, scale, 20)}\` ${round1(avgTarget)} / ${scale}`);
  // maxGap は負にもなり得る(全因子が目標以上)。符号を付け足すと "+-3" になるため分岐する
  const gapNote: Bilingual =
    maxGap > 0
      ? {
          ja: `最大ギャップ: +${round1(maxGap)}`,
          en: `largest gap: +${round1(maxGap)}`,
        }
      : {
          ja: 'ギャップなし(全因子が目標水準以上)',
          en: 'no gap; every factor is at or above target',
        };
  out.push(
    `- ${inline('目標に対する到達度', 'Progress toward target', lang)}: **${achievement}%** (${text(gapNote, lang)})`,
  );
  out.push('');

  if (avgTarget === 0) {
    out.push(
      msg(
        '目標がすべて 0 のため、到達度の数値は意味を持ちません。到達したい水準を target に入れて再実行してください。',
        'Every target is 0, so the progress figure means nothing. Put the level you intend to reach in target and run this again.',
        lang,
      ),
    );
    out.push('');
  } else if (achievement > 100) {
    out.push(
      msg(
        '現在の評価が目標を上回っています。目標が古いか、低く置かれている可能性が高いので、目標を置き直してから読んでください。',
        'The current scores exceed the target. The target is most likely stale or set too low; reset it before reading the result.',
        lang,
      ),
    );
    out.push('');
  }

  const verdict: Bilingual =
    kind === 'maturity'
      ? achievement >= 90
        ? {
            ja: 'ほぼ目標水準に達しています。次は水準の維持ではなく、目標そのものを引き上げるか、対象範囲を広げるかの選択になります。',
            en: 'You are near the target. The next question is not maintenance but whether to raise the target or widen the scope it applies to.',
          }
        : achievement >= 60
          ? {
              ja: '届く距離にあります。全因子を均等に上げるのではなく、最も低い 1〜2 因子に資源を集中するほうが早く効きます。',
              en: 'Within reach. Concentrating on the one or two weakest factors works faster than lifting everything evenly.',
            }
          : {
              ja: '差が大きい状態です。全部を同時に上げようとすると、どれも中途半端になります。今期は 1 因子に絞り、その因子だけ目標水準に到達させてください。',
              en: 'The gap is wide. Trying to raise everything at once leaves all of it half-done. Pick one factor for this period and take that one to target.',
            }
      : achievement >= 85
        ? {
            ja: '着手できる状態です。ただし最低点の因子は変革中に必ず表面化するので、監視対象として計画に載せてください。',
            en: 'Ready to start. The weakest factor will still surface mid-change, so carry it in the plan as something to watch.',
          }
        : achievement >= 60
          ? {
              ja: '条件付きで着手できます。ギャップの大きい因子に手当てを付けたうえで、範囲を絞って始めるのが現実的です。',
              en: 'You can start with conditions. Put remedies against the wide-gap factors and begin with a narrowed scope.',
            }
          : {
              ja: '着手前に手当てが必要な状態です。この準備度で大規模変革を始めると、中間状態で止まって二重運用が固定化する可能性が高いです。まず準備度を上げる小さな取り組みから始めてください。',
              en: 'Remedies are needed before kickoff. Starting a large transformation from here typically stalls mid-way and freezes dual operation. Begin with a smaller effort that raises readiness itself.',
            };
  out.push(text(verdict, lang));
  out.push('');

  // --- 改善提案(差が大きい順)---
  const ranked = factors
    .map((f, i) => ({ factor: f, gap: gaps[i] }))
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.factor.current - b.factor.current);

  out.push(`## ${inline('改善提案(差が大きい順)', 'Improvement priorities (largest gap first)', lang)}`);
  out.push('');
  if (ranked.length === 0) {
    out.push(
      msg(
        'すべての因子が目標水準に達しています。目標が低すぎないか、あるいは評価が甘くないかを、別の評価者と突き合わせて確認してください。',
        'Every factor is at target. Check with a second assessor whether the targets are too low or the scoring too generous.',
        lang,
      ),
    );
    out.push('');
  } else {
    ranked.forEach((entry, i) => {
      const def = findDefaultFactor(entry.factor.name, defaults);
      out.push(
        `### ${i + 1}. ${entry.factor.name} (${round1(entry.factor.current)} → ${round1(entry.factor.target)}, ${label(L.gap, lang)} +${round1(entry.gap)})`,
      );
      out.push('');
      if (def) out.push(`${inline('見るところ', 'What to look at', lang)}: ${text(def.description, lang)}`);
      out.push(`${label(L.recommendation, lang)}: ${text(def ? def.hint : GENERIC_HINT[kind], lang)}`);
      if (kind === 'readiness' && entry.gap >= riskThreshold) {
        out.push('');
        out.push(
          msg(
            `> 変革リスク候補: この因子のギャップ(+${round1(entry.gap)})は、計画の巧拙に関係なく変革を止める要因になり得ます。`,
            `> Candidate transformation risk: a gap of +${round1(entry.gap)} on this factor can stop the change regardless of plan quality.`,
            lang,
          ),
        );
      }
      out.push('');
    });
  }

  // --- 変革リスクの登録案内(readiness のみ)---
  if (kind === 'readiness') {
    const risky = ranked.filter((x) => x.gap >= riskThreshold);
    out.push(`## ${inline('変革リスクとしての登録', 'Recording these as transformation risks', lang)}`);
    out.push('');
    if (risky.length === 0) {
      out.push(
        msg(
          `ギャップが目安(+${riskThreshold})を超える因子はありません。準備度の面では、いま特別に登録すべきリスクはありません。`,
          `No factor exceeds the threshold of +${riskThreshold}. Nothing here needs recording as a readiness risk right now.`,
          lang,
        ),
      );
      out.push('');
    } else {
      out.push(
        msg(
          `ギャップが +${riskThreshold} 以上の因子が ${risky.length} 件あります。準備不足は「そのうち何とかなる」形で放置されやすいので、リスクとして登録し、受容者と対策を付けてください。このツールはリスクを登録しません。次のように \`update_engagement\` を呼んでください。`,
          `${plural(risky.length, 'factor exceeds', 'factors exceed')} a gap of +${riskThreshold}. Readiness shortfalls quietly persist under the assumption they will sort themselves out, so record them as risks with an owner and a mitigation. This tool does not record them; call \`update_engagement\` as below.`,
          lang,
        ),
      );
      out.push('');
      out.push('```json');
      out.push(
        JSON.stringify(
          {
            risks: risky.slice(0, 3).map((x) => ({
              title:
                lang === 'en'
                  ? `Readiness shortfall: ${x.factor.name}`
                  : `変革準備度の不足: ${x.factor.name}`,
              level: x.gap >= riskThreshold * 1.5 ? 'high' : 'medium',
              status: 'open',
              owner: '',
              mitigation: '',
            })),
          },
          null,
          2,
        ),
      );
      out.push('```');
      out.push('');
    }
  }

  // --- 保存 ---
  const timestamp = now();
  const summary =
    lang === 'en'
      ? `Average ${round1(avgCurrent)} → ${round1(avgTarget)} of ${scale} (${achievement}% of target). Weakest factor: ${weakest.name}.`
      : `平均 ${round1(avgCurrent)} → ${round1(avgTarget)}(${scale} 点満点、到達度 ${achievement}%)。最も低い因子: ${weakest.name}。`;

  out.push(`## ${inline('保存', 'Saving', lang)}`);
  out.push('');
  if (!input.save) {
    out.push(
      msg(
        'save=false のため保存していません。記録として残す場合は save=true で実行してください。',
        'Not saved because save=false. Run again with save=true to keep the record.',
        lang,
      ),
    );
  } else {
    const engagement: Engagement | null = loadEngagement();
    if (!engagement) {
      out.push(
        msg(
          'エンゲージメントが未作成のため保存していません。`start_engagement` で案件を作ってから再実行すると、評価が案件に記録され、時系列で比較できるようになります。',
          'Not saved: no engagement exists. Create one with `start_engagement` and run this again to keep the assessment with the engagement and compare over time.',
          lang,
        ),
      );
    } else {
      const assessment: Assessment = {
        id: makeId('asmt'),
        kind,
        title,
        scale,
        factors,
        summary,
        assessedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      engagement.assessments.push(assessment);
      saveEngagement(engagement);
      const previous = engagement.assessments.filter((a) => a.kind === kind && a.id !== assessment.id);
      out.push(
        msg(
          `案件「${engagement.name}」に評価を保存しました(ID: \`${assessment.id}\`)。`,
          `Saved to engagement "${engagement.name}" (id: \`${assessment.id}\`).`,
          lang,
        ),
      );
      if (previous.length > 0) {
        // 手書き JSON でも落ちないように、評価日・因子の欠損を許容する
        const at = (a: Assessment): string => (typeof a.assessedAt === 'string' ? a.assessedAt : '');
        const last = [...previous].sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0))[
          previous.length - 1
        ];
        const lastFactors = Array.isArray(last.factors) ? last.factors : [];
        const lastAvg = lastFactors.length > 0
          ? lastFactors.reduce((a, f) => a + (Number.isFinite(f?.current) ? f.current : 0), 0) / lastFactors.length
          : 0;
        const lastDate = at(last).slice(0, 10) || '—';
        const delta = round1(avgCurrent - lastAvg);
        out.push('');
        out.push(
          msg(
            `同種の評価が ${previous.length} 件あります。直近(${lastDate})の平均 ${round1(lastAvg)} との差は ${delta >= 0 ? '+' : ''}${delta} です。尺度や因子が違う場合、この差は比較になりません。`,
            `${plural(previous.length, 'earlier assessment', 'earlier assessments')} of the same kind exist${previous.length === 1 ? 's' : ''}. Compared with the most recent (${lastDate}, average ${round1(lastAvg)}), the change is ${delta >= 0 ? '+' : ''}${delta}. The comparison only holds if the scale and factors match.`,
            lang,
          ),
        );
      }
    }
  }
  out.push('');

  // --- 次の一手 ---
  out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      kind === 'maturity'
        ? [
            {
              ja: '最も低い因子を 1 つ選び、6 か月で 1 段上げるための具体的な取り組みを決める(担当・期限付き)。',
              en: 'Pick the single weakest factor and define concrete work to raise it one level in six months, with an owner and a date.',
            },
            {
              ja: '評価結果を経営層に見せるときは、点数ではなく「この差があると何が起きるか」を先に語る。',
              en: 'When you show this to executives, lead with what the gap causes, not with the scores.',
            },
            {
              ja: '同じ因子・同じ尺度で半年ごとに測り直す。因子を変えると前回との比較ができなくなる。',
              en: 'Re-measure every six months with the same factors and scale. Changing factors destroys comparability.',
            },
            {
              ja: '結果を `update_engagement` のアクション・決定事項に落とし込み、`get_dashboard` で共有する。',
              en: 'Turn the outcome into actions and decisions via `update_engagement`, then share with `get_dashboard`.',
            },
          ]
        : [
            {
              ja: 'ギャップの大きい因子に手当てを決め、手当てが付かない因子については、その領域を今回のスコープから外すことを検討する。',
              en: 'Assign a remedy to each wide-gap factor; where no remedy is possible, consider taking that area out of scope for this round.',
            },
            {
              ja: '準備度の低さは、移行アーキテクチャの刻み方で緩和できる。到達点を小さく区切り、各区切りで成果を見せる。',
              en: 'Weak readiness can be absorbed by how you slice the transitions: smaller milestones, visible results at each.',
            },
            {
              ja: '評価結果をスポンサーと共有し、着手の可否そのものを決定事項として記録する。',
              en: 'Share the result with the sponsor and log the decision to proceed (or not) as a decision.',
            },
            {
              ja: '着手後も四半期ごとに測り直す。準備度は体制変更や予算見直しで簡単に下がる。',
              en: 'Re-measure quarterly after kickoff. Readiness drops easily with reorganizations and budget reviews.',
            },
          ],
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      kind === 'maturity'
        ? [techniquePointer('architecture-maturity', lang), techniquePointer('architecture-governance', lang)]
        : [
            techniquePointer('business-transformation-readiness', lang),
            techniquePointer('capability-based-planning', lang),
          ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

const factorInputSchema = z.object({
  name: z.string().min(1).describe('評価因子名 / Factor name'),
  current: z.number().describe('現在の水準(0〜scale) / Current level, 0 to scale'),
  target: z.number().describe('目標の水準(0〜scale) / Target level, 0 to scale'),
  note: z.string().optional().describe('根拠・補足 / Evidence or remarks'),
});

const scaleSchema = z
  .number()
  .int()
  .min(2)
  .max(10)
  .default(5)
  .describe('評価尺度の最大値(既定 5) / Maximum value of the rating scale, default 5');

export function registerAnalysisTools(server: McpServer): void {
  server.registerTool(
    'gap_analysis',
    {
      title: 'Run a gap analysis',
      description:
        '現行(baseline)と目標(target)の構成要素を突き合わせ、マトリクスで対応関係を可視化し、新規に必要なもの・廃止されるもの・改修/置換されるものをギャップとして洗い出して、それぞれの推奨アクションと解釈を返す。廃止側も必ず出すため、コスト削減の根拠が消えない。 / Compare baseline and target elements, render the mapping as a matrix, and derive the gaps: what must be newly created, what gets eliminated, and what is modified or replaced, each with a recommended action. Eliminations are always reported so the cost-reduction case stays visible.',
      inputSchema: {
        baseline: z
          .array(z.string())
          .describe('現行の構成要素(能力・システム・データ・技術など) / Baseline elements: capabilities, systems, data, technologies'),
        target: z.array(z.string()).describe('目標の構成要素 / Target elements'),
        mappings: z
          .array(
            z.object({
              from: z.string().describe('現行の要素名 / Baseline element name'),
              to: z.string().describe('目標の要素名 / Target element name'),
              kind: z
                .enum(MAPPING_KINDS)
                .describe('retained=そのまま流用 / modified=改修して流用 / replaced=置き換え'),
            }),
          )
          .optional()
          .describe(
            '現行と目標の対応関係。省略した現行要素は、同名の目標があれば維持、無ければ廃止として扱う / Mapping between baseline and target. Unmapped baseline elements are retained when a same-named target exists, otherwise eliminated',
          ),
        domain: z
          .string()
          .optional()
          .describe('対象ドメイン(business / data / application / technology など) / Architecture domain'),
        lang: langSchema,
      },
    },
    async ({ baseline, target, mappings, domain, lang }) =>
      runGapAnalysis({ baseline, target, mappings, domain, lang }),
  );

  server.registerTool(
    'risk_matrix',
    {
      title: 'Visualize the risk matrix',
      description:
        '保存されている案件のリスクを、レベル × 状態、および現在レベル × 残存レベルのマトリクスで可視化し、残存リスク未評価・受容者未設定・重大リスクの対策空欄などを要対応として指摘する。 / Plot the stored engagement risks as level x status and current x residual matrices, and flag what needs attention: unassessed residual risk, missing owners, and severe risks with no mitigation.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => runRiskMatrix(lang as Lang),
  );

  server.registerTool(
    'stakeholder_matrix',
    {
      title: 'Visualize the stakeholder matrix',
      description:
        'ステークホルダーを影響力 × 関心度の 4 象限(密に関与 / 満足を維持 / 情報提供 / 監視)に配置し、象限ごとの推奨関与方針と、関心事・関与方針が未記入の人を指摘する。 / Place stakeholders in the influence x interest quadrants (manage closely, keep satisfied, keep informed, monitor), give the recommended approach per quadrant, and flag anyone missing concerns or an engagement approach.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => runStakeholderMatrix(lang as Lang),
  );

  server.registerTool(
    'assess_maturity',
    {
      title: 'Assess EA practice maturity',
      description:
        'EA 実践の成熟度を因子ごとに評価し、現在/目標/差をバー付きの表、総合スコア、差の大きい順の改善提案として返す。因子を省略すると既定の因子セットを提示する。save=true でエンゲージメントに評価を保存する。 / Assess EA practice maturity factor by factor and return a bar table of current, target, and gap, an overall score, and improvement priorities ordered by gap. Omit factors to get the default factor set. With save=true the assessment is stored on the engagement.',
      inputSchema: {
        factors: z
          .array(factorInputSchema)
          .optional()
          .describe('評価因子。省略すると既定の因子セットを提示する / Factors; omit to receive the default set'),
        scale: scaleSchema,
        save: z
          .boolean()
          .default(true)
          .describe('エンゲージメントに評価を保存する / Store the assessment on the engagement'),
        title: z.string().optional().describe('評価の名前(任意) / Optional title for this assessment'),
        lang: langSchema,
      },
    },
    async ({ factors, scale, save, title, lang }) =>
      runAssessment('maturity', { factors, scale, save, title, lang }),
  );

  server.registerTool(
    'assess_readiness',
    {
      title: 'Assess business transformation readiness',
      description:
        '変革準備度(経営の意思・予算・体制・スキル・変革実績・業務部門の受容度など)を因子ごとに評価し、バー付きの表・総合判定・改善提案を返す。ギャップの大きい因子は変革リスクとして扱い、`update_engagement` での登録方法を案内する。 / Assess transformation readiness (executive intent, funding, organization, skills, track record, business acceptance, and more) and return a bar table, an overall verdict, and improvement priorities. Wide-gap factors are called out as transformation risks with guidance on recording them via `update_engagement`.',
      inputSchema: {
        factors: z
          .array(factorInputSchema)
          .optional()
          .describe('評価因子。省略すると既定の因子セットを提示する / Factors; omit to receive the default set'),
        scale: scaleSchema,
        save: z
          .boolean()
          .default(true)
          .describe('エンゲージメントに評価を保存する / Store the assessment on the engagement'),
        title: z.string().optional().describe('評価の名前(任意) / Optional title for this assessment'),
        lang: langSchema,
      },
    },
    async ({ factors, scale, save, title, lang }) =>
      runAssessment('readiness', { factors, scale, save, title, lang }),
  );
}
