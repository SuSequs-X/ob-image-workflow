
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
  workflowMode: 'normal',
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

class NoteHealthModal extends Modal {
  constructor(app, report, plugin) {
    super(app);
    this.report = report;
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('当前笔记图片体检');
    this.containerEl.addClass('pirr-modal');

    const stats = contentEl.createDiv({ cls: 'pirr-health-grid' });
    const pairs = [
      ['图片嵌入', this.report.total],
      ['正常链接', this.report.normal],
      ['缺失文件', this.report.missing],
      ['无尺寸图片', this.report.noSize],
      ['重复引用', this.report.duplicates],
      ['同名风险', this.report.sameNameRisk],
      ['外部链接', this.report.external],
      ['可安全清洗', this.report.cleanable],
    ];
    for (const [label, value] of pairs) createStatCard(stats, label, String(value));

    const summary = contentEl.createDiv({ cls: 'pirr-conflicts' });
    summary.createEl('h4', { text: '诊断结论' });
    summary.createDiv({ text: this.report.riskLevel, cls: this.report.hasHighRisk ? 'pirr-error-text' : 'pirr-subtle' });

    const actions = new Setting(contentEl);
    actions.addButton((btn) => btn.setButtonText('统一无尺寸图片').setCta().onClick(() => {
      this.close();
      new UniformSizeModal(this.app, this.plugin.settings.uniformSizeDefault || '500', async ({ sizeValue }) => {
        await this.plugin.uniformCurrentNoteImageSize(sizeValue, 'missing');
      }, this.plugin.getSizePresets()).open();
    }));
    actions.addButton((btn) => btn.setButtonText('预览安全清洗').onClick(async () => {
      this.close();
      await this.plugin.previewCleaning();
    }));
    actions.addButton((btn) => btn.setButtonText('重排图片编号').onClick(async () => {
      this.close();
      const file = this.plugin.getActiveFile();
      if (!file) return;
      const plan = await this.plugin.buildResequencePlan(file);
      this.plugin.openResequencePreview(plan, async () => await this.plugin.executeResequencePlan(plan, file));
    }));
    actions.addButton((btn) => btn.setButtonText('关闭').onClick(() => this.close()));

    if (this.report.items.length > 0) {
      const tableWrap = contentEl.createDiv({ cls: 'pirr-table-wrap' });
      const table = tableWrap.createEl('table', { cls: 'pirr-table' });
      const thead = table.createEl('thead');
      const tr = thead.createEl('tr');
      tr.createEl('th', { text: '行' });
      tr.createEl('th', { text: '链接' });
      tr.createEl('th', { text: '状态' });
      const tbody = table.createEl('tbody');
      for (const item of this.report.items.slice(0, 200)) {
        const row = tbody.createEl('tr');
        row.createEl('td', { text: String(item.line + 1) });
        row.createEl('td', { text: item.fullMatch, cls: 'pirr-subtle' });
        row.createEl('td', { text: item.status.join('；') || '正常', cls: item.status.length ? 'pirr-warning' : 'pirr-subtle' });
      }
    }
  }

