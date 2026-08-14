/**
 * 業界別 EA ガイダンス / Industry-specific EA guidance.
 *
 * 業界ごとに「EA としてどこを見るべきか」を整理した独自解説。
 * TOGAF 標準の原文は転載しない。
 *
 * 注意: `regulatory` の記述は一般に広く知られている事実の範囲にとどめた概観であり、
 * 法的助言ではない。実際の適用範囲・要求水準は業種・所在地・時期で異なるため、
 * 必ず自組織の法務・コンプライアンス部門および所管当局の一次情報で確認すること。
 *
 * Note: the `regulatory` entries are a general orientation, not legal advice.
 * Applicability and required levels differ by jurisdiction, sub-sector, and date.
 * Always confirm against your own legal function and the primary source.
 */

import type { Bilingual } from './types.js';

/** 業界別ガイダンス / Guidance for one industry. */
export interface IndustryGuidance {
  id: string;
  name: Bilingual;
  /** その業界で特に効く観点 */
  drivers: Bilingual[];
  /** よくある落とし穴 */
  pitfalls: Bilingual[];
  /** 規制・標準面の留意点(一般的な事実の範囲で) */
  regulatory: Bilingual[];
  /** 優先的に見るべき ADM フェーズ ID */
  phaseIds: string[];
  /** 優先的に使う技法 ID */
  techniqueIds: string[];
  /** 優先的に作る成果物 ID */
  deliverableIds: string[];
  /** 検索用キーワード(日英。業界名の表記ゆれを含む) */
  keywords: string[];
}

