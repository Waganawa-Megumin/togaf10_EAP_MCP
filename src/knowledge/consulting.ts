/**
 * コンサルティングルール / Situation-to-guidance rules.
 *
 * 状況の自由記述に含まれるキーワードから、着目すべきフェーズ・技法・成果物と
 * 推奨アクション・確認質問を導く。独自の実務知見に基づくルール。
 *
 * キーワードは 2 段階に分ける。
 * - `strongKeywords`: そのルールの主題そのものを指す語。1 語当たれば見立てとして採用してよい。
 * - `keywords`: 周辺語。複数の状況に出てくる汎用語や製品名(固有名詞)を置く。
 *   これ単独の一致は「弱い証拠」であり、他に強い一致が無いときだけ低い確信度で扱う。
 *   例: 「ベンダー」「調達」「統合」「削減」「監査」「salesforce」。
 *   1 語だけ当たったからといってルール一式(アクション 5 件・質問 4 件)を出さない。
 */

import type { Bilingual, ConsultRule } from './types.js';

/**
 * 強弱を区別できるコンサルティングルール。
 * `ConsultRule` を拡張しているだけなので、従来通り `ConsultRule` として扱える。
 */
export interface WeightedConsultRule extends ConsultRule {
  /** 主題そのものを指す強いキーワード / Keywords that name the rule's subject itself */
  strongKeywords?: string[];
}

