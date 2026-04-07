/**
 * 解析 XMLTV 格式 EPG XML，按日期、频道分组并转换为目标 JSON 结构
 * 使用 fast-xml-parser 解析
 */

import { XMLParser } from 'fast-xml-parser';

export interface EpgProgrammeItem {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  title: string;
}

export interface EpgChannelJson {
  channel: string;
  epg_data: EpgProgrammeItem[];
}

/** XMLTV start/stop 格式: 20240314080000 +0800 → 提取 YYYYmmdd 与 HH:mm */
function parseXmltvTime(
  startStr: string,
  stopStr: string
): { date: string; start: string; end: string } | null {
  const startMatch = startStr?.match(/^(\d{14})/);
  const stopMatch = stopStr?.match(/^(\d{14})/);
  if (!startMatch || !stopMatch) return null;
  const start = startMatch[1];
  const stop = stopMatch[1];
  const date = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
  const startTime = `${start.slice(8, 10)}:${start.slice(10, 12)}`;
  const endTime = `${stop.slice(8, 10)}:${stop.slice(10, 12)}`;
  return { date, start: startTime, end: endTime };
}

function pickTitle(programme: Record<string, unknown>): string {
  const title = programme.title;
  if (typeof title === 'string') return title.trim();
  if (Array.isArray(title)) {
    const first = title[0];
    return typeof first === 'string'
      ? first.trim()
      : ((first as { '#text'?: string })?.['#text']?.trim() ?? '');
  }
  if (title && typeof title === 'object' && '#text' in title)
    return String((title as { '#text': string })['#text']).trim();
  return '';
}

/** 将频道名转为安全文件名（去掉非法字符） */
export function sanitizeChannelFileName(channel: string): string {
  return channel.replace(/[/\\:*?"<>|]/g, '_').trim() || 'channel';
}

type ParsedProgramme = Record<string, unknown> & {
  '@_start'?: string;
  '@_stop'?: string;
  '@_channel'?: string;
};
type ChannelId = string;
type ChannelName = string;
type ChannelDisplayName =
  | string
  | { '#text'?: string }
  | Array<string | { '#text'?: string }>;
type ChannelFromXml = {
  '@_id'?: string;
  name?: string;
  'display-name'?: ChannelDisplayName;
};
type ParsedChannel = Record<ChannelId, ChannelName>;

function toProgrammeList(programme: unknown): ParsedProgramme[] {
  if (!programme) return [];
  if (Array.isArray(programme)) return programme as ParsedProgramme[];
  return [programme as ParsedProgramme];
}

function pickChannelName(channel: ChannelFromXml): string {
  const displayName = channel['display-name'];
  if (typeof displayName === 'string') return displayName.trim();
  if (Array.isArray(displayName)) {
    const first = displayName[0];
    if (typeof first === 'string') return first.trim();
    return first?.['#text']?.trim() ?? '';
  }
  if (displayName && typeof displayName === 'object') {
    return displayName['#text']?.trim() ?? '';
  }
  return channel.name?.trim() ?? '';
}

function toChannelList(channel: unknown): ParsedChannel {
  const parsedChannels: ParsedChannel = {};
  if (!channel) return parsedChannels;
  let channels: ChannelFromXml[] = channel as ChannelFromXml[];
  if (!Array.isArray(channel)) {
    channels = [channel as ChannelFromXml];
  }

  for (const c of channels) {
    const id = c['@_id'] ?? '';
    parsedChannels[id] = pickChannelName(c);
  }
  return parsedChannels;
}

/**
 * 解析单段 XML，返回 (date, channel, EpgProgrammeItem) 列表
 */
export function parseEpgXml(
  xml: string
): Array<{ date: string; channel: string; item: EpgProgrammeItem }> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xml) as { tv?: { programme?: unknown; channel?: unknown } };
  const tv = parsed?.tv;
  if (!tv) return [];

  if (!tv.channel) {
    console.warn(`[WARNING] No channels found in XML`);
    return [];
  }

  const channels = toChannelList(tv.channel);
  console.log(`[TASK] Parse ${Object.keys(channels).length} channels`);
  const programmes = toProgrammeList(tv.programme);
  const out: Array<{ date: string; channel: string; item: EpgProgrammeItem }> = [];

  for (const p of programmes) {
    const channelId = (p['@_channel'] ?? '').trim();
    const startAttr = (p['@_start'] ?? '').trim();
    const stopAttr = (p['@_stop'] ?? '').trim();
    const time = parseXmltvTime(startAttr, stopAttr);
    const title = pickTitle(p);
    if (!channelId || !time) {
      continue;
    }
    const channel = channels[channelId];
    if (!channel) {
      console.warn(`[WARNING] Channel ${channelId} not found in XML`);
      continue;
    }
    out.push({
      date: time.date,
      channel,
      item: { start: time.start, end: time.end, title },
    });
  }
  return out;
}

/**
 * 将多个 XML 的解析结果按日期、频道合并，同一频道同一天按 start 排序
 */
export function mergeByDateAndChannel(
  allItems: Array<{ date: string; channel: string; item: EpgProgrammeItem }>
): Map<ChannelName, EpgChannelJson> {
  const byKey = new Map<string, EpgProgrammeItem[]>();
  for (const { date, channel, item } of allItems) {
    const key = `${date}\t${channel}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  const result = new Map<ChannelName, EpgChannelJson>();
  for (const [key, items] of byKey) {
    const [, channel] = key.split('\t');
    items.sort((a, b) => a.start.localeCompare(b.start));
    result.set(key, { channel, epg_data: items });
  }
  return result;
}