export const INDUSTRIES: IndustryGuidance[] = [
  {
    id: 'manufacturing',
    name: { ja: '製造業', en: 'Manufacturing' },
    drivers: [
      { ja: '設計・生産・保守にまたがる製品情報の一貫性。ここが崩れると全工程で手戻りが出る。', en: 'Consistency of product information across design, production, and service. When it breaks, rework appears at every stage.' },
      { ja: '工場現場(OT)と情報系(IT)の境界設計。両者はライフサイクルも更新頻度も別物として扱う。', en: 'The boundary between shop-floor OT and corporate IT. Their lifecycles and change cadences must be modelled separately.' },
      { ja: 'サプライチェーンの可視性。部品の調達リードタイムが計画の実効性を決める。', en: 'Supply chain visibility. Component lead times determine whether the plan is executable at all.' },
      { ja: '設備の稼働率と品質データの活用。改善の投資対効果を語れる唯一の定量根拠になりやすい。', en: 'Equipment utilization and quality data — usually the only quantitative basis you have for an ROI story.' },
      { ja: '製品のサービス化(保守・遠隔監視)による事業モデルの変化。', en: 'Servitization — maintenance and remote monitoring — shifting the business model itself.' },
    ],
    pitfalls: [
      { ja: '工場ごとに独自最適化されており、共通の目標アーキテクチャを 1 つに決めようとして頓挫する。段階を分ける。', en: 'Each plant is locally optimized, and a single common target architecture stalls. Define levels of commonality instead.' },
      { ja: '部品表(BOM)が設計・製造・保守で別々に存在している事実を、正本ビューを描くまで誰も認めない。', en: 'Design, manufacturing, and service each hold their own bill of materials — a fact nobody admits until the system-of-record view is drawn.' },
      { ja: '生産設備は 10〜20 年動く。IT の 3〜5 年サイクルで更新計画を立てると現場と衝突する。', en: 'Production equipment lives 10–20 years. Planning refresh on an IT-style 3–5 year cycle guarantees conflict with the plant.' },
      { ja: 'OT ネットワークへのセキュリティ対策を IT と同じ手法で入れて、ラインを止めてしまう。', en: 'Applying IT security controls unchanged to the OT network and stopping the line.' },
    ],
    regulatory: [
      { ja: '製品安全・トレーサビリティの要求から、ロット単位の追跡記録の保存が求められる分野が多い。保存年限を設計前に確認する。', en: 'Product safety and traceability obligations often require lot-level records. Confirm the retention period before designing.' },
      { ja: '輸出管理・原産地規則により、部品や設計データの国外移転に制約がかかる場合がある。', en: 'Export control and rules of origin can restrict moving parts or design data across borders.' },
      { ja: '品質マネジメントや情報セキュリティの国際規格(ISO 9001 / ISO 27001 など)への適合が取引条件になることがある。', en: 'Conformance to international standards such as ISO 9001 or ISO 27001 is frequently a condition of trade.' },
      { ja: '近年は製品の環境情報(カーボンフットプリント等)の開示要求が拡大しており、データ収集の設計に影響する。', en: 'Disclosure requirements for product environmental data, such as carbon footprint, are expanding and shape data collection design.' },
    ],
    phaseIds: ['b', 'c', 'd', 'e'],
    techniqueIds: ['capability-based-planning', 'gap-analysis', 'interoperability-requirements', 'migration-planning-techniques'],
    deliverableIds: ['business-capability-map', 'data-entity-catalog', 'application-portfolio-catalog', 'architecture-roadmap'],
    keywords: ['manufacturing', '製造', '製造業', 'メーカー', '工場', 'factory', 'plant', 'ot', 'iot', 'bom', '部品表', 'supply chain', 'サプライチェーン', 'smart factory', 'スマートファクトリー', '自動車', 'automotive', '半導体', 'semiconductor', '生産管理'],
  },
  {
    id: 'financial-services',
    name: { ja: '金融サービス(銀行・保険・証券)', en: 'Financial Services (Banking, Insurance, Securities)' },
    drivers: [
      { ja: '勘定系(記録の正しさ)と顧客接点(変化の速さ)を別々の速度で運営できる構造。', en: 'A structure that lets the ledger (correctness) and the customer channel (speed of change) run at different cadences.' },
      { ja: '規制報告に耐えるデータ系統(リネージ)。数字の出どころを説明できることが要件になる。', en: 'Data lineage that survives regulatory reporting. Explaining where a number came from is itself a requirement.' },
      { ja: '不正検知・リスク計測のためのデータ即時性。', en: 'Data timeliness for fraud detection and risk measurement.' },
      { ja: 'API を通じた外部連携(オープンバンキング、代理店・保険ブローカー連携)。', en: 'External integration through APIs — open banking, agent and broker channels.' },
      { ja: '長期運用されている中核システムの刷新順序。一度に替えられないことを前提に刻む。', en: 'The sequencing of core-system renewal, planned on the assumption that it cannot be replaced in one move.' },
    ],
    pitfalls: [
      { ja: '中核システムの全面刷新を単一プロジェクトで計画し、数年間何も出せずに中断する。', en: 'Planning a full core replacement as one project, delivering nothing for years, and being cancelled.' },
      { ja: '顧客データが商品別システムに分散しており、「顧客の名寄せ」を技術課題として過小評価する。', en: 'Customer data scattered across product systems, with identity resolution written off as a minor technical task.' },
      { ja: '監査対応を後付けで設計し、証跡の取得箇所が足りず作り直しになる。', en: 'Designing audit support after the fact and rebuilding because the evidence points were never instrumented.' },
      { ja: 'リスク・コンプライアンス部門をステークホルダーに入れ忘れ、設計後半で要件が増える。', en: 'Leaving risk and compliance off the stakeholder map, then absorbing new requirements late in design.' },
    ],
    regulatory: [
      { ja: '金融当局による監督下にあり、システムリスク管理・外部委託管理・障害報告について枠組みの整備が一般に求められる。', en: 'Supervised by financial authorities; frameworks for system risk management, outsourcing oversight, and incident reporting are generally expected.' },
      { ja: '取引記録・本人確認記録の保存年限が定められていることが多く、アーカイブ設計に直結する。', en: 'Retention periods for transaction and identity records are commonly prescribed, which drives archive design.' },
      { ja: 'マネーロンダリング対策(AML)・本人確認(KYC)の要求により、顧客データの品質と追跡性が業務要件になる。', en: 'AML and KYC obligations make customer data quality and traceability a business requirement, not a nice-to-have.' },
      { ja: 'カード決済を扱う場合、業界標準(PCI DSS)への適合がカード会社との契約上の条件となる。', en: 'Where card payments are handled, conformance to the PCI DSS industry standard is typically a contractual condition.' },
      { ja: '個人情報・信用情報の取扱いは一般法に加えて業法上の制約が重なるため、法務部門との早期確認が必須。', en: 'Handling of personal and credit data sits under sector law on top of general privacy law; confirm early with legal.' },
    ],
    phaseIds: ['a', 'c', 'e', 'g'],
    techniqueIds: ['risk-management', 'gap-analysis', 'migration-planning-techniques', 'architecture-governance'],
    deliverableIds: ['architecture-principles', 'data-entity-catalog', 'transition-architecture', 'compliance-assessment'],
    keywords: ['financial', 'finance', '金融', '銀行', 'bank', 'banking', '保険', 'insurance', '証券', 'securities', 'fintech', 'フィンテック', '勘定系', 'core banking', 'aml', 'kyc'],
  },
  {
    id: 'public-sector',
    name: { ja: '公共・自治体', en: 'Public Sector and Local Government' },
    drivers: [
      { ja: '住民サービスの手続きを、窓口・郵送・オンラインで同じ結果にする一貫性。', en: 'Consistency of outcome across counter, post, and online channels for the same procedure.' },
      { ja: '制度改正が外部要因として突然入る前提での、変更容易性の確保。', en: 'Designing for changeability, given that statutory change arrives from outside and without notice.' },
      { ja: '組織間・自治体間でのデータ標準の共通化(様式・コード体系)。', en: 'Common data standards across agencies and municipalities: forms and code systems.' },
      { ja: '説明責任。意思決定の根拠を後から第三者が追えることが設計要件になる。', en: 'Accountability: a third party must be able to reconstruct the basis of a decision later.' },
      { ja: '調達制度の制約下での段階的な移行(単年度予算・入札の周期)。', en: 'Incremental migration inside procurement constraints — annual budgets and tender cycles.' },
    ],
    pitfalls: [
      { ja: '単年度予算に合わせて計画を切り刻み、年度をまたぐアーキテクチャの整合が誰の責任でもなくなる。', en: 'Slicing the plan to the annual budget until cross-year architectural consistency belongs to nobody.' },
      { ja: '特定ベンダーの実装に業務ルールが埋め込まれ、移行時に仕様が誰にも分からない。', en: 'Business rules embedded in one vendor\'s implementation, so nobody knows the specification at migration time.' },
      { ja: '「標準準拠」を宣言するだけで、準拠レベルの判定基準を決めていない。', en: 'Declaring conformance to a standard without defining how conformance will be judged.' },
      { ja: 'デジタル化の対象を申請フォームだけに限り、背後の審査業務を変えないため効果が出ない。', en: 'Digitizing only the application form and leaving the assessment process untouched, so nothing improves.' },
    ],
    regulatory: [
      { ja: '行政手続や情報公開に関する法令に基づき、記録の保存・開示請求への対応が求められる。', en: 'Administrative procedure and freedom-of-information law generally require record retention and response to disclosure requests.' },
      { ja: '公的機関向けの情報セキュリティ基準やガイドラインが定められている国が多く、調達仕様に組み込まれる。', en: 'Most jurisdictions publish security baselines for public bodies, which then appear inside procurement specifications.' },
      { ja: '調達は競争性・公平性の観点から手続が定められており、アーキテクチャの決め方が調達の適法性に影響しうる。', en: 'Procurement rules exist for competition and fairness; how architecture decisions are framed can affect procurement validity.' },
      { ja: '個人情報の目的外利用・外部提供には一般に法的な制約があり、データ連携設計の前提になる。', en: 'Secondary use and external sharing of personal data are legally constrained, which is a premise of any data-sharing design.' },
    ],
    phaseIds: ['preliminary', 'a', 'b', 'e'],
    techniqueIds: ['stakeholder-management', 'interoperability-requirements', 'architecture-governance', 'business-scenarios'],
    deliverableIds: ['architecture-principles', 'stakeholder-map', 'architecture-requirements-spec', 'architecture-roadmap'],
    keywords: ['public sector', 'government', '公共', '行政', '自治体', '官公庁', 'govtech', '地方公共団体', 'municipal', '住民サービス', '電子申請'],
  },
  {
    id: 'healthcare',
    name: { ja: '医療・ヘルスケア', en: 'Healthcare' },
    drivers: [
      { ja: '患者を軸にした情報の統合。診療科・施設をまたいで同じ患者と分かることが前提。', en: 'Patient-centred information. Recognizing the same patient across departments and sites is the precondition for everything else.' },
      { ja: '臨床業務を止めない可用性。診療時間帯の停止許容度は極端に低い。', en: 'Availability that never interrupts clinical work. Tolerance for downtime during clinic hours is extremely low.' },
      { ja: '医療機器・部門システムとの相互運用。標準規格への準拠度が統合コストを決める。', en: 'Interoperability with devices and departmental systems; the degree of standards adherence sets the integration cost.' },
      { ja: '臨床安全性。誤ったデータ表示が直接的な健康被害になりうるという前提でのリスク評価。', en: 'Clinical safety: risk assessed on the premise that a wrong display can directly harm a person.' },
      { ja: '研究・分析のための二次利用と、そのための匿名化・同意管理。', en: 'Secondary use for research and analytics, with the de-identification and consent management it requires.' },
    ],
    pitfalls: [
      { ja: '臨床現場のワークフローを観察せずに設計し、実際には使われず紙の運用が残る。', en: 'Designing without observing clinical workflow, so the system is bypassed and the paper process survives.' },
      { ja: '部門システムが個別最適で導入されており、患者 ID の突合が後から巨大な課題になる。', en: 'Departmental systems bought independently, leaving patient identity matching as a huge late-discovered problem.' },
      { ja: '医師・看護師をステークホルダーに入れず、情報システム部門だけで要件を決める。', en: 'Fixing requirements inside the IT department without clinicians on the stakeholder map.' },
      { ja: '可用性要件を「24 時間 365 日」と一括で置き、実際の停止コストに応じた投資配分ができない。', en: 'Declaring a blanket 24×7 requirement, which prevents allocating investment against actual downtime cost.' },
    ],
    regulatory: [
      { ja: '診療記録は保存年限が法令で定められていることが多く、アーカイブとシステム廃止計画に直接影響する。', en: 'Clinical records commonly carry statutory retention periods, which directly constrain archiving and system retirement.' },
      { ja: '患者データは要配慮個人情報として、一般の個人情報より厳しい取扱いが求められるのが通例。', en: 'Patient data is typically treated as a special category requiring stricter handling than ordinary personal data.' },
      { ja: '医療情報システムの安全管理に関するガイドラインが所管官庁から示されている国が多く、設計の前提として参照される。', en: 'Many jurisdictions publish security guidance for health information systems, referenced as a design premise.' },
      { ja: '一部のソフトウェアは医療機器としての規制対象になりうるため、機能追加の前に該当性を確認する。', en: 'Some software can fall in scope as a medical device; check applicability before adding clinical functionality.' },
      { ja: '相互運用の標準(HL7 / FHIR / DICOM など)への準拠が、接続コストと将来の選択肢を左右する。', en: 'Adherence to interoperability standards such as HL7, FHIR, and DICOM governs connection cost and future optionality.' },
    ],
    phaseIds: ['b', 'c', 'd', 'g'],
    techniqueIds: ['interoperability-requirements', 'risk-management', 'business-scenarios', 'stakeholder-management'],
    deliverableIds: ['data-entity-catalog', 'architecture-requirements-spec', 'application-portfolio-catalog', 'compliance-assessment'],
    keywords: ['healthcare', 'health', '医療', 'ヘルスケア', '病院', 'hospital', '電子カルテ', 'ehr', 'emr', 'clinical', '臨床', 'hl7', 'fhir', '介護'],
  },
  {
    id: 'retail-ecommerce',
    name: { ja: '小売・EC', en: 'Retail and E-commerce' },
    drivers: [
      { ja: '在庫の単一の真実。店舗・倉庫・EC で在庫数が食い違うと売上と信頼の両方を失う。', en: 'A single truth for inventory. When store, warehouse, and web disagree, you lose both revenue and trust.' },
      { ja: 'チャネルをまたいだ顧客の同一性と購買履歴の統合。', en: 'Customer identity and purchase history unified across channels.' },
      { ja: '需要の季節変動・キャンペーン時のピークに耐える弾力性。', en: 'Elasticity that survives seasonal peaks and campaign spikes.' },
      { ja: '商品マスタの整備。属性の欠落が検索性と広告効率に直結する。', en: 'Product master quality: missing attributes directly degrade findability and advertising efficiency.' },
      { ja: '受注から配送・返品までの一連の処理(フルフィルメント)の見通し。', en: 'End-to-end visibility of fulfilment, from order through delivery and returns.' },
    ],
    pitfalls: [
      { ja: 'EC サイトの刷新だけを対象にし、在庫・受注・物流の背後の仕組みを触らないため体験が改善しない。', en: 'Scoping only the storefront rebuild and leaving inventory, order, and logistics untouched, so the experience does not improve.' },
      { ja: 'キャンペーンのピークを平常時の延長で見積もり、最も売れる日に落ちる。', en: 'Sizing peak as an extrapolation of a normal day, and failing on the highest-revenue day of the year.' },
      { ja: '商品マスタのオーナーが決まっておらず、部門ごとに別々の商品コードが増殖する。', en: 'No owner for the product master, so each unit breeds its own product codes.' },
      { ja: '返品・キャンセルの流れを設計から外し、後から例外処理の山を作る。', en: 'Leaving returns and cancellations out of the design and inheriting a mountain of exception handling.' },
    ],
    regulatory: [
      { ja: 'カード決済を扱う場合、業界標準(PCI DSS)への適合が求められるのが一般的。決済情報を自社に持たない設計も選択肢。', en: 'Card handling generally requires PCI DSS conformance; a design that never stores card data is a valid alternative.' },
      { ja: '通信販売には表示義務や返品条件に関する消費者保護法制があり、業務要件として扱う。', en: 'Distance selling carries consumer-protection obligations on disclosure and returns; treat them as business requirements.' },
      { ja: '顧客の購買履歴を用いた広告配信は、同意取得と越境移転の観点でプライバシー法制の影響を受ける。', en: 'Using purchase history for advertising is affected by privacy law on consent and cross-border transfer.' },
      { ja: '食品・医薬品等を扱う場合は、表示・トレーサビリティの追加規制が重なる。', en: 'Food and pharmaceutical lines add labelling and traceability obligations on top.' },
    ],
    phaseIds: ['b', 'c', 'e'],
    techniqueIds: ['business-scenarios', 'capability-based-planning', 'gap-analysis', 'interoperability-requirements'],
    deliverableIds: ['business-capability-map', 'data-entity-catalog', 'architecture-definition-document', 'architecture-roadmap'],
    keywords: ['retail', '小売', '流通', 'ec', 'e-commerce', 'ecommerce', 'eコマース', '通販', 'ネット通販', 'omnichannel', 'オムニチャネル', '在庫', 'inventory', 'pos', '店舗', '商品マスタ'],
  },
  {
    id: 'telecommunications',
    name: { ja: '通信', en: 'Telecommunications' },
    drivers: [
      { ja: 'サービス設計と網の設計の分離。商品を変えるたびに網の設計に手を入れる構造を避ける。', en: 'Separating service design from network design, so changing a product does not mean touching the network.' },
      { ja: '受注から開通・課金までの一連の処理の自動化率。ここが人手だと成長が頭打ちになる。', en: 'The automation rate from order to activation to billing. Manual steps here cap growth.' },
      { ja: '大量データの処理と、その保存コストの設計。', en: 'High-volume data processing and the design of its storage cost.' },
      { ja: '設備投資の長期回収と、サービス層の短期サイクルという二重の時間軸。', en: 'Two time axes at once: long-payback network investment and short-cycle service change.' },
      { ja: '業界標準のプロセス・データモデルを部分的に採用することによる、ベンダー間の共通言語の確保。', en: 'Selective adoption of industry process and data models to create a shared vocabulary across vendors.' },
    ],
    pitfalls: [
      { ja: '業界標準モデルを丸ごと導入しようとして、自社に必要のない部分の整備に工数を使い果たす。', en: 'Adopting an industry reference model wholesale and exhausting the budget on parts you do not need.' },
      { ja: '商品(料金プラン)の組み合わせ爆発を放置し、システム側で例外処理として吸収し続ける。', en: 'Letting the product and tariff combinations explode and absorbing them as exceptions in the systems forever.' },
      { ja: '網の設計者とサービス側の設計者が別会議体で動き、移行計画が噛み合わない。', en: 'Network and service architects meeting separately, so the migration plans never mesh.' },
      { ja: '旧サービスの停止計画を作らず、少数の利用者のために古い設備を維持し続ける。', en: 'Never planning legacy service withdrawal and keeping old equipment alive for a handful of subscribers.' },
    ],
    regulatory: [
      { ja: '電気通信事業には免許・登録制度があり、通信の秘密の保護が法的義務として課されるのが一般的。', en: 'Telecommunications is a licensed activity, and protection of communications confidentiality is typically a legal duty.' },
      { ja: '通信ログの保存や当局への提供に関する要求が国ごとに定められている場合がある。', en: 'Requirements on retention of communication records and provision to authorities vary by jurisdiction.' },
      { ja: '重要インフラとして、障害時の報告義務や設備の冗長性に関する監督を受けることが多い。', en: 'As critical infrastructure, incident reporting duties and resilience supervision commonly apply.' },
      { ja: '相互接続・番号ポータビリティなど、他事業者との連携が制度で定められている領域がある。', en: 'Interconnection and number portability are areas where cooperation with other operators is mandated.' },
    ],
    phaseIds: ['b', 'c', 'd', 'e'],
    techniqueIds: ['capability-based-planning', 'interoperability-requirements', 'migration-planning-techniques', 'architecture-governance'],
    deliverableIds: ['business-capability-map', 'architecture-definition-document', 'technology-standards-catalog', 'transition-architecture'],
    keywords: ['telecom', 'telecommunications', '通信', '通信事業', 'キャリア', 'carrier', 'mno', 'mvno', 'oss', 'bss', 'ネットワーク', '5g'],
  },
  {
    id: 'energy-utilities',
    name: { ja: 'エネルギー・公益', en: 'Energy and Utilities' },
    drivers: [
      { ja: '設備資産の長寿命化。数十年動く資産の情報を、システム更新をまたいで維持する設計。', en: 'Very long-lived physical assets. Asset information must survive several generations of system change.' },
      { ja: '制御系と情報系の分離と、その間の限定的で監査可能な接点。', en: 'Separation of control systems from information systems, with a narrow and auditable interface between them.' },
      { ja: '需給の変動に対する計画・予測データの精度。', en: 'Accuracy of forecasting and planning data against supply-demand volatility.' },
      { ja: '分散電源・再生可能エネルギーの増加による、取引・精算処理の複雑化。', en: 'Distributed and renewable generation making settlement and trading processes materially more complex.' },
      { ja: '計測データ(スマートメーター等)の大量取得と、その利用範囲の設計。', en: 'High-volume metering data and a deliberate design for how far it may be used.' },
    ],
    pitfalls: [
      { ja: '制御系(OT)を IT の更新計画に含め、現場から拒否されて計画全体が止まる。', en: 'Folding control systems into an IT refresh plan, being refused by operations, and stalling the whole programme.' },
      { ja: '設備台帳が複数存在し、どれが正本か決まらないまま保全業務のデジタル化を始める。', en: 'Starting maintenance digitization while several asset registers coexist and none is agreed as the record.' },
      { ja: '制度改正(市場設計の変更)の影響を業務要件としてしか扱わず、アーキテクチャの変更容易性に落とさない。', en: 'Treating market-design change as a business requirement only, never translating it into architectural changeability.' },
      { ja: '重要インフラのセキュリティ対策を、ネットワーク分離だけで完了したことにする。', en: 'Declaring critical-infrastructure security complete on the basis of network segregation alone.' },
    ],
    regulatory: [
      { ja: '重要インフラ事業者として、セキュリティ対策と障害時の報告について監督を受けるのが一般的。', en: 'As critical infrastructure operators, security measures and incident reporting are commonly supervised.' },
      { ja: '料金・供給条件が制度で規定される領域があり、システムの計算ロジックが制度改正に追随する必要がある。', en: 'Tariffs and supply conditions are regulated in places, so calculation logic must track regulatory change.' },
      { ja: '計測データは個人の生活実態を示しうるため、利用目的と共有範囲に関するプライバシー上の配慮が求められる。', en: 'Metering data can reveal household behaviour, so purpose limitation and sharing scope need privacy consideration.' },
      { ja: '環境・排出に関する報告義務が拡大しており、データの収集経路と検証可能性が設計要件になりつつある。', en: 'Environmental and emissions reporting duties are expanding, making data provenance and verifiability a design requirement.' },
    ],
    phaseIds: ['b', 'd', 'e', 'g'],
    techniqueIds: ['risk-management', 'capability-based-planning', 'gap-analysis', 'architecture-governance'],
    deliverableIds: ['data-entity-catalog', 'technology-standards-catalog', 'architecture-roadmap', 'compliance-assessment'],
    keywords: ['energy', 'utilities', 'エネルギー', '公益', '電力', 'power', 'utility', 'ガス', 'gas', '水道', 'water', 'スマートメーター', 'smart meter', 'ot', 'scada', 'electricity', '電気', '発電', '再生可能エネルギー'],
  },
  {
    id: 'transport-logistics',
    name: { ja: '運輸・物流', en: 'Transport and Logistics' },
    drivers: [
      { ja: '荷物・車両・便の現在位置と状態の把握。可視化そのものが商品価値になる。', en: 'Knowing where every shipment, vehicle, and trip is right now. Visibility is itself the product.' },
      { ja: '計画(ダイヤ・配車)と実績のずれを吸収する仕組み。', en: 'Mechanisms that absorb the gap between plan — timetable, dispatch — and what actually happened.' },
      { ja: '協力会社・荷主とのデータ交換。自社だけ整備しても効果が出にくい構造。', en: 'Data exchange with subcontractors and shippers. Improving only your own side yields little.' },
      { ja: '現場端末(ドライバー・倉庫作業者)の使い勝手が全体の効率を支配する。', en: 'Field device usability — drivers, warehouse staff — dominates overall efficiency.' },
      { ja: '労働時間・安全管理に関するデータの正確な記録。', en: 'Accurate recording of working hours and safety management data.' },
    ],
    pitfalls: [
      { ja: '自社システムだけを最適化し、協力会社との受け渡しが FAX や電話のまま残る。', en: 'Optimizing only your own systems while hand-offs to subcontractors remain fax and phone calls.' },
      { ja: '拠点ごとに運用ルールが違う事実を無視して、共通システムを一斉展開して混乱する。', en: 'Ignoring that each site runs different rules and rolling out one common system at once.' },
      { ja: 'リアルタイム追跡を導入したが、遅延時に誰が判断するかを決めておらず活用されない。', en: 'Introducing real-time tracking without deciding who acts on a delay, so nobody uses it.' },
      { ja: '通信が届かない環境(トンネル・倉庫内・海上)を前提に入れず、オフライン動作を後付けする。', en: 'Forgetting connectivity dead zones — tunnels, warehouses, at sea — and bolting on offline behaviour later.' },
    ],
    regulatory: [
      { ja: '運行記録・労働時間の管理について法令上の記録義務がある領域が多く、記録の改ざん防止が要件になる。', en: 'Operating records and working-hour management often carry statutory recording duties, making tamper resistance a requirement.' },
      { ja: '危険物・食品・医薬品などの輸送には、温度管理や追跡に関する追加要求が課される。', en: 'Carrying dangerous goods, food, or pharmaceuticals adds temperature control and tracking obligations.' },
      { ja: '国際輸送では通関・輸出入手続に関する電子申告の仕組みへの接続が必要になる。', en: 'International movement requires connecting to electronic customs and trade declaration systems.' },
      { ja: '位置情報は個人の行動を示しうるため、従業員のデータとしての取扱いに配慮が必要。', en: 'Location data can reveal individual behaviour, so employee data handling deserves explicit care.' },
    ],
    phaseIds: ['b', 'c', 'e'],
    techniqueIds: ['business-scenarios', 'interoperability-requirements', 'gap-analysis', 'business-transformation-readiness'],
    deliverableIds: ['business-capability-map', 'application-portfolio-catalog', 'architecture-requirements-spec', 'implementation-migration-plan'],
    keywords: ['transport', 'logistics', '運輸', '物流', '輸送', '倉庫', 'warehouse', 'wms', 'tms', '配送', 'delivery', 'supply chain', 'サプライチェーン', '3pl'],
  },
  {
    id: 'education',
    name: { ja: '教育', en: 'Education' },
    drivers: [
      { ja: '学習者を軸にした情報の一貫性(入学から在学・卒業・修了後まで)。', en: 'Learner-centred consistency of information, from admission through study to alumni.' },
      { ja: '学期・年度という強い周期性。繁忙期に変更を入れられない制約が計画を規定する。', en: 'A strong term and academic-year rhythm. The ban on change during peak periods governs the plan.' },
      { ja: '教員・事務・学生という利害の異なる三者の要求の調整。', en: 'Reconciling three groups with different interests: faculty, administration, and students.' },
      { ja: '学習データの活用と、その利用範囲に関する合意形成。', en: 'Use of learning data, and building agreement on how far that use may go.' },
      { ja: '限られた予算下での、共同利用・外部サービス活用の判断。', en: 'Deciding on shared services and external providers under a constrained budget.' },
    ],
    pitfalls: [
      { ja: '部局ごとにシステムを導入し、学籍情報が複数箇所で管理されていることに誰も責任を持たない。', en: 'Systems bought faculty by faculty, leaving student records in several places with no single owner.' },
      { ja: '教員をステークホルダーに入れず、事務効率だけで設計して現場に使われない。', en: 'Designing for administrative efficiency without faculty on the stakeholder map, so nothing is adopted.' },
      { ja: '年度切替の処理を軽く見積もり、最も止められない時期に障害を起こす。', en: 'Underestimating year-end rollover and failing in the one window that cannot tolerate an outage.' },
      { ja: '学習管理システムの導入を目的化し、授業設計そのものを変えないため成果が出ない。', en: 'Making the learning platform the goal without changing course design, so outcomes do not move.' },
    ],
    regulatory: [
      { ja: '学籍・成績に関する記録は保存年限が定められていることが多く、証明書発行の要求と合わせて設計する。', en: 'Enrolment and grade records commonly carry retention periods; design them together with certificate issuance needs.' },
      { ja: '未成年者の個人情報を扱う場合、保護者の同意など追加の要件が課される場合がある。', en: 'Handling minors\' personal data can bring additional requirements such as guardian consent.' },
      { ja: '公的補助を受ける機関では、報告様式や会計処理に関する制度上の要求が業務要件になる。', en: 'Publicly funded institutions inherit reporting formats and accounting rules as business requirements.' },
      { ja: '国際的な学生・研究データの移転はプライバシー法制の越境移転規制の対象になりうる。', en: 'Cross-border movement of student and research data can fall under transfer restrictions in privacy law.' },
    ],
    phaseIds: ['a', 'b', 'c', 'e'],
    techniqueIds: ['stakeholder-management', 'business-scenarios', 'capability-based-planning', 'business-transformation-readiness'],
    deliverableIds: ['stakeholder-map', 'business-capability-map', 'data-entity-catalog', 'architecture-roadmap'],
    keywords: ['education', '教育', '学校', 'school', '大学', 'university', 'higher education', '学習', 'learning', 'lms', '学籍', 'edtech', '教育機関'],
  },
  {
    id: 'saas-tech',
    name: { ja: 'SaaS / テクノロジー企業', en: 'SaaS and Technology Companies' },
    drivers: [
      { ja: 'マルチテナントの分離設計。分離の粒度がコスト構造と販売可能な契約形態を決める。', en: 'Multi-tenant isolation design. The granularity of isolation determines cost structure and what contracts you can sell.' },
      { ja: '製品アーキテクチャと社内 IT の区別。両者を同じ会議体で扱うと双方が停滞する。', en: 'Separating product architecture from internal IT. Running both through one forum stalls both.' },
      { ja: '単位あたりの原価(顧客・リクエスト単位)を測れる構造。', en: 'A structure that lets you measure unit cost per customer or per request.' },
      { ja: '継続的なリリースと、後方互換性を保つ API のバージョン戦略。', en: 'Continuous release paired with an API versioning strategy that preserves backward compatibility.' },
      { ja: '成長段階に応じたアーキテクチャの作り替え時期の見極め。早すぎる分割も遅すぎる分割も損。', en: 'Judging when to re-architect for the next growth stage. Splitting too early and too late are both expensive.' },
    ],
    pitfalls: [
      { ja: 'EA の枠組みを製品開発チームにそのまま持ち込み、開発速度を落として反発を受ける。', en: 'Importing the EA process wholesale into product teams, slowing delivery and triggering rejection.' },
      { ja: '「後で直す」前提の実装が積み上がり、技術的負債が可視化されないまま成長が止まる。', en: 'Accumulating "we will fix it later" implementations until invisible technical debt caps growth.' },
      { ja: '大口顧客ごとの個別対応がコードに散らばり、テナント間の差分が誰にも把握できなくなる。', en: 'Per-customer special cases scattered through the code until nobody can enumerate the tenant differences.' },
      { ja: 'クラウド費用を全社一括で見ており、どの機能が赤字かを説明できない。', en: 'Viewing cloud spend only in aggregate, unable to say which feature loses money.' },
    ],
    regulatory: [
      { ja: '顧客データを預かる立場になるため、契約上のデータ保護義務(所在地、削除、監査対応)が設計要件になる。', en: 'As a custodian of customer data, contractual duties on location, deletion, and audit support become design requirements.' },
      { ja: '顧客からの保証要求に応えるため、第三者認証(ISO 27001、SOC 2 など)の取得が事実上の販売条件になることが多い。', en: 'Third-party attestations such as ISO 27001 or SOC 2 are frequently a de facto condition of sale.' },
      { ja: '個人データの越境移転は、顧客の所在地の法制に応じて保管リージョンの選択肢を制約する。', en: 'Cross-border transfer rules in the customer\'s jurisdiction constrain which storage regions you may offer.' },
      { ja: 'オープンソースのライセンス条件は、製品の配布形態によって義務が変わるため事前に確認する。', en: 'Open-source licence obligations change with how the product is distributed; confirm before you ship.' },
    ],
    phaseIds: ['preliminary', 'c', 'd', 'h'],
    techniqueIds: ['architecture-principles-technique', 'architecture-governance', 'architecture-maturity', 'capability-based-planning'],
    deliverableIds: ['architecture-principles', 'technology-standards-catalog', 'architecture-definition-document', 'architecture-repository'],
    keywords: ['saas', 'tech', 'テック', 'テクノロジー', 'ソフトウェア', 'software', 'startup', 'スタートアップ', 'マルチテナント', 'multi-tenant', 'cloud', 'クラウド', 'platform', 'プラットフォーム'],
  },
];

