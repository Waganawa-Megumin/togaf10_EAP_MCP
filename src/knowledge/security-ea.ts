/**
 * セキュリティ EA の知識ベース / Security enterprise-architecture knowledge base.
 *
 * TOGAF ADM はセキュリティを一つの関心事として扱うが、そこを掘り下げる手順は持たない。
 * 実務では SABSA(The SABSA Institute が公開しているセキュリティアーキテクチャの手法)の
 * 層構造を借りて補うことが多い。ただし「ADM のどこで SABSA のどの層を回すのか」は
 * どこにも書いていないので、多くの現場で使いこなせずに終わる。この知識ベースはその
 * 対応関係を埋めることだけを目的にしている。
 *
 * 記載しているのは名称・層の数・軸といった構造上の事実と、
 * 「実務で何を決めるのか / どこで間違えるのか」という独自の解説のみ。
 * SABSA / TOGAF / その他の標準の原文は一切転載しない。
 */

import type { Bilingual } from './types.js';

/* ------------------------------------------------------------------ *
 * 型定義
 * ------------------------------------------------------------------ */

/** SABSA の層(6 層) */
export interface SabsaLayer {
  id: string;
  /** 層の名称(構造上の事実) */
  name: Bilingual;
  /** 誰の目線で見る層か */
  viewpoint: Bilingual;
  /** この層を回す実務上の狙い */
  purpose: Bilingual;
  /** この層で決めきるもの */
  decisions: Bilingual[];
  /** 決めそこねたときに後で起きること */
  pitfalls: Bilingual[];
  /** 並走させる ADM フェーズ ID */
  phaseIds: string[];
  keywords: string[];
}

/** SABSA の 6 つの問い(マトリクスの列) */
export interface SabsaQuestion {
  id: string;
  /** 問いの見出し(What / Why / How / Who / Where / When) */
  name: Bilingual;
  /** 何を扱う列か */
  focus: Bilingual;
  /** 各層でこの列を埋めるときに実際に投げる質問 */
  askInPractice: Bilingual[];
}

/** ADM フェーズ 1 つに対するセキュリティの並走計画 */
export interface SecurityPhaseMapping {
  /** 実在する ADM フェーズ ID */
  phaseId: string;
  /** 並走させる SABSA 層 ID */
  layerIds: string[];
  /** そのフェーズを抜ける前に必ず答えが出ている必要がある問い */
  mustAnswer: Bilingual[];
  /** そのフェーズで着手・更新するセキュリティ成果物 ID */
  artifactIds: string[];
  /** 「終わった」と言ってよい条件 */
  exitCriteria: Bilingual[];
}

/** セキュリティアーキテクチャの成果物 */
export interface SecurityArtifact {
  id: string;
  name: Bilingual;
  summary: Bilingual;
  /** 記載項目 */
  contents: Bilingual[];
  /** 作成のコツ */
  tips: Bilingual[];
  /** 主に作成・更新する ADM フェーズ ID */
  phaseIds: string[];
  /** 対応する SABSA 層 ID */
  layerIds: string[];
  keywords: string[];
}

/** よくある失敗パターン */
export interface SecurityPitfall {
  id: string;
  name: Bilingual;
  /** 現場で見える症状 */
  symptom: Bilingual;
  /** 放置した結果 */
  consequence: Bilingual;
  /** 直し方 */
  fix: Bilingual;
  phaseIds: string[];
}

/** 脅威モデリングの観点(6 分類) */
export interface ThreatLens {
  id: string;
  name: Bilingual;
  /** この観点が問題にしていること */
  meaning: Bilingual;
  /** 資産ごとに投げる質問 */
  questions: Bilingual[];
  /** 対策として検討する打ち手の型 */
  controlTypes: Bilingual[];
}

/** ID 管理すべきセキュリティ要件 1 件 */
export interface SecurityRequirementItem {
  id: string;
  category: Bilingual;
  /** 要件本文の書き出し(このまま使わず、対象システムの言葉に置き換える) */
  requirement: Bilingual;
  /** 満たしたことをどう確かめるか */
  verification: Bilingual;
  /** 規制対象のときだけ出す項目 */
  regulatedOnly?: boolean;
  phaseIds: string[];
}

/* ------------------------------------------------------------------ *
 * SABSA の層(6 層)
 * ------------------------------------------------------------------ */

export const SABSA_LAYERS: SabsaLayer[] = [
  {
    id: 'contextual',
    name: { ja: '文脈層', en: 'Contextual' },
    viewpoint: { ja: '事業の意思決定者から見た景色', en: 'The view from the people who own the business outcome' },
    purpose: {
      ja: 'セキュリティの話を「守りたい事業成果」と「失ったときの損害」に翻訳し、後工程で統制の強さを議論するための物差しを作る層。技術の話はまだ一切しない。',
      en: 'Translate security into the business outcome being protected and the damage of losing it, producing the yardstick every later argument about control strength will be measured against. No technology talk yet.',
    },
    decisions: [
      { ja: '守る対象の事業成果と、停止・漏えい時の損害の大きさ(金額・時間・信用のいずれかで表現する)', en: 'Which business outcomes are protected, and the size of the damage if they stop or leak — expressed in money, time, or reputation' },
      { ja: 'リスクをどこまで受け入れるかの水準と、それを宣言する権限を持つ人(役職ではなく個人)', en: 'How much risk is acceptable, and the individual — not the job title — with the authority to declare it' },
      { ja: '規制・契約・監査で外せない制約と、その期日', en: 'Regulatory, contractual, and audit constraints that cannot be negotiated away, with their deadlines' },
      { ja: 'セキュリティの意思決定に参加する関係者と、それぞれの関心事', en: 'Who takes part in security decisions and what each of them actually cares about' },
    ],
    pitfalls: [
      { ja: '損害の大きさを数字にしないまま進むと、以降すべての議論が「不安の強さ比べ」になり、予算がついた分だけ対策する形に落ちる。', en: 'Skipping the number for damage turns every later discussion into a contest of who sounds most worried, and controls end up sized by budget rather than risk.' },
      { ja: '受容の権限者を決めないと、最後に誰も残存リスクに署名できず、稼働直前で止まる。', en: 'Without a named risk acceptor, nobody can sign off the residual risk and the project stalls days before go-live.' },
    ],
    phaseIds: ['preliminary', 'a', 'b'],
    keywords: ['contextual', '文脈', 'business risk', '事業リスク', 'リスク許容度', 'risk appetite', '規制', 'regulation'],
  },
  {
    id: 'conceptual',
    name: { ja: '概念層', en: 'Conceptual' },
    viewpoint: { ja: 'アーキテクトから見た景色', en: 'The view from the architect' },
    purpose: {
      ja: '個別の設計をいちいち議論しなくて済むように、判断の型を先に決める層。ここが空だとレビューが人依存になり、レビュアーが替わるたびに結論が変わる。',
      en: 'Fix the decision patterns up front so that individual designs do not each need a debate. Leave this layer empty and reviews become person-dependent — swap the reviewer and the answer changes.',
    },
    decisions: [
      { ja: 'セキュリティ原則(多くて 5〜7 個。トレードオフのときにどちらを取るかが読み取れる形にする)', en: 'Security principles — five to seven at most, written so a reader can tell which side wins in a trade-off' },
      { ja: '情報分類の区分と、区分ごとの取り扱いルール(区分名だけ作っても運用は変わらない)', en: 'Information classification tiers and the handling rules per tier — naming the tiers alone changes nothing in practice' },
      { ja: '信頼ドメインの分け方(どこからどこまでを「同じ信頼度」として扱うか)', en: 'How trust domains are carved up — what counts as the same level of trust' },
      { ja: '予防・検知・回復のどこに重みを置くかの方針(全部に均等配分はできない)', en: 'Where the weight goes across prevention, detection, and recovery — an even split across all three is not a choice' },
    ],
    pitfalls: [
      { ja: '原則が「セキュリティを確保する」のような同語反復になっていると、実際の設計判断に一度も使われない。', en: 'Principles that read as tautologies ("we shall be secure") are never once used to settle a design decision.' },
      { ja: '分類区分を 5 段階以上に細かくすると、現場が区分を選べず、全部が中間の区分に集まる。', en: 'More than four or five tiers and practitioners cannot pick one, so everything lands in the middle tier.' },
    ],
    phaseIds: ['a', 'b', 'requirements-management'],
    keywords: ['conceptual', '概念', 'セキュリティ原則', 'security principles', '情報分類', 'classification', 'trust domain'],
  },
  {
    id: 'logical',
    name: { ja: '論理層', en: 'Logical' },
    viewpoint: { ja: '設計者から見た景色', en: 'The view from the designer' },
    purpose: {
      ja: '製品名を一切出さずに「どういう仕組みで守るのか」を確定させる層。ここを飛ばすと製品選定が先に走り、その製品にできることの範囲がそのまま要件になってしまう。',
      en: 'Settle the mechanism without naming a single product. Skip it and procurement runs first, after which whatever the chosen product happens to do becomes the requirement.',
    },
    decisions: [
      { ja: '認証・認可のモデル(誰がどの権限をどう獲得し、いつ失うか)', en: 'The authentication and authorization model — how someone gains a permission and when they lose it' },
      { ja: 'データフローと信頼境界の位置(境界をまたぐ都度、何を検査するか)', en: 'Data flows and where the trust boundaries sit, plus what is checked at each crossing' },
      { ja: 'アイデンティティと鍵のライフサイクル(発行・更新・失効・棚卸し)', en: 'The lifecycle of identities and keys: issue, rotate, revoke, and review' },
      { ja: '証跡として残す事象の一覧(「あとで調べられること」を先に決める)', en: 'The list of events kept as evidence — decide up front what will be answerable later' },
    ],
    pitfalls: [
      { ja: '認可を「ロールを作る」で終わらせると、ロールが増え続けて誰も棚卸しできなくなる。ロールの発生条件と消滅条件まで書く。', en: 'Stopping at "we will define roles" breeds roles nobody can ever review. Write down what creates a role and what retires it.' },
      { ja: '信頼境界を絵に描いただけで、境界で何を検査するかを書かないと、実装時に素通りする。', en: 'A boundary drawn but not accompanied by what gets inspected at it is a boundary implementers will walk straight through.' },
    ],
    phaseIds: ['b', 'c', 'requirements-management'],
    keywords: ['logical', '論理', '認証', '認可', 'authentication', 'authorization', 'trust boundary', '信頼境界', 'データフロー'],
  },
  {
    id: 'physical',
    name: { ja: '物理層', en: 'Physical' },
    viewpoint: { ja: '構築担当から見た景色', en: 'The view from the builder' },
    purpose: {
      ja: '論理層で決めた仕組みを、具体的な技術方式・配置・保持期間に落とす層。監査で問われるのはたいていこの層の中身なので、説明できない差分をここで潰す。',
      en: 'Turn the mechanism into concrete technical choices, placement, and retention. Audits almost always land on this layer, so this is where unexplainable variation must be eliminated.',
    },
    decisions: [
      { ja: '暗号方式と鍵の保管場所、鍵ごとの所有者', en: 'Cryptographic schemes, where keys live, and who owns each key' },
      { ja: 'ネットワークと実行環境のゾーニング(ゾーン間で許可する通信を明示する)', en: 'Network and runtime zoning, with the permitted traffic between zones stated explicitly' },
      { ja: 'データの保存場所と保持期間、削除の方式', en: 'Where data is stored, how long it is kept, and how it is destroyed' },
      { ja: 'バックアップと復旧の方式、復旧演習の頻度', en: 'Backup and recovery mechanics, and how often recovery is actually rehearsed' },
    ],
    pitfalls: [
      { ja: '本番だけ設計し、検証・開発環境を対象外にすると、本番データのコピーが最も弱い環境に置かれる。', en: 'Designing production only leaves copies of production data sitting in the weakest environment you own.' },
      { ja: '保持期間を「無期限」にすると、漏えい時の影響範囲が年々広がる。消す設計も設計のうち。', en: '"Retain indefinitely" grows your breach blast radius every year. Deletion is part of the design.' },
    ],
    phaseIds: ['c', 'd'],
    keywords: ['physical', '物理', '暗号', 'encryption', '鍵管理', 'key management', 'ゾーニング', 'zoning', '保持期間', 'retention'],
  },
  {
    id: 'component',
    name: { ja: 'コンポーネント層', en: 'Component' },
    viewpoint: { ja: '製品・設定・コードの粒度', en: 'The granularity of products, settings, and code' },
    purpose: {
      ja: '実際に導入する製品・設定値・検査を決める層。「導入したが設定は既定のまま」を防ぐのがこの層の仕事で、統制が名目になるかどうかはここで決まる。',
      en: 'Pin down the actual products, settings, and checks. This layer exists to stop "we bought it but left the defaults", which is the single most common way a control becomes nominal.',
    },
    decisions: [
      { ja: '採用する製品・サービスとバージョン、サポート終了時期', en: 'Which products and services, at which versions, and when their support ends' },
      { ja: '設定基準(ベースライン)と、そこからの逸脱を検知する方法', en: 'The configuration baseline and how drift away from it is detected' },
      { ja: '秘密情報(資格情報・鍵・トークン)の置き場と受け渡し方', en: 'Where secrets live and how they are handed to the things that need them' },
      { ja: '開発工程に組み込む検査(静的解析・依存関係・イメージ検査)と不合格時の扱い', en: 'Which checks run in the pipeline — static analysis, dependencies, images — and what a failure blocks' },
    ],
    pitfalls: [
      { ja: '検査を導入したが警告を落としても通る設定にすると、検査結果は「見なかったことにする対象」になる。', en: 'A scanner that warns but never blocks quickly becomes a thing people learn to ignore.' },
      { ja: 'ベースラインを文書だけで持つと、半年後の実機と一致しない。差分検知まで含めて設計する。', en: 'A baseline that lives only in a document will not match the running system in six months. Design the drift detection with it.' },
    ],
    phaseIds: ['d', 'e', 'f'],
    keywords: ['component', 'コンポーネント', 'ベースライン', 'baseline', 'secrets', '秘密情報', '脆弱性検査', 'scanning'],
  },
  {
    id: 'operational',
    name: { ja: '運用層', en: 'Operational' },
    viewpoint: { ja: '運用・管理する人から見た景色', en: 'The view from the people who run it' },
    purpose: {
      ja: '決めた統制を回し続ける仕組みを作る層。稼働直後は守れていて半年後に崩れる、という典型的な劣化はこの層の空白から起きる。他の 5 層と違い、全フェーズに並走する。',
      en: 'Build the machinery that keeps controls working. The classic decay — compliant at go-live, broken six months later — comes from leaving this layer blank. Unlike the other five, it runs alongside every phase.',
    },
    decisions: [
      { ja: '監視と一次対応の体制、当番、連絡経路(夜間・休日を含む)', en: 'Monitoring and first-response staffing, the rota, and escalation paths including nights and weekends' },
      { ja: '権限棚卸し・鍵ローテーション・証明書更新の周期と、実施証跡の残し方', en: 'The cadence for access reviews, key rotation, and certificate renewal — and where the evidence of each lands' },
      { ja: '脆弱性のトリアージ基準と、深刻度ごとの是正期限', en: 'Vulnerability triage criteria and the remediation deadline per severity' },
      { ja: '再評価の引き金(この変更が起きたら脅威モデルを見直す、という条件)', en: 'The triggers that force re-assessment — the specific changes that require revisiting the threat model' },
    ],
    pitfalls: [
      { ja: '「ログを取っている」で終わらせると、誰がいつ何を見るのかが決まらず、検知は実質ゼロになる。', en: '"We collect logs" without who looks at what and when means detection capability is effectively zero.' },
      { ja: '是正期限を決めないと、脆弱性一覧が積み上がるだけの台帳になり、監査で一斉に指摘される。', en: 'Without remediation deadlines the vulnerability list becomes a ledger that only grows, and the audit lands on all of it at once.' },
    ],
    phaseIds: ['preliminary', 'f', 'g', 'h'],
    keywords: ['operational', '運用', '監視', 'monitoring', 'インシデント', 'incident', '棚卸し', 'access review', '脆弱性', 'vulnerability'],
  },
];

