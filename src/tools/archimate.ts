/**
 * ArchiMate 連携ツール / ArchiMate bridge tools.
 *
 * TOGAF ADM(手法)と ArchiMate(記述言語)をつなぐ。
 * 「このフェーズで何をどの層のどの要素で描くのか」「その関係の引き方は意味的に妥当か」
 * 「この関心事にはどんな図を描けばよいか」に、表と図で即答することを目的にする。
 *
 * 本ファイルの要素名・関係名・層名は名称という事実情報のみを扱い、
 * 解説はすべて実務上の使い方・失敗の仕方という独自の観点で書いている。
 * 仕様書の定義文・許可関係表の複製は行わない。
 *
 * 注: このファイルが持つ要素表は「関係の妥当性を判定する」ための分類
 * (aspect: 担い手 / 振る舞い / 対象物 …)であり、参照用の解説は
 * `src/knowledge/archimate.ts` が単一の情報源として持つ。両者が食い違うと
 * 同じ概念を二通りに教えることになるため、`tests/archimate.test.ts` が
 * 要素 ID・名称・層の一致を機械的に検査している。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ADM_PHASES,
  findPhase,
  matchesKeyword,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import { errorResult, langSchema, msg, textResult } from './common.js';

/* ------------------------------------------------------------------ *
 * 型定義
 * ------------------------------------------------------------------ */

/** ArchiMate の層 ID。7 層 + 分類しない補助要素用の 'other'。 */
type LayerId =
  | 'motivation'
  | 'strategy'
  | 'business'
  | 'application'
  | 'technology'
  | 'physical'
  | 'implementation';

/**
 * 要素の性質。関係の妥当性判定はこの区分で行う。
 * - active: 振る舞いの担い手(人・組織・部品・機器)
 * - behavior: 起きること(プロセス・機能・サービス・イベント)
 * - passive: 扱われるもの(業務上の情報・データ・成果物ファイル・材料)
 * - motivation: 意図(誰が・なぜ・何を目指すか)
 * - milestone: 時点や差分を表すもの(Plateau / Gap)
 */
type Aspect = 'active' | 'behavior' | 'passive' | 'motivation' | 'milestone';

interface ArchiLayer {
  id: LayerId;
  /** 積み上げ 5 層の上下位置。横断層(動機・実装移行)は undefined */
  stackOrder?: number;
  name: Bilingual;
  /** この層が答える問い */
  question: Bilingual;
  /** 何を表す層か(独自の説明) */
  represents: Bilingual;
  /** 主に使う ADM フェーズ ID */
  admPhaseIds: string[];
  /** この層でいちばん多い失敗 */
  pitfall: Bilingual;
  /** 代表要素の ID */
  elementIds: string[];
}

interface ArchiElement {
  id: string;
  /** 要素名(ArchiMate の名称。事実情報) */
  name: string;
  /** 日本語での通称 */
  ja: string;
  layer: LayerId;
  aspect: Aspect;
  /** 表記ゆれの吸収用 */
  aliases: string[];
  /** 実務メモ(独自) */
  note: Bilingual;
}

interface ArchiRelationship {
  id: string;
  name: Bilingual;
  /** テキストでの矢印表記 */
  arrow: string;
  aliases: string[];
  /** どういう意味で使うか(独自の言い換え) */
  meaning: Bilingual;
  /** これで描くと良いもの */
  goodUse: Bilingual;
  /** よくある誤用 */
  misuse: Bilingual;
}

/* ------------------------------------------------------------------ *
 * 層
 * ------------------------------------------------------------------ */

const LAYERS: ArchiLayer[] = [
  {
    id: 'motivation',
    name: { ja: '動機層', en: 'Motivation Layer' },
    question: { ja: 'なぜこの絵になるのか', en: 'Why does the picture look like this?' },
    represents: {
      ja: '関係者の立場と、そこから出てくる狙い・評価・決めごとを置く層。ここが空のモデルは「絵はきれいだが投資判断に使えない」状態になる。逆にここだけ厚くしても現場は動かない。',
      en: 'Holds who has a stake, what they are trying to achieve, how the current situation is judged, and what has been fixed as a rule. A model with this layer empty looks tidy but cannot support a funding decision; a model with only this layer changes nothing on the ground.',
    },
    admPhaseIds: ['preliminary', 'a', 'g', 'h', 'requirements-management'],
    pitfall: {
      ja: '目標(Goal)に直接いろいろ繋いでしまい、達成したかどうかを測れなくなる。測れる Outcome を必ず 1 段挟む。',
      en: 'Everything gets wired straight to a Goal, so nobody can tell whether it was met. Always insert one measurable Outcome in between.',
    },
    elementIds: ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'principle', 'requirement', 'constraint'],
  },
  {
    id: 'strategy',
    stackOrder: 0,
    name: { ja: '戦略層', en: 'Strategy Layer' },
    question: { ja: '何ができる会社であるべきか', en: 'What must this organization be able to do?' },
    represents: {
      ja: '組織が持つ / 持つべき能力と、それを支える資源、価値の流れを、実装手段から切り離して置く層。経営と会話するための唯一の共通言語になりやすい。',
      en: 'What the organization can do, what it holds to do it, and how value flows — deliberately separated from any implementation. In practice this is the layer executives will actually read.',
    },
    admPhaseIds: ['a', 'b', 'e'],
    pitfall: {
      ja: 'Capability を部署名や製品名で書いてしまう。能力は組織図が変わっても名前が変わらない粒度で書く。',
      en: 'Capabilities get named after departments or products. Name them so the name survives the next reorg.',
    },
    elementIds: ['capability', 'resource', 'course-of-action', 'value-stream'],
  },
  {
    id: 'business',
    stackOrder: 1,
    name: { ja: 'ビジネス層', en: 'Business Layer' },
    question: { ja: '誰が何をどの順にやっているか', en: 'Who does what, in what order?' },
    represents: {
      ja: '人と組織の役割、業務の流れ、外に見えている業務サービス、業務が扱う情報を置く層。システム名を一切出さずに描き切れるかどうかが、この層の品質の目安になる。',
      en: 'Roles, the flow of work, the services the outside world consumes, and the information the work handles. A good test of quality: can you finish the picture without naming a single system?',
    },
    admPhaseIds: ['b', 'g', 'h'],
    pitfall: {
      ja: '組織図をそのまま Business Actor で並べて終わりにする。Actor だけでは業務は説明できない。振る舞い(Process / Function / Service)を先に描き、後から担い手を割り当てる。',
      en: 'The org chart gets copied in as Business Actors and the work stops there. Actors alone explain nothing — draw the behaviour first, then assign who performs it.',
    },
    elementIds: [
      'business-actor',
      'business-role',
      'business-collaboration',
      'business-process',
      'business-function',
      'business-service',
      'business-interface',
      'business-event',
      'business-object',
    ],
  },
  {
    id: 'application',
    stackOrder: 2,
    name: { ja: 'アプリケーション層', en: 'Application Layer' },
    question: { ja: 'どのシステムが何を提供し、どこで重複しているか', en: 'Which systems provide what, and where do they overlap?' },
    represents: {
      ja: 'ソフトウェアの塊と、それが外に出しているサービス、システム間の接点、扱うデータを置く層。棚卸しの表(アプリ台帳)はここから出力するものであって、別途手で作るものではない。',
      en: 'Units of software, the services they expose, the contact points between them, and the data they hold. Your application portfolio spreadsheet should be an export of this layer, not a separately maintained document.',
    },
    admPhaseIds: ['c', 'e', 'h'],
    pitfall: {
      ja: '1 枚に 50 個以上のコンポーネントを詰め込んで線が読めなくなる。20 個を超えたら領域で図を割る。',
      en: 'Fifty-plus components on one canvas and the lines become unreadable. Past twenty, split the view by domain.',
    },
    elementIds: [
      'application-component',
      'application-collaboration',
      'application-service',
      'application-function',
      'application-process',
      'application-interface',
      'data-object',
    ],
  },
  {
    id: 'technology',
    stackOrder: 3,
    name: { ja: 'テクノロジー層', en: 'Technology Layer' },
    question: { ja: 'どこで動き、止まったら何が困るか', en: 'Where does it run, and what breaks when it stops?' },
    represents: {
      ja: '実行基盤・ミドルウェア・配置物・ネットワークを置く層。目的は構成管理ではなく「止まったときの影響を上の層まで辿れること」。CMDB の代わりにしようとすると必ず腐る。',
      en: 'Runtime platforms, middleware, deployed artifacts, and networks. The point is not configuration management but being able to trace an outage upward through the layers. Try to make it a CMDB and it will rot.',
    },
    admPhaseIds: ['d', 'e', 'g'],
    pitfall: {
      ja: 'ホスト名や IP を全量書いて更新が追いつかなくなる。モデルには「役割の違うノード」だけを残し、実物の台帳は別に持つ。',
      en: 'Every hostname and IP gets entered and maintenance collapses. Keep only nodes that differ in role; leave the real inventory to a real inventory tool.',
    },
    elementIds: [
      'node',
      'device',
      'system-software',
      'technology-service',
      'technology-function',
      'artifact',
      'communication-network',
      'path',
    ],
  },
  {
    id: 'physical',
    stackOrder: 4,
    name: { ja: '物理層', en: 'Physical Layer' },
    question: { ja: 'モノと場所はどうなっているか', en: 'What about the physical things and places?' },
    represents: {
      ja: '設備・装置・物流網・材料を置く層。製造・物流・エネルギー・医療など「モノが動く」業界でのみ本領を発揮する。純粋な情報系の案件では使わない判断が正しい。',
      en: 'Equipment, facilities, distribution networks, and materials. It earns its keep in manufacturing, logistics, energy, and healthcare — where physical things move. On a pure information-systems engagement, choosing not to use it is the right call.',
    },
    admPhaseIds: ['b', 'd'],
    pitfall: {
      ja: '使う必要がないのに「7 層あるから全部埋めよう」として、意味のない設備要素を作る。使わない層は空でよい。',
      en: 'People fill it in because "there are seven layers" and produce equipment elements nobody reads. An unused layer should stay empty.',
    },
    elementIds: ['equipment', 'facility', 'distribution-network', 'material'],
  },
  {
    id: 'implementation',
    name: { ja: '実装・移行層', en: 'Implementation & Migration Layer' },
    question: { ja: 'いつ誰が何を作り、どの時点でどうなっているか', en: 'Who builds what, when, and what does the world look like at each step?' },
    represents: {
      ja: '作業のまとまり、そこから出る納品物、そして「その時点で稼働している状態」を表す層。ここを使わないと現行と目標が別ファイルに散らばり、差分が取れなくなる。ロードマップを絵にできるのはこの層のおかげ。',
      en: 'Chunks of work, what they hand over, and the state of the world at each step. Without it, baseline and target end up in separate files and the delta becomes uncomputable. This layer is what makes a roadmap drawable.',
    },
    admPhaseIds: ['e', 'f', 'g', 'h'],
    pitfall: {
      ja: 'Plateau を 6 個も 7 個も作る。3〜4 個(現行 / 移行 1〜2 / 目標)を超えると誰も維持しない。',
      en: 'Six or seven Plateaus get defined. Beyond three or four (baseline, one or two transitions, target) nobody maintains them.',
    },
    elementIds: ['work-package', 'deliverable', 'implementation-event', 'plateau', 'gap'],
  },
];

function findLayer(id: LayerId): ArchiLayer | undefined {
  return LAYERS.find((l) => l.id === id);
}

/* ------------------------------------------------------------------ *
 * 要素
 * ------------------------------------------------------------------ */

/** 関係判定用の要素表。参照解説は knowledge/archimate.ts 側が持つ(整合はテストで担保) */
export const ELEMENTS: ArchiElement[] = [
  // --- 動機 ---
  {
    id: 'stakeholder', name: 'Stakeholder', ja: 'ステークホルダー',
    layer: 'motivation', aspect: 'motivation', aliases: ['stake holder', '利害関係者', '関係者'],
    note: {
      ja: '役職名ではなく「立場」で書く。同じ人が二つの立場を持つなら二つ作る。',
      en: 'Name the stance, not the job title. If one person holds two stances, create two elements.',
    },
  },
  {
    id: 'driver', name: 'Driver', ja: 'ドライバー(動因)',
    layer: 'motivation', aspect: 'motivation', aliases: ['動因', '推進要因', 'ドライバ'],
    note: {
      ja: '外圧・内圧の名前。「コスト」「規制対応」のように名詞で置き、良し悪しの判断は Assessment に分ける。',
      en: 'The pressure itself, as a noun: cost, regulatory exposure. Keep the judgement of it in an Assessment.',
    },
  },
  {
    id: 'assessment', name: 'Assessment', ja: '評価(現状認識)',
    layer: 'motivation', aspect: 'motivation', aliases: ['評価', '現状分析', '課題'],
    note: {
      ja: '現状に対する診断。ここに課題を書いておくと、後で「その課題は解けたのか」を追える。',
      en: 'The diagnosis of today. Putting the pain here is what lets you later ask whether the pain went away.',
    },
  },
  {
    id: 'goal', name: 'Goal', ja: '目標',
    layer: 'motivation', aspect: 'motivation', aliases: ['ゴール', '目的', '狙い'],
    note: {
      ja: '方向性。数値は入れない。数値は Outcome に置く。',
      en: 'A direction. Keep numbers out of it — numbers belong on the Outcome.',
    },
  },
  {
    id: 'outcome', name: 'Outcome', ja: '成果(測れる結果)',
    layer: 'motivation', aspect: 'motivation', aliases: ['成果', '結果', 'kpi', '効果'],
    note: {
      ja: '達成判定ができる粒度の結果。ここが無い動機層は、後から効果測定できない。',
      en: 'A result you can actually check off. Without it, the motivation layer cannot be evaluated later.',
    },
  },
  {
    id: 'principle', name: 'Principle', ja: '原則',
    layer: 'motivation', aspect: 'motivation', aliases: ['原則', 'アーキテクチャ原則', 'ポリシー'],
    note: {
      ja: '個別案件をまたいで効く決めごと。守ることで何を諦めるかを書けない原則は原則ではない。',
      en: 'A decision that outlives any single project. If you cannot state what it costs you to follow it, it is not a principle.',
    },
  },
  {
    id: 'requirement', name: 'Requirement', ja: '要件',
    layer: 'motivation', aspect: 'motivation', aliases: ['要件', '要求', 'requirements'],
    note: {
      ja: '満たすべきこと。解決策が書かれていたらそれは要件ではなく設計案なので、要素の種類を変える。',
      en: 'Something that must hold. If it prescribes a solution it is a design choice, not a requirement — model it differently.',
    },
  },
  {
    id: 'constraint', name: 'Constraint', ja: '制約',
    layer: 'motivation', aspect: 'motivation', aliases: ['制約', '制限', '前提条件'],
    note: {
      ja: '選択肢を狭める外的条件。「変えられないもの」と「今回は変えないもの」を混ぜない。',
      en: 'What narrows the option space. Do not mix "cannot be changed" with "we chose not to change it this time".',
    },
  },

  // --- 戦略 ---
  {
    id: 'capability', name: 'Capability', ja: 'ケイパビリティ(能力)',
    layer: 'strategy', aspect: 'behavior', aliases: ['能力', 'ケイパビリティ', 'ビジネスケイパビリティ', 'business capability'],
    note: {
      ja: '組織が「できること」。名詞で書き、2〜3 階層で止める。4 階層目からは誰も維持しない。',
      en: 'What the organization is able to do. Noun-phrased, two or three levels deep. Level four never gets maintained.',
    },
  },
  {
    id: 'resource', name: 'Resource', ja: 'リソース(資源)',
    layer: 'strategy', aspect: 'active', aliases: ['資源', 'リソース', '経営資源'],
    note: {
      ja: '能力を支える持ち物(人材・資金・システム・データ)。投資の議論はここに紐づくと具体化する。',
      en: 'What the organization holds to make a capability possible: people, money, systems, data. Investment talk gets concrete once it lands here.',
    },
  },
  {
    id: 'course-of-action', name: 'Course of Action', ja: '施策(打ち手)',
    layer: 'strategy', aspect: 'behavior', aliases: ['施策', '打ち手', '戦略施策', 'コースオブアクション'],
    note: {
      ja: '「どう攻めるか」の選択。複数案を並べて比較するときに効く。1 案しか無いなら要らない。',
      en: 'The chosen line of attack. Valuable when you are comparing options; skip it when there is only one.',
    },
  },
  {
    id: 'value-stream', name: 'Value Stream', ja: 'バリューストリーム(価値の流れ)',
    layer: 'strategy', aspect: 'behavior', aliases: ['バリューストリーム', '価値の流れ', 'バリューチェーン'],
    note: {
      ja: '顧客起点で端から端まで。部署をまたぐ分断が見えるのがこの要素の価値。組織単位で切ったら意味が消える。',
      en: 'End to end from the customer\'s side. Its whole value is exposing hand-offs across departments; cut it along org boundaries and it says nothing.',
    },
  },

  // --- ビジネス ---
  {
    id: 'business-actor', name: 'Business Actor', ja: 'ビジネスアクター(人・組織)',
    layer: 'business', aspect: 'active', aliases: ['アクター', '組織', '部署', '担当者'],
    note: {
      ja: '実在する人・組織。異動で名前が変わるので、業務の議論は Role 側でやる。',
      en: 'A real person or org unit. Names change with every reorg, so hold the discussion on the Role side.',
    },
  },
  {
    id: 'business-role', name: 'Business Role', ja: 'ビジネスロール(役割)',
    layer: 'business', aspect: 'active', aliases: ['役割', 'ロール', '職責'],
    note: {
      ja: '「誰でもよいがこの責務を負う人」。プロセスに割り当てるのは原則こちら。',
      en: 'Whoever carries this responsibility. As a rule, this is what you assign to a process — not the actor.',
    },
  },
  {
    id: 'business-collaboration', name: 'Business Collaboration', ja: 'ビジネスコラボレーション',
    layer: 'business', aspect: 'active', aliases: ['コラボレーション', '委員会', '合議体'],
    note: {
      ja: '複数の役割が組んで初めて成立する担い手。委員会や合同チームを 1 個の箱で表せる。',
      en: 'A performer that only exists when several roles team up. Lets a steering committee be a single box.',
    },
  },
  {
    id: 'business-process', name: 'Business Process', ja: 'ビジネスプロセス',
    layer: 'business', aspect: 'behavior', aliases: ['プロセス', '業務プロセス', '業務フロー'],
    note: {
      ja: '順序のある一連の仕事。「動詞+目的語」で命名する。名詞で書くと Function と区別がつかなくなる。',
      en: 'An ordered run of work. Name it verb-plus-object; a noun name makes it indistinguishable from a Function.',
    },
  },
  {
    id: 'business-function', name: 'Business Function', ja: 'ビジネスファンクション(業務機能)',
    layer: 'business', aspect: 'behavior', aliases: ['業務機能', 'ファンクション', '機能'],
    note: {
      ja: '順序ではなく「同種の仕事のまとまり」。組織横断の重複を探すときはプロセスより機能で見る方が早い。',
      en: 'Work grouped by kind rather than sequence. When hunting duplication across the org, functions surface it faster than processes.',
    },
  },
  {
    id: 'business-service', name: 'Business Service', ja: 'ビジネスサービス',
    layer: 'business', aspect: 'behavior', aliases: ['業務サービス', 'サービス'],
    note: {
      ja: '外(顧客・他部署)から見える提供物。中身の手順を知らなくても使える単位で切るのがコツ。',
      en: 'What the outside — customers, other departments — can consume. Cut it so the consumer needs to know nothing about the steps inside.',
    },
  },
  {
    id: 'business-interface', name: 'Business Interface', ja: 'ビジネスインタフェース(接点)',
    layer: 'business', aspect: 'active', aliases: ['接点', 'チャネル', '窓口'],
    note: {
      ja: '窓口・店舗・コールセンターなど、サービスに触れる場所。チャネル戦略の議論で効く。',
      en: 'The counter, the store, the call centre — where the service is touched. Pays off in channel discussions.',
    },
  },
  {
    id: 'business-event', name: 'Business Event', ja: 'ビジネスイベント',
    layer: 'business', aspect: 'behavior', aliases: ['イベント', '契機', 'トリガー'],
    note: {
      ja: '何かが始まる契機。「月次締め」「申込受領」など。プロセス図の起点を明示すると読みやすさが跳ね上がる。',
      en: 'What sets things off: month-end close, application received. Marking the trigger makes a process view far easier to read.',
    },
  },
  {
    id: 'business-object', name: 'Business Object', ja: 'ビジネスオブジェクト(業務情報)',
    layer: 'business', aspect: 'passive', aliases: ['業務情報', '業務データ', '帳票', 'エンティティ'],
    note: {
      ja: '業務側の言葉で呼ぶ情報の塊(契約、注文、患者)。システム上の Data Object と 1 対 1 にはならない。',
      en: 'Information named in business language: contract, order, patient. It will not map one-to-one onto a Data Object.',
    },
  },

  // --- アプリケーション ---
  {
    id: 'application-component', name: 'Application Component', ja: 'アプリケーションコンポーネント',
    layer: 'application', aspect: 'active', aliases: ['アプリ', 'システム', 'コンポーネント', 'application', 'app', 'アプリケーション'],
    note: {
      ja: 'ソフトウェアの塊。製品名で書いてよいが、粒度は「別々に入れ替えられる単位」に揃える。',
      en: 'A unit of software. Product names are fine, but keep the granularity at "things you could replace independently".',
    },
  },
  {
    id: 'application-collaboration', name: 'Application Collaboration', ja: 'アプリケーションコラボレーション',
    layer: 'application', aspect: 'active', aliases: ['アプリ連携体', 'システム連携体'],
    note: {
      ja: '複数コンポーネントが組んで初めて成立する塊。「連携基盤+アダプタ群」をまとめて説明したいときに使う。',
      en: 'A unit that only exists when several components cooperate — handy for describing an integration hub plus its adapters as one thing.',
    },
  },
  {
    id: 'application-service', name: 'Application Service', ja: 'アプリケーションサービス',
    layer: 'application', aspect: 'behavior', aliases: ['アプリサービス', 'システムサービス', 'api サービス'],
    note: {
      ja: '業務から見て「使える機能」。業務層と繋ぐときはコンポーネントを直結せず必ずここを通す。差し替え可能性がここに宿る。',
      en: 'What the business can actually use. Always route the link to the business layer through this instead of wiring the component directly — replaceability lives here.',
    },
  },
  {
    id: 'application-function', name: 'Application Function', ja: 'アプリケーションファンクション',
    layer: 'application', aspect: 'behavior', aliases: ['アプリ機能', 'システム機能'],
    note: {
      ja: 'コンポーネントの内部的な仕事。外に見せる Service と分けると「同じ機能を複数サービスで出している」が見える。',
      en: 'The internal work of a component. Separating it from the exposed Service reveals when one function is being sold through several services.',
    },
  },
  {
    id: 'application-process', name: 'Application Process', ja: 'アプリケーションプロセス',
    layer: 'application', aspect: 'behavior', aliases: ['アプリプロセス', 'バッチ', '自動処理'],
    note: {
      ja: '順序のあるシステム側の処理。完全自動化された業務手順を表すときはこれを使うと、業務プロセスとの対応が説明しやすい。',
      en: 'Ordered processing on the system side. When a business procedure is fully automated, this is the element that makes the correspondence explainable.',
    },
  },
  {
    id: 'application-interface', name: 'Application Interface', ja: 'アプリケーションインタフェース',
    layer: 'application', aspect: 'active', aliases: ['インタフェース', 'インターフェース', 'api', '接続点'],
    note: {
      ja: '接続の口。連携の議論では「何本あるか」より「誰が仕様を握っているか」を書き添えると価値が出る。',
      en: 'The point of connection. In integration discussions, noting who owns the contract matters more than counting the links.',
    },
  },
  {
    id: 'data-object', name: 'Data Object', ja: 'データオブジェクト',
    layer: 'application', aspect: 'passive', aliases: ['データ', 'データ実体', 'テーブル'],
    note: {
      ja: 'システムが保持する情報の単位。テーブル定義まで落とさない。落とした瞬間に更新が止まる。',
      en: 'A unit of information a system holds. Do not descend to table definitions — the moment you do, updates stop.',
    },
  },

  // --- テクノロジー ---
  {
    id: 'node', name: 'Node', ja: 'ノード',
    layer: 'technology', aspect: 'active', aliases: ['サーバ', 'サーバー', '実行環境', 'ホスト'],
    note: {
      ja: '処理や保管を担う実行資源。物理でも仮想でもクラウドサービスでもよい。役割が同じものは 1 個にまとめる。',
      en: 'Something that runs or stores. Physical, virtual, or a cloud service — all fine. Collapse things that play the same role into one.',
    },
  },
  {
    id: 'device', name: 'Device', ja: 'デバイス(機器)',
    layer: 'technology', aspect: 'active', aliases: ['機器', '端末', 'デバイス', 'ハードウェア'],
    note: {
      ja: '物理的なハードウェア。端末やゲートウェイなど「壊れると特定の場所だけ止まる」ものを区別したいときに使う。',
      en: 'Physical hardware. Use it when you need to distinguish things whose failure only takes down one location.',
    },
  },
  {
    id: 'system-software', name: 'System Software', ja: 'システムソフトウェア',
    layer: 'technology', aspect: 'active', aliases: ['ミドルウェア', 'os', 'db', 'データベース', 'ランタイム'],
    note: {
      ja: 'OS・DB・ランタイム・コンテナ基盤など。標準化の議論(採用 / 許容 / 廃止予定)はこの要素にタグを付けて進める。',
      en: 'OS, database, runtime, container platform. Run the standardization conversation by tagging these as adopted, tolerated, or sunsetting.',
    },
  },
  {
    id: 'technology-service', name: 'Technology Service', ja: 'テクノロジーサービス',
    layer: 'technology', aspect: 'behavior', aliases: ['基盤サービス', 'インフラサービス', 'プラットフォームサービス'],
    note: {
      ja: 'アプリ側から見た基盤の提供物(認証、メッセージング、ストレージ)。ここを立てておくと基盤の載せ替えが図の上で局所化する。',
      en: 'What the platform offers as seen from the application side: authentication, messaging, storage. Define these and a platform swap stays local on the diagram.',
    },
  },
  {
    id: 'technology-function', name: 'Technology Function', ja: 'テクノロジーファンクション',
    layer: 'technology', aspect: 'behavior', aliases: ['基盤機能', 'インフラ機能'],
    note: {
      ja: 'ノードの内部的な働き。運用設計まで踏み込むとき以外は省いてよい。',
      en: 'The internal working of a node. Safe to omit unless you are going into operations design.',
    },
  },
  {
    id: 'artifact', name: 'Artifact', ja: 'アーティファクト(配置物)',
    layer: 'technology', aspect: 'passive', aliases: ['成果物ファイル', '配置物', 'モジュール', 'イメージ'],
    note: {
      ja: '実際にノードへ置かれるもの(実行ファイル、コンテナイメージ、設定)。デプロイの話はこれとノードの組で描く。',
      en: 'What actually gets placed on a node: binaries, container images, configuration. Deployment conversations are drawn as this plus a node.',
    },
  },
  {
    id: 'communication-network', name: 'Communication Network', ja: 'コミュニケーションネットワーク',
    layer: 'technology', aspect: 'active', aliases: ['ネットワーク', 'lan', 'wan', '回線'],
    note: {
      ja: 'ノード同士を繋ぐ経路の実体。境界(社内 / DMZ / 外部)を色で分けると、セキュリティの議論がそのまま図で進む。',
      en: 'The concrete path between nodes. Colour the zones — internal, DMZ, external — and the security discussion can run directly on the diagram.',
    },
  },
  {
    id: 'path', name: 'Path', ja: 'パス(論理経路)',
    layer: 'technology', aspect: 'behavior', aliases: ['経路', '論理経路'],
    note: {
      ja: '「繋がっている」という論理的な事実。物理回線を描く前の抽象段階で使う。',
      en: 'The logical fact of connectivity. Use it at the stage before you commit to physical links.',
    },
  },

  // --- 物理 ---
  {
    id: 'equipment', name: 'Equipment', ja: '設備・装置',
    layer: 'physical', aspect: 'active', aliases: ['装置', '設備', '機械', '製造設備'],
    note: {
      ja: '製造機械・検査装置など。OT と IT の境界を 1 枚で見せたいときに必要になる。',
      en: 'Production machinery, inspection rigs. Needed when you must show the OT/IT boundary on one page.',
    },
  },
  {
    id: 'facility', name: 'Facility', ja: '施設',
    layer: 'physical', aspect: 'active', aliases: ['工場', '倉庫', '拠点', '施設'],
    note: {
      ja: '工場・倉庫・店舗。拠点統廃合の検討では、この要素に業務とシステムをぶら下げると影響が一目で出る。',
      en: 'Plants, warehouses, stores. In a site-consolidation study, hanging business and systems off these makes the impact obvious.',
    },
  },
  {
    id: 'distribution-network', name: 'Distribution Network', ja: '物流網',
    layer: 'physical', aspect: 'active', aliases: ['物流', '配送網', 'サプライチェーン'],
    note: {
      ja: 'モノが動く経路。情報の流れと重ねて描くと、在庫と情報のズレが見える。',
      en: 'How physical goods move. Overlay it with information flow and the gap between stock reality and stock records appears.',
    },
  },
  {
    id: 'material', name: 'Material', ja: '材料・物品',
    layer: 'physical', aspect: 'passive', aliases: ['材料', '原料', '部品', '物品'],
    note: {
      ja: '扱われるモノそのもの。トレーサビリティ要件がある業界でだけ意味を持つ。',
      en: 'The physical stuff being handled. Only meaningful in industries with traceability requirements.',
    },
  },

  // --- 実装・移行 ---
  {
    id: 'work-package', name: 'Work Package', ja: 'ワークパッケージ',
    layer: 'implementation', aspect: 'behavior', aliases: ['作業パッケージ', 'プロジェクト', '施策', 'wp'],
    note: {
      ja: '「予算が取れる単位」で切る。技術的にきれいでも稟議が通らない粒度のワークパッケージは机上の産物になる。',
      en: 'Cut it at the size that can get funded. A technically elegant package that no approval process recognizes stays on paper.',
    },
  },
  {
    id: 'deliverable', name: 'Deliverable', ja: '成果物(納品物)',
    layer: 'implementation', aspect: 'passive', aliases: ['納品物', '成果物', 'アウトプット'],
    note: {
      ja: 'ワークパッケージが外に渡すもの。受け取り手を書けない成果物は、作る必要があるか疑う。',
      en: 'What a work package hands over. If you cannot name the recipient, question whether it needs to exist.',
    },
  },
  {
    id: 'implementation-event', name: 'Implementation Event', ja: '実装イベント',
    layer: 'implementation', aspect: 'behavior', aliases: ['マイルストーン', '切替', 'カットオーバー', 'ゲート'],
    note: {
      ja: 'カットオーバーや意思決定ゲート。「後戻りできなくなる点」を明示するのに使う。',
      en: 'Cutovers and decision gates. Its best use is marking the point of no return.',
    },
  },
  {
    id: 'plateau', name: 'Plateau', ja: 'プラトー(安定状態)',
    layer: 'implementation', aspect: 'milestone', aliases: ['プラトー', '移行状態', '中間状態', '安定状態'],
    note: {
      ja: '「ここで止めても業務が回る」状態。止められない区切りは区切りではない。現行 / 移行 1〜2 / 目標の 3〜4 個で十分。',
      en: 'A state where you could stop and the business still runs. A step you cannot stop at is not a step. Three or four — baseline, one or two transitions, target — is plenty.',
    },
  },
  {
    id: 'gap', name: 'Gap', ja: 'ギャップ',
    layer: 'implementation', aspect: 'milestone', aliases: ['差分', 'ギャップ', '不足'],
    note: {
      ja: 'プラトー間の差。「無いものを作る」だけでなく「あるものを捨てる」ギャップを必ず立てる。廃止が抜けると二重運用になる。',
      en: 'The delta between plateaus. Always raise the "retire this" gaps alongside the "build that" ones; omit disposal and you end up running both.',
    },
  },
];

