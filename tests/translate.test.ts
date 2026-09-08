// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cachedTranslation, isChineseEntry, isChineseText, rememberTranslation, translateHtml, translateTexts, translationStamp } from '../src/translate';

describe('Chinese detection and Vietnamese translation', () => {
  it('treats Chinese feeds as translatable and leaves Vietnamese or English alone', () => {
    expect(isChineseText('这是一篇关于模型微调的技术文章')).toBe(true);
    expect(isChineseText('Hướng dẫn tinh chỉnh mô hình ngôn ngữ')).toBe(false);
    expect(isChineseText('How to fine-tune a language model')).toBe(false);
    expect(isChineseEntry({ title: 'Short', summary: '', language: 'zh-CN' })).toBe(true);
    expect(isChineseEntry({ title: 'Release notes', summary: 'API update', language: 'en' })).toBe(false);
  });

  it('keeps code blocks untouched and restores technology terms', async () => {
    const transport = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get('q') || '';
      expect(query).not.toContain('微调');
      return { status: 200, text: JSON.stringify([[['Đoạn đã dịch ' + query, query, null, null, 1]]]) };
    });
    const html = '<p>微调模型</p><pre><code>微调 keep</code></pre>';
    const translated = await translateHtml(html, transport, document);
    expect(translated).toContain('Đoạn đã dịch');
    expect(translated).toContain('tinh chỉnh');
    expect(translated).toContain('<code>微调 keep</code>');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('returns a cached translation without calling the network again', async () => {
    const stamp = translationStamp({ title: '模型微调', summary: '推理' });
    const cache = rememberTranslation({}, 'post-1', { title: 'Tinh chỉnh mô hình', summary: 'Suy luận', stamp });
    expect(cachedTranslation(cache, 'post-1', stamp)?.title).toBe('Tinh chỉnh mô hình');
    expect(cachedTranslation(cache, 'post-1', 'khác')).toBeUndefined();
    const transport = vi.fn();
    const [title] = await translateTexts(['How to ship an API'], transport);
    expect(title).toBe('How to ship an API');
    expect(transport).not.toHaveBeenCalled();
  });
});
