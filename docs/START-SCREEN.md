<a href="../README.md"><img src="../pic/web/icon-256.png" alt="" height="18" align="top"> ← README に戻る / Back to README</a> ・ <a href="./GETTING-STARTED.md">はじめかた / Getting Started</a> ・ <a href="./EXAMPLES.md">出力例 / Examples</a>

# Start 画面 / The Start Screen

資料を渡すのが面倒なときの**お助け画面**です。**使わなくても全機能が使えます。**

> A browser page for handing over your question and your files when typing them into the chat is awkward. **It is optional — every feature of this server works without it.**

![Start 画面 / The Start screen](../pic/screenshots/start-screen.png)

---

## 1. 何のための画面か / What it is for

Claude Code のチャット欄に PDF を何枚も渡したり、社内資料をコピペしたりするのは面倒です。この画面は、**ブラウザから相談内容とファイルをまとめて置いておく場所**です。

> Dropping several PDFs into a chat prompt, or pasting long internal documents, is fiddly. This page is a place to put the question and the files in one go, from a browser.

| これは | これではない |
| --- | --- |
| 資料の**受け渡し口**。投げやすさだけを担当する | 分析ツールではない。ここでは何も解析されない |
| **任意**。使わなくてよい | 必須ではない。ファイルパスを会話で伝えるだけでも同じことができる |
| ダッシュボードと**同じサーバー・同じポート**に相乗り | 別サービス・別ポートではない |

> **It is** a hand-over slot, and nothing more. **It is not** an analyser, it is **not required**, and it does **not** open a second port.

