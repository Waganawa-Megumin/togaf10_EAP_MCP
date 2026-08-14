/**
 * ビジネスアーキテクチャ実務ツール / Business architecture practice tools.
 *
 * フェーズ B の「ビジネスアーキテクチャを作れ」を、能力マップ・バリューストリーム・
 * クロスマッピングの具体的な手順と検査に落とす。抽象論ではなく、次に手を動かす形で返す。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { bullets, matchesKeyword, text, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  ANTI_PATTERNS,
  CAPABILITY_GROUP_LABELS,
  CAPABILITY_LEVELS,
  CAPABILITY_METHOD,
  CROSS_MAPPING,
  INDUSTRY_CAPABILITY_SETS,
  NAMING_LEXICON,
  REFERENCE_CAPABILITIES,
  VALUE_STREAM_METHOD,
  detectIndustryCapabilitySets,
  findAntiPattern,
  findCrossMapping,
  findIndustryCapabilitySet,
  type CapabilityGroup,
  type CrossMapping,
  type IndustryCapabilitySet,
  type Method,
  type ReferenceCapability,
} from '../knowledge/business-architecture.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

// ---------------------------------------------------------------------------
// 小さな整形ヘルパ / Small formatting helpers
// ---------------------------------------------------------------------------

const L = {
  goal: { ja: 'ゴール', en: 'Goal' },
  prereq: { ja: '始める前に揃えるもの', en: 'Before you start' },
  overview: { ja: '手順の全体像', en: 'Steps at a glance' },
  step: { ja: 'ステップ', en: 'Step' },
  output: { ja: 'アウトプット', en: 'Output' },
  failure: { ja: '失敗パターン', en: 'Failure mode' },
  effort: { ja: '目安', en: 'Effort' },
  how: { ja: '進め方', en: 'How' },
  doneWhen: { ja: '完了判定(これが言えたら終わり)', en: 'Done when' },
  nextMove: { ja: '次の一手', en: 'Your next move' },
  legend: { ja: '凡例', en: 'Legend' },
  fillingTips: { ja: '埋めるときの注意', en: 'While filling it in' },
  readings: { ja: '埋めた後の読み方', en: 'Reading it once filled' },
  pattern: { ja: '見えたパターン', en: 'What you see' },
  suspect: { ja: '疑うこと', en: 'What to suspect' },
  action: { ja: '次の一手', en: 'What to do' },
  purpose: { ja: '何のために作るのか', en: 'Why build it' },
  draftWarning: {
    ja: '**これは草案です。** 事業側との対話を経ていない能力マップは、必ずどこかが間違っています。下の質問を持って事業側に当て、名前・粒度・抜けを直してから版を固めてください。草案のまま経営層に出さないこと。',
    en: '**This is a draft.** A capability map that has not been through a conversation with the business is wrong somewhere, guaranteed. Take the questions below to the business, fix the names, the granularity, and the gaps, and only then freeze a version. Do not put the draft in front of executives.',
  },
};

/** 二言語の 1 行 */
function line(value: Bilingual, lang: Lang): string {
  return text(value, lang);
}

/**
 * 日英を「必ず 1 行で」畳む。
 * `msg()` は lang='both' のとき改行を挟むため、表のセル・見出し・強調の内側で使うと
 * Markdown が壊れる(表が 2 行に割れる / 見出しの英語側が本文に落ちる)。行内はこちらを使う。
 */
