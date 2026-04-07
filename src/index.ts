import { hrtime } from 'process';

import { updateChannelsJson } from './channels';
import {
  cleanFiles,
  getContent,
  mergeSources,
  mergeTxts,
  writeEpgJsonByDate,
  writeEpgXML,
  writeM3u,
  writeM3uToTxt,
  writeSources,
} from './file';
import { updateChannelList, updateReadme } from './readme';
import { sources } from './sources';
import { updateByRollback, updateEPGByRollback } from './rollback';
import { epgs_sources } from './epgs';
import { buildEpgPwXml } from './epgs/epg_pw';
import { writeTvBoxJson as writeTvBoxLiveJson } from './tvbox';
import { Collector } from './utils';
import { runCustomTask } from './task/custom';

cleanFiles();

// 执行脚本
(async () => {
  try {
    const sourcesResult = await Promise.allSettled(
      sources.map(async (sr) => {
        console.log(`[TASK] Fetch ${sr.name}`);
        try {
          const [ok, text, now] = await getContent(sr);
          if (ok && !!text) {
            console.log(
              `Fetch m3u from ${sr.name} finished, cost ${
                (parseInt(hrtime.bigint().toString()) - parseInt(now.toString())) / 10e6
              } ms`
            );

            const sourcesCollector = Collector(undefined, (v) => !/^([a-z]+):\/\//.test(v));

            const [m3u, count] = sr.filter(
              text as string,
              ['o_all', 'all'].includes(sr.f_name) ? 'skip' : 'normal',
              sourcesCollector.collect
            );

            writeM3u(sr.f_name, m3u);
            writeM3uToTxt(sr.name, sr.f_name, m3u);
            writeSources(sr.name, sr.f_name, sourcesCollector.result());
            writeTvBoxLiveJson(sr.f_name, [{ name: sr.name, f_name: sr.f_name }], sr.name);
            updateChannelList(sr.name, sr.f_name, m3u);
            return ['normal', count];
          }
          // rollback
          const res = await updateByRollback(sr, sr.filter);
          if (res) {
            const [m3u, count] = res;
            writeM3u(sr.f_name, m3u);
            writeM3uToTxt(sr.name, sr.f_name, m3u);
            writeTvBoxLiveJson(sr.f_name, [{ name: sr.name, f_name: sr.f_name }], sr.name);
            updateChannelList(sr.name, sr.f_name, m3u, true);
            return ['rollback', count];
          }
          // rollback failed
          console.log(`[WARNING] m3u ${sr.name} get failed!`);
          return ['rollback', void 0];
        } catch (e) {
          console.log(e);
          const res = await updateByRollback(sr, sr.filter);
          if (res) {
            const [m3u, count] = res;
            writeM3u(sr.f_name, m3u);
            writeM3uToTxt(sr.name, sr.f_name, m3u);
            writeTvBoxLiveJson(sr.f_name, [{ name: sr.name, f_name: sr.f_name }], sr.name);
            updateChannelList(sr.name, sr.f_name, m3u, true);
            return ['rollback', count];
          }
          // rollback failed
          console.log(`[WARNING] m3u ${sr.name} get failed!`);
          return ['rollback', void 0];
        }
      })
    );

    const epgs = await Promise.allSettled(
      epgs_sources.map(async (epg_sr) => {
        console.log(`[TASK] Fetch EPG ${epg_sr.name}`);
        try {
          const [ok, text, now] = await getContent(epg_sr);

          if (ok && !!text) {
            console.log(
              `Fetch EPG from ${epg_sr.name} finished, cost ${
                (parseInt(hrtime.bigint().toString()) - parseInt(now.toString())) / 10e6
              } ms`
            );
            writeEpgXML(epg_sr.f_name, text as string);
            return ['normal'];
          }
          // rollback
          const epgText = await updateEPGByRollback(epg_sr);
          if (epgText) {
            writeEpgXML(epg_sr.f_name, epgText as string);
            return ['rollback'];
          }
          // rollback failed
          console.log(`[WARNING] EPG ${epg_sr.name} get failed!`);
          return [void 0];
        } catch (_e) {
          console.warn('Error fetching EPG', _e, epg_sr);
          const epgText = await updateEPGByRollback(epg_sr);
          if (epgText) {
            writeEpgXML(epg_sr.f_name, epgText as string);
            return ['rollback'];
          }
          // rollback failed
          console.log(`[WARNING] EPG ${epg_sr.name} get failed!`);
          return [void 0];
        }
      })
    );

    // epg.pw EPG: 从频道列表页抓取所有频道并逐一拉取 EPG，合并为完整 XML
    try {
      console.log('[TASK] Build EPG from epg.pw ...');
      const epgPwXml = await buildEpgPwXml();
      writeEpgXML('epg_pw', epgPwXml);
      console.log('[TASK] EPG from epg.pw written successfully');
    } catch (e) {
      console.warn('[WARNING] EPG from epg.pw failed:', e);
    }

    console.log(`[TASK] Write important files`);
    type SourceSettled = PromiseSettledResult<(string | number)[] | (string | undefined)[]>;
    type EpgSettled = PromiseSettledResult<string[] | undefined[]>;
    const sources_res = sourcesResult.map((r: SourceSettled) =>
      r.status === 'fulfilled' ? r.value : undefined
    ) as Array<[string, number | undefined]>;
    const epgs_res = epgs.map((r: EpgSettled) =>
      r.status === 'fulfilled' ? r.value : undefined
    ) as Array<[string | undefined]>;
    mergeTxts();
    mergeSources();
    writeEpgJsonByDate();
    writeTvBoxLiveJson('tvbox', sources, 'Channels');
    updateChannelsJson(sources, sources_res, epgs_sources);
    updateReadme(sources, sources_res, epgs_sources, epgs_res);

    console.log(`[TASK] Make custom sources`);
    runCustomTask();
  } catch (err) {
    console.error(err);
  }
})();
