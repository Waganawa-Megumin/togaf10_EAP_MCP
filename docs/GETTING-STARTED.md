<a href="../README.md"><img src="../pic/web/icon-256.png" alt="" height="18" align="top"> ← README に戻る / Back to README</a> ・ <a href="./ARCHITECTURE.md">アーキテクチャ / Architecture</a>

# はじめかた / Getting Started

TOGAF を知らなくて大丈夫です。このページは「入れて、話しかけるだけ」で使い始めるための案内です。

> You do not need to know TOGAF. This page gets you from zero to a first useful answer by installing the server and simply talking to Claude.

---

## 1. これは何をしてくれるもの?

**「大きな仕組みを変える仕事」の相談相手**です。基幹システムの刷新、部門をまたぐ業務の見直し、クラウド移行、セキュリティ体制の立て直し — こういう「どこから手を付ければいいのか分からない」仕事に、**次の一手**を返します。

- 講義はしません。「今週これをやってください」を返します
- 文章の壁ではなく、**表と図**で返します
- 手元の報告書や指摘一覧を渡せば、そこから素材を拾います
- 決めたことは覚えていて、次回は「前回の続き」から話せます

> A consulting partner for large-scale change work. It answers with the next concrete action, in tables and diagrams rather than walls of prose, it can read the documents you already have, and it remembers your engagement between sessions.

**入れる前に、返ってくるものを見たい方へ** — [実際の出力例](./EXAMPLES.md) に、そのまま貼った出力が並んでいます。

---

## 2. 入れる

**先に要るもの / What you need first**

