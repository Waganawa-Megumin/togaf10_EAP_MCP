/**
 * セキュリティ EA ツール / Security enterprise-architecture tools.
 *
 * TOGAF ADM の各フェーズに、SABSA の層構造を借りたセキュリティ検討を並走させるための道具。
 * 「今のフェーズで何を必ず答えておくべきか」「何を作るべきか」を毎回明示するのが目的。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  bullets,
  findPhase,
  matchesKeyword,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import {
  REGULATORY_KEYWORDS,
  SABSA_LAYERS,
  SABSA_QUESTIONS,
  SECURITY_KEYWORDS,
  SECURITY_ROLE_KEYWORDS,
  THREAT_LENSES,
  findSabsaLayer,
  findSecurityArtifact,
  securityArtifactsForPhase,
  securityMappingFor,
  securityPitfallsForPhase,
  securityRequirementsFor,
} from '../knowledge/security-ea.js';
import { loadEngagement } from '../engagement/store.js';
import type { Engagement } from '../engagement/model.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/* ------------------------------------------------------------------ *
 * 共通のヘルパ
 * ------------------------------------------------------------------ */

/** 出力全体に添える注意書き。法的助言ではないことを毎回明示する。 */
const DISCLAIMER: Bilingual = {
  ja: 'この出力は検討の出発点となる草案であり、法的助言ではありません。規制の適用範囲の判断と統制の妥当性は、必ず自組織のセキュリティ担当・法務と対話して確定させてください。',
  en: 'This output is a starting draft, not legal advice. Confirm how any regulation applies, and whether the controls are adequate, in conversation with your own security and legal functions.',
};

/** 表のセルなど、1 行に収めたい場所で使う短い表記 */
function compact(value: Bilingual, lang: Lang): string {
  return text(value, lang === 'both' ? 'ja' : lang);
}

/**
 * 行の途中に置くラベル。`msg` は日英を改行で返すため、表のセルや
 * 「ラベル: 値」の形では表が崩れる。ここでは 1 行に収める。
 */
