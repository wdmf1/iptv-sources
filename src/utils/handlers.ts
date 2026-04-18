import 'dotenv/config';

export const get_custom_url = () =>
  process.env.CUSTOM_URL || process.env.CF_PAGES_URL || 'https://m3u.ibert.me';

export const get_github_raw_proxy_url = () => {
  const custom = process.env.CUSTOM_GITHUB_RAW_SOURCE_PROXY_URL;
  return custom ? custom : `https://ghfast.top`;
};

export const replace_github_raw_proxy_url = (s: string) => {
  const proxy_url = get_github_raw_proxy_url();
  return s.replace(
    /tvg-logo="https:\/\/raw\.githubusercontent\.com\//g,
    `tvg-logo="${proxy_url}/https://raw.githubusercontent.com/`
  );
};

export const is_filted_channels = (s: string) => {
  if (s.includes('ABN')) {
    return true;
  }

  if (s.includes('NTD')) {
    return true;
  }

  return false;
};
