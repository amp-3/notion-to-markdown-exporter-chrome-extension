// markdownBuilder.js — Markdown文字列の組み立て
const MarkdownBuilder = (() => {

  // Markdown文字列を組み立てる
  function build(title, blocks, resources, sourceUrl, options) {
    options = options || {};
    const lines = [];

    // ソースURLをfront matterとして挿入
    if (sourceUrl) {
      lines.push("---");
      lines.push("");
      lines.push(`Source URL: ${sourceUrl}`);
      lines.push("");
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    // タイトルを先頭に挿入
    lines.push(`# ${title}`);
    lines.push("");

    // 各ブロックの変換結果を追加
    for (const block of blocks) {
      if (block !== "") {
        lines.push(block);
        lines.push("");
      }
    }

    let markdown = lines.join("\n");

    // オプションに応じて画像・動画のリンク行を削除（URL置換の前に実行）
    if (options.includeImageLinks === false) {
      // ![alt](src) パターンの行を削除
      markdown = markdown.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "");
    }
    if (options.includeVideoLinks === false) {
      // <video ...></video> パターンの行を削除
      markdown = markdown.replace(/^<video[^>]*>.*?<\/video>\s*$/gm, "");
    }

    // 画像・動画のURLを相対パスに置換
    markdown = replaceResourceUrls(markdown, resources);

    // 連続する空行を最大2行に正規化
    markdown = markdown.replace(/\n{4,}/g, "\n\n\n");

    // 末尾に改行を付与
    if (!markdown.endsWith("\n")) {
      markdown += "\n";
    }

    return markdown;
  }

  // リソースURLを相対パスに置換
  function replaceResourceUrls(markdown, resources) {
    if (!resources || resources.length === 0) return markdown;

    for (const entry of resources) {
      if (!entry.originalUrl) continue;

      const localPath = `${NotionExporterConstants.RESOURCES_DIR}/${entry.filename}`;

      if (entry.blob) {
        // 正常にダウンロードされたリソース: URLを相対パスに置換
        markdown = replaceUrl(markdown, entry.originalUrl, localPath);
      } else {
        // ダウンロード失敗: コメントで記録
        const failComment = `<!-- リソース取得失敗: ${entry.originalUrl} -->`;
        markdown = replaceUrl(markdown, entry.originalUrl, localPath);
        // 置換後の行の次にコメントを追加
        markdown = markdown.replace(
          new RegExp(`(\\!\\[[^\\]]*\\]\\(${escapeRegex(localPath)}\\))`),
          `${failComment}\n$1`
        );
        markdown = markdown.replace(
          new RegExp(`(<video controls src="${escapeRegex(localPath)}" muted="false"></video>)`),
          `${failComment}\n$1`
        );
      }
    }

    return markdown;
  }

  // URLをエスケープしてMarkdown内で置換
  function replaceUrl(markdown, originalUrl, newPath) {
    // URLをそのまま検索（クエリパラメータ込み）
    const escaped = escapeForReplace(originalUrl);
    if (markdown.includes(originalUrl)) {
      return markdown.split(originalUrl).join(newPath);
    }

    // クエリパラメータなしのURLで検索
    try {
      const urlObj = new URL(originalUrl);
      const baseUrl = urlObj.origin + urlObj.pathname;
      if (markdown.includes(baseUrl)) {
        return markdown.split(baseUrl).join(newPath);
      }
    } catch {
      // URL解析失敗
    }

    // HTMLエンコードされたURLで検索
    const htmlEncoded = originalUrl.replace(/&/g, "&amp;");
    if (markdown.includes(htmlEncoded)) {
      return markdown.split(htmlEncoded).join(newPath);
    }

    return markdown;
  }

  // 正規表現用エスケープ
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 置換用エスケープ
  function escapeForReplace(str) {
    return str.replace(/\$/g, "$$$$");
  }

  return {
    build,
  };
})();
