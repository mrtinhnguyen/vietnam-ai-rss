export const pluginId = 'vietnam-ai-rss';
export const protocolIds = ['vietnam-ai-rss', 'qiaomu-ai-rss'] as const;

export function articleProtocol(href: string): string | null {
  for (const id of protocolIds) if (href.startsWith(`obsidian://${id}?`)) return id;
  return null;
}
