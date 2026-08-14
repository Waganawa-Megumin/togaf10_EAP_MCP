#!/usr/bin/env node
/**
 * README 用スクリーンショットのデモ案件を作る / Seed the demo engagement used by the README screenshots.
 *
 * `scripts/mcp-cli.mjs` 経由で実際の MCP ツールを呼ぶ(Claude が呼ぶのと同じ経路)。
 * 登場する企業名・人名はすべて**架空**。
 *
 *   node pic/screenshots/capture/seed-demo.mjs [--data-dir /tmp/togaf-eap-demo]
 *
 * 既定のデータディレクトリは /tmp/togaf-eap-demo。既存の内容は消してから作り直す。
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const cli = join(repo, 'scripts', 'mcp-cli.mjs');

const argv = process.argv.slice(2);
const dataDirFlag = argv.indexOf('--data-dir');
const dataDir = dataDirFlag >= 0 ? resolve(argv[dataDirFlag + 1]) : '/tmp/togaf-eap-demo';

const scratch = mkdtempSync(join(tmpdir(), 'togaf-seed-'));

/** ツールを 1 回呼び、テキスト出力を返す */
function call(tool, args) {
  const file = join(scratch, 'args.json');
  writeFileSync(file, JSON.stringify(args), 'utf8');
  const run = spawnSync(
    process.execPath,
    [cli, 'call', tool, '--file', file, '--data-dir', dataDir, '--keep-data', '--quiet'],
    { encoding: 'utf8', env: { ...process.env, TOGAF_EAP_NO_BROWSER: '1' } },
  );
  if (run.status !== 0) {
    throw new Error(`${tool} failed:\n${run.stdout ?? ''}${run.stderr ?? ''}`);
  }
  const out = run.stdout ?? '';
  if (/MCP error|isError/.test(out)) throw new Error(`${tool} returned an error:\n${out}`);
  return out;
}

/** 出力に出てくる採番済み ID を取り出す(例: `trn-1-0kgu80`) */
function idFrom(out, prefix) {
  const m = out.match(new RegExp('`(' + prefix + '-[a-z0-9-]+)`'));
  if (!m) throw new Error(`could not find a ${prefix}- id in:\n${out}`);
  return m[1];
}

const ja = { lang: 'ja' };

rmSync(dataDir, { recursive: true, force: true });

/* ------------------------------------------------------------------ 案件 */
call('start_engagement', {
  ...ja,
  name: '生産管理基幹刷新とサプライチェーン可視化 / Core manufacturing system renewal and supply chain visibility',
  client: 'ミナカミ精密工業株式会社(架空の企業 / fictional company)',
  industry: '製造業(産業機械部品)/ Manufacturing — industrial machinery components',
  description:
    '20 年以上運用してきた自社開発の生産管理システムが保守限界に達している。国内 3 工場・海外 2 拠点で個別最適に分岐しており、需要変動への追従が遅い。直近 4 四半期で納期遵守率 91% → 84%、棚卸資産回転日数 62 日と悪化。基幹刷新を単なる置き換えで終わらせず、需給可視化と原価把握の能力獲得までを一つのアーキテクチャとして設計する。',
  scope:
    '対象: 生産計画・購買・在庫・原価管理の刷新、PLM / MES との連携方式、需給可視化のデータ基盤、海外 2 拠点のテンプレート展開。対象外: 人事給与、連結会計、営業 CRM、工場設備そのものの更新(別プログラムで実施)。',
  currentPhase: 'e',
});

