import { addSearchClear } from './search-clear';
import { Component, Platform, setIcon } from 'obsidian';
import { t } from './i18n';
export type ChannelSection = 'aggregate' | 'group' | 'feeds' | 'vault';
export interface ChannelChoice { id: string; name: string; section: ChannelSection; subtitle: string; icon?: string; monogram?: string; group?: string }
export function channelMark(parent: HTMLElement, choice: ChannelChoice) {
  const mark = parent.createSpan('qrs-channel-mark');
  if (choice.icon) setIcon(mark, choice.icon); else mark.setText(choice.monogram || choice.name.trim().slice(0, 1).toLocaleUpperCase());
  return mark;
}
export class ChannelPicker extends Component {
  private panel!: HTMLElement;
  private rows!: HTMLElement;
  private search!: HTMLInputElement;
  private backdrop?: HTMLElement;
  private expanded = new Set<string>();
  private finished = false;
  constructor(private anchor: HTMLElement, private choices: ChannelChoice[], private active: string, private choose: (choice: ChannelChoice) => void, private dismiss: () => void) { super(); }
  onload() {
    const doc = this.anchor.ownerDocument, win = doc.defaultView!;
    const mobile = Platform.isMobileApp || win.innerWidth <= 600;
    if (mobile) { this.backdrop = doc.body.createDiv('qrs-channel-backdrop'); this.backdrop.onclick = () => this.close(); }
    this.panel = doc.body.createDiv({ cls: 'qrs-channel-picker' + (mobile ? ' is-sheet' : ''), attr: { role: 'dialog', 'aria-modal': String(mobile), tabindex: '-1' } });
    const titleId = `qrs-channels-${crypto.randomUUID()}`;
    this.panel.setAttribute('aria-labelledby', titleId);
    const handle = this.panel.createDiv('qrs-channel-handle');
    let startY = 0;
    handle.onpointerdown = e => { startY = e.clientY; handle.setPointerCapture(e.pointerId); };
    handle.onpointerup = e => { if (e.clientY - startY > 60) this.close(); };
    this.panel.createEl('h2', { text: t.switchChannel, cls: mobile ? 'qrs-channel-heading' : 'qrs-visually-hidden', attr: { id: titleId } });
    const searchId = titleId + '-search';
    this.panel.createEl('label', { text: t.searchChannel, cls: 'qrs-visually-hidden', attr: { for: searchId } });
    this.search = this.panel.createEl('input', { type: 'search', placeholder: t.searchChannelPlaceholder, attr: { id: searchId } });
    addSearchClear(this.search);
    this.rows = this.panel.createDiv('qrs-channel-options');
    const current = this.choices.find(c => c.id === this.active);
    if (current?.group) this.expanded.add(current.group);
    if (current?.section === 'group') this.expanded.add(current.id.slice(7));
    this.search.oninput = () => this.render();
    this.registerDomEvent(doc, 'pointerdown', e => {
      const node = e.target as Node;
      if (!this.panel.contains(node) && !this.anchor.contains(node)) this.close(false);
    });
    this.registerDomEvent(this.panel, 'keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      const buttons = [...this.rows.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); const next = e.key === 'ArrowDown' ? index + 1 : index < 0 ? buttons.length - 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      } else if (e.key === 'Enter' && doc.activeElement === this.search) { e.preventDefault(); buttons[0]?.click(); }
      else if (e.key === 'Tab') {
        const clear = this.panel.querySelector<HTMLButtonElement>('.qrs-search-clear');
        const fields = [this.search, ...(this.search.value && clear ? [clear] : []), ...buttons]; const at = fields.indexOf(doc.activeElement as HTMLInputElement);
        if (e.shiftKey && at <= 0) { e.preventDefault(); fields.at(-1)?.focus(); }
        else if (!e.shiftKey && at === fields.length - 1) { e.preventDefault(); this.search.focus(); }
      }
    });
    if (!mobile) this.registerDomEvent(win, 'resize', () => this.close());
    this.anchor.setAttribute('aria-expanded', 'true'); this.render();
    if (!mobile) {
      const rect = this.anchor.getBoundingClientRect(), width = Math.min(340, win.innerWidth - 16);
      this.panel.setCssProps({ '--qrs-picker-width': `${width}px`, '--qrs-picker-left': `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`, '--qrs-picker-top': `${Math.min(rect.bottom + 6, win.innerHeight - 200)}px`, '--qrs-picker-height': `${Math.max(180, Math.min(520, win.innerHeight - rect.bottom - 14))}px` });
      this.search.focus({ preventScroll: true });
    } else this.panel.focus({ preventScroll: true });
    this.rows.querySelector<HTMLElement>('[aria-current=true]')?.scrollIntoView({ block: 'nearest' });
  }
  private render() {
    this.rows.empty();
    const query = this.search.value.trim().toLocaleLowerCase();
    const row = (choice: ChannelChoice, nested = false) => {
      const wrap = this.rows.createDiv({ cls: 'qrs-channel-option-wrap' + (nested ? ' is-nested' : '') });
      const button = wrap.createEl('button', { cls: 'qrs-channel-option', attr: { 'data-channel-id': choice.id, 'aria-current': String(choice.id === this.active) } });
      channelMark(button, choice); const copy = button.createSpan('qrs-channel-copy');
      copy.createSpan({ cls: 'qrs-channel-name', text: choice.name });
      if (query) copy.createSpan({ cls: 'qrs-channel-subtitle', text: choice.group || choice.name });
      if (choice.id === this.active) setIcon(button.createSpan('qrs-channel-check'), 'check');
      button.onclick = () => { this.close(); this.choose(choice); };
      if (!query && choice.section === 'group') {
        const group = choice.id.slice(7), open = this.expanded.has(group);
        const toggle = wrap.createEl('button', { cls: 'qrs-channel-expand', attr: { 'aria-expanded': String(open) } });
        setIcon(toggle, open ? 'chevron-down' : 'chevron-right'); toggle.createSpan({ cls: 'qrs-visually-hidden', text: `${open ? t.collapse : t.expand} ${choice.name}` });
        toggle.onclick = () => { if (open) this.expanded.delete(group); else this.expanded.add(group); this.render(); this.rows.querySelector<HTMLElement>(`[data-group-toggle="${CSS.escape(group)}"]`)?.focus(); };
        toggle.dataset.groupToggle = group;
      }
    };
    if (query) {
      const matches = this.choices.filter(c => `${c.name} ${c.subtitle} ${c.section} ${c.group || ''}`.toLocaleLowerCase().includes(query));
      matches.forEach(c => row(c));
      if (!matches.length) this.rows.createDiv({ cls: 'qrs-channel-empty', text: t.noChannelMatch });
      return;
    }
    this.choices.filter(c => c.section === 'aggregate').forEach(c => row(c));
    for (const [section, label] of [['feeds', t.personalFeeds], ['vault', t.localFiles]] as const) {
      const choices = this.choices.filter(c => c.section === section);
      const groups = section === 'feeds' ? this.choices.filter(c => c.section === 'group') : [];
      if (!choices.length && !groups.length) continue;
      this.rows.createDiv({ cls: 'qrs-channel-section', text: label });
      for (const group of groups) {
        row(group); if (this.expanded.has(group.id.slice(7))) choices.filter(c => c.group === group.id.slice(7)).forEach(c => row(c, true));
      }
      choices.filter(c => !c.group).forEach(c => row(c));
    }
  }
  close(focus = true) {
    if (this.finished) return; this.finished = true;
    this.unload(); if (focus && this.anchor.isConnected) this.anchor.focus({ preventScroll: true }); this.dismiss();
  }
  onunload() { this.panel?.remove(); this.backdrop?.remove(); this.anchor.setAttribute('aria-expanded', 'false'); }
}