| もの | 確認のしかた | 無いとき |
| --- | --- | --- |
| MCP クライアント(**Claude Code** または **Claude Desktop**) | `claude --version` | このサーバーは単体では動きません。Claude 側から呼ばれて初めて働きます |
| **Node.js 18 以上** | `node --version` | [nodejs.org](https://nodejs.org/) から入れてください(`npm` も一緒に入ります) |
| git | `git --version` | リポジトリを ZIP で落としてもかまいません |

> You need an MCP client (Claude Code or Claude Desktop) and Node.js 18+. This server does nothing on its own — it only works when Claude calls it.

### いちばん楽な方法 — Claude に頼む

このリポジトリを手元に置いたら、Claude Code を開いて**こう言ってみてください**。

```
/path/to/togaf10_EAP_MCP にある MCP サーバーを、私の Claude Code で使えるようにして。
ビルドが要るならビルドもお願い。
```

Claude が `npm install` → `npm run build` → `claude mcp add` まで一気にやってくれます。
`/path/to/togaf10_EAP_MCP` の部分は、実際に置いた場所に書き換えてください(ドラッグ&ドロップでパスを貼ってもかまいません)。

うまくいかないときは、そのままエラーを貼って**「これ、どうすればいい?」**と聞けば直してくれます。

> The easiest install is to ask Claude to do it: paste the repository path and say "make this MCP server available in my Claude Code, and build it if needed". If it fails, paste the error back and ask what to do.

### 自分で打ちたい人向け

```bash
cd /path/to/togaf10_EAP_MCP
npm install
npm run build
claude mcp add togaf-eap -- node "$PWD/dist/index.js"
```

どのプロジェクトからでも使いたいときは `-s user` を付けます。

```bash
claude mcp add -s user togaf-eap -- node /absolute/path/to/togaf10_EAP_MCP/dist/index.js
```

Claude Desktop の場合は `claude_desktop_config.json` に追記します(設定例は [README のインストール節](../README.md#インストール))。

### 入ったか確かめる

Claude Code で `/mcp` と打つと、登録済みのサーバーが一覧されます。
もっと横着に、**こう聞いてもかまいません**。

```
TOGAF のサーバー、ちゃんと使える? 何ができるか 5 個くらい教えて。
```

> Type `/mcp` in Claude Code to see registered servers — or just ask Claude whether the TOGAF server is available and what it can do.

---

## 3. 最初の一言

このサーバーには 84 個の道具が入っていますが、**名前を覚える必要はありません**。
やりたいことを普通の日本語で言えば、Claude が適切な道具を選びます。

以下はそのまま貼って使える例文です。**あなたの状況の言葉に置き換えるほど、返ってくる中身も変わります**(このサーバーは入力の中の語を拾って見立てを変えます)。

> You never need to remember tool names. Say what you want in plain language and Claude picks the tool. The phrases below are copy-paste ready — and the more specific you make them, the more the answer changes, because the server reads the words in your input.

### 最初の 5 分 — これだけで 1 枚できます

読み進める前に、この 3 つを順に言うだけで**共有できる 1 枚**が手に入ります。所要 5 分です。

**1 つ目** — 状況を、あなたの言葉で。**箇条書きでも、愚痴まじりでもかまいません。**

```
基幹システムの刷新を任された。20 年もののCOBOL資産があって、業務側は変更に消極的。
予算はまだ決まってない。何から手を付ければいい?
```

**2 つ目** — 気に入った見立てが返ってきたら、記録を始める。

```
これ、案件として残したい。名前は「基幹システム刷新」で始めて。
対象は受注・生産・在庫。会計は対象外。
```

**3 つ目** — 1 枚にまとめてもらう。

```
今の状態を 1 枚にまとめて。そのまま資料に貼れる形で。
```

現在地・進捗・いま積み上がっているものが並んだ表が返ってきます。コピーして議事録や資料にそのまま貼れます。
続けたければ、次の一言はこれです。

```
で、今週は何をやればいい?
```

> Three sentences, five minutes: describe your situation in your own words, say "keep this as an engagement named X", then ask for it on one page. You get a table you can paste straight into a document — then ask "so what do I do this week?".

### 何から始めればいいか分からないとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `何から始めればいいか分からない。とりあえず案内して。` | 最初に決めるべき 3 つと、次に呼ぶものの順番 |
| `基幹システムの刷新を任されたんだけど、何から手を付ければいい? 20 年もののCOBOL資産があって、業務側は変更に消極的。` | 状況の見立て、着目すべき段階、使う技法、確認すべき質問 |
| `3 か月しかない小さめの案件。TOGAF のどこを省いていい?` | 使う段階／省く段階を**理由付き**で示した自社版の設計 |
| `この案件を記録として残したい。名前は「受注ポータル刷新」で始めて。` | 案件が作られ、以降の助言が「あなたの案件の状態」を見て変わる |
| `で、今週は何をやればいい?` | 優先度順の行動 3〜5 個(なぜ今か・終わりの判定・使う道具つき) |

### 手元の資料を使いたいとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `この報告書からリスクを拾って、案件に登録して。` (ファイルを添付するか、パスを伝える) | リスク・関係者・システム・要件・アクションの候補を**出典の行番号つき**で抽出 |
| `PDF なんだけど読める?` | Claude が PDF を読んで本文を渡してくれます(サーバーは PDF を開きません。詳しくは[アーキテクチャ](./ARCHITECTURE.md)) |
| `さっき抽出した候補のうち、リスクだけ実際に登録して。` | プレビューで確認してから反映(勝手には保存しません) |
| `監査の指摘一覧 CSV があるんだけど、これアーキテクチャ的にはどう読む?` | 資料をアーキテクチャ観点で読む筋道と、該当箇所 |

### 人の問題を整理したいとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `関係者の利害を整理したい。営業と生産が対立してる。` | 影響力 × 関心度の 4 象限と、象限ごとの関与方針 |
| `関係者を登録するので、あとで象限に並べて。営業本部長(影響力 高／関心 高、納期回答が遅れると失注する)、生産管理部長(影響力 高／関心 中、現場の手順を変えたくない)…` | 登録 → マトリクス。関心事の未記入や、**全員が「最重要」に寄っている状態は「指摘」として出ます** |
| `うち、過去に 2 回失敗してるんだけど、今度は大丈夫か見てほしい。` | 変革準備度の評価(因子を出してくれるので、点を付けて返すだけ) |
| `この案件、危ないところない?` | 健全性チェック(スポンサー不在、期限切れ、担当者のいない重大リスクなど) |

### 説明・報告したいとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `経営会議で 1 枚で説明したい。` | 経営層向けの話す順序、最初の 1 文、使う単位、避けること、用語の言い換え表 |
| `同じ内容を、現場のエンジニア向けにも言い換えて。` | 相手を変えた版(**中身が変わります**。見出しだけの違いではありません) |
| `今の進捗を 1 枚にまとめて。` | コピペできる Markdown のダッシュボード |
| `ダッシュボードをブラウザで開いて。` | ローカルのブラウザ画面。作業を進めると**自動で更新**されます |
| `先週から何が動いた? 逆に止まってるものは?` | 動いたもの／**止まっているもの**の一覧(後者が本命) |

### 図がほしいとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `関係者の図を描いて。` | 4 象限の図(Mermaid。そのまま資料に貼れます) |
| `ロードマップをガントチャートにして。` | 四半期のガント(移行の節目はマイルストーンとして表示) |
| `経営層に、どのシステムがどの業務を支えているか見せたい。どんな図を描けばいい?` | 描くべき図の提案と、**この図に描かないもの** |
| `現行と目標を並べて、差分を出して。` | 対応マトリクスと差分一覧(**廃止されるものも必ず出ます**) |

### 道具の選び方に迷ったとき

| こう言ってみてください | 返ってくるもの |
| --- | --- |
| `業務プロセスを整理して、どこを自動化するか決めたい。何を使えばいい?` | TOGAF のどこを使い、どの周辺の道具(BPMN など)を併用するか、優先順位つき |
| `社外向けポータルを作る。セキュリティは何から考える?` | 信頼境界の引き方、資産 × 脅威観点の表、まず着手すべき 1 観点 |
| `Archi に取り込みたい。` | Archi が読める形式で書き出し |

---

## 4. 会話の流れの例

「最初の 5 分」の続きです。**1 往復で終わらせず、返ってきた内容に反応するのがコツ**です。

```
あなた: 基幹システムの刷新を任された。20 年もののCOBOLで、業務側は変更に消極的。
        何から手を付ければいい?

Claude: (状況の見立て、着目すべき段階、使う技法、関係者に聞くべき質問を返す)

あなた: なるほど。案件として残したい。「基幹システム刷新」で始めて。
        対象は受注・生産・在庫。会計は対象外。

Claude: (案件を作成、現在地と進捗を表示)

あなた: 関係者を入れる。営業本部長は影響力も関心も高い。生産管理部長は影響力は高いけど
        関心は中くらい。情報システム部長は影響力中・関心高。経理部長は両方低い。

Claude: (登録 → 4 象限に配置。境界線上の人には印が付き、判定ルールも示される)

あなた: で、今週は何をやればいい?

Claude: (優先度順に「これをやる／なぜ今か／終わりの判定」を返す)

あなた: 1 番目のやつ、経営会議で説明する用に 1 枚にして。

Claude: (経営層向けの構成と言い換え表を返す)
```

> Keep going after the first answer. Each turn narrows the advice, because the server reads the state you have actually recorded.

---

## 5. 困ったときの言い方

| 状況 | こう言ってみてください |
| --- | --- |
| **返ってくる量が多すぎる** | `日本語だけでいい。表だけ、上位 5 件で。`(この 3 つの指定が効きます — 言語・分量・件数) |
| **日本語と英語が両方出て読みにくい** | `以降は日本語だけで返して。` |
| **英語で返してほしい** | `Answer in English only from now on.` |
| 相手に合わない | `さっきの内容、経営層向けに言い換えて。` / `現場向けにして。` |
| 本当か不安 | `一次情報も確認して。この説明の出どころはどこ?` |
| 用語が分からない | `いまの「ベースライン」って何のこと? 普通の言葉で。` |
| 情報が古くないか気になる | `この知識ベース、いつ時点のもの? 何を持ってて何を持ってないの?` |
| そもそも何ができるか忘れた | `このサーバーで何ができるか、私の状況に合わせて 5 個挙げて。` |
| 話が発散した | `いったん整理して。今の案件の状態を 1 枚で見せて。` |
| 前回の続きから始めたい | `前に相談してた案件、どうなってたっけ?` |
| 案件を複数持ちたい | `別の案件も並行で持ちたい。「工場IoT」を新しく作って。` |

**言語について。** このサーバーは既定で**日本語と英語を並べて**返します。片方だけでよければ、上のように一度言えば以降その言語だけになります。ただし**あなたが入力した案件名・関係者名・スコープは翻訳されません**(そのまま保存された値を表示するため)。

**量について。** 案件が育つと 1 枚が長くなります。ダッシュボードは自動で上位だけに絞りますが、`全件見せて` で全部、`上位 3 件で` で更に短くできます。

> The server answers in Japanese *and* English by default; say "Japanese only" or "English only" once and it sticks. Your own data — engagement names, stakeholder names, scope — is shown as you typed it and is never translated. If the output is long, ask for the top N rows, or say "show me everything" to switch trimming off.

---

## 6. 覚えておくと気が楽なこと

**1. 勝手には保存しません。**
資料から拾った候補は、まずプレビューとして出ます。「これを登録して」と言うまで案件には入りません。

**2. 出てくるものは「草案」です。**
関係者の重要度、リスクのレベル、脅威の一覧 — いずれも機械が仮に置いた値です。そのまま使わず、必ず人の目で確かめてください。サーバー自身もそう書いて返します。

**3. 原文は持っていません。**
このサーバーは TOGAF や ArchiMate の**本文を持っていません**(複製が許諾されていないためです)。持っているのは名称・構造という事実と、独自の解説だけ。「標準に何と書いてあるか」を正確に知りたいときは、`一次情報も確認して` と言えば、見るべき公式ページを教えてくれます。

**4. 状態はあなたの手元に残ります。**
案件は `~/.togaf-eap/` に JSON で保存されます。どこかに送信されることはありません。

**5. 使えるのは個人利用の範囲までです。**
このページの例文は仕事の場面ばかりですが、ライセンスは**個人的・非商用の利用のみ**を許可しています。会社や組織の業務での利用、営利目的の利用、商用サービスへの組み込みには、**著作権者の事前の書面による許可が必要**です(AI / 機械学習モデルの学習への利用も禁止)。勤務先で使う前に [LICENSE.md](../LICENSE.md) を読んでください。

> Note the license before you use this at work: it permits **personal, non-commercial use only**. Business use by a company or organization, for-profit use, and incorporation into commercial services all require prior written permission, and using the Work to train AI/ML models is prohibited. See [LICENSE.md](../LICENSE.md).

> Nothing is saved without you saying so; everything it produces is a draft for a human to check; it holds no source text from the standards, only names, structure, and original commentary; and your engagement data stays on your machine.

---

## 7. うまく動かないとき

### つながらないとき

順に確認してください。だいたい 1 つ目か 2 つ目で見つかります。

```bash
# 1. 登録されているか(接続状態も一緒に出ます)
claude mcp list

# 2. サーバー本体が起動するか
cd /path/to/togaf10_EAP_MCP && node dist/index.js < /dev/null
# → [togaf10-eap-mcp] v0.2.0 ready on stdio と出て終われば、サーバー側は正常
```

- `dist/index.js` が無い、または起動しない → `npm install && npm run build` をやり直す
- `claude mcp list` に出ない → `claude mcp add` をやり直す。パスは**絶対パス**にする(相対パスだと別のフォルダから起動したときに見つかりません)
- 出ているのに使われない → 名前で指名すると確実です: `togaf-eap のツールを使って、いまの案件の状態を見せて。`
- それでも駄目なら、`claude mcp list` の出力をそのまま貼って `これ、どうすればいい?` と聞くのが最短です

> `claude mcp list` shows registration *and* connection state; `node dist/index.js < /dev/null` proves the server itself starts. Always register with an absolute path.

### そのほか

| 症状 | 見るところ |
| --- | --- |
| 「案件がまだ無いので、状態から助言できません」と言われる | そのとおり、まだ案件を作っていないだけです。`案件を作って。名前は「◯◯」で。` と言えば作られます |
| 入力の項目名が違うと言われた | このサーバーは**綴り違いを黙って無視せず、その場でエラーにします**(間違いに気付かないまま空の結果を受け取るほうが困るからです)。そのまま `もう一度やって` で通ります |
| ファイルが読めない | 読めるのは**作業ディレクトリ配下・ホーム配下・データディレクトリ配下**だけです。`.` で始まる隠しフォルダは読みません。それ以外の場所にあるファイルは、Claude に読ませて本文を渡してもらってください |
| PDF や Excel を渡したい | Claude 側で開いて本文を渡してもらいます。「この PDF 読んで、中身を TOGAF のサーバーに渡して」と言えば通ります |
| ダッシュボードが開かない | ブラウザが自動起動しない環境では URL が返るので、手で開いてください |
| Archi への書き出しで一部だけ落ちた | **落ちた分は理由付きで一覧されます**(例: 関係の相手先の名前が要素と一致しない)。名前を直してもう一度書き出せば通ります |
| 何かのエラーが出た | そのエラー文をそのまま貼って `これ、どうすればいい?` と聞くのが最短です |

> The same list in English. *"There is no engagement yet, so I cannot advise from state"* is not a fault — say `Create an engagement called "…"` and it appears. A complaint about an input field means a misspelled argument: this server rejects unknown keys loudly rather than returning an empty result, so just say `try that again`. A file that cannot be read is almost always outside the allowed roots — the working directory, your home directory, and the data directory — or inside a dot-folder, which is never read; have Claude read it and pass the text instead, which is also how PDF and Excel go in. If the dashboard does not open, the URL is returned for you to open by hand. A partial ArchiMate export lists every dropped relationship with its reason (usually a source or target name that matches no element) — fix the names and export again. For anything else, paste the error text and ask what to do.

---

## 次に読むもの

- [実際の出力例](./EXAMPLES.md) — 各ツールが実際に何を返すか(貼り付けそのまま)
- [Start 画面](./START-SCREEN.md) — PDF や画像を渡すのが面倒なときの、任意の入口
- [アーキテクチャ解説](./ARCHITECTURE.md) — このサーバーがどう作られているか、なぜそう作ったか
- [README](../README.md) — ツール 87 件の一覧、設定、ライセンス
