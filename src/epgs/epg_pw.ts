/**
 * 从 epg.pw 获取中国地区频道列表，逐频道拉取 EPG 数据，合并生成完整 XMLTV 格式 EPG 文件
 *
 * 流程：
 *  1. 访问 https://epg.pw/areas/cn.html?lang=zh-hans 提取频道 ID 与名称
 *  2. 对每个频道调用 https://epg.pw/api/epg.xml?lang=zh-hans&date=YYYYMMDD&channel_id=ID
 *  3. 使用 fast-xml-parser 解析各响应中的 <channel> 与 <programme> 节点
 *  4. 去重合并后由 XMLBuilder 输出一份完整的 XMLTV XML
 */

import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { writeEpgJsonFromXml } from '../file';
import type { EpgChannelJson } from './parser';
import { writeFile } from 'fs/promises';
import path from 'path';
import { mkdir } from 'fs/promises';

/** 与 src/epgs/parser.ts 保持一致，便于结构一致 */
const PW_EPG_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_' as const,
  /** 单条也解析为数组，避免手写分支 */
  isArray: (tagName: string) => tagName === 'channel' || tagName === 'programme',
};

const epgPwParser = new XMLParser(PW_EPG_PARSER_OPTIONS);

const epgPwBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  suppressEmptyNode: true,
});

type EpgPwTvNode = {
  channel?: EpgPwChannelNode | EpgPwChannelNode[];
  programme?: EpgPwProgrammeNode | EpgPwProgrammeNode[];
};

interface EpgPwChannel {
  id: string;
  name: string;
}

type EpgPwTextNode =
  | string
  | {
      '#text'?: string;
      [key: string]: unknown;
    };

interface EpgPwXmlNodeBase {
  [key: string]: unknown;
}

interface EpgPwChannelNode extends EpgPwXmlNodeBase {
  '@_id'?: string;
  'display-name'?: EpgPwTextNode | EpgPwTextNode[];
}

interface EpgPwProgrammeNode extends EpgPwXmlNodeBase {
  '@_start'?: string;
  '@_stop'?: string;
  '@_channel'?: string;
  title?: EpgPwTextNode | EpgPwTextNode[];
  desc?: EpgPwTextNode | EpgPwTextNode[];
}

export interface PWEpgJson {
  end_date: string;
  name: string;
  info_url: string;
  country: string;
  description: string | null;
  error_message: string;
  provider: string;
  source_url: string;
  offset: string;
  timezone: string;
  error_code: number;
  start_date: string;
  icon: string;
  epg_list: PWEpgProgrammeItem[];
}

export interface PWEpgProgrammeItem {
  desc: string;
  start_date: string;
  title: string;
}
/**
 * 从 epg.pw 频道列表页 HTML 中提取频道 ID 与名称
 * 链接格式: href="/last/464609.html?lang=zh-hans"
 */
