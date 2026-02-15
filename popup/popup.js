document.addEventListener("DOMContentLoaded", () => {
  const addUrlBtn = document.getElementById("addUrlBtn");
  const addUrlStatus = document.getElementById("addUrlStatus");
  const batchExportBtn = document.getElementById("batchExportBtn");
  const batchUrlsArea = document.getElementById("batchUrls");
  const batchProgressDiv = document.getElementById("batchProgress");
  const batchStatusDiv = document.getElementById("batchStatus");

  // Notion URLかどうかの判定
  function isNotionUrl(url) {
    return url.includes("notion.so") || url.includes("notion.site");
  }

  // エクスポートオプションの取得
  function getExportOptions() {
    return {
      includeImageFiles: document.getElementById("includeImageFiles").checked,
      includeVideoFiles: document.getElementById("includeVideoFiles").checked,
      includeImageLinks: document.getElementById("includeImageLinks").checked,
      includeVideoLinks: document.getElementById("includeVideoLinks").checked,
    };
  }

  // エクスポートボタンの無効化/有効化（URL追加ボタンは常に有効）
  function setAllButtonsDisabled(disabled) {
    batchExportBtn.disabled = disabled;
  }

  // --- URL追加 ---
  addUrlBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      addUrlStatus.textContent = "タブ情報を取得できませんでした。";
      return;
    }

    const url = tab.url;
    if (!isNotionUrl(url)) {
      addUrlStatus.textContent = "Notionページではありません。Notionページを開いてから実行してください。";
      return;
    }

    addUrlStatus.textContent = "";
    const current = batchUrlsArea.value;
    if (current.length > 0 && !current.endsWith("\n")) {
      batchUrlsArea.value = current + "\n" + url;
    } else {
      batchUrlsArea.value = current + url;
    }
  });

  // --- 一括エクスポート ---
  batchExportBtn.addEventListener("click", async () => {
    // テキストエリアからURL一覧をパース
    const rawText = batchUrlsArea.value;
    const urls = rawText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // バリデーション: 0件チェック
    if (urls.length === 0) {
      batchStatusDiv.textContent = "URLが入力されていません。";
      return;
    }

    // バリデーション: 全URLがNotion URLか
    const invalidUrls = urls.filter(url => !isNotionUrl(url));
    if (invalidUrls.length > 0) {
      batchStatusDiv.textContent = "Notion以外のURLが含まれています: " + invalidUrls[0];
      return;
    }

    setAllButtonsDisabled(true);
    batchStatusDiv.textContent = "";
    batchProgressDiv.textContent = "一括エクスポートを開始しています...";

    try {
      console.log("[Popup] Sending BATCH_EXPORT message, urls:", urls);
      chrome.runtime.sendMessage(
        { action: "BATCH_EXPORT", urls, options: getExportOptions() },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Popup] BATCH_EXPORT sendMessage lastError:", chrome.runtime.lastError);
            batchProgressDiv.textContent = "";
            batchStatusDiv.textContent = "Service Workerとの通信に失敗しました: " + chrome.runtime.lastError.message;
            setAllButtonsDisabled(false);
            return;
          }
          console.log("[Popup] BATCH_EXPORT response:", response);
        }
      );
    } catch (e) {
      console.error("[Popup] BATCH_EXPORT exception:", e);
      batchProgressDiv.textContent = "";
      batchStatusDiv.textContent = "エラーが発生しました: " + e.message;
      setAllButtonsDisabled(false);
    }
  });

  // --- メッセージリスナー ---
  chrome.runtime.onMessage.addListener((message) => {
    // 一括エクスポート
    if (message.action === "BATCH_EXPORT_PROGRESS") {
      batchProgressDiv.textContent = message.text;
    } else if (message.action === "BATCH_EXPORT_COMPLETE") {
      batchProgressDiv.textContent = "";
      batchStatusDiv.textContent = "一括エクスポート完了 ✓";
      setAllButtonsDisabled(false);
    } else if (message.action === "BATCH_EXPORT_ERROR") {
      batchProgressDiv.textContent = "";
      batchStatusDiv.textContent = "エラー: " + message.text;
      setAllButtonsDisabled(false);
    }
  });
});