/* -------------------------------- フェーズ / 人 / リスク / 決定 / 行動 / 成果物 */
call('update_engagement', {
  ...ja,
  phases: [
    { phase: 'preliminary', status: 'completed', note: 'EA 推進体制と原則を役員会で承認(2025-Q3)' },
    { phase: 'a', status: 'completed', note: 'ビジョンと作業範囲記述書を承認。投資判断のゲートを 2026-Q1 に設定' },
    { phase: 'b', status: 'completed', note: '能力マップ 3 階層とバリューストリーム 4 本を確定' },
    { phase: 'c', status: 'completed', note: 'アプリ 118 本の棚卸完了。データエンティティ 42 件を定義' },
    { phase: 'd', status: 'in_progress', note: 'MES / PLM 連携方式とクラウド配置の技術標準を検討中' },
    { phase: 'e', status: 'in_progress', note: 'ギャップを 8 つの作業パッケージに集約。移行アーキテクチャ 3 段を起草' },
    { phase: 'f', status: 'not_started', note: '2026-Q4 の予算編成に合わせて着手予定' },
    { phase: 'g', status: 'not_started' },
    { phase: 'h', status: 'not_started' },
    { phase: 'requirements-management', status: 'in_progress', note: '要件 214 件を登録。うち 31 件がフェーズ D の決定待ち' },
  ],
  stakeholders: [
    { name: '大西 亨', role: 'CIO / 情報システム担当役員', organization: '本社', influence: 'high', interest: 'high',
      concerns: ['投資回収を 5 年以内に説明できるか', 'ベンダー 1 社依存を避けたい'],
      approach: '月次のアーキテクチャ運営委員会で意思決定。ロードマップは四半期粒度で提示する' },
    { name: '佐久間 玲子', role: '生産本部長', organization: '生産本部', influence: 'high', interest: 'high',
      concerns: ['現場の運用を止めずに切り替えられるのか', 'アドオンを削ると現場が回らないのでは'],
      approach: '移行アーキテクチャの各段で「ここで止めても事業が回るか」を一緒に確認する' },
    { name: '白鳥 健吾', role: '情報システム部長', organization: '情報システム部', influence: 'high', interest: 'high',
      concerns: ['現行仕様の有識者が 2 名しかいない', '運用保守要員の再配置'],
      approach: '週次で技術課題を棚卸。現行仕様の形式知化を作業パッケージとして予算化する' },
    { name: '三隅 里佳', role: '購買部長', organization: '調達本部', influence: 'medium', interest: 'high',
      concerns: ['取引先マスタの統合で発注業務が混乱しないか', '海外拠点との品目コード不一致'],
      approach: 'マスタ統合の判断会議に常時参加。移行リハーサルの受入基準を書いてもらう' },
    { name: '濱口 直人', role: '第一工場 工場長', organization: '第一工場', influence: 'medium', interest: 'high',
      concerns: ['MES との連携が止まると製造が止まる', '端末オペレーションの再教育工数'],
      approach: '第一工場をパイロットとし、要件の妥当性を実機で確認する' },
    { name: '遠山 有希', role: '経理部長(原価管理)', organization: '経理部', influence: 'medium', interest: 'medium',
      concerns: ['原価計算ロジックの変更が監査で説明できるか'],
      approach: '標準原価への統一方針を会計監査人と事前にすり合わせる' },
    { name: '藤田 尚人', role: '品質保証部長', organization: '品質保証部', influence: 'medium', interest: 'medium',
      concerns: ['トレーサビリティの記録要件を落とさないこと'],
      approach: '要件管理の対象として記録要件を明示的に追跡する' },
    { name: 'Miguel Herrera', role: '海外拠点 General Manager', organization: 'メキシコ工場', influence: 'low', interest: 'high',
      concerns: ['日本標準をそのまま押し付けられると現地の商習慣に合わない'],
      approach: 'テンプレート展開はフェーズ 2。差分要件を先に洗い出しておく' },
    { name: '早瀬 拓', role: 'PMO リード', organization: '経営企画室', influence: 'medium', interest: 'high',
      concerns: ['二重運用期間の現場工数が確保できるか'],
      approach: '移行計画の工数見積を各部門長と合意してから予算化する' },
    { name: '北条 誠一', role: '監査役', organization: '監査役会', influence: 'low', interest: 'low',
      concerns: ['内部統制の記録が刷新後も残るか'],
      approach: '四半期報告のみ。適合性評価の結果を要約して共有する' },
  ],
  risks: [
    { title: '現行システムの仕様が有識者 2 名の記憶にしか残っていない',
      description: '生産計画の引当ロジックに設計書が無く、20 年分の改修が個人の記憶に依存している。1 名は 2027 年に定年。',
      level: 'critical', residualLevel: 'medium', status: 'mitigating', owner: '白鳥 健吾', phase: 'c',
      mitigation: 'WP-1 で現行ロジックのリバースと形式知化を先行実施。ペアで作業させ、成果物をアーキテクチャリポジトリに登録する。' },
    { title: 'パッケージ標準機能と現場運用の乖離によるアドオン肥大',
      description: '過去の刷新でアドオンが 400 本超まで膨らみ、保守コストが上昇した経緯がある。',
      level: 'critical', residualLevel: 'high', status: 'mitigating', owner: '佐久間 玲子', phase: 'e',
      mitigation: 'アドオン採否を「競争優位に直結するか」の 1 基準に絞り、運営委員会で例外承認制にする。件数上限を 60 本と設定。' },
    { title: '海外 2 拠点のマスタ定義が国内と非互換',
      description: '品目コード体系・取引先コードが拠点ごとに独自進化しており、統合キーが存在しない。',
      level: 'high', status: 'open', owner: '三隅 里佳', phase: 'c',
      mitigation: '名寄せ規則の策定を WP-3 のスコープに入れる。判定不能分は手作業前提で工数を積む。' },
    { title: '移行期間中の二重運用に現場工数を確保できない',
      description: '並行稼働 3 か月で現場に月 120 人日相当の追加負荷が見込まれるが、要員計画が未合意。',
      level: 'high', status: 'open', owner: '早瀬 拓', phase: 'f',
      mitigation: '移行計画で要員計画を先に確定させる。確保できない場合は段階切替に方式変更する。' },
    { title: 'MES 連携のリアルタイム要件が未確定',
      description: '実績収集の遅延許容が工場ごとに異なり、同期/非同期の方式判断ができていない。',
      level: 'high', residualLevel: 'medium', status: 'mitigating', owner: '濱口 直人', phase: 'd',
      mitigation: '第一工場で実測し、遅延許容の実データを取ってから方式を決める。測定は 2026-Q3 に完了予定。' },
    { title: '原価計算ロジックの変更が監査で説明できない',
      description: '実際原価と標準原価が混在しており、刷新後の数値の連続性を説明する資料が無い。',
      level: 'medium', residualLevel: 'low', status: 'mitigating', owner: '遠山 有希', phase: 'b',
      mitigation: '会計監査人と方針を事前合意し、移行前後の並行計算による差異説明資料を作る。' },
    { title: '需給可視化基盤における取引先機密の取り扱い',
      description: '需要予測に取引先の内示情報を用いるため、契約上の目的外利用に該当しないかの確認が必要。',
      level: 'medium', status: 'open', owner: '白鳥 健吾', phase: 'd',
      mitigation: '法務レビューを 2026-Q3 に実施。アクセス制御要件をセキュリティ要件チェックリストに反映する。' },
    { title: 'ベンダー 1 社依存による価格交渉力の低下',
      description: '候補パッケージの実装パートナーが国内に実質 2 社しかなく、長期の価格上昇リスクがある。',
      level: 'medium', status: 'accepted', owner: '大西 亨', phase: 'e',
      mitigation: '受容。ただし技術標準カタログで連携仕様を自社所有とし、乗り換え可能性を確保する。' },
    { title: 'パイロット工場の選定が生産繁忙期と重なる',
      description: '第一工場の受注ピークが 2026-Q4 で、パイロットの検証期間と重なる。',
      level: 'low', status: 'closed', owner: '濱口 直人', phase: 'e',
      mitigation: '検証を 2026-Q3 に前倒しして解消済み。' },
  ],
  decisions: [
    { title: 'パッケージ導入を基本とし、アドオンは競争優位に直結するものに限定する',
      context: '自社開発の継続、フルスクラッチ、パッケージ + アドオンの 3 案を比較。保守要員の確保見通しが決め手。',
      decision: 'パッケージ導入を基本方針とする。アドオンは運営委員会の例外承認制、上限 60 本。',
      rationale: '自社開発の継続は有識者 2 名への依存を固定化する。アドオン件数を制約しないと前回の刷新と同じ結果になる。',
      status: 'accepted', decidedBy: 'アーキテクチャ運営委員会', phase: 'e' },
    { title: '需給可視化は基幹システムとは別のデータ基盤に置く',
      context: '基幹内の帳票機能で賄う案と、分析基盤を分離する案。',
      decision: '分析用データ基盤を分離し、基幹からはイベントで連携する。',
      rationale: '基幹の更新サイクルと分析の変更サイクルが 1 桁違う。同居させると基幹のリリースが分析要件で止まる。',
      status: 'accepted', decidedBy: '大西 亨 / 白鳥 健吾', phase: 'c' },
    { title: 'MES 連携は非同期イベント方式を既定とする',
      context: '同期 API 方式は工場側の停止が基幹に波及する。',
      decision: '実績収集は非同期イベントを既定とし、同期が必要な業務のみ個別に例外とする。',
      rationale: '工場の可用性要件が基幹より厳しく、障害の影響範囲を切り離す必要がある。',
      status: 'accepted', decidedBy: 'アーキテクチャ運営委員会', phase: 'd' },
    { title: '海外 2 拠点はテンプレート展開(第 2 段階)とする',
      context: '同時展開はマスタ非互換の解消を待つ必要があり、国内の切替も遅れる。',
      decision: '国内 3 工場を先行し、海外はテンプレート化した後に展開する。',
      rationale: '国内で確定した業務テンプレートが無い状態で海外に展開すると、拠点ごとの独自進化を再生産する。',
      status: 'accepted', decidedBy: 'アーキテクチャ運営委員会', phase: 'e' },
    { title: '原価計算は標準原価 + 差異分析に統一する',
      context: '拠点ごとに実際原価と標準原価が混在している。',
      decision: '標準原価に統一し、差異分析で実際原価の情報を担保する案を提案中。',
      rationale: '拠点間の比較可能性を確保するため。会計監査人との事前合意が前提。',
      status: 'proposed', decidedBy: '遠山 有希(提案)', phase: 'b' },
    { title: 'オンプレミス継続案を取り下げる',
      context: '工場ネットワークの遅延懸念からオンプレ継続案が出ていた。',
      decision: 'クラウド配置を既定とし、工場側にはエッジのバッファのみ置く。',
      rationale: '実測の結果、遅延はエッジのバッファで吸収可能な範囲だった。',
      status: 'superseded', decidedBy: 'アーキテクチャ運営委員会', phase: 'd' },
  ],
  actions: [
    { title: '第一工場で MES 実績収集の遅延を実測し、同期/非同期の判断材料を作る', owner: '濱口 直人',
      due: '2026-09-30', status: 'in_progress', priority: 'high', phase: 'd',
      note: '1 週間分の実測データを取得中。遅延許容の閾値は 5 分と仮置き。' },
    { title: '現行の生産計画引当ロジックをリバースし、形式知化する', owner: '白鳥 健吾',
      due: '2026-10-31', status: 'in_progress', priority: 'high', phase: 'c',
      note: '42 ロジックのうち 18 件完了。残りは有識者 1 名の稼働待ち。' },
    { title: 'アドオン候補 87 件を「競争優位に直結するか」で仕分ける', owner: '佐久間 玲子',
      due: '2026-09-15', status: 'todo', priority: 'high', phase: 'e' },
    { title: '海外 2 拠点の品目コード差分を洗い出す', owner: '三隅 里佳',
      due: '2026-11-28', status: 'todo', priority: 'medium', phase: 'c' },
    { title: '二重運用期間の要員計画を各部門長と合意する', owner: '早瀬 拓',
      due: '2026-10-15', status: 'blocked', priority: 'high', phase: 'f',
      note: '生産本部の来期要員計画が確定しないと着手できない。10 月の経営会議待ち。' },
    { title: '需給可視化での取引先内示情報の利用可否を法務レビューする', owner: '白鳥 健吾',
      due: '2026-09-30', status: 'todo', priority: 'medium', phase: 'd' },
    { title: '標準原価への統一方針を会計監査人とすり合わせる', owner: '遠山 有希',
      due: '2026-10-31', status: 'todo', priority: 'medium', phase: 'b' },
    { title: 'アーキテクチャ定義書(ビジネス編)をレビューに回す', owner: '早瀬 拓',
      due: '2026-08-29', status: 'done', priority: 'medium', phase: 'b',
      note: '運営委員会でレビュー完了。指摘 11 件はすべて反映済み。' },
    { title: 'アプリケーションポートフォリオ 118 本の棚卸を完了させる', owner: '白鳥 健吾',
      due: '2026-07-31', status: 'done', priority: 'high', phase: 'c',
      note: '廃止候補 34 本、統合候補 12 本を特定。' },
    { title: '移行アーキテクチャ 3 段の「単独で事業が回るか」を生産本部と確認する', owner: '佐久間 玲子',
      due: '2026-09-20', status: 'todo', priority: 'high', phase: 'e' },
  ],
  deliverables: [
    { deliverableId: 'architecture-vision', name: 'アーキテクチャビジョン', status: 'baselined', owner: '早瀬 拓', phase: 'a', note: '2026-02 の運営委員会でベースライン化' },
    { deliverableId: 'statement-of-architecture-work', name: 'アーキテクチャ作業範囲記述書', status: 'approved', owner: '早瀬 拓', phase: 'a' },
    { deliverableId: 'stakeholder-map', name: 'ステークホルダーマップ', status: 'approved', owner: '早瀬 拓', phase: 'a', note: '10 名を影響力 × 関心度で分類済み' },
    { deliverableId: 'business-capability-map', name: 'ビジネス能力マップ(3 階層)', status: 'baselined', owner: '佐久間 玲子', phase: 'b' },
    { deliverableId: 'architecture-definition-document', name: 'アーキテクチャ定義書(B/C/D 編)', status: 'review', owner: '白鳥 健吾', phase: 'c', note: 'D 編は MES 連携方式の決定待ちで空欄あり' },
    { deliverableId: 'application-portfolio-catalog', name: 'アプリケーションポートフォリオカタログ', status: 'approved', owner: '白鳥 健吾', phase: 'c', note: '118 本。廃止候補 34 本を色分け' },
    { deliverableId: 'data-entity-catalog', name: 'データエンティティカタログ', status: 'review', owner: '白鳥 健吾', phase: 'c', note: '42 エンティティ。マスタ統合キーの定義が未確定' },
    { deliverableId: 'technology-standards-catalog', name: '技術標準カタログ', status: 'drafting', owner: '白鳥 健吾', phase: 'd' },
    { deliverableId: 'architecture-roadmap', name: 'アーキテクチャロードマップ', status: 'drafting', owner: '早瀬 拓', phase: 'e' },
    { deliverableId: 'transition-architecture', name: '移行アーキテクチャ(3 段)', status: 'drafting', owner: '早瀬 拓', phase: 'e' },
    { deliverableId: 'implementation-migration-plan', name: '実装移行計画', status: 'not_started', owner: '早瀬 拓', phase: 'f', note: '2026-Q4 の予算編成に合わせて着手' },
    { deliverableId: 'architecture-requirements-spec', name: 'アーキテクチャ要件仕様', status: 'review', owner: '藤田 尚人', phase: 'requirements-management', note: '214 件。31 件がフェーズ D の決定待ち' },
  ],
  notes: [
    '投資判断ゲートは 2026-Q4 の役員会。ここまでにロードマップと概算コストを揃える。',
    '前回(2014 年)の刷新はアドオン 400 本超で保守費が 1.6 倍になった。同じ轍を踏まないことが役員の最大の関心事。',
    '第一工場をパイロットとする方針は現場合意済み。ただし受注ピーク(2026-Q4)を避けて 2026-Q3 に検証を前倒し。',
    '海外 2 拠点への展開は国内テンプレート確定後。現地の商習慣差分は先に洗い出しておく。',
    '本案件のデータは README 用のデモです。企業名・人名はすべて架空です。',
  ],
});