function label(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** 引用ブロック。両言語のときも各行に "> " を付ける */
function quote(ja: string, en: string, lang: Lang): string {
  return msg(ja, en, lang)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** フェーズ ID を "A (フェーズ A: ...)" のような表示に変える */
function phaseLabel(id: string, lang: Lang): string {
  const p = findPhase(id);
  if (!p) return `\`${id}\``;
  return `${p.code} — ${compact(p.name, lang)}`;
}

/** セキュリティ成果物 ID を表示名に変える */
function artifactLabel(id: string, lang: Lang): string {
  const a = findSecurityArtifact(id);
  return a ? `${compact(a.name, lang)} (\`${a.id}\`)` : `\`${id}\``;
}

/** 番号付きの箇条書き(必ず答えるべき問いは番号を振ったほうが会話で参照しやすい) */
function numbered(values: Bilingual[], lang: Lang): string {
  if (values.length === 0) return `- ${label('(なし)', '(none)', lang)}`;
  return values
    .map((v, i) =>
      lang === 'both' ? `${i + 1}. ${v.ja}\n   - ${v.en}` : `${i + 1}. ${text(v, lang)}`,
    )
    .join('\n');
}

/** 文字列にキーワード群のどれかが含まれるか */
function matchesAny(haystack: string, keywords: string[]): boolean {
  const h = haystack.toLowerCase();
  return keywords.some((k) => matchesKeyword(h, k));
}

/** 空白のみの文字列を未設定とみなす */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * 利用者入力・エンゲージメント由来の文字列を 1 行に潰す。
 * 改行が混ざると「ラベル: 値」の行や箇条書きが途中で切れるため、必ず通す。
 */
function oneLine(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, ' ').trim();
}

/**
 * Markdown の表のセルに入れる値。縦棒をエスケープしないと列がずれ、
 * 資産名に含まれる `|` だけで表全体が壊れる。
 */
function cell(value: string): string {
  return oneLine(value).replace(/\|/g, '\\|');
}

/**
 * 利用者が貼り付けた本文をそのまま出力に混ぜない。引用ブロックに閉じ込めて、
 * 見出しや指示文が本ツールの出力と区別できない形で並ぶことを防ぐ。
 */
function quoteRaw(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

/** 一覧が長くなりすぎないように先頭 n 件だけ出し、残りは件数で示す */
function firstFew(items: string[], limit: number, lang: Lang): string {
  const head = items.slice(0, limit).map((s) => `  - ${s}`);
  if (items.length > limit) {
    head.push(
      `  - ${label(`ほか ${items.length - limit} 件`, `and ${items.length - limit} more`, lang)}`,
    );
  }
  return head.join('\n');
}

/* ================================================================== *
 * 状況の読み取り
 *
 * threat_model_starter と security_requirements_checklist は、利用者が
 * 書いた自然文から「公開範囲・扱うデータの機微性・規模・主体の種類」を
 * 推定し、それによって助言の中身を変える。
 * 推定である以上まちがえるので、読み取り結果・根拠・確度を必ず出力に
 * 添えて、利用者が訂正できる形にする。
 * ================================================================== */

/** 公開範囲 */
type Exposure = 'public' | 'partner' | 'internal' | 'isolated' | 'unknown';

/** 資産の性質。脅威観点ごとの優先度表の行になる */
type AssetKind =
  | 'log'
  | 'secret'
  | 'credential'
  | 'payment'
  | 'personal'
  | 'control'
  | 'design'
  | 'availability'
  | 'business';

/** 主体の種類 */
type ActorKind = 'external-human' | 'internal-human' | 'machine' | 'contractor';

/** 記述から拾えた規模 */
interface ScaleHint {
  count: number;
  unit: 'org' | 'person' | 'account';
  raw: string;
}

/** 読み取った状況 */
interface Situation {
  exposure: Exposure;
  exposureEvidence: string[];
  /** 閉域と公開の記述が同居していたときの根拠(厳しい側に倒したことを開示する) */
  exposureConflict: string[];
  /** 記述と資産から読み取れた機微性 */
  sensitivities: AssetKind[];
  sensitivityEvidence: string[];
  /** 最大の規模(見出しに使う) */
  scale?: ScaleHint;
  scales: ScaleHint[];
  actorKinds: ActorKind[];
  actorEvidence: string[];
  /** 物理的に触れる機器・現場があるか */
  physical: boolean;
  /** 保守ベンダー・委託作業の経路があるか */
  maintenance: boolean;
  cloud: boolean;
  /** 外部システム・SaaS との連携があるか */
  integration: boolean;
  contextEvidence: string[];
}

/* --- 判定に使う語 ------------------------------------------------- */

const ISOLATED_WORDS = [
  '閉域', '閉域網', '専用線', 'スタンドアロン', 'オフライン', 'エアギャップ',
  'air gap', 'air-gapped', '隔離網', '物理隔離', '非接続', 'offline', 'isolated network',
];

/** 「インターネットに接続していない」系の否定表現。公開判定から除外するために使う */
const NET_DENIAL_WORDS = [
  'インターネット接続は無', 'インターネット接続はな', 'インターネット接続が無',
  'インターネット接続がな', 'インターネット接続無', 'インターネット接続な',
  'インターネットに接続しな', 'インターネットに接続せ', 'インターネット非接続',
  'インターネット未接続', 'インターネットから遮断', 'インターネットから切り離',
  'no internet', 'without internet', 'not connected to the internet',
];

const PUBLIC_WORDS = [
  '社外公開', '一般公開', '公開ポータル', '公開サイト', '公衆', '一般利用者',
  '一般ユーザー', '不特定多数', '誰でも', '未認証', 'コンシューマ', '会員登録',
  'public-facing', 'internet-facing', 'publicly accessible', 'consumer',
];

/** 単独では公開と断定しない語。否定表現が無いときだけ公開の根拠にする */
const PUBLIC_NET_WORDS = ['インターネット', 'internet', 'インターネット経由'];

const PARTNER_WORDS = [
  '取引先', '協力会社', 'サプライヤ', 'サプライヤー', '代理店', '販売店',
  'パートナー企業', '加盟店', '得意先', '受発注', 'b2b', 'partner portal',
  'supplier portal', 'extranet', 'エクストラネット',
];

const INTERNAL_WORDS = [
  '社内', '社内のみ', '社内向け', '社内利用', '社員のみ', '従業員のみ', 'イントラ',
  'intranet', 'internal', 'internal only', 'employee-only', '職員向け', '全社員',
];

const SENSITIVITY_WORDS: { kind: AssetKind; words: string[] }[] = [
  {
    kind: 'personal',
    words: [
      '個人情報', '個人データ', '氏名', '住所', '電話番号', 'メールアドレス',
      '顧客情報', '従業員情報', 'マイナンバー', '履歴書', '要配慮個人情報',
      '医療', '診療', '患者', 'カルテ', '健康診断',
      'pii', 'personal data', 'personal information', 'medical', 'patient',
    ],
  },
  {
    kind: 'payment',
    words: [
      '決済', '支払', '請求', '与信', 'クレジット', 'カード番号', '口座', '送金',
      '課金', '代金', '取引金額', '売掛', '買掛',
      'payment', 'billing', 'invoice', 'credit card', 'settlement',
    ],
  },
  {
    kind: 'credential',
    words: [
      '資格情報', '認証情報', 'パスワード', 'トークン', 'api キー', 'apiキー',
      'アクセスキー', 'セッション', 'アカウント',
      'credential', 'password', 'token', 'api key', 'access key', 'session',
    ],
  },
  {
    kind: 'secret',
    words: [
      '秘密情報', '秘密鍵', '暗号鍵', '証明書', 'キーストア', '機密',
      'secret', 'private key', 'certificate', 'keystore',
    ],
  },
  {
    kind: 'design',
    words: [
      '設計情報', '設計図', '図面', 'ソースコード', '知的財産', '営業秘密',
      '製造条件', 'レシピ', '配合', '特許', '研究データ', '試験データ',
      'source code', 'blueprint', 'trade secret', 'intellectual property',
    ],
  },
  {
    kind: 'control',
    words: [
      '制御', '制御指令', '操作コマンド', '遠隔操作', '指令', 'plc', 'scada',
      'アクチュエータ', '生産ライン', 'プラント', 'ロボット', '装置制御',
      'control command', 'actuator', 'industrial control',
    ],
  },
];

const PHYSICAL_WORDS = [
  '工場', '現場', '拠点', '店舗', '設備', 'デバイス', 'センサ', 'センサー',
  'iot', '装置', '端末', 'オンサイト', '現地', '据置', '車両', 'プラント',
  /* 「保守は委託先が物理的に立ち入って行う」のように、場所の名前ではなく
     行為で書かれる場合も拾う(施錠・可搬媒体は物理境界そのものの記述) */
  '物理的', '立ち入', '入退室', '施錠', 'ラック', '可搬媒体',
  'factory', 'on-site', 'onsite', 'device', 'sensor', 'plant',
  'physical access', 'physically',
];

const MAINTENANCE_WORDS = [
  '保守', 'メンテナンス', 'ベンダー', 'ベンダ', '委託', '常駐', '点検',
  '遠隔保守', 'リモート保守', '運用委託', '協力会社',
  'maintenance', 'vendor', 'contractor', 'outsourc', 'managed service',
];

const CLOUD_WORDS = [
  'クラウド', 'saas', 'iaas', 'paas', 'aws', 'azure', 'gcp',
  'マネージドサービス', 'cloud',
];

const INTEGRATION_WORDS = [
  'api 連携', 'api連携', '外部連携', 'システム連携', '外部システム', '決済代行',
  'sso', 'シングルサインオン', 'フェデレーション', 'webhook', 'ebom', 'edi',
  'integration', 'third party', 'third-party',
];

const ACTOR_WORDS: { kind: ActorKind; words: string[] }[] = [
  {
    kind: 'external-human',
    words: [
      '取引先', '顧客', '一般利用者', '一般ユーザー', '会員', '消費者', '社外',
      'パートナー', '代理店', '応募者', '来訪者',
      'customer', 'external user', 'partner', 'consumer', 'end user',
    ],
  },
  {
    kind: 'contractor',
    words: [
      '保守ベンダー', '保守', 'ベンダー', 'ベンダ', '委託先', '協力会社', '常駐',
      '再委託', '請負', 'vendor', 'contractor', 'supplier', 'msp',
    ],
  },
  {
    kind: 'machine',
    words: [
      'システム', 'api', 'バッチ', 'ジョブ', 'デーモン', 'サービスアカウント',
      'センサ', 'センサー', 'デバイス', '機器', '装置', 'ロボット',
      'system', 'batch', 'job', 'service account', 'daemon', 'sensor', 'device',
    ],
  },
  {
    kind: 'internal-human',
    words: [
      '社員', '従業員', '職員', '営業', '管理者', '運用担当', '保全担当', '経理',
      '人事', '開発者', '情報システム',
      'employee', 'staff', 'administrator', 'operator', 'developer', 'internal',
    ],
  },
];

const SCALE_UNITS: { unit: ScaleHint['unit']; words: string[] }[] = [
  {
    unit: 'org',
    words: ['社', '拠点', '店舗', '企業', 'companies', 'partners', 'suppliers', 'tenants', 'organizations'],
  },
  { unit: 'person', words: ['人', '名', 'employees', 'people', 'staff'] },
  {
    unit: 'account',
    words: ['ユーザー', 'ユーザ', 'アカウント', '顧客', '会員', 'users', 'accounts', 'customers', 'members'],
  },
];

/* --- 読み取り本体 ------------------------------------------------- */

/** キーワードのうち実際に当たったものを返す(根拠として出力する) */
function hits(haystackLower: string, keywords: string[]): string[] {
  return keywords.filter((k) => matchesKeyword(haystackLower, k));
}

/** 「1,240 社」「社員 5 人」「10万ユーザー」のような規模の記述を拾う */
function parseScales(raw: string): ScaleHint[] {
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',');
  const found: ScaleHint[] = [];
  const seen = new Set<string>();
  for (const group of SCALE_UNITS) {
    for (const word of group.words) {
      const asciiWord = /^[a-z]+$/i.test(word);
      const pattern = `([0-9][0-9,]*)\\s*(万|千)?\\s*${word}${asciiWord ? '\\b' : ''}`;
      const re = new RegExp(pattern, 'gi');
      let m: RegExpExecArray | null = re.exec(normalized);
      while (m !== null) {
        const base = Number(m[1].replace(/,/g, ''));
        const mult = m[2] === '万' ? 10000 : m[2] === '千' ? 1000 : 1;
        if (Number.isFinite(base) && base > 0) {
          const hint: ScaleHint = { count: base * mult, unit: group.unit, raw: oneLine(m[0]) };
          const key = `${hint.unit}:${hint.count}`;
          if (!seen.has(key)) {
            seen.add(key);
            found.push(hint);
          }
        }
        m = re.exec(normalized);
      }
    }
  }
  return found;
}

/**
 * 記述・資産・主体から状況を読み取る。
 * 断定できないものは 'unknown' / false のまま返し、呼び出し側で
 * 「聞けば埋まること」として提示する。
 */
function readSituation(system: string, assets: string[], actors: string[]): Situation {
  const all = [system, ...assets, ...actors].join(' \n ');
  const h = all.toLowerCase();

  // --- 公開範囲 ---
  const netDenied = hits(h, NET_DENIAL_WORDS);
  const isolatedHits = [...hits(h, ISOLATED_WORDS), ...netDenied];
  const publicHits = [
    ...hits(h, PUBLIC_WORDS),
    ...(netDenied.length > 0 ? [] : hits(h, PUBLIC_NET_WORDS)),
  ];
  const partnerHits = hits(h, PARTNER_WORDS);
  const internalHits = hits(h, INTERNAL_WORDS);

  let exposure: Exposure = 'unknown';
  let exposureEvidence: string[] = [];
  let exposureConflict: string[] = [];
  if (isolatedHits.length > 0 && publicHits.length === 0) {
    exposure = 'isolated';
    exposureEvidence = isolatedHits;
  } else if (publicHits.length > 0) {
    // 閉域と公開が同居しているときは公開として扱う。
    // 取りこぼしより過剰配慮のほうが安い。
    exposure = 'public';
    exposureEvidence = publicHits;
    exposureConflict = isolatedHits;
  } else if (partnerHits.length > 0) {
    exposure = 'partner';
    exposureEvidence = partnerHits;
  } else if (internalHits.length > 0) {
    exposure = 'internal';
    exposureEvidence = internalHits;
  }
  // 公開かつ取引先限定の記述があるなら、根拠に両方残す
  if (exposure === 'public' && partnerHits.length > 0) {
    exposureEvidence = [...exposureEvidence, ...partnerHits];
  }

  // --- 機微性 ---
  const sensitivities: AssetKind[] = [];
  const sensitivityEvidence: string[] = [];
  for (const group of SENSITIVITY_WORDS) {
    const found = hits(h, group.words);
    if (found.length > 0) {
      sensitivities.push(group.kind);
      sensitivityEvidence.push(...found);
    }
  }

  // --- 規模 ---
  // 大きい順に並べ、先頭を見出しに使う。根拠の列も同じ順に出さないと
  // 「なぜこの数字なのか」が読み手に追えない。
  const scales = parseScales(all).sort((a, b) => b.count - a.count);
  const scale = scales[0];

  // --- 主体 ---
  const actorHaystack = (actors.length > 0 ? actors.join(' \n ') : all).toLowerCase();
  const actorKinds: ActorKind[] = [];
  const actorEvidence: string[] = [];
  for (const group of ACTOR_WORDS) {
    const found = hits(actorHaystack, group.words);
    if (found.length > 0) {
      actorKinds.push(group.kind);
      actorEvidence.push(...found);
    }
  }

  // --- 文脈 ---
  const physicalHits = hits(h, PHYSICAL_WORDS);
  const maintenanceHits = hits(h, MAINTENANCE_WORDS);
  const cloudHits = hits(h, CLOUD_WORDS);
  const integrationHits = hits(h, INTEGRATION_WORDS);

  return {
    exposure,
    exposureEvidence,
    exposureConflict,
    sensitivities,
    sensitivityEvidence,
    scale,
    scales,
    actorKinds,
    actorEvidence,
    physical: physicalHits.length > 0,
    maintenance: maintenanceHits.length > 0,
    cloud: cloudHits.length > 0,
    integration: integrationHits.length > 0,
    contextEvidence: [...physicalHits, ...maintenanceHits, ...cloudHits, ...integrationHits],
  };
}

/* --- 資産の分類 --------------------------------------------------- */

/** 分類の判定順。先に当たったものを採用する(監査ログの「操作」を制御と誤らせない) */
const ASSET_KIND_RULES: { kind: AssetKind; words: string[] }[] = [
  { kind: 'log', words: ['ログ', '監査', '証跡', '操作記録', '履歴', 'log', 'audit', 'evidence', 'trail'] },
  { kind: 'availability', words: ['可用性', 'サービスが動いて', '稼働継続', '業務継続', 'availability', 'uptime', 'service being available'] },
  { kind: 'secret', words: ['秘密情報', '秘密鍵', '暗号鍵', '証明書', '設定', '構成情報', 'secret', 'private key', 'certificate', 'configuration'] },
  { kind: 'credential', words: ['資格情報', '認証情報', 'パスワード', 'トークン', 'セッション', 'アカウント', 'credential', 'password', 'token', 'session', 'account'] },
  { kind: 'payment', words: ['決済', '支払', '請求', '与信', 'クレジット', 'カード', '口座', '送金', '課金', '代金', '売掛', 'payment', 'billing', 'invoice', 'credit'] },
  { kind: 'personal', words: ['個人情報', '個人データ', '氏名', '住所', '電話番号', 'メールアドレス', '顧客情報', '従業員情報', 'マイナンバー', '個人に関する', '患者', '診療', 'personal', 'pii', 'patient', 'individuals'] },
  { kind: 'control', words: ['制御', '指令', '操作コマンド', 'コマンド', '遠隔操作', 'plc', 'scada', 'アクチュエータ', 'control', 'command', 'actuator'] },
  { kind: 'design', words: ['設計', '図面', 'ソースコード', '知的財産', '営業秘密', '製造条件', 'レシピ', '配合', '特許', '研究', 'design', 'source code', 'blueprint', 'trade secret'] },
];

function classifyAsset(rawAsset: string): AssetKind {
  const h = oneLine(rawAsset).toLowerCase();
  for (const rule of ASSET_KIND_RULES) {
    if (rule.words.some((w) => matchesKeyword(h, w))) return rule.kind;
  }
  return 'business';
}

const ASSET_KIND_LABEL: Record<AssetKind, Bilingual> = {
  log: { ja: '証跡', en: 'Evidence' },
  secret: { ja: '鍵・設定', en: 'Keys and config' },
  credential: { ja: '資格情報', en: 'Credentials' },
  payment: { ja: '取引・決済', en: 'Transactions' },
  personal: { ja: '個人データ', en: 'Personal data' },
  control: { ja: '制御', en: 'Control' },
  design: { ja: '設計・知財', en: 'Design and IP' },
  availability: { ja: '可用性', en: 'Availability' },
  business: { ja: '業務データ', en: 'Business data' },
};

/* --- 優先度の算出 ------------------------------------------------- */

/**
 * 資産の性質 × 脅威観点の基準値(0..3)。
 * これは「一般にどちらが痛いか」の目安であって、業務の事情で必ず動く。
 * 動かす前提で、根拠を出力に開示している。
 */
const ASSET_BASE: Record<AssetKind, Record<string, number>> = {
  credential:   { spoofing: 3, tampering: 1, repudiation: 1, disclosure: 3, 'denial-of-service': 0, elevation: 2 },
  personal:     { spoofing: 1, tampering: 1, repudiation: 1, disclosure: 3, 'denial-of-service': 0, elevation: 1 },
  payment:      { spoofing: 2, tampering: 3, repudiation: 3, disclosure: 2, 'denial-of-service': 1, elevation: 1 },
  design:       { spoofing: 0, tampering: 1, repudiation: 0, disclosure: 3, 'denial-of-service': 0, elevation: 1 },
  control:      { spoofing: 3, tampering: 3, repudiation: 1, disclosure: 0, 'denial-of-service': 3, elevation: 2 },
  log:          { spoofing: 0, tampering: 3, repudiation: 3, disclosure: 1, 'denial-of-service': 0, elevation: 1 },
  secret:       { spoofing: 1, tampering: 2, repudiation: 0, disclosure: 3, 'denial-of-service': 0, elevation: 3 },
  availability: { spoofing: 0, tampering: 0, repudiation: 0, disclosure: 0, 'denial-of-service': 3, elevation: 0 },
  business:     { spoofing: 1, tampering: 1, repudiation: 1, disclosure: 1, 'denial-of-service': 1, elevation: 1 },
};

/** 公開範囲による補正 */
const EXPOSURE_DELTA: Record<Exposure, Record<string, number>> = {
  public:   { spoofing: 1, tampering: 0, repudiation: 0, disclosure: 1, 'denial-of-service': 1, elevation: 0 },
  partner:  { spoofing: 1, tampering: 0, repudiation: 1, disclosure: 1, 'denial-of-service': 0, elevation: 0 },
  internal: { spoofing: 0, tampering: 0, repudiation: 1, disclosure: 0, 'denial-of-service': -1, elevation: 1 },
  isolated: { spoofing: -1, tampering: 0, repudiation: 0, disclosure: -1, 'denial-of-service': -1, elevation: 0 },
  unknown:  { spoofing: 0, tampering: 0, repudiation: 0, disclosure: 0, 'denial-of-service': 0, elevation: 0 },
};

/** 優先度の上限。基準値 0..3 に状況補正を足して 0..4 に収める */
const MAX_SCORE = 4;

interface CellScore {
  score: number;
  /** 資産そのものではなく状況(公開範囲・規模・物理)で一段上がったか */
  bumped: boolean;
}

function scoreCell(kind: AssetKind, lensId: string, sit: Situation): CellScore {
  const base = ASSET_BASE[kind][lensId] ?? 1;
  let delta = EXPOSURE_DELTA[sit.exposure][lensId] ?? 0;
  // 閉域でも、止まると物が止まる資産のサービス妨害は下げない。
  // 隔離されていることは「壊れない」ことを意味しない。
  if (delta < 0 && lensId === 'denial-of-service' && (kind === 'control' || kind === 'availability')) {
    delta = 0;
  }
  if (sit.physical && (lensId === 'tampering' || lensId === 'elevation')) delta += 1;
  if (sit.maintenance && (lensId === 'repudiation' || lensId === 'elevation')) delta += 1;
  if (sit.integration && lensId === 'denial-of-service') delta += 1;
  const big = sit.scale !== undefined && sit.scale.count >= 100;
  const small = sit.scale !== undefined && sit.scale.unit === 'person' && sit.scale.count <= 20;
  if (big && (lensId === 'spoofing' || lensId === 'disclosure')) delta += 1;
  if (small && lensId === 'repudiation') delta += 1;
  const clampedBase = Math.max(0, Math.min(MAX_SCORE, base));
  const score = Math.max(0, Math.min(MAX_SCORE, base + delta));
  // `*` は表示上のラベルが上がったときだけ付ける。
  // 0 → 1 はどちらも「低」なので、点だけ動いても印は付けない。
  return { score, bumped: delta > 0 && priorityBand(score) > priorityBand(clampedBase) };
}

/** 表示ラベルの段(低=0 / 中=1 / 高=2 / 最優先=3) */
function priorityBand(score: number): number {
  if (score >= 4) return 3;
  if (score === 3) return 2;
  if (score === 2) return 1;
  return 0;
}

/**
 * どの補正が効いたかを 1 行で開示する。
 * 「なぜこの優先度なのか」が説明できないと、利用者は表を信用しないし直せない。
 */
function describeAdjustments(sit: Situation, lang: Lang): string {
  const parts: string[] = [];
  if (sit.exposure === 'public') {
    parts.push(label('社外公開 → なりすまし・情報漏えい・サービス妨害を +1', 'public exposure → +1 to spoofing, disclosure, denial of service', lang));
  } else if (sit.exposure === 'partner') {
    parts.push(label('取引先限定 → なりすまし・否認・情報漏えいを +1', 'partner-restricted → +1 to spoofing, repudiation, disclosure', lang));
  } else if (sit.exposure === 'internal') {
    parts.push(label('社内のみ → 否認・権限昇格を +1、サービス妨害を -1', 'internal only → +1 to repudiation and elevation, -1 to denial of service', lang));
  } else if (sit.exposure === 'isolated') {
    parts.push(
      label(
        '閉域 → なりすまし・情報漏えい・サービス妨害を -1(ただし制御・可用性の資産はサービス妨害を下げない。隔離は「壊れない」ことを意味しないため)',
        'isolated → -1 to spoofing, disclosure, and denial of service — except that control and availability assets keep their denial-of-service level, since isolation does not mean it cannot break',
        lang,
      ),
    );
  }
  if (sit.physical) {
    parts.push(label('物理的に触れる機器あり → 改ざん・権限昇格を +1', 'touchable hardware → +1 to tampering and elevation', lang));
  }
  if (sit.maintenance) {
    parts.push(label('保守・委託の経路あり → 否認・権限昇格を +1', 'maintenance or outsourcing path → +1 to repudiation and elevation', lang));
  }
  if (sit.integration) {
    parts.push(label('外部連携あり → サービス妨害を +1', 'external integration → +1 to denial of service', lang));
  }
  if (sit.scale !== undefined && sit.scale.count >= 100) {
    parts.push(
      label(
        `規模 ${sit.scale.count.toLocaleString('en-US')} → なりすまし・情報漏えいを +1(波及範囲が広い)`,
        `scale ${sit.scale.count.toLocaleString('en-US')} → +1 to spoofing and disclosure (wide blast radius)`,
        lang,
      ),
    );
  }
  if (sit.scale !== undefined && sit.scale.unit === 'person' && sit.scale.count <= 20) {
    parts.push(
      label(
        `少人数運用 (${sit.scale.count}) → 否認を +1(共有アカウントになりやすい)`,
        `small team (${sit.scale.count}) → +1 to repudiation (shared accounts are likely)`,
        lang,
      ),
    );
  }
  if (parts.length === 0) {
    return label(
      '補正なし(状況が読み取れなかったため基準値のまま。公開範囲と規模を書き足すと動きます)',
      'none — the situation could not be read, so the baselines stand. Add exposure and scale and they will move',
      lang,
    );
  }
  return parts.join(' / ');
}

function priorityLabel(score: number, lang: Lang): string {
  if (score >= 4) return label('最優先', 'Top', lang);
  if (score === 3) return label('高', 'High', lang);
  if (score === 2) return label('中', 'Med', lang);
  return label('低', 'Low', lang);
}

/** 表のセルに入れる短い「何を書くべきか」 */
const CELL_HINTS: Record<string, { byKind: Partial<Record<AssetKind, Bilingual>>; fallback: Bilingual }> = {
  spoofing: {
    byKind: {
      credential: { ja: '多要素の適用範囲', en: 'MFA coverage' },
      payment: { ja: '取引時の本人確認', en: 'Identity at transaction' },
      control: { ja: '指令元の機器認証', en: 'Authenticate the commander' },
      secret: { ja: '鍵の持ち主の特定', en: 'Who holds the key' },
      log: { ja: '書き込み元の認証', en: 'Authenticate the writer' },
    },
    fallback: { ja: '主体ごとの認証方式', en: 'Auth method per subject' },
  },
  tampering: {
    byKind: {
      log: { ja: '追記のみ・分離保管', en: 'Append-only, stored apart' },
      payment: { ja: '金額と宛先の完全性', en: 'Integrity of amount and payee' },
      control: { ja: '指令の署名と値域検査', en: 'Signed commands, range checks' },
      secret: { ja: '配布経路の保護', en: 'Protect the delivery path' },
      personal: { ja: '訂正履歴の保持', en: 'Keep the correction history' },
    },
    fallback: { ja: '書き込み権限の棚卸し', en: 'Inventory who can write' },
  },
  repudiation: {
    byKind: {
      payment: { ja: '取引証跡の保持年数', en: 'Retention years for trade records' },
      control: { ja: '操作者の一意特定', en: 'Identify the operator uniquely' },
      log: { ja: '削除権限の分離', en: 'Separate the delete right' },
      credential: { ja: '共有アカウントの廃止', en: 'Remove shared accounts' },
    },
    fallback: { ja: '誰がやったかの再現', en: 'Reconstruct who did it' },
  },
  disclosure: {
    byKind: {
      personal: { ja: '写しの所在の洗い出し', en: 'Find every copy' },
      credential: { ja: '保存形式とログ混入', en: 'Storage form, leakage into logs' },
      payment: { ja: 'マスキングの範囲', en: 'Masking scope' },
      design: { ja: '持ち出し経路の制限', en: 'Restrict exfiltration paths' },
      secret: { ja: '閲覧者の記録', en: 'Record who read it' },
    },
    fallback: { ja: '閲覧権限の最小化', en: 'Minimize who can read' },
  },
  'denial-of-service': {
    byKind: {
      availability: { ja: '縮退運転の設計', en: 'Design the degraded mode' },
      control: { ja: '停止時の安全側動作', en: 'Fail-safe on stop' },
      payment: { ja: '連携先遅延への耐性', en: 'Tolerate a slow partner' },
    },
    fallback: { ja: '占有できる箇所の特定', en: 'Find what can be monopolized' },
  },
  elevation: {
    byKind: {
      credential: { ja: '特権資格情報の分離', en: 'Separate privileged credentials' },
      control: { ja: '保守権限の期限付与', en: 'Time-bound maintenance rights' },
      secret: { ja: '鍵の到達範囲', en: 'How far the key reaches' },
      personal: { ja: '横断参照の可否', en: 'Can one account see all' },
    },
    fallback: { ja: '横展開の停止点', en: 'Where lateral movement stops' },
  },
};

function cellHint(kind: AssetKind, lensId: string, lang: Lang): string {
  const set = CELL_HINTS[lensId];
  if (!set) return '';
  const value = set.byKind[kind] ?? set.fallback;
  return compact(value, lang);
}

/* --- 状況の表示 --------------------------------------------------- */

const EXPOSURE_LABEL: Record<Exposure, Bilingual> = {
  public: { ja: '社外公開(未認証の面がある)', en: 'Public (an unauthenticated surface exists)' },
  partner: { ja: '取引先限定', en: 'Partner-restricted' },
  internal: { ja: '社内のみ', en: 'Internal only' },
  isolated: { ja: '閉域・外部接続なし', en: 'Isolated, no external connection' },
  unknown: { ja: '読み取れず', en: 'Could not determine' },
};

const ACTOR_KIND_LABEL: Record<ActorKind, Bilingual> = {
  'external-human': { ja: '社外の人間', en: 'People outside the company' },
  'internal-human': { ja: '社内の人間', en: 'People inside the company' },
  machine: { ja: '機械(システム・機器・バッチ)', en: 'Machines: systems, devices, batch jobs' },
  contractor: { ja: '委託先・保守ベンダー', en: 'Contractors and maintenance vendors' },
};

function scaleText(scale: ScaleHint, lang: Lang): string {
  const n = scale.count.toLocaleString('en-US');
  if (scale.unit === 'org') return label(`${n} 社`, `${n} organizations`, lang);
  if (scale.unit === 'person') return label(`${n} 人`, `${n} people`, lang);
  return label(`${n} アカウント`, `${n} accounts`, lang);
}

/** 読み取り結果の表。根拠と確度を必ず並べる */
function situationTable(sit: Situation, lang: Lang): string[] {
  const out: string[] = [];
  const stated = label('記述あり', 'stated', lang);
  const none = label('記述なし', 'not stated', lang);
  const dash = '—';

  out.push(
    `| ${label('見たもの', 'What was read', lang)} | ${label('読み取り', 'Reading', lang)} | ${label('根拠にした語', 'Words it matched', lang)} | ${label('確度', 'Confidence', lang)} |`,
  );
  out.push('| --- | --- | --- | --- |');
  out.push(
    `| ${label('公開範囲', 'Exposure', lang)} | ${compact(EXPOSURE_LABEL[sit.exposure], lang)} | ${sit.exposureEvidence.length > 0 ? sit.exposureEvidence.slice(0, 4).map(cell).join(', ') : dash} | ${sit.exposure === 'unknown' ? label('不明', 'unknown', lang) : stated} |`,
  );
  out.push(
    `| ${label('データの機微性', 'Sensitivity', lang)} | ${sit.sensitivities.length > 0 ? sit.sensitivities.map((k) => compact(ASSET_KIND_LABEL[k], lang)).join(' / ') : label('読み取れず', 'not determined', lang)} | ${sit.sensitivityEvidence.length > 0 ? sit.sensitivityEvidence.slice(0, 5).map(cell).join(', ') : dash} | ${sit.sensitivities.length > 0 ? stated : label('不明', 'unknown', lang)} |`,
  );
  const scaleConfidence = sit.scale
    ? sit.scales.length > 1
      ? label(
          `記述あり(${sit.scales.length} 通り見つかったため最大を採用)`,
          `stated (${sit.scales.length} figures found; the largest was used)`,
          lang,
        )
      : stated
    : label('不明', 'unknown', lang);
  out.push(
    `| ${label('規模', 'Scale', lang)} | ${sit.scale ? scaleText(sit.scale, lang) : label('読み取れず', 'not determined', lang)} | ${sit.scales.length > 0 ? sit.scales.slice(0, 4).map((s) => cell(s.raw)).join(', ') : dash} | ${scaleConfidence} |`,
  );
  out.push(
    `| ${label('主体の種類', 'Subject types', lang)} | ${sit.actorKinds.length > 0 ? sit.actorKinds.map((k) => compact(ACTOR_KIND_LABEL[k], lang)).join(' / ') : label('読み取れず', 'not determined', lang)} | ${sit.actorEvidence.length > 0 ? sit.actorEvidence.slice(0, 5).map(cell).join(', ') : dash} | ${sit.actorKinds.length > 0 ? stated : label('不明', 'unknown', lang)} |`,
  );
  const ctx: string[] = [];
  if (sit.physical) ctx.push(label('物理的に触れる機器・現場あり', 'physical devices or sites', lang));
  if (sit.maintenance) ctx.push(label('保守・委託の経路あり', 'maintenance or outsourcing path', lang));
  if (sit.cloud) ctx.push(label('クラウド利用', 'cloud in use', lang));
  if (sit.integration) ctx.push(label('外部システム連携あり', 'external integration', lang));
  out.push(
    `| ${label('経路・環境', 'Paths and environment', lang)} | ${ctx.length > 0 ? ctx.join(' / ') : label('読み取れず', 'not determined', lang)} | ${sit.contextEvidence.length > 0 ? sit.contextEvidence.slice(0, 5).map(cell).join(', ') : dash} | ${ctx.length > 0 ? stated : none} |`,
  );
  return out;
}

/** 読み取れなかったもの。「何を書けば埋まるか」まで書く */
function situationUnknowns(sit: Situation, lang: Lang): Bilingual[] {
  const gaps: Bilingual[] = [];
  if (sit.exposure === 'unknown') {
    gaps.push({
      ja: '**公開範囲**が読み取れませんでした。「未認証で誰が到達できるか」を一文足してください(例: 「社外の取引先がインターネット経由で使う」/「閉域網で社内のみ」)。ここが決まると 6 観点の優先順位がすべて動きます。',
      en: '**Exposure** could not be read. Add one sentence about who can reach it without authenticating — "partners over the internet", "isolated network, internal only". This one fact reorders all six lenses.',
    });
  }
  if (sit.sensitivities.length === 0) {
    gaps.push({
      ja: '**扱うデータの機微性**が読み取れませんでした。個人情報・決済・認証情報・設計情報のどれが入るかを書いてください。どれも入らないなら、それ自体が「情報漏えい」の優先度を下げる根拠になります。',
      en: '**Data sensitivity** could not be read. Say whether personal data, payments, credentials, or design information are involved. If none are, that in itself justifies lowering the disclosure lens.',
    });
  }
  if (sit.scale === undefined) {
    gaps.push({
      ja: '**利用者規模**が読み取れませんでした。「取引先 1,240 社」「社員 5 人」のように数を書いてください。規模はなりすましの波及範囲と、共有アカウントの起きやすさの両方を変えます。',
      en: '**User scale** could not be read. Give a number — "1,240 partner companies", "5 employees". Scale changes both the blast radius of account takeover and how likely shared accounts are.',
    });
  }
  if (sit.actorKinds.length === 0) {
    gaps.push({
      ja: '**主体の種類**が読み取れませんでした。`actors` に「社外の人間 / 社内の人間 / 機械 / 委託先」のどれが登場するかを入れてください。',
      en: '**Subject types** could not be read. Put into `actors` which of these appear: people outside, people inside, machines, contractors.',
    });
  }
  if (!sit.maintenance && sit.physical) {
    gaps.push({
      ja: '機器・現場の記述はありますが、**保守を誰がやるか**が書かれていません。保守経路は閉域環境で最大の侵入経路になるため、自社保守か委託かを明記してください。',
      en: 'Devices or sites are described, but **who maintains them** is not. The maintenance path is the largest way into an isolated environment; state whether it is in-house or outsourced.',
    });
  }
  /* 0 章の表が「経路・環境: 読み取れず」を出しているのに、ここで何も言わないと
     「埋められなかったこと」の節が表と食い違って見える */
  if (!sit.physical && !sit.maintenance && !sit.cloud && !sit.integration) {
    gaps.push({
      ja: '**外部との経路・稼働環境**が読み取れませんでした。クラウドか自社設備か、外部システムとの連携があるか、保守ベンダーが立ち入るかを一文足してください。ここは「権限昇格」と「否認」の優先度、および委託先まわりの要件が要るかどうかを決めます。',
      en: '**External paths and the operating environment** could not be read. Add a sentence on whether it runs in cloud or on your own hardware, whether it integrates with outside systems, and whether a maintenance vendor comes on site. This decides the priority of privilege escalation and repudiation, and whether third-party requirements apply at all.',
    });
  }
  return gaps;
}

/* --- 観点ごとの、この状況での助言 ---------------------------------- */

/**
 * 6 観点それぞれについて、読み取った状況で実際に起きやすいことを書く。
 * 条件に当たらなければ何も足さない(当たり障りのない一般論で埋めない)。
 */
function lensAdvice(
  lensId: string,
  sit: Situation,
  kinds: Set<AssetKind>,
  lang: Lang,
): Bilingual[] {
  const advice: Bilingual[] = [];
  const outward = sit.exposure === 'public' || sit.exposure === 'partner';
  const big = sit.scale !== undefined && sit.scale.count >= 100;
  const small = sit.scale !== undefined && sit.scale.unit === 'person' && sit.scale.count <= 20;
  const scaleWord = sit.scale ? scaleText(sit.scale, lang) : '';

  if (lensId === 'spoofing') {
    if (outward && big) {
      advice.push({
        ja: `${scaleWord}が同じ入口を共有します。1 アカウントの乗っ取りは相手 1 社の事故で終わらず、こちら側の取引データ全体に届きます。決めるべきは 2 点だけです。(1) 多要素認証を全社に強制できるか、免除される相手が出るならその条件は何か。(2) 相手側の退職者・異動者のアカウントが止まったことを、こちらから確認できるか。契約で縛るのか運用で確認するのかを先に決めてください。`,
        en: `${scaleWord} share one entrance. A single account takeover does not stop at that one partner — it reaches your whole transaction set. Only two things need deciding: (1) can multi-factor authentication be made mandatory for all of them, and if some are exempt, on what condition; (2) can you verify from your side that a leaver's account on their side was actually disabled. Settle whether each is held by contract or by operational check.`,
      });
    } else if (sit.exposure === 'public') {
      advice.push({
        ja: '未認証で到達できる面があります。まず「ログイン前に触れる機能」を全部並べてください。登録・パスワード再設定・問い合わせ・資料請求のような、認証の外にある機能が、アカウント列挙と総当りの入口になります。',
        en: 'There is a surface reachable without authenticating. List every function usable before login first — signup, password reset, contact forms, document requests. Functions living outside authentication are where enumeration and brute force get in.',
      });
    }
    if (sit.exposure === 'isolated') {
      advice.push({
        ja: '閉域なので、外部から直接なりすます経路は考えにくく、この観点の優先度は下がります。**実質的な認証境界は、保守作業者が持ち込む端末と、そこで使われる共通アカウントです。** 誰がいつその資格情報を使ったかを個人まで特定できるかを確認してください。ここが特定できないなら、閉域であること自体が統制ではなく前提の言い訳になっています。',
        en: 'Being isolated makes direct external impersonation unlikely, so this lens drops in priority. **The real authentication boundary is the laptop a maintenance engineer carries in and the shared account used on it.** Check whether you can name the individual who used that credential and when. If you cannot, isolation has become an excuse rather than a control.',
      });
    }
    if (sit.exposure === 'internal') {
      advice.push({
        ja: '社内限定でも、認証の穴は退職者・異動者のアカウントに出ます。人事の異動情報から権限停止までが自動か手動かを確認してください。手動なら、月次の棚卸しでは遅い箇所がどこかを決めてください。',
        en: 'Internal-only systems still fail at leaver and mover accounts. Check whether the path from an HR change to a disabled account is automated or manual. If manual, decide where a monthly review is too slow.',
      });
    }
    if (kinds.has('control')) {
      advice.push({
        ja: '制御の指令を受ける側は、送信元が本物かを機器側で確かめられなければなりません。ネットワークに入れたことを認証の代わりにしていないかを確認してください。',
        en: 'Whatever receives a control command must be able to verify the sender itself. Check that being on the network is not standing in for authentication.',
      });
    }
    if (sit.actorKinds.includes('machine') || sit.integration) {
      advice.push({
        ja: '機械の主体(API 連携・バッチ・機器)が登場します。固定の共有シークレットを長期間使い回していないか、ローテーションの周期と担当が決まっているかを確認してください。人間の認証だけ整えて機械が置き去りになるのが定番の抜けです。',
        en: 'Machine subjects are present — integrations, batch jobs, devices. Check for long-lived shared secrets and whether rotation has a cadence and an owner. Tightening human authentication while leaving machines behind is the standard gap.',
      });
    }
    return advice;
  }

  if (lensId === 'tampering') {
    if (kinds.has('control')) {
      advice.push({
        ja: '**制御指令が資産に入っている以上、改ざんは情報の問題ではなく物理の問題です。** 指令の発行元を機器側で検証しているか、想定外の値を機器側で拒否するかを確認してください。送信側だけの検証は、送信側が乗っ取られた時点で効きません。',
        en: '**With control commands in the asset list, tampering stops being an information problem and becomes a physical one.** Check that the device verifies the origin of a command and rejects out-of-range values on its own. Validation only on the sending side stops working the moment the sender is taken over.',
      });
    }
    if (kinds.has('payment')) {
      advice.push({
        ja: '金額と振込先が改ざんの標的です。入力から確定までの間に値が変わり得る箇所をすべて挙げ、確定時点の値を後から再現できるようにしてください。',
        en: 'Amounts and payees are the tampering targets. Enumerate every point where a value can change between entry and commitment, and make the committed value reproducible afterwards.',
      });
    }
    if (kinds.has('log')) {
      advice.push({
        ja: '証跡そのものが資産に入っています。運用担当が単独で消せる場所に置いていないかを最初に確認してください。ここが崩れると、他の 5 観点の調査がすべて成立しなくなります。',
        en: 'Evidence is itself in the asset list. Check first that it does not sit where an operator can delete it alone. If this collapses, investigation under the other five lenses collapses with it.',
      });
    }
    if (sit.physical) {
      advice.push({
        ja: '機器に物理的に触れられる場所があります。筐体・保守ポート・可搬媒体からの書き換えを、ネットワーク経由の改ざんと同じ重さで扱ってください。閉域環境では、むしろこちらが主経路です。',
        en: 'There are places where the hardware can be touched. Treat modification via the enclosure, a maintenance port, or removable media as seriously as network tampering. In an isolated environment it is the main path, not the exception.',
      });
    }
    if (sit.cloud) {
      advice.push({
        ja: 'クラウドを使っています。改ざんの対象はデータだけでなく**構成そのもの**です。誰がコンソールと構成コードを変更でき、その変更が記録として残るかを確認してください。',
        en: 'Cloud is in play, so **the configuration itself** is a tampering target alongside the data. Check who can change the console and the infrastructure code, and whether those changes leave a record.',
      });
    }
    if (advice.length === 0) {
      advice.push({
        ja: 'この資産を書き換えられる主体を全部挙げられるかから始めてください。挙げきれないなら、そのこと自体が最初の指摘です。',
        en: 'Start by asking whether you can enumerate every subject able to modify this asset. If you cannot, that is the first finding.',
      });
    }
    return advice;
  }

  if (lensId === 'repudiation') {
    if (small) {
      advice.push({
        ja: `${scaleWord}という少人数の運用です。少人数だと共有アカウントと「言えば分かる」運用に流れます。それ自体は効率的ですが、事故のあとに「自分ではない」が成立してしまうと、原因究明も再発防止も止まります。${scaleWord}でも個人まで特定できる状態を作れているかを確認してください。`,
        en: `Operations run with ${scaleWord}. Small teams drift toward shared accounts and informal coordination. That is efficient — until an incident, when "it was not me" becomes unfalsifiable and both root-cause analysis and prevention stall. Check that even ${scaleWord} can be told apart in the record.`,
      });
    }
    if (kinds.has('payment')) {
      advice.push({
        ja: '取引の否認は法的な争いになります。誰が・いつ・何を確定させたかを、相手方にも示せる形で残す必要があります。保持年数を先に決めてください(業務側と法務が決める話であって、ログの容量で決める話ではありません)。',
        en: 'Repudiated transactions become legal disputes. You need a record of who committed what and when, in a form you can show the counterparty. Decide the retention period first — that is a business and legal decision, not a log-storage one.',
      });
    }
    if (sit.exposure === 'partner' || sit.exposure === 'public') {
      advice.push({
        ja: '相手方が社外です。争いになったとき、証拠になるのはこちら側の記録だけです。相手が「そんな操作はしていない」と言ったときに何を出すのかを、いま決めてください。',
        en: 'The counterparty is outside your organization. In a dispute, your records are the only evidence there is. Decide now what you would produce when they say the action never happened.',
      });
    }
    if (sit.maintenance) {
      advice.push({
        ja: '保守作業の記録が「作業報告書」しか無い状態になりがちです。報告書は作業者が書くものなので、証拠としては弱い。機器・システム側にも残る形にしてください。',
        en: 'Maintenance work often has nothing but a written service report behind it — and the engineer writes that report, which makes it weak evidence. Ensure the device or system records the work as well.',
      });
    }
    if (advice.length === 0) {
      advice.push({
        ja: '共有アカウントと共通の踏み台の有無から確認してください。この 2 つが無ければ、否認の議論はほぼ片付きます。',
        en: 'Start with whether shared accounts and a common jump host exist. Without those two, most of this lens resolves itself.',
      });
    }
    return advice;
  }

  if (lensId === 'disclosure') {
    if (kinds.has('personal') || sit.sensitivities.includes('personal')) {
      advice.push({
        ja: '個人に関するデータがあります。漏れるのは本体より**写し**です。検証環境・バックアップ・分析基盤・ログ・障害調査用のダンプ、この 5 か所を先に洗い出してください。本番の権限だけ厳しくして写しが野放し、が最も多い形です。',
        en: 'Personal data is present, and it is the **copies** that leak, not the original. Enumerate five places first: test environments, backups, analytics stores, logs, and troubleshooting dumps. Hardening production access while the copies run free is the most common shape of this failure.',
      });
    }
    if (sit.exposure === 'public' && (sit.sensitivities.includes('personal') || sit.sensitivities.includes('payment'))) {
      advice.push({
        ja: '**社外公開 × 機微なデータ**の組み合わせです。事故が起きた場合、外部への報告義務が生じ得ます。報告の時限から逆算した社内の判断経路(誰が「公表する」と言えるのか)を、稼働前に決めてください。事故当日に決めることではありません。',
        en: '**Public exposure combined with sensitive data.** An incident here may trigger an external reporting duty. Before go-live, work backwards from the reporting deadline to an internal decision path — who is allowed to say "we disclose". That is not a decision to make on the day.',
      });
    }
    if (kinds.has('credential') || kinds.has('secret')) {
      advice.push({
        ja: '資格情報・鍵が資産に入っています。この種の漏えいは、外部からの侵入より**自分たちのログとエラー出力**から起きます。認証ヘッダ・トークン・接続文字列が、ログ・障害調査用のダンプ・監視ツールの画面に出ていないかを、実物を見て確認してください。',
        en: 'Credentials and keys are in the asset list. This kind of leak comes less from intrusion than from **your own logs and error output**. Look at the real thing and check whether auth headers, tokens, and connection strings appear in logs, troubleshooting dumps, or a monitoring console.',
      });
    }
    if (kinds.has('payment')) {
      advice.push({
        ja: '取引データは、閲覧より**エクスポート**から漏れます。CSV 出力・帳票・分析用の抽出を誰が実行できるか、その実行が記録されるかを確認してください。',
        en: 'Transaction data leaks through **exports** more than through screens. Check who can run CSV extracts, report generation, and analytics pulls, and whether those runs are recorded.',
      });
    }
    if (kinds.has('design') || sit.sensitivities.includes('design')) {
      advice.push({
        ja: '設計・製造に関する情報は、漏えいしても気づけないのが特徴です(コピーされても元は残る)。持ち出し経路ごと — 可搬媒体・個人端末・メール・印刷・撮影 — に、検知できるか止められるかを表にしてください。',
        en: 'Design and manufacturing information leaks without leaving a trace: copying it leaves the original in place. Tabulate each exfiltration path — removable media, personal devices, email, printing, photography — against whether you can detect it or block it.',
      });
    }
    if (sit.exposure === 'isolated') {
      advice.push({
        ja: '閉域なので外部流出の経路は限られ、この観点の優先度は下がります。実際の漏えい経路は、持ち出し用の可搬媒体と、**保守ベンダーが採取して持ち帰るデータ(ログ・ダンプ・設定)**です。何を持ち帰らせてよいかを契約と作業手順の両方で決めてください。',
        en: 'Isolation limits the outbound paths, so this lens drops in priority. The real leakage routes are removable media and **the data a maintenance vendor collects and takes away** — logs, dumps, configuration. Decide what may leave, in both the contract and the work procedure.',
      });
    }
    if (big) {
      advice.push({
        ja: `利用者が ${scaleWord}規模です。1 件ずつの閲覧より、**一括での取得**が事故の形になります。大量読み出しを検知する仕組みと、その通知先を決めてください。`,
        en: `With ${scaleWord} in scope, the incident shape is **bulk retrieval**, not one-record-at-a-time viewing. Decide how bulk reads are detected and who is notified.`,
      });
    }
    if (advice.length === 0) {
      advice.push({
        ja: 'まず「この資産の写しがどこにあるか」を全部書き出してください。写しの一覧が作れないうちは、閲覧権限をいくら絞っても効きません。',
        en: 'Write down every place a copy of this asset lives. Until that list exists, tightening read permissions accomplishes little.',
      });
    }
    return advice;
  }

  if (lensId === 'denial-of-service') {
    if (kinds.has('control') || sit.physical) {
      advice.push({
        ja: '**止まると物が止まります。** 可用性の数値目標を議論する前に、停止したときに安全側へ倒れるか(フェイルセーフ)を確認してください。設備が「最後の指令を保持したまま動き続ける」設計になっていないかは、セキュリティではなく安全の問題として扱う必要があります。',
        en: '**When this stops, physical things stop.** Before arguing about availability targets, check that a stoppage fails safe. Whether equipment keeps running on its last command is a safety question, not only a security one.',
      });
    }
    if (sit.exposure === 'public') {
      advice.push({
        ja: '社外公開なので、外部からの負荷は事故ではなく前提です。1 利用者・1 社が資源を占有できる箇所を特定し、流量制限の単位を全体ではなく**テナント単位**にしてください。全体の上限だけだと、1 社の暴走で全社が止まります。',
        en: 'Being public, external load is a premise rather than an incident. Find where a single consumer can monopolize a resource and set rate limits **per tenant**, not only globally. A global-only limit means one runaway partner stops everyone.',
      });
    }
    if (sit.exposure === 'isolated') {
      advice.push({
        ja: '外部からの負荷は考えにくく、この観点の優先度は下がります。実際の停止要因は、保守作業そのもの・機器故障・電源・部品の入手性です。演習の対象を「攻撃を受けたとき」ではなく「壊れたとき・保守が来られないとき」に寄せてください。',
        en: 'External load is unlikely, so this lens drops in priority. The real causes of stoppage are the maintenance work itself, hardware failure, power, and spare-part availability. Point your rehearsals at "it broke" and "the engineer cannot come", not at "we were attacked".',
      });
    }
    if (sit.integration) {
      advice.push({
        ja: '外部サービスに依存しています。その相手が止まったときの縮退運転が設計されているかを確認してください。「連携先が落ちたら止まる」は設計ですが、書いていなければ事故です。',
        en: 'There is a dependency on an external service. Check that a degraded mode exists for when it goes down. "We stop when the partner stops" is a design decision — but only if it is written down; otherwise it is an incident.',
      });
    }
    if (advice.length === 0) {
      advice.push({
        ja: 'この資産が使えないと、どの業務がいつ止まるかを業務側の言葉で書いてください。技術的な稼働率より、この一文のほうが後の判断に効きます。',
        en: 'Write, in business terms, which process stops and how soon when this asset is unavailable. That one sentence drives later decisions more than an uptime percentage does.',
      });
    }
    return advice;
  }

  // elevation
  if (sit.maintenance || sit.actorKinds.includes('contractor')) {
    advice.push({
      ja: '保守・委託の経路があります。**保守権限が常時有効になっていないか**を確認してください。作業のたびに期限付きで付与し、期限が来たら自動で外れる形にできるかが分かれ目です。「毎回申請は現実的でない」と言われたら、それは運用の話なので、申請を軽くする方向で解いてください(権限を常時付けたままにする方向ではなく)。',
      en: 'A maintenance or outsourcing path exists. Check **whether those privileges are permanently live**. The dividing line is whether access can be granted per job with an expiry that removes it automatically. If you hear "requesting every time is unrealistic", that is an operations problem — solve it by making requests cheap, not by leaving the privilege on.',
    });
  }
  if (sit.exposure === 'public' || sit.exposure === 'partner') {
    advice.push({
      ja: '**テナント間の越境がこの状況で最大の権限昇格です。** 他社のデータに、識別子を書き換えるだけで到達できないか。これは設計段階でテストケースにしておかないと、稼働後の指摘では直せません。',
      en: '**Crossing between tenants is the biggest elevation risk in this situation.** Can another organization\'s data be reached by editing an identifier? Turn it into a test case during design; found after go-live, it cannot be designed away.',
    });
  }
  if (kinds.has('credential') || kinds.has('secret')) {
    advice.push({
      ja: '一つの鍵・資格情報からどこまで到達できるかを図にしてください。到達範囲が広い鍵ほど、保管を厳重にするより**到達範囲そのものを狭める**ほうが効きます。',
      en: 'Diagram how far one key or credential reaches. The wider the reach, the more you gain from **narrowing the reach itself** rather than guarding the storage harder.',
    });
  }
  if (sit.cloud) {
    advice.push({
      ja: 'クラウドの権限は、付けた本人も範囲を説明できないことが多い。実際に使われた権限だけに絞れるかを確認してください。',
      en: 'Cloud permissions are routinely wider than the person who granted them can explain. Check whether they can be narrowed to what was actually used.',
    });
  }
  if (advice.length === 0) {
    advice.push({
      ja: '横展開を止める境界を一つ決めてください。「侵入されない」ではなく「侵入されてもここから先へは行けない」を設計の目標にします。',
      en: 'Pick one boundary that stops lateral movement. Make the design goal "they cannot get past here", not "they cannot get in".',
    });
  }
  return advice;
}

/* --- セキュリティ要件の着手順 -------------------------------------- */

type ReqRank = 'now' | 'soon' | 'later';

function rankLabel(rank: ReqRank, lang: Lang): string {
  if (rank === 'now') return label('先', 'Now', lang);
  if (rank === 'soon') return label('次', 'Design', lang);
  return label('後', 'Pre-GA', lang);
}

/**
 * 「先」に入った項目どうしの並べ替えに使う、後から変えられなさの度合い(0..3)。
 *
 * 状況によっては「先」が一覧のほとんどを占める。そのとき全部を横並びで出すと
 * 優先順位を付けていないのと同じなので、**稼働後に retrofit できない順**という
 * 一本の軸で並べ、上位だけを「今週の対象」として切り出す。
 * 軸の値は開示する(利用者が別の軸を選べるように)。
 */
function retrofitCost(id: string): number {
  switch (id) {
    /* 設計そのもの・契約文言。稼働後に変えるには作り直しか再締結が要る */
    case 'sec-req-authn':
    case 'sec-req-authz':
    case 'sec-req-logging':
    case 'sec-req-third-party':
    case 'sec-req-flowdown':
      return 3;
    /* 構造は変えられるが、移行・回収・証跡の連続性で高くつく */
    case 'sec-req-privileged':
    case 'sec-req-secrets':
    case 'sec-req-rest':
    case 'sec-req-log-protection':
    case 'sec-req-availability':
    case 'sec-req-residency':
    case 'sec-req-retention':
    case 'sec-req-audit-trail':
    case 'sec-req-traceability':
      return 2;
    /* あとからでも足せる(足す作業自体は残る) */
    default:
      return 1;
  }
}

/**
 * 要件ごとに、この範囲でいつ着手すべきかと、その理由を返す。
 * 理由は「この記述のここが根拠」と言える形にする。理由が書けないものは
 * 既定の順位のままにして、reason を付けない(もっともらしい理由を作らない)。
 */
function requirementPriority(
  id: string,
  sit: Situation,
  lang: Lang,
): { rank: ReqRank; reason?: Bilingual } {
  const outward = sit.exposure === 'public' || sit.exposure === 'partner';
  const big = sit.scale !== undefined && sit.scale.count >= 100;
  const sensitive =
    sit.sensitivities.includes('personal') ||
    sit.sensitivities.includes('payment') ||
    sit.sensitivities.includes('design');
  const scaleWord = sit.scale ? scaleText(sit.scale, lang) : '';

  switch (id) {
    case 'sec-req-authn':
      if (outward && big) {
        return {
          rank: 'now',
          reason: {
            ja: `${scaleWord}が外から入ってきます。認証方式は後から変えられない箇所なので、主体の種類ごとの方式(取引先の人・当社の人・連携システム・バッチ)を最初に決めきってください。`,
            en: `${scaleWord} come in from outside. Authentication is the hardest thing to change later, so settle the method per subject type — partner staff, your staff, connected systems, batch jobs — first.`,
          },
        };
      }
      if (sit.maintenance || sit.actorKinds.includes('contractor')) {
        return {
          rank: 'now',
          reason: {
            ja: '保守・委託の主体がいます。共有アカウントはここから生まれるので、保守用の認証を最初に個人単位にしてください。',
            en: 'Contracted parties are involved, and that is where shared accounts come from. Make maintenance authentication per-individual from the start.',
          },
        };
      }
      return { rank: 'now' };
    case 'sec-req-authz':
      if (outward && (big || sit.scale?.unit === 'org')) {
        return {
          rank: 'now',
          reason: {
            ja: '複数の会社が同じ画面を使います。**他社のデータに到達できない**という条件は権限設計そのものなので、後付けできません。テナント分離を認可の設計に入れてください。',
            en: 'Multiple companies share the same screens, so "cannot reach another company\'s data" is a property of the authorization design itself and cannot be bolted on. Put tenant separation into it.',
          },
        };
      }
      if (sensitive) {
        return {
          rank: 'now',
          reason: {
            ja: '機微なデータを扱うため、「誰が何を見られるか」を役割単位で定義しないと、あとで最小権限に絞り直せなくなります。',
            en: 'With sensitive data in scope, defining who sees what per role now is what makes least privilege achievable later.',
          },
        };
      }
      if (sit.scale !== undefined && sit.scale.unit === 'person' && sit.scale.count <= 20) {
        return {
          rank: 'now',
          reason: {
            ja: `${scaleWord}の運用では役割分掌が成立せず、実際には全員が全権限を持つ形になりがちです。分けきれないのは構いませんが、**誰が何をできるかを一度書き出す**だけで、事故時に見るべき範囲が決まります。`,
            en: `With ${scaleWord} operating it, separation of duties does not really hold and everyone ends up with everything. That may be unavoidable — but **writing down once who can do what** is what defines where to look when something goes wrong.`,
          },
        };
      }
      return { rank: 'now' };
    case 'sec-req-privileged':
      if (sit.maintenance || sit.physical) {
        return {
          rank: 'now',
          reason: {
            ja: '保守作業が特権操作の主な発生源です。作業のたびに期限付きで付与し、自動で外れる形にできるかを設計時に決めてください(運用開始後に足すのは、ほぼ実現しません)。',
            en: 'Maintenance work is the main source of privileged operations. Decide at design time whether access can be granted per job and expire automatically — added after go-live, it rarely materializes.',
          },
        };
      }
      if (sit.cloud) {
        return {
          rank: 'now',
          reason: {
            ja: 'クラウドの管理コンソールは、それ自体が最大の特権操作面です。日常作業と分離できているかを先に確認してください。',
            en: 'A cloud management console is itself the largest privileged surface. Check first that it is separated from day-to-day work.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-secrets':
      if (sit.integration || sit.cloud) {
        return {
          rank: 'now',
          reason: {
            ja: '外部連携・クラウドがあるため、接続用の資格情報が必ず発生します。ここが設定ファイルに置かれると、後から回収できません。',
            en: 'Integrations and cloud always generate connection credentials. Once those land in configuration files they cannot be recalled.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-transit':
      if (outward || sit.integration) {
        return {
          rank: 'now',
          reason: {
            ja: '境界をまたぐ通信があります。暗号化だけでなく**通信相手の検証**まで含めてください。暗号化しても相手が偽物なら意味がありません。',
            en: 'Traffic crosses a boundary. Include **verifying the peer**, not only encryption — encrypting to an impostor achieves nothing.',
          },
        };
      }
      if (sit.exposure === 'isolated') {
        return {
          rank: 'soon',
          reason: {
            ja: '閉域なので優先度は下がりますが、**対象外にはなりません**。保守端末と機器の間、機器どうしの間は今も平文のことが多く、内部に入られた時点で全部読まれます。',
            en: 'Isolation lowers this, but does not remove it. Traffic between a maintenance laptop and the equipment, and between devices, is still commonly cleartext — and readable to anyone who gets inside.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-rest':
      if (sensitive) {
        return {
          rank: 'now',
          reason: {
            ja: '機微なデータの**写し**(検証環境・バックアップ・分析基盤)に同じ保護が及んでいるかが、この項目の本体です。本番だけ守っても意味がありません。',
            en: 'The substance of this item is whether the **copies** — test environments, backups, analytics stores — get the same protection. Protecting production alone accomplishes nothing.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-input':
      if (outward) {
        return {
          rank: 'now',
          reason: {
            ja: '未認証または社外から値が入ってきます。検証は必ず境界の内側(サーバー側)で行ってください。画面側の検証は利用者の利便性のためのもので、統制ではありません。',
            en: 'Values arrive from outside, or without authentication. Validate on the inside of the boundary; client-side checks are a convenience for users, not a control.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-logging':
      if (sensitive || sit.sensitivities.includes('control')) {
        return {
          rank: 'now',
          reason: {
            ja: '何を記録するかは、事故が起きてからでは足せません。この範囲では最低でも「大量の読み出し」と「権限の変更」を記録対象に入れてください。',
            en: 'What gets recorded cannot be added after an incident. At minimum, put bulk reads and permission changes on the list for this scope.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-log-protection':
      if (sit.maintenance || sit.sensitivities.includes('control')) {
        return {
          rank: 'now',
          reason: {
            ja: '運用・保守を担う人が証跡も管理していると、事故時に「消せる立場の人」と「調べられる立場の人」が同一になります。保管先を分けてください。',
            en: 'When the people who operate the system also hold the evidence, the person who could delete it and the person who investigates are the same. Separate where it is stored.',
          },
        };
      }
      return { rank: 'later' };
    case 'sec-req-detection':
      if (sit.exposure === 'public') {
        return {
          rank: 'now',
          reason: {
            ja: '社外公開なので、試行は日常的に起きます。「検知したら誰が出るか」を夜間休日込みで決めていないと、アラートは無視される側に回ります。',
            en: 'Being public, attempts are routine. Unless you have decided who responds — including nights and weekends — the alerts become the ones people ignore.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-availability':
      if (sit.sensitivities.includes('control') || sit.physical) {
        return {
          rank: 'now',
          reason: {
            ja: '止まると物が止まる範囲です。復旧時間の目標より先に、**停止時に安全側へ倒れるか**を決めてください。ここは安全の話であり、セキュリティ担当だけでは決められません。',
            en: 'In this scope, a stoppage stops physical things. Before any recovery-time target, decide **whether a stop fails safe**. That is a safety question and not security\'s alone to answer.',
          },
        };
      }
      if (sit.exposure === 'public' && big) {
        return {
          rank: 'now',
          reason: {
            ja: `${scaleWord}が同時に影響を受けます。停止許容時間は技術ではなく業務側が合意する数字なので、先に取りに行ってください。`,
            en: `${scaleWord} are affected at once. The acceptable outage window is a number the business agrees, not a technical one — go and get it first.`,
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-vulnerability':
      if (outward || sit.cloud) {
        return {
          rank: 'now',
          reason: {
            ja: '外部から到達できる面があるため、公表された脆弱性は公表日から使われます。深刻度ごとの是正期限を、稼働前に決めてください。',
            en: 'With an externally reachable surface, published vulnerabilities get used from the day they are published. Set the remediation deadline per severity before go-live.',
          },
        };
      }
      if (sit.exposure === 'isolated') {
        return {
          rank: 'soon',
          reason: {
            ja: '閉域でも必要です。むしろ閉域環境は「止められないから更新しない」機器が積み上がる場所です。**更新できない機器を一覧にして、代替の統制を書く**ところまでを、この項目に含めてください。',
            en: 'Still needed. Isolated environments are precisely where unpatchable equipment accumulates because it cannot be stopped. Extend this item to **listing what cannot be updated and writing the compensating control**.',
          },
        };
      }
      return { rank: 'soon' };
    case 'sec-req-access-review':
      if (outward && big) {
        return {
          rank: 'now',
          reason: {
            ja: `${scaleWord}の担当者は、こちらの知らないところで異動・退職します。棚卸しの周期を決めるだけでなく、**相手側の変更をこちらが知る方法**を決めてください。`,
            en: `Staff at ${scaleWord} move on without telling you. Beyond setting a review cadence, decide **how you learn about changes on their side**.`,
          },
        };
      }
      if (sit.maintenance) {
        return {
          rank: 'now',
          reason: {
            ja: '委託先の要員は入れ替わります。契約単位ではなく個人単位で棚卸しできる状態にしてください。',
            en: 'Contractor personnel rotate. Make the review possible per individual, not per contract.',
          },
        };
      }
      return { rank: 'later' };
    case 'sec-req-third-party':
      if (sit.integration || sit.maintenance || sit.cloud) {
        return {
          rank: 'now',
          reason: {
            ja: '外部に預ける先があります。**事故通知の時限を契約に入れる**のが要点です。相手が気づいてから何日でこちらに伝わるかが決まっていないと、こちらの報告義務に間に合いません。',
            en: 'Assets sit with third parties. The point is **putting an incident-notification deadline into the agreement**: without one, you cannot know whether their notice arrives in time for your own reporting duty.',
          },
        };
      }
      return { rank: 'later' };
    case 'sec-req-residency':
      return sit.cloud
        ? {
            rank: 'now',
            reason: {
              ja: 'クラウド利用があるため、保管先が意図せず国をまたぐことがあります。既定のリージョン設定と、バックアップ・ログの複製先を別々に確認してください。',
              en: 'With cloud in use, storage can cross borders unintentionally. Check the default region and, separately, where backups and logs replicate to.',
            },
          }
        : { rank: 'soon' };
    case 'sec-req-retention':
      return sensitive
        ? {
            rank: 'now',
            reason: {
              ja: '保持期間は「長く持つほうが安全」ではありません。**持っている限り漏れる対象**なので、根拠のある年数を決めて自動削除まで設計してください。',
              en: 'Longer retention is not safer: **what you hold is what can leak**. Set a justified period and design the automatic deletion with it.',
            },
          }
        : { rank: 'soon' };
    case 'sec-req-breach-notification':
      return sit.exposure === 'public' || sensitive
        ? {
            rank: 'now',
            reason: {
              ja: '報告時限は外から与えられ、交渉できません。**時限から逆算した社内の判断期限**を日数で書いてください(誰が「公表する」と言えるかまで)。',
              en: 'The reporting window is imposed and not negotiable. Write **an internal decision deadline derived backwards from it**, in days — including who is allowed to say "we disclose".',
            },
          }
        : { rank: 'soon' };
    case 'sec-req-flowdown':
      return sit.maintenance || sit.integration
        ? {
            rank: 'now',
            reason: {
              ja: '委託先・連携先がいます。規制由来の要求は、契約に書かないと相手には届きません。再委託先まで届く書き方になっているかを確認してください。',
              en: 'Contractors and integration partners are involved. Regulation-derived obligations only reach them through the contract — check that the wording carries through to their subcontractors too.',
            },
          }
        : { rank: 'soon' };
    default:
      return { rank: 'soon' };
  }
}

/** 共通の一覧では拾えない、この範囲固有の観点 */
function scopeSpecificChecks(sit: Situation, lang: Lang): Bilingual[] {
  const extras: Bilingual[] = [];
  if (sit.physical || sit.sensitivities.includes('control')) {
    extras.push({
      ja: '**物理アクセスと可搬媒体** — 筐体・ラック・保守ポートへの到達を誰が持つか、持ち込む媒体と持ち出す媒体をどう管理するかを要件にする。ネットワークの統制表には出てこないが、この範囲では主経路。',
      en: '**Physical access and removable media** — who can reach the enclosure, the rack, and the maintenance ports, and how media coming in and going out is controlled. It never appears on a network control matrix, yet in this scope it is the main path.',
    });
    extras.push({
      ja: '**保守作業そのものの手順** — 作業前の承認、作業中の立会い、作業後の原状復帰確認。保守は権限が最も強く記録が最も薄いので、要件として明文化しないと運用に残らない。',
      en: '**The maintenance procedure itself** — approval before, supervision during, and a restoration check after. Maintenance carries the strongest privileges and the thinnest records; unless it is written as a requirement it leaves no trace in operations.',
    });
  }
  if (sit.exposure === 'partner' || (sit.exposure === 'public' && sit.scale?.unit === 'org')) {
    extras.push({
      ja: '**取引先アカウントのライフサイクル** — 発行・変更・停止を、相手側の人事異動にどう追随させるかを要件にする。こちらから見えない変更をどう知るか(定期の棚卸し依頼か、相手の管理者に権限を委譲するか)を決める。',
      en: '**Partner account lifecycle** — how issuance, change, and disablement track personnel changes on the other side. Decide how you learn about changes you cannot see: a periodic attestation request, or delegating administration to their own admin.',
    });
    extras.push({
      ja: '**テナント分離の検証** — 「他社のデータに到達できない」ことを、設計レビューではなくテストケースとして書く。識別子の書き換え、共有 ID の再利用、集計画面の抜けの 3 つを最低限含める。',
      en: '**Tenant separation testing** — write "cannot reach another company\'s data" as a test case, not a design-review point. Cover at least three: rewriting identifiers, reuse of shared IDs, and gaps in aggregate views.',
    });
  }
  if (sit.cloud) {
    extras.push({
      ja: '**責任分界の文書化** — どこまでが事業者の責任で、どこからが自社かを文書で確定させる。「クラウド側がやってくれていると思っていた」は事故後に最も多く出る言葉。',
      en: '**Documented responsibility split** — settle in writing where the provider\'s responsibility ends and yours begins. "We assumed the cloud handled it" is the single most common sentence after an incident.',
    });
  }
  if (sit.integration) {
    extras.push({
      ja: '**連携先の切り離し手順** — 連携先が侵害された・止まったときに、こちら側からその接続だけを落とす手順と権限を決めておく。切り離せない連携は、相手のリスクをそのまま引き受けている。',
      en: '**A procedure for cutting an integration loose** — who can drop that one connection, and how, when the far end is compromised or down. An integration you cannot sever means you have simply absorbed their risk.',
    });
  }
  if (sit.exposure === 'isolated') {
    extras.push({
      ja: '**更新できない機器の扱い** — 止められない・更新できない機器を一覧にし、それぞれに代替の統制(通信の制限、監視、物理的な隔離)を割り当てる。「閉域だから大丈夫」を統制の代わりにしない。',
      en: '**What to do about equipment that cannot be updated** — list what cannot be stopped or patched and assign each a compensating control: restricted communication, monitoring, physical separation. Do not let "it is isolated" stand in for a control.',
    });
  }
  if (sit.exposure === 'unknown') {
    extras.push({
      ja: '(公開範囲が読み取れなかったため、範囲固有の追加観点はこれ以上出せません。`scope` に「社外公開」「閉域網」などを書き足すと増えます。)',
      en: '(Exposure could not be read, so no further scope-specific items can be offered. Adding "publicly accessible" or "isolated network" to `scope` will produce more.)',
    });
  }
  return extras.length > 0 ? extras : [];
}

/* ------------------------------------------------------------------ *
 * ツール登録
 * ------------------------------------------------------------------ */

export function registerSecurityTools(server: McpServer): void {
  /* ---------------------------------------------------------------- *
   * list_sabsa_layers
   * ---------------------------------------------------------------- */
  server.registerTool(
    'list_sabsa_layers',
    {
      title: 'List the SABSA layers with their ADM counterparts',
      description:
        'セキュリティアーキテクチャの検討で使う 6 つの層(文脈・概念・論理・物理・コンポーネント・運用)を、「その層で何を決めるのか」「決めそこねると何が起きるか」「並走させる ADM フェーズ」付きで一覧する。6 つの問い(資産・動機・プロセス・人・場所・時間)も返す。 / List the six security-architecture layers — contextual, conceptual, logical, physical, component, operational — with what each layer decides, what breaks if it is skipped, and which ADM phases it runs alongside. Also returns the six questions: assets, motivation, process, people, location, time.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const out: string[] = [];

        out.push(msg('# セキュリティアーキテクチャの 6 層', '# The six security-architecture layers', l));
        out.push('');
        out.push(
          msg(
            'The SABSA Institute が公開しているセキュリティアーキテクチャの手法は、6 つの層 × 6 つの問い(資産 / 動機 / プロセス / 人 / 場所 / 時間)のマトリクスとして構成されている。TOGAF ADM はセキュリティを一つの関心事として扱うだけで手順を持たないため、実務ではこの層構造を借りて補うことが多い。以下は「ADM のどこでどの層を回すか」に絞った実務向けの整理で、原典の定義そのものではない。',
            'The security-architecture method published by The SABSA Institute is organized as a matrix of six layers against six questions — assets, motivation, process, people, location, time. The TOGAF ADM treats security as one concern but carries no procedure for it, so practitioners commonly borrow this layer structure to fill the gap. What follows is a practice-oriented take focused on which layer runs where in the ADM; it is not the original definitions.',
            l,
          ),
        );
        out.push('');

        // 一覧表(全体像を先に見せる)
        out.push(`| ${label('層', 'Layer', l)} | ID | ${label('何を決める層か', 'What it decides', l)} | ${label('並走する ADM フェーズ', 'Runs alongside', l)} |`);
        out.push('| --- | --- | --- | --- |');
        for (const layer of SABSA_LAYERS) {
          const phases = layer.phaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
          out.push(
            `| ${compact(layer.name, l)} | \`${layer.id}\` | ${compact(layer.viewpoint, l)} | ${phases} |`,
          );
        }
        out.push('');

        for (const layer of SABSA_LAYERS) {
          out.push(`## ${text(layer.name, l)} (\`${layer.id}\`)`);
          out.push('');
          out.push(`- ${label('目線', 'Viewpoint', l)}: ${text(layer.viewpoint, l)}`);
          out.push('');
          out.push(text(layer.purpose, l));
          out.push('');
          out.push(`**${label('この層で決めきるもの', 'Decided in this layer', l)}**`);
          out.push(bullets(layer.decisions, l));
          out.push('');
          out.push(`**${label('決めそこねると起きること', 'What happens if you skip it', l)}**`);
          out.push(bullets(layer.pitfalls, l));
          out.push('');
          out.push(
            `- ${label('並走する ADM フェーズ', 'ADM phases', l)}: ${layer.phaseIds.map((id) => phaseLabel(id, l)).join(' / ')}`,
          );
          out.push('');
        }

        out.push(msg('## 6 つの問い(マトリクスの列)', '## The six questions (matrix columns)', l));
        out.push('');
        out.push(
          msg(
            '各層でこの 6 列を埋める。埋まらない列がその層の弱点で、たいてい「時間」の列が空のまま稼働して、半年後に統制が劣化する。',
            'Fill these six columns at every layer. An empty column is that layer\'s weak spot — and it is almost always the time column, which is why controls decay about six months after go-live.',
            l,
          ),
        );
        out.push('');
        for (const q of SABSA_QUESTIONS) {
          out.push(`### ${text(q.name, l)}`);
          out.push('');
          out.push(text(q.focus, l));
          out.push('');
          out.push(bullets(q.askInPractice, l));
          out.push('');
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: `map_security_to_adm` に今のフェーズを渡すと、そのフェーズで必ず答えておくべきセキュリティ上の問いと、作るべき成果物が出ます。',
            'Next: pass your current phase to `map_security_to_adm` to get the security questions that must be answered there and the artifacts to produce.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `層一覧の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to render the layer list: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * map_security_to_adm
   * ---------------------------------------------------------------- */
  server.registerTool(
    'map_security_to_adm',
    {
      title: 'Map security work onto an ADM phase',
      description:
        '指定した ADM フェーズで並走させるセキュリティ層、そのフェーズを抜ける前に必ず答えておくべきセキュリティ上の問い、作成・更新すべきセキュリティ成果物、そのフェーズで起きやすい失敗を返す。 / For a given ADM phase, return the security layers to run alongside it, the security questions that must be answered before leaving the phase, the security artifacts to produce or update, and the failures that typically happen there.',
      inputSchema: {
        phase: z
          .string()
          .describe('フェーズ ID / コード。例: "a", "Phase A", "preliminary", "requirements-management"'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      try {
        const l = lang as Lang;
        const found = findPhase(phase);
        if (!found) {
          return errorResult(
            msg(
              `フェーズ「${phase}」が見つかりません。利用可能な ID: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              `Phase "${phase}" not found. Available ids: ${ADM_PHASES.map((p) => p.id).join(', ')}`,
              l,
            ),
          );
        }

        const mapping = securityMappingFor(found.id);
        if (!mapping) {
          return errorResult(
            msg(
              `フェーズ「${found.id}」のセキュリティ対応表がまだありません。`,
              `No security mapping is defined for phase "${found.id}" yet.`,
              l,
            ),
          );
        }

        const out: string[] = [];
        out.push(
          msg(
            `# セキュリティ並走計画: ${found.code} — ${found.name.ja}`,
            `# Security work alongside ${found.code} — ${found.name.en}`,
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(found.tagline, l)}`);
        out.push('');

        out.push(msg('## 並走させる層', '## Layers to run alongside', l));
        out.push('');
        for (const layerId of mapping.layerIds) {
          const layer = findSabsaLayer(layerId);
          if (!layer) continue;
          out.push(`- **${compact(layer.name, l)}** (\`${layer.id}\`) — ${text(layer.viewpoint, l)}`);
          out.push(`  - ${text(layer.purpose, l)}`);
        }
        out.push('');

        out.push(
          msg(
            '## このフェーズを抜ける前に必ず答えておくべき問い',
            '## Questions that must be answered before leaving this phase',
            l,
          ),
        );
        out.push('');
        out.push(numbered(mapping.mustAnswer, l));
        out.push('');
        out.push(
          msg(
            '答えが「まだ決まっていない」なら、それはリスクではなく**未決事項**です。アクションとして登録し、期限と担当を付けてください。',
            'An answer of "not decided yet" is not a risk — it is an **open decision**. Register it as an action with an owner and a date.',
            l,
          ),
        );
        out.push('');

        const artifacts = securityArtifactsForPhase(found.id);
        out.push(msg('## 作成・更新するセキュリティ成果物', '## Security artifacts to create or update', l));
        out.push('');
        if (artifacts.length === 0) {
          out.push(msg('- (このフェーズ固有のものはありません)', '- (none specific to this phase)', l));
        } else {
          for (const a of artifacts) {
            out.push(`### ${text(a.name, l)} (\`${a.id}\`)`);
            out.push('');
            out.push(text(a.summary, l));
            out.push('');
            out.push(`**${label('記載項目', 'Contents', l)}**`);
            out.push(bullets(a.contents, l));
            out.push('');
            out.push(`**${label('作成のコツ', 'Tips', l)}**`);
            out.push(bullets(a.tips, l));
            out.push('');
          }
        }

        out.push(msg('## 「終わった」と言ってよい条件', '## What lets you call it done', l));
        out.push('');
        out.push(bullets(mapping.exitCriteria, l));
        out.push('');

        const pitfalls = securityPitfallsForPhase(found.id);
        if (pitfalls.length > 0) {
          out.push(msg('## このフェーズで起きやすい失敗', '## Failures that typically happen here', l));
          out.push('');
          for (const p of pitfalls) {
            out.push(`### ${text(p.name, l)}`);
            out.push('');
            out.push(`- ${label('症状', 'Symptom', l)}: ${text(p.symptom, l)}`);
            out.push(`- ${label('放置した結果', 'Consequence', l)}: ${text(p.consequence, l)}`);
            out.push(`- ${label('直し方', 'Fix', l)}: ${text(p.fix, l)}`);
            out.push('');
          }
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: 対象システムが決まっているなら `threat_model_starter`、要件を台帳に落とすなら `security_requirements_checklist`、いま抱えている案件の抜けを見るなら `review_security_posture`。',
            'Next: `threat_model_starter` once a target system is known, `security_requirements_checklist` to get requirements into the register, or `review_security_posture` to inspect the engagement you already have.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `対応表の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the mapping: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * threat_model_starter
   * ---------------------------------------------------------------- */
  server.registerTool(
    'threat_model_starter',
    {
      title: 'Start a threat model',
      description:
        '対象システムの説明から公開範囲・扱うデータの機微性・利用者規模・主体の種類を読み取り、その状況に合わせた脅威モデリングの出発点を作る。読み取り結果と根拠、状況に応じた信頼境界の引き方、資産 × 6 観点(なりすまし/改ざん/否認/情報漏えい/サービス妨害/権限昇格)の**優先度入りの表**(空欄では返さない)、まず埋めるべき 3 セル、観点ごとにこの状況で実際に起きやすいこと、入力に足りない情報を返す。社外公開の大規模ポータルと閉域網の IoT 基盤では中身が変わる。出力は草案であり、セキュリティ担当との対話で確定させる前提。 / Read exposure, data sensitivity, user scale, and subject types out of a system description, then build a threat-modelling starting point fitted to that situation. Returns what was read and on what evidence, situation-specific trust-boundary rules, an asset-by-lens matrix over the six lenses (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege) that comes back **already prioritized rather than blank**, the three cells to fill first, what actually tends to go wrong here under each lens, and what the input did not say. A large public portal and an isolated IoT platform get materially different answers. The output is a draft to be settled in conversation with a security owner.',
      inputSchema: {
        system: z
          .string()
          .optional()
          .describe('対象システムの説明。公開範囲・利用者規模・扱うデータ・外部連携が書かれているほど助言が具体的になる。省略すると書き方の案内を返す / A description of the target system. The more it says about exposure, user scale, the data held, and external connections, the more specific the advice. Omit it to get guidance on what to write'),
        assets: z
          .array(z.string())
          .optional()
          .describe('守る対象。省略すると一般的な候補を出す / What is being protected; omitted, a generic candidate set is used'),
        actors: z
          .array(z.string())
          .optional()
          .describe('登場する主体・攻撃者。省略すると一般的な候補を出す / Subjects and adversaries; omitted, a generic candidate set is used'),
        lang: langSchema,
      },
    },
    async ({ system, assets, actors, lang }) => {
      try {
        const l = lang as Lang;
        const target = (system ?? '').trim();
        if (target.length === 0) {
          // 引数なしで呼ばれたときは、エラーではなく「何を書けばよいか」を返す。
          // 出力の具体度は system の記述量でほぼ決まるので、そこを案内する。
          const guide: string[] = [];
          guide.push(msg('# 脅威モデルの出発点 — 何を書けばよいか', '# Threat model starting point — what to write', l));
          guide.push('');
          guide.push(
            msg(
              'このツールは `system` の記述から状況を読み取って助言を変えます。次の 4 点が書かれていると、6 観点の優先順位まで付いた表が返ります。1 文でも動きますが、書くほど具体的になります。',
              'This tool reads your `system` text and changes its advice accordingly. With the four points below present, it returns a matrix that is already prioritized across the six lenses. One sentence is enough to run it; more detail makes it more specific.',
              l,
            ),
          );
          guide.push('');
          guide.push(
            bullets(
              [
                { ja: '**公開範囲** — 未認証で誰が到達できるか(社外公開 / 取引先限定 / 社内のみ / 閉域網)', en: '**Exposure** — who can reach it without authenticating: public, partner-restricted, internal-only, or an isolated network' },
                { ja: '**規模** — 「取引先 1,240 社」「社員 5 人」のように数で。なりすましの波及範囲が変わります', en: '**Scale** — as a number: "1,240 partner companies", "5 employees". It changes the blast radius of account takeover' },
                { ja: '**扱うデータ** — 個人情報 / 決済 / 認証情報 / 設計情報 / 制御指令のどれが入るか', en: '**Data held** — which of these are involved: personal data, payments, credentials, design information, control commands' },
                { ja: '**外部との経路** — 外部システム連携、クラウド、保守ベンダーの立ち入り', en: '**External paths** — integrations, cloud, and whether a maintenance vendor comes in' },
              ],
              l,
            ),
          );
          guide.push('');
          guide.push(`## ${label('そのまま貼れる呼び出し例', 'A call you can paste', l)}`);
          guide.push('');
          guide.push('```json');
          guide.push(
            JSON.stringify(
              {
                system:
                  l === 'en'
                    ? 'A public order-entry portal used by 1,240 partner companies over the internet. Partner staff place orders and check invoices and credit limits. It integrates with a payment provider over an API.'
                    : '取引先 1,240 社が利用する社外公開の受発注ポータル。インターネット経由でアクセスし、取引先の担当者が発注・請求・与信の照会を行う。決済代行会社と API 連携している。',
                assets:
                  l === 'en'
                    ? ['Partner account credentials', 'Order and invoice data', 'Credit limit information']
                    : ['取引先アカウントの資格情報', '発注・請求データ', '与信情報'],
                actors:
                  l === 'en'
                    ? ['Partner staff', 'Our sales staff', "The payment provider's system"]
                    : ['取引先の担当者', '当社の営業担当', '決済代行会社のシステム'],
              },
              null,
              2,
            ),
          );
          guide.push('```');
          guide.push('');
          guide.push(
            msg(
              '`assets` と `actors` は省略できます。省略すると一般的な候補を置き、そのことを出力に明記します。',
              '`assets` and `actors` are optional. Omitted, a generic set is used and the output says so.',
              l,
            ),
          );
          guide.push('');
          guide.push(`> ${text(DISCLAIMER, l)}`);
          return textResult(guide.join('\n'));
        }

        const defaultAssets: Bilingual[] = [
          { ja: '利用者の資格情報とセッション', en: 'User credentials and sessions' },
          { ja: '業務データ本体', en: 'The core business data' },
          { ja: '個人に関するデータ', en: 'Data about individuals' },
          { ja: '設定と秘密情報(鍵・トークン)', en: 'Configuration and secrets: keys and tokens' },
          { ja: '監査ログ・操作証跡', en: 'Audit logs and operation records' },
          { ja: 'サービスが動いていること自体(可用性)', en: 'The service being available at all' },
        ];
        const defaultActors: Bilingual[] = [
          { ja: '未認証の外部利用者', en: 'Unauthenticated outsider' },
          { ja: '認証済みの一般利用者', en: 'Authenticated ordinary user' },
          { ja: '特権を持つ管理者・運用担当', en: 'Privileged administrator or operator' },
          { ja: '委託先および連携する外部システム', en: 'Contractor and connected external system' },
          { ja: '正規の権限を持つ内部関係者(悪意または過失)', en: 'Legitimate insider, malicious or careless' },
        ];

        // 空白だけの要素しか無い場合も未入力として扱う(表が 0 行になるのを防ぐ)
        const givenAssets = (assets ?? []).map((a) => oneLine(a)).filter((a) => a.length > 0);
        const givenActors = (actors ?? []).map((a) => oneLine(a)).filter((a) => a.length > 0);
        const usingDefaultAssets = givenAssets.length === 0;
        const usingDefaultActors = givenActors.length === 0;

        const assetList: string[] = usingDefaultAssets
          ? defaultAssets.map((a) => compact(a, l))
          : givenAssets;
        const actorList: string[] = usingDefaultActors
          ? defaultActors.map((a) => compact(a, l))
          : givenActors;

        // 記述から状況を読み取る。以降の助言はすべてこの結果で変わる。
        // 既定候補は「こちらが置いた文言」なので読み取りに混ぜない。
        // 混ぜると、利用者が一言も書いていない「未認証」「委託先」を根拠として
        // 提示することになり、読み取り結果が信用できなくなる。
        const sit = readSituation(
          target,
          usingDefaultAssets ? [] : assetList,
          usingDefaultActors ? [] : actorList,
        );
        const assetKinds = assetList.map(classifyAsset);
        const kindSet = new Set<AssetKind>(assetKinds);
        // 表に出す件数は上限を設ける(資産を大量に渡されたときに表が読めなくなる)
        const MATRIX_LIMIT = 12;
        const matrixAssets = assetList.slice(0, MATRIX_LIMIT);

        // 観点ごとの合計点を出し、この状況で最も効く観点を見出しに出す
        const lensTotals = THREAT_LENSES.map((lens) => ({
          lens,
          total: assetKinds.reduce((sum, k) => sum + scoreCell(k, lens.id, sit).score, 0),
        }));
        const topLens = [...lensTotals].sort((a, b) => b.total - a.total)[0];

        const out: string[] = [];
        out.push(msg('# 脅威モデルの出発点(草案)', '# Threat model starting point (draft)', l));
        out.push('');
        out.push(
          quote(
            '**これは草案です。** 資産・攻撃者・境界の妥当性は、必ずセキュリティ担当と対話して確定させてください。この表がそのまま脅威モデルになるわけではありません。',
            '**This is a draft.** The assets, adversaries, and boundaries must be settled in conversation with a security owner. This table is not itself the threat model.',
            l,
          ),
        );
        out.push('');
        out.push(`## ${label('対象', 'Target', l)}`);
        out.push('');
        out.push(quoteRaw(target));
        out.push('');

        /* --- 0. 読み取った状況 --- */
        out.push(msg('## 0. この記述から読み取った状況', '## 0. What was read from your description', l));
        out.push('');
        out.push(
          msg(
            '以下は入力の文面から機械的に推定したものです。**まちがっていたら直してください。** ここが変わると、この先の優先順位がすべて変わります。',
            'The following is inferred mechanically from your text. **Correct anything that is wrong** — everything downstream is prioritized from it.',
            l,
          ),
        );
        out.push('');
        out.push(...situationTable(sit, l));
        out.push('');
        if (sit.exposureConflict.length > 0) {
          out.push(
            quote(
              `閉域を示す語(${sit.exposureConflict.slice(0, 3).map(cell).join(', ')})と、外部公開を示す語の両方が出てきます。**厳しい側=社外公開として扱いました。** 実際に閉域なら、その旨を書いて再実行してください。取りこぼしより過剰配慮のほうが安い、という方針で寄せています。`,
              `Your text contains both words suggesting isolation (${sit.exposureConflict.slice(0, 3).map(cell).join(', ')}) and words suggesting external exposure. **The stricter reading — public — was used.** If it really is isolated, say so and re-run. The rule here is that over-caution costs less than a miss.`,
              l,
            ),
          );
          out.push('');
        }
        if (topLens && topLens.total > 0) {
          out.push(
            msg(
              `**この状況で最初に手を付けるべき観点: ${topLens.lens.name.ja}。** 6 観点すべてを同じ深さでやろうとすると終わらないので、まずここから 1 周してください。`,
              `**The lens to start with here: ${topLens.lens.name.en}.** Working all six to the same depth never finishes; do one pass on this one first.`,
              l,
            ),
          );
          out.push('');
        }

        /* --- 1. 信頼境界 --- */
        out.push(msg('## 1. 信頼境界の引き方', '## 1. Drawing the trust boundaries', l));
        out.push('');
        const boundaryRules: Bilingual[] = [];
        if (sit.exposure === 'public' || sit.exposure === 'partner') {
          boundaryRules.push({
            ja: '**まず「未認証で到達できる面」を 1 本の線で囲む。** ここが最も外側の境界で、この内側に何が置かれているかがこのシステムの性格を決める。',
            en: '**First, draw one line around everything reachable without authenticating.** That is the outermost boundary, and what sits inside it defines the character of this system.',
          });
        }
        if (sit.exposure === 'partner' || (sit.scale !== undefined && sit.scale.unit === 'org')) {
          boundaryRules.push({
            ja: '**取引先どうしの間にも線を引く。** 同じ画面を使う別会社は、こちらから見れば同格でも、互いには他人です。テナント間の境界を図に描かないと、実装で必ず混ざります。',
            en: '**Draw a line between the partners as well.** Companies using the same screen are peers to you but strangers to each other. A tenant boundary left off the diagram is one the implementation will merge.',
          });
        }
        if (sit.exposure === 'isolated') {
          boundaryRules.push({
            ja: '**閉域網の内側は「1 つの信頼領域」ではない。** 閉域を 1 つの箱にすると検討が終わってしまう。制御系 / 監視系 / 保守用の端末を別々の領域として描き、その間を何が通るかを書く。',
            en: '**The inside of an isolated network is not one trust zone.** Drawing it as a single box ends the analysis prematurely. Draw the control side, the monitoring side, and the maintenance laptops as separate zones, and write what passes between them.',
          });
          boundaryRules.push({
            ja: '**物理的に立ち入れる範囲を境界として描く。** 施錠された部屋・ラック・可搬媒体の持ち込み口は、ネットワーク図には出てこないが実際の境界。',
            en: '**Draw the physical access perimeter as a boundary.** Locked rooms, racks, and the point where removable media enters do not appear on a network diagram but are real boundaries.',
          });
        }
        if (sit.maintenance) {
          boundaryRules.push({
            ja: '**保守経路を独立した境界として描く。** 保守は「一時的だから」と図から省かれがちだが、権限が最も強く、記録が最も薄い経路。誰が・どこから・何を持ち出せるかを線の上に書く。',
            en: '**Draw the maintenance path as its own boundary.** It gets left off diagrams as "temporary", yet it carries the strongest privileges and the thinnest records. Write on the line who comes in, from where, and what they can take out.',
          });
        }
        if (sit.integration || sit.cloud) {
          boundaryRules.push({
            ja: '**運用主体が変わるところに線を引く(自社 / 委託先 / SaaS・クラウド事業者)。** ネットワークが同じでも境界として扱う。責任の切れ目が境界であって、通信の切れ目ではない。',
            en: '**Draw a line wherever the operator changes** — you, a contractor, a SaaS or cloud provider — even when the network is shared. The boundary is where responsibility ends, not where the network does.',
          });
        }
        boundaryRules.push({
          ja: '権限の水準が変わるところに線を引く(一般利用者 → 管理機能、アプリ → データストア)。',
          en: 'Draw a line where the privilege level changes: ordinary user to admin function, application to data store.',
        });
        if (sit.sensitivities.includes('personal') || sit.sensitivities.includes('payment') || sit.sensitivities.includes('design')) {
          boundaryRules.push({
            ja: 'データの分類区分が変わるところに線を引く。**区分の高いデータが低い区分の環境(検証環境・分析基盤・ログ)へ流れる箇所**が、この案件では特に効く。',
            en: 'Draw a line where the classification changes. **Where higher-tier data flows into a lower-tier environment** — test systems, analytics, logs — matters especially in this case.',
          });
        }
        if (sit.cloud || sit.exposure === 'public') {
          boundaryRules.push({
            ja: '法域・地域が変わるところに線を引く。保管先が国をまたぐ場合はここで拾う。',
            en: 'Draw a line where the jurisdiction changes; cross-border storage gets caught here.',
          });
        }
        boundaryRules.push({
          ja: '線を引いたら、その線をまたぐデータと「またぐときに何を検査するか」を必ず併記する。検査を書かない境界は実装時に素通りする。',
          en: 'For each line, write what crosses it and what is inspected as it crosses. A boundary without an inspection is one implementers will walk straight through.',
        });
        out.push(bullets(boundaryRules, l));
        out.push('');

        out.push(msg('## 2. 資産と主体', '## 2. Assets and subjects', l));
        out.push('');
        out.push(`**${label('資産(守る対象)', 'Assets', l)}**`);
        if (usingDefaultAssets) {
          out.push(
            msg(
              '(入力が無かったため一般的な候補を置いています。対象システムの言葉に置き換えてください。)',
              '(No input given, so generic candidates are shown. Replace them with this system\'s own terms.)',
              l,
            ),
          );
        }
        out.push('');
        out.push(
          assetList
            .map((a, i) => `- ${a} — ${label('分類', 'classified as', l)}: ${compact(ASSET_KIND_LABEL[assetKinds[i]], l)}`)
            .join('\n'),
        );
        out.push('');
        out.push(`**${label('主体・攻撃者', 'Subjects and adversaries', l)}**`);
        if (usingDefaultActors) {
          out.push(
            msg(
              '(入力が無かったため一般的な候補を置いています。委託先・バッチ処理・連携システムを忘れずに足してください。)',
              '(No input given, so generic candidates are shown. Remember to add contractors, batch jobs, and connected systems.)',
              l,
            ),
          );
        }
        out.push('');
        out.push(actorList.map((a) => `- ${a}`).join('\n'));
        out.push('');

        /* 利用者が入れた一覧そのものへの指摘。既定候補を使っている場合は自分の候補を批評しても仕方がないので出さない */
        const listGaps: Bilingual[] = [];
        if (!usingDefaultAssets) {
          if (!kindSet.has('availability')) {
            listGaps.push({
              ja: '資産に「**サービスが動いていること自体**」が入っていません。可用性を資産として 1 行立てないと、サービス妨害の列は最後まで埋まりません(データだけを資産にすると、止まる被害が誰の担当でもなくなります)。',
              en: 'The asset list does not include "**the service being available at all**". Without availability as its own line, the denial-of-service column never gets filled — and an outage ends up belonging to nobody.',
            });
          }
          if (!kindSet.has('log')) {
            listGaps.push({
              ja: '資産に「**監査ログ・操作証跡**」が入っていません。否認の列はここが無いと埋まらず、事故後の調査もここが無いと始まりません。',
              en: 'The asset list does not include "**audit logs and operation records**". The repudiation column cannot be filled without them, and neither can any post-incident investigation start.',
            });
          }
          const distinct = new Set(assetKinds);
          if (distinct.size === 1 && assetKinds.length >= 3) {
            listGaps.push({
              ja: `資産が ${assetKinds.length} 件ともすべて「${compact(ASSET_KIND_LABEL[assetKinds[0]], l)}」に寄っています。1 種類しか無い資産一覧は、たいてい書き手の担当範囲だけを写したものです。他の部門が守りたいものを 1 つ足してください。`,
              en: `All ${assetKinds.length} assets classify as "${compact(ASSET_KIND_LABEL[assetKinds[0]], l)}". A single-kind asset list usually mirrors the author's own remit. Add one thing another function wants protected.`,
            });
          }
        }
        if (!usingDefaultActors) {
          const actorsLower = actorList.join(' ').toLowerCase();
          const hasAdversary = ['未認証', '攻撃者', '第三者', '不正', 'attacker', 'unauthenticated', 'adversary'].some(
            (w) => matchesKeyword(actorsLower, w),
          );
          if ((sit.exposure === 'public' || sit.exposure === 'partner') && !hasAdversary) {
            listGaps.push({
              ja: '主体が全員「正規の利用者」です。公開面がある以上、**未認証の第三者**を 1 行足してください。正規利用者だけを並べた脅威モデルは、業務フロー図と同じものになります。',
              en: 'Every subject listed is a legitimate user. With a public surface, add one line for the **unauthenticated third party**. A threat model containing only legitimate users is just a process diagram.',
            });
          }
          if (sit.integration && !sit.actorKinds.includes('machine')) {
            listGaps.push({
              ja: '説明には外部連携が出てきますが、主体に**機械(連携先システム・バッチ)**が入っていません。連携先も主体です。その系が侵害されたときにこちらに何ができるかが、この行の論点になります。',
              en: 'The description mentions an integration, but no **machine subject** — the connected system or a batch job — is listed. The far end is a subject too, and what it can do to you once compromised is the question that line raises.',
            });
          }
          if (sit.maintenance && !sit.actorKinds.includes('contractor')) {
            listGaps.push({
              ja: '説明には保守・委託が出てきますが、主体に**保守ベンダー**が入っていません。保守は権限が最も強く記録が最も薄い主体なので、必ず 1 行立ててください。',
              en: 'The description mentions maintenance or outsourcing, but no **maintenance vendor** is listed as a subject. It is the subject with the strongest privileges and the thinnest records; give it its own line.',
            });
          }
        }
        if (listGaps.length > 0) {
          out.push(`**${label('この一覧への指摘', 'What is missing from your lists', l)}**`);
          out.push('');
          out.push(bullets(listGaps, l));
          out.push('');
        }

        /* --- 3. 資産 × 観点(優先度を入れて返す) --- */
        out.push(msg('## 3. 資産 × 脅威観点の表', '## 3. The asset-by-lens matrix', l));
        out.push('');
        out.push(
          msg(
            '**空欄では返しません。** 各セルには、読み取った状況(公開範囲・データの機微性・規模・物理アクセス)から機械的に付けた優先度と、そのセルで書くべきことの見出しを入れてあります。あなたが埋めるのは「打ち手」または「受容(理由付き)」のほうです。優先度は目安なので、業務の事情で必ず動きます。動かしたら理由を残してください。',
            '**This is not returned blank.** Every cell carries a priority derived mechanically from what was read — exposure, sensitivity, scale, physical access — plus a heading for what belongs there. What you fill in is the control, or the acceptance with its reason. The priorities are estimates and will move once business context arrives; record why when they do.',
            l,
          ),
        );
        out.push('');
        const lensHeads = THREAT_LENSES.map((t) => compact(t.name, l));
        out.push(`| ${label('資産', 'Asset', l)} | ${label('分類', 'Kind', l)} | ${lensHeads.join(' | ')} |`);
        out.push(`| --- | --- | ${THREAT_LENSES.map(() => '---').join(' | ')} |`);
        for (let i = 0; i < matrixAssets.length; i += 1) {
          const kind = assetKinds[i];
          const cells = THREAT_LENSES.map((lens) => {
            const s = scoreCell(kind, lens.id, sit);
            const mark = s.bumped ? '*' : '';
            const hint = s.score >= 2 ? ` ${cellHint(kind, lens.id, l)}` : '';
            return `${priorityLabel(s.score, l)}${mark}${hint}`;
          });
          out.push(`| ${cell(matrixAssets[i])} | ${compact(ASSET_KIND_LABEL[kind], l)} | ${cells.join(' | ')} |`);
        }
        out.push('');
        if (assetList.length > MATRIX_LIMIT) {
          out.push(
            msg(
              `(資産が ${assetList.length} 件あるため、表には先頭 ${MATRIX_LIMIT} 件だけ出しています。残りは分割して呼び直してください。1 枚の表で 12 行を超えると、実務では読まれません。)`,
              `(${assetList.length} assets were given; only the first ${MATRIX_LIMIT} are tabulated. Re-run with the rest split out — beyond about twelve rows, a matrix stops being read.)`,
              l,
            ),
          );
          out.push('');
        }
        /* 最優先セルを 3 つに絞る。全部が最優先なら優先順位は無いのと同じ */
        const ranked = matrixAssets
          .flatMap((asset, i) =>
            THREAT_LENSES.map((lens) => ({
              asset,
              kind: assetKinds[i],
              lens,
              score: scoreCell(assetKinds[i], lens.id, sit).score,
            })),
          )
          .sort((a, b) => b.score - a.score);
        const topCells = ranked.slice(0, 3);
        const totalCells = ranked.length;
        const topCount = ranked.filter((r) => r.score >= MAX_SCORE).length;
        if (topCells.length > 0 && topCells[0].score > 0) {
          out.push(`**${label('まず埋める 3 セル', 'The three cells to fill first', l)}**`);
          out.push('');
          out.push(
            bullets(
              topCells.map((c) => ({
                ja: `**${oneLine(c.asset)} × ${c.lens.name.ja}** — ${compact(CELL_HINTS[c.lens.id]?.byKind[c.kind] ?? CELL_HINTS[c.lens.id]?.fallback ?? { ja: '', en: '' }, 'ja')}`,
                en: `**${oneLine(c.asset)} × ${c.lens.name.en}** — ${compact(CELL_HINTS[c.lens.id]?.byKind[c.kind] ?? CELL_HINTS[c.lens.id]?.fallback ?? { ja: '', en: '' }, 'en')}`,
              })),
              l,
            ),
          );
          out.push('');
          if (topCount > totalCells * 0.4) {
            out.push(
              quote(
                `**この表は ${totalCells} セル中 ${topCount} セルが「最優先」です。** これはあなたの入力が悪いのではなく、公開範囲・規模・データの機微性が全部きつい側に振れているという意味です。ただし全部が最優先なら優先順位は付いていないのと同じなので、上の 3 セルだけを今週の対象にして、残りは次に回してください。`,
                `**${topCount} of ${totalCells} cells came out "Top".** That is not a flaw in your input — it means exposure, scale, and sensitivity all landed on the hard side. But if everything is top priority, nothing is; take only the three cells above as this week's scope and defer the rest.`,
                l,
              ),
            );
            out.push('');
          }
        }

        out.push(`**${label('この優先度の付け方(開示)', 'How these priorities were assigned (disclosed)', l)}**`);
        out.push('');
        out.push(
          bullets(
            [
              {
                ja: `資産の性質ごとの基準値に、状況による補正を足しています。今回の補正: ${describeAdjustments(sit, l)}`,
                en: `A per-asset-kind baseline plus adjustments from the situation. Applied here: ${describeAdjustments(sit, l)}`,
              },
              {
                ja: '`*` の付いたセルは、**資産そのものではなく状況(公開範囲・規模・物理アクセス・保守経路)によって一段上がった**セルです。境界線上なので、業務の事情で下げてよい候補でもあります。判定は「中以上なら高い側に寄せる」— 取りこぼしより過剰配慮のほうが安いためです。',
                en: '`*` marks cells raised a level **by the situation — exposure, scale, physical access, maintenance path — rather than by the asset itself**. They are the borderline ones, and therefore the first candidates to lower once you know the business. The rule is to round upward: over-caution costs less than a miss.',
              },
              {
                ja: '「低」のセルも空欄にせず、**なぜ低いと判断したか**を一言残してください。後任が同じ検討をやり直さずに済み、状況が変わったとき(閉域網が外に繋がるなど)に見直す起点になります。',
                en: 'Do not leave the "Low" cells blank either — write **why** they are low. It saves your successor the same analysis and gives you a place to revisit when the situation changes, such as an isolated network gaining a connection.',
              },
            ],
            l,
          ),
        );
        out.push('');

        out.push(
          msg(
            '## 4. 観点ごとに、この状況で実際に起きやすいこと',
            '## 4. What actually tends to happen here, lens by lens',
            l,
          ),
        );
        out.push('');
        out.push(
          msg(
            '優先度の高い順に並べています。各観点の先頭が「この案件固有の話」、その下が「どの案件でも聞く共通の問い」です。',
            'Ordered by priority. The first part of each lens is specific to this engagement; the questions below it are the ones asked everywhere.',
            l,
          ),
        );
        out.push('');
        if (usingDefaultAssets) {
          out.push(
            msg(
              '(資産が未入力のため、以下の「この状況では」は**一般的な候補資産**を前提に書かれています。`assets` に実際の資産を渡すと、この部分の内容が変わります。)',
              '(No assets were given, so the "In this situation" notes below assume the **generic candidate assets**. Pass your real ones in `assets` and this section changes.)',
              l,
            ),
          );
          out.push('');
        }
        const orderedLenses = [...lensTotals].sort((a, b) => b.total - a.total);
        for (const entry of orderedLenses) {
          const lens = entry.lens;
          const maxScore = assetKinds.reduce(
            (best, k) => Math.max(best, scoreCell(k, lens.id, sit).score),
            0,
          );
          out.push(`### ${text(lens.name, l)} — ${priorityLabel(maxScore, l)}`);
          out.push('');
          out.push(text(lens.meaning, l));
          out.push('');
          out.push(`**${label('この状況では', 'In this situation', l)}**`);
          out.push(bullets(lensAdvice(lens.id, sit, kindSet, l), l));
          out.push('');
          out.push(`**${label('共通の問い', 'Questions asked everywhere', l)}**`);
          out.push(bullets(lens.questions, l));
          out.push('');
          out.push(`**${label('打ち手の型', 'Control types', l)}**`);
          out.push(bullets(lens.controlTypes, l));
          out.push('');
        }

        /* --- 5. 埋められなかったこと --- */
        const gaps = situationUnknowns(sit, l);
        out.push(
          msg(
            '## 5. この入力からは埋められなかったこと',
            '## 5. What this input did not let us fill in',
            l,
          ),
        );
        out.push('');
        if (gaps.length === 0) {
          out.push(
            msg(
              '公開範囲・機微性・規模・主体の 4 点がすべて読み取れました。この先で足りなくなるのは、こちらでは推定できない業務側の情報です。具体的には、**止まったときに困る業務の名前**、**すでに起きたことのある事故**、**この案件で受容済みのリスク**の 3 つを、セキュリティ担当との場に持ち込んでください。',
              'All four — exposure, sensitivity, scale, and subjects — were readable. What is missing from here on is business knowledge no tool can infer: **the name of the process that suffers when this stops**, **incidents that have already happened**, and **risks already accepted on this engagement**. Bring those three to the session with your security owner.',
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '次を書き足して再実行すると、上の優先度と助言が具体的になります。',
              'Add the following and re-run; the priorities and advice above get more specific.',
              l,
            ),
          );
          out.push('');
          out.push(bullets(gaps, l));
        }
        out.push('');

        out.push(msg('## 6. 次に作るべき成果物', '## 6. What to produce next', l));
        out.push('');
        for (const id of ['trust-boundary-diagram', 'threat-model', 'security-requirements-spec', 'residual-risk-acceptance']) {
          const a = findSecurityArtifact(id);
          if (!a) continue;
          out.push(`- **${artifactLabel(a.id, l)}** — ${text(a.summary, l)}`);
        }
        out.push('');
        out.push(
          msg(
            '順番としては、信頼境界図を先に 1 枚に収めてから脅威モデルに入ると手戻りが少なくなります。完璧な列挙を目指すより、まず「境界をまたぐデータフロー」だけで 1 周してください。',
            'Get the boundary diagram onto one page before starting the model; it reduces rework. Rather than chasing completeness, do one full pass over just the flows that cross a boundary.',
            l,
          ),
        );
        out.push('');
        if (topLens) {
          out.push(
            msg(
              `この案件では **${topLens.lens.name.ja}** の列から着手してください。要件として台帳に入れる段になったら、\`security_requirements_checklist\` の \`scope\` に同じ説明文を渡すと、この状況に合わせて項目に優先度が付きます。`,
              `On this engagement, start from the **${topLens.lens.name.en}** column. When you are ready to put these into the requirements register, pass the same description as \`scope\` to \`security_requirements_checklist\` — it prioritizes the items for this same situation.`,
              l,
            ),
          );
          out.push('');
        }

        out.push('---');
        out.push('');
        out.push(
          quote(
            '**確定は対話で。** ここで挙げた観点は出発点にすぎません。実際の脅威・優先度・受容の判断は、対象業務を知っているセキュリティ担当と一緒に決めてください。',
            '**Settle it in conversation.** These lenses are only a starting point. The real threats, their priority, and what gets accepted must be decided together with a security owner who knows the business.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `脅威モデルの草案生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the threat model draft: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * security_requirements_checklist
   * ---------------------------------------------------------------- */
  server.registerTool(
    'security_requirements_checklist',
    {
      title: 'Security requirements checklist',
      description:
        '非機能要件として ID 管理すべきセキュリティ要件のチェックリストを返す。各項目に「どう検証するか」を併記する。scope の記述から公開範囲・データの機微性・規模・運用体制を読み取り、**この範囲で先に着手すべき項目を理由付きで選ぶ**とともに、共通の一覧には無い範囲固有の観点(物理アクセス、取引先アカウントのライフサイクル、責任分界など)を足す。regulated を true にすると規制対象の案件で追加になる項目も含める(false でも、記述に個人情報・決済が出てくれば指摘する)。 / Return the checklist of security requirements to register and track as non-functional requirements, each with its verification method. Reads exposure, data sensitivity, scale, and the operating arrangement out of `scope` to **select, with reasons, which items to start with here**, and adds scope-specific concerns the generic list omits — physical access, partner account lifecycle, the responsibility split. Set `regulated` to true to include what regulated engagements additionally need; with false, it still flags personal data or payments if the text mentions them.',
      inputSchema: {
        scope: z
          .string()
          .optional()
          .describe('対象範囲。システム名だけでなく、公開範囲・扱うデータ・保守体制まで書くと項目に優先度が付く。省略すると書き方の案内を返す / The scope. Beyond a system name, describing exposure, the data held, and the maintenance arrangement makes the items get prioritized. Omit it for guidance on what to write'),
        regulated: z
          .boolean()
          .default(false)
          .describe('規制対象の案件かどうか / Whether the engagement is subject to regulation'),
        lang: langSchema,
      },
    },
    async ({ scope, regulated, lang }) => {
      try {
        const l = lang as Lang;
        const target = (scope ?? '').trim();
        if (target.length === 0) {
          const guide: string[] = [];
          guide.push(msg('# セキュリティ要件チェックリスト — 何を書けばよいか', '# Security requirements checklist — what to write', l));
          guide.push('');
          guide.push(
            msg(
              '`scope` はシステム名だけでも動きますが、その場合は項目が一律に並ぶだけです。次を書き足すと、**この範囲で先に着手すべき項目**が選ばれ、理由が付きます。',
              '`scope` works with just a system name, but then the items come out in a flat list. Add the following and the checklist selects **which items to start with here**, with reasons.',
              l,
            ),
          );
          guide.push('');
          guide.push(
            bullets(
              [
                { ja: '**公開範囲** — 社外公開 / 取引先限定 / 社内のみ / 閉域網', en: '**Exposure** — public, partner-restricted, internal-only, or an isolated network' },
                { ja: '**扱うデータ** — 個人情報 / 決済 / 認証情報 / 設計情報 / 制御指令', en: '**Data held** — personal data, payments, credentials, design information, control commands' },
                { ja: '**規模** — 「取引先 1,240 社」「社員 5 人」など', en: '**Scale** — "1,240 partner companies", "5 employees"' },
                { ja: '**運用体制** — クラウドか自社設備か、保守を委託しているか', en: '**Operations** — cloud or own hardware, and whether maintenance is outsourced' },
              ],
              l,
            ),
          );
          guide.push('');
          guide.push(`## ${label('そのまま貼れる呼び出し例', 'A call you can paste', l)}`);
          guide.push('');
          guide.push('```json');
          guide.push(
            JSON.stringify(
              {
                scope:
                  l === 'en'
                    ? 'A public order-entry portal used by 1,240 partner companies. It holds personal data and payment information and runs on cloud infrastructure; operations are outsourced.'
                    : '取引先 1,240 社が使う社外公開の受発注ポータル。個人情報と決済情報を扱い、クラウド上で稼働し、運用は委託している。',
                regulated: true,
              },
              null,
              2,
            ),
          );
          guide.push('```');
          guide.push('');
          guide.push(
            msg(
              '`regulated` は、規制・業界要求・大口顧客との契約が絡むなら `true` にしてください。データの所在・保持期間・監査証跡・事故時の報告・委託先への伝播の 5 区分が追加されます。判断に迷う場合は、記述に個人情報や決済が出てくれば本ツールが指摘します。',
              'Set `regulated` to `true` when regulation, an industry requirement, or a major customer contract is involved; it adds five categories — data location, retention, audit trail, incident reporting, and flow-down. If you are unsure, mention personal data or payments in the text and this tool will flag it.',
              l,
            ),
          );
          guide.push('');
          guide.push(`> ${text(DISCLAIMER, l)}`);
          return textResult(guide.join('\n'));
        }

        // 範囲の記述から状況を読み取り、項目ごとの優先度を決める
        const sit = readSituation(target, [], []);
        const items = securityRequirementsFor(regulated);
        const prioritized = items.map((item) => ({ item, ...requirementPriority(item.id, sit, l) }));
        const rankOrder: Record<ReqRank, number> = { now: 0, soon: 1, later: 2 };
        const sorted = [...prioritized].sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);
        /* 「先」の中は、後から変えられない順に並べる。カタログ順のまま出して
           「効きが大きい順」と名乗るのは、やっていない並べ替えを主張することになる */
        const nowItems = prioritized
          .filter((p) => p.rank === 'now')
          .sort((a, b) => retrofitCost(b.item.id) - retrofitCost(a.item.id));

        const out: string[] = [];

        out.push(msg('# セキュリティ要件チェックリスト', '# Security requirements checklist', l));
        out.push('');
        out.push(`- ${label('対象', 'Scope', l)}: ${oneLine(target)}`);
        out.push(
          `- ${label('規制対象', 'Regulated', l)}: ${regulated ? label('はい', 'yes', l) : label('いいえ', 'no', l)}`,
        );
        out.push(`- ${label('項目数', 'Items', l)}: ${items.length}`);
        out.push(
          `- ${label('先に着手すべき項目', 'Items to start with', l)}: ${nowItems.length}`,
        );
        out.push('');
        out.push(
          msg(
            'これらは**そのまま貼り付ける要件文ではありません**。対象システムの言葉に書き換え、他の非機能要件と同じ採番体系・同じ台帳に入れてください。セキュリティ要件を別紙に隔離した瞬間に、テスト計画にも受入条件にも入らなくなります。',
            'These are **not requirement text to paste in as-is**. Rewrite them in this system\'s terms and register them with the same numbering, in the same register, as every other non-functional requirement. The moment security requirements are exiled to an appendix they stop reaching the test plan and the acceptance criteria.',
            l,
          ),
        );
        out.push('');

        /* --- この範囲から読み取ったこと --- */
        out.push(msg('## この範囲から読み取ったこと', '## What was read from this scope', l));
        out.push('');
        out.push(...situationTable(sit, l));
        out.push('');
        if (sit.exposure === 'unknown' && sit.sensitivities.length === 0) {
          out.push(
            quote(
              '`scope` からは公開範囲もデータの機微性も読み取れませんでした。**下の優先度は既定値のままです。** 「社外公開」「個人情報を扱う」「閉域網」のような一文を足して呼び直すと、この一覧の順序と理由が変わります。',
              'Neither exposure nor data sensitivity could be read from `scope`. **The priorities below are therefore the defaults.** Add a sentence like "publicly accessible", "holds personal data", or "isolated network" and re-run; the ordering and the reasons will change.',
              l,
            ),
          );
          out.push('');
        }

        /* --- 先に着手すべき項目(理由付き) --- */
        if (nowItems.length > 0) {
          out.push(msg('## この範囲で先に着手すべき項目', '## What to start with, for this scope', l));
          out.push('');
          out.push(
            msg(
              '全部を同時に進めることはできません。**選んだのは読み取った状況から、並べたのは「稼働後に変えられない順」です**(認証方式・権限設計・記録対象・契約文言のように、後から作り直すしかないものが上)。効きの大きさは業務を知らないと決められないので、こちらでは並べていません。理由が納得できないものは下げてください — 理由を書いてあるのは、下げる判断ができるようにするためです。',
              'You cannot run all of them at once. **The selection comes from your scope; the ordering is by how impossible each is to change after go-live** — authentication method, authorization design, what gets recorded, contract wording — things you can only rebuild later. Which pays off most depends on your business, so that is not the axis used here. Lower any whose reason you disagree with — the reasons are written down precisely so you can.',
              l,
            ),
          );
          out.push('');
          out.push(
            bullets(
              nowItems.map((p) => ({
                ja: `**${p.item.category.ja}** — ${p.reason?.ja ?? 'この範囲では基本項目として先に必要です。'}`,
                en: `**${p.item.category.en}** — ${p.reason?.en ?? 'A baseline item that this scope needs early.'}`,
              })),
              l,
            ),
          );
          out.push('');

          /* 「先」が一覧の大半を占めたら、それは優先順位が付いていないのと同じ。
             黙って全件を並べず、そう言ったうえで今週の 3 件を切り出す */
          if (nowItems.length >= 3 && nowItems.length / items.length > 0.6) {
            const top3 = nowItems.slice(0, 3);
            out.push(
              quote(
                `**この一覧は ${items.length} 項目中 ${nowItems.length} 項目が「先」です。** それは優先順位が付いていないのと同じなので、そのまま計画に写さないでください。この範囲は読み取れた条件が多く、機械的に付けるとほとんどが「先」に寄ります。**今週の対象は上の並びの先頭 3 件 — ${top3.map((p) => p.item.category.ja).join(' / ')} — に絞り、残りは「次」として扱ってください。** この 3 件は後から作り直すしかない側なので、先に決めた分だけ後の手戻りが減ります。`,
                `**${nowItems.length} of ${items.length} items came out as "Now".** That is the same as having no priority at all, so do not copy it into a plan as-is. This scope stated enough conditions that a mechanical pass pushes nearly everything to the front. **Take the first three above — ${top3.map((p) => p.item.category.en).join(' / ')} — as this week's scope and treat the rest as "Design".** Those three are the ones you can only rebuild later, so settling them early is what removes rework.`,
                l,
              ),
            );
            out.push('');
          }
        }

        out.push(msg('## 全項目', '## All items', l));
        out.push('');
        out.push(
          `| ${label('着手', 'When', l)} | ${label('区分', 'Category', l)} | ${label('要件', 'Requirement', l)} | ${label('検証方法', 'Verification', l)} | ${label('該当フェーズ', 'Phases', l)} |`,
        );
        out.push('| --- | --- | --- | --- | --- |');
        for (const { item, rank } of sorted) {
          const phases = item.phaseIds.map((id) => findPhase(id)?.code ?? id).join(', ');
          const marker = item.regulatedOnly === true ? ` ${label('(規制)', '(regulated)', l)}` : '';
          out.push(
            `| ${rankLabel(rank, l)} | ${compact(item.category, l)}${marker} | ${compact(item.requirement, l)} | ${compact(item.verification, l)} | ${phases} |`,
          );
        }
        out.push('');
        out.push(
          msg(
            '「着手」列は、この範囲の記述から機械的に付けた目安です(先=いま / 次=設計中 / 後=稼働までに)。項目そのものはどれも落とせません。順番の話であって、取捨選択の話ではありません。',
            'The "When" column is a mechanical estimate from your scope text — now, during design, or before go-live. None of the items can be dropped; this is about sequence, not selection.',
            l,
          ),
        );
        out.push('');

        /* 後回しにした項目のうち、この範囲ならではの注意があるものは理由を出す。
           「後回し = 気にしなくてよい」と読まれるのを防ぐ */
        const deferredWithReason = prioritized.filter((p) => p.rank !== 'now' && p.reason !== undefined);
        if (deferredWithReason.length > 0) {
          out.push(
            msg(
              '### 後回しにしたが、この範囲では読み違えやすい項目',
              '### Deferred here, but easy to misread in this scope',
              l,
            ),
          );
          out.push('');
          out.push(
            bullets(
              deferredWithReason.map((p) => ({
                ja: `**${p.item.category.ja}** — ${p.reason?.ja ?? ''}`,
                en: `**${p.item.category.en}** — ${p.reason?.en ?? ''}`,
              })),
              l,
            ),
          );
          out.push('');
        }

        /* --- この範囲に固有の追加観点 --- */
        const extras = scopeSpecificChecks(sit, l);
        if (extras.length > 0) {
          out.push(
            msg(
              '## この範囲では、上の一覧に無い観点も要る',
              '## This scope also needs checks the list above does not cover',
              l,
            ),
          );
          out.push('');
          out.push(
            msg(
              '上の一覧は、どの案件にも共通して必要なものです。読み取った状況からは、これに加えて次が要ります。',
              'The list above is what every engagement needs. From what was read here, these are additionally required.',
              l,
            ),
          );
          out.push('');
          out.push(bullets(extras, l));
          out.push('');
        }

        if (l === 'both') {
          // 表は日本語に寄せているので、英語の要件本文を別立てで出す
          out.push('### English requirement text');
          out.push('');
          for (const item of items) {
            out.push(`- **${item.category.en}** — ${item.requirement.en}`);
            out.push(`  - Verification: ${item.verification.en}`);
          }
          out.push('');
        }

        out.push(msg('## 台帳に入れるときの注意', '## Notes for getting these into the register', l));
        out.push('');
        out.push(
          bullets(
            [
              { ja: '検証方法を先に書くと、要件本文が自然に測定可能になる。「適切に管理する」のような検証不能な文は要件ではない。', en: 'Write the verification first and the requirement text becomes measurable by itself. A sentence you cannot test — "shall be managed appropriately" — is not a requirement.' },
              { ja: '各要件に出典(事業要求 / 規制 / 契約 / 脅威モデル)を付ける。出典の無い要件は削られたときに誰も止められない。', en: 'Attach a source to each — business demand, regulation, contract, or threat model. Requirements without a source have nobody to defend them when they get cut.' },
              { ja: '落とした要件も履歴に残す。落とした理由と承認者は、稼働後に必ず聞かれる。', en: 'Keep dropped requirements in the history with the reason and the approver; both are asked for after go-live.' },
              { ja: '優先度は「守れなかったときの事業影響」で付ける。技術的な難易度で付けない。', en: 'Prioritize by the business impact of failing the requirement, not by how hard it is to implement.' },
            ],
            l,
          ),
        );
        out.push('');

        if (!regulated) {
          // 記述に個人情報・決済が出てくるのに regulated が false のときは、
          // 一般論ではなく「あなたのこの記述が根拠です」と示して促す。
          const regulatedSignals = sit.sensitivityEvidence.filter((w) =>
            SENSITIVITY_WORDS.filter((g) => g.kind === 'personal' || g.kind === 'payment')
              .some((g) => g.words.includes(w)),
          );
          if (regulatedSignals.length > 0) {
            out.push(
              quote(
                `**\`regulated: false\` で呼ばれていますが、この記述には「${regulatedSignals.slice(0, 4).map(cell).join('」「')}」が出てきます。** 個人情報や決済を扱う範囲は、たいてい何らかの外部要求(法令・業界基準・顧客との契約)の対象になります。\`regulated: true\` で呼び直すと、データの所在・保持期間・監査証跡・事故時の報告・委託先への伝播・トレーサビリティの 6 項目が加わります。**適用有無の判断そのものは法務・コンプライアンスの仕事です** — ここでの指摘は「確認しましたか」までです。`,
                `**This was called with \`regulated: false\`, yet the text mentions "${regulatedSignals.slice(0, 4).map(cell).join('", "')}".** Scopes handling personal data or payments are usually subject to some external obligation — statute, industry standard, or a customer contract. Re-running with \`regulated: true\` adds six items: data location, retention, audit trail, incident reporting, flow-down, and traceability. **Deciding what actually applies is legal and compliance's job** — this note only asks whether you checked.`,
                l,
              ),
            );
          } else {
            out.push(
              msg(
                '規制・業界要求・大口顧客との契約が絡む案件では、`regulated: true` で再実行してください。データの所在、保持期間、監査証跡、事故時の報告、委託先への要求の伝播といった項目が追加されます。',
                'If regulation, an industry requirement, or a major customer contract is in play, re-run with `regulated: true` to add items on data location, retention, audit trail, incident reporting, and flow-down to third parties.',
                l,
              ),
            );
          }
          out.push('');
        } else {
          out.push(
            msg(
              '規制項目については、どの規制がこの範囲に適用されるかの判断を法務・コンプライアンス部門に確認してください。アーキテクトが単独で決める範囲ではありません。',
              'For the regulated items, confirm with legal or compliance which obligations actually apply to this scope. That determination is not an architect\'s to make alone.',
              l,
            ),
          );
          out.push('');
        }

        out.push('---');
        out.push('');
        out.push(
          msg(
            '次の一手: `update_engagement` の `deliverables` にセキュリティ要件仕様を登録しておくと、`review_security_posture` の点検対象になります。',
            'Next: register a security requirements specification through `update_engagement` (`deliverables`) so that `review_security_posture` can check against it.',
            l,
          ),
        );
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `チェックリストの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the checklist: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------------------------------------------------------- *
   * review_security_posture
   * ---------------------------------------------------------------- */
  server.registerTool(
    'review_security_posture',
    {
      title: 'Review the engagement for security gaps',
      description:
        '現在のエンゲージメントを読み、セキュリティ観点の抜けを指摘する。セキュリティ担当のステークホルダー不在、重大リスクの担当者・対策の欠落、残存リスクの受容者未設定、セキュリティ成果物の不在、規制関連アクションの期限漏れ、暫定措置の廃棄期限漏れなどを見る。 / Read the current engagement and report security gaps: no security stakeholder, severe risks without an owner or mitigation, accepted risk with no named acceptor, no security deliverables, regulatory actions without a deadline, interim measures with no disposal date, and more.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const engagement = loadEngagement();
        if (!engagement) {
          const guide: string[] = [];
          guide.push(msg('# セキュリティ観点のレビュー', '# Security posture review', l));
          guide.push('');
          guide.push(
            msg(
              'エンゲージメントがまだありません。`start_engagement` で案件を作ってから、もう一度実行してください。',
              'There is no engagement yet. Create one with `start_engagement`, then run this again.',
              l,
            ),
          );
          guide.push('');
          guide.push(
            msg(
              'エンゲージメントを作らずに進めたい場合は、次のツールが単体で使えます。',
              'If you want to proceed without one, these tools work standalone:',
              l,
            ),
          );
          guide.push('');
          guide.push(
            bullets(
              [
                { ja: '`map_security_to_adm` — いまのフェーズで答えておくべきセキュリティ上の問い', en: '`map_security_to_adm` — the security questions to answer in your current phase' },
                { ja: '`threat_model_starter` — 対象システムから脅威モデルの草案', en: '`threat_model_starter` — a threat model draft from a system description' },
                { ja: '`security_requirements_checklist` — 台帳に入れるべきセキュリティ要件', en: '`security_requirements_checklist` — the security requirements to register' },
              ],
              l,
            ),
          );
          return textResult(guide.join('\n'));
        }

        const findings = collectSecurityFindings(engagement, l);
        const good = collectSecurityStrengths(engagement);

        const out: string[] = [];
        out.push(msg('# セキュリティ観点のレビュー', '# Security posture review', l));
        out.push('');
        out.push(`- ${label('対象', 'Engagement', l)}: ${oneLine(engagement.name)}`);
        out.push(`- ${label('現在フェーズ', 'Current phase', l)}: ${phaseLabel(engagement.currentPhaseId, l)}`);
        out.push(
          `- ${label('指摘', 'Findings', l)}: ${findings.length} (${severityLabel('high', l)} ${findings.filter((f) => f.severity === 'high').length}, ${severityLabel('medium', l)} ${findings.filter((f) => f.severity === 'medium').length}, ${severityLabel('low', l)} ${findings.filter((f) => f.severity === 'low').length})`,
        );
        out.push('');

        if (findings.length === 0) {
          out.push(
            msg(
              'このツールが機械的に見ている範囲では、抜けは見つかりませんでした。ただしこれは登録されている情報の形式的な点検であって、統制の中身が妥当かどうかは判断していません。',
              'Nothing was found within what this tool can check mechanically. Note that this inspects the shape of what is recorded; it says nothing about whether the controls themselves are adequate.',
              l,
            ),
          );
          out.push('');
        } else {
          out.push(msg('## 指摘', '## Findings', l));
          out.push('');
          const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
          const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
          for (const f of sorted) {
            out.push(`### ${severityLabel(f.severity, l)} ${text(f.title, l)}`);
            out.push('');
            out.push(text(f.detail, l));
            if (f.evidence.length > 0) {
              out.push('');
              out.push(firstFew(f.evidence, 5, l));
            }
            out.push('');
            out.push(`- ${label('次の一手', 'Next move', l)}: ${text(f.action, l)}`);
            out.push('');
          }
        }

        if (good.length > 0) {
          out.push(msg('## 押さえられている点', '## Already in place', l));
          out.push('');
          out.push(bullets(good, l));
          out.push('');
        }

        out.push(msg('## この点検が見ていないこと', '## What this review does not check', l));
        out.push('');
        out.push(
          bullets(
            [
              { ja: '統制の中身の妥当性(登録されているかどうかしか見ていない)', en: 'Whether the controls are adequate — only whether they are recorded' },
              { ja: '実装が設計どおりかどうか(実機の確認は別途必要)', en: 'Whether the build matches the design — that needs inspection of the running system' },
              { ja: 'どの規制がこの案件に適用されるか(法務・コンプライアンス部門の判断)', en: 'Which regulations apply to this engagement — that is for legal and compliance to determine' },
            ],
            l,
          ),
        );
        out.push('');
        out.push('---');
        out.push('');
        out.push(`> ${text(DISCLAIMER, l)}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          msg(
            `レビューに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `The review failed: ${error instanceof Error ? error.message : String(error)}`,
            lang as Lang,
          ),
        );
      }
    },
  );
}

/* ------------------------------------------------------------------ *
 * review_security_posture の中身
 * ------------------------------------------------------------------ */

type Severity = 'high' | 'medium' | 'low';

interface SecurityFinding {
  severity: Severity;
  title: Bilingual;
  detail: Bilingual;
  /** 根拠になった項目(タイトルや ID) */
  evidence: string[];
  action: Bilingual;
}

function severityLabel(severity: Severity, lang: Lang): string {
  if (severity === 'high') return msg('[高]', '[High]', lang === 'both' ? 'ja' : lang);
  if (severity === 'medium') return msg('[中]', '[Medium]', lang === 'both' ? 'ja' : lang);
  return msg('[低]', '[Low]', lang === 'both' ? 'ja' : lang);
}

/**
 * 組織名・会議体名の末尾に来る語。
 * 「部」「課」を部分一致で見ると阿部・服部・渡部といった姓を組織と誤判定するため、
 * 末尾一致でのみ使い、2 文字の値(姓だけの入力)は対象外にする。
 */
const ORG_SUFFIXES = [
  '部', '課', '室', '本部', '部門', '事業部', 'チーム', '委員会', '会議', '会議体',
  'グループ', 'センター',
];

/** 位置に関係なく組織を強く示す語(個人名には現れない) */
const ORG_WORDS = [
  '全社', '委員会', '本部', '事業部', '経営会議',
  'team', 'department', 'committee', 'division', 'board', 'group', 'office',
];

/** 受容者が個人ではなく組織を指していそうかの簡易判定 */
function looksOrgLike(owner: string): boolean {
  const value = oneLine(owner);
  if (value.length === 0) return false;
  if (value.length >= 3 && ORG_SUFFIXES.some((s) => value.endsWith(s))) return true;
  return matchesAny(value, ORG_WORDS);
}

/** エンゲージメントにセキュリティ成果物が登録されているか */
function securityDeliverables(engagement: Engagement): { name: string; id: string }[] {
  const hits: { name: string; id: string }[] = [];
  for (const d of engagement.deliverables) {
    const byId = d.deliverableId ? findSecurityArtifact(d.deliverableId) : undefined;
    if (byId || matchesAny(`${d.name} ${d.note ?? ''}`, SECURITY_KEYWORDS)) {
      hits.push({ name: d.name, id: d.id });
    }
  }
  return hits;
}

function collectSecurityFindings(engagement: Engagement, lang: Lang): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  /* 1. セキュリティ担当のステークホルダーが不在 */
  const securityStakeholders = engagement.stakeholders.filter((s) =>
    matchesAny([s.name, s.role ?? '', s.organization ?? '', ...s.concerns].join(' '), SECURITY_ROLE_KEYWORDS),
  );
  if (securityStakeholders.length === 0) {
    findings.push({
      severity: 'high',
      title: { ja: 'セキュリティ担当のステークホルダーが登録されていない', en: 'No security stakeholder is registered' },
      detail: {
        ja: `登録されているステークホルダー ${engagement.stakeholders.length} 名のうち、セキュリティ・リスク・コンプライアンス・監査のいずれかを担う人が見当たりません。この状態で設計を進めると、セキュリティは最後にレビューする役になり、指摘が構造に関わるものだったときに直せません。`,
        en: `None of the ${engagement.stakeholders.length} registered stakeholders appears to carry security, risk, compliance, or audit. Design proceeding from here puts security in the position of reviewing last, at which point structural findings can no longer be fixed.`,
      },
      evidence: [],
      action: {
        ja: 'セキュリティ側の意思決定者を 1 名特定し、関心事(規制順守 / 事故ゼロ / 運用負荷のどれか)を書いて `update_engagement` の `stakeholders` に登録する。フェーズ A のうちに 1 時間だけ同席させる。',
        en: 'Identify one decision-maker on the security side, write down what they actually care about — compliance, zero incidents, or operational load — and register them via `update_engagement` (`stakeholders`). Get them in the room for an hour while still in Phase A.',
      },
    });
  }

  /* 2. 重大リスクに担当者または対策が無い */
  const severeOpen = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && r.status !== 'closed',
  );
  const severeIncomplete = severeOpen.filter((r) => isBlank(r.owner) || isBlank(r.mitigation));
  if (severeIncomplete.length > 0) {
    findings.push({
      severity: 'high',
      title: { ja: '重大リスクに担当者または対策が入っていない', en: 'Severe risks lack an owner or a mitigation' },
      detail: {
        ja: `critical / high のリスク ${severeOpen.length} 件のうち ${severeIncomplete.length} 件で、担当者か対策のどちらかが空です。担当者のいないリスクは進捗が測れず、対策の無いリスクは実質的に受容しているのと同じですが、受容の記録も残っていません。`,
        en: `Of ${severeOpen.length} critical/high risks, ${severeIncomplete.length} are missing either an owner or a mitigation. A risk with no owner cannot be tracked, and a risk with no mitigation is being accepted in practice — without any record of acceptance.`,
      },
      evidence: severeIncomplete.map((r) => {
        const missing: string[] = [];
        if (isBlank(r.owner)) missing.push(msg('担当者', 'owner', lang === 'both' ? 'ja' : lang));
        if (isBlank(r.mitigation)) missing.push(msg('対策', 'mitigation', lang === 'both' ? 'ja' : lang));
        return `${oneLine(r.title)} (\`${r.id}\`, ${r.level}) — ${msg('未設定', 'missing', lang === 'both' ? 'ja' : lang)}: ${missing.join(', ')}`;
      }),
      action: {
        ja: '各リスクに個人名の担当者を付ける。対策が決まらないものは、対策を考えるためのアクションを期限付きで作るか、残存リスクとして受容手続きに回す。',
        en: 'Give each risk a named individual. Where no mitigation is settled, either raise a dated action to decide one or move it into the residual-risk acceptance path.',
      },
    });
  }

  /* 3. 受容したリスクに受容者がいない / 組織名になっている */
  const accepted = engagement.risks.filter((r) => r.status === 'accepted');
  const acceptedNoOwner = accepted.filter((r) => isBlank(r.owner));
  if (acceptedNoOwner.length > 0) {
    findings.push({
      severity: 'high',
      title: { ja: '残存リスクの受容者が設定されていない', en: 'Accepted risks have no acceptor' },
      detail: {
        ja: `受容済みとされているリスク ${accepted.length} 件のうち ${acceptedNoOwner.length} 件に受容者がいません。受容者のいない受容は、事故が起きたときに誰も自分の判断だと認識せず、対応が止まります。`,
        en: `Of ${accepted.length} risks marked accepted, ${acceptedNoOwner.length} name nobody. An acceptance with no acceptor means that when the incident lands, nobody recognizes it as their decision and the response stalls.`,
      },
      evidence: acceptedNoOwner.map((r) => `${oneLine(r.title)} (\`${r.id}\`, ${r.level})`),
      action: {
        ja: '個人名と役職を `owner` に入れ、受容の有効期限と再確認の担当を決定事項として `decisions` に記録する。埋まらないなら、それはまだ受容されていない。',
        en: 'Put an individual name and role in `owner`, and record the acceptance expiry plus the re-confirmation owner as a decision. If those fields cannot be filled, the risk is not actually accepted.',
      },
    });
  }

  const acceptedOrgLike = accepted.filter((r) => !isBlank(r.owner) && looksOrgLike(r.owner ?? ''));
  if (acceptedOrgLike.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '残存リスクの受容者が組織名になっている可能性', en: 'The residual-risk acceptor may be an org chart box' },
      detail: {
        ja: '受容者の欄が部門名・会議体名に見えます。組織は署名できません。事故後に「あれは自分の判断ではない」と全員が言える状態になります。',
        en: 'The acceptor field reads as a department or a committee. Organizations cannot sign. After an incident, everyone can truthfully say it was not their call.',
      },
      evidence: acceptedOrgLike.map((r) => `${oneLine(r.title)} (\`${r.id}\`) — ${oneLine(r.owner ?? '')}`),
      action: {
        ja: '会議体で決めた場合でも、署名する個人を 1 名決めて `owner` に書く(役職も併記する)。',
        en: 'Even when a committee decided, name the one individual who signs and put them in `owner`, with their role.',
      },
    });
  }

  /* 4. セキュリティ成果物が 1 件も無い */
  const secDeliverables = securityDeliverables(engagement);
  if (secDeliverables.length === 0) {
    findings.push({
      severity: 'high',
      title: { ja: 'セキュリティ成果物が 1 件も登録されていない', en: 'No security deliverable is registered' },
      detail: {
        ja: `登録されている成果物 ${engagement.deliverables.length} 件の中に、セキュリティに関するものが見当たりません。セキュリティの検討は行われていても、成果物として残っていなければ引き継げず、監査でも示せません。`,
        en: `None of the ${engagement.deliverables.length} registered deliverables appears to be about security. Even if the thinking happened, without an artifact it cannot be handed over and cannot be shown at audit.`,
      },
      evidence: [],
      action: {
        ja: 'まずは信頼境界図 (`trust-boundary-diagram`) と脅威モデル (`threat-model`) の 2 点を `update_engagement` の `deliverables` に登録する。`map_security_to_adm` に現在フェーズを渡すと、そのフェーズで作るべきものが分かる。',
        en: 'Start by registering the trust boundary diagram (`trust-boundary-diagram`) and the threat model (`threat-model`) via `update_engagement` (`deliverables`). Pass your current phase to `map_security_to_adm` to see what belongs there.',
      },
    });
  }

  /* 5. 規制関連のアクションに期限が無い */
  const regActions = engagement.actions.filter(
    (a) => a.status !== 'done' && matchesAny(`${a.title} ${a.note ?? ''}`, REGULATORY_KEYWORDS),
  );
  const regNoDue = regActions.filter((a) => isBlank(a.due));
  if (regNoDue.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '規制関連のアクションに期限が入っていない', en: 'Regulatory actions carry no deadline' },
      detail: {
        ja: `規制・監査・コンプライアンスに関係しそうなアクション ${regActions.length} 件のうち ${regNoDue.length} 件が期限なしです。規制由来の作業は期日が外から与えられるため、期限が無いと他の施策と同じ優先度で扱われ、リソース調整のたびに後ろへずれます。`,
        en: `Of ${regActions.length} actions that look regulatory, audit-, or compliance-related, ${regNoDue.length} have no due date. Regulatory work has its deadline imposed from outside; without one recorded it sits at the same priority as everything else and slips at every resourcing conversation.`,
      },
      evidence: regNoDue.map((a) => `${oneLine(a.title)} (\`${a.id}\`)`),
      action: {
        ja: '外部から与えられている期日を確認し、そこから逆算した社内の期限を `due` に入れる。さらに、移行アーキテクチャの目標時期そのものに埋め込んで固定制約にする。',
        en: 'Confirm the externally imposed date, work backwards to an internal deadline, and put it in `due`. Then bake it into the target date of a transition state so it becomes a fixed constraint.',
      },
    });
  }

  /* 6. 暫定措置に廃棄期限が無い */
  const interimNoDisposal = engagement.transitions.filter(
    (t) => !isBlank(t.interim) && isBlank(t.disposalPlan),
  );
  if (interimNoDisposal.length > 0) {
    findings.push({
      severity: 'medium',
      title: { ja: '暫定措置に廃棄計画・期限が無い', en: 'Interim measures have no disposal plan' },
      detail: {
        ja: '移行期間だけのはずの仮の連携や広めの権限は、廃棄期限と責任者が無いと必ず残ります。数年後には用途を誰も説明できない経路になり、攻撃面が恒久的に広がります。',
        en: 'Temporary interfaces and over-broad permissions meant only for the cutover always survive when nobody owns a disposal date. Years later they are paths nobody can explain, and the attack surface has widened permanently.',
      },
      evidence: interimNoDisposal.map((t) => `${oneLine(t.name)} (\`${t.id}\`) — ${oneLine(t.interim ?? '')}`),
      action: {
        ja: '各暫定措置に廃棄期限と責任者を書き、その期限をアクションとしても登録する(移行完了時に自動で消えることはない)。',
        en: 'Give each interim measure a disposal date and an owner, and register that date as an action too — it will not disappear on its own when the migration finishes.',
      },
    });
  }

  /* 7. 設計・実装フェーズに入っているのに脅威モデルが無い */
  const latePhases = ['d', 'e', 'f', 'g', 'h'];
  const hasThreatModel = engagement.deliverables.some(
    (d) =>
      d.deliverableId === 'threat-model' ||
      matchesAny(`${d.name} ${d.note ?? ''}`, ['脅威', 'threat', 'threat model']),
  );
  if (latePhases.includes(engagement.currentPhaseId) && !hasThreatModel) {
    findings.push({
      severity: 'medium',
      title: { ja: '技術設計以降のフェーズなのに脅威モデルが無い', en: 'Past technology design with no threat model' },
      detail: {
        ja: `現在フェーズは ${phaseLabel(engagement.currentPhaseId, 'ja')} ですが、脅威モデルにあたる成果物が登録されていません。この時点で構造に関わる指摘が出ると、設計をやり直せず例外承認で押し切ることになります。`,
        en: `The current phase is ${phaseLabel(engagement.currentPhaseId, 'en')} but no threat model is registered. A structural finding arriving now cannot be designed away, so it gets pushed through on a waiver instead.`,
      },
      evidence: [],
      action: {
        ja: '`threat_model_starter` に対象システムの説明を渡して草案を作り、境界をまたぐデータフローだけで 1 周する。完璧な列挙は狙わない。',
        en: 'Pass a system description to `threat_model_starter` and do one pass over just the flows that cross a boundary. Do not chase completeness.',
      },
    });
  }

  /* 8. リスクが 1 件も登録されていない */
  if (engagement.risks.length === 0) {
    findings.push({
      severity: 'medium',
      title: { ja: 'リスクが 1 件も登録されていない', en: 'No risks are registered at all' },
      detail: {
        ja: 'リスク台帳が空です。リスクが無い案件はまず存在しないので、これは「見つかっていない」か「口頭で共有されているだけ」のどちらかです。どちらも引き継げません。',
        en: 'The risk register is empty. Engagements with no risks essentially do not exist, so this means either they have not been found or they are only being shared verbally. Neither survives a handover.',
      },
      evidence: [],
      action: {
        ja: 'まず現時点で分かっている懸念を 3 件でよいので登録する。レベル・担当者・対策の 3 列を埋められないものは、そのこと自体が指摘になる。',
        en: 'Register just three known concerns to begin with. Any of them where you cannot fill level, owner, and mitigation is itself the finding.',
      },
    });
  }

  /* 9. セキュリティに関する決定事項が残っていない */
  const secDecisions = engagement.decisions.filter((d) =>
    matchesAny(`${d.title} ${d.decision} ${d.context ?? ''} ${d.rationale ?? ''}`, SECURITY_KEYWORDS),
  );
  if (secDecisions.length === 0 && engagement.decisions.length > 0) {
    findings.push({
      severity: 'low',
      title: { ja: 'セキュリティに関する決定事項が記録されていない', en: 'No security decision has been recorded' },
      detail: {
        ja: `決定事項 ${engagement.decisions.length} 件のうち、セキュリティに関するものが見当たりません。認証方式・情報分類・鍵の扱い・残存リスクの受容といった判断は、後から必ず根拠を問われます。`,
        en: `None of the ${engagement.decisions.length} recorded decisions concerns security. Choices about authentication, classification, key handling, and residual-risk acceptance are exactly the ones whose rationale gets questioned later.`,
      },
      evidence: [],
      action: {
        ja: 'すでに決まっているセキュリティ上の判断(認証方式、情報分類の区分、鍵の保管場所など)を、検討した選択肢と根拠込みで `decisions` に残す。',
        en: 'Record the security choices already made — authentication method, classification tiers, where keys live — into `decisions` with the options considered and the rationale.',
      },
    });
  }

  /* 10. 残存リスクの水準が記録されていない */
  const withoutResidual = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && r.status !== 'closed' && r.residualLevel === undefined,
  );
  if (withoutResidual.length > 0) {
    findings.push({
      severity: 'low',
      title: { ja: '対策後に残るリスク水準が記録されていない', en: 'The post-mitigation risk level is not recorded' },
      detail: {
        ja: `重大リスク ${withoutResidual.length} 件で、対策後に残る水準 (residualLevel) が空です。ここが空だと「対策したので大丈夫」という言い方が通ってしまい、受容の判断が発生しません。`,
        en: `${withoutResidual.length} severe risks have no residual level recorded. With that field empty, "we mitigated it" passes as an answer and no acceptance decision ever takes place.`,
      },
      evidence: withoutResidual.map((r) => `${oneLine(r.title)} (\`${r.id}\`, ${r.level})`),
      action: {
        ja: '対策後に残る水準を入れる。high 以上が残るなら、受容者・有効期限・再確認担当を決めて残存リスク受容記録に落とす。',
        en: 'Fill in the level that remains after mitigation. If it is still high or above, take it to a residual-risk acceptance record with an acceptor, an expiry, and a re-confirmation owner.',
      },
    });
  }

  return findings;
}

/** 押さえられている点(指摘だけだと現状が読めないので併記する) */
function collectSecurityStrengths(engagement: Engagement): Bilingual[] {
  const good: Bilingual[] = [];

  const securityStakeholders = engagement.stakeholders.filter((s) =>
    matchesAny([s.name, s.role ?? '', s.organization ?? '', ...s.concerns].join(' '), SECURITY_ROLE_KEYWORDS),
  );
  if (securityStakeholders.length > 0) {
    good.push({
      ja: `セキュリティ側のステークホルダーが ${securityStakeholders.length} 名登録されている(${securityStakeholders.map((s) => oneLine(s.name)).join(', ')})`,
      en: `${securityStakeholders.length} security-side stakeholders are registered (${securityStakeholders.map((s) => oneLine(s.name)).join(', ')})`,
    });
  }

  const secDeliverables = securityDeliverables(engagement);
  if (secDeliverables.length > 0) {
    good.push({
      ja: `セキュリティ関連の成果物が ${secDeliverables.length} 件登録されている(${secDeliverables.map((d) => oneLine(d.name)).slice(0, 3).join(', ')}${secDeliverables.length > 3 ? ' ほか' : ''})`,
      en: `${secDeliverables.length} security-related deliverables are registered (${secDeliverables.map((d) => oneLine(d.name)).slice(0, 3).join(', ')}${secDeliverables.length > 3 ? ', and more' : ''})`,
    });
  }

  const ownedSevere = engagement.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && !isBlank(r.owner) && !isBlank(r.mitigation),
  );
  if (ownedSevere.length > 0) {
    good.push({
      ja: `重大リスク ${ownedSevere.length} 件に担当者と対策の両方が入っている`,
      en: `${ownedSevere.length} severe risks carry both an owner and a mitigation`,
    });
  }

  const disposalPlanned = engagement.transitions.filter(
    (t) => !isBlank(t.interim) && !isBlank(t.disposalPlan),
  );
  if (disposalPlanned.length > 0) {
    good.push({
      ja: `暫定措置 ${disposalPlanned.length} 件に廃棄計画が付いている`,
      en: `${disposalPlanned.length} interim measures carry a disposal plan`,
    });
  }

  const secDecisions = engagement.decisions.filter((d) =>
    matchesAny(`${d.title} ${d.decision} ${d.context ?? ''} ${d.rationale ?? ''}`, SECURITY_KEYWORDS),
  );
  if (secDecisions.length > 0) {
    good.push({
      ja: `セキュリティに関する決定事項が ${secDecisions.length} 件記録されている`,
      en: `${secDecisions.length} security-related decisions are on record`,
    });
  }

  return good;
}