使わない場合は、これまで通り「`/Users/me/docs/現行構成.pdf` を読んで」と会話でパスを伝えれば同じことができます。Start 画面は**その一手間を減らすだけ**のものです。ファイルが 1 つなら、正直パスを打つほうが速いこともあります。効いてくるのは、**資料が何枚もあるとき**と、**スクリーンショットを貼り付けたいとき**([4.2](#42-投げる--hand-things-over))です。

> Without it you simply tell Claude a path in the chat. The Start screen only saves you that step — for a single file, typing the path is often faster. It pays off with several documents at once, and with screenshots, which have no path to type.

---

## 2. 流れ / How it flows

```mermaid
flowchart TD
    U["利用者 / You"]
    B["ブラウザの Start 画面<br/>http://127.0.0.1:PORT/start"]
    S["MCP サーバー<br/>預かるだけ / stores only"]
    D["ディスク<br/>dataDir/intake/"]
    C["Claude Code<br/>読む・判断する / reads and decides"]
    E["案件データ / Engagement"]
    V["ダッシュボード<br/>SSE で即座に更新"]

    U -->|"相談文 + ファイルを投げる"| B
    B -->|"POST /api/intake"| S
    S -->|"保存 / store"| D
    U ==>|"スタート画面に入れたものを見て"| C
    C -->|"check_intake"| S
    S -->|"本文 + 添付の絶対パス"| C
    D -.->|"Claude 自身の読み取りツールで開く"| C
    C -->|"ingest_document / update_engagement"| E
    C -->|"mark_intake_done"| S
    E --> V
    S -.->|"未処理 → 処理済み"| B
```

太い矢印(**利用者 → Claude Code**)が要です。ここが人手です。理由は次章にあります。

> The thick arrow — you telling Claude to look — is the manual step. The next section explains why it cannot be automated.

---

## 3. 正直な制約 / The honest limitation

**このサーバーには LLM がありません。そして、サーバーから Claude を起動することもできません。**

> **There is no LLM inside this server, and the server cannot call Claude.**

MCP はホスト(Claude Code / Claude Desktop)がサーバーを呼ぶ向きの通信で、逆向きはありません。だからこの画面にファイルを落としても、**サーバー側では誰もそれを読みません**。保存されるだけです。

> MCP runs one way: the host calls the server. There is no reverse channel. So a file dropped here is stored and nothing else happens on the server side.

つまり:

| 担当 | やること | やらないこと |
| --- | --- | --- |
| **Start 画面** | 相談文とファイルを預かる | 読まない・解析しない |
| **サーバー** | 保存する・状態を持つ・画面を描く | 中身を理解しない・Claude を呼ばない |
| **Claude** | PDF も画像も**読む**。判断して案件に登録する | 投げられたことに自動では気付かない |

**投げたあと、会話で一言かけてください。** 画面にもそう書いてあります。この一手間を隠すと「投げたのに何も起きない」という体験になるので、はっきり書いておきます。

> **After submitting, say something in the chat.** The page says so too. Nothing happens until you ask.

---

## 4. 使い方 / Using it

### 4.1 開く / Open it

会話で開きます。ツール名を覚える必要はありません。

> Just ask. You never need to type a tool name.

> 「スタート画面を開いて」
>
> *"Open the start screen"*

`open_start` が走り、`http://127.0.0.1:<ポート>/start` が開きます。ポートは既定では**空きポートの自動割り当て**なので、毎回同じとは限りません(固定したい場合は [8 章](#8-環境変数--environment-variables))。

> That runs `open_start` and opens `http://127.0.0.1:<port>/start`. The port is auto-assigned unless you pin it.

### 4.2 投げる / Hand things over

画面で相談内容を書き、ファイルをドロップして「**預ける / Hand over**」を押します。ドロップのほか、枠をクリックして選ぶ / **スクリーンショットを ⌘V(Ctrl+V)で貼り付ける**こともできます。

> Type the question, drop the files, press **Hand over**. You can also click the box to pick files, or **paste a screenshot with ⌘V / Ctrl+V**.

**貼り付けはこの画面にしかできません。** クリップボードの画像にはパスが無いので、会話にパスを打つやり方では渡せません。「一度ファイルに保存してからパスを伝える」手間が消えるのは、この画面を使う一番はっきりした利点です(貼り付けた画像は `pasted-<日時>.png` という名前で保存されます)。

> **Pasting is the one thing the chat cannot do.** A clipboard image has no path, so without this page you would have to save it to a file first and then type the path. Pasted images are stored as `pasted-<timestamp>.png`.

### 4.3 声をかける / Ask Claude to look

**ここが必須の一手間です。** 画面にも同じ文言がボタン付きで出ています。

> **This step is required.** The page shows the same sentence with a copy button.

> 「スタート画面に入れたものを見て」
>
> *"Look at what I put in the start screen"*

これで Claude が `check_intake` を呼び、本文と**添付の絶対パス**を受け取ります。添付は Claude が自分の読み取りツールで開きます(PDF も画像も読めます)。

> Claude then calls `check_intake` and gets the text plus the **absolute paths** of the attachments, which it opens with its own file-reading tools.

### 4.4 そのまま話しかける例文 / Copy-paste phrases

そのまま貼って使えます。

| 言うこと | 起きること |
| --- | --- |
| 「スタート画面を開いて」 | `open_start` — 画面が開き、URL が返る |
| 「スタート画面に入れたものを見て」 | `check_intake` — 本文と添付パスを受け取る |
| 「スタート画面の資料を読んで、案件に取り込んで」 | `check_intake` → 添付を読む → `ingest_document` / `update_engagement` |
| 「未処理の預かりを全部片付けて、ダッシュボードを見せて」 | `check_intake` → 取り込み → `mark_intake_done` → `open_dashboard` |
| 「さっき投げた PDF だけもう一度見て」 | `check_intake`(`id` 指定または `status="done"`)で読み直す |

> The same five, in English:
> *"Open the start screen"* / *"Look at what I put in the start screen"* / *"Read the material in the start screen and fold it into the engagement"* / *"Process everything pending and show me the dashboard"* / *"Take another look at the PDF I handed over earlier"*

### 4.5 未処理 / 処理済み / Pending and done

画面の下半分「**預かっているもの / Handed over so far**」に、預けたものが状態つきで並びます。

> The lower half of the page lists what you handed over, with its state.

| 表示 | 意味 |
| --- | --- |
| **未処理 / Not read yet**(オレンジ) | まだ Claude が受け取っていない。声をかけてください |
| **処理済み / Read**(緑) | Claude が受け取り、`mark_intake_done` を呼んだ。「Claude のメモ」が付くこともある |

Claude が別プロセスで `mark_intake_done` を呼んでも、**画面は開いたまま自動で切り替わります**(SSE + `fs.watch`)。再読み込みは要りません。

> The page flips from pending to done on its own — over SSE, even when the change came from a different process. No reload needed.

---

## 5. 使える 3 つのツール / The three tools

会話で使うぶんには覚える必要はありませんが、正確な名前と引数は次のとおりです。

> You never have to type these, but here they are exactly.

| ツール | 引数 | 何をするか |
| --- | --- | --- |
| `open_start` | `lang`, `open`(既定 `true`) | Start 画面を開き、URL・預かり箱のパス・現在の件数を返す |
| `check_intake` | `lang`, `status`(`pending` / `done` / `all`、既定 `pending`), `limit`(1〜50、既定 `10`), `id` | 預かったものを取り出す。**本文は引用ブロック、添付は絶対パス**で返る |
| `mark_intake_done` | `lang`, `ids`(配列), `all`(既定 `false`), `status`(`done` / `pending`、既定 `done`), `note`(500 文字まで) | 処理済みにする(`status="pending"` で差し戻し)。`note` は画面に残る |

`check_intake` は添付の**中身を返しません**。パスだけを返し、読むのは Claude です。これは意図した設計で、サーバーが PDF を解釈できないことを隠さないためです。

> `check_intake` returns paths, never contents. That is deliberate: the server cannot parse a PDF and does not pretend to.

---

## 6. 預かったものの置き場所 / Where things are stored

```
<dataDir>/intake/
├── index.json                       … 索引(相談文・状態・添付の一覧)
└── files/
    └── <預かりID>-<連番><拡張子>    … 添付の実体
```

既定の `<dataDir>` は `~/.togaf-eap` なので、既定の置き場所は `~/.togaf-eap/intake/` です。実際のパスは `open_start` と `check_intake` の出力に必ず載ります。

> Default location: `~/.togaf-eap/intake/`. Both tools always print the real path.

**保存名はサーバーが決めます。** 元のファイル名はあくまで表示用で、パスとしては一切使いません(`../` などを含む名前を送られても無害)。

> **The server picks the stored filename.** The original name is display-only and never used as a path.

### 消し方 / Removing what you handed over

| やりかた | コマンド / 操作 |
| --- | --- |
| 全部消す | `curl -X POST http://127.0.0.1:<ポート>/api/intake/clear` |
| 1 件だけ消す | `curl -X POST http://127.0.0.1:<ポート>/api/intake/delete -H 'content-type: application/json' -d '{"id":"in-..."}'` |
| 手で消す | `rm -rf ~/.togaf-eap/intake`(サーバーは次回自動で作り直します) |

どの方法でも**添付の実体まで消えます**(索引だけ残ることはありません)。`mark_intake_done` は状態を変えるだけで、**消しません**。

> All three delete the stored files as well, not just the index entry. `mark_intake_done` only changes the state — it never deletes.

保持は**最新 200 件**まで。超えた分は古いものから、添付の実体ごと自動で捨てられます。

> At most 200 records are kept; older ones are dropped along with their files.

---

## 7. 受け付ける形式と上限 / Accepted files and limits

実装の値をそのまま載せています(`GET /api/intake` が同じ値を返すので、いつでも確認できます)。

> Taken straight from the implementation. `GET /api/intake` reports the same numbers.

### 拡張子 / Extensions (16)

```
.pdf  .txt  .md  .csv  .tsv  .json  .html  .htm
.png  .jpg  .jpeg  .gif  .webp  .docx  .xlsx  .pptx
```

**許可リスト方式**です。これ以外は `415` で明確に断ります。実行可能形式と圧縮ファイル(`.zip` など)は**意図的に入れていません** — 預かったものを**開かない・展開しない・実行しない**という方針だからです。

> Allow-list, not deny-list. Anything else is refused with `415`. Executables and archives are deliberately absent: stored files are never opened, unpacked, or run.

### 上限 / Limits

| 何 | 上限 | 超えたとき |
| --- | --- | --- |
| 1 ファイル | **25 MB**(26,214,400 バイト) | `413 file-too-large` |
| 1 回の投稿(合計) | **50 MB**(52,428,800 バイト) | `413 payload-too-large` |
| 1 回の投稿の件数 | **20 件** | `413 too-many-files` |
| 相談本文 | **100,000 文字** | 切り詰めて印を付ける |

**1 件でも上限や拡張子に引っかかると、その投稿は何も保存されません。** 一部だけ入って気付かない、という状態を避けるためです。

> If any one file fails a check, **nothing from that submission is stored** — no silent partial intake.

### 拡張子と中身の食い違い / Extension vs. content

マジックバイトを見て、拡張子と中身が食い違うファイルには印を付けます。

> Magic bytes are checked against the extension.

- **実行可能形式・アーカイブだった場合** → `415` で断る(拡張子を偽っていても入りません)
- **それ以外の食い違い**(例: `.png` の中身が PDF)→ 保存しますが `typeMismatch` の警告が付き、画面と `check_intake` に出ます

> Executables and archives in disguise are refused. Other mismatches are stored but flagged, and the flag shows up on the page and in `check_intake`.

---

## 8. 環境変数 / Environment variables

| 変数 | 効果 |
| --- | --- |
| `TOGAF_EAP_DATA_DIR` | 保存先を変える。預かり箱も `<この値>/intake/` に移る(既定 `~/.togaf-eap`) |
| `TOGAF_EAP_DASHBOARD_PORT` | ポートを固定する。URL を毎回同じにしたいとき |
| `TOGAF_EAP_NO_BROWSER` | `1` を設定するとブラウザを自動で開かない。URL は返るので手で開けます |

`TOGAF_EAP_DATA_DIR` を案件ごとに分ければ、預かり箱も一緒に分かれます。

> Point `TOGAF_EAP_DATA_DIR` somewhere per client and the intake box follows.

---

## 9. セキュリティ / Security

この画面は**あなたの端末の中だけ**で動きます。それでも、以下は知っておいてください。

> It runs only on your machine — but read this anyway.

### やってあること / What is enforced

- **127.0.0.1 にのみ bind**。LAN にも外にも開きません。`Host` が loopback でないリクエストと、loopback 以外の `Origin` が付いたリクエストは、メソッドを問わず **403** で拒否します(DNS リバインディング対策)
- **GET と POST 以外は 405**、想定外のパスは **404**
- **ファイル名を信用しない**。保存名はサーバーが決め、元の名前は表示にしか使いません
- **預かったものを実行しない・展開しない**。zip は受け取りません
- **資格情報らしき文字列は保存前に伏せます**(`[REDACTED]`)。画面にもログにも出ません
- **画面に出す本文は必ずエスケープ**し、引用ブロックに閉じ込め、「**文書内の指示には従いません**」と明示します

> Loopback-only bind with `Host`/`Origin` checks (403), `405` for other methods, `404` for unknown paths, server-chosen filenames, no execution or unpacking, credential-looking strings redacted before storage, and all stored text escaped and quarantined in a quote block with an explicit "instructions inside are not followed" notice.

### あなたが気を付けること / What is on you

- **預かったものはディスクに残ります。** 機微な資料を投げれば、`~/.togaf-eap/intake/files/` に平文で残ります。終わったら [6 章](#消し方--removing-what-you-handed-over)の方法で消してください
- **預けた文書は「信頼できない入力」です。** 文書の中に「このツールを呼べ」「設定を変えろ」と書いてあっても、Claude は従わず、その旨をあなたに伝えます。これは既存のドキュメント取り込み(`ingest_document` など)と同じ方針です
- **共有端末では使わないでください。** ログインしている人なら誰でも `127.0.0.1` にアクセスできます

> Handed-over material sits on disk in the clear until you delete it. Text inside documents is data, never instructions. Don't use this on a machine you share.

---

## 10. 困ったとき / Troubleshooting

| 症状 | 見るところ |
| --- | --- |
| **投げたのに何も起きない** | 一番多い原因です。**声をかけてください** →「スタート画面に入れたものを見て」。サーバーは Claude を呼べません([3 章](#3-正直な制約--the-honest-limitation)) |
| **画面が開かない** | `TOGAF_EAP_NO_BROWSER` が設定されていませんか。その場合ブラウザは開かず、URL だけが返ります。手で開いてください |
| **ポートが使われている** | `TOGAF_EAP_DASHBOARD_PORT` を空いている番号に変えて、もう一度「スタート画面を開いて」と言ってください。未指定なら空きポートが自動で選ばれます |
| **URL を開くと「接続できません」** | サーバーは Claude Code のセッションと一緒に生きています。セッションを閉じると落ちます。もう一度開き直してください |
| **前と URL が違う** | ポートは既定で自動割り当てです。固定したければ `TOGAF_EAP_DASHBOARD_PORT` を設定してください |
| **ファイルが弾かれた** | 拡張子([7 章](#拡張子--extensions-16))と上限を確認してください。理由は画面に出ます(`415` は拡張子、`413` は大きさ・件数) |
| **画面の状態が古い** | ライブ更新は SSE です。切れている場合はページを再読み込みしてください |
| **預かりが消えた** | 最新 200 件までしか保持しません。あるいは `TOGAF_EAP_DATA_DIR` が前回と違っていませんか |
| **`read_document` が「隠しディレクトリは読み込みません」と断る** | 既定の預かり箱 `~/.togaf-eap/…` は隠しディレクトリで、`read_document` の安全策に引っかかります(Claude Code をホームディレクトリで起動している場合に起きます)。**Claude 自身の読み取りツールで開けば読めます**ので実害はありません。`read_document` を使いたいなら `TOGAF_EAP_DATA_DIR` を `~/togaf-eap` のような隠しでない場所に変えてください |

---

## 11. HTTP の中身 / The endpoints, for the curious

ダッシュボードと同じサーバーです。ポートは増えません。

> Same server as the dashboard. No extra port.

| メソッド | パス | 何を返すか |
| --- | --- | --- |
| `GET` | `/` | ダッシュボード HTML |
| `GET` | `/start` | Start 画面 HTML |
| `GET` | `/api/state` | 現在の案件 JSON |
| `GET` | `/api/intake` | 預かり一覧・件数・許可拡張子・上限の JSON |
| `POST` | `/api/intake` | 預ける(multipart / JSON / urlencoded / text)。成功は `201` |
| `POST` | `/api/intake/clear` | 全消し |
| `POST` | `/api/intake/delete` | 1 件消す(`{"id": "..."}`) |
| `GET` | `/events` | SSE。`kind` は `"state"` か `"intake"` |
| `GET` | `/health` | 死活確認 |

手で試すなら:

```bash
curl -sS http://127.0.0.1:<ポート>/api/intake | python3 -m json.tool
curl -sS -X POST http://127.0.0.1:<ポート>/api/intake \
  -F 'text=基幹刷新の相談です' \
  -F 'files=@./現行構成.pdf'
```

---

## 次に読むもの / What to read next

- [はじめかた / Getting Started](./GETTING-STARTED.md) — 入れ方と、最初に何と言えばいいか
- [実際の出力例 / Examples](./EXAMPLES.md) — 各ツールが実際に何を返すか
- [アーキテクチャ / Architecture](./ARCHITECTURE.md) — なぜサーバーが「読まない」設計なのか
- [README](../README.md) — ツール一覧、設定、ライセンス

---

<sub>☕ このツールでステークホルダー表を作る午後が浮いたなら、[Ko-fi](https://ko-fi.com/shonanboyeah) で開発を応援できます(もちろん任意です)。<br>
If this saved you an afternoon of stakeholder spreadsheets, you can support development on [Ko-fi](https://ko-fi.com/shonanboyeah) — entirely optional.</sub>
