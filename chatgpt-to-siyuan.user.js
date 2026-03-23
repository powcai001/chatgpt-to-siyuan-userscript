// ==UserScript==
// @name         ChatGPT 同步到思源笔记
// @namespace    https://github.com/powcai001/chatgpt-to-siyuan-userscript
// @version      0.2.1
// @description  将 ChatGPT 当前对话导出为 Markdown 并同步到思源笔记
// @author       inxide
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    siyuanBaseUrl: "http://127.0.0.1:6806",
    siyuanToken: "请替换为你的思源API Token",
    notebook: "请替换为你的笔记本ID",
    parentPath: "/ChatGPT同步",
    docTitlePrefix: "ChatGPT会话-",
    debug: false,
  };
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim();
  }

  function debugLog(...args) {
    if (CONFIG.debug) {
      console.log("[ChatGPT->思源]", ...args);
    }
  }

  function validateConfig() {
    if (!CONFIG.siyuanToken || CONFIG.siyuanToken.includes("请替换")) {
      throw new Error("请先把 siyuanToken 改成真实的思源 API Token");
    }
    if (!CONFIG.notebook || CONFIG.notebook.includes("请替换")) {
      throw new Error("请先把 notebook 改成真实的笔记本 ID");
    }
  }

  function getConversationTitle() {
    const title = document.title
      .replace(/\s*-\s*ChatGPT\s*$/i, "")
      .replace(/\s*-\s*OpenAI\s*$/i, "")
      .trim();

    return title || `未命名会话-${Date.now()}`;
  }

  function cleanInlineText(text) {
    return (text || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function indentLines(text, prefix) {
    return text
      .split("\n")
      .map((line) => (line ? prefix + line : prefix.trimEnd()))
      .join("\n");
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";

    const matrix = rows.map((row) => {
      return Array.from(row.children).map((cell) =>
        cleanInlineText(cell.innerText || cell.textContent || ""),
      );
    });

    const header = matrix[0];
    const body = matrix.slice(1);
    const headerLine = `| ${header.join(" | ")} |`;
    const separatorLine = `| ${header.map(() => "---").join(" | ")} |`;
    const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);
    return [headerLine, separatorLine, ...bodyLines].join("\n");
  }

  function nodeToMarkdown(node, ctx = {}) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    const children = () =>
      Array.from(node.childNodes)
        .map((child) => nodeToMarkdown(child, ctx))
        .join("");

    if (
      tag === "svg" ||
      tag === "button" ||
      tag === "textarea" ||
      tag === "input"
    ) {
      return "";
    }

    if (tag === "br") return "\n";
    if (tag === "hr") return "\n---\n\n";

    if (tag === "strong" || tag === "b") return `**${children().trim()}**`;
    if (tag === "em" || tag === "i") return `*${children().trim()}*`;
    if (tag === "code" && node.parentElement?.tagName?.toLowerCase() !== "pre")
      return `\`${cleanInlineText(node.textContent || "")}\``;
    if (tag === "a") {
      const text = cleanInlineText(children() || node.textContent || "");
      const href = node.getAttribute("href") || "";
      return href ? `[${text || href}](${href})` : text;
    }

    if (tag === "pre") {
      const codeEl = node.querySelector("code");
      const code = (codeEl?.innerText || node.innerText || "").replace(
        /\n+$/,
        "",
      );
      const langClass =
        Array.from(codeEl?.classList || []).find((c) =>
          c.startsWith("language-"),
        ) || "";
      const lang = langClass.replace("language-", "");
      return "\n\n```" + lang + "\n" + code + "\n```\n\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      return `\n${"#".repeat(level)} ${cleanInlineText(children())}\n\n`;
    }

    if (tag === "p") {
      return `${cleanInlineText(children())}\n\n`;
    }

    if (tag === "blockquote") {
      const content = cleanInlineText(children());
      return `${indentLines(content, "> ")}\n\n`;
    }

    if (tag === "ul") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName?.toLowerCase() === "li")
        .map((li) => {
          const text = cleanInlineText(
            nodeToMarkdown(li, { ...ctx, listDepth: (ctx.listDepth || 0) + 1 }),
          );
          const indent = "  ".repeat(ctx.listDepth || 0);
          return `${indent}- ${text}`;
        });
      return `${items.join("\n")}\n\n`;
    }

    if (tag === "ol") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName?.toLowerCase() === "li")
        .map((li, index) => {
          const text = cleanInlineText(
            nodeToMarkdown(li, { ...ctx, listDepth: (ctx.listDepth || 0) + 1 }),
          );
          const indent = "  ".repeat(ctx.listDepth || 0);
          return `${indent}${index + 1}. ${text}`;
        });
      return `${items.join("\n")}\n\n`;
    }

    if (tag === "li") {
      const parts = Array.from(node.childNodes)
        .map((child) => nodeToMarkdown(child, ctx))
        .join("");
      return cleanInlineText(parts);
    }

    if (tag === "table") {
      return `\n${tableToMarkdown(node)}\n\n`;
    }

    if (
      tag === "thead" ||
      tag === "tbody" ||
      tag === "tr" ||
      tag === "th" ||
      tag === "td"
    ) {
      return children();
    }

    if (
      tag === "div" ||
      tag === "section" ||
      tag === "article" ||
      tag === "span"
    ) {
      return children();
    }

    return children();
  }

  function normalizeMarkdown(md) {
    return (md || "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function getMessageContentRoot(messageEl) {
    return (
      messageEl.querySelector('[class*="markdown"]') ||
      messageEl.querySelector('[class*="prose"]') ||
      messageEl.querySelector(".whitespace-pre-wrap") ||
      messageEl
    );
  }

  function extractMessageMarkdown(messageEl) {
    const root = getMessageContentRoot(messageEl);
    const markdown = normalizeMarkdown(nodeToMarkdown(root));
    if (markdown) return markdown;
    return cleanInlineText(root.innerText || root.textContent || "");
  }

  function extractMessages() {
    const main = document.querySelector("main");
    if (!main) return [];

    const candidates = Array.from(
      main.querySelectorAll("[data-message-author-role]"),
    );
    const messages = candidates
      .map((el) => {
        const role = el.getAttribute("data-message-author-role");
        const content = extractMessageMarkdown(el);
        return { role, content };
      })
      .filter((item) => item.role && item.content);

    return messages;
  }

  function messagesToMarkdown(title, messages) {
    const lines = [];
    lines.push(`# ${title}`);
    lines.push("");
    lines.push(`> 同步时间：${formatDate()}`);
    lines.push("");

    for (const msg of messages) {
      const role =
        msg.role === "user"
          ? "User"
          : msg.role === "assistant"
            ? "Assistant"
            : msg.role;
      lines.push(`## ${role}`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    }

    return normalizeMarkdown(lines.join("\n")) + "\n";
  }

  function siyuanRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.siyuanBaseUrl}${endpoint}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${CONFIG.siyuanToken}`,
        },
        data: JSON.stringify(body),
        onload: function (res) {
          try {
            const json = JSON.parse(res.responseText);
            resolve(json);
          } catch (e) {
            reject(new Error(`思源返回解析失败: ${res.responseText}`));
          }
        },
        onerror: function (err) {
          reject(err);
        },
      });
    });
  }

  async function createDocInSiyuan(title, markdown) {
    const safeTitle = sanitizeFileName(`${CONFIG.docTitlePrefix}${title}`);
    const path = `${CONFIG.parentPath}/${safeTitle}`;

    return await siyuanRequest("/api/filetree/createDocWithMd", {
      notebook: CONFIG.notebook,
      path,
      markdown,
    });
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.innerText = msg;
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "80px";
    toast.style.zIndex = "999999";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "10px";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.background = isError ? "#e53935" : "#2e7d32";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function createSyncButton() {
    if (document.getElementById("sync-to-siyuan-btn")) return;

    const btn = document.createElement("button");
    btn.id = "sync-to-siyuan-btn";
    btn.innerText = "同步到思源";
    btn.style.position = "fixed";
    btn.style.right = "20px";
    btn.style.bottom = "20px";
    btn.style.zIndex = "999999";
    btn.style.padding = "12px 16px";
    btn.style.border = "none";
    btn.style.borderRadius = "12px";
    btn.style.background = "#1677ff";
    btn.style.color = "#fff";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";

    btn.addEventListener("click", async () => {
      try {
        validateConfig();
        btn.disabled = true;
        btn.innerText = "同步中...";

        const title = getConversationTitle();
        const messages = extractMessages();

        if (!messages.length) {
          throw new Error("未抓取到会话内容，请确认当前页面是具体对话页。");
        }

        const markdown = messagesToMarkdown(title, messages);
        debugLog({ title, messages, markdown });

        const res = await createDocInSiyuan(title, markdown);
        if (res.code !== 0) {
          throw new Error(res.msg || "思源创建文档失败");
        }

        showToast("同步成功");
        debugLog("同步成功", res);
      } catch (err) {
        console.error("[ChatGPT->思源] 同步失败", err);
        showToast(`同步失败：${err.message || err}`, true);
      } finally {
        btn.disabled = false;
        btn.innerText = "同步到思源";
      }
    });

    document.body.appendChild(btn);
  }

  async function init() {
    await sleep(2000);
    createSyncButton();
  }

  init();

  const observer = new MutationObserver(() => {
    if (!document.getElementById("sync-to-siyuan-btn")) {
      createSyncButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