/** 要素の索引(ID → 要素) */
const ELEMENT_BY_ID = new Map<string, ArchiElement>(ELEMENTS.map((e) => [e.id, e]));

function element(id: string): ArchiElement | undefined {
  return ELEMENT_BY_ID.get(id);
}

/** 要素名を表示用に整形する(未知 ID はそのまま返す) */
function elementLabel(id: string, lang: Lang): string {
  const e = element(id);
  if (!e) return `\`${id}\``;
  if (lang === 'ja') return `${e.name}(${e.ja})`;
  if (lang === 'en') return e.name;
  return `${e.name} / ${e.ja}`;
}

/** 要素名を短く(図の中など) */
function elementShort(id: string): string {
  return element(id)?.name ?? id;
}

/* ------------------------------------------------------------------ *
 * 関係
 * ------------------------------------------------------------------ */

const RELATIONSHIPS: ArchiRelationship[] = [
  {
    id: 'composition',
    name: { ja: 'コンポジション(構成)', en: 'Composition' },
    arrow: '◆——',
    aliases: ['composition', 'composed of', 'コンポジション', '構成', '包含', 'is part of', 'part-of'],
    meaning: {
      ja: '全体と、その全体が無くなれば一緒に消える部分。分解して階層を作るための線。',
      en: 'A whole and the parts that vanish with it. The line you use to build a hierarchy.',
    },
    goodUse: {
      ja: '同じ種類の要素を階層に分解するとき(能力の 1 階層目→2 階層目、大きいコンポーネント→サブコンポーネント)。',
      en: 'Breaking one kind of element into levels: a level-1 capability into level-2, a large component into sub-components.',
    },
    misuse: {
      ja: '種類の違うものを繋いで「この中に含まれる」を表そうとする。担い手と振る舞いの関係は Assignment、緩いまとまりは Aggregation か Grouping。',
      en: 'Used across different kinds to mean "lives inside". Performer-to-behaviour is Assignment; a loose bundle is Aggregation or a Grouping.',
    },
  },
  {
    id: 'aggregation',
    name: { ja: 'アグリゲーション(集約)', en: 'Aggregation' },
    arrow: '◇——',
    aliases: ['aggregation', 'aggregates', 'アグリゲーション', '集約', 'まとめ'],
    meaning: {
      ja: 'まとめて呼ぶための束ね。束が消えても中身は生き残る。',
      en: 'A bundle used for naming. Dissolve the bundle and the members survive.',
    },
    goodUse: {
      ja: 'プラトーが「その時点で生きている要素」を束ねるとき。ポートフォリオや領域でまとめるとき。',
      en: 'A plateau bundling what is alive at that point; a portfolio or domain bundling its members.',
    },
    misuse: {
      ja: '意味を決めきれずに何でも束ねてしまう。束ねる基準を図の凡例に書けないなら、その線は不要。',
      en: 'Bundling everything because the semantics were never decided. If you cannot state the bundling criterion in the legend, drop the line.',
    },
  },
  {
    id: 'assignment',
    name: { ja: 'アサインメント(割り当て)', en: 'Assignment' },
    arrow: '●——▶',
    aliases: ['assignment', 'assigned to', 'アサインメント', '割り当て', '担当', '実行する', 'performs', 'deployed on', 'deployed'],
    meaning: {
      ja: '「これがそれをやる」。担い手と、その担い手が行う振る舞いを結ぶ。配置(ノードに置く)もこの線。',
      en: 'This one does that. It ties a performer to the behaviour it carries out — and also expresses deployment onto a node.',
    },
    goodUse: {
      ja: 'Business Role が Business Process をやる。Application Component が Application Function をやる。Node に Artifact を配置する。',
      en: 'A Business Role performing a Business Process; an Application Component performing an Application Function; an Artifact deployed onto a Node.',
    },
    misuse: {
      ja: '向きを逆にする(プロセスから担当者へ引く)。読み方は常に「担い手 → やること」。',
      en: 'Drawn backwards, from the process to the person. Always read it as performer to work.',
    },
  },
  {
    id: 'realization',
    name: { ja: 'リアライゼーション(実現)', en: 'Realization' },
    arrow: '——▷ (破線)',
    aliases: ['realization', 'realisation', 'realizes', 'realises', 'realize', 'リアライゼーション', '実現', '具体化'],
    meaning: {
      ja: '抽象的に約束されたものを、より具体的なもので満たす。「約束 ← 中身」の関係。',
      en: 'Something abstract is made good by something more concrete. Promise on one end, substance on the other.',
    },
    goodUse: {
      ja: 'コンポーネントがサービスを実現する。プロセスが業務サービスを実現する。要件が目標に効く道筋を作る。',
      en: 'A component realizing a service; a process realizing a business service; a requirement giving a goal its substance.',
    },
    misuse: {
      ja: '層をまたいで「使っている」の意味で使う。使っている関係は Serving。実現は「同じものの、抽象と具体」でしか成立しない。',
      en: 'Used across layers to mean "uses". Uses is Serving. Realization only holds between an abstract and a concrete form of the same thing.',
    },
  },
  {
    id: 'serving',
    name: { ja: 'サービング(提供・利用)', en: 'Serving' },
    arrow: '——▶',
    aliases: ['serving', 'serves', 'used by', 'uses', 'サービング', '提供', '利用', '使う', 'supports', '支援'],
    meaning: {
      ja: '「こちらが相手の役に立っている」。依存の向きを表す最重要の線。',
      en: 'This one is useful to that one. The single most important line for showing which way dependency runs.',
    },
    goodUse: {
      ja: 'Application Service が Business Process を支える。Technology Service が Application Component を支える。層をまたぐ依存は基本これ。',
      en: 'An Application Service supporting a Business Process; a Technology Service supporting an Application Component. Cross-layer dependency is normally this.',
    },
    misuse: {
      ja: '向きを逆に引いて「業務がシステムに使われている」ように見せてしまう。読み方は「提供する側 → 使う側」。',
      en: 'Drawn backwards so the business appears to serve the system. Read it as provider to consumer.',
    },
  },
  {
    id: 'access',
    name: { ja: 'アクセス', en: 'Access' },
    arrow: '- - ->',
    aliases: ['access', 'accesses', 'アクセス', '参照', '読み書き', 'crud', 'reads', 'writes'],
    meaning: {
      ja: '振る舞いが情報を読む・書く・作る・消す。データの流れではなく「触る」関係。',
      en: 'A behaviour reads, writes, creates, or deletes information. It is about touching data, not about data moving.',
    },
    goodUse: {
      ja: 'マスタの所在を突き止めるとき。「作れるのは 1 箇所だけか」を図で問える。',
      en: 'Locating the master. It lets you ask on the diagram whether exactly one place is allowed to create the record.',
    },
    misuse: {
      ja: '読み書きの区別を付けずに全部同じ線にする。区別しないなら、その図はマスタの議論には使えない。',
      en: 'All accesses drawn identically. Without the read/write distinction the view cannot support a master-data discussion.',
    },
  },
  {
    id: 'influence',
    name: { ja: 'インフルエンス(影響)', en: 'Influence' },
    arrow: '- - ->(+/-)',
    aliases: ['influence', 'influences', 'インフルエンス', '影響', '寄与'],
    meaning: {
      ja: '強めたり弱めたりする、確定しない効き方。プラス・マイナスの度合いを添えられるのが特徴。',
      en: 'A push in a direction that is not guaranteed. Its distinguishing feature is that you can qualify it as positive or negative.',
    },
    goodUse: {
      ja: '動機層の中で、トレードオフを見せるとき。「この原則を守るとこの目標には逆風」を明示できる。',
      en: 'Showing trade-offs inside the motivation layer: following this principle works against that goal.',
    },
    misuse: {
      ja: 'システムから目標へ直接引いて「貢献しています」と主張する。効果が説明できないときの逃げ道になりやすい。',
      en: 'Drawn from a system straight to a goal to claim contribution. It becomes the escape hatch when the effect cannot be explained.',
    },
  },
  {
    id: 'triggering',
    name: { ja: 'トリガリング(起動)', en: 'Triggering' },
    arrow: '——▶(実線)',
    aliases: ['triggering', 'triggers', 'トリガリング', '起動', '順序', '次に', 'then'],
    meaning: {
      ja: '時間的な前後。「これが終わると次はこれ」。',
      en: 'Before and after in time: when this finishes, that starts.',
    },
    goodUse: {
      ja: 'プロセスの順序、ワークパッケージの依存関係、イベント起点の処理。',
      en: 'Process sequence, dependencies between work packages, event-driven processing.',
    },
    misuse: {
      ja: '並行してよいものまで直列に繋いでしまう。線を引かない勇気が読みやすさを決める。',
      en: 'Things that could run in parallel get chained. Restraint about drawing the line is what keeps it readable.',
    },
  },
  {
    id: 'flow',
    name: { ja: 'フロー(受け渡し)', en: 'Flow' },
    arrow: '- -▶',
    aliases: ['flow', 'flows', 'フロー', '受け渡し', 'データフロー', '情報の流れ'],
    meaning: {
      ja: '何か(情報・モノ)が移動する。移動物の名前を線に書けないなら、その線は Triggering か Serving。',
      en: 'Something moves — information or goods. If you cannot label what moves, the line should have been Triggering or Serving.',
    },
    goodUse: {
      ja: 'システム間連携で「何が流れているか」を見せるとき。ラベルに情報の名前を必ず入れる。',
      en: 'Integration views where what travels matters. Always label it with the name of what travels.',
    },
    misuse: {
      ja: 'データそのもの(Data Object)を終点にする。データを触る関係は Access。',
      en: 'Ending the arrow on the data itself. Touching data is Access.',
    },
  },
  {
    id: 'specialization',
    name: { ja: 'スペシャライゼーション(特化)', en: 'Specialization' },
    arrow: '——▷',
    aliases: ['specialization', 'specialisation', 'is a', 'スペシャライゼーション', '特化', '継承', '種類'],
    meaning: {
      ja: '「〜の一種」。同じ種類の要素どうしでしか成り立たない。',
      en: 'A kind of. It only holds between elements of the same kind.',
    },
    goodUse: {
      ja: '共通の型を作って、製品バリエーションや契約種別を整理するとき。',
      en: 'Introducing a common type to organize product variants or contract kinds.',
    },
    misuse: {
      ja: '「具体化」の意味で層をまたいで使う。それは Realization。種類が違う要素の間には引かない。',
      en: 'Used across layers to mean "made concrete" — that is Realization. Never draw it between different kinds.',
    },
  },
  {
    id: 'association',
    name: { ja: 'アソシエーション(関連)', en: 'Association' },
    arrow: '———',
    aliases: ['association', 'associated with', 'アソシエーション', '関連', '関係あり'],
    meaning: {
      ja: '何か関係がある、としか言っていない線。意味を決めきれないときの受け皿。',
      en: 'A line that says only "these are related". The catch-all when the semantics have not been settled.',
    },
    goodUse: {
      ja: '意味がまだ決まらない段階の作業中モデル。ラベルで意味を補える場合。',
      en: 'Work-in-progress models where the meaning is still open, or where a label can carry the meaning.',
    },
    misuse: {
      ja: 'これが図の過半数を占める。そのモデルは「関係がある気がする」以上のことを何も言っていない。',
      en: 'It ends up being most of the lines. Such a model asserts nothing beyond a vague sense of connection.',
    },
  },
];

const RELATIONSHIP_BY_ID = new Map<string, ArchiRelationship>(RELATIONSHIPS.map((r) => [r.id, r]));

function relationship(id: string): ArchiRelationship | undefined {
  return RELATIONSHIP_BY_ID.get(id);
}

/* ------------------------------------------------------------------ *
 * 名前解決
 * ------------------------------------------------------------------ */

/** 比較用に正規化する(記号・空白を落とし小文字化) */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_\-・()（）［］\[\]{}"'`.,:;/\\]+/g, '')
    .trim();
}

/** 要素名 / ID / 別名から要素を引く */
function resolveElement(input: string): ArchiElement | undefined {
  const q = norm(input);
  if (q.length === 0) return undefined;
  for (const e of ELEMENTS) {
    if (norm(e.id) === q || norm(e.name) === q || norm(e.ja) === q) return e;
    if (e.aliases.some((a) => norm(a) === q)) return e;
  }
  // 部分一致(「注文管理 Application Component」のような書き方を拾う)
  const partial = ELEMENTS.filter(
    (e) => q.includes(norm(e.name)) || q.includes(norm(e.id)) || e.aliases.some((a) => norm(a).length >= 3 && q.includes(norm(a))),
  );
  if (partial.length === 0) return undefined;
  // より長い名前に一致した方を優先する(Application Service > Service)
  return partial.sort((a, b) => norm(b.name).length - norm(a.name).length)[0];
}

/** 関係名 / ID / 別名から関係を引く */
function resolveRelationship(input: string): ArchiRelationship | undefined {
  const q = norm(input);
  if (q.length === 0) return undefined;
  for (const r of RELATIONSHIPS) {
    if (norm(r.id) === q || norm(r.name.ja) === q || norm(r.name.en) === q) return r;
    if (r.aliases.some((a) => norm(a) === q)) return r;
  }
  for (const r of RELATIONSHIPS) {
    if (q.includes(norm(r.id))) return r;
    if (r.aliases.some((a) => norm(a).length >= 4 && q.includes(norm(a)))) return r;
  }
  return undefined;
}