/* ------------------------------------------------------ 移行アーキテクチャ */
const t1 = idFrom(call('add_transition_state', {
  ...ja, name: 'T1 見える化の先行', order: 1, targetQuarter: '2026-Q4',
  capabilities: ['需給の週次可視化(国内 3 工場)', '在庫の日次可視化', '納期遵守率の要因分析'],
  standalone: true,
  note: '基幹には手を入れず、既存データの抽出だけで需給を見えるようにする。ここで止めても事業は回る。',
}), 'trn');

const t2 = idFrom(call('add_transition_state', {
  ...ja, name: 'T2 国内 3 工場の切替', order: 2, targetQuarter: '2027-Q4',
  capabilities: ['生産計画・購買・在庫の統合運用(国内)', '標準原価による拠点間比較', 'MES との非同期連携'],
  standalone: false,
  interim: '受注は旧システム、製造指示は新システムという二重運用が 3 か月発生する。取引先マスタも二重メンテとなる。',
  disposalPlan: '2028-Q1 末に旧システムを停止し、二重メンテを解消する。停止判定は運営委員会。',
  note: '単独では止まれない状態。ここで予算が切れると二重運用が恒久化するため、T3 までの予算確保を前提とする。',
}), 'trn');

const t3 = idFrom(call('add_transition_state', {
  ...ja, name: 'T3 海外展開・旧停止', order: 3, targetQuarter: '2028-Q4',
  capabilities: ['全 5 拠点の統合運用', 'グローバル在庫の可視化', '旧システムの完全停止'],
  standalone: true,
  note: '国内で確定した業務テンプレートを海外 2 拠点へ展開する。ここが目標アーキテクチャ。',
}), 'trn');