function inline(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** Markdown 表のセルとして安全化する */
function cell(s: string): string {
  return s.replace(/\\/g, '＼').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Mermaid のラベルとして安全化する */
function mermaidLabel(s: string): string {
  return s.replace(/["`]/g, "'").replace(/[[\]{}()<>|;]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** lang=both のとき日英を 1 セルに畳む */
function cellBi(value: Bilingual, lang: Lang): string {
  if (lang === 'both') return cell(`${value.ja}<br>${value.en}`);
  return cell(text(value, lang));
}

// ---------------------------------------------------------------------------
// 手順のレンダリング / Method rendering
// ---------------------------------------------------------------------------

function renderMethodOverview(method: Method, lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${line(method.name, lang)}`);
  out.push('');
  out.push(`**${line(L.goal, lang)}**: ${line(method.goal, lang)}`);
  out.push('');
  out.push(`## ${line(L.prereq, lang)}`);
  out.push(bullets(method.prerequisites, lang));
  out.push('');
  out.push(`## ${line(L.overview, lang)}`);
  out.push('');
  out.push('```mermaid');
  out.push('flowchart LR');
  for (const s of method.steps) {
    const label = mermaidLabel(lang === 'en' ? s.name.en : s.name.ja);
    out.push(`  S${s.no}["${s.no}. ${label}"]`);
  }
  for (let i = 0; i < method.steps.length - 1; i += 1) {
    out.push(`  S${method.steps[i]!.no} --> S${method.steps[i + 1]!.no}`);
  }
  out.push('```');
  out.push('');
  out.push(`| # | ${line(L.step, lang)} | ${line(L.output, lang)} | ${line(L.effort, lang)} |`);
  out.push('| :-: | --- | --- | --- |');
  for (const s of method.steps) {
    out.push(`| ${s.no} | ${cellBi(s.name, lang)} | ${cellBi(s.output, lang)} | ${cell(text(s.effort, lang))} |`);
  }
  out.push('');
  for (const s of method.steps) {
    out.push(renderMethodStep(method, s.no, lang, 2));
  }
  out.push(`## ${line(L.doneWhen, lang)}`);
  out.push(bullets(method.doneWhen, lang));
  out.push('');
  out.push(
    msg(
      `1 ステップだけ詳しく見るときは \`step\` を指定してください(1〜${method.steps.length})。`,
      `Pass \`step\` (1–${method.steps.length}) to get a single step on its own.`,
      lang,
    ),
  );
  return out.join('\n');
}

function renderMethodStep(method: Method, no: number, lang: Lang, level = 1): string {
  const s = method.steps.find((x) => x.no === no);
  if (!s) return '';
  const h = '#'.repeat(level);
  const out: string[] = [];
  out.push(`${h} ${s.no}. ${line(s.name, lang)}`);
  out.push('');
  out.push(line(s.what, lang));
  out.push('');
  out.push(`**${line(L.how, lang)}**`);
  out.push(bullets(s.how, lang));
  out.push('');
  out.push(`- **${line(L.output, lang)}**: ${line(s.output, lang)}`);
  out.push(`- **${line(L.failure, lang)}**: ${line(s.failure, lang)}`);
  out.push(`- **${line(L.effort, lang)}**: ${line(s.effort, lang)}`);
  out.push('');
  return out.join('\n');
}

function renderSingleStep(method: Method, no: number, lang: Lang): string {
  const s = method.steps.find((x) => x.no === no);
  if (!s) return '';
  const out: string[] = [];
  out.push(`# ${line(method.name, lang)} — ${s.no}/${method.steps.length}`);
  out.push('');
  out.push(renderMethodStep(method, no, lang, 2));
  const next = method.steps.find((x) => x.no === no + 1);
  out.push(`## ${line(L.nextMove, lang)}`);
  if (next) {
    out.push(
      msg(
        `このステップのアウトプット(${s.output.ja})が出たら、次は「${next.no}. ${next.name.ja}」。`,
        `Once you have the output (${s.output.en}), move to "${next.no}. ${next.name.en}".`,
        lang,
      ),
    );
  } else {
    out.push(msg('最終ステップです。完了判定を確認してください。', 'This is the last step. Check the done-when criteria.', lang));
    out.push('');
    out.push(bullets(method.doneWhen, lang));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 能力マップ草案 / Draft capability map
// ---------------------------------------------------------------------------

const GROUP_ORDER: CapabilityGroup[] = ['core', 'enabling', 'governing'];

interface ScoredCapability {
  cap: ReferenceCapability;
  hits: string[];
}

/**
 * 草案に載る能力 1 件。
 * 汎用セットと業界セットを同じ形にして、描画側が区別せず並べられるようにする。
 */
interface DraftItem {
  cap: ReferenceCapability;
  /** 事業説明の語に反応した手がかり */
  hits: string[];
  /** 業界セット由来か */
  fromIndustry: boolean;
  /** 業界セット名(業界由来のときだけ) */
  setName?: Bilingual;
}

/** 業界セットの決定結果 */
interface IndustryResolution {
  /** 適用した業界セット(0〜2 件) */
  sets: IndustryCapabilitySet[];
  /** 記述から推定したか(true なら出力で必ず断る) */
  inferred: boolean;
  /** industry の指定はあったが、対応するセットが無かったときの入力値 */
  unknownInput?: string;
  /** 推定・照合に使った語(強い順) */
  matched: string[];
}

function scoreCapabilities(haystackLower: string): ScoredCapability[] {
  return REFERENCE_CAPABILITIES.map((cap) => ({
    cap,
    hits: cap.triggers.filter((t) => matchesKeyword(haystackLower, t)),
  }));
}

/** 用意がある業界セットの一覧を 1 行にする(指定できる値を利用者に見せるため) */
function industryMenu(lang: Lang): string {
  return INDUSTRY_CAPABILITY_SETS.map((s) => `\`${s.id}\`(${lang === 'en' ? s.name.en : s.name.ja})`).join(' / ');
}

/**
 * industry 引数と事業説明から、適用する業界セットを決める。
 * - 指定があればそれを優先する
 * - 指定が無ければ記述から推定する(推定した事実は必ず出力に出す)
 * - 記述が別の業界を強く示すときは 2 つ目として足す(銀行が保険窓販を主力にしている等)
 */
function resolveIndustry(businessDescription: string, industry: string | undefined): IndustryResolution {
  const detections = detectIndustryCapabilitySets(businessDescription);
  const specifiedRaw = industry?.trim() ?? '';
  const specified = specifiedRaw.length > 0 ? findIndustryCapabilitySet(specifiedRaw) : undefined;

  if (specified) {
    const sets = [specified];
    // 指定された業界とは別の業界を記述が強く示している場合だけ、2 つ目を足す
    const extra = detections.find((d) => d.set.id !== specified.id && d.confident && d.score >= 8);
    if (extra) sets.push(extra.set);
    const matched = detections.find((d) => d.set.id === specified.id)?.matched ?? [];
    return { sets, inferred: false, matched };
  }

  const unknownInput = specifiedRaw.length > 0 ? specifiedRaw : undefined;
  // 当たり所が 1 つの能力に偏っている候補(confident=false)は推定に使わない。
  // 素点 4 未満も「その語がたまたま出ただけ」の可能性が高いので推定しない。
  const top = detections.find((d) => d.confident);
  if (top && top.score >= 4) {
    return { sets: [top.set], inferred: true, matched: top.matched, unknownInput };
  }
  return { sets: [], inferred: false, matched: [], unknownInput };
}

/** 業界セット + 汎用セットから草案を組み立てる */
function buildDraftItems(
  haystack: string,
  resolution: IndustryResolution,
): {
  drafted: DraftItem[];
  deferred: ScoredCapability[];
  /** 業界能力に置き換えた汎用能力(汎用 → 置き換えた業界能力) */
  replaced: { generic: ReferenceCapability; by: DraftItem }[];
} {
  const industryItems: DraftItem[] = [];
  const supersededBy = new Map<string, DraftItem>();
  for (const set of resolution.sets) {
    for (const cap of set.capabilities) {
      const item: DraftItem = {
        cap,
        hits: cap.triggers.filter((t) => matchesKeyword(haystack, t)),
        fromIndustry: true,
        setName: set.name,
      };
      industryItems.push(item);
      for (const superseded of cap.supersedes ?? []) {
        if (!supersededBy.has(superseded)) supersededBy.set(superseded, item);
      }
    }
  }

  const scored = scoreCapabilities(haystack);
  const genericItems: DraftItem[] = scored
    .filter((s) => (s.cap.universal || s.hits.length > 0) && !supersededBy.has(s.cap.id))
    .map((s) => ({ cap: s.cap, hits: s.hits, fromIndustry: false }));
  const deferred = scored.filter((s) => !s.cap.universal && s.hits.length === 0 && !supersededBy.has(s.cap.id));
  const replaced = scored
    .filter((s) => supersededBy.has(s.cap.id))
    .map((s) => ({ generic: s.cap, by: supersededBy.get(s.cap.id)! }));

  // 分類ごとに「業界固有 → 汎用」の順で並べる。事業側が最初に見るのは業界の言葉。
  const drafted: DraftItem[] = [];
  for (const g of GROUP_ORDER) {
    drafted.push(...industryItems.filter((i) => i.cap.group === g));
    drafted.push(...genericItems.filter((i) => i.cap.group === g));
  }
  return { drafted, deferred, replaced };
}

/** 一覧に付ける印(◆ = 業界固有、★ = 説明文の語に反応) */
function marks(item: DraftItem): string {
  const m = `${item.fromIndustry ? '◆' : ''}${item.hits.length > 0 ? '★' : ''}`;
  return m;
}

function renderDraftCapabilityMap(businessDescription: string, industry: string | undefined, lang: Lang): string {
  const haystack = `${businessDescription} ${industry ?? ''}`.toLowerCase();
  const resolution = resolveIndustry(businessDescription, industry);
  const { drafted, deferred, replaced } = buildDraftItems(haystack, resolution);
  const industryCount = drafted.filter((d) => d.fromIndustry).length;
  const hitCount = drafted.filter((d) => d.hits.length > 0).length;

  const out: string[] = [];
  out.push(`# ${inline('レベル 1 能力マップ(草案)', 'Level-1 capability map — draft', lang)}`);
  out.push('');
  out.push(`> ${line(L.draftWarning, lang)}`);
  out.push('');
  out.push(
    msg(
      `**入力した事業の説明**: ${businessDescription.trim()}`,
      `**Business description you gave**: ${businessDescription.trim()}`,
      lang,
    ),
  );
  if (industry && industry.trim().length > 0) {
    out.push('');
    out.push(msg(`**業界(指定)**: ${industry.trim()}`, `**Industry (as given)**: ${industry.trim()}`, lang));
  }
  out.push('');

  // --- 業界の判定結果 / Which industry set was applied -----------------------
  out.push(`## ${inline('適用した業界セット', 'Industry set applied', lang)}`);
  out.push('');
  if (resolution.sets.length === 0) {
    if (resolution.unknownInput) {
      out.push(
        msg(
          `industry に「${resolution.unknownInput}」が指定されましたが、この業界の能力セットはまだ用意がありません。汎用セットだけで草案を作りました。用意がある業界: ${industryMenu('ja')}。`,
          `You passed industry "${resolution.unknownInput}", but there is no capability set for it yet, so this draft uses the generic set only. Sets available: ${industryMenu('en')}.`,
          lang,
        ),
      );
    } else {
      out.push(
        msg(
          `事業の説明から業界を判定できなかったため、**汎用セットだけ**で草案を作っています。このままだと同業他社と同じ図になります。\`industry\` を指定すると、その業界の実務で通る能力(例: 銀行なら「与信・審査」「AML / 金融犯罪対策」)を足せます。指定できる業界: ${industryMenu('ja')}。`,
          `No industry could be inferred from your description, so this draft uses **the generic set only** — as it stands it will look like every competitor. Pass \`industry\` to add capabilities named the way the industry actually names them (for a bank: credit underwriting, financial crime). Available: ${industryMenu('en')}.`,
          lang,
        ),
      );
    }
  } else {
    for (const set of resolution.sets) {
      out.push(`- **${line(set.name, lang)}** — ${line(set.essence, lang)}`);
    }
    out.push('');
    if (resolution.inferred) {
      const setName = resolution.sets[0]!.name;
      if (resolution.unknownInput) {
        out.push(
          msg(
            `industry に指定された「${resolution.unknownInput}」に対応する能力セットが無かったため、事業の説明から業界を推定しました。`,
            `There is no capability set matching the industry you passed ("${resolution.unknownInput}"), so the industry was inferred from your description instead.`,
            lang,
          ),
        );
        out.push('');
      }
      out.push(
        msg(
          `**記述から「${setName.ja}」と判断しました。違う場合は \`industry\` で指定してください。** 指定できる業界: ${industryMenu('ja')}。`,
          `**Inferred "${setName.en}" from your description. If that is wrong, pass \`industry\` explicitly.** Available: ${industryMenu('en')}.`,
          lang,
        ),
      );
    } else {
      out.push(
        msg(
          `\`industry\` の指定に基づいて業界セットを適用しました。`,
          `The industry set was applied from your \`industry\` argument.`,
          lang,
        ),
      );
    }
    if (resolution.matched.length > 0) {
      const words = resolution.matched.slice(0, 10).join(' / ');
      out.push('');
      out.push(
        msg(`判定に効いた語: ${words}`, `Words that drove this: ${words}`, lang),
      );
    }
    if (resolution.sets.length > 1) {
      // 2 セットになるのは「industry で指定した業界」と「説明文が強く示した別の業界」が
      // 食い違ったときだけ。どちらがどちらから来たのかを書かないと、利用者は
      // 指定していない業界の能力が混ざった理由を辿れない。
      const asked = resolution.sets[0]!.name;
      const added = resolution.sets[1]!.name;
      out.push('');
      out.push(
        msg(
          `\`industry\` に指定された「${asked.ja}」に加えて、事業の説明が別の業界「${added.ja}」を強く示したため、両方の能力セットを足しています。指定した業界だけでよければ「${added.ja}」側の能力を落とし、落とした旨を記録してください。`,
          `On top of "${asked.en}" from your \`industry\` argument, the description pointed strongly at "${added.en}", so both sets were added. If only the industry you named applies, drop the "${added.en}" capabilities and record that you did.`,
          lang,
        ),
      );
    }
  }
  out.push('');
  out.push(
    msg(
      `草案 ${drafted.length} 件(業界固有 ${industryCount} 件 / 汎用 ${drafted.length - industryCount} 件、うち説明文の語に反応 ${hitCount} 件)。◆ = 業界固有の能力、★ = 説明文の語に反応した能力。`,
      `${drafted.length} capabilities drafted: ${industryCount} industry-specific, ${drafted.length - industryCount} generic, ${hitCount} of them reacting to wording in your description. ◆ marks industry-specific, ★ marks the reactions.`,
      lang,
    ),
  );
  out.push('');

  // 図 / Diagram
  out.push('```mermaid');
  out.push('flowchart TB');
  let idx = 0;
  for (const g of GROUP_ORDER) {
    const items = drafted.filter((d) => d.cap.group === g);
    if (items.length === 0) continue;
    const groupLabel = mermaidLabel(lang === 'en' ? CAPABILITY_GROUP_LABELS[g].en : CAPABILITY_GROUP_LABELS[g].ja);
    out.push(`  subgraph G_${g}["${groupLabel}"]`);
    out.push('    direction LR');
    for (const item of items) {
      idx += 1;
      const name = mermaidLabel(lang === 'en' ? item.cap.name.en : item.cap.name.ja);
      const mark = marks(item);
      out.push(`    C${idx}["${name}${mark.length > 0 ? ` ${mark}` : ''}"]`);
    }
    out.push('  end');
  }
  out.push('```');
  out.push('');

  // 表 / Table
  out.push(`## ${inline('草案の中身', 'What is in the draft', lang)}`);
  out.push('');
  out.push(
    `| ${inline('分類', 'Group', lang)} | ${inline('能力', 'Capability', lang)} | ${inline('由来', 'Source', lang)} | ★ | ${inline('この能力とは', 'What it means', lang)} | ${inline('弱いと起きること', 'Symptoms when weak', lang)} |`,
  );
  out.push('| --- | --- | --- | :-: | --- | --- |');
  for (const g of GROUP_ORDER) {
    for (const item of drafted.filter((d) => d.cap.group === g)) {
      const origin =
        item.fromIndustry && item.setName
          ? `◆ ${cellBi(item.setName, lang)}`
          : inline('汎用', 'Generic', lang);
      out.push(
        `| ${cellBi(CAPABILITY_GROUP_LABELS[g], lang)} | **${cellBi(item.cap.name, lang)}** | ${origin} | ${item.hits.length > 0 ? '★' : ''} | ${cellBi(item.cap.definition, lang)} | ${cellBi(item.cap.weakSigns[0] ?? { ja: '—', en: '—' }, lang)} |`,
      );
    }
  }
  out.push('');

  // 置き換えた汎用能力 / Generic capabilities replaced by industry wording
  if (replaced.length > 0) {
    out.push(`## ${inline('業界の言葉に置き換えた汎用能力', 'Generic capabilities replaced by industry wording', lang)}`);
    out.push('');
    out.push(
      msg(
        '汎用セットにある次の能力は、この業界では下の名前で呼ぶほうが事業側に通るため、置き換えて草案に入れています。汎用名のほうが社内で通じるなら戻してください。勝手に消したわけではありません。',
        'The generic capabilities below were replaced with the industry wording, because that is what the business will recognise. If the generic name is what your organisation actually says, put it back. Nothing was silently dropped.',
        lang,
      ),
    );
    out.push('');
    for (const r of replaced) {
      out.push(`- ${line(r.generic.name, lang)} → **${line(r.by.cap.name, lang)}**`);
    }
    out.push('');
  }

  // 業界固有の注意 / Industry notes
  if (resolution.sets.length > 0) {
    out.push(`## ${inline('この業界で先に確認すること', 'Check these before you go further — industry specific', lang)}`);
    out.push('');
    for (const set of resolution.sets) {
      if (resolution.sets.length > 1) out.push(`**${line(set.name, lang)}**`);
      out.push(bullets(set.notes, lang));
      out.push('');
    }
  }

  // 質問 / Questions
  out.push(`## ${inline('各能力について事業側に問うこと', 'What to ask the business about each capability', lang)}`);
  out.push('');
  out.push(
    msg(
      'この質問に事業側が即答できない能力は、成熟度が低い可能性が高い。答えの有無自体が評価の材料になる。',
      'A capability whose questions the business cannot answer on the spot is probably immature. Whether an answer exists is itself assessment data.',
      lang,
    ),
  );
  out.push('');
  for (const item of drafted) {
    const mark = marks(item);
    out.push(`### ${line(item.cap.name, lang)}${mark.length > 0 ? ` ${mark}` : ''}`);
    out.push(bullets(item.cap.probes, lang));
    out.push('');
    out.push(
      msg(
        `代表的な L2 の切り方: ${item.cap.typicalL2.map((t) => t.ja).join(' / ')}`,
        `Typical L2 split: ${item.cap.typicalL2.map((t) => t.en).join(' / ')}`,
        lang,
      ),
    );
    out.push('');
  }

  // 検討リスト / Deferred
  if (deferred.length > 0) {
    out.push(`## ${inline('草案に入れなかったもの(要判断)', 'Left out of the draft — decide explicitly', lang)}`);
    out.push('');
    out.push(
      msg(
        '事業の説明に手がかりが無かったため外した。実際には存在するかもしれないので、1 件ずつ「ある / 無い / 外部に委託」を判定して記録すること。「検討しなかった」と「無いと判断した」は別物。',
        'Dropped because your description gave no signal. They may still exist. Decide each one — present, absent, or outsourced — and record it. "Not considered" and "decided absent" are different things.',
        lang,
      ),
    );
    out.push('');
    for (const item of deferred) {
      out.push(`- ${line(item.cap.name, lang)} — ${line(item.cap.definition, lang)}`);
    }
    out.push('');
  }

  // 固有能力 / Company-specific
  out.push(`## ${inline('次にやること', 'What to do next', lang)}`);
  out.push('');
  const nextMoves: Bilingual[] = [];
  if (resolution.sets.length > 0) {
    nextMoves.push({
      ja: '**業界の型で埋まっているのはここまで。自社固有の能力を 2〜4 件足す。** 上の ◆ は「この業界ならどこも持っている力」なので、これだけでは同業他社と同じ図になる。「うちが競合より上手いこと」「この会社にしか無い稼ぎ方」を能力名にして追加する。ここが空だと経営層は読まない。',
      en: '**The industry shape is now filled in — add 2–4 capabilities unique to this company.** Everything marked ◆ is what every competitor in this industry also has. Name what this company does better, or the way it makes money that nobody else does. Without that, executives will not read it.',
    });
    nextMoves.push({
      ja: '**業界セットの能力名を、社内で実際に使われている語に直す。** 業界標準の名前と社内の呼び名がずれている箇所は、そのずれ自体が組織の癖なので記録しておく。',
      en: '**Rewrite the industry names into the words this organisation actually uses.** Where the two differ, the difference itself is a fact about the organisation — record it.',
    });
  } else {
    nextMoves.push({
      ja: '**`industry` を指定して呼び直す。** 業界を指定すると、その業界の実務で通る能力が足される。汎用セットだけの草案を事業側に見せると「うちの話ではない」で終わる。',
      en: '**Call again with `industry`.** With an industry the draft gains capabilities named the way that industry names them. A generic-only draft gets dismissed by the business as "not about us".',
    });
    nextMoves.push({
      ja: '**自社固有の能力を 2〜4 件足す。** 上の一覧は「どの会社にもある型」なので、このままだと競合と同じ図になる。「うちが競合より上手いこと」を能力名にして追加する。',
      en: '**Add 2–4 capabilities unique to this company.** The list above is the generic shape; as it stands it looks identical to a competitor. Name what this company does better than the others.',
    });
    nextMoves.push({
      ja: '**名前を事業側の言葉に置き換える。** 社内で通じない用語は、通じる語に直す。ただし部署名・システム名にはしないこと。',
      en: '**Rewrite the names in the words the business actually uses** — but never into department names or system names.',
    });
  }
  nextMoves.push(
    {
      ja: '**`check_capability_map` に名前の一覧を渡して検査する。** 動詞・組織名・IT 用語・粒度のばらつきを機械的に検出できる。',
      en: '**Run the names through `check_capability_map`** to mechanically catch verbs, org names, IT vocabulary, and inconsistent granularity.',
    },
    {
      ja: '**`capability_method` のステップ 5 以降に戻る。** 草案を出発点にしても、束ね直しと評価の工程は省略できない。',
      en: '**Return to `capability_method` from step 5.** Even starting from a draft, the re-bundling and scoring steps cannot be skipped.',
    },
    {
      ja: '**`cross_map` で能力 × バリューストリームを作る。** どの能力が価値に効いていないかは、この表でしか見えない。',
      en: '**Build the capability × value stream matrix with `cross_map`.** Nothing else shows which capabilities serve no value.',
    },
  );
  out.push(bullets(nextMoves, lang));
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 能力名の検査 / Capability naming checks
// ---------------------------------------------------------------------------

interface CheckFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: Bilingual;
  why: Bilingual;
  /** 該当した名前と、可能なら修正案 */
  items: { name: string; suggestion?: string }[];
  fix: Bilingual;
  antiPatternId?: string;
}

/** ひらがな・カタカナ・漢字を含むか(日本語名か英語名かの判定用) */
const CJK_RE = /[぀-ヿ㐀-鿿]/;
const HIER_SEP_RE = /[>＞/／»]/;
const COMPLAINT_WORDS_JA = ['改善', '強化', '削減', '解消', '最適化', '効率化', '推進', '見直し', 'DX 化', 'デジタル化'];
const COMPLAINT_WORDS_EN = ['improve', 'improvement', 'strengthen', 'reduce', 'reduction', 'optimize', 'optimise', 'optimization', 'streamline', 'transformation'];
const PROCESS_TAIL_JA = ['フロー', 'プロセス', '手順', 'ワークフロー', '作業'];
const PROCESS_TAIL_EN = ['flow', 'process', 'procedure', 'workflow'];

function isJa(s: string): boolean {
  return CJK_RE.test(s);
}

function glyphLength(s: string): number {
  return [...s.replace(/\s+/g, '')].length;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[\s　・･/／\-—–_,、.。]/g, '');
}

/** 親子関係の疑いを見るときに使う語尾(ループの外で 1 度だけ正規化する) */
const VAGUE_SUFFIX_KEYS: string[] = [...NAMING_LEXICON.vagueWordsJa, ...NAMING_LEXICON.vagueWordsEn]
  .map((w) => normalizeName(w))
  .filter((w) => w.length > 0);

/** 一度に検査できる能力名の上限(重複判定が総当たりのため、読める規模で頭を打つ) */
const MAX_CAPABILITIES = 300;

/** 動詞形を機械的に名詞化した案を作る(完璧を狙わず、直すきっかけにする) */
function nounSuggestion(name: string): string | undefined {
  const trimmed = name.trim();
  for (const suf of NAMING_LEXICON.verbSuffixJa) {
    if (trimmed.endsWith(suf) && trimmed.length > suf.length) {
      const base = trimmed.slice(0, trimmed.length - suf.length).replace(/[をがにへとのは]$/u, '');
      const cleaned = base.replace(/を/gu, '');
      if (cleaned.length === 0) return undefined;
      return /(管理|提供|創出|処理|運用|開発|支援)$/u.test(cleaned) ? cleaned : `${cleaned}管理`;
    }
  }
  const words = trimmed.toLowerCase().split(/\s+/);
  const head = words[0] ?? '';
  if (NAMING_LEXICON.verbPrefixEn.includes(head) && words.length > 1) {
    const rest = trimmed.split(/\s+/).slice(1).join(' ');
    return `${rest} Management`;
  }
  return undefined;
}

function checkCapabilityNames(namesRaw: string[]): { findings: CheckFinding[]; clean: string[]; total: number } {
  const names = namesRaw.map((n) => n.trim()).filter((n) => n.length > 0);
  const findings: CheckFinding[] = [];
  const flagged = new Set<string>();

  const flag = (f: CheckFinding): void => {
    if (f.items.length === 0) return;
    for (const i of f.items) {
      // 重複指摘は「A / B」の形で入るため、両方を指摘済みとして扱う
      for (const part of i.name.split(' / ')) flagged.add(part.trim());
      flagged.add(i.name);
    }
    findings.push(f);
  };

  // 1. 動詞で書かれている
  const verbs: { name: string; suggestion?: string }[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    const head = lower.split(/\s+/)[0] ?? '';
    const jaVerb = NAMING_LEXICON.verbSuffixJa.some((s) => n.endsWith(s));
    const enVerb = !isJa(n) && NAMING_LEXICON.verbPrefixEn.includes(head) && lower.split(/\s+/).length > 1;
    if (jaVerb || enVerb) verbs.push({ name: n, suggestion: nounSuggestion(n) });
  }
  flag({
    id: 'verb-naming',
    severity: 'high',
    title: { ja: '動詞で書かれている(能力ではなくプロセス)', en: 'Written as a verb — a process, not a capability' },
    why: {
      ja: '動作は手順が変わるたびに変わるので、投資や責任の単位に使えない。能力は「変わらないもの」として置く。',
      en: 'Actions change whenever the steps change, so they cannot carry investment or accountability. A capability is meant to be the part that does not change.',
    },
    items: verbs,
    fix: {
      ja: '名詞句に変換する。変換しても意味が通らないものは、能力ではなく作業なので L3 以下かプロセス設計側に移す。',
      en: 'Convert to a noun phrase. If it stops making sense, it was a task — move it below L3 or into process design.',
    },
    antiPatternId: 'verb-naming',
  });

  // 2. 組織名・部署名
  const orgs: { name: string }[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    // 「課」「部」などの 1 文字語は末尾のときだけ組織とみなす(「課金管理」を誤検出しないため)
    const stem = n.replace(/[\s　]+$/u, '');
    const hitJa =
      NAMING_LEXICON.orgWordsJa.some((w) => n.includes(w)) ||
      NAMING_LEXICON.orgSuffixJa.some((w) => stem.length > w.length && stem.endsWith(w));
    const hitEn = NAMING_LEXICON.orgWordsEn.some((w) => matchesKeyword(lower, w));
    if (hitJa || hitEn) orgs.push({ name: n });
  }
  flag({
    id: 'org-naming',
    severity: 'high',
    title: { ja: '組織名・部署名が入っている', en: 'Contains an organisation or department name' },
    why: {
      ja: '組織再編で無効になる。さらに、部門をまたぐ能力(顧客管理・データ管理など)が構造的に見えなくなる。',
      en: 'It dies at the next reorganisation, and it structurally hides the capabilities that span departments — customer data, information management.',
    },
    items: orgs,
    fix: {
      ja: '「その部門が明日消えても会社がやめられない仕事は何か」を問い、その答えを名前にする。組織との対応は能力 × 組織のクロスマッピングで別途表す。',
      en: 'Ask what work could not stop even if that unit vanished tomorrow, and name that. Express the unit relationship separately in the capability × organisation matrix.',
    },
    antiPatternId: 'org-chart-copy',
  });

  // 3. IT 用語
  const its: { name: string }[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    const hitJa = NAMING_LEXICON.itWordsJa.some((w) => n.includes(w));
    const hitEn = NAMING_LEXICON.itWordsEn.some((w) => matchesKeyword(lower, w));
    if (hitJa || hitEn) its.push({ name: n });
  }
  flag({
    id: 'it-terms',
    severity: 'high',
    title: { ja: 'IT 用語・システム名が混ざっている', en: 'IT vocabulary or system names mixed in' },
    why: {
      ja: '事業側が読まなくなり、ビジネスアーキテクチャが IT の内部資料に格下げされる。経営との会話に使えなくなるのが実害。',
      en: 'The business stops reading it and the business architecture is demoted to an internal IT document. The real damage is losing the executive conversation.',
    },
    items: its,
    fix: {
      ja: '「その仕組みで何ができるようになるのか」に言い換える。実装は能力 × アプリケーションのクロスマッピングで表現する。',
      en: 'Restate as what it makes possible. Express the implementation in the capability × application matrix instead.',
    },
    antiPatternId: 'it-terms',
  });

  // 4. 課題・施策になっている
  const complaints: { name: string }[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    const hitJa = COMPLAINT_WORDS_JA.some((w) => n.includes(w));
    const hitEn = COMPLAINT_WORDS_EN.some((w) => matchesKeyword(lower, w));
    if (hitJa || hitEn) complaints.push({ name: n });
  }
  flag({
    id: 'complaint-list',
    severity: 'medium',
    title: { ja: '能力ではなく課題・施策になっている', en: 'A problem or an initiative, not a capability' },
    why: {
      ja: '課題が解決した瞬間に、その項目は地図から消える。恒常的に存在する構造を表していない。',
      en: 'The moment the problem is solved, the entry vanishes from the map. It never described the permanent structure.',
    },
    items: complaints,
    fix: {
      ja: '「何ができる力か」に言い換え、不満の側は成熟度評価(低)として能力に添付する。施策はロードマップの作業パッケージに移す。',
      en: 'Restate as an ability and attach the grievance as a low maturity score. Move the initiative to a work package on the roadmap.',
    },
    antiPatternId: 'complaint-list',
  });

  // 5. プロセス名の語尾
  const processes: { name: string }[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    const hitJa = PROCESS_TAIL_JA.some((w) => n.endsWith(w));
    const hitEn = PROCESS_TAIL_EN.some((w) => lower.endsWith(w));
    if (hitJa || hitEn) processes.push({ name: n });
  }
  flag({
    id: 'process-naming',
    severity: 'low',
    title: { ja: '「〜フロー」「〜プロセス」で終わっている', en: 'Ends in "flow" or "process"' },
    why: {
      ja: '能力(何ができるか)とプロセス(どうやるか)が混ざると、同じ図の中で粒度が二重になる。',
      en: 'Mixing capability (what you can do) with process (how you do it) puts two different granularities in one picture.',
    },
    items: processes,
    fix: {
      ja: '語尾を落として能力名にする。プロセスは別の成果物(業務プロセスモデル)として管理する。',
      en: 'Drop the suffix to get the capability name, and manage the process in a separate artefact.',
    },
  });

  // 6. 接続詞で 2 つ繋がっている
  const conj: { name: string }[] = [];
  for (const n of names) {
    const lower = ` ${n.toLowerCase()} `;
    const hitJa = NAMING_LEXICON.conjunctionsJa.some((w) => n.includes(w));
    const hitEn = NAMING_LEXICON.conjunctionsEn.some((w) => lower.includes(w));
    if (hitJa || hitEn) conj.push({ name: n });
  }
  flag({
    id: 'two-in-one',
    severity: 'low',
    title: { ja: '1 つの名前に 2 つの能力が入っている疑い', en: 'Two capabilities inside one name' },
    why: {
      ja: '束ねたままだと、評価もオーナーも 1 つに決まらない。片方だけ成熟度が低いときに議論が止まる。',
      en: 'Bundled, it cannot take a single score or a single owner, and the discussion stalls when only one half is weak.',
    },
    items: conj,
    fix: {
      ja: 'オーナーが別々になるなら分ける。同じオーナーで常に一緒に動くなら、束ねたままでよい(その根拠を書き残す)。',
      en: 'Split it if the owners differ. Keep it bundled if one owner always moves both — and write down why.',
    },
  });

  // 7. 階層の混在(名前の中に区切り記号)
  const hier: { name: string }[] = [];
  for (const n of names) {
    if (!HIER_SEP_RE.test(n)) continue;
    const depth = n.split(HIER_SEP_RE).map((p) => p.trim()).filter((p) => p.length > 0).length;
    if (depth >= 4) hier.push({ name: n });
  }
  flag({
    id: 'too-deep',
    severity: 'medium',
    title: { ja: '4 階層以上に割られている', en: 'Split four levels deep or more' },
    why: {
      ja: '維持できない。1 年で現実と乖離し、誰も更新しない資料になる。末端が画面名・帳票名に近づいていく。',
      en: 'It cannot be maintained. Within a year it disagrees with reality and nobody updates it, while the leaves drift toward screen and form names.',
    },
    items: hier,
    fix: {
      ja: '3 階層で止める。それ以上の詳細は要件定義・プロセス設計の成果物に置き、能力マップからは切り離す。',
      en: 'Stop at three levels. Push deeper detail into requirements or process design artefacts and keep it out of the capability map.',
    },
    antiPatternId: 'too-deep',
  });

  // 8. 重複・ほぼ重複
  const dupItems: { name: string; suggestion?: string }[] = [];
  const seen = new Map<string, string>();
  for (const n of names) {
    const key = normalizeName(n);
    const prev = seen.get(key);
    if (prev !== undefined) {
      dupItems.push({ name: n, suggestion: prev });
    } else {
      seen.set(key, n);
    }
  }
  const keys = [...seen.entries()];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const [ka, na] = keys[i]!;
      const [kb, nb] = keys[j]!;
      if (ka.length < 3 || kb.length < 3) continue;
      // 包含関係(片方がもう片方を丸ごと含む)
      if (ka.includes(kb) || kb.includes(ka)) {
        dupItems.push({ name: `${na} / ${nb}` });
        continue;
      }
      // 語尾が同じ(「〜管理」同士など)で、語幹が前方一致する場合は親子関係の疑い
      const suffix = VAGUE_SUFFIX_KEYS.find((w) => ka.endsWith(w) && kb.endsWith(w));
      if (!suffix) continue;
      const sa = ka.slice(0, ka.length - suffix.length);
      const sb = kb.slice(0, kb.length - suffix.length);
      if (sa.length < 2 || sb.length < 2 || sa === sb) continue;
      if (sa.startsWith(sb) || sb.startsWith(sa)) {
        dupItems.push({ name: `${na} / ${nb}` });
      }
    }
  }
  flag({
    id: 'duplicates',
    severity: 'medium',
    title: { ja: '重複・包含関係にある名前', en: 'Duplicated or overlapping names' },
    why: {
      ja: 'クロスマッピングが二重に埋まり、どちらの行を読めばよいか分からなくなる。評価も分散して優先順位が付かない。',
      en: 'Cross maps get double-filled and nobody knows which row to read. Scores split and priority disappears.',
    },
    items: dupItems,
    fix: {
      ja: '同義なら 1 つに寄せ、片方を別名として辞書に残す。包含関係なら、大きい方を親(L1)、小さい方を子(L2)として階層を明示する。',
      en: 'If they are synonyms, merge and keep the loser as an alias in your term table. If one contains the other, make the larger the parent (L1) and the smaller the child (L2).',
    },
  });

  // 9. 粒度のばらつき(日本語 / 英語で別々に評価)
  const outliers: { name: string }[] = [];
  let spreadNote: Bilingual | undefined;
  for (const bucket of [names.filter((n) => isJa(n)), names.filter((n) => !isJa(n))]) {
    if (bucket.length < 5) continue;
    const lens = bucket.map(glyphLength).sort((a, b) => a - b);
    const median = lens[Math.floor(lens.length / 2)] ?? 0;
    if (median === 0) continue;
    for (const n of bucket) {
      const len = glyphLength(n);
      if (len >= median * 2 || len * 2.5 <= median) outliers.push({ name: n });
    }
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (mean > 0 && sd / mean > 0.45) {
      spreadNote = {
        ja: `名前の長さのばらつきが大きい(平均 ${mean.toFixed(1)} 文字、標準偏差 ${sd.toFixed(1)})。長さのばらつきは、たいてい階層のばらつき。`,
        en: `Name lengths vary widely (mean ${mean.toFixed(1)} characters, sd ${sd.toFixed(1)}). Length spread is usually level spread.`,
      };
    }
  }
  flag({
    id: 'granularity',
    severity: 'medium',
    title: { ja: '粒度がばらばら(同じ列に別の階層が混ざっている)', en: 'Inconsistent granularity — different levels in one list' },
    why: spreadNote ?? {
      ja: '極端に短い名前は抽象的すぎ、極端に長い名前は具体的すぎる。同じ一覧に L1 と L3 が混ざると、評価を横に比較できずヒートマップが読めなくなる。',
      en: 'Very short names are too abstract and very long ones too specific. With L1 and L3 in one list, scores cannot be compared across rows and the heat map becomes unreadable.',
    },
    items: outliers,
    fix: {
      ja: '極端に短いものは「誰に聞いても同じものを想像するか」で検証し、必要なら分割する。極端に長いものは 1 階層下に降ろし、親を新設する。',
      en: 'Test the short ones with "would two colleagues picture the same thing?" and split if not. Push the long ones down a level and create a parent above them.',
    },
    antiPatternId: 'uniform-decomposition',
  });

  // 10. 抽象的すぎる単語のみ
  const vague: { name: string }[] = [];
  for (const n of names) {
    const key = normalizeName(n);
    const isVague =
      NAMING_LEXICON.vagueWordsJa.some((w) => normalizeName(w) === key) ||
      NAMING_LEXICON.vagueWordsEn.some((w) => normalizeName(w) === key) ||
      (isJa(n) && glyphLength(n) <= 2);
    if (isVague) vague.push({ name: n });
  }
  flag({
    id: 'vague',
    severity: 'medium',
    title: { ja: '抽象的すぎて中身が読めない', en: 'Too abstract to mean anything' },
    why: {
      ja: '社内の 2 人に聞くと違うものを想像する語は、合意の役に立たない。会議のたびに定義から議論が始まる。',
      en: 'A word two colleagues would picture differently cannot carry agreement. Every meeting restarts from "what do we mean by this".',
    },
    items: vague,
    fix: {
      ja: '対象(何を)を名前に入れる。「管理」ではなく「顧客情報管理」。それでも書けないなら、その項目は削る。',
      en: 'Put the object into the name: not "management" but "customer data management". If you still cannot, delete the entry.',
    },
  });

  const clean = names.filter((n) => !flagged.has(n));
  return { findings: findings.filter((f) => f.items.length > 0), clean, total: names.length };
}

const SEVERITY_MARK: Record<CheckFinding['severity'], string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
};

function renderCheckResult(namesRaw: string[], lang: Lang): string {
  const { findings, clean, total } = checkCapabilityNames(namesRaw);
  const out: string[] = [];
  out.push(`# ${inline('能力マップの検査結果', 'Capability map check', lang)}`);
  out.push('');

  // 件数の判定
  const countVerdict: Bilingual =
    total > 30
      ? {
          ja: `**${total} 件は多すぎる。** L1 は 15〜25 件が読める上限。30 を超えると経営層は 1 枚として認識できず、優先順位の会話にならない。似た能力を親でまとめ、細かいものは L2 に降ろすこと。`,
          en: `**${total} is too many.** An L1 list stays readable up to 25 or so. Past 30 executives stop seeing one picture and the prioritisation conversation never happens. Bundle siblings under parents and push the fine-grained ones down to L2.`,
        }
      : total < 8
        ? {
            ja: `**${total} 件は少なすぎる。** 抜けているか、粒度が粗すぎる。支援系(財務・人材・IT)と統制系(戦略・リスク)が入っているか確認すること。`,
            en: `**${total} is too few.** Either something is missing or the granularity is too coarse. Check that the enabling side (finance, people, IT) and the governing side (strategy, risk) are present.`,
          }
        : {
            ja: `**${total} 件。** L1 として読める件数の範囲に入っている。`,
            en: `**${total} items.** Within the range that reads as an L1 list.`,
          };
  out.push(line(countVerdict, lang));
  out.push('');

  if (findings.length === 0) {
    out.push(
      msg(
        '機械的に検出できる問題は見つからなかった。ただし、機械が見られるのは名前だけ。次は人にしか見えない点を確認すること。',
        'Nothing mechanically detectable. But a machine only sees names. Check the parts only people can see:',
        lang,
      ),
    );
    out.push('');
  } else {
    out.push(
      `| | ${inline('検出項目', 'Finding', lang)} | ${inline('該当', 'Hits', lang)} |`,
    );
    out.push('| :-: | --- | :-: |');
    for (const f of findings) {
      out.push(`| ${SEVERITY_MARK[f.severity]} | ${cellBi(f.title, lang)} | ${f.items.length} |`);
    }
    out.push('');
    for (const f of findings) {
      out.push(`## ${SEVERITY_MARK[f.severity]} ${line(f.title, lang)}`);
      out.push('');
      if (f.why.ja.length > 0 || f.why.en.length > 0) {
        out.push(`**${inline('なぜ困るのか', 'Why it hurts', lang)}**: ${line(f.why, lang)}`);
        out.push('');
      }
      out.push(`**${inline('該当', 'Hits', lang)}**`);
      for (const item of f.items) {
        out.push(
          item.suggestion
            ? `- \`${item.name}\` → ${inline('例えば', 'e.g.', lang)} **${item.suggestion}**`
            : `- \`${item.name}\``,
        );
      }
      out.push('');
      out.push(`**${inline('直し方', 'How to fix', lang)}**: ${line(f.fix, lang)}`);
      const ap = f.antiPatternId ? findAntiPattern(f.antiPatternId) : undefined;
      if (ap) {
        out.push('');
        out.push(
          msg(
            `関連するアンチパターン: 「${ap.name.ja}」 — ${ap.consequence.ja}`,
            `Related anti-pattern: "${ap.name.en}" — ${ap.consequence.en}`,
            lang,
          ),
        );
      }
      out.push('');
    }
  }

  out.push(`## ${inline('機械では見られない点(人が確認する)', 'What the machine cannot see — check these yourself', lang)}`);
  out.push(
    bullets(
      [
        { ja: '各能力にオーナー(役職名)が 1 人ずつ付いているか。空欄が 1 つでもあれば、その能力は更新されない。', en: 'Does every capability have exactly one owning role? A single blank means that capability will never be updated.' },
        { ja: '自社固有の稼ぎ方に対応する能力が入っているか。競合の一覧と見分けが付かないなら、経営層は読まない。', en: 'Is the company\'s own way of making money represented? If the list is indistinguishable from a competitor\'s, executives will not read it.' },
        { ja: 'この一覧を使う会議が決まっているか。使い道が無い地図は半年で腐る。', en: 'Is there a specific meeting that will use this list? A map with no use rots within six months.' },
        { ja: '評価(重要度 × 成熟度)を付けたとき、「高 × 低」が 5〜8 件に収まるか。全部赤なら評価基準が機能していない。', en: 'When scored, do "high importance × low maturity" items land between five and eight? An all-red map means the scoring criteria are not working.' },
      ],
      lang,
    ),
  );
  out.push('');

  if (clean.length > 0 && findings.length > 0) {
    out.push(`## ${inline('指摘なしの能力', 'Capabilities with no findings', lang)}`);
    out.push(clean.map((n) => `- ${n}`).join('\n'));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// クロスマッピング / Cross map
// ---------------------------------------------------------------------------

const MAX_ROWS = 40;
const MAX_COLS = 15;

function renderCrossMap(mapping: CrossMapping, rows: string[], columns: string[], lang: Lang): string {
  const out: string[] = [];
  out.push(`# ${line(mapping.name, lang)}`);
  out.push('');
  out.push(`**${line(L.purpose, lang)}**: ${line(mapping.purpose, lang)}`);
  out.push('');
  out.push(`- ${inline('行', 'Rows', lang)}: ${line(mapping.rowsLabel, lang)} (${rows.length})`);
  out.push(`- ${inline('列', 'Columns', lang)}: ${line(mapping.columnsLabel, lang)} (${columns.length})`);
  out.push(`- ${inline('セルに書くこと', 'What goes in a cell', lang)}: ${line(mapping.cellMeaning, lang)}`);
  out.push('');
  out.push(`## ${line(L.legend, lang)}`);
  out.push(bullets(mapping.legend, lang));
  out.push('');
  out.push(`## ${inline('空のマトリクス(このままコピーして埋める)', 'Empty matrix — copy this and fill it in', lang)}`);
  out.push('');
  out.push(`| ${cell(text(mapping.rowsLabel, lang === 'both' ? 'ja' : lang))} \\ ${cell(text(mapping.columnsLabel, lang === 'both' ? 'ja' : lang))} | ${columns.map((c) => cell(c)).join(' | ')} |`);
  out.push(`| --- | ${columns.map(() => ':-:').join(' | ')} |`);
  for (const r of rows) {
    out.push(`| **${cell(r)}** | ${columns.map(() => '   ').join(' | ')} |`);
  }
  out.push('');
  out.push(`## ${line(L.fillingTips, lang)}`);
  out.push(bullets(mapping.fillingTips, lang));
  out.push('');
  out.push(
    msg(
      `埋める順番: (1) 明らかに「◎/A」のセルだけ先に入れる → (2) 空いた行と列を見て違和感のある箇所を議論する → (3) 迷ったセルは印ではなく「?」と聞く相手の名前を入れる。全セルを埋めようとしないこと。埋まった表より、空欄が意味を持つ表のほうが読める。`,
      `Order of filling: (1) mark only the obvious decisive cells first, (2) look at the empty rows and columns and argue about what feels wrong, (3) put "?" plus a person\'s name in uncertain cells. Do not try to fill everything — blanks that mean something beat a fully populated grid.`,
      lang,
    ),
  );
  out.push('');
  out.push(`## ${line(L.readings, lang)}`);
  out.push('');
  out.push(`| ${line(L.pattern, lang)} | ${line(L.suspect, lang)} | ${line(L.action, lang)} |`);
  out.push('| --- | --- | --- |');
  for (const r of mapping.readings) {
    out.push(`| ${cellBi(r.pattern, lang)} | ${cellBi(r.suspect, lang)} | ${cellBi(r.action, lang)} |`);
  }
  out.push('');
  out.push(
    msg(
      '埋め終わったら、読み取った内容を 3 行以内で書き出すこと。書けないなら、その表はまだ判断に使えていない。',
      'Once it is filled, write down what you read from it in three lines or fewer. If you cannot, the matrix is not yet informing any decision.',
      lang,
    ),
  );
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// ツール登録 / Tool registration
// ---------------------------------------------------------------------------

/** ハンドラ内の例外を必ず errorResult に変換する */
function guard(fn: () => string, lang: Lang): ToolResult {
  try {
    return textResult(fn());
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return errorResult(
      msg(`処理中にエラーが発生しました: ${detail}`, `The tool failed: ${detail}`, lang),
    );
  }
}

export function registerBusinessArchitectureTools(server: McpServer): void {
  server.registerTool(
    'capability_method',
    {
      title: 'How to build a capability map',
      description:
        'ビジネス能力(ケイパビリティ)マップの作り方を 8 ステップの手順で返す。各ステップにアウトプット・失敗パターン・所要目安が付く。`step` で 1 ステップだけ取り出せる。L1/L2/L3 の粒度の目安も返す。 / Return an eight-step method for building a business capability map, each step with its output, failure mode, and effort. Pass `step` for a single step. Includes L1/L2/L3 granularity criteria.',
      inputSchema: {
        step: z
          .number()
          .int()
          .optional()
          .describe('1 ステップだけ取り出す(1〜8)。省略すると全体+粒度の目安 / Return a single step (1–8); omit for the whole method'),
        includeLevels: z
          .boolean()
          .default(true)
          .describe('L1/L2/L3 の粒度の目安を含めるか / Include the level granularity guide'),
        lang: langSchema,
      },
    },
    async ({ step, includeLevels, lang }) => {
      const l = lang as Lang;
      if (step !== undefined && (step < 1 || step > CAPABILITY_METHOD.steps.length)) {
        return errorResult(
          msg(
            `step は 1〜${CAPABILITY_METHOD.steps.length} で指定してください(指定値: ${step})。`,
            `step must be between 1 and ${CAPABILITY_METHOD.steps.length} (received ${step}).`,
            l,
          ),
        );
      }
      return guard(() => {
        if (step !== undefined) return renderSingleStep(CAPABILITY_METHOD, step, l);
        const out: string[] = [renderMethodOverview(CAPABILITY_METHOD, l)];
        if (includeLevels) {
          out.push('');
          out.push(`## ${inline('粒度の目安(L1 / L2 / L3)', 'Granularity guide (L1 / L2 / L3)', l)}`);
          out.push('');
          out.push(
            `| | ${inline('粒度', 'Granularity', l)} | ${inline('件数の目安', 'How many', l)} | ${inline('使い道', 'Used for', l)} |`,
          );
          out.push('| :-: | --- | --- | --- |');
          for (const lv of CAPABILITY_LEVELS) {
            out.push(
              `| **${lv.id}** | ${cellBi(lv.granularity, l)} | ${cellBi(lv.countHint, l)} | ${cell(lv.usedFor.map((u) => text(u, l === 'both' ? 'ja' : l)).join(' / '))} |`,
            );
          }
          out.push('');
          for (const lv of CAPABILITY_LEVELS) {
            out.push(`### ${lv.id} — ${line(lv.name, l)}`);
            out.push('');
            out.push(`- **${inline('命名', 'Naming', l)}**: ${line(lv.naming, l)}`);
            out.push(`- **${inline('例', 'Example', l)}**: ${lv.examples.map((e) => text(e, l === 'both' ? 'ja' : l)).join(' / ')}`);
            out.push('');
            out.push(`**${inline('粗すぎの判定', 'Signs it is too coarse', l)}**`);
            out.push(bullets(lv.tooCoarse, l));
            out.push('');
            out.push(`**${inline('切りすぎの判定', 'Signs it is too fine', l)}**`);
            out.push(bullets(lv.tooFine, l));
            out.push('');
          }
        }
        out.push(
          msg(
            '関連ツール: `draft_capability_map`(草案を作る) / `check_capability_map`(名前を検査する) / `cross_map`(クロスマッピングの雛形) / `value_stream_method`(価値の流れから設計する)。',
            'Related tools: `draft_capability_map`, `check_capability_map`, `cross_map`, `value_stream_method`.',
            l,
          ),
        );
        out.push('');
        out.push(
          msg(
            'ADM 上の位置づけを確認するなら `get_adm_phase`(id: `b`)、成果物の雛形が要るなら `generate_deliverable_template`(id: `business-capability-map`)。',
            'For the ADM context call `get_adm_phase` (id `b`); for a document skeleton call `generate_deliverable_template` (id `business-capability-map`).',
            l,
          ),
        );
        return out.join('\n');
      }, l);
    },
  );

  server.registerTool(
    'draft_capability_map',
    {
      title: 'Draft a level-1 capability map',
      description:
        '事業の説明から、レベル 1 能力マップの草案(図+表)と、各能力について事業側に問うべき質問を返す。業界別の能力セット(銀行・保険・製造・医療・小売/EC・公共・通信)を持ち、`industry` の指定があればその業界の実務で通る能力名(例: 与信・審査、AML / 金融犯罪対策)を汎用セットに足す。指定が無ければ説明文から業界を推定し、推定した旨を明示する。出力はあくまで草案で、事業側との対話による確定が必須。 / From a business description, draft a level-1 capability map (diagram plus table) plus the questions to ask the business. Industry sets (banking, insurance, manufacturing, healthcare, retail, public sector, telecom) add capabilities named the way that industry names them; without `industry` the set is inferred from the description and the inference is stated. The output is a draft and must be confirmed with the business.',
      inputSchema: {
        businessDescription: z
          .string()
          .min(1)
          .describe('事業の説明。何を誰に提供して対価を得ているか、規模、特徴など。具体的な業務語(預金・融資・受注生産・レセプトなど)を書くほど業界固有の能力が当たる / What the business does: what is offered to whom in return for what, scale, distinctive traits. The more concrete the operational vocabulary, the better the industry match'),
        industry: z
          .string()
          .optional()
          .describe('業界(任意)。banking / insurance / manufacturing / healthcare / retail-ecommerce / public-sector / telecommunications、または「金融」「製造」「地方銀行」などの語でも可。省略時は説明文から推定する / Industry, optional; id or free wording. Inferred from the description when omitted'),
        lang: langSchema,
      },
    },
    async ({ businessDescription, industry, lang }) => {
      const l = lang as Lang;
      if (businessDescription.trim().length === 0) {
        return errorResult(
          msg(
            'businessDescription が空です。「何を誰に提供して対価を得ているか」を 2〜3 行で書いてください。',
            'businessDescription is empty. Write two or three lines on what is offered to whom in return for what.',
            l,
          ),
        );
      }
      return guard(() => renderDraftCapabilityMap(businessDescription, industry, l), l);
    },
  );

  server.registerTool(
    'value_stream_method',
    {
      title: 'How to build a value stream',
      description:
        'バリューストリームの作り方を、価値の受け手と終了状態から遡る 7 ステップで返す。各ステップにアウトプット・失敗パターン付き。`step` で 1 ステップだけ取り出せる。 / Return a seven-step method for building a value stream, working backwards from the receiver and the end state. Each step carries its output and failure mode. Pass `step` for a single step.',
      inputSchema: {
        step: z
          .number()
          .int()
          .optional()
          .describe('1 ステップだけ取り出す(1〜7)/ Return a single step (1–7)'),
        lang: langSchema,
      },
    },
    async ({ step, lang }) => {
      const l = lang as Lang;
      if (step !== undefined && (step < 1 || step > VALUE_STREAM_METHOD.steps.length)) {
        return errorResult(
          msg(
            `step は 1〜${VALUE_STREAM_METHOD.steps.length} で指定してください(指定値: ${step})。`,
            `step must be between 1 and ${VALUE_STREAM_METHOD.steps.length} (received ${step}).`,
            l,
          ),
        );
      }
      return guard(() => {
        if (step !== undefined) return renderSingleStep(VALUE_STREAM_METHOD, step, l);
        const out: string[] = [renderMethodOverview(VALUE_STREAM_METHOD, l)];
        out.push('');
        out.push(`## ${inline('能力マップとの関係', 'How this relates to the capability map', l)}`);
        out.push(
          bullets(
            [
              { ja: 'バリューストリームは「価値が流れる順番」、能力は「その流れを成立させる力」。片方だけでは投資判断に届かない。', en: 'A value stream is the order in which value flows; capabilities are what make the flow possible. Neither alone reaches an investment decision.' },
              { ja: '段に能力を紐づけた表が `cross_map` の kind=capability-value-stream。ここで「価値に効かない能力」と「価値を生まない段」の両方が炙り出せる。', en: 'Linking the two produces `cross_map` with kind=capability-value-stream, which exposes both capabilities that serve no value and stages that create none.' },
              { ja: '順番はどちらからでもよいが、事業側の関心はバリューストリームの側にある。初回の対話はこちらから始めると話が早い。', en: 'Either can come first, but the business cares about the value stream. Starting there makes the first conversation go faster.' },
            ],
            l,
          ),
        );
        return out.join('\n');
      }, l);
    },
  );

  server.registerTool(
    'check_capability_map',
    {
      title: 'Check a capability map for anti-patterns',
      description:
        '能力名の一覧を受け取り、アンチパターンを機械的に検出する。動詞で書かれている / 組織名・部署名 / IT 用語の混入 / 課題や施策になっている / 粒度のばらつき / 重複 / 4 階層以上 / 件数過多 を判定し、それぞれに具体的な直し方を添えて返す。 / Take a list of capability names and mechanically detect anti-patterns: verb naming, organisation names, IT vocabulary, problems dressed as capabilities, inconsistent granularity, duplicates, excessive depth, and excessive count — each with a concrete fix.',
      inputSchema: {
        capabilities: z
          .array(z.string())
          .min(1)
          .describe('能力名の一覧(1 階層ぶんを渡すと精度が上がる)/ Capability names; pass one level at a time for best results'),
        lang: langSchema,
      },
    },
    async ({ capabilities, lang }) => {
      const l = lang as Lang;
      const cleaned = capabilities.map((c) => c.trim()).filter((c) => c.length > 0);
      if (cleaned.length === 0) {
        return errorResult(
          msg('capabilities に有効な名前がありません。', 'capabilities contains no usable names.', l),
        );
      }
      if (cleaned.length > MAX_CAPABILITIES) {
        return errorResult(
          msg(
            `一度に検査できるのは ${MAX_CAPABILITIES} 件までです(指定値: ${cleaned.length})。1 階層ぶん、または 1 つの親の配下だけを渡してください。`,
            `At most ${MAX_CAPABILITIES} names can be checked at once (received ${cleaned.length}). Pass one level, or one parent's children, at a time.`,
            l,
          ),
        );
      }
      return guard(() => renderCheckResult(cleaned, l), l);
    },
  );

  server.registerTool(
    'cross_map',
    {
      title: 'Build a cross-mapping matrix',
      description:
        '能力 × バリューストリーム / 能力 × 組織 / 能力 × アプリケーションのクロスマッピングについて、空のマトリクス(Markdown 表)、記号の凡例、埋め方、そして「埋めた後に何が見えたら何を疑うか」の読み方を返す。 / For capability × value stream, capability × organisation, or capability × application, return an empty Markdown matrix, the legend, how to fill it, and how to read it once filled — which patterns mean which suspicions.',
      inputSchema: {
        kind: z
          .enum(['capability-value-stream', 'capability-organization', 'capability-application'])
          .describe('クロスマッピングの種類 / Which cross map'),
        rows: z.array(z.string()).min(1).describe('行の項目(通常は能力名)/ Row labels, usually capability names'),
        columns: z
          .array(z.string())
          .min(1)
          .describe('列の項目(段 / 組織単位 / アプリケーション名)/ Column labels: stages, organisational units, or applications'),
        lang: langSchema,
      },
    },
    async ({ kind, rows, columns, lang }) => {
      const l = lang as Lang;
      const mapping = findCrossMapping(kind);
      if (!mapping) {
        return errorResult(
          msg(
            `kind「${kind}」は未対応です。利用可能: ${CROSS_MAPPING.map((m) => m.id).join(', ')}`,
            `Unsupported kind "${kind}". Available: ${CROSS_MAPPING.map((m) => m.id).join(', ')}`,
            l,
          ),
        );
      }
      const r = rows.map((x) => x.trim()).filter((x) => x.length > 0);
      const c = columns.map((x) => x.trim()).filter((x) => x.length > 0);
      if (r.length === 0 || c.length === 0) {
        return errorResult(
          msg('rows と columns に有効な項目がありません。', 'rows and columns contain no usable labels.', l),
        );
      }
      if (r.length > MAX_ROWS || c.length > MAX_COLS) {
        return errorResult(
          msg(
            `大きすぎます(行 ${r.length}/${MAX_ROWS}, 列 ${c.length}/${MAX_COLS})。読めるマトリクスの上限を超えています。行は L1 に束ねるか、対象を絞って分割してください。`,
            `Too large (rows ${r.length}/${MAX_ROWS}, columns ${c.length}/${MAX_COLS}). Beyond this nobody reads the matrix. Bundle the rows up to L1 or split the scope.`,
            l,
          ),
        );
      }
      return guard(() => renderCrossMap(mapping, r, c, l), l);
    },
  );

  server.registerTool(
    'business_architecture_antipatterns',
    {
      title: 'Business architecture anti-patterns',
      description:
        'ビジネスアーキテクチャでよく壊れる型を、症状・何が困るか・直し方の 3 点セットで返す。作る前の確認と、既存成果物のレビューの両方に使う。 / Return the recurring ways business architecture goes wrong, each as symptom, consequence, and fix. Use it before building and when reviewing an existing artefact.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      const l = lang as Lang;
      return guard(() => {
        const out: string[] = [];
        out.push(`# ${inline('ビジネスアーキテクチャのアンチパターン', 'Business architecture anti-patterns', l)}`);
        out.push('');
        out.push(
          `| ${inline('症状', 'Symptom', l)} | ${inline('何が困るか', 'Consequence', l)} | ${inline('直し方', 'Fix', l)} |`,
        );
        out.push('| --- | --- | --- |');
        for (const a of ANTI_PATTERNS) {
          out.push(
            `| **${cellBi(a.name, l)}**<br>${cellBi(a.symptom, l)} | ${cellBi(a.consequence, l)} | ${cellBi(a.fix, l)} |`,
          );
        }
        out.push('');
        out.push(
          msg(
            '名前の一覧があるなら `check_capability_map` に渡すこと。上のうち機械で検出できるものは自動で指摘される。',
            'If you have the list of names, pass it to `check_capability_map` — the mechanically detectable ones above are then flagged for you.',
            l,
          ),
        );
        return out.join('\n');
      }, l);
    },
  );
}
