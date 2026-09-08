import fangsong from '../fonts/QiaomuReadingFangsong.woff2';
import { t } from './i18n';
import type { ReadingFont } from './model';

export const readingFonts: { id: ReadingFont; name: string; family: string; data?: string }[] = [
  { id: 'serif', name: t.fontSerif, family: 'Georgia,"Times New Roman",serif' },
  { id: 'sans', name: t.fontSans, family: 'var(--font-text),"Segoe UI","Be Vietnam Pro",sans-serif' },
  { id: 'custom', name: t.fontCustom, family: 'serif' },
  { id: 'sourceHanSerif', name: t.fontSourceHanSerif, family: '"Source Han Serif CN",serif' },
  { id: 'sourceHanSans', name: t.fontSourceHanSans, family: '"Source Han Sans CN",sans-serif' },
  { id: 'wenkai', name: t.fontWenkai, family: '"LXGW WenKai GB Screen",serif' },
  { id: 'zhenkai', name: t.fontZhenkai, family: '"LXGW ZhenKai GB",serif' },
  { id: 'fangsong', name: t.fontFangsong, family: 'QRS Fangsong', data: fangsong },
];

export const selectableFonts = readingFonts.filter(font => ['fangsong', 'serif', 'sans', 'custom'].includes(font.id));
export function fontFamily(id: ReadingFont, custom: string) {
  const font = readingFonts.find(font => font.id === id)!;
  return id === 'custom' ? `${JSON.stringify(custom.trim() || 'serif')},serif` : font.data ? `"${font.family}",serif` : font.family;
}

export class ReadingFonts {
  private documents = new Map<Document, Map<string, Promise<FontFace>>>();
  private disposed = false;
  async load(doc: Document, id: ReadingFont): Promise<void> {
    const font = readingFonts.find(font => font.id === id);
    if (!font?.data || this.disposed) return;
    let loads = this.documents.get(doc);
    if (!loads) { loads = new Map(); this.documents.set(doc, loads); }
    let pending = loads.get(id);
    if (!pending) {
      const data = font.data;
      pending = (async () => {
        const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), char => char.charCodeAt(0));
        const face = new FontFace(font.family, bytes);
        await face.load();
        if (!this.disposed) doc.fonts.add(face);
        return face;
      })();
      loads.set(id, pending);
    }
    try { await pending; } catch (error) { loads.delete(id); throw error; }
  }
  dispose() {
    this.disposed = true;
    for (const [doc, loads] of this.documents) {
      for (const pending of loads.values()) void pending.then(face => doc.fonts.delete(face)).catch(() => undefined);
    }
    this.documents.clear();
  }
}