/** ASCII のみで構成されるか(単語境界で判定してよいか) */
function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]+$/.test(s);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * キーワードが文中に現れるか。
 * 英数キーワードは単語境界で判定し('ot' が 'total' に、'gas' が 'gasoline' に当たらないように)、
 * 日本語キーワードは分かち書きが無いため素の部分一致で判定する。
 */
function containsKeyword(haystackLower: string, keywordLower: string): boolean {
  if (isAscii(keywordLower)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keywordLower)}($|[^a-z0-9])`);
    return re.test(haystackLower);
  }
  return haystackLower.includes(keywordLower);
}

/** 部分一致に使ってよい最短長。英数は 3 文字以上、日本語は 2 文字以上。 */
function minMatchLength(s: string): number {
  return isAscii(s) ? 3 : 2;
}

/**
 * ID・名称・キーワードの部分一致で業界ガイダンスを引く。
 * "製造業" / "manufacturing" / "銀行" のようなゆれた入力に加えて、
 * "金融業界の課題" / "a regional bank" のような自由記述からも引けるようにする。
 */
export function findIndustry(nameOrId: string): IndustryGuidance | undefined {
  const raw = nameOrId.trim();
  if (raw.length === 0) return undefined;
  const key = raw.toLowerCase();

  // 1. ID 完全一致
  const byId = INDUSTRIES.find((i) => i.id === key);
  if (byId) return byId;

  // 2. 名称の完全一致
  const byName = INDUSTRIES.find((i) => i.name.en.toLowerCase() === key || i.name.ja === raw);
  if (byName) return byName;

  // 3. キーワード完全一致
  const byKeyword = INDUSTRIES.find((i) => i.keywords.some((k) => k.toLowerCase() === key));
  if (byKeyword) return byKeyword;

  // ここから先は部分一致。短すぎる入力("a" / "ai" など)は誤ヒットしかしないので打ち切る。
  if (key.length < minMatchLength(key)) return undefined;

  // 4. キーワードが入力を含む("bank" → "banking")
  const byKeywordPrefix = INDUSTRIES.find((i) =>
    i.keywords.some((k) => k.toLowerCase().includes(key)),
  );
  if (byKeywordPrefix) return byKeywordPrefix;

  // 5. 入力がキーワードを含む("金融業界の課題" → 金融、"a regional bank" → bank)。
  //    日本語の業界キーワードは 2 文字("金融"/"医療"/"物流")が主力なので長さで足切りせず、
  //    英数キーワードは単語境界で判定して誤ヒットを防ぐ。
  //    複数当たった場合は最も長いキーワードを採用する("電気自動車" では '電気' より '自動車')。
  let best: IndustryGuidance | undefined;
  let bestLength = 0;
  for (const industry of INDUSTRIES) {
    for (const k of industry.keywords) {
      const kl = k.toLowerCase();
      if (kl.length < 2) continue;
      if (kl.length <= bestLength) continue; // 同着は先に定義された業界を優先
      if (containsKeyword(key, kl)) {
        best = industry;
        bestLength = kl.length;
      }
    }
  }
  if (best) return best;

  // 6. 最後の保険としての名称の部分一致("manufact" → "Manufacturing")
  return INDUSTRIES.find(
    (i) => i.name.ja.includes(raw) || i.name.en.toLowerCase().includes(key),
  );
}
