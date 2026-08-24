
const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  MarkdownView,
  TFile,
  ItemView,
  normalizePath,
} = require('obsidian');

/* =========================================================
   Integrated Image Display Engine
   来源：image-grid 2.9.1，作为 image-workflow 内部展示模块运行。
   不注册独立设置页，不改变主插件 ID / 数据目录。
   ========================================================= */
const IntegratedImageGridPlugin = (function () {
  const module = { exports: {} };
  const exports = module.exports;
"use strict";
const __igNativeRequire = require;
const __igModules = Object.create(null);
const __igCache = Object.create(null);
__igModules["./settings"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageGridSettingTab = exports.DEFAULT_SETTINGS = void 0;
exports.normalizeSettings = normalizeSettings;

const obsidian_1 = require("obsidian");

exports.DEFAULT_SETTINGS = {
    layout: { gapRem: 0.5 },
    interaction: { liveControls: true }
};

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const layout = source.layout && typeof source.layout === "object" ? source.layout : {};
    const interaction = source.interaction && typeof source.interaction === "object" ? source.interaction : {};

    return {
        layout: {
            gapRem: clampNumber(layout.gapRem, 0, 3, exports.DEFAULT_SETTINGS.layout.gapRem)
        },
        interaction: {
            liveControls: typeof interaction.liveControls === "boolean"
                ? interaction.liveControls
                : exports.DEFAULT_SETTINGS.interaction.liveControls
        }
    };
}

// 主插件已提供统一设置页；此类只保留构造兼容，不渲染第二套设置。
class ImageGridSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        this.containerEl.empty();
    }
}
exports.ImageGridSettingTab = ImageGridSettingTab;

};

__igModules["./parser"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseImageLine = parseImageLine;
exports.looksLikeImageLine = looksLikeImageLine;

function parseWikiImageParts(markdown) {
    const match = String(markdown || "").match(/!\[\[([^\]]+)\]\]/);
    if (!match)
        return undefined;

    const parts = match[1].split("|").map(part => part.trim());
    const target = parts.shift() ?? "";
    if (!target)
        return undefined;

    let widthPx;
    const descriptionParts = [];

    for (const part of parts) {
        if (!part)
            continue;
        const size = part.match(/^(\d{1,4})(?:x\d{1,4})?$/i);
        if (size) {
            widthPx = Math.max(20, Math.min(4000, Number(size[1])));
            continue;
        }
        descriptionParts.push(part);
    }

    return {
        target,
        description: descriptionParts.join(" | ").trim(),
        widthPx,
        renderMarkdown: `![[${target}]]`
    };
}

function parseMarkdownImageParts(markdown) {
    const match = String(markdown || "").match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (!match)
        return undefined;

    const altParts = String(match[1] || "").split("|").map(part => part.trim()).filter(Boolean);
    let widthPx;
    const descriptionParts = [];

    for (const part of altParts) {
        const size = part.match(/^(\d{1,4})(?:x\d{1,4})?$/i);
        if (size) {
            widthPx = Math.max(20, Math.min(4000, Number(size[1])));
            continue;
        }
        descriptionParts.push(part);
    }

    return {
        description: descriptionParts.join(" | ").trim(),
        widthPx,
        renderMarkdown: markdown
    };
}

function parseImageLine(line) {
    const trimmed = String(line || "").trim();
    const attrMatch = trimmed.match(/^(.*?)(?:\s+\{([^{}]+)\})\s*$/);
    const rawMarkdown = attrMatch ? attrMatch[1].trim() : trimmed;
    const options = {};

    const wiki = parseWikiImageParts(rawMarkdown);
    const markdownImage = wiki ? undefined : parseMarkdownImageParts(rawMarkdown);

    let markdown = rawMarkdown;
    if (wiki) {
        markdown = wiki.renderMarkdown;
        if (wiki.widthPx !== undefined)
            options.widthPx = wiki.widthPx;
        if (wiki.description)
            options.description = wiki.description;
    }
    else if (markdownImage) {
        markdown = markdownImage.renderMarkdown;
        if (markdownImage.widthPx !== undefined)
            options.widthPx = markdownImage.widthPx;
        if (markdownImage.description)
            options.description = markdownImage.description;
    }

    // 仅兼容旧 scale=；下一次修改宽度时会迁移到原生 |宽度。
    if (attrMatch) {
        for (const token of attrMatch[2].trim().split(/\s+/)) {
            const eq = token.indexOf("=");
            if (eq <= 0)
                continue;
            const key = token.slice(0, eq).trim().toLowerCase();
            const value = token.slice(eq + 1).trim();
            if (key === "scale") {
                const n = Number(value.replace("%", ""));
                if (Number.isFinite(n))
                    options.scale = Math.min(300, Math.max(20, Math.round(n)));
            }
            else if (key === "caption-color") {
                if (/^#[0-9a-fA-F]{3,8}$/.test(value))
                    options.captionColor = value;
            }
            else if (key === "caption-size") {
                const n = Number(value.replace(/px$/i, ""));
                if (Number.isFinite(n))
                    options.captionSize = Math.min(48, Math.max(10, Math.round(n)));
            }
            else if (key === "rotate") {
                const n = Number(value.replace(/deg$/i, ""));
                if (Number.isFinite(n)) {
                    const normalized = ((Math.round(n) % 360) + 360) % 360;
                    options.rotate = normalized;
                }
            }
        }
    }

    return { markdown, rawMarkdown, options };
}

function looksLikeImageLine(line) {
    const markdown = parseImageLine(line).markdown;
    return /!\[\[[^\]]+\]\]/.test(markdown) || /!\[[^\]]*\]\([^)]+\)/.test(markdown);
}

};

__igModules["./main"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const view_1 = require("@codemirror/view");
const state_1 = require("@codemirror/state");
const settings_1 = require("./settings");
const parser_1 = require("./parser");
class ImageGridPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = settings_1.DEFAULT_SETTINGS;
        this.liveControlState = new Map();
        this.legacyLiveBlockObservers = new Set();
    }
    async onload() {
        await this.loadSettings();
        this.registerNoteClassMode();
        this.registerNoteClassLivePreview();
        this.registerBlocks();
        this.registerQuickCommands();
        this.addSettingTab(new settings_1.ImageGridSettingTab(this.app, this));
        this.register(() => {
            for (const observer of this.legacyLiveBlockObservers)
                observer.disconnect();
            this.legacyLiveBlockObservers.clear();
        });
    }
    async loadSettings() {
        const raw = await this.loadData();
        this.settings = (0, settings_1.normalizeSettings)(raw);
    }
    async saveSettings() {
        this.settings = (0, settings_1.normalizeSettings)(this.settings);
        await this.saveData(this.settings);
    }
    registerNoteClassMode() {
        this.registerMarkdownPostProcessor((el, ctx) => {
            try {
                const preview = el.closest(".markdown-preview-view");
                if (!preview || !preview.classList.contains("image-grid"))
                    return;
                this.enhanceNoteImageGroups(el);
            }
            catch (error) {
                console.error("[image-grid] 笔记级 image-grid 自动分组失败", error);
            }
        });
    }
    enhanceNoteImageGroups(root) {
        const paragraphs = [];
        if (root.matches?.("p"))
            paragraphs.push(root);
        for (const paragraph of Array.from(root.querySelectorAll("p")))
            paragraphs.push(paragraph);
        for (const paragraph of paragraphs) {
            if (paragraph.dataset.igAutoProcessed === "true" || paragraph.closest(".image-grid-block"))
                continue;
            const embeds = [];
            let imageOnly = true;
            for (const node of Array.from(paragraph.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    if ((node.textContent ?? "").trim().length > 0)
                        imageOnly = false;
                    continue;
                }
                if (!(node instanceof HTMLElement))
                    continue;
                if (node.tagName === "BR")
                    continue;
                if (node.matches(".internal-embed.image-embed, .image-embed")) {
                    embeds.push(node);
                    continue;
                }
                imageOnly = false;
            }
            if (!imageOnly || embeds.length < 2)
                continue;
            const mode = embeds.length <= 2 ? "grid2" : embeds.length === 3 ? "grid3" : "grid4";
            paragraph.dataset.igAutoProcessed = "true";
            paragraph.addClass("image-grid-block", `image-grid-${mode}`, "image-grid-auto-group");
            paragraph.dataset.igColumns = mode.replace("grid", "");
            this.applyBlockVariables(paragraph, mode);
            for (const embed of embeds)
                embed.addClass("image-grid-item", "image-grid-auto-item");
        }
    }
    registerNoteClassLivePreview() {
        const plugin = this;
        // Block Decoration 必须来自 StateField / decorations facet，
        // 不能由 ViewPlugin 的 decorations 提供，否则 CodeMirror 会抛出
        // “Block decorations may not be specified via plugins”。
        /**
         * Live Preview 不再尝试改变 CodeMirror 自身的 cm-line 排版。
         * CodeMirror 会持续重建/测量行 DOM，强行把 cm-content 改成 flex/grid
         * 在不同 Obsidian 版本和主题下都不可靠。
         *
         * 这里改用公开的 CodeMirror block widget：
         * - 连续 2 张及以上图片在光标不处于该组时，替换为真正的 grid 容器；
         * - 光标进入该组时自动还原 Markdown 行，保证可编辑；
         * - 点击网格非按钮区域可快速进入该组源码；
         * - 空行/普通文字天然成为组边界。
         */
        class NoteGridWidget extends view_1.WidgetType {
            constructor(group, sourcePath, mode, settingsKey, groupKey) {
                super();
                this.group = group;
                this.sourcePath = sourcePath;
                this.mode = mode;
                this.settingsKey = settingsKey;
                this.groupKey = groupKey;
                this.component = undefined;
            }
            eq(other) {
                return other instanceof NoteGridWidget
                    && other.sourcePath === this.sourcePath
                    && other.mode === this.mode
                    && other.settingsKey === this.settingsKey
                    && other.groupKey === this.groupKey
                    && other.group.length === this.group.length
                    && other.group.every((entry, index) => entry.text === this.group[index]?.text && entry.from === this.group[index]?.from);
            }
            toDOM(view) {
                const block = document.createElement("div");
                block.className = `image-grid-block image-grid-${this.mode} image-grid-live-widget`;
                block.dataset.igColumns = this.mode.replace("grid", "");
                block.setAttribute("contenteditable", "false");
                plugin.applyBlockVariables(block, this.mode);

                const component = new obsidian_1.Component();
                component.load();
                this.component = component;

                const sourceLines = this.group.map(entry => entry.text);
                const sourceContext = {
                    source: sourceLines.join("\n"),
                    sourceLines,
                    sourcePath: this.sourcePath,
                    sourceLineStart: this.group[0].number - 1,
                    mode: "note"
                };

                this.group.forEach((entry, index) => {
                    const parsed = (0, parser_1.parseImageLine)(entry.text);
                    const item = block.createDiv({ cls: "image-grid-item image-grid-live-widget-item" });
                    item.dataset.igSourceIndex = String(index);
                    item.dataset.igIndex = String(index + 1);
                    item.dataset.igLine = String(entry.number);
                    item.setAttribute("title", `图片 ${index + 1} · 点击进入第 ${entry.number} 行源码`);
                    item.setAttribute("aria-label", `图片 ${index + 1}，点击进入对应源码行`);
                    plugin.applyItemVariables(item, parsed.options);
                    void obsidian_1.MarkdownRenderer.render(plugin.app, parsed.markdown, item, this.sourcePath, component)
                        .then(() => {
                        if (parsed.options.widthPx !== undefined)
                            plugin.applyRenderedNativeWidth(item, parsed.options.widthPx);
                        if (parsed.options.rotate !== undefined)
                            plugin.applyRenderedRotation(item, parsed.options.rotate);
                        if (parsed.options.description)
                            plugin.applyRenderedDescription(item, parsed.options.description, parsed.options.widthPx, parsed.options.captionColor, parsed.options.captionSize);
                        plugin.enhanceRenderedItem(item, parsed.options, sourceContext, index);
                    })
                        .catch(error => {
                        console.error("[image-grid] Live Preview 网格图片渲染失败", error);
                        item.empty();
                        item.createDiv({ cls: "image-grid-error", text: "图片渲染失败" });
                    });
                });

                // 点击图片主体可进入对应源码行；悬停工具栏/弹层内部点击不触发退出。
                block.addEventListener("pointerdown", event => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement))
                        return;
                    if (target.closest("button, input, .image-grid-live-controls, .image-grid-live-ratio-menu, .image-grid-live-scale-menu"))
                        return;
                    const item = target.closest(".image-grid-live-widget-item");
                    const lineNumber = item instanceof HTMLElement ? Number(item.dataset.igLine) : this.group[0].number;
                    const entry = this.group.find(candidate => candidate.number === lineNumber) ?? this.group[0];
                    event.preventDefault();
                    event.stopPropagation();
                    view.dispatch({
                        selection: { anchor: entry.from },
                        scrollIntoView: true
                    });
                    view.focus();
                });

                return block;
            }
            destroy() {
                if (this.component) {
                    this.component.unload();
                    this.component = undefined;
                }
            }
            ignoreEvent() {
                return false;
            }
        }

        const settingsKey = () => JSON.stringify({
            gap: plugin.settings.layout.gapRem,
            controls: plugin.settings.interaction.liveControls
        });

        const buildDecorations = (state) => {
            if (!plugin.editorDocumentHasImageGridClass(state.doc.toString()))
                return view_1.Decoration.none;

            const groups = [];
            let current = [];

            for (let number = 1; number <= state.doc.lines; number += 1) {
                const line = state.doc.line(number);
                if (plugin.isPureImageLine(line.text)) {
                    current.push({ number, from: line.from, to: line.to, text: line.text });
                    continue;
                }

                // 空行或任何非纯图片内容都立即结束当前组。
                if (current.length > 0) {
                    groups.push(current);
                    current = [];
                }
            }

            if (current.length > 0)
                groups.push(current);

            const ranges = [];
            const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? "";
            const selectionRanges = state.selection.ranges;

            for (const group of groups) {
                const count = group.length;
                const first = group[0];
                const last = group[group.length - 1];

                const selectionInside = selectionRanges.some(range => {
                    const head = range.head;
                    const anchor = range.anchor;
                    return (head >= first.from && head <= last.to)
                        || (anchor >= first.from && anchor <= last.to);
                });

                // 单图始终保留原生 Markdown 行。
                // 多图只有当光标真正进入该组时才展开源码，离开后恢复网格。
                if (count === 1 || selectionInside) {
                    group.forEach(entry => {
                        ranges.push(view_1.Decoration.line({
                            attributes: {
                                class: "image-grid-live-note-line image-grid-item image-grid-live-note-single",
                                "data-ig-line": String(entry.number),
                                style: `--ig-gap:${plugin.settings.layout.gapRem}rem;--ig-scale:${plugin.settings.layout.scalePercent}%;`
                            }
                        }).range(entry.from));
                    });
                    continue;
                }

                const mode = count === 2 ? "grid2" : count === 3 ? "grid3" : "grid4";
                const groupKey = `${sourcePath}:${first.from}:${last.to}`;
                const widget = new NoteGridWidget(group, sourcePath, mode, settingsKey(), groupKey);

                // block replace 的起止位置必须落在完整行边界。
                // 包含末尾换行，使下一段正文保持独立。
                let to = last.to;
                if (last.number < state.doc.lines)
                    to += 1;

                ranges.push(view_1.Decoration.replace({
                    widget,
                    block: true,
                    inclusive: false
                }).range(first.from, to));
            }

            return view_1.Decoration.set(ranges, true);
        };

        const decorationField = state_1.StateField.define({
            create(state) {
                return buildDecorations(state);
            },
            update(_decorations, transaction) {
                // 文档、选择以及插件设置影响布局时，始终从当前 EditorState 重建。
                // 对图片组规模通常很小，这比在 block decoration 上做脆弱的增量映射更可靠。
                return buildDecorations(transaction.state);
            },
            provide(field) {
                return view_1.EditorView.decorations.from(field);
            }
        });

        this.registerEditorExtension(decorationField);


        // 单图或光标进入图片组时使用 Obsidian 原生图片 DOM，继续挂载现有按钮。
        const ensureFromEvent = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement))
                return;
            const line = target.closest(".markdown-source-view.mod-cm6.is-live-preview .cm-line.image-grid-live-note-line");
            if (!(line instanceof HTMLElement))
                return;
            void this.ensureNoteLiveControls(line);
        };
        this.registerDomEvent(document, "pointerover", ensureFromEvent, true);
        this.registerDomEvent(document, "focusin", ensureFromEvent, true);
    }

    editorDocumentHasImageGridClass(text) {
        const normalized = text.replace(/\r\n/g, "\n");
        if (!normalized.startsWith("---\n"))
            return false;
        const end = normalized.indexOf("\n---", 4);
        if (end < 0)
            return false;
        const frontmatter = normalized.slice(4, end).split("\n");
        let collecting = false;
        const values = [];
        for (const rawLine of frontmatter) {
            const line = rawLine.replace(/\t/g, "  ");
            if (!collecting) {
                const match = line.match(/^cssclasses\s*:\s*(.*)$/i);
                if (!match)
                    continue;
                collecting = true;
                if (match[1].trim())
                    values.push(match[1].trim());
                continue;
            }
            if (/^[A-Za-z0-9_-]+\s*:/.test(line) && !/^\s/.test(line))
                break;
            if (/^\s+/.test(line) || /^\s*-\s*/.test(line))
                values.push(line.trim());
        }
        return values
            .join(" ")
            .replace(/[\[\]",']/g, " ")
            .split(/\s+/)
            .some(value => value.replace(/^-+/, "").trim() === "image-grid");
    }
    isPureImageLine(line) {
        const parsed = (0, parser_1.parseImageLine)(line);
        const markdown = parsed.markdown.trim();
        if (!markdown)
            return false;
        const imagePattern = /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g;
        const matches = markdown.match(imagePattern);
        if (!matches || matches.length === 0)
            return false;
        return markdown.replace(imagePattern, "").trim().length === 0;
    }
    async ensureNoteLiveControls(line) {
        if (line.dataset.igControlsReady === "true" || !this.settings.interaction.liveControls)
            return;
        const sourceView = line.closest(".markdown-source-view.mod-cm6.is-live-preview");
        if (!sourceView)
            return;
        const lineNumber = Number(line.dataset.igLine);
        if (!Number.isInteger(lineNumber) || lineNumber < 1)
            return;
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof obsidian_1.TFile))
            return;
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor)
            return;
        const sourceLine = activeEditor.getLine(lineNumber - 1);
        if (!this.isPureImageLine(sourceLine))
            return;
        const image = line.querySelector("img");
        if (!image)
            return;
        line.dataset.igControlsReady = "true";
        const parsed = (0, parser_1.parseImageLine)(sourceLine);
        this.applyItemVariables(line, parsed.options);
        if (parsed.options.widthPx !== undefined)
            this.applyRenderedNativeWidth(line, parsed.options.widthPx);
        if (parsed.options.description)
            this.applyRenderedDescription(line, parsed.options.description, parsed.options.widthPx, parsed.options.captionColor, parsed.options.captionSize);
        const sourceContext = {
            source: sourceLine,
            sourceLines: [sourceLine],
            sourcePath: file.path,
            sourceLineStart: lineNumber - 1,
            mode: "note"
        };
        this.enhanceRenderedItem(line, parsed.options, sourceContext, 0);
    }
    registerBlocks() {
        this.registerMarkdownCodeBlockProcessor("img-grid", async (source, el, ctx) => {
            await this.renderGridBlock(source, el, ctx, "grid2");
        });
        this.registerMarkdownCodeBlockProcessor("img-grid-3", async (source, el, ctx) => {
            await this.renderGridBlock(source, el, ctx, "grid3");
        });
        this.registerMarkdownCodeBlockProcessor("img-grid-4", async (source, el, ctx) => {
            await this.renderGridBlock(source, el, ctx, "grid4");
        });
    }
    registerQuickCommands() {
        // 已融合到 Image Workflow：日常操作统一由 Live Preview 工具条和主插件命令负责。
    }
    getNativeWidthFromLine(line) {
        const parsed = (0, parser_1.parseImageLine)(line);
        return parsed.options.widthPx;
    }
    getNativeSizePresets() {
        const supplied = typeof this.getWikiSizePresets === "function" ? this.getWikiSizePresets() : undefined;
        const values = Array.isArray(supplied) ? supplied : [300, 400, 500, 600, 800];
        const clean = Array.from(new Set(values
            .map(value => Math.round(Number(value)))
            .filter(value => Number.isFinite(value) && value >= 20 && value <= 4000)))
            .sort((a, b) => a - b);
        return clean.length > 0 ? clean : [300, 400, 500, 600, 800];
    }
    getDefaultNativeWidth() {
        const supplied = typeof this.getWikiDefaultWidth === "function" ? Number(this.getWikiDefaultWidth()) : NaN;
        return Number.isFinite(supplied) ? Math.max(20, Math.min(4000, Math.round(supplied))) : 500;
    }
    setImageScale(line, width) {
        const value = Math.max(20, Math.min(4000, Math.round(Number(width))));
        const leading = line.match(/^\s*/)?.[0] ?? "";
        const trailing = line.match(/\s*$/)?.[0] ?? "";
        const core = line.trim();
        const attrMatch = core.match(/^(.*?)(?:\s+\{([^{}]+)\})\s*$/);
        let markdown = (attrMatch ? attrMatch[1] : core).trimEnd();
        let attrs = attrMatch ? attrMatch[2].trim().split(/\s+/).filter(Boolean) : [];

        // 大小统一迁移到 Obsidian 原生语法，移除旧 scale= 参数。
        attrs = attrs.filter(token => {
            const key = token.split("=", 1)[0]?.toLowerCase();
            return key !== "scale" && key !== "ratio" && key !== "aspect";
        });

        let changed = false;
        markdown = markdown.replace(/!\[\[([^\]]+)\]\]/, (_full, body) => {
            const parts = String(body).split("|").map(part => part.trim()).filter(Boolean);
            const target = parts.shift() ?? "";
            const suffix = parts.filter(part => !/^\d{2,4}(?:x\d{2,4})?$/i.test(part));
            suffix.push(String(value));
            changed = true;
            return `![[${[target, ...suffix].join("|")}]]`;
        });

        // 外链 Markdown 图片也使用 Obsidian 支持的 alt|宽度 形式。
        if (!changed) {
            markdown = markdown.replace(/!\[([^\]]*)\](\([^)]+\))/, (_full, alt, destination) => {
                const parts = String(alt).split("|").map(part => part.trim()).filter(Boolean)
                    .filter(part => !/^\d{2,4}(?:x\d{2,4})?$/i.test(part));
                parts.push(String(value));
                changed = true;
                return `![${parts.join("|")}]${destination}`;
            });
        }

        if (!changed)
            return line;

        const attrText = attrs.length > 0 ? ` {${attrs.join(" ")}}` : "";
        return `${leading}${markdown}${attrText}${trailing}`;
    }
    collectTargetImageLines(editor) {
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        const start = Math.min(from.line, to.line);
        const end = Math.max(from.line, to.line);
        const targets = [];
        const noteClassMode = this.editorDocumentHasImageGridClass(editor.getValue());
        for (let line = start; line <= end; line += 1) {
            const sourceLine = editor.getLine(line);
            const inLegacyBlock = this.isLineInsideGridBlock(editor, line);
            const inNoteClass = noteClassMode && this.isPureImageLine(sourceLine);
            if ((inLegacyBlock || inNoteClass) && (0, parser_1.looksLikeImageLine)(sourceLine))
                targets.push(line);
        }
        return targets;
    }
    isLineInsideGridBlock(editor, targetLine) {
        let insideGrid = false;
        for (let line = 0; line <= targetLine; line += 1) {
            const text = editor.getLine(line).trim();
            if (/^```img-grid(?:-3|-4)?(?:\s.*)?$/.test(text)) {
                insideGrid = true;
                continue;
            }
            if (insideGrid && /^```\s*$/.test(text))
                insideGrid = false;
        }
        return insideGrid;
    }
    async renderGridBlock(source, el, ctx, mode) {
        const section = ctx.getSectionInfo(el);
        const sourceLines = source.split(/\r?\n/);
        const directive = this.resolveColumnsDirective(sourceLines, mode);
        const effectiveMode = directive.mode;
        const sourceContext = {
            source,
            sourceLines,
            sourcePath: ctx.sourcePath,
            sourceLineStart: section?.lineStart,
            mode
        };
        el.empty();
        const block = el.createDiv({ cls: `image-grid-block image-grid-${effectiveMode}` });
        block.dataset.igColumns = effectiveMode.replace("grid", "");
        this.applyBlockVariables(block, effectiveMode);
        const nonEmptyLines = sourceContext.sourceLines
            .map((line, sourceIndex) => ({ line, sourceIndex, parsed: (0, parser_1.parseImageLine)(line) }))
            .filter(entry => entry.line.trim().length > 0 && entry.sourceIndex !== directive.sourceIndex);
        if (nonEmptyLines.length === 0) {
            block.createDiv({ cls: "image-grid-empty", text: "这个代码块里还没有图片。" });
            return;
        }

        // legacy img-grid-*：列宽由内容本身决定。
        // 有 |宽度 的 item 使用该真实宽度；没有宽度则使用图片自然尺寸。
        // 整个网格允许 max-content 横向突破正文，但各列之间不会覆盖。
        const columnCount = effectiveMode === "grid4" ? 4 : effectiveMode === "grid3" ? 3 : 2;
        block.style.gridTemplateColumns = `repeat(${columnCount}, max-content)`;
        block.style.width = "max-content";
        block.style.maxWidth = "none";
        block.style.overflow = "visible";

        for (const { line, sourceIndex, parsed } of nonEmptyLines) {
            const item = block.createDiv({ cls: "image-grid-item image-grid-legacy-item" });
            item.dataset.igSourceIndex = String(sourceIndex);
            const itemWidth = Number(parsed.options.widthPx);
            if (Number.isFinite(itemWidth)) {
                item.dataset.igWidth = String(Math.round(itemWidth));
                item.style.width = `${Math.round(itemWidth)}px`;
                item.style.maxWidth = "none";
            }
            item.style.justifySelf = "start";
            this.applyItemVariables(item, parsed.options);
            try {
                await obsidian_1.MarkdownRenderer.render(this.app, parsed.markdown, item, ctx.sourcePath, this);
                if (parsed.options.widthPx !== undefined)
                    this.applyRenderedNativeWidth(item, parsed.options.widthPx);
                if (parsed.options.rotate !== undefined)
                    this.applyRenderedRotation(item, parsed.options.rotate);
                if (parsed.options.description)
                    this.applyRenderedDescription(item, parsed.options.description, parsed.options.widthPx, parsed.options.captionColor, parsed.options.captionSize);
                this.enhanceRenderedItem(item, parsed.options, sourceContext, sourceIndex);
            }
            catch (error) {
                console.error("[image-grid] 图片渲染失败", error);
                item.empty();
                item.createDiv({ cls: "image-grid-error", text: "图片渲染失败，请检查图片链接语法。" });
            }
        }

        this.attachLegacyLiveCodeBlockSizing(el, block);
    }
    attachLegacyLiveCodeBlockSizing(el, block) {
        const findFrame = () => {
            let node = el.parentElement;
            let fallback = null;
            let depth = 0;

            while (node && depth < 10) {
                if (node.classList.contains("cm-content")
                    || node.classList.contains("cm-scroller")
                    || node.classList.contains("cm-editor")) {
                    break;
                }

                if (node.classList.contains("cm-embed-block")
                    || node.classList.contains("cm-preview-code-block")
                    || node.classList.contains("HyperMD-codeblock")
                    || node.matches?.("[class*='cm-embed-block']")
                    || node.matches?.("[class*='cm-preview-code-block']")) {
                    return node;
                }

                const style = window.getComputedStyle(node);
                const hasBorder =
                    parseFloat(style.borderLeftWidth) > 0
                    || parseFloat(style.borderRightWidth) > 0
                    || parseFloat(style.borderTopWidth) > 0
                    || parseFloat(style.borderBottomWidth) > 0;

                if (hasBorder)
                    fallback = node;

                node = node.parentElement;
                depth += 1;
            }

            return fallback;
        };

        const sync = () => {
            if (!el.isConnected || !block.isConnected)
                return;

            const frame = findFrame();
            if (!(frame instanceof HTMLElement))
                return;

            el.classList.add("image-grid-legacy-live-root");
            frame.classList.add("image-grid-legacy-live-frame");

            if (!frame.dataset.igNaturalWidth) {
                const natural = Math.ceil(frame.getBoundingClientRect().width);
                if (natural > 0)
                    frame.dataset.igNaturalWidth = String(natural);
            }

            // 清除上一轮插件写入值，再按当前真实网格重新测量。
            frame.style.removeProperty("width");
            frame.style.removeProperty("min-width");
            frame.style.removeProperty("max-width");

            const frameRect = frame.getBoundingClientRect();
            const blockRect = block.getBoundingClientRect();
            const naturalWidth = Number(frame.dataset.igNaturalWidth) || Math.ceil(frameRect.width);

            const frameStyle = window.getComputedStyle(frame);
            const rightPadding = parseFloat(frameStyle.paddingRight) || 0;
            const rightBorder = parseFloat(frameStyle.borderRightWidth) || 0;

            const contentRight = Math.ceil(
                blockRect.right - frameRect.left + rightPadding + rightBorder
            );
            const desiredWidth = Math.max(naturalWidth, contentRight);

            frame.style.setProperty("width", `${desiredWidth}px`, "important");
            frame.style.setProperty("min-width", `${naturalWidth}px`, "important");
            frame.style.setProperty("max-width", "none", "important");
            frame.style.setProperty("overflow", "visible", "important");
            frame.style.setProperty("box-sizing", "border-box", "important");

            const rootWidth = Math.max(block.scrollWidth, Math.ceil(blockRect.width));
            el.style.setProperty("width", `${rootWidth}px`, "important");
            el.style.setProperty("max-width", "none", "important");
            el.style.setProperty("overflow", "visible", "important");
        };

        // processor 触发时宿主可能还未挂入 CodeMirror，分时重试。
        window.requestAnimationFrame(sync);
        window.setTimeout(sync, 60);
        window.setTimeout(sync, 180);

        // 图片宽度变化后，自动重新计算代码块外框。
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => {
                if (!el.isConnected) {
                    observer.disconnect();
                    this.legacyLiveBlockObservers.delete(observer);
                    return;
                }
                window.requestAnimationFrame(sync);
            });
            observer.observe(block);
            this.legacyLiveBlockObservers.add(observer);
        }
    }

    resolveColumnsDirective(lines, fallbackMode) {
        let sourceIndex;
        let rawValue;
        for (let index = 0; index < lines.length; index += 1) {
            const trimmed = lines[index].trim();
            if (!trimmed)
                continue;
            const match = trimmed.match(/^(?:columns|cols)\s*=\s*(auto|2|3|4)$/i);
            if (match) {
                sourceIndex = index;
                rawValue = match[1].toLowerCase();
            }
            break;
        }
        if (!rawValue)
            return { mode: fallbackMode, sourceIndex: undefined };
        if (rawValue === "2")
            return { mode: "grid2", sourceIndex };
        if (rawValue === "3")
            return { mode: "grid3", sourceIndex };
        if (rawValue === "4")
            return { mode: "grid4", sourceIndex };
        const imageCount = lines.filter((line, index) => index !== sourceIndex && (0, parser_1.looksLikeImageLine)(line)).length;
        if (imageCount <= 2)
            return { mode: "grid2", sourceIndex };
        if (imageCount === 3)
            return { mode: "grid3", sourceIndex };
        return { mode: "grid4", sourceIndex };
    }
    enhanceRenderedItem(item, options, sourceContext, sourceIndex) {
        const primaryImage = item.querySelector("img");
        if (!primaryImage)
            return;

        if (options.widthPx !== undefined)
            this.applyRenderedNativeWidth(item, options.widthPx);
        if (options.rotate !== undefined)
            this.applyRenderedRotation(item, options.rotate);
        if (options.description)
            this.applyRenderedDescription(item, options.description, options.widthPx, options.captionColor, options.captionSize);

        if (!this.settings.interaction.liveControls)
            return;

        const inLivePreview = Boolean(
            item.closest?.(".markdown-source-view.mod-cm6.is-live-preview")
            || item.hasClass?.("image-grid-live-widget-item")
            || item.closest?.(".image-grid-live-widget")
        );
        if (inLivePreview)
            this.createLiveControls(item, options, sourceContext, sourceIndex);
    }
    createLiveControls(item, options, sourceContext, sourceIndex) {
        const controlKey = `${sourceContext.sourcePath}:${sourceContext.sourceLineStart ?? sourceContext.mode}:${sourceIndex}`;
        const rememberedState = this.liveControlState.get(controlKey);
        if (rememberedState && Date.now() - rememberedState.at < 5000) {
            item.addClass("is-scale-menu-open");
        }
        else if (rememberedState) {
            this.liveControlState.delete(controlKey);
        }
        const rememberMenu = (menu) => {
            const state = { menu, at: Date.now() };
            this.liveControlState.set(controlKey, state);
            window.setTimeout(() => {
                if (this.liveControlState.get(controlKey) === state)
                    this.liveControlState.delete(controlKey);
            }, 5000);
        };
        const forgetMenu = () => this.liveControlState.delete(controlKey);
        const toolbar = item.createDiv({ cls: "image-grid-live-controls" });
        toolbar.setAttr("role", "toolbar");
        toolbar.setAttr("aria-label", "图片宽度与说明快捷调整");
        const sourceLine = sourceContext.sourceLines?.[sourceIndex] ?? sourceContext.source ?? "";
        let currentScale = this.getNativeWidthFromLine(sourceLine) ?? this.getDefaultNativeWidth();
        if (!Number.isFinite(currentScale))
            currentScale = this.getDefaultNativeWidth();
        const stop = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        const minus = toolbar.createEl("button", {
            cls: "image-grid-live-icon",
            text: "−",
            attr: { type: "button", "aria-label": "缩小图片宽度 50px", title: "缩小 50px" }
        });
        const scaleLabel = toolbar.createEl("button", {
            cls: "image-grid-live-value",
            text: `${currentScale}px`,
            attr: { type: "button", "aria-label": "选择图片宽度", title: "选择图片宽度" }
        });
        const plus = toolbar.createEl("button", {
            cls: "image-grid-live-icon",
            text: "+",
            attr: { type: "button", "aria-label": "放大图片宽度 50px", title: "放大 50px" }
        });
        const descriptionButton = toolbar.createEl("button", {
            cls: "image-grid-live-description",
            text: "标题",
            attr: { type: "button", "aria-label": "修改图片标题", title: "修改图片标题" }
        });
        descriptionButton.addEventListener("click", event => {
            stop(event);
            item.removeClass("is-scale-menu-open");
            forgetMenu();
            if (typeof this.openImageDescriptionAtSource === "function") {
                this.openImageDescriptionAtSource(sourceContext, sourceIndex);
            }
            else {
                new obsidian_1.Notice("图片说明功能暂不可用。");
            }
        });

        const scaleMenu = item.createDiv({ cls: "image-grid-live-scale-menu" });
        scaleMenu.setAttr("role", "menu");
        const scaleMenuHead = scaleMenu.createDiv({ cls: "image-grid-live-scale-menu-head" });
        scaleMenuHead.createEl("strong", { text: "图片宽度" });
        scaleMenuHead.createSpan({ text: "写入 Obsidian 原生 |宽度" });
        const scaleChoices = scaleMenu.createDiv({ cls: "image-grid-live-scale-options" });
        const updateScaleChoice = () => {
            for (const button of Array.from(scaleChoices.querySelectorAll("button[data-ig-scale]"))) {
                button.toggleClass("is-active", Number(button.dataset.igScale) === currentScale);
            }
        };
        for (const preset of this.getNativeSizePresets()) {
            const button = scaleChoices.createEl("button", {
                text: `${preset}`,
                cls: "image-grid-live-scale-option",
                attr: { type: "button", "aria-label": `设置图片宽度 ${preset}px` }
            });
            button.dataset.igScale = String(preset);
            button.addEventListener("click", event => {
                stop(event);
                rememberMenu("scale");
                void applyScale(preset).then(() => updateScaleChoice());
            });
        }
        const applyScale = async (next) => {
            currentScale = Math.max(100, Math.min(4000, Math.round(Number(next) / 10) * 10));
            this.applyRenderedNativeWidth(item, currentScale);
            const ok = await this.persistRenderedScale(item, sourceContext, sourceIndex, currentScale);
            if (ok) {
                scaleLabel.setText(`${currentScale}px`);
                updateScaleChoice();
            }
        };
        minus.addEventListener("click", event => {
            stop(event);
            rememberMenu("scale");
            void applyScale(currentScale - 50);
        });
        plus.addEventListener("click", event => {
            stop(event);
            rememberMenu("scale");
            void applyScale(currentScale + 50);
        });
        scaleLabel.setAttr("aria-label", "选择图片大小");
        scaleLabel.setAttr("title", "选择图片大小");
        scaleLabel.addEventListener("click", event => {
            stop(event);
            const nextOpen = !item.hasClass("is-scale-menu-open");
            item.toggleClass("is-scale-menu-open", nextOpen);
            if (nextOpen) {
                rememberMenu("scale");
                updateScaleChoice();
            }
            else {
                forgetMenu();
            }
        });
        scaleMenu.addEventListener("pointerdown", stop);
        toolbar.addEventListener("pointerdown", stop);
        scaleMenu.addEventListener("click", event => event.stopPropagation());
        item.addEventListener("keydown", event => {
            if (event.key !== "Escape")
                return;
            item.removeClass("is-scale-menu-open");
            forgetMenu();
        });
    }
    applyRenderedRotation(item, rotation) {
        const value = Number(rotation);
        if (!Number.isFinite(value))
            return;

        const normalized = ((Math.round(value) % 360) + 360) % 360;
        const image = item.querySelector("img");
        if (!image)
            return;

        image.style.setProperty("--iwt-image-rotation", `${normalized}deg`);
        image.style.setProperty("transform", `rotate(${normalized}deg)`, "important");
        image.style.setProperty("transform-origin", "center center", "important");
    }

    renderCaptionInline(caption, text) {
        caption.empty();
        const source = String(text || "");
        const token = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*)/g;
        let last = 0;
        let match;

        while ((match = token.exec(source)) !== null) {
            if (match.index > last)
                caption.appendText(source.slice(last, match.index));

            const raw = match[0];
            if (raw.startsWith("**")) {
                caption.createEl("strong", { text: raw.slice(2, -2) });
            }
            else if (raw.startsWith("~~")) {
                caption.createEl("s", { text: raw.slice(2, -2) });
            }
            else {
                caption.createEl("em", { text: raw.slice(1, -1) });
            }
            last = match.index + raw.length;
        }

        if (last < source.length)
            caption.appendText(source.slice(last));
    }

    applyRenderedDescription(item, description, width, captionColor, captionSize) {
        const text = String(description || "").trim();
        for (const old of Array.from(item.querySelectorAll(".image-grid-caption")))
            old.remove();
        if (!text)
            return;

        const image = item.querySelector("img");
        if (!image)
            return;

        const wrapper = image.closest(".internal-embed.image-embed, .image-embed, .internal-embed")
            || image.parentElement
            || item;

        wrapper.classList.add("image-grid-caption-host");
        const numericWidth = Number(width);
        const allowOverflow = item.hasClass?.("image-grid-legacy-item") || item.classList?.contains("image-grid-legacy-item");

        if (Number.isFinite(numericWidth) && numericWidth > 0) {
            const resolved = `${Math.round(numericWidth)}px`;
            const finalWidth = allowOverflow ? resolved : `min(${resolved}, 100%)`;
            wrapper.style.setProperty("width", finalWidth, "important");
            wrapper.style.setProperty("max-width", allowOverflow ? "none" : "100%", "important");
            wrapper.style.setProperty("box-sizing", "border-box", "important");
            item.style.setProperty("width", finalWidth, "important");
        }

        const caption = document.createElement("span");
        caption.className = "image-grid-caption";

        if (/^#[0-9a-fA-F]{3,8}$/.test(String(captionColor || "")))
            caption.style.setProperty("color", String(captionColor), "important");

        const size = Number(captionSize);
        if (Number.isFinite(size))
            caption.style.setProperty("font-size", `${Math.min(48, Math.max(10, Math.round(size)))}px`, "important");

        this.renderCaptionInline(caption, text);

        if (Number.isFinite(numericWidth) && numericWidth > 0) {
            caption.style.width = allowOverflow
                ? `${Math.round(numericWidth)}px`
                : `min(${Math.round(numericWidth)}px, 100%)`;
        }

        wrapper.appendChild(caption);
    }

    applyRenderedNativeWidth(item, width) {
        const value = Math.max(20, Math.min(4000, Math.round(Number(width))));
        item.style.setProperty("--ig-item-width", `${value}px`);
        item.dataset.igWidth = String(value);

        // 仅 legacy img-grid / img-grid-3 / img-grid-4 允许突破正文宽度。
        const allowOverflow = item.hasClass?.("image-grid-legacy-item") || item.classList?.contains("image-grid-legacy-item");

        const wrappers = Array.from(item.querySelectorAll("p, .internal-embed, .image-embed"));
        for (const wrapper of wrappers) {
            wrapper.style.setProperty("width", allowOverflow ? `${value}px` : `min(${value}px, 100%)`, "important");
            wrapper.style.setProperty("max-width", allowOverflow ? "none" : "100%", "important");
            wrapper.style.setProperty("overflow", allowOverflow ? "visible" : "hidden", "important");
            wrapper.style.setProperty("box-sizing", "border-box", "important");
        }

        item.style.setProperty("width", allowOverflow ? `${value}px` : `min(${value}px, 100%)`, "important");
        item.style.setProperty("max-width", allowOverflow ? "none" : "100%", "important");
        item.style.setProperty("box-sizing", "border-box", "important");

        const apply = () => {
            const images = Array.from(item.querySelectorAll("img"));
            for (const image of images) {
                image.style.setProperty("width", allowOverflow ? `${value}px` : `min(${value}px, 100%)`, "important");
                image.style.setProperty("min-width", allowOverflow ? `${value}px` : "0", "important");
                image.style.setProperty("max-width", allowOverflow ? "none" : "100%", "important");
                image.style.setProperty("height", "auto", "important");
                image.style.setProperty("object-fit", "contain", "important");
                image.style.setProperty("margin-left", "auto", "important");
                image.style.setProperty("margin-right", "auto", "important");
                image.removeAttribute("width");
                image.removeAttribute("height");
            }
        };

        apply();
        window.requestAnimationFrame(() => apply());
        window.setTimeout(() => apply(), 80);
    }

    async persistRenderedScale(item, sourceContext, sourceIndex, scale) {
        try {
            if (sourceContext.mode === "note" && sourceContext.sourceLineStart !== undefined) {
                const editor = this.app.workspace.activeEditor?.editor;
                const file = this.app.workspace.getActiveFile();
                const targetLine = sourceContext.sourceLineStart + sourceIndex;
                if (!editor || !(file instanceof obsidian_1.TFile) || file.path !== sourceContext.sourcePath) {
                    new obsidian_1.Notice("当前编辑器已切换，未修改图片大小。");
                    return false;
                }
                const original = editor.getLine(targetLine);
                if (!(0, parser_1.looksLikeImageLine)(original)) {
                    new obsidian_1.Notice("图片源码已变化，未修改大小。");
                    return false;
                }
                const updated = this.setImageScale(original, scale);
                editor.replaceRange(updated, { line: targetLine, ch: 0 }, { line: targetLine, ch: original.length });
                this.applyRenderedNativeWidth(item, scale);
                return true;
            }
            const file = this.app.vault.getAbstractFileByPath(sourceContext.sourcePath);
            if (!(file instanceof obsidian_1.TFile)) {
                new obsidian_1.Notice("找不到当前笔记文件，无法写回图片大小。");
                return false;
            }
            const content = await this.app.vault.read(file);
            const newline = content.includes("\r\n") ? "\r\n" : "\n";
            const lines = content.split(/\r?\n/);
            let targetLine;
            if (sourceContext.mode === "note" && sourceContext.sourceLineStart !== undefined) {
                targetLine = sourceContext.sourceLineStart + sourceIndex;
            }
            else {
                const blockStart = this.findSourceBlockStart(lines, sourceContext);
                if (blockStart === undefined) {
                    new obsidian_1.Notice("无法定位图片源码，请重新进入实时阅览后再试。");
                    return false;
                }
                targetLine = blockStart + 1 + sourceIndex;
            }
            const original = lines[targetLine];
            if (original === undefined || !(0, parser_1.looksLikeImageLine)(original)) {
                new obsidian_1.Notice("源码已发生变化，未修改图片大小。");
                return false;
            }
            lines[targetLine] = this.setImageScale(original, scale);
            await this.app.vault.modify(file, lines.join(newline));
            this.applyRenderedNativeWidth(item, scale);
            return true;
        }
        catch (error) {
            console.error("[image-grid] 实时写回图片大小失败", error);
            new obsidian_1.Notice("写回图片大小失败，请查看控制台错误信息。");
            return false;
        }
    }
    findSourceBlockStart(lines, context) {
        const fence = this.modeFence(context.mode);
        const candidates = [];
        for (let index = 0; index < lines.length; index += 1) {
            if (this.isModeFence(lines[index], fence))
                candidates.push(index);
        }
        if (candidates.length === 0)
            return undefined;
        const exact = candidates.filter(start => this.blockBodyMatches(lines, start, context.sourceLines));
        const pool = exact.length > 0 ? exact : candidates;
        if (context.sourceLineStart === undefined)
            return pool[0];
        return pool.reduce((best, current) => Math.abs(current - context.sourceLineStart) < Math.abs(best - context.sourceLineStart) ? current : best);
    }
    blockBodyMatches(lines, start, sourceLines) {
        for (let offset = 0; offset < sourceLines.length; offset += 1) {
            const actual = lines[start + 1 + offset];
            if (actual === undefined || actual.trimEnd() !== sourceLines[offset].trimEnd())
                return false;
        }
        return /^```\s*$/.test((lines[start + 1 + sourceLines.length] ?? "").trim());
    }
    modeFence(mode) {
        if (mode === "grid3")
            return "img-grid-3";
        if (mode === "grid4")
            return "img-grid-4";
        return "img-grid";
    }
    isModeFence(line, fence) {
        const trimmed = line.trim();
        const prefix = `\`\`\`${fence}`;
        if (!trimmed.startsWith(prefix))
            return false;
        return trimmed.length === prefix.length || /\s/.test(trimmed.charAt(prefix.length));
    }
    applyBlockVariables(el, mode) {
        el.style.setProperty("--ig-gap", `${this.settings.layout.gapRem}rem`);
        if (mode === "grid2") {
            el.style.setProperty("--ig-left", "1fr");
            el.style.setProperty("--ig-right", "1fr");
        }
    }
    applyItemVariables(el, options) {
        // 1.1.6：展示逻辑统一为“原图比例 + 原生 Wiki 宽度”。
        // 不再应用 ratio / fit / max-height 等二次视觉变形。
        if (options.widthPx !== undefined)
            el.style.setProperty("--ig-item-width", `${options.widthPx}px`);
        else if (options.scale !== undefined)
            el.style.setProperty("--ig-item-scale", `${options.scale}%`);
    }
}
exports.default = ImageGridPlugin;

};

