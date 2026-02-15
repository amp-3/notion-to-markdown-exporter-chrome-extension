# Notion to Markdown Exporter

NotionページをMarkdown + 画像・動画のZIPファイルとしてエクスポートするChrome拡張機能

## 対応範囲

Markdownの一部の構文とNotionの折りたたみ、画像、動画の埋め込みに対応しています。  
その他のNotion固有のブロックには対応していませんのでご了承ください。  

動画プレイヤーはVS Code（Cursor）のMarkdown Previewで再生できることを確認しています。  
GitHubのMarkdownプレビューでの動画再生には対応していません。  

動作確認はWindows環境で行っています。  

## 主な特徴

- 複数のNotionページを一括でMarkdownファイルに変換してZIPで取得可能
- 画像と動画のダウンロード 及び 相対パスの紐づけに対応
- Notionの折りたたみブロックをMarkdownの折りたたみ形式に変換
- Chrome拡張のローカル処理で完結、APIキーを必要としない
  - Notionの仕様変更で正常に動作しなくなる可能性あり

## インストール

1. このリポジトリの `notion-to-markdown` フォルダをローカルに用意する
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `notion-to-markdown` フォルダを選択する

## 使い方

1. Notionページをブラウザで開く（ログイン済みであること）
2. ツールバーの拡張アイコンをクリック
3. エクスポートオプションを必要に応じて設定する
4. エクスポートしたいページのURLをテキストエリアに入力する
   - 「開いているページのURLを追加」ボタンでアクティブタブのURLを自動追加できる
   - 複数ページを一括エクスポートする場合は1行に1URLずつ入力する
5. 「一括エクスポート」ボタンを押す
6. 処理完了後、ZIPファイルのダウンロードダイアログが表示される

### エクスポートオプション

| オプション | 説明 |
|---|---|
| 画像ファイルを含む | 画像をZIPにダウンロードしてMarkdown内で相対パス参照する |
| 動画ファイルを含む | 動画をZIPにダウンロードしてMarkdown内で相対パス参照する |
| 画像へのリンクを含む | 画像をダウンロードしない場合にMarkdown内へ元URLリンクを記載する |
| 動画へのリンクを含む | 動画をダウンロードしない場合にMarkdown内へ元URLリンクを記載する |

## 出力形式

### 1ページエクスポート時

```
[ページタイトル]_YYYYMMDD_HHMMSS.zip
├── [ページタイトル].md
└── _resources/
    ├── image_001.png
    ├── image_002.jpg
    └── video_001.mp4
```

### 複数ページ一括エクスポート時

```
notion_batch_export_YYYYMMDD_HHMMSS.zip
├── [ページタイトル1]/
│   ├── [ページタイトル1].md
│   └── _resources/
│       ├── image_001.png
│       └── video_001.mp4
└── [ページタイトル2]/
    ├── [ページタイトル2].md
    └── _resources/
        └── image_001.jpg
```

Markdown内では `_resources/image_001.png` のように相対パスで画像・動画を参照する。ZIPを展開すればそのままMarkdownビューアで画像付き閲覧が可能。

## 対応ブロックタイプ

| Notionブロック | Markdown変換結果 |
|---|---|
| 見出し1 / 2 / 3 | `#` / `##` / `###` |
| 段落 | テキスト |
| 箇条書きリスト | `- テキスト` |
| 番号付きリスト | `1. テキスト` |
| ToDoリスト | `- [x]` / `- [ ]` |
| トグル（折りたたみ） | `<details><summary>...</summary>...</details>` |
| コードブロック | ` ```lang ... ``` ` |
| 引用 | `> テキスト` |
| 区切り線 | `---` |
| コールアウト | `> アイコン テキスト` |
| 画像 | `![alt](_resources/filename)` |
| 動画 | `![video](_resources/filename)` |
| テーブル | Markdownテーブル形式 |
| 埋め込み | `[embed](URL)` |
| ブックマーク | `[タイトル](URL)` |
| 数式 | `$$数式$$` |
| カラム | 縦並びに変換 |

### インラインスタイル

