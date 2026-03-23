// ==UserScript==
// @name         ChatGPT 同步到思源笔记
// @namespace    https://github.com/powcai001/chatgpt-to-siyuan-userscript
// @version      0.4.0
// @description  将 ChatGPT 当前对话导出为 Markdown 并同步到思源笔记
// @author       inxide
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    siyuanBaseUrl: "http://127.0.0.1:6806",
    siyuanToken: "请替换为你的思源API Token",
    notebook: "请替换为你的笔记本ID",
    parentPath: "/ChatGPT同步",
    docTitlePrefix: "ChatGPT会话-",
    debug: false,
  };

  const CONFIG_STORAGE_KEY = "chatgptToSiyuanConfig";
  let CONFIG = loadConfig();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStoredValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallback);
      }
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (err) {
      return fallback;
    }
  }

  function setStoredValue(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    localStorage.setItem(key, value);
  }

  function loadConfig() {
    try {
      const raw = getStoredValue(CONFIG_STORAGE_KEY, "");
      if (!raw) return { ...DEFAULT_CONFIG };
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (err) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(nextConfig) {
    CONFIG = { ...DEFAULT_CONFIG, ...nextConfig };
    setStoredValue(CONFIG_STORAGE_KEY, JSON.stringify(CONFIG));
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
      throw new Error("请先点击“设置思源”填写真实的思源 API Token");
    }
    if (!CONFIG.notebook || CONFIG.notebook.includes("请替换")) {
      throw new Error("请先点击“设置思源”填写真实的笔记本 ID");
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

  async function listSiyuanNotebooks(configOverride = {}) {
    const runtimeConfig = { ...CONFIG, ...configOverride };
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${runtimeConfig.siyuanBaseUrl}/api/notebook/lsNotebooks`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${runtimeConfig.siyuanToken}`,
        },
        data: "{}",
        onload: function (res) {
          try {
            const json = JSON.parse(res.responseText);
            if (json.code !== 0) {
              reject(new Error(json.msg || "获取笔记本列表失败"));
              return;
            }
            const notebooks = json.data?.notebooks || [];
            resolve(notebooks);
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

  function createField(labelText, value, placeholder, isPassword = false) {
    const wrapper = document.createElement("label");
    wrapper.style.display = "block";

    const label = document.createElement("div");
    label.innerText = labelText;
    label.style.fontSize = "13px";
    label.style.fontWeight = "600";
    label.style.marginBottom = "6px";
    label.style.color = "#111827";

    const input = document.createElement("input");
    input.type = isPassword ? "password" : "text";
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "10px 12px";
    input.style.border = "1px solid #d1d5db";
    input.style.borderRadius = "10px";
    input.style.fontSize = "13px";
    input.style.outline = "none";
    input.style.background = "#fff";
    input.style.color = "#111827";

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return { wrapper, input };
  }

  function createSelectField(labelText) {
    const wrapper = document.createElement("label");
    wrapper.style.display = "block";

    const label = document.createElement("div");
    label.innerText = labelText;
    label.style.fontSize = "13px";
    label.style.fontWeight = "600";
    label.style.marginBottom = "6px";
    label.style.color = "#111827";

    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.boxSizing = "border-box";
    select.style.padding = "10px 12px";
    select.style.border = "1px solid #d1d5db";
    select.style.borderRadius = "10px";
    select.style.fontSize = "13px";
    select.style.outline = "none";
    select.style.background = "#fff";
    select.style.color = "#111827";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.innerText = "可点击“读取笔记本列表”自动选择";
    select.appendChild(defaultOption);

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    return { wrapper, select };
  }

  function openConfigModal() {
    const oldMask = document.getElementById("chatgpt-to-siyuan-config-mask");
    if (oldMask) oldMask.remove();

    const mask = document.createElement("div");
    mask.id = "chatgpt-to-siyuan-config-mask";
    mask.style.position = "fixed";
    mask.style.inset = "0";
    mask.style.background = "rgba(0,0,0,0.45)";
    mask.style.zIndex = "1000000";
    mask.style.display = "flex";
    mask.style.alignItems = "center";
    mask.style.justifyContent = "center";
    mask.addEventListener("click", (e) => {
      if (e.target === mask) mask.remove();
    });

    const modal = document.createElement("div");
    modal.style.width = "min(520px, calc(100vw - 32px))";
    modal.style.maxHeight = "calc(100vh - 32px)";
    modal.style.overflow = "auto";
    modal.style.background = "#ffffff";
    modal.style.borderRadius = "16px";
    modal.style.padding = "20px";
    modal.style.boxShadow = "0 20px 60px rgba(0,0,0,0.25)";

    const title = document.createElement("div");
    title.innerText = "思源同步配置";
    title.style.fontSize = "18px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    title.style.color = "#111827";

    const desc = document.createElement("div");
    desc.innerText = "配置会保存在浏览器本地，仅当前脚本使用。";
    desc.style.fontSize = "13px";
    desc.style.color = "#6b7280";
    desc.style.marginBottom = "16px";

    const baseUrlField = createField(
      "思源地址",
      CONFIG.siyuanBaseUrl,
      "例如：http://127.0.0.1:6806",
    );
    const tokenField = createField(
      "思源 API Token",
      CONFIG.siyuanToken,
      "请输入思源 API Token",
      true,
    );
    const notebookField = createField(
      "笔记本 ID",
      CONFIG.notebook,
      "请输入笔记本 ID",
    );
    const notebookSelectField = createSelectField("笔记本列表");
    const parentPathField = createField(
      "保存路径",
      CONFIG.parentPath,
      "例如：/ChatGPT同步",
    );
    const prefixField = createField(
      "文档标题前缀",
      CONFIG.docTitlePrefix,
      "例如：ChatGPT会话-",
    );

    const helperBar = document.createElement("div");
    helperBar.style.display = "flex";
    helperBar.style.alignItems = "center";
    helperBar.style.justifyContent = "space-between";
    helperBar.style.gap = "10px";
    helperBar.style.marginBottom = "12px";

    const helperText = document.createElement("div");
    helperText.innerText = "可自动读取思源中的笔记本并填入下方 ID。";
    helperText.style.fontSize = "12px";
    helperText.style.color = "#6b7280";
    helperText.style.flex = "1";

    const loadNotebooksBtn = document.createElement("button");
    loadNotebooksBtn.innerText = "读取笔记本列表";
    loadNotebooksBtn.style.padding = "8px 12px";
    loadNotebooksBtn.style.borderRadius = "10px";
    loadNotebooksBtn.style.border = "1px solid #d1d5db";
    loadNotebooksBtn.style.background = "#fff";
    loadNotebooksBtn.style.color = "#111827";
    loadNotebooksBtn.style.fontSize = "13px";
    loadNotebooksBtn.style.fontWeight = "500";
    loadNotebooksBtn.style.cursor = "pointer";

    helperBar.appendChild(helperText);
    helperBar.appendChild(loadNotebooksBtn);

    notebookSelectField.select.addEventListener("change", () => {
      if (notebookSelectField.select.value) {
        notebookField.input.value = notebookSelectField.select.value;
      }
    });

    loadNotebooksBtn.addEventListener("click", async () => {
      try {
        const baseUrl = baseUrlField.input.value.trim() || DEFAULT_CONFIG.siyuanBaseUrl;
        const token = tokenField.input.value.trim();
        if (!token || token.includes("请替换")) {
          throw new Error("请先填写正确的思源 API Token");
        }

        loadNotebooksBtn.disabled = true;
        loadNotebooksBtn.innerText = "读取中...";

        const notebooks = await listSiyuanNotebooks({
          siyuanBaseUrl: baseUrl,
          siyuanToken: token,
        });

        notebookSelectField.select.innerHTML = "";

        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.innerText = notebooks.length
          ? "请选择一个笔记本"
          : "未读取到笔记本";
        notebookSelectField.select.appendChild(placeholderOption);

        notebooks.forEach((notebook) => {
          const option = document.createElement("option");
          option.value = notebook.id;
          option.innerText = `${notebook.name} (${notebook.id})`;
          if (notebook.id === notebookField.input.value.trim()) {
            option.selected = true;
          }
          notebookSelectField.select.appendChild(option);
        });

        if (notebooks.length === 1) {
          notebookField.input.value = notebooks[0].id;
          notebookSelectField.select.value = notebooks[0].id;
        }

        showToast(notebooks.length ? "笔记本列表读取成功" : "没有读取到笔记本", !notebooks.length);
      } catch (err) {
        console.error("[ChatGPT->思源] 读取笔记本失败", err);
        showToast(`读取失败：${err.message || err}`, true);
      } finally {
        loadNotebooksBtn.disabled = false;
        loadNotebooksBtn.innerText = "读取笔记本列表";
      }
    });

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "10px";
    actions.style.marginTop = "18px";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "取消";
    cancelBtn.style.padding = "10px 14px";
    cancelBtn.style.borderRadius = "10px";
    cancelBtn.style.border = "1px solid #d1d5db";
    cancelBtn.style.background = "#fff";
    cancelBtn.style.color = "#111827";
    cancelBtn.style.fontSize = "14px";
    cancelBtn.style.fontWeight = "500";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.addEventListener("click", () => mask.remove());

    const saveBtn = document.createElement("button");
    saveBtn.innerText = "保存";
    saveBtn.style.padding = "10px 14px";
    saveBtn.style.borderRadius = "10px";
    saveBtn.style.border = "none";
    saveBtn.style.background = "#1677ff";
    saveBtn.style.color = "#fff";
    saveBtn.style.fontSize = "14px";
    saveBtn.style.fontWeight = "500";
    saveBtn.style.cursor = "pointer";
    saveBtn.addEventListener("click", () => {
      saveConfig({
        siyuanBaseUrl: baseUrlField.input.value.trim() || DEFAULT_CONFIG.siyuanBaseUrl,
        siyuanToken: tokenField.input.value.trim(),
        notebook: notebookField.input.value.trim(),
        parentPath: parentPathField.input.value.trim() || DEFAULT_CONFIG.parentPath,
        docTitlePrefix: prefixField.input.value.trim() || DEFAULT_CONFIG.docTitlePrefix,
      });
      showToast("配置已保存");
      mask.remove();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    [
      title,
      desc,
      baseUrlField.wrapper,
      tokenField.wrapper,
      notebookField.wrapper,
      helperBar,
      notebookSelectField.wrapper,
      parentPathField.wrapper,
      prefixField.wrapper,
      actions,
    ].forEach((el, index) => {
      if (index >= 2 && index <= 8) {
        el.style.marginBottom = "12px";
      }
      modal.appendChild(el);
    });

    mask.appendChild(modal);
    document.body.appendChild(mask);
  }

  function createSettingsButton() {
    if (document.getElementById("config-to-siyuan-btn")) return;

    const btn = document.createElement("button");
    btn.id = "config-to-siyuan-btn";
    btn.innerText = "设置思源";
    btn.style.position = "fixed";
    btn.style.right = "140px";
    btn.style.bottom = "20px";
    btn.style.zIndex = "999999";
    btn.style.padding = "12px 16px";
    btn.style.border = "none";
    btn.style.borderRadius = "12px";
    btn.style.background = "#4b5563";
    btn.style.color = "#fff";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    btn.addEventListener("click", openConfigModal);

    document.body.appendChild(btn);
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
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("设置思源配置", openConfigModal);
    }
    createSettingsButton();
    createSyncButton();
  }

  init();

  const observer = new MutationObserver(() => {
    if (!document.getElementById("config-to-siyuan-btn")) {
      createSettingsButton();
    }
    if (!document.getElementById("sync-to-siyuan-btn")) {
      createSyncButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