/** 未知の要素名に対する候補を返す(共通部分文字列の長さで単純にスコアリング) */
function suggestElements(input: string, limit = 5): ArchiElement[] {
  const q = norm(input);
  if (q.length === 0) return [];
  const scored = ELEMENTS.map((e) => {
    const targets = [norm(e.id), norm(e.name), norm(e.ja), ...e.aliases.map(norm)];
    let score = 0;
    for (const t of targets) {
      if (t.length === 0) continue;
      if (t.includes(q) || q.includes(t)) score = Math.max(score, Math.min(t.length, q.length));
      // 先頭 3 文字の一致も軽く拾う
      if (t.slice(0, 3) === q.slice(0, 3)) score = Math.max(score, 2);
    }
    return { e, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
}

/* ------------------------------------------------------------------ *
 * 関係の妥当性判定
 *
 * 仕様の許可関係表を写すのではなく、「その線を引いたときに図が何を主張することになるか」
 * という意味論の観点から独自に判定する。3 値で返し、必ず理由と代替案を添える。
 * ------------------------------------------------------------------ */

type Verdict = 'ok' | 'questionable' | 'likely-wrong';

interface Judgement {
  verdict: Verdict;
  reason: Bilingual;
  alternatives: Bilingual[];
}

interface Rule {
  id: string;
  test: (s: ArchiElement, t: ArchiElement, r: ArchiRelationship) => boolean;
  judge: (s: ArchiElement, t: ArchiElement, r: ArchiRelationship) => Judgement;
}

/** 積み上げ 5 層のうち、依存の向きを論じられる 3 層だけを対象にする */
const STACK_FOR_DIRECTION: LayerId[] = ['business', 'application', 'technology'];

function stackOrderOf(e: ArchiElement): number | undefined {
  return findLayer(e.layer)?.stackOrder;
}

function inDirectionStack(e: ArchiElement): boolean {
  return STACK_FOR_DIRECTION.includes(e.layer);
}

/** 外向きの「約束」を表すサービス要素。振る舞いがこれを実現するのが基本形。 */
const SERVICE_IDS = new Set(['business-service', 'application-service', 'technology-service']);

/** その層で「約束」を置くのに使うサービス要素の ID */
function serviceIdFor(layer: LayerId): string | undefined {
  if (layer === 'business') return 'business-service';
  if (layer === 'application') return 'application-service';
  if (layer === 'technology') return 'technology-service';
  return undefined;
}

/** 入れ子の実体として全体・部分を構成できる構造要素 */
const STRUCTURAL_CONTAINERS = new Set([
  'node',
  'device',
  'system-software',
  'facility',
  'equipment',
  'distribution-network',
]);

const VERDICT_MARK: Record<Verdict, string> = {
  ok: '✔',
  questionable: '⚠',
  'likely-wrong': '✘',
};

const VERDICT_LABEL: Record<Verdict, Bilingual> = {
  ok: { ja: '妥当', en: 'Reasonable' },
  questionable: { ja: '要検討', en: 'Questionable' },
  'likely-wrong': { ja: 'おそらく誤り', en: 'Likely wrong' },
};

/** 要素の性質のラベル。関係の向きを説明するときに使う */
const ASPECT_LABEL: Record<Aspect, Bilingual> = {
  active: { ja: '担い手', en: 'performer' },
  behavior: { ja: '振る舞い', en: 'behaviour' },
  passive: { ja: '扱われるもの', en: 'thing handled' },
  motivation: { ja: '意図', en: 'intent' },
  milestone: { ja: '時点・差分', en: 'state or delta' },
};

const RULES: Rule[] = [
  // --- Realization ---
  {
    id: 'realization-app-to-business-behavior',
    test: (s, t, r) =>
      r.id === 'realization' && s.layer === 'application' && s.aspect === 'active' && t.layer === 'business' && t.aspect === 'behavior',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `${s.name} が ${t.name} を「実現する」と描くと、その業務を回している人と組織が図から消える。多くの現場では、システムは業務を成立させる支えであって業務そのものではない。自動化の度合いによって正解が変わるので、まず「人の判断が 1 箇所でも残っているか」を確認する。`,
        en: `Saying ${s.name} realizes ${t.name} erases the people and roles that actually run the work. In most organizations the system supports the work rather than being the work. The right answer depends on how automated it is, so first check whether a single human judgement remains anywhere in the flow.`,
      },
      alternatives: [
        {
          ja: `人の判断が残る場合: ${s.name} → Application Service → (Serving) → ${t.name}。差し替え可能性がサービスの層に残るので、将来のシステム更改で図が壊れない。`,
          en: `If human judgement remains: ${s.name} → Application Service → (Serving) → ${t.name}. Replaceability stays at the service level, so a future system swap does not break the picture.`,
        },
        {
          ja: `完全自動化されている場合: ${s.name} を担い手として ${t.name} に Assignment で結ぶ。「このプロセスをやっているのはこのシステムです」と読める。`,
          en: `If it is fully automated: attach ${s.name} to ${t.name} with Assignment, so it reads as "this system is the one performing the process".`,
        },
        {
          ja: `業務手順そのものがシステム側に移った場合: Application Process を立て、それが ${t.name} を Realization する。業務手順とシステム処理の対応が 1 対 1 で説明できる。`,
          en: `If the procedure itself moved into the system: introduce an Application Process and let it realize ${t.name}, giving a one-to-one story between procedure and processing.`,
        },
      ],
    }),
  },
  {
    id: 'realization-to-capability-from-app',
    test: (s, t, r) => r.id === 'realization' && t.id === 'capability' && s.layer === 'application',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `能力は「人 + 手順 + 情報 + システム」の合計で成立する。${s.name} 単体が ${t.name} を実現すると描くと、「そのツールを買えば能力が手に入る」という読み方を招き、投資判断を誤らせる。`,
        en: `A capability is the sum of people, procedure, information, and systems. Drawing ${s.name} alone as realizing ${t.name} invites the reading that buying the tool buys the capability, which distorts the investment decision.`,
      },
      alternatives: [
        {
          ja: `${s.name} を Resource として位置づけ、Resource → (Assignment) → ${t.name}。能力を支える持ち物のひとつ、という正しい重みになる。`,
          en: `Treat ${s.name} as a Resource and draw Resource → (Assignment) → ${t.name}. It then carries its true weight: one of the holdings behind the capability.`,
        },
        {
          ja: `能力を実現しているのは業務側なので、Business Process / Business Function → (Realization) → ${t.name} を主線にし、${s.name} はその業務を Serving で支える形にする。`,
          en: `Make the business the realizer — Business Process or Business Function → (Realization) → ${t.name} — and have ${s.name} serve that behaviour.`,
        },
      ],
    }),
  },
  {
    id: 'realization-behavior-to-capability',
    test: (s, t, r) => r.id === 'realization' && t.id === 'capability' && s.aspect === 'behavior',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `能力は「実際にやっていること」の裏付けがあって初めて主張できる。${s.name} が ${t.name} を実現する形は、その裏付けを図の上に置いた状態で、戦略層と現場を繋ぐ主線になる。`,
        en: `A capability claim only stands up when something is actually being done. ${s.name} realizing ${t.name} puts that evidence on the page, and it is the main line joining the strategy layer to the work.`,
      },
      alternatives: [
        {
          ja: `能力ごとに実現している振る舞いが 1 つも無いなら、それは「持っているつもりの能力」。ヒートマップで赤にする前に、まずこの線が引けるかを確かめる。`,
          en: `A capability with no behaviour realizing it is a capability you only believe you have. Before colouring it red on a heat map, check whether this line can be drawn at all.`,
        },
        {
          ja: `支えている持ち物(人材・システム・データ)は Resource → (Assignment) → ${t.name} で足す。振る舞いと持ち物の両方が揃うと、投資の議論が具体化する。`,
          en: `Add the holdings behind it as Resource → (Assignment) → ${t.name}. With both the behaviour and the holdings present, the investment discussion gets concrete.`,
        },
      ],
    }),
  },
  {
    id: 'realization-to-goal-from-core',
    test: (s, t, r) => r.id === 'realization' && t.id === 'goal' && s.aspect !== 'motivation',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `目標に直接ぶら下げると、「達成したかどうか」を後から判定できなくなる。${s.name} が効いたのか他の要因なのかを切り分ける手掛かりが図に残らない。`,
        en: `Hanging things straight off a goal makes it impossible to check achievement later: nothing in the picture separates the contribution of ${s.name} from everything else that happened.`,
      },
      alternatives: [
        {
          ja: `測れる Outcome を 1 段挟む: ${s.name} → (Realization) → Requirement → (Realization) → Outcome → (Realization) → ${t.name}。効果測定の対象が Outcome に定まる。`,
          en: `Insert a measurable Outcome: ${s.name} → (Realization) → Requirement → (Realization) → Outcome → (Realization) → ${t.name}. Measurement then has a clear target.`,
        },
        {
          ja: `効き方が不確実なら Influence にして、正負の度合いを添える。「貢献しているはず」を Realization で断定しない。`,
          en: `If the effect is uncertain, use Influence with a positive or negative qualifier rather than asserting contribution with Realization.`,
        },
      ],
    }),
  },
  {
    id: 'realization-component-service-same-layer',
    test: (s, t, r) => r.id === 'realization' && s.aspect === 'active' && t.aspect === 'behavior' && s.layer === t.layer,
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${s.name} が ${t.name} という「外に対する約束」を中身で満たす形になっており、実現の関係として自然。同じ層の中で抽象(サービス)と具体(担い手)を分けられている。`,
        en: `${s.name} gives substance to the promise ${t.name} makes to the outside. Abstract and concrete stay separated inside one layer, which is exactly what realization is for.`,
      },
      alternatives: [
        {
          ja: `サービスを複数のコンポーネントで実現しているなら、Collaboration を立ててそこから Realization を引くと責任分界が読める。`,
          en: `If several components realize the service, introduce a Collaboration and draw the realization from it so the split of responsibility becomes readable.`,
        },
      ],
    }),
  },
  {
    id: 'realization-behavior-to-service',
    test: (s, t, r) => r.id === 'realization' && s.aspect === 'behavior' && SERVICE_IDS.has(t.id) && s.layer === t.layer,
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${t.name} は外に対する約束、${s.name} はその中身。約束と中身を分けて書く、この層でいちばん基本になる形。利用側は ${t.name} だけを見ればよくなるので、中身を作り替えても利用側の図に手が入らない。`,
        en: `${t.name} is the promise made outward and ${s.name} is what backs it. Separating promise from substance is the most basic shape in this layer: consumers only ever look at ${t.name}, so reworking the substance never touches their picture.`,
      },
      alternatives: [
        {
          ja: `${t.name} を使う相手は Serving で繋ぐ(${t.name} → 利用側)。ここを ${s.name} から直接引くと、中身を変えるたびに線を引き直すことになる。`,
          en: `Connect consumers with Serving from ${t.name}, not from ${s.name}. Wire it from the substance and every rework means redrawing the lines.`,
        },
        {
          ja: `複数の振る舞いで 1 つのサービスを実現しているなら、そのままでよい。逆にサービス 1 個に振る舞い 1 個が 1 対 1 で張り付いているだけなら、そのサービスは名前を変えただけの重複かもしれない。`,
          en: `Several behaviours realizing one service is fine. But if every service has exactly one behaviour behind it, the service may just be the same thing under a second name.`,
        },
      ],
    }),
  },
  {
    id: 'realization-implementation-output',
    test: (s, t, r) =>
      r.id === 'realization' &&
      s.layer === 'implementation' &&
      t.layer === 'implementation' &&
      (t.aspect === 'passive' || t.aspect === 'milestone'),
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${s.name} が ${t.name} を生み出す形で、移行計画の基本形。この線が繋がっていると「この作業をやめたら何が手に入らないのか」を図の上で辿れる。`,
        en: `${s.name} producing ${t.name} is the standard shape of a migration plan. With this line in place you can trace, on the page, what you stop getting if the work is cancelled.`,
      },
      alternatives: [
        {
          ja: `どの作業からも実現されていない ${t.name} があれば、それは予算の付いていない期待。逆に何も実現していない作業があれば、それは目的の説明できない作業。両方向から点検する。`,
          en: `Anything on the ${t.name} side with no work realizing it is an unfunded expectation; any work realizing nothing is work whose purpose cannot be stated. Check it in both directions.`,
        },
      ],
    }),
  },
  {
    id: 'realization-passive-downward',
    test: (s, t, r) => {
      if (r.id !== 'realization') return false;
      if (s.aspect !== 'passive' || t.aspect !== 'passive') return false;
      const so = stackOrderOf(s);
      const to = stackOrderOf(t);
      return so !== undefined && to !== undefined && so > to;
    },
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `業務の言葉で呼んでいる ${t.name} を、下の層の ${s.name} が実体として支える形。この対応を明示しておくと、「業務で言う 1 件」がシステム上どこに何個あるのかを追える。`,
        en: `${t.name} is named in the language of the business and ${s.name} is what holds it further down. Making the correspondence explicit is what lets you answer where "one of those" actually lives, and in how many places.`,
      },
      alternatives: [
        {
          ja: `1 対 1 で対応させようとしないこと。業務側 1 個に対して下の層が 3 個あるなら、それこそが分断の証拠なので、そのまま描いて議論の材料にする。`,
          en: `Do not force it to be one-to-one. If one business-side item maps to three below, that is the fragmentation evidence — draw it as it is and use it in the discussion.`,
        },
      ],
    }),
  },
  {
    id: 'realization-cross-layer-upward-ok',
    test: (s, t, r) =>
      r.id === 'realization' &&
      s.aspect === 'passive' &&
      t.aspect === 'active' &&
      s.layer === 'technology' &&
      t.layer === 'application',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${s.name} は ${t.name} の「実体としての形」なので、実現として自然。配置の議論(どのノードに何が載るか)へ素直に繋がる。`,
        en: `${s.name} is the concrete form ${t.name} takes, so realization fits. It also leads cleanly into the deployment conversation.`,
      },
      alternatives: [
        {
          ja: `配置まで示すなら Node → (Assignment) → ${s.name} を足すと、障害時の影響範囲が上まで辿れる。`,
          en: `Add Node → (Assignment) → ${s.name} to complete the deployment story and make outage impact traceable upward.`,
        },
      ],
    }),
  },
  {
    id: 'realization-motivation-chain',
    test: (s, t, r) => r.id === 'realization' && s.aspect === 'motivation' && t.aspect === 'motivation',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `動機層の中で「${s.name} が ${t.name} を具体化する」という筋が通っている。この鎖が繋がっていれば、要件の追跡表を図から自動生成できる。`,
        en: `Inside the motivation layer, ${s.name} giving substance to ${t.name} is a coherent claim. Keep the chain intact and the traceability matrix can be generated from the model.`,
      },
      alternatives: [
        {
          ja: `鎖が長くなりすぎたら、中間の要素が本当に必要か点検する。3 段(Requirement → Outcome → Goal)で足りることが多い。`,
          en: `If the chain grows long, check whether the middle elements earn their place. Three steps — Requirement, Outcome, Goal — usually suffice.`,
        },
      ],
    }),
  },

  // --- Serving ---
  {
    id: 'serving-to-passive',
    test: (s, t, r) => r.id === 'serving' && t.aspect === 'passive',
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `${t.name} は「扱われるもの」であって、役に立ててもらう相手ではない。データや情報に向かって Serving を引くと、誰がそれを読み書きしているのかが図から失われる。`,
        en: `${t.name} is something handled, not something that consumes a service. A serving arrow into data hides who reads and writes it.`,
      },
      alternatives: [
        {
          ja: `${s.name} が ${t.name} を読み書きするなら Access。読み・書きを線種かラベルで区別するとマスタの議論に使える。`,
          en: `If ${s.name} reads or writes ${t.name}, use Access — and distinguish read from write so the view can support a master-data discussion.`,
        },
        {
          ja: `${t.name} が別の場所へ渡っていくことを言いたいなら、振る舞いどうしを Flow で結び、線のラベルに ${t.name} の名前を書く。`,
          en: `If the point is that ${t.name} travels somewhere, connect the behaviours with Flow and label the line with the name of ${t.name}.`,
        },
      ],
    }),
  },
  {
    id: 'serving-motivation-endpoint',
    test: (s, t, r) => r.id === 'serving' && (s.aspect === 'motivation' || t.aspect === 'motivation'),
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `動機層の要素(${s.aspect === 'motivation' ? s.name : t.name})は仕事をしたり仕事をしてもらったりする対象ではなく、「なぜそうするか」を表す。Serving で結ぶと、意図と実行の区別が崩れる。`,
        en: `A motivation element (${s.aspect === 'motivation' ? s.name : t.name}) neither performs work nor consumes it; it states why. Serving collapses the distinction between intent and execution.`,
      },
      alternatives: [
        {
          ja: `実行側が意図を満たす関係なら Realization。効き方が不確実なら Influence。どちらとも言えないなら、そもそもその線は要らない可能性が高い。`,
          en: `Use Realization when the execution side satisfies the intent, Influence when the effect is uncertain. If neither fits, the line probably should not exist.`,
        },
      ],
    }),
  },
  {
    id: 'serving-direction-reversed',
    test: (s, t, r) => {
      if (r.id !== 'serving') return false;
      if (!inDirectionStack(s) || !inDirectionStack(t)) return false;
      const so = stackOrderOf(s);
      const to = stackOrderOf(t);
      return so !== undefined && to !== undefined && so < to;
    },
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `依存の向きが通常と逆になっている。${s.name}(${text(findLayer(s.layer)?.name ?? { ja: s.layer, en: s.layer }, 'ja')})が ${t.name}(${text(findLayer(t.layer)?.name ?? { ja: t.layer, en: t.layer }, 'ja')})を支える、と読める。実際にそういう構図なら誤りではないが、ほとんどの場合は矢印の向きを取り違えている。`,
        en: `The dependency runs against the usual direction: it reads as ${s.name} supporting ${t.name}, i.e. an upper layer serving a lower one. That does happen, but far more often the arrow was simply drawn the wrong way.`,
      },
      alternatives: [
        {
          ja: `意図が「${t.name} が ${s.name} を使う」なら、矢印を逆にする。`,
          en: `If you meant "${t.name} uses ${s.name}", reverse the arrow.`,
        },
        {
          ja: `本当に上位層が下位層を支えている(例: 運用業務が基盤を維持している)なら、その業務を Business Service として明示し、支えている対象を注記する。読み手は必ずここで引っかかるので、凡例で説明する。`,
          en: `If an upper layer genuinely supports a lower one — an operations process keeping a platform alive — make that a named Business Service and annotate it. Readers will stumble here, so explain it in the legend.`,
        },
      ],
    }),
  },
  {
    id: 'serving-cross-layer-ok',
    test: (s, t, r) => {
      if (r.id !== 'serving') return false;
      if (!inDirectionStack(s) || !inDirectionStack(t)) return false;
      const so = stackOrderOf(s);
      const to = stackOrderOf(t);
      return so !== undefined && to !== undefined && so > to;
    },
    judge: (s, t) => ({
      verdict: s.aspect === 'behavior' ? 'ok' : 'questionable',
      reason:
        s.aspect === 'behavior'
          ? {
              ja: `下の層が上の層を支える形になっており、依存の向きとして自然。サービス(${s.name})を挟んでいるので、提供元の実装を差し替えても上の層の図は変わらない。`,
              en: `A lower layer supporting an upper one — the natural direction. Because a service (${s.name}) sits in the middle, swapping the implementation underneath leaves the upper picture untouched.`,
            }
          : {
              ja: `向きは正しいが、担い手(${s.name})を直接繋いでいるため、そのシステムを入れ替えると図の線を全部引き直すことになる。サービスを 1 枚挟むと保守が楽になる。`,
              en: `The direction is right, but wiring the performer (${s.name}) directly means every line must be redrawn when that system is replaced. Interposing a service saves that work.`,
            },
      alternatives:
        s.aspect === 'behavior'
          ? [
              {
                ja: `そのサービスを誰が提供しているかを Realization で足しておくと、責任者の議論まで 1 枚で済む。`,
                en: `Add who realizes the service and the same page can also carry the ownership discussion.`,
              },
            ]
          : [
              {
                ja: `${s.name} → (Realization) → ${elementShort(s.layer === 'application' ? 'application-service' : 'technology-service')} → (Serving) → ${t.name} に組み替える。`,
                en: `Restructure as ${s.name} → (Realization) → ${elementShort(s.layer === 'application' ? 'application-service' : 'technology-service')} → (Serving) → ${t.name}.`,
              },
            ],
    }),
  },

  {
    id: 'serving-same-layer',
    test: (s, t, r) => r.id === 'serving' && s.layer === t.layer,
    judge: (s, t) => {
      const svcId = serviceIdFor(s.layer);
      if (s.aspect === 'behavior') {
        return {
          verdict: 'ok',
          reason: {
            ja: `同じ層の中でも「誰が誰に役立っているか」は描いてよい。${s.name} → ${t.name} は、層をまたがないぶん読み手の負担が小さく、その層だけで完結する依存の議論に使える。`,
            en: `Dependency inside one layer is a legitimate thing to draw. ${s.name} → ${t.name} stays within the layer, so it costs the reader less and supports a dependency discussion that never leaves that layer.`,
          },
          alternatives: [
            {
              ja: `層の中の依存が 1 枚に 10 本を超えたら、その層はもう 1 段の分解を求めている。まとまりごとに図を割る。`,
              en: `Past ten in-layer dependencies on one page, the layer is asking to be decomposed. Split the view by cluster.`,
            },
            {
              ja: `双方向に線が引けてしまう相手が出たら、それは境界の切り方を間違えている合図。片方向に落とせる位置まで責務を切り直す。`,
              en: `Any pair where the arrow could point both ways is a sign the boundary is wrong. Recut the responsibilities until one direction is enough.`,
            },
          ],
        };
      }
      return {
        verdict: 'questionable',
        reason: {
          ja: `向き自体は成立するが、担い手(${s.name})から直接引いているため、この線は「${s.name} という実装に依存している」という主張になる。同じ層の中でこれをやると、片方を差し替えた瞬間に相手側の図も書き換えになる。`,
          en: `The direction works, but drawing it from the performer (${s.name}) asserts dependency on that particular implementation. Inside one layer that means replacing either side forces a rewrite of the other side's picture too.`,
        },
        alternatives: svcId
          ? [
              {
                ja: `${s.name} → (Realization) → ${elementShort(svcId)} → (Serving) → ${t.name} に組み替える。依存先が「実装」から「約束」に変わる。`,
                en: `Restructure as ${s.name} → (Realization) → ${elementShort(svcId)} → (Serving) → ${t.name}, so the dependency lands on a promise rather than on an implementation.`,
              },
              {
                ja: `全社の棚卸し段階で線の数を優先するなら、この省略形のままでよい。設計に入る段で挟み直す。`,
                en: `During an enterprise-wide inventory, keeping the shorthand is fine. Interpose the service when you move into design.`,
              },
            ]
          : [
              {
                ja: `間に「外に対する約束」にあたる要素を 1 つ立て、依存先をそちらに移す。`,
                en: `Introduce an element that stands for the promise made outward and move the dependency onto it.`,
              },
            ],
      };
    },
  },

  // --- Assignment ---
  {
    id: 'assignment-node-artifact',
    test: (s, t, r) => r.id === 'assignment' && s.layer === 'technology' && s.aspect === 'active' && t.id === 'artifact',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `配置(${t.name} が ${s.name} の上で動く)を表す使い方で、正しい。障害時の影響を上の層へ辿る経路がこの線で繋がる。`,
        en: `This is deployment — ${t.name} running on ${s.name} — and it is correct. This line is what lets outage impact be traced upward.`,
      },
      alternatives: [
        {
          ja: `冗長構成を見せたいなら、ノードを 2 個描くのではなく 1 個にまとめて注記する。図が倍になるだけで情報は増えない。`,
          en: `To show redundancy, annotate one node rather than drawing two. Doubling the boxes doubles the clutter without adding information.`,
        },
      ],
    }),
  },
  {
    id: 'assignment-active-same-layer',
    test: (s, t, r) =>
      r.id === 'assignment' && s.aspect === 'active' && t.aspect === 'active' && s.layer === t.layer && s.id !== t.id,
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `「${t.name} という位置を ${s.name} が埋めている」と読める形で、担い手どうしを結ぶ正しい使い方。実体(誰か・どの機材か)と位置(何を担う枠か)を分けておくと、中の人や機材が替わっても位置の側の線は生き残る。`,
        en: `It reads as "${s.name} fills the position ${t.name}", which is the correct way to tie two performers together. Separating the concrete thing from the position it occupies means the lines hanging off the position survive when the occupant changes.`,
      },
      alternatives: [
        {
          ja: `仕事の線(Serving / Realization / Access)は位置の側、つまり ${t.name} から引く。実体の側から引くと、担当者交代のたびに図を直すことになる。`,
          en: `Hang the working lines — Serving, Realization, Access — off the position, ${t.name}, not off the occupant. Off the occupant, every handover means editing the model.`,
        },
        {
          ja: `1 つの位置を複数の実体が埋めているなら、線を並べるより Collaboration を立てた方が責任の所在が読める。`,
          en: `Where several occupants fill one position, a Collaboration reads better than a fan of lines when it comes to who is responsible.`,
        },
      ],
    }),
  },
  {
    id: 'assignment-active-to-behavior',
    test: (s, t, r) => r.id === 'assignment' && s.aspect === 'active' && t.aspect === 'behavior',
    judge: (s, t) => ({
      verdict: s.id === 'business-actor' && t.layer === 'business' ? 'questionable' : 'ok',
      reason:
        s.id === 'business-actor' && t.layer === 'business'
          ? {
              ja: `向きも組み合わせも正しいが、実在の組織(${s.name})を直接プロセスに割り当てると、組織変更のたびにモデルを直すことになる。役割を 1 枚挟むと、組織図の変更が図に波及しない。`,
              en: `Direction and pairing are both fine, but assigning a real org unit (${s.name}) straight to the process means editing the model at every reorg. A role in between keeps org changes out of the picture.`,
            }
          : {
              ja: `「${s.name} が ${t.name} をやる」と読め、担い手と振る舞いの結び方として正しい。誰が責任を持つかが図の上で確定する。`,
              en: `It reads as "${s.name} performs ${t.name}" — the correct way to tie a performer to behaviour, and it pins responsibility on the page.`,
            },
      alternatives:
        s.id === 'business-actor' && t.layer === 'business'
          ? [
              {
                ja: `${s.name} → (Assignment) → Business Role → (Assignment) → ${t.name} に分ける。監査対応では「今この役割を誰がやっているか」だけ更新すればよくなる。`,
                en: `Split it: ${s.name} → (Assignment) → Business Role → (Assignment) → ${t.name}. For audits you then only refresh who currently holds the role.`,
              },
            ]
          : [
              {
                ja: `複数の担い手が共同でやるなら Collaboration を立てる。線を何本も引くより、責任の所在が明確になる。`,
                en: `If several performers act jointly, introduce a Collaboration — clearer about where responsibility sits than a fan of lines.`,
              },
            ],
    }),
  },
  {
    id: 'assignment-reversed',
    test: (s, t, r) => r.id === 'assignment' && s.aspect === 'behavior' && t.aspect === 'active',
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `向きが逆。この線は常に「担い手 → やること」で読む。今の向きだと「${s.name} が ${t.name} を担っている」となり、仕事が人を実行していることになる。`,
        en: `The direction is inverted. This line always reads performer to work; as drawn it says ${s.name} performs ${t.name}, i.e. the work performs the person.`,
      },
      alternatives: [
        {
          ja: `${t.name} → (Assignment) → ${s.name} に引き直す。`,
          en: `Redraw as ${t.name} → (Assignment) → ${s.name}.`,
        },
        {
          ja: `言いたいことが「この仕事の結果として担い手が動く」なら、それは Triggering(振る舞いどうし)の話。相手側の振る舞いを立てて繋ぐ。`,
          en: `If you meant "this work sets that party in motion", that is Triggering between behaviours — introduce the other side's behaviour and connect those.`,
        },
      ],
    }),
  },

  // --- Access ---
  {
    id: 'access-behavior-to-passive',
    test: (s, t, r) => r.id === 'access' && s.aspect === 'behavior' && t.aspect === 'passive',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `振る舞いが情報を扱う形になっており正しい。この形で描いておくと「${t.name} を作れるのはどこか」を図の上で 1 箇所に絞る議論ができる。`,
        en: `A behaviour handling information — correct. Drawn this way, the view can host the argument about which single place is allowed to create ${t.name}.`,
      },
      alternatives: [
        {
          ja: `読み取りと書き込みを線のラベルで区別する。区別のない Access はマスタデータの検討には使えない。`,
          en: `Label reads and writes differently. Undifferentiated access is useless for a master-data study.`,
        },
      ],
    }),
  },
  {
    id: 'access-active-to-passive',
    test: (s, t, r) => r.id === 'access' && s.aspect === 'active' && t.aspect === 'passive',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `実務では広く使われている省略形で、大きな害はない。ただし「${s.name} のどの機能が ${t.name} を触るのか」が落ちるため、部分的な機能移管や段階移行を検討する段になると情報が足りなくなる。`,
        en: `A widely used shorthand that rarely causes harm. It does drop which function inside ${s.name} touches ${t.name}, and that gap bites once you start planning a partial migration or a function hand-off.`,
      },
      alternatives: [
        {
          ja: `詳細が要る段階になったら Application Function を 1 枚挟む: ${s.name} → (Assignment) → Application Function → (Access) → ${t.name}。`,
          en: `When the detail is needed, insert an Application Function: ${s.name} → (Assignment) → Application Function → (Access) → ${t.name}.`,
        },
        {
          ja: `全社の棚卸し段階なら、この省略形のまま進めてよい。全部を精緻にすると完成しない。`,
          en: `During an enterprise-wide inventory, keep the shorthand. Making everything precise means never finishing.`,
        },
      ],
    }),
  },
  {
    id: 'access-non-passive-target',
    test: (s, t, r) => r.id === 'access' && t.aspect !== 'passive',
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `${t.name} は情報の入れ物ではないので、「触る」対象にならない。この線が意図しているのは、おそらく利用関係か順序関係。`,
        en: `${t.name} is not a container of information, so it cannot be accessed. The line probably means a usage or a sequencing relation instead.`,
      },
      alternatives: [
        {
          ja: `利用の意味なら Serving(向きは提供側 → 利用側)。`,
          en: `For usage, use Serving, drawn provider to consumer.`,
        },
        {
          ja: `順序の意味なら Triggering。情報の受け渡しなら Flow にして、線に流れるものの名前を書く。`,
          en: `For sequence, use Triggering; for handing something over, use Flow and label it with what travels.`,
        },
      ],
    }),
  },

  // --- Triggering / Flow ---
  {
    id: 'triggering-behavior-ok',
    test: (s, t, r) => r.id === 'triggering' && s.aspect === 'behavior' && t.aspect === 'behavior',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${s.name} の後に ${t.name} が起きる、という時間関係として正しい。ワークパッケージの依存やプロセスの順序はこの形で描く。`,
        en: `A valid statement of sequence: ${t.name} happens after ${s.name}. Work-package dependencies and process order are drawn exactly like this.`,
      },
      alternatives: [
        {
          ja: `並行してよい相手まで繋がないこと。線を減らすと、本当のクリティカルパスが浮かび上がる。`,
          en: `Do not chain things that could run in parallel. Removing lines is what makes the real critical path visible.`,
        },
      ],
    }),
  },
  {
    id: 'triggering-passive-endpoint',
    test: (s, t, r) => r.id === 'triggering' && (s.aspect === 'passive' || t.aspect === 'passive'),
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `情報やモノ(${s.aspect === 'passive' ? s.name : t.name})は自分で次を起動しない。起動するのは常に振る舞い。`,
        en: `Information and physical things (${s.aspect === 'passive' ? s.name : t.name}) do not set anything off by themselves; behaviour does.`,
      },
      alternatives: [
        {
          ja: `「これが届いたら次が動く」なら、届いた事実を Event として立て、Event → (Triggering) → 次の振る舞い にする。`,
          en: `For "when this arrives, that runs", introduce an Event for the arrival and draw Event → (Triggering) → the next behaviour.`,
        },
        {
          ja: `情報の移動そのものを言いたいなら Flow(振る舞いどうし)で、線のラベルにその情報の名前を書く。`,
          en: `To state the movement itself, use Flow between behaviours and put the information's name on the line.`,
        },
      ],
    }),
  },
  {
    id: 'triggering-active-endpoints',
    test: (s, t, r) => r.id === 'triggering' && s.aspect === 'active' && t.aspect === 'active',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `担い手どうしを順序で繋ぐと、「何が終わったら次に渡るのか」が図から読めない。実際に順序を持つのは振る舞いの方。`,
        en: `Sequencing performers hides what actually has to finish before the hand-off. Order belongs to the behaviour, not to the box that carries it.`,
      },
      alternatives: [
        {
          ja: `${s.name} と ${t.name} それぞれの振る舞いを立て、その振る舞いどうしを Triggering で繋ぐ。引き継ぎの単位が明示される。`,
          en: `Give ${s.name} and ${t.name} each a behaviour and connect those. The unit of hand-off then becomes explicit.`,
        },
        {
          ja: `概略図で細かく描きたくないなら、Flow にしてラベルに引き継ぎ物の名前を書く方がまだ情報量がある。`,
          en: `If a sketch is all you want, Flow with a label naming what is handed over at least carries more information.`,
        },
      ],
    }),
  },
  {
    id: 'flow-behavior-ok',
    test: (s, t, r) => r.id === 'flow' && s.aspect === 'behavior' && t.aspect === 'behavior',
    judge: () => ({
      verdict: 'ok',
      reason: {
        ja: `振る舞いどうしの受け渡しとして正しい。ただし線に「何が流れるか」のラベルが無いと、Triggering との区別が読み手に伝わらない。`,
        en: `A valid hand-off between behaviours. Without a label naming what travels, though, readers cannot tell it apart from Triggering.`,
      },
      alternatives: [
        {
          ja: `ラベルに流れるものの名前(注文データ、承認結果 など)を必ず書く。書けないならその線は Triggering。`,
          en: `Always label it with what moves — order data, approval result. If you cannot, the line was Triggering.`,
        },
      ],
    }),
  },
  {
    id: 'flow-passive-endpoint',
    test: (s, t, r) => r.id === 'flow' && (s.aspect === 'passive' || t.aspect === 'passive'),
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `流れるもの(${s.aspect === 'passive' ? s.name : t.name})を線の端点にすると、誰から誰へ渡ったのかが消える。流れるものは線のラベルに置く。`,
        en: `Putting the thing that moves (${s.aspect === 'passive' ? s.name : t.name}) at the end of the arrow erases who handed it to whom. What moves belongs on the label.`,
      },
      alternatives: [
        {
          ja: `振る舞い → (Flow) → 振る舞い に直し、ラベルに ${s.aspect === 'passive' ? s.name : t.name} と書く。`,
          en: `Redraw as behaviour → (Flow) → behaviour and label the line ${s.aspect === 'passive' ? s.name : t.name}.`,
        },
        {
          ja: `「その情報を読み書きしている」だけなら Access。`,
          en: `If the point is merely reading or writing it, use Access.`,
        },
      ],
    }),
  },

  {
    id: 'flow-active-endpoints',
    test: (s, t, r) => r.id === 'flow' && s.aspect === 'active' && t.aspect === 'active',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `連携図では最もよく見る書き方で、それ自体は通じる。ただし「${s.name} のどの処理が出して、${t.name} のどの処理が受け取るのか」が落ちるため、この図のままでは移行の順番を決められない。段階移行の検討に入った時点で必ず作り直しになる。`,
        en: `The most common shape in integration diagrams, and it does communicate. What it drops is which processing inside ${s.name} emits and which inside ${t.name} receives, so it cannot be used to sequence a migration — and that is exactly when it gets redrawn.`,
      },
      alternatives: [
        {
          ja: `線のラベルに流れるものの名前と向きを必ず書く。ラベルさえ揃っていれば、この省略形のままでも棚卸しには使える。`,
          en: `Always label the line with what travels and which way. With consistent labels the shorthand is still good enough for an inventory.`,
        },
        {
          ja: `移行計画に使う段になったら、両端に振る舞いを立てて 振る舞い → (Flow) → 振る舞い に直す。切替の単位がそこで初めて決まる。`,
          en: `When it is time to plan the migration, give both ends a behaviour and redraw as behaviour → (Flow) → behaviour. That is where the unit of cutover finally gets decided.`,
        },
      ],
    }),
  },

  // --- Composition / Aggregation / Specialization ---
  {
    id: 'composition-aspect-mismatch',
    test: (s, t, r) => r.id === 'composition' && s.aspect !== t.aspect,
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `性質の違うもの(${s.name} と ${t.name})を全体・部分で結んでいる。この線は「分解しても同じ種類のものが出てくる」ときにだけ意味を持つ。今の形だと「中に入っている」という日常語の意味で使ってしまっている可能性が高い。`,
        en: `A whole-part line between two different kinds of thing (${s.name} and ${t.name}). It only carries meaning when decomposing yields the same kind. As drawn, it is most likely being used in the everyday sense of "is inside".`,
      },
      alternatives: [
        {
          ja: `担い手が振る舞いを行う関係なら Assignment。`,
          en: `If a performer carries out behaviour, use Assignment.`,
        },
        {
          ja: `単に「この領域に属する」ことを示したいなら Aggregation か、図の上では Grouping で囲む。線を引かずに済む方が読みやすい。`,
          en: `To say merely "belongs to this domain", use Aggregation, or enclose them in a Grouping. Not drawing a line at all reads better.`,
        },
      ],
    }),
  },
  {
    id: 'composition-cross-layer',
    test: (s, t, r) => r.id === 'composition' && s.layer !== t.layer,
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `層をまたいで全体・部分を作ると、層を分けている意味が消える。${s.name} と ${t.name} は抽象度が違うので、分解ではなく対応付けの関係にあるはず。`,
        en: `A whole-part hierarchy across layers defeats the point of having layers. ${s.name} and ${t.name} sit at different levels of abstraction, so the relation is a correspondence, not a decomposition.`,
      },
      alternatives: [
        {
          ja: `下の層が上の層を支えているなら Serving。抽象と具体の対応なら Realization。`,
          en: `Use Serving if the lower layer supports the upper one, Realization if it is an abstract-to-concrete correspondence.`,
        },
      ],
    }),
  },
  {
    id: 'composition-structural-containment',
    test: (s, t, r) =>
      r.id === 'composition' &&
      s.layer === t.layer &&
      s.aspect === 'active' &&
      t.aspect === 'active' &&
      s.id !== t.id &&
      STRUCTURAL_CONTAINERS.has(s.id) &&
      STRUCTURAL_CONTAINERS.has(t.id),
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `${t.name} が ${s.name} の中に入っている、という物としての入れ子で、分解として素直に読める。${s.name} を撤去すれば中身も一緒に無くなるので、コンポジションの条件を満たしている。`,
        en: `${t.name} sits physically inside ${s.name} — a nesting that reads cleanly as decomposition. Remove ${s.name} and the contents go with it, which is exactly the condition composition asserts.`,
      },
      alternatives: [
        {
          ja: `図の上では線ではなく入れ子の箱で描く。配置の話は線で描くと本数が跳ね上がり、10 要素を超えたあたりで読めなくなる。`,
          en: `Draw it as nested boxes rather than lines. Deployment drawn with lines explodes in count and stops being readable past about ten elements.`,
        },
        {
          ja: `中身が別々に調達・更改されるものなら、コンポジションではなく Aggregation の方が実態に合う。撤去したときに中身が生き残るかどうかで決める。`,
          en: `If the contents are procured or replaced independently, Aggregation matches reality better. Decide by asking whether the contents survive removal of the container.`,
        },
      ],
    }),
  },
  {
    id: 'composition-same-kind',
    test: (s, t, r) => r.id === 'composition' && s.layer === t.layer && s.aspect === t.aspect,
    judge: (s, t) => ({
      verdict: s.id === t.id ? 'ok' : 'questionable',
      reason:
        s.id === t.id
          ? {
              ja: `同じ種類の要素を階層に分解しており、正しい使い方。ただし階層は 3 段までに抑えないと、誰も更新しなくなる。`,
              en: `Decomposing the same kind into levels — the correct use. Keep it to three levels, though, or nobody will maintain it.`,
            }
          : {
              ja: `同じ層・同じ性質だが要素の種類が違う(${s.name} と ${t.name})。分解としては成立しにくく、読み手は「なぜこれが部品なのか」で止まる。`,
              en: `Same layer and same nature but different element kinds (${s.name} and ${t.name}). It rarely reads as a decomposition, and reviewers stall on why one is a part of the other.`,
            },
      alternatives:
        s.id === t.id
          ? [
              {
                ja: `4 段目が必要になったら、それは別の図で扱う話。1 枚に押し込まない。`,
                en: `If a fourth level is needed, it belongs in a separate view. Do not force it onto one page.`,
              },
            ]
          : [
              {
                ja: `束ねたいだけなら Aggregation にする。`,
                en: `If bundling is all you want, use Aggregation.`,
              },
              {
                ja: `一方が他方の一種なら Specialization。`,
                en: `If one is a kind of the other, use Specialization.`,
              },
            ],
    }),
  },
  {
    id: 'aggregation-cross-layer',
    test: (s, t, r) => r.id === 'aggregation' && s.layer !== t.layer && s.id !== 'plateau',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `層をまたいで束ねているので、束ねる基準が図から読めない。${s.name} が ${t.name} を含むと言われても、読み手は判断できない。`,
        en: `Bundling across layers leaves the bundling criterion invisible. Told that ${s.name} contains ${t.name}, a reader has no way to judge it.`,
      },
      alternatives: [
        {
          ja: `プラトーで「その時点に存在するもの」を束ねているなら正しい使い方。凡例にそう書く。`,
          en: `If a plateau is bundling what exists at that point, the use is correct — say so in the legend.`,
        },
        {
          ja: `領域や責任範囲でまとめたいだけなら、線を引かずに Grouping で囲む方が読みやすい。`,
          en: `To group by domain or ownership, enclose them in a Grouping instead of drawing lines.`,
        },
      ],
    }),
  },
  {
    id: 'aggregation-plateau',
    test: (s, t, r) => r.id === 'aggregation' && s.id === 'plateau',
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `プラトーが「その時点で稼働している ${t.name}」を束ねる形で、ロードマップの基本形。現行・移行・目標の 3 枚を同じ書式で作れば、差分がそのままギャップになる。`,
        en: `A plateau bundling the ${t.name} alive at that point — the standard roadmap shape. Build baseline, transition, and target the same way and the diff falls out as your gaps.`,
      },
      alternatives: [
        {
          ja: `束ね忘れた要素は「廃止するもの」の可能性が高い。プラトー間で消えている要素を必ず点検する。`,
          en: `Anything you forgot to bundle is probably something being retired. Always review what disappears between plateaus.`,
        },
      ],
    }),
  },
  {
    id: 'aggregation-same-layer',
    test: (s, t, r) => r.id === 'aggregation' && s.layer === t.layer,
    judge: (s, t) => ({
      verdict: 'ok',
      reason: {
        ja: `同じ層の中で ${t.name} を ${s.name} にまとめて呼ぶ形。束を解いても中身は生き残るので、領域・ポートフォリオ・製品群のような「呼び名としてのまとまり」に合っている。`,
        en: `${s.name} bundling ${t.name} inside one layer. The members survive the bundle being dissolved, which is what makes it right for a domain, a portfolio, or a product family — a grouping that exists mainly as a name.`,
      },
      alternatives: [
        {
          ja: `束ねる基準を凡例に 1 行で書く。「なんとなく近いもの」で束ねた線は、次のレビューで必ず外される。`,
          en: `State the bundling criterion in one line in the legend. A bundle formed from "these feel related" gets pulled apart at the next review.`,
        },
        {
          ja: `束を消しても中身が意味を失うなら、それは Aggregation ではなく Composition。撤去したときに中身が生き残るかで判断する。`,
          en: `If the members lose their meaning when the bundle goes, it was Composition, not Aggregation. Decide by whether they survive removal.`,
        },
      ],
    }),
  },
  {
    id: 'specialization-type-mismatch',
    test: (s, t, r) => r.id === 'specialization' && s.id !== t.id,
    judge: (s, t) => ({
      verdict: 'likely-wrong',
      reason: {
        ja: `「〜の一種」は同じ種類の要素どうしでしか成立しない。${s.name} は ${t.name} の一種ではなく、別の種類のもの。`,
        en: `"A kind of" only holds between elements of the same kind. ${s.name} is not a kind of ${t.name}; it is a different kind of thing.`,
      },
      alternatives: [
        {
          ja: `具体化の意味なら Realization。`,
          en: `If you meant "made concrete", use Realization.`,
        },
        {
          ja: `分類したいだけなら、属性(タグ)や Grouping で表す方が保守しやすい。`,
          en: `If classification is the goal, a tag or a Grouping is easier to maintain.`,
        },
      ],
    }),
  },
  {
    id: 'specialization-same-type',
    test: (s, t, r) => r.id === 'specialization' && s.id === t.id,
    judge: (s) => ({
      verdict: 'ok',
      reason: {
        ja: `同じ種類(${s.name})どうしの特化で、正しい使い方。共通部分を親側に集められる。`,
        en: `A specialization between two elements of the same kind (${s.name}) — correct, and it lets the shared part live on the parent.`,
      },
      alternatives: [
        {
          ja: `親側に何も書けないなら、その階層は要らない。特化は共通部分があるときだけ価値がある。`,
          en: `If nothing can be written on the parent, the hierarchy is not earning its place. Specialization pays off only when something is genuinely shared.`,
        },
      ],
    }),
  },

  // --- Influence ---
  {
    id: 'influence-motivation-ok',
    test: (s, t, r) => r.id === 'influence' && s.aspect === 'motivation' && t.aspect === 'motivation',
    judge: () => ({
      verdict: 'ok',
      reason: {
        ja: `動機層の中での効き方の表現として正しい。正負を添えると、トレードオフが 1 枚で見えるようになる。`,
        en: `A correct way to express effect inside the motivation layer. Qualify it positive or negative and the trade-off becomes visible on one page.`,
      },
      alternatives: [
        {
          ja: `効き方が確定しているなら Realization の方が強い主張になる。Influence を使うのは「不確実だから」であって、逃げ道にしない。`,
          en: `Where the effect is certain, Realization makes the stronger claim. Use Influence because the effect is uncertain, not as an escape hatch.`,
        },
      ],
    }),
  },
  {
    id: 'influence-mixed',
    test: (s, t, r) => r.id === 'influence' && (s.aspect !== 'motivation' || t.aspect !== 'motivation'),
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `動機層の外の要素が絡んでいる。${s.name} が ${t.name} に「効く」という主張は、間の因果が図に描かれていないと検証できない。レビューでいちばん突っ込まれる線。`,
        en: `One end sits outside the motivation layer. The claim that ${s.name} affects ${t.name} cannot be checked unless the chain in between is drawn. This is the line reviewers challenge most.`,
      },
      alternatives: [
        {
          ja: `間に Requirement / Outcome を挟んで Realization の鎖にする。効果の説明責任が果たせる形になる。`,
          en: `Insert Requirement and Outcome to form a realization chain, which makes the effect defensible.`,
        },
        {
          ja: `どうしても因果を書けないなら、その線は削って本文の注記に落とす。図に残すと根拠があるように見えてしまう。`,
          en: `If the chain genuinely cannot be drawn, delete the line and move the claim to a note. Left on the diagram it looks evidenced.`,
        },
      ],
    }),
  },

  // --- Association ---
  {
    id: 'association-catchall',
    test: (s, t, r) => r.id === 'association',
    judge: (s, t) => ({
      verdict: 'questionable',
      reason: {
        ja: `間違いではないが、この線は「${s.name} と ${t.name} は何か関係がある」以上のことを言っていない。作業中は構わないが、レビューに出す図の中で association が過半数を占めていたら、まだ何も決まっていないのと同じ。`,
        en: `Not wrong, but it asserts nothing beyond "${s.name} and ${t.name} are related somehow". Fine while drafting; if associations are the majority of lines in a review-ready view, nothing has actually been decided yet.`,
      },
      alternatives: [
        {
          ja: `依存なら Serving、実現なら Realization、担当なら Assignment、順序なら Triggering、情報の扱いなら Access。この 5 つのどれかに当てはまらないか順に当ててみる。`,
          en: `Try the five in turn: Serving for dependency, Realization for substance, Assignment for who performs, Triggering for order, Access for handling information.`,
        },
        {
          ja: `どれにも当てはまらず、それでも線を残すなら、必ずラベルで意味を書く。無ラベルの association は後から誰にも読めない。`,
          en: `If none fits and the line must stay, label it. An unlabelled association is unreadable to everyone later, including you.`,
        },
      ],
    }),
  },
];

