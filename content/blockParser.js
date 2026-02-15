// blockParser.js — Notionブロック解析・Markdown変換
const BlockParser = (() => {
  // ブロックタイプの判定
  function getBlockType(element) {
    const className = element.className || "";
    const classList = typeof className === "string" ? className : "";

    // クラス名による判定
    if (classList.includes("header-block") && !classList.includes("sub_header")) return "heading1";
    if (classList.includes("sub_sub_header-block")) return "heading3";
    if (classList.includes("sub_header-block")) return "heading2";
    if (classList.includes("text-block")) return "paragraph";
    if (classList.includes("bulleted_list-block")) return "bulleted_list";
    if (classList.includes("numbered_list-block")) return "numbered_list";
    if (classList.includes("to_do-block")) return "todo";
    if (classList.includes("toggle-block")) return "toggle";
    if (classList.includes("code-block")) return "code";
    if (classList.includes("quote-block")) return "quote";
    if (classList.includes("divider-block")) return "divider";
    if (classList.includes("callout-block")) return "callout";
    if (classList.includes("image-block")) return "image";
    if (classList.includes("video-block")) return "video";
    if (classList.includes("embed-block")) return "embed";
    if (classList.includes("table-block")) return "table";
    if (classList.includes("bookmark-block")) return "bookmark";
    if (classList.includes("equation-block")) return "equation";
    if (classList.includes("column_list-block")) return "column_list";
    if (classList.includes("column-block")) return "column";

    // フォールバック: 内包するHTML要素から推定
    if (element.querySelector("h2")) return "heading1";
    if (element.querySelector("h4")) return "heading3";
    if (element.querySelector("h3")) return "heading2";
    if (element.querySelector("table")) return "table";

    return "unknown";
  }

  // インラインスタイル変換
  function convertInlineStyles(element) {
    if (!element) return "";
    if (element.nodeType === Node.TEXT_NODE) {
      return element.textContent;
    }
    if (element.nodeType !== Node.ELEMENT_NODE) {
      return element.textContent || "";
    }

    const tag = element.tagName.toLowerCase();
    let text = "";

    // 子要素を再帰的に処理
    for (const child of element.childNodes) {
      text += convertInlineStyles(child);
    }

    // リンク
    if (tag === "a") {
      const href = element.getAttribute("href") || "";
      if (href && !href.startsWith("javascript:")) {
        return `[${text}](${href})`;
      }
      return text;
    }

    // 太字
    if (tag === "b" || tag === "strong") {
      return `**${text}**`;
    }
    const fontWeight = element.style && element.style.fontWeight;
    if (fontWeight === "700" || fontWeight === "bold" || fontWeight === "600") {
      return `**${text}**`;
    }

    // イタリック
    if (tag === "em" || tag === "i") {
      return `*${text}*`;
    }
    if (element.style && element.style.fontStyle === "italic") {
      return `*${text}*`;
    }

    // 取り消し線
    if (tag === "s" || tag === "del" || tag === "strike") {
      return `~~${text}~~`;
    }
    if (element.style && element.style.textDecoration && element.style.textDecoration.includes("line-through")) {
      return `~~${text}~~`;
    }

    // インラインコード
    if (tag === "code") {
      return `\`${text}\``;
    }

    // 下線
    if (tag === "u") {
      return `<u>${text}</u>`;
    }
    if (element.style && element.style.textDecoration && element.style.textDecoration.includes("underline") && !element.querySelector("a")) {
      return `<u>${text}</u>`;
    }

    // 改行
    if (tag === "br") {
      return "\n";
    }

    return text;
  }

  // テキスト内容を取得（インラインスタイル変換付き）
  function getTextContent(element) {
    if (!element) return "";

    // notranslateクラスを持つ要素を優先的に探す
    const contentEl = element.querySelector(".notranslate") || element;
    return convertInlineStyles(contentEl).trim();
  }

  // ネストの深さを計算
  function getIndentLevel(element) {
    let level = 0;
    let parent = element.parentElement;
    while (parent) {
      const parentClass = parent.className || "";
      if (
        typeof parentClass === "string" &&
        (parentClass.includes("bulleted_list-block") ||
         parentClass.includes("numbered_list-block") ||
         parentClass.includes("to_do-block"))
      ) {
        level++;
      }
      parent = parent.parentElement;
    }
    return level;
  }

  // インデント文字列を生成
  function indent(level) {
    return "    ".repeat(level);
  }

  // 見出しの冗長な太字ラッピングを除去
  function stripBoldWrap(text) {
    return text.replace(/^\*\*(.+)\*\*$/, '$1');
  }

  // 各ブロックタイプの変換処理
  function parseHeading1(element) {
    let text = getTextContent(element);
    text = stripBoldWrap(text);
    return `# ${text}`;
  }

  function parseHeading2(element) {
    let text = getTextContent(element);
    text = stripBoldWrap(text);
    return `## ${text}`;
  }

  function parseHeading3(element) {
    let text = getTextContent(element);
    text = stripBoldWrap(text);
    return `### ${text}`;
  }

  function parseParagraph(element) {
    return getTextContent(element);
  }

  function parseBulletedList(element) {
    const level = getIndentLevel(element);
    const text = getTextContent(element);
    const prefix = `${indent(level)}- ${text}`;
    const childBlocks = getListItemChildBlocks(element);
    if (childBlocks.length === 0) return prefix;
    return `${prefix}\n\n${parseChildBlocks(childBlocks)}`;
  }

  function parseNumberedList(element, index) {
    const level = getIndentLevel(element);
    const text = getTextContent(element);
    const prefix = `${indent(level)}${index}. ${text}`;
    const childBlocks = getListItemChildBlocks(element);
    if (childBlocks.length === 0) return prefix;
    return `${prefix}\n\n${parseChildBlocks(childBlocks)}`;
  }

  function parseTodo(element) {
    const level = getIndentLevel(element);
    const text = getTextContent(element);
    const checkbox = element.querySelector('input[type="checkbox"], div[role="checkbox"]');
    const checked = checkbox
      ? (checkbox.checked || checkbox.getAttribute("aria-checked") === "true")
      : false;
    const prefix = `${indent(level)}- [${checked ? "x" : " "}] ${text}`;
    const childBlocks = getListItemChildBlocks(element);
    if (childBlocks.length === 0) return prefix;
    return `${prefix}\n\n${parseChildBlocks(childBlocks)}`;
  }

  function parseToggle(element) {
    // サマリー行の取得（.notranslateを先に試す — [role="button"]は矢印アイコンにマッチするため）
    const summaryEl =
      element.querySelector(".notranslate") ||
      element.querySelector('[role="button"]');
    const summaryText = summaryEl ? convertInlineStyles(summaryEl).trim() : "";

    // 子ブロック群の取得（aria-controlsでNotionが提供するセマンティックリンクを活用）
    const toggleButton = element.querySelector('div[role="button"][aria-controls]');
    const childrenId = toggleButton ? toggleButton.getAttribute('aria-controls') : null;
    const childrenSection = childrenId ? document.getElementById(childrenId) : null;
    const blockWrapper = childrenSection ? childrenSection.querySelector(':scope > div') : null;

    let bodyMarkdown = "";
    if (blockWrapper) {
      const childBlocks = getChildBlocks(blockWrapper);
      const lines = [];
      let numberedIndex = 1;
      for (const child of childBlocks) {
        const type = getBlockType(child);
        if (type === "numbered_list") {
          lines.push(parseBlock(child, numberedIndex));
          numberedIndex++;
        } else {
          numberedIndex = 1;
          lines.push(parseBlock(child));
        }
      }
      bodyMarkdown = lines.join("\n\n");
    } else {
      // フォールバック: トグル要素内の全子ブロックを直接探す
      const allChildren = element.querySelectorAll(':scope > div > div[data-block-id]');
      if (allChildren.length > 0) {
        const lines = [];
        let numberedIndex = 1;
        for (const child of allChildren) {
          const type = getBlockType(child);
          if (type === "numbered_list") {
            lines.push(parseBlock(child, numberedIndex));
            numberedIndex++;
          } else {
            numberedIndex = 1;
            lines.push(parseBlock(child));
          }
        }
        bodyMarkdown = lines.join("\n\n");
      }
    }

    return `<details>\n<summary>${summaryText}</summary>\n\n${bodyMarkdown}\n\n</details>`;
  }

  function parseCode(element) {
    // 言語の取得
    const langEl = element.querySelector('[class*="code-block"] [class*="language"]') ||
                   element.querySelector('[role="button"]');
    let lang = "";
    if (langEl) {
      const langText = langEl.textContent.trim().toLowerCase();
      if (langText && langText !== "plain text" && langText !== "テキスト") {
        lang = langText;
      }
    }

    // コード内容の取得
    const codeEl = element.querySelector("code") || element.querySelector("pre");
    let code = "";
    if (codeEl) {
      code = codeEl.textContent;
    } else {
      // フォールバック
      const contentEl = element.querySelector('.notranslate[contenteditable]') ||
                        element.querySelector('.notranslate');
      if (contentEl) {
        code = contentEl.textContent;
      }
    }

    return "```" + lang + "\n" + code + "\n```";
  }

  function parseQuote(element) {
    const text = getTextContent(element);
    return text.split("\n").map(line => `> ${line}`).join("\n");
  }

  function parseDivider() {
    return "---";
  }

  function parseCallout(element) {
    // アイコンの取得
    const iconEl = element.querySelector('[class*="callout"] img') ||
                   element.querySelector('[class*="callout"] [role="img"]');
    let icon = "";
    if (iconEl) {
      icon = iconEl.getAttribute("alt") || iconEl.textContent || "";
    }
    if (!icon) icon = "💡";

    const text = getTextContent(element);
    const prefix = icon ? `${icon} ` : "";
    return text.split("\n").map(line => `> ${prefix}${line}`).join("\n");
  }

  function parseImage(element) {
    const img = element.querySelector("img");
    if (!img) return "";
    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || "image";
    return `![${alt}](${src})`;
  }

  function parseVideo(element) {
    const video = element.querySelector("video");
    const source = element.querySelector("source");
    const src = (source && source.getAttribute("src")) ||
                (video && video.getAttribute("src")) || "";
    return `<video controls src="${src}" muted="false"></video>`;
  }

  function parseEmbed(element) {
    const iframe = element.querySelector("iframe");
    const link = element.querySelector("a");
    const url = (iframe && iframe.getAttribute("src")) ||
                (link && link.getAttribute("href")) || "";
    return `[embed](${url})`;
  }

  function parseTable(element) {
    const table = element.querySelector("table");
    if (!table) return "";

    const rows = table.querySelectorAll("tr");
    if (rows.length === 0) return "";

    const result = [];

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("th, td");
      const cellTexts = [];
      cells.forEach(cell => {
        cellTexts.push(convertInlineStyles(cell).trim().replace(/\|/g, "\\|"));
      });
      result.push(`| ${cellTexts.join(" | ")} |`);

      // ヘッダー行の後にセパレーターを挿入
      if (rowIndex === 0) {
        const separator = cellTexts.map(() => "---").join(" | ");
        result.push(`| ${separator} |`);
      }
    });

    return result.join("\n");
  }

  function parseBookmark(element) {
    const link = element.querySelector("a");
    if (!link) return "";
    const href = link.getAttribute("href") || "";
    const titleEl = element.querySelector('[class*="bookmark"] [class*="title"]') ||
                    element.querySelector('[class*="bookmark"] div');
    const title = titleEl ? titleEl.textContent.trim() : href;
    return `[${title}](${href})`;
  }

  function parseEquation(element) {
    const mathEl = element.querySelector('[class*="equation"]') ||
                   element.querySelector("annotation") ||
                   element;
    const formula = mathEl.textContent.trim();
    return `$$${formula}$$`;
  }

  function parseColumnList(element) {
    const columns = element.querySelectorAll('[class*="column-block"]');
    const parts = [];
    columns.forEach(col => {
      const childBlocks = getChildBlocks(col);
      let numberedIndex = 1;
      for (const child of childBlocks) {
        const type = getBlockType(child);
        if (type === "numbered_list") {
          parts.push(parseBlock(child, numberedIndex));
          numberedIndex++;
        } else {
          numberedIndex = 1;
          parts.push(parseBlock(child));
        }
      }
    });
    return parts.join("\n\n");
  }

  // ブロック要素内の直接の子ブロックを取得
  function getChildBlocks(container) {
    if (!container) return [];
    const blocks = [];
    const children = container.querySelectorAll(':scope > div[data-block-id], :scope > div[class*="-block"]');
    if (children.length > 0) {
      children.forEach(child => blocks.push(child));
    } else {
      // フォールバック
      container.querySelectorAll('div[data-block-id]').forEach(child => {
        if (child.parentElement === container || child.closest('[data-block-id]') === container) {
          blocks.push(child);
        }
      });
    }
    return blocks;
  }

  // リスト項目内のブロックレベル子要素を検出
  function getListItemChildBlocks(listElement) {
    const selfId = listElement.getAttribute('data-block-id');
    const allDescendantBlocks = listElement.querySelectorAll('[data-block-id]');
    const result = [];
    for (const block of allDescendantBlocks) {
      if (block.getAttribute('data-block-id') === selfId) continue;
      // 最も近い祖先ブロックがlistElementであるかチェック（直接の子ブロックのみ取得）
      let parent = block.parentElement;
      while (parent && parent !== listElement) {
        if (parent.hasAttribute('data-block-id') &&
            parent.getAttribute('data-block-id') !== selfId) {
          break;
        }
        parent = parent.parentElement;
      }
      if (parent === listElement) {
        result.push(block);
      }
    }
    return result;
  }

  // 子ブロック配列をパースしてMarkdown文字列を返す
  function parseChildBlocks(childBlocks) {
    const lines = [];
    let numberedIndex = 1;
    for (const child of childBlocks) {
      const type = getBlockType(child);
      if (type === "numbered_list") {
        lines.push(parseBlock(child, numberedIndex));
        numberedIndex++;
      } else {
        numberedIndex = 1;
        lines.push(parseBlock(child));
      }
    }
    return lines.join("\n\n");
  }

  // メインのパース関数
  function parseBlock(element, numberedIndex = 1) {
    const blockType = getBlockType(element);

    switch (blockType) {
      case "heading1": return parseHeading1(element);
      case "heading2": return parseHeading2(element);
      case "heading3": return parseHeading3(element);
      case "paragraph": return parseParagraph(element);
      case "bulleted_list": return parseBulletedList(element);
      case "numbered_list": return parseNumberedList(element, numberedIndex);
      case "todo": return parseTodo(element);
      case "toggle": return parseToggle(element);
      case "code": return parseCode(element);
      case "quote": return parseQuote(element);
      case "divider": return parseDivider();
      case "callout": return parseCallout(element);
      case "image": return parseImage(element);
      case "video": return parseVideo(element);
      case "embed": return parseEmbed(element);
      case "table": return parseTable(element);
      case "bookmark": return parseBookmark(element);
      case "equation": return parseEquation(element);
      case "column_list": return parseColumnList(element);
      case "column": return ""; // column_listで処理済み
      case "unknown":
      default:
        const text = element.textContent ? element.textContent.trim() : "";
        if (text) {
          return `${text}\n\n<!-- 未対応ブロックタイプ -->`;
        }
        return "";
    }
  }

  return {
    parseBlock,
    getBlockType,
    getChildBlocks,
    getTextContent,
    convertInlineStyles,
  };
})();