function __igRequire(id) {
  if (!Object.prototype.hasOwnProperty.call(__igModules, id)) return __igNativeRequire(id);
  if (__igCache[id]) return __igCache[id].exports;
  const module = { exports: {} };
  __igCache[id] = module;
  __igModules[id](module, module.exports, __igRequire);
  return module.exports;
}
const __igEntry = __igRequire("./main");
module.exports = __igEntry && __igEntry.default ? __igEntry.default : __igEntry;

  return module.exports;
})();

const PLUGIN_ID = 'image-workflow';
const LEGACY_PLUGIN_ID = 'image-workflow-toolkit';
const PLUGIN_NAME = 'image-workflow';
const PLUGIN_DISPLAY_NAME = 'Image Workflow';
const LEGACY_DATA_PATH = `.obsidian/plugins/${LEGACY_PLUGIN_ID}/data.json`;
const LOG_FOLDER = `.obsidian/plugins/${PLUGIN_ID}/logs`;
const LEGACY_LOG_FOLDER = `.obsidian/plugins/${LEGACY_PLUGIN_ID}/logs`;
const VIEW_TYPE = `${PLUGIN_ID}-cleaner-view`;
const UNUSED_VIEW_TYPE = `${PLUGIN_ID}-unused-images-view`;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'avif']);
const PASTED_IMAGE_PREFIX = 'Pasted image ';

const IMAGE_LINK_REGEX_SOURCE = String.raw`!?\[\[([^\]]+)\]\]|!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)`;

function createImageLinkRegex(flags = 'g') {
  return new RegExp(IMAGE_LINK_REGEX_SOURCE, flags);
}

function parseImageLinkMatch(match) {
  if (!match) return null;
  const isWiki = Boolean(match[1]);
  if (isWiki) {
    const parsed = parseWikiEmbed(match[1]);
    const suffixParts = String(parsed.suffix || '').split('|').map((p) => p.trim()).filter(Boolean);
    return {
      type: 'wiki',
      rawTarget: parsed.target,
      suffix: parsed.suffix || '',
      size: suffixParts.find(isImageSizeSuffix) || '',
    };
  }
  const destination = parseMarkdownImageDestination(match[3]);
  const altParts = String(match[2] || '').split('|').map((p) => p.trim()).filter(Boolean);
  return {
    type: 'markdown',
    rawTarget: destination ? destination.target : '',
    suffix: '',
    size: altParts.find(isImageSizeSuffix) || '',
  };
}

function makeImageLinkItemFromMatch(match, lineText, lineNumber, sourceFile, app) {
  const parsed = parseImageLinkMatch(match);
  if (!parsed || !parsed.rawTarget) return null;
  const external = isExternalLink(parsed.rawTarget);
  const file = parsed.rawTarget && !external
    ? app.metadataCache.getFirstLinkpathDest(parsed.rawTarget, sourceFile.path)
    : null;
  return {
    type: parsed.type,
    fullMatch: match[0],
    lineText,
    lineNumber,
    line: lineNumber,
    from: match.index,
    to: match.index + match[0].length,
    rawTarget: parsed.rawTarget,
    basename: parsed.rawTarget ? getBasename(parsed.rawTarget) : '',
    size: parsed.size || '',
    hasSize: Boolean(parsed.size),
    external,
    file: file instanceof TFile ? file : null,
  };
}

const DEFAULT_SETTINGS = {
  imageNamePattern: '{{fileName}}',
  dupNumberAtStart: false,
  dupNumberDelimiter: '-',
  dupNumberAlways: false,
  autoRename: false,
  pastedImageSize: '',
  promptForPasteSize: true,
  handleAllAttachments: false,
  excludeExtensionPattern: '',
  disableRenameNotice: false,
  resequenceStartNumber: 1,
  resequenceSkipDuplicateEmbeds: true,
  resequenceShowPreviewNotice: true,
  targetFolders: [],
  excludeFolders: [],
  imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  cleanWikiEmbeds: true,
  cleanMarkdownImages: true,
  requireUniqueFilename: true,
  requireFinalConfirmation: true,
  showRibbonIcon: true,
  quickSizePresets: '300,400,500,600,800',
  uniformSizeDefault: '500',
  resequenceNameMode: 'semantic',
  resequenceNumberPadding: 1,
  archiveFolderPattern: '{{fileName}}.assets',
  imageLinkMode: 'short',
  unusedAttachmentFolders: [],
  unusedWhitelistFolders: [],
  unusedIgnoreFolders: [],
  unusedReferenceFolders: [],
  unusedIncludeCanvas: true,
  unusedAutoSelectAll: true,
  unusedProtectRecentDays: 3,
  unusedProtectActiveNote: true,
  unusedProtectNameKeywords: '',
  imageDisplay: {
    layout: {
      gapRem: 0.5,
    },
    interaction: {
      liveControls: false,
    },
  },
  readingViewer: {
    enabled: true,
    openOnDoubleClick: true,
    openOnModifierClick: true,
    modifierKey: 'mod',
    allowZoom: true,
    allowWidth: true,
    allowRotate: true,
    allowTitle: true,
    allowSourceLocate: true,
    allowFileLocate: true,
    allowCopyPath: true,
    allowNavigation: true,
  },
};

function joinPath(...segments) {
  const parts = [];
  for (const segment of segments) {
    parts.push(...String(segment || '').split('/'));
  }
  const clean = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    clean.push(part);
  }
  if (parts[0] === '') clean.unshift('');
  return clean.join('/');
}

function dirname(fullPath) {
  const normalized = String(fullPath || '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
}

function makeRelativePath(fromFilePath, targetPath) {
  const fromDir = dirname(fromFilePath);
  const fromParts = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const targetParts = String(targetPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  while (fromParts.length && targetParts.length && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  const up = fromParts.map(() => '..');
  const rel = [...up, ...targetParts].join('/');
  return rel || basename(targetPath);
}

function basename(fullPath) {
  const parts = String(fullPath).split('/');
  return parts[parts.length - 1] || '';
}

function extension(fullPath) {
  const name = basename(fullPath);
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1) : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeFilename(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|#^\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeDelimiter(value) {
  const cleaned = sanitizeFilename(value).replace(/\./g, '').trim();
  return cleaned || '-';
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeImageSize(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  return cleaned.replace(/^\|+/, '').trim();
}

function isImageSizeSuffix(value) {
  return /^\d+(?:x\d+)?$/.test(String(value || '').trim());
}

function applyImageSizeToWikiEmbed(linkText, sizeValue) {
  const size = normalizeImageSize(sizeValue);
  if (!size) return linkText;

  const raw = String(linkText || '').trim();
  const wikiMatch = /^!?\[\[([^\]]+)\]\]$/.exec(raw);
  if (wikiMatch) {
    const inner = wikiMatch[1];
    const parts = inner.split('|').map((part) => part.trim());
    const target = parts.shift() || '';
    if (!target) return linkText;

    const suffixes = parts.filter((part) => part !== '');
    const sizeIndex = suffixes.findIndex(isImageSizeSuffix);
    if (sizeIndex >= 0) {
      suffixes[sizeIndex] = size;
    } else {
      suffixes.push(size);
    }
    return `![[${[target, ...suffixes].join('|')}]]`;
  }

  const markdownMatch = /^!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)$/.exec(raw);
  if (markdownMatch) {
    const altParts = String(markdownMatch[1] || '').split('|').map((part) => part.trim()).filter(Boolean);
    const sizeIndex = altParts.findIndex(isImageSizeSuffix);
    if (sizeIndex >= 0) {
      altParts[sizeIndex] = size;
    } else {
      altParts.push(size);
    }
    return `![${altParts.join('|')}](${markdownMatch[2]})`;
  }

  return linkText;
}


function getImageRotationFromLine(line) {
  const raw = String(line || '');
  const match = raw.match(/\s+\{([^{}]+)\}\s*$/);
  if (!match) return 0;

  for (const token of match[1].trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = token.slice(eq + 1).trim();
    if (key === 'rotate') {
      const n = Number(value.replace(/deg$/i, ''));
      if (Number.isFinite(n)) return ((Math.round(n) % 360) + 360) % 360;
    }
  }
  return 0;
}

function applyImageRotationToLine(line, rotation) {
  const raw = String(line || '');
  const match = raw.match(/^(.*?)(?:\s+\{([^{}]+)\})\s*$/);
  const base = match ? match[1].trimEnd() : raw.trimEnd();
  const attrs = match ? match[2].trim().split(/\s+/).filter(Boolean) : [];

  const kept = attrs.filter((token) => {
    const key = token.split('=', 1)[0]?.toLowerCase();
    return key !== 'rotate';
  });

  const n = Number(rotation);
  const normalized = Number.isFinite(n) ? ((Math.round(n) % 360) + 360) % 360 : 0;
  if (normalized !== 0) kept.push(`rotate=${normalized}`);

  return kept.length ? `${base} {${kept.join(' ')}}` : base;
}

function getImageCaptionStyleFromLine(line) {
  const raw = String(line || '');
  const match = raw.match(/\s+\{([^{}]+)\}\s*$/);
  const result = { color: '', size: '' };
  if (!match) return result;

  for (const token of match[1].trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = token.slice(eq + 1).trim();

    if (key === 'caption-color' && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
      result.color = value;
    }
    if (key === 'caption-size') {
      const n = Number(value.replace(/px$/i, ''));
      if (Number.isFinite(n)) result.size = String(Math.min(48, Math.max(10, Math.round(n))));
    }
  }
  return result;
}

function applyImageCaptionStyleToLine(line, style) {
  const raw = String(line || '');
  const match = raw.match(/^(.*?)(?:\s+\{([^{}]+)\})\s*$/);
  const base = match ? match[1].trimEnd() : raw.trimEnd();
  const attrs = match ? match[2].trim().split(/\s+/).filter(Boolean) : [];

  const kept = attrs.filter((token) => {
    const key = token.split('=', 1)[0]?.toLowerCase();
    return key !== 'caption-color' && key !== 'caption-size';
  });

  const color = String(style?.color || '').trim();
  const size = Number(style?.size);

  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    kept.push(`caption-color=${color}`);
  }
  if (Number.isFinite(size) && size >= 10 && size <= 48) {
    kept.push(`caption-size=${Math.round(size)}`);
  }

  return kept.length ? `${base} {${kept.join(' ')}}` : base;
}

function getImageDescriptionFromEmbed(linkText) {
  const raw = String(linkText || '').trim();

  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(raw);
  if (wiki) {
    const parts = wiki[1].split('|').map((part) => part.trim());
    parts.shift();
    const description = parts.find((part) => part && !isImageSizeSuffix(part));
    return description || '';
  }

  const markdown = /^!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)$/.exec(raw);
  if (markdown) {
    const parts = String(markdown[1] || '').split('|').map((part) => part.trim()).filter(Boolean);
    const description = parts.find((part) => part && !isImageSizeSuffix(part));
    return description || '';
  }

  return '';
}

function applyImageDescriptionToEmbed(linkText, descriptionValue) {
  const description = String(descriptionValue || '').trim();
  const raw = String(linkText || '').trim();

  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(raw);
  if (wiki) {
    const parts = wiki[1].split('|').map((part) => part.trim());
    const target = parts.shift() || '';
    if (!target) return linkText;

    // 只保留尺寸后缀；非尺寸后缀视为旧“额外说明/别名”，统一替换。
    const sizes = parts.filter((part) => part && isImageSizeSuffix(part));
    const suffixes = [];
    if (description) suffixes.push(description);
    suffixes.push(...sizes);

    return `![[${[target, ...suffixes].join('|')}]]`;
  }

  const markdown = /^!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)$/.exec(raw);
  if (markdown) {
    const oldParts = String(markdown[1] || '').split('|').map((part) => part.trim()).filter(Boolean);
    const sizes = oldParts.filter((part) => isImageSizeSuffix(part));
    const altParts = [];
    if (description) altParts.push(description);
    altParts.push(...sizes);
    return `![${altParts.join('|')}](${markdown[2]})`;
  }

  return linkText;
}

