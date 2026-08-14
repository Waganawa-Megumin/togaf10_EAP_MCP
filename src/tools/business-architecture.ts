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
  betterPath: {
    ja: '**この草案は、事業の説明文に出てくる語から機械的に組み立てたものです。資料や議事録を実際に読んでいるなら、そちらから自分で能力名を挙げ、その一覧を `check_capability_map` に渡すほうが速く、正確です。** この草案の使いどころは「型と問いの一覧」であって、中身の正しさではありません。',
    en: '**This draft is assembled mechanically from words in the description you passed. If you have actually read the source material, listing the capability names yourself and running that list through `check_capability_map` is faster and more accurate.** Use this draft for the shape and the questions, not for the correctness of its contents.',
  },
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

// ---------------------------------------------------------------------------
// 追加の業界セット / Additional industry sets
//
// 「IT・電機」「ソフトウェア」「セキュリティ」を指定すると製造業セットに落ちていた。
// 製造業の型(工場・部品表・歩留)は IT サービス会社の事業を説明しないので、
// 実質的な誤りだった。knowledge/business-architecture.ts は他の担当が触っているため、
// ここに置く。**将来 knowledge 側へ移すこと**(そのとき tools 側のこの定義は消す)。
// ---------------------------------------------------------------------------

const EXTRA_INDUSTRY_SETS: IndustryCapabilitySet[] = [
  {
    id: 'it-services',
    name: { ja: 'IT サービス・SI', en: 'IT Services & Systems Integration' },
    essence: {
      ja: '他社の業務が動く状態を、人と技術を組み合わせて請け負う。売り物は在庫できず、要員の空きと見積の精度がそのまま利益になる。',
      en: 'Taking on responsibility for someone else’s systems working, by combining people and technology. The product cannot be stocked: bench time and estimate accuracy are the margin.',
    },
    aliases: ['it-services', 'it services', 'itサービス', 'it サービス', 'si', 'システムインテグレータ', 'システムインテグレーター', 'sier', 'ベンダー', '情報サービス', 'itベンダー', 'システム開発会社', 'consulting', 'managed services', 'マネージドサービス'],
    detectors: ['受託開発', 'システム開発', '常駐', '要員', '工数', '人月', 'sla', 'マネージドサービス', 'ヘルプデスク', '再委託', '協力会社', '案件', 'システムインテグレーション', 'managed service', 'managed services', 'systems integration', 'system integration', 'staffing', 'billable'],
    capabilities: [
      {
        id: 'itsvc-deal-shaping',
        name: { ja: '案件組成・見積', en: 'Deal Shaping & Estimation' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order'],
        definition: {
          ja: '相手の困りごとを、実行できる範囲・体制・金額に翻訳し、勝てる形かつ赤字にならない形で握る力。',
          en: 'Translating a customer’s problem into a scope, a team, and a price that can actually be delivered — winnable, and not loss-making.',
        },
        typicalL2: [
          { ja: '提案・ソリューション設計', en: 'Proposal and solution shaping' },
          { ja: '工数見積・原価計算', en: 'Effort estimation and cost build-up' },
          { ja: '受注審査(リスク・採算)', en: 'Deal review for risk and margin' },
          { ja: '契約条件・検収条件の設定', en: 'Contract and acceptance terms' },
        ],
        weakSigns: [
          { ja: '見積が特定の数人の勘に依存し、その人が抜けると根拠を再現できない。', en: 'Estimates depend on a handful of people’s instinct, and nobody can reconstruct the basis once they leave.' },
          { ja: '赤字案件の原因が「見積時点で決まっていた」と後から分かる。', en: 'Loss-making projects turn out, in hindsight, to have been decided at the estimate.' },
        ],
        probes: [
          { ja: '直近 1 年で、見積工数と実績工数の乖離が最も大きかった案件は何倍でしたか。原因は分類されていますか。', en: 'Over the last year, what was the worst ratio of actual to estimated effort, and are the causes categorised?' },
          { ja: '受注前に採算とリスクを見る場は誰が持っていますか。そこで「断る」判断は実際に出ていますか。', en: 'Who owns the pre-signature margin and risk review, and has it ever actually said no?' },
        ],
        triggers: ['見積', '提案', '受注', '案件', '人月', '工数', 'rfp', 'proposal', 'estimation', 'bid'],
      },
      {
        id: 'itsvc-delivery',
        name: { ja: 'デリバリ実行・プロジェクト管理', en: 'Delivery Execution & Project Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '約束した範囲・品質・期日・原価で作り切り、変更が起きても合意し直しながら着地させる力。',
          en: 'Getting to the promised scope, quality, date, and cost — and renegotiating explicitly when any of them moves.',
        },
        typicalL2: [
          { ja: '計画・進捗管理', en: 'Planning and progress control' },
          { ja: '変更管理・追加契約', en: 'Change control and contract variations' },
          { ja: '品質保証・レビュー', en: 'Quality assurance and reviews' },
          { ja: '検収・引き渡し', en: 'Acceptance and handover' },
        ],
        weakSigns: [
          { ja: '遅延がプロジェクト終盤にしか見えず、報告上は最後まで「順調」になっている。', en: 'Slippage becomes visible only near the end; the status stays green until it cannot.' },
          { ja: '仕様変更が無償で吸収され、追加契約として記録されない。', en: 'Scope changes get absorbed for free and never appear as a contract variation.' },
        ],
        probes: [
          { ja: '進行中の案件のうち、原価が計画を超えているものは何件で、いつ気づきましたか。', en: 'How many live projects are over planned cost, and when was that first noticed?' },
          { ja: '仕様変更の受け入れを止められる人は誰ですか。その判断は記録に残りますか。', en: 'Who can refuse a scope change, and is that decision recorded anywhere?' },
        ],
        triggers: ['プロジェクト', 'デリバリ', '納期', '検収', '進捗', '品質保証', 'delivery', 'project'],
      },
      {
        id: 'itsvc-managed-operations',
        name: { ja: '運用サービス提供(マネージドサービス)', en: 'Managed Service Operations' },
        group: 'core',
        universal: true,
        supersedes: ['service-delivery-production'],
        definition: {
          ja: '引き渡した後のシステムを、合意した水準で動かし続け、障害と変更を約束の時間内に処理する力。',
          en: 'Keeping delivered systems running at the agreed level, and handling incidents and changes inside the promised time.',
        },
        typicalL2: [
          { ja: '監視・インシデント対応', en: 'Monitoring and incident response' },
          { ja: 'サービスデスク・問い合わせ対応', en: 'Service desk' },
          { ja: '変更・リリース管理', en: 'Change and release management' },
          { ja: 'サービスレベル報告', en: 'Service level reporting' },
        ],
        weakSigns: [
          { ja: '運用の実態が個人の手順書に依存し、担当交代のたびに品質が落ちる。', en: 'Operations rest on one person’s runbook, and quality drops with every handover.' },
          { ja: 'SLA は毎月達成しているのに、顧客の満足度は下がり続けている。', en: 'The SLA is met every month while customer satisfaction keeps falling.' },
        ],
        probes: [
          { ja: '直近 3 か月の SLA 未達は何件で、契約上のペナルティは発生しましたか。', en: 'How many SLA breaches in the last three months, and did any trigger a contractual penalty?' },
          { ja: '運用で人が毎月繰り返している作業のうち、自動化できていないものは何ですか。', en: 'Which monthly repeated manual task in operations is still not automated?' },
        ],
        triggers: ['運用', '保守', '監視', 'sla', 'ヘルプデスク', 'サービスデスク', 'インシデント', 'managed service', 'managed services', 'operations', 'incident'],
      },
      {
        id: 'itsvc-workforce',
        name: { ja: '技術者要員計画・スキル管理', en: 'Technical Workforce & Skill Management' },
        group: 'enabling',
        universal: true,
        definition: {
          ja: '必要な技術を持つ人を、必要な時期に、必要な数だけ用意し続ける力。空き要員と不足を同じ表で見る。',
          en: 'Having the right skills, in the right numbers, at the right time — with bench and shortage visible on the same sheet.',
        },
        typicalL2: [
          { ja: '要員需給計画(アサイン計画)', en: 'Demand and supply planning for people' },
          { ja: 'スキル定義・認定', en: 'Skill definition and certification' },
          { ja: '育成・技術移転', en: 'Development and skill transfer' },
          { ja: '稼働率・空き要員の管理', en: 'Utilisation and bench management' },
        ],
        weakSigns: [
          { ja: '「誰が空いているか」がメールと口頭でしか分からず、外注で埋めてから社内の空きが判明する。', en: 'Who is free is known only through email and hallway talk; the bench surfaces after a subcontractor was already hired.' },
          { ja: '特定の技術者しか触れないシステムが積み上がり、休暇が取れない。', en: 'Systems only one engineer can touch keep accumulating, and that engineer cannot take leave.' },
        ],
        probes: [
          { ja: '3 か月先の要員需給は、どの単位(人・スキル・案件)で見えていますか。', en: 'At what unit — person, skill, project — can you see supply and demand three months out?' },
          { ja: '1 人しか対応できない業務・システムは何件ありますか。一覧はありますか。', en: 'How many systems or duties have exactly one person who can handle them, and is there a list?' },
        ],
        triggers: ['要員', 'アサイン', '稼働率', 'スキル', '技術者', 'エンジニア', '育成', 'utilisation', 'utilization', 'staffing', 'skill'],
      },
      {
        id: 'itsvc-partner-sourcing',
        name: { ja: '再委託・パートナー管理', en: 'Subcontracting & Partner Management' },
        group: 'enabling',
        universal: true,
        supersedes: ['partner-channel'],
        definition: {
          ja: '自社でやらない部分を外部に預け、品質・情報・法令上の責任は自社で持ち切る力。',
          en: 'Placing work outside while keeping quality, information, and legal accountability inside.',
        },
        typicalL2: [
          { ja: 'パートナー選定・評価', en: 'Partner selection and rating' },
          { ja: '発注・単価管理', en: 'Ordering and rate management' },
          { ja: '再委託先の品質・セキュリティ管理', en: 'Quality and security oversight of subcontractors' },
          { ja: '契約・法令順守(多重委託の管理)', en: 'Contract and compliance oversight of tiered subcontracting' },
        ],
        weakSigns: [
          { ja: '二次請け・三次請けの実態を発注元が把握しておらず、事故のときに誰が触っていたか辿れない。', en: 'Nobody upstream knows who the second and third tier actually are, so after an incident you cannot trace who touched what.' },
          { ja: 'パートナー評価が単価だけで、品質と情報管理の実績が選定に反映されない。', en: 'Partners are rated on rate alone; quality and information-handling history never reach the selection.' },
        ],
        probes: [
          { ja: '現在の案件で、再委託が何次まで入っていますか。その一覧はどこにありますか。', en: 'How many tiers of subcontracting are in your live projects, and where is that list?' },
          { ja: 'パートナーの作業者が自社の顧客データに触れる場合、その権限はどこで管理していますか。', en: 'When a partner’s people touch your customer data, where are those permissions managed?' },
        ],
        triggers: ['再委託', '協力会社', 'パートナー', '外注', '常駐', '多重委託', 'subcontract', 'partner', 'vendor'],
      },
      {
        id: 'itsvc-reusable-assets',
        name: { ja: '再利用資産・技術知見の管理', en: 'Reusable Asset & Know-how Management' },
        group: 'enabling',
        universal: false,
        definition: {
          ja: '一度作ったもの(部品・雛形・事例・見積根拠)を次の案件で使える形にして持ち続ける力。ここが弱いと毎回ゼロから作る。',
          en: 'Keeping what was built once — components, templates, references, estimating baselines — in a form the next project can use. Weak here means starting from zero every time.',
        },
        typicalL2: [
          { ja: '共通部品・テンプレートの整備', en: 'Shared components and templates' },
          { ja: '事例・提案資産の蓄積', en: 'Reference cases and proposal assets' },
          { ja: '技術標準・アーキテクチャ指針', en: 'Technology standards and architecture guidance' },
          { ja: '知見の展開・教育', en: 'Dissemination and enablement' },
        ],
        weakSigns: [
          { ja: '似た案件が並行して走っているのに、成果物が共有されず二重に作られている。', en: 'Similar projects run in parallel and build the same thing twice because nothing is shared.' },
          { ja: '「うちの標準」を聞くと部門ごとに違う答えが返る。', en: 'Ask what the house standard is and every unit answers differently.' },
        ],
        probes: [
          { ja: '直近の案件で、既存資産を再利用した割合はどれくらいですか。測っていますか。', en: 'In your recent projects, what share reused existing assets — and is that even measured?' },
          { ja: '過去案件の見積根拠は、次の見積で参照できる場所にありますか。', en: 'Are past estimating baselines stored where the next estimate can reach them?' },
        ],
        triggers: ['再利用', '標準化', 'テンプレート', 'ナレッジ', '技術標準', 'reuse', 'template', 'knowledge'],
      },
      {
        id: 'itsvc-contract-sla',
        name: { ja: '契約・SLA 管理', en: 'Contract & SLA Management' },
        group: 'governing',
        universal: true,
        supersedes: ['legal-contract'],
        definition: {
          ja: '何を約束したか(責任範囲・水準・免責・知財)を全案件で把握し、実態と食い違ったら手を打つ力。',
          en: 'Knowing, across every engagement, what was actually promised — scope of liability, service levels, exclusions, IP — and acting when reality diverges.',
        },
        typicalL2: [
          { ja: '契約雛形・条項の管理', en: 'Contract templates and clause control' },
          { ja: 'SLA・ペナルティ条項の管理', en: 'Service levels and penalty clauses' },
          { ja: '知的財産・成果物権利の管理', en: 'IP and deliverable rights' },
          { ja: '契約更新・失効管理', en: 'Renewal and expiry management' },
        ],
        weakSigns: [
          { ja: '個別に修正された契約条項が案件ごとに散らばり、全社の責任総量が誰にも分からない。', en: 'Individually amended clauses scatter across engagements and nobody knows the firm’s total exposure.' },
          { ja: '契約更新が期限直前に発覚し、条件を交渉する時間が無い。', en: 'Renewals surface days before expiry, leaving no time to negotiate.' },
        ],
        probes: [
          { ja: '契約上、上限のない損害賠償責任を負っている案件は何件ありますか。', en: 'How many engagements carry uncapped liability?' },
          { ja: '90 日以内に更新期限が来る契約の一覧を、今すぐ出せますか。', en: 'Can you produce the list of contracts expiring within 90 days right now?' },
        ],
        triggers: ['契約', 'sla', '知財', '検収条件', '責任範囲', 'contract', 'liability'],
      },
    ],
    notes: [
      {
        ja: 'IT サービス業の能力マップは「売り物が人の時間」であることを外すと形にならない。要員・稼働率・再委託を能力として置かないと、原価の話が能力マップの外に出てしまう。',
        en: 'A capability map for IT services falls apart if it hides that the product is people’s time. Without workforce, utilisation, and subcontracting as capabilities, the cost conversation happens outside the map.',
      },
      {
        ja: '「開発」と「運用」を 1 つの能力に丸めないこと。収益構造も要員も契約形態も違うため、投資判断の単位として別に置く必要がある。',
        en: 'Do not fold build and run into one capability. They differ in revenue model, staffing, and contract form, so they must stand apart as investment units.',
      },
      {
        ja: '自社の情報システム部門(社内 IT)と、売り物としての IT サービスは別の能力。両方あるなら名前で区別する(例: 社内 IT 基盤運営 / マネージドサービス提供)。',
        en: 'Internal corporate IT and IT-as-a-product are different capabilities. If both exist, separate them by name.',
      },
    ],
  },
  {
    id: 'software',
    name: { ja: 'ソフトウェア・SaaS', en: 'Software & SaaS' },
    essence: {
      ja: '同じ製品を多数の顧客に繰り返し提供して対価を得る。作る速度と、解約されない状態を保つ力が事業の寿命を決める。',
      en: 'Selling the same product to many customers over and over. How fast you can ship, and how well you keep customers from leaving, decide the lifespan of the business.',
    },
    aliases: ['software', 'saas', 'ソフトウェア', 'ソフトウェア製品', 'サース', 'クラウドサービス', 'パッケージソフト', 'プロダクト', 'product company', 'isv'],
    detectors: ['プロダクト', 'リリース', 'サブスクリプション', '解約率', 'チャーン', 'mrr', 'arr', 'オンボーディング', 'カスタマーサクセス', 'ロードマップ', 'ライセンス', 'api', 'churn', 'subscription', 'roadmap', 'release'],
    capabilities: [
      {
        id: 'sw-product-management',
        name: { ja: 'プロダクトマネジメント', en: 'Product Management' },
        group: 'core',
        universal: true,
        supersedes: ['product-service-management'],
        definition: {
          ja: '誰のどの困りごとを解くかを決め、作るものとその順番を選び、作らないものを明確に落とす力。',
          en: 'Deciding whose problem is being solved, choosing what to build and in what order, and explicitly dropping the rest.',
        },
        typicalL2: [
          { ja: '顧客課題の把握・検証', en: 'Customer problem discovery and validation' },
          { ja: 'ロードマップ・優先順位づけ', en: 'Roadmap and prioritisation' },
          { ja: '要求定義・仕様策定', en: 'Requirement and specification definition' },
          { ja: '価格・パッケージ設計', en: 'Pricing and packaging' },
        ],
        weakSigns: [
          { ja: '機能追加の理由が「大口顧客が言ったから」しかなく、製品が一社向けの受託に近づいていく。', en: 'Every feature exists because one large customer asked, and the product drifts towards bespoke work.' },
          { ja: 'ロードマップに「やらないこと」が一つも書かれていない。', en: 'The roadmap contains no list of what will not be built.' },
        ],
        probes: [
          { ja: '直近 2 四半期でリリースした機能のうち、実際に使われているものはどれだけですか。測っていますか。', en: 'Of the features shipped in the last two quarters, how many are actually used — and is that measured?' },
          { ja: '大口顧客の要望を断った直近の例を挙げられますか。誰が断りましたか。', en: 'Can you name the last time a large customer’s request was declined, and who declined it?' },
        ],
        triggers: ['プロダクト', 'ロードマップ', '機能', '要求', '価格', 'product', 'roadmap', 'pricing'],
      },
      {
        id: 'sw-engineering-release',
        name: { ja: 'ソフトウェア開発・リリース', en: 'Software Engineering & Release' },
        group: 'core',
        universal: true,
        definition: {
          ja: '決めたものを、壊さずに、繰り返し短い間隔で本番へ届ける力。速度と安全を同時に持つこと自体が能力。',
          en: 'Getting what was decided into production repeatedly and at short intervals without breaking it. Holding speed and safety together is itself the capability.',
        },
        typicalL2: [
          { ja: '設計・実装', en: 'Design and implementation' },
          { ja: 'テスト自動化・品質検証', en: 'Test automation and verification' },
          { ja: 'ビルド・デプロイ・リリース管理', en: 'Build, deploy, and release management' },
          { ja: '技術的負債の管理', en: 'Technical debt management' },
        ],
        weakSigns: [
          { ja: 'リリースが月 1 回の一大行事で、失敗すると切り戻しに数時間かかる。', en: 'A release is a monthly event, and a failed one takes hours to roll back.' },
          { ja: '技術的負債が誰の担当でもなく、機能開発の合間に個人が勝手に返している。', en: 'Technical debt belongs to nobody and gets repaid by individuals in the gaps between features.' },
        ],
        probes: [
          { ja: '本番リリースの頻度と、変更失敗率はいくつですか。', en: 'What is your production release frequency and change failure rate?' },
          { ja: 'コード変更が本番に届くまでの所要時間の中央値はどれくらいですか。', en: 'What is the median time from code change to production?' },
        ],
        triggers: ['開発', 'リリース', 'デプロイ', 'テスト', 'ci', 'cd', '技術的負債', 'release', 'deploy', 'engineering'],
      },
      {
        id: 'sw-service-reliability',
        name: { ja: 'サービス稼働・信頼性確保', en: 'Service Reliability & Operations' },
        group: 'core',
        universal: true,
        definition: {
          ja: '顧客が使う時間帯に止めず、遅くせず、止まったら約束した時間で戻す力。SaaS では稼働そのものが商品。',
          en: 'Not going down or slow while customers are using it, and coming back inside the promised window when it does. For SaaS, uptime is the product.',
        },
        typicalL2: [
          { ja: '可用性・性能の設計と監視', en: 'Availability and performance design and monitoring' },
          { ja: 'インシデント対応・事後分析', en: 'Incident response and postmortems' },
          { ja: '容量・コスト管理', en: 'Capacity and cost management' },
          { ja: 'バックアップ・災害復旧', en: 'Backup and disaster recovery' },
        ],
        weakSigns: [
          { ja: '障害の一次検知が顧客からの連絡になっている。', en: 'The first notice of an outage comes from a customer.' },
          { ja: '事後分析が個人の反省で終わり、再発防止が仕組みに反映されない。', en: 'Postmortems end as personal reflection and never change the system.' },
        ],
        probes: [
          { ja: '直近 1 年の重大障害は何件で、平均復旧時間はどれくらいですか。', en: 'How many severe incidents in the last year, and what was mean time to restore?' },
          { ja: '顧客に約束している稼働率と、実測値の差はどれくらいですか。', en: 'What is the gap between the uptime you promise and the uptime you measure?' },
        ],
        triggers: ['稼働', '可用性', '障害', '監視', 'sre', '復旧', 'uptime', 'reliability', 'incident'],
      },
      {
        id: 'sw-customer-success',
        name: { ja: '顧客導入・活用支援', en: 'Onboarding & Customer Success' },
        group: 'core',
        universal: true,
        supersedes: ['customer-support'],
        definition: {
          ja: '契約した顧客を、実際に使っていて成果が出ている状態まで運び、その状態を保つ力。解約はここで決まる。',
          en: 'Getting a signed customer to the state of actually using the product and getting value from it, and keeping them there. Churn is decided here.',
        },
        typicalL2: [
          { ja: '初期導入・データ移行', en: 'Onboarding and data migration' },
          { ja: '利用状況の把握・介入', en: 'Usage monitoring and intervention' },
          { ja: '問い合わせ対応・技術支援', en: 'Support and technical assistance' },
          { ja: '更新・拡大提案', en: 'Renewal and expansion' },
        ],
        weakSigns: [
          { ja: '解約の兆候が更新の直前まで見えず、気づいたときには決裁が済んでいる。', en: 'Churn signals stay invisible until just before renewal, by which time the decision is already made.' },
          { ja: '導入支援が営業の善意で行われ、担当によって出来が大きく違う。', en: 'Onboarding runs on the goodwill of whoever sold it, so quality swings by person.' },
        ],
        probes: [
          { ja: '契約から実利用開始までの中央値は何日ですか。使われないまま更新を迎えた契約は何件ありますか。', en: 'What is the median days from contract to real usage, and how many accounts reached renewal unused?' },
          { ja: '解約した顧客の理由は、分類されて製品開発に届いていますか。', en: 'Are churn reasons categorised and delivered back into product development?' },
        ],
        triggers: ['オンボーディング', 'カスタマーサクセス', '解約', 'チャーン', '利用状況', '定着', 'onboarding', 'churn', 'adoption', 'success'],
      },
      {
        id: 'sw-subscription-billing',
        name: { ja: 'サブスクリプション課金・利用権管理', en: 'Subscription Billing & Entitlement' },
        group: 'core',
        universal: true,
        supersedes: ['billing-collection'],
        definition: {
          ja: '契約したプラン・数量・期間どおりに使える範囲を制御し、正しい金額を継続的に請求し続ける力。',
          en: 'Enforcing exactly what each contract entitles a customer to, and billing the right amount for it, month after month.',
        },
        typicalL2: [
          { ja: 'プラン・利用権の管理', en: 'Plan and entitlement management' },
          { ja: '従量課金・使用量計測', en: 'Usage metering and consumption billing' },
          { ja: '契約更新・変更・解約処理', en: 'Renewal, change, and cancellation processing' },
          { ja: '収益認識・売上計上', en: 'Revenue recognition' },
        ],
        weakSigns: [
          { ja: '契約とシステム上の利用権がずれ、払っていない機能が使えている(またはその逆)。', en: 'Contract and system entitlement diverge: customers use what they did not buy, or cannot use what they did.' },
          { ja: '料金プランを増やすたびに請求処理へ手作業が増える。', en: 'Every new pricing plan adds manual work to billing.' },
        ],
        probes: [
          { ja: '契約内容とシステム上の権限が一致しているかを、誰がいつ照合していますか。', en: 'Who reconciles contracted entitlement against system permissions, and how often?' },
          { ja: '請求の手作業修正は月に何件発生していますか。', en: 'How many manual billing corrections happen per month?' },
        ],
        triggers: ['サブスクリプション', '課金', 'ライセンス', 'プラン', '従量', '解約処理', 'subscription', 'billing', 'entitlement', 'license'],
      },
      {
        id: 'sw-product-analytics',
        name: { ja: '利用データ分析・実験', en: 'Product Analytics & Experimentation' },
        group: 'enabling',
        universal: false,
        definition: {
          ja: '製品が実際にどう使われているかを測り、変更の効果を検証してから広げる力。意見ではなく観測で決める。',
          en: 'Measuring how the product is really used and validating a change before rolling it out. Deciding from observation rather than opinion.',
        },
        typicalL2: [
          { ja: '利用ログの計測設計', en: 'Instrumentation design' },
          { ja: '指標定義・ダッシュボード', en: 'Metric definition and dashboards' },
          { ja: 'A/B テスト・段階公開', en: 'A/B testing and staged rollout' },
          { ja: '分析結果の製品判断への反映', en: 'Feeding findings into product decisions' },
        ],
        weakSigns: [
          { ja: '「よく使われている機能」を聞くと、答えが人によって違う。', en: 'Ask which features get used most and the answer depends on who you ask.' },
          { ja: '計測が後付けで、リリース後に「測れていなかった」と分かる。', en: 'Instrumentation is retrofitted, and after release you learn it was never measured.' },
        ],
        probes: [
          { ja: '主要機能ごとの利用率を、今この場で出せますか。', en: 'Can you produce per-feature adoption right now?' },
          { ja: '直近で、実験の結果として撤回した変更はありますか。', en: 'When did an experiment last cause you to withdraw a change?' },
        ],
        triggers: ['利用データ', '分析', '実験', 'a/b', '計測', 'analytics', 'experiment', 'telemetry'],
      },
      {
        id: 'sw-security-assurance',
        name: { ja: '製品セキュリティ・第三者認証対応', en: 'Product Security & Compliance Assurance' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '預かった顧客データを守り、それを外部に証明する力。SaaS では認証の有無が商談の入口になる。',
          en: 'Protecting customer data held on their behalf and proving it to outsiders. For SaaS, a certificate is the entry ticket to a deal.',
        },
        typicalL2: [
          { ja: '脆弱性管理・セキュア開発', en: 'Vulnerability management and secure development' },
          { ja: 'テナント分離・アクセス制御', en: 'Tenant isolation and access control' },
          { ja: '第三者認証・監査対応(ISMS / SOC 2 等)', en: 'Third-party certification and audit response' },
          { ja: '顧客セキュリティ質問票への回答', en: 'Customer security questionnaire response' },
        ],
        weakSigns: [
          { ja: '顧客のセキュリティ質問票が来るたびに、毎回ゼロから回答を作っている。', en: 'Every customer security questionnaire is answered from scratch.' },
          { ja: '脆弱性の修正期限が決まっておらず、既知の脆弱性が放置される。', en: 'No deadline exists for fixing vulnerabilities, so known ones linger.' },
        ],
        probes: [
          { ja: '重大な脆弱性を検知してから本番修正までの、直近の実績時間はどれくらいですか。', en: 'Recently, how long from detecting a critical vulnerability to fixing it in production?' },
          { ja: '顧客ごとのデータが混ざらないことを、どう検証していますか。', en: 'How do you verify that one customer’s data cannot reach another?' },
        ],
        triggers: ['セキュリティ', '脆弱性', '認証', 'isms', 'soc 2', 'iso 27001', 'テナント', 'security', 'vulnerability', 'compliance'],
      },
    ],
    notes: [
      {
        ja: '受託開発(IT サービス)とプロダクト(ソフトウェア)を 1 枚の能力マップに混ぜると、どちらの意思決定にも使えない図になる。両方やっている会社は、まず事業を分けてから能力を置くこと。',
        en: 'Mixing bespoke delivery and product on one capability map yields a picture useless for either decision. If the company does both, split the businesses first, then place capabilities.',
      },
      {
        ja: '「顧客サポート」ではなく「導入・活用支援」に寄せて置くこと。解約が決まるのは問い合わせ対応ではなく、使われている状態を作れたかどうか。',
        en: 'Frame it as onboarding and adoption rather than support: churn is decided by whether usage was ever established, not by ticket handling.',
      },
    ],
  },
  {
    id: 'security',
    name: { ja: 'セキュリティ(事業・機能)', en: 'Security (as a business or a function)' },
    essence: {
      ja: '攻撃されることを前提に、守る対象を把握し、検知して、被害が広がる前に止める。売り物にしている場合も、社内機能の場合も、能力の型は同じ。',
      en: 'Assuming attack: knowing what must be protected, detecting, and stopping the spread before damage lands. The capability shape is the same whether it is sold or run internally.',
    },
    aliases: ['security', 'cybersecurity', 'セキュリティ', 'サイバーセキュリティ', '情報セキュリティ', 'infosec', 'soc', 'mssp', 'セキュリティ事業', 'セキュリティベンダー'],
    detectors: ['soc', 'csirt', 'siem', 'edr', 'インシデント対応', '脆弱性診断', 'ペネトレーション', '脅威インテリジェンス', 'ゼロトラスト', '標的型', 'ランサム', 'マルウェア', 'threat intelligence', 'penetration test', 'vulnerability management', 'zero trust'],
    capabilities: [
      {
        id: 'sec-asset-attack-surface',
        name: { ja: '資産・攻撃面の把握', en: 'Asset & Attack Surface Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '守る対象(システム・端末・アカウント・データ・外部公開面)を、常に最新の一覧として持ち続ける力。ここが無いと他のすべてが穴だらけになる。',
          en: 'Holding an always-current inventory of what must be protected — systems, endpoints, accounts, data, internet-facing surface. Without it, everything else has holes.',
        },
        typicalL2: [
          { ja: '資産台帳の維持', en: 'Asset inventory maintenance' },
          { ja: '外部公開資産の把握', en: 'External attack surface discovery' },
          { ja: '重要度・分類の付与', en: 'Criticality and classification' },
          { ja: '未管理資産の検出', en: 'Detection of unmanaged assets' },
        ],
        weakSigns: [
          { ja: '「守る対象は何台か」に、部門ごとに違う数字が返る。', en: 'Ask how many assets are in scope and each department gives a different number.' },
          { ja: '事故のたびに、台帳に載っていないサーバーが出てくる。', en: 'Every incident turns up a server that was not in the inventory.' },
        ],
        probes: [
          { ja: 'インターネットに露出している自社の資産は何件で、その一覧は何日前のものですか。', en: 'How many internet-facing assets do you have, and how old is that list?' },
          { ja: '台帳に無い機器が社内ネットワークに繋がったとき、何日で気づきますか。', en: 'When an unlisted device joins the network, how many days until you notice?' },
        ],
        triggers: ['資産', '台帳', '攻撃面', '棚卸', 'シャドー', 'asset', 'inventory', 'attack surface'],
      },
      {
        id: 'sec-threat-intelligence',
        name: { ja: '脅威インテリジェンス', en: 'Threat Intelligence' },
        group: 'core',
        universal: false,
        definition: {
          ja: '自分たちを狙う相手が誰で、どう来るのかを継続的に把握し、防御と検知の設計に反映する力。',
          en: 'Continuously knowing who targets you and how, and feeding that into defence and detection design.',
        },
        typicalL2: [
          { ja: '外部情報の収集・評価', en: 'External source collection and evaluation' },
          { ja: '自組織への当てはめ(適用性判断)', en: 'Relevance assessment against your own estate' },
          { ja: '検知ルール・防御策への反映', en: 'Translation into detection and control changes' },
          { ja: '経営・現場への配信', en: 'Distribution to executives and operators' },
        ],
        weakSigns: [
          { ja: '脅威情報が回覧されるだけで、検知ルールも設定も変わらない。', en: 'Threat reports circulate and nothing in detection or configuration changes.' },
          { ja: '業界で話題の攻撃について、自社が影響を受けるかを即答できない。', en: 'When an attack makes industry news, nobody can say on the spot whether it reaches you.' },
        ],
        probes: [
          { ja: '直近の重大な脆弱性情報について、自社への影響有無を判断するまでに何時間かかりましたか。', en: 'For the last critical advisory, how many hours until you knew whether it affected you?' },
          { ja: '脅威情報を受けて検知ルールを変更した直近の例はいつですか。', en: 'When did a piece of threat intelligence last change a detection rule?' },
        ],
        triggers: ['脅威', 'インテリジェンス', '攻撃者', '標的型', 'ランサム', 'threat', 'intelligence', 'adversary'],
      },
      {
        id: 'sec-detection-response',
        name: { ja: '監視・検知・インシデント対応', en: 'Monitoring, Detection & Incident Response' },
        group: 'core',
        universal: true,
        definition: {
          ja: '起きていることに気づき、影響範囲を確定し、止めて、復旧し、同じ手口が二度通らない状態にする力。',
          en: 'Noticing what is happening, establishing blast radius, containing, recovering, and making sure the same route does not work twice.',
        },
        typicalL2: [
          { ja: 'ログ収集・検知ルール運用', en: 'Log collection and detection engineering' },
          { ja: '一次判定・トリアージ', en: 'Triage' },
          { ja: '封じ込め・復旧', en: 'Containment and recovery' },
          { ja: '事後分析・再発防止', en: 'Post-incident analysis and prevention' },
        ],
        weakSigns: [
          { ja: 'アラートが多すぎて、常に一定数が未処理のまま積み上がっている。', en: 'Alert volume is such that a backlog of untriaged alerts is permanent.' },
          { ja: '夜間・休日の一次対応の担当が実質的に決まっていない。', en: 'Nobody is really on the hook for first response at night and at weekends.' },
        ],
        probes: [
          { ja: '侵入の検知から封じ込めまでの、直近の実績時間はどれくらいですか。', en: 'For your most recent case, how long from detection to containment?' },
          { ja: '検知ルールが最後に更新されたのはいつで、誤検知率は測っていますか。', en: 'When were detection rules last updated, and is the false positive rate measured?' },
        ],
        triggers: ['監視', '検知', 'soc', 'siem', 'edr', 'インシデント', 'csirt', 'アラート', 'detection', 'response', 'monitoring'],
      },
      {
        id: 'sec-vulnerability-hardening',
        name: { ja: '脆弱性管理・堅牢化', en: 'Vulnerability Management & Hardening' },
        group: 'core',
        universal: true,
        definition: {
          ja: '弱点を見つけ、重要度をつけ、期限を決めて塞ぎ切る力。見つける力ではなく「塞ぎ切る」力が本体。',
          en: 'Finding weaknesses, ranking them, setting deadlines, and actually closing them. The capability is in the closing, not the finding.',
        },
        typicalL2: [
          { ja: '脆弱性スキャン・診断', en: 'Scanning and assessment' },
          { ja: 'リスク評価・優先順位づけ', en: 'Risk rating and prioritisation' },
          { ja: 'パッチ・設定変更の適用', en: 'Patch and configuration remediation' },
          { ja: '例外・残存リスクの承認管理', en: 'Exception and residual risk approval' },
        ],
        weakSigns: [
          { ja: '診断結果の一覧はあるが、対応期限も担当も付いていない。', en: 'Findings exist as a list with no owner and no deadline.' },
          { ja: '「対応できない」機器の例外が増え続け、誰がいつ承認したか分からない。', en: 'Exceptions for devices that cannot be patched keep growing, with no record of who approved them when.' },
        ],
        probes: [
          { ja: '重大な脆弱性の是正にかかった日数の中央値はいくつですか。', en: 'What is the median days to remediate a critical vulnerability?' },
          { ja: '期限を超過している脆弱性は今何件で、誰が把握していますか。', en: 'How many findings are past their deadline right now, and who tracks that?' },
        ],
        triggers: ['脆弱性', '診断', 'パッチ', '堅牢化', 'ペネトレーション', 'vulnerability', 'patch', 'hardening', 'pentest'],
      },
      {
        id: 'sec-identity-access',
        name: { ja: '認証・アクセス権管理', en: 'Identity & Access Management' },
        group: 'enabling',
        universal: true,
        definition: {
          ja: '誰が何にアクセスしてよいかを決め、与え、使われていない権限を取り上げ続ける力。侵入後の被害の大きさはここで決まる。',
          en: 'Deciding who may reach what, granting it, and continuously taking back what is unused. The size of the damage after a breach is set here.',
        },
        typicalL2: [
          { ja: 'ID ライフサイクル(入社・異動・退職)', en: 'Identity lifecycle across joiners, movers, leavers' },
          { ja: '特権 ID の管理', en: 'Privileged access management' },
          { ja: '権限の定期棚卸', en: 'Periodic access review' },
          { ja: '認証強度(多要素・条件付き)', en: 'Authentication strength and conditional access' },
        ],
        weakSigns: [
          { ja: '退職者のアカウントが残っていることが、監査で初めて分かる。', en: 'Leavers’ accounts are found still active only at audit time.' },
          { ja: '特権 ID が共有され、実際に操作した人を特定できない。', en: 'Privileged accounts are shared, so the person who acted cannot be identified.' },
        ],
        probes: [
          { ja: '退職から権限失効までの実績時間はどれくらいですか。', en: 'How long, in practice, from someone leaving to their access being revoked?' },
          { ja: '特権 ID は何件あり、直近の棚卸はいつでしたか。', en: 'How many privileged accounts exist, and when was the last review?' },
        ],
        triggers: ['認証', 'アクセス権', '特権', 'id 管理', '多要素', 'ゼロトラスト', 'identity', 'access', 'privileged', 'mfa'],
      },
      {
        id: 'sec-service-offering',
        name: { ja: 'セキュリティ製品・サービス提供', en: 'Security Product & Service Delivery' },
        group: 'core',
        universal: false,
        definition: {
          ja: 'セキュリティを商品として顧客に提供し、約束した水準で運び続ける力(SOC 運用受託・診断サービス・製品販売など)。社内機能だけの組織にはこの能力は無い。',
          en: 'Selling security as a product or service and sustaining it at the promised level — managed SOC, assessment services, product sales. Organisations that only run security internally do not have this capability.',
        },
        typicalL2: [
          { ja: 'サービスメニュー・提供水準の設計', en: 'Service catalogue and service level design' },
          { ja: '顧客環境への導入・接続', en: 'Customer onboarding and connectivity' },
          { ja: '運用体制・アナリスト稼働管理', en: 'Analyst staffing and shift operations' },
          { ja: '報告・改善提案', en: 'Reporting and improvement proposals' },
        ],
        weakSigns: [
          { ja: '顧客ごとに検知ルールが個別最適化され、横展開も品質比較もできない。', en: 'Detection rules are hand-tuned per customer, so nothing can be reused or compared.' },
          { ja: '報告書の作成にアナリストの時間の大半が消えている。', en: 'Most analyst time goes into writing reports.' },
        ],
        probes: [
          { ja: '顧客環境の接続から監視開始までの中央値は何日ですか。', en: 'What is the median days from connecting a customer to monitoring going live?' },
          { ja: 'アナリスト 1 人あたりが担当する顧客数と、その上限根拠は何ですか。', en: 'How many customers per analyst, and what is the basis for that ceiling?' },
        ],
        triggers: ['セキュリティサービス', 'soc サービス', '診断サービス', 'mssp', '製品販売', 'security service', 'managed security'],
      },
      {
        id: 'sec-governance-assurance',
        name: { ja: 'セキュリティ統制・規制対応', en: 'Security Governance & Regulatory Assurance' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '守るべき規律を定め、守られていることを証明し、経営が判断できる形でリスクを示す力。',
          en: 'Setting the rules, proving they are followed, and presenting risk in a form the executive can decide on.',
        },
        typicalL2: [
          { ja: '方針・基準の策定と維持', en: 'Policy and standard setting' },
          { ja: '順守状況の測定・監査対応', en: 'Compliance measurement and audit response' },
          { ja: '委託先・サプライチェーンの管理', en: 'Third-party and supply chain oversight' },
          { ja: '経営報告・投資判断の支援', en: 'Executive reporting and investment cases' },
        ],
        weakSigns: [
          { ja: '経営への報告が件数の羅列で、どこに投資すべきかの示唆が無い。', en: 'Executive reporting is a list of counts with no implication for where to invest.' },
          { ja: '規程は整っているが、現場が実際にどうしているかは誰も測っていない。', en: 'The policy set is complete while nobody measures what people actually do.' },
        ],
        probes: [
          { ja: '経営会議でセキュリティの議題が出たのは直近いつで、何が決まりましたか。', en: 'When did security last reach the executive agenda, and what was decided?' },
          { ja: '委託先のセキュリティ水準は、契約以外の何で確認していますか。', en: 'Beyond the contract, how do you verify a supplier’s security level?' },
        ],
        triggers: ['統制', '規程', '監査', '委託先', 'サプライチェーン', '経営報告', 'governance', 'audit', 'third party'],
      },
    ],
    notes: [
      {
        ja: 'セキュリティを「売っている」のか「社内でやっている」のかで、能力マップの中身は変わる。両方の組織は、同じ名前の能力を 2 つ置くのではなく、事業側と機能側で分けて置くこと。',
        en: 'Selling security and running security internally produce different maps. If both exist, do not duplicate the same capability name — separate the business from the internal function.',
      },
      {
        ja: '検知・対応より先に「資産・攻撃面の把握」を置くこと。守る対象が分からないまま検知を強化しても、穴の位置は変わらない。',
        en: 'Put asset and attack surface before detection. Strengthening detection while the protected estate is unknown does not move the holes.',
      },
      {
        ja: '人数・資格保有者数は能力ではない。それは能力を支える資源であり、能力マップに置くと「増員すれば強くなる」という誤った結論に繋がる。',
        en: 'Headcount and certification counts are not capabilities. They are resources behind a capability, and putting them on the map leads to the false conclusion that hiring makes you stronger.',
      },
    ],
  },
];

/** 知識ベースの業界セット + このファイルの追加セット */
const ALL_INDUSTRY_SETS: IndustryCapabilitySet[] = [...INDUSTRY_CAPABILITY_SETS, ...EXTRA_INDUSTRY_SETS];

/**
 * 追加セットの照合。knowledge 側の曖昧照合(detectors の部分一致まで見る)に先に
 * 掛けると `it-services` が製造業に落ちるため、追加セットは**先に**厳しめに見る。
 */
function findExtraIndustrySet(input: string): IndustryCapabilitySet | undefined {
  const raw = input.trim();
  if (raw.length === 0) return undefined;
  const key = raw.toLowerCase();
  const norm = (s: string): string => s.toLowerCase().replace(/[\s　・･\-—–_]/g, '');
  const nk = norm(raw);
  for (const set of EXTRA_INDUSTRY_SETS) {
    if (set.id === key || norm(set.id) === nk) return set;
    if (set.name.ja === raw || norm(set.name.en) === nk) return set;
    if (set.aliases.some((a) => norm(a) === nk)) return set;
  }
  // 別名を含む指定("大手 SIer" / "SaaS ベンダー")も拾う。短い別名の誤爆を避けるため 3 文字以上。
  let best: IndustryCapabilitySet | undefined;
  let bestLen = 0;
  for (const set of EXTRA_INDUSTRY_SETS) {
    for (const alias of set.aliases) {
      const a = norm(alias);
      if (a.length >= 3 && nk.includes(a) && a.length > bestLen) {
        best = set;
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** `industry` 引数 1 件を業界セットに解決する(追加セットを優先) */
function resolveIndustrySet(input: string): IndustryCapabilitySet | undefined {
  return findExtraIndustrySet(input) ?? findIndustryCapabilitySet(input);
}

/**
 * 業界判定に使ってはいけない語。
 *
 * 広報文・会社案内に業種と無関係に出てくる一般語。これらで業界が決まると、
 * 「保守」「点検」「監視」が出ているだけの IT サービス会社が製造業になる(実際になっていた)。
 * 業界セットの適用自体を明示指定のみにしたうえで、候補の提示にもこの語は使わない。
 */
const GENERIC_INDUSTRY_WORDS = new Set([
  '点検', '保守', '監視', 'ライン', '差異', '設計', '検査', '設備', '在庫', '出荷', '調達', '仕入',
  '制度', '通信', '会員', '配送', '運用', '障害', '品質', '部品', '支店', '窓口', '契約者', '案件',
  'maintenance', 'monitoring', 'inspection', 'design', 'quality', 'network', 'service', 'services',
  'branch', 'operations',
]);

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
  /** 適用した業界セット(`industry` の明示指定があるときだけ入る。0〜3 件) */
  sets: IndustryCapabilitySet[];
  /** industry に指定されたが、対応するセットが無かった入力値 */
  unknownInputs: string[];
  /** 上限(3 件)を超えたため適用しなかった指定 */
  ignoredInputs: string[];
  /** 適用はしないが、説明文の語から見て指定候補になりうるセット */
  suggestions: { set: IndustryCapabilitySet; words: string[] }[];
  /** 適用したセットの語のうち、説明文にも出ていた語(強い順) */
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
  return ALL_INDUSTRY_SETS.map((s) => `\`${s.id}\`(${lang === 'en' ? s.name.en : s.name.ja})`).join(' / ');
}

/** 一致語のうち、業界の手がかりとして意味を持つものだけ残す */
function distinctiveWords(words: string[]): string[] {
  return words.filter((w) => !GENERIC_INDUSTRY_WORDS.has(w.toLowerCase().trim()));
}

/** 追加セットは detectIndustryCapabilitySets が知らないので、候補判定をここで行う */
function detectExtraSets(description: string): { set: IndustryCapabilitySet; words: string[] }[] {
  const hay = description.toLowerCase();
  const out: { set: IndustryCapabilitySet; words: string[] }[] = [];
  for (const set of EXTRA_INDUSTRY_SETS) {
    const terms = new Set<string>();
    for (const a of set.aliases) terms.add(a.toLowerCase());
    for (const d of set.detectors) terms.add(d.toLowerCase());
    for (const c of set.capabilities) for (const t of c.triggers) terms.add(t.toLowerCase());
    const words = distinctiveWords([...terms].filter((t) => matchesKeyword(hay, t)));
    // 別名(業界名そのもの)が出ているか、業界語が 3 語以上出ているときだけ候補にする
    const namesIndustry = set.aliases.some((a) => matchesKeyword(hay, a.toLowerCase()));
    if (namesIndustry || words.length >= 3) {
      out.push({ set, words: words.sort((a, b) => b.length - a.length).slice(0, 8) });
    }
  }
  return out;
}

/**
 * industry 引数から、適用する業界セットを決める。
 *
 * **既定は「適用しない」。** 以前は説明文から業界を推定して 20 件近い業界能力を足していたが、
 * 実測で誤判定が続いた(「保守」「点検」「監視」が出ている IT サービス会社が製造業になる)。
 * 説明文の語に反応した能力が 0 件でも業界セットだけで表が埋まるため、利用者から見ると
 * 「入力と無関係な図」が返る。よって業界セットは `industry` の明示指定があるときだけ適用し、
 * 説明文からの推定は**候補の提示にとどめる**(適用はしない)。
 *
 * `industry` はカンマ区切りで複数指定できる(例: "it-services, manufacturing")。
 * 事業が複数ある会社は分けて描くのが本筋だが、まず並べて見たい場面があるため 3 件まで受ける。
 */
function resolveIndustry(businessDescription: string, industry: string | undefined): IndustryResolution {
  const specifiedRaw = industry?.trim() ?? '';
  const sets: IndustryCapabilitySet[] = [];
  const unknownInputs: string[] = [];
  const ignoredInputs: string[] = [];
  if (specifiedRaw.length > 0) {
    const parts = specifiedRaw
      .split(/[,、]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const part of parts) {
      const hit = resolveIndustrySet(part);
      if (!hit) {
        if (!unknownInputs.includes(part)) unknownInputs.push(part);
        continue;
      }
      if (sets.some((s) => s.id === hit.id)) continue;
      if (sets.length >= 3) {
        if (!ignoredInputs.includes(hit.id)) ignoredInputs.push(hit.id);
        continue;
      }
      sets.push(hit);
    }
  }

  const applied = new Set(sets.map((s) => s.id));
  const hay = businessDescription.toLowerCase();

  // 候補(適用はしない)。汎用語だけで当たっているものは候補にもしない。
  const suggestions: { set: IndustryCapabilitySet; words: string[] }[] = [];
  for (const d of detectIndustryCapabilitySets(businessDescription)) {
    if (applied.has(d.set.id) || !d.confident) continue;
    const words = distinctiveWords(d.matched);
    if (words.length < 3) continue;
    suggestions.push({ set: d.set, words: words.slice(0, 8) });
  }
  for (const e of detectExtraSets(businessDescription)) {
    if (applied.has(e.set.id)) continue;
    suggestions.push(e);
  }
  suggestions.sort((a, b) => b.words.length - a.words.length);

  // 適用したセットの語のうち、説明文に実際に出ていた語(「なぜこの能力が出たか」の説明用)
  const matched: string[] = [];
  for (const set of sets) {
    for (const cap of set.capabilities) {
      for (const t of cap.triggers) {
        const tl = t.toLowerCase();
        if (matchesKeyword(hay, tl) && !matched.includes(tl)) matched.push(tl);
      }
    }
  }

  return { sets, unknownInputs, ignoredInputs, suggestions: suggestions.slice(0, 3), matched: matched.sort((a, b) => b.length - a.length) };
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

  // 分類ごとに「説明文の語に反応したもの → それ以外(業界 → 汎用)」の順に並べる。
  //
  // 以前は業界セットを先頭に固定していたため、説明文から拾った能力が業界セットの
  // 20 件の後ろに埋もれていた。利用者が入力した語に反応した能力こそ、この草案で
  // 唯一「その会社の話」に近い部分なので、先頭に出す。
  const byHits = (a: DraftItem, b: DraftItem): number => b.hits.length - a.hits.length;
  const drafted: DraftItem[] = [];
  for (const g of GROUP_ORDER) {
    const inGroup = (i: DraftItem): boolean => i.cap.group === g;
    const hitItems = [...industryItems.filter(inGroup), ...genericItems.filter(inGroup)]
      .filter((i) => i.hits.length > 0)
      .sort(byHits);
    drafted.push(...hitItems);
    drafted.push(...industryItems.filter((i) => inGroup(i) && i.hits.length === 0));
    drafted.push(...genericItems.filter((i) => inGroup(i) && i.hits.length === 0));
  }
  return { drafted, deferred, replaced };
}

/** 一覧に付ける印(◆ = 業界固有、★ = 説明文の語に反応) */
function marks(item: DraftItem): string {
  const m = `${item.fromIndustry ? '◆' : ''}${item.hits.length > 0 ? '★' : ''}`;
  return m;
}

function renderDraftCapabilityMap(businessDescription: string, industry: string | undefined, lang: Lang): string {
  // ★ は「説明文の語に反応した」印なので、industry 引数の文字列は入れない
  // (industry="manufacturing" と書いただけで汎用能力が ★ になっていた)。
  const haystack = businessDescription.toLowerCase();
  const resolution = resolveIndustry(businessDescription, industry);
  const { drafted, deferred, replaced } = buildDraftItems(haystack, resolution);
  const industryCount = drafted.filter((d) => d.fromIndustry).length;
  const hitCount = drafted.filter((d) => d.hits.length > 0).length;

  const out: string[] = [];
  out.push(`# ${inline('レベル 1 能力マップ(草案)', 'Level-1 capability map — draft', lang)}`);
  out.push('');
  out.push(`> ${line(L.draftWarning, lang)}`);
  out.push('');
  out.push(`> ${line(L.betterPath, lang)}`);
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

  // --- 業界セットの適用結果 / Which industry set was applied ----------------
  out.push(`## ${inline('適用した業界セット', 'Industry set applied', lang)}`);
  out.push('');
  if (resolution.unknownInputs.length > 0) {
    const unknown = resolution.unknownInputs.join(' / ');
    out.push(
      msg(
        `industry に指定された「${unknown}」に対応する能力セットは用意がありません。用意がある業界: ${industryMenu('ja')}。`,
        `There is no capability set for the industry you passed ("${unknown}"). Available: ${industryMenu('en')}.`,
        lang,
      ),
    );
    out.push('');
  }
  if (resolution.ignoredInputs.length > 0) {
    const ignored = resolution.ignoredInputs.join(' / ');
    out.push(
      msg(
        `一度に適用できる業界セットは 3 件までです。「${ignored}」は適用していません。事業が 3 つ以上あるなら、能力マップも事業ごとに分けて作るほうが読めます。`,
        `At most three industry sets are applied at once, so "${ignored}" was not applied. With more than three businesses, draw a map per business instead.`,
        lang,
      ),
    );
    out.push('');
  }
  if (resolution.sets.length === 0) {
    out.push(
      msg(
        `**業界セットは適用していません(既定の動作)。この草案は汎用セットだけで組み立てています。** 業界セットは \`industry\` を明示したときだけ足します。以前は説明文から業界を推定していましたが、「保守」「点検」「監視」のような一般語で業界が決まり、入力と無関係な能力が 20 件並ぶ事故が起きたため、推定での適用をやめました。指定できる業界: ${industryMenu('ja')}。`,
        `**No industry set was applied — that is the default.** This draft is the generic set only. Industry sets are added only when you pass \`industry\` explicitly: inference used to apply them from the description, but general words such as "maintenance", "inspection", and "monitoring" decided the industry and produced twenty capabilities unrelated to the input, so inferred application was removed. Available: ${industryMenu('en')}.`,
        lang,
      ),
    );
  } else {
    for (const set of resolution.sets) {
      out.push(`- **${line(set.name, lang)}**(\`${set.id}\`) — ${line(set.essence, lang)}`);
    }
    out.push('');
    out.push(
      msg(
        `\`industry\` の明示指定に基づいて適用しました(説明文からの推定では適用しません)。`,
        `Applied from your explicit \`industry\` argument. Industry sets are never applied from inference.`,
        lang,
      ),
    );
    if (resolution.matched.length > 0) {
      const words = resolution.matched.slice(0, 10).join(' / ');
      out.push('');
      out.push(
        msg(
          `このうち説明文にも出ていた語: ${words}(★ の根拠)`,
          `Words from these sets that also appear in your description: ${words} (the basis for ★)`,
          lang,
        ),
      );
    } else {
      out.push('');
      out.push(
        msg(
          '**注意: 適用した業界セットの語は、説明文に 1 つも出ていません。** 業界名だけで型を当てた状態なので、この会社の実態と合っているかは未確認です。合わない能力は消してください。',
          '**Warning: not one word from the applied industry set appears in your description.** The shape was applied from the industry name alone, so nothing here is confirmed against this company. Delete what does not fit.',
          lang,
        ),
      );
    }
  }
  if (resolution.suggestions.length > 0) {
    out.push('');
    out.push(
      msg(
        '**説明文の語から見て、次の業界セットも指定できます(適用はしていません)。** 足したい場合だけ指定して呼び直してください。',
        '**Judging by your wording, these sets could also apply — none of them were applied.** Call again with the one you want, if any.',
        lang,
      ),
    );
    out.push('');
    for (const s of resolution.suggestions) {
      const words = s.words.slice(0, 6).join(' / ');
      out.push(
        `- \`industry: "${s.set.id}"\` — ${line(s.set.name, lang)}${words.length > 0 ? ` (${words})` : ''}`,
      );
    }
  }
  out.push('');
  out.push(
    msg(
      `草案 ${drafted.length} 件(業界固有 ${industryCount} 件 / 汎用 ${drafted.length - industryCount} 件、うち説明文の語に反応 ${hitCount} 件)。◆ = 業界固有の能力、★ = 説明文の語に反応した能力。**★ が付いていない能力は、あなたの入力とは無関係に「どの会社にもある型」として並んでいるだけ**です。`,
      `${drafted.length} capabilities drafted: ${industryCount} industry-specific, ${drafted.length - industryCount} generic, ${hitCount} of them reacting to wording in your description. ◆ marks industry-specific, ★ marks the reactions. **Anything without ★ is there as a generic shape, unrelated to what you typed.**`,
      lang,
    ),
  );
  if (hitCount === 0) {
    out.push('');
    out.push(
      msg(
        '**★ が 1 件もありません。** 説明文の語に反応した能力がゼロということは、この草案はあなたの入力をほとんど使っていないということです。事業の説明に具体的な業務語(何を作り、誰に届け、何で対価を得ているか)を足して呼び直すか、資料を読んでいるなら自分で能力名を挙げて `check_capability_map` に渡してください。',
        '**There is not a single ★.** No capability reacted to your wording, which means this draft barely used your input. Either call again with concrete operational vocabulary — what is produced, for whom, in return for what — or, if you have read the source material, list the capabilities yourself and pass them to `check_capability_map`.',
        lang,
      ),
    );
  }
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
  // 最初の一手は「捨てる」。実測で、この草案の出力はそのまま使われず全量が捨てられていた。
  // 残す・消す・書き換えるの判断を先に置き、そのうえで検査に回す。
  nextMoves.push({
    ja: '**まず消す。** この一覧のうち、この会社について実際に読んだ・聞いた内容と結びつかないものを削る。★ が付いていない行は特に疑う。残った名前だけが議論の対象になる。',
    en: '**Delete first.** Strike every row you cannot tie to something you actually read or heard about this company — rows without ★ especially. Only what survives is worth discussing.',
  });
  nextMoves.push({
    ja: '**残した名前 + 自分で挙げた名前をまとめて `check_capability_map` に渡す。** 動詞・組織名・IT 用語・粒度のばらつき・重複を機械的に検出できる。**資料を読んでいるなら、この草案を経由せず自分の一覧を直接検査するほうが速く正確です。**',
    en: '**Pass what survives, plus the names you came up with yourself, to `check_capability_map`** — it mechanically catches verbs, org names, IT vocabulary, inconsistent granularity, and duplicates. **If you have read the source material, checking your own list directly, without going through this draft, is faster and more accurate.**',
  });
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
      ja: `**業界の型が要るなら \`industry\` を明示して呼び直す。** 説明文からの推定では足しません(誤判定が多かったため)。指定できる業界: ${industryMenu('ja')}。`,
      en: `**If you want the industry shape, call again with \`industry\` set explicitly.** It is never inferred from the description any more, because inference was wrong too often. Available: ${industryMenu('en')}.`,
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
        '事業の説明から、レベル 1 能力マップの草案(図+表)と、各能力について事業側に問うべき質問を返す。**中身の正しさではなく「型と問いの一覧」を得るための道具**で、資料を読んでいるなら自分で挙げた能力名を `check_capability_map` に渡すほうが速く正確。業界別の能力セット(銀行・保険・製造・医療・小売/EC・公共・通信・IT サービス/SI・ソフトウェア/SaaS・セキュリティ)は **`industry` を明示したときだけ**適用する(説明文からは推定しない。一般語で業界が決まる誤判定が多かったため)。 / From a business description, draft a level-1 capability map (diagram plus table) plus the questions to ask the business. It is **a tool for the shape and the questions, not for correct content** — if you have read the source material, running your own list of names through `check_capability_map` is faster and more accurate. Industry sets (banking, insurance, manufacturing, healthcare, retail, public sector, telecom, IT services/SI, software/SaaS, security) apply **only when `industry` is passed explicitly**; they are never inferred from the description, because general words decided the industry too often.',
      inputSchema: {
        businessDescription: z
          .string()
          .min(1)
          .describe('事業の説明。何を誰に提供して対価を得ているか、規模、特徴など。具体的な業務語(預金・融資・受注生産・レセプトなど)を書くほど業界固有の能力が当たる / What the business does: what is offered to whom in return for what, scale, distinctive traits. The more concrete the operational vocabulary, the better the industry match'),
        industry: z
          .string()
          .optional()
          .describe('業界(任意)。banking / insurance / manufacturing / healthcare / retail-ecommerce / public-sector / telecommunications / it-services / software / security、または「金融」「製造」「地方銀行」「SIer」などの語でも可。カンマ区切りで最大 3 件。**省略すると業界セットは適用しない**(推定はせず、候補の提示だけ行う)/ Industry, optional; id or free wording, comma-separated up to three. **Omit it and no industry set is applied** — the description is never used to infer one, only to suggest candidates'),
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
