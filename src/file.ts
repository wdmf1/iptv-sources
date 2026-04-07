import fs from 'fs';
import path from 'path';
import { hrtime } from 'process';

import { with_github_raw_url_proxy } from './sources';
import { m3u2txt } from './utils';
import type { ISource } from './sources';
import type { TEPGSource } from './epgs/utils';

import { mergeByDateAndChannel, parseEpgXml, sanitizeChannelFileName } from './epgs/parser';

export const getContent = async (src: ISource | TEPGSource) => {
  const now = hrtime.bigint();
  const url = /^https:\/\/raw.githubusercontent.com\//.test(src.url)
    ? with_github_raw_url_proxy(src.url)
    : src.url;

  const res = await fetch(url);
  return [res.ok, await res.text(), now];
};

export const writeM3u = (name: string, m3u: string) => {
  if (!fs.existsSync(path.join(path.resolve(), 'm3u'))) {
    fs.mkdirSync(path.join(path.resolve(), 'm3u'));
  }

  fs.writeFileSync(path.join(path.resolve(), 'm3u', `${name}.m3u`), m3u);
};

export const writeSources = (name: string, f_name: string, sources: Map<string, string[]>) => {
  const srcs: Record<string, string[]> = {};
  for (const [k, v] of sources) {
    srcs[k] = v;
  }

  if (!fs.existsSync(path.resolve('m3u', 'sources'))) {
    fs.mkdirSync(path.resolve('m3u', 'sources'));
  }

  fs.writeFileSync(
    path.resolve('m3u', 'sources', `${f_name}.json`),
    JSON.stringify({
      name,
      sources: srcs,
    })
  );
};

export const writeM3uToTxt = (name: string, f_name: string, m3u: string) => {
  const m3uArray = m3u.split('\n');
  const txt = m3u2txt(m3uArray);

  if (!fs.existsSync(path.join(path.resolve(), 'm3u', 'txt'))) {
    fs.mkdirSync(path.join(path.resolve(), 'm3u', 'txt'));
  }

  fs.writeFileSync(path.join(path.resolve(), 'm3u', 'txt', `${f_name}.txt`), txt);
};

export const mergeTxts = () => {
  const txts_p = path.resolve('m3u', 'txt');

  const files = fs.readdirSync(txts_p);

  const txts = files.map((d) => fs.readFileSync(path.join(txts_p, d).toString())).join('\n');

  fs.writeFileSync(path.join(txts_p, 'merged.txt'), txts);
};

export const mergeSources = () => {
  const sources_p = path.resolve('m3u', 'sources');
  type Source = Record<string, string[]>; // 频道/分类名 -> URL 数组
  const files = fs.readdirSync(sources_p);

  const res = {
    name: 'Sources',
    sources: {} as Source,
  };

  files.forEach((f) => {
    const so = JSON.parse(fs.readFileSync(path.join(sources_p, f), 'utf-8')).sources;

    Object.keys(so).forEach((k) => {
      if (!res.sources[k]) {
        res.sources[k] = so[k];
      } else {
        res.sources[k] = [...new Set([...res.sources[k], ...so[k]])];
      }
    });
  });

  fs.writeFileSync(path.join(sources_p, 'sources.json'), JSON.stringify(res));
};

export const writeEpgXML = (f_name: string, xml: string) => {
  if (!fs.existsSync(path.join(path.resolve(), 'm3u', 'epg'))) {
    fs.mkdirSync(path.join(path.resolve(), 'm3u', 'epg'));
  }

  fs.writeFileSync(path.resolve('m3u', 'epg', `${f_name}.xml`), xml);
};
export function makeEpgDir() {
  const epgDir = path.resolve('m3u', 'epg');
  if (!fs.existsSync(epgDir)) {
    fs.mkdirSync(epgDir, { recursive: true });
  }
  return epgDir;
}
/**
 * 将单份 XMLTV XML 解析为 TVBox 所需的按日期、频道 JSON 文件
 * 输出路径: m3u/epg/{provider}/{YYYY-MM-DD}/{频道名}.json
 */
export const writeEpgJsonFromXml = (provider: string, xml: string) => {
  const epgDir = makeEpgDir();

  const allItems = parseEpgXml(xml);
  const byDateChannel = mergeByDateAndChannel(allItems);
  console.log(
    `[TASK] Merge EPG JSON (${provider}) by date and channel, total ${byDateChannel.size} items`
  );
  for (const [key, data] of byDateChannel) {
    const [date, channel] = key.split('\t');
    const dateDir = path.join(epgDir, provider, date);
    if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
    const fileName = `${sanitizeChannelFileName(channel)}.json`;
    fs.writeFileSync(path.join(dateDir, fileName), JSON.stringify(data, null, 2));
    console.log(`[TASK] Write EPG JSON for ${provider} ${date} ${channel}`);
  }
};

/**
 * 解析 m3u/epg 下所有 .xml，按日期(YYYYmmdd)、频道生成 JSON 到 epg/{provider}/{date}/channelname.json
 * （epg_pw 在构建时由 epg_pw 模块单独写入 JSON，此处跳过避免重复解析大文件）
 */
export const writeEpgJsonByDate = () => {
  const epgDir = path.resolve('m3u', 'epg');
  if (!fs.existsSync(epgDir)) return;

  const files = fs.readdirSync(epgDir);
  const xmlFiles = files.filter(
    (f) => path.extname(f) === '.xml' && fs.statSync(path.join(epgDir, f)).isFile()
  );

  for (const f of xmlFiles) {
    if (f === 'epg_pw.xml') continue;
    const provider = f.split('.')[0];
    const xml = fs.readFileSync(path.join(epgDir, f), 'utf-8');
    writeEpgJsonFromXml(provider, xml);
  }
};

const cleanDir = (p: string) => {
  if (fs.existsSync(p)) {
    fs.readdirSync(p).forEach((file) => {
      const isDir = fs.statSync(path.join(p, file)).isDirectory();
      if (isDir) {
        cleanDir(path.join(p, file));
      } else {
        fs.unlinkSync(path.join(p, file));
      }
    });
  }
};

export const cleanFiles = () => cleanDir(path.join(path.resolve(), 'm3u'));