| スタイル | Markdown |
|---|---|
| 太字 | `**テキスト**` |
| イタリック | `*テキスト*` |
| 取り消し線 | `~~テキスト~~` |
| インラインコード | `` `テキスト` `` |
| リンク | `[テキスト](URL)` |
| 下線 | `<u>テキスト</u>` |

## ファイル構成

```
notion-to-markdown/
├── manifest.json               # Manifest V3 拡張設定
├── popup/
│   ├── popup.html              # ポップアップUI
│   └── popup.js                # URLリスト・一括エクスポート制御
├── content/
│   ├── constants.js            # 共有定数
│   ├── blockParser.js          # Notionブロック → Markdown変換
│   ├── resourceCollector.js    # 画像・動画の収集・ダウンロード
│   ├── markdownBuilder.js      # Markdown文字列組み立て・URL置換
│   └── content.js              # メインコントローラー
├── background/
│   └── service-worker.js       # ZIPダウンロード・CORS代理fetch・一括エクスポート
├── lib/
│   └── jszip.min.js            # JSZip v3.x（ZIP生成ライブラリ）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 処理フロー

1. ポップアップで対象URLをテキストエリアに入力し「一括エクスポート」ボタンをクリック
2. Service Workerがバックグラウンドタブを作成し、URLを順次読み込む
3. Content Scriptを注入して各ページの処理を開始
4. ページ末尾まで自動スクロール（遅延読み込みコンテンツのロード）
5. 全折りたたみブロックを展開
6. ページ本文のDOM要素を走査しMarkdownに変換
7. 画像・動画をfetchでダウンロード（CORS失敗時はService Worker経由でフォールバック）
8. Markdown内のURLを `_resources/` 相対パスに書き換え
9. 全ページのデータをJSZipで統合してZIP生成・ダウンロード

## 技術仕様

| 項目 | 技術 |
|---|---|
| マニフェスト | Manifest V3 |
| ZIP生成 | JSZip v3.x |
| DOM解析 | Content Script（vanilla JS） |
| 画像・動画取得 | fetch API + Service Worker フォールバック |
| ダウンロード | chrome.downloads API |

### 権限

| 権限 | 用途 |
|---|---|
| `activeTab` | アクティブタブURLの取得 |
| `tabs` | バックグラウンドタブの作成・操作（一括エクスポート） |
| `scripting` | Content Scriptの動的注入（一括エクスポート） |
| `downloads` | ZIPファイルのダウンロード |
| `host_permissions` (notion.so等) | NotionページのDOMアクセス |
| `host_permissions` (S3) | Notionがホストする画像・動画のfetch |

## エラーハンドリング

| 状況 | 対応 |
|---|---|
| Notionページ以外のURLを入力 | バリデーションエラーをポップアップに表示 |
| 折りたたみ展開タイムアウト | 最大10回試行後、その時点の状態で変換続行 |
| 画像・動画のfetch失敗 | スキップし、Markdown内にHTMLコメントで記録 |
| 50MBを超えるリソース | スキップ（リンクのみ記載） |
| 未対応ブロックタイプ | テキスト内容を段落として出力し、HTMLコメントで注記 |
| 長大ページの遅延読み込み | 自動スクロール（最大50回・約25秒）で全ブロックをロード |
| 一括エクスポートで一部ページ失敗 | 失敗ページをスキップして残りのページを処理続行 |
| Notionコンテンツ描画タイムアウト | 30秒待機後にエラー |

## 制約事項

- **DOM解析ベース**: Notion APIは使用していない。Notionの内部DOM構造の変更により動作しなくなる可能性がある
- **認証**: ブラウザで表示中のページを読み取るため追加認証は不要。ログインが必要なページはユーザーが事前にログイン済みであること
- **データベースビュー**: テーブルビューのみ簡易対応。ボード・カレンダー等は非対応
- **外部埋め込み**: YouTube、Google Maps等はリンクのみ出力
- **カラムレイアウト**: 横並びカラムは縦並びに変換
- **動画再生**: VS Code（Cursor）での相対パス再生を確認済み
- **動作確認環境**: Windows

## 免責事項

本ソフトウェアの使用により生じたいかなる損害・損失・問題についても、オーナーおよびコントリビューターは一切の責任を負いません。ご利用は自己責任でお願いいたします。