/* ------------------------------------------------------------------ *
 * SABSA の 6 つの問い(マトリクスの列)
 * ------------------------------------------------------------------ */

export const SABSA_QUESTIONS: SabsaQuestion[] = [
  {
    id: 'what',
    name: { ja: '資産(What)', en: 'Assets (What)' },
    focus: { ja: '守る対象そのもの。データ、機能、可用性、信用のいずれか。', en: 'The thing being protected: data, a capability, availability, or reputation.' },
    askInPractice: [
      { ja: 'これを失ったとき、いちばん困るのは誰か', en: 'If this is lost, who suffers first' },
      { ja: '同じ資産の写しは他にいくつあるか(検証環境・バックアップ・分析基盤)', en: 'How many copies of this asset exist elsewhere — test environments, backups, analytics stores' },
    ],
  },
  {
    id: 'why',
    name: { ja: '動機(Why)', en: 'Motivation (Why)' },
    focus: { ja: '守る理由。事業影響、規制、契約上の義務のどれかに必ず紐づく。', en: 'The reason for protecting it — always traceable to business impact, regulation, or a contractual obligation.' },
    askInPractice: [
      { ja: 'この統制をやめたとき、事業側で何が起きるか', en: 'What happens to the business if this control is dropped' },
      { ja: '守る理由が規制なら、出典と期日は何か', en: 'If the reason is regulatory, what is the source and the deadline' },
    ],
  },
  {
    id: 'how',
    name: { ja: 'プロセス(How)', en: 'Process (How)' },
    focus: { ja: '守り方。仕組み・手順・検査のどれで実現するか。', en: 'The means of protection: a mechanism, a procedure, or a check.' },
    askInPractice: [
      { ja: 'これは人が守る運用か、システムが強制する仕組みか', en: 'Is this enforced by a person following a procedure, or by the system itself' },
      { ja: '守られなかったことに、どうやって気づくか', en: 'How would you find out that it was not enforced' },
    ],
  },
  {
    id: 'who',
    name: { ja: '人(Who)', en: 'People (Who)' },
    focus: { ja: '扱う人と責任を持つ人。組織名ではなく役割と個人まで落とす。', en: 'Who handles it and who is accountable — pushed down to a role and a person, not an org name.' },
    askInPractice: [
      { ja: 'この資産に触れる役割をすべて挙げられるか(委託先を含む)', en: 'Can you list every role that touches this asset, contractors included' },
      { ja: '権限を与える人と、使う人と、監査する人は別か', en: 'Are the person who grants access, the person who uses it, and the person who audits it different people' },
    ],
  },
  {
    id: 'where',
    name: { ja: '場所(Where)', en: 'Location (Where)' },
    focus: { ja: '置き場所と経路。信頼境界の位置はこの列で決まる。', en: 'Where it rests and how it moves. Trust boundaries are decided in this column.' },
    askInPractice: [
      { ja: 'この資産はどの環境・どの地域に置かれるか', en: 'Which environments and which geographies does this asset sit in' },
      { ja: '境界をまたぐのはどこか。またぐたびに何を検査するか', en: 'Where does it cross a boundary, and what is inspected at each crossing' },
    ],
  },
  {
    id: 'when',
    name: { ja: '時間(When)', en: 'Time (When)' },
    focus: { ja: '期限・周期・保持期間。忘れられやすいが、統制の劣化はここに現れる。', en: 'Deadlines, cadences, retention. The most-forgotten column, and the one where control decay shows up.' },
    askInPractice: [
      { ja: 'この資産をいつまで保持し、いつ消すか', en: 'How long is this kept, and when is it destroyed' },
      { ja: '権限・鍵・証明書の見直し周期はどれくらいか', en: 'How often are permissions, keys, and certificates reviewed' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * TOGAF ADM ↔ SABSA の対応
 * ------------------------------------------------------------------ */

export const SECURITY_PHASE_MAP: SecurityPhaseMapping[] = [
  {
    phaseId: 'preliminary',
    layerIds: ['contextual', 'operational'],
    mustAnswer: [
      { ja: 'この組織でセキュリティアーキテクチャを決める人は誰か(役職名ではなく個人名まで)', en: 'Who decides security architecture in this organization — the person, not the job title' },
      { ja: '参照する統制カタログや社内標準はどれか。複数あるなら、衝突したときどれを優先するか', en: 'Which control catalogue or internal standard is authoritative, and which one wins when two of them conflict' },
      { ja: 'セキュリティレビューを ADM のどこで必須にするか(ゲートの位置と合否の判断者)', en: 'Where in the ADM a security review becomes mandatory — the gate position and who calls pass or fail' },
      { ja: '統制を満たさないまま進める例外は、誰の権限で、どんな条件付きで認めるか', en: 'Who can grant an exception to a control, and on what conditions' },
    ],
    artifactIds: ['security-principles', 'control-baseline'],
    exitCriteria: [
      { ja: 'セキュリティレビューのゲートが作業計画の中に日付付きで存在する', en: 'The security review gates exist in the work plan with dates against them' },
      { ja: '例外承認の手順が、口頭ではなく書面で決まっている', en: 'The exception process is written down rather than understood informally' },
    ],
  },
  {
    phaseId: 'a',
    layerIds: ['contextual', 'conceptual'],
    mustAnswer: [
      { ja: '今回の範囲で守るべき事業成果は何か。止まった場合の 1 日あたりの影響はどれくらいか', en: 'Which business outcome is in scope to protect, and what does one day of outage cost' },
      { ja: '規制・契約上の期日で、ロードマップの固定制約になるものはあるか', en: 'Are there regulatory or contractual deadlines that must become fixed constraints on the roadmap' },
      { ja: 'リスク許容度を宣言するのは誰か。残存リスクの受容者は個人として特定できるか', en: 'Who declares the risk appetite, and can the residual-risk acceptor be named as an individual' },
      { ja: 'セキュリティ側のステークホルダーは誰か。その人の関心事は何か(規制順守か、事故ゼロか、運用負荷か)', en: 'Who are the security stakeholders and what do they actually care about — compliance, zero incidents, or operational load' },
    ],
    artifactIds: ['security-principles', 'asset-classification', 'compliance-traceability'],
    exitCriteria: [
      { ja: 'セキュリティのステークホルダーがステークホルダーマップに載っている', en: 'Security stakeholders appear on the stakeholder map' },
      { ja: '規制期日がロードマップの制約として登録されている', en: 'Regulatory deadlines are registered as roadmap constraints' },
    ],
  },
  {
    phaseId: 'b',
    layerIds: ['contextual', 'conceptual', 'logical'],
    mustAnswer: [
      { ja: 'どの業務プロセスが最も高い信頼を要求するか。その理由は何か', en: 'Which business process demands the highest assurance, and why' },
      { ja: '職務分離が必要な業務ステップはどこか(承認と実行が同一人物になっていないか)', en: 'Which process steps need segregation of duties — is approval ever done by the same person who executes' },
      { ja: '業務側が合意した停止許容時間と、失ってよいデータ量はいくつか', en: 'What outage window and data-loss window has the business side actually agreed to' },
      { ja: '委託先・取引先が業務プロセスに入り込むのはどこか', en: 'Where do contractors and partners reach into the business process' },
    ],
    artifactIds: ['asset-classification', 'trust-boundary-diagram', 'continuity-plan'],
    exitCriteria: [
      { ja: '業務プロセス図の上に、信頼度が変わる場所が印されている', en: 'The business process model marks the points where the level of trust changes' },
      { ja: '停止許容時間が業務側の署名付きで記録されている', en: 'The agreed outage window is recorded with a business-side owner attached' },
    ],
  },
  {
    phaseId: 'c',
    layerIds: ['logical', 'physical'],
    mustAnswer: [
      { ja: '扱う情報の分類区分は決まっているか。区分ごとの取り扱いルールは書かれているか', en: 'Are the information classification tiers set, and are the handling rules per tier written down' },
      { ja: '認証・認可のモデルはアプリ横断で 1 つに揃うか。揃わないなら、境界と理由は何か', en: 'Will one authentication and authorization model span all applications — and if not, where is the seam and why' },
      { ja: '個人データなどを保管する場所と保持期間は、誰の判断で決まるか', en: 'Who decides where personal and other sensitive data is stored and for how long' },
      { ja: 'アプリケーション間・データストア間の、どこが信頼境界になるか', en: 'Between which applications and data stores do the trust boundaries actually fall' },
    ],
    artifactIds: ['asset-classification', 'identity-access-design', 'trust-boundary-diagram', 'threat-model'],
    exitCriteria: [
      { ja: 'データエンティティの一覧に分類区分の列がある', en: 'The data entity catalogue carries a classification column' },
      { ja: '主要なデータフローについて脅威モデルの初版が存在する', en: 'A first-pass threat model exists for the main data flows' },
    ],
  },
  {
    phaseId: 'd',
    layerIds: ['physical', 'component'],
    mustAnswer: [
      { ja: '暗号の方式と鍵の保管場所はどこか。鍵ごとの所有者は誰か', en: 'Which cryptographic schemes, where do keys live, and who owns each key' },
      { ja: 'ネットワークと実行環境のゾーンをどう分け、境界で何を検査するか', en: 'How are network and runtime zones divided, and what is inspected at each boundary' },
      { ja: '監査に耐える証跡を、誰が改ざんできない形でどこに残すか', en: 'Where does tamper-resistant evidence land, and who is unable to alter it' },
      { ja: '基盤側が提供する共通統制と、アプリ側が実装する個別統制の責任分界はどこか', en: 'Where is the line between controls the platform provides and controls each application must implement' },
    ],
    artifactIds: ['key-management-policy', 'logging-audit-design', 'trust-boundary-diagram', 'control-baseline', 'threat-model'],
    exitCriteria: [
      { ja: '責任分界表があり、「基盤がやると思っていた」統制が残っていない', en: 'A responsibility split table exists and no control is left in the "I assumed the platform did that" state' },
      { ja: '鍵と証明書の一覧に所有者と有効期限が入っている', en: 'The key and certificate inventory carries an owner and an expiry for every entry' },
    ],
  },
  {
    phaseId: 'e',
    layerIds: ['component', 'operational'],
    mustAnswer: [
      { ja: '各移行状態で、いつまで残る暫定的な露出があるか(仮の連携・広めの権限・二重運用)', en: 'What temporary exposure does each transition state carry, and until when — interim interfaces, over-broad permissions, dual running' },
      { ja: '規制期日に間に合わない移行状態はないか', en: 'Is there a transition state that misses a regulatory deadline' },
      { ja: '統制の導入順は、リスクの高い順になっているか(実装が容易な順になっていないか)', en: 'Are controls sequenced by risk rather than by ease of implementation' },
      { ja: '暫定措置の廃棄期限と、その責任者は決まっているか', en: 'Does every interim measure have a disposal date and a named owner' },
    ],
    artifactIds: ['threat-model', 'residual-risk-acceptance', 'compliance-traceability'],
    exitCriteria: [
      { ja: '各移行状態に、その時点で受け入れている残存リスクが記載されている', en: 'Each transition state states the residual risk being carried at that point' },
      { ja: '暫定措置がすべて廃棄期限付きで登録されている', en: 'Every interim measure is registered with a disposal deadline' },
    ],
  },
  {
    phaseId: 'f',
    layerIds: ['component', 'operational'],
    mustAnswer: [
      { ja: 'セキュリティ要件は、受入条件として検証可能な形で書かれているか', en: 'Are the security requirements written so they can be verified as acceptance criteria' },
      { ja: '実装側との合意に、統制の維持責任と報告義務が入っているか', en: 'Does the agreement with the implementation side carry the duty to maintain controls and to report' },
      { ja: '残存リスクは誰が、いつ、どの文書で受容するか', en: 'Who accepts the residual risk, when, and in which document' },
      { ja: '移行期間中に監視するのは誰か。旧環境と新環境のどちらが正なのか', en: 'Who monitors during the cutover window, and which of the old and new environments is authoritative' },
    ],
    artifactIds: ['security-requirements-spec', 'residual-risk-acceptance', 'incident-responsibility', 'third-party-management'],
    exitCriteria: [
      { ja: 'セキュリティ要件が ID 付きでテスト項目に紐づいている', en: 'Security requirements carry IDs and map to test cases' },
      { ja: '残存リスク受容記録に個人の署名がある', en: 'The residual-risk acceptance record carries an individual signature' },
    ],
  },
  {
    phaseId: 'g',
    layerIds: ['component', 'operational'],
    mustAnswer: [
      { ja: '実装がアーキテクチャから逸脱した場合、どの基準で許容し、どの基準で差し戻すか', en: 'When the build deviates from the architecture, what makes it tolerable and what sends it back' },
      { ja: '本番移行前に必須の検査(脆弱性診断・権限レビュー)は何か。合否の基準は何か', en: 'Which checks are mandatory before go-live — vulnerability testing, access review — and what is the pass criterion' },
      { ja: '例外を認めた場合、期限と是正計画をどこに記録するか', en: 'When an exception is granted, where do the deadline and the remediation plan get recorded' },
      { ja: '運用へ引き継ぐとき、何を渡せば「引き継ぎ完了」とするか', en: 'What has to change hands before the handover to operations counts as done' },
    ],
    artifactIds: ['security-requirements-spec', 'incident-responsibility', 'logging-audit-design'],
    exitCriteria: [
      { ja: '必須検査の結果と、未是正項目の期限が記録されている', en: 'Mandatory check results are recorded, with deadlines against anything unremediated' },
      { ja: '運用側が対応手順を受け取り、当番表に反映している', en: 'Operations has received the response procedures and reflected them in the rota' },
    ],
  },
  {
    phaseId: 'h',
    layerIds: ['operational'],
    mustAnswer: [
      { ja: 'どの変更が脅威モデルの見直しの引き金になるか(条件を具体的に書く)', en: 'Which changes trigger a threat-model review — write the conditions concretely' },
      { ja: '権限・鍵・証明書の棚卸し周期はいくつか。実施証跡はどこに残るか', en: 'How often are permissions, keys, and certificates reviewed, and where does the evidence land' },
      { ja: '受容した残存リスクの有効期限はいつか。再確認は誰が行うか', en: 'When does each accepted residual risk expire, and who re-confirms it' },
      { ja: '統制が形骸化していないかを、どの指標で見るか', en: 'Which indicators tell you a control has become nominal' },
    ],
    artifactIds: ['residual-risk-acceptance', 'control-baseline', 'threat-model'],
    exitCriteria: [
      { ja: '再評価の引き金が変更管理の手順に組み込まれている', en: 'The re-assessment triggers are embedded in the change management procedure' },
      { ja: '残存リスクに有効期限と再確認担当が入っている', en: 'Every accepted residual risk carries an expiry and a re-confirmation owner' },
    ],
  },
  {
    phaseId: 'requirements-management',
    layerIds: ['conceptual', 'logical', 'operational'],
    mustAnswer: [
      { ja: 'セキュリティ要件に一意の ID が付き、変更履歴が追えるか', en: 'Do security requirements carry unique IDs with a traceable change history' },
      { ja: '各要件は、成果物・テスト・統制のどれと紐づいているか', en: 'What is each requirement linked to — a deliverable, a test, or a control' },
      { ja: '要件をスコープから外す判断には、誰の承認が必要か', en: 'Whose approval is needed to drop a requirement from scope' },
      { ja: '規制由来の要件には、出典と期日が要件そのものに書かれているか', en: 'Do regulation-derived requirements carry their source and deadline in the requirement text itself' },
    ],
    artifactIds: ['security-requirements-spec', 'compliance-traceability'],
    exitCriteria: [
      { ja: 'セキュリティ要件が他の要件と同じ台帳で管理されている(別の表に隔離されていない)', en: 'Security requirements live in the same register as every other requirement, not quarantined in a separate sheet' },
      { ja: '落とした要件について、落とした理由と承認者が残っている', en: 'Dropped requirements retain the reason and the approver' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * セキュリティアーキテクチャの成果物
 * ------------------------------------------------------------------ */

export const SECURITY_ARTIFACTS: SecurityArtifact[] = [
  {
    id: 'security-principles',
    name: { ja: 'セキュリティ原則', en: 'Security Principles' },
    summary: {
      ja: '設計判断が割れたときにどちらを取るかを、事前に短い文で決めておくもの。判断のたびに議論を再開しないための装置。',
      en: 'A short set of statements that pre-decide which side wins when a design choice splits the room. Its job is to stop the same argument restarting on every decision.',
    },
    contents: [
      { ja: '原則の文(1 文。トレードオフの向きが読み取れること)', en: 'The principle as a single sentence that reveals which way the trade-off leans' },
      { ja: 'なぜそう決めたか(この組織固有の事情)', en: 'Why this one, in terms specific to this organization' },
      { ja: '守るとどうなるか / 破るとどうなるかの帰結', en: 'The consequence of following it and of breaking it' },
      { ja: '例外を認めるときの条件と承認者', en: 'The conditions for an exception and who approves one' },
    ],
    tips: [
      { ja: '数を 5〜7 個に絞る。10 を超えた時点で誰も覚えておらず、参照されなくなる。', en: 'Keep it to five to seven. Past ten, nobody remembers them and nobody cites them.' },
      { ja: '「原則 A と原則 B が衝突したらどうするか」を最低 1 例、実例で書いておく。', en: 'Include at least one worked example of what happens when two principles collide.' },
      { ja: '過去に揉めた設計判断から逆算して書くと、実際に使われる原則になる。', en: 'Derive them backwards from design fights you have actually had; those are the ones that get used.' },
    ],
    phaseIds: ['preliminary', 'a'],
    layerIds: ['conceptual'],
    keywords: ['security principle', 'セキュリティ原則', '原則', 'policy'],
  },
  {
    id: 'asset-classification',
    name: { ja: '資産台帳と情報分類', en: 'Asset Inventory and Information Classification' },
    summary: {
      ja: '守る対象を列挙し、区分ごとの取り扱いルールを付けたもの。以降のすべての統制の強さは、この台帳の区分から導く。',
      en: 'An enumeration of what is being protected, with handling rules per tier. Every later decision about control strength is derived from this table.',
    },
    contents: [
      { ja: '資産名と、それが何を表すデータ / 機能か', en: 'Asset name and what data or capability it represents' },
      { ja: '分類区分と、その区分に置いた理由', en: 'Classification tier and why it landed there' },
      { ja: '所有者(部門ではなく役割 + 個人)', en: 'Owner — a role and a person, not a department' },
      { ja: '保管場所と写しの所在(検証環境・バックアップ・分析基盤を含む)', en: 'Where it rests and where the copies are, including test, backup, and analytics' },
      { ja: '保持期間と削除の方式', en: 'Retention period and the method of destruction' },
      { ja: '区分ごとの取り扱いルール(持ち出し・共有・暗号化・アクセス承認)', en: 'Handling rules per tier: export, sharing, encryption, access approval' },
    ],
    tips: [
      { ja: '区分を 4 段階以内にする。細かすぎると現場が選べず、全部が中間に寄る。', en: 'Cap the tiers at four. Any finer and practitioners cannot choose, so everything piles into the middle.' },
      { ja: '「写しの所在」の列を必ず作る。事故の多くは本番ではなく写しから起きる。', en: 'Always include the "where are the copies" column. Most incidents come from copies, not production.' },
      { ja: '既存の CMDB / 台帳があるなら、新規に作らず列を足す。二重管理は必ず片方が腐る。', en: 'If a CMDB or inventory already exists, add columns to it rather than starting a new one. Two inventories means one rots.' },
    ],
    phaseIds: ['a', 'b', 'c'],
    layerIds: ['contextual', 'conceptual'],
    keywords: ['asset', '資産台帳', '情報分類', 'classification', 'inventory', 'データ分類'],
  },
  {
    id: 'threat-model',
    name: { ja: '脅威モデル', en: 'Threat Model' },
    summary: {
      ja: '資産・境界・攻撃者を並べて「何がどう壊れうるか」を列挙し、それぞれに打ち手か受容の判断を付けた文書。作りっぱなしにせず、変更のたびに更新する。',
      en: 'Assets, boundaries, and adversaries laid side by side to enumerate how things can break, with a control or an acceptance decision attached to each. Its value comes from being updated, not from being produced.',
    },
    contents: [
      { ja: '対象範囲と、範囲外にしたもの(範囲外の理由も書く)', en: 'What is in scope and what was deliberately excluded, with the reason for exclusion' },
      { ja: '資産一覧(この文書内で完結する短いもので可)', en: 'The asset list — a short in-document one is fine' },
      { ja: '想定する攻撃者と、その動機・能力・到達できる位置', en: 'The adversaries assumed, with motive, capability, and where they can reach' },
      { ja: '資産 × 脅威観点のマトリクスと、各セルの判断', en: 'The asset-by-lens matrix with a decision recorded in each cell' },
      { ja: '打ち手と、その打ち手が効かない残りの部分(残存リスク)', en: 'The controls chosen and the part they do not cover — the residual risk' },
      { ja: '見直しの引き金となる変更条件', en: 'The change conditions that trigger a review' },
    ],
    tips: [
      { ja: '完璧な列挙を目指すと終わらない。まず「境界をまたぐデータフロー」だけを対象に 1 周する。', en: 'Chasing completeness never terminates. Do one pass over just the data flows that cross a boundary.' },
      { ja: '「対策不要」と判断したセルにも理由を残す。後任者が同じ検討を最初からやり直さずに済む。', en: 'Record the reason even in cells you decide need nothing, so your successor does not redo the analysis from scratch.' },
      { ja: '内部の正規利用者を攻撃者として 1 行入れる。外部だけを想定したモデルは実務では弱い。', en: 'Put a legitimate insider in the adversary list. Models that only assume outsiders are weak in practice.' },
    ],
    phaseIds: ['c', 'd', 'e', 'h'],
    layerIds: ['logical', 'physical'],
    keywords: ['threat model', '脅威モデル', '脅威', 'threat', 'stride', 'リスク分析'],
  },
  {
    id: 'trust-boundary-diagram',
    name: { ja: '信頼境界図', en: 'Trust Boundary Diagram' },
    summary: {
      ja: '信頼度が変わる場所に線を引き、その線をまたぐデータと、またぐときに行う検査を書いた図。脅威モデルと統制設計の土台になる。',
      en: 'A drawing with a line wherever the level of trust changes, showing what crosses each line and what is inspected as it does. The base for both the threat model and control design.',
    },
    contents: [
      { ja: '構成要素(利用者・アプリ・データストア・外部サービス)', en: 'Elements: users, applications, data stores, external services' },
      { ja: '境界線と、その境界を分ける根拠(運用主体・ネットワーク・法域など)', en: 'The boundary lines and what makes each a boundary — different operator, network, or jurisdiction' },
      { ja: '境界をまたぐデータフローと、そこを流れるデータの分類区分', en: 'Data flows crossing each boundary and the classification of what flows' },
      { ja: '境界ごとの検査内容(認証・認可・入力検証・暗号化・記録)', en: 'What is enforced at each boundary: authentication, authorization, validation, encryption, logging' },
      { ja: '認証されない到達点(誰でも触れる面)の明示', en: 'The unauthenticated surface, called out explicitly' },
    ],
    tips: [
      { ja: '線を引く根拠を必ず一言添える。「なんとなくネットワークが違うから」で引いた線は後で動く。', en: 'Justify every line in a few words. Lines drawn because "the network is different" get redrawn later.' },
      { ja: '運用主体が変わるところ(自社 / 委託先 / SaaS)は、ネットワークが同じでも境界として扱う。', en: 'Treat a change of operator — you, a contractor, a SaaS vendor — as a boundary even when the network is shared.' },
      { ja: '図は 1 枚に収める。2 枚目が必要になったら、範囲の切り方が間違っている。', en: 'Keep it to one page. Needing a second page usually means the scope was cut wrongly.' },
    ],
    phaseIds: ['b', 'c', 'd'],
    layerIds: ['logical'],
    keywords: ['trust boundary', '信頼境界', 'データフロー', 'dfd', 'zoning', 'ゾーニング'],
  },
  {
    id: 'identity-access-design',
    name: { ja: '認証・認可設計', en: 'Identity and Access Design' },
    summary: {
      ja: '誰がどうやって本人だと示し、どの権限をどう獲得し、いつ失うのかを決めた設計。権限が増え続けて棚卸しできなくなる事態を、ここで先に防ぐ。',
      en: 'How a subject proves who it is, how it gains each permission, and when it loses it. This is where you pre-empt the permission sprawl that makes access review impossible later.',
    },
    contents: [
      { ja: '主体の種類(人間・サービス・委託先・バッチ)ごとの認証方式', en: 'Authentication per subject type: humans, services, contractors, batch jobs' },
      { ja: '権限のモデルと、権限が発生する条件・消滅する条件', en: 'The permission model plus what creates a permission and what retires it' },
      { ja: '特権的な操作の一覧と、その承認経路', en: 'The list of privileged operations and the approval path for each' },
      { ja: '棚卸しの周期と、棚卸しの実施者', en: 'Access-review cadence and who performs it' },
      { ja: '退職・異動・契約終了時の失効経路と所要時間', en: 'Revocation path and elapsed time for leavers, movers, and contract endings' },
      { ja: '緊急時の権限昇格(ブレークグラス)の手順と事後の検証', en: 'Emergency elevation (break-glass) procedure and the post-hoc review of its use' },
    ],
    tips: [
      { ja: 'ロールを定義するだけで終わらせない。「このロールはどうやって付き、いつ外れるか」を書く。', en: 'Defining roles is not the design. Write how each role is granted and when it comes off.' },
      { ja: 'サービス間の認証を後回しにしない。人間の認証だけ設計された系は、内部が素通しになる。', en: 'Do not defer service-to-service authentication. Systems designed only for human login are wide open internally.' },
      { ja: 'ブレークグラスは必ず用意する。無いと現場が共有アカウントを作って回避する。', en: 'Always provide a break-glass path. Without one, teams invent shared accounts to route around you.' },
    ],
    phaseIds: ['c', 'd'],
    layerIds: ['logical', 'physical'],
    keywords: ['iam', '認証', '認可', 'identity', 'access', 'rbac', '権限', 'sso'],
  },
  {
    id: 'key-management-policy',
    name: { ja: '鍵・証明書管理方針', en: 'Key and Certificate Management Policy' },
    summary: {
      ja: '暗号鍵・証明書・資格情報の、発行から廃棄までの扱いを決めた文書。暗号方式を選ぶことより、鍵の所有者と失効の手順を決めることのほうが実務では重い。',
      en: 'How keys, certificates, and credentials are handled from issue to destruction. In practice, naming the owner and defining revocation matters more than picking the algorithm.',
    },
    contents: [
      { ja: '鍵・証明書の一覧(用途・所有者・有効期限)', en: 'Inventory of keys and certificates with purpose, owner, and expiry' },
      { ja: '保管場所と、保管場所に触れられる主体', en: 'Where each is stored and which subjects can reach that store' },
      { ja: '発行・更新・失効の手順と、それぞれの所要時間', en: 'Issue, rotation, and revocation procedures and how long each takes' },
      { ja: '漏えいが疑われたときの緊急失効手順', en: 'The emergency revocation procedure when compromise is suspected' },
      { ja: 'ローテーション周期と、周期を守れなかった場合の検知方法', en: 'Rotation cadence and how a missed rotation is detected' },
      { ja: '開発・検証環境での鍵の扱い(本番鍵の持ち込み禁止を含む)', en: 'How keys are handled in development and test, including the ban on production keys' },
    ],
    tips: [
      { ja: '有効期限切れは事故として一番よく起きる。期限の監視と通知先を方針の中に書く。', en: 'Expiry is the single most common self-inflicted outage. Put expiry monitoring and its notification target in the policy itself.' },
      { ja: '鍵ごとに個人の所有者を付ける。「インフラチーム」だと誰も更新しない。', en: 'Give every key an individual owner. "The infrastructure team" means nobody rotates it.' },
      { ja: '失効手順は机上ではなく、非本番で一度実行して所要時間を測る。', en: 'Rehearse revocation once in a non-production environment and time it; do not leave it on paper.' },
    ],
    phaseIds: ['d', 'f'],
    layerIds: ['physical', 'component'],
    keywords: ['key management', '鍵管理', '証明書', 'certificate', 'pki', 'secrets', '暗号'],
  },
  {
    id: 'logging-audit-design',
    name: { ja: 'ログ・監査設計', en: 'Logging and Audit Design' },
    summary: {
      ja: '「あとで何を答えられるようにしておくか」から逆算してログを設計した文書。取れるものを全部取る設計は、費用だけ増えて調査の役に立たない。',
      en: 'Logging designed backwards from the questions you will need to answer later. Collecting everything collectible costs a fortune and still fails the investigation.',
    },
    contents: [
      { ja: '答えられるようにしたい質問の一覧(誰がいつ何にアクセスしたか、など)', en: 'The questions the logs must be able to answer — who touched what, when' },
      { ja: '記録する事象と、事象ごとの必須フィールド', en: 'The events recorded and the mandatory fields per event' },
      { ja: '保管場所・保持期間・改ざん防止の方式', en: 'Storage location, retention period, and tamper-resistance mechanism' },
      { ja: 'ログにのせてはいけない情報(資格情報・機微データ)の除外方式', en: 'What must never reach the log — credentials, sensitive data — and how it is stripped' },
      { ja: 'アラートの条件と、通知先・当番', en: 'Alert conditions with their destination and the rota that receives them' },
      { ja: '誰がログを閲覧でき、その閲覧自体をどこに記録するか', en: 'Who can read the logs and where that reading is itself recorded' },
    ],
    tips: [
      { ja: '「取る」と「見る」を分けて書く。見る人と頻度が決まっていないログは検知に使われない。', en: 'Separate "collected" from "reviewed". A log with no reader and no cadence contributes nothing to detection.' },
      { ja: '時刻の基準(タイムゾーン・同期元)を先に決める。調査時にここで必ず詰まる。', en: 'Fix the time basis — timezone and sync source — up front. Investigations always snag here.' },
      { ja: '運用担当がログを消せる構成にしない。監査で必ず問われる。', en: 'Do not let the operators delete the logs. An auditor will ask about exactly that.' },
    ],
    phaseIds: ['d', 'g', 'h'],
    layerIds: ['physical', 'operational'],
    keywords: ['logging', 'ログ', '監査', 'audit', 'siem', '証跡', 'evidence', 'モニタリング'],
  },
  {
    id: 'incident-responsibility',
    name: { ja: 'インシデント対応の責任分界', en: 'Incident Response Responsibility Split' },
    summary: {
      ja: '事故が起きたときに、誰が何を判断し、誰が動き、誰に伝えるかを事前に割り当てた表。事故対応で最も時間を溶かすのは技術ではなく、この割り当てが無いことによる待ち時間。',
      en: 'Who decides, who acts, and who is told — assigned before anything happens. What actually burns time in an incident is not the technical work but the waiting caused by an unassigned decision.',
    },
    contents: [
      { ja: '検知から終息までの段階と、各段階の判断者', en: 'The stages from detection to closure and the decision-maker at each' },
      { ja: 'サービス停止・切り離しを決められる人と、その権限の範囲', en: 'Who can order a shutdown or isolation, and the limits of that authority' },
      { ja: '社内外への連絡経路(誰が、誰に、いつまでに)', en: 'Internal and external notification paths: who tells whom, by when' },
      { ja: '自社と委託先・SaaS 事業者の責任の境目', en: 'Where responsibility passes between you, contractors, and SaaS providers' },
      { ja: '証拠保全の手順(復旧を優先して証拠を消さないための手順)', en: 'Evidence preservation, written so recovery does not destroy the evidence' },
      { ja: '夜間・休日の到達手段と、応答が無い場合の次の相手', en: 'How to reach people out of hours and who is next if there is no answer' },
    ],
    tips: [
      { ja: '「誰が判断するか」を役職ではなく個人 + 代理者 2 人まで書く。1 人だと必ず捕まらない。', en: 'Name an individual plus up to two deputies for each decision. A single name is always unreachable when it matters.' },
      { ja: '委託先との境目は契約に書かれているか確認する。表と契約が食い違うと現場が止まる。', en: 'Check the contractor boundary against the actual contract. A mismatch between this table and the contract freezes everyone.' },
      { ja: '年に一度、机上演習で表を検証する。人事異動で数か月で古くなる。', en: 'Test the table with a tabletop exercise annually; reorganizations make it stale within months.' },
    ],
    phaseIds: ['f', 'g', 'h'],
    layerIds: ['operational'],
    keywords: ['incident', 'インシデント', 'raci', '責任分界', 'csirt', '事故対応', 'エスカレーション'],
  },
  {
    id: 'continuity-plan',
    name: { ja: '事業継続・災害対策方針', en: 'Continuity and Disaster Recovery Position' },
    summary: {
      ja: '止まってよい時間と失ってよいデータ量を業務側と合意し、そこから復旧方式を導いた文書。技術者だけで数値を決めると、必ず過剰か過小になる。',
      en: 'The agreed outage window and data-loss window, with the recovery design derived from them. Numbers set by engineers alone come out either wildly over- or under-engineered.',
    },
    contents: [
      { ja: '業務プロセスごとの停止許容時間と、その合意者', en: 'Tolerable outage per business process and who agreed to it' },
      { ja: '失ってよいデータ量と、その根拠', en: 'Tolerable data loss and the reasoning behind the number' },
      { ja: '想定する障害の類型(単一障害・地域災害・供給者の停止・人為的破壊)', en: 'The failure classes assumed: single failure, regional disaster, supplier outage, deliberate destruction' },
      { ja: '復旧の方式と、切り替えの判断者', en: 'The recovery mechanism and who decides to invoke it' },
      { ja: 'バックアップの取得・保管・復元検証の周期', en: 'Backup capture, storage, and restore-verification cadence' },
      { ja: '縮退運転で回す業務と、その間の手作業の手順', en: 'Which processes run degraded and the manual procedure for the interim' },
    ],
    tips: [
      { ja: '復元の演習をしていないバックアップは、無いのと同じものとして扱う。', en: 'Treat a backup that has never been restored as a backup you do not have.' },
      { ja: 'バックアップが本番と同じ権限で消せる構成になっていないか確認する。', en: 'Check whether the same credentials that run production can also delete the backups.' },
      { ja: '停止許容時間は業務部門の署名付きで残す。事故後に「そんなに待てない」と言われる。', en: 'Get the outage window signed by the business. After an incident, everyone remembers a shorter number.' },
    ],
    phaseIds: ['b', 'd', 'f'],
    layerIds: ['contextual', 'physical'],
    keywords: ['bcp', 'dr', '事業継続', '災害対策', 'rto', 'rpo', 'バックアップ', 'backup', 'recovery'],
  },
  {
    id: 'third-party-management',
    name: { ja: 'サプライチェーン・委託先管理', en: 'Supply Chain and Third-Party Management' },
    summary: {
      ja: '外部に預けた部分について、何を要求し、何をもって守られていると確認するかを決めた文書。統制を委託しても、説明責任は委託できない。',
      en: 'What you require of the parts you handed outside, and what evidence convinces you it is being done. You can outsource a control; you cannot outsource the accountability for it.',
    },
    contents: [
      { ja: '委託先・利用サービスの一覧と、それぞれが触れる資産の分類区分', en: 'Inventory of contractors and services with the classification of the assets each touches' },
      { ja: '要求する統制と、その根拠(自社の分類区分から導く)', en: 'The controls required of each, derived from your own classification tiers' },
      { ja: '証跡の受領方法と頻度(第三者評価報告書・監査権・自己申告のどれか)', en: 'How and how often evidence arrives: third-party assessment report, right to audit, or self-attestation' },
      { ja: '事故発生時の通知義務と、通知までの時限', en: 'The duty to notify on an incident and the time limit for it' },
      { ja: '再委託の可否と、再委託先への要求の伝播方法', en: 'Whether subcontracting is allowed and how requirements propagate to subcontractors' },
      { ja: '契約終了時のデータ返却・削除の手順と証明', en: 'Data return and destruction at contract end, and the proof of it' },
    ],
    tips: [
      { ja: '要求事項を契約文言に落とすところまでやる。設計書だけに書いても相手に義務は生じない。', en: 'Carry the requirements into contract language. Written only in your design document, they bind nobody.' },
      { ja: '証跡を「年 1 回もらう」と決めたら、受領を確認する担当と期日を運用側に登録する。', en: 'If evidence arrives annually, register the receipt check with an owner and a date on the operations side.' },
      { ja: '無償・小規模の SaaS ほど台帳から漏れる。調達経路を通らない導入を拾う仕組みを持つ。', en: 'Free and small SaaS is what escapes the inventory. Have a way to catch adoptions that bypass procurement.' },
    ],
    phaseIds: ['b', 'f', 'h'],
    layerIds: ['contextual', 'operational'],
    keywords: ['supply chain', 'サプライチェーン', '委託先', 'third party', 'vendor', 'ベンダー', 'saas', '再委託'],
  },
  {
    id: 'security-requirements-spec',
    name: { ja: 'セキュリティ要件仕様', en: 'Security Requirements Specification' },
    summary: {
      ja: 'セキュリティ上の要求を、他の非機能要件と同じ台帳で ID 管理し、検証方法まで書いたもの。別紙に隔離した瞬間に、要件は「あとで見る資料」になる。',
      en: 'Security demands registered with IDs in the same register as every other non-functional requirement, each with its verification method. The moment they are exiled to an appendix they become reference material rather than requirements.',
    },
    contents: [
      { ja: '要件 ID(他の非機能要件と同じ採番体系)', en: 'Requirement ID using the same numbering scheme as other non-functional requirements' },
      { ja: '要件本文(測定可能な形。「適切に」「十分に」を使わない)', en: 'The requirement, stated measurably — no "appropriate" and no "sufficient"' },
      { ja: '出典(事業要求 / 規制 / 契約 / 脅威モデルのどれか)', en: 'Source: business demand, regulation, contract, or the threat model' },
      { ja: '検証方法(テスト・設計レビュー・証跡確認のどれか)と合否基準', en: 'Verification method — test, design review, or evidence check — and the pass criterion' },
      { ja: '対応する統制・成果物への紐づけ', en: 'Links to the control and the deliverable that satisfy it' },
      { ja: '優先度と、満たせない場合の代替手段', en: 'Priority and the fallback if it cannot be met' },
    ],
    tips: [
      { ja: '「適切に管理すること」のような検証不能な文は要件ではない。書き直すか、落とす。', en: 'A sentence you cannot test — "shall be managed appropriately" — is not a requirement. Rewrite it or drop it.' },
      { ja: '検証方法を先に書くと、要件文が自然に測定可能になる。', en: 'Write the verification method first and the requirement text becomes measurable by itself.' },
      { ja: '落とした要件も履歴に残す。落とした理由と承認者が後で必ず必要になる。', en: 'Keep dropped requirements in the history with the reason and the approver; both get asked for later.' },
    ],
    phaseIds: ['requirements-management', 'f', 'g'],
    layerIds: ['conceptual', 'logical'],
    keywords: ['security requirement', 'セキュリティ要件', '非機能要件', 'nfr', '要件管理'],
  },
  {
    id: 'residual-risk-acceptance',
    name: { ja: '残存リスク受容記録', en: 'Residual Risk Acceptance Record' },
    summary: {
      ja: '打ち手を入れてもなお残るリスクを、誰がいつまで引き受けたかを記録したもの。受容者が個人名で、有効期限が入っていて初めて機能する。',
      en: 'A record of what risk remains after the controls, and who carries it until when. It only functions if the acceptor is an individual and the acceptance has an expiry.',
    },
    contents: [
      { ja: 'リスクの内容と、想定される影響の大きさ', en: 'The risk and the size of its plausible impact' },
      { ja: '実施した対策と、それでも残る部分', en: 'The controls applied and the portion they do not cover' },
      { ja: '受容者(個人名と役職。部門名では受容にならない)', en: 'The acceptor — an individual and their role; a department name is not an acceptance' },
      { ja: '受容の有効期限と、再確認の担当者', en: 'The expiry of the acceptance and who re-confirms it' },
      { ja: '受容の条件(この条件が崩れたら再検討する、という条件)', en: 'The conditions of acceptance — what change forces a rethink' },
      { ja: '将来の是正計画があるならその予定時期', en: 'The remediation plan and its target date, if one exists' },
    ],
    tips: [
      { ja: '受容者が組織名になっている記録は、事故時に誰も責任を持たない。必ず個人まで落とす。', en: 'A record naming an organization means nobody owns it when the incident lands. Push it to a person.' },
      { ja: '有効期限を必ず付ける。無期限の受容は、数年後には誰も背景を知らない負債になる。', en: 'Always set an expiry. An open-ended acceptance becomes debt nobody remembers the context of.' },
      { ja: '受容する場面では、受容しない場合の費用と期間を並べて示す。判断材料が無いと署名できない。', en: 'Present the cost and time of not accepting alongside. Nobody signs without the alternative in front of them.' },
    ],
    phaseIds: ['e', 'f', 'h'],
    layerIds: ['contextual', 'operational'],
    keywords: ['residual risk', '残存リスク', 'リスク受容', 'acceptance', 'risk owner', '受容'],
  },
  {
    id: 'control-baseline',
    name: { ja: 'セキュリティ統制ベースライン', en: 'Security Control Baseline' },
    summary: {
      ja: '分類区分ごとに「最低限ここまではやる」を定めた標準セット。個別案件ごとにゼロから統制を設計しなくて済むようにするための、再利用の仕掛け。',
      en: 'A standard set of minimums per classification tier. It exists so that each project does not design its controls from zero — this is the reuse mechanism.',
    },
    contents: [
      { ja: '分類区分ごとの必須統制の一覧', en: 'Mandatory controls per classification tier' },
      { ja: '各統制の実装方法(基盤が提供するもの / アプリが実装するもの)', en: 'How each control is implemented — provided by the platform or built by the application' },
      { ja: '設定値の基準と、逸脱を検知する方法', en: 'Baseline settings and how drift is detected' },
      { ja: '免除の申請手順と、免除に付ける期限', en: 'The waiver process and the expiry attached to any waiver' },
      { ja: 'ベースライン自体の見直し周期と改定履歴', en: 'The review cadence for the baseline itself and its revision history' },
    ],
    tips: [
      { ja: '「基盤が提供する / アプリが実装する」の列を必ず作る。ここが曖昧だと双方が相手を待つ。', en: 'Always carry the platform-versus-application column. Ambiguity here has both sides waiting on the other.' },
      { ja: '免除には必ず期限を付ける。無期限の免除はベースラインを空文化させる。', en: 'Every waiver gets an expiry. Open-ended waivers hollow out the baseline.' },
      { ja: '既存の社内標準や業界の統制カタログがあるなら、写さずに参照して差分だけ書く。', en: 'If an internal standard or an industry control catalogue exists, reference it and write only your delta rather than copying it.' },
    ],
    phaseIds: ['preliminary', 'd', 'h'],
    layerIds: ['component', 'operational'],
    keywords: ['baseline', 'ベースライン', '統制', 'control', '標準', 'hardening', '設定基準'],
  },
  {
    id: 'compliance-traceability',
    name: { ja: '規制要求トレーサビリティ表', en: 'Regulatory Traceability Matrix' },
    summary: {
      ja: '外部から課される要求を、自社の要件・統制・証跡に一対一で結び付けた表。監査の場で「これで満たしています」と一行で指し示せる状態を作る。',
      en: 'A one-to-one mapping from externally imposed obligations to your requirements, controls, and evidence. Its purpose is to let you point at a single row and say "that is how it is met".',
    },
    contents: [
      { ja: '対象となる規制・契約・業界要求の一覧と適用範囲', en: 'The regulations, contracts, and industry demands in scope, with their applicability' },
      { ja: '各要求に対応する自社の要件 ID', en: 'The internal requirement ID that answers each obligation' },
      { ja: '対応する統制と、その実装状況', en: 'The control that implements it and its current state' },
      { ja: '証跡の所在(どこを見れば満たしていると分かるか)', en: 'Where the evidence lives — what an assessor would look at' },
      { ja: '期日と、その期日を守る責任者', en: 'The deadline and the person accountable for meeting it' },
      { ja: '未対応の要求と、その是正計画', en: 'Unmet obligations and the remediation plan for each' },
    ],
    tips: [
      { ja: '適用範囲の判断(この規制がどの業務に効くか)は法務・コンプライアンス部門に確認する。アーキテクトが単独で決めない。', en: 'Confirm applicability with legal or compliance. Which obligations bite which processes is not an architect\'s call alone.' },
      { ja: '期日はロードマップに固定制約として登録する。表の中だけにあると必ず後ろ倒しされる。', en: 'Register deadlines as fixed roadmap constraints. Left inside this table, they always slip.' },
      { ja: '証跡の所在を「担当者に聞けば分かる」にしない。その担当者は監査の日にいない。', en: 'Do not let the evidence location be "ask so-and-so". So-and-so is away on audit day.' },
    ],
    phaseIds: ['a', 'e', 'requirements-management'],
    layerIds: ['contextual', 'operational'],
    keywords: ['compliance', '規制', 'トレーサビリティ', 'traceability', '監査', 'audit', '法令'],
  },
];

/* ------------------------------------------------------------------ *
 * よくある失敗パターン
 * ------------------------------------------------------------------ */

export const SECURITY_PITFALLS: SecurityPitfall[] = [
  {
    id: 'security-review-last',
    name: { ja: 'セキュリティを最後にレビューさせる', en: 'Security reviews last' },
    symptom: { ja: '設計がほぼ固まった段階で初めてセキュリティ担当に見せ、「指摘」という形で意見をもらう。', en: 'Security is first shown the design once it is essentially frozen, and its input arrives as a list of objections.' },
    consequence: { ja: '指摘が構造に関わるものだと直せず、例外承認で押し切ることになる。セキュリティ側は「止める人」として扱われ、次から相談されなくなる。', en: 'Structural findings cannot be fixed, so the team pushes through on a waiver. Security becomes the department that says no, and stops being consulted at all.' },
    fix: { ja: 'フェーズ A の段階で 1 時間だけ同席させる。この時点なら選択肢がまだ広く、指摘が設計の入力になる。', en: 'Put them in the room for one hour during Phase A. At that point the option space is still open and their input becomes design input.' },
    phaseIds: ['preliminary', 'a', 'g'],
  },
  {
    id: 'requirements-not-tracked',
    name: { ja: 'セキュリティ要件を ID 管理しない', en: 'Security requirements are not tracked as requirements' },
    symptom: { ja: 'セキュリティの要求が方針文書や議事録に散在し、要件台帳に ID 付きで載っていない。', en: 'Security demands sit scattered across policy documents and meeting notes, never entering the requirements register with an ID.' },
    consequence: { ja: 'テスト計画にも受入条件にも入らないため、実装されたかどうかを誰も確認できない。稼働後に「あの話はどうなった」と蒸し返される。', en: 'They never reach the test plan or the acceptance criteria, so nobody can say whether they were implemented. They resurface after go-live as "whatever happened to…".' },
    fix: { ja: '他の非機能要件と同じ採番体系・同じ台帳に入れる。別紙に隔離しない。', en: 'Put them in the same register with the same numbering as every other non-functional requirement. No separate appendix.' },
    phaseIds: ['requirements-management', 'f', 'g'],
  },
  {
    id: 'org-as-risk-acceptor',
    name: { ja: '残存リスクの受容者が組織名になっている', en: 'The residual risk is accepted by an org chart box' },
    symptom: { ja: '受容記録の署名欄に「情報システム部」「経営会議」とだけ書かれている。', en: 'The acceptance record is signed by "the IT department" or "the steering committee".' },
    consequence: { ja: '事故が起きたときに誰も自分の判断だと認識しておらず、対応が止まる。次回以降も同じ形で受容が積み上がる。', en: 'When the incident lands nobody recognizes it as their decision and response stalls. The same pattern then repeats on every subsequent acceptance.' },
    fix: { ja: '個人名 + 役職 + 有効期限を必須項目にする。埋まらないなら、それは受容されていないということ。', en: 'Make individual name, role, and expiry mandatory fields. If they cannot be filled, the risk has not actually been accepted.' },
    phaseIds: ['e', 'f', 'h'],
  },
  {
    id: 'deadline-not-constraint',
    name: { ja: '規制期日をロードマップの固定制約にしない', en: 'Regulatory deadlines are not treated as fixed constraints' },
    symptom: { ja: '規制対応が他の施策と同じ優先度で並び、リソース調整のたびに後ろへずれる。', en: 'Regulatory work sits in the backlog at the same priority as everything else and slips at every resourcing conversation.' },
    consequence: { ja: '期日 3 か月前に発覚し、他の施策を全部止めて突貫することになる。品質も落ち、暫定措置が残る。', en: 'It surfaces three months out, everything else halts, and the work is done in a rush that leaves both quality gaps and interim measures behind.' },
    fix: { ja: '期日を移行アーキテクチャの目標時期そのものに埋め込み、動かせない制約として扱う。', en: 'Bake the deadline into the target date of a transition state and treat it as immovable.' },
    phaseIds: ['a', 'e', 'f'],
  },
  {
    id: 'zero-trust-as-product',
    name: { ja: 'ゼロトラストを製品導入と混同する', en: 'Zero trust is mistaken for a product purchase' },
    symptom: { ja: '「ゼロトラストを導入する」が、特定の製品を入れる計画としてロードマップに載っている。', en: '"Adopt zero trust" appears on the roadmap as a plan to install a particular product.' },
    consequence: { ja: '製品は入るが、社内ネットワークにいれば信頼される前提の設計が残り、内部からの到達経路は変わらない。費用だけ増える。', en: 'The product lands, but the assumption that anything inside the network is trusted survives untouched, and the internal reach of an attacker is unchanged. Cost is the only thing that moved.' },
    fix: { ja: '「ネットワーク上の位置を信頼の根拠に使わない」という設計方針として扱い、認証・認可設計と信頼境界図の側で表現する。製品は手段として後から選ぶ。', en: 'Treat it as a design stance — network position is not evidence of trust — expressed in the identity design and the boundary diagram. Choose products afterwards, as means.' },
    phaseIds: ['b', 'c', 'd'],
  },
  {
    id: 'threat-model-frozen',
    name: { ja: '脅威モデルを一度作って更新しない', en: 'The threat model is written once and never touched' },
    symptom: { ja: '設計初期に作った脅威モデルが、連携先の追加やクラウド移行のあとも更新されていない。', en: 'The threat model written during early design is unchanged after new integrations and a cloud migration.' },
    consequence: { ja: 'モデルと実物が乖離し、実際の攻撃面が誰にも把握されていない状態になる。文書があることで安心してしまう分だけ危険。', en: 'Model and reality diverge until nobody knows the real attack surface. The existence of the document makes it worse by creating false comfort.' },
    fix: { ja: '「再評価の引き金」を条件として書き、変更管理の手順に組み込む(新しい外部連携、認証方式の変更、データ分類の変更など)。', en: 'Write explicit re-assessment triggers — a new external integration, an authentication change, a reclassification — and wire them into change management.' },
    phaseIds: ['c', 'd', 'h'],
  },
  {
    id: 'classification-without-rules',
    name: { ja: '情報分類を作ったが扱いのルールが無い', en: 'Classification tiers exist but handling rules do not' },
    symptom: { ja: '「機密 / 社外秘 / 公開」の区分は定義されているが、区分ごとに何が変わるのかが書かれていない。', en: 'The tiers are defined but nothing states what actually changes between them.' },
    consequence: { ja: '分類作業が儀式になり、現場は全部を中間の区分に置く。統制の強弱を決める根拠として使えない。', en: 'Classification becomes a ritual, everything lands in the middle tier, and the tiers cannot be used to justify stronger or weaker controls.' },
    fix: { ja: '区分ごとに「持ち出し・共有・暗号化・アクセス承認・保持期間」の 5 つがどう変わるかを 1 枚の表にする。', en: 'Put five columns — export, sharing, encryption, access approval, retention — against the tiers on a single page.' },
    phaseIds: ['b', 'c'],
  },
  {
    id: 'interim-without-disposal',
    name: { ja: '暫定措置に廃棄期限が無い', en: 'Interim measures have no disposal date' },
    symptom: { ja: '移行期間だけの仮の連携や広めの権限が、期限も責任者も無いまま作られる。', en: 'Temporary interfaces and over-broad permissions are created for the cutover with neither an expiry nor an owner.' },
    consequence: { ja: '移行が終わっても消えず、数年後に「誰も用途を知らない経路」として残る。攻撃面が恒久的に広がる。', en: 'They outlive the migration and remain years later as paths nobody can explain. The attack surface widens permanently.' },
    fix: { ja: '暫定措置を移行アーキテクチャの属性として登録し、廃棄期限と責任者を必須にする。期限をアクションとして台帳に載せる。', en: 'Register each interim measure as an attribute of the transition state with a mandatory disposal date and owner, and put that date in the action register.' },
    phaseIds: ['e', 'f', 'g'],
  },
  {
    id: 'logs-without-readers',
    name: { ja: 'ログを取っているだけで誰も見ない', en: 'Logs are collected but never read' },
    symptom: { ja: 'ログ基盤は構築されているが、誰がいつ何を見るのかが決まっていない。アラートは大量に出て無視されている。', en: 'A logging platform exists but nobody owns reviewing it, and the alerts fire in volumes that guarantee they are ignored.' },
    consequence: { ja: '検知能力が実質ゼロのまま「対策済み」として扱われる。事故は外部からの連絡で知ることになる。', en: 'Detection capability is effectively zero while the control is reported as implemented. You learn about the incident from someone outside.' },
    fix: { ja: '「取る」の設計の前に「答えられるようにしたい質問」を書き、質問ごとに見る人・頻度・アラート条件を決める。', en: 'Before designing collection, write the questions the logs must answer, then assign a reader, a cadence, and an alert condition to each.' },
    phaseIds: ['d', 'g', 'h'],
  },
  {
    id: 'vendor-controls-unverified',
    name: { ja: '委託先に任せきりで証跡を受け取らない', en: 'Controls are delegated to vendors without evidence' },
    symptom: { ja: '契約書に「適切に管理する」とだけ書かれ、実際に守られているかを確認する手段が決まっていない。', en: 'The contract says the vendor will "manage it appropriately" and no mechanism exists to check whether they do.' },
    consequence: { ja: '事故が起きて初めて実態を知る。自社の説明責任は残っているため、規制当局や顧客への説明ができない。', en: 'You discover the reality during the incident. The accountability never left you, so there is nothing to tell the regulator or the customer.' },
    fix: { ja: '要求する統制・証跡の受領方法と頻度・通知の時限を、設計書ではなく契約文言に落とす。受領確認を運用のアクションとして登録する。', en: 'Carry the required controls, the evidence mechanism and its cadence, and the notification deadline into contract language — not just the design document — and register the receipt check as an operational action.' },
    phaseIds: ['b', 'f', 'h'],
  },
];

/* ------------------------------------------------------------------ *
 * 脅威モデリングの 6 観点
 * ------------------------------------------------------------------ */

export const THREAT_LENSES: ThreatLens[] = [
  {
    id: 'spoofing',
    name: { ja: 'なりすまし', en: 'Spoofing' },
    meaning: { ja: '本人でない主体が、本人として振る舞えてしまうこと。人間だけでなく、サービスやバッチ処理も主体に含む。', en: 'A subject acting as someone it is not. Subjects include services and batch jobs, not only humans.' },
    questions: [
      { ja: 'この資産に触れる主体は、どうやって本人だと示すか', en: 'How does each subject touching this asset prove who it is' },
      { ja: 'サービス間・バッチからの呼び出しはどう認証されるか', en: 'How are service-to-service and batch invocations authenticated' },
      { ja: '資格情報を盗まれた場合、それだけで通ってしまうか', en: 'If a credential is stolen, is that alone enough to get in' },
    ],
    controlTypes: [
      { ja: '複数要素での確認、短命な資格情報、相互認証', en: 'Multiple factors, short-lived credentials, mutual authentication' },
      { ja: '異常な認証パターンの検知(場所・時刻・頻度)', en: 'Detection of anomalous authentication patterns by location, time, and rate' },
    ],
  },
  {
    id: 'tampering',
    name: { ja: '改ざん', en: 'Tampering' },
    meaning: { ja: '通信中または保存中のデータ・設定・コードが、正規の手続きを経ずに書き換えられること。', en: 'Data, configuration, or code altered outside the legitimate path, whether in transit or at rest.' },
    questions: [
      { ja: 'この資産を書き換えられる主体をすべて挙げられるか', en: 'Can you enumerate every subject able to modify this asset' },
      { ja: '書き換えが起きたことに、いつ・どうやって気づくか', en: 'When and how would you notice that a modification happened' },
      { ja: '設定やコードの経路(配布・デプロイ)は保護されているか', en: 'Is the path that configuration and code travel — build and deploy — protected' },
    ],
    controlTypes: [
      { ja: '完全性の検証(署名・ハッシュ)、書き込み権限の分離', en: 'Integrity verification via signatures or hashes, and separation of write permissions' },
      { ja: '変更の記録と、記録自体の改ざん防止', en: 'Change recording, plus tamper-resistance for the record itself' },
    ],
  },
  {
    id: 'repudiation',
    name: { ja: '否認', en: 'Repudiation' },
    meaning: { ja: '誰かが行った操作について、あとから「やっていない」と主張でき、こちらが反証できない状態。', en: 'Someone can deny an action they took and you cannot demonstrate otherwise.' },
    questions: [
      { ja: 'この操作について、誰がいつ行ったかを後から示せるか', en: 'Can you later show who performed this operation and when' },
      { ja: '共有アカウントや共通の踏み台を経由していないか', en: 'Does the path go through a shared account or a common jump host' },
      { ja: '証跡を運用担当自身が消せる構成になっていないか', en: 'Can the operators themselves delete the evidence' },
    ],
    controlTypes: [
      { ja: '主体を一意に特定できる操作記録、共有アカウントの廃止', en: 'Operation records that identify the subject uniquely, and elimination of shared accounts' },
      { ja: '証跡の分離保管と保持期間の設定', en: 'Evidence stored separately with a defined retention period' },
    ],
  },
  {
    id: 'disclosure',
    name: { ja: '情報漏えい', en: 'Information disclosure' },
    meaning: { ja: '見えてはいけない相手にデータが見えてしまうこと。外部への流出だけでなく、社内の権限外の閲覧も含む。', en: 'Data visible to someone who should not see it — including internal viewers without the right, not only external leakage.' },
    questions: [
      { ja: 'この資産の写しはどこにあるか(検証環境・バックアップ・ログ・分析基盤)', en: 'Where are the copies — test environments, backups, logs, analytics stores' },
      { ja: 'エラー画面・ログ・通知に機微な内容が混ざらないか', en: 'Can sensitive content leak into error pages, logs, or notifications' },
      { ja: '権限を持つ人が必要以上に広く見られる構成になっていないか', en: 'Do the people with access see more than they need' },
    ],
    controlTypes: [
      { ja: '保存時・通信時の暗号化、最小権限、マスキング', en: 'Encryption at rest and in transit, least privilege, masking' },
      { ja: '大量の読み出しを検知する監視', en: 'Monitoring that detects bulk reads' },
    ],
  },
  {
    id: 'denial-of-service',
    name: { ja: 'サービス妨害', en: 'Denial of service' },
    meaning: { ja: '正当な利用者が使えなくなること。外部からの負荷だけでなく、依存先の停止や設定ミスによる自壊も含む。', en: 'Legitimate users cannot use the system — from external load, but equally from a dependency outage or a self-inflicted misconfiguration.' },
    questions: [
      { ja: 'この資産が使えないと、どの業務がいつ止まるか', en: 'If this asset is unavailable, which business process stops and how soon' },
      { ja: '一つの利用者が資源を占有できてしまう箇所はどこか', en: 'Where can a single consumer monopolize a resource' },
      { ja: '依存している外部サービスが止まったときの縮退運転はあるか', en: 'Is there a degraded mode when an external dependency goes down' },
    ],
    controlTypes: [
      { ja: '流量制限、資源の隔離、優先度付け', en: 'Rate limiting, resource isolation, prioritization' },
      { ja: '縮退運転の設計と、復旧の演習', en: 'A designed degraded mode, and rehearsed recovery' },
    ],
  },
  {
    id: 'elevation',
    name: { ja: '権限昇格', en: 'Elevation of privilege' },
    meaning: { ja: '与えられた範囲を超えた操作ができてしまうこと。到達した攻撃者がどこまで広げられるかを決める観点。', en: 'Acting beyond the granted scope. This lens decides how far an attacker who got in can spread.' },
    questions: [
      { ja: 'この資産の権限を持つ主体は、そこから他の何に到達できるか', en: 'From this asset, what else can a subject holding its permissions reach' },
      { ja: '管理者権限が必要な操作は、日常の作業と分離されているか', en: 'Are the operations needing admin rights separated from day-to-day work' },
      { ja: '一時的に付与した権限は、自動で外れるか', en: 'Do temporarily granted permissions come off automatically' },
    ],
    controlTypes: [
      { ja: '権限の分離、期限付き付与、特権操作の承認経路', en: 'Separation of duties, time-bounded grants, an approval path for privileged operations' },
      { ja: '横展開を止める境界(ゾーニング、資格情報の分離)', en: 'Boundaries that stop lateral movement: zoning and credential separation' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * ID 管理すべきセキュリティ要件のひな型
 * ------------------------------------------------------------------ */

export const SECURITY_REQUIREMENTS: SecurityRequirementItem[] = [
  {
    id: 'sec-req-authn',
    category: { ja: '認証', en: 'Authentication' },
    requirement: { ja: '主体の種類(人間・サービス・委託先・バッチ)ごとに認証方式を定め、共有アカウントを使わない。', en: 'Define an authentication method per subject type — human, service, contractor, batch — and use no shared accounts.' },
    verification: { ja: '設計レビューで主体一覧と方式の対応表を確認し、共有アカウントが 0 件であることを実機で確認する。', en: 'Review the subject-to-method table at design review and confirm zero shared accounts on the running system.' },
    phaseIds: ['c', 'd'],
  },
  {
    id: 'sec-req-authz',
    category: { ja: '認可', en: 'Authorization' },
    requirement: { ja: '権限は役割単位で定義し、付与条件と失効条件を明記する。既定は拒否とする。', en: 'Define permissions per role with explicit grant and revocation conditions, and deny by default.' },
    verification: { ja: '権限一覧に付与・失効条件の列があること、および未定義の操作が拒否されることをテストで確認する。', en: 'Confirm the permission table carries grant and revocation columns, and test that undefined operations are denied.' },
    phaseIds: ['c', 'd'],
  },
  {
    id: 'sec-req-privileged',
    category: { ja: '特権操作', en: 'Privileged operations' },
    requirement: { ja: '特権的な操作は日常操作と分離し、実行時に承認と記録を必須とする。緊急時の昇格手順は事後検証を伴う。', en: 'Separate privileged operations from routine work, require approval and recording at execution time, and pair any emergency elevation with a post-hoc review.' },
    verification: { ja: '特権操作の一覧と承認経路の突き合わせ、および緊急昇格の記録が残ることのテスト。', en: 'Cross-check the privileged-operation list against approval paths and test that emergency elevation leaves a record.' },
    phaseIds: ['d', 'g'],
  },
  {
    id: 'sec-req-secrets',
    category: { ja: '秘密情報', en: 'Secrets' },
    requirement: { ja: '資格情報・鍵・トークンをソースコードと設定ファイルに置かず、専用の保管機構から取得する。', en: 'Keep credentials, keys, and tokens out of source and configuration files; retrieve them from a dedicated store.' },
    verification: { ja: 'リポジトリとイメージに対する自動検査を通し、検出 0 件であることを確認する。', en: 'Run automated scanning over the repository and images and confirm zero detections.' },
    phaseIds: ['d', 'g'],
  },
  {
    id: 'sec-req-transit',
    category: { ja: '通信の保護', en: 'Protection in transit' },
    requirement: { ja: '信頼境界をまたぐ通信を暗号化し、通信相手を検証する。内部通信も対象に含める。', en: 'Encrypt traffic crossing a trust boundary and verify the peer, internal traffic included.' },
    verification: { ja: '境界一覧に対する構成確認と、平文で到達できる経路が無いことの検査。', en: 'Verify configuration against the boundary list and test that no cleartext path reaches the service.' },
    phaseIds: ['d'],
  },
  {
    id: 'sec-req-rest',
    category: { ja: '保存データの保護', en: 'Protection at rest' },
    requirement: { ja: '分類区分に応じて保存時の保護方式を定め、写し(バックアップ・検証環境・分析基盤)にも同じ方式を適用する。', en: 'Set protection at rest per classification tier and apply the same treatment to copies — backups, test environments, analytics stores.' },
    verification: { ja: '資産台帳の「写しの所在」列に対し、保護方式が漏れなく適用されていることを確認する。', en: 'Walk the "where are the copies" column of the asset inventory and confirm coverage with no gaps.' },
    phaseIds: ['c', 'd'],
  },
  {
    id: 'sec-req-input',
    category: { ja: '入力の検証', en: 'Input validation' },
    requirement: { ja: '信頼境界をまたいで入る値をすべて検証し、検証は境界の内側(サーバー側)で行う。', en: 'Validate every value entering across a trust boundary, and perform the validation on the inside of the boundary.' },
    verification: { ja: '境界ごとの検証方式の設計レビューと、代表的な不正入力に対するテスト。', en: 'Design-review the validation per boundary and test with representative malformed input.' },
    phaseIds: ['c', 'd', 'g'],
  },
  {
    id: 'sec-req-logging',
    category: { ja: 'ログ・証跡', en: 'Logging and evidence' },
    requirement: { ja: '認証・認可・特権操作・データの大量読み出しを記録し、主体・時刻・対象・結果を必須項目とする。', en: 'Record authentication, authorization, privileged operations, and bulk reads, with subject, time, target, and outcome as mandatory fields.' },
    verification: { ja: '記録対象一覧に対する実機確認と、必須項目が欠けていないかのサンプル検査。', en: 'Check the event list against the running system and sample records for missing mandatory fields.' },
    phaseIds: ['d', 'g'],
  },
  {
    id: 'sec-req-log-protection',
    category: { ja: '証跡の保護', en: 'Evidence protection' },
    requirement: { ja: '証跡は運用担当が単独で削除・改変できない場所に保管し、閲覧自体も記録する。', en: 'Store evidence where operators cannot unilaterally delete or alter it, and record the act of reading it.' },
    verification: { ja: '保管先の権限設定の確認と、削除操作が拒否されることのテスト。', en: 'Inspect permissions on the store and test that a delete attempt is refused.' },
    phaseIds: ['d', 'h'],
  },
  {
    id: 'sec-req-detection',
    category: { ja: '検知と対応', en: 'Detection and response' },
    requirement: { ja: '検知したい事象ごとにアラート条件・通知先・一次対応者を定め、夜間休日の到達手段を含める。', en: 'For each event to be detected, define the alert condition, its destination, and the first responder, including out-of-hours reachability.' },
    verification: { ja: '事象一覧に対する通知先の埋まり具合の確認と、通知経路の疎通テスト。', en: 'Confirm every event has a destination and run a delivery test through each notification path.' },
    phaseIds: ['g', 'h'],
  },
  {
    id: 'sec-req-availability',
    category: { ja: '可用性と復旧', en: 'Availability and recovery' },
    requirement: { ja: '業務側が合意した停止許容時間と許容データ損失量を満たす復旧方式を備え、復元を定期的に演習する。', en: 'Provide a recovery mechanism that meets the outage and data-loss windows agreed by the business, and rehearse restoration on a cadence.' },
    verification: { ja: '復元演習の記録(実施日・所要時間・結果)を証跡として確認する。', en: 'Check the restoration-rehearsal record — date, elapsed time, outcome — as evidence.' },
    phaseIds: ['d', 'f', 'h'],
  },
  {
    id: 'sec-req-vulnerability',
    category: { ja: '脆弱性管理', en: 'Vulnerability management' },
    requirement: { ja: '依存関係と実行基盤の脆弱性を継続的に検出し、深刻度ごとに是正期限を定める。', en: 'Continuously detect vulnerabilities in dependencies and runtime platforms, with a remediation deadline per severity.' },
    verification: { ja: '検出から是正までの実績時間が、定めた期限内に収まっているかを一定期間分確認する。', en: 'Review detection-to-remediation elapsed times over a period against the stated deadlines.' },
    phaseIds: ['g', 'h'],
  },
  {
    id: 'sec-req-access-review',
    category: { ja: '権限の棚卸し', en: 'Access review' },
    requirement: { ja: '権限・鍵・証明書を定めた周期で棚卸しし、実施証跡と是正結果を残す。', en: 'Review permissions, keys, and certificates on a defined cadence, retaining evidence of the review and of any corrections.' },
    verification: { ja: '直近の棚卸し記録に、実施者・対象範囲・削除した権限の件数が含まれることを確認する。', en: 'Confirm the latest review record names the reviewer, the scope covered, and the count of permissions removed.' },
    phaseIds: ['h'],
  },
  {
    id: 'sec-req-third-party',
    category: { ja: '委託先・外部サービス', en: 'Third parties' },
    requirement: { ja: '外部に預ける資産の分類区分に応じて要求する統制を定め、証跡の受領方法と事故通知の時限を合意に含める。', en: 'Set the controls required of each third party by the classification of what they hold, and put the evidence mechanism and incident-notification deadline into the agreement.' },
    verification: { ja: '委託先一覧に対し、証跡の直近の受領日と通知条項の有無を確認する。', en: 'For each third party, check the date evidence was last received and whether the notification clause exists.' },
    phaseIds: ['f', 'h'],
  },
  {
    id: 'sec-req-residency',
    category: { ja: 'データの所在', en: 'Data location' },
    requirement: { ja: '対象データを保管・処理してよい場所の範囲を定め、範囲外への複製が起きないことを構成で担保する。', en: 'Define where the data may be stored and processed, and enforce by configuration that copies do not leave that scope.' },
    verification: { ja: '保管先の構成確認と、複製先の一覧に範囲外が含まれないことの点検。', en: 'Inspect storage configuration and audit the replication targets for anything outside the defined scope.' },
    regulatedOnly: true,
    phaseIds: ['c', 'd'],
  },
  {
    id: 'sec-req-retention',
    category: { ja: '保持と削除', en: 'Retention and deletion' },
    requirement: { ja: '記録・データの保持期間を定め、期間経過後の削除を自動化する。保持期間の根拠を記録に併記する。', en: 'Set retention periods for records and data, automate deletion afterwards, and record the basis for each period alongside it.' },
    verification: { ja: '保持期間の設定値と、実際に期間経過分が削除されていることのサンプル確認。', en: 'Check configured retention values and sample-verify that expired items are actually gone.' },
    regulatedOnly: true,
    phaseIds: ['c', 'd', 'h'],
  },
  {
    id: 'sec-req-audit-trail',
    category: { ja: '監査証跡', en: 'Audit trail' },
    requirement: { ja: '監査で提示する証跡の種類・所在・提示手順をあらかじめ定め、担当者不在でも取り出せる状態にする。', en: 'Predefine which evidence is presented at audit, where it lives, and how it is produced, so that it is retrievable when the usual person is away.' },
    verification: { ja: '担当者以外の人が手順に従って証跡を取り出せることを一度実演する。', en: 'Demonstrate once that someone other than the usual owner can retrieve the evidence by following the procedure.' },
    regulatedOnly: true,
    phaseIds: ['g', 'h'],
  },
  {
    id: 'sec-req-breach-notification',
    category: { ja: '事故時の報告', en: 'Incident reporting' },
    requirement: { ja: '事故発生時の報告先・報告内容・時限を事前に整理し、時限に間に合う社内の意思決定経路を定める。', en: 'Work out in advance who must be told, what must be said, and by when, then define an internal decision path that fits inside that window.' },
    verification: { ja: '報告時限から逆算した社内の判断期限が、対応手順に日数付きで書かれていることを確認する。', en: 'Confirm the response procedure carries an internal decision deadline derived by working backwards from the reporting window.' },
    regulatedOnly: true,
    phaseIds: ['f', 'g'],
  },
  {
    id: 'sec-req-flowdown',
    category: { ja: '要求の伝播', en: 'Requirement flow-down' },
    requirement: { ja: '規制由来の要求を委託先・再委託先へ伝播させる方法を定め、伝播の証跡を保持する。', en: 'Define how regulation-derived obligations propagate to contractors and their subcontractors, and retain evidence of the propagation.' },
    verification: { ja: '契約書または合意文書に該当条項が入っていることを、委託先ごとに確認する。', en: 'Confirm per third party that the relevant clause exists in the contract or agreement.' },
    regulatedOnly: true,
    phaseIds: ['f', 'h'],
  },
  {
    id: 'sec-req-traceability',
    category: { ja: 'トレーサビリティ', en: 'Traceability' },
    requirement: { ja: '規制上の各要求に対し、対応する自社要件 ID・統制・証跡の所在を一対一で紐づけて維持する。', en: 'Maintain a one-to-one link from each obligation to the internal requirement ID, the control, and the evidence location.' },
    verification: { ja: '未紐づけの要求が 0 件であることと、証跡の所在が具体的な場所として書かれていることを確認する。', en: 'Confirm zero unlinked obligations and that each evidence location names a concrete place.' },
    regulatedOnly: true,
    phaseIds: ['a', 'requirements-management'],
  },
];

/* ------------------------------------------------------------------ *
 * 照合・検索用のヘルパ
 * ------------------------------------------------------------------ */

/**
 * エンゲージメントの記述からセキュリティ関連の項目を拾うためのキーワード。
 * `matchesKeyword` に渡して使う(ASCII は単語境界、日本語は部分一致)。
 */
export const SECURITY_KEYWORDS: string[] = [
  'security', 'セキュリティ', '情報セキュリティ', 'ciso', 'csirt', 'soc',
  'サイバー', 'cyber', '脅威', 'threat', '脆弱性', 'vulnerability',
  '暗号', 'encryption', '認証', 'authentication', '認可', 'authorization',
  'iam', '権限', 'アクセス制御', 'access control', '個人情報', 'privacy',
  'プライバシー', '監査', 'audit', 'ログ', 'logging', 'インシデント', 'incident',
  '統制', 'control', 'ゼロトラスト', 'zero trust', 'リスク受容', '残存リスク',
];

/** セキュリティ担当のステークホルダーを見分けるためのキーワード */
export const SECURITY_ROLE_KEYWORDS: string[] = [
  'security', 'セキュリティ', 'ciso', 'cso', 'csirt', 'soc',
  '情報セキュリティ', 'リスク管理', 'risk management', 'compliance',
  'コンプライアンス', '監査', 'audit', 'privacy', 'プライバシー',
  '個人情報', 'dpo', '法務', 'legal',
];

/** 規制・法令に関係するアクションを見分けるためのキーワード */
export const REGULATORY_KEYWORDS: string[] = [
  '規制', '法令', '法規', 'コンプライアンス', 'compliance', 'regulation',
  'regulatory', '監査', 'audit', '個人情報', 'privacy', 'gdpr', 'pci',
  '認証取得', 'certification', '届出', '報告義務', '当局',
];

/** SABSA 層を ID で引く */
export function findSabsaLayer(id: string): SabsaLayer | undefined {
  const key = id.trim().toLowerCase();
  return (
    SABSA_LAYERS.find((l) => l.id === key) ??
    SABSA_LAYERS.find((l) => l.name.en.toLowerCase() === key || l.name.ja === id.trim())
  );
}

/** セキュリティ成果物を ID で引く */
export function findSecurityArtifact(id: string): SecurityArtifact | undefined {
  const key = id.trim().toLowerCase();
  return (
    SECURITY_ARTIFACTS.find((a) => a.id === key) ??
    SECURITY_ARTIFACTS.find((a) => a.name.en.toLowerCase() === key || a.name.ja === id.trim())
  );
}

/** ADM フェーズ ID からセキュリティの並走計画を引く */
export function securityMappingFor(phaseId: string): SecurityPhaseMapping | undefined {
  const key = phaseId.trim().toLowerCase();
  return SECURITY_PHASE_MAP.find((m) => m.phaseId === key);
}

/** ADM フェーズ ID で作成・更新するセキュリティ成果物を引く */
export function securityArtifactsForPhase(phaseId: string): SecurityArtifact[] {
  const key = phaseId.trim().toLowerCase();
  const mapping = securityMappingFor(key);
  const ids = new Set<string>(mapping ? mapping.artifactIds : []);
  for (const a of SECURITY_ARTIFACTS) {
    if (a.phaseIds.includes(key)) ids.add(a.id);
  }
  const result: SecurityArtifact[] = [];
  for (const id of ids) {
    const found = findSecurityArtifact(id);
    if (found) result.push(found);
  }
  return result;
}

/** ADM フェーズ ID に紐づく失敗パターンを引く */
export function securityPitfallsForPhase(phaseId: string): SecurityPitfall[] {
  const key = phaseId.trim().toLowerCase();
  return SECURITY_PITFALLS.filter((p) => p.phaseIds.includes(key));
}

/** 規制対象かどうかでセキュリティ要件を絞り込む */
export function securityRequirementsFor(regulated: boolean): SecurityRequirementItem[] {
  return regulated
    ? SECURITY_REQUIREMENTS
    : SECURITY_REQUIREMENTS.filter((r) => r.regulatedOnly !== true);
}
