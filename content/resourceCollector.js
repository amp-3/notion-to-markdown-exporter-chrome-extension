// resourceCollector.js — 画像・動画リソース収集
const ResourceCollector = (() => {
  const MAX_RESOURCE_SIZE = 50 * 1024 * 1024; // 50MB

  const MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };

  // リソースURLかどうか判定（UIアイコン等を除外）
  function isContentResource(element, rootElement) {
    // ページコンテンツ内にあるか確認
    if (rootElement && !rootElement.contains(element)) return false;

    // サイズが32px以下のものを除外
    const width = element.naturalWidth || element.width || parseInt(element.getAttribute("width"), 10) || 0;
    const height = element.naturalHeight || element.height || parseInt(element.getAttribute("height"), 10) || 0;
    if (width > 0 && width <= 32 && height > 0 && height <= 32) return false;

    // 絵文字画像を除外
    const src = element.getAttribute("src") || "";
    if (src.includes("/emoji/") || src.includes("twemoji") || src.includes("notion-emojis")) return false;

    // アバター画像を除外
    const parentClass = element.parentElement ? (element.parentElement.className || "") : "";
    if (typeof parentClass === "string" && parentClass.includes("avatar")) return false;

    return true;
  }

  // URLからファイル拡張子を推定
  function guessExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        const ext = match[1].toLowerCase();
        const validExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov", "avi"];
        if (validExts.includes(ext)) {
          return "." + (ext === "jpeg" ? "jpg" : ext);
        }
      }
    } catch {
      // URL解析失敗
    }
    return null;
  }

  // リソースを収集
  function collectResources(rootElement) {
    const entries = [];
    let imageCount = 0;
    let videoCount = 0;

    // 画像の収集
    const images = rootElement.querySelectorAll("img");
    images.forEach(img => {
      if (!isContentResource(img, rootElement)) return;
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:image/svg")) return;

      imageCount++;
      const ext = guessExtension(src) || ".png";
      const filename = `image_${String(imageCount).padStart(3, "0")}${ext}`;

      entries.push({
        originalUrl: src,
        filename: filename,
        blob: null,
        element: img,
        type: "image",
      });
    });

    // 動画の収集
    const videos = rootElement.querySelectorAll("video");
    videos.forEach(video => {
      if (!isContentResource(video, rootElement)) return;
      const source = video.querySelector("source");
      const src = (source && source.getAttribute("src")) || video.getAttribute("src");
      if (!src) return;

      videoCount++;
      const ext = guessExtension(src) || ".mp4";
      const filename = `video_${String(videoCount).padStart(3, "0")}${ext}`;

      entries.push({
        originalUrl: src,
        filename: filename,
        blob: null,
        element: video,
        type: "video",
      });
    });

    return entries;
  }

  // Content-Typeから拡張子を取得
  function extFromContentType(contentType) {
    if (!contentType) return null;
    const mime = contentType.split(";")[0].trim().toLowerCase();
    return MIME_TO_EXT[mime] || null;
  }

  // 全リソースをダウンロード
  async function downloadAll(entries, progressCallback) {
    const total = entries.length;
    let completed = 0;

    for (const entry of entries) {
      try {
        if (progressCallback) {
          progressCallback(`画像をダウンロード中 (${completed + 1}/${total})...`);
        }

        let response;
        try {
          response = await fetch(entry.originalUrl, { mode: "cors" });
        } catch {
          // CORS失敗時、Background経由でフォールバック
          const result = await fetchViaBackground(entry.originalUrl);
          if (result) {
            entry.blob = result;
            completed++;
            continue;
          }
          throw new Error("Fetch failed for: " + entry.originalUrl);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${entry.originalUrl}`);
        }

        // サイズチェック
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_RESOURCE_SIZE) {
          console.warn(`Resource too large (${contentLength} bytes), skipping: ${entry.originalUrl}`);
          entry.blob = null;
          completed++;
          continue;
        }

        // 拡張子の再判定
        const contentType = response.headers.get("content-type");
        const ctExt = extFromContentType(contentType);
        if (ctExt && !entry.filename.endsWith(ctExt)) {
          const baseName = entry.filename.replace(/\.[^.]+$/, "");
          entry.filename = baseName + ctExt;
        }

        entry.blob = await response.blob();

        // Blob サイズチェック
        if (entry.blob.size > MAX_RESOURCE_SIZE) {
          console.warn(`Resource too large (${entry.blob.size} bytes), skipping: ${entry.originalUrl}`);
          entry.blob = null;
        }
      } catch (err) {
        console.error(`Failed to download resource: ${entry.originalUrl}`, err);
        entry.blob = null;
      }
      completed++;
    }

    return entries;
  }

  // Background Service Worker経由でリソースを取得
  function fetchViaBackground(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "FETCH_RESOURCE", url: url },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            resolve(null);
            return;
          }
          // ArrayBufferからBlobを生成
          const bytes = new Uint8Array(response.data);
          const blob = new Blob([bytes], { type: response.contentType || "application/octet-stream" });
          resolve(blob);
        }
      );
    });
  }

  return {
    collectResources,
    downloadAll,
  };
})();