function isMarkdownFile(file) {
  return file instanceof TFile && file.extension === 'md';
}

function isImageFile(file) {
  return file instanceof TFile && IMAGE_EXTENSIONS.has(String(file.extension || '').toLowerCase());
}

function isPastedImage(file) {
  return file instanceof TFile && file.name.startsWith(PASTED_IMAGE_PREFIX);
}

function getFirstHeading(headings) {
  if (!Array.isArray(headings)) return '';
  for (const heading of headings) {
    if (heading && heading.level === 1) return heading.heading || '';
  }
  return '';
}

function renderTemplate(template, data, frontmatter) {
  let result = String(template || '');
  const momentObj = window.moment ? window.moment() : null;
  result = result.replace(/{{DATE:([^}]+)}}/g, (_, fmt) => {
    return momentObj ? momentObj.format(fmt) : '';
  });
  result = result.replace(/{{frontmatter:([^}]+)}}/g, (_, key) => {
    return frontmatter && frontmatter[key] != null ? String(frontmatter[key]) : '';
  });
  result = result
    .replace(/{{imageNameKey}}/g, data.imageNameKey || '')
    .replace(/{{fileName}}/g, data.fileName || '')
    .replace(/{{note}}/g, data.note || data.fileName || '')
    .replace(/{{dirName}}/g, data.dirName || '')
    .replace(/{{folder}}/g, data.dirName || '')
    .replace(/{{firstHeading}}/g, data.firstHeading || '')
    .replace(/{{heading}}/g, data.heading || data.firstHeading || '')
    .replace(/{{index}}/g, data.index || '');
  return sanitizeFilename(result);
}

class ImageDescriptionModal extends Modal {
  constructor(app, initialDescription, initialStyle, onConfirm) {
    super(app);
    this.initialDescription = String(initialDescription || '');
    this.initialStyle = initialStyle || { color: '', size: '' };
    this.onConfirm = onConfirm;
    this.isSubmitting = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('✏️ 图片标题');
    this.containerEl.addClass('pirr-modal');
    this.containerEl.addClass('iwt-caption-style-modal');

    contentEl.createDiv({
      cls: 'pirr-intro',
      text: '标题显示在图片下方。可设置整体颜色和字号；局部文字支持 Markdown 加粗、斜体和删除线。',
    });

    const errorEl = contentEl.createDiv({ cls: 'pirr-error' });
    errorEl.hide();

    let value = this.initialDescription;
    let color = String(this.initialStyle.color || '');
    let size = String(this.initialStyle.size || '');
    let textArea = null;
    let colorPicker = null;

    const wrapSelection = (before, after = before) => {
      if (!textArea) return;
      const el = textArea.inputEl;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      const selected = el.value.slice(start, end);
      const replacement = `${before}${selected}${after}`;
      el.setRangeText(replacement, start, end, 'select');
      value = el.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const innerStart = start + before.length;
      const innerEnd = innerStart + selected.length;
      el.setSelectionRange(innerStart, innerEnd);
      el.focus();
    };

    const submit = async () => {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      try {
        await this.onConfirm({
          description: String(value || '').trim(),
          color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '',
          size: size ? Math.min(48, Math.max(10, Math.round(Number(size)))) : '',
        });
        this.close();
      } catch (err) {
        this.isSubmitting = false;
        errorEl.setText(String(err && err.message ? err.message : err));
        errorEl.show();
      }
    };

    new Setting(contentEl)
      .setName('标题文字')
      .setDesc('例如：这是**说明**')
      .addTextArea((text) => {
        textArea = text;
        text
          .setPlaceholder('例如：这是**说明**')
          .setValue(value)
          .onChange((next) => { value = next; });
        text.inputEl.rows = 3;
        text.inputEl.addClass('pirr-text');
        text.inputEl.addEventListener('keydown', async (evt) => {
          if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
            evt.preventDefault();
            await submit();
          }
        });
      });

    const inlineToolbar = contentEl.createDiv({ cls: 'iwt-caption-inline-toolbar' });

    const boldBtn = inlineToolbar.createEl('button', {
      text: 'B',
      cls: 'iwt-caption-inline-btn',
      attr: { type: 'button', title: '局部加粗' },
    });
    boldBtn.style.fontWeight = '700';
    boldBtn.onclick = () => wrapSelection('**');

    const italicBtn = inlineToolbar.createEl('button', {
      text: 'I',
      cls: 'iwt-caption-inline-btn',
      attr: { type: 'button', title: '局部斜体' },
    });
    italicBtn.style.fontStyle = 'italic';
    italicBtn.onclick = () => wrapSelection('*');

    const strikeBtn = inlineToolbar.createEl('button', {
      text: 'S',
      cls: 'iwt-caption-inline-btn',
      attr: { type: 'button', title: '局部删除线' },
    });
    strikeBtn.style.textDecoration = 'line-through';
    strikeBtn.onclick = () => wrapSelection('~~');

    inlineToolbar.createSpan({
      cls: 'iwt-caption-inline-help',
      text: '先选中文字，再点 B / I / S',
    });

    new Setting(contentEl)
      .setName('标题颜色')
      .setDesc('留空表示跟随主题默认文字颜色。')
      .addColorPicker((picker) => {
        colorPicker = picker;
        picker
          .setValue(color || '#888888')
          .onChange((next) => { color = next; });
      })
      .addButton((btn) => btn
        .setButtonText('跟随主题')
        .onClick(() => {
          color = '';
          if (colorPicker) colorPicker.setValue('#888888');
        }));

    new Setting(contentEl)
      .setName('标题字号')
      .setDesc('10–48px；留空表示使用插件默认字号。')
      .addText((text) => text
        .setPlaceholder('例如 16')
        .setValue(size)
        .onChange((next) => {
          const n = Number(next.replace(/px$/i, '').trim());
          size = Number.isFinite(n) ? String(Math.min(48, Math.max(10, Math.round(n)))) : '';
        }))
      .addButton((btn) => btn
        .setButtonText('默认字号')
        .onClick(() => {
          size = '';
          this.display?.();
        }));

    contentEl.createDiv({
      cls: 'iwt-help',
      text: '保存示例：![[图片.png|这是**说明**|500]] {caption-color=#8b5cf6 caption-size=16}',
    });

