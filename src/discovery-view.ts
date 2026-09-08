import { addSearchClear } from './search-clear';
import { Component, ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type QiaomuRssPlugin from './main';
import { blogCatalogSource, blogTags, categories, discoveryFeeds, filterDiscovery, independentBlogs, type DiscoveryCollection } from './discovery';
import { categoryLabel, languageLabel, t } from './i18n';

export const DISCOVERY_VIEW_TYPE = 'vietnam-ai-rss-discovery';
export class DiscoveryPanel extends Component {
  private cards!: HTMLElement;
  private count!: HTMLElement;
  private query = '';
  private category = '全部';
  private collection: DiscoveryCollection = 'featured';
  private tag = '';
  private limit = 60;
  private more!: HTMLButtonElement;
  private pending = new Set<string>();
  private errors = new Map<string, string>();
  private closed = false;
  constructor(private contentEl: HTMLElement, private plugin: QiaomuRssPlugin, private embedded = false) { super(); }
  onload() {
    this.closed = false; this.contentEl.empty(); this.contentEl.addClass('qrs-discovery');
    const page = this.contentEl.createDiv('qrs-discovery-page');
    const header = page.createDiv('qrs-discovery-header'); header.toggleClass('qrs-hidden', this.embedded);
    const intro = header.createDiv();
    intro.createEl('h1', { text: t.discoverTitle });
    intro.createEl('p', { text: t.discoverIntro });
    const actions = header.createDiv('qrs-discovery-actions');
    actions.createEl('button', { text: t.manageFeedsBtn }).onclick = () => this.plugin.manageSubscriptions();
    actions.createEl('button', { text: t.startReading, cls: 'mod-cta' }).onclick = () => { void this.plugin.readSubscriptions(); };
    const collections = page.createDiv({ cls: 'qrs-discovery-collections' });
    const featured = collections.createEl('button', { text: t.featuredCount(discoveryFeeds.length), attr: { 'aria-pressed': String(this.collection === 'featured') } });
    const blogs = collections.createEl('button', { text: t.blogsCount(independentBlogs.length), attr: { 'aria-pressed': String(this.collection === 'blogs') } });
    const standard = page.createEl('p', { cls: 'qrs-discovery-standard', text: t.featuredStandard });
    const attribution = page.createDiv('qrs-discovery-attribution');
    attribution.createSpan({ text: t.catalogFrom });
    attribution.createEl('a', { text: t.catalogName, href: blogCatalogSource, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    attribution.createSpan({ text: t.catalogRest });
    const fieldId = crypto.randomUUID(); page.createEl('label', { cls: 'qrs-visually-hidden', text: t.searchCatalog, attr: { for: `qrs-discovery-search-${fieldId}` } });
    const search = page.createEl('input', { type: 'search', cls: 'qrs-discovery-search', placeholder: t.searchCatalogPlaceholder, attr: { id: `qrs-discovery-search-${fieldId}` } });
    addSearchClear(search);
    search.value = this.query; search.oninput = () => { this.query = search.value; this.limit = 60; this.refresh(); };
    const filters = page.createDiv({ cls: 'qrs-discovery-filters' });
    for (const category of categories) {
      const button = filters.createEl('button', { text: categoryLabel(category), attr: { 'aria-pressed': String(this.category === category) } });
      button.onclick = () => {
        this.category = category; this.limit = 60;
        for (const item of filters.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
        this.refresh();
      };
    }
    page.createEl('label', { cls: 'qrs-visually-hidden', text: t.blogTopic, attr: { for: `qrs-discovery-tags-${fieldId}` } });
    const tags = page.createEl('select', { cls: 'qrs-discovery-tags dropdown', attr: { id: `qrs-discovery-tags-${fieldId}` } });
    tags.createEl('option', { value: '', text: t.allTopics });
    for (const tag of blogTags) tags.createEl('option', { value: tag, text: tag });
    tags.value = this.tag; tags.onchange = () => { this.tag = tags.value; this.limit = 60; this.refresh(); };
    const provider = page.createDiv('qrs-discovery-provider');
    this.count = provider.createSpan({ cls: 'qrs-discovery-count', attr: { role: 'status' } });
    this.cards = page.createDiv('qrs-discovery-grid');
    this.more = page.createEl('button', { text: t.showMoreBlogs, cls: 'qrs-discovery-more' });
    this.more.onclick = () => { this.limit += 60; this.refresh(); };
    const switchCollection = (collection: DiscoveryCollection) => {
      this.collection = collection; this.limit = 60;
      featured.setAttribute('aria-pressed', String(collection === 'featured')); blogs.setAttribute('aria-pressed', String(collection === 'blogs'));
      filters.toggleClass('qrs-hidden', collection !== 'featured'); standard.toggleClass('qrs-hidden', collection !== 'featured');
      for (const el of [tags, attribution]) el.toggleClass('qrs-hidden', collection !== 'blogs');
      search.placeholder = collection === 'blogs' ? t.searchBlogs : t.searchFeatured;
      this.refresh();
    };
    featured.onclick = () => switchCollection('featured'); blogs.onclick = () => switchCollection('blogs'); switchCollection(this.collection);
    page.createEl('p', { cls: 'qrs-discovery-footnote', text: t.catalogFootnote });
    this.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.refresh()));
  }
  onunload() { this.closed = true; }
  refresh() {
    if (this.closed || !this.cards) return;
    // Preserve keyboard focus when a pending card finishes or another view updates.
    const active = this.contentEl.ownerDocument.activeElement;
    const focusedId = active instanceof HTMLElement && this.cards.contains(active) ? active.closest<HTMLElement>('[data-feed]')?.dataset.feed : undefined;
    this.cards.empty();
    const feeds = filterDiscovery(this.query, this.collection === 'featured' ? this.category : '全部', this.collection, this.tag);
    const total = this.collection === 'blogs' ? independentBlogs.length : discoveryFeeds.length;
    this.count.setText(t.catalogCount(feeds.length, total));
    this.more.toggleClass('qrs-hidden', feeds.length <= this.limit);
    this.more.setText(t.showMoreRemaining(feeds.length - this.limit));
    if (!feeds.length) this.cards.createDiv({ cls: 'qrs-empty', text: t.noCatalogMatch });
    for (const feed of feeds.slice(0, this.limit)) {
      const url = feed.url;
      const subscribed = this.plugin.state.subscriptions.some(item => item.url === url);
      const card = this.cards.createEl('article', { cls: 'qrs-discovery-card', attr: { 'data-feed': feed.id, tabindex: '-1' } });
      const heading = card.createDiv('qrs-discovery-card-heading');
      setIcon(heading.createSpan('qrs-discovery-icon'), feed.icon);
      heading.createEl('h2', { text: feed.name });
      card.createDiv({ cls: 'qrs-discovery-meta', text: `${categoryLabel(feed.category)} · ${languageLabel(feed.language)}` });
      card.createEl('p', { text: feed.description });
      const footer = card.createDiv('qrs-discovery-card-footer');
      footer.createEl('a', { text: new URL(feed.site ?? url).hostname, href: feed.site ?? url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      const button = footer.createEl('button', { text: subscribed ? t.subscribed : this.pending.has(feed.id) ? t.adding : this.errors.has(feed.id) ? t.retry : t.subscribe });
      button.disabled = subscribed || this.pending.has(feed.id);
      button.onclick = () => {
        if (this.pending.has(feed.id)) return;
        this.pending.add(feed.id); this.errors.delete(feed.id); this.refresh();
        void this.plugin.subscriptions.add(url, categoryLabel(feed.category), this.contentEl.ownerDocument).then(async subscription => {
          await this.plugin.activateSubscription(subscription.id);
          new Notice(t.subscribedNotice(feed.name));
        }).catch((error: unknown) => {
          this.errors.set(feed.id, error instanceof Error ? error.message : t.addFailed);
        }).finally(() => { this.pending.delete(feed.id); this.refresh(); this.plugin.refreshDiscovery(); });
      };
      const error = this.errors.get(feed.id);
      if (error && !subscribed) card.createDiv({ cls: 'qrs-subscription-error', text: error, attr: { role: 'status' } });
    }
    if (focusedId) {
      const card = this.cards.querySelector<HTMLElement>(`[data-feed="${focusedId}"]`);
      (card?.querySelector<HTMLElement>('button:not(:disabled)') ?? card)?.focus({ preventScroll: true });
    }
  }
}

/** Restores existing workspace tabs; new exploration opens inside subscription management. */
export class DiscoveryView extends ItemView {
  private panel?: DiscoveryPanel;
  constructor(leaf: WorkspaceLeaf, private plugin: QiaomuRssPlugin) { super(leaf); }
  getViewType() { return DISCOVERY_VIEW_TYPE; }
  getDisplayText() { return t.exploreView; }
  getIcon() { return 'compass'; }
  onOpen(): Promise<void> { this.panel = new DiscoveryPanel(this.contentEl, this.plugin); this.addChild(this.panel); return Promise.resolve(); }
  refresh() { this.panel?.refresh(); }
}