/* -------------------------------------------------------- 作業パッケージ */
const wp = (args) => idFrom(call('add_work_package', { ...ja, ...args }), 'wp');

const w0 = wp({ name: 'WP-0 現状分析とアプリ棚卸', description: 'アプリ 118 本を棚卸し、廃止候補を特定',
  status: 'delivered', transitionId: t1, phase: 'c', owner: '白鳥 健吾',
  startQuarter: '2026-Q3', endQuarter: '2026-Q3', businessValue: 'medium', effort: 'medium',
  costEstimate: '0.3 億円', benefit: '廃止候補 34 本を特定し見積精度を上げた', benefitOwner: '白鳥 健吾' });

const w1 = wp({ name: 'WP-1 現行ロジックの形式知化', description: '生産計画の引当ロジック 42 件を設計書化',
  status: 'in_progress', transitionId: t1, phase: 'c', owner: '白鳥 健吾',
  startQuarter: '2026-Q3', endQuarter: '2026-Q4', businessValue: 'high', effort: 'medium',
  costEstimate: '0.8 億円', benefit: '有識者 2 名への依存を解消', benefitOwner: '白鳥 健吾', dependsOn: [w0] });

const w2 = wp({ name: 'WP-2 需給可視化データ基盤', description: '既存データを抽出し需給と在庫を週次可視化',
  status: 'in_progress', transitionId: t1, phase: 'd', owner: '白鳥 健吾',
  startQuarter: '2026-Q3', endQuarter: '2027-Q1', businessValue: 'high', effort: 'medium',
  costEstimate: '1.2 億円', benefit: '棚卸資産回転 62 日 → 52 日', benefitOwner: '佐久間 玲子', dependsOn: [w0] });