    window.setTimeout(() => {
      if (textArea) {
        textArea.inputEl.focus();
        textArea.inputEl.setSelectionRange(textArea.inputEl.value.length, textArea.inputEl.value.length);
      }
    }, 0);

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('保存').setCta().onClick(async () => { await submit(); }))
      .addButton((btn) => btn.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SizeModal extends Modal {
  constructor(app, initialSize, onConfirm, presets = []) {
    super(app);
    this.initialSize = initialSize || '';
    this.onConfirm = onConfirm;
    this.presets = Array.isArray(presets) ? presets : [];
    this.isSubmitting = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('设置当前行图片尺寸');
    this.containerEl.addClass('pirr-modal');

    let size = normalizeImageSize(this.initialSize);
    contentEl.createDiv({
      cls: 'pirr-intro',
      text: '只修改当前行第一张图片的尺寸后缀，不重命名文件。输入 500 会生成 ![[xxx.png|500]]。',
    });

    const errorEl = contentEl.createDiv({ cls: 'pirr-error' });
    errorEl.hide();

    const submit = async () => {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      const normalized = normalizeImageSize(size);
      if (!normalized) {
        errorEl.setText('尺寸不能为空');
        errorEl.show();
        this.isSubmitting = false;
        return;
      }
      try {
        await this.onConfirm(normalized);
        this.close();
      } catch (err) {
        this.isSubmitting = false;
        errorEl.setText(String(err && err.message ? err.message : err));
        errorEl.show();
      }
    };

    if (this.presets.length > 0) {
      const presetWrap = contentEl.createDiv({ cls: 'pirr-size-presets' });
      for (const preset of this.presets) {
        const btn = presetWrap.createEl('button', { text: preset });
        btn.onclick = async () => { size = normalizeImageSize(preset); await submit(); };
      }
    }

    let sizeInput = null;
    new Setting(contentEl)
      .setName('图片尺寸')
      .setDesc('支持 500 或 500x300。')
      .addText((text) => {
        sizeInput = text;
        text.setPlaceholder('例如 500')
          .setValue(size)
          .onChange((value) => { size = normalizeImageSize(value); });
        text.inputEl.addClass('pirr-text');
        text.inputEl.addEventListener('keydown', async (evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            await submit();
          }
        });
      });

    window.setTimeout(() => {
      if (sizeInput) {
        sizeInput.inputEl.focus();
        sizeInput.inputEl.select();
      }
    }, 0);

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('确认').setCta().onClick(async () => { await submit(); }))
      .addButton((btn) => btn.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class UniformSizeModal extends Modal {
  constructor(app, initialSize, onConfirm, presets = []) {
    super(app);
    this.initialSize = initialSize || '500';
    this.onConfirm = onConfirm;
    this.presets = Array.isArray(presets) ? presets : [];
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('统一当前笔记图片尺寸');
    this.containerEl.addClass('pirr-modal');
    let size = normalizeImageSize(this.initialSize);
    let scope = 'missing';
    contentEl.createDiv({ cls: 'pirr-intro', text: '批量修改当前笔记中的图片尺寸。该操作只改 Markdown 文本，不重命名图片文件。' });

    const presetWrap = contentEl.createDiv({ cls: 'pirr-size-presets' });
    for (const preset of this.presets) {
      const btn = presetWrap.createEl('button', { text: preset });
      btn.onclick = () => { size = normalizeImageSize(preset); if (sizeInput) sizeInput.setValue(size); };
    }

    let sizeInput = null;
    new Setting(contentEl)
      .setName('目标尺寸')
      .setDesc('支持 500 或 500x300。清除尺寸模式会忽略该值。')
      .addText((text) => {
        sizeInput = text;
        text.setValue(size).setPlaceholder('例如 500').onChange((value) => { size = normalizeImageSize(value); });
        text.inputEl.addClass('pirr-text');
      });

    new Setting(contentEl)
      .setName('处理范围')
      .setDesc('建议先处理“无尺寸图片”，风险最低。')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('missing', '仅无尺寸图片')
          .addOption('all', '全部图片')
          .addOption('heading', '仅当前标题下图片')
          .addOption('clear', '清除全部尺寸')
          .setValue(scope)
          .onChange((value) => { scope = value; });
      });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('执行').setCta().onClick(async () => {
        await this.onConfirm({ sizeValue: size, scope });
        this.close();
      }))
      .addButton((btn) => btn.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}

class ReadingImageViewerModal extends Modal {
  constructor(app, plugin, context, item, state) {
    super(app);
    this.plugin = plugin;
    this.context = context;
    this.item = item;
    this.rotation = Number(state?.rotation) || 0;
    this.width = String(state?.width || plugin.settings.uniformSizeDefault || '500');
    this.zoom = 1;
  }

  onOpen() {
    this.containerEl.addClass('iwt-reading-image-viewer');
    this.modalEl.addClass('iwt-reading-image-viewer__modal');
    this.render();
  }

  render() {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    titleEl.setText(`🖼️ ${this.item.file?.name || '图片查看器'}`);

    const stage = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__stage' });
    const image = stage.createEl('img', {
      cls: 'iwt-reading-image-viewer__image',
      attr: {
        src: this.context.src,
        alt: this.context.alt || this.item.file?.name || '图片',
      },
    });

    const applyPreviewTransform = () => {
      image.style.transform = `scale(${this.zoom}) rotate(${this.rotation}deg)`;
    };
    applyPreviewTransform();

    const meta = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__meta' });
    const imagePath = this.item.file?.path || this.item.rawTarget || '';
    const pathEl = meta.createSpan({ cls: 'iwt-reading-image-viewer__path', text: imagePath });
    meta.createSpan({ text: `源码第 ${this.item.line + 1} 行` });

    const viewerSettings = this.plugin.settings.readingViewer || {};

    const fileActions = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__file-actions' });

    if (viewerSettings.allowFileLocate !== false && this.item.file instanceof TFile) {
      const locateFileBtn = fileActions.createEl('button', { text: '📂 定位图片文件' });
      locateFileBtn.onclick = async () => {
        await this.plugin.revealImageFileInNavigator(this.item.file);
      };
      pathEl.addClass('is-clickable');
      pathEl.setAttribute('title', '点击在文件列表定位图片');
      pathEl.onclick = async () => {
        await this.plugin.revealImageFileInNavigator(this.item.file);
      };
    }

    if (viewerSettings.allowCopyPath !== false && this.item.file instanceof TFile) {
      const copyPathBtn = fileActions.createEl('button', { text: '📋 复制路径' });
      copyPathBtn.onclick = async () => {
        await this.plugin.copyImagePath(this.item.file);
      };

      const copyWikiBtn = fileActions.createEl('button', { text: '🔗 复制 Wiki 链接' });
      copyWikiBtn.onclick = async () => {
        await this.plugin.copyImageWikiLink(this.item.file);
      };
    }

    if (viewerSettings.allowNavigation !== false) {
      const prevBtn = fileActions.createEl('button', { text: '⬅️ 上一张' });
      const nextBtn = fileActions.createEl('button', { text: '下一张 ➡️' });

      prevBtn.onclick = async () => {
        this.close();
        await this.plugin.openAdjacentReadingImageViewer(this.context, this.item, -1);
      };
      nextBtn.onclick = async () => {
        this.close();
        await this.plugin.openAdjacentReadingImageViewer(this.context, this.item, 1);
      };
    }

    const controls = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__controls' });

    let updateZoom = (next) => {
      this.zoom = Math.min(3, Math.max(0.25, next));
      applyPreviewTransform();
    };

    if (viewerSettings.allowZoom !== false) {
      const zoomOut = controls.createEl('button', { text: '−', attr: { title: '预览缩小' } });
      const zoomLabel = controls.createEl('button', { text: '100%', attr: { title: '预览缩放；不会写入正文' } });
      const zoomIn = controls.createEl('button', { text: '+', attr: { title: '预览放大' } });
      updateZoom = (next) => {
        this.zoom = Math.min(3, Math.max(0.25, next));
        zoomLabel.setText(`${Math.round(this.zoom * 100)}%`);
        applyPreviewTransform();
      };
      zoomOut.onclick = () => updateZoom(this.zoom - 0.1);
      zoomIn.onclick = () => updateZoom(this.zoom + 0.1);
      zoomLabel.onclick = () => updateZoom(1);
    }

    if (viewerSettings.allowRotate !== false) {
      const rotateLeft = controls.createEl('button', { text: '↶ 90°', attr: { title: '左旋转并写回 rotate' } });
      const rotateReset = controls.createEl('button', { text: `${this.rotation}°`, attr: { title: '点击恢复 0°' } });
      const rotateRight = controls.createEl('button', { text: '↷ 90°', attr: { title: '右旋转并写回 rotate' } });
      const persistRotation = async (next) => {
        this.rotation = ((next % 360) + 360) % 360;
        rotateReset.setText(`${this.rotation}°`);
        applyPreviewTransform();
        await this.plugin.setReadingImageRotation(this.context, this.item, this.rotation);
      };
      rotateLeft.onclick = async () => await persistRotation(this.rotation - 90);
      rotateRight.onclick = async () => await persistRotation(this.rotation + 90);
      rotateReset.onclick = async () => await persistRotation(0);
    }

    if (viewerSettings.allowWidth !== false) {
      const widthWrap = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__width' });
      widthWrap.createSpan({ text: '正文宽度' });

      const presets = this.plugin.getSizePresets();
      for (const preset of presets.slice(0, 8)) {
        const btn = widthWrap.createEl('button', { text: `${preset}px` });
        btn.onclick = async () => {
          this.width = String(preset);
          const ok = await this.plugin.setReadingImageWidth(this.context, this.item, this.width);
          if (ok) btn.addClass('is-active');
        };
      }

      const custom = widthWrap.createEl('input', {
        type: 'number',
        cls: 'iwt-reading-image-viewer__width-input',
        attr: { min: '20', max: '4000', step: '10', value: this.width || '500' },
      });
      const applyWidth = widthWrap.createEl('button', { text: '应用宽度', cls: 'mod-cta' });
      applyWidth.onclick = async () => {
        const value = String(custom.value || '').trim();
        if (!value) return;
        this.width = value;
        await this.plugin.setReadingImageWidth(this.context, this.item, value);
      };
    }

    const actions = contentEl.createDiv({ cls: 'iwt-reading-image-viewer__actions' });

    if (viewerSettings.allowTitle !== false) {
      const titleBtn = actions.createEl('button', { text: '✏️ 标题' });
      titleBtn.onclick = async () => {
        this.close();
        await this.plugin.editReadingImageTitle(this.context, this.item);
      };
    }

    if (viewerSettings.allowSourceLocate !== false) {
      const sourceBtn = actions.createEl('button', { text: '🧭 定位 Markdown 源码' });
      sourceBtn.onclick = async () => {
        this.close();
        await this.plugin.focusImageSourceLine(this.context.activeFile, this.item.line, this.item.from || 0);
      };
    }

    const resetBtn = actions.createEl('button', { text: '↺ 复位预览' });
    resetBtn.onclick = () => {
      updateZoom(1);
      applyPreviewTransform();
    };

    const closeBtn = actions.createEl('button', { text: '关闭' });
    closeBtn.onclick = () => this.close();

    contentEl.createDiv({
      cls: 'iwt-reading-image-viewer__help',
      text: '双击或 Ctrl/Cmd + 点击图片打开。宽度、旋转、标题会写回当前笔记。',
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class NoteHealthModal extends Modal {
  constructor(app, report, plugin) {
    super(app);
    this.report = report;
    this.plugin = plugin;
  }

  async refreshReport() {
    const file = this.report.activeFile;
    if (!(file instanceof TFile)) return;
    this.report = await this.plugin.buildCurrentNoteImageHealthReport(file);
    this.contentEl.empty();
    this.renderBody();
  }

  onOpen() {
    const { titleEl } = this;
    titleEl.setText('🩺 当前笔记图片体检');
    this.containerEl.addClass('pirr-modal');
    this.containerEl.addClass('iwt-health-modal');
    this.renderBody();
  }

  renderBody() {
    const { contentEl } = this;

    const stats = contentEl.createDiv({ cls: 'pirr-health-grid' });
    const pairs = [
      ['🖼️ 图片嵌入', this.report.total],
      ['✅ 正常链接', this.report.normal],
      ['❌ 缺失文件', this.report.missing],
      ['📐 无尺寸图片', this.report.noSize],
      ['🔁 重复引用', this.report.duplicates],
      ['⚠️ 同名风险', this.report.sameNameRisk],
      ['🌐 外部链接', this.report.external],
      ['🧹 可安全清洗', this.report.cleanable],
    ];
    for (const [label, value] of pairs) createStatCard(stats, label, String(value));

    const summary = contentEl.createDiv({ cls: 'pirr-conflicts' });
    summary.createEl('h4', { text: '诊断结论' });
    summary.createDiv({
      text: this.report.riskLevel,
      cls: this.report.hasHighRisk ? 'pirr-error-text' : 'pirr-subtle'
    });

    const actions = new Setting(contentEl);
    actions.addButton((btn) => btn
      .setButtonText('统一无尺寸图片')
      .setCta()
      .setDisabled(this.report.noSize === 0)
      .onClick(() => {
        this.close();
        new UniformSizeModal(
          this.app,
          this.plugin.settings.uniformSizeDefault || '500',
          async ({ sizeValue }) => {
            await this.plugin.uniformCurrentNoteImageSize(sizeValue, 'missing');
          },
          this.plugin.getSizePresets()
        ).open();
      }));
    actions.addButton((btn) => btn
      .setButtonText('预览安全清洗')
      .setDisabled(this.report.cleanable === 0)
      .onClick(async () => {
        this.close();
        await this.plugin.previewCleaning();
      }));
    actions.addButton((btn) => btn
      .setButtonText('重排预览')
      .onClick(async () => {
        this.close();
        const file = this.plugin.getActiveFile();
        if (!file) return;
        const plan = await this.plugin.buildResequencePlan(file);
        if (!plan.tasks.length) {
          new Notice('当前笔记没有可重排图片');
          return;
        }
        this.plugin.openResequencePreview(
          plan,
          async () => await this.plugin.executeResequencePlan(plan, file)
        );
      }));
    actions.addButton((btn) => btn
      .setButtonText('关闭')
      .onClick(() => this.close()));

    if (!this.report.items.length) {
      contentEl.createDiv({ cls: 'pirr-subtle', text: '当前笔记没有检测到图片嵌入。' });
      return;
    }

    const guide = contentEl.createDiv({ cls: 'iwt-health-guide' });
    guide.setText('每一项都可以直接定位到源码；无尺寸图片可单独补默认宽度。缺失文件和同名风险不会自动修改，避免误修。');

    const list = contentEl.createDiv({ cls: 'iwt-health-list' });
    for (const item of this.report.items.slice(0, 250)) {
      const row = list.createDiv({
        cls: `iwt-health-row is-${item.severity || 'ok'}`
      });

      const meta = row.createDiv({ cls: 'iwt-health-row__meta' });
      const head = meta.createDiv({ cls: 'iwt-health-row__head' });
      head.createSpan({ cls: 'iwt-health-row__line', text: `第 ${item.line + 1} 行` });
      head.createSpan({
        cls: 'iwt-health-row__status',
        text: item.status.join(' · ') || (item.cleanable ? '可安全清洗' : '正常')
      });

      meta.createDiv({ cls: 'iwt-health-row__link', text: item.fullMatch });
      if (item.file instanceof TFile) {
        meta.createDiv({ cls: 'iwt-health-row__path', text: item.file.path });
      } else if (!item.external) {
        meta.createDiv({ cls: 'iwt-health-row__path', text: `无法解析：${item.rawTarget}` });
      }

      const rowActions = row.createDiv({ cls: 'iwt-health-row__actions' });

      const locateBtn = rowActions.createEl('button', { text: '🧭 定位源码' });
      locateBtn.onclick = async () => {
        this.close();
        await this.plugin.focusImageSourceLine(
          this.report.activeFile,
          item.line,
          item.from
        );
      };

      if (item.status.includes('无尺寸') && !item.external) {
        const sizeBtn = rowActions.createEl('button', {
          text: `补 ${this.plugin.settings.uniformSizeDefault || '500'}px`,
          cls: 'mod-cta'
        });
        sizeBtn.onclick = async () => {
          const changed = await this.plugin.setImageSizeAtSourceLine(
            this.report.activeFile,
            item,
            this.plugin.settings.uniformSizeDefault || '500'
          );
          if (changed) await this.refreshReport();
        };
      }
    }

    if (this.report.items.length > 250) {
      contentEl.createDiv({
        cls: 'pirr-subtle',
        text: `仅显示前 250 项；当前共 ${this.report.items.length} 项。`
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class RenameModal extends Modal {
  constructor(app, file, initialStem, initialSize, showSizeInput, onConfirm, presets = []) {
    super(app);
    this.file = file;
    this.initialStem = initialStem;
    this.initialSize = initialSize || '';
    this.showSizeInput = !!showSizeInput;
    this.onConfirm = onConfirm;
    this.presets = Array.isArray(presets) ? presets : [];
    this.isSubmitting = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('📥 粘贴图片设置');
    this.containerEl.addClass('pirr-modal');

    const preview = contentEl.createDiv({ cls: 'pirr-preview-image' });
    if (isImageFile(this.file)) {
      preview.createEl('img', { attr: { src: this.app.vault.getResourcePath(this.file) } });
    } else {
      preview.createDiv({ text: this.file.name, cls: 'pirr-file-badge' });
    }

    contentEl.createDiv({ cls: 'pirr-intro', text: '输入名称后可直接回车；尺寸可手输，也可点击预设。' });

    let stem = this.initialStem;
    let size = normalizeImageSize(this.initialSize);
    const info = contentEl.createDiv({ cls: 'pirr-path-info' });
    const updateInfo = () => {
      info.empty();
      info.createDiv({ text: `原路径：${this.file.path}` });
      info.createDiv({ text: `新路径：${joinPath(this.file.parent.path, `${stem}.${this.file.extension}`)}` });
      info.createDiv({ text: `插入结果：${size ? `![[${stem}.${this.file.extension}|${size}]]` : `![[${stem}.${this.file.extension}]]`}` });
    };
    updateInfo();

    const errorEl = contentEl.createDiv({ cls: 'pirr-error' });
    errorEl.hide();

    const submit = async () => {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      if (!stem) {
        errorEl.setText('文件名不能为空');
        errorEl.show();
        this.isSubmitting = false;
        return;
      }
      try {
        await this.onConfirm(`${stem}.${this.file.extension}`, normalizeImageSize(size));
        this.close();
      } catch (err) {
        this.isSubmitting = false;
        errorEl.setText(String(err && err.message ? err.message : err));
        errorEl.show();
      }
    };

    const nameSetting = new Setting(contentEl)
      .setName('新文件名')
      .setDesc('不含扩展名');
    let nameInput = null;
    let sizeInput = null;
    nameSetting.addText((text) => {
      nameInput = text;
      text.setValue(stem);
      text.inputEl.addClass('pirr-text');
      text.onChange((value) => {
        stem = sanitizeFilename(value);
        updateInfo();
      });
      text.inputEl.addEventListener('keydown', async (evt) => {
        if (evt.key === 'Enter' && !this.showSizeInput) {
          evt.preventDefault();
          await submit();
        }
      });
    });

    if (this.showSizeInput) {
      const sizeSetting = new Setting(contentEl)
        .setName('图片尺寸')
        .setDesc('仅写入 Wiki 嵌入后缀，例如 500 → ![[xxx.png|500]]。');
      if (this.presets.length > 0) {
        const presetWrap = contentEl.createDiv({ cls: 'pirr-size-presets' });
        for (const preset of this.presets) {
          const btn = presetWrap.createEl('button', { text: preset });
          btn.onclick = () => {
            size = normalizeImageSize(preset);
            if (sizeInput) sizeInput.setValue(size);
            updateInfo();
          };
        }
      }
      sizeSetting.addText((text) => {
        sizeInput = text;
        text.setPlaceholder('例如 500')
          .setValue(size)
          .onChange((value) => {
            size = normalizeImageSize(value);
            updateInfo();
          });
        text.inputEl.addClass('pirr-text');
        text.inputEl.addEventListener('keydown', async (evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            await submit();
          }
        });
      });
    }

    window.setTimeout(() => {
      const targetInput = this.showSizeInput && sizeInput ? sizeInput : nameInput;
      if (targetInput) {
        targetInput.inputEl.focus();
        targetInput.inputEl.select();
      }
    }, 0);

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('确认').setCta().onClick(async () => {
        await submit();
      }))
      .addButton((btn) => btn.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ResequencePreviewModal extends Modal {
  constructor(app, plan, onConfirm) {
    super(app);
    this.plan = plan;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('🔢 当前文章图片重排预览');
    this.containerEl.addClass('pirr-modal');

    const intro = contentEl.createDiv({ cls: 'pirr-intro' });
    intro.createDiv({ text: `将按正文中的出现顺序重命名 ${this.plan.tasks.length} 张图片。` });
    if (this.plan.duplicateEmbeds.length > 0) {
      intro.createDiv({ text: `检测到 ${this.plan.duplicateEmbeds.length} 个重复嵌入引用，默认只重命名一次。`, cls: 'pirr-warning' });
    }
    if (this.plan.conflicts.length > 0) {
      intro.createDiv({ text: `存在 ${this.plan.conflicts.length} 个目标路径冲突，无法执行。`, cls: 'pirr-error-text' });
    }

    const tableWrap = contentEl.createDiv({ cls: 'pirr-table-wrap' });
    const table = tableWrap.createEl('table', { cls: 'pirr-table' });
    const thead = table.createEl('thead');
    const hr = thead.createEl('tr');
    hr.createEl('th', { text: '#' });
    hr.createEl('th', { text: '原文件' });
    hr.createEl('th', { text: '新文件' });
    hr.createEl('th', { text: '正文链接预计' });
    hr.createEl('th', { text: '风险' });

    const tbody = table.createEl('tbody');
    this.plan.tasks.forEach((task, index) => {
      const tr = tbody.createEl('tr');
      tr.createEl('td', { text: String(index + 1) });
      const oldCell = tr.createEl('td');
      oldCell.createDiv({ text: task.oldName, cls: 'pirr-strong' });
      oldCell.createDiv({ text: task.oldPath, cls: 'pirr-subtle' });
      const newCell = tr.createEl('td');
      newCell.createDiv({ text: task.finalName, cls: 'pirr-strong' });
      newCell.createDiv({ text: task.finalPath, cls: 'pirr-subtle' });
      const linkCell = tr.createEl('td');
      linkCell.createDiv({ text: task.expectedOldLink || '', cls: 'pirr-subtle' });
      linkCell.createDiv({ text: '→', cls: 'pirr-subtle' });
      linkCell.createDiv({ text: task.expectedNewLink || '', cls: 'pirr-strong' });
      const riskCell = tr.createEl('td');
      const risks = task.risks && task.risks.length ? task.risks : ['低'];
      riskCell.createDiv({ text: risks.join('；'), cls: task.risks && task.risks.length ? 'pirr-error-text' : 'pirr-subtle' });
    });

    if (this.plan.conflicts.length > 0) {
      const conflictBlock = contentEl.createDiv({ cls: 'pirr-conflicts' });
      conflictBlock.createEl('h4', { text: '冲突列表' });
      for (const conflict of this.plan.conflicts) {
        const line = conflictBlock.createDiv({ cls: 'pirr-subtle' });
        line.setText(`${conflict.targetPath} ← 已被未参与本次重排的文件占用：${conflict.existingPath}`);
      }
    }

    new Setting(contentEl)
      .addButton((btn) => btn
        .setButtonText('执行重排')
        .setCta()
        .setDisabled(this.plan.tasks.length === 0 || this.plan.conflicts.length > 0)
        .onClick(async () => {
          await this.onConfirm();
          this.close();
        }))
      .addButton((btn) => btn.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ImageWorkflowPlugin extends Plugin {

async loadSettingsWithMigration() {
  const current = await this.loadData();
  if (current && typeof current === 'object' && Object.keys(current).length > 0) {
    return Object.assign({}, DEFAULT_SETTINGS, current);
  }

  const legacy = await this.readLegacyPluginData();
  if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
    try {
      await this.saveData(legacy);
    } catch (err) {}
    return Object.assign({}, DEFAULT_SETTINGS, legacy);
  }

  return Object.assign({}, DEFAULT_SETTINGS, current || {});
}

async readLegacyPluginData() {
  try {
    if (!(await this.app.vault.adapter.exists(LEGACY_DATA_PATH))) return null;
    const raw = await this.app.vault.adapter.read(LEGACY_DATA_PATH);
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async migrateLegacyLogFolder() {
  try {
    const legacyLast = `${LEGACY_LOG_FOLDER}/last-operation.json`;
    const currentLast = `${LOG_FOLDER}/last-operation.json`;
    if (!(await this.app.vault.adapter.exists(legacyLast))) return;
    await this.ensureLogFolder();
    if (await this.app.vault.adapter.exists(currentLast)) return;
    const payload = await this.app.vault.adapter.read(legacyLast);
    await this.app.vault.adapter.write(currentLast, payload);
  } catch (err) {}
}

async onload() {
  this.settings = await this.loadSettingsWithMigration();

  // 1.3.1：图片可视化修改统一迁移到阅读模式查看器。
  this.settings.imageDisplay = this.settings.imageDisplay || {};
  this.settings.imageDisplay.layout = Object.assign({ gapRem: 0.5 }, this.settings.imageDisplay.layout || {});
  this.settings.imageDisplay.interaction = Object.assign({ liveControls: false }, this.settings.imageDisplay.interaction || {});
  this.settings.imageDisplay.interaction.liveControls = false;

  this.settings.readingViewer = Object.assign({
    enabled: true,
    openOnDoubleClick: true,
    openOnModifierClick: true,
    modifierKey: 'mod',
    allowZoom: true,
    allowWidth: true,
    allowRotate: true,
    allowTitle: true,
    allowSourceLocate: true,
    allowFileLocate: true,
    allowCopyPath: true,
    allowNavigation: true,
  }, this.settings.readingViewer || {});
  await this.migrateLegacyLogFolder();
  if (!Number.isFinite(Number(this.settings.resequenceNumberPadding)) || Number(this.settings.resequenceNumberPadding) < 1) {
    this.settings.resequenceNumberPadding = 1;
  }
  this.modals = [];
  this.lastPreview = null;
  this.lastUnusedImageScan = null;

  this.registerView(VIEW_TYPE, (leaf) => new CleanerResultView(leaf, this));
  this.registerView(UNUSED_VIEW_TYPE, (leaf) => new UnusedImageResultView(leaf, this));
  this.registerEvent(this.app.vault.on('create', (file) => this.handleCreatedFile(file)));

  this.ribbonIconEl = null;
  this.refreshRibbonIcon();

  this.registerReadingModeImageViewer();

  this.addCommand({
    id: 'open-rename-modal-for-last-created-file',
    name: '当前行图片手动重命名',
    callback: async () => {
      const file = this.getActiveFile();
      if (!file) {
        new Notice('未找到当前笔记');
        return;
      }
      const embed = this.findCurrentLineFirstEmbed(file);
      if (!embed) {
        new Notice('当前行未检测到可重命名的嵌入附件');
        return;
      }
      const generated = this.generateNewName(embed.file, file);
      this.openRenameModal(embed.file, generated.isMeaningful ? generated.stem : '', file.path, false, '', embed);
    },
  });


  this.addCommand({
    id: 'edit-current-line-image-description',
    name: '当前行图片修改标题',
    callback: async () => {
      const file = this.getActiveFile();
      if (!file) {
        new Notice('未找到当前笔记');
        return;
      }
      const embed = this.findCurrentLineFirstEmbed(file);
      if (!embed) {
        new Notice('当前行未检测到图片嵌入');
        return;
      }
      this.openImageDescriptionModal(embed);
    },
  });

  this.addCommand({
    id: 'set-current-line-image-size',
    name: '当前行图片设置尺寸',
    callback: async () => {
      const file = this.getActiveFile();
      if (!file) {
        new Notice('未找到当前笔记');
        return;
      }
      const embed = this.findCurrentLineFirstEmbed(file);
      if (!embed) {
        new Notice('当前行未检测到图片嵌入');
        return;
      }
      new SizeModal(this.app, this.settings.pastedImageSize || '', async (sizeValue) => {
        await this.setCurrentLineImageSize(sizeValue, embed);
      }, this.getSizePresets()).open();
    },
  });

  this.addCommand({
    id: 'check-current-note-image-health',
    name: '检查当前笔记图片状态',
    callback: async () => {
      const file = this.getActiveFile();
      if (!file) {
        new Notice('未找到当前笔记');
        return;
      }
      const report = await this.buildCurrentNoteImageHealthReport(file);
      new NoteHealthModal(this.app, report, this).open();
    },
  });

  this.addCommand({
    id: 'open-reading-image-viewer',
    name: '打开阅读模式图片查看器',
    callback: async () => {
      new Notice('在阅读模式中双击图片，或 Ctrl/Cmd + 点击图片即可打开查看器。');
    },
  });

  this.addCommand({
    id: 'uniform-current-note-image-size',
    name: '统一当前笔记图片尺寸',
    callback: async () => {
      new UniformSizeModal(this.app, this.settings.uniformSizeDefault || '500', async ({ sizeValue, scope }) => {
        await this.uniformCurrentNoteImageSize(sizeValue, scope);
      }, this.getSizePresets()).open();
    },
  });

  this.addCommand({
    id: 'archive-current-note-images-preview',
    name: '归档当前笔记图片到同名附件文件夹（预览）',
    callback: async () => {
      const activeFile = this.getActiveFile();
      if (!activeFile) {
        new Notice('未找到当前笔记');
        return;
      }
      const plan = await this.buildArchivePlan(activeFile);
      if (plan.tasks.length === 0) {
        new Notice('当前文章未检测到可归档的图片');
        return;
      }
      this.openResequencePreview(plan, async () => {
        await this.executeArchivePlan(plan, activeFile);
      });
    },
  });

  this.addCommand({
    id: 'resequence-embedded-images-preview',
    name: '按当前文章顺序重排图片编号（预览）',
    callback: async () => {
      const activeFile = this.getActiveFile();
      if (!activeFile) {
        new Notice('未找到当前笔记');
        return;
      }
      const plan = await this.buildResequencePlan(activeFile);
      if (plan.tasks.length === 0) {
        new Notice('当前文章未检测到可重排的图片');
        return;
      }
      this.openResequencePreview(plan, async () => {
        await this.executeResequencePlan(plan, activeFile);
      });
    },
  });

  this.addCommand({
    id: 'resequence-embedded-images-now',
    name: '按当前文章顺序重排图片编号（兼容入口：先预览）',
    callback: async () => {
      const activeFile = this.getActiveFile();
      if (!activeFile) {
        new Notice('未找到当前笔记');
        return;
      }
      const plan = await this.buildResequencePlan(activeFile);
      if (plan.tasks.length === 0) {
        new Notice('当前文章未检测到可重排的图片');
        return;
      }
      new Notice('为避免误操作，重排现在统一先显示预览。');
      this.openResequencePreview(plan, async () => {
        await this.executeResequencePlan(plan, activeFile);
      });
    },
  });


  this.addCommand({
    id: 'open-image-cleaning-sidebar',
    name: '打开图片清洗侧栏',
    callback: async () => {
      if (this.lastPreview) {
        await this.openResultView();
      } else {
        await this.previewCleaning();
      }
    },
  });

  this.addCommand({
    id: 'preview-image-filename-cleaning',
    name: '预览图片链接清洗',
    callback: async () => {
      await this.previewCleaning();
    },
  });

  this.addCommand({
    id: 'apply-image-filename-cleaning',
    name: '应用上次图片链接清洗结果',
    callback: async () => {
      await this.applyLastPreview();
    },
  });

  this.addCommand({
    id: 'rollback-last-image-workflow-operation',
    name: '撤销上一次图片工作流操作',
    callback: async () => {
      await this.rollbackLastOperation();
    },
  });

  this.addCommand({
    id: 'scan-unused-images-and-open-view',
    name: '扫描未引用图片并打开结果页',
    callback: async () => {
      await this.scanUnusedImagesAndShowResults();
    },
  });

  this.addCommand({
    id: 'open-unused-images-view',
    name: '打开未引用图片结果页',
    callback: async () => {
      await this.openUnusedImageView(this.lastUnusedImageScan);
    },
  });

  this.addCommand({
    id: 'trash-last-unused-image-scan',
    name: '处理上次扫描中的未引用图片（先打开结果页）',
    callback: async () => {
      const files = this.lastUnusedImageScan?.unusedFiles || [];
      if (!files.length) {
        new Notice('上次扫描没有可处理的未引用图片，请先执行扫描。');
        return;
      }
      new Notice('删除操作统一在结果页预览、选择并确认。');
      await this.openUnusedImageView(this.lastUnusedImageScan);
    },
  });

  await this.setupImageDisplayIntegration();
  this.addSettingTab(new ImageWorkflowSettingTab(this.app, this));
}

async setupImageDisplayIntegration() {
  try {
    const displayPlugin = new IntegratedImageGridPlugin(this.app, this.manifest);

    // 展示模块沿用主插件 data.json，但只读写 imageDisplay 子树，
    // 避免覆盖命名、清洗、重排等已有设置。
    displayPlugin.loadData = async () => {
      const value = this.settings.imageDisplay || {};
      value.interaction = Object.assign({}, value.interaction || {}, { liveControls: false });
      return value;
    };
    displayPlugin.saveData = async (value) => {
      value = value || {};
      value.interaction = Object.assign({}, value.interaction || {}, { liveControls: false });
      this.settings.imageDisplay = value;
      await this.saveData(this.settings);
    };

    // Live Preview 的大小按钮直接复用主插件已有 Wiki 尺寸配置，
    // 不再维护第二套 scale 百分比预设。
    displayPlugin.getWikiSizePresets = () => String(this.settings.quickSizePresets || '300,400,500,600,800')
      .split(',')
      .map((part) => Number(part.trim().replace(/px$/i, '')))
      .filter((value) => Number.isFinite(value) && value >= 20 && value <= 4000);
    displayPlugin.getWikiDefaultWidth = () => {
      const value = Number(String(this.settings.uniformSizeDefault || '500').trim().replace(/px$/i, ''));
      return Number.isFinite(value) ? value : 500;
    };

    // Live Preview 悬停工具条中的“说明”按钮调用主插件，
    // 修改当前图片 Wiki 链接的额外说明，不改文件名。
    displayPlugin.openImageDescriptionAtSource = (sourceContext, sourceIndex) => {
      if (!sourceContext) {
        new Notice('暂时无法定位图片源码');
        return;
      }
      const expectedLine = Array.isArray(sourceContext.sourceLines)
        ? String(sourceContext.sourceLines[sourceIndex] || '')
        : String(sourceContext.source || '');
      const lineNumber = sourceContext.sourceLineStart !== undefined
        ? sourceContext.sourceLineStart + sourceIndex
        : -1;
      this.openImageDescriptionModalAtLine(lineNumber, sourceContext.sourcePath || '', expectedLine);
    };

    // 设置页已经融合到 image-workflow，不再注册第二套插件设置。
    displayPlugin.addSettingTab = () => {};

    // 日常操作以 Live Preview 悬停按钮为主，避免命令面板重复。
    // 旧 img-grid 代码块仍由展示模块兼容。
    displayPlugin.registerQuickCommands = () => {};

    await displayPlugin.load();
    displayPlugin.settings.interaction = Object.assign({}, displayPlugin.settings.interaction || {}, { liveControls: false });
    this.imageDisplayPlugin = displayPlugin;
    this.settings.imageDisplay = displayPlugin.settings;

    // 主插件卸载时同步卸载展示模块注册的 CodeMirror / Markdown 资源。
    this.register(() => {
      try {
        displayPlugin.unload();
      } catch (error) {
        console.error('[image-workflow] 卸载图片展示模块失败', error);
      }
    });
  } catch (error) {
    console.error('[image-workflow] 图片展示模块加载失败', error);
    new Notice('图片展示模块加载失败；图片工作流其他功能仍可继续使用。');
  }
}

onunload() {
  if (this.ribbonIconEl) {
    try { this.ribbonIconEl.remove(); } catch (e) {}
    this.ribbonIconEl = null;
  }
  for (const modal of this.modals || []) {
    try { modal.close(); } catch (e) {}
  }
  this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  this.app.workspace.detachLeavesOfType(UNUSED_VIEW_TYPE);
}


async saveSettings() {
  await this.saveData(this.settings);
  this.refreshRibbonIcon();
}

refreshRibbonIcon() {
  if (this.ribbonIconEl) {
    try {
      this.ribbonIconEl.remove();
    } catch (e) {}
    this.ribbonIconEl = null;
  }

  if (!this.settings.showRibbonIcon) return;

  this.ribbonIconEl = this.addRibbonIcon('image', 'image-workflow：图片清洗侧栏', async () => {
    if (this.lastPreview) {
      await this.openResultView();
    } else {
      await this.previewCleaning();
    }
  });
  if (this.ribbonIconEl?.addClass) this.ribbonIconEl.addClass('iwt-ribbon-icon');
}

  async scanUnusedImagesAndShowResults() {
    const scan = await this.scanUnusedImages();
    this.lastUnusedImageScan = scan;
    await this.openUnusedImageView(scan);
    new Notice(`扫描完成：候选 ${scan.candidateImageFiles.length} 张，未引用 ${scan.unusedFiles.length} 张。`);
  }

  async openUnusedImageView(scan = null) {
    let leaf = this.app.workspace.getLeavesOfType(UNUSED_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: UNUSED_VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view && typeof view.setScanResult === 'function') {
      view.setScanResult(scan || this.lastUnusedImageScan || null);
    }
  }

  async refreshUnusedImageViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(UNUSED_VIEW_TYPE)) {
      const view = leaf.view;
      if (view && typeof view.setScanResult === 'function') {
        view.setScanResult(this.lastUnusedImageScan || null);
      }
    }
  }

  async scanUnusedImages() {
    const allCandidateImageFiles = this.getUnusedScanCandidateImageFiles();

    // 1) 最近创建保护
    const protectDays = Math.max(0, Number(this.settings.unusedProtectRecentDays) || 0);
    const cutoff = protectDays > 0 ? Date.now() - protectDays * 24 * 60 * 60 * 1000 : 0;
    const protectedRecentFiles = cutoff > 0
      ? allCandidateImageFiles.filter((file) => Number(file.stat?.ctime || 0) >= cutoff)
      : [];

    // 2) 文件名关键词保护
    const protectKeywords = String(this.settings.unusedProtectNameKeywords || '')
      .split(/[,，\n]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const protectedKeywordFiles = protectKeywords.length
      ? allCandidateImageFiles.filter((file) => {
          const haystack = `${file.basename} ${file.name} ${file.path}`.toLowerCase();
          return protectKeywords.some((keyword) => haystack.includes(keyword));
        })
      : [];

    // 3) 当前活动笔记强制保护。
    // 即使用户把“引用扫描目录”限制到别处，当前正在编辑的笔记也不会被漏掉。
    const protectedActiveNotePaths = new Set();
    if (this.settings.unusedProtectActiveNote !== false) {
      const activeFile = this.getActiveFile();
      if (activeFile instanceof TFile && activeFile.extension === 'md') {
        await this.collectUnusedScanReferencesFromMarkdown(activeFile, protectedActiveNotePaths);
      }
    }

    const protectedPaths = new Set([
      ...protectedRecentFiles.map((file) => file.path),
      ...protectedKeywordFiles.map((file) => file.path),
      ...protectedActiveNotePaths,
    ]);

    const candidateImageFiles = allCandidateImageFiles.filter((file) => !protectedPaths.has(file.path));

    // 正常引用扫描
    const referenceFiles = this.getUnusedScanReferenceFiles();
    const referencedFiles = await this.getUnusedScanReferencedFiles(referenceFiles);

    // 当前活动笔记保护同时视作引用，方便结果解释。
    for (const path of protectedActiveNotePaths) referencedFiles.add(path);

    const unusedFiles = candidateImageFiles.filter((file) => !referencedFiles.has(file.path));
    unusedFiles.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));

    const protectedActiveNoteFiles = allCandidateImageFiles.filter((file) => protectedActiveNotePaths.has(file.path));

    return {
      allCandidateImageFiles,
      candidateImageFiles,
      protectedRecentFiles,
      protectedKeywordFiles,
      protectedActiveNoteFiles,
      protectKeywords,
      referencedFiles,
      referenceFileCount: referenceFiles.length,
      unusedFiles,
      scannedAt: new Date(),
    };
  }

  getUnusedScanCandidateImageFiles() {
    const allowedExt = new Set((this.settings.imageExtensions || []).map((ext) => String(ext).toLowerCase().trim()).filter(Boolean));
    const attachmentFolders = (this.settings.unusedAttachmentFolders || []).map(normalizeFolder).filter(Boolean);
    const whitelistFolders = (this.settings.unusedWhitelistFolders || []).map(normalizeFolder).filter(Boolean);
    const ignoreFolders = (this.settings.unusedIgnoreFolders || []).map(normalizeFolder).filter(Boolean);
    return this.app.vault.getFiles().filter((file) => {
      if (!(file instanceof TFile)) return false;
      if (!allowedExt.has(String(file.extension || '').toLowerCase())) return false;
      if (attachmentFolders.length && !attachmentFolders.some((folder) => isPathInsideFolder(file.path, folder))) return false;
      if (whitelistFolders.length && !whitelistFolders.some((folder) => isPathInsideFolder(file.path, folder))) return false;
      if (ignoreFolders.some((folder) => isPathInsideFolder(file.path, folder))) return false;
      return true;
    });
  }

  async getUnusedScanReferencedFiles(files = null) {
    const referenced = new Set();
    const sourceFiles = Array.isArray(files) ? files : this.getUnusedScanReferenceFiles();
    for (const file of sourceFiles) {
      if (file.extension === 'md') await this.collectUnusedScanReferencesFromMarkdown(file, referenced);
      if (file.extension === 'canvas' && this.settings.unusedIncludeCanvas) await this.collectUnusedScanReferencesFromCanvas(file, referenced);
    }
    return referenced;
  }

  getUnusedScanReferenceFiles() {
    const referenceFolders = (this.settings.unusedReferenceFolders || []).map(normalizeFolder).filter(Boolean);
    const inScope = (file) => !referenceFolders.length || referenceFolders.some((folder) => isPathInsideFolder(file.path, folder));
    const markdownFiles = this.app.vault.getMarkdownFiles().filter(inScope);
    if (!this.settings.unusedIncludeCanvas) return markdownFiles;
    const canvasFiles = this.app.vault.getFiles().filter((file) => file.extension === 'canvas' && inScope(file));
    return [...markdownFiles, ...canvasFiles];
  }

  async collectUnusedScanReferencesFromMarkdown(file, referenced) {
    const cache = this.app.metadataCache.getFileCache(file);
    for (const embed of cache?.embeds || []) this.resolveUnusedScanReference(embed.link, file.path, referenced);
    for (const link of cache?.links || []) this.resolveUnusedScanReference(link.link, file.path, referenced);
    const content = await this.app.vault.cachedRead(file);
    for (const rawLink of extractLinksFromText(content)) this.resolveUnusedScanReference(rawLink, file.path, referenced);
  }

  async collectUnusedScanReferencesFromCanvas(file, referenced) {
    try {
      const raw = await this.app.vault.cachedRead(file);
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      for (const node of nodes) {
        if (typeof node?.file === 'string') this.resolveUnusedScanReference(node.file, file.path, referenced);
        if (typeof node?.text === 'string') {
          for (const rawLink of extractLinksFromText(node.text)) this.resolveUnusedScanReference(rawLink, file.path, referenced);
        }
      }
    } catch (err) {
      console.error(`${PLUGIN_DISPLAY_NAME}: Canvas 引用解析失败`, file.path, err);
    }
  }

  resolveUnusedScanReference(link, sourcePath, referenced) {
    const cleaned = cleanLinkPath(link);
    if (!cleaned || isExternalLink(cleaned)) return;
    const direct = this.app.vault.getAbstractFileByPath(normalizePath(cleaned));
    if (direct instanceof TFile) {
      referenced.add(direct.path);
      return;
    }
    const target = this.app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
    if (target instanceof TFile) referenced.add(target.path);
  }

  async trashUnusedImageFiles(files) {
    if (!files || files.length === 0) {
      new Notice('没有可删除的文件。');
      return;
    }

    // 删除前重新执行一次完整扫描。
    // 这样如果“扫描结果生成后”用户又在笔记里引用了某张图片，它会被自动跳过。
    const freshScan = await this.scanUnusedImages();
    const safePaths = new Set(freshScan.unusedFiles.map((file) => file.path));
    const stillUnused = files.filter((file) => safePaths.has(file.path));
    const reProtected = files.filter((file) => !safePaths.has(file.path));

    if (!stillUnused.length) {
      this.lastUnusedImageScan = freshScan;
      await this.refreshUnusedImageViews();
      new Notice('删除已取消：所选图片在重新检查后均已被引用或受到保护。');
      return;
    }

    let success = 0;
    let failed = 0;
    for (const file of stillUnused) {
      try {
        await this.app.fileManager.trashFile(file);
        success++;
      } catch (err) {
        failed++;
        console.error(`${PLUGIN_DISPLAY_NAME}: 删除未引用图片失败`, file.path, err);
      }
    }

    this.lastUnusedImageScan = await this.scanUnusedImages();
    await this.refreshUnusedImageViews();

    const protectedText = reProtected.length ? `，重新检查后跳过 ${reProtected.length} 张` : '';
    new Notice(`已移入回收站 ${success} 张图片${protectedText}${failed ? `，失败 ${failed} 张` : ''}。`);
  }

  async handleCreatedFile(file) {
    if (!(file instanceof TFile)) return;
    const timeGapMs = Date.now() - file.stat.ctime;
    if (timeGapMs > 1000) return;
    if (isMarkdownFile(file)) return;

    const shouldHandle = isPastedImage(file) || (this.settings.handleAllAttachments && !this.testExcludeExtension(file));
    if (!shouldHandle) return;
    await this.startRenameProcess(file, this.settings.autoRename);
  }

  resolveReadingImageContext(img) {
    if (!(img instanceof HTMLImageElement)) return null;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = view?.file;
    if (!(activeFile instanceof TFile)) return null;

    // 只处理阅读模式，不劫持 Live Preview 自己的交互。
    if (!img.closest('.markdown-preview-view')) return null;

    const previewRoot = img.closest('.markdown-preview-view');
    const allImages = Array.from(previewRoot?.querySelectorAll('img') || [])
      .filter((node) => node instanceof HTMLImageElement && !node.closest('.iwt-reading-image-viewer'));
    const domIndex = Math.max(0, allImages.indexOf(img));

    return {
      img,
      activeFile,
      domIndex,
      src: img.currentSrc || img.src || '',
      alt: img.alt || '',
    };
  }

  async findReadingImageSourceItem(context) {
    if (!context?.activeFile) return null;
    const content = await this.app.vault.cachedRead(context.activeFile);
    const items = this.parseImageEmbedsFromContent(context.activeFile, content);

    // 优先用阅读视图中的图片顺序对应源码图片顺序；
    // 若主题额外插入装饰图片，则再按资源 URL / 文件名回退。
    if (items[context.domIndex]) return items[context.domIndex];

    const src = String(context.src || '');
    const basenameFromUrl = decodeURIComponent(src.split('/').pop()?.split('?')[0] || '').toLowerCase();
    if (basenameFromUrl) {
      const matched = items.filter((item) =>
        item.file instanceof TFile
        && item.file.name.toLowerCase() === basenameFromUrl
      );
      if (matched.length === 1) return matched[0];
    }

    return items.length === 1 ? items[0] : null;
  }

  async updateReadingImageSourceLine(activeFile, item, updater, logType = 'reading-image-viewer') {
    if (!(activeFile instanceof TFile) || !item) return false;

    const beforeContent = await this.app.vault.cachedRead(activeFile);
    const lines = beforeContent.split('\n');
    const lineNumber = Number(item.line ?? item.lineNumber ?? -1);
    if (lineNumber < 0 || lineNumber >= lines.length) {
      new Notice('无法定位图片源码行');
      return false;
    }

    const currentLine = lines[lineNumber];
    const nextLine = updater(currentLine);
    if (typeof nextLine !== 'string' || nextLine === currentLine) return false;

    lines[lineNumber] = nextLine;
    const afterContent = lines.join('\n');
    await this.app.vault.modify(activeFile, afterContent);

    await this.writeOperationLog({
      type: logType,
      createdAt: new Date().toISOString(),
      renames: [],
      notes: [{ path: activeFile.path, beforeContent, afterContent }],
    });

    return true;
  }

  async setReadingImageWidth(context, item, width) {
    const normalized = normalizeImageSize(width);
    if (!normalized) return false;

    const ok = await this.updateReadingImageSourceLine(
      context.activeFile,
      item,
      (line) => {
        const regex = createImageLinkRegex('g');
        let count = -1;
        return line.replace(regex, (full) => {
          count++;
          // 同一行多图时，使用字符区间寻找当前 item
          if (item.from !== undefined && item.to !== undefined) {
            const start = line.indexOf(full);
            if (start !== item.from && full !== item.fullMatch) return full;
          } else if (full !== item.fullMatch) {
            return full;
          }
          return applyImageSizeToWikiEmbed(full, normalized);
        });
      },
      'reading-set-size'
    );

    if (ok) new Notice(`已设置图片宽度 ${normalized}px`);
    return ok;
  }

  async setReadingImageRotation(context, item, rotation) {
    const ok = await this.updateReadingImageSourceLine(
      context.activeFile,
      item,
      (line) => applyImageRotationToLine(line, rotation),
      'reading-set-rotation'
    );
    if (ok) new Notice(`已设置图片旋转 ${((Number(rotation) % 360) + 360) % 360}°`);
    return ok;
  }

  async editReadingImageTitle(context, item) {
    const file = context.activeFile;
    if (!(file instanceof TFile)) return;

    // 打开当前图片所在源码行，再复用现有标题编辑器，避免维护第二套标题写回逻辑。
    const focused = await this.focusImageSourceLine(file, item.line, item.from || 0);
    if (!focused) return;

    const editor = this.getActiveEditor();
    if (!editor) return;
    const line = editor.getLine(item.line) || '';
    const embed = this.findFirstEmbedInLine(file, line, item.line, item.file || null);
    if (!embed) {
      new Notice('无法定位图片标题源码');
      return;
    }
    this.openImageDescriptionModal(embed);
  }

  async revealImageFileInNavigator(file) {
    if (!(file instanceof TFile)) {
      new Notice('无法定位图片文件');
      return false;
    }

    // 优先使用 Obsidian 文件列表的 revealInFolder；不同版本不可用时回退为打开图片文件。
    const leaves = this.app.workspace.getLeavesOfType('file-explorer');
    for (const leaf of leaves) {
      const view = leaf?.view;
      if (view && typeof view.revealInFolder === 'function') {
        try {
          await view.revealInFolder(file);
          this.app.workspace.revealLeaf(leaf);
          return true;
        } catch (err) {}
      }
    }

    try {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
      return true;
    } catch (err) {
      console.error(`${PLUGIN_DISPLAY_NAME}: 定位图片文件失败`, err);
      new Notice('无法在文件列表定位图片');
      return false;
    }
  }

  async copyImagePath(file) {
    if (!(file instanceof TFile)) {
      new Notice('没有可复制的图片路径');
      return false;
    }
    try {
      await navigator.clipboard.writeText(file.path);
      new Notice('已复制图片路径');
      return true;
    } catch (err) {
      new Notice('复制路径失败');
      return false;
    }
  }

  async copyImageWikiLink(file) {
    if (!(file instanceof TFile)) {
      new Notice('没有可复制的图片链接');
      return false;
    }
    try {
      await navigator.clipboard.writeText(`![[${file.path}]]`);
      new Notice('已复制图片 Wiki 链接');
      return true;
    } catch (err) {
      new Notice('复制 Wiki 链接失败');
      return false;
    }
  }

  async getReadingViewerItems(activeFile) {
    if (!(activeFile instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(activeFile);
    return this.parseImageEmbedsFromContent(activeFile, content)
      .filter((item) => item && !item.external);
  }

  async openAdjacentReadingImageViewer(context, item, delta) {
    const items = await this.getReadingViewerItems(context.activeFile);
    if (!items.length) return;

    const currentIndex = items.findIndex((candidate) =>
      candidate.line === item.line
      && candidate.from === item.from
      && candidate.fullMatch === item.fullMatch
    );

    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = safeIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) {
      new Notice(delta < 0 ? '已经是第一张图片' : '已经是最后一张图片');
      return;
    }

    const nextItem = items[nextIndex];
    const nextFile = nextItem.file instanceof TFile ? nextItem.file : null;
    const nextSrc = nextFile
      ? this.app.vault.getResourcePath(nextFile)
      : context.src;

    const content = await this.app.vault.cachedRead(context.activeFile);
    const line = content.split('\n')[nextItem.line] || '';
    const nextContext = {
      activeFile: context.activeFile,
      img: null,
      domIndex: nextIndex,
      src: nextSrc,
      alt: nextFile?.name || nextItem.basename || '',
    };

    new ReadingImageViewerModal(
      this.app,
      this,
      nextContext,
      nextItem,
      {
        rotation: getImageRotationFromLine(line),
        width: nextItem.hasSize
          ? String(nextItem.size || '')
          : String(this.settings.uniformSizeDefault || '500'),
      }
    ).open();
  }

  async openReadingImageViewer(context) {
    const item = await this.findReadingImageSourceItem(context);
    if (!item) {
      new Notice('无法确定这张图片对应的源码位置');
      return;
    }

    const content = await this.app.vault.cachedRead(context.activeFile);
    const line = content.split('\n')[item.line] || '';
    const initialRotation = getImageRotationFromLine(line);
    const initialWidth = item.hasSize ? String(item.size || '') : String(this.settings.uniformSizeDefault || '500');

    new ReadingImageViewerModal(
      this.app,
      this,
      context,
      item,
      {
        rotation: initialRotation,
        width: initialWidth,
      }
    ).open();
  }

  registerReadingModeImageViewer() {
    const handle = async (event) => {
      const viewer = this.settings.readingViewer || {};
      if (viewer.enabled === false) return;

      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;

      const isDouble =
        event.type === 'dblclick'
        && viewer.openOnDoubleClick !== false;

      const modifierMatched =
        viewer.modifierKey === 'ctrl'
          ? event.ctrlKey
          : viewer.modifierKey === 'meta'
            ? event.metaKey
            : (event.ctrlKey || event.metaKey);

      const isModifiedClick =
        event.type === 'click'
        && viewer.openOnModifierClick !== false
        && modifierMatched;

      if (!isDouble && !isModifiedClick) return;

      const context = this.resolveReadingImageContext(target);
      if (!context) return;

      event.preventDefault();
      event.stopPropagation();
      await this.openReadingImageViewer(context);
    };

    this.registerDomEvent(this.app.workspace.containerEl, 'dblclick', handle);
    this.registerDomEvent(this.app.workspace.containerEl, 'click', handle);
  }

  getActiveFile() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view ? view.file : null;
  }

  getActiveEditor() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view ? view.editor : null;
  }

  testExcludeExtension(file) {
    const pattern = String(this.settings.excludeExtensionPattern || '').trim();
    if (!pattern) return false;
    try {
      return new RegExp(pattern, 'i').test(file.extension || '');
    } catch (err) {
      return false;
    }
  }

  findCurrentLineFirstEmbed(activeFile) {
    const editor = this.getActiveEditor();
    if (!editor || !activeFile) return null;
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line) || '';
    return this.findFirstEmbedInLine(activeFile, line, cursor.line);
  }

  findFirstEmbedInLine(activeFile, line, lineNumber, targetFile = null) {
    if (!activeFile) return null;
    const regex = createImageLinkRegex('g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      const parsed = parseImageLinkMatch(match);
      const rawLink = parsed ? parsed.rawTarget : '';
      if (!rawLink) continue;

      const resolved = this.app.metadataCache.getFirstLinkpathDest(rawLink, activeFile.path)
        || this.app.vault.getAbstractFileByPath(normalizePath(cleanLinkPath(rawLink)));

      let file = resolved instanceof TFile ? resolved : null;
      if (targetFile) {
        if (file instanceof TFile && file.path !== targetFile.path) continue;
        if (!(file instanceof TFile) && !this.linkTargetLooksLikeFile(rawLink, targetFile)) continue;
        file = targetFile;
      } else if (!(file instanceof TFile)) {
        continue;
      }

      return {
        file,
        line,
        lineText: line,
        lineNumber,
        from: match.index,
        to: match.index + match[0].length,
        fullMatch: match[0],
      };
    }
    return null;
  }

  linkTargetLooksLikeFile(rawLink, targetFile) {
    if (!(targetFile instanceof TFile)) return false;
    const cleaned = normalizePath(cleanLinkPath(rawLink));
    if (!cleaned) return false;
    if (cleaned === targetFile.path) return true;
    if (cleaned === targetFile.name) return true;
    if (basename(cleaned) === targetFile.name) return true;
    return cleaned.endsWith(`/${targetFile.name}`);
  }

  findEmbedForFileInContent(activeFile, targetFile, content, preferredLineNumber = null) {
    if (!activeFile || !(targetFile instanceof TFile)) return null;
    const lines = String(content || '').split('\n');
    const checked = new Set();
    const tryLine = (lineNumber) => {
      if (lineNumber == null || lineNumber < 0 || lineNumber >= lines.length || checked.has(lineNumber)) return null;
      checked.add(lineNumber);
      return this.findFirstEmbedInLine(activeFile, lines[lineNumber] || '', lineNumber, targetFile);
    };

    const exact = tryLine(preferredLineNumber);
    if (exact) return exact;

    for (let delta = 1; preferredLineNumber != null && delta <= 12; delta++) {
      const before = tryLine(preferredLineNumber - delta);
      if (before) return before;
      const after = tryLine(preferredLineNumber + delta);
      if (after) return after;
    }

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const found = tryLine(lineNumber);
      if (found) return found;
    }
    return null;
  }

  getEditorContent(editor, activeFile = null) {
    try {
      if (editor && typeof editor.getValue === 'function') return editor.getValue();
    } catch (err) {}
    return '';
  }

  replaceEmbedText(editor, embed, text) {
    if (!editor || !embed) return false;
    const from = { line: embed.lineNumber, ch: embed.from };
    const to = { line: embed.lineNumber, ch: embed.to };
    if (typeof editor.replaceRange === 'function') {
      editor.replaceRange(text, from, to);
      return true;
    }
    if (typeof editor.transaction === 'function') {
      editor.transaction({ changes: [{ from, to, text }] });
      return true;
    }
    return false;
  }

  findEmbedForFileInEditor(activeFile, targetFile, preferredLineNumber = null) {
    const editor = this.getActiveEditor();
    if (!editor || !activeFile || !(targetFile instanceof TFile)) return null;
    const lineCount = typeof editor.lineCount === 'function' ? editor.lineCount() : String(this.getEditorContent(editor, activeFile)).split('\n').length;
    const tryLine = (lineNumber) => {
      if (lineNumber == null || lineNumber < 0 || lineNumber >= lineCount) return null;
      const line = editor.getLine(lineNumber) || '';
      return this.findFirstEmbedInLine(activeFile, line, lineNumber, targetFile);
    };

    const exact = tryLine(preferredLineNumber);
    if (exact) return exact;

    for (let delta = 1; preferredLineNumber != null && delta <= 5; delta++) {
      const before = tryLine(preferredLineNumber - delta);
      if (before) return before;
      const after = tryLine(preferredLineNumber + delta);
      if (after) return after;
    }

    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
      const found = tryLine(lineNumber);
      if (found) return found;
    }
    return null;
  }

  findEmbedByTextFallback(activeFile, targetFile, preferredLineNumber = null) {
    const editor = this.getActiveEditor();
    if (!editor || !activeFile || !(targetFile instanceof TFile)) return null;
    const lineCount = typeof editor.lineCount === 'function' ? editor.lineCount() : String(this.getEditorContent(editor, activeFile)).split('\n').length;
    const names = [targetFile.path, targetFile.name, targetFile.basename].filter(Boolean);
    const tryLine = (lineNumber) => {
      if (lineNumber == null || lineNumber < 0 || lineNumber >= lineCount) return null;
      const line = editor.getLine(lineNumber) || '';
      const regex = createImageLinkRegex('g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        const text = match[0];
        if (names.some((name) => text.includes(name))) {
          return {
            file: targetFile,
            line,
            lineNumber,
            from: match.index,
            to: match.index + match[0].length,
            fullMatch: match[0],
          };
        }
      }
      return null;
    };

    const exact = tryLine(preferredLineNumber);
    if (exact) return exact;
    for (let delta = 1; preferredLineNumber != null && delta <= 5; delta++) {
      const before = tryLine(preferredLineNumber - delta);
      if (before) return before;
      const after = tryLine(preferredLineNumber + delta);
      if (after) return after;
    }
    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
      const found = tryLine(lineNumber);
      if (found) return found;
    }
    return null;
  }

  async findFreshEmbedForCreatedFile(activeFile, file) {
    const editor = this.getActiveEditor();
    if (!editor || !(activeFile instanceof TFile) || !(file instanceof TFile)) return null;
    const preferredLine = editor.getCursor ? editor.getCursor().line : null;

    for (let attempt = 0; attempt < 12; attempt++) {
      const current = this.findCurrentLineFirstEmbed(activeFile);
      if (current && current.file instanceof TFile && current.file.path === file.path) return current;

      const byFile = this.findEmbedForFileInEditor(activeFile, file, preferredLine)
        || this.findEmbedByTextFallback(activeFile, file, preferredLine);
      if (byFile) return byFile;

      await sleep(80);
    }
    return null;
  }

  getSizePresets() {
    return String(this.settings.quickSizePresets || '')
      .split(',')
      .map((v) => normalizeImageSize(v))
      .filter(Boolean);
  }

  getCurrentHeadingText(activeFile) {
    const editor = this.getActiveEditor();
    const cache = this.app.metadataCache.getFileCache(activeFile);
    const headings = cache && Array.isArray(cache.headings) ? cache.headings : [];
    if (!editor || !headings.length) return getFirstHeading(headings);
    const cursorLine = editor.getCursor().line;
    return this.getHeadingTextAtLine(activeFile, cursorLine) || getFirstHeading(headings);
  }

  getHeadingTextAtLine(activeFile, lineNumber, content = '') {
    const line = Number.isFinite(Number(lineNumber)) ? Number(lineNumber) : 0;

    // 优先从当前正文解析标题，保证未保存编辑、标题刚修改后，重排立即按新标题生效。
    if (content != null && String(content).length > 0) {
      const lines = String(content).split('\n');
      for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i] || '');
        if (match) return String(match[2] || '').trim();
      }
    }

    const cache = this.app.metadataCache.getFileCache(activeFile);
    const headings = cache && Array.isArray(cache.headings) ? cache.headings : [];
    let current = '';
    for (const heading of headings) {
      if (heading && heading.position && heading.position.start && heading.position.start.line <= line) {
        current = heading.heading || current;
      }
    }
    return current || getFirstHeading(headings);
  }

  originalNameLooksGenerated(activeFile, originalStem) {
    const noteName = activeFile instanceof TFile ? sanitizeFilename(activeFile.basename) : '';
    const cleaned = sanitizeFilename(originalStem);
    if (!cleaned) return true;
    if (noteName && cleaned.includes(noteName)) return true;
    const delimiter = escapeRegExp(sanitizeDelimiter(this.settings.dupNumberDelimiter || '-'));
    const numberedAtEnd = new RegExp(`${delimiter}\d+$`).test(cleaned);
    const numberedAtStart = new RegExp(`^\d+${delimiter}`).test(cleaned);
    return numberedAtEnd || numberedAtStart;
  }

  getNextImageIndex(activeFile, currentFile = null) {
    const seen = new Set();
    const currentPath = currentFile instanceof TFile ? currentFile.path : '';

    const countLinkedFile = (linked) => {
      if (!(linked instanceof TFile) || !isImageFile(linked)) return;
      if (currentPath && linked.path === currentPath) return;
      seen.add(linked.path);
    };

    const editor = this.getActiveEditor();
    const activeInEditor = this.getActiveFile();
    if (editor && activeInEditor && activeInEditor.path === activeFile.path) {
      const content = this.getEditorContent(editor, activeFile);
      for (const item of this.parseImageEmbedsFromContent(activeFile, content)) {
        countLinkedFile(item.file);
      }
    }

    const cache = this.app.metadataCache.getFileCache(activeFile);
    const embeds = cache && Array.isArray(cache.embeds) ? cache.embeds : [];
    for (const embed of embeds) {
      const linked = this.app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
      countLinkedFile(linked);
    }

    return String(seen.size + 1).padStart(Math.max(1, Number(this.settings.resequenceNumberPadding || 1)), '0');
  }

  generateNewName(file, activeFile) {
    const fileCache = this.app.metadataCache.getFileCache(activeFile);
    const frontmatter = fileCache ? fileCache.frontmatter : null;
    const imageNameKey = frontmatter && frontmatter.imageNameKey ? String(frontmatter.imageNameKey) : '';
    const firstHeading = getFirstHeading(fileCache ? fileCache.headings : null);
    const heading = this.getCurrentHeadingText(activeFile);
    const stem = renderTemplate(this.settings.imageNamePattern, {
      imageNameKey,
      fileName: activeFile.basename,
      dirName: activeFile.parent ? activeFile.parent.name : '',
      firstHeading,
      heading,
      index: this.getNextImageIndex(activeFile, file),
    }, frontmatter || undefined);

    const meaninglessRegex = new RegExp(`[${escapeRegExp(this.settings.dupNumberDelimiter || '-')}\\s]`, 'g');
    return {
      stem,
      newName: `${stem}.${file.extension}`,
      isMeaningful: stem.replace(meaninglessRegex, '') !== '',
    };
  }

  async startRenameProcess(file, autoRename) {
    const activeFile = this.getActiveFile();
    if (!activeFile) {
      new Notice('Error: No active file found.');
      return;
    }
    const lineEmbed = await this.findFreshEmbedForCreatedFile(activeFile, file);
    const generated = this.generateNewName(file, activeFile);
    if (!generated.isMeaningful || !autoRename) {
      this.openRenameModal(file, generated.isMeaningful ? generated.stem : '', activeFile.path, this.settings.promptForPasteSize, this.settings.pastedImageSize, lineEmbed);
      return;
    }
    if (this.settings.promptForPasteSize) {
      this.openRenameModal(file, generated.stem, activeFile.path, true, this.settings.pastedImageSize, lineEmbed);
      return;
    }
    await this.renameFile(file, generated.newName, activeFile.path, true, this.settings.pastedImageSize, lineEmbed);
  }

  openRenameModal(file, stem, sourcePath, showSizeInput = false, initialSize = '', lineEmbed = null) {
    const modal = new RenameModal(this.app, file, stem, initialSize, showSizeInput, async (confirmedName, sizeValue) => {
      await this.renameFile(file, confirmedName, sourcePath, true, sizeValue, lineEmbed);
    }, this.getSizePresets());
    this.modals.push(modal);
    modal.open();
  }

  openResequencePreview(plan, onConfirm) {
    const modal = new ResequencePreviewModal(this.app, plan, onConfirm);
    this.modals.push(modal);
    modal.open();
  }

  parseImageEmbedsFromContent(activeFile, content) {
    const items = [];
    const lines = String(content || '').split('\n');
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const lineText = lines[lineNumber];
      const regex = createImageLinkRegex('g');
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        const item = makeImageLinkItemFromMatch(match, lineText, lineNumber, activeFile, this.app);
        if (item) items.push(item);
      }
    }
    return items;
  }

  getCurrentHeadingRange(content) {
    const editor = this.getActiveEditor();
    if (!editor) return { start: 0, end: String(content || '').split('\n').length - 1 };
    const cursorLine = editor.getCursor().line;
    const lines = String(content || '').split('\n');
    let start = 0;
    let level = 0;
    for (let i = cursorLine; i >= 0; i--) {
      const m = /^(#{1,6})\s+/.exec(lines[i] || '');
      if (m) { start = i; level = m[1].length; break; }
    }
    let end = lines.length - 1;
    if (level > 0) {
      for (let i = start + 1; i < lines.length; i++) {
        const m = /^(#{1,6})\s+/.exec(lines[i] || '');
        if (m && m[1].length <= level) { end = i - 1; break; }
      }
    }
    return { start, end };
  }

  async uniformCurrentNoteImageSize(sizeValue, scope = 'missing') {
    const activeFile = this.getActiveFile();
    if (!activeFile) {
      new Notice('未找到当前笔记');
      return;
    }
    const normalized = normalizeImageSize(sizeValue || this.settings.uniformSizeDefault || '500');
    if (scope !== 'clear' && !normalized) {
      new Notice('尺寸不能为空');
      return;
    }
    const beforeContent = await this.app.vault.cachedRead(activeFile);
    const lines = beforeContent.split('\n');
    const range = scope === 'heading' ? this.getCurrentHeadingRange(beforeContent) : { start: 0, end: lines.length - 1 };
    let changed = 0;
    for (let i = range.start; i <= range.end; i++) {
      lines[i] = lines[i].replace(createImageLinkRegex('g'), (full) => {
        if (scope === 'missing') {
          const info = parseImageLinkSize(full);
          if (info.hasSize) return full;
        }
        const next = scope === 'clear' ? removeImageSizeFromLink(full) : applyImageSizeToWikiEmbed(full, normalized);
        if (next !== full) changed++;
        return next;
      });
    }
    const afterContent = lines.join('\n');
    if (afterContent === beforeContent) {
      new Notice('没有需要修改的图片尺寸');
      return;
    }
    await this.app.vault.modify(activeFile, afterContent);
    await this.writeOperationLog({
      type: 'uniform-size',
      createdAt: new Date().toISOString(),
      renames: [],
      notes: [{ path: activeFile.path, beforeContent, afterContent }],
      changed,
      scope,
    });
    new Notice(`已更新 ${changed} 处图片尺寸`);
  }

  async buildCurrentNoteImageHealthReport(activeFile) {
    const content = await this.app.vault.cachedRead(activeFile);
    const imageIndex = this.buildImageNameIndex();
    const items = this.parseImageEmbedsFromContent(activeFile, content);
    const seen = new Set();
    let normal = 0, missing = 0, noSize = 0, duplicates = 0, sameNameRisk = 0, external = 0, cleanable = 0;
    for (const item of items) {
      item.status = [];
      if (item.external) { external++; item.status.push('外部链接'); }
      if (!item.external && !(item.file instanceof TFile)) { missing++; item.status.push('缺失文件'); }
      if (!item.hasSize) { noSize++; item.status.push('无尺寸'); }
      if (item.file instanceof TFile) {
        if (seen.has(item.file.path)) { duplicates++; item.status.push('重复引用'); }
        seen.add(item.file.path);
        const hits = imageIndex.get(item.file.name.toLowerCase()) || [];
        if (hits.length > 1) { sameNameRisk++; item.status.push('同名风险'); }
      }
      if (hasAnyPathSegment(item.rawTarget || '') && item.file instanceof TFile) {
        const decision = this.evaluateReplacement({
          type: item.type,
          sourceFile: activeFile,
          rawTarget: item.rawTarget,
          filenameCandidate: item.basename,
          fullMatch: item.fullMatch,
          imageIndex,
        });
        item.cleanable = Boolean(decision.ok);
        if (decision.ok) cleanable++;
      } else {
        item.cleanable = false;
      }

      if (item.status.includes('缺失文件') || item.status.includes('同名风险')) item.severity = 'high';
      else if (item.status.includes('无尺寸') || item.status.includes('重复引用')) item.severity = 'warning';
      else if (item.external || item.cleanable) item.severity = 'info';
      else item.severity = 'ok';

      if (item.status.length === 0) normal++;
    }
    const hasHighRisk = missing > 0 || sameNameRisk > 0;
    const riskLevel = hasHighRisk
      ? `存在高风险项：缺失文件 ${missing} 个，同名风险 ${sameNameRisk} 个。建议先体检修复，再执行清洗或归档。`
      : `未发现高风险项。可优先处理无尺寸图片 ${noSize} 个、可安全清洗链接 ${cleanable} 个。`;
    return { activeFile, total: items.length, normal, missing, noSize, duplicates, sameNameRisk, external, cleanable, items, hasHighRisk, riskLevel };
  }

  async focusImageSourceLine(activeFile, lineNumber, ch = 0) {
    if (!(activeFile instanceof TFile)) {
      new Notice('无法定位：笔记文件不存在');
      return false;
    }

    let view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== activeFile.path) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(activeFile);
      await sleep(60);
      view = this.app.workspace.getActiveViewOfType(MarkdownView);
    }

    const editor = view?.editor;
    if (!editor) {
      new Notice('无法定位：当前编辑器不可用');
      return false;
    }

    const maxLine = Math.max(0, editor.lineCount() - 1);
    const line = Math.max(0, Math.min(maxLine, Number(lineNumber) || 0));
    const text = editor.getLine(line) || '';
    const column = Math.max(0, Math.min(text.length, Number(ch) || 0));

    editor.setCursor({ line, ch: column });
    if (typeof editor.scrollIntoView === 'function') {
      editor.scrollIntoView(
        { from: { line, ch: 0 }, to: { line, ch: text.length } },
        true
      );
    }
    editor.focus();
    return true;
  }

  async setImageSizeAtSourceLine(activeFile, item, sizeValue = '') {
    const ok = await this.focusImageSourceLine(activeFile, item?.line ?? item?.lineNumber ?? 0, item?.from ?? 0);
    if (!ok) return false;

    const editor = this.getActiveEditor();
    if (!editor) return false;

    const lineNumber = Number(item?.line ?? item?.lineNumber ?? 0);
    const lineText = editor.getLine(lineNumber) || '';
    let embed = this.findFirstEmbedInLine(activeFile, lineText, lineNumber, item?.file || null);

    // 缺失文件或外部图片没有 targetFile，可用原始文本精确定位。
    if (!embed && item?.fullMatch) {
      const from = lineText.indexOf(item.fullMatch);
      if (from >= 0) {
        const match = createImageLinkRegex('g').exec(lineText.slice(from));
        if (match) {
          match.index = from;
          embed = makeImageLinkItemFromMatch(match, lineText, lineNumber, activeFile, this.app);
        }
      }
    }

    if (!embed) {
      new Notice('未找到对应图片源码');
      return false;
    }

    const normalized = normalizeImageSize(sizeValue || this.settings.uniformSizeDefault || '500');
    if (!normalized) {
      new Notice('默认图片宽度为空');
      return false;
    }
    return await this.setCurrentLineImageSize(normalized, embed);
  }

  openImageDescriptionModal(lineEmbed = null) {
    const activeFile = this.getActiveFile();
    if (!activeFile) {
      new Notice('未找到当前笔记');
      return;
    }
    const embed = lineEmbed || this.findCurrentLineFirstEmbed(activeFile);
    if (!embed) {
      new Notice('当前行未检测到图片嵌入');
      return;
    }

    const currentDescription = getImageDescriptionFromEmbed(embed.fullMatch);
    const editor = this.getActiveEditor();
    const currentLine = editor ? (editor.getLine(embed.lineNumber) || '') : '';
    const currentStyle = getImageCaptionStyleFromLine(currentLine);

    new ImageDescriptionModal(this.app, currentDescription, currentStyle, async (payload) => {
      await this.setCurrentLineImageDescription(payload, embed);
    }).open();
  }

  openImageDescriptionModalAtLine(lineNumber, sourcePath = '', expectedLine = '') {
    const activeFile = this.getActiveFile();
    const editor = this.getActiveEditor();
    if (!activeFile || !editor) {
      new Notice('当前编辑器不可用');
      return;
    }
    if (sourcePath && activeFile.path !== sourcePath) {
      new Notice('当前笔记已切换，未修改图片说明');
      return;
    }

    let resolvedLine = Number.isInteger(lineNumber) ? lineNumber : -1;
    let line = resolvedLine >= 0 ? (editor.getLine(resolvedLine) || '') : '';

    // Block Widget 可能因 CodeMirror 重绘导致旧行号失配：
    // 先比对源文本，不一致时在附近搜索，再退化到全篇唯一匹配。
    const expected = String(expectedLine || '').trim();
    if (expected && line.trim() !== expected) {
      const lineCount = editor.lineCount();
      const nearby = [];
      if (resolvedLine >= 0) {
        for (let delta = 1; delta <= 8; delta += 1) {
          if (resolvedLine - delta >= 0) nearby.push(resolvedLine - delta);
          if (resolvedLine + delta < lineCount) nearby.push(resolvedLine + delta);
        }
      }
      let found = nearby.find((candidate) => String(editor.getLine(candidate) || '').trim() === expected);
      if (found === undefined) {
        const matches = [];
        for (let i = 0; i < lineCount; i += 1) {
          if (String(editor.getLine(i) || '').trim() === expected) matches.push(i);
        }
        if (matches.length === 1) found = matches[0];
      }
      if (found !== undefined) {
        resolvedLine = found;
        line = editor.getLine(found) || '';
      }
    }

    let embed = resolvedLine >= 0
      ? this.findFirstEmbedInLine(activeFile, line, resolvedLine)
      : null;

    // 如果精确文本已经变化，再用图片目标文件进行回退定位。
    if (!embed && expected) {
      const expectedMatch = createImageLinkRegex('g').exec(expected);
      if (expectedMatch) {
        const parsed = parseImageLinkMatch(expectedMatch);
        const target = parsed?.rawTarget || '';
        if (target) {
          const file = this.app.metadataCache.getFirstLinkpathDest(target, activeFile.path);
          if (file) {
            embed = this.findEmbedForFileInEditor(activeFile, file, Math.max(0, resolvedLine));
          }
        }
      }
    }

    if (!embed) {
      new Notice('未找到对应图片源码；请把光标放到该图片所在行后再试');
      return;
    }
    this.openImageDescriptionModal(embed);
  }

  async setCurrentLineImageDescription(payload, lineEmbed = null) {
    const editor = this.getActiveEditor();
    const activeFile = this.getActiveFile();
    if (!editor || !activeFile) return false;

    const data = (payload && typeof payload === 'object')
      ? payload
      : { description: String(payload || ''), color: '', size: '' };

    const descriptionValue = String(data.description || '').trim();

    const beforeContent = this.getEditorContent(editor, activeFile);
    let embed = lineEmbed || this.findCurrentLineFirstEmbed(activeFile);
    if (!embed) {
      new Notice('当前行未检测到图片嵌入');
      return false;
    }

    let currentLine = editor.getLine(embed.lineNumber) || '';
    if (currentLine.slice(embed.from, embed.to) !== embed.fullMatch) {
      const resolved = this.findEmbedForFileInEditor(activeFile, embed.file, embed.lineNumber)
        || this.findEmbedByTextFallback(activeFile, embed.file, embed.lineNumber);
      if (resolved) {
        embed = resolved;
        currentLine = editor.getLine(embed.lineNumber) || '';
      }
    }

    const finalLinkText = applyImageDescriptionToEmbed(embed.fullMatch, descriptionValue);
    const linkUpdatedLine =
      currentLine.slice(0, embed.from)
      + finalLinkText
      + currentLine.slice(embed.to);

    const finalLine = applyImageCaptionStyleToLine(linkUpdatedLine, {
      color: data.color,
      size: data.size,
    });

    if (finalLine === currentLine) {
      new Notice('图片标题未变化');
      return false;
    }

    if (typeof editor.replaceRange !== 'function') {
      new Notice('图片标题写入失败：编辑器不支持替换操作');
      return false;
    }

    editor.replaceRange(
      finalLine,
      { line: embed.lineNumber, ch: 0 },
      { line: embed.lineNumber, ch: currentLine.length }
    );

    await sleep(80);
    const afterContent = this.getEditorContent(editor, activeFile);
    if (afterContent === beforeContent || !afterContent.includes(finalLine)) {
      new Notice('图片标题写入失败：未能确认正文已更新');
      return false;
    }

    await this.writeOperationLog({
      type: 'set-image-description',
      createdAt: new Date().toISOString(),
      notes: [{ path: activeFile.path, beforeContent, afterContent }],
      renames: [],
    });

    new Notice(descriptionValue ? '已更新图片标题' : '已清除图片标题');
    return true;
  }

  async setCurrentLineImageSize(sizeValue, lineEmbed = null) {
    const editor = this.getActiveEditor();
    const activeFile = this.getActiveFile();
    if (!editor || !activeFile) return false;

    const normalized = normalizeImageSize(sizeValue);
    if (!normalized) {
      new Notice('尺寸不能为空');
      return false;
    }

    const beforeContent = this.getEditorContent(editor, activeFile);
    let embed = lineEmbed || this.findCurrentLineFirstEmbed(activeFile);
    if (!embed) {
      new Notice('当前行未检测到图片嵌入');
      return false;
    }

    // When the modal was opened before Obsidian finished refreshing links,
    // the saved character range can become stale. Re-resolve the embed before writing.
    const currentLine = editor.getLine(embed.lineNumber) || '';
    if (currentLine.slice(embed.from, embed.to) !== embed.fullMatch) {
      const resolved = this.findEmbedForFileInEditor(activeFile, embed.file, embed.lineNumber)
        || this.findEmbedByTextFallback(activeFile, embed.file, embed.lineNumber);
      if (resolved) embed = resolved;
    }

    const finalLinkText = applyImageSizeToWikiEmbed(embed.fullMatch, normalized);
    if (finalLinkText === embed.fullMatch) {
      new Notice('尺寸未变化');
      return false;
    }

    const ok = this.replaceEmbedText(editor, embed, finalLinkText);
    if (!ok) {
      new Notice('尺寸写入失败：编辑器不支持替换操作');
      return false;
    }

    await sleep(80);
    const afterContent = this.getEditorContent(editor, activeFile);
    if (afterContent === beforeContent || !afterContent.includes(finalLinkText)) {
      new Notice('尺寸写入失败：未能确认正文已更新');
      return false;
    }

    await this.writeOperationLog({
      type: 'set-size',
      createdAt: new Date().toISOString(),
      notes: [{ path: activeFile.path, beforeContent, afterContent }],
      renames: [],
    });
    new Notice(`已设置图片尺寸：${normalized}`);
    return true;
  }

  async verifyLinkAfterRename(sourcePath, expectedNewPath, beforeContent) {
    await sleep(220);
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile)) return { ok: false, reason: '源笔记不存在' };

    const afterContent = await this.app.vault.cachedRead(sourceFile);
    if (afterContent === beforeContent) {
      return { ok: false, reason: '正文链接未发生变化' };
    }

    const cache = this.app.metadataCache.getFileCache(sourceFile);
    if (cache && Array.isArray(cache.embeds)) {
      const found = cache.embeds.some((embed) => {
        const linked = this.app.metadataCache.getFirstLinkpathDest(embed.link, sourceFile.path);
        return linked instanceof TFile && linked.path === expectedNewPath;
      });
      if (found) return { ok: true, afterContent };
    }

    if (afterContent.includes(basename(expectedNewPath))) return { ok: true, afterContent };
    return { ok: false, reason: '未能确认正文链接指向新文件', afterContent };
  }

  async ensureLogFolder() {
    const folder = LOG_FOLDER;
    try {
      if (!(await this.app.vault.adapter.exists(folder))) {
        await this.app.vault.adapter.mkdir(folder);
      }
    } catch (err) {}
    return folder;
  }

  async writeOperationLog(log) {
    try {
      const folder = await this.ensureLogFolder();
      const stamp = (log.createdAt || new Date().toISOString()).replace(/[:.]/g, '-');
      const path = `${folder}/${stamp}-${log.type || 'operation'}.json`;
      const payload = JSON.stringify(log, null, 2);
      await this.app.vault.adapter.write(path, payload);
      await this.app.vault.adapter.write(`${folder}/last-operation.json`, payload);
    } catch (err) {
      new Notice('操作已完成，但日志写入失败，无法保证可回滚。');
    }
  }

  async rollbackLastOperation() {
    const folder = LOG_FOLDER;
    const lastPath = `${folder}/last-operation.json`;
    if (!(await this.app.vault.adapter.exists(lastPath))) {
      new Notice('未找到可撤销的图片工作流日志');
      return;
    }

    let log;
    try {
      log = JSON.parse(await this.app.vault.adapter.read(lastPath));
    } catch (err) {
      new Notice('撤销失败：日志无法解析');
      return;
    }

    let restoredNotes = 0;
    let skippedNotes = 0;
    let restoredFiles = 0;
    let skippedFiles = 0;

    const renames = Array.isArray(log.renames) ? [...log.renames].reverse() : [];
    for (const item of renames) {
      const current = this.app.vault.getAbstractFileByPath(item.newPath);
      const old = this.app.vault.getAbstractFileByPath(item.oldPath);
      if (current instanceof TFile && !(old instanceof TFile)) {
        try {
          await this.app.fileManager.renameFile(current, item.oldPath);
          restoredFiles++;
        } catch (err) {
          skippedFiles++;
        }
      } else {
        skippedFiles++;
      }
    }

    await sleep(160);

    const notes = Array.isArray(log.notes) ? log.notes : [];
    for (const item of notes) {
      const noteFile = this.app.vault.getAbstractFileByPath(item.path);
      if (!(noteFile instanceof TFile)) {
        skippedNotes++;
        continue;
      }
      const current = await this.app.vault.cachedRead(noteFile);
      if (current !== item.afterContent) {
        skippedNotes++;
        continue;
      }
      await this.app.vault.modify(noteFile, item.beforeContent);
      restoredNotes++;
    }

    new Notice(`撤销完成：恢复文件 ${restoredFiles} 个，恢复笔记 ${restoredNotes} 篇；跳过文件 ${skippedFiles} 个，跳过笔记 ${skippedNotes} 篇。`);
  }

  async renameFile(file, requestedName, sourcePath, replaceCurrentLine, sizeValue = '', lineEmbed = null) {
    const deduped = await this.deduplicateNewName(requestedName, file);
    const newName = deduped.name;
    const originName = file.name;
    const oldPath = file.path;
    const newPath = joinPath(file.parent.path, newName);
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    const beforeContent = sourceFile instanceof TFile ? await this.app.vault.cachedRead(sourceFile) : '';

    try {
      await this.app.fileManager.renameFile(file, newPath);
    } catch (err) {
      new Notice(`重命名失败：${newName}`);
      throw err;
    }

    if (replaceCurrentLine) {
      const directOk = await this.directRewriteRenamedEmbed(sourcePath, file, sizeValue, lineEmbed, newName, newPath);
      if (!directOk) {
        await this.replaceCurrentLineEmbed(sourcePath, sizeValue, lineEmbed, file);
      }
    }

    const verification = sourceFile instanceof TFile
      ? await this.verifyLinkAfterRename(sourcePath, newPath, beforeContent)
      : { ok: true, afterContent: '' };

    if (!verification.ok) {
      new Notice(`图片已重命名，但链接校验失败：${verification.reason}`);
    }

    const afterContent = sourceFile instanceof TFile ? await this.app.vault.cachedRead(sourceFile) : '';
    await this.writeOperationLog({
      type: 'rename',
      createdAt: new Date().toISOString(),
      renames: [{ oldPath, newPath }],
      notes: sourceFile instanceof TFile && beforeContent !== afterContent
        ? [{ path: sourceFile.path, beforeContent, afterContent }]
        : [],
      verification,
    });

    if (!this.settings.disableRenameNotice) {
      new Notice(`Renamed ${originName} → ${newName}`);
    }
  }

  getImageLinkTarget(targetFile, sourcePath, targetPathOverride = '', fileNameOverride = '') {
    const mode = this.settings.imageLinkMode || 'short';
    const targetPath = normalizePath(targetPathOverride || (targetFile instanceof TFile ? targetFile.path : fileNameOverride));
    const name = fileNameOverride || basename(targetPath);

    if (mode === 'full') return targetPath;
    if (mode === 'relative') return makeRelativePath(sourcePath, targetPath);
    return name;
  }

  buildDirectWikiImageLink(targetFile, sourcePath, sizeValue = '', targetPathOverride = '', fileNameOverride = '') {
    const size = normalizeImageSize(sizeValue);
    const target = this.getImageLinkTarget(targetFile, sourcePath, targetPathOverride, fileNameOverride);
    return size ? `![[${target}|${size}]]` : `![[${target}]]`;
  }

  async directRewriteRenamedEmbed(sourcePath, targetFile, sizeValue = '', lineEmbed = null, newName = '', newPath = '') {
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile)) return false;

    const finalLinkText = this.buildDirectWikiImageLink(targetFile, sourcePath, sizeValue, newPath || targetFile.path, newName || targetFile.name);
    const activeFile = this.getActiveFile();
    const editor = this.getActiveEditor();
    const canEditInEditor = editor && activeFile instanceof TFile && activeFile.path === sourceFile.path;
    const preferredLine = lineEmbed ? lineEmbed.lineNumber : null;

    const replaceInEditor = (embed) => {
      if (!canEditInEditor || !embed) return false;
      const currentLine = editor.getLine(embed.lineNumber) || '';
      let from = embed.from;
      let to = embed.to;
      const currentSlice = currentLine.slice(from, to);
      const imageRegex = /^!?\[\[[^\]]+\]\]$|^!\[[^\]]*\]\((<[^>]+>|[^)]+)\)$/;
      if (!imageRegex.test(currentSlice)) {
        const fallback = this.findFirstEmbedInLine(sourceFile, currentLine, embed.lineNumber);
        if (!fallback) return false;
        from = fallback.from;
        to = fallback.to;
      }
      if (typeof editor.replaceRange === 'function') {
        editor.replaceRange(finalLinkText, { line: embed.lineNumber, ch: from }, { line: embed.lineNumber, ch: to });
        return true;
      }
      return false;
    };

    if (canEditInEditor) {
      let embed = null;
      if (lineEmbed) {
        embed = { ...lineEmbed, file: targetFile };
      }
      if (!embed) {
        embed = this.findEmbedForFileInEditor(sourceFile, targetFile, preferredLine)
          || this.findEmbedByTextFallback(sourceFile, targetFile, preferredLine)
          || this.findCurrentLineFirstEmbed(sourceFile);
      }
      if (replaceInEditor(embed)) {
        await sleep(80);
        if (this.getEditorContent(editor, sourceFile).includes(finalLinkText)) return true;
      }
    }

    // Fallback：直接改文件内容。优先改记录行，其次改能解析到目标图片的第一处链接。
    let content = await this.app.vault.cachedRead(sourceFile);
    const lines = content.split('\n');
    const tryLineNumbers = [];
    if (preferredLine != null) tryLineNumbers.push(preferredLine);
    for (let i = 0; i < lines.length; i++) if (!tryLineNumbers.includes(i)) tryLineNumbers.push(i);

    for (const lineNumber of tryLineNumbers) {
      const line = lines[lineNumber] || '';
      const embed = this.findFirstEmbedInLine(sourceFile, line, lineNumber, targetFile)
        || (lineNumber === preferredLine ? this.findFirstEmbedInLine(sourceFile, line, lineNumber) : null);
      if (!embed) continue;
      lines[lineNumber] = line.slice(0, embed.from) + finalLinkText + line.slice(embed.to);
      const nextContent = lines.join('\n');
      await this.app.vault.modify(sourceFile, nextContent);
      await sleep(80);
      const verified = canEditInEditor ? this.getEditorContent(editor, sourceFile) : await this.app.vault.cachedRead(sourceFile);
      return verified.includes(finalLinkText);
    }

    return false;
  }

  async ensureFileEmbedHasSize(sourcePath, targetFile, sizeValue = '', preferredLineNumber = null) {
    const normalized = normalizeImageSize(sizeValue);
    if (!normalized) return true;

    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile)) return false;

    const activeFile = this.getActiveFile();
    const editor = this.getActiveEditor();
    const canEditInEditor = editor && activeFile instanceof TFile && activeFile.path === sourceFile.path;

    for (let attempt = 0; attempt < 24; attempt++) {
      const content = canEditInEditor ? this.getEditorContent(editor, sourceFile) : await this.app.vault.cachedRead(sourceFile);
      let embed = null;
      if (canEditInEditor) {
        embed = this.findEmbedForFileInEditor(sourceFile, targetFile, preferredLineNumber)
          || this.findEmbedByTextFallback(sourceFile, targetFile, preferredLineNumber);
      }
      if (!embed) {
        embed = this.findEmbedForFileInContent(sourceFile, targetFile, content, preferredLineNumber);
      }

      if (embed) {
        const finalLinkText = applyImageSizeToWikiEmbed(embed.fullMatch, normalized);
        if (finalLinkText === embed.fullMatch) return true;

        if (canEditInEditor) {
          const currentLine = editor.getLine(embed.lineNumber) || '';
          const currentFullMatch = currentLine.slice(embed.from, embed.to);
          if (currentFullMatch === embed.fullMatch) {
            this.replaceEmbedText(editor, embed, finalLinkText);
          } else {
            const refreshed = this.findEmbedForFileInEditor(sourceFile, targetFile, embed.lineNumber)
              || this.findEmbedByTextFallback(sourceFile, targetFile, embed.lineNumber);
            if (refreshed) this.replaceEmbedText(editor, refreshed, applyImageSizeToWikiEmbed(refreshed.fullMatch, normalized));
          }
        } else {
          const lines = content.split('\n');
          const line = lines[embed.lineNumber] || '';
          if (line.slice(embed.from, embed.to) !== embed.fullMatch) {
            await sleep(120);
            continue;
          }
          lines[embed.lineNumber] = line.slice(0, embed.from) + finalLinkText + line.slice(embed.to);
          await this.app.vault.modify(sourceFile, lines.join('\n'));
        }

        await sleep(120);
        const verifyContent = canEditInEditor ? this.getEditorContent(editor, sourceFile) : await this.app.vault.cachedRead(sourceFile);
        if (verifyContent.includes(finalLinkText)) return true;
      }

      await sleep(120);
    }

    return false;
  }

  async replaceCurrentLineEmbed(sourcePath, sizeValue = '', lineEmbed = null, targetFile = null) {
    const editor = this.getActiveEditor();
    const activeFile = this.getActiveFile();
    if (!editor || !activeFile) return false;

    const fileForLink = targetFile instanceof TFile ? targetFile : (lineEmbed ? lineEmbed.file : null);
    let embed = lineEmbed || this.findCurrentLineFirstEmbed(activeFile);
    const preferredLine = lineEmbed ? lineEmbed.lineNumber : (embed ? embed.lineNumber : null);

    for (let attempt = 0; attempt < 16; attempt++) {
      if (embed) {
        const currentLine = editor.getLine(embed.lineNumber) || '';
        const currentFullMatch = currentLine.slice(embed.from, embed.to);
        if (currentFullMatch !== embed.fullMatch) {
          embed = this.findEmbedForFileInEditor(activeFile, fileForLink || embed.file, embed.lineNumber)
            || this.findEmbedByTextFallback(activeFile, fileForLink || embed.file, embed.lineNumber);
        }
      }

      if (!embed && fileForLink instanceof TFile) {
        embed = this.findEmbedForFileInEditor(activeFile, fileForLink, preferredLine)
          || this.findEmbedByTextFallback(activeFile, fileForLink, preferredLine)
          || this.findEmbedForFileInContent(activeFile, fileForLink, this.getEditorContent(editor, activeFile), preferredLine);
      }

      if (embed) break;
      await sleep(120);
    }

    if (!embed) {
      if (fileForLink instanceof TFile && normalizeImageSize(sizeValue)) {
        return await this.ensureFileEmbedHasSize(sourcePath, fileForLink, sizeValue, preferredLine);
      }
      return false;
    }

    const finalFile = fileForLink instanceof TFile ? fileForLink : embed.file;
    const finalLinkText = this.buildDirectWikiImageLink(finalFile, sourcePath, sizeValue, finalFile.path, finalFile.name);
    const ok = this.replaceEmbedText(editor, embed, finalLinkText);
    await sleep(120);

    if (normalizeImageSize(sizeValue)) {
      const verified = await this.ensureFileEmbedHasSize(sourcePath, finalFile, sizeValue, embed.lineNumber);
      return ok || verified;
    }
    return ok;
  }

  async deduplicateNewName(newName, file) {
    const dir = file.parent.path;
    const listed = await this.app.vault.adapter.list(dir);
    const ext = extension(newName);
    const stem = ext ? newName.slice(0, -(ext.length + 1)) : newName;
    const delimiter = sanitizeDelimiter(this.settings.dupNumberDelimiter);
    const stemEscaped = escapeRegExp(stem);
    const delimiterEscaped = escapeRegExp(delimiter);

    let dupNameRegex;
    if (this.settings.dupNumberAtStart) {
      dupNameRegex = new RegExp(`^(?<number>\\d+)${delimiterEscaped}(?<name>${stemEscaped})\\.${escapeRegExp(ext)}$`);
    } else {
      dupNameRegex = new RegExp(`^(?<name>${stemEscaped})${delimiterEscaped}(?<number>\\d+)\\.${escapeRegExp(ext)}$`);
    }

    const numbers = [];
    let exists = false;
    for (let sibling of listed.files) {
      sibling = basename(sibling);
      if (sibling === newName) {
        exists = true;
        continue;
      }
      const match = dupNameRegex.exec(sibling);
      if (match && match.groups && match.groups.number) {
        numbers.push(parseInt(match.groups.number, 10));
      }
    }

    if (exists || this.settings.dupNumberAlways) {
      const usesTemplateIndex = String(this.settings.imageNamePattern || '').includes('{{index}}');
      if (exists && usesTemplateIndex && !this.settings.dupNumberAlways) {
        const nextIndexed = this.nextIndexedNameFromStem(stem, ext, listed.files, delimiter);
        if (nextIndexed) {
          return { name: nextIndexed, stem: nextIndexed.slice(0, -(ext.length + 1)), extension: ext };
        }
      }

      const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      if (this.settings.dupNumberAtStart) {
        newName = `${nextNumber}${delimiter}${stem}.${ext}`;
      } else {
        newName = `${stem}${delimiter}${nextNumber}.${ext}`;
      }
    }

    return { name: newName, stem, extension: ext };
  }

  nextIndexedNameFromStem(stem, ext, siblingPaths, delimiter) {
    const siblings = new Set((siblingPaths || []).map((path) => basename(path)));
    const extensionText = ext ? `.${ext}` : '';
    const delimiterEscaped = escapeRegExp(delimiter);

    if (this.settings.dupNumberAtStart) {
      const startMatch = new RegExp(`^(\\d+)${delimiterEscaped}(.+)$`).exec(stem);
      if (!startMatch) return null;
      const prefix = startMatch[2];
      let number = parseInt(startMatch[1], 10);
      if (!Number.isFinite(number)) return null;
      const width = Math.max(1, startMatch[1].length);
      const makeName = (n) => `${String(n).padStart(width, '0')}${delimiter}${prefix}${extensionText}`;
      while (siblings.has(makeName(number))) number++;
      return makeName(number);
    }

    const endMatch = new RegExp(`^(.+)${delimiterEscaped}(\\d+)$`).exec(stem);
    if (!endMatch) return null;
    const prefix = endMatch[1];
    let number = parseInt(endMatch[2], 10);
    if (!Number.isFinite(number)) return null;
    const width = Math.max(1, endMatch[2].length);
    const makeName = (n) => `${prefix}${delimiter}${String(n).padStart(width, '0')}${extensionText}`;
    while (siblings.has(makeName(number))) number++;
    return makeName(number);
  }

  getEmbeddedImageFiles(activeFile) {
    const cache = this.app.metadataCache.getFileCache(activeFile);
    if (!cache || !Array.isArray(cache.embeds)) return { files: [], duplicateEmbeds: [] };

    const unique = [];
    const duplicateEmbeds = [];
    const seen = new Set();

    for (const embed of cache.embeds) {
      const linked = this.app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path);
      if (!(linked instanceof TFile) || !isImageFile(linked)) continue;
      if (seen.has(linked.path)) {
        duplicateEmbeds.push({ link: embed.link, path: linked.path });
        if (this.settings.resequenceSkipDuplicateEmbeds) continue;
      }
      seen.add(linked.path);
      unique.push(linked);
    }

    return { files: unique, duplicateEmbeds };
  }

  makeSequenceStem(baseStem, index) {
    const delimiter = sanitizeDelimiter(this.settings.dupNumberDelimiter);
    if (this.settings.dupNumberAtStart) {
      return `${index}${delimiter}${baseStem}`;
    }
    return `${baseStem}${delimiter}${index}`;
  }

  renderImageNamePatternForIndex(activeFile, imageFile, indexText, context = {}) {
    const fileCache = this.app.metadataCache.getFileCache(activeFile);
    const frontmatter = fileCache ? fileCache.frontmatter : null;
    const imageNameKey = frontmatter && frontmatter.imageNameKey ? String(frontmatter.imageNameKey) : '';
    const firstHeading = getFirstHeading(fileCache ? fileCache.headings : null);
    const heading = context.heading != null
      ? String(context.heading || '')
      : this.getCurrentHeadingText(activeFile);
    return renderTemplate(this.settings.imageNamePattern, {
      imageNameKey,
      fileName: activeFile.basename,
      note: activeFile.basename,
      dirName: activeFile.parent ? activeFile.parent.name : '',
      folder: activeFile.parent ? activeFile.parent.name : '',
      firstHeading,
      heading,
      index: indexText,
      originalName: imageFile ? imageFile.basename : '',
    }, frontmatter || undefined);
  }

  isGeneratedByCurrentPattern(activeFile, imageFile) {
    if (!(imageFile instanceof TFile)) return false;
    const pattern = String(this.settings.imageNamePattern || '');
    if (!pattern.includes('{{index}}')) return false;
    const delimiter = sanitizeDelimiter(this.settings.dupNumberDelimiter);
    const escapedDelimiter = escapeRegExp(delimiter);
    const padding = Math.max(1, Number(this.settings.resequenceNumberPadding || 1));
    const probeIndex = '___IWT_INDEX___';
    const probeStem = this.renderImageNamePatternForIndex(activeFile, imageFile, probeIndex);
    if (!probeStem || !probeStem.includes(probeIndex)) return false;
    const regexText = '^' + escapeRegExp(probeStem).replace(escapeRegExp(probeIndex), padding > 1 ? `\\d{${padding},}` : '\\d+') + '$';
    try {
      return new RegExp(regexText).test(imageFile.basename);
    } catch (_) {
      return false;
    }
  }

  async buildResequencePlan(activeFile) {
    const content = await this.app.vault.cachedRead(activeFile);
    const parsedItems = this.parseImageEmbedsFromContent(activeFile, content)
      .filter((item) => item.file instanceof TFile && isImageFile(item.file));

    const conflicts = [];
    const tasks = [];
    const duplicateEmbeds = [];
    const seen = new Set();
    const entries = [];

    for (const item of parsedItems) {
      const file = item.file;
      if (seen.has(file.path)) {
        duplicateEmbeds.push({ link: item.rawTarget, path: file.path, fullMatch: item.fullMatch });
        if (this.settings.resequenceSkipDuplicateEmbeds) continue;
      }
      seen.add(file.path);
      entries.push({ file, item });
    }

    if (entries.length === 0) {
      return { activeFile, baseStem: '', tasks, conflicts, duplicateEmbeds };
    }

    const pattern = String(this.settings.imageNamePattern || '');
    const usesTemplateIndex = pattern.includes('{{index}}');
    const padding = Math.max(1, Number(this.settings.resequenceNumberPadding || 1));
    const startAt = Number.isFinite(Number(this.settings.resequenceStartNumber))
      ? parseInt(this.settings.resequenceStartNumber, 10)
      : 1;

    let baseStem = '';
    if (!usesTemplateIndex) {
      const generated = this.generateNewName(entries[0].file, activeFile);
      if (!generated.isMeaningful) {
        throw new Error('按当前设置生成的主文件名为空，无法重排。');
      }
      baseStem = generated.stem;
    }

    const oldPathSet = new Set(entries.map((entry) => entry.file.path));
    const finalPaths = [];

    entries.forEach(({ file, item }, i) => {
      const sequenceNumber = startAt + i;
      const paddedNumber = String(sequenceNumber).padStart(padding, '0');
      const itemHeading = this.getHeadingTextAtLine(activeFile, item.lineNumber, content);
      let finalStem = usesTemplateIndex
        ? this.renderImageNamePatternForIndex(activeFile, file, paddedNumber, { heading: itemHeading })
        : this.makeSequenceStem(baseStem, paddedNumber);

      if (!finalStem) {
        finalStem = this.makeSequenceStem(sanitizeFilename(activeFile.basename), paddedNumber);
      }

      // 模板中含 {{index}} 时，模板已经完整定义目标名称；禁止再追加旧文件名。
      // 只有模板不含 {{index}} 且用户选择“保留语义”时，才追加旧图片短名。
      if (!usesTemplateIndex && (this.settings.resequenceNameMode || 'semantic') === 'semantic') {
        const originalStem = sanitizeFilename(file.basename.replace(/^Pasted image\s*/i, '').replace(/^image\s*/i, ''));
        // 只在旧图片名确实携带外部语义时追加旧名。
        // 如果旧名已经是本插件生成的“笔记名/标题名/序号”结构，标题改名后重排必须按当前命名规则重写，不能把旧标题继续拼回去。
        if (originalStem && !finalStem.includes(originalStem) && !this.originalNameLooksGenerated(activeFile, originalStem)) {
          finalStem = `${finalStem}${sanitizeDelimiter(this.settings.dupNumberDelimiter)}${originalStem}`;
        }
      }

      const finalName = `${finalStem}.${file.extension}`;
      const finalPath = joinPath(file.parent.path, finalName);
      finalPaths.push(finalPath);
      tasks.push({
        file,
        oldName: file.name,
        oldPath: file.path,
        oldFullMatch: item.fullMatch,
        oldRawTarget: item.rawTarget,
        oldSize: item.size || '',
        finalStem,
        finalName,
        finalPath,
        expectedOldLink: item.fullMatch,
        expectedNewLink: this.buildDirectWikiImageLink(file, activeFile.path, item.size || '', finalPath, finalName),
        risks: finalPath === file.path ? ['目标路径与原路径一致'] : [],
      });
    });

    const counts = new Map();
    for (const finalPath of finalPaths) counts.set(finalPath, (counts.get(finalPath) || 0) + 1);
    for (const [dupPath, count] of counts.entries()) {
      if (count <= 1) continue;
      conflicts.push({ targetPath: dupPath, existingPath: dupPath, reason: '目标文件名重复' });
      tasks.filter((task) => task.finalPath === dupPath).forEach((task) => task.risks.push('目标文件名重复'));
    }

    for (const task of tasks) {
      const existing = this.app.vault.getAbstractFileByPath(task.finalPath);
      if (existing instanceof TFile && !oldPathSet.has(existing.path)) {
        conflicts.push({ targetPath: task.finalPath, existingPath: existing.path, reason: '目标路径已存在外部文件' });
        task.risks.push('目标路径已存在外部文件');
      }
    }

    const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    tasks.forEach((task, i) => {
      const tempName = `__pirr_tmp__${seed}_${i + 1}.${task.file.extension}`;
      task.tempName = tempName;
      task.tempPath = joinPath(task.file.parent.path, tempName);
    });

    return { activeFile, baseStem, tasks, conflicts, duplicateEmbeds };
  }

  linkItemMatchesResequenceTask(item, targetFile, task) {
    if (!item || !task) return false;
    if (item.file instanceof TFile && item.file.path === task.finalPath) return true;
    const raw = normalizePath(cleanLinkPath(item.rawTarget || ''));
    if (!raw) return false;
    if (raw === task.finalPath || raw === task.oldPath) return true;
    if (raw === task.finalName || raw === task.oldName) return true;
    if (basename(raw) === task.finalName || basename(raw) === task.oldName) return true;
    if (targetFile instanceof TFile && this.linkTargetLooksLikeFile(raw, targetFile)) return true;
    return false;
  }

  async canonicalizeResequenceLinks(plan, activeFile) {
    const before = await this.app.vault.cachedRead(activeFile);
    const lines = before.split('\n');
    const items = this.parseImageEmbedsFromContent(activeFile, before)
      .filter((item) => !item.external)
      .sort((a, b) => b.lineNumber - a.lineNumber || b.from - a.from);

    let changed = 0;
    for (const item of items) {
      const task = plan.tasks.find((candidate) => {
        const targetFile = this.app.vault.getAbstractFileByPath(candidate.finalPath);
        return this.linkItemMatchesResequenceTask(item, targetFile, candidate);
      });
      if (!task) continue;

      const finalFile = this.app.vault.getAbstractFileByPath(task.finalPath);
      const finalLink = this.buildDirectWikiImageLink(
        finalFile instanceof TFile ? finalFile : task.file,
        activeFile.path,
        item.size || task.oldSize || '',
        task.finalPath,
        task.finalName,
      );
      if (item.fullMatch === finalLink) continue;
      const line = lines[item.lineNumber] || '';
      if (line.slice(item.from, item.to) !== item.fullMatch) continue;
      lines[item.lineNumber] = line.slice(0, item.from) + finalLink + line.slice(item.to);
      changed++;
    }

    const after = lines.join('\n');
    if (after !== before) {
      await this.app.vault.modify(activeFile, after);
    }
    return { before, after, changed };
  }

  async executeResequencePlan(plan, activeFile) {
    if (plan.conflicts.length > 0) {
      const first = plan.conflicts[0];
      new Notice(`无法执行：目标路径冲突 ${first.targetPath}`);
      return;
    }
    if (plan.tasks.length === 0) {
      new Notice('当前文章未检测到可重排的图片');
      return;
    }

    for (const task of plan.tasks) {
      const existing = this.app.vault.getAbstractFileByPath(task.tempPath);
      if (existing instanceof TFile) {
        new Notice(`临时文件名冲突：${task.tempName}`);
        return;
      }
    }

    const beforeContent = await this.app.vault.cachedRead(activeFile);

    try {
      for (const task of plan.tasks) {
        await this.app.fileManager.renameFile(task.file, task.tempPath);
      }
      for (const task of plan.tasks) {
        await this.app.fileManager.renameFile(task.file, task.finalPath);
      }
    } catch (err) {
      new Notice(`重排失败：${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    await sleep(300);
    const canonicalizeResult = await this.canonicalizeResequenceLinks(plan, activeFile);
    await sleep(80);
    const afterContent = await this.app.vault.cachedRead(activeFile);
    await this.writeOperationLog({
      type: 'resequence',
      createdAt: new Date().toISOString(),
      renames: plan.tasks.map((task) => ({ oldPath: task.oldPath, newPath: task.finalPath })),
      notes: beforeContent !== afterContent ? [{ path: activeFile.path, beforeContent, afterContent }] : [],
      duplicateEmbeds: plan.duplicateEmbeds,
      conflicts: plan.conflicts,
      linkRewriteCount: canonicalizeResult.changed,
    });

    const count = plan.tasks.length;
    const duplicateInfo = plan.duplicateEmbeds.length > 0 && this.settings.resequenceShowPreviewNotice
      ? `，跳过 ${plan.duplicateEmbeds.length} 个重复嵌入`
      : '';
    const rewriteInfo = canonicalizeResult.changed > 0 ? `，重写 ${canonicalizeResult.changed} 处图片链接` : '';
    new Notice(`已按正文顺序重排 ${count} 张图片${duplicateInfo}${rewriteInfo}`);
  }

  async buildArchivePlan(activeFile) {
    const { files, duplicateEmbeds } = this.getEmbeddedImageFiles(activeFile);
    const conflicts = [];
    const tasks = [];
    if (files.length === 0) return { activeFile, baseStem: '', tasks, conflicts, duplicateEmbeds };

    const folderStem = renderTemplate(this.settings.archiveFolderPattern || '{{fileName}}.assets', {
      fileName: activeFile.basename,
      note: activeFile.basename,
      dirName: activeFile.parent ? activeFile.parent.name : '',
      folder: activeFile.parent ? activeFile.parent.name : '',
    }, undefined) || `${activeFile.basename}.assets`;
    const targetFolder = activeFile.parent && activeFile.parent.path ? joinPath(activeFile.parent.path, folderStem) : folderStem;
    const delimiter = sanitizeDelimiter(this.settings.dupNumberDelimiter);
    const oldPathSet = new Set(files.map((f) => f.path));
    const finalPaths = [];

    files.forEach((file, i) => {
      const num = String(i + 1).padStart(Math.max(1, Number(this.settings.resequenceNumberPadding || 1)), '0');
      const semantic = sanitizeFilename(file.basename.replace(/^Pasted image\s*/i, '').replace(/^image\s*/i, ''));
      const finalStem = semantic && semantic !== activeFile.basename
        ? `${sanitizeFilename(activeFile.basename)}${delimiter}${num}${delimiter}${semantic}`
        : `${sanitizeFilename(activeFile.basename)}${delimiter}${num}`;
      const finalName = `${finalStem}.${file.extension}`;
      const finalPath = joinPath(targetFolder, finalName);
      finalPaths.push(finalPath);
      tasks.push({
        file,
        oldName: file.name,
        oldPath: file.path,
        finalStem,
        finalName,
        finalPath,
        expectedOldLink: this.buildDirectWikiImageLink(file, activeFile.path, '', file.path, file.name),
        expectedNewLink: this.buildDirectWikiImageLink(file, activeFile.path, '', finalPath, finalName),
        risks: file.path === finalPath ? ['目标路径与原路径一致'] : [],
      });
    });

    const counts = new Map();
    for (const finalPath of finalPaths) counts.set(finalPath, (counts.get(finalPath) || 0) + 1);
    for (const [dupPath, count] of counts.entries()) {
      if (count <= 1) continue;
      conflicts.push({ targetPath: dupPath, existingPath: dupPath, reason: '目标文件名重复' });
      tasks.filter((task) => task.finalPath === dupPath).forEach((task) => task.risks.push('目标文件名重复'));
    }

    for (const task of tasks) {
      const existing = this.app.vault.getAbstractFileByPath(task.finalPath);
      if (existing instanceof TFile && !oldPathSet.has(existing.path)) {
        conflicts.push({ targetPath: task.finalPath, existingPath: existing.path, reason: '目标路径已存在外部文件' });
        task.risks.push('目标路径已存在外部文件');
      }
    }

    const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    tasks.forEach((task, i) => {
      task.tempName = `__iwt_archive_tmp__${seed}_${i + 1}.${task.file.extension}`;
      task.tempPath = joinPath(task.file.parent.path, task.tempName);
    });

    return { activeFile, baseStem: targetFolder, targetFolder, tasks, conflicts, duplicateEmbeds };
  }

  async executeArchivePlan(plan, activeFile) {
    if (plan.conflicts.length > 0) {
      new Notice(`无法执行：目标路径冲突 ${plan.conflicts[0].targetPath}`);
      return;
    }
    if (plan.tasks.length === 0) return;
    if (!(await this.app.vault.adapter.exists(plan.targetFolder))) {
      await this.app.vault.createFolder(plan.targetFolder);
    }
    const beforeContent = await this.app.vault.cachedRead(activeFile);
    try {
      for (const task of plan.tasks) await this.app.fileManager.renameFile(task.file, task.tempPath);
      for (const task of plan.tasks) await this.app.fileManager.renameFile(task.file, task.finalPath);
    } catch (err) {
      new Notice(`归档失败：${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await sleep(300);
    const canonicalizeResult = await this.canonicalizeResequenceLinks(plan, activeFile);
    await sleep(80);
    const afterContent = await this.app.vault.cachedRead(activeFile);
    await this.writeOperationLog({
      type: 'archive-images',
      createdAt: new Date().toISOString(),
      renames: plan.tasks.map((task) => ({ oldPath: task.oldPath, newPath: task.finalPath })),
      notes: beforeContent !== afterContent ? [{ path: activeFile.path, beforeContent, afterContent }] : [],
      targetFolder: plan.targetFolder,
      linkRewriteCount: canonicalizeResult.changed,
    });
    const rewriteInfo = canonicalizeResult.changed > 0 ? `，重写 ${canonicalizeResult.changed} 处图片链接` : '';
    new Notice(`已归档 ${plan.tasks.length} 张图片到 ${plan.targetFolder}${rewriteInfo}`);
  }

  getMarkdownScopeFiles() {
    const includeFolders = (this.settings.targetFolders || []).map(normalizeFolder).filter(Boolean);
    const excludeFolders = (this.settings.excludeFolders || []).map(normalizeFolder).filter(Boolean);
    return this.app.vault.getMarkdownFiles().filter((file) => {
      const included = includeFolders.length === 0
        ? true
        : includeFolders.some((folder) => isPathInsideFolder(file.path, folder));
      if (!included) return false;
      if (excludeFolders.length === 0) return true;
      return !excludeFolders.some((folder) => isPathInsideFolder(file.path, folder));
    });
  }

  getImageFiles() {
    const allowed = new Set((this.settings.imageExtensions || []).map((e) => e.toLowerCase().trim()).filter(Boolean));
    return this.app.vault.getFiles().filter((file) => allowed.has(file.extension.toLowerCase()));
  }

  buildImageNameIndex() {
    const index = new Map();
    for (const file of this.getImageFiles()) {
      const key = file.name.toLowerCase();
      const bucket = index.get(key) || [];
      bucket.push(file.path);
      index.set(key, bucket);
    }
    return index;
  }

  async previewCleaning() {
    const markdownFiles = this.getMarkdownScopeFiles();
    const imageIndex = this.buildImageNameIndex();

    const items = [];
    const skipped = [];
    let totalReplacements = 0;

    for (const file of markdownFiles) {
      const originalContent = await this.app.vault.cachedRead(file);
      const result = this.computeFilePreview(file, originalContent, imageIndex);
      if (result.replacements.length > 0) {
        items.push({
          file,
          filePath: file.path,
          originalContent,
          updatedContent: result.content,
          replacements: result.replacements,
        });
        totalReplacements += result.replacements.length;
      }
      if (result.skipped.length > 0) skipped.push(...result.skipped);
    }

    const preview = {
      scannedAt: new Date(),
      filesScanned: markdownFiles.length,
      notesChanged: items.length,
      replacements: totalReplacements,
      skipped,
      items,
    };

    this.lastPreview = preview;
    await this.openResultView(preview);
    new Notice(`预览完成：扫描 ${preview.filesScanned} 篇笔记，将修改 ${preview.notesChanged} 篇，预计清洗 ${preview.replacements} 处。`);
  }

  computeFilePreview(file, content, imageIndex) {
    const replacements = [];
    const skipped = [];
    let updated = content;

    if (this.settings.cleanWikiEmbeds) {
      updated = updated.replace(/!\[\[([^\]]+)\]\]/g, (fullMatch, inner, offset) => {
        const parsed = parseWikiEmbed(inner);
        const decision = this.evaluateReplacement({
          type: 'wiki',
          sourceFile: file,
          rawTarget: parsed.target,
          filenameCandidate: getBasename(parsed.target),
          fullMatch,
          imageIndex,
          offset,
        });

        if (!decision.ok) {
          skipped.push({ filePath: file.path, type: 'wiki', reason: decision.reason, original: fullMatch });
          return fullMatch;
        }

        const next = `![[${decision.basename}${parsed.suffix}]]`;
        if (next !== fullMatch) {
          replacements.push({ type: 'wiki', original: fullMatch, updated: next, reason: decision.reason, offset });
        }
        return next;
      });
    }

    if (this.settings.cleanMarkdownImages) {
      updated = updated.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (fullMatch, alt, rawDestination, offset) => {
        const parsed = parseMarkdownImageDestination(rawDestination);
        if (!parsed) return fullMatch;

        const decision = this.evaluateReplacement({
          type: 'markdown',
          sourceFile: file,
          rawTarget: parsed.target,
          filenameCandidate: getBasename(parsed.target),
          fullMatch,
          imageIndex,
          offset,
        });

        if (!decision.ok) {
          skipped.push({ filePath: file.path, type: 'markdown', reason: decision.reason, original: fullMatch });
          return fullMatch;
        }

        const wrapped = parsed.wrappedInAngles ? `<${decision.basename}>` : decision.basename;
        const titlePart = parsed.title ? ` ${parsed.title}` : '';
        const next = `![${alt}](${wrapped}${titlePart})`;
        if (next !== fullMatch) {
          replacements.push({ type: 'markdown', original: fullMatch, updated: next, reason: decision.reason, offset });
        }
        return next;
      });
    }

    return { content: updated, replacements, skipped };
  }

  evaluateReplacement({ type, sourceFile, rawTarget, filenameCandidate, fullMatch, imageIndex }) {
    const cleanedTarget = cleanLinkPath(rawTarget);
    if (!cleanedTarget) return { ok: false, reason: '空链接' };
    if (isExternalLink(cleanedTarget)) return { ok: false, reason: '外部链接' };
    if (!hasAnyPathSegment(cleanedTarget)) return { ok: false, reason: '已是文件名形式' };
    if (!isImagePath(cleanedTarget, this.settings.imageExtensions)) return { ok: false, reason: '非图片链接' };

    const basename = filenameCandidate;
    if (!basename) return { ok: false, reason: '无法提取文件名' };

    const originalTarget = resolveLinkToFile(this.app, cleanedTarget, sourceFile.path);
    if (!(originalTarget instanceof TFile)) return { ok: false, reason: '原链接无法解析' };

    const nameHits = imageIndex.get(basename.toLowerCase()) || [];
    if (this.settings.requireUniqueFilename && nameHits.length !== 1) {
      return { ok: false, reason: nameHits.length === 0 ? '仓库中未找到同名图片' : '同名图片不唯一' };
    }

    const shortenedTarget = this.app.metadataCache.getFirstLinkpathDest(basename, sourceFile.path);
    if (!(shortenedTarget instanceof TFile)) return { ok: false, reason: '短链接无法解析' };
    if (shortenedTarget.path !== originalTarget.path) {
      return { ok: false, reason: '短链接会指向其他文件' };
    }

    if (type === 'wiki') {
      const parsed = parseWikiEmbed(fullMatch.slice(3, -2));
      if (parsed.target === basename) return { ok: false, reason: '已是文件名形式' };
    }

    return { ok: true, reason: '安全收缩', basename };
  }

  async openResultView(preview = this.lastPreview) {
    const leaf = await this.activateResultView();
    const view = leaf.view;
    if (view instanceof CleanerResultView) {
      view.setPreview(preview);
    }
  }

  async activateResultView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const leaf = existing[0] || this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async applyLastPreview() {
    if (!this.lastPreview || this.lastPreview.items.length === 0) {
      new Notice('当前没有可应用的清洗预览，请先执行预览。');
      return;
    }

    if (this.settings.requireFinalConfirmation) {
      const confirmed = await new Promise((resolve) => {
        new FinalConfirmModal(this.app, this.lastPreview, resolve).open();
      });
      if (!confirmed) return;
    }

    let successNotes = 0;
    let skippedChanged = 0;
    let successReplacements = 0;
    const changedNotes = [];

    for (const item of this.lastPreview.items) {
      const current = await this.app.vault.cachedRead(item.file);
      if (current !== item.originalContent) {
        skippedChanged++;
        continue;
      }
      await this.app.vault.modify(item.file, item.updatedContent);
      changedNotes.push({ path: item.file.path, beforeContent: item.originalContent, afterContent: item.updatedContent });
      successNotes++;
      successReplacements += item.replacements.length;
    }

    if (changedNotes.length > 0) {
      await this.writeOperationLog({
        type: 'clean-links',
        createdAt: new Date().toISOString(),
        renames: [],
        notes: changedNotes,
        replacements: successReplacements,
      });
    }

    new Notice(`应用完成：已更新 ${successNotes} 篇笔记，写入 ${successReplacements} 处清洗；因文件已变化而跳过 ${skippedChanged} 篇。`);
    await this.previewCleaning();
  }


}

class ImageWorkflowSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = 'paste';
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('iwt-settings');

    const root = containerEl.createDiv({ cls: 'iwt-settings-shell' });
    const header = root.createDiv({ cls: 'iwt-settings-header' });
    header.createEl('h2', { text: '🖼️ Image Workflow' });
    header.createDiv({
      cls: 'iwt-settings-header-note',
      text: '图片命名、展示、整理与维护。',
    });

    const defs = [
      ['paste', '📝 粘贴与命名'],
      ['display', '🖼️ 尺寸与展示'],
      ['organize', '🔢 重排与归档'],
      ['clean', '🧹 链接清洗'],
      ['unused', '🗑️ 未引用图片'],
    ];

    const tabs = root.createDiv({ cls: 'iwt-tabs' });
    for (const [key, label] of defs) {
      const btn = tabs.createEl('button', {
        text: label,
        cls: `iwt-tab ${key === this.activeTab ? 'is-active' : ''}`,
      });
      btn.onclick = () => {
        this.activeTab = key;
        this.display();
      };
    }

    const panel = root.createDiv({ cls: 'iwt-settings-panel' });
    const makeSection = (title, note = '') => {
      const section = panel.createDiv({ cls: 'iwt-settings-section' });
      const head = section.createDiv({ cls: 'iwt-settings-section-head' });
      head.createEl('h3', { text: title });
      if (note) head.createDiv({ cls: 'iwt-settings-section-note', text: note });
      return section;
    };

    const addTemplateHelp = () => {};

    if (this.activeTab === 'paste') {
      const naming = makeSection('✏️ 命名');

      new Setting(naming)
        .setName('图片命名模板')
        .setDesc('决定新图片的文件名。')
        .addText((text) => text
          .setPlaceholder('{{fileName}}')
          .setValue(this.plugin.settings.imageNamePattern)
          .onChange(async (value) => {
            this.plugin.settings.imageNamePattern = value || '{{fileName}}';
            await this.plugin.saveSettings();
          }));

      addTemplateHelp(naming);

      new Setting(naming)
        .setName('自动重命名')
        .setDesc('开启后直接按模板命名；关闭后先弹出命名窗口。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.autoRename)
          .onChange(async (value) => {
            this.plugin.settings.autoRename = value;
            await this.plugin.saveSettings();
          }));

      new Setting(naming)
        .setName('写入链接形式')
        .setDesc('选择重命名后写回笔记的图片链接路径。')
        .addDropdown((dropdown) => dropdown
          .addOption('short', '短链接')
          .addOption('relative', '相对路径')
          .addOption('full', '完整路径')
          .setValue(this.plugin.settings.imageLinkMode || 'short')
          .onChange(async (value) => {
            this.plugin.settings.imageLinkMode = value;
            await this.plugin.saveSettings();
          }));

      const attachments = makeSection('📎 附件处理');

      new Setting(attachments)
        .setName('处理全部新附件')
        .setDesc('关闭时主要处理 Obsidian 生成的 Pasted image；开启后其他新附件也参与。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.handleAllAttachments)
          .onChange(async (value) => {
            this.plugin.settings.handleAllAttachments = value;
            await this.plugin.saveSettings();
          }));

      new Setting(attachments)
        .setName('排除扩展名')
        .setDesc('正则表达式，例如 pdf|mp4。命中的附件不处理。')
        .addText((text) => text
          .setPlaceholder('pdf|mp4')
          .setValue(this.plugin.settings.excludeExtensionPattern || '')
          .onChange(async (value) => {
            this.plugin.settings.excludeExtensionPattern = value.trim();
            await this.plugin.saveSettings();
          }));

      const duplicates = makeSection('🔢 重名编号');

      new Setting(duplicates)
        .setName('编号位置')
        .setDesc('开启：1-图片.png；关闭：图片-1.png。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.dupNumberAtStart)
          .onChange(async (value) => {
            this.plugin.settings.dupNumberAtStart = value;
            await this.plugin.saveSettings();
          }));

      new Setting(duplicates)
        .setName('编号分隔符')
        .setDesc('默认使用 -。')
        .addText((text) => text
          .setValue(this.plugin.settings.dupNumberDelimiter)
          .onChange(async (value) => {
            this.plugin.settings.dupNumberDelimiter = sanitizeDelimiter(value);
            await this.plugin.saveSettings();
          }));

      new Setting(duplicates)
        .setName('始终追加编号')
        .setDesc('即使没有重名，也按编号格式命名。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.dupNumberAlways)
          .onChange(async (value) => {
            this.plugin.settings.dupNumberAlways = value;
            await this.plugin.saveSettings();
          }));

      new Setting(duplicates)
        .setName('隐藏重命名通知')
        .setDesc('关闭重命名完成后的提示。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.disableRenameNotice)
          .onChange(async (value) => {
            this.plugin.settings.disableRenameNotice = value;
            await this.plugin.saveSettings();
          }));
    }

    if (this.activeTab === 'display') {
      const size = makeSection('📐 图片宽度');

      new Setting(size)
        .setName('宽度快捷预设')
        .setDesc('用于粘贴窗口、尺寸窗口和 Live Preview 悬停菜单。逗号分隔。')
        .addText((text) => text
          .setPlaceholder('300,400,500,600,800')
          .setValue(this.plugin.settings.quickSizePresets || '')
          .onChange(async (value) => {
            this.plugin.settings.quickSizePresets = value;
            await this.plugin.saveSettings();
          }));

      const currentDefault = String(
        this.plugin.settings.uniformSizeDefault
        || this.plugin.settings.pastedImageSize
        || '500'
      );

      new Setting(size)
        .setName('默认图片宽度')
        .setDesc('同时用于粘贴图片和统一尺寸操作；留空表示粘贴时不自动写宽度。')
        .addText((text) => text
          .setPlaceholder('500')
          .setValue(currentDefault)
          .onChange(async (value) => {
            const normalized = normalizeImageSize(value);
            this.plugin.settings.pastedImageSize = normalized;
            this.plugin.settings.uniformSizeDefault = normalized || '500';
            await this.plugin.saveSettings();
          }));

      new Setting(size)
        .setName('粘贴时询问宽度')
        .setDesc('开启后，每次粘贴图片时可确认或修改宽度。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.promptForPasteSize)
          .onChange(async (value) => {
            this.plugin.settings.promptForPasteSize = value;
            await this.plugin.saveSettings();
          }));

      const live = makeSection('🖱️ 图片交互');

      const readingViewer = makeSection('🔍 阅读模式图片查看器');

      new Setting(readingViewer)
        .setName('启用阅读模式图片查看器')
        .setDesc('关闭阅读模式图片查看器。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.readingViewer?.enabled !== false)
          .onChange(async (value) => {
            this.plugin.settings.readingViewer.enabled = value;
            await this.plugin.saveSettings();
          }));

      new Setting(readingViewer)
        .setName('双击打开')
        .setDesc('双击图片打开查看器。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.readingViewer?.openOnDoubleClick !== false)
          .onChange(async (value) => {
            this.plugin.settings.readingViewer.openOnDoubleClick = value;
            await this.plugin.saveSettings();
          }));

      new Setting(readingViewer)
        .setName('快捷键点击打开')
        .setDesc('Ctrl / Cmd + 点击打开查看器。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.readingViewer?.openOnModifierClick !== false)
          .onChange(async (value) => {
            this.plugin.settings.readingViewer.openOnModifierClick = value;
            await this.plugin.saveSettings();
          }));

      new Setting(readingViewer)
        .setName('快捷修饰键')
        .setDesc('选择快捷修饰键。')
        .addDropdown((dropdown) => dropdown
          .addOption('mod', 'Mod（Ctrl / Cmd）')
          .addOption('ctrl', '仅 Ctrl')
          .addOption('meta', '仅 Cmd / Meta')
          .setValue(this.plugin.settings.readingViewer?.modifierKey || 'mod')
          .onChange(async (value) => {
            this.plugin.settings.readingViewer.modifierKey = value;
            await this.plugin.saveSettings();
          }));

      const viewerTools = makeSection('🧰 查看器功能');

      const toolDefs = [
        ['allowZoom', '预览缩放', '查看器内缩放，不写回正文。'],
        ['allowWidth', '正文宽度', '修改并写回图片宽度。'],
        ['allowRotate', '旋转', '旋转并写回 {rotate=...}。'],
        ['allowTitle', '图片标题', '修改标题、颜色、字号和局部格式。'],
        ['allowSourceLocate', '定位 Markdown 源码', '跳到对应图片源码行。'],
        ['allowFileLocate', '定位图片文件', '在 Obsidian 文件列表中定位图片文件。'],
        ['allowCopyPath', '复制图片路径', '提供复制 Vault 路径和 Wiki 链接按钮。'],
        ['allowNavigation', '上一张 / 下一张', '在当前笔记图片之间切换。'],
      ];

      for (const [key, name, desc] of toolDefs) {
        new Setting(viewerTools)
          .setName(name)
          .setDesc(desc)
          .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.readingViewer?.[key] !== false)
            .onChange(async (value) => {
              this.plugin.settings.readingViewer[key] = value;
              await this.plugin.saveSettings();
            }));
      }

      const syntax = makeSection('🖼️ 图片说明与网格');
      const examples = syntax.createEl('pre', { cls: 'iwt-display-code' });
      examples.setText([
        '![[图片.png]]',
        '![[图片.png|500]]',
        '![[图片.png|这是**说明**|500]]',
      ].join('\n'));

      syntax.createDiv({
        cls: 'iwt-help',
        text: '使用 cssclasses: image-grid 时，连续图片按空行分组并自动排列；Live Preview 会显示图片编号。img-grid / img-grid-3 / img-grid-4 继续兼容，并允许网格整体横向超出正文。',
      });

      const batchSize = makeSection('批量尺寸', '统一当前笔记图片的 Wiki 宽度；可选择只处理无尺寸图片或其他范围。');

      new Setting(batchSize)
        .setName('统一当前笔记图片宽度')
        .setDesc('打开批量尺寸窗口，执行前由你选择宽度和处理范围。')
        .addButton((btn) => btn
          .setButtonText('统一尺寸')
          .onClick(() => {
            new UniformSizeModal(
              this.plugin.app,
              this.plugin.settings.uniformSizeDefault || '500',
              async ({ sizeValue, scope }) => {
                await this.plugin.uniformCurrentNoteImageSize(sizeValue, scope);
              },
              this.plugin.getSizePresets()
            ).open();
          }));

      const actions = makeSection('当前图片', '无需进入命令面板即可修改光标所在行的第一张图片。');

      new Setting(actions)
        .setName('修改宽度')
        .setDesc('只改 Wiki 宽度，不重命名图片。')
        .addButton((btn) => btn
          .setButtonText('设置宽度')
          .setCta()
          .onClick(() => {
            const file = this.plugin.getActiveFile();
            const embed = file ? this.plugin.findCurrentLineFirstEmbed(file) : null;
            if (!embed) {
              new Notice('当前行未检测到图片');
              return;
            }
            new SizeModal(
              this.plugin.app,
              this.plugin.settings.uniformSizeDefault || '500',
              async (sizeValue) => {
                await this.plugin.setCurrentLineImageSize(sizeValue, embed);
              },
              this.plugin.getSizePresets()
            ).open();
          }));

      new Setting(actions)
        .setName('修改说明')
        .setDesc('修改 ![[图片.png|说明|500]] 中的说明，不改变图片文件名。')
        .addButton((btn) => btn
          .setButtonText('修改说明')
          .onClick(() => {
            const file = this.plugin.getActiveFile();
            const embed = file ? this.plugin.findCurrentLineFirstEmbed(file) : null;
            if (!embed) {
              new Notice('当前行未检测到图片');
              return;
            }
            this.plugin.openImageDescriptionModal(embed);
          }));
    }

    if (this.activeTab === 'organize') {
      const sequence = makeSection('🔢 当前笔记重排');

      new Setting(sequence)
        .setName('起始编号')
        .setDesc('决定当前笔记第一张图片从几开始编号，例如 1、10、100。')
        .addText((text) => text
          .setValue(String(this.plugin.settings.resequenceStartNumber))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.resequenceStartNumber = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
            await this.plugin.saveSettings();
          }));

      new Setting(sequence)
        .setName('命名方式')
        .setDesc('保留语义：在新名称中尽量保留原图片名信息；纯编号：只按顺序编号。两种模式都会真正重命名图片文件。')
        .addDropdown((dropdown) => dropdown
          .addOption('semantic', '保留语义')
          .addOption('number', '纯编号')
          .setValue(this.plugin.settings.resequenceNameMode || 'semantic')
          .onChange(async (value) => {
            this.plugin.settings.resequenceNameMode = value;
            await this.plugin.saveSettings();
          }));

      new Setting(sequence)
        .setName('编号位数')
        .setDesc('控制补零格式。1 表示 1、2；2 表示 01、02；3 表示 001、002。')
        .addText((text) => text
          .setValue(String(this.plugin.settings.resequenceNumberPadding || 1))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.resequenceNumberPadding = Number.isFinite(n) && n > 0 ? n : 1;
            await this.plugin.saveSettings();
          }));

      new Setting(sequence)
        .setName('跳过重复嵌入')
        .setDesc('同一图片在当前笔记中重复引用时，只重命名文件一次，避免重复处理。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.resequenceSkipDuplicateEmbeds)
          .onChange(async (value) => {
            this.plugin.settings.resequenceSkipDuplicateEmbeds = value;
            await this.plugin.saveSettings();
          }));

      new Setting(sequence)
        .setName('执行前显示摘要')
        .setDesc('执行重排前显示处理数量与范围，便于确认是否符合预期。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.resequenceShowPreviewNotice)
          .onChange(async (value) => {
            this.plugin.settings.resequenceShowPreviewNotice = value;
            await this.plugin.saveSettings();
          }));

      const archive = makeSection('📦 归档');

      new Setting(archive)
        .setName('归档文件夹模板')
        .setDesc('定义当前笔记图片的目标附件目录，例如 {{fileName}}.assets。归档会移动真实图片文件。')
        .addText((text) => text
          .setValue(this.plugin.settings.archiveFolderPattern || '{{fileName}}.assets')
          .onChange(async (value) => {
            this.plugin.settings.archiveFolderPattern = value || '{{fileName}}.assets';
            await this.plugin.saveSettings();
          }));


      const previewActions = makeSection('👀 预览与执行');

      new Setting(previewActions)
        .setName('预览图片重排')
        .setDesc('显示旧文件名 → 新文件名 → 预计链接；存在路径冲突时禁止执行。')
        .addButton((btn) => btn
          .setButtonText('重排预览')
          .setCta()
          .onClick(async () => {
            const file = this.plugin.getActiveFile();
            if (!file) {
              new Notice('未找到当前笔记');
              return;
            }
            const plan = await this.plugin.buildResequencePlan(file);
            if (!plan.tasks.length) {
              new Notice('当前笔记没有可重排图片');
              return;
            }
            this.plugin.openResequencePreview(
              plan,
              async () => await this.plugin.executeResequencePlan(plan, file)
            );
          }));

      new Setting(previewActions)
        .setName('预览图片归档')
        .setDesc('显示图片将移动到的目标路径；确认后才会真正移动文件并更新链接。')
        .addButton((btn) => btn
          .setButtonText('归档预览')
          .onClick(async () => {
            const file = this.plugin.getActiveFile();
            if (!file) {
              new Notice('未找到当前笔记');
              return;
            }
            const plan = await this.plugin.buildArchivePlan(file);
            if (!plan.tasks.length) {
              new Notice('当前笔记没有可归档图片');
              return;
            }
            this.plugin.openResequencePreview(
              plan,
              async () => await this.plugin.executeArchivePlan(plan, file)
            );
          }));

      const health = makeSection('图片体检与恢复', '集中检查当前笔记的缺失图片、尺寸状态、重复引用和可清洗项；修改操作可通过插件日志撤销。');

      new Setting(health)
        .setName('检查当前笔记图片')
        .setDesc('生成图片健康报告，不会自动修改文件。可在报告中查看问题并执行对应修复。')
        .addButton((btn) => btn
          .setButtonText('打开图片体检')
          .setCta()
          .onClick(async () => {
            const file = this.plugin.getActiveFile();
            if (!file) {
              new Notice('未找到当前笔记');
              return;
            }
            const report = await this.plugin.buildCurrentNoteImageHealthReport(file);
            new NoteHealthModal(this.plugin.app, report, this.plugin).open();
          }));

      new Setting(health)
        .setName('撤销上一次工作流操作')
        .setDesc('根据插件日志恢复最近一次命名、尺寸、重排、归档或清洗操作。')
        .addButton((btn) => btn
          .setButtonText('撤销上一次')
          .onClick(async () => {
            await this.plugin.rollbackLastOperation();
          }));
    }

    if (this.activeTab === 'clean') {
      const rules = makeSection('🧹 链接清洗');

      new Setting(rules)
        .setName('清洗 Wiki 图片')
        .setDesc('把带路径的 Wiki 图片链接缩短为文件名链接，例如 ![[folder/a.png|500]] → ![[a.png|500]]。图片文件本身不移动。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.cleanWikiEmbeds)
          .onChange(async (value) => {
            this.plugin.settings.cleanWikiEmbeds = value;
            await this.plugin.saveSettings();
          }));

      new Setting(rules)
        .setName('清洗 Markdown 图片')
        .setDesc('把 Markdown 图片路径缩短为文件名，例如 ![](folder/a.png) → ![](a.png)。只改正文链接。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.cleanMarkdownImages)
          .onChange(async (value) => {
            this.plugin.settings.cleanMarkdownImages = value;
            await this.plugin.saveSettings();
          }));

      const safety = makeSection('🛡️ 安全条件');

      new Setting(safety)
        .setName('要求文件名唯一')
        .setDesc('只有仓库中该图片文件名没有歧义，且缩短后仍指向同一文件时才允许写回。关闭会提高误链接风险。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.requireUniqueFilename)
          .onChange(async (value) => {
            this.plugin.settings.requireUniqueFilename = value;
            await this.plugin.saveSettings();
          }));

      new Setting(safety)
        .setName('应用前确认')
        .setDesc('开启后，正式修改笔记前需要再次输入 CLEAN，防止误操作。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.requireFinalConfirmation)
          .onChange(async (value) => {
            this.plugin.settings.requireFinalConfirmation = value;
            await this.plugin.saveSettings();
          }));

      const scope = makeSection('📂 扫描范围');

      new Setting(scope)
        .setName('扫描目录')
        .setDesc('每行一个笔记目录。留空表示扫描整个仓库中的 Markdown 笔记。')
        .addTextArea((text) => {
          text.setPlaceholder('notes\nprojects')
            .setValue((this.plugin.settings.targetFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.targetFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      new Setting(scope)
        .setName('排除目录')
        .setDesc('这些目录中的 Markdown 笔记不会参与清洗，可用于排除模板、归档等区域。')
        .addTextArea((text) => {
          text.setPlaceholder('templates\narchive')
            .setValue((this.plugin.settings.excludeFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.excludeFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      new Setting(scope)
        .setName('图片扩展名')
        .setDesc('只有这些扩展名会被识别为图片链接。英文逗号分隔，例如 png,jpg,webp。')
        .addText((text) => text
          .setPlaceholder('png,jpg,jpeg,gif,webp,svg,bmp,avif')
          .setValue((this.plugin.settings.imageExtensions || []).join(','))
          .onChange(async (value) => {
            this.plugin.settings.imageExtensions = value
              .split(',')
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }));

      const actions = makeSection('▶️ 执行')

      new Setting(actions)
        .setName('预览清洗')
        .setDesc('只生成修改计划，不写回笔记。侧栏会列出准备缩短的图片链接。')
        .addButton((btn) => btn
          .setButtonText('开始预览')
          .setCta()
          .onClick(async () => {
            await this.plugin.previewCleaning();
          }));

      new Setting(actions)
        .setName('应用预览结果')
        .setDesc('将上一次预览中通过安全检查的修改正式写回笔记。')
        .addButton((btn) => btn
          .setButtonText('应用清洗')
          .onClick(async () => {
            await this.plugin.applyLastPreview();
          }));

      new Setting(actions)
        .setName('显示侧边栏入口')
        .setDesc('在左侧 Ribbon 显示清洗入口，便于快速打开预览和执行流程。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIcon = value;
            await this.plugin.saveSettings();
          }));
    }

    if (this.activeTab === 'unused') {
      const folders = makeSection('📂 扫描范围');

      new Setting(folders)
        .setName('候选图片目录')
        .setDesc('只有这些目录中的图片会被检查是否未引用。留空表示全库图片都作为候选。')
        .addTextArea((text) => {
          text.setPlaceholder('900 - Attachments\nassets')
            .setValue((this.plugin.settings.unusedAttachmentFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedAttachmentFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      new Setting(folders)
        .setName('候选白名单')
        .setDesc('进一步限制候选图片必须位于这些目录内。留空表示不额外限制。')
        .addTextArea((text) => {
          text.setPlaceholder('900 - Attachments')
            .setValue((this.plugin.settings.unusedWhitelistFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedWhitelistFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 3;
        });

      new Setting(folders)
        .setName('忽略目录')
        .setDesc('这些目录中的图片永远不会出现在未引用结果中，适合模板、资源库等需要长期保留的目录。')
        .addTextArea((text) => {
          text.setPlaceholder('templates\narchive')
            .setValue((this.plugin.settings.unusedIgnoreFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedIgnoreFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 3;
        });

      new Setting(folders)
        .setName('引用扫描目录')
        .setDesc('插件会到这些目录中查找图片引用。留空表示在全库 Markdown / Canvas 中查找。')
        .addTextArea((text) => {
          text.setPlaceholder('notes\nprojects')
            .setValue((this.plugin.settings.unusedReferenceFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedReferenceFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      const behavior = makeSection('⚙️ 扫描行为');

      new Setting(behavior)
        .setName('保护最近创建的图片')
        .setDesc('最近 N 天创建的图片不会进入“未引用”结果。设为 0 可关闭保护；建议保留 3–7 天缓冲。')
        .addText((text) => text
          .setPlaceholder('3')
          .setValue(String(this.plugin.settings.unusedProtectRecentDays ?? 3))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.unusedProtectRecentDays = Number.isFinite(n)
              ? Math.max(0, Math.min(3650, Math.floor(n)))
              : 3;
            await this.plugin.saveSettings();
          }));

      new Setting(behavior)
        .setName('保护当前笔记引用')
        .setDesc('即使“引用扫描目录”没有包含当前笔记，当前正在编辑的笔记所引用图片仍强制保护。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.unusedProtectActiveNote !== false)
          .onChange(async (value) => {
            this.plugin.settings.unusedProtectActiveNote = value;
            await this.plugin.saveSettings();
          }));

      new Setting(behavior)
        .setName('保护文件名关键词')
        .setDesc('文件名或路径包含这些关键词的图片不会进入未引用结果。逗号或换行分隔；留空关闭。')
        .addTextArea((text) => {
          text.setPlaceholder('cover\nlogo\nicon')
            .setValue(String(this.plugin.settings.unusedProtectNameKeywords || ''))
            .onChange(async (value) => {
              this.plugin.settings.unusedProtectNameKeywords = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 3;
        });

      new Setting(behavior)
        .setName('扫描 Canvas')
        .setDesc('开启后，Canvas 节点中的 file 与 text 引用也会被视为“正在使用”。')
        .addToggle((toggle) => toggle
          .setValue(Boolean(this.plugin.settings.unusedIncludeCanvas))
          .onChange(async (value) => {
            this.plugin.settings.unusedIncludeCanvas = value;
            await this.plugin.saveSettings();
          }));

      new Setting(behavior)
        .setName('结果默认全选')
        .setDesc('开启后结果页会默认勾选全部未引用图片。若习惯逐张确认，建议关闭。')
        .addToggle((toggle) => toggle
          .setValue(Boolean(this.plugin.settings.unusedAutoSelectAll))
          .onChange(async (value) => {
            this.plugin.settings.unusedAutoSelectAll = value;
            await this.plugin.saveSettings();
          }));

      const actions = makeSection('📊 扫描与结果');

      new Setting(actions)
        .setName('扫描未引用图片')
        .setDesc('检查候选图片是否在指定范围内被引用。完成后自动打开结果页，不会直接删除文件。')
        .addButton((btn) => btn
          .setButtonText('开始扫描')
          .setCta()
          .onClick(async () => {
            await this.plugin.scanUnusedImagesAndShowResults();
          }));

      new Setting(actions)
        .setName('打开结果页')
        .setDesc('重新打开上一次扫描结果，继续预览、筛选或处理候选图片。')
        .addButton((btn) => btn
          .setButtonText('打开结果页')
          .onClick(async () => {
            await this.plugin.openUnusedImageView(this.plugin.lastUnusedImageScan || null);
          }));
    }
  }
}

class UnusedImageResultView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scanResult = null;
    this.selectedPaths = new Set();
    this.currentPage = 1;
    this.pageSize = 12;
    this.searchQuery = '';
    this.sortBy = 'path';
    this.sortOrder = 'asc';
    this.previewOverlayEl = null;
    this.previewKeyHandler = null;
  }

  getViewType() { return UNUSED_VIEW_TYPE; }
  getDisplayText() { return '未引用图片'; }
  getIcon() { return 'image-off'; }

  async onOpen() {
    this.containerEl.addClass('iwt-unused-view');
    this.render();
  }

  async onClose() {
    this.closePreview();
    this.contentEl.empty();
  }

  setScanResult(scanResult) {
    this.scanResult = scanResult || null;
    this.currentPage = 1;
    this.searchQuery = '';
    const files = this.scanResult?.unusedFiles || [];
    this.selectedPaths = this.plugin.settings.unusedAutoSelectAll ? new Set(files.map((file) => file.path)) : new Set();
    this.render();
  }

  getProcessedFiles() {
    if (!this.scanResult) return [];
    const query = this.searchQuery.trim().toLowerCase();
    let files = [...this.scanResult.unusedFiles];
    if (query) files = files.filter((file) => file.path.toLowerCase().includes(query) || file.name.toLowerCase().includes(query));
    files.sort((a, b) => {
      let result = 0;
      if (this.sortBy === 'size') result = a.stat.size - b.stat.size;
      else result = a.path.localeCompare(b.path, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      return this.sortOrder === 'desc' ? -result : result;
    });
    return files;
  }

  openImagePreview(file) {
    this.closePreview();
    const overlay = document.body.createDiv({ cls: 'iwt-unused-image-modal' });
    const dialog = overlay.createDiv({ cls: 'iwt-unused-image-modal__dialog' });
    const image = dialog.createEl('img', { cls: 'iwt-unused-image-modal__img' });
    image.src = this.app.vault.getResourcePath(file);
    image.alt = file.name;
    dialog.createDiv({ cls: 'iwt-unused-image-modal__meta', text: `${file.name} · ${formatBytes(file.stat.size)}` });
    overlay.addEventListener('click', (evt) => { if (evt.target === overlay) this.closePreview(); });
    this.previewKeyHandler = (evt) => { if (evt.key === 'Escape') this.closePreview(); };
    document.addEventListener('keydown', this.previewKeyHandler);
    this.previewOverlayEl = overlay;
  }

  closePreview() {
    if (this.previewKeyHandler) {
      document.removeEventListener('keydown', this.previewKeyHandler);
      this.previewKeyHandler = null;
    }
    if (this.previewOverlayEl) {
      this.previewOverlayEl.remove();
      this.previewOverlayEl = null;
    }
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    const root = contentEl.createDiv({ cls: 'iwt-unused-page' });
    const header = root.createDiv({ cls: 'iwt-unused-header' });
    const titleWrap = header.createDiv({ cls: 'iwt-unused-titlewrap' });
    titleWrap.createEl('h2', { text: '🗑️ 未引用图片' });
    const processedFiles = this.getProcessedFiles();
    titleWrap.createDiv({ cls: 'iwt-unused-subtitle', text: this.scanResult
      ? `扫描于 ${formatDate(this.scanResult.scannedAt)} · 候选 ${this.scanResult.candidateImageFiles.length} 张 · 近期保护 ${(this.scanResult.protectedRecentFiles || []).length} 张 · 关键词保护 ${(this.scanResult.protectedKeywordFiles || []).length} 张 · 当前笔记保护 ${(this.scanResult.protectedActiveNoteFiles || []).length} 张 · 引用扫描 ${this.scanResult.referenceFileCount || 0} 个文档 · 未引用 ${this.scanResult.unusedFiles.length} 张 · 已选 ${this.selectedPaths.size} 张`
      : '扫描附件目录，找出在指定 Markdown / Canvas 范围内未发现引用的图片。' });

    const toolbar = header.createDiv({ cls: 'iwt-unused-toolbar' });
    const scanBtn = toolbar.createEl('button', { text: '🔄 重新扫描', cls: 'mod-cta' });
    const selectBtn = toolbar.createEl('button', { text: '☑️ 全选' });
    const clearBtn = toolbar.createEl('button', { text: '🧽 清空' });
    const deleteBtn = toolbar.createEl('button', { text: '🗑️ 删除选中', cls: 'mod-warning' });
    scanBtn.onclick = async () => { await this.plugin.scanUnusedImagesAndShowResults(); };
    selectBtn.onclick = () => { if (this.scanResult) this.selectedPaths = new Set(this.scanResult.unusedFiles.map((file) => file.path)); this.render(); };
    clearBtn.onclick = () => { this.selectedPaths.clear(); this.render(); };
    deleteBtn.onclick = () => {
      const selected = (this.scanResult?.unusedFiles || []).filter((file) => this.selectedPaths.has(file.path));
      if (!selected.length) { new Notice('请先选择要删除的图片。'); return; }
      new IWTUnusedConfirmDeleteModal(this.app, selected, async () => {
        await this.plugin.trashUnusedImageFiles(selected);
      }).open();
    };

    if (!this.scanResult) {
      const empty = root.createDiv({ cls: 'iwt-unused-empty' });
      empty.createEl('div', { cls: 'iwt-unused-empty-title', text: '还没有扫描结果' });
      empty.createDiv({ text: '点击“重新扫描”开始检测。删除前建议先预览图片和路径。' });
      return;
    }

    if (!this.scanResult.unusedFiles.length) {
      const empty = root.createDiv({ cls: 'iwt-unused-empty' });
      empty.createEl('div', { cls: 'iwt-unused-empty-title', text: '没有检测到未引用图片' });
      empty.createDiv({ text: '当前候选范围内没有可清理图片；它们可能已被引用、受到近期保护，或候选范围设置较窄。' });
      return;
    }

    const controls = root.createDiv({ cls: 'iwt-unused-controls' });
    const searchInput = controls.createEl('input', { type: 'text', placeholder: '搜索文件名或路径', cls: 'iwt-unused-search' });
    searchInput.value = this.searchQuery;
    searchInput.oninput = () => {
      this.searchQuery = searchInput.value;
      this.currentPage = 1;
      this.render();
    };
    const sortSelect = controls.createEl('select', { cls: 'iwt-unused-sort' });
    [['path', '按路径排序'], ['size', '按大小排序']].forEach(([value, label]) => sortSelect.createEl('option', { value, text: label }));
    sortSelect.value = this.sortBy;
    sortSelect.onchange = () => { this.sortBy = sortSelect.value; this.currentPage = 1; this.render(); };
    const orderBtn = controls.createEl('button', { text: this.sortOrder === 'asc' ? '升序' : '降序' });
    orderBtn.onclick = () => { this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'; this.render(); };

    const totalPages = Math.max(1, Math.ceil(processedFiles.length / this.pageSize));
    this.currentPage = Math.min(Math.max(1, this.currentPage), totalPages);
    const pageFiles = processedFiles.slice((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize);

    const list = root.createDiv({ cls: 'iwt-unused-list' });
    for (const file of pageFiles) {
      const row = list.createDiv({ cls: 'iwt-unused-row' });
      const checkbox = row.createEl('input', { type: 'checkbox', cls: 'iwt-unused-check' });
      checkbox.checked = this.selectedPaths.has(file.path);
      checkbox.onchange = () => {
        if (checkbox.checked) this.selectedPaths.add(file.path);
        else this.selectedPaths.delete(file.path);
        this.render();
      };
      const thumb = row.createDiv({ cls: 'iwt-unused-thumb' });
      const img = thumb.createEl('img');
      img.src = this.app.vault.getResourcePath(file);
      img.alt = file.name;
      thumb.onclick = () => this.openImagePreview(file);
      const meta = row.createDiv({ cls: 'iwt-unused-meta' });
      meta.createDiv({ cls: 'iwt-unused-name', text: file.name });
      meta.createDiv({ cls: 'iwt-unused-path', text: file.path });
      meta.createDiv({ cls: 'iwt-unused-size', text: formatBytes(file.stat.size) });
      meta.createDiv({
        cls: 'iwt-unused-reason',
        text: `判定依据：在本次 ${this.scanResult.referenceFileCount || 0} 个引用扫描文档中未发现引用，且未命中近期/关键词/当前笔记保护。`
      });
      const actions = row.createDiv({ cls: 'iwt-unused-row-actions' });
      const previewBtn = actions.createEl('button', { text: '👁️ 预览' });
      previewBtn.onclick = () => this.openImagePreview(file);
      const deleteOneBtn = actions.createEl('button', { text: '🗑️ 删除', cls: 'mod-warning' });
      deleteOneBtn.onclick = () => new IWTUnusedConfirmDeleteModal(this.app, [file], async () => {
        await this.plugin.trashUnusedImageFiles([file]);
      }).open();
    }

    const pager = root.createDiv({ cls: 'iwt-unused-pager' });
    const prev = pager.createEl('button', { text: '上一页' });
    const info = pager.createSpan({ text: `第 ${this.currentPage} / ${totalPages} 页，共 ${processedFiles.length} 项` });
    const next = pager.createEl('button', { text: '下一页' });
    prev.disabled = this.currentPage <= 1;
    next.disabled = this.currentPage >= totalPages;
    prev.onclick = () => { this.currentPage--; this.render(); };
    next.onclick = () => { this.currentPage++; this.render(); };
  }
}

class IWTUnusedConfirmDeleteModal extends Modal {
  constructor(app, files, onConfirm) {
    super(app);
    this.files = files;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '🗑️ 确认删除未引用图片' });
    contentEl.createEl('p', { text: `即将把 ${this.files.length} 张图片移入系统回收站。该操作不会直接永久删除，但仍建议先确认路径。` });
    const box = contentEl.createDiv({ cls: 'iwt-unused-delete-list' });
    for (const file of this.files.slice(0, 12)) box.createDiv({ text: file.path });
    if (this.files.length > 12) box.createDiv({ text: `……另外 ${this.files.length - 12} 张` });
    const actions = contentEl.createDiv({ cls: 'iwt-unused-toolbar' });
    const cancel = actions.createEl('button', { text: '取消' });
    const confirm = actions.createEl('button', { text: '🗑️ 移入回收站', cls: 'mod-warning' });
    cancel.onclick = () => this.close();
    confirm.onclick = async () => {
      this.close();
      await this.onConfirm();
    };
  }

  onClose() { this.contentEl.empty(); }
}

class CleanerResultView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.preview = null;
    this.activeTab = 'overview';
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return '图片链接清洗';
  }

  getIcon() {
    return 'text-search';
  }

  async onOpen() {
    this.containerEl.addClass('ilfc-view');
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  setPreview(preview) {
    this.preview = preview || null;
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    const root = contentEl.createDiv({ cls: 'ilfc-page' });

    const header = root.createDiv({ cls: 'ilfc-header' });
    header.createEl('h2', { text: '图片链接清洗' });
    header.createDiv({ cls: 'ilfc-subtitle', text: this.preview
      ? `扫描于 ${formatDate(this.preview.scannedAt)} · 扫描 ${this.preview.filesScanned} 篇笔记`
      : '将路径型图片链接安全收缩为文件名链接。' });

    const toolbar = root.createDiv({ cls: 'ilfc-toolbar' });
    const previewBtn = toolbar.createEl('button', { text: '🔄 重新预览', cls: 'mod-cta' });
    const applyBtn = toolbar.createEl('button', { text: '✅ 应用清洗' });
    previewBtn.onclick = async () => { await this.plugin.previewCleaning(); };
    applyBtn.onclick = async () => { await this.plugin.applyLastPreview(); };

    if (!this.preview) {
      const empty = root.createDiv({ cls: 'ilfc-empty' });
      empty.createEl('div', { cls: 'ilfc-empty-title', text: '还没有预览结果' });
      empty.createEl('div', { text: '点击“重新预览”开始扫描当前范围内的 Markdown 笔记。' });
      return;
    }

    const stats = root.createDiv({ cls: 'ilfc-stats' });
    createStatCard(stats, '将修改笔记', String(this.preview.notesChanged));
    createStatCard(stats, '将清洗链接', String(this.preview.replacements));
    createStatCard(stats, '跳过记录', String(this.preview.skipped.length));

    const tabs = root.createDiv({ cls: 'ilfc-tabs' });
    const tabDefs = [
      ['overview', '概览'],
      ['diffs', '差异'],
      ['skipped', '跳过'],
    ];
    for (const [key, label] of tabDefs) {
      const btn = tabs.createEl('button', { text: label, cls: key === this.activeTab ? 'is-active' : '' });
      btn.onclick = () => {
        this.activeTab = key;
        this.render();
      };
    }

    const panel = root.createDiv({ cls: 'ilfc-panel' });
    if (this.activeTab === 'overview') {
      const scope = panel.createDiv({ cls: 'ilfc-section' });
      scope.createEl('h3', { text: '当前规则' });
      const ul = scope.createEl('ul');
      ul.createEl('li', { text: `范围：${this.plugin.settings.targetFolders.length ? this.plugin.settings.targetFolders.join('，') : '整个仓库'}` });
      ul.createEl('li', { text: `排除：${this.plugin.settings.excludeFolders && this.plugin.settings.excludeFolders.length ? this.plugin.settings.excludeFolders.join('，') : '无'}` });
      ul.createEl('li', { text: `清洗 Wiki 嵌入：${this.plugin.settings.cleanWikiEmbeds ? '开启' : '关闭'}` });
      ul.createEl('li', { text: `清洗 Markdown 图片：${this.plugin.settings.cleanMarkdownImages ? '开启' : '关闭'}` });
      ul.createEl('li', { text: `要求文件名唯一：${this.plugin.settings.requireUniqueFilename ? '开启' : '关闭'}` });

      const files = panel.createDiv({ cls: 'ilfc-section' });
      files.createEl('h3', { text: '涉及笔记' });
      if (this.preview.items.length === 0) {
        files.createDiv({ text: '本次预览没有发现可安全收缩的图片链接。' });
      } else {
        for (const item of this.preview.items.slice(0, 50)) {
          const row = files.createDiv({ cls: 'ilfc-file-row' });
          row.createDiv({ cls: 'ilfc-file-path', text: item.filePath });
          row.createDiv({ cls: 'ilfc-file-meta', text: `${item.replacements.length} 处` });
        }
        if (this.preview.items.length > 50) {
          files.createDiv({ cls: 'ilfc-more', text: `……另外 ${this.preview.items.length - 50} 篇` });
        }
      }
    }

    if (this.activeTab === 'diffs') {
      if (this.preview.items.length === 0) {
        panel.createDiv({ text: '没有可显示的差异。' });
      } else {
        for (const item of this.preview.items) {
          const section = panel.createDiv({ cls: 'ilfc-section' });
          section.createEl('h3', { text: item.filePath });
          for (const rep of item.replacements) {
            const diff = section.createDiv({ cls: 'ilfc-diff-card' });
            diff.createDiv({ cls: 'ilfc-diff-label', text: 'Before' });
            diff.createEl('pre', { text: rep.original });
            diff.createDiv({ cls: 'ilfc-diff-label', text: 'After' });
            diff.createEl('pre', { text: rep.updated });
          }
        }
      }
    }

    if (this.activeTab === 'skipped') {
      if (this.preview.skipped.length === 0) {
        panel.createDiv({ text: '没有跳过项。' });
      } else {
        for (const item of this.preview.skipped.slice(0, 300)) {
          const row = panel.createDiv({ cls: 'ilfc-skip-row' });
          row.createDiv({ cls: 'ilfc-skip-reason', text: item.reason });
          row.createDiv({ cls: 'ilfc-skip-file', text: item.filePath });
          row.createEl('pre', { text: item.original });
        }
        if (this.preview.skipped.length > 300) {
          panel.createDiv({ cls: 'ilfc-more', text: `……另外 ${this.preview.skipped.length - 300} 条` });
        }
      }
    }
  }
}

class FinalConfirmModal extends Modal {
  constructor(app, preview, onDone) {
    super(app);
    this.preview = preview;
    this.onDone = onDone;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '🧹 确认应用清洗' });
    contentEl.createEl('p', { text: `即将修改 ${this.preview.notesChanged} 篇笔记，写入 ${this.preview.replacements} 处图片链接清洗。` });
    contentEl.createEl('p', { text: '请输入 CLEAN 以确认执行。' });
    const input = contentEl.createEl('input', { type: 'text' });
    input.addClass('ilfc-confirm-input');

    const actions = contentEl.createDiv({ cls: 'ilfc-toolbar' });
    const cancelBtn = actions.createEl('button', { text: '取消' });
    const confirmBtn = actions.createEl('button', { text: '确认应用', cls: 'mod-warning' });
    confirmBtn.disabled = true;

    input.oninput = () => {
      confirmBtn.disabled = input.value.trim() !== 'CLEAN';
    };

    cancelBtn.onclick = () => {
      this.close();
      this.onDone(false);
    };
    confirmBtn.onclick = () => {
      this.close();
      this.onDone(true);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

function extractLinksFromText(content) {
  const links = [];
  const wikiRegex = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  const mdRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = wikiRegex.exec(String(content || ''))) !== null) {
    if (match[1]) links.push(match[1]);
  }
  while ((match = mdRegex.exec(String(content || ''))) !== null) {
    if (match[1]) links.push(match[1]);
  }
  return links;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function parseWikiEmbed(inner) {
  const pipeIndex = inner.indexOf('|');
  if (pipeIndex === -1) return { target: inner.trim(), suffix: '' };
  return {
    target: inner.slice(0, pipeIndex).trim(),
    suffix: inner.slice(pipeIndex),
  };
}

function parseMarkdownImageDestination(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let targetPart = trimmed;
  let title = '';
  const m = trimmed.match(/^(<[^>]+>|[^\s]+)(\s+"[^"]*")$/);
  if (m) {
    targetPart = m[1];
    title = m[2].trim();
  }

  const wrappedInAngles = targetPart.startsWith('<') && targetPart.endsWith('>');
  const target = wrappedInAngles ? targetPart.slice(1, -1).trim() : targetPart.trim();
  if (!target) return null;

  return { target, title, wrappedInAngles };
}

function resolveLinkToFile(app, link, sourcePath) {
  const direct = app.vault.getAbstractFileByPath(normalizePath(link));
  if (direct instanceof TFile) return direct;
  return app.metadataCache.getFirstLinkpathDest(link, sourcePath);
}

function cleanLinkPath(link) {
  let value = String(link || '').trim();
  if (!value) return '';
  value = value.replace(/^file:\/\//i, '');
  const hashIndex = value.indexOf('#');
  if (hashIndex !== -1) value = value.slice(0, hashIndex);
  const queryIndex = value.indexOf('?');
  if (queryIndex !== -1) value = value.slice(0, queryIndex);
  try {
    value = decodeURIComponent(value);
  } catch (e) {}
  return value.trim();
}

function isExternalLink(link) {
  return /^(https?:|mailto:|ftp:|data:)/i.test(link);
}

function getBasename(link) {
  const normalized = link.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

function hasAnyPathSegment(link) {
  return /[\\/]/.test(link);
}

function isImagePath(link, imageExtensions) {
  const ext = getBasename(link).split('.').pop();
  if (!ext) return false;
  return imageExtensions.map((e) => e.toLowerCase()).includes(ext.toLowerCase());
}

function normalizeFolder(folder) {
  const normalized = normalizePath(String(folder || '').trim());
  if (!normalized || normalized === '.') return '';
  return normalized.replace(/\/$/, '');
}

function parseMultilinePaths(value) {
  return String(value || '').split('\n').map((line) => normalizeFolder(line)).filter(Boolean);
}

function isPathInsideFolder(filePath, folder) {
  if (!folder) return true;
  return filePath === folder || filePath.startsWith(`${folder}/`);
}

function formatDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleString();
}

function createStatCard(container, label, value) {
  const card = container.createDiv({ cls: 'ilfc-stat-card' });
  card.createDiv({ cls: 'ilfc-stat-value', text: value });
  card.createDiv({ cls: 'ilfc-stat-label', text: label });
}

function parseImageLinkSize(fullMatch) {
  const raw = String(fullMatch || '').trim();
  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(raw);
  if (wiki) {
    const parts = wiki[1].split('|').map((p) => p.trim()).filter(Boolean);
    const size = parts.slice(1).find(isImageSizeSuffix) || '';
    return { hasSize: !!size, size };
  }
  const md = /^!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)$/.exec(raw);
  if (md) {
    const parts = String(md[1] || '').split('|').map((p) => p.trim()).filter(Boolean);
    const size = parts.find(isImageSizeSuffix) || '';
    return { hasSize: !!size, size };
  }
  return { hasSize: false, size: '' };
}

function removeImageSizeFromLink(fullMatch) {
  const raw = String(fullMatch || '').trim();
  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(raw);
  if (wiki) {
    const parts = wiki[1].split('|').map((p) => p.trim()).filter(Boolean);
    const target = parts.shift() || '';
    const suffix = parts.filter((p) => !isImageSizeSuffix(p));
    return `![[${[target, ...suffix].join('|')}]]`;
  }
  const md = /^!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)$/.exec(raw);
  if (md) {
    const altParts = String(md[1] || '').split('|').map((p) => p.trim()).filter(Boolean).filter((p) => !isImageSizeSuffix(p));
    return `![${altParts.join('|')}](${md[2]})`;
  }
  return fullMatch;
}

module.exports = ImageWorkflowPlugin;
module.exports.default = ImageWorkflowPlugin;
