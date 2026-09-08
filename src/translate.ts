import type { Entry } from './model';

const CJK = /[\u3400-\u9fff]/g;
const VIETNAMESE = /[ăâêôơưđĂÂÊÔƠƯĐáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;
const TOKEN = /QMZX(\d+)QM/g;
const SEPARATOR = '\nQMZXSEPQM\n';

const glossary: [string, string][] = [
  ['大语言模型', 'mô hình ngôn ngữ lớn'],
  ['检索增强生成', 'RAG'],
  ['上下文窗口', 'cửa sổ ngữ cảnh'],
  ['多智能体', 'đa tác nhân'],
  ['基准测试', 'benchmark'],
  ['提示词', 'prompt'],
  ['大模型', 'mô hình lớn'],
  ['开源', 'mã nguồn mở'],
  ['微调', 'tinh chỉnh'],
  ['推理', 'suy luận'],
  ['向量', 'vector'],
  ['上下文', 'ngữ cảnh'],
  ['嵌入', 'embedding'],
  ['幻觉', 'ảo giác'],
  ['对齐', 'căn chỉnh'],
  ['智能体', 'tác nhân'],
  ['工作流', 'luồng công việc'],
  ['部署', 'triển khai'],
  ['令牌', 'token'],
  ['模型', 'mô hình'],
];
glossary.sort((a, b) => b[0].length - a[0].length);

export const TRANSLATION_LIMIT = 150;
export interface TranslationRecord { title: string; summary: string; html: string; stamp: string; at: number }
export type TranslateTransport = (url: string) => Promise<{ status: number; text: string }>;

export function isChineseText(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return false;
  const vietnamese = value.match(new RegExp(VIETNAMESE.source, 'g'))?.length ?? 0;
  if (vietnamese >= 2) return false;
  const cjk = value.match(CJK)?.length ?? 0;
  return cjk >= 4 || (cjk >= 2 && cjk / compact.length >= 0.3);
}

export function isChineseEntry(entry: Pick<Entry, 'title' | 'summary' | 'language'>): boolean {
  const lang = (entry.language || '').toLowerCase();
  if (lang.startsWith('zh')) return true;
  if (lang.startsWith('vi') || lang.startsWith('en')) return false;
  return isChineseText(`${entry.title}\n${entry.summary || ''}`);
}

export function translationStamp(entry: Pick<Entry, 'title' | 'summary'>): string {
  return `${entry.title}\n${(entry.summary || '').slice(0, 80)}`;
}

export function cachedTranslation(cache: Record<string, TranslationRecord>, id: string, stamp: string): TranslationRecord | undefined {
  const record = cache[id];
  return record?.stamp === stamp ? record : undefined;
}

export function rememberTranslation(cache: Record<string, TranslationRecord>, id: string, patch: Partial<TranslationRecord> & { stamp: string }): Record<string, TranslationRecord> {
  const previous = cache[id];
  const next = { ...cache, [id]: {
    title: patch.title ?? previous?.title ?? '',
    summary: patch.summary ?? previous?.summary ?? '',
    html: patch.html ?? previous?.html ?? '',
    stamp: patch.stamp,
    at: Date.now(),
  } };
  const ranked = Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, TRANSLATION_LIMIT);
  return Object.fromEntries(ranked);
}

export function displayTitle(entry: Pick<Entry, 'id' | 'title'>, cache: Record<string, TranslationRecord>, stamp: string): string {
  return cachedTranslation(cache, entry.id, stamp)?.title.trim() || entry.title;
}

export function displaySummary(entry: Pick<Entry, 'id' | 'summary'>, cache: Record<string, TranslationRecord>, stamp: string): string {
  return cachedTranslation(cache, entry.id, stamp)?.summary.trim() || entry.summary || '';
}

function shield(value: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const put = (kept: string) => { slots.push(kept); return `QMZX${slots.length - 1}QM`; };
  let text = value.replace(/```[\s\S]*?```/g, match => put(match)).replace(/https?:\/\/[^\s<>"']+/g, match => put(match)).replace(/`[^`\n]+`/g, match => put(match));
  for (const [source, target] of glossary) text = text.split(source).join(put(target));
  return { text, slots };
}

function restore(value: string, slots: string[]): string {
  return value.replace(TOKEN, (_, index: string) => slots[Number(index)] ?? '');
}

export function parseGoogleTranslate(payload: string): string {
  const parsed = JSON.parse(payload) as unknown;
  if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) throw new Error('Định dạng dữ liệu không tương thích.');
  return parsed[0].map(part => Array.isArray(part) ? String(part[0] ?? '') : '').join('');
}

async function requestTranslation(text: string, transport: TranslateTransport): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
  const result = await transport(url);
  if (result.status < 200 || result.status >= 300) throw new Error('Không dịch được, đang hiện bản gốc.');
  return parseGoogleTranslate(result.text);
}

export async function translateTexts(texts: string[], transport: TranslateTransport): Promise<string[]> {
  const prepared = texts.map(text => shield(text));
  const output = new Array<string>(texts.length);
  let batch: number[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const indexes = batch;
    batch = []; size = 0;
    const joined = indexes.map(index => prepared[index].text).join(SEPARATOR);
    let parts: string[];
    try {
      const translated = await requestTranslation(joined, transport);
      parts = translated.split(SEPARATOR);
      if (parts.length !== indexes.length) throw new Error('split');
    } catch {
      parts = [];
      for (const index of indexes) parts.push(await requestTranslation(prepared[index].text, transport));
    }
    indexes.forEach((index, offset) => { output[index] = restore(parts[offset] ?? texts[index], prepared[index].slots); });
  };
  for (const index of texts.keys()) {
    if (!isChineseText(texts[index])) { output[index] = texts[index]; continue; }
    const length = prepared[index].text.length;
    if (batch.length && size + length > 1400) await flush();
    batch.push(index); size += length + SEPARATOR.length;
  }
  await flush();
  return output.map((value, index) => value ?? texts[index]);
}

export async function translateHtml(html: string, transport: TranslateTransport, doc: Document): Promise<string> {
  const parsed = new doc.defaultView!.DOMParser().parseFromString(`<div id="qrs-vi">${html}</div>`, 'text/html');
  const root = parsed.getElementById('qrs-vi');
  if (!root) return html;
  const nodes: Text[] = [];
  const walker = parsed.createTreeWalker(root, 4);
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (parent && !parent.closest('pre,code,script,style') && isChineseText(current.textContent || '')) nodes.push(current as Text);
    current = walker.nextNode();
  }
  if (!nodes.length) return html;
  const translated = await translateTexts(nodes.map(node => node.textContent || ''), transport);
  nodes.forEach((node, index) => { node.textContent = translated[index] ?? node.textContent; });
  return root.innerHTML;
}
