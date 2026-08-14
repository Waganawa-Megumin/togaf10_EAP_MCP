# 画像 / Images

このプロジェクトのアイコン・カバー・インフォグラフィックです。

| ファイル | 用途 | 寸法 |
| --- | --- | --- |
| `icon.jpeg` | GitHub のリポジトリアイコン(Organization/User の avatar)、配布物のアイコン | 1024 × 1024 |
| `cover.png` | カバー(原寸) | 1774 × 887 |
| `infograph.png` | インフォグラフィック(原寸) | 2752 × 1330 |
| `infograph-original.png` | 上記の**加工前**。下部に統計帯が入っている版。**リポジトリには入れていない**(外したはずの古い件数が写っているため。手元にのみ保持) | 2752 × 1536 |
| `web/cover.jpg` | README の先頭バナー、**GitHub の Social preview** 用 | 1280 × 640 / 0.16 MB |
| `web/infograph.jpg` | README 本文に埋め込む用 | 2000 × 966 / 0.40 MB |
| `web/icon-256.png` | ドキュメント内で小さく使う用 | 256 × 256 |

### 統計帯を落としてある理由

`infograph-original.png` の下部には「81 ツール / 10 ADM フェーズ / 2 言語」の帯がありました。
ツール件数は開発が進むたびに変わり、**画像の中の数字だけが古いまま残る**ため、帯ごと外しています
(件数は README 本文と `node scripts/mcp-cli.mjs tools` が常に実物を示します)。
帯の右端にあった作成ツールのウォーターマークも、この切り出しで一緒に外れています。

切り出しは上端の余白(53px)と下端の余白が揃う位置(y=1330)で行いました。
加工前の版はリポジトリに含めていないので、作り直すときは生成元から出し直したものを
`infograph-original.png` として置いてから:

```bash
cd pic
python3 -c "from PIL import Image; im=Image.open('infograph-original.png'); im.crop((0,0,im.width,1330)).save('infograph.png')"
```

### web 用の派生を作り直す

`web/` は README の表示を軽くするための派生物です。**原寸(`*.png` / `icon.jpeg`)が正**なので、
作り直すときは原寸を差し替えてから次のコマンドで再生成してください。

```bash
cd pic
sips -Z 1280 -s format jpeg -s formatOptions 88 cover.png     --out web/cover.jpg
sips -Z 2000 -s format jpeg -s formatOptions 90 infograph.png --out web/infograph.jpg
sips -Z 256  -s format png                      icon.jpeg     --out web/icon-256.png
```

## GitHub 側での設定(手作業が要るもの)

- **Social preview**(リンクを貼ったときに出るカード画像): リポジトリの
  `Settings` → `General` → `Social preview` → `Upload an image` に `web/cover.jpg` を上げる。
  **1 MB を超えると弾かれる**ので原寸の `cover.png`(1.7 MB)ではなく `web/cover.jpg` を使う。
- **リポジトリのアイコン**: GitHub のリポジトリ単位のアイコンは Organization では
  `Settings` → `Profile picture`、個人リポジトリではアカウントの avatar が使われる。
  npm に公開する場合は `package.json` の `icon` ではなく、npm 組織の avatar に `icon.jpeg` を使う。

---

# Images (English)

Project icon, cover, and infographic. Originals (`*.png`, `icon.jpeg`) are the source of truth;
`web/` holds the size-reduced derivatives embedded in the README. Regenerate them with the
`sips` commands above after replacing an original.

For the GitHub **social preview** card, upload `web/cover.jpg` (0.16 MB) — the full-size
`cover.png` exceeds GitHub's 1 MB limit.
