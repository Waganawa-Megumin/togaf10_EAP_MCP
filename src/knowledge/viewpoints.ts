/**
 * ビュー / ビューポイントのライブラリ / View and viewpoint library.
 *
 * ステークホルダーの関心事(concerns)に答えるための「切り口」を収録する。
 * TOGAF 標準の原文は転載せず、事実としてのビュー名・観点と独自の実務解説のみで構成する。
 *
 * A catalog of ways to cut the architecture so that a specific stakeholder concern
 * gets answered. Original commentary only; no reproduction of the official text.
 */

import type { Bilingual } from './types.js';

/** ビューポイント(ビューの作り方の定義) / A viewpoint: the recipe for building a view. */
export interface Viewpoint {
  id: string;
  name: Bilingual;
  /** このビューが答える関心事 */
  concerns: Bilingual[];
  /** 主な読み手 */
  audience: Bilingual[];
  /** 何を描くか(要素と関係) */
  elements: Bilingual[];
  /** 表現形式の推奨(表/図/マトリクス など) */
  notation: Bilingual;
  /** 作成のコツ */
  tips: Bilingual[];
  /** 主に作成・利用される ADM フェーズ ID */
  phaseIds: string[];
  /** 検索用キーワード(日英混在) */
  keywords: string[];
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'executive-summary-view',
    name: { ja: '経営層向けサマリビュー', en: 'Executive Summary View' },
    concerns: [
      { ja: 'この変革は事業のどの目標に効くのか', en: 'Which business goal does this change actually move?' },
      { ja: 'いくらかかり、いつ効果が出るのか', en: 'What does it cost, and when does the return appear?' },
      { ja: 'やらなかった場合に何が起きるのか', en: 'What happens if we do nothing?' },
    ],
    audience: [
      { ja: '経営層・役員会', en: 'Executives and the board' },
      { ja: '投資判断を行うスポンサー', en: 'The sponsor who signs the investment' },
      { ja: '事業部門の責任者', en: 'Business unit heads' },
    ],
    elements: [
      { ja: '事業目標と、それに紐づく数個の変革テーマ', en: 'Business goals and the handful of change themes tied to them' },
      { ja: '現状の痛み(定量値つき)と目標状態の対比', en: 'Today\'s pain with numbers, set against the target state' },
      { ja: '主要な投資額・期間・意思決定のタイミング', en: 'Headline investment, duration, and the decision points' },
      { ja: '受け入れを求めるリスクと、その受容者', en: 'The risks you are asking them to accept, and who accepts them' },
    ],
    notation: {
      ja: '1 ページに収めた図 + 数字。左に現状、右に目標、間に矢印と投資額。表は 5 行以内。',
      en: 'One page: a picture plus numbers. Today on the left, target on the right, arrow and investment in between. Tables of five rows or fewer.',
    },
    tips: [
      { ja: '専門用語を 1 つ使うごとに読者が 1 人減ると考える。EA 用語をそのまま出さない。', en: 'Assume you lose one reader per piece of jargon. Never ship raw EA vocabulary here.' },
      { ja: '技術的な正しさより「意思決定に必要な情報が揃っているか」で取捨する。', en: 'Select for "does this decision have what it needs" rather than for technical completeness.' },
      { ja: '詳細版へのポインタを必ず一行入れる。要約だけだと質問に答えられない。', en: 'Always include one pointer to the detailed version, or you cannot answer the follow-up question.' },
      { ja: '「やらない場合」の列を必ず作る。比較対象がないと投資の妥当性が判断できない。', en: 'Always carry a "do nothing" column. Without a baseline the investment cannot be judged.' },
    ],
    phaseIds: ['a', 'e', 'f'],
    keywords: ['executive', '経営層', 'サマリ', 'summary', '役員', 'board', '1 ページ', 'onepager', 'スポンサー', 'sponsor'],
  },
  {
    id: 'business-capability-view',
    name: { ja: 'ビジネス能力ビュー', en: 'Business Capability View' },
    concerns: [
      { ja: '事業として何ができて、何ができていないのか', en: 'What can the business do today, and what can it not?' },
      { ja: '投資はどの能力に集中しているのか', en: 'Where is the investment actually concentrated?' },
      { ja: '組織を変えても残る「事業の骨格」は何か', en: 'What is the skeleton of the business that survives a reorg?' },
    ],
    audience: [
      { ja: '経営企画・事業戦略部門', en: 'Corporate strategy and planning' },
      { ja: '事業部門の責任者', en: 'Business unit heads' },
      { ja: 'ポートフォリオ管理者', en: 'Portfolio managers' },
    ],
    elements: [
      { ja: '能力の階層(通常 2〜3 階層まで)', en: 'The capability hierarchy, normally no deeper than three levels' },
      { ja: '能力ごとの現在水準と目標水準', en: 'Current and target level per capability' },
      { ja: '戦略への寄与度(ヒートマップの色)', en: 'Contribution to strategy, expressed as heat-map colour' },
      { ja: '能力を支えるアプリケーション・組織の紐づけ', en: 'The applications and organizations that support each capability' },
    ],
    notation: {
      ja: '入れ子のボックス(能力マップ)+ 色で水準やギャップを表現。1 枚に収まる粒度に抑える。',
      en: 'Nested boxes — a capability map — coloured by level or gap. Keep it to a single sheet.',
    },
    tips: [
      { ja: '能力の名前は必ず名詞句にする。動詞で書くとプロセスになり、組織変更で壊れる。', en: 'Name capabilities as noun phrases. Verbs turn them into processes, which break at the next reorg.' },
      { ja: '組織図をなぞっていないか確認する。部門名がそのまま並んでいたら作り直し。', en: 'Check it is not the org chart in disguise. If the boxes are department names, start over.' },
      { ja: '色分けの凡例を先に定義する。「赤 = 弱い」なのか「赤 = 重要」なのかで解釈が真逆になる。', en: 'Define the legend first. "Red = weak" and "red = important" lead to opposite conclusions.' },
    ],
    phaseIds: ['b', 'e'],
    keywords: ['capability', '能力', 'ケイパビリティ', '能力マップ', 'capability map', 'heatmap', 'ヒートマップ'],
  },
  {
    id: 'value-stream-view',
    name: { ja: 'バリューストリームビュー', en: 'Value Stream View' },
    concerns: [
      { ja: '顧客に価値が届くまでにどこで詰まっているのか', en: 'Where does the flow of value to the customer stall?' },
      { ja: 'リードタイムのうち、どの段階が支配的か', en: 'Which stage dominates the end-to-end lead time?' },
      { ja: '部門をまたぐ受け渡しは何回あるのか', en: 'How many hand-offs cross an organizational boundary?' },
    ],
    audience: [
      { ja: '業務改革・オペレーション責任者', en: 'Operations and process improvement leads' },
      { ja: '現場のプロセスオーナー', en: 'Process owners on the floor' },
      { ja: '顧客体験の責任者', en: 'Customer experience owners' },
    ],
    elements: [
      { ja: '価値の流れの段階(ステージ)と入口・出口', en: 'The stages of the flow, with its entry and exit' },
      { ja: '段階ごとの所要時間・待ち時間・手戻り率', en: 'Time, wait time, and rework rate per stage' },
      { ja: '各段階を担う組織と支援するシステム', en: 'The organization performing each stage and the system supporting it' },
      { ja: '部門をまたぐ受け渡し点', en: 'Hand-off points that cross an organizational boundary' },
    ],
    notation: {
      ja: '左から右への横並びの帯(ステージ)+ 下に時間軸の数値レーン。システムは下段のスイムレーンに置く。',
      en: 'Left-to-right bands for stages, with a numeric time lane underneath. Put systems in a lower swimlane.',
    },
    tips: [
      { ja: '「作業時間」ではなく「待ち時間」を測る。改善余地はほぼ待ち時間側にある。', en: 'Measure wait time, not touch time. The improvement almost always lives in the waiting.' },
      { ja: '正常系だけ描かない。例外系と手戻りのループを描くと本当のリードタイムが見える。', en: 'Do not draw only the happy path. Exceptions and rework loops are where the real lead time hides.' },
      { ja: 'ステージを 10 個以上に割らない。細かくすると誰も全体像を語れなくなる。', en: 'Keep it under about ten stages. Finer than that and nobody can narrate the whole thing.' },
    ],
    phaseIds: ['b', 'e'],
    keywords: ['value stream', 'バリューストリーム', '価値の流れ', 'lead time', 'リードタイム', 'プロセス', 'process', '業務フロー'],
  },
  {
    id: 'organization-function-matrix',
    name: { ja: '組織 / 機能マトリクス', en: 'Organization / Function Matrix' },
    concerns: [
      { ja: 'この業務は結局どの部門の責任なのか', en: 'Which unit is actually accountable for this function?' },
      { ja: '同じ業務を複数部門が別々にやっていないか', en: 'Are several units doing the same work separately?' },
      { ja: '誰も担当していない業務はないか', en: 'Is any function owned by nobody?' },
    ],
    audience: [
      { ja: '組織設計・人事の担当', en: 'Organization design and HR' },
      { ja: '業務部門の管理者', en: 'Line managers in the business' },
      { ja: 'プロジェクトの調整役', en: 'Programme coordinators' },
    ],
    elements: [
      { ja: '行に業務機能、列に組織単位', en: 'Business functions as rows, organization units as columns' },
      { ja: '交点に責任区分(実行 / 承認 / 相談 / 情報共有)', en: 'A responsibility marker at each intersection: performs, approves, consulted, informed' },
      { ja: '重複・空白のハイライト', en: 'Highlighting for duplication and for blanks' },
    ],
    notation: {
      ja: '表(マトリクス)。記号は 4 種類までに絞る。行と列の数が多い場合は上位階層で丸める。',
      en: 'A matrix table with at most four symbols. If rows or columns explode, roll up to the level above.',
    },
    tips: [
      { ja: '「承認」が 1 行に 3 つ以上あったら、それは意思決定が渋滞している証拠。', en: 'Three or more approvers on one row is the signature of a decision traffic jam.' },
      { ja: '空白セルを空欄のままにしない。「該当なし」なのか「未定」なのかを区別して書く。', en: 'Never leave a blank ambiguous. Distinguish "not applicable" from "undecided".' },
      { ja: '現行と目標の 2 枚を作る。1 枚だけだと組織変更の議論に使えない。', en: 'Produce two: baseline and target. One alone cannot carry a reorganization discussion.' },
    ],
    phaseIds: ['b', 'e'],
    keywords: ['organization', '組織', '機能', 'function', 'マトリクス', 'matrix', 'raci', '責任分担', '重複'],
  },
  {
    id: 'system-of-record-view',
    name: { ja: 'データ正本ビュー', en: 'System of Record View' },
    concerns: [
      { ja: 'このデータの正しい値はどこにあるのか', en: 'Where does the correct value of this data live?' },
      { ja: '数字が合わないとき、どちらを信じればよいのか', en: 'When two numbers disagree, which one do we believe?' },
      { ja: 'このデータの品質に責任を持つのは誰か', en: 'Who is accountable for the quality of this data?' },
    ],
    audience: [
      { ja: 'データオーナー・データスチュワード', en: 'Data owners and data stewards' },
      { ja: '経営管理・レポーティング部門', en: 'Management reporting and controlling' },
      { ja: '統合・移行の設計者', en: 'Integration and migration designers' },
    ],
    elements: [
      { ja: '主要データエンティティの一覧', en: 'The list of principal data entities' },
      { ja: 'エンティティごとの正本システム(1 つに限る)', en: 'The single system of record for each entity — exactly one' },
      { ja: '複製先(参照系)と同期の遅延', en: 'Replicas and the lag of each synchronization' },
      { ja: 'データオーナー(個人名または役職)', en: 'The data owner, named as a person or a role' },
    ],
    notation: {
      ja: '表が最も実用的。行 = エンティティ、列 = 正本 / 複製先 / オーナー / 更新頻度。図にするなら正本を中央に置く。',
      en: 'A table works best: entity by record system, replicas, owner, and refresh. If you draw it, put the record system in the centre.',
    },
    tips: [
      { ja: '正本が 2 つあるエンティティを見つけたら、それが調査すべき最重要の課題。', en: 'An entity with two systems of record is the single most important finding on the page.' },
      { ja: '「マスタ」という言葉を定義せずに使わない。参照マスタと取引マスタを混ぜない。', en: 'Do not use the word "master" undefined, and never mix reference data with transactional data.' },
      { ja: 'オーナーに「部門名」を書かない。休暇中に誰が判断するのかまで決める。', en: 'Do not name a department as owner. Decide who decides while that person is on leave.' },
      { ja: '複製の遅延を書く。「日次」なのか「リアルタイム」なのかで業務の作り方が変わる。', en: 'Record the replication lag. "Nightly" and "real time" imply different business processes.' },
    ],
    phaseIds: ['c', 'e'],
    keywords: ['system of record', '正本', 'マスタ', 'master data', 'data owner', 'データオーナー', 'mdm', 'データ品質', 'golden record'],
  },
  {
    id: 'data-flow-crud-view',
    name: { ja: 'データフロー / CRUD ビュー', en: 'Data Flow / CRUD View' },
    concerns: [
      { ja: 'どのシステムがこのデータを作り、更新し、消しているのか', en: 'Which systems create, update, and delete this data?' },
      { ja: 'このシステムを止めたら、どのデータが更新されなくなるのか', en: 'If this system stops, which data stops being updated?' },
      { ja: '同じデータを複数箇所で更新していないか', en: 'Is the same data being updated in more than one place?' },
    ],
    audience: [
      { ja: 'アプリケーション設計者', en: 'Application architects' },
      { ja: 'データ移行の担当者', en: 'Data migration leads' },
      { ja: '運用・障害対応の担当者', en: 'Operations and incident responders' },
    ],
    elements: [
      { ja: '行にアプリケーション、列にデータエンティティ', en: 'Applications as rows, data entities as columns' },
      { ja: '交点に C/R/U/D の記号', en: 'C/R/U/D markers at the intersections' },
      { ja: 'データの流れる方向と経路(連携基盤・ファイル・手作業)', en: 'Direction and route of each flow: middleware, files, or manual work' },
      { ja: '流れの頻度と件数の目安', en: 'Frequency and rough volume of each flow' },
    ],
    notation: {
      ja: 'CRUD マトリクス(表)と、主要な流れだけを抜いたフロー図の 2 枚組。全部を 1 枚の線図にすると読めない。',
      en: 'A pair: the CRUD matrix as a table, plus a flow diagram showing only the principal flows. One diagram with every line is unreadable.',
    },
    tips: [
      { ja: '1 列に C が 2 つ以上あるデータは、正本の議論が未決着である印。', en: 'Two or more Cs in a column means the system-of-record question is still open.' },
      { ja: '人手の連携(CSV を手で送る等)を必ず線として描く。ここが一番壊れる。', en: 'Draw manual hand-offs — someone emailing a CSV — as real lines. That is what breaks.' },
      { ja: '線に「何を」流しているかのラベルを付ける。矢印だけの図は設計に使えない。', en: 'Label every line with what flows over it. Bare arrows cannot be designed against.' },
    ],
    phaseIds: ['c', 'e'],
    keywords: ['crud', 'データフロー', 'data flow', 'マトリクス', 'matrix', 'インタフェース', 'interface', '更新', '連携'],
  },
  {
    id: 'application-integration-view',
    name: { ja: 'アプリケーション連携ビュー', en: 'Application Integration View' },
    concerns: [
      { ja: 'このシステムを変えると、どこに影響が出るのか', en: 'If we change this system, what else is affected?' },
      { ja: '連携方式はバラバラになっていないか', en: 'Have the integration styles fragmented?' },
      { ja: '外部との接点はどこにあるのか', en: 'Where are the external touchpoints?' },
    ],
    audience: [
      { ja: '統合・基盤の設計者', en: 'Integration and platform architects' },
      { ja: '影響調査を行う開発チーム', en: 'Delivery teams doing impact analysis' },
      { ja: 'セキュリティ担当(外部接続の確認)', en: 'Security, checking external connections' },
    ],
    elements: [
      { ja: 'アプリケーションと、その間のインタフェース', en: 'Applications and the interfaces between them' },
      { ja: 'インタフェースの方式(同期 API / 非同期メッセージ / ファイル / DB 直参照)', en: 'The style of each: synchronous API, asynchronous message, file, or direct database access' },
      { ja: '組織境界・外部接続点', en: 'Organizational boundaries and external connection points' },
      { ja: '連携基盤(ESB / iPaaS / API ゲートウェイ)の位置づけ', en: 'Where the integration platform — ESB, iPaaS, API gateway — sits' },
    ],
    notation: {
      ja: '線種で方式を区別したノード図。ノードが 30 を超えるならドメインごとに分割し、全体図は箱の集合だけにする。',
      en: 'A node diagram with line styles for integration style. Past about thirty nodes, split by domain and keep the overview as boxes only.',
    },
    tips: [
      { ja: '「DB 直参照」を隠さない。最も解きにくい依存であり、経営に説明すべき負債。', en: 'Never hide direct database reads. They are the hardest dependency to unpick and belong in the debt story.' },
      { ja: '線を 1 本に集約しすぎない。「連携基盤経由」で束ねると影響調査に使えなくなる。', en: 'Do not collapse everything into "via the integration platform" — the view stops being usable for impact analysis.' },
      { ja: '停止したときの業務影響を線ごとに一言書く。技術図が業務会話に使えるようになる。', en: 'Add one line per interface on what breaks in the business if it stops. That is what makes a technical picture usable in a business conversation.' },
    ],
    phaseIds: ['c', 'e', 'g'],
    keywords: ['integration', '連携', 'インタフェース', 'interface', 'api', 'esb', '依存関係', 'dependency', '影響調査'],
  },
  {
    id: 'application-portfolio-assessment-view',
    name: { ja: 'アプリケーションポートフォリオ評価ビュー', en: 'Application Portfolio Assessment View' },
    concerns: [
      { ja: 'どのシステムに投資し、どれをやめるべきか', en: 'Which systems deserve investment, and which should be retired?' },
      { ja: 'このシステムはまだ事業に貢献しているのか', en: 'Is this system still contributing to the business?' },
      { ja: '塩漬けにしている技術的負債はどこか', en: 'Where is the technical debt we have been ignoring?' },
    ],
    audience: [
      { ja: 'IT 投資の意思決定者', en: 'IT investment decision makers' },
      { ja: 'アプリケーションオーナー', en: 'Application owners' },
      { ja: '事業部門の予算責任者', en: 'Business budget holders' },
    ],
    elements: [
      { ja: '2 軸のマトリクス(事業価値 × 技術的健全性)', en: 'A two-axis matrix: business value against technical health' },
      { ja: '各アプリケーションを点で配置し、大きさで年間コストを表現', en: 'Applications plotted as points, sized by annual cost' },
      { ja: '象限ごとの方針(強化 / 維持 / 再構築 / 廃止)', en: 'A disposition per quadrant: invest, maintain, re-platform, retire' },
      { ja: '評価の根拠(利用者数、障害件数、サポート期限、改修容易性)', en: 'The evidence: user count, incident volume, support expiry, changeability' },
    ],
    notation: {
      ja: '散布図(バブルチャート)+ 明細表。散布図だけでは議論が進まないので、点の根拠を表で必ず添える。',
      en: 'A bubble chart plus a backing table. The chart alone will not survive a challenge; the evidence table must ride with it.',
    },
    tips: [
      { ja: '軸の評価基準を先に文書化する。後から作ると「点の位置」を巡る政治的な議論になる。', en: 'Document the scoring rules before you plot. Written afterwards, they become a political argument over dot positions.' },
      { ja: '「廃止」象限に自部門のシステムを 1 つも置けない評価は、評価になっていない。', en: 'An assessment where nothing of your own lands in the retire quadrant is not an assessment.' },
      { ja: '年間コストには保守・ライセンス・運用要員を含める。開発費だけだと判断を誤る。', en: 'Annual cost must include maintenance, licences, and operations staff. Development spend alone misleads.' },
      { ja: '廃止の判断には移行先とデータの持ち出し方をセットで書く。書かない廃止は実行されない。', en: 'Pair every retire decision with the destination and the data exit path. A retirement without them never happens.' },
    ],
    phaseIds: ['c', 'e', 'f'],
    keywords: ['portfolio', 'ポートフォリオ', 'アプリケーション', 'application', '評価', 'assessment', '廃止', 'rationalization', '技術的負債', 'technical debt'],
  },
  {
    id: 'technology-standards-lifecycle-view',
    name: { ja: '技術標準・ライフサイクルビュー', en: 'Technology Standards and Lifecycle View' },
    concerns: [
      { ja: '新しい案件で何を使ってよいのか', en: 'What are we allowed to use on a new project?' },
      { ja: 'サポート切れが迫っている技術はどれか', en: 'Which technologies are approaching end of support?' },
      { ja: '同じ用途に何種類の製品を抱えているのか', en: 'How many products do we run for the same purpose?' },
    ],
    audience: [
      { ja: '開発チーム・技術選定者', en: 'Delivery teams choosing technology' },
      { ja: '調達・ベンダー管理', en: 'Procurement and vendor management' },
      { ja: '運用・セキュリティの責任者', en: 'Operations and security leads' },
    ],
    elements: [
      { ja: '技術分類(用途)ごとの製品・バージョン一覧', en: 'Products and versions grouped by the purpose they serve' },
      { ja: '各項目のステータス(推奨 / 許容 / 新規採用禁止 / 廃止予定)', en: 'A status per entry: preferred, acceptable, no new use, sunset' },
      { ja: 'サポート期限と社内での廃止目標日', en: 'Vendor support expiry and the internal retirement target' },
      { ja: '例外が認められている案件と、その有効期限', en: 'Granted exceptions and their expiry dates' },
    ],
    notation: {
      ja: '表を主体にし、期限は年表(タイムライン)で補う。ステータスは 4 段階までに固定する。',
      en: 'Table-first, with a timeline for the expiry dates. Fix the status scale at four values.',
    },
    tips: [
      { ja: '「禁止」だけを並べると誰も見に来ない。代替の推奨をセットで書く。', en: 'A list of prohibitions gets no readers. Always pair a ban with the recommended alternative.' },
      { ja: '棚卸しの担当者と頻度を表の中に書く。更新されない標準表は害の方が大きい。', en: 'Put the owner and the review cadence in the table itself. A stale standards list does more harm than none.' },
      { ja: 'サポート期限は「ベンダー期限」と「社内目標日」を分けて書く。同じ日にすると必ず遅れる。', en: 'Keep vendor expiry and internal target as separate columns. Setting them equal guarantees you miss it.' },
    ],
    phaseIds: ['preliminary', 'd', 'g'],
    keywords: ['technology', '技術標準', 'standards', 'ライフサイクル', 'lifecycle', 'eol', 'サポート期限', '製品', '塩漬け'],
  },
  {
    id: 'deployment-network-view',
    name: { ja: '環境配置 / ネットワークビュー', en: 'Deployment and Network View' },
    concerns: [
      { ja: 'このシステムは物理的にどこで動いているのか', en: 'Where does this system physically run?' },
      { ja: 'データはどの国・どの区画を通るのか', en: 'Which countries and network zones does the data cross?' },
      { ja: '環境の違いが障害の原因になっていないか', en: 'Are environment differences causing the incidents?' },
    ],
    audience: [
      { ja: 'インフラ・ネットワーク設計者', en: 'Infrastructure and network architects' },
      { ja: '運用チーム', en: 'Operations teams' },
      { ja: '監査・コンプライアンス担当', en: 'Audit and compliance' },
    ],
    elements: [
      { ja: '拠点・リージョン・データセンタ・クラウドアカウント', en: 'Sites, regions, data centres, and cloud accounts' },
      { ja: 'ネットワーク区画(セグメント)と境界の制御点', en: 'Network zones and the control points at their boundaries' },
      { ja: '各環境(本番 / ステージング / 開発)の構成差', en: 'Configuration differences between production, staging, and development' },
      { ja: '外部接続(インターネット、専用線、パートナー接続)', en: 'External connections: internet, dedicated lines, partner links' },
    ],
    notation: {
      ja: '入れ子の枠(リージョン > 区画 > ノード)で描く。論理配置と物理配置を 1 枚に混ぜない。',
      en: 'Nested containers — region, zone, node. Do not mix logical and physical placement on one sheet.',
    },
    tips: [
      { ja: 'データの所在地(国)を明示する。越境の議論は図がないと空転する。', en: 'Mark the country where data rests. Cross-border discussions go nowhere without the picture.' },
      { ja: '本番と非本番の差分を注記する。「本番だけ二重化」は事故の温床。', en: 'Annotate the production/non-production delta. "Redundant in production only" is where incidents are born.' },
      { ja: '実際の IP や認証情報を図に書かない。配布される図は必ず流出すると考える。', en: 'Never put real addresses or credentials in the picture. Assume every distributed diagram leaks.' },
    ],
    phaseIds: ['d', 'g'],
    keywords: ['deployment', '配置', 'network', 'ネットワーク', 'インフラ', 'infrastructure', 'region', 'リージョン', '環境', 'データ所在'],
  },
  {
    id: 'security-access-view',
    name: { ja: 'セキュリティ / 権限ビュー', en: 'Security and Access View' },
    concerns: [
      { ja: '誰がどのデータにアクセスできるのか', en: 'Who can reach which data?' },
      { ja: '認証と認可はどこで行われているのか', en: 'Where do authentication and authorization actually happen?' },
      { ja: '守るべき資産と脅威の対応は取れているのか', en: 'Do the controls line up with the assets and the threats?' },
    ],
    audience: [
      { ja: 'セキュリティ責任者・CISO 配下', en: 'Security leadership and the CISO organization' },
      { ja: '監査・内部統制', en: 'Audit and internal control' },
      { ja: 'アプリケーション設計者', en: 'Application architects' },
    ],
    elements: [
      { ja: '守るべき情報資産と、その機密度区分', en: 'The information assets to protect and their classification' },
      { ja: '主体(利用者・サービスアカウント・外部連携)と役割', en: 'Subjects — users, service accounts, external parties — and their roles' },
      { ja: '認証・認可の実施点(ID 基盤、ゲートウェイ、アプリ内)', en: 'Enforcement points: identity provider, gateway, in-application' },
      { ja: '信頼境界と、そこを越えるデータ', en: 'Trust boundaries and what crosses them' },
    ],
    notation: {
      ja: '信頼境界を破線で描いたレイヤ図 + 「役割 × データ区分」の権限マトリクス表。',
      en: 'A layered diagram with dashed trust boundaries, plus a role-by-classification permission matrix.',
    },
    tips: [
      { ja: '管理者権限と緊急用アカウントを必ず載せる。ここが監査で最初に見られる。', en: 'Always show administrative and break-glass accounts. That is the first thing an auditor looks at.' },
      { ja: 'システム間連携の権限を忘れない。人の権限だけ整理しても穴は塞がらない。', en: 'Do not forget machine-to-machine access. Tidying human roles alone leaves the hole open.' },
      { ja: '「暗号化している」で終わらせず、鍵の管理者を書く。鍵を持つ人が実質の権限保持者。', en: 'Do not stop at "it is encrypted" — name who holds the keys. Key holders are the real access holders.' },
      { ja: 'この図は配布範囲を限定する。攻撃者にとって最良の設計書になり得る。', en: 'Restrict distribution of this view. It doubles as an excellent blueprint for an attacker.' },
    ],
    phaseIds: ['c', 'd', 'g'],
    keywords: ['security', 'セキュリティ', '権限', 'access', 'authorization', '認証', 'iam', '信頼境界', 'trust boundary', '監査'],
  },
  {
    id: 'availability-continuity-view',
    name: { ja: '可用性・事業継続ビュー', en: 'Availability and Continuity View' },
    concerns: [
      { ja: '止まったら業務はいつまで耐えられるのか', en: 'How long can the business survive an outage?' },
      { ja: 'どこまでのデータ損失なら許容できるのか', en: 'How much data loss is acceptable?' },
      { ja: '対策の水準は業務の重要度に見合っているか', en: 'Does the level of protection match the criticality of the business?' },
    ],
    audience: [
      { ja: '事業継続計画(BCP)の責任者', en: 'Business continuity owners' },
      { ja: '運用・SRE チーム', en: 'Operations and SRE teams' },
      { ja: '事業部門の責任者(要求水準の確認)', en: 'Business owners, to confirm the required levels' },
    ],
    elements: [
      { ja: '業務ごとの目標復旧時間(RTO)と目標復旧地点(RPO)', en: 'Recovery time and recovery point objectives per business service' },
      { ja: '業務を支えるシステムと、その冗長構成', en: 'The supporting systems and their redundancy design' },
      { ja: '単一障害点(SPOF)の位置', en: 'Where the single points of failure are' },
      { ja: '切り替えの手順・所要時間・訓練の実施状況', en: 'Failover procedure, its duration, and when it was last rehearsed' },
    ],
    notation: {
      ja: '業務を行にした表(RTO/RPO/現状の実力/差)+ 構成図。要求値と実力値を必ず並べて書く。',
      en: 'A table keyed on business service — RTO, RPO, actual capability, gap — plus a topology diagram. Always show required next to actual.',
    },
    tips: [
      { ja: 'RTO を業務部門に聞くと全部「即時」と返る。停止コストを金額で聞き直す。', en: 'Ask the business for RTO and everything comes back "immediately". Re-ask as the cost of an hour of downtime.' },
      { ja: '訓練していない切り替え手順は「無い」ものとして評価する。', en: 'Treat an un-rehearsed failover procedure as if it did not exist.' },
      { ja: '依存する外部サービスの可用性も書く。自社だけ強くしても業務は止まる。', en: 'Include the availability of the external services you depend on. Hardening only your own side does not keep the business up.' },
    ],
    phaseIds: ['d', 'e', 'g'],
    keywords: ['availability', '可用性', 'rto', 'rpo', 'bcp', '事業継続', 'disaster recovery', '災対', '冗長', 'spof'],
  },
  {
    id: 'roadmap-transition-view',
    name: { ja: 'ロードマップ / 移行ビュー', en: 'Roadmap and Transition View' },
    concerns: [
      { ja: 'いつ、何が、どの順番で実現するのか', en: 'What is delivered, in what order, and when?' },
      { ja: '各時点で何が使える状態になっているのか', en: 'What is usable at each point in time?' },
      { ja: '依存関係のせいで詰まるのはどこか', en: 'Where do the dependencies create a jam?' },
    ],
    audience: [
      { ja: '経営層・投資委員会', en: 'Executives and the investment committee' },
      { ja: 'プログラム / プロジェクト管理者', en: 'Programme and project managers' },
      { ja: '影響を受ける業務部門', en: 'The business units that will be affected' },
    ],
    elements: [
      { ja: '時間軸(四半期など)と作業パッケージ', en: 'A time axis, typically by quarter, and the work packages' },
      { ja: '移行状態(中間アーキテクチャ)の区切りと、その時点の到達点', en: 'Transition states and what is true at each one' },
      { ja: 'パッケージ間の依存関係', en: 'Dependencies between packages' },
      { ja: '各移行状態で実現する便益と、その受益者', en: 'The benefit realized at each transition state, and who receives it' },
    ],
    notation: {
      ja: '横軸に時間を取ったガントに近い帯 + 縦の区切り線で移行状態を示す。区切りごとに「この時点でできること」を一行注記。',
      en: 'Time-axis bars close to a Gantt, with vertical lines marking transition states, and a one-line note at each on what becomes possible.',
    },
    tips: [
      { ja: '移行状態ごとに「利用者が体感できる変化」を書く。書けないなら区切り方が間違っている。', en: 'Write the user-visible change for each transition state. If you cannot, the states are drawn in the wrong places.' },
      { ja: '「基盤整備だけの年」を作らない。1 年以上何も見えない計画は必ず途中で止まる。', en: 'Never plan a platform-only year. A plan that shows nothing for twelve months gets cancelled.' },
      { ja: '予算年度と人員の空き状況を時間軸に重ねる。技術的依存だけで並べた順序は実行できない。', en: 'Overlay the budget calendar and staff availability. A sequence built on technical dependencies alone is not executable.' },
      { ja: '確定部分と検討中部分を視覚的に分ける。全部が確定に見えると後で信頼を失う。', en: 'Visually separate committed work from candidate work. If everything looks committed, you lose credibility later.' },
    ],
    phaseIds: ['e', 'f'],
    keywords: ['roadmap', 'ロードマップ', 'transition', '移行', '移行計画', 'gantt', 'ガント', '時間軸', 'sequencing', '順序'],
  },
  {
    id: 'cost-view',
    name: { ja: 'コストビュー', en: 'Cost View' },
    concerns: [
      { ja: 'IT の費用はどこに消えているのか', en: 'Where is the IT spend actually going?' },
      { ja: 'この投資の総保有コストはいくらか', en: 'What is the total cost of ownership of this investment?' },
      { ja: '削減できる費用はどこにあるのか', en: 'Where is the cost that can be removed?' },
    ],
    audience: [
      { ja: '財務・経営管理部門', en: 'Finance and controlling' },
      { ja: 'IT 予算の責任者', en: 'IT budget holders' },
      { ja: '事業部門(自部門の負担額の確認)', en: 'Business units checking their allocated share' },
    ],
    elements: [
      { ja: '費用の区分(初期 / 運用 / ライセンス / 人件費 / 廃止費用)', en: 'Cost categories: build, run, licence, people, and decommissioning' },
      { ja: '費用をアプリケーション・能力・事業部門に配賦した結果', en: 'Allocation of cost to applications, capabilities, and business units' },
      { ja: '時間軸での支出計画と、便益が出る時期', en: 'The spend profile over time and when the benefit arrives' },
      { ja: '前提条件(為替、人月単価、利用者数)', en: 'The assumptions: rates, unit costs, user counts' },
    ],
    notation: {
      ja: '積み上げ棒グラフ(時間軸)+ 配賦表。金額には必ず前提条件と精度(±%)を併記する。',
      en: 'A stacked bar over time plus an allocation table. Every figure carries its assumptions and a precision band.',
    },
    tips: [
      { ja: '運用費と廃止費用を必ず入れる。初期費用だけの比較は必ず判断を誤らせる。', en: 'Always include run cost and decommissioning. Comparing build cost alone always leads to the wrong choice.' },
      { ja: '精度を明示する(概算 ±50% など)。数字を出した瞬間に確定値として扱われる。', en: 'State the precision explicitly. The moment a number appears, someone treats it as committed.' },
      { ja: '「削減」と「増加抑制」を混ぜない。財務部門は前者しか削減と認めない。', en: 'Do not mix cost reduction with cost avoidance. Finance only counts the former.' },
    ],
    phaseIds: ['e', 'f', 'h'],
    keywords: ['cost', 'コスト', '費用', 'tco', '予算', 'budget', '配賦', 'allocation', '投資対効果', 'roi'],
  },
  {
    id: 'stakeholder-impact-view',
    name: { ja: 'ステークホルダー影響度ビュー', en: 'Stakeholder Impact View' },
    concerns: [
      { ja: '誰の仕事がどう変わるのか', en: 'Whose work changes, and how?' },
      { ja: '誰の合意を先に取るべきか', en: 'Whose agreement must come first?' },
      { ja: '抵抗が起きるのはどこか', en: 'Where will the resistance come from?' },
    ],
    audience: [
      { ja: '変革推進・チェンジマネジメント担当', en: 'Change management leads' },
      { ja: 'プロジェクトスポンサー', en: 'The project sponsor' },
      { ja: '広報・社内コミュニケーション', en: 'Internal communications' },
    ],
    elements: [
      { ja: '影響力 × 関心度の 4 象限配置', en: 'A four-quadrant plot of influence against interest' },
      { ja: '関係者ごとの関心事と、それに答えるビュー', en: 'Each stakeholder\'s concerns and the view that answers them' },
      { ja: '業務がどう変わるか(影響の中身)と影響の大きさ', en: 'What changes in their work, and how big the change is' },
      { ja: '関与方針と次のアクション・期限', en: 'The engagement approach, the next action, and its date' },
    ],
    notation: {
      ja: '4 象限の散布図 + 明細表。象限名は「密に関与 / 満足を維持 / 情報提供 / 監視」の 4 つに統一する。',
      en: 'A four-quadrant plot plus a detail table. Keep the quadrant names fixed: manage closely, keep satisfied, keep informed, monitor.',
    },
    tips: [
      { ja: '反対者を必ず載せる。載せないと、最も重要なリスク情報が計画に入らない。', en: 'Always include the opponents. Leaving them out keeps your best risk information out of the plan.' },
      { ja: '肩書きではなく「何を心配しているか」で配置する。同じ役職でも関心事は違う。', en: 'Place people by what they worry about, not by title. Two people with the same title do not share concerns.' },
      { ja: '配布用と内部用を分ける。象限の判定は本人に見せる前提で書くと嘘になる。', en: 'Keep an internal version separate. If you write the quadrants assuming the person will read them, they stop being true.' },
      { ja: '人事異動のたびに更新する。半年前の版は使えないと考える。', en: 'Refresh it at every personnel change. Assume a six-month-old version is useless.' },
    ],
    phaseIds: ['a', 'b', 'g'],
    keywords: ['stakeholder', 'ステークホルダー', '関係者', '影響度', 'impact', 'power interest', '影響力', 'change management', '変革'],
  },
  {
    id: 'risk-view',
    name: { ja: 'リスクビュー', en: 'Risk View' },
    concerns: [
      { ja: 'この計画で最も危ないのはどこか', en: 'What is the most dangerous part of this plan?' },
      { ja: '対策を打った後に何が残るのか', en: 'What remains after the mitigations?' },
      { ja: '残ったリスクは誰が引き受けるのか', en: 'Who carries the risk that remains?' },
    ],
    audience: [
      { ja: 'プロジェクトスポンサー・運営委員会', en: 'The sponsor and the steering committee' },
      { ja: 'リスク管理・内部統制部門', en: 'Risk management and internal control' },
      { ja: 'アーキテクチャボード', en: 'The architecture board' },
    ],
    elements: [
      { ja: '影響度 × 発生可能性のマトリクス配置', en: 'Placement on an impact-by-likelihood matrix' },
      { ja: 'リスク事象の記述(原因 → 結果)', en: 'The risk written as cause and effect' },
      { ja: '緩和策と、緩和後の残存リスク位置', en: 'Mitigations and the residual position after them' },
      { ja: '受容者(個人名)と再評価の期日', en: 'The named acceptor and the review date' },
    ],
    notation: {
      ja: 'マトリクス上に初期リスクと残存リスクを矢印で結んで示す + 明細表。矢印が短いリスクは対策が効いていない。',
      en: 'A matrix with an arrow from initial to residual position, plus a detail table. A short arrow means the mitigation is not working.',
    },
    tips: [
      { ja: '「遅延」「品質低下」のような結果だけの記述は禁止。原因を書かないと対策が設計できない。', en: 'Ban outcome-only entries like "delay" or "quality drop". Without a cause there is no mitigation to design.' },
      { ja: '残存リスクを描かないマトリクスは、対策の効果を検証できない。必ず 2 点を打つ。', en: 'A matrix without the residual position cannot show whether mitigation worked. Always plot both points.' },
      { ja: '受容者に組織名を書かない。組織は責任を取らないので、個人名か役職名を書く。', en: 'Never name an organization as acceptor. Organizations do not take responsibility; name a person or a post.' },
      { ja: '色の濃さだけで危険度を示さない。印刷・色覚特性の違いで意味が消える。', en: 'Do not encode severity in colour alone. Printing and colour-vision differences erase the meaning.' },
    ],
    phaseIds: ['a', 'e', 'f', 'g'],
    keywords: ['risk', 'リスク', 'リスクマトリクス', 'risk matrix', '残存リスク', 'residual', '影響度', '発生可能性', '受容'],
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

/** 英数キーワードは単語境界で、日本語キーワードは素の部分一致で判定する */
function containsKeyword(haystackLower: string, keywordLower: string): boolean {
  if (isAscii(keywordLower)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keywordLower)}($|[^a-z0-9])`);
    return re.test(haystackLower);
  }
  return haystackLower.includes(keywordLower);
}

/**
 * ID・名称・キーワードでビューポイントを引く / Look up a viewpoint by id, name, or keyword.
 * "セキュリティビュー" / "roadmap view" のような表記ゆれも部分一致で拾う。
 */
export function findViewpoint(id: string): Viewpoint | undefined {
  const raw = id.trim();
  if (raw.length === 0) return undefined;
  const key = raw.toLowerCase();

  const exact =
    VIEWPOINTS.find((v) => v.id === key) ??
    VIEWPOINTS.find((v) => v.name.en.toLowerCase() === key || v.name.ja === raw) ??
    VIEWPOINTS.find((v) => v.keywords.some((k) => k.toLowerCase() === key));
  if (exact) return exact;

  // 短すぎる入力は誤ヒットしかしないので部分一致に進まない
  if (key.length < (isAscii(key) ? 3 : 2)) return undefined;

  return (
    VIEWPOINTS.find(
      (v) => v.id.includes(key) || v.name.ja.includes(raw) || v.name.en.toLowerCase().includes(key),
    ) ??
    VIEWPOINTS.find((v) =>
      v.keywords.some((k) => {
        const kl = k.toLowerCase();
        return kl.length >= 2 && containsKeyword(key, kl);
      }),
    )
  );
}