export const CONSULT_RULES: WeightedConsultRule[] = [
  {
    id: 'legacy-modernization',
    name: { ja: 'レガシーシステムの刷新', en: 'Legacy Modernization' },
    strongKeywords: [
      'レガシー', '刷新', '基幹系', '基幹システム', '老朽', 'メインフレーム', 'リプレース', '塩漬け', '2025年の崖', 'cobol',
      'legacy', 'modernization', 'modernisation', 'mainframe', 'replatform',
    ],
    keywords: ['再構築', 'rewrite', 'end of life', 'eol'],
    diagnosis: {
      ja: 'レガシー刷新は技術課題に見えて、実際は「現行仕様が誰にも分からない」「業務が現行システムの形に固定されている」という業務・情報の問題であることがほとんど。技術選定から入ると必ず失敗するため、ビジネスアーキテクチャとデータの正本整理から入る。',
      en: 'Legacy renewal looks technical but is almost always a business and information problem: nobody knows the current specification, and the operating model has been shaped by the old system. Starting from technology selection reliably fails; start from business architecture and settling the systems of record.',
    },
    phaseIds: ['a', 'b', 'c', 'e', 'f'],
    techniqueIds: ['gap-analysis', 'business-scenarios', 'business-transformation-readiness', 'migration-planning-techniques', 'risk-management'],
    deliverableIds: ['architecture-vision', 'business-capability-map', 'data-entity-catalog', 'application-portfolio-catalog', 'architecture-roadmap', 'transition-architecture'],
    actions: [
      { ja: '現行システムの「機能」ではなく、支えている「ビジネス能力」を先に洗い出す。機能単位で移植すると、不要機能まで運んでしまう。', en: 'Inventory the business capabilities the old system supports before its functions. Porting function by function carries the dead weight across too.' },
      { ja: '主要データエンティティの正本を確定させる。刷新の実質的な難易度はここで決まる。', en: 'Settle the system of record for the key data entities. This is what actually determines how hard the renewal will be.' },
      { ja: '一括移行(ビッグバン)と段階移行を比較し、二重運用期間のコストを明示的に見積もる。', en: 'Compare big-bang against phased migration, and explicitly price the dual-running period.' },
      { ja: '現行仕様の調査に期限を切る。「完全に理解してから」は永遠に来ない。', en: 'Time-box the archaeology on the current specification. "Once we fully understand it" never arrives.' },
      { ja: '中間状態ごとに「ここで止めても事業は回るか」を確認し、止まれる計画にする。', en: 'For each intermediate state, verify the business can run if you stop there — make the plan stoppable.' },
    ],
    questions: [
      { ja: 'この刷新で、業務のやり方自体を変えるのか、それとも同じ業務を新しい基盤で動かすだけなのか。どちらですか?', en: 'Is this renewal changing how the business operates, or running the same operations on a new platform?' },
      { ja: '現行システムの仕様を説明できる人は、あと何年在籍しますか?', en: 'How many more years will the people who can explain the current system be with you?' },
      { ja: '移行期間中に二重運用が発生した場合、その追加コストと業務負荷は誰が引き受けますか?', en: 'If dual running is needed during the migration, who absorbs the extra cost and operational load?' },
      { ja: '現行システムのどの機能を「捨てる」判断は、誰が下せますか?', en: 'Who has the authority to decide which existing functions get dropped?' },
    ],
  },
  {
    id: 'ea-practice-launch',
    name: { ja: 'EA / DX の立ち上げ', en: 'Launching an EA or DX Practice' },
    strongKeywords: [
      '立ち上げ', 'ea を始め', 'ea をはじめ', '新設', '組織を作', '体制を作',
      'launch', 'establish', 'kick off', 'kickoff', 'greenfield', 'digital transformation',
    ],
    // 「dx」「何から」は多くの相談に現れる汎用語なので周辺語に置く
    keywords: ['dx', '導入したい', 'これから', '何から', 'start', 'set up', 'first time'],
    diagnosis: {
      ja: '立ち上げ期の失敗要因はほぼ 2 つ — 「成果物を作りすぎる」ことと「決定権のない体制で始める」こと。予備フェーズで範囲・原則・意思決定権限を絞り込み、最初のサイクルは小さな対象で 1 周回して実績を作るのが定石。',
      en: 'Launches fail for two reasons almost every time: producing too many deliverables, and starting without decision rights. Narrow scope, principles, and decision authority in the Preliminary Phase, then run one full cycle on something small to build a track record.',
    },
    phaseIds: ['preliminary', 'a', 'h'],
    techniqueIds: ['architecture-principles-technique', 'architecture-governance', 'stakeholder-management', 'architecture-maturity'],
    deliverableIds: ['organizational-model', 'architecture-principles', 'tailored-framework', 'architecture-vision', 'architecture-repository'],
    actions: [
      { ja: '最初のサイクルの対象を、1 事業部・1 領域に絞る。全社を一度に描こうとしない。', en: 'Scope the first cycle to one unit or one domain. Do not try to draw the whole enterprise at once.' },
      { ja: '原則は 8 個前後に絞り、各原則に「含意(何を諦めるか)」を必ず書く。', en: 'Hold principles to around eight, each with explicit implications — what you give up.' },
      { ja: '新しい委員会を作る前に、既存の会議体に相乗りできないか探す。', en: 'Before creating a new board, look for an existing forum you can attach to.' },
      { ja: '成果物テンプレートを絞り込み(テーラリング)、作らないものを明示的に決める。', en: 'Tailor the deliverable set down and state explicitly what you will not produce.' },
      { ja: '3 か月以内に目に見える成果を 1 つ出す計画にする。半年成果が出ない EA は予算を失う。', en: 'Plan one visible result within three months. An EA function with nothing to show at six months loses its funding.' },
    ],
    questions: [
      { ja: 'アーキテクチャ上の決定を覆せるのは誰ですか。その人はこの活動を支持していますか?', en: 'Who can overturn an architecture decision, and do they support this initiative?' },
      { ja: 'EA 活動の成否は、1 年後に何をもって評価されますか?', en: 'A year from now, by what measure will this practice be judged?' },
      { ja: '専任は何名確保できますか。兼務の場合、稼働率は何割ですか?', en: 'How many people are dedicated full time? If part time, what percentage of their capacity?' },
      { ja: '過去に同種の取り組みはありましたか。あればなぜ続かなかったのですか?', en: 'Has a similar effort been tried before? If so, why did it not stick?' },
    ],
  },
  {
    id: 'cloud-migration',
    name: { ja: 'クラウド移行', en: 'Cloud Migration' },
    strongKeywords: [
      'クラウド', 'オンプレ', 'リフトアンドシフト', 'リフト&シフト', 'iaas', 'paas',
      'cloud', 'migration to cloud', 'lift and shift', 'rehost', 'on-premise', 'on-prem', 'hybrid cloud',
    ],
    // 製品・サービス名の単独出現は弱い証拠として扱う
    keywords: ['aws', 'azure', 'gcp', 'saas', 'コンテナ', 'kubernetes'],
    diagnosis: {
      ja: 'クラウド移行の本質的な論点は技術ではなく、① データ所在地・規制、② 運用モデルの変更、③ コスト構造の変化(資産から経費へ)の 3 点。フェーズ D 単独の話に見えるが、運用組織とコスト管理が変わる以上、B(組織・プロセス)にも必ず波及する。',
      en: 'The real issues in a cloud migration are not technical: data residency and regulation, a changed operating model, and a changed cost structure (capex to opex). It looks like a Phase D topic, but because operations and cost management change, it always reaches back into Phase B.',
    },
    phaseIds: ['b', 'c', 'd', 'e', 'f'],
    techniqueIds: ['gap-analysis', 'risk-management', 'interoperability-requirements', 'migration-planning-techniques'],
    deliverableIds: ['architecture-definition-document', 'technology-standards-catalog', 'application-portfolio-catalog', 'architecture-roadmap', 'transition-architecture'],
    actions: [
      { ja: 'アプリケーションを「事業価値 × 技術的健全性」で評価し、移行方式(再ホスト/再構築/置換/廃止)を個別に決める。全部同じ方式で運ぶのは最も高くつく。', en: 'Rate applications on business value against technical health and choose a disposition per application — rehost, refactor, replace, retire. Applying one approach to everything is the most expensive option.' },
      { ja: 'データ所在地・データ持ち出し(egress)コスト・ロックインの 3 点を明示的に評価し、文書に残す。', en: 'Explicitly evaluate and document three things: data residency, egress cost, and lock-in.' },
      { ja: '運用モデルの変更(監視、インシデント対応、コスト管理の責任分界)をフェーズ B で扱う。', en: 'Handle the operating-model change — monitoring, incident response, cost accountability — back in Phase B.' },
      { ja: '移行後の運用コストを月次で見積もり、現行の運用コストと並べて経営層に提示する。', en: 'Model the post-migration run cost monthly and present it next to today\'s run cost.' },
      { ja: 'ハイブリッド期間の連携方式と、その廃棄計画を移行アーキテクチャに書く。', en: 'Write the hybrid-period integration approach — and its disposal plan — into the transition architecture.' },
    ],
    questions: [
      { ja: '規制上、国外に置けないデータはありますか。その判断は誰が確認済みですか?', en: 'Is there data that cannot legally leave the country, and who has confirmed that judgement?' },
      { ja: '移行後の運用は誰が担いますか。現在の運用チームのスキルとの差はどれくらいですか?', en: 'Who operates the platform after migration, and how far is that from your current team\'s skills?' },
      { ja: 'クラウド費用は誰の予算で、超過したときに誰が止める権限を持ちますか?', en: 'Whose budget pays the cloud bill, and who has the authority to stop spend when it overruns?' },
      { ja: '移行の目的はコスト削減ですか、俊敏性ですか。両立しない場合、どちらを取りますか?', en: 'Is the goal cost reduction or agility? When they conflict, which wins?' },
    ],
  },
  {
    id: 'stakeholder-conflict',
    name: { ja: 'ステークホルダーの対立・合意形成', en: 'Stakeholder Conflict and Alignment' },
    strongKeywords: [
      '対立', '揉め', 'もめ', '部門間', '縦割り', '意見が割れ', '決まらない', '合意形成',
      'conflict', 'disagree', 'resistance', 'consensus',
    ],
    keywords: ['合意', '調整', '反対', '説得', 'サイロ', 'political', 'politics', 'alignment', 'buy-in', 'stakeholder'],
    diagnosis: {
      ja: '「意見の対立」は多くの場合、判断基準が共有されていないことの症状。アーキテクチャ原則と評価軸を先に合意すれば、個別案件の議論は自動的に収束する。逆に、対立を個別案件の場で解決しようとすると、同じ議論が毎回再燃する。',
      en: 'Disagreement is usually a symptom of unshared decision criteria. Agree the principles and the evaluation axes first and individual debates converge by themselves. Try to settle it case by case and the same argument reignites every time.',
    },
    phaseIds: ['a', 'b', 'preliminary', 'requirements-management'],
    techniqueIds: ['stakeholder-management', 'business-scenarios', 'architecture-principles-technique', 'architecture-governance'],
    deliverableIds: ['stakeholder-map', 'communications-plan', 'architecture-principles', 'architecture-vision'],
    actions: [
      { ja: '対立している当事者それぞれの「関心事」を、本人の言葉で書き出す。多くの場合、対立点は表明されている主張とは別の場所にある。', en: 'Write down each party\'s concerns in their own words. The real point of conflict is usually somewhere other than the stated position.' },
      { ja: '判断基準(原則、評価軸、優先順位)を先に合意する。個別案件の是非を先に議論しない。', en: 'Agree the decision criteria — principles, evaluation axes, precedence — before debating the merits of any specific case.' },
      { ja: 'ビジネスシナリオを共同で書く。具体的な業務の流れに落とすと、抽象論での対立は解ける。', en: 'Write a business scenario together. Grounding it in a concrete operational flow dissolves abstract disagreement.' },
      { ja: '決着しない論点は、エスカレーション先と期限を決めて上位者に上げる。塩漬けが最悪の選択。', en: 'For anything that will not settle, escalate with a named owner and a deadline. Letting it sit is the worst option.' },
      { ja: '影響力 × 関心度で関与方針を分け、全員に同じ資料を配るのをやめる。', en: 'Segment engagement by power and interest, and stop sending everyone the same document.' },
    ],
    questions: [
      { ja: 'この判断が最終的に決まらなかった場合、誰が困りますか?', en: 'If this decision never gets made, who is hurt by that?' },
      { ja: '各部門は、この変革によって何を失うと考えていますか?', en: 'What does each unit believe it stands to lose from this change?' },
      { ja: '過去に似た論点はどう決着しましたか。その決定は今も有効ですか?', en: 'How was a similar question settled in the past, and does that decision still hold?' },
      { ja: 'この論点をエスカレーションできる共通の上司は誰ですか?', en: 'Who is the common superior this can be escalated to?' },
    ],
  },
  {
    id: 'governance-decay',
    name: { ja: 'ガバナンスの形骸化', en: 'Governance Not Working' },
    strongKeywords: [
      '守られない', '守られてい', '形骸', '勝手に', '野良', 'シャドー', '逸脱', 'ガバナンス', '統制',
      'governance', 'not followed', 'shadow it', 'deviation',
    ],
    keywords: ['無視', '標準が', 'ルールが', 'ignored', 'compliance', 'standards', 'exception'],
    diagnosis: {
      ja: '標準が守られない原因は、ほぼ常に「守るコストが高い」「例外申請の窓口がない」「レビューが遅すぎる」のいずれか。取り締まりを強化しても改善しない。摩擦を下げる方向で設計し直す。',
      en: 'Standards get ignored for one of three reasons almost always: compliance is expensive, there is no route to request an exception, or reviews come too late. Tightening enforcement does not help; redesign to reduce friction.',
    },
    phaseIds: ['preliminary', 'g', 'h'],
    techniqueIds: ['architecture-governance', 'architecture-principles-technique', 'stakeholder-management', 'architecture-maturity'],
    deliverableIds: ['architecture-contract', 'compliance-assessment', 'architecture-principles', 'technology-standards-catalog', 'organizational-model'],
    actions: [
      { ja: '逸脱の「理由」を集計する。理由が集中している標準は、標準の方が間違っている可能性が高い。', en: 'Aggregate the reasons behind deviations. Where reasons cluster on one standard, the standard is probably the problem.' },
      { ja: '例外申請プロセスを作り、必ず期限を付けて承認する。禁止一辺倒にすると黙って逸脱される。', en: 'Create an exception process and always grant with an expiry date. Blanket prohibition just produces silent deviation.' },
      { ja: 'レビューを設計段階に前倒しする。実装後のレビューは指摘しても直せない。', en: 'Move reviews earlier, into design. Findings after implementation cannot be acted on.' },
      { ja: '適合性チェック項目を 1 ページに削る。100 項目のチェックリストは形式的に埋められるだけ。', en: 'Cut the conformance checklist to one page. A hundred items just get ticked mechanically.' },
      { ja: '標準を「推奨/許容/非推奨/廃止予定」の 4 段階にし、二値判定をやめる。', en: 'Move standards to four states — preferred, acceptable, discouraged, retiring — and drop the binary verdict.' },
    ],
    questions: [
      { ja: '標準を守った場合と守らなかった場合で、プロジェクトの納期はどれくらい変わりますか?', en: 'How much does following the standard change a project\'s delivery date, compared with ignoring it?' },
      { ja: '例外を申請する窓口はありますか。申請から回答まで何日かかりますか?', en: 'Is there a route to request an exception, and how many days does an answer take?' },
      { ja: '逸脱が発覚したとき、実際に是正された事例はありますか?', en: 'When a deviation has been found, has it ever actually been remediated?' },
      { ja: 'アーキテクチャボードの決定は、実際に予算や調達の判断に反映されていますか?', en: 'Do the architecture board\'s decisions actually feed into budget and procurement decisions?' },
    ],
  },
  {
    id: 'requirements-churn',
    name: { ja: '要件の頻繁な変更・スコープクリープ', en: 'Requirements Churn and Scope Creep' },
    strongKeywords: [
      '要件が変', '要件変更', 'コロコロ', '仕様変更', 'スコープクリープ', '膨らむ', '増え続け', '後出し', 'ちゃぶ台',
      'scope creep', 'requirements change', 'moving target', 'changing requirements',
    ],
    keywords: ['スコープ', 'churn'],
    diagnosis: {
      ja: '要件が動き続ける原因は、たいてい「元の要求の目的が合意されていない」ことにある。機能一覧として要件を管理している限り、追加は無限に続く。目的(ビジネスシナリオ)と成功条件に紐付けて初めて、追加要求の可否を判断できるようになる。',
      en: 'Requirements keep moving mostly because the purpose behind the original ask was never agreed. Managed as a feature list, additions never stop. Only when each requirement is tied to a scenario and a success criterion can you judge whether a new ask belongs.',
    },
    phaseIds: ['requirements-management', 'a', 'b', 'h'],
    techniqueIds: ['business-scenarios', 'stakeholder-management', 'gap-analysis', 'risk-management'],
    deliverableIds: ['architecture-requirements-spec', 'requirements-impact-assessment', 'statement-of-architecture-work', 'architecture-vision'],
    actions: [
      { ja: '要件に一意の ID と出所(誰の、どの発言か)を付ける。出所不明の要件は削除の判断ができない。', en: 'Give every requirement an ID and a source — whose statement, which document. Requirements with no traceable origin can never be safely dropped.' },
      { ja: '作業範囲記述書に「対象外」を明記し、追加要求は変更管理に回す経路を作る。', en: 'Write the out-of-scope list into the Statement of Architecture Work and route new asks through change control.' },
      { ja: '追加要求ごとに影響評価(工数・スケジュール・コスト)を出し、判断をスポンサーに返す。', en: 'Produce an impact assessment — effort, schedule, cost — for each new ask and hand the decision back to the sponsor.' },
      { ja: '却下した要件も記録に残す。同じ要求が形を変えて再提出される。', en: 'Keep rejected requirements on record; the same ask returns in different clothes.' },
      { ja: '非機能要件に ID を振って別管理する。機能要件は忘れられないが、非機能要件は静かに消える。', en: 'Track non-functional requirements separately with IDs. Functional ones are never forgotten; non-functional ones vanish quietly.' },
    ],
    questions: [
      { ja: '追加要求を承認できるのは誰ですか。その人はスケジュールとコストの責任も負っていますか?', en: 'Who can approve a new requirement, and does that person also own the schedule and cost?' },
      { ja: '当初の成功条件は測定可能な形で文書化されていますか?', en: 'Were the original success criteria documented in measurable form?' },
      { ja: 'この追加要求は、どのビジネス成果に紐付いていますか?', en: 'Which business outcome does this new requirement attach to?' },
      { ja: '変更に伴う影響評価は、誰がいつまでに出す取り決めになっていますか?', en: 'Who produces the impact assessment for a change, and by when?' },
    ],
  },
  {
    id: 'ma-integration',
    name: { ja: 'M&A・組織統合に伴うシステム統合', en: 'M&A and Post-Merger Integration' },
    strongKeywords: [
      'm&a', '買収', '合併', '経営統合', '被買収', '両社', 'post-merger', 'pmi', 'merger', 'acquisition',
    ],
    // 「統合」「integration」は API 連携やデータ統合でも出るため周辺語
    keywords: ['統合', '子会社', 'グループ会社', 'integration'],
    diagnosis: {
      ja: '統合の難所は技術ではなくデータ定義とコード体系。「顧客」「商品」「勘定科目」の定義が両社で違うことが、統合コストの大半を生む。統合の深さ(共存/部分統合/完全統合)を先に決めないと、際限なく費用が膨らむ。',
      en: 'The hard part of integration is data definitions and code systems, not technology. Most of the cost comes from the two sides defining "customer", "product", and "account" differently. Without first deciding the depth of integration — coexist, partially integrate, fully integrate — cost expands without limit.',
    },
    phaseIds: ['a', 'b', 'c', 'e'],
    techniqueIds: ['interoperability-requirements', 'gap-analysis', 'capability-based-planning', 'migration-planning-techniques'],
    deliverableIds: ['data-entity-catalog', 'application-portfolio-catalog', 'business-capability-map', 'architecture-roadmap', 'transition-architecture'],
    actions: [
      { ja: '統合の深さを業務領域ごとに決める(共存のまま / データだけ統合 / 完全統合)。全領域を完全統合しようとしない。', en: 'Decide the depth of integration per business area — coexist, integrate data only, fully integrate. Do not push every area to full integration.' },
      { ja: '争点になる 20〜30 個の主要データエンティティについて、両社の定義を突き合わせる。', en: 'Reconcile the two sides\' definitions for the twenty or thirty contested key data entities.' },
      { ja: '重複するアプリケーションを事業価値 × 技術的健全性で評価し、残す方を決める。', en: 'Rate overlapping applications on business value against technical health and pick the survivor.' },
      { ja: '統合前に必要な「見える化」(決算連結、共通レポート)を最優先の中間状態に置く。', en: 'Put the visibility outcomes — consolidated close, common reporting — into the earliest transition state.' },
      { ja: '両社の技術標準・ライセンス契約・サポート期限を突き合わせ、失効リスクを洗い出す。', en: 'Compare both sides\' technology standards, licences, and support end dates, and surface the expiry risks.' },
    ],
    questions: [
      { ja: '統合の目的はコストシナジーですか、事業シナジーですか。優先順位はどちらですか?', en: 'Is the integration after cost synergy or revenue synergy, and which takes priority?' },
      { ja: '統合後に「どちらのやり方に寄せるか」を決める権限は誰にありますか?', en: 'Who has the authority to decide whose way of working prevails after integration?' },
      { ja: '統合完了の期限は、契約上・開示上いつですか?', en: 'What is the integration deadline from a contractual and disclosure standpoint?' },
      { ja: '両社で定義が異なる最重要のデータは何ですか(顧客、商品、組織コードなど)?', en: 'Which data matters most and is defined differently on each side — customer, product, org codes?' },
    ],
  },
  {
    id: 'data-silo',
    name: { ja: 'データのサイロ化・マスタ整備', en: 'Data Silos and Master Data' },
    strongKeywords: [
      'マスタ', 'サイロ化', '名寄せ', 'データ活用', 'dwh', 'データ基盤', '数字が合わ', '二重入力', '正本',
      'data silo', 'master data', 'mdm', 'data quality', 'single source of truth', 'data platform', 'data warehouse',
    ],
    keywords: ['データ', '重複', 'bi', '分析', 'サイロ', 'analytics'],
    diagnosis: {
      ja: '「データが活用できない」の実態は、ほぼ常に「同じ概念の定義が部門ごとに違う」「正本が決まっていない」こと。データ基盤を先に作っても、定義が揃っていなければ集めたデータは使えない。フェーズ C のデータアーキテクチャが本丸。',
      en: 'When data "cannot be used", the reality is almost always that the same concept is defined differently per unit and no system of record has been designated. Building a data platform first does not help: without agreed definitions, the collected data is unusable. Phase C data architecture is the real work.',
    },
    phaseIds: ['b', 'c', 'e'],
    techniqueIds: ['gap-analysis', 'interoperability-requirements', 'stakeholder-management', 'architecture-governance'],
    deliverableIds: ['data-entity-catalog', 'architecture-definition-document', 'architecture-requirements-spec', 'architecture-roadmap'],
    actions: [
      { ja: '主要エンティティごとに正本システムを 1 つに決める。「両方が正」を認めた瞬間に統合コストが青天井になる。', en: 'Designate exactly one system of record per key entity. Allowing "both are authoritative" makes integration cost unbounded.' },
      { ja: '部門ごとの定義の食い違いを可視化する。突き合わせ表を作るだけで議論が前に進む。', en: 'Expose the definitional differences between units. Simply tabulating them moves the discussion forward.' },
      { ja: 'データ管理責任者(スチュワード)を、エンティティごとに個人名で決める。', en: 'Name an individual data steward per entity.' },
      { ja: '全データを対象にしない。争点になる 20〜30 エンティティに絞る。', en: 'Do not aim for all data. Narrow to the twenty or thirty contested entities.' },
      { ja: 'CRUD マトリクスで「作成する主体が複数ある」データを炙り出す。', en: 'Use a CRUD matrix to find data that more than one system claims to create.' },
    ],
    questions: [
      { ja: '「顧客」の定義は、営業部門と経理部門で同じですか?', en: 'Do sales and finance define "customer" the same way?' },
      { ja: '数字が合わないと言われたとき、どのシステムの値が正だと判断していますか?', en: 'When the numbers disagree, which system\'s value is treated as correct?' },
      { ja: 'データの品質に責任を持つ人は、業務部門にいますか、IT 部門にいますか?', en: 'Does accountability for data quality sit in the business or in IT?' },
      { ja: 'データ基盤を作った後、誰がどの意思決定に使う想定ですか?', en: 'Once the data platform exists, who uses it for which decision?' },
    ],
  },
  {
    id: 'cost-reduction',
    name: { ja: 'IT コスト削減・システム統廃合', en: 'IT Cost Reduction and Rationalization' },
    strongKeywords: [
      'コスト削減', '費用削減', '統廃合', 'コスト高', '保守費', '重複投資',
      'cost reduction', 'cost cutting', 'rationalization', 'rationalisation', 'consolidation', 'savings',
    ],
    keywords: ['削減', '予算が', 'ライセンス', '無駄', 'licence', 'license'],
    diagnosis: {
      ja: 'コスト削減は「何を止めるか」を決める作業。アプリケーションポートフォリオを事業価値 × 技術的健全性で評価すれば、廃止候補は機械的に出てくる。難所は分析ではなく、廃止を決める意思決定と、利用部門との調整。',
      en: 'Cost reduction is the work of deciding what to stop. Rate the application portfolio on business value against technical health and the retirement candidates fall out mechanically. The hard part is not the analysis but the decision to retire and the negotiation with the users.',
    },
    phaseIds: ['c', 'e', 'f', 'h'],
    techniqueIds: ['gap-analysis', 'capability-based-planning', 'migration-planning-techniques', 'stakeholder-management'],
    deliverableIds: ['application-portfolio-catalog', 'technology-standards-catalog', 'architecture-roadmap', 'implementation-migration-plan'],
    actions: [
      { ja: 'アプリケーション一覧に「事業価値 × 技術的健全性」の 2 軸評価を加える。一覧だけでは意思決定に使えない。', en: 'Add the two-axis rating — business value against technical health — to the application list. A bare list cannot drive decisions.' },
      { ja: '同じビジネス能力を支える重複アプリケーションを能力マップ上で可視化する。', en: 'Use the capability map to expose applications that support the same capability.' },
      { ja: '廃止のコスト(データ移行、契約解除、再教育)も見積もる。廃止は無料ではない。', en: 'Estimate the cost of retirement too — data migration, contract exit, retraining. Shutting things down is not free.' },
      { ja: '削減額の刈り取り責任者を個人名で決める。責任者のいない削減目標は達成されない。', en: 'Name an individual accountable for harvesting each saving. Targets without an owner are not met.' },
      { ja: 'ライセンス・保守契約のサポート期限を棚卸しし、期限切れによる強制コストを先に把握する。', en: 'Inventory licence and support end dates so that forced spend from expiry is known in advance.' },
    ],
    questions: [
      { ja: '削減目標は金額ですか、比率ですか。いつまでに、どの費目でですか?', en: 'Is the target an amount or a percentage — by when, and against which cost lines?' },
      { ja: 'システムを廃止した場合に困る利用部門は、誰が説得しますか?', en: 'Who persuades the business units that lose a system when it is retired?' },
      { ja: '現在の IT 費用のうち、運用維持費と新規投資の比率はどれくらいですか?', en: 'What is the split between run cost and new investment in your current IT spend?' },
      { ja: '削減した費用は、他の投資に回せますか、それとも予算ごと消えますか?', en: 'Can the money saved be redeployed to other investment, or does the budget simply disappear?' },
    ],
  },
  {
    id: 'security-compliance',
    name: { ja: 'セキュリティ・規制対応', en: 'Security and Regulatory Compliance' },
    strongKeywords: [
      'セキュリティ', '規制', 'コンプライアンス', '個人情報', 'gdpr', '内部統制', 'j-sox', 'ゼロトラスト', '脆弱性',
      'security', 'compliance', 'regulation', 'privacy', 'zero trust', 'vulnerability',
    ],
    keywords: ['監査', '認証', 'インシデント', 'audit', 'identity', 'incident'],
    diagnosis: {
      ja: 'セキュリティ要件は非機能要件として ID を振って管理しないと、設計の後半で「追加要件」として現れてコストを跳ね上げる。規制対応は期日が動かないため、ロードマップ上の固定制約として最初に置く。',
      en: 'Unless security requirements are tracked as non-functional requirements with IDs, they surface late in design as "new requirements" and blow up the cost. Regulatory dates do not move, so place them on the roadmap first as fixed constraints.',
    },
    phaseIds: ['b', 'c', 'd', 'f', 'g'],
    techniqueIds: ['risk-management', 'gap-analysis', 'architecture-governance', 'stakeholder-management'],
    deliverableIds: ['architecture-requirements-spec', 'architecture-definition-document', 'technology-standards-catalog', 'compliance-assessment', 'architecture-contract'],
    actions: [
      { ja: 'セキュリティ要件を要件仕様に ID 付きで登録し、各アーキテクチャ構成要素へトレースを張る。', en: 'Register security requirements with IDs in the requirements specification and trace them to architecture components.' },
      { ja: '規制の適用期日をロードマップの固定制約として最初に置く。動かせない日付から逆算する。', en: 'Place regulatory dates on the roadmap first as immovable constraints and plan backwards from them.' },
      { ja: 'データの機密区分とデータ所在地の要件を、データエンティティカタログに列として追加する。', en: 'Add sensitivity classification and residency requirements as columns in the data entity catalog.' },
      { ja: 'セキュリティ部門をフェーズ D の最初から入れる。最後にレビューさせると設計をやり直すことになる。', en: 'Bring the security team in at the start of Phase D. Reviewing at the end means redesigning.' },
      { ja: '残存リスクの受容者を個人名で記録する。「組織として受容」は責任の所在を消す。', en: 'Record a named individual as the acceptor of each residual risk; "accepted by the organization" erases accountability.' },
    ],
    questions: [
      { ja: '適用される規制と、その対応期日を一覧化していますか?', en: 'Do you have a list of the applicable regulations and their compliance dates?' },
      { ja: 'セキュリティ要件を最終承認するのは誰ですか。その人は設計初期から関与していますか?', en: 'Who gives final approval on security requirements, and are they involved from the start of design?' },
      { ja: '監査で指摘された場合、是正までに許される期間はどれくらいですか?', en: 'If an audit raises a finding, how long do you have to remediate?' },
      { ja: 'インシデント発生時の責任分界は、クラウド事業者・委託先との間で文書化されていますか?', en: 'Is the division of responsibility during an incident documented with your cloud providers and suppliers?' },
    ],
  },
  {
    id: 'package-selection',
    name: { ja: 'パッケージ / SaaS 選定', en: 'Package and SaaS Selection' },
    strongKeywords: [
      'パッケージ', '製品選定', 'ベンダー選定', '選定基準', '製品比較', 'rfp', 'アドオン', 'fit&gap', 'フィットギャップ',
      'package', 'product selection', 'off the shelf', 'fit gap', 'request for proposal',
    ],
    // 「ベンダー」「調達」「製品」や製品名は、選定以外の相談にも普通に出てくる。
    // これらだけが当たった場合は主題ではないとみなす(体制崩壊の話でベンダーと書いただけ、等)。
    keywords: [
      '選定', 'ベンダー', '調達', '製品', 'erp', 'sap', 'salesforce', 'カスタマイズ',
      'vendor', 'procurement', 'customization', 'customisation',
    ],
    diagnosis: {
      ja: 'パッケージ選定の失敗は、ほぼ常に「要件を機能一覧で書いた」ことに起因する。機能比較表では差が出ず、結局は価格と営業力で決まる。ビジネス能力と非機能要件、そして「標準機能に業務を寄せられるか」の判断が本質。',
      en: 'Package selections fail almost always because requirements were written as a feature list. Feature comparison matrices do not differentiate, so the decision defaults to price and sales pressure. What matters is business capability, non-functional requirements, and whether you can bend operations to the standard product.',
    },
    phaseIds: ['b', 'c', 'd', 'e'],
    techniqueIds: ['gap-analysis', 'business-scenarios', 'interoperability-requirements', 'risk-management'],
    deliverableIds: ['architecture-requirements-spec', 'business-capability-map', 'architecture-definition-document', 'architecture-contract'],
    actions: [
      { ja: '評価軸を先に確定し、重み付けまで合意してから製品を見る。製品を見てから軸を作ると、既に心が決まった製品に合う軸ができる。', en: 'Fix the evaluation axes and their weights before looking at products. Build the axes after seeing products and they will fit the one you already favour.' },
      { ja: '「標準機能に業務を寄せる」方針を先に経営層と合意する。アドオンの可否は個別判断にしない。', en: 'Agree with executives up front that operations bend to the standard product. Do not leave each add-on to case-by-case judgement.' },
      { ja: '非機能要件(性能、可用性、データ持ち出し、監査ログ)を要件仕様に明記して RFP に含める。', en: 'Write the non-functional requirements — performance, availability, data export, audit logs — into the specification and the RFP.' },
      { ja: 'ビジネスシナリオでデモを評価する。機能チェックリストではなく、実際の業務の流れを流させる。', en: 'Evaluate demos against business scenarios: make them run your actual operational flow, not tick a feature checklist.' },
      { ja: '出口戦略(データ持ち出し、契約解除、移行)を選定時点で確認する。', en: 'Confirm the exit — data export, contract termination, migration — at selection time.' },
    ],
    questions: [
      { ja: '業務を製品の標準に合わせる方針で経営層の合意は取れていますか?', en: 'Have executives agreed that operations will conform to the product\'s standard way of working?' },
      { ja: 'アドオン開発を承認できるのは誰ですか。その判断基準は文書化されていますか?', en: 'Who approves an add-on, and are the criteria written down?' },
      { ja: '契約終了時に自社データを持ち出せる形式と期間は、契約に明記されていますか?', en: 'Does the contract state the format and window for exporting your data at termination?' },
      { ja: 'この製品を実際に運用する部門は、選定に参加していますか?', en: 'Are the people who will actually operate this product part of the selection?' },
    ],
  },
  {
    id: 'project-rescue',
    name: { ja: '炎上プロジェクトの立て直し', en: 'Troubled Project Recovery' },
    strongKeywords: [
      '炎上', '火消し', '立て直し', 'リカバリ', '破綻', '間に合わ', 'デスマ',
      'troubled', 'rescue', 'behind schedule', 'over budget', 'failing project', 'death march',
    ],
    keywords: ['遅延', '遅れ', '止まっ', '赤字', 'recovery', 'delayed'],
    diagnosis: {
      ja: '炎上時に真っ先にやるべきは、範囲の再定義と「止められる中間状態」の再設計。人を増やす判断は最後。アーキテクチャの観点では、当初の目標像が現在の制約下で到達可能かを再評価し、到達できないなら目標像自体を下げる判断をスポンサーに返す。',
      en: 'The first moves on a troubled project are redefining scope and re-cutting the plan into stoppable intermediate states. Adding people comes last. Architecturally, re-assess whether the original target is still reachable under current constraints, and if it is not, hand the sponsor the decision to lower the target.',
    },
    phaseIds: ['a', 'e', 'f', 'g', 'requirements-management'],
    techniqueIds: ['risk-management', 'migration-planning-techniques', 'stakeholder-management', 'business-transformation-readiness'],
    deliverableIds: ['statement-of-architecture-work', 'architecture-roadmap', 'transition-architecture', 'implementation-migration-plan', 'requirements-impact-assessment'],
    actions: [
      { ja: '当初の成功条件を確認し、現在の制約下で到達可能かを冷静に再評価する。', en: 'Restate the original success criteria and coldly re-assess whether they are reachable under today\'s constraints.' },
      { ja: '「止められる中間状態」に計画を切り直す。今から 3 か月で何が本番に出せるかを起点にする。', en: 'Re-cut the plan into stoppable intermediate states, starting from what can reach production in the next three months.' },
      { ja: '要件を優先度で切り、落とす要件をスポンサーに明示的に承認させる。', en: 'Cut requirements by priority and have the sponsor explicitly approve what gets dropped.' },
      { ja: '増員の前に、意思決定の遅延がボトルネックになっていないかを確認する。多くの場合こちらが真因。', en: 'Before adding people, check whether decision latency is the bottleneck. It usually is.' },
      { ja: '悪い数字をそのまま報告する経路を作る。粉飾された進捗報告が続く限り立て直せない。', en: 'Build a route for reporting the bad numbers unedited. Recovery is impossible while status reports stay cosmetic.' },
    ],
    questions: [
      { ja: '今から 3 か月で本番稼働できる最小の範囲は何ですか?', en: 'What is the smallest scope that could go live in the next three months?' },
      { ja: '落としてよい要件を決められるのは誰ですか?', en: 'Who is empowered to decide which requirements get dropped?' },
      { ja: '意思決定待ちで止まっている項目は今いくつありますか。平均何日待っていますか?', en: 'How many items are blocked waiting on a decision right now, and for how many days on average?' },
      { ja: 'このプロジェクトを中止する判断基準はありますか。誰が判断しますか?', en: 'Are there criteria for cancelling this project, and who makes that call?' },
    ],
  },
  {
    id: 'repeated-failure',
    name: { ja: '過去に頓挫した取り組みの再挑戦', en: 'Restarting an Initiative That Failed Before' },
    strongKeywords: [
      '頓挫', '二の舞', '同じ失敗', '繰り返さない', '繰り返したくない', '前回の失敗', '前回なぜ', '失敗要因', '失敗している', '失敗した',
      '過去に失敗', '過去に頓挫', '過去 2 回', '過去2回', 'また止ま', 'また同じ', '白紙', 'リベンジ', '再挑戦', '仕切り直し',
      '3 度目', '3度目', '三度目', '立ち消え', '中断した',
      'failed before', 'failed twice', 'previous attempt', 'earlier attempt', 'last attempt', 'second attempt', 'third attempt',
      'stalled twice', 'abandoned', 'went nowhere', 'same mistake',
    ],
    keywords: [
      '失敗', '前回', '前回は', '過去に', '2 回目', '2回目', '二度目', '断念', '棚上げ', '振り出し',
      'lessons learned', 'last time', 'stalled', 'restart', 'again', 'tried before',
    ],
    diagnosis: {
      ja: '同じ構想が二度止まっているとき、止めたのは技術ではなく組織側の条件であることがほとんど。前回なぜ止まったかを因子に分解しないまま再挑戦すると、同じ場所で同じ理由で止まる。スポンサーの交代・現場の余力・過去の失敗経験そのものが、今回の変革準備度を下げる要因として効いている。まずビジネス変革準備度評価で前回の停止要因を因子として評価し直し、「今回は何が違うのか」を 1 枚で言えるようにするところから始める。',
      en: 'When the same initiative has stopped twice, what stopped it was almost never the technology — it was a condition on the organizational side. Restart without decomposing why it stopped and it stops again at the same place for the same reason. A changed sponsor, no slack in the operating units, and the memory of the earlier failure itself all pull this attempt\'s readiness down. Start by re-scoring the previous stopping factors as readiness factors, so that "what is different this time" fits on one page.',
    },
    phaseIds: ['preliminary', 'a', 'e', 'h'],
    techniqueIds: ['business-transformation-readiness', 'stakeholder-management', 'risk-management', 'architecture-maturity'],
    deliverableIds: ['architecture-vision', 'statement-of-architecture-work', 'stakeholder-map', 'organizational-model', 'architecture-roadmap'],
    actions: [
      { ja: '前回の停止要因を、人に紐付けず事実として棚卸しする(意思決定が止まった / 予算が切れた / 主要要員が抜けた / 目的が合意されていなかった のどれか)。犯人探しになった瞬間に情報が出てこなくなる。', en: 'Inventory why the last attempt stopped as facts, not as people: the decision stalled, the funding ended, key people left, or the purpose was never agreed. The moment it becomes a hunt for who was at fault, the information dries up.' },
      { ja: '洗い出した停止要因をビジネス変革準備度の因子として登録し、現在の状態を点数で付け直す。前回と同じ点数の因子が残っていれば、それが今回も止める。', en: 'Register each stopping factor as a business transformation readiness factor and re-score it as it stands today. Any factor still scoring where it did last time is what stops you again.' },
      { ja: '「今回は何が違うのか」を 3 点以内で書き、スポンサーに読み上げてもらう。本人の口から出てこないなら、まだ何も変わっていない。', en: 'Write down what is different this time in three points or fewer and have the sponsor say them out loud. If they cannot, nothing has actually changed yet.' },
      { ja: '前回の成果物(調査資料、要件、設計、契約)のうち再利用できるものを特定する。ゼロから作り直すと、組織は「また同じことをやっている」と受け取る。', en: 'Identify what from the previous attempt can be reused — studies, requirements, designs, contracts. Rebuilding from zero tells the organization you are simply doing the same thing over again.' },
      { ja: '最初の中間状態を、前回到達できなかった地点より手前に置き、そこを必ず通過して見せる。過去 2 回止まった組織に必要なのは大きな絵ではなく、1 回完走した実績。', en: 'Set the first transition state short of where the last attempt died, and be seen to pass it. An organization that has stopped twice needs one completed lap far more than a bigger picture.' },
    ],
    questions: [
      { ja: '前回止まったのは、いつ、どの段階で、直接のきっかけは何でしたか?', en: 'When did the last attempt stop, at which stage, and what was the immediate trigger?' },
      { ja: '前回のスポンサーは今も同じ人ですか。交代している場合、前回の経緯は引き継がれていますか?', en: 'Is the sponsor the same person as last time? If not, has the history been handed over?' },
      { ja: '前回関わった人のうち、今も在籍しているのは誰ですか。その人たちは今回に前向きですか、それとも疲れていますか?', en: 'Who from the previous attempt is still here, and are they willing this time — or worn out?' },
      { ja: '今回止まったとしたら、最も可能性が高い理由は何だと思いますか。その予防策は計画に入っていますか?', en: 'If this attempt stops, what is the most likely reason — and is the countermeasure in the plan?' },
    ],
  },
  {
    id: 'ai-adoption',
    name: { ja: 'AI / 生成 AI の活用', en: 'AI and Generative AI Adoption' },
    strongKeywords: [
      '生成ai', '生成 ai', 'llm', '機械学習', 'rag', 'chatgpt', 'copilot',
      'artificial intelligence', 'generative ai', 'machine learning',
    ],
    keywords: ['ai', 'ml', '自動化', 'エージェント', 'claude', 'agent', 'automation'],
    diagnosis: {
      ja: 'AI 活用は「どのビジネス能力を、どの程度引き上げるのか」で語らないと、PoC 止まりになる。アーキテクチャ上の論点は、データの品質と正本、権限管理、出力の検証プロセス、そして運用時のコスト構造。フェーズ B(どの業務に効かせるか)と C(データが揃っているか)が先で、D は後。',
      en: 'AI adoption that is not framed as "which business capability, raised by how much" stops at proof-of-concept. The architectural issues are data quality and systems of record, access control, the process for verifying outputs, and the run-time cost structure. Phase B (which operations benefit) and Phase C (is the data there) come first; Phase D comes after.',
    },
    phaseIds: ['b', 'c', 'd', 'e', 'g'],
    techniqueIds: ['capability-based-planning', 'business-scenarios', 'risk-management', 'gap-analysis'],
    deliverableIds: ['business-capability-map', 'data-entity-catalog', 'architecture-requirements-spec', 'architecture-roadmap', 'compliance-assessment'],
    actions: [
      { ja: '対象業務をビジネスシナリオで具体化し、「人間が最終判断する箇所」を明示する。', en: 'Make the target operation concrete as a business scenario and mark explicitly where a human makes the final call.' },
      { ja: '入力となるデータの正本と品質を先に確認する。データが揃っていない領域の PoC は必ず失敗する。', en: 'Verify the system of record and quality of the input data first. Proofs-of-concept in areas without the data always fail.' },
      { ja: '出力の検証プロセスと、誤った出力が業務に流れた場合の影響範囲を評価する。', en: 'Define how outputs are verified and assess the blast radius when a wrong output reaches the business.' },
      { ja: '推論コストを利用量ベースで見積もり、運用コストとして予算に組み込む。', en: 'Model inference cost against expected usage and put it into the budget as run cost.' },
      { ja: '入力データの機密区分と、外部サービスへの送信可否を技術標準に明記する。', en: 'Write the sensitivity classification of input data and what may be sent to external services into the technology standards.' },
    ],
    questions: [
      { ja: 'AI で引き上げたいビジネス能力は具体的に何で、現在の水準と目標水準は何ですか?', en: 'Which business capability is being raised, and from what level to what level?' },
      { ja: '出力が誤っていた場合、誰がどの時点で気づき、誰が責任を負いますか?', en: 'If an output is wrong, who notices, at what point, and who is accountable?' },
      { ja: '入力するデータに、外部に送信してはいけない情報は含まれますか?', en: 'Does the input data include anything that must not be sent outside the organization?' },
      { ja: 'PoC が成功した場合、本番運用のコストと体制は誰が負担しますか?', en: 'If the proof-of-concept succeeds, who funds and staffs the production operation?' },
    ],
  },
  {
    id: 'skills-and-people',
    name: { ja: '人材・スキル不足', en: 'Skills and Capacity Shortfall' },
    strongKeywords: [
      '人材', 'スキル', '要員', '育成', '属人', '人が足りない', '人手が足り', 'ベンダー依存', 'ノウハウ',
      'skills', 'talent', 'staffing', 'headcount', 'training', 'knowledge transfer', 'key person',
    ],
    keywords: ['採用', '内製', 'vendor lock', 'in-house'],
    diagnosis: {
      ja: 'スキル不足は「教育で解決」の一行で片付けられがちだが、実際には工数・期間・機会損失を伴う投資。ビジネス変革準備度評価で因子として明示的に評価し、ロードマップに育成・採用の期間を組み込まないと、計画通りに人は現れない。',
      en: 'A skills gap is usually dismissed with "we will train them", but it is an investment with effort, elapsed time, and opportunity cost. Assess it explicitly as a readiness factor and build the hiring and training time into the roadmap — otherwise the people simply do not appear on schedule.',
    },
    phaseIds: ['preliminary', 'a', 'e', 'f', 'h'],
    techniqueIds: ['business-transformation-readiness', 'capability-based-planning', 'architecture-maturity', 'risk-management'],
    deliverableIds: ['organizational-model', 'implementation-migration-plan', 'architecture-roadmap', 'architecture-repository'],
    actions: [
      { ja: '必要スキルを役割単位で定義し、現在の充足状況とのギャップを人数で出す。', en: 'Define required skills per role and express the gap in headcount.' },
      { ja: '充足手段(採用/育成/外部調達)ごとに、必要な期間とコストを見積もる。', en: 'Estimate the time and cost of each route: hire, train, or contract.' },
      { ja: '属人化している領域を特定し、決定ログとドキュメントで知識を資産化する。', en: 'Identify where knowledge sits with one person and turn it into an asset through decision logs and documentation.' },
      { ja: 'ベンダー依存が高い領域では、アーキテクチャ契約で成果物と知識移転を義務付ける。', en: 'Where vendor dependence is high, make deliverables and knowledge transfer contractual in the Architecture Contract.' },
      { ja: 'ロードマップの各段階に、その段階を実行できる体制が存在するかを確認する。', en: 'For each roadmap step, verify a team capable of executing it will actually exist.' },
    ],
    questions: [
      { ja: 'この計画を実行するために必要なスキルのうち、社内にないものは何ですか?', en: 'Which of the skills this plan needs do you not have in house?' },
      { ja: '育成する場合、対象者が実務から離れる期間の業務は誰が引き受けますか?', en: 'If you train people, who covers their day job while they are away?' },
      { ja: '現在、特定の 1 名しか対応できない領域はどこですか?', en: 'Where today can only one specific person handle the work?' },
      { ja: 'ベンダーが撤退した場合、自社で運用を継続できますか?', en: 'If the vendor withdrew, could you keep operating on your own?' },
    ],
  },
  {
    id: 'insourcing-and-lock-in',
    name: { ja: '内製化・ベンダーロックインからの脱却', en: 'Insourcing and Escaping Vendor Lock-in' },
    strongKeywords: [
      '内製化', 'ベンダーロックイン', 'ロックイン', '丸投げ', '再委託', 'マルチベンダー', '特定ベンダー', '囲い込ま', '自社で作れ',
      'insourcing', 'insource', 'lock-in', 'locked in', 'vendor lock-in', 'multi-vendor', 'second source', 'exit strategy',
    ],
    keywords: ['脱却', '外注', 'outsourcing', 'in-house', 'in house'],
    diagnosis: {
      ja: '内製化を人員計画の話として始めると必ず失敗する。ロックインの実体は要員ではなく、① 仕様と設計の知識が社外にしかない、② データとインタフェースが特定製品の形式に縛られている、③ 契約に出口条項がない、の 3 つ。どの層(業務知識・設計知識・運用手順・データ形式)を取り戻すのかを分けて決める。',
      en: 'Starting insourcing as a headcount plan reliably fails. Lock-in is not about staffing; it is three things — the specification and design knowledge exists only outside the company, the data and interfaces are shaped by one product\'s formats, and the contract has no exit clause. Decide layer by layer which you are taking back: domain knowledge, design knowledge, operating procedures, data formats.',
    },
    phaseIds: ['preliminary', 'a', 'd', 'f', 'h'],
    techniqueIds: ['business-transformation-readiness', 'architecture-governance', 'capability-based-planning', 'risk-management'],
    deliverableIds: ['organizational-model', 'architecture-contract', 'technology-standards-catalog', 'architecture-roadmap', 'implementation-migration-plan'],
    actions: [
      { ja: '取り戻す対象を層で分ける(業務知識 / 設計知識 / 運用手順 / データ形式)。全部を一度に内製化しようとしない。', en: 'Split what you reclaim into layers — domain knowledge, design knowledge, run procedures, data formats — and do not insource all of them at once.' },
      { ja: '現行契約の出口条項(データ返還形式、ソースコードと設計書の帰属、支援期間)を確認する。無ければ次回更新が唯一の交渉機会。', en: 'Check the exit clauses in the current contract — data return format, ownership of source and design documents, transition support period. If there are none, the next renewal is your only leverage.' },
      { ja: '内製する範囲を「変更頻度が高く、競争優位に効く領域」に限定する。安定領域まで内製すると固定費だけが残る。', en: 'Limit insourcing to areas that change often and drive competitive advantage. Insourcing the stable areas only converts the spend into permanent fixed cost.' },
      { ja: '移管期間は現ベンダーと並走させ、知識移転の成果物と受入基準をアーキテクチャ契約に明記する。', en: 'Run in parallel with the incumbent during handover, and write the knowledge-transfer deliverables and their acceptance criteria into the Architecture Contract.' },
      { ja: '技術標準に「代替可能性」の観点を入れ、単一ベンダー固有機能の採用は例外承認扱いにする。', en: 'Add substitutability to the technology standards and make adoption of single-vendor proprietary features an explicit exception.' },
    ],
    questions: [
      { ja: '現行ベンダーが明日撤退した場合、システムを 3 か月間動かし続けられますか?', en: 'If the incumbent walked away tomorrow, could you keep the system running for three months?' },
      { ja: '設計書とソースコードの権利は、契約上どちらに帰属していますか?', en: 'Under the contract, who owns the design documents and the source code?' },
      { ja: '内製化した後、その要員の評価と処遇は誰が設計しますか?', en: 'Once the work is insourced, who designs the career path and compensation for those people?' },
      { ja: '内製の対象にしたい領域には、今後 3 年で何回の変更が入る見込みですか?', en: 'How many changes do you expect over the next three years in the area you want to insource?' },
    ],
  },
  {
    id: 'microservices-decomposition',
    name: { ja: 'マイクロサービス化・モノリス分割', en: 'Microservices and Monolith Decomposition' },
    strongKeywords: [
      'マイクロサービス', 'モノリス', 'モノリシック', 'サービス分割', '疎結合', 'ドメイン駆動', '境界づけ', 'イベント駆動',
      'microservice', 'microservices', 'monolith', 'monolithic', 'decomposition', 'bounded context', 'strangler', 'ddd', 'event driven',
    ],
    keywords: ['分割'],
    diagnosis: {
      ja: 'マイクロサービス化の相談は、ほぼ常に「デプロイが遅い」「変更が他に波及する」という納期の問題として持ち込まれる。しかし分割線を決めるのはデータの境界であって技術構成ではない。正本が割れたまま分割すると、結合はそのままで運用負荷だけが増える分散モノリスになる。',
      en: 'Requests for microservices almost always arrive as a delivery problem: deployments are slow, changes ripple. But the split is determined by data boundaries, not by technology. Decompose while systems of record are still contested and you get a distributed monolith — the same coupling with far higher operational load.',
    },
    phaseIds: ['b', 'c', 'd', 'e', 'f'],
    techniqueIds: ['gap-analysis', 'interoperability-requirements', 'migration-planning-techniques', 'architecture-governance'],
    deliverableIds: ['application-portfolio-catalog', 'data-entity-catalog', 'architecture-definition-document', 'transition-architecture', 'architecture-roadmap'],
    actions: [
      { ja: '分割単位をビジネス能力とデータの正本から決める。現在の組織図をそのまま分割線にしない。', en: 'Derive service boundaries from business capabilities and systems of record, not from the current org chart.' },
      { ja: '全面分割はしない。変更頻度の高い領域を 1〜2 個だけ切り出し、1 年運用して学習してから広げる。', en: 'Do not decompose everything. Carve out one or two high-change areas, run them for a year, and widen only after that.' },
      { ja: '分割後に必要になる運用能力(分散トレーシング、障害切り分け、リリース調整)を先に評価する。ここが欠けたままの分割は事故になる。', en: 'Assess the operational capabilities decomposition demands — distributed tracing, fault isolation, release coordination — before splitting. Without them the split becomes an incident.' },
      { ja: 'サービス間インタフェースを契約として管理し、後方互換性の責任者を個人名で決める。', en: 'Manage inter-service interfaces as contracts, with a named individual accountable for backward compatibility.' },
      { ja: '「分割しない」判断も選択肢として明示的に残す。モジュール分割 + 単一デプロイで足りる場合が多い。', en: 'Keep "do not split" explicitly on the table. A modular codebase with a single deployment is often enough.' },
    ],
    questions: [
      { ja: '1 つの変更が本番に出るまで今は何日かかりますか。その遅延は結合が原因ですか、承認が原因ですか?', en: 'How many days does one change take to reach production today, and is the delay caused by coupling or by approvals?' },
      { ja: '分割したいサービス同士が、同じデータを更新している箇所はどこですか?', en: 'Where do the services you want to split both update the same data?' },
      { ja: '分割後、サービスごとに責任を持つチームは存在しますか。それとも同じチームが全部を見ますか?', en: 'After the split, will each service have its own accountable team, or will one team own them all?' },
      { ja: '障害が複数サービスにまたがったとき、切り分けは誰がどう行いますか?', en: 'When an incident spans several services, who isolates it and how?' },
    ],
  },
  {
    id: 'api-strategy',
    name: { ja: 'API 戦略・連携ガバナンス', en: 'API Strategy and Integration Governance' },
    strongKeywords: [
      'api', 'apis', 'rest api', 'graphql', 'openapi', 'ゲートウェイ', '連携基盤', 'システム間連携', 'インタフェース仕様',
      'esb', 'ipaas', 'webhook', 'api gateway', 'integration platform',
    ],
    keywords: ['外部公開', 'エコシステム'],
    diagnosis: {
      ja: 'API の相談は技術標準の話に見えて、実際は「誰がインタフェースの互換性に責任を持つか」というガバナンスの問題。ゲートウェイを導入しても、命名・粒度・バージョニング・廃止手順が決まっていなければ、点対点連携がゲートウェイ経由になるだけで結合は減らない。',
      en: 'API questions look like a technology-standards topic but are really governance: who is accountable for interface compatibility. Installing a gateway changes nothing if naming, granularity, versioning, and deprecation are undecided — the point-to-point tangle simply routes through the gateway.',
    },
    phaseIds: ['b', 'c', 'd', 'g', 'h'],
    techniqueIds: ['interoperability-requirements', 'architecture-governance', 'gap-analysis', 'stakeholder-management'],
    deliverableIds: ['architecture-definition-document', 'technology-standards-catalog', 'architecture-requirements-spec', 'architecture-contract', 'application-portfolio-catalog'],
    actions: [
      { ja: '既存の連携を棚卸しし、点対点接続の本数と、そのうち仕様書がある割合を数字で出す。', en: 'Inventory existing integrations and report two numbers: how many point-to-point connections exist, and what share of them has a written specification.' },
      { ja: 'API の粒度をビジネス能力に合わせる。テーブル単位の CRUD を公開すると、内部データモデルが外部契約になって二度と変えられなくなる。', en: 'Set API granularity by business capability. Publishing table-level CRUD turns your internal data model into an external contract you can never change.' },
      { ja: 'バージョニング方針と廃止手順(予告期間、並行提供期間)を先に決める。作る手順より止める手順が要る。', en: 'Decide versioning and the deprecation procedure — notice period, overlap period — up front. The procedure for retiring an API matters more than the one for creating it.' },
      { ja: 'API ごとに提供責任者を個人名で決め、SLA と利用状況の計測を義務付ける。', en: 'Name an individual owner per API, with an SLA and mandatory usage measurement.' },
      { ja: '外部公開する API は、利用規約・課金・認可・監査ログまで含めて設計する。社内 API に URL を付けただけのものを公開しない。', en: 'Design externally exposed APIs with terms of use, billing, authorization, and audit logging. Do not publish an internal API with a public URL bolted on.' },
    ],
    questions: [
      { ja: 'システム間の連携は現在何本ありますか。そのうち仕様書があるものは何割ですか?', en: 'How many system-to-system integrations exist today, and what fraction have a written specification?' },
      { ja: '互換性を壊す変更を承認できるのは誰ですか?', en: 'Who approves a breaking change to an interface?' },
      { ja: '使われなくなった連携を止める手順はありますか。実際に止めた実績はありますか?', en: 'Is there a procedure for retiring an unused integration, and has one ever actually been retired?' },
      { ja: '外部に公開する場合、利用規約と障害時の責任範囲は誰が決めますか?', en: 'If it is exposed externally, who sets the terms of use and the liability boundary during an outage?' },
    ],
  },
  {
    id: 'global-rollout',
    name: { ja: 'グローバル展開・多国展開', en: 'Global and Multi-country Rollout' },
    strongKeywords: [
      'グローバル', '海外展開', '現地法人', 'ローカライズ', '現地化', '越境',
      'global rollout', 'global template', 'multi-country', 'multinational', 'localization', 'localisation', 'cross-border',
    ],
    keywords: ['多国', '各国', '多言語', '時差', 'countries', 'subsidiary'],
    diagnosis: {
      ja: 'グローバル展開の論点は「どこまで統一し、どこから現地に任せるか」の線を、業務単位ではなくデータ単位で引けるかどうか。統一か現地裁量かの判断を各国との個別交渉に委ねると、必ず全部が例外になる。共通とする範囲(コード体系、勘定科目、顧客・商品マスタ)を原則として先に固定し、それ以外を現地に開放する。',
      en: 'The question in a global rollout is where to standardize and where to let local units decide — and that line has to be drawn per data entity, not per business area. Leave it to country-by-country negotiation and everything becomes an exception. Fix the globally common scope first as a principle — code systems, chart of accounts, customer and product master — and open everything else to local choice.',
    },
    phaseIds: ['a', 'b', 'c', 'e', 'f'],
    techniqueIds: ['capability-based-planning', 'gap-analysis', 'stakeholder-management', 'architecture-governance'],
    deliverableIds: ['architecture-principles', 'business-capability-map', 'organizational-model', 'architecture-roadmap', 'transition-architecture'],
    actions: [
      { ja: '「グローバル共通」とする範囲をデータエンティティ単位で確定し、原則として文書化する。', en: 'Fix the globally common scope entity by entity and write it down as a principle.' },
      { ja: '各国の法規制・税制・言語・通貨・法定帳票の要件を制約として洗い出し、テンプレートの変更可能箇所を限定する。', en: 'List each country\'s legal, tax, language, currency, and statutory-reporting requirements as constraints, and bound where the template may be varied.' },
      { ja: '展開順序は「簡単な国」ではなく「学びが多い国」で決める。1 か国目でテンプレートを固める。', en: 'Sequence the rollout by where you will learn most, not by where it is easiest, and harden the template on the first country.' },
      { ja: '現地の例外要求は、承認者と期限を付けて受理する仕組みにする。恒久例外を作らない。', en: 'Accept local exceptions only through a route with a named approver and an expiry date. Do not create permanent exceptions.' },
      { ja: '本社と現地の役割分担(要件決定、運用、費用負担)を組織モデルに明記する。', en: 'Write the split of responsibilities between headquarters and local units — requirements, operations, funding — into the organizational model.' },
    ],
    questions: [
      { ja: '各国が独自に決めてよい範囲は、どこまでと定義されていますか?', en: 'What exactly is each country allowed to decide for itself?' },
      { ja: '現地法人がテンプレートを拒否した場合、最終決定権は本社にありますか?', en: 'If a local entity rejects the template, does headquarters hold the final say?' },
      { ja: '展開費用と展開後の運用費用は、本社負担ですか、現地負担ですか?', en: 'Who funds the rollout and the ongoing run cost — headquarters or the local entity?' },
      { ja: '各国の規制要件を確認済みの担当者は誰ですか。未確認の国はどこですか?', en: 'Who has verified the regulatory requirements per country, and which countries remain unverified?' },
    ],
  },
  {
    id: 'carve-out-separation',
    name: { ja: '事業売却・カーブアウトに伴うシステム分離', en: 'Divestment and Carve-out Separation' },
    strongKeywords: [
      '事業売却', '事業譲渡', '切り出し', 'システム分離', 'スピンオフ', 'カーブアウト', '譲渡先', '分社',
      'divestment', 'divestiture', 'spin-off', 'spinoff', 'disentanglement', 'carve-out', 'carve out', 'carveout', 'carving out', 'transition service',
    ],
    keywords: ['売却', '分離', '持株会社', 'separation'],
    diagnosis: {
      ja: '分離は統合の逆ではなく、統合より難しい。期限が契約で固定され、共有していた基盤・ライセンス・共通マスタを「切る」判断を短期間で下さなければならないため。移行サービス契約(TSA)の期間だけが実質的な猶予であり、その期間内に切り離せない依存関係を最初に特定できるかどうかで勝負が決まる。',
      en: 'Separation is not the inverse of integration; it is harder. The deadline is fixed by contract, and decisions to cut shared platforms, licences, and common master data must be made in a short window. The transition service agreement is the only real grace period, so the outcome turns on identifying, first, the dependencies you cannot sever inside it.',
    },
    phaseIds: ['a', 'b', 'c', 'e', 'f'],
    techniqueIds: ['gap-analysis', 'migration-planning-techniques', 'risk-management', 'interoperability-requirements'],
    deliverableIds: ['application-portfolio-catalog', 'data-entity-catalog', 'architecture-roadmap', 'transition-architecture', 'implementation-migration-plan', 'architecture-contract'],
    actions: [
      { ja: '対象事業が依存しているシステム・データ・契約・要員を 1 枚に洗い出す。共有部分が分離コストの本体。', en: 'Map every system, data set, contract, and person the departing business depends on. The shared portions are where the separation cost lives.' },
      { ja: 'TSA の期間と対象範囲を、分離作業の積み上げ見積もりから逆算して設定する。ディールの日程に合わせて決めない。', en: 'Set the duration and scope of the transition service agreement from a bottom-up estimate of the separation work, not from the deal timetable.' },
      { ja: '共通マスタを割る際、正本をどちらの会社が持つかをエンティティごとに決める。', en: 'For each shared master data entity, decide which company keeps the system of record.' },
      { ja: 'ライセンス・保守契約の譲渡可否をベンダーごとに確認する。譲渡不可のものは再調達コストとして早期に計上する。', en: 'Check per vendor whether licences and support contracts can be transferred. Where they cannot, book the re-procurement cost early.' },
      { ja: '残る側(売却しない側)の運用に穴が開かないかを確認する。出ていく側だけを見ると本体が壊れる。', en: 'Verify the remaining business is not left with holes. Looking only at the departing side breaks the parent.' },
    ],
    questions: [
      { ja: '分離の完了期限は契約上いつですか。延長できますか、その場合の費用は誰が負担しますか?', en: 'What is the contractual separation deadline, can it be extended, and who pays if it is?' },
      { ja: '対象事業と本体が共有しているシステムのうち、単純に複製できないものはどれですか?', en: 'Which of the systems shared between the departing business and the parent cannot simply be cloned?' },
      { ja: '分離後に対象事業を運用する要員は、買い手側にいますか、こちらから移りますか?', en: 'After separation, do the people who will operate those systems come from the buyer, or transfer from you?' },
      { ja: '個人情報を含むデータの引き渡しは、法務上どの範囲まで認められていますか?', en: 'Legally, how much of the data containing personal information may be handed over?' },
    ],
  },
  {
    id: 'sustainability-esg',
    name: { ja: 'サステナビリティ・ESG 対応', en: 'Sustainability and ESG' },
    strongKeywords: [
      'esg', 'サステナビリティ', 'サステナブル', '脱炭素', '温室効果ガス', '排出量', 'sdgs',
      'co2', 'sustainability', 'emissions', 'net zero', 'green it',
    ],
    keywords: ['カーボン', '環境負荷', '省エネ', 'グリーン', 'carbon'],
    diagnosis: {
      ja: 'ESG 対応の相談は環境活動の話に見えて、実務上は開示のためのデータ収集・算定・監査証跡の問題、つまりデータアーキテクチャの課題。報告のたびに手作業で集計している限り、開示範囲が広がった時点で破綻する。算定ロジックとデータの出所を最初から仕組みに載せる。',
      en: 'ESG work looks like an environmental programme but in practice it is a disclosure problem — collecting the data, computing the figures, and leaving an audit trail. That makes it a data architecture problem. As long as every report is assembled by hand, the process collapses the moment the disclosure scope widens. Put the calculation logic and the data lineage into the system from the start.',
    },
    phaseIds: ['preliminary', 'a', 'b', 'c', 'g'],
    techniqueIds: ['architecture-principles-technique', 'capability-based-planning', 'gap-analysis', 'architecture-governance'],
    deliverableIds: ['architecture-principles', 'data-entity-catalog', 'architecture-requirements-spec', 'business-capability-map', 'compliance-assessment'],
    actions: [
      { ja: '適用される開示制度と最初の報告期日を特定し、必要なデータ項目を逆算する。取れるデータから始めない。', en: 'Identify which disclosure regime applies and when the first report is due, then derive the required data items backwards. Do not start from the data you happen to have.' },
      { ja: '算定に使うデータの出所と正本をデータエンティティカタログに登録する。手集計の表計算ファイルを正本にしない。', en: 'Register the source and system of record for the data behind each figure in the data entity catalog. A hand-built spreadsheet must not be the system of record.' },
      { ja: '算定ロジックとその変更履歴を残す。第三者保証の段階で、過去の数値を再計算できないことが指摘される。', en: 'Retain the calculation logic and its change history. When third-party assurance arrives, the inability to recompute past figures is what gets flagged.' },
      { ja: 'サプライチェーン由来のデータは取引先からの提供に依存する。取得経路と精度の限界を先に文書化する。', en: 'Supply-chain data depends on what suppliers provide. Document the collection route and the accuracy limits up front.' },
      { ja: 'IT 自体の消費電力と機器更新サイクルを技術標準に組み込み、調達基準に反映する。', en: 'Fold IT\'s own energy consumption and hardware refresh cycles into the technology standards and the procurement criteria.' },
    ],
    questions: [
      { ja: '開示が義務付けられる制度はどれで、最初の報告期日はいつですか?', en: 'Which disclosure regime applies to you, and when is the first report due?' },
      { ja: '現在の集計は誰が何日かけて行っていますか。その作業は開示範囲が倍になっても回りますか?', en: 'Who compiles the figures today and over how many days, and would that hold if the scope doubled?' },
      { ja: '数値の正確性について、最終的に署名するのは誰ですか?', en: 'Who ultimately signs off on the accuracy of the numbers?' },
      { ja: '取引先から提供されるデータの精度を、どの程度検証していますか?', en: 'To what extent do you verify the accuracy of the data suppliers provide?' },
    ],
  },
  {
    id: 'technical-debt',
    name: { ja: '技術的負債の可視化と返済計画', en: 'Making Technical Debt Visible and Payable' },
    strongKeywords: [
      '技術的負債', '技術負債', '継ぎ足し', 'スパゲッティ', '改修が難し', '設計書がない', '手を入れられな',
      'technical debt', 'tech debt', 'code rot',
    ],
    keywords: ['負債', '保守性', 'リファクタ', 'refactoring', 'maintainability'],
    diagnosis: {
      ja: '技術的負債は「IT 側の言い分」として扱われる限り予算が付かない。返済計画を通すには、負債を技術用語ではなく事業側が読める単位 — 変更にかかる日数、障害件数、サポート切れによる強制コスト — に翻訳する必要がある。アプリケーションポートフォリオの技術的健全性軸として定量化し、事業価値と並べて初めて投資判断の対象になる。',
      en: 'Technical debt gets no budget as long as it is presented as IT\'s complaint. To get a repayment plan approved, translate it out of technical vocabulary into units the business reads: days per change, incident counts, forced spend from expiring support. Quantify it as the technical-health axis of the application portfolio; only alongside business value does it become an investment decision.',
    },
    phaseIds: ['c', 'd', 'e', 'f', 'h'],
    techniqueIds: ['gap-analysis', 'risk-management', 'migration-planning-techniques', 'architecture-governance'],
    deliverableIds: ['application-portfolio-catalog', 'technology-standards-catalog', 'architecture-roadmap', 'implementation-migration-plan', 'architecture-repository'],
    actions: [
      { ja: '負債を「変更リードタイム」「障害件数」「サポート期限」の 3 指標で定量化する。感覚的な訴えには予算が付かない。', en: 'Quantify debt with three measures: change lead time, incident count, and support end date. Sentiment does not get funded.' },
      { ja: 'アプリケーションごとに技術的健全性を採点し、事業価値と並べた 2 軸マップに載せる。', en: 'Score technical health per application and plot it against business value.' },
      { ja: '返済を単独案件にせず、同じ領域に触れる事業案件に抱き合わせる。単独の負債返済案件は毎回後回しにされる。', en: 'Do not fund repayment as a standalone project; attach it to business initiatives that touch the same area. Standalone debt projects are deferred every cycle.' },
      { ja: '新たな負債を増やさない条件をアーキテクチャ契約と受入基準に入れる。既存の返済より流入の抑止が先。', en: 'Put conditions that prevent new debt into the Architecture Contract and the acceptance criteria. Stopping the inflow comes before repaying the stock.' },
      { ja: '「返済しない」判断も記録に残す。廃止予定のシステムに手を入れるのは損失。', en: 'Record the decisions not to repay as well. Investing in a system you plan to retire is a loss.' },
    ],
    questions: [
      { ja: '同じ規模の改修を行うとき、健全なシステムと問題のあるシステムで工数は何倍違いますか?', en: 'For a change of the same size, how many times more effort does the troubled system take than a healthy one?' },
      { ja: 'サポートが切れている、または 2 年以内に切れる製品を使っているシステムは何件ありますか?', en: 'How many systems run on products whose support has ended, or ends within two years?' },
      { ja: '技術的負債の返済に予算を付ける権限は誰にありますか?', en: 'Who has the authority to fund debt repayment?' },
      { ja: '負債が最も集中している領域は、今後 3 年の事業計画で重要ですか、それとも縮小しますか?', en: 'Is the area where debt is most concentrated important in the next three years of the business plan, or shrinking?' },
    ],
  },
  {
    id: 'business-continuity',
    name: { ja: 'BCP・災害対策・可用性設計', en: 'Business Continuity, Disaster Recovery, and Availability' },
    strongKeywords: [
      'bcp', '事業継続', '災害', '被災', '冗長', 'ディザスタリカバリ', '二重化', '停止時間',
      'rto', 'rpo', 'business continuity', 'disaster recovery', 'failover', 'high availability',
    ],
    keywords: ['可用性', '復旧', 'バックアップ', 'resilience', 'outage'],
    diagnosis: {
      ja: 'BCP の相談は「どこまで冗長化するか」の技術論として持ち込まれるが、決めるべきは業務側の許容停止時間と許容データ損失量。これを業務ごとに数値で合意しないまま設計すると、全システムを最高水準で守る過剰投資か、優先順位のない机上の計画のどちらかになる。復旧目標は業務が決め、実現手段を IT が設計する。',
      en: 'Continuity arrives as a technical question about how much redundancy to buy, but what must be settled is the tolerable downtime and tolerable data loss on the business side. Design without agreeing those numbers per process and you get either over-investment protecting everything to the highest tier, or a paper plan with no priorities. The business sets the recovery targets; IT designs how to meet them.',
    },
    phaseIds: ['b', 'c', 'd', 'f', 'g'],
    techniqueIds: ['risk-management', 'gap-analysis', 'architecture-governance', 'interoperability-requirements'],
    deliverableIds: ['architecture-requirements-spec', 'architecture-definition-document', 'technology-standards-catalog', 'implementation-migration-plan', 'architecture-contract'],
    actions: [
      { ja: '業務プロセスごとに許容停止時間と許容データ損失量を数値で合意し、要件仕様に ID 付きで登録する。', en: 'Agree tolerable downtime and tolerable data loss per business process as numbers, and register them as identified requirements.' },
      { ja: '復旧の優先順位は業務側に決めさせる。「全部が最優先」という回答は差し戻す。', en: 'Make the business set the recovery order, and send back the answer that everything is top priority.' },
      { ja: '復旧手順を通しで実行する演習を年 1 回以上行う。手順書があることは復旧できることを意味しない。', en: 'Rehearse recovery end to end at least once a year. Having a procedure document does not mean you can recover.' },
      { ja: '業務が依存する外部サービス・委託先の可用性も対象に含める。自社設備だけ守っても業務は止まる。', en: 'Include the availability of the external services and suppliers each process depends on. Protecting only your own facilities still leaves the business stopped.' },
      { ja: '可用性の水準を技術標準の階層(ティア)として定義し、案件ごとの個別交渉をやめる。', en: 'Define availability levels as tiers in the technology standards and stop negotiating them project by project.' },
    ],
    questions: [
      { ja: '主要な業務プロセスは、それぞれ何時間止まると事業に実害が出ますか?', en: 'For each major business process, how many hours of downtime causes real damage?' },
      { ja: '復旧手順を通しで試したのは直近でいつですか。結果はどうでしたか?', en: 'When did you last rehearse recovery end to end, and what happened?' },
      { ja: 'データを何分前の状態まで戻せれば業務を再開できますか。その前提は業務側と合意済みですか?', en: 'How far back can data be rolled and still let the business restart, and has the business agreed that assumption?' },
      { ja: '依存している外部サービスが丸 1 日停止した場合、代替手段はありますか?', en: 'If an external service you depend on is down for a full day, is there an alternative?' },
    ],
  },
  {
    id: 'over-standardization',
    name: { ja: '標準化と現場裁量のバランス', en: 'Balancing Standardization Against Local Autonomy' },
    strongKeywords: [
      '過剰', '縛り', '硬直', '一律', '画一', '足かせ', '融通が利かない', '窮屈', '重すぎ',
      'over-standardization', 'bureaucracy', 'red tape', 'one size fits all', 'ivory tower',
    ],
    keywords: ['標準化', '自由度', 'rigid', 'autonomy'],
    diagnosis: {
      ja: '統制が強すぎるという相談の実体は、標準の量ではなく「標準ごとの適用範囲が宣言されていない」こと。全社一律に適用しているから、事業特性の違う領域で摩擦が起きる。標準ごとに適用範囲(全社必須 / 推奨 / 領域限定)と逸脱してよい条件を明示すれば、数を減らさずに摩擦は下がる。',
      en: 'When people say the controls are too tight, the problem is rarely how many standards there are; it is that no standard states where it applies. Applied uniformly across the enterprise, they grate in areas with different business characteristics. Declare per standard where it is mandatory, where it is advisory, and on what conditions deviation is legitimate, and friction drops without cutting the count.',
    },
    phaseIds: ['preliminary', 'b', 'g', 'h'],
    techniqueIds: ['architecture-principles-technique', 'architecture-governance', 'architecture-maturity', 'stakeholder-management'],
    deliverableIds: ['architecture-principles', 'tailored-framework', 'technology-standards-catalog', 'organizational-model', 'compliance-assessment'],
    actions: [
      { ja: '標準ごとに適用範囲を宣言する(全社必須 / 推奨 / 特定領域のみ)。一律適用をやめる。', en: 'Declare the scope of each standard — enterprise-mandatory, advisory, or domain-specific — and stop applying everything everywhere.' },
      { ja: '必須にする標準を、相互接続性・セキュリティ・法規制に関わるものに絞る。それ以外は推奨に落とす。', en: 'Reserve mandatory status for standards touching interoperability, security, and regulation, and downgrade the rest to advisory.' },
      { ja: 'レビューの重さを案件のリスクに応じて変える。小規模・低リスク案件には簡易経路を用意する。', en: 'Scale review weight to project risk, with a light path for small, low-risk work.' },
      { ja: '標準の見直し周期を決め、期限内に見直されない標準は自動的に推奨へ降格させる。', en: 'Set a review cycle, and automatically demote any standard not reviewed within it to advisory.' },
      { ja: '標準に従った案件の所要日数を計測し、本当に遅くなっているのかを事実で確認する。', en: 'Measure elapsed time on projects that followed the standards and establish factually whether compliance actually slows delivery.' },
    ],
    questions: [
      { ja: '現在の標準のうち、全社必須にすべきものは何件ありますか。残りは推奨に落とせますか?', en: 'How many of your current standards genuinely need to be mandatory enterprise-wide, and can the rest become advisory?' },
      { ja: '標準が邪魔だと言っている部門は、具体的にどの標準のどの条項を指していますか?', en: 'The units complaining about the standards — which clause of which standard do they actually mean?' },
      { ja: '小規模な案件向けの簡易なレビュー経路はありますか?', en: 'Is there a lightweight review path for small projects?' },
      { ja: '標準を作った担当者は、その標準に従って実装した経験がありますか?', en: 'Have the people who wrote the standards ever implemented under them?' },
    ],
  },
  {
    id: 'ea-value-communication',
    name: { ja: 'EA の価値が経営に伝わらない', en: 'Explaining the Value of Architecture to Executives' },
    strongKeywords: [
      '価値が伝わ', '評価されない', '経営に説明', '役員に説明', '予算が付かない', '予算を取れ', '存在意義', '成果が見えない', '効果測定', '投資対効果',
      'business case', 'demonstrate value', 'value of architecture', 'see the value', 'executive sponsorship',
    ],
    keywords: ['roi', 'kpi', 'buy-in', 'justify'],
    diagnosis: {
      ja: '価値が伝わらない原因は説明の巧拙ではなく、経営が見ている指標と EA の成果物が接続されていないこと。成果物の点数や網羅率を報告している限り評価はされない。報告単位を「回避したコスト」「短縮した意思決定日数」「取り下げた重複投資」に変え、経営会議で既に読まれている資料の中に差し込む。',
      en: 'Architecture fails to land not because the pitch is poor but because its outputs are not connected to the measures executives already watch. Reporting deliverable counts or coverage percentages earns nothing. Change the unit of reporting to cost avoided, decision days saved, and duplicate investment withdrawn — and place it inside the papers the executive meeting already reads.',
    },
    phaseIds: ['preliminary', 'a', 'g', 'h'],
    techniqueIds: ['stakeholder-management', 'architecture-maturity', 'architecture-governance', 'capability-based-planning'],
    deliverableIds: ['architecture-vision', 'statement-of-architecture-work', 'stakeholder-map', 'communications-plan', 'architecture-repository'],
    actions: [
      { ja: '報告単位を成果物の数から「回避したコスト」「短縮した意思決定日数」「取り下げた重複投資」に変える。', en: 'Shift the reporting unit from deliverables produced to cost avoided, decision days saved, and duplicate investment withdrawn.' },
      { ja: '効果は案件ごとにその場で記録する。事後にまとめて算出しようとしても数字は作れない。', en: 'Record the benefit case by case, as it happens. Reconstructing the numbers afterwards does not work.' },
      { ja: 'EA 専用の報告会を作らない。投資委員会や経営会議の既存資料に 1 ページ差し込む。', en: 'Do not create an architecture-only review. Insert one page into the papers the investment committee or executive meeting already sees.' },
      { ja: '経営が今期繰り返し取り上げている論点を 3 つ特定し、EA の活動をその 3 つに紐付け直す。', en: 'Identify the three issues the executives keep returning to this period and re-anchor the architecture work onto them.' },
      { ja: '効果を語る役を事業部門の責任者に渡す。IT が自ら成果を主張するより、受益者に語らせる方が通る。', en: 'Hand the telling of the result to the business leader who benefited. A claim by IT about its own value carries less weight than one from the beneficiary.' },
    ],
    questions: [
      { ja: '経営会議で今期繰り返し取り上げられている論点は何ですか?', en: 'Which issues keep coming back at the executive meeting this period?' },
      { ja: 'EA 活動の効果を、金額または日数で示した実績はありますか?', en: 'Have you ever expressed the effect of the architecture work in money or in days?' },
      { ja: 'EA の予算を承認している人は、直近でどの成果を見ましたか?', en: 'The person who approves the architecture budget — which result did they most recently see?' },
      { ja: 'あなたの活動で助かった事業部門の責任者は誰ですか。その人は証言してくれますか?', en: 'Which business leader has been helped by your work, and would they say so on the record?' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 状況の読み取り / Reading the situation itself
//
// ルールのキーワード一致だけでは「同じ話題なら誰にでも同じ助言」になる。
// 予算ゼロの相談者に予算潤沢向けの助言を返すのは有害なので、
// (1) 打ち消されている話題を落とし、(2) 制約条件を本文から拾い、
// (3) 出す項目を状況との関連で並べ替える、という 3 段の処理をここに置く。
// ---------------------------------------------------------------------------

/** 状況を分類する軸 / The axis a detected condition belongs to. */
export type SituationAxis =
  | 'budget'
  | 'time'
  | 'sponsorship'
  | 'capacity'
  | 'assets'
  | 'authority'
  | 'climate'
  | 'regulation';

/** 読み取れる状況条件の ID / Identifier of a detectable situational condition. */
export type SituationConditionId =
  | 'budget-none'
  | 'budget-tight'
  | 'budget-ample'
  | 'deadline-urgent'
  | 'deadline-fixed'
  | 'deadline-none'
  | 'sponsor-committed'
  | 'sponsor-absent'
  | 'team-solo'
  | 'team-dedicated'
  | 'assets-none'
  | 'assets-available'
  | 'authority-none'
  | 'field-resistance'
  | 'regulated';

/**
 * 言い換えを拾うための共起パターン / Co-occurrence pattern for paraphrases.
 *
 * 定型句の literal だけを並べると、能動・受動や語尾を変えただけで一致が消える
 * (「経営の関与は薄い」は当たるのに「経営層はほとんど関心を示していない」は外れる)。
 * そこで「誰の話か(subject)」「何の話か(topic)」「否定・弱さ(negative)」の 3 つが
 * 同じ節の中で近くに揃ったときだけ成立させる。
 *
 * topic の近くに `positive` の語があるときは成立させない。
 * 「経営の関与は強いが予算がない」のような文で誤検出しないための歯止め。
 */
export interface CuePattern {
  /** 誰・何についての話か(節内のどこかにあればよい) */
  subject: string[];
  /** 話題の語。この語の周辺だけを見る */
  topic: string[];
  /** 否定・弱さを示す語。topic の周辺にあれば成立 */
  negative: string[];
  /** topic の周辺にあれば成立させない語(肯定が勝つ) */
  positive?: string[];
}

/**
 * 状況条件 1 件 / One situational condition that changes what advice is useful.
 *
 * `favor` / `avoid` は、ルールが持つアクション・質問を並べ替えるための語。
 * 位置で切るのをやめ、条件に合う項目を上に出すために使う。
 */
export interface SituationCondition {
  id: SituationConditionId;
  axis: SituationAxis;
  /** 同じ軸で複数当たったときの優先度(大きいほど優先。困っている側を優先する) */
  priority: number;
  label: Bilingual;
  /** 検出語。日本語は部分一致、英語は小文字で部分一致 */
  cues: string[];
  /** 定型句から外れた言い方を拾う共起パターン(任意) */
  patterns?: CuePattern[];
  /** この条件があると助言がどう変わるか(見立ての補足として出す) */
  implication: Bilingual;
  /** この条件のときに効く具体行動 */
  actions: Bilingual[];
  /** この条件のときに確認すべきこと */
  questions: Bilingual[];
  /** ルール側の項目を選ぶときに優先する語 */
  favor: string[];
  /** ルール側の項目を選ぶときに後ろへ送る語 */
  avoid: string[];
}

/** 軸の表示名 / Human-readable axis labels. */
export const SITUATION_AXIS_LABELS: Record<SituationAxis, Bilingual> = {
  budget: { ja: '予算', en: 'Budget' },
  time: { ja: '期限', en: 'Time' },
  sponsorship: { ja: '経営の関与', en: 'Sponsorship' },
  capacity: { ja: '体制', en: 'Capacity' },
  assets: { ja: '既存資料', en: 'Existing material' },
  authority: { ja: '決定権', en: 'Decision rights' },
  climate: { ja: '現場の空気', en: 'Ground-level climate' },
  regulation: { ja: '規制', en: 'Regulation' },
};

export const SITUATION_CONDITIONS: SituationCondition[] = [
  {
    id: 'budget-none',
    axis: 'budget',
    priority: 3,
    label: { ja: '予算が無い', en: 'No budget' },
    cues: [
      '予算はゼロ', '予算ゼロ', '予算がない', '予算が無い', '予算はない', '予算は無い',
      '予算がつかない', '予算が付かない', '予算はつかない', '金がない', '金は出ない',
      '費用は出ない', '費用が出ない', '手弁当', '投資はできない', '身銭',
      'no budget', 'zero budget', 'without budget', 'unfunded', 'no funding', 'no money',
    ],
    // 「予算はほとんど付いていない」のように、literal から少し外れた言い方を拾う。
    // positive の語がそばにあるとき(確保できている・これから決まる)は成立させない。
    patterns: [
      {
        subject: ['予算', '資金', '原資', '投資枠', 'budget', 'funding'],
        topic: ['予算', '資金', '原資', '投資枠', 'budget', 'funding'],
        negative: [
          'ない', '無い', 'なく', '無く', 'ませ', 'つかな', '付かな', '出ない', '取れな',
          'ゼロ', '皆無', 'ほとんど', 'まったく', '全く',
          'no ', 'not ', 'zero', 'without', 'unfunded',
        ],
        positive: [
          '確保されている', '確保できている', '確保している', '確保済', '付いている', 'ついている',
          '潤沢', '十分にある', '決ま', 'これから', '検討中', '要求中', '申請中',
          'secured', 'approved', 'available',
        ],
      },
    ],
    implication: {
      ja: '予算がゼロなら、最初の仕事は設計ではなく「次の予算を取りに行くための 1 枚」を作ること。金を前提にした施策は全部後ろに送り、手元の情報だけで作れて意思決定者に見せられるものから始める。',
      en: 'With no budget, the first job is not design but producing the single page that wins the next budget. Push everything that assumes spend to the back and start with what you can build from information already in hand and show to a decision maker.',
    },
    actions: [
      { ja: '対象を 1 業務・1 データに固定し、そこだけを「現状 / あるべき / 差分」の 3 段で 1 枚にまとめる。全社を描こうとした時点で予算も時間も足りなくなる。', en: 'Fix the scope to one business process and one data set, and put just that on a single page as current state, target state, and gap. The moment you try to draw the whole enterprise, neither budget nor time is enough.' },
      { ja: 'その 1 枚に金額を 1 つだけ載せる。今かかっている手作業の人件費か、直近の障害の実損。予算要求は「これから使う額」ではなく「今失っている額」から始まる。', en: 'Put exactly one number on that page: the labour cost of the manual work today, or the real loss from the last incident. A budget request starts from what you are losing now, not from what you want to spend.' },
      { ja: '金が要らない範囲(既存資料の棚卸し、関係者への聞き取り、決めごとの明文化)と、金が要る範囲を線引きして示す。線を引かないと「予算が無いから何もできない」で止まる。', en: 'Draw the line between what costs nothing — inventorying existing material, interviewing people, writing down decisions — and what needs money. Without that line the work stalls at "no budget, so nothing is possible".' },
    ],
    questions: [
      { ja: '次に予算を検討する場はいつで、そこに載せるには何がいつまでに要りますか?', en: 'When is the next budget round, and what has to exist by when to be considered in it?' },
      { ja: '今この状態を放置していることで、毎月いくら、または何人日が失われていますか?', en: 'What is the current situation costing per month, in money or in person-days?' },
    ],
    favor: ['絞', '1 枚', '小さ', '棚卸', '既存', 'まず', '優先', '止め', '捨て', 'narrow', 'one page', 'smallest', 'existing', 'stop', 'first'],
    avoid: ['調達', '外部', 'ベンダー', '投資', '二重運用', '演習', '専任', 'procure', 'vendor', 'invest', 'dual running', 'dedicated', 'rehears'],
  },
  {
    id: 'budget-tight',
    axis: 'budget',
    priority: 2,
    label: { ja: '予算が限られる', en: 'Limited budget' },
    cues: [
      '予算が限ら', '予算は限ら', '限られた予算', '予算が少', '予算は少', '低予算',
      '予算削減', 'コスト削減の圧力', '緊縮', '厳しい予算', '予算の制約',
      'tight budget', 'limited budget', 'shoestring', 'budget pressure', 'cost pressure',
    ],
    implication: {
      ja: '使える金が限られるときは、やる内容よりやる順番が結果を決める。効果が最初に出るものを先に置き、その効果を次の原資として説明できる形にしておく。',
      en: 'When money is limited, sequence matters more than content. Put what pays back first at the front, and frame that payback so it can fund the next step.',
    },
    actions: [
      { ja: '候補を効果が出る順に並べ替え、最初の 1 件で回収した分を次の原資にする筋書きを作る。同時に 3 件走らせない。', en: 'Order the candidates by how soon they pay back and write the story where the first one funds the second. Do not run three at once.' },
      { ja: '「やらないこと」を先に決めて合意しておく。予算が限られる案件は、断る基準が無いと必ず範囲が膨らむ。', en: 'Decide and agree what you will not do, first. Without an explicit basis for refusal, a constrained initiative always creeps.' },
    ],
    questions: [
      { ja: '今期この件に使える上限額はいくらですか。その枠は誰が持っていますか?', en: 'What is the ceiling for this work this period, and whose budget holds it?' },
      { ja: 'その枠内で 1 件だけやるとしたら、事業側はどれを選びますか?', en: 'If only one item fits inside that ceiling, which one does the business choose?' },
    ],
    favor: ['絞', '順', '優先', '段階', 'まず', '効果', 'prioriti', 'phased', 'first', 'benefit'],
    avoid: ['一括', '全社一斉', '網羅', 'big-bang', 'enterprise-wide', 'exhaustive'],
  },
  {
    id: 'budget-ample',
    axis: 'budget',
    priority: 1,
    label: { ja: '予算は確保されている', en: 'Budget is secured' },
    cues: [
      '予算は潤沢', '予算が潤沢', '潤沢', '予算は十分', '予算が十分', '予算は確保', '予算が確保',
      '資金は十分', '投資枠', '金はある', '予算面の制約はな',
      'ample budget', 'well funded', 'well-funded', 'budget is secured', 'funding is in place', 'plenty of budget',
    ],
    implication: {
      ja: '金で買えるのは時間と人手だけで、決定の速度は買えない。予算があるうちにやるべきなのは、外注の拡大ではなく「後で通らなくなる決定」を先に通しておくこと。',
      en: 'Money buys time and hands, never decision speed. What the funded period is for is not more outsourcing but pushing through the decisions that will not pass later.',
    },
    actions: [
      { ja: '並行できる作業(現状調査、データの棚卸し、移行方式の比較検証)に先に人を投入する。ただし決定そのものは外に出さない。外注できるのは調査までで、判断は自分たちが持つ。', en: 'Put people onto the work that can run in parallel — current-state survey, data inventory, comparative trials of migration approaches — but keep the decisions in-house. You can outsource investigation, not judgement.' },
      { ja: '予算がある時期にこそ、廃止・統合・標準の強制といった「減らす決定」を通す。金があるうちは代替手段を用意できるので通り、無くなると誰も飲まない。', en: 'Use the funded window for the subtractive decisions — retirement, consolidation, mandated standards. They pass while you can still fund an alternative, and stop passing once you cannot.' },
      { ja: '検証(PoC)には合格条件と打ち切り条件を先に書く。予算があると検証が終わらなくなる。', en: 'Write the pass and stop criteria for any proof of concept before it starts. Well-funded trials never end on their own.' },
    ],
    questions: [
      { ja: 'この予算はいつまで有効で、使い切れなかった分は翌期に繰り越せますか?', en: 'How long is this budget valid, and does unspent money carry to the next period?' },
      { ja: 'その予算を出した側は、いつまでに何が出てくる前提で承認しましたか?', en: 'The people who approved it — what did they assume would exist by when?' },
    ],
    favor: ['並行', '検証', '比較', '外部', '専任', '演習', '投資', 'parallel', 'trial', 'pilot', 'compare', 'dedicated', 'rehears'],
    avoid: ['無償', '手弁当', 'free of charge'],
  },
  {
    id: 'deadline-urgent',
    axis: 'time',
    priority: 3,
    label: { ja: '期限が逼迫している', en: 'Deadline is tight' },
    cues: [
      '至急', '大至急', '間に合わ', '時間がない', '時間が無い', '逼迫', 'ひっ迫', '待ったなし',
      '火消し', '炎上', '今月中', '来月まで', '今期中', '残された時間', '残り期間', '遅れて',
      'urgent', 'asap', 'running out of time', 'behind schedule', 'slipping', 'firefighting',
    ],
    implication: {
      ja: '時間が無い状態で全部を順番にやると必ず落ちる。決める対象を絞り、並行できるものは並行させ、後戻りできる決定は仮決めして先に進む。',
      en: 'Doing everything in sequence under time pressure guarantees something is dropped. Narrow what must be decided, parallelise what can run together, and provisionally settle anything that is reversible so the work keeps moving.',
    },
    actions: [
      { ja: '今週決めないと後段が止まる決定を 3 つだけ選び、それ以外の決定には日付を付けて後ろに送る。全部を今決めようとしない。', en: 'Pick the three decisions that block everything downstream this week and give every other decision a later date. Do not try to settle them all now.' },
      { ja: '調査に期限を切る。期限が来たら分かっている範囲で決め、決めた前提を文書に明記して進む。「完全に分かってから」は間に合わない。', en: 'Time-box the investigation. When the box closes, decide on what you know and write the assumptions down. "Once we fully understand it" does not arrive in time.' },
      { ja: '後戻りできる決定と、できない決定を分ける。後戻りできる方は今すぐ仮決めして着手し、できない方に議論の時間を集中させる。', en: 'Separate reversible from irreversible decisions. Provisionally settle the reversible ones today and spend the argument time on the ones you cannot undo.' },
    ],
    questions: [
      { ja: '動かせない日付は何で、それは何によって決まっていますか(契約 / 法規制 / 経営の対外公約)?', en: 'Which date cannot move, and what fixes it — a contract, a regulation, or a public commitment?' },
      { ja: '間に合わない場合、範囲・品質・日付のどれを削る判断になりますか。決めるのは誰ですか?', en: 'If you cannot make it, which gives — scope, quality, or the date? And who decides that?' },
    ],
    favor: ['期限', '並行', '先に', 'まず', '絞', '優先', '仮決め', '日数', 'time-box', 'parallel', 'first', 'deadline'],
    avoid: ['網羅', '完全', '全社一斉', '成熟度', 'exhaustive', 'comprehensive', 'maturity'],
  },
  {
    id: 'deadline-fixed',
    axis: 'time',
    priority: 1,
    label: { ja: '期限が決まっている', en: 'A fixed deadline exists' },
    cues: [
      '期限がある', '期限は', '期限が', '締切', '締め切り', 'デッドライン', 'までに',
      'か月', 'ヶ月', 'カ月', 'ヵ月', '年内', '来期まで', '年度内',
      'deadline', 'by the end of', 'target date', 'go-live',
    ],
    implication: {
      ja: '日付が先に決まっている案件は、日付に合わせて範囲を削る設計にしておかないと、最後に品質で帳尻を合わせることになる。中間状態を先に置いて、どこで止まっても事業が回る形にする。',
      en: 'When the date is fixed first, unless scope is designed to be cut against it, quality becomes the adjustment at the end. Define intermediate states up front so the business still runs wherever you stop.',
    },
    actions: [
      { ja: '期限から逆算して中間状態を 2〜3 個置き、各中間状態で「ここで止めても業務は回るか」を確認する。止まれない計画は期限に負ける。', en: 'Work back from the date to two or three intermediate states and check at each one that the business can run if you stop there. A plan that cannot stop loses to the date.' },
      { ja: '間に合わないときに削る範囲を、優先順位付きで先に合意しておく。当日に議論すると必ず品質が削られる。', en: 'Agree the ordered list of what gets cut if you run late, in advance. Debated on the day, it is always quality that gets cut.' },
    ],
    questions: [
      { ja: 'その期限は何によって決まっていますか。動かせる余地はありますか?', en: 'What sets that deadline, and is there any room to move it?' },
      { ja: '期限の時点で「必ず動いている必要があるもの」はどれですか。逆に後回しにできるものは?', en: 'What absolutely must be running on that date, and what can follow later?' },
    ],
    favor: ['中間', '段階', '逆算', '優先', '範囲', '移行', 'transition', 'phased', 'milestone', 'sequence'],
    avoid: ['成熟度', 'maturity'],
  },
  {
    id: 'deadline-none',
    axis: 'time',
    priority: 2,
    label: { ja: '期限が決まっていない', en: 'No deadline set' },
    cues: [
      '期限は決まっていない', '期限が決まっていない', '期限は特にな', '締切はな', 'いつまでという',
      'ゴールが曖昧', '終わりが見えない', 'no deadline', 'open-ended', 'no target date',
    ],
    implication: {
      ja: '期限の無い活動は、他の全部より後回しになる。外から期限が来ないなら、自分で区切りを作って意思決定者に日付を持たせるところから始める。',
      en: 'Work without a deadline is deprioritised against everything else. If no date comes from outside, create the boundary yourself and hand a date to the decision maker.',
    },
    actions: [
      { ja: '自分で 90 日の区切りを置き、その日に誰に何を見せるかを 1 つ決める。日付が無いと成果物が完成しない。', en: 'Set your own 90-day boundary and name one thing you will show, to one audience, on that day. Nothing gets finished without a date.' },
      { ja: '期限が無いこと自体をリスクとして記録し、意思決定者に「いつまでに判断するか」を持ち帰らせる。', en: 'Log the absence of a deadline as a risk and make the decision maker commit to when they will decide.' },
    ],
    questions: [
      { ja: 'この検討結果を最初に使う会議や意思決定はいつですか?', en: 'What is the first meeting or decision that will actually use this work, and when is it?' },
    ],
    favor: ['区切', '期限', '日付', '90 日', '3 か月', 'time-box', 'milestone'],
    avoid: [],
  },
  {
    id: 'sponsor-committed',
    axis: 'sponsorship',
    priority: 1,
    label: { ja: '経営が本気で関与している', en: 'Executives are committed' },
    cues: [
      '経営も本気', '経営は本気', '本気', '肝いり', 'トップダウン', '経営が主導', '役員が主導',
      '経営がコミット', '経営の後押し', '社長直轄', '経営から指示',
      'executive sponsor', 'board backing', 'top-down mandate', 'strong sponsorship', 'ceo is behind',
    ],
    implication: {
      ja: '経営の支持は必ず薄れる。支持があるうちにやるのは丁寧な現状分析ではなく、後で反対が出る決定(廃止、統合、標準の強制、正本の指定)を先に決裁に通すこと。',
      en: 'Executive backing always fades. What the backed period is for is not careful current-state analysis but getting the decisions that will later attract opposition — retirement, consolidation, mandated standards, naming systems of record — approved now.',
    },
    actions: [
      { ja: '反対が出そうな決定を先に洗い出し、支持がある今のうちに決裁を取る。順番を後ろにすると同じ決定が通らなくなる。', en: 'List the decisions likely to attract opposition and get them approved while the backing lasts. The same decisions stop passing if you leave them until later.' },
      { ja: '決定を人ではなく文書(原則、アーキテクチャ契約、標準)に残す。支持している役員は必ず異動する。', en: 'Anchor decisions in documents — principles, the architecture contract, standards — not in a person. The sponsoring executive will move on.' },
      { ja: '経営が既に見ている資料に、この取り組みの進捗を 1 行だけ載せる。専用の報告会を作ると支持の維持コストが上がる。', en: 'Add one line about this work to the papers the executives already read. A dedicated review meeting raises the cost of keeping their attention.' },
    ],
    questions: [
      { ja: 'その経営層は、いつまでに何が見えていれば「進んでいる」と判断しますか?', en: 'By when, and seeing what, will those executives judge that this is progressing?' },
      { ja: '支持している役員が異動した場合、次に誰がこの取り組みを持ちますか?', en: 'If the sponsoring executive moves on, who owns this next?' },
    ],
    favor: ['決裁', '原則', '契約', '統廃合', '廃止', '標準', '権限', 'principle', 'contract', 'mandate', 'governance', 'retire'],
    avoid: ['説得', '味方', '関心を', 'persuade', 'build a case'],
  },
  {
    id: 'sponsor-absent',
    axis: 'sponsorship',
    priority: 2,
    label: { ja: '経営が関与していない', en: 'No executive engagement' },
    cues: [
      '経営は無関心', '無関心', '関心がない', '関心が無い', '興味を示さ', '他人事', '丸投げ',
      '現場任せ', '上が動かない', '理解がない', '理解されな', 'スポンサー不在', '経営に届いて',
      // 「薄い」「弱い」「乏しい」系。9 人が独立に試して 1 つも当たらなかった言い回し。
      '関与は薄', '関与が薄', '関与も薄', '関心は薄', '関心が薄', '関与は弱', '関与が弱',
      '関与は限定', '関与が限定', '関与に乏し', '関与が乏し', '関心は低', '関心が低',
      '当事者意識がな', '当事者意識は薄', '形式的な承認', '承認するだけ', '報告を聞くだけ',
      'スポンサーが弱', 'スポンサーは弱', '経営の後ろ盾がな', '旗振り役がいな',
      'スポンサーがいな', 'スポンサーはいな', 'スポンサーが決まって',
      'no sponsor', 'not interested', 'indifferent', 'no executive support', 'leadership is not engaged',
      'weak sponsorship', 'thin engagement', 'nominal sponsor', 'rubber stamp', 'hands off',
      'hands-off', 'little executive', 'limited executive',
    ],
    // literal を並べるだけでは語尾を変えただけで外れる。
    // 「経営層はほとんど関心を示していない」「役員は聞こうともしない」「上層部の腰が重い」を拾う。
    patterns: [
      {
        subject: [
          '経営', '役員', '上層部', '経営陣', 'トップ', '社長', '本部長', 'スポンサー', '幹部',
          'executive', 'leadership', 'board', 'sponsor', 'ceo', 'cfo', 'cio', 'senior management',
        ],
        topic: [
          '関心', '関与', '興味', '理解', '当事者意識', '後ろ盾', '支援', '旗振り', '腰',
          '聞こう', '話を聞', '出てこ', '言ってこ', '動い', '動か', 'コミット', '時間を取',
          'interest', 'engagement', 'engaged', 'involved', 'involvement', 'support', 'attention',
          'commitment', 'committed', 'sponsorship', 'backing', 'asked', 'showed up', 'shows up',
        ],
        // 「ず」「足り」のような短すぎる語は入れない(「まず」「足りている」で誤検出する)
        negative: [
          'ない', '無い', 'なく', '無く', 'ませ', 'おらず', 'られず', 'せず', 'えず',
          '薄', '弱', '低い', '低く', '乏し', '限定', 'ほとんど', 'まったく', '全く',
          'ゼロ', '皆無', '腰が重', '鈍', '消極', '形式的', '他人事', '任せきり', '丸投げ',
          '足りな', '足りず', '示さず', '見えな', '届いてい',
          'no ', 'not ', 'never', 'little', 'lack', 'weak', 'absent', 'minimal', 'nominal',
          'without', "n't", 'barely', 'hardly', 'thin ',
        ],
        // 肯定が勝つ。「経営の関与は強い」を「関与が薄い」と読まないための歯止め
        positive: [
          '強い', '厚い', '高い', '十分', '積極', '本気', '肝いり', '主導', '直轄', '後押し',
          'strong', 'high', 'active', 'committed to', 'fully engaged', 'behind it', 'top-down',
        ],
      },
    ],
    implication: {
      ja: '経営が関心を持っていない段階では、正しい計画より「関心を持たせる 1 枚」が先。網羅的な資料は読まれないので、経営が今期気にしている論点に接続したものだけを出す。',
      en: 'Before executives care, the page that makes them care matters more than the correct plan. Comprehensive material is not read; produce only what connects to the issue they are already worried about this period.',
    },
    actions: [
      { ja: '経営が今期繰り返し話題にしている問題(コスト、事故、規制、人手)を 1 つ選び、そこに接続した 1 枚だけを作る。EA の説明から入らない。', en: 'Pick one problem the executives keep returning to this period — cost, incidents, regulation, headcount — and build one page that connects to it. Do not open with an explanation of architecture.' },
      { ja: 'IT の言葉で説明しない。金額、日数、件数の 3 つだけで書く。用語を使った瞬間に「IT の話」に分類されて終わる。', en: 'Do not explain it in IT vocabulary. Use money, days, and counts only. The moment jargon appears it is filed as an IT topic and ignored.' },
      { ja: '最初の相手を経営全体にしない。実際に困っている事業部門の責任者を 1 人味方につけ、その人から言ってもらう。', en: 'Do not aim the first pitch at the whole executive team. Win one business leader who actually has the pain, and let them raise it.' },
    ],
    questions: [
      { ja: '経営会議で今期繰り返し取り上げられている問題は何ですか?', en: 'Which problems keep coming back at the executive meeting this period?' },
      { ja: 'この件で最初に味方になってくれそうな部門長は誰ですか?', en: 'Which department head is most likely to back this first?' },
    ],
    favor: ['1 枚', '金額', '日数', '件数', '味方', '経営', '伝わ', '報告', '効果', 'one page', 'money', 'days', 'executive', 'value'],
    avoid: ['決裁', '強制', '必須', '成熟度', 'mandate', 'enforce', 'maturity'],
  },
  {
    id: 'team-solo',
    axis: 'capacity',
    priority: 2,
    label: { ja: '実質ひとり体制', en: 'Effectively a team of one' },
    cues: [
      'ひとり', '一人', '1人', '1 人', '独りで', '自分だけ', '私だけ', '自分しか', '私しか', 'しかいない',
      '専任はいない', '専任がいない', '兼務', '片手間', '手が足りない', '人がいない', '人手不足',
      'alone', 'one person', 'single-handed', 'solo', 'part-time', 'no dedicated', 'short-staffed',
      'only architect', 'only one', 'just me', 'by myself', 'on my own', 'i am the only', 'no team',
    ],
    implication: {
      ja: 'ひとりで回すなら、作る資料の数ではなく「他人に作業を渡せる形」が成果を決める。全部を自分で描こうとした時点で止まる。',
      en: 'Running this alone, the result is decided by how much work you can hand to other people, not by how many documents you produce. It stalls the moment you try to draw everything yourself.',
    },
    actions: [
      { ja: '成果物を 3 つまでに絞る。最初は「現状 1 枚 / あるべき 1 枚 / 差分 1 枚」で足りる。それ以上は作っても読まれない。', en: 'Cap the deliverables at three. Current state, target state, gap — one page each — is enough to start, and more will not be read anyway.' },
      { ja: '情報収集を自分でやらない。各部門に「この表を埋めてください」という形にして渡す。空欄の表は、聞き取りより速く埋まる。', en: 'Do not gather the information yourself. Hand each department a table to fill in. An empty table comes back faster than interviews get scheduled.' },
      { ja: 'レビューの場を新設しない。既存の定例に 10 分もらう。ひとりで会議体を運営すると、そこで時間が全部消える。', en: 'Do not create a new review forum; take ten minutes in an existing standing meeting. Running a governance body single-handed consumes all the time you have.' },
    ],
    questions: [
      { ja: 'この作業に週何時間使えますか。それを承認しているのは誰ですか?', en: 'How many hours a week do you actually have for this, and who has agreed to that?' },
      { ja: '各部門で、聞けば答えてくれる担当者の名前は分かっていますか?', en: 'In each department, do you know the name of the person who will answer when asked?' },
    ],
    favor: ['絞', '1 枚', '既存', '渡', '依頼', '定例', '3 つ', 'narrow', 'existing', 'delegate', 'one page'],
    avoid: ['専任', 'チームを', '演習', '委員会', '網羅', 'dedicated team', 'board', 'rehears', 'exhaustive'],
  },
  {
    id: 'team-dedicated',
    axis: 'capacity',
    priority: 1,
    label: { ja: '専任の体制がある', en: 'A dedicated team exists' },
    cues: [
      '専任チーム', '専任が', '専任を', '専任で', '要員を確保', 'チームを確保', '体制は整',
      'dedicated team', 'full-time team', 'staffed team',
    ],
    implication: {
      ja: '人がいるときの典型的な失敗は、全員が同時に別々の資料を作り始めること。並行させる対象と、誰がどの決定に責任を持つかを先に決める。',
      en: 'The typical failure with people available is everyone starting a different document at once. Decide first what runs in parallel and who owns which decision.',
    },
    actions: [
      { ja: '同時に走らせる作業を 3 本までにし、それぞれに「いつ何が出るか」を置く。人数に比例して作業を増やさない。', en: 'Hold parallel workstreams to three, each with a stated output and date. Do not scale the number of workstreams with headcount.' },
      { ja: '役割を成果物ではなく決定単位で割る。「誰がどの決定の責任者か」が決まっていないチームは資料だけ増える。', en: 'Split roles by decision, not by document. A team without named decision owners produces documents and nothing else.' },
    ],
    questions: [
      { ja: '専任は何名で、いつまで確保されていますか?', en: 'How many people are dedicated, and until when are they committed?' },
    ],
    favor: ['並行', '分担', '役割', 'チーム', 'parallel', 'role', 'workstream'],
    avoid: [],
  },
  {
    id: 'assets-none',
    axis: 'assets',
    priority: 2,
    label: { ja: '現状の資料が無い', en: 'No current-state material' },
    cues: [
      '資料がない', '資料が無い', '設計書がない', '設計書が無い', 'ドキュメントがない', 'ドキュメントが無い',
      '一覧がない', '台帳がない', '図がない', '把握できていない', '棚卸しされていない',
      '仕様が分から', '現状が分から', '中身が分から', '誰も知らな', '誰も分から',
      'undocumented', 'no documentation', 'nobody knows', 'no inventory',
    ],
    implication: {
      ja: '資料が無い状態で正確な現状図を作ろうとすると、そこで半年溶ける。現状は「これから使う目的に必要な粒度」までで止め、足りない部分は前提として明記する。',
      en: 'Trying to build an accurate current-state picture with no documentation burns half a year. Stop at the granularity the next decision actually needs and write the rest down as stated assumptions.',
    },
    actions: [
      { ja: '現状把握は「次の決定に必要な粒度」で止める。足りない部分は前提として本文に明記し、後で検証する印を付けておく。', en: 'Stop the current-state work at the granularity the next decision needs. Write the gaps down as stated assumptions in the document itself and flag them for later verification.' },
      { ja: '文書を探すより、頭の中にある情報を取りに行く。関係者 3 人に 1 時間ずつ聞くほうが、書庫を漁るより速く正確。', en: 'Go after what is in people\'s heads rather than hunting for documents. Three one-hour interviews beat an archive search on both speed and accuracy.' },
    ],
    questions: [
      { ja: '現行の仕様を説明できる人は誰で、あと何年在籍しますか?', en: 'Who can explain the current system, and how many more years will they be here?' },
      { ja: '正しいと信じてよい資料は 1 つでもありますか。あるとしたらどれですか?', en: 'Is there a single document you can trust as accurate? Which one?' },
    ],
    favor: ['期限', '聞き取り', '前提', '粒度', '調査', 'time-box', 'interview', 'assumption', 'survey'],
    avoid: ['網羅', '完全', 'exhaustive', 'complete inventory'],
  },
  {
    id: 'assets-available',
    axis: 'assets',
    priority: 1,
    label: { ja: '既存の資料がある', en: 'Existing material is available' },
    cues: [
      '資料はある', '設計書はある', 'ドキュメントはある', '一覧はある', '台帳はある', '棚卸し済',
      '既に整理', 'すでに整理', 'documentation exists', 'we have an inventory', 'already documented',
    ],
    implication: {
      ja: '資料があるなら、新しく作るより「どれが今も正しいか」の判定が先。古い資料を土台にした計画は、実装段階で全部やり直しになる。',
      en: 'With material already in hand, judging which parts are still true comes before writing anything new. A plan built on stale documents is redone from scratch at implementation.',
    },
    actions: [
      { ja: '既存資料を「今も正しい / 古い / 不明」の 3 つに仕分けし、正しいものだけを土台にする。仕分けは作成者に聞けば 1 日で終わる。', en: 'Sort the existing material into still true, stale, and unknown, and build only on the first. Asking the authors settles it in a day.' },
      { ja: '作り直す前に、各資料の最終更新日と作成者を確認する。更新が 2 年以上止まっている資料は、現状ではなく過去の計画。', en: 'Before rewriting anything, check each document\'s last-updated date and author. Anything untouched for two years describes a past plan, not the present.' },
    ],
    questions: [
      { ja: 'その資料は最後にいつ更新され、実態と合っていることを誰が確認しましたか?', en: 'When was that material last updated, and who has confirmed it matches reality?' },
    ],
    favor: ['既存', '再利用', '更新', '確認', 'existing', 'reuse', 'verify'],
    avoid: ['ゼロから', '新しく作', 'from scratch'],
  },
  {
    id: 'authority-none',
    axis: 'authority',
    priority: 1,
    label: { ja: '自分に決定権が無い', en: 'You do not hold the decision' },
    cues: [
      '決定権がない', '決定権が無い', '権限がない', '権限が無い', '決められない', '決裁権',
      '自分では決め', '上に諮', '説得しないと',
      'no authority', 'cannot decide', 'not my call', 'need approval from',
    ],
    // 「私に決定権はない」「誰が決めるのか分からない」を拾う。
    // 「決定権は事業部長にある」のような、権限の所在が書いてあるだけの文には当てない。
    patterns: [
      {
        subject: [
          '自分', '私', 'こちら', '担当', '決定権', '権限', '決裁', '決める',
          'authority', 'decision', 'sign-off', 'mandate',
        ],
        topic: [
          '決定権', '権限', '決裁', '決められ', '決める', '決まらな', '判断でき',
          'authority', 'decide', 'decision right', 'sign-off', 'mandate',
        ],
        negative: [
          'ない', '無い', 'なく', '無く', 'ませ', '分からな', 'わからな', '不明', '不在',
          'no ', 'not ', "n't", 'cannot', 'unclear', 'nobody', 'no one',
        ],
        positive: ['にある', 'を持っている', '与えられている', '委任されている', 'i have', 'we have'],
      },
    ],
    implication: {
      ja: '決定権が無い立場でやるべきなのは決めることではなく、決める人が決められる材料を出すこと。意見を持っていくと止まり、選択肢を持っていくと進む。',
      en: 'Without the decision rights, the job is not to decide but to make the decision decidable. Bringing an opinion stalls; bringing options moves.',
    },
    actions: [
      { ja: '案を「選択肢 A / B と、それぞれで諦めるもの」の形にして持っていく。推奨は付けるが、決めるのは相手だと明示する。', en: 'Bring it as option A, option B, and what each one gives up. State a recommendation, but make clear the decision is theirs.' },
      { ja: '決定の期限と、決めなかった場合に何が起きるかを添える。放置のコストが見えないと決定は先送りされる。', en: 'Attach a decision deadline and what happens if nothing is decided. Without a visible cost of delay, the decision is deferred.' },
    ],
    questions: [
      { ja: 'この件の最終決定者は誰で、その人が判断するには何が必要ですか?', en: 'Who is the final decision maker here, and what do they need in order to decide?' },
    ],
    favor: ['選択肢', '決定', '権限', '決裁', 'option', 'decision', 'authority', 'trade-off'],
    avoid: [],
  },
  {
    id: 'field-resistance',
    axis: 'climate',
    priority: 1,
    label: { ja: '現場の抵抗がある', en: 'Resistance on the ground' },
    cues: [
      '反発', '抵抗', '非協力', '現場が動かない', '嫌がら', '押し付け',
      '納得していない', '不満',
      // 「協力が得られている」を抵抗と読まないよう、否定形まで含めて一致させる
      '協力が得られな', '協力が得られず', '協力を得られな', '協力を得られず',
      // 「反対」は語尾が揺れるので前方一致で拾う(「正反対」「反対側」を巻き込まない形にする)
      '反対し', '反対され', '反対が', '反対の声', '猛反対', '賛同が得られな', '乗り気でな',
      'resistance', 'pushback', 'push back', 'not cooperating', 'imposed', 'opposed', 'opposition',
    ],
    // 「現場は乗り気ではない」「利用部門の納得が取れていない」のような言い方を拾う
    patterns: [
      {
        subject: [
          '現場', 'ユーザー', '利用部門', '事業部門', '業務部門', '部門', '担当者', '関係者',
          'users', 'business unit', 'the field', 'operations', 'staff',
        ],
        topic: [
          '協力', '納得', '賛同', '合意', '受け入れ', '乗り気', '前向き', '参加', '巻き込',
          'cooperation', 'buy-in', 'agreement', 'on board', 'onboard',
        ],
        negative: [
          'ない', '無い', 'なく', '無く', 'ませ', 'られず', 'できてい', '取れてい', '薄',
          '難しい', 'ほとんど', 'まったく', '全く',
          'no ', 'not ', "n't", 'never', 'without', 'lack',
        ],
        positive: [
          '得られている', '取れている', '進んでいる', '積極的', '協力的', 'できている',
          'strong', 'good', 'fully',
        ],
      },
    ],
    implication: {
      ja: '現場が抵抗する原因はほぼ「決まった後に知らされた」こと。説明の仕方ではなく、関与のさせ方を変えないと同じことが繰り返される。',
      en: 'Resistance almost always traces to being told after the fact. Change how people are involved, not how the decision is explained, or it repeats.',
    },
    actions: [
      { ja: '反対している部門から 1 人を検討の側に入れる。決まった後の説明会では遅い。', en: 'Bring one person from the objecting department into the work itself. A briefing after the decision is too late.' },
      { ja: 'その部門が今困っていることを 1 つ、この取り組みの中で先に解決する。取引材料が無い提案は通らない。', en: 'Solve one thing that department is actually struggling with, first, inside this initiative. A proposal with nothing to trade does not land.' },
    ],
    questions: [
      { ja: '反対している人は、具体的に何を失うと思っていますか?', en: 'What exactly do the people objecting believe they will lose?' },
    ],
    favor: ['巻き込', '関与', '対話', '味方', '説明', 'involve', 'engage', 'stakeholder'],
    avoid: ['強制', '必須', 'enforce', 'mandate'],
  },
  {
    id: 'regulated',
    axis: 'regulation',
    priority: 1,
    label: { ja: '規制・監査が関わる', en: 'Regulation or audit is involved' },
    cues: [
      '規制', '当局', '金融庁', '監査', 'コンプライアンス', '法令', '個人情報', '内部統制',
      'gdpr', 'regulator', 'regulatory', 'audit', 'compliance',
    ],
    implication: {
      ja: '規制が絡むと、期限と証跡が外から決まる。設計より先に「何を、いつまでに、誰に、どう示すか」を確定させないと、後から証跡は作れない。',
      en: 'Once regulation is involved, both the deadline and the evidence requirements come from outside. Settle what must be shown, by when, and to whom before design — evidence cannot be manufactured afterwards.',
    },
    actions: [
      { ja: '適用される制度と最初の提出期日を確定し、そこから逆算して設計の締切を置く。', en: 'Confirm which regime applies and the first submission date, then set the design deadlines by working backwards from it.' },
      { ja: '決定の根拠を残す仕組みを最初から入れる。「誰が、いつ、何を根拠に決めたか」を後から再現できるかで監査の結果が決まる。', en: 'Build the decision-record mechanism in from the start. Audits turn on whether you can reconstruct who decided what, when, and on what basis.' },
    ],
    questions: [
      { ja: '適用される規制と最初の期日は確定していますか。それを確認したのは誰ですか?', en: 'Are the applicable regulation and the first deadline confirmed, and who confirmed them?' },
    ],
    favor: ['証跡', '監査', '規制', '根拠', '記録', 'audit', 'evidence', 'regulat', 'trace'],
    avoid: [],
  },
];

/**
 * 条件の組み合わせに対する助言 / Advice that only applies to a combination of conditions.
 *
 * `requires` は OR グループの配列。全グループにそれぞれ 1 つ以上該当したときだけ成立する。
 */
export interface ConditionCombo {
  id: string;
  requires: SituationConditionId[][];
  label: Bilingual;
  advice: Bilingual;
}

export const CONDITION_COMBOS: ConditionCombo[] = [
  {
    id: 'no-money-no-people',
    requires: [['budget-none', 'budget-tight'], ['team-solo']],
    label: { ja: '金も人も無い', en: 'Neither money nor people' },
    advice: {
      ja: '金も人も無い状態で全社の絵を描くのは物理的に不可能なので、範囲を 1 業務・1 データに固定するところから始める。順番は「範囲を固定 → 90 日で 1 枚 → その 1 枚で次の予算と人を取る」。この順番を崩すと、途中で力尽きて何も残らない。',
      en: 'Drawing the whole enterprise with neither money nor people is physically impossible, so start by fixing scope to one process and one data set. The order is: fix scope, produce one page in ninety days, use that page to win the next budget and the next pair of hands. Break the order and the effort runs out with nothing to show.',
    },
  },
  {
    id: 'no-money-no-sponsor',
    requires: [['budget-none', 'budget-tight'], ['sponsor-absent']],
    label: { ja: '金も経営の関心も無い', en: 'Neither money nor executive attention' },
    advice: {
      ja: '金も関心も無いときに正論を出しても動かない。今まさに現場が痛がっている作業を 1 つ選び、その作業に毎月かかっている人日と失敗件数だけを数字にして持っていく。抽象的な将来像ではなく、目の前の損失が唯一の入り口になる。',
      en: 'With neither funding nor attention, a correct argument changes nothing. Pick one task the organisation is visibly hurting on and bring only two numbers: the person-days it consumes monthly and how often it goes wrong. Present loss, not a future-state vision — that is the only door open.',
    },
  },
  {
    id: 'money-but-no-time',
    requires: [['budget-ample'], ['deadline-urgent', 'deadline-fixed']],
    label: { ja: '金はあるが時間が無い', en: 'Funded but out of time' },
    advice: {
      ja: '金で買えるのは並行実行だけで、意思決定の速度は買えない。増員する前に「誰が何を、いつまでに決めるか」を先に固める。外部要員は調査・検証・移行作業に投入し、判断そのものは外に出さない。判断を外注した案件は、期限直前に必ず差し戻される。',
      en: 'Money buys parallelism and nothing else; decision speed is not for sale. Fix who decides what by when before adding people. Put external hands on investigation, trials, and migration work, and keep judgement inside. Outsourced judgement always comes back for rework just before the deadline.',
    },
  },
  {
    id: 'money-and-sponsor',
    requires: [['budget-ample'], ['sponsor-committed']],
    label: { ja: '金も経営の支持もある', en: 'Both funding and executive backing' },
    advice: {
      ja: '予算と経営の支持が両方揃っている期間は長くは続かない。この期間に通しておくべきは、新しいものを作る決定より「減らす決定」— 廃止するシステム、統合する業務、正本にするデータ、必須にする標準。増やす決定は後からでも通るが、減らす決定はこの時期にしか通らない。',
      en: 'A window with both funding and executive backing does not stay open long. What belongs in it is not the decision to build but the decisions to subtract — which systems retire, which processes merge, which data is the system of record, which standards become mandatory. Additive decisions can pass later; subtractive ones only pass now.',
    },
  },
  {
    id: 'solo-and-urgent',
    requires: [['team-solo'], ['deadline-urgent']],
    label: { ja: 'ひとりで期限に追われている', en: 'Alone and against the clock' },
    advice: {
      ja: 'ひとりで期限が迫っている状況で取れる手は、作る量を減らすことだけ。出す資料を 1 つに決め、それ以外は口頭と既存資料で済ませる。合わせて「今週決まらないと間に合わない決定」を関係者に明示し、決定待ちの時間を自分の作業時間から切り離す。',
      en: 'Alone and against the clock, the only available lever is producing less. Choose one document to deliver and cover everything else verbally or with existing material. In parallel, tell stakeholders explicitly which decisions must land this week, so waiting for them stops eating your own working time.',
    },
  },
];

/** 打ち消しを示す語(日本語)。単独の「ない」は広すぎるので採らない */
const NEGATION_MARKERS_JA = [
  'やらない', 'やらん', 'やめた', 'やめる', '取りやめ', '取り止め', '中止', '白紙',
  '見送', '対象外', 'スコープ外', '範囲外', '除外', '却下', '断念', '見合わせ',
  '実施しない', '行わない', 'しないことに', 'ないことに決', '予定はない', '予定は無い', '予定なし',
  '考えていない', '検討していない', '検討しない', '必要ない', '必要無い', '不要',
  'なくなった', '無くなった', 'ボツ',
];

/**
 * 「〜ではない」系。話題を取り下げた意味にも、状態をそのまま述べた意味にもなる。
 *
 * 「今回の対象ではない」は取り下げだが、「現場は乗り気ではない」は状況の説明であって
 * 取り下げではない。後者まで落とすと、利用者が書いた状態をこちらが読めなくなるので、
 * 話題の取り下げを示す語(下の SCOPE_WORDS_JA)が同じ節にあるときだけ打ち消しとして扱う。
 */
const SOFT_NEGATION_JA = ['ではない', 'ではありません', 'じゃない', 'ではなく'];

/** 「〜ではない」を取り下げと読んでよい節の目印 */
const SCOPE_WORDS_JA = ['対象', 'スコープ', '範囲', '今回', 'テーマ', '目的', '狙い', '主題', '本題'];

/**
 * 「まだその段階ではない」型の取り下げ / "Not at that stage yet" withdrawals.
 *
 * SCOPE_WORDS_JA + SOFT_NEGATION_JA の組み合わせでは拾えない。
 * 実測された不具合: 「判断を仰ぐ段階ではない。」から `explain_for` が
 * 「判断・承認を求める話である」を論点として拾い、しかも「外した話題」にも出さなかった。
 * 利用者は決裁を求めていないと書いているのに、経営層への説明を承認依頼として組み立てる。
 *
 * ここは語ではなく句で持つ。「段階」だけを SCOPE_WORDS_JA に足すと
 * 「この段階では十分ではない」のような状態の説明まで取り下げとして落ちる。
 * 「話ではない」も採らない(「電話ではない」に当たる)。
 */
const STAGE_NEGATION_JA = [
  '段階ではない', '段階ではありません', '段階じゃない', '段階にはない', '段階にない',
  'フェーズではない', 'フェーズではありません', '局面ではない',
  '時期ではない', '時期ではありません', 'タイミングではない',
];

/**
 * 「(それ)の話ではない / の依頼ではない」型の取り下げ。
 *
 * 実測された不具合(explain_for): 「予算の話ではない。」から「金額が書かれている」を、
 * 「これは承認の依頼ではない。」から「判断・承認を求める話である」を論点として拾い、
 * どちらも「外した話題」にも出さなかった。利用者が明示的に否定した話題を、
 * 出力の冒頭に据えて話させることになる。
 *
 * SCOPE_WORDS_JA(対象・スコープ・今回…)には当たらないので拾えなかった。
 * ここも語ではなく句で持つ。**必ず「の」「を」「が」を含めた形にする** —
 * 「話ではない」だけにすると「電話ではない」に当たる(STAGE_NEGATION_JA と同じ理由)。
 */
const TOPIC_NEGATION_JA = [
  'の話ではない', 'の話ではありません', 'の話じゃない',
  'の依頼ではない', 'の依頼ではありません',
  'の相談ではない', 'の議論ではない', 'の検討ではない',
  'を求める話ではない', 'を求めるものではない', 'を求めていない', 'を求めていません',
  'が論点ではない', 'が主題ではない', 'が本題ではない',
];

/** 打ち消しを示す語(英語)。素の "not" は広すぎるので採らない */
const NEGATION_MARKERS_EN = [
  'not doing', 'decided not to', 'ruled out', 'out of scope', 'not in scope', 'off the table',
  'no longer', 'cancelled', 'canceled', 'called off', 'shelved', 'abandoned', 'dropped',
  'will not', "won't", 'not going ahead', 'not going to', 'is not happening', 'scrapped',
  // 「まだその段階ではない」型。上の STAGE_NEGATION_JA と同じ理由で必要
  'not at that stage', 'not at the stage', 'not at that point', 'too early to',
  'not asking for', 'not looking for', 'not seeking',
  // 「これは承認の依頼ではない」型。上の TOPIC_NEGATION_JA と同じ理由で必要
  'not a request for', 'not a request to', 'not an approval request',
  'not a decision request', 'not for approval', 'not a proposal',
  'not asking you to', 'not up for decision', 'not a budget request',
];

/** 打ち消しを補強する語(単独では打ち消しにしない) */
const DECISION_MARKERS = ['決まった', '決定した', '決まりました', 'has been decided', 'was decided'];

/**
 * 打ち消しに見えて打ち消しではない言い回し(二重否定・留保)。
 *
 * 「予算が無いわけではない」は「予算はある」に近く、「予算が無い」でも
 * 「予算の話題は対象外」でもない。どちらに数えても嘘になるので、
 * この節は肯定にも打ち消しにも入れず、判断を保留する。
 */
const HEDGE_MARKERS = [
  'わけではない', 'わけでは無い', 'わけではありません', 'わけじゃない', 'わけでもない',
  'とは限らない', 'とも限らない', 'ないこともない', 'ないとは言えない', 'なくはない',
  'not necessarily', 'not entirely', 'not that we', 'not to say',
];

/** 節 1 つ / One clause of the situation text. */
export interface SituationClause {
  text: string;
  negated: boolean;
  /** 打ち消しと判断した語 */
  marker?: string;
  /** 「決まった」など、打ち消しを補強する語 */
  decided?: boolean;
  /** 二重否定・留保のため、肯定にも打ち消しにも数えない節 */
  hedged?: boolean;
  /** 保留と判断した語 */
  hedgeMarker?: string;
}

/** 検出した条件 1 件 / One detected condition with its evidence. */
export interface DetectedCondition {
  condition: SituationCondition;
  /** 根拠になった語 */
  cues: string[];
  /**
   * どこから読んだか。
   * `text`=相談文の定型表現 / `number`=文中の数値表現 / `engagement`=登録済みの案件情報。
   * 出力では必ず出所を書く(利用者が誤読を正せるように)。
   */
  from?: 'text' | 'number' | 'engagement';
  /** 出所の呼び名(案件の説明など) */
  sourceLabel?: Bilingual;
}

/** 状況の読み取り結果 / The result of reading a situation description. */
export interface SituationReading {
  clauses: SituationClause[];
  /** 打ち消されていない部分だけを繋いだ文 */
  positiveText: string;
  /** 打ち消されている部分だけを繋いだ文 */
  negatedText: string;
  /** 打ち消しが 1 つでもあったか */
  hasNegation: boolean;
  /** 二重否定・留保のため判断を保留した節 */
  hedged: SituationClause[];
  /** 検出した条件(軸ごとに 1 件) */
  conditions: DetectedCondition[];
  /** 数値・単位から読み取った事実 */
  facts: SituationFact[];
  /** こちらでは読み取れなかった軸(「書かれていない」ではない) */
  unknownAxes: SituationAxis[];
  /** 成立した条件の組み合わせ */
  combos: ConditionCombo[];
  /** 並べ替えに使う内容語 */
  terms: string[];
  /** 案件情報など、補助テキストから拾った内容語(並べ替えの弱い重みに使う) */
  contextTerms: string[];
}

/**
 * 相談文と一緒に読む補助テキスト / Extra text read alongside the description.
 *
 * 案件の説明・スコープ・登録済みの期限など、相談者が既にこのサーバーに預けている情報。
 * 相談文と同じ扱いにするとルールの一致が濁るので、条件・数値・並べ替えにだけ使う。
 */
export interface SituationContext {
  text: string;
  /** 出所の呼び名(出力に「案件の説明より」のように出す) */
  label: Bilingual;
}

// 節の区切り。数字の中の「,」「.」では切らない
// (「500,000,000 円」を 3 つの節に割ると、金額が読めなくなる)
const CLAUSE_SPLIT = /[。．!?！？\n;；、]+|[,.]+(?!\d)/;

/** 語が本文に出るか(英語は小文字化して比較) */
function hasCue(haystack: string, lowerHaystack: string, cue: string): boolean {
  return /^[\x20-\x7E]+$/.test(cue) ? lowerHaystack.includes(cue.toLowerCase()) : haystack.includes(cue);
}

/** topic の前後をどこまで見るか。日本語は短く、英語は語が長いぶん広く取る */
const PATTERN_WINDOW_JA = 14;
const PATTERN_WINDOW_EN = 44;
/** 表に出す根拠の最大長(利用者の文をそのまま長く貼らない) */
const PATTERN_EVIDENCE_MAX = 40;

/**
 * 根拠として出す本文の一部を整える。
 * 語の途中で切れたところは落とし、切ったことが分かるように「…」を付ける。
 */
function formatEvidence(window: string, cutHead: boolean, cutTail: boolean): string {
  let text = window;
  let head = cutHead;
  let tail = cutTail;
  // 英単語の途中から始まる/終わるのは読みにくいので、語の境界まで詰める
  if (head && /^\w/.test(text)) {
    const space = text.indexOf(' ');
    if (space >= 0 && space < 20) text = text.slice(space + 1);
  }
  if (tail && /\w$/.test(text)) {
    const space = text.lastIndexOf(' ');
    if (space > text.length - 20) text = text.slice(0, space);
  }
  text = text.trim();
  if (text.length > PATTERN_EVIDENCE_MAX) {
    text = text.slice(0, PATTERN_EVIDENCE_MAX).trim();
    tail = true;
  }
  return `${head ? '…' : ''}${text}${tail ? '…' : ''}`;
}

/**
 * 共起パターンが節に当たるかを見る。当たったら根拠にする本文の一部を返す。
 *
 * subject は節のどこにあってもよい。topic の前後だけを窓として見て、
 * 窓に肯定語があれば不成立、否定・弱さの語があれば成立とする。
 * 「近くにあること」を条件にしているのは、
 * 「経営の関与は強いが予算がない」のような文で軸をまたいで誤検出しないため。
 */
function matchCuePattern(segment: string, lowerSegment: string, pattern: CuePattern): string | undefined {
  const subject = pattern.subject.find((s) => hasCue(segment, lowerSegment, s));
  if (!subject) return undefined;
  for (const topic of pattern.topic) {
    const ascii = /^[\x20-\x7E]+$/.test(topic);
    const hay = ascii ? lowerSegment : segment;
    const needle = ascii ? topic.toLowerCase() : topic;
    const at = hay.indexOf(needle);
    if (at < 0) continue;
    const w = ascii ? PATTERN_WINDOW_EN : PATTERN_WINDOW_JA;
    const from = Math.max(0, at - w);
    const to = Math.min(hay.length, at + needle.length + w);
    const window = segment.slice(from, to);
    const lowerWindow = lowerSegment.slice(from, to);
    // 肯定が勝つ。「関与は強い」と書いてあるものを「関与が薄い」と読まない
    if ((pattern.positive ?? []).some((p) => hasCue(window, lowerWindow, p))) continue;
    if (!pattern.negative.some((n) => hasCue(window, lowerWindow, n))) continue;
    return formatEvidence(window, from > 0, to < hay.length);
  }
  return undefined;
}

/** 条件の共起パターンを節ごとに見て、当たった根拠を返す */
function patternCues(text: string, condition: SituationCondition): string[] {
  if (!condition.patterns || condition.patterns.length === 0) return [];
  const out: string[] = [];
  for (const raw of text.split(CLAUSE_SPLIT)) {
    const segment = raw.trim();
    if (segment.length === 0) continue;
    const lower = segment.toLowerCase();
    for (const pattern of condition.patterns) {
      const hit = matchCuePattern(segment, lower, pattern);
      if (hit && !out.includes(hit)) out.push(hit);
    }
  }
  return out;
}

/** 「〜ではない」を取り下げとして読んでよい節かを見る */
function softNegationMarker(part: string): string | undefined {
  const stage = STAGE_NEGATION_JA.find((m) => part.includes(m));
  if (stage) return stage;
  const topic = TOPIC_NEGATION_JA.find((m) => part.includes(m));
  if (topic) return topic;
  if (!SCOPE_WORDS_JA.some((w) => part.includes(w))) return undefined;
  return SOFT_NEGATION_JA.find((m) => part.includes(m));
}

/** 状況文を節に割り、節ごとに打ち消しの有無を判定する */
export function splitSituationClauses(situation: string): SituationClause[] {
  const parts = situation
    .split(CLAUSE_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.map((part) => {
    const lower = part.toLowerCase();
    // 二重否定・留保が先。「〜が無いわけではない」を打ち消しと読むと話題を誤って外す
    const hedgeMarker = HEDGE_MARKERS.find((m) => hasCue(part, lower, m));
    if (hedgeMarker) return { text: part, negated: false, hedged: true, hedgeMarker };
    const marker =
      NEGATION_MARKERS_JA.find((m) => part.includes(m)) ??
      softNegationMarker(part) ??
      NEGATION_MARKERS_EN.find((m) => lower.includes(m));
    const decided = DECISION_MARKERS.some((m) => part.includes(m) || lower.includes(m));
    return marker ? { text: part, negated: true, marker, decided } : { text: part, negated: false };
  });
}

const TERM_STOPLIST = new Set([
  'こと', 'もの', 'ため', '場合', '状況', '現在', '今回', '自分', '我々', '相談', '課題', '問題',
  '必要', '検討', '実施', '対応', '状態', '方法', '内容', '部分', '以下', '以上', '結果',
  'that', 'this', 'with', 'from', 'have', 'been', 'they', 'them', 'what', 'when', 'which', 'there',
  'about', 'would', 'could', 'should', 'their', 'because', 'want', 'need', 'like', 'just', 'also',
]);

/** 並べ替えに使う内容語を取り出す(形態素解析は使わず、文字種の連続で切る) */
export function extractSituationTerms(situation: string): string[] {
  const found = new Set<string>();
  const add = (t: string): void => {
    const v = t.trim().toLowerCase();
    if (v.length < 2 || TERM_STOPLIST.has(v)) return;
    found.add(v);
  };
  for (const m of situation.matchAll(/[一-鿿々]{2,}/gu)) {
    const run = m[0];
    add(run);
    if (run.length >= 4) {
      for (let i = 0; i + 2 <= run.length; i += 1) add(run.slice(i, i + 2));
    }
  }
  for (const m of situation.matchAll(/[ァ-ー]{3,}/gu)) add(m[0]);
  for (const m of situation.toLowerCase().matchAll(/[a-z][a-z-]{3,}/g)) add(m[0]);
  return Array.from(found);
}

// ============================================================
// 数値・単位の読み取り / Reading numbers and units out of a description
//
// 定型句だけを照合すると「予算は限られている」は読めるのに「予算は 5 億円」が読めない。
// 実務の相談文では、制約は形容詞ではなく数字で書かれることの方が多い。
// ここでは金額・人数・期日・割合を数字と単位から読み、
// 「どの表現から読んだのか」を必ず一緒に返す(利用者が誤読をその場で正せるように)。
//
// 読めなかったものを「書かれていない」と断定しない。呼び出し側もそう書かないこと。
// ============================================================

/** 読み取った数値の種類 / What kind of number was read. */
export type SituationFactKind = 'budget' | 'deadline' | 'capacity' | 'ratio';

/** 数値から読み取った事実 1 件 / One fact read from a number in the text. */
export interface SituationFact {
  kind: SituationFactKind;
  /** 対応する軸(割合など、軸に紐付かないものは undefined) */
  axis?: SituationAxis;
  /** 出力の「観点」列に出す名前 */
  topic: Bilingual;
  /** 読み取った内容 */
  label: Bilingual;
  /** 根拠にした本文の表現(そのまま引用する) */
  evidence: string;
  /** 根拠の表現が出てきた節(短く切って引用する) */
  clause: string;
  /** 正規化した値(金額=通貨単位、人数=人、期日=残り日数、割合=%) */
  value: number;
  /** 期日のときの ISO 日付 */
  isoDate?: string;
  /** 体制のときの内訳(専任 / 兼任)。書かれていなければ undefined */
  staffing?: 'dedicated' | 'part-time';
  /** 読み取りに含めた推測(年の補完など)。あれば必ず開示する */
  assumption?: Bilingual;
  /** その数値だからこそ言える助言 */
  advice?: Bilingual;
  /** どこから読んだか */
  from: 'text' | 'engagement';
  /** 出所の呼び名(案件の説明など) */
  sourceLabel?: Bilingual;
}

const KANJI_DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const KANJI_SCALE: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
/** 漢数字を算用数字に直すのは、単位が続くときだけ(「十分」を 10 分にしない) */
const KANJI_RUN_RE =
  /(?<![0-9〇零一二三四五六七八九十百千])[〇零一二三四五六七八九十百千]+(?=\s*(?:兆|億|万|円|名|人|件|割|%|パーセント|か月|ヶ月|カ月|ケ月|週間|日間|年|月|日))/g;

function parseKanjiNumber(run: string): number | null {
  if (run.length === 0) return null;
  const hasScale = Array.from(run).some((c) => c in KANJI_SCALE);
  if (!hasScale) {
    // 「二〇二六」のような位取り表記
    let value = 0;
    for (const c of run) {
      const d = KANJI_DIGIT[c];
      if (d === undefined) return null;
      value = value * 10 + d;
    }
    return value;
  }
  let total = 0;
  let current = 0;
  for (const c of run) {
    const d = KANJI_DIGIT[c];
    if (d !== undefined) {
      current = d;
      continue;
    }
    const scale = KANJI_SCALE[c];
    if (scale === undefined) return null;
    total += (current === 0 ? 1 : current) * scale;
    current = 0;
  }
  return total + current;
}

/**
 * 数値表現を読むための正規化。全角を半角にし、単位が続く漢数字を算用数字に直す。
 * 条件の定型句照合には使わない(「予算は十分」を壊さないため)。
 */
export function normalizeQuantitativeText(value: string): string {
  const halfWidth = value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/，/g, ',')
    .replace(/％/g, '%')
    .replace(/＄/g, '$')
    .replace(/￥/g, '¥')
    .replace(/　/g, ' ');
  return halfWidth.replace(KANJI_RUN_RE, (run) => {
    const parsed = parseKanjiNumber(run);
    return parsed === null ? run : String(parsed);
  });
}

type FactCurrency = 'JPY' | 'USD' | 'EUR' | 'GBP';

const MONEY_UNIT_FACTOR: Record<string, number> = {
  兆: 1e12, 億: 1e8, 千万: 1e7, 百万: 1e6, 万: 1e4, 千: 1e3,
  billion: 1e9, bn: 1e9, million: 1e6, mn: 1e6, thousand: 1e3,
  b: 1e9, m: 1e6, k: 1e3,
};

const MONEY_RE =
  /([¥$€£]|USD|JPY|EUR|GBP)?\s*(\d[\d,]*(?:\.\d+)?)\s*(兆|億|千万|百万|万|千|billion|bn|million|mn|thousand|[bmk](?![a-z]))?\s*(円|ドル|ユーロ|ポンド|yen|jpy|usd|eur|gbp|dollars?)?/gi;
/** 金額の話だと判断してよい語(単位だけの「3 億」を金額と読むための条件) */
const MONEY_KEYWORD_RE =
  /予算|投資|上限|キャップ|コスト|費用|原資|資金|金額|見積|発注|調達額|budget|funding|invest|cost|capex|opex|spend|ceiling|cap(?![a-z])/i;
/** 数字の直後がこれなら金額ではない(人数・日付・割合) */
const NOT_MONEY_AFTER_RE = /^\s*(?:年|月|日|時|分|秒|人|名|件|社|台|回|%|割|パーセント)/;

function currencyOf(token: string | undefined): FactCurrency | null {
  if (!token) return null;
  const t = token.toLowerCase();
  if (t === '¥' || t === 'jpy' || t === '円' || t === 'yen') return 'JPY';
  if (t === '$' || t === 'usd' || t === 'ドル' || t.startsWith('dollar')) return 'USD';
  if (t === '€' || t === 'eur' || t === 'ユーロ') return 'EUR';
  if (t === '£' || t === 'gbp' || t === 'ポンド') return 'GBP';
  return null;
}

function groupDigits(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 金額を日英で書き分ける(日本語は億・万、英語は通貨 + 3 桁区切り) */
function formatMoney(value: number, currency: FactCurrency): Bilingual {
  const en = `${currency} ${groupDigits(value)}`;
  if (currency !== 'JPY') return { ja: en, en };
  if (value >= 1e8) return { ja: `${trimNumber(value / 1e8)} 億円`, en };
  if (value >= 1e4) return { ja: `${trimNumber(value / 1e4)} 万円`, en };
  return { ja: `${groupDigits(value)} 円`, en };
}

/** 短く引用する(表・引用ブロックを壊さない) */
function clip(value: string, max: number): string {
  const one = value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

interface MoneyRead {
  value: number;
  currency: FactCurrency;
  evidence: string;
}

interface MoneyToken {
  value: number;
  factor: number;
  start: number;
  end: number;
  currency: FactCurrency | null;
  hasUnit: boolean;
  singleLetterUnit: boolean;
  text: string;
}

function readMoney(clause: string): MoneyRead | null {
  const hasKeyword = MONEY_KEYWORD_RE.test(clause);
  const tokens: MoneyToken[] = [];
  MONEY_RE.lastIndex = 0;
  for (const m of clause.matchAll(MONEY_RE)) {
    const [whole, cur1, num, unit, cur2] = m;
    if (!num) continue;
    const currency = currencyOf(cur1) ?? currencyOf(cur2);
    const unitKey = unit?.toLowerCase();
    const factor = unitKey ? MONEY_UNIT_FACTOR[unitKey] ?? 1 : 1;
    // 通貨も単位も無い裸の数字は金額と読まない
    if (!currency && !unitKey) continue;
    const start = m.index ?? 0;
    const end = start + whole.length;
    if (!cur2 && NOT_MONEY_AFTER_RE.test(clause.slice(end))) continue;
    const value = Number(num.replace(/,/g, '')) * factor;
    if (!Number.isFinite(value) || value <= 0) continue;
    tokens.push({
      value,
      factor,
      start,
      end,
      currency,
      hasUnit: Boolean(unitKey),
      singleLetterUnit: Boolean(unitKey && unitKey.length === 1),
      text: whole.trim(),
    });
  }

  // 「1 億 2 千万円」のように続けて書かれたトークンを 1 つの金額にまとめる
  // (まとめないと、大きい方だけを採って 1 億円と読んでしまう)
  const groups: MoneyToken[][] = [];
  for (const token of tokens) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      last &&
      prev &&
      prev.hasUnit &&
      token.factor < prev.factor &&
      clause.slice(prev.end, token.start).trim().length === 0
    ) {
      last.push(token);
      continue;
    }
    groups.push([token]);
  }

  let best: MoneyRead | null = null;
  for (const group of groups) {
    const value = group.reduce((sum, t) => sum + t.value, 0);
    const currency = group.map((t) => t.currency).find((c): c is FactCurrency => c !== null) ?? null;
    const hasUnit = group.some((t) => t.hasUnit);
    // 単位だけ(「3 億」)は、金額の話だと分かるときにだけ採る
    if (!currency && !hasKeyword) continue;
    // 1 文字の単位(5M / 3k)は通貨が書かれているときだけ採る(months の m と区別できない)
    if (!currency && group.every((t) => t.singleLetterUnit)) continue;
    if (!currency && !hasUnit) continue;
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    const read: MoneyRead = {
      value,
      currency: currency ?? 'JPY',
      evidence: clip(clause.slice(first.start, last.end).trim(), 40),
    };
    if (!best || read.value > best.value) best = read;
  }
  return best;
}

/** 金額の桁に応じた刻み方の助言(数字をそのまま使う) */
function moneyAdvice(value: number, currency: FactCurrency): Bilingual {
  const big = currency === 'JPY' ? 1e9 : 1e7;
  const mid = currency === 'JPY' ? 1e8 : 1e6;
  const small = currency === 'JPY' ? 1e7 : 1e5;
  if (value >= big) {
    const per = formatMoney(value / 6, currency);
    return {
      ja: `この桁は経営が定期的に見る規模なので、単年の計画ではなく四半期ごとの判断点(継続 / 縮小 / 中止)を先に置く。作業パッケージは 5〜7 本、1 本あたり ${per.ja} 前後に割り、各本に中止条件と測る指標を先に書いておく。総額の 10% 前後をデータ移行と品質是正に先取りで確保すること(後から積み増しは通らない)。`,
      en: `At this order of magnitude executives will review it on a cycle, so set quarterly decision points — continue, shrink, stop — before the annual plan. Split it into five to seven work packages of roughly ${per.en} each, and write the stop criterion and the measure for each one up front. Reserve around 10% of the total for data migration and data quality now; a top-up for it never gets approved later.`,
    };
  }
  if (value >= mid) {
    const per = formatMoney(value / 4, currency);
    return {
      ja: `この桁は一括では管理できないので、3〜5 本の作業パッケージに割る(1 本あたり ${per.ja} 前後)。1 本は 6 か月以内・効果が測れる単位にし、2 本目以降は 1 本目の結果を見てから起案する。一括発注にすると、遅れていることが分かるのが最後になる。`,
      en: `This is past the size one contract can manage, so split it into three to five work packages of roughly ${per.en} each. Keep each under six months with a measurable outcome, and only start the later ones once the first has reported. Award it as one lump and you learn it is late last.`,
    };
  }
  if (value >= small) {
    const per = formatMoney(value / 2, currency);
    return {
      ja: `1 案件として回せる桁。作るものを 1〜2 本(1 本あたり ${per.ja} 前後)に絞り、残りは既存資料と自前の作業で埋める前提で計画する。2 本目は 1 本目の効果が出てから起案する。`,
      en: `This is a size one initiative can carry. Hold it to one or two builds of roughly ${per.en} each and plan for existing material and in-house effort to cover the rest. Raise the second only after the first has paid back.`,
    };
  }
  return {
    ja: `この桁で外部に頼めるのは調査か 1 機能までなので、金で解く範囲を先に 1 つに決め、残りは「既存資料の棚卸し」「関係者への聞き取り」「決めごとの明文化」といった金の要らない作業に振り分ける。`,
    en: `At this size external spend buys an investigation or a single function, so name the one thing money will solve and route the rest to work that costs nothing — inventorying existing material, interviewing people, writing decisions down.`,
  };
}

const HEADCOUNT_RE = /(\d+)\s*(名|人)(?![月日間件])/g;
/** 「3 dedicated architects」のように数字と役割の間に語が挟まる書き方も拾う */
const HEADCOUNT_EN_RE =
  /(\d+)\s*(?:(?:full[- ]?time|part[- ]?time|dedicated|senior|junior|additional|extra)\s+)?(?:fte|ftes|people|persons?|engineers?|architects?|analysts?|members?|developers?|staff)(?![a-z])/gi;
/** 体制の話だと判断してよい語(「3 名の顧客」を体制と読まないため) */
const CAPACITY_KEYWORD_RE =
  /専任|兼任|兼務|体制|要員|人員|メンバ|チーム|担当|アサイン|確保|投入|staff|team|dedicated|assign|headcount|fte|resource/i;
const DEDICATED_RE = /専任|full[- ]?time|dedicated/i;
const PART_TIME_RE = /兼任|兼務|片手間|part[- ]?time/i;

/** 人数に応じた助言(週あたりの実働に落として返す) */
function headcountAdvice(count: number, dedicated: boolean): Bilingual {
  if (count <= 1) {
    return {
      ja: '実質ひとりなので、作る量ではなく「他人に渡せる形」で決まる。成果物を 3 つに絞り、情報収集は空欄の表を各部門に配って埋めてもらう形にする。会議体は新設せず既存の定例に 10 分もらう。',
      en: 'With effectively one person the result depends on how much you can hand off, not how much you produce. Cap deliverables at three, gather information by sending each department an empty table to fill in, and take ten minutes in an existing meeting instead of creating a forum.',
    };
  }
  const dayPerWeek = count * 5;
  const usable = Math.max(5, Math.round(dayPerWeek * 0.65));
  const streams = Math.max(1, Math.min(3, Math.round(count / 2)));
  if (count <= 5) {
    return {
      ja: `${count} 名${dedicated ? '(専任)' : ''}は週 ${dayPerWeek} 人日。調整・資料・会議で 3 割は消えるので、設計に使えるのは週 ${usable} 人日前後と見ておく。同時に走らせる検討は ${streams} 本までにし、それぞれに「いつ何が出るか」を置く。`,
      en: `${count} people${dedicated ? ' (dedicated)' : ''} is about ${dayPerWeek} person-days a week. Coordination, documents, and meetings take roughly a third, so plan on about ${usable} person-days of actual design. Hold parallel workstreams to ${streams} and give each a stated output and date.`,
    };
  }
  return {
    ja: `${count} 名規模になると、作業を割るより決定を割る方が効く。誰がどの決定の責任者かを先に決めないと、週 ${dayPerWeek} 人日ぶんの資料が増えるだけで判断は進まない。並行させる作業は 3 本までに抑え、残りは待たせる。`,
    en: `Past ${count} people, splitting decisions matters more than splitting tasks. Without named decision owners, ${dayPerWeek} person-days a week turns into documents rather than progress. Hold parallel work to three streams and let the rest wait.`,
  };
}

const DATE_YMD_RE = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?/g;
const DATE_MD_RE = /(?<![\d-/])(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
const REL_MONTH_RE = /(\d+)\s*(?:か月|ヶ月|カ月|ケ月|months?)(?![a-z])/gi;
/** 「3 月末」「年度末」のように日を書かない期日表現(日本の実務では日付より多い) */
const MONTH_END_RE = /(\d{1,2})\s*月末/g;
const FISCAL_END_RE = /年度末|今年度末|年度いっぱい/;
const REL_WEEK_RE = /(\d+)\s*(?:週間|weeks?)(?![a-z])/gi;
/** 期日の話だと判断してよい語 */
const DEADLINE_KEYWORD_RE =
  /期限|締切|締め切り|まで|決裁|判断|会議|委員会|報告|提出|リリース|稼働|移行|開始|着手|回答|deadline|due|by\s|go-?live|board|committee|steering|submit|launch/i;

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(iso: string): Bilingual {
  const [y, m, d] = iso.split('-');
  return { ja: `${Number(y)}年${Number(m)}月${Number(d)}日`, en: iso };
}

function addDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** 期日に応じた助言。逆算した日付をそのまま書く */
function deadlineAdvice(iso: string, remaining: number): Bilingual {
  if (remaining < 0) {
    return {
      ja: `この日付は既に過ぎている。過ぎた期日を計画に残したままにすると、以降の日付が全部信用されなくなる。新しい期日を置き直すか、この項目を閉じるかを今日決めること。`,
      en: 'That date has already passed. Leaving an expired date in the plan makes every later date untrusted. Decide today whether to reset it or close the item.',
    };
  }
  const review = formatDate(addDays(iso, -14));
  const prebrief = formatDate(addDays(iso, -28));
  if (remaining <= 30) {
    return {
      ja: `残り ${remaining} 日。この日数では事前説明と資料確定を同じ週に畳むことになるので、説明する相手を 3 人までに絞り、そこで反対されたら止まる論点を今日洗い出す。新規の調査は始めない。`,
      en: `${remaining} days left. At this range the pre-brief and the final document collapse into the same week, so cut the pre-brief list to three people and identify today the objection that would stop it. Do not start new investigation.`,
    };
  }
  return {
    ja: `残り ${remaining} 日。逆算すると、資料の確定は ${review.ja}(2 週間前)、キーパーソンへの事前説明は ${prebrief.ja}(4 週間前)が折り返し点。この 2 つの日付から先に予定を押さえ、当日に初めて見せる資料を作らない。`,
    en: `${remaining} days left. Working back, the document should be frozen by ${review.en} (two weeks out) and the key people pre-briefed by ${prebrief.en} (four weeks out). Book those two dates first — nothing should be seen for the first time on the day.`,
  };
}

const RATIO_RE = /(\d+(?:\.\d+)?)\s*(?:%|パーセント)/g;

const FACT_TOPIC: Record<SituationFactKind, Bilingual> = {
  budget: { ja: '予算(金額)', en: 'Budget (amount)' },
  deadline: { ja: '期限(日付)', en: 'Deadline (date)' },
  capacity: { ja: '体制(人数)', en: 'Capacity (headcount)' },
  ratio: { ja: '目標値(割合)', en: 'Target (percentage)' },
};

/**
 * 節の並びから数値の事実を読み取る。
 * `today` は残り日数の計算に使う(既定は実行日)。テストから固定できるように引数にしている。
 */
export function extractSituationFacts(
  clauses: readonly SituationClause[],
  options: { from?: 'text' | 'engagement'; sourceLabel?: Bilingual; today?: string } = {},
): SituationFact[] {
  const from = options.from ?? 'text';
  const today = options.today ?? toIsoDate(new Date());
  const facts: SituationFact[] = [];
  const seen = new Set<string>();
  const push = (fact: Omit<SituationFact, 'from' | 'sourceLabel'>): void => {
    const key = `${fact.kind}:${fact.value}:${fact.isoDate ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ ...fact, from, sourceLabel: options.sourceLabel });
  };

  for (const clause of clauses) {
    if (clause.negated || clause.hedged) continue;
    const raw = clause.text;
    const norm = normalizeQuantitativeText(raw);
    const quote = clip(raw, 60);

    // --- 金額 ---
    const money = readMoney(norm);
    if (money) {
      const amount = formatMoney(money.value, money.currency);
      push({
        kind: 'budget',
        axis: 'budget',
        topic: FACT_TOPIC.budget,
        label: { ja: `金額 ${amount.ja}`, en: `Amount ${amount.en}` },
        evidence: money.evidence,
        clause: quote,
        value: money.value,
        advice: moneyAdvice(money.value, money.currency),
      });
    }

    // --- 人数 ---
    if (CAPACITY_KEYWORD_RE.test(norm)) {
      let count: number | null = null;
      let evidence = '';
      HEADCOUNT_RE.lastIndex = 0;
      for (const m of norm.matchAll(HEADCOUNT_RE)) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0 && (count === null || n > count)) {
          count = n;
          evidence = clip(m[0].trim(), 20);
        }
      }
      if (count === null) {
        HEADCOUNT_EN_RE.lastIndex = 0;
        for (const m of norm.matchAll(HEADCOUNT_EN_RE)) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n > 0 && (count === null || n > count)) {
            count = n;
            evidence = clip(m[0].trim(), 20);
          }
        }
      }
      if (count !== null) {
        const dedicated = DEDICATED_RE.test(norm);
        const partTime = PART_TIME_RE.test(norm);
        const kindJa = dedicated ? '専任' : partTime ? '兼任' : '';
        const kindEn = dedicated ? 'dedicated' : partTime ? 'part-time' : '';
        push({
          kind: 'capacity',
          axis: 'capacity',
          staffing: dedicated ? 'dedicated' : partTime ? 'part-time' : undefined,
          topic: FACT_TOPIC.capacity,
          label: {
            ja: `${kindJa}${kindJa ? ' ' : ''}${count} 名`,
            en: `${count} people${kindEn ? ` (${kindEn})` : ''}`,
          },
          evidence,
          clause: quote,
          value: partTime && !dedicated ? Math.max(1, Math.floor(count / 2)) : count,
          advice: headcountAdvice(
            partTime && !dedicated ? Math.max(1, Math.floor(count / 2)) : count,
            dedicated,
          ),
          assumption: partTime && !dedicated
            ? {
                ja: '兼任と書かれていたので、実働はおよそ半分として数えました。実際の割合が違えば書き足してください。',
                en: 'Stated as part-time, so the effective capacity is counted as roughly half. Correct the share if it differs.',
              }
            : undefined,
        });
      }
    }

    // --- 期日 ---
    if (DEADLINE_KEYWORD_RE.test(norm)) {
      let iso: string | null = null;
      let evidence = '';
      let assumption: Bilingual | undefined;
      DATE_YMD_RE.lastIndex = 0;
      const ymd = norm.match(DATE_YMD_RE);
      if (ymd && ymd[0]) {
        const parts = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/.exec(ymd[0]);
        if (parts) {
          iso = `${parts[1]}-${String(Number(parts[2])).padStart(2, '0')}-${String(Number(parts[3])).padStart(2, '0')}`;
          evidence = clip(ymd[0].trim(), 20);
        }
      }
      if (!iso) {
        DATE_MD_RE.lastIndex = 0;
        const md = DATE_MD_RE.exec(norm);
        if (md) {
          const month = Number(md[1]);
          const day = Number(md[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const year = Number(today.slice(0, 4));
            const same = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            iso = daysBetween(today, same) >= 0
              ? same
              : `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            evidence = clip(md[0].trim(), 20);
            assumption = {
              ja: `年が書かれていなかったので、直近の ${formatDate(iso).ja} と読みました。違う年なら書き足してください。`,
              en: `No year was stated, so this is read as the next ${iso}. Say otherwise if it is a different year.`,
            };
          }
        }
      }
      if (!iso) {
        MONTH_END_RE.lastIndex = 0;
        const me = MONTH_END_RE.exec(norm);
        if (me) {
          const month = Number(me[1]);
          if (month >= 1 && month <= 12) {
            const year = Number(today.slice(0, 4));
            const lastDay = (y: number): number => new Date(Date.UTC(y, month, 0)).getUTCDate();
            const same = `${year}-${String(month).padStart(2, '0')}-${lastDay(year)}`;
            iso = daysBetween(today, same) >= 0
              ? same
              : `${year + 1}-${String(month).padStart(2, '0')}-${lastDay(year + 1)}`;
            evidence = clip(me[0].trim(), 20);
            assumption = {
              ja: `「${evidence}」を月の最終日(${formatDate(iso).ja})として読みました。違う日なら書き足してください。`,
              en: `"${evidence}" is read as the last day of that month (${iso}). Say otherwise if it is a different day.`,
            };
          }
        }
      }
      if (!iso && FISCAL_END_RE.test(norm)) {
        // 日本の年度末は 3 月 31 日。会計年度が違う組織もあるので前提として明示する
        const year = Number(today.slice(0, 4));
        const march = `${year}-03-31`;
        iso = daysBetween(today, march) >= 0 ? march : `${year + 1}-03-31`;
        evidence = '年度末';
        assumption = {
          ja: `「年度末」を 3 月 31 日(${formatDate(iso).ja})として読みました。会計年度が 3 月末でなければ書き足してください。`,
          en: `"Fiscal year end" is read as 31 March (${iso}). Say so if your fiscal year ends elsewhere.`,
        };
      }
      if (!iso) {
        REL_MONTH_RE.lastIndex = 0;
        const rm = REL_MONTH_RE.exec(norm);
        if (rm) {
          const months = Number(rm[1]);
          if (Number.isFinite(months) && months > 0 && months <= 120) {
            iso = addDays(today, Math.round(months * 30.4));
            evidence = clip(rm[0].trim(), 20);
            assumption = {
              ja: `「${evidence}」を今日からの期間として ${formatDate(iso).ja} と置きました。起点が違うなら書き足してください。`,
              en: `"${evidence}" is treated as a period from today, giving ${iso}. Say so if it starts elsewhere.`,
            };
          }
        }
      }
      if (!iso) {
        REL_WEEK_RE.lastIndex = 0;
        const rw = REL_WEEK_RE.exec(norm);
        if (rw) {
          const weeks = Number(rw[1]);
          if (Number.isFinite(weeks) && weeks > 0 && weeks <= 520) {
            iso = addDays(today, weeks * 7);
            evidence = clip(rw[0].trim(), 20);
            assumption = {
              ja: `「${evidence}」を今日からの期間として ${formatDate(iso).ja} と置きました。起点が違うなら書き足してください。`,
              en: `"${evidence}" is treated as a period from today, giving ${iso}. Say so if it starts elsewhere.`,
            };
          }
        }
      }
      if (iso) {
        const remaining = daysBetween(today, iso);
        const shown = formatDate(iso);
        push({
          kind: 'deadline',
          axis: 'time',
          topic: FACT_TOPIC.deadline,
          label: {
            ja: `${shown.ja}(残り ${remaining} 日)`,
            en: `${shown.en} (${remaining} days out)`,
          },
          evidence,
          clause: quote,
          value: remaining,
          isoDate: iso,
          assumption,
          advice: deadlineAdvice(iso, remaining),
        });
      }
    }

    // --- 割合 ---
    RATIO_RE.lastIndex = 0;
    const ratio = RATIO_RE.exec(norm);
    if (ratio) {
      const pct = Number(ratio[1]);
      if (Number.isFinite(pct) && pct > 0) {
        push({
          kind: 'ratio',
          topic: FACT_TOPIC.ratio,
          label: { ja: `${trimNumber(pct)}%`, en: `${trimNumber(pct)}%` },
          evidence: clip(ratio[0].trim(), 20),
          clause: quote,
          value: pct,
          advice: {
            ja: `${trimNumber(pct)}% は、分母(何に対しての割合か)・基準日・測る人が決まっていないと後で検証できない。この 3 つを先に文章で固定し、初回の測定値を今のうちに記録しておく。`,
            en: `${trimNumber(pct)}% cannot be verified later unless the denominator, the baseline date, and who measures it are fixed. Write those three down first and record the opening measurement now.`,
          },
        });
      }
    }
  }
  return facts.slice(0, 8);
}

/**
 * 数値から読み取った事実を、既存の条件に翻訳する。
 * 条件になると助言の並べ替え(favor / avoid)まで効くので、金額のように
 * 「多い / 少ない」を断定できないものは条件にせず、事実のまま扱う。
 */
export function conditionsFromFacts(
  facts: readonly SituationFact[],
  covered: ReadonlySet<SituationAxis>,
): DetectedCondition[] {
  const byId = new Map(SITUATION_CONDITIONS.map((c) => [c.id, c]));
  const out: DetectedCondition[] = [];
  const used = new Set<SituationAxis>(covered);
  const add = (id: SituationConditionId, cue: string): void => {
    const condition = byId.get(id);
    if (!condition || used.has(condition.axis)) return;
    used.add(condition.axis);
    out.push({ condition, cues: [cue], from: 'number' });
  };
  for (const fact of facts) {
    if (fact.kind === 'capacity') {
      // 「専任」と書かれていない人数から「専任の体制がある」とは言わない。
      // 数字が読めたことと、その体制の性質を読めたことは別。
      if (fact.value <= 1) add('team-solo', fact.evidence);
      else if (fact.staffing === 'dedicated') add('team-dedicated', fact.evidence);
    } else if (fact.kind === 'deadline') {
      add(fact.value <= 60 ? 'deadline-urgent' : 'deadline-fixed', fact.evidence);
    }
  }
  return out;
}

/** 条件を検出する。同じ軸で複数当たった場合は根拠の数、次に priority で 1 件に絞る */
export function detectSituationConditions(text: string): DetectedCondition[] {
  const lower = text.toLowerCase();
  const byAxis = new Map<SituationAxis, DetectedCondition>();
  for (const condition of SITUATION_CONDITIONS) {
    const cues = [
      ...condition.cues.filter((c) => hasCue(text, lower, c)),
      ...patternCues(text, condition),
    ];
    if (cues.length === 0) continue;
    const found: DetectedCondition = { condition, cues };
    const current = byAxis.get(condition.axis);
    if (!current) {
      byAxis.set(condition.axis, found);
      continue;
    }
    const better =
      cues.length > current.cues.length ||
      (cues.length === current.cues.length && condition.priority > current.condition.priority);
    if (better) byAxis.set(condition.axis, found);
  }
  const order = SITUATION_CONDITIONS.map((c) => c.id);
  return Array.from(byAxis.values()).sort(
    (a, b) => order.indexOf(a.condition.id) - order.indexOf(b.condition.id),
  );
}

/** 成立している条件の組み合わせを返す */
export function matchConditionCombos(conditions: DetectedCondition[]): ConditionCombo[] {
  const ids = new Set(conditions.map((c) => c.condition.id));
  return CONDITION_COMBOS.filter((combo) =>
    combo.requires.every((group) => group.some((id) => ids.has(id))),
  );
}

/**
 * 状況文を読み取る。
 *
 * 打ち消された節は条件検出と話題の一致から外す。ただし全部の節が打ち消されている場合は
 * 「打ち消しではなく、そういう書き方をしているだけ」の可能性が高いので、打ち消しを適用しない。
 */
export function readSituation(situation: string, context?: SituationContext): SituationReading {
  const clauses = splitSituationClauses(situation);
  const positives = clauses.filter((c) => !c.negated && !c.hedged);
  const applyNegation = positives.length > 0 && positives.some((c) => c.text.length >= 4);
  const effective = applyNegation ? clauses : clauses.map((c) => ({ ...c, negated: false }));
  // 保留した節はどちらの文にも入れない(肯定として読むのも打ち消すのも誤りになる)
  const positiveText = effective.filter((c) => !c.negated && !c.hedged).map((c) => c.text).join('。');
  const negatedText = effective.filter((c) => c.negated).map((c) => c.text).join('。');

  const conditions = detectSituationConditions(positiveText).map(
    (d): DetectedCondition => ({ ...d, from: 'text' }),
  );
  const facts = extractSituationFacts(effective, { from: 'text' });

  // 案件に登録済みの情報も状況として読む。ただしルールの一致には混ぜない
  // (案件の説明で見立てが上書きされると、今聞かれていることに答えられなくなる)。
  const contextText = context?.text?.trim() ?? '';
  let contextFacts: SituationFact[] = [];
  let contextConditions: DetectedCondition[] = [];
  if (contextText.length >= 3) {
    const contextClauses = splitSituationClauses(contextText);
    contextFacts = extractSituationFacts(contextClauses, {
      from: 'engagement',
      sourceLabel: context?.label,
    });
    contextConditions = detectSituationConditions(contextText).map(
      (d): DetectedCondition => ({ ...d, from: 'engagement', sourceLabel: context?.label }),
    );
  }

  // 相談文で読めた軸を、案件情報で上書きしない(今書かれていることを優先する)
  const factKinds = new Set(facts.map((f) => f.kind));
  const mergedFacts = [...facts, ...contextFacts.filter((f) => !factKinds.has(f.kind))].slice(0, 10);

  // 数値から起こす条件は、定型表現で既に読めている軸だけ避ける。
  // (事実として読めている軸を避けてしまうと、数値が助言の並べ替えに効かなくなる)
  const cueAxes = new Set<SituationAxis>(conditions.map((c) => c.condition.axis));
  const derived = conditionsFromFacts(mergedFacts, cueAxes);
  const covered = new Set<SituationAxis>(cueAxes);
  for (const f of mergedFacts) if (f.axis) covered.add(f.axis);
  for (const d of derived) covered.add(d.condition.axis);
  const fromContext = contextConditions.filter((c) => {
    if (covered.has(c.condition.axis)) return false;
    covered.add(c.condition.axis);
    return true;
  });

  const allConditions = [...conditions, ...derived, ...fromContext];
  const unknownAxes = (Object.keys(SITUATION_AXIS_LABELS) as SituationAxis[]).filter(
    (a) => !covered.has(a),
  );
  return {
    clauses: effective,
    positiveText,
    negatedText,
    hasNegation: effective.some((c) => c.negated),
    hedged: effective.filter((c) => c.hedged),
    conditions: allConditions,
    facts: mergedFacts,
    unknownAxes,
    combos: matchConditionCombos(allConditions),
    terms: extractSituationTerms(positiveText),
    contextTerms: contextText.length >= 3 ? extractSituationTerms(contextText) : [],
  };
}

/**
 * ルールが持つ項目を、状況との関連が強い順に並べ替えて先頭から返す。
 *
 * 位置で切ると入力に関係なく同じ項目が出てしまうので、
 * (1) 状況文の内容語、(2) 一致したキーワード、(3) 条件の favor / avoid で重み付けする。
 * どれにも当たらなければ元の順序を保つので、短い相談文でも従来どおりの並びになる。
 */
export function rankByRelevance(
  items: Bilingual[],
  reading: SituationReading,
  extraTerms: string[],
  limit: number,
): Bilingual[] {
  if (limit <= 0) return [];
  if (items.length <= 1) return items.slice(0, limit);
  const scored = items.map((item, index) => {
    const hay = `${item.ja} ${item.en}`.toLowerCase();
    let score = 0;
    for (const t of reading.terms) if (hay.includes(t)) score += 2;
    // 案件側の語は弱く効かせる(相談文で言われたことを上回らせない)
    for (const t of reading.contextTerms ?? []) if (hay.includes(t)) score += 1;
    for (const t of extraTerms) {
      const v = t.toLowerCase();
      if (v.length >= 2 && hay.includes(v)) score += 2;
    }
    for (const d of reading.conditions) {
      for (const f of d.condition.favor) if (hay.includes(f.toLowerCase())) score += 3;
      for (const a of d.condition.avoid) if (hay.includes(a.toLowerCase())) score -= 4;
    }
    return { item, index, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * 数値から読み取った事実に対する助言。
 * 条件由来の助言より先に出す — 金額・日付・人数は、形容詞より具体的に効く。
 */
export function factAdvice(facts: readonly SituationFact[], limit = 4): Bilingual[] {
  const out: Bilingual[] = [];
  const seen = new Set<string>();
  const order: SituationFactKind[] = ['deadline', 'budget', 'capacity', 'ratio'];
  for (const kind of order) {
    for (const f of facts) {
      if (f.kind !== kind || !f.advice || out.length >= limit) continue;
      if (seen.has(f.advice.ja)) continue;
      seen.add(f.advice.ja);
      out.push(f.advice);
    }
  }
  return out;
}

/** 条件から出す助言をまとめる(数が増えすぎないよう上限を掛ける) */
export function situationAdvice(
  reading: SituationReading,
  actionLimit = 5,
  questionLimit = 4,
): { actions: Bilingual[]; questions: Bilingual[] } {
  const actions: Bilingual[] = [];
  const questions: Bilingual[] = [];
  const seenA = new Set<string>();
  const seenQ = new Set<string>();
  // 条件ごとに 1 件ずつ拾ってから 2 件目に回る(1 つの条件で枠を使い切らせない)
  const maxDepth = Math.max(
    0,
    ...reading.conditions.map((c) => Math.max(c.condition.actions.length, c.condition.questions.length)),
  );
  for (let depth = 0; depth < maxDepth; depth += 1) {
    for (const d of reading.conditions) {
      const a = d.condition.actions[depth];
      if (a && !seenA.has(a.ja) && actions.length < actionLimit) {
        seenA.add(a.ja);
        actions.push(a);
      }
      const q = d.condition.questions[depth];
      if (q && !seenQ.has(q.ja) && questions.length < questionLimit) {
        seenQ.add(q.ja);
        questions.push(q);
      }
    }
  }
  return { actions, questions };
}