function parseChannelListFromHtml(html: string): EpgPwChannel[] {
  const regex = /href="\/last\/(\d+)\.html\?lang=zh-hans"[^>]*>([^<]+)<\/a>/g;
  const channels: EpgPwChannel[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const name = match[2].trim();
    if (name && !seen.has(id)) {
      seen.add(id);
      channels.push({ id, name });
    }
  }

  return channels;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function utcDate(timeStr: string): Date {
  // 1. 提取各个部分 (通过字符串截取)
  const year = +timeStr.substring(0, 4);
  const month = +timeStr.substring(4, 6) - 1; // 月份从 0 开始计数 (0 = 一月)
  const day = +timeStr.substring(6, 8);
  const hour = +timeStr.substring(8, 10);
  const minute = +timeStr.substring(10, 12);
  const second = +timeStr.substring(12, 14);

  // 2. 使用 Date.UTC 创建 UTC 时间对象
  // 注：末尾的 +0000 表示这是 UTC 时间
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return date;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

async function fetchChannelEpg(channelId: string, date: string): Promise<string | null> {
  const url = `https://epg.pw/api/epg.xml?lang=zh-hans&date=${date}&channel_id=${channelId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normalizeTagList<T>(node: unknown): T[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? (node as T[]) : [node as T];
}

function channelIdFromNode(node: EpgPwChannelNode): string | null {
  const id = node['@_id'];
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  return s || null;
}

/**
 * 解析单份 epg.pw API 返回的 XMLTV 片段
 */
function parsePwEpgXml(xml: string): {
  channels: EpgPwChannelNode[];
  programmes: EpgPwProgrammeNode[];
} {
  try {
    const parsed = epgPwParser.parse(xml) as { tv?: EpgPwTvNode };
    const tv = parsed?.tv;
    if (!tv) return { channels: [], programmes: [] };
    return {
      channels: normalizeTagList<EpgPwChannelNode>(tv.channel),
      programmes: normalizeTagList<EpgPwProgrammeNode>(tv.programme),
    };
  } catch {
    return { channels: [], programmes: [] };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 从 epg.pw 构建完整的 XMLTV EPG XML
 * @param dates - 日期列表（YYYYMMDD 格式），默认仅当天
 * @param batchSize - 并发请求数，默认 10
 * @param delayMs - 批次间延迟（毫秒），默认 300
 */
export async function buildEpgPwXml(batchSize = 10, delayMs = 300): Promise<string> {
  console.log('[EPG.PW] Fetching channel list from https://epg.pw/areas/cn.html ...');
  const res = await fetch('https://epg.pw/areas/cn.html?lang=zh-hans', {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`[EPG.PW] Failed to fetch channel list: ${res.status}`);
  const html = await res.text();

  const channels = parseChannelListFromHtml(html);
  console.log(`[EPG.PW] Extracted ${channels.length} channels`);

  if (channels.length === 0) {
    throw new Error('[EPG.PW] No channels found — page may require JavaScript rendering');
  }

  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(formatDate(date));
  }

  const seenChannelIds = new Set<string>();
  const channelNodes: EpgPwChannelNode[] = [];
  const programmeNodes: EpgPwProgrammeNode[] = [];
  // const epgDir = makeEpgDir();
  const basePath = path.join(__dirname, '../../m3u/epg/pw-7');

  for (const date of dates) {
    console.log(`[EPG.PW] Fetching EPG for date ${date} ...`);

    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map((ch) => fetchChannelEpg(ch.id, date)));

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;

        const { channels: chList, programmes: progList } = parsePwEpgXml(result.value);

        for (const ch of chList) {
          const chId = channelIdFromNode(ch);
          if (chId && !seenChannelIds.has(chId)) {
            seenChannelIds.add(chId);
            channelNodes.push(ch);
          }
        }
        const currentChannel = chList[0];
        const currentChannelName = (currentChannel['display-name'] as string)?.trim().toLowerCase();
        const json: EpgChannelJson = {
          channel: currentChannelName,
          epg_data: progList.map((prog) => ({
            start: formatTime(
              utcDate((prog['@_start'] as { '#text'?: string })['#text'] as string)
            ),
            end: formatTime(utcDate((prog['@_stop'] as { '#text'?: string })['#text'] as string)),
            title: prog.title as string,
          })),
        };
        const savePath = await mkdir(path.join(basePath, currentChannelName), { recursive: true });
        await writeFile(
          path.join(savePath as string, `${date}.json`),
          JSON.stringify(json, null, 2)
        );
        programmeNodes.push(...progList);
      }

      const progress = Math.min(i + batchSize, channels.length);
      console.log(`[EPG.PW]   [${date}] ${progress}/${channels.length}`);

      if (i + batchSize < channels.length) {
        await sleep(delayMs);
      }
    }
  }

  console.log(
    `[EPG.PW] Done — ${seenChannelIds.size} channels, ${programmeNodes.length} programmes`
  );

  const tvBody = epgPwBuilder.build({
    tv: {
      channel: channelNodes,
      programme: programmeNodes,
    },
  });
  const fullXml = `<?xml version="1.0" encoding="UTF-8"?>\n${tvBody}`;

  // TVBox EPG：与 docs/EPG.md 一致，写入 epg/epg_pw/{date}/{name}.json
  console.log('[EPG.PW] Writing TVBox EPG JSON files ...');
  writeEpgJsonFromXml('epg_pw', fullXml);

  return fullXml;
}