/** 該当ルールが無いときの一般判定 */
function fallbackJudgement(s: ArchiElement, t: ArchiElement, r: ArchiRelationship): Judgement {
  return {
    verdict: 'questionable',
    reason: {
      ja: `${s.name} → ${r.name.en} → ${t.name} について、このツールは個別の判定基準を持っていない(誤りだと言っているのではなく、良し悪しを言い切れる材料が無いという意味)。判定できる組み合わせは、よく描かれて事故も多いものに絞ってある。自分で確かめるなら、「${s.name} と ${t.name} のどちらが相手に依存しているか」を先に決めて、その向きが ${r.name.en} の読み方と一致するかを見るのが速い。`,
      en: `This tool carries no specific verdict for ${s.name} → ${r.name.en} → ${t.name}. That is not a claim that it is wrong — only that there is nothing here to judge it on; the rules cover the pairings that get drawn often and go wrong often. To settle it yourself, decide first which of ${s.name} and ${t.name} depends on the other, then check whether that direction matches how ${r.name.en} is read.`,
    },
    alternatives: [
      {
        ja: `凡例か注記に「この線で何を言いたいか」を 1 行で書けるか試す。書けるならその線は残してよく、書けないなら消す。レビューで質問されたときに答えられるかどうかが実際の基準。`,
        en: `Try writing, in one line, what the link asserts — in the legend or a note. If you can, keep it; if you cannot, delete it. The working test is whether you can answer the question when it comes up in review.`,
      },
      {
        ja: `まず自分がこの誤用に当てはまっていないか確かめる — ${text(r.misuse, 'ja')}`,
        en: `First rule out the common misuse of this line — ${text(r.misuse, 'en')}`,
      },
      {
        ja: `迷ったら、依存(Serving)・実現(Realization)・担当(Assignment)・順序(Triggering)・情報の扱い(Access)の 5 つを順に当ててみる。ほとんどの線はこの 5 つに収まる。`,
        en: `When in doubt, test the five workhorses in order: Serving, Realization, Assignment, Triggering, Access. Nearly every line belongs to one of them.`,
      },
    ],
  };
}

/** 関係の妥当性を判定する */
function judgeRelationship(s: ArchiElement, t: ArchiElement, r: ArchiRelationship): { judgement: Judgement; ruleId: string } {
  for (const rule of RULES) {
    if (rule.test(s, t, r)) {
      return { judgement: rule.judge(s, t, r), ruleId: rule.id };
    }
  }
  return { judgement: fallbackJudgement(s, t, r), ruleId: 'fallback' };
}

/* ------------------------------------------------------------------ *
 * ADM フェーズ → ArchiMate の対応
 * ------------------------------------------------------------------ */

interface DrawItem {
  /** 何を描くか */
  what: Bilingual;
  layers: LayerId[];
  elementIds: string[];
  /** その図の呼び名 */
  viewName: Bilingual;
}

interface PhaseMapping {
  phaseId: string;
  /** この段階の図が答えるべき問い */
  headline: Bilingual;
  draw: DrawItem[];
  /** 成果物を ArchiMate でどう表すか */
  deliverableGuidance: Bilingual[];
  /** この段階では描かないもの */
  doNotDraw: Bilingual[];
  /** 今週やること */
  thisWeek: Bilingual[];
}

