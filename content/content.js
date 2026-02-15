// content.js — メインコントローラー

(() => {
  // メッセージリスナー
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "EXPORT_PAGE") {
      exportPage(message.options)
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          console.error("Export failed:", err);
          sendResponse({ error: err.message });
        });
      return true; // 非同期応答のため
    }

    if (message.action === "EXPORT_PAGE_DATA") {
      exportPageData(message.options)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => {
          console.error("Export page data failed:", err);
          sendResponse({ error: err.message });
        });
      return true; // 非同期応答のため
    }
  });

  // ユーティリティ: sleep
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 進捗をポップアップに送信
  function sendProgress(text) {
    chrome.runtime.sendMessage({ action: "EXPORT_PROGRESS", text });
  }

  // 完了をポップアップに送信
  function sendComplete() {
    chrome.runtime.sendMessage({ action: "EXPORT_COMPLETE" });
  }

  // エラーをポップアップに送信
  function sendError(text) {
    chrome.runtime.sendMessage({ action: "EXPORT_ERROR", text });
  }

  // ページタイトル取得
  function getPageTitle() {
    // 方法1: Notionのタイトルブロック
    const titleEl = document.querySelector(".notion-page-block .notranslate");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    // 方法2: placeholder属性を持つ要素の親テキスト
    const placeholderEl = document.querySelector('div[data-block-id] [placeholder="無題"]') ||
                          document.querySelector('div[data-block-id] [placeholder="Untitled"]');
    if (placeholderEl) {
      const parent = placeholderEl.closest('div[data-block-id]');
      if (parent && parent.textContent.trim()) {
        return parent.textContent.trim();
      }
    }

    // フォールバック: document.titleからサイト名部分を除去
    let title = document.title || "Untitled";
    title = title.replace(/\s*[-|]\s*Notion$/, "").trim();
    return title || "Untitled";
  }

  // ページ全体スクロール（遅延読み込み対応）
  async function autoScroll() {
    sendProgress("ページを読み込み中...");

    const scrollContainer = document.querySelector('.notion-scroller') ||
                            document.querySelector('.notion-frame .notion-scroller') ||
                            document.documentElement;

    let lastHeight = scrollContainer.scrollHeight;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      scrollContainer.scrollTo(0, scrollContainer.scrollHeight);
      await sleep(500);

      const newHeight = scrollContainer.scrollHeight;
      if (newHeight === lastHeight) {
        break;
      }
      lastHeight = newHeight;
      attempts++;
    }

    // ページ先頭に戻る
    scrollContainer.scrollTo(0, 0);
    await sleep(300);
  }

  // 全折りたたみブロックを展開
  async function expandAllToggles() {
    sendProgress("折りたたみを展開中...");

    const maxIterations = 10;
    for (let i = 0; i < maxIterations; i++) {
      // 未展開のトグルを検索
      const toggleTriggers = document.querySelectorAll(
        'div[class*="toggle-block"] svg[class*="triangle"], ' +
        'div[class*="toggle-block"] svg[class*="arrowCaret"], ' +
        'div[class*="toggle-block"] [role="button"][aria-expanded="false"], ' +
        'div[class*="toggle-block"] .notion-toggle-trigger:not(.expanded)'
      );

      // 閉じている三角形アイコンも検索
      const closedToggles = document.querySelectorAll(
        'div[class*="toggle-block"] > div > div > div[role="button"]'
      );

      let expandedAny = false;

      for (const trigger of toggleTriggers) {
        try {
          trigger.click();
          expandedAny = true;
        } catch {
          // クリック失敗は無視
        }
      }

      // 追加: aria-expandedがfalseのボタンをクリック
      for (const btn of closedToggles) {
        if (btn.getAttribute("aria-expanded") === "false") {
          try {
            btn.click();
            expandedAny = true;
          } catch {
            // クリック失敗は無視
          }
        }
      }

      if (!expandedAny) break;

      await sleep(1000);
    }
  }

  // ファイル名のサニタイズ
  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200);
  }

  // 日付サフィックス生成（例: _20260216_134531）
  function getDateSuffix() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `_${y}${mo}${d}_${h}${mi}${s}`;
  }

  // ZIP生成
  async function createZip(title, markdownContent, resources) {
    sendProgress("ZIPを生成中...");

    const zip = new JSZip();
    const safeName = sanitizeFilename(title);

    // Markdownファイルを追加
    zip.file(`${safeName}.md`, markdownContent);

    // リソースファイルを追加
    const resourceFolder = zip.folder(NotionExporterConstants.RESOURCES_DIR);
    for (const entry of resources) {
      if (entry.blob) {
        resourceFolder.file(entry.filename, entry.blob);
      }
    }

    // ZIP Blobを生成
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return { blob: zipBlob, filename: `${safeName}${getDateSuffix()}.zip` };
  }

  // ZIPをダウンロード
  async function downloadZip(zipBlob, filename) {
    // Blob URLを生成してBackground経由でダウンロード
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => {
        const dataUrl = reader.result;
        chrome.runtime.sendMessage(
          {
            action: "DOWNLOAD_ZIP",
            dataUrl: dataUrl,
            filename: filename,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response && response.success) {
              resolve();
            } else {
              reject(new Error("Download failed"));
            }
          }
        );
      };
      reader.onerror = () => reject(new Error("Failed to read ZIP blob"));
      reader.readAsDataURL(zipBlob);
    });
  }

  // デフォルトオプション
  const DEFAULT_OPTIONS = {
    includeImageFiles: true,
    includeVideoFiles: true,
    includeImageLinks: true,
    includeVideoLinks: true,
  };

  // ページの共通処理（タイトル取得〜Markdown生成）
  // 返却: { title, markdown, resources }
  async function processPage(progressCallback, options) {
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    // 1. ページタイトル取得
    progressCallback("ページを解析中...");
    const title = getPageTitle();

    // 2. ページ全体スクロール（遅延読み込み対応）
    await autoScroll();

    // 3. 折りたたみを全展開
    await expandAllToggles();
    await sleep(1000); // 展開後のDOM安定待ち

    // 4. ページコンテンツ領域を取得
    progressCallback("ページを解析中...");
    const contentArea = document.querySelector(".notion-page-content");
    if (!contentArea) {
      throw new Error("Notionページのコンテンツ領域が見つかりませんでした。");
    }

    // 5. 子ブロック要素を順次パース
    const blockElements = BlockParser.getChildBlocks(contentArea);
    const blocks = [];
    let numberedIndex = 1;

    for (const element of blockElements) {
      const blockType = BlockParser.getBlockType(element);
      if (blockType === "numbered_list") {
        blocks.push(BlockParser.parseBlock(element, numberedIndex));
        numberedIndex++;
      } else {
        numberedIndex = 1;
        blocks.push(BlockParser.parseBlock(element));
      }
    }

    // 6. リソース（画像・動画）の収集
    progressCallback("リソースを収集中...");
    const allResources = ResourceCollector.collectResources(contentArea);

    // オプションに応じてダウンロード対象をフィルタ
    const resources = allResources.filter(entry => {
      if (entry.type === "image" && !options.includeImageFiles) return false;
      if (entry.type === "video" && !options.includeVideoFiles) return false;
      return true;
    });

    // 7. リソースのダウンロード
    await ResourceCollector.downloadAll(resources, progressCallback);

    // 8. Markdown文字列を完成
    progressCallback("Markdownを生成中...");
    const sourceUrl = window.location.href;
    const markdown = MarkdownBuilder.build(title, blocks, resources, sourceUrl, options);

    return { title, markdown, resources };
  }

  // エクスポート処理のエントリポイント
  async function exportPage(options) {
    try {
      const { title, markdown, resources } = await processPage(sendProgress, options);

      // ZIP生成
      const { blob: zipBlob, filename } = await createZip(title, markdown, resources);

      // ZIPをダウンロード
      sendProgress("ダウンロード中...");
      await downloadZip(zipBlob, filename);

      sendComplete();
    } catch (err) {
      console.error("Export error:", err);
      sendError(err.message);
      throw err;
    }
  }

  // 一括エクスポート用: ページデータを返却（ZIP化はService Workerが行う）
  async function exportPageData(options) {
    // Notionコンテンツの描画待ち
    await waitForNotionContent();

    const { title, markdown, resources } = await processPage(() => {}, options);

    // リソースのBlobをbase64に変換
    const resourcesBase64 = [];
    for (const entry of resources) {
      if (entry.blob) {
        const base64 = await blobToBase64(entry.blob);
        resourcesBase64.push({ filename: entry.filename, base64 });
      }
    }

    return { title, markdown, resources: resourcesBase64 };
  }

  // .notion-page-content が出現するまでポーリング
  function waitForNotionContent() {
    return new Promise((resolve, reject) => {
      const timeout = 30000;
      const interval = 500;
      let elapsed = 0;

      const check = () => {
        if (document.querySelector(".notion-page-content")) {
          resolve();
          return;
        }
        elapsed += interval;
        if (elapsed >= timeout) {
          reject(new Error("Notionページの読み込みがタイムアウトしました。"));
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  // BlobをBase64文字列に変換
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // data:xxx;base64,XXXX からbase64部分のみ取得
        const result = reader.result;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
      reader.readAsDataURL(blob);
    });
  }
})();