const w3 = wp({ name: 'WP-3 マスタ統合(品目・取引先)', description: '5 拠点のコード体系に名寄せ規則と統合キーを付与',
  status: 'planned', transitionId: t2, phase: 'c', owner: '三隅 里佳',
  startQuarter: '2026-Q4', endQuarter: '2027-Q2', businessValue: 'high', effort: 'high',
  costEstimate: '1.5 億円', benefit: '拠点横断の在庫引当と購買集約', benefitOwner: '三隅 里佳', dependsOn: [w1] });

const w4 = wp({ name: 'WP-4 基幹パッケージ導入(第一工場)', description: 'アドオンは例外承認制・上限 60 本',
  status: 'planned', transitionId: t2, phase: 'e', owner: '濱口 直人',
  startQuarter: '2027-Q1', endQuarter: '2027-Q3', businessValue: 'high', effort: 'high',
  costEstimate: '4.5 億円', benefit: '納期遵守率 84% → 93%(第一工場)', benefitOwner: '濱口 直人', dependsOn: [w1, w3] });

wp({ name: 'WP-5 MES / PLM 連携基盤', description: '実績収集は非同期イベントを既定とする',
  status: 'planned', transitionId: t2, phase: 'd', owner: '白鳥 健吾',
  startQuarter: '2027-Q1', endQuarter: '2027-Q3', businessValue: 'medium', effort: 'high',
  costEstimate: '1.8 億円', benefit: '工場側の障害が基幹に波及しない', benefitOwner: '白鳥 健吾', dependsOn: [w2] });

