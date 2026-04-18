import { promises as fsPromises } from 'fs';
import path from 'path';

import { parseTvboxJson, type TVBoxConfig } from '@whyun/tv-tools';
import { get_custom_url } from '../utils';
const TVBOX_JSON_URL = 'http://tvbox.xn--4kq62z5rby2qupq9ub.top/';
async function fetchBodyTextWithOkhttp(url: string): Promise<{
  bodyText: string;
  ok: boolean;
}> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'okhttp',
    },
    signal: AbortSignal.timeout(15000),
  });

  return {
    bodyText: await response.text(),
    ok: response.ok,
  };
}

interface ITvBoxLiveSrc {
  name: string;
  f_name: string;
}

const gen_tvbox_json = async (srcs: ITvBoxLiveSrc[]): Promise<TVBoxConfig> => {
  if (srcs.length < 1) {
    throw new Error('No sources for tvbox found!');
  }
  const response = await fetchBodyTextWithOkhttp(TVBOX_JSON_URL);
  const parsedConfig = parseTvboxJson(response.bodyText);
  const j = {
    ...parsedConfig,
    lives: [],
  } as TVBoxConfig;

  j.lives = srcs.map(({ name, f_name }) => ({
    name,
    type: 0,
    url: `${get_custom_url()}/txt/${f_name}.txt`,
    epg: 'https://iptv-sources2.pages.dev/epg/pw-7/{date}/{name}.json',
    logo: 'https://tv-res.pages.dev/logo/{name}.png',
  }));

  return j;
};

export const writeTvBoxJson = async (f_name: string, srcs: ITvBoxLiveSrc[]): Promise<void> => {
  const tvbox_p = path.resolve('m3u', 'tvbox');

  await fsPromises.mkdir(tvbox_p, { recursive: true });
  await fsPromises.writeFile(
    path.join(tvbox_p, `${f_name}.json`),
    JSON.stringify(await gen_tvbox_json(srcs))
  );
};
