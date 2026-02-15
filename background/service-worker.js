// service-worker.js — バックグラウンド処理

console.log("[SW] service-worker.js loading...");

try {
  const jszipUrl = chrome.runtime.getURL("lib/jszip.min.js");
  console.log("[SW] Loading JSZip from:", jszipUrl);
  importScripts(jszipUrl);
  console.log("[SW] jszip.min.js loaded successfully, JSZip:", typeof JSZip);
} catch (err) {
  console.error("[SW] Failed to load jszip.min.js:", err);
}

const RESOURCES_DIR = "_resources";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SW] Received message:", message.action);

  switch (message.action) {
    case "DOWNLOAD_ZIP":
      handleDownloadZip(message, sendResponse);
      return true; // 非同期応答

    case "FETCH_RESOURCE":
      handleFetchResource(message, sendResponse);
      return true; // 非同期応答

    case "BATCH_EXPORT":
      console.log("[SW] BATCH_EXPORT received, urls:", message.urls);
      handleBatchExport(message);
      sendResponse({ success: true });
      return false;
  }
});

console.log("[SW] service-worker.js loaded successfully");

// ZIPファイルのダウンロード
async function handleDownloadZip(message, sendResponse) {
  try {
    const { dataUrl, filename } = message;

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true,
    });

    sendResponse({ success: true, downloadId });
  } catch (err) {
    console.error("Download error:", err);
    sendResponse({ success: false, error: err.message });
  }
}

// CORS制約でContent Scriptから取得できないリソースの代理fetch
async function handleFetchResource(message, sendResponse) {
  try {
    const { url } = message;
    const response = await fetch(url);

    if (!response.ok) {
      sendResponse({ success: false, error: `HTTP ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));

    sendResponse({ success: true, data, contentType });
  } catch (err) {
    console.error("Fetch resource error:", err);
    sendResponse({ success: false, error: err.message });
  }
}

// --- 一括エクスポート ---

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

// 進捗をPopupに送信
function sendBatchProgress(text) {
  chrome.runtime.sendMessage({ action: "BATCH_EXPORT_PROGRESS", text }).catch(() => {});
}

// 完了をPopupに送信
function sendBatchComplete() {
  chrome.runtime.sendMessage({ action: "BATCH_EXPORT_COMPLETE" }).catch(() => {});
}

// エラーをPopupに送信
function sendBatchError(text) {
  chrome.runtime.sendMessage({ action: "BATCH_EXPORT_ERROR", text }).catch(() => {});
}

// タブの読み込み完了をPromiseで待つ
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("タブの読み込みがタイムアウトしました。"));
    }, 30000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // 既に読み込み完了している場合のチェック
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

// Content Scriptにメッセージ送信してページデータを取得
function getPageData(tabId, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: "EXPORT_PAGE_DATA", options }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("Content Scriptからの応答がありません。"));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

// Content Scriptの注入
async function injectContentScripts(tabId) {
  console.log("[SW] Injecting content scripts into tab:", tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "lib/jszip.min.js",
        "content/constants.js",
        "content/blockParser.js",
        "content/resourceCollector.js",
        "content/markdownBuilder.js",
        "content/content.js",
      ],
    });
    console.log("[SW] Content scripts injected successfully");
  } catch (err) {
    console.error("[SW] Content Script injection failed:", err);
    throw new Error("Content Scriptの注入に失敗しました: " + err.message);
  }
}

// 同名フォルダの重複回避
function getUniqueFolderNames(titles) {
  const counts = {};
  const result = [];

  for (const title of titles) {
    const safeName = sanitizeFilename(title);
    if (counts[safeName] === undefined) {
      counts[safeName] = 1;
      result.push(safeName);
    } else {
      counts[safeName]++;
      result.push(`${safeName}_${counts[safeName]}`);
    }
  }

  return result;
}

// 一括エクスポートのメイン処理
async function handleBatchExport(message) {
  const { urls, options } = message;
  let tabId = null;

  console.log("[SW] handleBatchExport started, urls:", urls);

  try {
    sendBatchProgress(`一括エクスポートを開始します (${urls.length}ページ)...`);

    // バックグラウンドタブを作成
    console.log("[SW] Creating background tab with url:", urls[0]);
    const tab = await chrome.tabs.create({ active: false, url: urls[0] });
    tabId = tab.id;
    console.log("[SW] Background tab created, tabId:", tabId);

    const pageResults = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      sendBatchProgress(`ページを処理中 (${i + 1}/${urls.length}): ${url}`);

      try {
        // 最初のURLはタブ作成時に既にナビゲーション済み
        if (i > 0) {
          await chrome.tabs.update(tabId, { url });
        }

        // 読み込み完了を待機
        console.log("[SW] Waiting for tab load, tabId:", tabId);
        await waitForTabLoad(tabId);
        console.log("[SW] Tab loaded");

        // Content Scriptがまだ注入されていない可能性があるので注入
        await injectContentScripts(tabId);

        // DOM安定のための待機
        console.log("[SW] Waiting 2s for DOM stability...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // ページデータを取得
        console.log("[SW] Getting page data...");
        const data = await getPageData(tabId, options);
        console.log("[SW] Page data received, title:", data.title, "resources:", data.resources?.length);
        pageResults.push(data);
      } catch (err) {
        console.error(`[SW] Failed to process page: ${url}`, err);
        sendBatchProgress(`ページのエクスポートに失敗しました (${i + 1}/${urls.length}): ${err.message}`);
        // 失敗しても次のページに進む
      }
    }

    if (pageResults.length === 0) {
      throw new Error("エクスポートできたページがありませんでした。");
    }

    // フォルダ名の重複回避
    const titles = pageResults.map(r => r.title);
    const folderNames = getUniqueFolderNames(titles);

    // ZIP生成
    sendBatchProgress("ZIPを生成中...");
    const zip = new JSZip();

    for (let i = 0; i < pageResults.length; i++) {
      const result = pageResults[i];
      const folderName = folderNames[i];
      const folder = zip.folder(folderName);

      // Markdownファイル
      folder.file(`${folderName}.md`, result.markdown);

      // リソースファイル
      if (result.resources && result.resources.length > 0) {
        const resourceFolder = folder.folder(RESOURCES_DIR);
        for (const res of result.resources) {
          // base64をバイナリに変換
          const binaryStr = atob(res.base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let j = 0; j < binaryStr.length; j++) {
            bytes[j] = binaryStr.charCodeAt(j);
          }
          resourceFolder.file(res.filename, bytes);
        }
      }
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // ArrayBufferからdata URLを生成してダウンロード
    sendBatchProgress("ダウンロード中...");
    const arrayBuffer = await zipBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const dataUrl = "data:application/zip;base64," + btoa(binary);

    await chrome.downloads.download({
      url: dataUrl,
      filename: `notion_batch_export${getDateSuffix()}.zip`,
      saveAs: true,
    });

    // バックグラウンドタブを閉じる
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // タブが既に閉じられている場合は無視
    }

    sendBatchComplete();
  } catch (err) {
    console.error("Batch export error:", err);
    sendBatchError(err.message);

    // エラー時もタブを閉じる
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // 無視
      }
    }
  }
}