wp({ name: 'WP-6 標準原価への統一', description: '移行前後の並行計算で差異を説明する',
  status: 'planned', transitionId: t2, phase: 'b', owner: '遠山 有希',
  startQuarter: '2027-Q2', endQuarter: '2027-Q4', businessValue: 'medium', effort: 'medium',
  costEstimate: '0.6 億円', benefit: '拠点間の原価比較が可能になる', benefitOwner: '遠山 有希', dependsOn: [w3] });

const w7 = wp({ name: 'WP-7 第二・第三工場へ横展開', description: 'パイロットで固めた業務テンプレートを展開',
  status: 'proposed', transitionId: t2, phase: 'e', owner: '佐久間 玲子',
  startQuarter: '2027-Q3', endQuarter: '2027-Q4', businessValue: 'high', effort: 'medium',
  costEstimate: '2.2 億円', benefit: '国内 3 工場の統合運用が成立', benefitOwner: '佐久間 玲子', dependsOn: [w4] });

wp({ name: 'WP-8 旧システム停止・アーカイブ', description: '二重運用の解消。停止判定は運営委員会',
  status: 'proposed', transitionId: t3, phase: 'g', owner: '白鳥 健吾',
  startQuarter: '2028-Q1', endQuarter: '2028-Q2', businessValue: 'medium', effort: 'low',
  costEstimate: '0.4 億円', benefit: '旧システム保守費 年 1.1 億円を削減', benefitOwner: '大西 亨', dependsOn: [w7] });

