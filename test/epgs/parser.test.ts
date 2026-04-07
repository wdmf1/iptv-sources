import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sanitizeChannelFileName, mergeByDateAndChannel, parseEpgXml } from '../../src/epgs/parser';

describe('sanitizeChannelFileName', () => {
  it('should replace invalid filename chars with underscore', () => {
    expect(sanitizeChannelFileName('CCTV/1')).toBe('CCTV_1');
    expect(sanitizeChannelFileName('a*b?c')).toBe('a_b_c');
    expect(sanitizeChannelFileName('ch:annel')).toBe('ch_annel');
  });

  it('should return "channel" when empty or trim to empty', () => {
    expect(sanitizeChannelFileName('')).toBe('channel');
    expect(sanitizeChannelFileName('   ')).toBe('channel');
  });

  it('should replace with underscore when only invalid chars', () => {
    expect(sanitizeChannelFileName('/*?:')).toBe('____');
  });

  it('should trim leading and trailing spaces', () => {
    expect(sanitizeChannelFileName('  CCTV1  ')).toBe('CCTV1');
  });
});

describe('mergeByDateAndChannel', () => {
  it('should merge by date and channel and sort by time slot', () => {
    const items = [
      { date: '2024-03-14', channel: 'CCTV-1', item: { start: '20:00', end: '21:00', title: 'A' } },
      { date: '2024-03-14', channel: 'CCTV-1', item: { start: '18:00', end: '19:00', title: 'B' } },
      { date: '2024-03-14', channel: 'CCTV-2', item: { start: '19:00', end: '20:00', title: 'C' } },
    ];
    const result = mergeByDateAndChannel(items);
    const key1 = '2024-03-14\tCCTV-1';
    expect(result.has(key1)).toBe(true);
    const epg = result.get(key1)!.epg_data;
    expect(epg.map((e) => e.title)).toEqual(['B', 'A']);
    expect(epg[0].start).toBe('18:00');
    expect(epg[1].start).toBe('20:00');
  });
});

describe('parseEpgXml', () => {
  it('should return empty array when empty or no tv', () => {
    expect(parseEpgXml('')).toEqual([]);
    expect(parseEpgXml('<root></root>')).toEqual([]);
  });

  it('should parse XMLTV format and return date, channel, item', () => {
    const xml = `<?xml version="1.0"?>
<tv>
  <channel id="1" name="CCTV-1">
    <display-name>CCTV-1</display-name>
  </channel>
  <programme start="20240314080000 +0800" stop="20240314090000 +0800" channel="1">
    <title>新闻</title>
  </programme>
</tv>`;
    const out = parseEpgXml(xml);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2024-03-14');
    expect(out[0].channel).toBe('CCTV-1');
    expect(out[0].item.start).toBe('08:00');
    expect(out[0].item.end).toBe('09:00');
    expect(out[0].item.title).toBe('新闻');

    const byDateChannel = mergeByDateAndChannel(out);
    expect(byDateChannel.has('2024-03-14\tCCTV-1')).toBe(true);
    const epg = byDateChannel.get('2024-03-14\tCCTV-1')!.epg_data;
    expect(epg.map((e) => e.title)).toEqual(['新闻']);
    expect(epg[0].start).toBe('08:00');
    expect(epg[0].end).toBe('09:00');
  });
  it('should parse XMLTV format and return date, channel, item from xml file', () => {
    const xml = fs.readFileSync(path.join(__dirname, 'e.xml'), 'utf-8');
    const out = parseEpgXml(xml);
    expect(out.length).toBeGreaterThan(0);
  });
});