  onClose() { this.contentEl.empty(); }
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
    titleEl.setText('粘贴图片设置');
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
    titleEl.setText('当前文章图片重排预览');
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
    name: '按当前文章顺序重排图片编号（立即执行）',
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
      await this.executeResequencePlan(plan, activeFile);
    },
  });

  this.addCommand({
    id: 'batch-rename-all-images',
    name: '按当前文章顺序重排图片编号（兼容入口）',
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
      await this.executeResequencePlan(plan, activeFile);
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
    name: '预览图片文件名清洗',
    callback: async () => {
      await this.previewCleaning();
    },
  });

  this.addCommand({
    id: 'apply-image-filename-cleaning',
    name: '应用上次图片文件名清洗结果',
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
    name: '删除上次扫描中的未引用图片',
    callback: async () => {
      const files = this.lastUnusedImageScan?.unusedFiles || [];
      if (!files.length) {
        new Notice('上次扫描没有可删除的未引用图片，请先执行扫描。');
        return;
      }
      new IWTUnusedConfirmDeleteModal(this.app, files, async () => {
        await this.trashUnusedImageFiles(files);
      }).open();
    },
  });

  this.addSettingTab(new ImageWorkflowSettingTab(this.app, this));
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
    const candidateImageFiles = this.getUnusedScanCandidateImageFiles();
    const referencedFiles = await this.getUnusedScanReferencedFiles();
    const unusedFiles = candidateImageFiles.filter((file) => !referencedFiles.has(file.path));
    unusedFiles.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
    return {
      candidateImageFiles,
      referencedFiles,
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

  async getUnusedScanReferencedFiles() {
    const referenced = new Set();
    const files = this.getUnusedScanReferenceFiles();
    for (const file of files) {
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
    let success = 0;
    let failed = 0;
    for (const file of files) {
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
    new Notice(`已移入回收站 ${success} 张图片${failed ? `，失败 ${failed} 张` : ''}。`);
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
        if (decision.ok) cleanable++;
      }
      if (item.status.length === 0) normal++;
    }
    const hasHighRisk = missing > 0 || sameNameRisk > 0;
    const riskLevel = hasHighRisk
      ? `存在高风险项：缺失文件 ${missing} 个，同名风险 ${sameNameRisk} 个。建议先体检修复，再执行清洗或归档。`
      : `未发现高风险项。可优先处理无尺寸图片 ${noSize} 个、可安全清洗链接 ${cleanable} 个。`;
    return { activeFile, total: items.length, normal, missing, noSize, duplicates, sameNameRisk, external, cleanable, items, hasHighRisk, riskLevel };
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

  async applyWorkflowMode(value) {
    const mode = ['conservative', 'normal', 'aggressive'].includes(value) ? value : 'normal';
    this.settings.workflowMode = mode;

    if (mode === 'conservative') {
      this.settings.autoRename = false;
      this.settings.promptForPasteSize = true;
      this.settings.requireUniqueFilename = true;
      this.settings.requireFinalConfirmation = true;
      this.settings.resequenceSkipDuplicateEmbeds = true;
      this.settings.showRibbonIcon = true;
    }

    if (mode === 'normal') {
      this.settings.autoRename = false;
      this.settings.promptForPasteSize = true;
      this.settings.requireUniqueFilename = true;
      this.settings.requireFinalConfirmation = true;
      this.settings.resequenceSkipDuplicateEmbeds = true;
      this.settings.showRibbonIcon = true;
    }

    if (mode === 'aggressive') {
      this.settings.autoRename = true;
      this.settings.promptForPasteSize = false;
      this.settings.requireUniqueFilename = false;
      this.settings.requireFinalConfirmation = false;
      this.settings.resequenceSkipDuplicateEmbeds = true;
      this.settings.showRibbonIcon = true;
    }

    await this.saveSettings();
    new Notice(`已切换为${mode === 'conservative' ? '保守模式' : mode === 'aggressive' ? '激进模式' : '常规模式'}`);
  }

}

class ImageWorkflowSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = 'rename';
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('iwt-settings');

    const root = containerEl.createDiv({ cls: 'iwt-settings-shell' });
    const header = root.createDiv({ cls: 'iwt-settings-header' });
    header.createEl('h2', { text: '🖼️ image-workflow' });
    header.createDiv({
      cls: 'iwt-settings-header-note',
      text: '图片命名、文章内重排与链接清洗的一体化工具。设置页采用分区面板 + 原生设置项结构，保留宽松间距与清晰入口。',
    });

    const defs = [
      ['rename', '📝 命名'],
      ['resequence', '🔢 重排'],
      ['clean', '🧹 清洗'],
      ['unused', '🗑️ 未引用'],
      ['scope', '📂 范围/入口'],
      ['actions', '⚙️ 操作'],
    ];

    const tabs = root.createDiv({ cls: 'iwt-tabs' });
    for (const [key, label] of defs) {
      const btn = tabs.createEl('button', { text: label, cls: `iwt-tab ${key === this.activeTab ? 'is-active' : ''}` });
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

    if (this.activeTab === 'rename') {
      const basic = makeSection('📝 基础命名', '基础命名规则。设置项采用原生列表结构，不使用设置项背景卡片。');

      new Setting(basic)
        .setName('🏷️ 图片命名模板')
        .setDesc('支持 {{fileName}}、{{dirName}}、{{imageNameKey}}、{{firstHeading}}、{{DATE:YYYYMMDD}}、{{frontmatter:key}}')
        .addText((text) => text
          .setPlaceholder('{{fileName}}')
          .setValue(this.plugin.settings.imageNamePattern)
          .onChange(async (value) => {
            this.plugin.settings.imageNamePattern = value || '{{fileName}}';
            await this.plugin.saveSettings();
          }));
      basic.createDiv({ cls: 'iwt-help', text: '模板变量：{{fileName}}/{{note}} 当前笔记名；{{heading}} 当前标题；{{firstHeading}} 首个一级标题；{{folder}} 当前文件夹；{{index}} 图片序号；{{DATE:YYYYMMDD}} 日期；{{frontmatter:key}} YAML 字段。' });

      new Setting(basic)
        .setName('📏 尺寸快捷预设')
        .setDesc('逗号分隔，会显示在粘贴图片面板和尺寸设置面板中。')
        .addText((text) => text
          .setPlaceholder('300,400,500,600,800')
          .setValue(this.plugin.settings.quickSizePresets || '')
          .onChange(async (value) => {
            this.plugin.settings.quickSizePresets = value;
            await this.plugin.saveSettings();
          }));

      new Setting(basic)
        .setName('⚡ 自动重命名新粘贴图片')
        .setDesc('关闭时，会弹出命名窗口。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.autoRename).onChange(async (value) => {
          this.plugin.settings.autoRename = value;
          await this.plugin.saveSettings();
        }));

      new Setting(basic)
        .setName('📐 粘贴时弹出尺寸输入框')
        .setDesc('开启后，每次粘贴图片都会出现尺寸输入框，可即时写入 ![[xxx.png|500]] 这类后缀。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.promptForPasteSize).onChange(async (value) => {
          this.plugin.settings.promptForPasteSize = value;
          await this.plugin.saveSettings();
        }));

      new Setting(basic)
        .setName('🔢 默认尺寸')
        .setDesc('作为尺寸输入框的默认值；关闭尺寸输入框时，也会直接作为插入后缀使用。')
        .addText((text) => text
          .setPlaceholder('例如 500')
          .setValue(String(this.plugin.settings.pastedImageSize || ''))
          .onChange(async (value) => {
            this.plugin.settings.pastedImageSize = normalizeImageSize(value);
            await this.plugin.saveSettings();
          }));

      new Setting(basic)
        .setName('🔗 粘贴重写链接模式')
        .setDesc('控制粘贴图片重命名后写入正文的链接形态。短链接最简洁；相对路径便于随笔记迁移；完整路径最稳定。')
        .addDropdown((dropdown) => dropdown
          .addOption('short', '短链接：![[图片.png|500]]')
          .addOption('relative', '相对路径：![[../assets/图片.png|500]]')
          .addOption('full', '完整路径：![[附件/assets/图片.png|500]]')
          .setValue(this.plugin.settings.imageLinkMode || 'short')
          .onChange(async (value) => {
            this.plugin.settings.imageLinkMode = value;
            await this.plugin.saveSettings();
          }));

      const attachment = makeSection('📎 附件处理', '限定是否仅处理系统生成的 Pasted image 文件。');

      new Setting(attachment)
        .setName('🗂️ 处理全部新附件')
        .setDesc('开启后，拖入或新增的非 Markdown 文件也会参与自动命名。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.handleAllAttachments).onChange(async (value) => {
          this.plugin.settings.handleAllAttachments = value;
          await this.plugin.saveSettings();
        }));

      new Setting(attachment)
        .setName('🚫 排除扩展名正则')
        .setDesc('例如 pdf|mp4；命中的扩展名不会被自动处理。')
        .addTextArea((text) => {
          text.setPlaceholder('pdf|mp4')
            .setValue(this.plugin.settings.excludeExtensionPattern)
            .onChange(async (value) => {
              this.plugin.settings.excludeExtensionPattern = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 3;
        });

      const duplicate = makeSection('🔁 重复编号', '当目标名称冲突时，控制编号位置与分隔符。');

      new Setting(duplicate)
        .setName('↔️ 编号放在开头')
        .setDesc('开启后形如 1-文件名.png；关闭后形如 文件名-1.png。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.dupNumberAtStart).onChange(async (value) => {
          this.plugin.settings.dupNumberAtStart = value;
          await this.plugin.saveSettings();
        }));

      new Setting(duplicate)
        .setName('➖ 编号分隔符')
        .setDesc('默认为 - 。')
        .addText((text) => text.setValue(this.plugin.settings.dupNumberDelimiter).onChange(async (value) => {
          this.plugin.settings.dupNumberDelimiter = sanitizeDelimiter(value);
          await this.plugin.saveSettings();
        }));

      new Setting(duplicate)
        .setName('➕ 始终追加编号')
        .setDesc('开启后，即使没有冲突，也会追加重复编号格式。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.dupNumberAlways).onChange(async (value) => {
          this.plugin.settings.dupNumberAlways = value;
          await this.plugin.saveSettings();
        }));

      const feedback = makeSection('🔔 反馈', '控制提示信息与界面打断程度。');

      new Setting(feedback)
        .setName('🔕 关闭重命名通知')
        .setDesc('开启后，不再弹出 Renamed 提示。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.disableRenameNotice).onChange(async (value) => {
          this.plugin.settings.disableRenameNotice = value;
          await this.plugin.saveSettings();
        }));
    }

    if (this.activeTab === 'resequence') {
      const section = makeSection('🔢 当前文章图片重排', '按正文中的出现顺序重新整理图片文件名。');

      new Setting(section)
        .setName('🏁 起始编号')
        .setDesc('第一张图片的编号。')
        .addText((text) => text.setValue(String(this.plugin.settings.resequenceStartNumber)).onChange(async (value) => {
          const num = Number(value);
          this.plugin.settings.resequenceStartNumber = Number.isFinite(num) && num > 0 ? Math.floor(num) : 1;
          await this.plugin.saveSettings();
        }));

      new Setting(section)
        .setName('🧭 重排命名模式')
        .setDesc('重排优先按当前命名模板生成；只有旧图名不是插件生成名时，保留语义模式才会追加旧短名。')
        .addDropdown((dropdown) => dropdown
          .addOption('semantic', '保留语义')
          .addOption('number', '纯编号')
          .setValue(this.plugin.settings.resequenceNameMode || 'semantic')
          .onChange(async (value) => {
            this.plugin.settings.resequenceNameMode = value;
            await this.plugin.saveSettings();
          }));

      new Setting(section)
        .setName('🔢 编号位数')
        .setDesc('默认 1 表示 1、2；如需 01、02 可手动设为 2。')
        .addText((text) => text
          .setValue(String(this.plugin.settings.resequenceNumberPadding || 1))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.resequenceNumberPadding = Number.isFinite(n) && n > 0 ? n : 1;
            await this.plugin.saveSettings();
          }));

      new Setting(section)
        .setName('📦 归档文件夹模板')
        .setDesc('当前笔记图片归档时使用，例如 {{fileName}}.assets。')
        .addText((text) => text
          .setValue(this.plugin.settings.archiveFolderPattern || '{{fileName}}.assets')
          .onChange(async (value) => {
            this.plugin.settings.archiveFolderPattern = value || '{{fileName}}.assets';
            await this.plugin.saveSettings();
          }));

      new Setting(section)
        .setName('⏭️ 跳过重复嵌入')
        .setDesc('同一张图片在正文中多次出现时，只重命名一次。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.resequenceSkipDuplicateEmbeds).onChange(async (value) => {
          this.plugin.settings.resequenceSkipDuplicateEmbeds = value;
          await this.plugin.saveSettings();
        }));

      new Setting(section)
        .setName('👁️ 显示预览通知')
        .setDesc('执行重排前显示摘要提示。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.resequenceShowPreviewNotice).onChange(async (value) => {
          this.plugin.settings.resequenceShowPreviewNotice = value;
          await this.plugin.saveSettings();
        }));
    }

    if (this.activeTab === 'clean') {
      const rules = makeSection('🧹 清洗规则', '把路径型图片嵌入安全收缩为文件名嵌入。范围与侧边栏图标在下一个“范围/入口”标签中设置。');

      new Setting(rules)
        .setName('🖼️ 清洗 Wiki 图片嵌入')
        .setDesc('例如 ![[folder/a.png|300]] → ![[a.png|300]]')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.cleanWikiEmbeds).onChange(async (value) => {
          this.plugin.settings.cleanWikiEmbeds = value;
          await this.plugin.saveSettings();
        }));

      new Setting(rules)
        .setName('🧾 清洗 Markdown 图片')
        .setDesc('例如 ![](folder/a.png) → ![](a.png)')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.cleanMarkdownImages).onChange(async (value) => {
          this.plugin.settings.cleanMarkdownImages = value;
          await this.plugin.saveSettings();
        }));

      const safety = makeSection('🛡️ 安全约束', '这些约束决定清洗是否允许真正写回。');

      new Setting(safety)
        .setName('🔐 要求文件名唯一')
        .setDesc('仅当仓库中该图片文件名唯一，且短链接仍解析到同一文件时才允许清洗。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.requireUniqueFilename).onChange(async (value) => {
          this.plugin.settings.requireUniqueFilename = value;
          await this.plugin.saveSettings();
        }));

      new Setting(safety)
        .setName('✅ 应用前最终确认')
        .setDesc('开启后，写回前需要输入 CLEAN。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.requireFinalConfirmation).onChange(async (value) => {
          this.plugin.settings.requireFinalConfirmation = value;
          await this.plugin.saveSettings();
        }));
    }

    if (this.activeTab === 'unused') {
      const scan = makeSection('🗑️ 未引用图片清理', '扫描附件目录中的图片，判断是否被 Markdown / Canvas 引用；删除操作默认移入系统回收站。');

      new Setting(scan)
        .setName('📎 候选附件目录')
        .setDesc('每行一个目录。留空表示全库图片都作为候选对象。')
        .addTextArea((text) => {
          text.setPlaceholder('900 - Attachments\nassets')
            .setValue((this.plugin.settings.unusedAttachmentFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedAttachmentFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 5;
        });

      new Setting(scan)
        .setName('✅ 白名单目录')
        .setDesc('填写后，只在这些目录内检测候选图片；留空表示不限制。')
        .addTextArea((text) => {
          text.setPlaceholder('900 - Attachments')
            .setValue((this.plugin.settings.unusedWhitelistFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedWhitelistFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      new Setting(scan)
        .setName('🚫 忽略目录')
        .setDesc('这些目录中的图片永远不会被列为未引用候选。')
        .addTextArea((text) => {
          text.setPlaceholder('templates\narchive')
            .setValue((this.plugin.settings.unusedIgnoreFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedIgnoreFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
        });

      new Setting(scan)
        .setName('📚 引用扫描目录')
        .setDesc('每行一个目录。留空表示扫描全库 Markdown / Canvas 引用。')
        .addTextArea((text) => {
          text.setPlaceholder('300 - Topic Notes\n100 - Literature')
            .setValue((this.plugin.settings.unusedReferenceFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.unusedReferenceFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 5;
        });

      new Setting(scan)
        .setName('🧩 同时扫描 Canvas')
        .setDesc('开启后，Canvas 节点中的 file 与 text 引用也会参与判断。')
        .addToggle((toggle) => toggle.setValue(Boolean(this.plugin.settings.unusedIncludeCanvas)).onChange(async (value) => {
          this.plugin.settings.unusedIncludeCanvas = value;
          await this.plugin.saveSettings();
        }));

      new Setting(scan)
        .setName('☑️ 打开结果时默认全选')
        .setDesc('关闭后，结果页不会默认勾选所有未引用图片。')
        .addToggle((toggle) => toggle.setValue(Boolean(this.plugin.settings.unusedAutoSelectAll)).onChange(async (value) => {
          this.plugin.settings.unusedAutoSelectAll = value;
          await this.plugin.saveSettings();
        }));

      const actions = makeSection('🚀 执行操作', '先扫描，再在结果页确认，最后删除选中图片。');
      new Setting(actions)
        .setName('🔍 扫描未引用图片')
        .setDesc('扫描完成后打开独立结果页，支持搜索、排序、预览与批量删除。')
        .addButton((btn) => btn.setButtonText('开始扫描').setCta().onClick(async () => {
          await this.plugin.scanUnusedImagesAndShowResults();
        }));

      new Setting(actions)
        .setName('📊 打开未引用结果页')
        .setDesc('打开上次扫描结果；如果没有扫描结果，则显示空状态。')
        .addButton((btn) => btn.setButtonText('打开结果页').onClick(async () => {
          await this.plugin.openUnusedImageView(this.plugin.lastUnusedImageScan || null);
        }));
    }

    if (this.activeTab === 'scope') {
      const scope = makeSection('📂 扫描范围', '限定清洗扫描范围与图片扩展名。');

      new Setting(scope)
        .setName('🔎 扫描目录')
        .setDesc('每行一个文件夹路径。留空表示扫描整个仓库中的 Markdown 笔记。')
        .addTextArea((text) => {
          text.setPlaceholder('notes\nprojects')
            .setValue(this.plugin.settings.targetFolders.join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.targetFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 6;
          text.inputEl.cols = 40;
        });

      new Setting(scope)
        .setName('🚧 排除目录')
        .setDesc('每行一个文件夹路径。命中的 Markdown 笔记会从扫描结果中剔除。')
        .addTextArea((text) => {
          text.setPlaceholder('templates\narchive')
            .setValue((this.plugin.settings.excludeFolders || []).join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.excludeFolders = parseMultilinePaths(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
          text.inputEl.cols = 40;
        });

      new Setting(scope)
        .setName('🧩 图片扩展名')
        .setDesc('英文逗号分隔，用于判定哪些链接属于图片。')
        .addText((text) => text
          .setPlaceholder('png,jpg,jpeg,gif,webp,svg,bmp,avif')
          .setValue(this.plugin.settings.imageExtensions.join(','))
          .onChange(async (value) => {
            this.plugin.settings.imageExtensions = value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
            await this.plugin.saveSettings();
          }));

      const ui = makeSection('🚪 界面入口', '控制工作流入口是否出现在侧边栏。');

      new Setting(ui)
        .setName('📌 显示侧边栏图标')
.setDesc('左侧 Ribbon 中显示“图片清洗侧栏”图标；修改后立即生效。')
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
          this.plugin.settings.showRibbonIcon = value;
          await this.plugin.saveSettings();
        }));
    }

    if (this.activeTab === 'actions') {
      const mode = makeSection('⚙️ 工作流模式', '模式会一次性调整关键开关，用于按风险等级组织插件行为。');

      new Setting(mode)
        .setName('🎛️ 当前模式')
        .setDesc('保守：预览优先；常规：粘贴命名与尺寸；激进：更高自动化。')
        .addDropdown((dropdown) => dropdown
          .addOption('conservative', '保守模式')
          .addOption('normal', '常规模式')
          .addOption('aggressive', '激进模式')
          .setValue(this.plugin.settings.workflowMode || 'normal')
          .onChange(async (value) => {
            await this.plugin.applyWorkflowMode(value);
            this.display();
          }));

      const action = makeSection('🚀 执行操作', '命令面板之外，也可在这里直接触发流程。');

      new Setting(action)
        .setName('📏 当前行图片设置尺寸')
        .setDesc('只修改当前行第一张图片的尺寸，不重命名文件。')
        .addButton((btn) => btn.setButtonText('设置尺寸').setCta().onClick(async () => {
          const file = this.plugin.getActiveFile();
          const embed = file ? this.plugin.findCurrentLineFirstEmbed(file) : null;
          if (!embed) {
            new Notice('当前行未检测到图片嵌入');
            return;
          }
          new SizeModal(this.plugin.app, this.plugin.settings.pastedImageSize || '', async (sizeValue) => {
            await this.plugin.setCurrentLineImageSize(sizeValue, embed);
          }).open();
        }));

      new Setting(action)
        .setName('↩️ 撤销上一次图片工作流操作')
        .setDesc('基于插件日志恢复上一次命名、重排、尺寸或清洗操作。')
        .addButton((btn) => btn.setButtonText('撤销上一次').onClick(async () => {
          await this.plugin.rollbackLastOperation();
        }));

      new Setting(action)
        .setName('👁️ 预览图片文件名清洗')
        .setDesc('扫描当前范围并在侧边栏展示差异。')
        .addButton((btn) => btn.setButtonText('开始预览').setCta().onClick(async () => {
          await this.plugin.previewCleaning();
        }));

      new Setting(action)
        .setName('🧹 应用上次预览结果')
        .setDesc('将上次预览中确认可安全修改的内容真正写回。')
        .addButton((btn) => btn.setButtonText('应用清洗').onClick(async () => {
          await this.plugin.applyLastPreview();
        }));

      new Setting(action)
        .setName('📊 打开图片清洗侧栏')
        .setDesc('若已有预览则直接打开结果侧栏；否则先执行一次预览。')
        .addButton((btn) => btn.setButtonText('打开侧栏').onClick(async () => {
          if (this.plugin.lastPreview) {
            await this.plugin.openResultView();
          } else {
            await this.plugin.previewCleaning();
          }
        }));

      const tips = makeSection('💡 工作流提示', '用于固定整个插件的使用顺序。');
      tips.createEl('p', { text: '建议顺序：粘贴自动命名 → 需要时输入尺寸 → 当前文章重排 → 路径链接清洗。' });
      tips.createEl('p', { text: '当“粘贴时弹出尺寸输入框”开启后，每次粘贴图片都会出现尺寸填入框；输入 500 会生成 ![[xxx.png|500]]。' });
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
      ? `扫描于 ${formatDate(this.scanResult.scannedAt)} · 候选 ${this.scanResult.candidateImageFiles.length} 张 · 未引用 ${this.scanResult.unusedFiles.length} 张 · 已选 ${this.selectedPaths.size} 张`
      : '扫描附件目录，找出未被 Markdown / Canvas 引用的图片。' });

    const toolbar = header.createDiv({ cls: 'iwt-unused-toolbar' });
    const scanBtn = toolbar.createEl('button', { text: '重新扫描', cls: 'mod-cta' });
    const selectBtn = toolbar.createEl('button', { text: '全选' });
    const clearBtn = toolbar.createEl('button', { text: '清空' });
    const deleteBtn = toolbar.createEl('button', { text: '删除选中', cls: 'mod-warning' });
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
      empty.createDiv({ text: '当前候选范围内的图片均被引用，或候选范围设置过窄。' });
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
      const actions = row.createDiv({ cls: 'iwt-unused-row-actions' });
      const previewBtn = actions.createEl('button', { text: '预览' });
      previewBtn.onclick = () => this.openImagePreview(file);
      const deleteOneBtn = actions.createEl('button', { text: '删除', cls: 'mod-warning' });
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
    contentEl.createEl('h2', { text: '确认删除未引用图片' });
    contentEl.createEl('p', { text: `即将把 ${this.files.length} 张图片移入系统回收站。该操作不会直接永久删除，但仍建议先确认路径。` });
    const box = contentEl.createDiv({ cls: 'iwt-unused-delete-list' });
    for (const file of this.files.slice(0, 12)) box.createDiv({ text: file.path });
    if (this.files.length > 12) box.createDiv({ text: `……另外 ${this.files.length - 12} 张` });
    const actions = contentEl.createDiv({ cls: 'iwt-unused-toolbar' });
    const cancel = actions.createEl('button', { text: '取消' });
    const confirm = actions.createEl('button', { text: '移入回收站', cls: 'mod-warning' });
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
    return '图片文件名清洗';
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
    header.createEl('h2', { text: '图片文件名清洗' });
    header.createDiv({ cls: 'ilfc-subtitle', text: this.preview
      ? `扫描于 ${formatDate(this.preview.scannedAt)} · 扫描 ${this.preview.filesScanned} 篇笔记`
      : '将路径型图片链接安全收缩为文件名链接。' });

    const toolbar = root.createDiv({ cls: 'ilfc-toolbar' });
    const previewBtn = toolbar.createEl('button', { text: '重新预览', cls: 'mod-cta' });
    const applyBtn = toolbar.createEl('button', { text: '应用清洗' });
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
    contentEl.createEl('h2', { text: '确认应用清洗' });
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