wp({ name: 'WP-9 海外 2 拠点テンプレート展開', description: '現地商習慣の差分は事前に洗い出す',
  status: 'proposed', transitionId: t3, phase: 'e', owner: 'Miguel Herrera',
  startQuarter: '2028-Q1', endQuarter: '2028-Q4', businessValue: 'medium', effort: 'high',
  costEstimate: '3.0 億円', benefit: 'グローバル在庫の可視化', benefitOwner: '大西 亨', dependsOn: [w7] });

wp({ name: 'WP-10 適合性レビューの定着', description: '時期は移行計画の確定待ち',
  status: 'proposed', phase: 'g', owner: '早瀬 拓', businessValue: 'medium', effort: 'low' });

/* -------------------------------------------------------------- 評価 2 件 */
call('assess_maturity', {
  ...ja, scale: 5, save: true, title: 'EA 成熟度(2026-Q3 時点)',
  factors: [
    { name: 'アーキテクチャガバナンス', current: 2, target: 4, note: '運営委員会は月次で回っているが、例外承認の記録が残っていない' },
    { name: '成果物の標準化・再利用', current: 2, target: 4, note: '雛形はあるが拠点ごとに書式が分岐' },
    { name: 'アーキテクチャリポジトリ', current: 1, target: 4, note: '共有フォルダに散在。版管理なし' },
    { name: 'ステークホルダー関与', current: 3, target: 4, note: '生産本部は関与が厚い。海外拠点が薄い' },
    { name: '要員のスキルと体制', current: 2, target: 4, note: 'EA 専任 2 名。現行仕様の有識者に依存' },
    { name: '業務部門との共通言語', current: 3, target: 4, note: '能力マップで会話できるようになった' },
    { name: 'アーキテクチャ変更管理', current: 1, target: 3, note: '変更要求の受付窓口が未定義' },
    { name: '投資判断との接続', current: 2, target: 4, note: '予算プロセスとロードマップの粒度が合っていない' },
  ],
});

call('assess_readiness', {
  ...ja, scale: 5, save: true, title: '変革準備状況(投資判断ゲート前)',
  factors: [
    { name: '経営のスポンサーシップ', current: 4, target: 5, note: 'CIO が推進。役員会の合意も得られている' },
    { name: '業務部門の変革意欲', current: 2, target: 4, note: '生産本部は前向き。購買は前回の刷新の記憶から慎重' },
    { name: 'IT 部門の実行能力', current: 2, target: 4, note: 'パッケージ導入の経験者が社内にいない' },
    { name: '予算確保の見通し', current: 3, target: 5, note: '2026-Q4 の役員会が投資判断ゲート' },
    { name: '現場の工数余力', current: 1, target: 3, note: '二重運用期間の要員計画が未合意。最大の弱点' },
    { name: '過去の変革経験', current: 2, target: 4, note: '2014 年の刷新はアドオン肥大で失敗と評価されている' },
    { name: 'データ品質', current: 2, target: 4, note: '品目・取引先マスタの重複が拠点横断で未解消' },
    { name: 'ベンダーとの関係', current: 3, target: 4, note: '候補 2 社と RFI 実施済み' },
  ],
});

rmSync(scratch, { recursive: true, force: true });
console.log(`seeded: ${dataDir}`);
console.log('next: node pic/screenshots/capture/serve.mjs ' + dataDir + ' 38702 both');