const PHASE_MAPPINGS: PhaseMapping[] = [
  {
    phaseId: 'preliminary',
    headline: {
      ja: 'この段階の図が答えるべき問いは「誰がどの権限でアーキテクチャを決めるか」。業務やシステムの中身はまだ一切描かない。',
      en: 'The only question the pictures must answer here is who decides architecture, and under whose authority. Nothing about the business or the systems yet.',
    },
    draw: [
      {
        what: {
          ja: '意思決定の担い手(EA チーム、アーキテクチャ委員会、承認者)と、誰が決定を覆せるか',
          en: 'Who decides — the EA team, the architecture board, the approver — and who can overturn a decision',
        },
        layers: ['business'],
        elementIds: ['business-actor', 'business-role', 'business-collaboration', 'business-function'],
        viewName: { ja: 'ガバナンス体制ビュー', en: 'Governance Organization View' },
      },
      {
        what: {
          ja: 'アーキテクチャ原則と、それを要求している経営上の圧力',
          en: 'The architecture principles and the business pressure demanding them',
        },
        layers: ['motivation'],
        elementIds: ['driver', 'assessment', 'principle', 'stakeholder', 'goal'],
        viewName: { ja: '原則ビュー', en: 'Principles View' },
      },
      {
        what: {
          ja: 'どの事業・どの領域をモデル化の対象にするかの線引き',
          en: 'Where the line falls between what will be modelled and what will not',
        },
        layers: ['strategy'],
        elementIds: ['capability'],
        viewName: { ja: 'スコープ枠取りビュー', en: 'Scope Framing View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Principles: 原則 1 件を Principle 要素 1 個にし、根拠になっている Driver から Influence で結ぶ。文書側には根拠と「守ることで諦めるもの」を書き、モデル側は ID と一行の名前だけにする。両方に長文を置くと必ず片方が腐る。',
        en: 'Architecture Principles: one Principle element per principle, linked by Influence from the Driver behind it. Keep the rationale and the trade-off in the document, and keep only an id and a one-line name in the model. Long text in both places guarantees one of them rots.',
      },
      {
        ja: 'Organizational Model: Business Actor と Business Role で描き、「アーキテクチャ決定を覆せる役割」に印を付ける。この印が無い体制図は、後で必ず「誰に持っていけばよいか分からない」で止まる。',
        en: 'Organizational Model: draw it with Business Actors and Business Roles, and mark the role that can overturn an architecture decision. Without that mark the chart stalls later on "who do I take this to?".',
      },
      {
        ja: 'Tailored Framework: これはモデルではなく規約として書く。ただし「今回使う要素だけに絞った要素リスト」「層ごとの色」「命名の型(振る舞いは動詞+目的語、担い手は名詞)」の 3 つは、ここで決めてモデルファイルの先頭に貼っておく。後から統一するのは不可能に近い。',
        en: 'Tailored Framework: this is a convention document, not a model. But settle three things here and paste them at the front of the model file: the reduced element list you will actually use, the colour per layer, and the naming pattern. Retrofitting consistency later is close to impossible.',
      },
    ],
    doNotDraw: [
      {
        ja: '個別のシステム名。ここで出すと、体制の議論が一瞬でシステム選定の議論にすり替わる。',
        en: 'Named systems. Introduce one and the governance discussion instantly becomes a product-selection discussion.',
      },
      { ja: '目標アーキテクチャの中身(それはフェーズ A 以降)', en: 'Any content of the target architecture — that starts in Phase A' },
      { ja: 'データモデル、インタフェース一覧', en: 'Data models and interface inventories' },
    ],
    thisWeek: [
      {
        ja: '使う要素を 15 個以内に絞った 1 ページの「要素リスト」を作り、EA チームで合意する。7 層 40 種類を全部使う前提で始めると、3 か月後にモデルが読めなくなる。',
        en: 'Produce a one-page element list capped at fifteen kinds and agree it with the EA team. Start out assuming all seven layers and forty-odd kinds, and in three months the model will be unreadable.',
      },
      {
        ja: '層ごとの色と命名規約を決め、モデルファイルの表紙ビューに貼る。',
        en: 'Fix the colour per layer and the naming rule, and paste both onto a cover view inside the model file.',
      },
      {
        ja: 'Archi(無償の ArchiMate モデリングツール)でモデルファイルを 1 つ作り、フォルダを層ごとに切って空のまま置く。器を先に作ると、後から入れる場所で迷わない。',
        en: 'Create one model file in Archi (the free ArchiMate modelling tool), cut folders per layer, and leave them empty. Having the container first removes the "where does this go" hesitation later.',
      },
    ],
  },
  {
    phaseId: 'a',
    headline: {
      ja: 'この段階の図は「経営が投資判断できる 1 枚」。要素は 25 個以内、システム名は 5 個まで。細かく描くほど承認は遠のく。',
      en: 'What you need here is one page an executive can fund. Twenty-five elements maximum, five named systems maximum. The more detail you add, the further approval recedes.',
    },
    draw: [
      {
        what: {
          ja: '誰が何に困っていて、何を達成したいのか',
          en: 'Who hurts where, and what they want to achieve',
        },
        layers: ['motivation'],
        elementIds: ['stakeholder', 'driver', 'assessment', 'goal', 'outcome'],
        viewName: { ja: '動機ビュー', en: 'Motivation View' },
      },
      {
        what: {
          ja: '必要な能力と、その現状評価(色で 3 段階)',
          en: 'The capabilities needed, heat-mapped in three colours by how they stand today',
        },
        layers: ['strategy'],
        elementIds: ['capability', 'resource', 'value-stream'],
        viewName: { ja: 'ケイパビリティマップ(ヒートマップ)', en: 'Capability Map (heat map)' },
      },
      {
        what: {
          ja: '目標の姿の概略。業務の塊とシステムの塊だけを、粗い粒度で',
          en: 'A coarse sketch of the target: blocks of business and blocks of system, nothing finer',
        },
        layers: ['business', 'application'],
        elementIds: ['business-service', 'business-process', 'application-component', 'application-service'],
        viewName: { ja: 'ソリューションコンセプトビュー', en: 'Solution Concept View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Vision: 動機ビュー 1 枚 + ソリューションコンセプト 1 枚。文章を先に書かない。図が先で、文章は「図から読み取れない前提」だけにする。',
        en: 'Architecture Vision: one Motivation View plus one Solution Concept View. Do not write the prose first — draw first, and let the prose carry only what the pictures cannot show.',
      },
      {
        ja: 'Stakeholder Map: Stakeholder を要素として置き、その関心事は Driver / Assessment で表す。影響度と関心度はタグと色で持たせ、別表を作らない。表を別に作ると更新が止まる。',
        en: 'Stakeholder Map: stakeholders as elements, their concerns as Drivers and Assessments, influence and interest as tags and colour. Do not maintain a separate table — separate tables stop being updated.',
      },
      {
        ja: 'Statement of Architecture Work: モデル化しない。ただし「今回モデル化する範囲」を Grouping かフォルダで宣言し、範囲外の要素は灰色にしておく。範囲の議論が図の上で完結する。',
        en: 'Statement of Architecture Work: do not model it. Do declare the modelling scope as a Grouping or folder and grey out what lies outside, so scope arguments can be settled on the diagram.',
      },
    ],
    doNotDraw: [
      { ja: 'インタフェース、データ項目、サーバ構成', en: 'Interfaces, data attributes, server topology' },
      {
        ja: '現行システムの全量棚卸し。フェーズ A でこれをやると、承認前に数か月溶ける。棚卸しはフェーズ C。',
        en: 'A full inventory of existing systems. Doing it in Phase A burns months before any approval. Inventory belongs to Phase C.',
      },
      {
        ja: '30 個を超える要素。読み手が経営層なら、1 枚に 15 個でも多い。',
        en: 'More than thirty elements. If the audience is the executive team, even fifteen on a page is a lot.',
      },
    ],
    thisWeek: [
      {
        ja: '動機ビューを 1 枚描き、スポンサーに 15 分で説明して赤入れをもらう。完成させてから見せない。粗いうちに見せた方が手戻りが小さい。',
        en: 'Draw one Motivation View, walk the sponsor through it in fifteen minutes, and collect the corrections. Do not finish it first — showing it rough costs far less rework.',
      },
      {
        ja: 'ケイパビリティを 1 階層目だけ書き出す(8〜12 個)。2 階層目はスポンサーの合意が取れてからで間に合う。',
        en: 'Write out only level-one capabilities, eight to twelve of them. Level two can wait until the sponsor has agreed to level one.',
      },
      {
        ja: '各 Goal に対して測れる Outcome を 1 つずつ立てる。立てられない Goal は、この案件では扱わないと決める。',
        en: 'Attach one measurable Outcome to each Goal. Any Goal that resists this is a Goal this engagement will not carry.',
      },
    ],
  },
  {
    phaseId: 'b',
    headline: {
      ja: 'この段階の図は「システム名を一切出さずに、誰が何をどの順でやっているか」を描き切れるかが勝負。出した瞬間に業務の議論がシステムの制約に負ける。',
      en: 'The test here is whether you can show who does what in what order without naming a single system. Name one and the business discussion loses to system constraints on the spot.',
    },
    draw: [
      {
        what: { ja: '顧客起点の価値の流れと、部署をまたぐ分断', en: 'Value flowing from the customer inward, and where it breaks across departments' },
        layers: ['strategy'],
        elementIds: ['value-stream', 'capability'],
        viewName: { ja: 'バリューストリームビュー', en: 'Value Stream View' },
      },
      {
        what: { ja: '同種の仕事のまとまり(組織図ではなく機能で切る)', en: 'Work grouped by kind rather than by org chart' },
        layers: ['business'],
        elementIds: ['business-function', 'business-service'],
        viewName: { ja: '業務機能ビュー', en: 'Business Function View' },
      },
      {
        what: { ja: '主要プロセスと担い手、そして引き継ぎの箇所', en: 'The main processes, who performs them, and where the hand-offs are' },
        layers: ['business'],
        elementIds: ['business-role', 'business-actor', 'business-process', 'business-event'],
        viewName: { ja: '業務プロセス協働ビュー', en: 'Business Process Cooperation View' },
      },
      {
        what: { ja: '業務が扱う情報を、業務側の言葉で', en: 'The information the work handles, in the words the business uses' },
        layers: ['business'],
        elementIds: ['business-object'],
        viewName: { ja: '業務情報ビュー', en: 'Business Information View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Definition Document のビジネス節: ビューを貼るだけにして、本文は「図から読み取れない前提・制約・例外」に限定する。図の内容を文章で繰り返すと、変更のたびに二重更新が発生してどちらかが必ず古くなる。',
        en: 'The business section of the Architecture Definition Document: paste the views and restrict the prose to the assumptions, constraints, and exceptions the picture cannot carry. Narrating the diagram in text creates a double update that one side always loses.',
      },
      {
        ja: 'Business Capability Map: Capability を Composition で 2〜3 階層。各能力に「現状の出来 / 目標の出来」の 2 値をタグで持たせ、色で塗る。この 2 値があるだけで投資の優先順位の議論が成立する。',
        en: 'Business Capability Map: capabilities composed two or three levels deep, each tagged with today\'s and the desired level of performance and coloured accordingly. Those two values alone make a prioritization conversation possible.',
      },
      {
        ja: '現行と目標のギャップ: この段階では Gap 要素を作らず、現行ビューと目標ビューを別々に作って差分は表で管理する。Gap をモデルに入れるのはフェーズ E。早く入れると、まだ動く目標像に対してギャップを作り直し続けることになる。',
        en: 'Baseline-to-target gaps: do not create Gap elements yet. Build separate baseline and target views and keep the delta in a table. Gaps enter the model in Phase E; introduce them earlier and you will keep rebuilding them against a target that is still moving.',
      },
    ],
    doNotDraw: [
      {
        ja: 'アプリケーション名。「現行は SAP だから」で業務の理想形の議論が終わってしまう。',
        en: 'Application names. "But we run SAP" ends the conversation about how the work should be.',
      },
      {
        ja: '組織図そのもの。Business Actor を並べただけの図は、業務について何も語らない。',
        en: 'The org chart itself. A wall of Business Actors says nothing about the work.',
      },
      {
        ja: '例外フローの全パターン。主要フロー 1 本と、頻度の高い例外 1〜2 本で十分。',
        en: 'Every exception path. The happy path plus the one or two frequent exceptions is enough.',
      },
    ],
    thisWeek: [
      {
        ja: '主要プロセスを 1 本選び、担い手を Business Role で割り当てて引き継ぎ箇所に印を付ける。印の付いた箇所が、後で自動化の候補になる。',
        en: 'Take one main process, assign Business Roles, and mark every hand-off. Those marks become the automation candidates later.',
      },
      {
        ja: 'ケイパビリティ 1 階層目に対して、現状評価を業務部門と 60 分で塗る。1 人で塗らない。塗る作業そのものが合意形成になる。',
        en: 'Sit with the business for sixty minutes and colour the level-one capabilities. Do not colour them alone — the colouring session is the alignment.',
      },
      {
        ja: '業務用語集を Business Object として 10〜20 個だけ作る。ここで用語を固めておくと、フェーズ C のデータ議論が半分の時間で終わる。',
        en: 'Create ten to twenty Business Objects as a working glossary. Settling vocabulary now halves the time the data discussion takes in Phase C.',
      },
    ],
  },
  {
    phaseId: 'c',
    headline: {
      ja: 'この段階の図が答えるのは「どのシステムが何を提供し、どこで重複し、どのデータを誰が作っているか」。連携図は 1 枚 20 コンポーネントまで。',
      en: 'The questions here: which systems provide what, where they duplicate, and who creates which data. Cap any integration view at twenty components.',
    },
    draw: [
      {
        what: { ja: 'アプリ構成と、システム間の接点', en: 'The application landscape and the contact points between systems' },
        layers: ['application'],
        elementIds: ['application-component', 'application-interface', 'application-collaboration'],
        viewName: { ja: 'アプリケーション協働ビュー', en: 'Application Cooperation View' },
      },
      {
        what: { ja: 'どの業務がどのシステムサービスを使っているか', en: 'Which business behaviour consumes which application service' },
        layers: ['application', 'business'],
        elementIds: ['application-service', 'business-process', 'business-function'],
        viewName: { ja: 'アプリケーション利用ビュー', en: 'Application Usage View' },
      },
      {
        what: { ja: 'データの持ち方と、マスタがどこにあるか', en: 'How data is held, and where the master sits' },
        layers: ['application'],
        elementIds: ['data-object', 'business-object', 'application-function'],
        viewName: { ja: '情報構造ビュー', en: 'Information Structure View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Application Portfolio Catalog: 表を手で作らない。Application Component にオーナー・稼働開始年・廃止予定・重要度をタグで持たせ、モデルから CSV を出す。手作りの台帳は 3 か月で現物とずれる。',
        en: 'Application Portfolio Catalog: do not hand-build the table. Tag each Application Component with owner, in-service year, sunset plan, and criticality, then export CSV from the model. A hand-built inventory diverges from reality inside a quarter.',
      },
      {
        ja: 'Data Entity Catalog: Data Object と Business Object を Realization で結ぶ。1 対 1 にはならない(1 つの業務語が 3 システムに散っている、が普通)。むしろその散り方こそが、この図で見せたい問題。',
        en: 'Data Entity Catalog: link Data Objects to Business Objects with Realization. They will not map one-to-one — one business term scattered across three systems is the normal case, and that scatter is precisely what the view is meant to expose.',
      },
      {
        ja: 'ADD のデータ / アプリケーション節: 現行と目標を必ず同じ書式・同じ配置で描く。配置が違うと、人間の目は差分を見つけられない。左右に並べて初めてギャップの議論ができる。',
        en: 'The data and application sections of the ADD: draw baseline and target in the same format and the same layout. If the layout differs, the human eye cannot spot the delta. Side by side is what makes the gap discussion possible.',
      },
    ],
    doNotDraw: [
      { ja: 'テーブル定義、カラム、型。モデルは設計書ではない。', en: 'Table definitions, columns, and types. The model is not a design spec.' },
      { ja: 'サーバやミドルウェア(フェーズ D で扱う)', en: 'Servers and middleware — those belong to Phase D' },
      {
        ja: '導入がまだ決まっていない製品名。目標像に製品名を書いた瞬間、比較検討の余地が消える。',
        en: 'Product names for things not yet decided. Put a product name in the target and the option space closes.',
      },
    ],
    thisWeek: [
      {
        ja: '主要な Business Object を 1 つ選び、それを作っているシステムを全部洗い出す。2 つ以上あったら、それが今回いちばん価値のある発見になる。',
        en: 'Pick one important Business Object and find every system that creates it. If there is more than one, that is the most valuable finding of the engagement so far.',
      },
      {
        ja: '連携が 20 本を超えている図を、業務領域で 2〜3 枚に割る。1 枚に収めようとする努力は捨てる。',
        en: 'Split any view carrying more than twenty links into two or three by business domain. Give up on fitting it on one page.',
      },
      {
        ja: '各 Application Component にオーナーをタグで入れる。オーナー不明のものが出てきたら、それは技術的負債ではなく組織の課題。',
        en: 'Tag every Application Component with an owner. Anything left without one is an organizational problem, not a technical debt item.',
      },
    ],
  },
  {
    phaseId: 'd',
    headline: {
      ja: 'この段階の図が答えるのは「どこで動き、止まったら何が困るか」。目的は構成管理ではなく、障害の影響を業務まで辿れるようにすること。',
      en: 'The question here is where it runs and what breaks when it stops. The purpose is not configuration management but being able to trace an outage all the way up to the business.',
    },
    draw: [
      {
        what: { ja: 'どのノードに何が載っているか', en: 'What is deployed onto which node' },
        layers: ['technology'],
        elementIds: ['node', 'device', 'system-software', 'artifact'],
        viewName: { ja: '配置ビュー', en: 'Deployment View' },
      },
      {
        what: { ja: '基盤が提供するサービスと、それに依存しているアプリ', en: 'What the platform offers and which applications depend on it' },
        layers: ['technology', 'application'],
        elementIds: ['technology-service', 'application-component'],
        viewName: { ja: '基盤利用ビュー', en: 'Technology Usage View' },
      },
      {
        what: { ja: 'ネットワークと境界(社内 / DMZ / 外部)', en: 'Networks and zone boundaries: internal, DMZ, external' },
        layers: ['technology'],
        elementIds: ['communication-network', 'path', 'node'],
        viewName: { ja: 'ネットワークビュー', en: 'Network View' },
      },
      {
        what: { ja: '設備・拠点(モノが動く業界のみ)', en: 'Equipment and sites — only where physical things move' },
        layers: ['physical'],
        elementIds: ['facility', 'equipment', 'distribution-network', 'material'],
        viewName: { ja: '物理ビュー', en: 'Physical View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Technology Standards Catalog: System Software と Node に「標準 / 許容 / 廃止予定」の 3 値タグを付け、色で塗る。表はモデルから出す。この 3 色があると、新規案件のレビューが「この色は使えません」の一言で終わる。',
        en: 'Technology Standards Catalog: tag every System Software and Node as adopted, tolerated, or sunsetting, and colour accordingly. Export the table from the model. With those three colours, reviewing a new project reduces to "that colour is not available".',
      },
      {
        ja: 'ADD のテクノロジー節: 可用性や性能の要件は Requirement として動機層に置き、対象ノードとは Realization で結ぶ。テクノロジー要素の中に「99.9%」と書き込むと、要件の一覧が作れなくなる。',
        en: 'The technology section of the ADD: keep availability and performance requirements as Requirements in the motivation layer, linked to the nodes by Realization. Writing "99.9%" inside a technology element makes the requirement list unbuildable.',
      },
      {
        ja: '障害影響の説明: Node → Artifact → Application Component → Application Service → Business Process の鎖を 1 本だけでも通しておくと、「このサーバが落ちると何が止まるか」に図で即答できる。全部通す必要はない。重要業務 1 本で十分。',
        en: 'Outage impact: run the chain Node → Artifact → Application Component → Application Service → Business Process end to end for even one path, and "what stops when this server dies" becomes answerable from the diagram. You do not need every path — one critical one suffices.',
      },
    ],
    doNotDraw: [
      {
        ja: 'IP アドレス、ホスト名の全量。モデルは CMDB ではない。役割が同じノードは 1 個にまとめる。',
        en: 'Every IP and hostname. The model is not a CMDB. Collapse nodes that play the same role.',
      },
      { ja: 'ラック配置図、配線図', en: 'Rack layouts and cabling diagrams' },
      { ja: 'アプリの内部構造(フェーズ C の話)', en: 'The internals of applications — that was Phase C' },
    ],
    thisWeek: [
      {
        ja: '最重要業務を 1 本選び、そこから下に向かってノードまで鎖を通す。途中で切れたところが、実は誰も把握していない依存。',
        en: 'Pick the single most critical business process and trace the chain downward to the nodes. Wherever it breaks is a dependency nobody currently owns.',
      },
      {
        ja: 'System Software に 3 色タグを付ける。まず 20 個。全部やろうとしない。',
        en: 'Apply the three-colour tag to System Software — twenty of them to start. Do not attempt the whole estate.',
      },
      {
        ja: '物理層を使うかどうかをここで決める。使わないなら空のまま放置してよい。「7 層あるから埋める」は最悪の判断。',
        en: 'Decide now whether the physical layer is in play. If not, leave it empty. Filling it because "there are seven layers" is the worst possible reason.',
      },
    ],
  },
  {
    phaseId: 'e',
    headline: {
      ja: 'この段階で初めて実装・移行層を使う。答えるのは「差分を工事単位にどう切り、どれを先にやるか」。ここでモデルが「絵」から「計画」に変わる。',
      en: 'This is where the implementation and migration layer finally comes into play. The question: how to cut the delta into fundable chunks and which to do first. Here the model turns from a picture into a plan.',
    },
    draw: [
      {
        what: { ja: '現行と目標の差分を明示する', en: 'The delta between baseline and target, made explicit' },
        layers: ['implementation'],
        elementIds: ['gap', 'plateau'],
        viewName: { ja: 'ギャップビュー', en: 'Gap View' },
      },
      {
        what: { ja: '差分を埋める作業のまとまりと、そこから出る納品物', en: 'The chunks of work that close the gaps and what they hand over' },
        layers: ['implementation'],
        elementIds: ['work-package', 'deliverable'],
        viewName: { ja: 'ワークパッケージビュー', en: 'Work Package View' },
      },
      {
        what: { ja: '各ワークパッケージが触る要素(影響範囲)', en: 'What each work package touches' },
        layers: ['implementation', 'application', 'business'],
        elementIds: ['work-package', 'application-component', 'business-process'],
        viewName: { ja: '影響範囲ビュー', en: 'Impact View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Roadmap: Plateau を 3〜4 個に絞る(現行 / 移行 1〜2 / 目標)。各プラトーは Aggregation で「その時点に生きている要素」を束ねる。5 個以上作ると誰も更新しない。',
        en: 'Architecture Roadmap: cap plateaus at three or four — baseline, one or two transitions, target. Each aggregates what is alive at that point. Past five, nobody maintains them.',
      },
      {
        ja: 'Transition Architecture: 各プラトーに「ここで止めても業務が回るか」を注記する。止められない区切りは区切りではなく、単なる工程の途中。',
        en: 'Transition Architecture: annotate each plateau with whether the business still runs if you stop there. A step you cannot stop at is not a step, just a point mid-construction.',
      },
      {
        ja: 'ギャップは「作る」だけでなく「捨てる」も必ず立てる。廃止のギャップを立て忘れると、新旧の二重運用が既定路線になり、コスト削減の効果が丸ごと消える。',
        en: 'Raise disposal gaps alongside build gaps. Forget the retirements and running old and new in parallel becomes the default, wiping out the entire cost case.',
      },
      {
        ja: 'Work Package は「予算が取れる単位」で切る。技術的にきれいでも稟議の通らない粒度は、モデルの上でしか存在しない。',
        en: 'Cut work packages at the size that can get funded. A technically elegant package no approval process recognizes exists only inside the model.',
      },
    ],
    doNotDraw: [
      { ja: 'タスクレベルの WBS。それは計画ツール側の仕事。', en: 'A task-level WBS. That is the planning tool\'s job.' },
      {
        ja: 'まだ採否が決まっていない選択肢を Plateau にする。選択肢の比較は別ビューか別モデルでやる。',
        en: 'Options not yet chosen, modelled as plateaus. Compare options in a separate view or model.',
      },
    ],
    thisWeek: [
      {
        ja: '現行プラトーと目標プラトーを Aggregation で作り、両方に入っていない要素を機械的に洗い出す。それがギャップの初版になる。',
        en: 'Build the baseline and target plateaus as aggregations and mechanically list what appears in only one of them. That list is your first-cut gap register.',
      },
      {
        ja: '「捨てるもの」のギャップを最低 3 つ立てる。作るものだけのロードマップは、コストが増えるだけの計画。',
        en: 'Raise at least three disposal gaps. A roadmap of only additions is a plan that raises cost and nothing else.',
      },
      {
        ja: '各ワークパッケージに便益の受け取り手(役割名)を 1 人ずつ書く。書けないものは、この段階で落とす。',
        en: 'Name one benefit owner, by role, for each work package. Drop any package where you cannot.',
      },
    ],
  },
  {
    phaseId: 'f',
    headline: {
      ja: 'この段階の図が答えるのは「順序と依存、そして中断できる区切り」。日付はモデルに書かない。順序だけをモデルに、日付は計画表に。',
      en: 'The questions here: order, dependency, and where you can safely stop. Keep dates out of the model — order in the model, dates in the plan.',
    },
    draw: [
      {
        what: { ja: 'プラトーの時系列と、その間のギャップ', en: 'The plateaus in sequence and the gaps between them' },
        layers: ['implementation'],
        elementIds: ['plateau', 'gap'],
        viewName: { ja: '移行ロードマップビュー', en: 'Migration Roadmap View' },
      },
      {
        what: { ja: 'ワークパッケージ間の依存と、後戻りできない地点', en: 'Dependencies between work packages and the points of no return' },
        layers: ['implementation'],
        elementIds: ['work-package', 'implementation-event', 'deliverable'],
        viewName: { ja: '実施順序ビュー', en: 'Implementation Sequence View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Implementation and Migration Plan: 依存は Triggering で描く。並行してよいものは繋がない。線を引きすぎると全部が直列に見えて、実際より長い計画になる。',
        en: 'Implementation and Migration Plan: dependencies as Triggering, and nothing drawn between things that may run in parallel. Over-connect and everything looks serial, producing a plan longer than reality.',
      },
      {
        ja: '各プラトーに「切り戻せるか」を注記する。切り戻し不能な地点は Implementation Event として明示し、その手前に判断ゲートを置く。',
        en: 'Annotate each plateau with whether you can roll back. Mark the irreversible points as Implementation Events and place a decision gate just before each.',
      },
      {
        ja: 'ロードマップの図は縦軸をプラトー、横軸を業務領域にすると経営層に通りやすい。技術領域を縦軸にすると、聴衆が自分の関心事を探せなくなる。',
        en: 'Lay the roadmap out with plateaus on one axis and business domains on the other. Put technical domains on the axis instead and the audience can no longer find their own concern.',
      },
    ],
    doNotDraw: [
      {
        ja: '日付そのもの。日付を入れた図は更新が追いつかず、3 か月で「古い資料」になる。',
        en: 'Actual dates. A dated diagram falls behind and becomes "the old deck" within a quarter.',
      },
      { ja: '要員名・工数。それは計画側の管理項目。', en: 'Named people and effort figures — planning-side concerns.' },
    ],
    thisWeek: [
      {
        ja: 'ワークパッケージの依存を引き直し、本当に直列でなければならない線だけを残す。残った線がクリティカルパス。',
        en: 'Redraw the dependencies keeping only the links that genuinely must be serial. What remains is the critical path.',
      },
      {
        ja: '各プラトーに「ここで止めても業務が回る」と書けるか確かめる。書けないプラトーは切り方が間違っている。',
        en: 'Check that each plateau can honestly be annotated "the business still runs if we stop here". Any that cannot is cut in the wrong place.',
      },
      {
        ja: '後戻りできない地点を Implementation Event で 1〜3 個だけ明示し、その承認者を名前で書く。',
        en: 'Mark one to three points of no return as Implementation Events and name the approver for each.',
      },
    ],
  },
  {
    phaseId: 'g',
    headline: {
      ja: 'この段階の図が答えるのは「作られたものが約束と違っていないか」。設計の良し悪しではなく、約束との差だけを見る。',
      en: 'The question here is whether what got built matches what was promised. Not whether the design is good — only where it differs from the promise.',
    },
    draw: [
      {
        what: { ja: '守るべき要件・制約・原則と、それを負っている実装物', en: 'The requirements, constraints, and principles in force, and what is on the hook for them' },
        layers: ['motivation', 'implementation'],
        elementIds: ['requirement', 'constraint', 'principle', 'work-package', 'deliverable'],
        viewName: { ja: '準拠性ビュー', en: 'Compliance View' },
      },
      {
        what: { ja: '目標モデルと、実際に作られたものの差', en: 'The delta between the target model and what actually got built' },
        layers: ['implementation'],
        elementIds: ['plateau', 'gap'],
        viewName: { ja: '実装差分ビュー', en: 'As-Built Delta View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Contract: モデル上は Requirement と Constraint の集合として持ち、契約文書からはその ID を参照するだけにする。契約書に要件の文章を書き写すと、変更が入ったときに 2 箇所直すことになり、必ず片方が漏れる。',
        en: 'Architecture Contract: hold it in the model as a set of Requirements and Constraints, and have the contract document cite their ids. Copy the requirement text into the contract and every change needs two edits, one of which will be missed.',
      },
      {
        ja: 'Compliance Assessment: 判定は「準拠 / 逸脱 / 例外承認済み」の 3 値を色で示す。文章の判定文を並べない。3 色の図なら 1 分で状況が伝わるが、判定文の一覧は誰も読まない。',
        en: 'Compliance Assessment: show the verdict as three colours — compliant, deviating, waiver granted. Do not list verdict sentences. Three colours land in a minute; a list of sentences goes unread.',
      },
      {
        ja: '例外承認は「いつまでの例外か」を必ずタグで持たせる。期限のない例外は、事実上の標準変更。',
        en: 'Every waiver carries an expiry tag. A waiver without an end date is a de facto change to the standard.',
      },
    ],
    doNotDraw: [
      {
        ja: '設計の詳細。レビュー対象は「約束との差」であって、設計の巧拙ではない。ここを混ぜると、レビューが個人の趣味の議論になる。',
        en: 'Design detail. The object of review is the deviation from the promise, not the elegance of the design. Mix them and the review becomes a matter of personal taste.',
      },
      { ja: '準拠している要素まで全部描くこと。逸脱と例外だけで図は成立する。', en: 'Everything that complies. Deviations and waivers alone make a complete view.' },
    ],
    thisWeek: [
      {
        ja: '逸脱を 3 色で塗った 1 枚を作り、アーキテクチャ委員会に出す。全件の一覧は付録に回す。',
        en: 'Produce a single three-colour page of deviations for the architecture board and push the full list into an appendix.',
      },
      {
        ja: '例外承認に期限タグが入っているか確認する。入っていないものは、その場で期限を決める。',
        en: 'Check that every waiver carries an expiry, and set one on the spot where it is missing.',
      },
      {
        ja: '実装で変わった点をモデルに反映する。反映しないまま次のフェーズに進むと、次の案件が古い目標像を基準にしてしまう。',
        en: 'Fold what changed during build back into the model. Skip this and the next engagement will plan against a stale target.',
      },
    ],
  },
  {
    phaseId: 'h',
    headline: {
      ja: 'この段階の図が答えるのは「この変更要求はモデルのどこを壊すか」。30 分で答えられる状態を保つことが、この層の存在理由。',
      en: 'The question here: what does this change request break? Being able to answer it in thirty minutes is the entire justification for keeping the model alive.',
    },
    draw: [
      {
        what: { ja: '変更の引き金と、現状に対する評価', en: 'What triggered the change and how the current state is judged' },
        layers: ['motivation'],
        elementIds: ['driver', 'assessment', 'goal', 'stakeholder'],
        viewName: { ja: '変更ドライバービュー', en: 'Change Driver View' },
      },
      {
        what: { ja: '影響を受ける要素の連鎖(上下に辿る)', en: 'The chain of affected elements, traced up and down' },
        layers: ['business', 'application', 'technology'],
        elementIds: ['business-process', 'application-component', 'application-service', 'node'],
        viewName: { ja: '影響分析ビュー', en: 'Impact Analysis View' },
      },
      {
        what: { ja: '現行プラトーと、変更後に必要になる新しいプラトー', en: 'The current plateau and the new one the change demands' },
        layers: ['implementation'],
        elementIds: ['plateau', 'gap', 'work-package'],
        viewName: { ja: '変更後プラトービュー', en: 'Post-Change Plateau View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Requirements Impact Assessment: 影響範囲は図で示し、表は「変更する要素 ID / 変更理由 / 影響先」の 3 列に絞る。列が増えるほど誰も埋めなくなる。',
        en: 'Requirements Impact Assessment: show the blast radius as a picture and keep the table to three columns — element id, reason, downstream impact. More columns means fewer filled in.',
      },
      {
        ja: '判断基準を図から出す: 影響が 1 層に閉じているならフェーズ H の中で処理する。層をまたいでいるならフェーズ A に戻して作業依頼から作り直す。この線引きを図で示せると、差し戻しの議論が politics にならない。',
        en: 'Let the picture make the call: impact confined to one layer stays inside Phase H; impact crossing layers goes back to Phase A as a fresh request. Showing that line on a diagram keeps the escalation from turning political.',
      },
      {
        ja: '影響の無い要素は灰色にするのではなく、図から消す。残っていると読み手は「これも影響あるのか」を毎回確認することになる。',
        en: 'Delete unaffected elements rather than greying them out. Left on the page, every reader re-checks whether they are affected too.',
      },
    ],
    doNotDraw: [
      { ja: '影響のない要素', en: 'Anything unaffected' },
      {
        ja: '変更後の詳細設計。ここで描くのは影響範囲であって、解決策ではない。',
        en: 'The post-change design. What belongs here is the blast radius, not the solution.',
      },
    ],
    thisWeek: [
      {
        ja: '直近の変更要求を 1 件選び、影響分析ビューを 30 分で描いてみる。描けないなら、モデルのどこが欠けているかが分かる。それが次に埋めるべき箇所。',
        en: 'Take a recent change request and try to draw its impact view in thirty minutes. Failing tells you exactly which part of the model is missing — and that is what to fill in next.',
      },
      {
        ja: '「1 層に閉じるか / 層をまたぐか」の判定基準を 1 行で書き、変更管理の手順書に入れる。',
        en: 'Write the one-line test — confined to one layer, or crossing layers — into the change management procedure.',
      },
      {
        ja: 'モデルの最終更新日を確認する。3 か月以上前なら、影響分析より先にモデルの現行化をやる。',
        en: 'Check when the model was last touched. If it is more than three months old, refresh it before attempting any impact analysis.',
      },
    ],
  },
  {
    phaseId: 'requirements-management',
    headline: {
      ja: 'ここの図が答えるのは「この要件は、どの目標のために、どの要素で実現されるか」。1 本の線で端から端まで辿れる状態を保つ。',
      en: 'The question: which goal is this requirement serving, and which element makes it real? Keep the line traceable end to end.',
    },
    draw: [
      {
        what: { ja: '関心事から要件までの筋道', en: 'The path from a concern down to a requirement' },
        layers: ['motivation'],
        elementIds: ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'requirement', 'constraint'],
        viewName: { ja: '要件実現ビュー', en: 'Requirements Realization View' },
      },
      {
        what: { ja: '要件と、それを担う実装側の要素', en: 'Requirements and the implementation-side elements carrying them' },
        layers: ['motivation', 'application', 'business'],
        elementIds: ['requirement', 'application-component', 'application-service', 'business-process'],
        viewName: { ja: '要件割り当てビュー', en: 'Requirement Allocation View' },
      },
    ],
    deliverableGuidance: [
      {
        ja: 'Architecture Requirements Specification: 要件 1 件 = Requirement 要素 1 個 + 安定 ID。文書側は ID を参照するだけにする。文書に本文を持たせると、モデルと文書の両方を直すことになる。',
        en: 'Architecture Requirements Specification: one Requirement element with a stable id per requirement, and let the document cite ids. Give the document its own copy of the text and every change becomes two edits.',
      },
      {
        ja: 'トレーサビリティ表はモデルから生成する。Goal → Outcome → Requirement → 実装要素 の鎖が繋がっていれば、表は自動で出る。手で作った追跡表は 1 回目の変更で壊れる。',
        en: 'Generate the traceability matrix from the model. With the chain Goal → Outcome → Requirement → implementing element intact, the matrix falls out. A hand-built one breaks at the first change.',
      },
      {
        ja: '要件の文面に解決策が書かれていたら、それは要件ではなく設計判断。Requirement から外して、決定記録として別に管理する。混ぜたまま進めると、後で「その要件は必須なのか」が誰にも判断できなくなる。',
        en: 'If a requirement\'s text prescribes a solution, it is a design decision. Move it out of Requirement and track it as a decision record. Left mixed in, nobody can later tell which requirements are actually mandatory.',
      },
    ],
    doNotDraw: [
      { ja: '解決策が書かれた「要件」', en: 'So-called requirements that prescribe a solution' },
      {
        ja: 'すべての要件を 1 枚に。ビューは目標単位か関心事単位で割る。',
        en: 'Every requirement on one page. Split views by goal or by concern.',
      },
    ],
    thisWeek: [
      {
        ja: '主要な Goal を 1 つ選び、そこから要件まで鎖を辿れるか試す。切れているところが、説明できない投資になっている箇所。',
        en: 'Pick one major goal and try to walk the chain down to requirements. Wherever it breaks is spend you cannot currently justify.',
      },
      {
        ja: '要件の文面を 10 件読み、解決策が書かれているものを別リストに移す。だいたい 3 割は出てくる。',
        en: 'Read ten requirement statements and move the solution-prescribing ones to a separate list. Roughly a third will qualify.',
      },
      {
        ja: '各 Goal に測れる Outcome があるか確認する。無い Goal は、達成報告ができない。',
        en: 'Verify every goal has a measurable outcome. A goal without one can never be reported as achieved.',
      },
    ],
  },
];

function findPhaseMapping(phaseId: string): PhaseMapping | undefined {
  return PHASE_MAPPINGS.find((m) => m.phaseId === phaseId);
}

/* ------------------------------------------------------------------ *
 * ビュー提案のレシピ
 * ------------------------------------------------------------------ */

interface ViewRecipe {
  id: string;
  name: Bilingual;
  /** 関心事の自由記述に当てるキーワード(日英) */
  keywords: string[];
  /** この図が答える問い */
  answers: Bilingual;
  layers: LayerId[];
  /** 主役の要素 */
  elementIds: string[];
  /** 主に使う関係 */
  relationshipIds: string[];
  /** 並べ方(独自の版面指示) */
  layout: Bilingual[];
  /** この図に描かないもの */
  doNotDraw: Bilingual[];
  /** 完成の判定 */
  doneWhen: Bilingual;
  /** 関連する ADM フェーズ */
  admPhaseIds: string[];
}

const VIEW_RECIPES: ViewRecipe[] = [
  {
    id: 'motivation',
    name: { ja: '動機ビュー', en: 'Motivation View' },
    keywords: [
      'why', 'goal', 'objective', 'rationale', 'justify', 'justification', 'strategy', 'investment', 'business case',
      'なぜ', '目的', '狙い', '目標', '根拠', '正当化', '投資', '経営', '戦略', '意義', '納得',
    ],
    answers: {
      ja: 'なぜこの投資をするのか、誰の困りごとを解くのか、達成したと言える条件は何か。',
      en: 'Why this investment, whose pain it removes, and what counts as done.',
    },
    layers: ['motivation'],
    elementIds: ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'requirement'],
    relationshipIds: ['influence', 'realization', 'association'],
    layout: [
      {
        ja: '左から右へ 4 列: ステークホルダー → ドライバー / 評価 → 目標 → 成果。左が「立場」、右に行くほど「測れるもの」になる並びにする。',
        en: 'Four columns left to right: stakeholders, then drivers and assessments, then goals, then outcomes. Stances on the left, measurable things on the right.',
      },
      {
        ja: '要件は最右列の下段にまとめる。上下ではなく左右に流すと、経営層が「で、何がどうなるの」を左から右に読める。',
        en: 'Park requirements at the bottom of the rightmost column. Flowing left to right rather than top to bottom lets an executive read "so what changes" in one sweep.',
      },
      {
        ja: 'マイナスの影響(この目標を追うと別の目標が犠牲になる)は Influence にマイナス記号を付けて必ず 1 本は描く。トレードオフの無い提案は疑われる。',
        en: 'Draw at least one negative Influence showing the goal you sacrifice. A proposal with no visible trade-off invites suspicion.',
      },
    ],
    doNotDraw: [
      { ja: 'システム名・製品名。手段が出た瞬間に目的の議論が終わる。', en: 'System and product names. The moment a means appears, the discussion of ends is over.' },
      { ja: '実現方法・アーキテクチャ図の要素', en: 'How it will be built — any core-layer element' },
      { ja: '測れない Outcome。数字が入らないなら Goal のままにしておく。', en: 'Outcomes without numbers. If no number fits, leave it as a Goal.' },
    ],
    doneWhen: {
      ja: '各 Goal に測れる Outcome が 1 つずつ付き、Outcome を読むだけで「達成したか」を判定できる状態。',
      en: 'Every goal carries one measurable outcome, and reading the outcomes alone settles whether it was achieved.',
    },
    admPhaseIds: ['a', 'requirements-management'],
  },
  {
    id: 'capability-map',
    name: { ja: 'ケイパビリティマップ(ヒートマップ)', en: 'Capability Map (heat map)' },
    keywords: [
      'capability', 'capabilities', 'maturity', 'heat map', 'heatmap', 'priority', 'invest', 'gap',
      '能力', 'ケイパビリティ', '成熟度', 'ヒートマップ', '優先', '投資判断', 'どこから', '弱み', '強み',
    ],
    answers: {
      ja: 'この組織は何ができて何ができないのか、どこに先に投資すべきか。',
      en: 'What this organization can and cannot do, and where the money should go first.',
    },
    layers: ['strategy'],
    elementIds: ['capability', 'resource', 'value-stream'],
    relationshipIds: ['composition', 'assignment', 'serving'],
    layout: [
      {
        ja: '1 階層目を横一列に 8〜12 個。その下に 2 階層目をタイルで敷き詰める。線は引かない(Composition は入れ子の配置で表す)。線を引いた瞬間に読めなくなる。',
        en: 'Eight to twelve level-one capabilities across the top, level two tiled beneath them. Do not draw the composition lines — express them by nesting. Lines here kill readability instantly.',
      },
      {
        ja: '色は 3 段階まで。5 段階にすると、塗る側が悩んで会議が終わらない。',
        en: 'Three colour bands, never five. Five makes the room argue about shades instead of priorities.',
      },
      {
        ja: '「現状の出来」と「目標の出来」を別々に塗った 2 枚を並べる。差が大きいタイルが投資候補。1 枚に両方を詰め込まない。',
        en: 'Two copies side by side: one coloured by today, one by the desired level. The tiles with the biggest difference are the investment candidates. Do not cram both into one page.',
      },
    ],
    doNotDraw: [
      { ja: '部署名・製品名でのケイパビリティ命名', en: 'Capabilities named after departments or products' },
      { ja: '3 階層目より下。維持できない。', en: 'Anything below level three. It will not be maintained.' },
      { ja: 'プロセスの順序。能力は順序を持たない。', en: 'Sequence. Capabilities have no order.' },
    ],
    doneWhen: {
      ja: '色の濃いタイルを指して「ここから手を付ける」と業務部門が言える状態。',
      en: 'The business can point at a dark tile and say "we start here".',
    },
    admPhaseIds: ['a', 'b', 'e'],
  },
  {
    id: 'value-stream',
    name: { ja: 'バリューストリームビュー', en: 'Value Stream View' },
    keywords: [
      'value stream', 'customer journey', 'end to end', 'end-to-end', 'lead time', 'handoff', 'hand-off', 'customer',
      'バリューストリーム', '価値の流れ', '顧客体験', '顧客', 'リードタイム', '一気通貫', '端から端', '引き継ぎ', '分断', 'たらい回し',
    ],
    answers: {
      ja: '顧客に価値が届くまでにどこで止まっているのか、誰と誰の間で落ちているのか。',
      en: 'Where value stalls on its way to the customer, and between whom it gets dropped.',
    },
    layers: ['strategy', 'business'],
    elementIds: ['value-stream', 'capability', 'business-process', 'business-role', 'business-event'],
    relationshipIds: ['triggering', 'assignment', 'serving'],
    layout: [
      {
        ja: '横一列に左から右へ、顧客の起点から価値の受け取りまで。段は 1 段だけにする。2 段に折り返した瞬間に「端から端」の感覚が消える。',
        en: 'One single row, left to right, from the customer trigger to the value received. Never wrap to a second row — wrapping destroys the sense of end to end.',
      },
      {
        ja: '各段の下に担い手(Business Role)を置き、担い手が変わる境目に縦線を入れる。この縦線の数が、リードタイムの敵の数。',
        en: 'Put the performing role under each stage and draw a vertical rule wherever the performer changes. The count of those rules is the count of enemies of lead time.',
      },
      {
        ja: '各段に必要なケイパビリティを 1 つずつ紐づける。ここでケイパビリティマップと接続できると、投資の議論が顧客価値の言葉で語れるようになる。',
        en: 'Tie one capability to each stage. Wiring this into the capability map lets the investment conversation be held in the language of customer value.',
      },
    ],
    doNotDraw: [
      { ja: '組織の内部都合による工程分割。顧客から見えない工程は 1 つにまとめる。', en: 'Stages that exist for internal convenience. Collapse anything the customer cannot see.' },
      { ja: 'システム名', en: 'System names' },
      { ja: '例外フロー。主流を 1 本だけ描く。', en: 'Exception paths. One mainline only.' },
    ],
    doneWhen: {
      ja: '縦線(担い手の切れ目)の場所を指して、業務部門が「ここで待ちが発生する」と即答できる状態。',
      en: 'The business can point at a vertical rule and immediately name the wait that happens there.',
    },
    admPhaseIds: ['a', 'b'],
  },
  {
    id: 'business-process',
    name: { ja: '業務プロセス協働ビュー', en: 'Business Process Cooperation View' },
    keywords: [
      'process', 'who does', 'responsibility', 'raci', 'role', 'handover', 'workflow', 'approval',
      'プロセス', '業務', '手順', '誰が', '担当', '役割', '責任', '承認', '引き継ぎ', 'フロー', '内製', '外注',
    ],
    answers: {
      ja: '誰が何をどの順にやり、どこで引き継ぎ、どこで承認が要るのか。',
      en: 'Who does what in what order, where the hand-offs are, and where approval is needed.',
    },
    layers: ['business'],
    elementIds: ['business-process', 'business-role', 'business-actor', 'business-event', 'business-object', 'business-service'],
    relationshipIds: ['triggering', 'assignment', 'access', 'realization'],
    layout: [
      {
        ja: '横軸を時間(左から右)、縦軸を担い手のレーンにする。レーンは 5 本まで。6 本を超えたら、その業務は分割すべき。',
        en: 'Time across, performer lanes down. Five lanes maximum — beyond six, the process itself needs splitting.',
      },
      {
        ja: '起点に Business Event を必ず置く。「何が起きたら始まるのか」が無い業務フローは、読み手が入口を探して迷う。',
        en: 'Always start with a Business Event. Without a stated trigger, readers hunt for the entrance.',
      },
      {
        ja: '扱う情報(Business Object)は下段に一列に並べ、Access で結ぶ。プロセスの箱の中に情報名を書き込まない。',
        en: 'Line the Business Objects up along the bottom and connect them with Access. Do not write information names inside the process boxes.',
      },
    ],
    doNotDraw: [
      { ja: 'アプリケーション名。業務の理想形の議論が現行システムの制約に負ける。', en: 'Application names. The conversation about how the work should be loses to today\'s system constraints.' },
      { ja: '全ての例外分岐。主流 1 本と頻度の高い例外 1〜2 本まで。', en: 'Every branch. Mainline plus one or two frequent exceptions.' },
      { ja: '判断ロジックの詳細。それは業務ルールとして別に管理する。', en: 'Decision logic in detail — manage that separately as business rules.' },
    ],
    doneWhen: {
      ja: 'レーンをまたぐ矢印の本数を数えられ、そのうち何本が自動化候補かを指させる状態。',
      en: 'You can count the arrows crossing lanes and point at which of them are automation candidates.',
    },
    admPhaseIds: ['b', 'h'],
  },
  {
    id: 'application-cooperation',
    name: { ja: 'アプリケーション協働ビュー(連携図)', en: 'Application Cooperation View (integration landscape)' },
    keywords: [
      'integration', 'interface', 'api', 'spaghetti', 'silo', 'coupling', 'landscape', 'connect', 'data exchange',
      '連携', 'インタフェース', 'インターフェース', 'サイロ', 'スパゲッティ', '密結合', '重複', '乱立', 'システム間', '接続', 'データ連携',
    ],
    answers: {
      ja: 'システム同士がどう繋がっていて、どこが絡まっていて、どこに手を入れると全体が軽くなるのか。',
      en: 'How the systems connect, where the tangle is, and which single cut relieves the most of it.',
    },
    layers: ['application'],
    elementIds: ['application-component', 'application-interface', 'application-service', 'application-collaboration', 'data-object'],
    relationshipIds: ['serving', 'flow', 'realization', 'access'],
    layout: [
      {
        ja: '中央に連携の中心になっているコンポーネントを置き、周囲に相手を放射状に配置する。左右に並べると線が交差して読めなくなる。',
        en: 'Put the hub component in the centre and radiate its partners around it. Lay them in a row instead and the crossings make it unreadable.',
      },
      {
        ja: '1 枚 20 コンポーネントまで。超えたら業務領域で 2〜3 枚に割り、領域間の線だけを別の「俯瞰図」に描く。',
        en: 'Twenty components per page. Beyond that, split by business domain into two or three views and put only the cross-domain links on a separate overview.',
      },
      {
        ja: '線には「何が流れるか」を必ずラベルする。ラベルの無い線は、後から誰にも意味が分からない。',
        en: 'Label every line with what travels on it. Unlabelled lines become meaningless to everyone, including their author.',
      },
      {
        ja: '接続本数が多い順に色を濃くする。いちばん濃い箱が、今いちばん動かしにくいシステム。',
        en: 'Shade components by how many links they carry. The darkest box is the system that is hardest to move today.',
      },
    ],
    doNotDraw: [
      { ja: 'プロトコル・電文フォーマットの詳細。それはインタフェース仕様書の仕事。', en: 'Protocols and message formats. That is the interface spec\'s job.' },
      { ja: 'サーバやミドルウェア', en: 'Servers and middleware' },
      { ja: '検討中の将来連携。現行図と目標図を混ぜない。', en: 'Proposed future links. Never mix baseline and target on one canvas.' },
    ],
    doneWhen: {
      ja: '「どのシステムを止めると何本の線が切れるか」を図の上で数えられる状態。',
      en: 'You can count, on the diagram, how many links break if a given system goes away.',
    },
    admPhaseIds: ['c', 'e'],
  },
  {
    id: 'application-usage',
    name: { ja: 'アプリケーション利用ビュー', en: 'Application Usage View' },
    keywords: [
      'sunset', 'decommission', 'retire', 'impact', 'who uses', 'usage', 'replace', 'migration impact', 'shadow it',
      '廃止', '停止', '影響', '誰が使って', '利用状況', '入れ替え', '刷新', '更改', '塩漬け', '野良',
    ],
    answers: {
      ja: 'このシステムを止めたら、どの業務が困るのか。逆に、この業務は何に依存しているのか。',
      en: 'If this system goes away, whose work stops — and conversely, what does this process depend on?',
    },
    layers: ['business', 'application'],
    elementIds: ['business-process', 'business-function', 'application-service', 'application-component'],
    relationshipIds: ['serving', 'realization', 'assignment'],
    layout: [
      {
        ja: '上段に業務、下段にアプリ、その間に Application Service を必ず 1 段挟む。この中間層があると、システム入れ替え時に上段を描き直さずに済む。',
        en: 'Business on top, applications below, and an Application Service band in between. That middle band is what saves you from redrawing the top when a system is replaced.',
      },
      {
        ja: '線は下から上へ Serving。1 つの業務が使うサービスが 5 本を超えたら、その業務は分割して描く。',
        en: 'Serving arrows point upward. If one business behaviour consumes more than five services, split that behaviour across views.',
      },
      {
        ja: '廃止検討中のコンポーネントを 1 色で塗り、そこから上に伸びる線を太くする。太い線の先が、廃止の交渉相手。',
        en: 'Colour the sunset candidates and thicken the arrows rising from them. Whoever sits at the far end of a thick arrow is who you must negotiate the retirement with.',
      },
    ],
    doNotDraw: [
      { ja: 'アプリ同士の連携線。それは連携図の役目で、混ぜると両方読めなくなる。', en: 'Links between applications. That is the integration view\'s job; mixing them makes both unreadable.' },
      { ja: 'データの詳細', en: 'Data detail' },
      { ja: '影響のない業務', en: 'Business behaviour that is unaffected' },
    ],
    doneWhen: {
      ja: '廃止候補を指して「困るのはこの 3 部署」と即答でき、その 3 部署の名前が図に載っている状態。',
      en: 'You can point at a sunset candidate and name the three departments that will object — and all three appear on the page.',
    },
    admPhaseIds: ['c', 'e', 'h'],
  },
  {
    id: 'information-structure',
    name: { ja: '情報構造ビュー', en: 'Information Structure View' },
    keywords: [
      'data', 'master data', 'mdm', 'single source of truth', 'duplicate', 'entity', 'information', 'quality', 'governance',
      'データ', 'マスタ', '重複', '二重管理', '名寄せ', '情報', 'データ品質', '正', '原本', 'どこが正',
    ],
    answers: {
      ja: 'この情報の原本はどこにあり、誰が作れて、どこにコピーが散っているのか。',
      en: 'Where the master of this information lives, who is allowed to create it, and where the copies have scattered.',
    },
    layers: ['business', 'application'],
    elementIds: ['business-object', 'data-object', 'application-component', 'application-function'],
    relationshipIds: ['realization', 'access', 'composition'],
    layout: [
      {
        ja: '中央に業務用語(Business Object)を 1 個だけ置く。1 枚 1 用語。複数を詰め込むと、どの線がどの用語の話か分からなくなる。',
        en: 'One business term at the centre, one term per page. Cram several in and no line can be attributed to a term any more.',
      },
      {
        ja: 'その周囲に、その用語を保持している Data Object を配置し、Realization で結ぶ。3 個以上あればそれ自体が発見。',
        en: 'Ring it with the Data Objects that hold it, linked by Realization. Three or more is itself the finding.',
      },
      {
        ja: 'Access の線を「作る / 更新する / 読むだけ」の 3 種で塗り分ける。作る側が 2 箇所以上ある時点で、データ品質の問題は構造の問題。',
        en: 'Colour Access links three ways: creates, updates, reads only. Two or more creators and the data-quality problem is structural, not operational.',
      },
    ],
    doNotDraw: [
      { ja: 'テーブル定義・カラム・型', en: 'Table definitions, columns, and types' },
      { ja: '正規化の議論。ここで扱うのは所在と権限であって、設計ではない。', en: 'Normalization. This view is about location and authority, not design.' },
      { ja: '複数の業務用語を 1 枚に', en: 'Several business terms on one page' },
    ],
    doneWhen: {
      ja: '「この情報を作れるのはここだけ」と 1 箇所を指させるか、指せないことが図で証明されている状態。',
      en: 'You can point at the single place allowed to create the information — or the diagram proves that no such single place exists.',
    },
    admPhaseIds: ['c'],
  },
  {
    id: 'technology-deployment',
    name: { ja: '配置ビュー', en: 'Deployment View' },
    keywords: [
      'infrastructure', 'deployment', 'server', 'cloud', 'availability', 'performance', 'outage', 'dr', 'capacity', 'hosting',
      'インフラ', '基盤', '配置', 'サーバ', 'クラウド', '可用性', '性能', '障害', '止まる', '冗長', '移設', 'オンプレ',
    ],
    answers: {
      ja: 'どこで何が動いていて、どこが落ちるとどの業務が止まるのか。',
      en: 'What runs where, and which business stops when which part fails.',
    },
    layers: ['technology', 'application'],
    elementIds: ['node', 'device', 'system-software', 'artifact', 'technology-service', 'communication-network'],
    relationshipIds: ['assignment', 'serving', 'realization'],
    layout: [
      {
        ja: 'ノードを入れ子の箱で描き、その中に載っているものを入れる。線ではなく入れ子で配置を表すと、線の数が 3 分の 1 になる。',
        en: 'Draw nodes as nested boxes with their contents inside. Expressing deployment by nesting rather than by lines cuts the line count to a third.',
      },
      {
        ja: '境界(社内 / DMZ / 外部 / SaaS)を背景色の帯で区切る。セキュリティレビューがこの帯の上で完結する。',
        en: 'Band the background by zone: internal, DMZ, external, SaaS. The security review can then be held entirely on this page.',
      },
      {
        ja: '最重要業務からノードまでの依存の鎖を 1 本だけ太線で通す。全部通すと読めない。1 本通っていれば「同じやり方で辿れる」と伝わる。',
        en: 'Trace one dependency chain from the most critical business process down to the node in bold. Trace them all and nothing is readable; one is enough to show the method.',
      },
    ],
    doNotDraw: [
      { ja: 'IP アドレス、ホスト名の全量', en: 'Every IP address and hostname' },
      { ja: '役割が同じノードの複製(冗長構成は注記で)', en: 'Duplicate nodes that play the same role — note redundancy instead' },
      { ja: 'アプリの内部機能', en: 'The internal functions of applications' },
    ],
    doneWhen: {
      ja: '任意のノードを指して「ここが落ちるとこの業務が止まる」と 10 秒で答えられる状態。',
      en: 'Point at any node and the answer to "what stops if this dies" comes within ten seconds.',
    },
    admPhaseIds: ['d', 'g'],
  },
  {
    id: 'migration-roadmap',
    name: { ja: '移行ロードマップビュー', en: 'Migration Roadmap View' },
    keywords: [
      'roadmap', 'migration', 'transition', 'plateau', 'sequence', 'phasing', 'when', 'schedule', 'order', 'dependency',
      'ロードマップ', '移行', '段階', '順序', 'いつ', 'スケジュール', '計画', '依存', '中断', '切り戻し', '並行稼働',
    ],
    answers: {
      ja: 'どの順で何が変わり、どの時点で止めても業務が回るのか。',
      en: 'What changes in what order, and at which points you could stop and still be running.',
    },
    layers: ['implementation'],
    elementIds: ['plateau', 'gap', 'work-package', 'deliverable', 'implementation-event'],
    relationshipIds: ['triggering', 'aggregation', 'realization'],
    layout: [
      {
        ja: '縦軸を業務領域、横軸をプラトー(現行 → 移行 1 → 移行 2 → 目標)にする。技術領域を縦軸にすると、経営層が自分の関心事を探せない。',
        en: 'Business domains down the side, plateaus across the top: baseline, transition one, transition two, target. Put technical domains on the side and executives cannot find their own concern.',
      },
      {
        ja: 'プラトーは 3〜4 個まで。各プラトーの下に「ここで止めても業務が回るか」を 1 行で書く。',
        en: 'Three or four plateaus maximum, each annotated in one line with whether the business still runs if you stop there.',
      },
      {
        ja: '「捨てるもの」を別の色で、必ず同じ図に載せる。作るものだけの図はコストが増える計画にしか見えない。',
        en: 'Show the retirements in a distinct colour on the same page. A page of only additions reads as a plan that only raises cost.',
      },
      {
        ja: '日付は書かない。順序だけを図に、日付は別の計画表に。日付入りの図は 3 か月で信用を失う。',
        en: 'No dates. Order on the diagram, dates in the plan. A dated diagram loses credibility within a quarter.',
      },
    ],
    doNotDraw: [
      { ja: 'タスクレベルの WBS', en: 'A task-level WBS' },
      { ja: '採否未定の選択肢', en: 'Options not yet chosen' },
      { ja: '要員名・工数', en: 'Named people and effort numbers' },
    ],
    doneWhen: {
      ja: '各プラトーに「止めても回る / 回らない」が書かれ、回らないプラトーが 1 つも無い状態。',
      en: 'Every plateau is annotated stoppable or not, and none of them is "not".',
    },
    admPhaseIds: ['e', 'f'],
  },
  {
    id: 'risk-compliance',
    name: { ja: 'リスク・準拠性ビュー', en: 'Risk and Compliance View' },
    keywords: [
      'risk', 'security', 'compliance', 'audit', 'regulation', 'control', 'privacy', 'gdpr', 'policy', 'deviation',
      'リスク', 'セキュリティ', '統制', '監査', '規制', '法令', '準拠', '個人情報', '例外', '逸脱', '内部統制',
    ],
    answers: {
      ja: 'どの規制・原則がどこに効いていて、今どこが逸脱していて、その例外はいつまでの話なのか。',
      en: 'Which regulation or principle bites where, what is currently deviating, and until when the waiver runs.',
    },
    layers: ['motivation', 'application', 'technology'],
    elementIds: ['driver', 'requirement', 'constraint', 'principle', 'assessment', 'application-component', 'node', 'data-object'],
    relationshipIds: ['realization', 'influence', 'access', 'association'],
    layout: [
      {
        ja: '上段に規制・原則、下段に対象の要素。間に Requirement を 1 段挟む。規制から直接システムへ線を引くと、「その規制がなぜこのシステムに効くのか」の説明が図から落ちる。',
        en: 'Regulations and principles on top, affected elements below, a band of Requirements in between. Wire regulation straight to system and the page loses the explanation of why it bites there.',
      },
      {
        ja: '判定は 3 色(準拠 / 逸脱 / 例外承認済み)。準拠しているものは薄く、逸脱を濃く塗る。目が濃い箱に行く。',
        en: 'Three colours: compliant, deviating, waiver granted. Fade the compliant ones and darken the deviations so the eye lands where it should.',
      },
      {
        ja: '例外には期限を必ず併記する。期限のない例外は、事実上その規制を諦めたということ。',
        en: 'Every waiver carries its expiry. A waiver without one means the rule has quietly been abandoned.',
      },
    ],
    doNotDraw: [
      { ja: '準拠している要素の全量。逸脱と例外だけで図は成立する。', en: 'Everything that complies. Deviations and waivers alone make the view.' },
      { ja: '対策の設計詳細', en: 'The design of the remediation' },
      { ja: '規制の条文', en: 'The text of the regulation' },
    ],
    doneWhen: {
      ja: '濃い色の箱がすべて、対応するワークパッケージか期限付き例外のどちらかに紐づいている状態。',
      en: 'Every dark box is tied either to a work package or to a dated waiver.',
    },
    admPhaseIds: ['g', 'h', 'requirements-management'],
  },
  {
    id: 'layered-overview',
    name: { ja: '層別俯瞰ビュー', en: 'Layered Overview' },
    keywords: [
      'overview', 'big picture', 'landscape', 'whole', 'executive', 'onboarding', 'orientation', 'context',
      '全体', '俯瞰', '全体像', '概観', '経営層', '説明', '新任', 'オンボーディング', '一枚', '鳥瞰',
    ],
    answers: {
      ja: 'この領域は全体としてどうなっているのか。初めて見る人が 5 分で構造を掴めるか。',
      en: 'What does this area look like as a whole, and can a newcomer grasp the structure in five minutes?',
    },
    layers: ['business', 'application', 'technology'],
    elementIds: ['business-service', 'business-process', 'application-service', 'application-component', 'technology-service', 'node'],
    relationshipIds: ['serving', 'realization'],
    layout: [
      {
        ja: '上から業務・アプリ・基盤の 3 段。段の間は必ずサービス層(Business Service / Application Service / Technology Service)を挟む。挟まないと、段を跨ぐ線が全部直結になって蜘蛛の巣になる。',
        en: 'Three bands: business, application, technology, with a service band between each pair. Skip the service bands and every cross-band line goes point to point, producing a cobweb.',
      },
      {
        ja: '1 段あたり 7 個まで。合計 21 個。それ以上は俯瞰ではなく詳細図。',
        en: 'Seven boxes per band, twenty-one total. More than that is not an overview, it is a detail view.',
      },
      {
        ja: '線は上向きの Serving のみ。他の関係は 1 本も入れない。俯瞰図の価値は「依存の向きが一目で分かる」ことに尽きる。',
        en: 'Upward Serving lines only, nothing else. The entire value of an overview is that the direction of dependency is legible at a glance.',
      },
    ],
    doNotDraw: [
      { ja: '個々のインタフェース', en: 'Individual interfaces' },
      { ja: 'データ要素', en: 'Data elements' },
      { ja: '例外・特殊なケース', en: 'Exceptions and special cases' },
      { ja: '動機層。なぜの話は別の 1 枚にする。', en: 'The motivation layer. The "why" gets its own page.' },
    ],
    doneWhen: {
      ja: 'その領域を知らない人が 5 分見て、上から下へ依存を口で説明できる状態。',
      en: 'Someone new to the area can look for five minutes and narrate the dependencies top to bottom.',
    },
    admPhaseIds: ['a', 'c', 'd'],
  },
  {
    id: 'project-impact',
    name: { ja: 'プロジェクト影響ビュー', en: 'Project Impact View' },
    keywords: [
      'project', 'work package', 'scope', 'budget', 'who builds', 'delivery', 'programme', 'program',
      'プロジェクト', '案件', 'スコープ', '予算', '体制', '誰が作る', '施策', '打ち手', 'ワークパッケージ',
    ],
    answers: {
      ja: 'どのプロジェクトが何に手を入れ、どこで他のプロジェクトとぶつかるのか。',
      en: 'Which project touches what, and where two projects collide.',
    },
    layers: ['implementation', 'application', 'business'],
    elementIds: ['work-package', 'deliverable', 'application-component', 'business-process', 'gap'],
    relationshipIds: ['realization', 'triggering', 'association'],
    layout: [
      {
        ja: '左にワークパッケージを縦に並べ、右に触られる要素を並べて線で結ぶ。同じ要素に 2 本以上の線が入っていたら、そこが調整の火種。',
        en: 'Work packages down the left, the elements they touch down the right, lines between. Any element receiving two or more lines is where the coordination fight will happen.',
      },
      {
        ja: '線が集中している要素を濃く塗る。会議で最初に話すべきはその箱。',
        en: 'Shade the elements with the most incoming lines. Those boxes are what the meeting should open with.',
      },
      {
        ja: '各ワークパッケージに便益の受け取り手を役割名で 1 つ書き添える。書けないパッケージは、実行前に落とす候補。',
        en: 'Annotate each work package with one benefit owner, by role. Any package that resists is a candidate to cut before it starts.',
      },
    ],
    doNotDraw: [
      { ja: 'タスク・工程', en: 'Tasks and schedules' },
      { ja: '影響を受けない要素', en: 'Elements nothing touches' },
      { ja: '技術的な実現方式', en: 'How it will be built technically' },
    ],
    doneWhen: {
      ja: '2 本以上の線が入っている要素をすべて挙げ、それぞれに調整の担当者が付いている状態。',
      en: 'Every element with two or more incoming lines is listed, each with a named person to broker it.',
    },
    admPhaseIds: ['e', 'f', 'g'],
  },
];

/** 聴衆別の調整 */
interface AudienceProfile {
  id: string;
  keywords: string[];
  name: Bilingual;
  adjustments: Bilingual[];
}

const AUDIENCES: AudienceProfile[] = [
  {
    id: 'executive',
    keywords: ['executive', 'ceo', 'cfo', 'cio', 'board', 'exec', 'sponsor', 'c-level',
      '経営', '役員', '取締役', '社長', 'スポンサー', '経営会議', '幹部'],
    name: { ja: '経営層', en: 'Executives' },
    adjustments: [
      { ja: '要素は 15 個まで。1 枚に収まらないなら、収まる粒度まで抽象化する。分割ではなく抽象化。', en: 'Fifteen elements maximum. If it does not fit on one page, abstract until it does — abstract, do not split.' },
      { ja: '各要素に金額か件数か時間のいずれかを添える。数字の無い箱は読み飛ばされる。', en: 'Attach money, volume, or time to each box. Boxes without a number get skipped.' },
      { ja: '「今決めてほしいこと」を図の右下に 1 行で書く。それが無いと、鑑賞されて終わる。', en: 'Put the single decision you want, in one line, in the bottom right. Without it the page gets admired and forgotten.' },
    ],
  },
  {
    id: 'business',
    keywords: ['business', 'user', 'operations', 'sales', 'front line', 'department',
      '業務', '現場', '利用部門', '事業部', '営業', 'ユーザー', 'ユーザ', '部門'],
    name: { ja: '業務部門', en: 'Business / operations' },
    adjustments: [
      { ja: 'システム名を最小限にし、業務の言葉で命名する。専門用語が 3 つ出た時点で読むのをやめられる。', en: 'Minimize system names and use the vocabulary of the work. Three pieces of jargon and they stop reading.' },
      { ja: '「あなたの仕事はこの箱です」と指させる箱を必ず 1 つ入れる。自分がどこにいるか分からない図は他人事になる。', en: 'Include one box you can point at and say "this is your job". A picture where they cannot locate themselves stays somebody else\'s problem.' },
      { ja: '変わる部分と変わらない部分を色で分ける。関心はほぼ「自分の仕事が変わるのか」の一点にある。', en: 'Colour what changes against what does not. Their concern is almost entirely whether their own work changes.' },
    ],
  },
  {
    id: 'engineering',
    keywords: ['developer', 'engineer', 'architect', 'dev', 'team', 'implementation', 'sre', 'ops',
      '開発', 'エンジニア', '技術者', 'アーキテクト', '実装', '運用', '設計'],
    name: { ja: '開発・運用', en: 'Engineering / operations' },
    adjustments: [
      { ja: 'インタフェースと依存の向きを省略しない。この聴衆は曖昧な線をそのまま実装してしまう。', en: 'Do not elide interfaces or the direction of dependency. This audience will implement an ambiguous line as drawn.' },
      { ja: '目標像だけでなく現行も同じ書式で出す。差分が見えないと、何を作ればよいか分からない。', en: 'Ship the baseline in the same format as the target. Without a visible delta they cannot tell what to build.' },
      { ja: '決まっていないところは、それと分かる印を付ける。断定した図を渡すと、勝手に決められる。', en: 'Mark what is undecided as undecided. Hand over a picture that sounds settled and it will be settled without you.' },
    ],
  },
  {
    id: 'audit',
    keywords: ['audit', 'auditor', 'compliance', 'risk', 'regulator', 'security', 'legal',
      '監査', '内部統制', 'リスク', '法務', 'コンプライアンス', '規制当局', 'セキュリティ'],
    name: { ja: '監査・リスク', en: 'Audit / risk' },
    adjustments: [
      { ja: '要素に統制 ID か規制条項の参照を紐づける。図と証跡が繋がっていないと、追加資料を出し直すことになる。', en: 'Tie elements to control ids or regulation references. Without that link you will be asked for supplementary evidence anyway.' },
      { ja: '例外には必ず期限と承認者を書く。期限のない例外はその場で指摘される。', en: 'Every waiver shows an expiry and an approver. An undated waiver gets flagged on the spot.' },
      { ja: '「誰が誰を承認するか」の線を省略しない。承認の分離が図で示せると、質問が半分になる。', en: 'Do not omit who approves whom. Showing separation of approval on the page halves the questions.' },
    ],
  },
  {
    id: 'vendor',
    keywords: ['vendor', 'supplier', 'partner', 'rfp', 'procurement', 'outsourc', 'si',
      'ベンダー', 'ベンダ', '調達', 'rfp', '提案依頼', '委託', '外注', 'パートナー'],
    name: { ja: 'ベンダー・調達', en: 'Vendors / procurement' },
    adjustments: [
      { ja: '責任分界を明示する。線が跨いだところが契約の境目になる。曖昧な線は後で必ず追加費用になる。', en: 'Make the responsibility boundary explicit. Where a line crosses it is where the contract splits, and an ambiguous line becomes a change order later.' },
      { ja: '制約(Constraint)を図に載せる。載っていない制約は提案に反映されない。', en: 'Put the constraints on the page. A constraint that is not shown will not appear in the proposal.' },
      { ja: '製品名を書かない。目標像に製品名が入ると、比較検討が成立しなくなる。', en: 'Keep product names out. A named product in the target ends any real comparison.' },
    ],
  },
];

function matchAudience(input: string): AudienceProfile | undefined {
  const s = input.toLowerCase();
  let best: { p: AudienceProfile; score: number } | undefined;
  for (const p of AUDIENCES) {
    const hits = p.keywords.filter((k) => matchesKeyword(s, k)).length;
    if (hits > 0 && (!best || hits > best.score)) best = { p, score: hits };
  }
  return best?.p;
}

/** 関心事の自由記述からビューレシピを選ぶ */
function matchViewRecipes(concern: string, limit = 2): { recipe: ViewRecipe; score: number; matched: string[] }[] {
  const s = concern.toLowerCase();
  const scored = VIEW_RECIPES.map((recipe) => {
    const matched = recipe.keywords.filter((k) => matchesKeyword(s, k));
    // 長いキーワードほど具体的とみなして加点する
    const score = matched.reduce((acc, k) => acc + 4 + Math.min(k.length, 10), 0);
    return { recipe, score, matched };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id)).slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 表示ヘルパ
 * ------------------------------------------------------------------ */

/** 表のセル用。both のときは改行タグで 2 行にして列幅を抑える */
function cell(v: Bilingual, lang: Lang): string {
  if (lang === 'ja') return v.ja;
  if (lang === 'en') return v.en;
  return `${v.ja}<br>${v.en}`;
}

/**
 * 行の途中に埋める短いラベル用。
 * `msg` は both のときに改行を挟むため、表のセルや見出しの中で使うと表が壊れる。
 * ここではスラッシュで 1 行に収める。
 */
function inline(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 箇条書き 1 行。both のときは日本語の下にインデントで英語 */
function li(v: Bilingual, lang: Lang, indent = ''): string {
  if (lang === 'both') return `${indent}- ${v.ja}\n${indent}  - ${v.en}`;
  return `${indent}- ${text(v, lang)}`;
}

function liList(vs: Bilingual[], lang: Lang, indent = ''): string[] {
  return vs.map((v) => li(v, lang, indent));
}

/**
 * 枠で囲む(CJK を入れないこと。等幅崩れを避けるため英字のみ)。
 * minWidth は下限で、内容が長ければ自動で広げる。切り詰めはしない。
 */
function asciiBox(minWidth: number, title: string, lines: string[]): string[] {
  const width = Math.max(minWidth, title.length + 2, ...lines.map((l) => l.length + 2));
  const bar = `+${'-'.repeat(width)}+`;
  const rows = [bar, `|${` ${title}`.padEnd(width)}|`, `|${'-'.repeat(width)}|`];
  for (const l of lines) rows.push(`|${` ${l}`.padEnd(width)}|`);
  rows.push(bar);
  return rows;
}

/** 複数の箱を横に並べる(高さを揃えて空白で埋める) */
function sideBySide(columns: string[][], gap = 2): string[] {
  const height = Math.max(...columns.map((c) => c.length));
  const widths = columns.map((c) => Math.max(...c.map((l) => l.length)));
  const out: string[] = [];
  for (let i = 0; i < height; i++) {
    const parts = columns.map((c, ci) => (c[i] ?? '').padEnd(widths[ci] ?? 0));
    out.push(parts.join(' '.repeat(gap)).replace(/\s+$/, ''));
  }
  return out;
}

/** 7 層の構造図(ASCII、英字のみ) */
function layerStackDiagram(): string {
  const motivation = asciiBox(18, 'MOTIVATION', [
    'why we do this',
    '',
    'Stakeholder',
    'Driver',
    'Assessment',
    'Goal',
    'Outcome',
    'Principle',
    'Requirement',
    'Constraint',
  ]);
  const core = asciiBox(34, 'STRATEGY -> ... -> PHYSICAL', [
    'STRATEGY      Capability, Value Stream',
    '   ^ serves',
    'BUSINESS      Role, Process, Service',
    '   ^ serves',
    'APPLICATION   Component, Service, Data',
    '   ^ serves',
    'TECHNOLOGY    Node, Artifact, Network',
    '   ^ serves',
    'PHYSICAL      Equipment, Facility',
  ]);
  const impl = asciiBox(20, 'IMPLEMENTATION', [
    '& MIGRATION',
    'when, who, in what',
    'order',
    '',
    'Work Package',
    'Deliverable',
    'Implementation Event',
    'Plateau',
    'Gap',
  ]);
  const gap = 2;
  const rows = sideBySide([motivation, core, impl], gap);
  // 凡例は各箱の幅に合わせて中央寄せする(箱の幅は内容で変わるため計算する)
  const widths = [motivation, core, impl].map((b) => (b[0] ?? '').length);
  const captions = ['cross-cutting', 'lower layers SERVE upper ones', 'cross-cutting'];
  const legend = captions
    .map((c, i) => {
      const w = widths[i] ?? c.length;
      const left = Math.max(0, Math.floor((w - c.length) / 2));
      return ' '.repeat(left) + c.padEnd(w - left);
    })
    .join(' '.repeat(gap))
    .replace(/\s+$/, '');
  rows.push('');
  rows.push(legend);
  return rows.join('\n');
}

/** 層に対応する ADM フェーズのコードを並べる(コードは日英共通なので言語で分岐しない) */
function layerAdmPhases(layer: ArchiLayer): string {
  return layer.admPhaseIds
    .map((id) => findPhase(id)?.code)
    .filter((code): code is string => Boolean(code))
    .join(', ');
}

/* ------------------------------------------------------------------ *
 * ツール登録
 * ------------------------------------------------------------------ */

export function registerArchiMateTools(server: McpServer): void {
  /* ---------------- 1. list_archimate_layers ---------------- */
  server.registerTool(
    'list_archimate_layers',
    {
      title: 'List ArchiMate layers',
      description:
        'ArchiMate の 7 層(戦略 / ビジネス / アプリケーション / テクノロジー / 物理 / 動機 / 実装移行)を、「何を表す層か」「対応する ADM フェーズ」「代表要素」「その層でいちばん多い失敗」付きで一覧する。 / List the seven ArchiMate layers with what each one represents, the ADM phases it belongs to, its representative elements, and the mistake most often made in it.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      try {
        const l = lang as Lang;
        const out: string[] = [];
        out.push(msg('# ArchiMate の 7 層', '# The Seven ArchiMate Layers', l));
        out.push('');
        out.push(
          msg(
            '積み上がるのは 5 層(戦略 / ビジネス / アプリケーション / テクノロジー / 物理)だけ。動機層と実装移行層はその全体を横断する。この構造を掴んでいないと、「なぜ」と「いつ」を業務層に描き込んでしまう。',
            'Only five layers stack: strategy, business, application, technology, physical. Motivation and implementation-and-migration cut across all of them. Miss this and the "why" and the "when" end up drawn into the business layer.',
            l,
          ),
        );
        out.push('');
        out.push('```');
        out.push(layerStackDiagram());
        out.push('```');
        out.push('');
        out.push(
          `| ${inline('層', 'Layer', l)} | ${inline('答える問い', 'Question it answers', l)} | ${inline('ADM フェーズ', 'ADM phases', l)} | ${inline('代表要素', 'Representative elements', l)} |`,
        );
        out.push('| --- | --- | :-: | --- |');
        for (const layer of LAYERS) {
          const elems = layer.elementIds.slice(0, 5).map(elementShort).join(', ');
          out.push(
            `| **${cell(layer.name, l)}** | ${cell(layer.question, l)} | ${layerAdmPhases(layer)} | ${elems}${layer.elementIds.length > 5 ? ' …' : ''} |`,
          );
        }
        out.push('');
        out.push(msg('## 各層の中身と、いちばん多い失敗', '## What each layer holds, and how it usually goes wrong', l));
        for (const layer of LAYERS) {
          out.push('');
          out.push(`### ${text(layer.name, l)}`);
          out.push('');
          out.push(li(layer.represents, l));
          out.push(li({ ja: `よくある失敗: ${layer.pitfall.ja}`, en: `Most common mistake: ${layer.pitfall.en}` }, l));
          out.push(
            li(
              {
                ja: `代表要素: ${layer.elementIds.map((id) => `${elementShort(id)}(${element(id)?.ja ?? id})`).join(' / ')}`,
                en: `Elements: ${layer.elementIds.map(elementShort).join(' / ')}`,
              },
              l,
            ),
          );
        }
        out.push('');
        out.push(msg('## 補助の道具', '## Two helpers that belong to no layer', l));
        out.push('');
        out.push(
          li(
            {
              ja: 'Grouping — 層に属さない「囲み」。領域・責任範囲・今回のスコープを示すのに使う。線を引かずに関係を示せるので、図が一気に読みやすくなる。',
              en: 'Grouping — an enclosure that belongs to no layer. Use it for domains, ownership, or this engagement\'s scope. It expresses relatedness without a single line, which is a large readability win.',
            },
            l,
          ),
        );
        out.push(
          li(
            {
              ja: 'Location — 場所。拠点統廃合や、地域ごとに構成が違う話を扱うときだけ使う。使わない案件の方が多い。',
              en: 'Location — where things are. Only worth using for site consolidation or where the setup differs by region. Most engagements never need it.',
            },
            l,
          ),
        );
        out.push('');
        out.push(msg('## 次の一手', '## Next move', l));
        out.push('');
        out.push(
          li(
            {
              ja: '7 層すべてを使おうとしない。最初の案件では動機・ビジネス・アプリケーションの 3 層だけで始めるのが、いちばん失敗しにくい。',
              en: 'Do not try to use all seven. Starting a first engagement with only motivation, business, and application is the lowest-risk path there is.',
            },
            l,
          ),
        );
        out.push(
          li(
            {
              ja: '`map_togaf_to_archimate` に今のフェーズ ID を渡すと、その段階で描くべき図と、描いてはいけないものが出る。',
              en: 'Pass your current phase id to `map_togaf_to_archimate` for the views to draw at this stage — and the ones not to.',
            },
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (e) {
        return errorResult(
          msg(
            `層の一覧生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            `Failed to build the layer list: ${e instanceof Error ? e.message : String(e)}`,
            lang as Lang,
          ),
        );
      }
    },
  );

  /* ---------------- 2. map_togaf_to_archimate ---------------- */
  server.registerTool(
    'map_togaf_to_archimate',
    {
      title: 'Map an ADM phase to ArchiMate',
      description:
        'ADM フェーズを 1 つ指定すると、その段階で「何を、どの層の、どの要素で描くか」を図の名前つきで返す。成果物(Architecture Definition Document など)を ArchiMate でどう表現するかの指針、この段階では描かないもの、今週の一手も併せて返す。 / Given one ADM phase, return what to draw, in which layer, with which elements, under which view name — plus how to express the phase deliverables in ArchiMate, what not to draw yet, and what to do this week.',
      inputSchema: {
        phase: z
          .string()
          .describe('ADM フェーズ ID / コード。例: "a", "Phase B", "preliminary", "requirements-management"'),
        lang: langSchema,
      },
    },
    async ({ phase, lang }) => {
      const l = lang as Lang;
      try {
        const found = findPhase(phase);
        if (!found) {
          const ids = ADM_PHASES.map((p) => `\`${p.id}\``).join(', ');
          return errorResult(
            msg(
              `フェーズ「${phase}」が見つかりません。指定できる ID: ${ids}`,
              `Phase "${phase}" not found. Valid ids: ${ids}`,
              l,
            ),
          );
        }
        const mapping = findPhaseMapping(found.id);
        if (!mapping) {
          return errorResult(
            msg(
              `フェーズ「${found.id}」の ArchiMate 対応表がまだありません。`,
              `No ArchiMate mapping is defined for phase "${found.id}" yet.`,
              l,
            ),
          );
        }

        const out: string[] = [];
        out.push(`# ${text(found.name, l)} → ArchiMate`);
        out.push('');
        out.push(`> ${text(mapping.headline, l)}`);
        out.push('');

        out.push(msg('## 何を、どの層の、どの要素で描くか', '## What to draw, in which layer, with which elements', l));
        out.push('');
        out.push(
          `| # | ${inline('描くもの', 'What to draw', l)} | ${inline('層', 'Layer', l)} | ${inline('使う要素', 'Elements', l)} | ${inline('図の名前', 'View name', l)} |`,
        );
        out.push('| :-: | --- | --- | --- | --- |');
        mapping.draw.forEach((d, i) => {
          const layerNames = d.layers
            .map((id) => findLayer(id))
            .filter((x): x is ArchiLayer => Boolean(x))
            .map((x) => text(x.name, l === 'both' ? 'ja' : l))
            .join(' + ');
          out.push(
            `| ${i + 1} | ${cell(d.what, l)} | ${layerNames} | ${d.elementIds.map(elementShort).join('<br>')} | ${cell(d.viewName, l)} |`,
          );
        });
        out.push('');

        out.push(msg('## 成果物を ArchiMate でどう表すか', '## Expressing this phase\'s deliverables in ArchiMate', l));
        out.push('');
        out.push(...liList(mapping.deliverableGuidance, l));
        out.push('');

        out.push(msg('## この段階では描かないもの', '## Not at this stage', l));
        out.push('');
        out.push(...liList(mapping.doNotDraw, l));
        out.push('');

        out.push(msg('## 今週やること', '## This week', l));
        out.push('');
        mapping.thisWeek.forEach((v, i) => {
          if (l === 'both') {
            out.push(`${i + 1}. ${v.ja}`);
            out.push(`   - ${v.en}`);
          } else {
            out.push(`${i + 1}. ${text(v, l)}`);
          }
        });
        out.push('');

        out.push(
          msg(
            `関係の引き方に迷ったら \`validate_archimate_relationship\`、関心事から図を決めたいなら \`suggest_archimate_view\` を使ってください。`,
            `Use \`validate_archimate_relationship\` when a link is in doubt, and \`suggest_archimate_view\` to go from a stakeholder concern to a view.`,
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (e) {
        return errorResult(
          msg(
            `フェーズの対応表生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            `Failed to build the phase mapping: ${e instanceof Error ? e.message : String(e)}`,
            l,
          ),
        );
      }
    },
  );

  /* ---------------- 3. validate_archimate_relationship ---------------- */
  server.registerTool(
    'validate_archimate_relationship',
    {
      title: 'Validate an ArchiMate relationship',
      description:
        '要素と要素の間に引いた関係が意味的に妥当かを判定する。判定は ok / questionable / likely-wrong の 3 値で、必ず理由と代替案を返す。仕様の許可表ではなく「その線を引くと図が何を主張することになるか」という意味論の観点で見る。 / Judge whether a relationship drawn between two elements makes sense. Returns one of ok, questionable, or likely-wrong, always with the reasoning and concrete alternatives — judged on what the link asserts, not on a permitted-relationship table.',
      inputSchema: {
        source: z
          .string()
          .describe('始点の要素名または ID。例: "Application Component", "業務プロセス", "node"'),
        target: z.string().describe('終点の要素名または ID / Target element name or id'),
        relationship: z
          .string()
          .describe('関係の名前。例: "realization", "serving", "assignment", "アクセス", "triggering"'),
        lang: langSchema,
      },
    },
    async ({ source, target, relationship: relInput, lang }) => {
      const l = lang as Lang;
      try {
        const rel = resolveRelationship(relInput);
        if (!rel) {
          const names = RELATIONSHIPS.map((r) => `\`${r.id}\``).join(', ');
          return errorResult(
            msg(
              `関係「${relInput}」を解釈できません。指定できる関係: ${names}`,
              `Could not interpret the relationship "${relInput}". Supported: ${names}`,
              l,
            ),
          );
        }

        const src = resolveElement(source);
        const tgt = resolveElement(target);

        // どちらかの要素が引けないときは、判定不能であることを明示したうえで
        // その関係の一般的な使いどころだけを返す(黙って推測しない)
        if (!src || !tgt) {
          const out: string[] = [];
          out.push(msg('# 判定不能 — 要素を特定できません', '# Cannot judge — element not recognized', l));
          out.push('');
          const unknowns: string[] = [];
          if (!src) unknowns.push(source);
          if (!tgt) unknowns.push(target);
          out.push(
            msg(
              `次の指定を要素として解釈できませんでした: ${unknowns.map((u) => `**${u}**`).join(', ')}`,
              `Could not resolve these as elements: ${unknowns.map((u) => `**${u}**`).join(', ')}`,
              l,
            ),
          );
          out.push('');
          for (const u of unknowns) {
            const cands = suggestElements(u);
            if (cands.length > 0) {
              out.push(
                msg(`「${u}」の候補: ${cands.map((c) => `\`${c.id}\`(${c.name})`).join(', ')}`, `Candidates for "${u}": ${cands.map((c) => `\`${c.id}\` (${c.name})`).join(', ')}`, l),
              );
            }
          }
          out.push('');
          out.push(msg(`## ${rel.name.ja} について分かっていること`, `## What holds for ${rel.name.en} in general`, l));
          out.push('');
          out.push(li(rel.meaning, l));
          out.push(li({ ja: `向いている使い方: ${rel.goodUse.ja}`, en: `Good use: ${rel.goodUse.en}` }, l));
          out.push(li({ ja: `よくある誤用: ${rel.misuse.ja}`, en: `Common misuse: ${rel.misuse.en}` }, l));
          out.push('');
          out.push(
            msg(
              '`list_archimate_layers` で要素名の一覧を確認できます。独自の要素名を使っている場合は、いちばん近い ArchiMate 要素名に置き換えて再度実行してください。',
              'Run `list_archimate_layers` for the element names. If you are using your own naming, substitute the nearest ArchiMate element name and try again.',
              l,
            ),
          );
          return textResult(out.join('\n'));
        }

        const { judgement } = judgeRelationship(src, tgt, rel);
        const mark = VERDICT_MARK[judgement.verdict];
        const label = VERDICT_LABEL[judgement.verdict];

        const out: string[] = [];
        out.push(msg('# 関係の妥当性チェック', '# Relationship sanity check', l));
        out.push('');
        out.push('```');
        out.push(`  ${src.name}  --[ ${rel.name.en} ${rel.arrow} ]-->  ${tgt.name}`);
        out.push('```');
        out.push('');
        out.push(`## ${mark} ${text(label, l)} \`${judgement.verdict}\``);
        out.push('');
        out.push(
          `| | ${inline('始点', 'Source', l)} | ${inline('終点', 'Target', l)} |`,
        );
        out.push('| --- | --- | --- |');
        out.push(`| ${inline('要素', 'Element', l)} | ${elementLabel(src.id, l)} | ${elementLabel(tgt.id, l)} |`);
        out.push(
          `| ${inline('層', 'Layer', l)} | ${text(findLayer(src.layer)?.name ?? { ja: src.layer, en: src.layer }, l === 'both' ? 'ja' : l)} | ${text(findLayer(tgt.layer)?.name ?? { ja: tgt.layer, en: tgt.layer }, l === 'both' ? 'ja' : l)} |`,
        );
        const aspectCell = (a: Aspect): string => text(ASPECT_LABEL[a], l === 'both' ? 'ja' : l);
        out.push(`| ${inline('性質', 'Nature', l)} | ${aspectCell(src.aspect)} | ${aspectCell(tgt.aspect)} |`);
        out.push('');

        out.push(msg('## 理由', '## Why', l));
        out.push('');
        out.push(text(judgement.reason, l === 'both' ? 'ja' : l));
        if (l === 'both') {
          out.push('');
          out.push(judgement.reason.en);
        }
        out.push('');

        out.push(
          judgement.verdict === 'ok'
            ? msg('## この形をさらに良くするなら', '## To make this even better', l)
            : msg('## 代替案', '## What to draw instead', l),
        );
        out.push('');
        out.push(...liList(judgement.alternatives, l));
        out.push('');

        out.push(msg(`## ${rel.name.ja} という線の性格`, `## The character of ${rel.name.en}`, l));
        out.push('');
        out.push(li(rel.meaning, l));
        out.push(li({ ja: `向いている使い方: ${rel.goodUse.ja}`, en: `Good use: ${rel.goodUse.en}` }, l));
        out.push(li({ ja: `よくある誤用: ${rel.misuse.ja}`, en: `Common misuse: ${rel.misuse.en}` }, l));
        out.push('');
        out.push(
          msg(
            '判定は仕様の許可表ではなく「その線が図の上で何を主張することになるか」に基づいています。組織固有の事情で意図的に外している場合は、図の凡例にその理由を 1 行書いておけばレビューは通ります。',
            'These verdicts come from what the link asserts on the page, not from a permitted-relationship table. If you are deviating on purpose for a local reason, one line in the legend is enough to carry it through review.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (e) {
        return errorResult(
          msg(
            `関係の判定に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            `Failed to evaluate the relationship: ${e instanceof Error ? e.message : String(e)}`,
            l,
          ),
        );
      }
    },
  );

  /* ---------------- 4. suggest_archimate_view ---------------- */
  server.registerTool(
    'suggest_archimate_view',
    {
      title: 'Suggest an ArchiMate view for a concern',
      description:
        'ステークホルダーの関心事を自由記述で渡すと、それに答えるには「どの層のどの要素をどう並べた図」を描けばよいかを提案する。並べ方の指示、使う関係、完成の判定基準、そして最も重要な「この図に描かないもの」を返す。 / Describe a stakeholder concern in free text and get the view that answers it: which layers, which elements, how to lay them out, which relationships to use, when it is done — and, most importantly, what must stay off the page.',
      inputSchema: {
        concern: z
          .string()
          .min(3)
          .describe('関心事の自由記述(日本語/英語どちらでも可) / The stakeholder concern, in free text'),
        audience: z
          .string()
          .optional()
          .describe('誰に見せるか(任意)。例: "経営層", "業務部門", "開発チーム", "監査", "ベンダー"'),
        lang: langSchema,
      },
    },
    async ({ concern, audience, lang }) => {
      const l = lang as Lang;
      try {
        const matches = matchViewRecipes(concern, 2);
        const audienceProfile = audience ? matchAudience(audience) : undefined;

        const out: string[] = [];
        out.push(msg('# 描くべき図の提案', '# The view to draw', l));
        out.push('');
        out.push(`> ${concern}`);
        if (audience) {
          out.push('>');
          out.push(
            `> ${inline('聴衆', 'Audience', l)}: ${audience}${audienceProfile ? ` → ${text(audienceProfile.name, l)}` : ''}`,
          );
        }
        out.push('');

        if (matches.length === 0) {
          // 該当レシピが無くても「自分で図を設計する 3 手順」を返して手ぶらにしない
          out.push(
            msg(
              '定型のレシピには当てはまりませんでした。自分で組み立てる場合の手順は次のとおりです。',
              'No stock recipe matched. Here is how to build the view yourself.',
              l,
            ),
          );
          out.push('');
          const steps: Bilingual[] = [
            {
              ja: '関心事を疑問文に書き直す。「この図を見た人が答えられるようになる問い」が 1 つに絞れるまで削る。問いが 2 つあるなら図も 2 枚。',
              en: 'Rewrite the concern as a question, and cut until exactly one question remains. Two questions means two views.',
            },
            {
              ja: 'その問いに答えるのに必要な層を選ぶ。ほとんどの問いは 2 層で答えられる。3 層必要に見えるときは、たいてい問いがまだ 2 つある。',
              en: 'Pick the layers the question needs. Most questions are answerable in two. If it looks like three, the question has usually not been split yet.',
            },
            {
              ja: '主役の要素を 1 種類決め、それを中央か上段に置く。残りは主役を説明するためだけに置く。説明に使わない要素は消す。',
              en: 'Choose one lead element kind and put it centre or top. Everything else exists only to explain the lead. Anything not doing that comes off the page.',
            },
          ];
          steps.forEach((v, i) => {
            if (l === 'both') {
              out.push(`${i + 1}. ${v.ja}`);
              out.push(`   - ${v.en}`);
            } else {
              out.push(`${i + 1}. ${text(v, l)}`);
            }
          });
          out.push('');
          out.push(msg('## 用意されているレシピ', '## Available recipes', l));
          out.push('');
          out.push(
            `| ${inline('図', 'View', l)} | ${inline('答える問い', 'Question it answers', l)} |`,
          );
          out.push('| --- | --- |');
          for (const r of VIEW_RECIPES) {
            out.push(`| **${cell(r.name, l)}** | ${cell(r.answers, l)} |`);
          }
          return textResult(out.join('\n'));
        }

        matches.forEach((m, idx) => {
          const r = m.recipe;
          const rank =
            idx === 0
              ? inline('第一候補', 'First choice', l)
              : inline('併せて描くなら', 'Worth drawing alongside', l);
          out.push(`## ${idx + 1}. ${text(r.name, l)} — ${rank}`);
          out.push('');
          out.push(`**${inline('この図が答える問い', 'The question it answers', l)}**: ${text(r.answers, l)}`);
          out.push('');

          const layerNames = r.layers
            .map((id) => findLayer(id))
            .filter((x): x is ArchiLayer => Boolean(x))
            .map((x) => text(x.name, l === 'both' ? 'ja' : l))
            .join(' + ');
          const phaseCodes = r.admPhaseIds
            .map((id) => findPhase(id)?.code ?? id)
            .join(', ');

          out.push(`| | |`);
          out.push('| --- | --- |');
          out.push(`| ${inline('層', 'Layers', l)} | ${layerNames} |`);
          out.push(`| ${inline('主役の要素', 'Elements', l)} | ${r.elementIds.map((id) => elementShort(id)).join(', ')} |`);
          out.push(`| ${inline('使う関係', 'Relationships', l)} | ${r.relationshipIds.map((id) => relationship(id)?.name.en ?? id).join(', ')} |`);
          out.push(`| ${inline('ADM フェーズ', 'ADM phases', l)} | ${phaseCodes} |`);
          out.push('');

          out.push(`### ${inline('並べ方', 'How to lay it out', l)}`);
          out.push('');
          out.push(...liList(r.layout, l));
          out.push('');

          out.push(`### ${inline('この図に描かないもの', 'What must stay off this page', l)}`);
          out.push('');
          out.push(
            msg(
              '描きすぎが図を殺す最大の要因。以下は意図的に外す。',
              'Over-drawing is what kills a view. Leave these out on purpose.',
              l,
            ),
          );
          out.push('');
          out.push(...liList(r.doNotDraw, l));
          out.push('');

          out.push(`### ${inline('完成の判定', 'Done when', l)}`);
          out.push('');
          out.push(li(r.doneWhen, l));
          out.push('');
        });

        if (audienceProfile) {
          out.push(msg(`## ${audienceProfile.name.ja}向けの調整`, `## Adjustments for ${audienceProfile.name.en}`, l));
          out.push('');
          out.push(...liList(audienceProfile.adjustments, l));
          out.push('');
        } else if (audience) {
          out.push(msg('## 聴衆について', '## On the audience', l));
          out.push('');
          out.push(
            li(
              {
                ja: `「${audience}」は定型の聴衆パターンに当てはまりませんでした。図を出す前に「この人が図を見た後に取る行動は何か」を 1 行で書いてみてください。書けないなら、その図はまだ出すタイミングではありません。`,
                en: `"${audience}" did not match a stock audience pattern. Before you present, write in one line what this person will do after seeing it. If you cannot, the view is not ready to show.`,
              },
              l,
            ),
          );
          out.push('');
        }

        out.push(msg('## 次の一手', '## Next move', l));
        out.push('');
        out.push(
          ...liList(
            [
              {
                ja: `まず手描きかホワイトボードで 10 分だけ描き、聴衆に見せて反応を見る。ツールで清書するのはその後。清書してから見せると、直す気力が失われる。`,
                en: `Sketch it by hand or on a whiteboard for ten minutes and show it before you build it in a tool. Build it first and you will lack the will to change it.`,
              },
              {
                ja: `関係の引き方に迷ったら \`validate_archimate_relationship\` に始点・終点・関係名を渡す。`,
                en: `When a link is in doubt, pass source, target, and relationship to \`validate_archimate_relationship\`.`,
              },
            ],
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (e) {
        return errorResult(
          msg(
            `ビュー提案の生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            `Failed to build the view suggestion: ${e instanceof Error ? e.message : String(e)}`,
            l,
          ),
        );
      }
    },
  );

  /* ---------------- 5. archimate_vs_togaf ---------------- */
  server.registerTool(
    'archimate_vs_togaf',
    {
      title: 'ArchiMate vs TOGAF',
      description:
        'TOGAF と ArchiMate の関係を整理して返す。手法と記述言語という役割の違い、どちらをいつ使うか、併用したときのよくある失敗、そして「最小限の組み合わせ」を返す。 / Lay out how TOGAF and ArchiMate relate: a method versus a description language, when to reach for which, how combining them usually goes wrong, and the minimum combination that works.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => {
      const l = lang as Lang;
      try {
        const out: string[] = [];
        out.push(msg('# TOGAF と ArchiMate — 役割が違うので競合しない', '# TOGAF and ArchiMate — different jobs, so they do not compete', l));
        out.push('');
        out.push(
          msg(
            'どちらも The Open Group が発行している。TOGAF Standard は 10th Edition(2022 年)、ArchiMate は 3.2(2022 年)。よく「どちらを採用するか」と問われるが、比較の対象になっていない。片方は進め方の手順で、もう片方は描くための語彙と文法。',
            'Both come from The Open Group — the TOGAF Standard at its 10th Edition (2022) and ArchiMate at 3.2 (2022). People ask which one to adopt, but they are not alternatives: one is a procedure for getting somewhere, the other is the vocabulary and grammar for drawing what you find.',
            l,
          ),
        );
        out.push('');
        out.push('```');
        out.push(
          [
            '   TOGAF  =  the METHOD              ArchiMate  =  the LANGUAGE',
            '   ------------------------          -----------------------------',
            '   "what do I do next?"              "how do I write it down?"',
            '   phases, deliverables,             elements, relationships,',
            '   governance, gates                 layers, views',
            '',
            '   Without the language:             Without the method:',
            '   every architect draws             beautiful diagrams that',
            '   in a private notation             nobody asked for',
          ].join('\n'),
        );
        out.push('```');
        out.push('');

        out.push(msg('## 比較', '## Side by side', l));
        out.push('');
        out.push(`| ${inline('観点', 'Aspect', l)} | TOGAF | ArchiMate |`);
        out.push('| --- | --- | --- |');
        const rows: [Bilingual, Bilingual, Bilingual][] = [
          [
            { ja: '正体', en: 'What it is' },
            { ja: '進め方の手順(手法)', en: 'A procedure — a method' },
            { ja: '描くための語彙と文法(記述言語)', en: 'A vocabulary and grammar — a description language' },
          ],
          [
            { ja: '答える問い', en: 'Question it answers' },
            { ja: '次に何をやるか、誰の承認が要るか', en: 'What do I do next, and whose approval do I need?' },
            { ja: 'この関係をどう書けば他人に同じ意味で伝わるか', en: 'How do I write this so someone else reads the same meaning?' },
          ],
          [
            { ja: '単位', en: 'Units' },
            { ja: 'フェーズ、成果物、ガバナンスのゲート', en: 'Phases, deliverables, governance gates' },
            { ja: '要素、関係、ビュー', en: 'Elements, relationships, views' },
          ],
          [
            { ja: '成果の形', en: 'Shape of the output' },
            { ja: '文書中心。承認の記録が残る', en: 'Document-centred, leaving a record of approvals' },
            { ja: 'モデル中心。差分と影響が計算できる', en: 'Model-centred, so deltas and impact can be computed' },
          ],
          [
            { ja: '道具', en: 'Tooling' },
            { ja: '文書テンプレート、表計算、決裁の仕組み', en: 'Document templates, spreadsheets, an approval workflow' },
            { ja: 'Archi(無償)などのモデリングツール', en: 'A modelling tool such as Archi (free)' },
          ],
          [
            { ja: '単独で使ったときの弱点', en: 'Weakness on its own' },
            { ja: '図が我流になり、案件をまたいで比較できない', en: 'Notation goes private, so nothing is comparable across engagements' },
            { ja: '「なぜこの図を描いたのか」が残らず、鑑賞物になる', en: 'The reason for the picture is lost and it becomes decoration' },
          ],
          [
            { ja: '発行元 / 版', en: 'Publisher / version' },
            { ja: 'The Open Group / 10th Edition (2022)', en: 'The Open Group / 10th Edition (2022)' },
            { ja: 'The Open Group / 3.2 (2022)', en: 'The Open Group / 3.2 (2022)' },
          ],
        ];
        for (const [a, b, c] of rows) {
          out.push(`| **${cell(a, l)}** | ${cell(b, l)} | ${cell(c, l)} |`);
        }
        out.push('');

        out.push(msg('## どちらをいつ使うか', '## When to reach for which', l));
        out.push('');
        out.push(
          `| ${inline('状況', 'Situation', l)} | ${inline('使うもの', 'Reach for', l)} |`,
        );
        out.push('| --- | --- |');
        const whenRows: [Bilingual, Bilingual][] = [
          [
            { ja: 'EA の体制を立ち上げる。原則とガバナンスを決める', en: 'Standing up an EA practice; setting principles and governance' },
            { ja: 'TOGAF のみ。ここでモデリングツールを触ると、体制の議論がツール選定に化ける', en: 'TOGAF alone. Touch a modelling tool here and the governance discussion becomes a tool-selection discussion' },
          ],
          [
            { ja: '既存システムの絡まりを解きたい。単発の整理', en: 'Untangling an existing landscape as a one-off' },
            { ja: 'ArchiMate のみで十分。ADM を一周回す必要はない', en: 'ArchiMate alone is enough; there is no need to run a full ADM cycle' },
          ],
          [
            { ja: '現行 → 目標 → 移行を複数フェーズにまたいで一貫させたい', en: 'Keeping baseline, target, and transition consistent across several phases' },
            { ja: '併用が効く。プラトーで状態を持ち、ADM で承認の段取りを回す', en: 'Combine them: hold states as plateaus, run approvals through the ADM' },
          ],
          [
            { ja: '経営に投資を承認してもらう', en: 'Getting an investment approved' },
            { ja: '併用。TOGAF のフェーズ A の枠組みで、ArchiMate の動機ビューを 1 枚出す', en: 'Combine: use the Phase A frame and put one ArchiMate motivation view in front of them' },
          ],
          [
            { ja: '1 つのシステムの設計をする', en: 'Designing a single system' },
            { ja: 'どちらも要らない。C4 モデルやシーケンス図の方が速い', en: 'Neither. C4 or a sequence diagram gets there faster' },
          ],
        ];
        for (const [a, b] of whenRows) {
          out.push(`| ${cell(a, l)} | ${cell(b, l)} |`);
        }
        out.push('');

        out.push(msg('## 併用したときのよくある失敗', '## How combining them usually goes wrong', l));
        out.push('');
        out.push(
          ...liList(
            [
              {
                ja: '全フェーズで全要素を描こうとしてモデルが破綻する。ADM は 10 フェーズ、ArchiMate は 7 層ある。掛け算をやろうとした瞬間に終わる。使う要素を 15 種類に絞ることが、併用を成立させる唯一の条件。',
                en: 'Trying to draw everything in every phase. Ten phases times seven layers is a multiplication nobody survives. Capping the element kinds you use at around fifteen is the single condition that makes the combination viable.',
              },
              {
                ja: '成果物を「文書」と「モデル」で二重に持ち、片方が腐る。文書は ID を参照するだけにして、内容はモデルにだけ置く。両方に本文を書いた時点で、半年後にどちらが正か分からなくなる。',
                en: 'Keeping deliverables twice, once as a document and once as a model, so one rots. Let the document cite ids and keep the content in the model only. Write the body in both places and in six months nobody knows which is authoritative.',
              },
              {
                ja: '関係の意味を決めずに Association だらけになる。ArchiMate の価値は関係に意味があることに尽きるので、これをやると単なるお絵かきツールになる。',
                en: 'Never settling the semantics, so everything becomes an Association. The entire value of ArchiMate is that relationships mean something; skip that and it is a drawing tool.',
              },
              {
                ja: '動機層を作らないまま業務層とアプリ層だけを描く。図はできるが「なぜこの絵か」を説明できず、承認の場で必ず詰まる。',
                en: 'Drawing only the business and application layers with no motivation layer. The picture exists, but nothing explains why it looks that way, and the approval meeting stalls every time.',
              },
              {
                ja: 'Plateau を使わず、現行と目標を別ファイルで管理する。差分が機械的に取れなくなり、ギャップ分析が「目視で見比べる」作業になる。',
                en: 'Skipping plateaus and keeping baseline and target in separate files. The delta stops being computable and gap analysis degenerates into eyeballing two pictures.',
              },
              {
                ja: '色と命名の規約を決めずに始める。3 人以上で描くと必ず配色が割れ、後から統一するのは新規に描き直すのと同じ手間になる。',
                en: 'Starting without a colour and naming convention. With three or more people drawing, the palettes diverge, and retrofitting consistency costs as much as redrawing from scratch.',
              },
              {
                ja: 'ツールの操作研修から始めてしまう。ツールは 1 日で覚えられるが、「何を描かないか」の判断は覚えられない。研修より先に、既存の 1 枚を一緒に描き直す方が身に付く。',
                en: 'Starting with tool training. The tool takes a day; knowing what not to draw does not come from training. Redrawing one existing diagram together teaches more than the course.',
              },
            ],
            l,
          ),
        );
        out.push('');

        out.push(msg('## 最小の組み合わせ(ここから始める)', '## The minimum combination worth starting with', l));
        out.push('');
        out.push(`| ${inline('フェーズ', 'Phase', l)} | ${inline('作る図', 'Views to produce', l)} | ${inline('上限', 'Cap', l)} |`);
        out.push('| :-: | --- | --- |');
        const minRows: [string, Bilingual, Bilingual][] = [
          ['Preliminary', { ja: '規約だけ(要素リスト・色・命名)。図は作らない', en: 'Conventions only — element list, colours, naming. No views' }, { ja: '要素 15 種類まで', en: '15 element kinds' }],
          ['A', { ja: '動機ビュー 1 枚 + ケイパビリティマップ 1 枚', en: 'One motivation view, one capability map' }, { ja: '1 枚 25 要素まで', en: '25 elements per page' }],
          ['B–D', { ja: '層ごとに 1〜2 枚。現行と目標は同じ書式で並べる', en: 'One or two per layer, baseline and target in the same format' }, { ja: '1 枚 20 要素まで', en: '20 elements per page' }],
          ['E–F', { ja: 'プラトー 3 個(現行 / 移行 / 目標)+ ロードマップ 1 枚', en: 'Three plateaus — baseline, transition, target — plus one roadmap' }, { ja: 'プラトー 4 個まで', en: '4 plateaus' }],
          ['G–H', { ja: '準拠性ビュー 1 枚(逸脱と例外だけ)', en: 'One compliance view showing only deviations and waivers' }, { ja: '逸脱のみ', en: 'Deviations only' }],
        ];
        for (const [code, v, capv] of minRows) {
          out.push(`| ${code} | ${cell(v, l)} | ${cell(capv, l)} |`);
        }
        out.push('');
        out.push(
          msg(
            'この表の合計は 10 枚前後。TOGAF の成果物を全部作ると 30 種類を超えるが、最初の一周でそれをやろうとして完走できた組織を見たことがない。10 枚を回し切ってから増やす方が、結果的に速い。',
            'That is roughly ten views in total. A full set of TOGAF deliverables runs past thirty artifact types, and no organization I have seen completed that on a first cycle. Finishing ten and then adding is faster in the end.',
            l,
          ),
        );
        out.push('');

        out.push(msg('## 現場の道具との繋ぎ', '## Wiring it to the tools people actually use', l));
        out.push('');
        out.push(
          ...liList(
            [
              {
                ja: 'Archi — 無償の ArchiMate モデリングツール。モデルを 1 ファイルで持て、CSV 出力ができるので、アプリ台帳や要件一覧は手で作らずにここから出す。',
                en: 'Archi — the free ArchiMate modelling tool. It keeps the model in one file and exports CSV, so application inventories and requirement lists should be generated from it rather than hand-maintained.',
              },
              {
                ja: 'Mermaid — ツールを配れない現場での代替。flowchart で層ごとに subgraph を切り、要素名を ArchiMate の名称に揃えておけば、後でモデリングツールへ移せる。関係の意味は矢印のラベルに書いて補う。',
                en: 'Mermaid — the fallback where a tool cannot be distributed. Use a flowchart with one subgraph per layer and keep element names aligned to ArchiMate names so the work can move into a real tool later; carry the relationship semantics in the arrow labels.',
              },
              {
                ja: 'C4 — 1 つのシステムの内部を描くならこちらが速い。ArchiMate は全社の関係を描くもので、粒度が違う。ArchiMate の Application Component 1 個が C4 の Container 図 1 枚に対応する、と考えると両者が繋がる。',
                en: 'C4 — faster for the inside of a single system. ArchiMate works at enterprise scale; the granularities differ. Treating one ArchiMate Application Component as one C4 container diagram is the join between them.',
              },
              {
                ja: 'BIZBOK(Business Architecture Guild)— ケイパビリティとバリューストリームの実務的な整理はこちらの方が厚い。ArchiMate の戦略層の要素と概念が対応するので、BIZBOK で作ったケイパビリティマップをそのまま Capability 要素として取り込める。',
                en: 'BIZBOK, from the Business Architecture Guild — richer on the practical side of capabilities and value streams. Its concepts line up with the ArchiMate strategy layer, so a capability map built there can be brought in as Capability elements as is.',
              },
            ],
            l,
          ),
        );
        out.push('');
        out.push(
          msg(
            '次の一手: `map_togaf_to_archimate` に今のフェーズ ID を渡して、この一周で作る図を 10 枚以内に決めてください。',
            'Next move: pass your current phase id to `map_togaf_to_archimate` and settle on ten views or fewer for this cycle.',
            l,
          ),
        );
        return textResult(out.join('\n'));
      } catch (e) {
        return errorResult(
          msg(
            `比較の生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
            `Failed to build the comparison: ${e instanceof Error ? e.message : String(e)}`,
            l,
          ),
        );
      }
    },
  );
}
