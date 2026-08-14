# スクリーンショット / Screenshots

README で使う **HTML ダッシュボードの実画面**です。すべて headless chromium で、実際に
`open_dashboard` が立ち上げるのと同じサーバー(`dist/dashboard/httpServer.js`)を撮っています。
合成・加工・ダミーデータは含みません。

## 一覧

| ファイル | 何が写っているか | 寸法 (px) | サイズ | 言語 | テーマ |
| --- | --- | --- | --- | --- | --- |
| `dashboard-overview.png` | ヘッダー(ライブ更新中の表示)・目次・進捗サマリ・概要/スコープ・ADM 10 フェーズ進捗・四半期ロードマップのタイムライン | 1596 × 2591 | 233 KB | 日英併記 (`both`) | ライト |
| `dashboard-dark.png` | 上と同じ範囲をダークモードで(`prefers-color-scheme: dark` を emulate) | 1596 × 2591 | 232 KB | 日英併記 (`both`) | ダーク |
| `dashboard-roadmap.png` | 四半期ロードマップの拡大。作業パッケージのバー・移行アーキテクチャの縦線(単独稼働できない T2 は赤) | 1557 × 592 | 124 KB | 日本語 (`ja`) | ライト |
| `dashboard-risk-matrix.png` | リスクマトリクス(レベル × 対応状況) | 1512 × 430 | 40 KB | 日英併記 (`both`) | ライト |
| `dashboard-stakeholder-matrix.png` | ステークホルダー 4 象限(影響力 × 関心度) | 1512 × 463 | 82 KB | 日英併記 (`both`) | ライト |

寸法は Retina 相当(CSS 1140px 幅 × `deviceScaleFactor` 1.4)。README に貼ると横 1140px 相当で表示されます。

### 撮り方の判断

- **「ページ全体」ではなく先頭〜ロードマップまで。** このデモ案件でのページ全長は **11,695px**
  あり、1 枚に収めると README では読めません。読み手が最初に見るべき範囲(進捗サマリと
  ロードマップ)で切っています。切った位置はタイムラインの直下、`.tl-scroll` の下端です。
- **ロードマップの拡大だけ `ja`。** `both` だと状態バッジが「進行中 / In progress」と長くなり、
  190px のラベル欄で作業パッケージ名が `WP-1 ...` まで省略されてしまいます
  (`dashboard-overview.png` の下部で実際にそうなっています)。拡大図は名前が読めることが
  主目的なので `ja` で撮りました。ダッシュボードの言語は `open_dashboard` の `lang` 引数
  (`ja` / `en` / `both`)で切り替えられます。
- **リスク/ステークホルダーのマトリクスは任意素材。** ページのかなり下にあって
  `dashboard-overview.png` には入らないため、単独で切り出してあります。README で使わなくても構いません。

## 写っているデータ(すべて架空)

製造業(産業機械部品)の**基幹刷新**案件です。**企業名・人名はすべて架空**で、実在の組織・
個人とは関係ありません。クライアント名には画面上でも `(架空の企業 / fictional company)` と
表示されます。

| 項目 | 内容 |
| --- | --- |
| 案件名 | 生産管理基幹刷新とサプライチェーン可視化 |
| クライアント | ミナカミ精密工業株式会社(架空) |
| 現在フェーズ | E(機会とソリューション)。Preliminary〜C 完了、D/E/RM 進行中 |
| 中身 | ステークホルダー 10、リスク 9、決定事項 6、アクション 10、成果物 12、作業パッケージ 11、移行アーキテクチャ 3、評価 2、メモ 5 |

案件データに機微情報・資格情報は含みません。ローカルの絶対パスは画面に出ません
(ダッシュボードの HTML は状態ファイルのパスを描画しません。`/api/state` の JSON にのみ含まれます)。

## 撮り直す手順

`npm run build` 済みであること。**ブラウザのウィンドウは一切開きません**
(`serve.mjs` が `TOGAF_EAP_NO_BROWSER=1` を自分で設定し、撮影は headless chromium です)。

```bash
cd <リポジトリのルート>

# 1. デモ案件を作る(実際の MCP ツールを scripts/mcp-cli.mjs 経由で呼ぶ)
node pic/screenshots/capture/seed-demo.mjs --data-dir /tmp/togaf-eap-demo

# 2. ダッシュボードを 2 本立てる(both と ja)。バックグラウンドで動かしたままにする
node pic/screenshots/capture/serve.mjs /tmp/togaf-eap-demo 38702 both &
node pic/screenshots/capture/serve.mjs /tmp/togaf-eap-demo 38703 ja &

# 3. 撮る(headless。pic/screenshots/ に上書き保存)
node pic/screenshots/capture/shoot.mjs

# 4. 400 KB を超えた PNG だけ 256 色に落とす
python3 pic/screenshots/capture/shrink.py

# 5. 後片付け
kill %1 %2
```

### 必要なもの

- **Playwright + chromium**: 依存には入れていません。`npm i -D playwright && npx playwright install chromium`
  で入れるか、`PLAYWRIGHT_MODULE` に `playwright/index.mjs` の絶対パスを渡してください。
  `npx playwright` を一度でも使っていれば `~/.npm/_npx` 配下から自動で拾います
  (複数バージョンが残っている場合は、chromium が実際に起動できるものを順に試します)。
- **Pillow**: `shrink.py` のみで使います。`python3 -m pip install pillow`。

### なぜ JPEG ではなく 256 色 PNG なのか

UI のスクリーンショットは細い文字が多く、JPEG では輪郭が滲むうえに**ファイルが大きくなります**。
実測(`dashboard-overview.png` 1596 × 2591):

| 形式 | サイズ |
| --- | --- |
| PNG truecolor(撮ったまま) | 617 KB |
| JPEG q92 / q88 / q82 | 737 KB / 715 KB / 629 KB |
| **PNG 256 色(採用)** | **233 KB** |

`pic/README.md` にある `sips` での縮小は、写真的な `cover.png` / `infograph.png` 向けの手順です。
スクリーンショットにはこちらを使ってください。

---

# Screenshots (English)

Real screens of the HTML dashboard, captured headlessly against the same server that
`open_dashboard` starts. Nothing is composited or mocked.

`dashboard-overview.png` and `dashboard-dark.png` cover the page from the header down to the
quarterly roadmap timeline — the full page is 11,695px tall for this engagement, which is
unreadable when embedded in a README. `dashboard-roadmap.png` is captured with `lang=ja`
because the bilingual status badges push the work package names out of the 190px label column.

All names in the demo data — company and people — are **fictional**; the client field carries a
visible `(架空の企業 / fictional company)` marker. No credentials and no local absolute paths
appear in any image.

To regenerate, follow the five steps under 「撮り直す手順」 above. Playwright and Pillow are
not project dependencies; install them separately.
