/**
 * 用語集 / Glossary.
 * EA 実務で頻出する用語の独自定義。標準の定義文の転載はしない。
 */

import type { GlossaryTerm } from './types.js';

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'enterprise-architecture',
    term: { ja: 'エンタープライズアーキテクチャ(EA)', en: 'Enterprise Architecture (EA)' },
    definition: {
      ja: '組織の事業・情報・システム・技術の構造と、その相互関係を全体として設計・管理する営み。個別最適の集合ではなく、組織としての一貫性と変化への対応力を作ることが目的。',
      en: 'The practice of designing and managing the structure of an organization\'s business, information, systems, and technology as a whole. The aim is organizational coherence and adaptability, not a collection of locally optimal solutions.',
    },
    keywords: ['ea', 'エンタープライズアーキテクチャ', '全体最適'],
  },
  {
    id: 'adm',
    term: { ja: 'ADM(アーキテクチャ開発手法)', en: 'ADM (Architecture Development Method)' },
    definition: {
      ja: 'TOGAF の中核をなす反復型の進め方。予備フェーズと A〜H の各フェーズ、および中心に置かれる要件管理から構成される。上から順に一度だけ流す手順書ではなく、反復して回す循環として使う。',
      en: 'The iterative method at the core of TOGAF: a Preliminary Phase, Phases A through H, and Requirements Management at the centre. It is a cycle to be iterated, not a one-pass procedure to run top to bottom.',
    },
    keywords: ['adm', 'architecture development method', 'アーキテクチャ開発手法', 'サイクル'],
  },
  {
    id: 'architecture-domains',
    term: { ja: 'アーキテクチャドメイン(BDAT)', en: 'Architecture Domains (BDAT)' },
    definition: {
      ja: 'アーキテクチャを扱う 4 つの層 — ビジネス(Business)、データ(Data)、アプリケーション(Application)、テクノロジー(Technology)。頭文字を取って BDAT と呼ぶ。',
      en: 'The four layers architecture is described in: Business, Data, Application, and Technology — hence BDAT.',
    },
    keywords: ['bdat', 'domain', 'ドメイン', 'ビジネス', 'データ', 'アプリケーション', 'テクノロジー'],
  },
  {
    id: 'baseline-architecture',
    term: { ja: 'ベースラインアーキテクチャ(現行)', en: 'Baseline Architecture' },
    definition: {
      ja: '変革前の、現時点で存在するアーキテクチャ。「現行」「As-Is」とも呼ぶ。ギャップ分析の出発点だが、記述は目標を語るのに必要な粒度に留めるのが実務上の鉄則。',
      en: 'The architecture as it exists today, before the change — also called as-is. It is the starting point for gap analysis, but the practical rule is to describe it only as deeply as the target discussion requires.',
    },
    keywords: ['baseline', 'ベースライン', '現行', 'as-is', '現状'],
  },
  {
    id: 'target-architecture',
    term: { ja: 'ターゲットアーキテクチャ(目標)', en: 'Target Architecture' },
    definition: {
      ja: '変革によって到達したいアーキテクチャ。「目標」「To-Be」とも呼ぶ。到達時期と、到達したかどうかを判定する条件を伴って初めて意味を持つ。',
      en: 'The architecture the change is meant to reach — also called to-be. It only becomes meaningful when paired with a target date and the criteria for judging arrival.',
    },
    keywords: ['target', 'ターゲット', '目標', 'to-be', '将来像'],
  },
  {
    id: 'transition-architecture-term',
    term: { ja: '移行アーキテクチャ', en: 'Transition Architecture' },
    definition: {
      ja: '現行と目標の間に実際に到達・運用される中間状態。各中間状態が単独で事業価値を出せることが条件。ここが満たせない計画は、予算が切れた時点で負債になる。',
      en: 'An intermediate state that is actually reached and operated between baseline and target. Each must deliver value on its own; a plan that fails this test turns into debt the moment funding stops.',
    },
    keywords: ['transition', '移行', '中間状態', 'interim'],
  },
  {
    id: 'abb',
    term: { ja: 'アーキテクチャ構成要素(ABB)', en: 'Architecture Building Block (ABB)' },
    definition: {
      ja: '製品や実装から独立した、論理的な機能のまとまり。「何が必要か」を製品に依存せずに表現するための単位。例: 「認証サービス」。',
      en: 'A logical unit of capability, independent of any product or implementation — the way to express what is needed without naming how. Example: "authentication service".',
    },
    keywords: ['abb', 'building block', '構成要素', '論理', 'ビルディングブロック'],
  },
  {
    id: 'sbb',
    term: { ja: 'ソリューション構成要素(SBB)', en: 'Solution Building Block (SBB)' },
    definition: {
      ja: 'ABB を実際に満たす具体的な実装・製品。例: ABB「認証サービス」に対する SBB「特定の ID 管理製品」。ABB と SBB を分けることで、製品を替えてもアーキテクチャが壊れない。',
      en: 'The concrete implementation or product that realizes an ABB — for instance a specific identity product realizing the "authentication service" ABB. Separating the two lets you swap products without breaking the architecture.',
    },
    keywords: ['sbb', 'solution building block', 'ソリューション構成要素', '製品', '実装'],
  },
  {
    id: 'stakeholder',
    term: { ja: 'ステークホルダー', en: 'Stakeholder' },
    definition: {
      ja: 'アーキテクチャに関心を持つ、あるいは影響を受ける個人・グループ・組織。役職ではなく「何を心配しているか」で分類するのが実務上有効。',
      en: 'Any individual, group, or organization with an interest in — or affected by — the architecture. In practice it pays to classify them by what they are worried about, not by job title.',
    },
    keywords: ['stakeholder', 'ステークホルダー', '関係者'],
  },
  {
    id: 'concern',
    term: { ja: '関心事(コンサーン)', en: 'Concern' },
    definition: {
      ja: 'ステークホルダーがアーキテクチャに対して抱く関心・懸念。「性能」のような一般語ではなく「月末処理が 6 時間以内に終わること」のように具体化して初めて設計に効く。',
      en: 'What a stakeholder cares or worries about regarding the architecture. It only shapes design once made concrete — not "performance" but "month-end must finish within six hours".',
    },
    keywords: ['concern', '関心事', '懸念', '要望'],
  },
  {
    id: 'view',
    term: { ja: 'ビュー', en: 'View' },
    definition: {
      ja: '特定のステークホルダーの関心事に答えるために切り出したアーキテクチャの表現。同じアーキテクチャでも、見る人によって見せ方を変えるのが正しい。',
      en: 'A representation of the architecture cut to answer a particular stakeholder\'s concerns. The same architecture should be shown differently to different audiences — that is the point.',
    },
    keywords: ['view', 'ビュー', '表現', '図'],
  },
  {
    id: 'viewpoint',
    term: { ja: 'ビューポイント', en: 'Viewpoint' },
    definition: {
      ja: 'ビューを作るための「型」。どの要素を、どの記法で、どの関心事に向けて描くかの規約。ビューが実物、ビューポイントがその設計図にあたる。',
      en: 'The template for building a view: which elements, in which notation, addressing which concerns. The view is the instance; the viewpoint is its specification.',
    },
    keywords: ['viewpoint', 'ビューポイント', '記法', 'テンプレート'],
  },
  {
    id: 'architecture-principle-term',
    term: { ja: 'アーキテクチャ原則', en: 'Architecture Principle' },
    definition: {
      ja: '判断を一貫させるために組織として合意した基準。名称・記述・根拠・含意の 4 点で書く。含意(何を諦めるか)が書けないものは原則になっていない。',
      en: 'An agreed criterion that keeps judgements consistent, written as name, statement, rationale, and implications. If you cannot state the implications — what you give up — it is not yet a principle.',
    },
    keywords: ['principle', '原則', '判断基準'],
  },
  {
    id: 'architecture-governance-term',
    term: { ja: 'アーキテクチャガバナンス', en: 'Architecture Governance' },
    definition: {
      ja: 'アーキテクチャに関する意思決定・統制・説明責任の仕組み。委員会、レビュー、適合性評価、例外管理、リポジトリ管理をセットで運用する。',
      en: 'The machinery of decision rights, control, and accountability for architecture: board, reviews, conformance assessment, exception handling, and repository management, run as one set.',
    },
    keywords: ['governance', 'ガバナンス', '統制'],
  },
  {
    id: 'architecture-board',
    term: { ja: 'アーキテクチャボード(委員会)', en: 'Architecture Board' },
    definition: {
      ja: 'アーキテクチャに関する決定を下し、逸脱の是正や例外承認を判断する会議体。決定権を持たない助言機関にすると、誰も議題を持ち込まなくなる。',
      en: 'The body that decides architecture matters and rules on remediation and exceptions. Reduce it to an advisory group with no decision rights and nobody brings it anything.',
    },
    keywords: ['board', 'ボード', '委員会', '会議体'],
  },
  {
    id: 'architecture-contract-term',
    term: { ja: 'アーキテクチャ契約', en: 'Architecture Contract' },
    definition: {
      ja: 'アーキテクチャ機能と実装チーム・供給者の間で、守るべき取り決めを合意した文書。フェーズ G のガバナンスに実効性を与える。',
      en: 'The agreed document of architectural commitments between the architecture function and a delivery team or supplier. It is what gives Phase G governance teeth.',
    },
    keywords: ['contract', '契約', 'ベンダー'],
  },
  {
    id: 'architecture-compliance',
    term: { ja: 'アーキテクチャ適合性', en: 'Architecture Compliance' },
    definition: {
      ja: '実装が定義されたアーキテクチャに沿っている度合い。「準拠 / 一部準拠 / 非準拠 / 非適合」のように段階で判定し、二値にしない。',
      en: 'The degree to which an implementation follows the defined architecture. Rate it on a scale — conformant, partially conformant, non-conformant, irreconcilable — never as a binary.',
    },
    keywords: ['compliance', '適合性', '準拠', 'conformance'],
  },
  {
    id: 'architecture-repository-term',
    term: { ja: 'アーキテクチャリポジトリ', en: 'Architecture Repository' },
    definition: {
      ja: '成果物・標準・参照モデル・決定記録を保管し再利用可能にする仕組み。検索できない、命名規則がないリポジトリは存在しないのと同じ。',
      en: 'The store that keeps deliverables, standards, reference models, and decision records reusable. Without search and naming conventions, it effectively does not exist.',
    },
    keywords: ['repository', 'リポジトリ', '保管'],
  },
  {
    id: 'enterprise-continuum',
    term: { ja: 'エンタープライズコンティニュアム', en: 'Enterprise Continuum' },
    definition: {
      ja: '汎用的なものから組織固有のものまで、アーキテクチャ資産を連続体として整理する考え方。「業界共通の型をどこまで使い、どこから自社固有にするか」を議論する枠組み。',
      en: 'A way of organizing architecture assets along a continuum from generic to organization-specific. It frames the question of how far to reuse industry patterns before going bespoke.',
    },
    keywords: ['continuum', 'コンティニュアム', '連続体', '再利用'],
  },
  {
    id: 'architecture-landscape',
    term: { ja: 'アーキテクチャランドスケープ', en: 'Architecture Landscape' },
    definition: {
      ja: '組織が現に保持しているアーキテクチャ記述の全体像。戦略・セグメント・能力の各レベルで、粒度を変えて管理する。',
      en: 'The overall picture of the architecture descriptions an organization actually holds, managed at different granularities: strategic, segment, and capability levels.',
    },
    keywords: ['landscape', 'ランドスケープ', '全体像', 'セグメント'],
  },
  {
    id: 'architecture-partitioning',
    term: { ja: 'アーキテクチャの分割', en: 'Architecture Partitioning' },
    definition: {
      ja: '大きすぎるアーキテクチャを、対象範囲・詳細度・時間軸・組織単位で分割して扱えるようにすること。分割しないまま全社を一度に描こうとする試みは、ほぼ必ず頓挫する。',
      en: 'Splitting an unmanageably large architecture by subject, level of detail, time horizon, and organizational unit. Attempts to draw the whole enterprise at once, unpartitioned, almost always collapse.',
    },
    keywords: ['partitioning', '分割', 'セグメント', 'スコープ'],
  },
  {
    id: 'gap-analysis-term',
    term: { ja: 'ギャップ分析', en: 'Gap Analysis' },
    definition: {
      ja: '現行と目標を同じ切り口で比較し、不足するもの・不要になるものを洗い出す技法。「廃止側」を書かないと、増える話ばかりになる。',
      en: 'Comparing baseline and target on the same dimensions to surface what is missing and what becomes obsolete. Omit the elimination side and everything turns additive.',
    },
    keywords: ['gap', 'ギャップ', '差分'],
  },
  {
    id: 'work-package',
    term: { ja: '作業パッケージ', en: 'Work Package' },
    definition: {
      ja: 'ギャップを埋めるためにまとめた実行単位。1 チームが 3〜6 か月で完了できる規模を目安にすると、進捗が見え、途中で軌道修正できる。',
      en: 'A unit of execution that bundles gaps to be closed. Sized so one team finishes in three to six months, progress stays visible and course correction stays possible.',
    },
    keywords: ['work package', '作業パッケージ', '実行単位'],
  },
  {
    id: 'capability',
    term: { ja: 'ビジネス能力(ケイパビリティ)', en: 'Business Capability' },
    definition: {
      ja: '事業が「何をできるか」を表す単位。プロセス(どうやるか)や組織(誰がやるか)とは独立しているため、組織再編が起きても壊れにくい。',
      en: 'A unit expressing what the business is able to do. Being independent of process (how) and organization (who), it survives reorgs largely intact.',
    },
    keywords: ['capability', '能力', 'ケイパビリティ'],
  },
  {
    id: 'capability-increment',
    term: { ja: '能力増分', en: 'Capability Increment' },
    definition: {
      ja: 'ある能力を一段階引き上げる、まとまった投資単位。ロードマップ上で「この四半期に何ができるようになるのか」を語るための単位になる。',
      en: 'A bundled investment that raises a capability by one level. On a roadmap it is the unit that answers "what will we be able to do by this quarter?"',
    },
    keywords: ['increment', '増分', '能力', '投資単位'],
  },
  {
    id: 'value-stream',
    term: { ja: 'バリューストリーム', en: 'Value Stream' },
    definition: {
      ja: '顧客や利害関係者に価値が届くまでの一連の活動の連なり。能力が「何ができるか」なのに対し、バリューストリームは「価値がどう流れるか」を表す。',
      en: 'The end-to-end sequence of activities through which value reaches a customer or stakeholder. Where capability says what you can do, a value stream says how value flows.',
    },
    keywords: ['value stream', 'バリューストリーム', '価値', '流れ'],
  },
  {
    id: 'business-scenario-term',
    term: { ja: 'ビジネスシナリオ', en: 'Business Scenario' },
    definition: {
      ja: '課題・登場人物・現状のやり取り・解決後の姿を具体的な物語として書き、要件を導出する手法。抽象的な要求を検証可能な要件に変える。',
      en: 'A concrete story — problem, actors, current interaction, post-solution interaction — used to derive requirements. It turns abstract asks into testable requirements.',
    },
    keywords: ['scenario', 'シナリオ', '要件抽出'],
  },
  {
    id: 'requirements-management-term',
    term: { ja: '要件管理', en: 'Requirements Management' },
    definition: {
      ja: 'ADM の中心に置かれ、全フェーズで要件の受付・保管・影響評価・差し戻しを行う継続的なプロセス。フェーズではなく常時動いている活動である点が要点。',
      en: 'The continuous process at the centre of the ADM that receives, stores, impact-assesses, and dispatches requirements across all phases. The key point is that it always runs; it is not a phase you pass through.',
    },
    keywords: ['requirements management', '要件管理', 'rm'],
  },
  {
    id: 'traceability',
    term: { ja: 'トレーサビリティ', en: 'Traceability' },
    definition: {
      ja: '要件がどの成果物・どの実装に反映されたかを辿れる状態。逆に「この設計は何の要件から来たのか」も辿れる必要がある。',
      en: 'The ability to trace a requirement through to the deliverables and implementation that satisfy it — and, in the other direction, to ask which requirement a given design element came from.',
    },
    keywords: ['traceability', 'トレーサビリティ', '追跡'],
  },
  {
    id: 'interoperability-term',
    term: { ja: '相互運用性', en: 'Interoperability' },
    definition: {
      ja: '組織やシステムの間で情報がどれだけ滑らかに流れるかの度合い。技術的に接続されていること(API がある)と、意味が揃っていることは別物。',
      en: 'How smoothly information flows between organizations and systems. Being technically connected — having an API — is not the same as sharing meaning.',
    },
    keywords: ['interoperability', '相互運用性', '連携'],
  },
  {
    id: 'reference-model',
    term: { ja: '参照モデル', en: 'Reference Model' },
    definition: {
      ja: '特定の領域について、汎用的に整理された構造の雛形。ゼロから設計せずに済ませるための出発点であり、そのまま使うものではなく自組織に合わせて削る前提で使う。',
      en: 'A generic structural template for a domain. It exists so you do not start from a blank page — and it is meant to be trimmed to your organization, not adopted verbatim.',
    },
    keywords: ['reference model', '参照モデル', 'trm', '雛形'],
  },
  {
    id: 'deliverable-artifact',
    term: { ja: '成果物と作成物(Deliverable / Artifact)', en: 'Deliverable vs. Artifact' },
    definition: {
      ja: '成果物(Deliverable)は契約上・承認上の単位で、レビューを受けて正式に合意されるもの。作成物(Artifact)はその中身を構成する個々のカタログ・マトリクス・図。',
      en: 'A deliverable is a contractual unit that gets reviewed and formally agreed. An artifact is one of the catalogs, matrices, or diagrams that make up its content.',
    },
    keywords: ['deliverable', 'artifact', '成果物', '作成物', 'カタログ', 'マトリクス'],
  },
  {
    id: 'residual-risk',
    term: { ja: '残存リスク', en: 'Residual Risk' },
    definition: {
      ja: '緩和策を実施した後になお残るリスク。受容する場合は、必ず個人名で受容者を記録する。「組織として受容」は責任の所在を消す。',
      en: 'The risk that remains after mitigation. If it is accepted, record a named individual as the acceptor — "accepted by the organization" erases accountability.',
    },
    keywords: ['residual risk', '残存リスク', '受容', 'リスク'],
  },
  {
    id: 'iteration',
    term: { ja: 'ADM の反復(イテレーション)', en: 'ADM Iteration' },
    definition: {
      ja: 'ADM をフェーズ順に一度流すのではなく、範囲や深さを変えて何周も回す進め方。全社を粗く 1 周してから、重要領域を深く回す、といった使い方をする。',
      en: 'Running the ADM as repeated cycles at varying scope and depth rather than a single pass. A common pattern is one coarse pass over the enterprise, then deeper cycles on the areas that matter.',
    },
    keywords: ['iteration', '反復', 'イテレーション', 'サイクル'],
  },
  {
    id: 'architecture-vision-term',
    term: { ja: 'アーキテクチャビジョン', en: 'Architecture Vision' },
    definition: {
      ja: 'フェーズ A で作る、目指す姿の概要。経営層が投資判断できる粒度であることが要件で、詳細設計ではない。',
      en: 'The high-level target picture produced in Phase A. Its requirement is to be granular enough for an executive investment decision — it is not detailed design.',
    },
    keywords: ['vision', 'ビジョン', '将来像'],
  },
];

export function findTerm(id: string): GlossaryTerm | undefined {
  const key = id.trim().toLowerCase();
  return (
    GLOSSARY.find((t) => t.id === key) ??
    GLOSSARY.find((t) => t.term.en.toLowerCase() === key || t.term.ja === id.trim())
  );
}
