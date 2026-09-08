import { Modal, Notice, Setting, setIcon } from 'obsidian';
import { t } from './i18n';
import { DiscoveryPanel } from './discovery-view';
import { VaultFilePicker, VaultFolderPicker, vaultSourceId } from './vault-source';
import type QiaomuRssPlugin from './main';
import { exportOpml, MAX_SUBSCRIPTIONS, parseOpml, type FeedInput } from './feeds';
import type { Subscription } from './model';

export type SubscriptionTab = 'mine' | 'explore' | 'local';
export class SubscriptionManager extends Modal {
  private list!: HTMLElement;
  private message!: HTMLElement;
  private discovery?: DiscoveryPanel;
  private body!: HTMLElement;
  constructor(private plugin: QiaomuRssPlugin, private changed: () => void, private tab: SubscriptionTab = 'mine') { super(plugin.app); }
  onOpen() {
    this.setTitle(t.manageTitle); this.modalEl.addClass('qrs-subscription-modal');
    const tabs = this.contentEl.createDiv({ cls: 'qrs-subscription-tabs', attr: { role: 'tablist' } });
    this.body = this.contentEl.createDiv({ cls: 'qrs-subscription-body', attr: { role: 'tabpanel', id: `qrs-sources-${crypto.randomUUID()}` } });
    const choices: [SubscriptionTab, string][] = [['mine', t.tabMine], ['explore', t.tabExplore], ['local', t.tabLocal]];
    const select = (tab: SubscriptionTab) => {
      this.tab = tab;
      for (const button of tabs.querySelectorAll('button')) { const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
      this.discovery?.unload(); this.discovery = undefined; this.body.empty();
      if (tab === 'mine') this.renderMine();
      else if (tab === 'explore') { this.discovery = new DiscoveryPanel(this.body.createDiv(), this.plugin, true); this.discovery.load(); }
      else this.renderLocal();
    };
    for (const [tab, label] of choices) {
      const button = tabs.createEl('button', { text: label, attr: { role: 'tab', 'data-tab': tab, 'aria-controls': this.body.id } });
      button.onclick = () => select(tab);
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const index = choices.findIndex(([id]) => id === this.tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        select(choices[next][0]); (tabs.children[next] as HTMLButtonElement).focus();
      };
    }
    select(this.tab);
  }
  onClose() { this.discovery?.unload(); this.contentEl.empty(); }
  refresh() { this.discovery?.refresh(); }
  private renderLocal() {
    const add = (path: string) => {
      const settings = this.plugin.state.settings;
      if (!settings.markdownFolders.includes(path)) settings.markdownFolders.push(path);
      settings.lastSource = vaultSourceId(path);
      void this.plugin.persist().then(() => { this.plugin.resetViews(); if (this.tab === 'local' && this.body.isConnected) { this.body.empty(); this.renderLocal(); } });
    };
    const tools = this.body.createDiv('qrs-subscription-tools');
    tools.createEl('button', { text: t.addFolder }).onclick = () => new VaultFolderPicker(this.app, folder => add(folder.path)).open();
    tools.createEl('button', { text: t.addFile }).onclick = () => new VaultFilePicker(this.app, file => add(file.path)).open();
    for (const path of this.plugin.state.settings.markdownFolders) {
      new Setting(this.body).setName(path === '/' ? t.wholeVault : path).addButton(button => button.setButtonText(t.remove).onClick(async () => {
        this.plugin.state.settings.markdownFolders = this.plugin.state.settings.markdownFolders.filter(value => value !== path);
        await this.plugin.persist(); this.plugin.resetViews(); if (this.tab === 'local' && this.body.isConnected) { this.body.empty(); this.renderLocal(); }
      }));
    }
    if (!this.plugin.state.settings.markdownFolders.length) this.body.createEl('p', { cls: 'qrs-subscription-help', text: t.localHelp });
  }
  private renderMine() {
    const form = this.body.createEl('form', { cls: 'qrs-subscription-add' });
    const fieldId = crypto.randomUUID();
    form.createEl('label', { cls: 'qrs-visually-hidden', text: t.feedUrl, attr: { for: `qrs-feed-${fieldId}` } });
    const url = form.createEl('input', { type: 'url', placeholder: 'https://example.com/feed.xml', attr: { id: `qrs-feed-${fieldId}`, required: '' } });
    form.createEl('label', { cls: 'qrs-visually-hidden', text: t.groupLabel, attr: { for: `qrs-group-${fieldId}` } });
    const group = form.createEl('input', { type: 'text', placeholder: t.groupOptional, attr: { id: `qrs-group-${fieldId}`, maxlength: '100' } });
    const add = form.createEl('button', { text: t.add, type: 'submit', cls: 'mod-cta' });
    this.message = this.body.createDiv({ cls: 'qrs-subscription-message', attr: { role: 'status' } });
    form.onsubmit = event => {
      event.preventDefault(); add.disabled = true; this.message.setText(t.readingFeed);
      void this.plugin.subscriptions.add(url.value, group.value, this.contentEl.ownerDocument).then(() => {
        url.value = ''; this.message.setText(t.feedAdded); this.renderList(); this.changed();
      }).catch((error: unknown) => { this.message.setText(error instanceof Error ? error.message : t.addFailed); }).finally(() => { add.disabled = false; });
    };
    const tools = this.body.createDiv('qrs-subscription-tools');
    const importButton = tools.createEl('button', { text: t.importOpml });
    importButton.onclick = () => new OpmlImport(this.plugin, () => { this.renderList(); this.changed(); }).open();
    const exportButton = tools.createEl('button', { text: t.exportOpml });
    exportButton.onclick = () => {
      if (!this.plugin.state.subscriptions.length) { this.message.setText(t.nothingToExport); return; }
      void this.plugin.saveOpml(exportOpml(this.plugin.state.subscriptions)).then(path => {
        this.message.setText(t.exportedTo(path));
      }).catch(() => { this.message.setText(t.exportFailed); });
    };
    this.list = this.body.createDiv('qrs-subscription-list'); this.renderList();
    this.body.createEl('p', { cls: 'qrs-subscription-help', text: t.subscriptionHelp });
  }
  private renderList() {
    this.list.empty();
    const feeds = [...this.plugin.state.subscriptions].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    if (!feeds.length) { this.list.createDiv({ cls: 'qrs-empty', text: t.addFirstFeed }); return; }
    for (const feed of feeds) {
      const row = this.list.createDiv('qrs-subscription-row');
      const info = row.createDiv('qrs-subscription-info');
      info.createDiv({ cls: 'qrs-subscription-name', text: feed.name });
      info.createDiv({ cls: 'qrs-subscription-detail', text: `${feed.group || t.ungrouped} · ${new URL(feed.url).hostname} · ${t.articleCount(feed.entries.length)}` });
      if (feed.error) info.createDiv({ cls: 'qrs-subscription-error', text: feed.error });
      const edit = row.createEl('button', { cls: 'qrs-subscription-icon', attr: { 'data-qrs-label': t.editFeed(feed.name) } });
      setIcon(edit, 'pencil'); edit.createSpan({ cls: 'qrs-visually-hidden', text: t.editFeed(feed.name) });
      edit.onclick = () => new EditSubscription(this.plugin, feed, () => { this.renderList(); this.changed(); }).open();
      const remove = row.createEl('button', { cls: 'qrs-subscription-icon', attr: { 'data-qrs-label': t.unsubscribeFeed(feed.name) } });
      setIcon(remove, 'trash-2'); remove.createSpan({ cls: 'qrs-visually-hidden', text: t.unsubscribeFeed(feed.name) });
      remove.onclick = () => new RemoveSubscription(this.plugin, feed, () => { this.renderList(); this.changed(); }).open();
    }
  }
}
class EditSubscription extends Modal {
  constructor(private plugin: QiaomuRssPlugin, private feed: Subscription, private changed: () => void) { super(plugin.app); }
  onOpen() {
    this.setTitle(t.editSubscription); this.modalEl.addClass('qrs-subscription-modal'); let name = this.feed.name; let group = this.feed.group;
    new Setting(this.contentEl).setName(t.name).addText(text => text.setValue(name).onChange(value => { name = value; }));
    new Setting(this.contentEl).setName(t.group).addText(text => text.setValue(group).setPlaceholder(t.ungrouped).onChange(value => { group = value; }));
    new Setting(this.contentEl).addButton(button => button.setButtonText(t.save).setCta().onClick(async () => {
      try { await this.plugin.subscriptions.edit(this.feed.id, name, group); this.changed(); this.close(); }
      catch (error) { new Notice(error instanceof Error ? error.message : t.saveFailed); }
    }));
  }
}
class RemoveSubscription extends Modal {
  constructor(private plugin: QiaomuRssPlugin, private feed: Subscription, private changed: () => void) { super(plugin.app); }
  onOpen() {
    this.setTitle(t.unsubscribeTitle(this.feed.name));
    this.contentEl.createEl('p', { text: t.unsubscribeBody });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t.keepSubscription).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t.unsubscribe).setDestructive().onClick(async () => {
        await this.plugin.subscriptions.remove(this.feed.id); this.changed(); this.close();
      }));
  }
}
class OpmlImport extends Modal {
  private feeds: FeedInput[] = [];
  constructor(private plugin: QiaomuRssPlugin, private changed: () => void) { super(plugin.app); }
  onOpen() {
    this.setTitle(t.importOpmlTitle); this.modalEl.addClass('qrs-subscription-modal');
    const fieldId = crypto.randomUUID();
    this.contentEl.createEl('label', { cls: 'qrs-visually-hidden', text: t.chooseOpml, attr: { for: `qrs-opml-file-${fieldId}` } });
    const input = this.contentEl.createEl('input', { type: 'file', attr: { id: `qrs-opml-file-${fieldId}`, accept: '.opml,.xml,text/xml,application/xml' } });
    this.contentEl.createEl('label', { cls: 'qrs-visually-hidden', text: t.opmlContent, attr: { for: `qrs-opml-text-${fieldId}` } });
    const area = this.contentEl.createEl('textarea', { cls: 'qrs-opml-text', placeholder: t.pasteOpml, attr: { id: `qrs-opml-text-${fieldId}` } });
    const preview = this.contentEl.createDiv({ cls: 'qrs-opml-preview', attr: { role: 'status' } });
    const importButton = this.contentEl.createEl('button', { text: t.importFeeds, cls: 'mod-cta' }); importButton.disabled = true;
    const validate = () => {
      this.feeds = []; importButton.disabled = true; preview.empty();
      try {
        const parsed = parseOpml(area.value, this.contentEl.ownerDocument);
        const existing = new Set(this.plugin.state.subscriptions.map(feed => feed.url));
        this.feeds = parsed.feeds.filter(feed => !existing.has(feed.url));
        preview.createEl('p', { text: t.importPreview(this.feeds.length, parsed.skipped + parsed.feeds.length - this.feeds.length) });
        if (this.feeds.length + existing.size > MAX_SUBSCRIPTIONS) throw new Error(t.tooManyImport(MAX_SUBSCRIPTIONS));
        for (const feed of this.feeds.slice(0, 10)) preview.createDiv({ text: `${feed.group ? feed.group + ' / ' : ''}${feed.name}` });
        if (this.feeds.length > 10) preview.createDiv({ text: t.moreFeeds(this.feeds.length - 10) });
        importButton.disabled = !this.feeds.length;
      } catch (error) { preview.setText(error instanceof Error ? error.message : t.cannotReadFile); }
    };
    area.oninput = validate;
    input.onchange = () => {
      this.feeds = []; importButton.disabled = true;
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { preview.setText(t.opmlTooLarge); return; }
      void file.text().then(value => { area.value = value; validate(); }).catch(() => { preview.setText(t.cannotReadFile); });
    };
    this.contentEl.createEl('p', { cls: 'qrs-subscription-help', text: t.importHelp });
    importButton.onclick = () => {
      importButton.disabled = true;
      void this.plugin.subscriptions.import(this.feeds).then(count => {
        new Notice(t.imported(count)); this.changed(); this.close();
      }).catch((error: unknown) => { preview.setText(error instanceof Error ? error.message : t.importFailed); importButton.disabled = false; });
    };
  }
}
