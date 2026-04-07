# iptv-sources

自动更新的 IPTV 直播源，支持 M3U、TXT 和 TVBox 格式，并提供基于静态文件的 EPG（电子节目预告）服务。

**本项目仓库**：[yunnysunny/iptv-sources](https://github.com/yunnysunny/iptv-sources) 基于 [HerbertHe/iptv-sources](https://github.com/HerbertHe/iptv-sources) 开发。

## 直播源

| 来源 | 说明 |
|------|------|
| [epg.pw](https://epg.pw/test_channel_page.html) | 全球频道 |
| [youhun](https://github.com/HerbertHe/youhun) | 国内频道 |
| [hotel_tvn](https://github.com/HerbertHe/hotel_tvn) | 酒店源 |

## EPG 数据源

| 来源 | 说明 |
|------|------|
| [epg.51zmt.top:8000](http://epg.51zmt.top:8000/) | 央视、卫视及地方频道 |
| [epg.pw](https://epg.pw/) | 抓取中国地区频道并合并为 [epg_pw.xml](/epg/epg_pw.xml)，并生成 TVBox JSON：`epg/epg_pw/{date}/{name}.json` |

## Matrix

You can also use the services provided by Mirror Sites Matrix! See <https://m3u.ibert.me> for more.

<!-- matrix_here -->
## Channel

| channel | url | list | count | isRollback |
| ------- | --- | ---- | ----- | ---------- |
<!-- channels_here -->

## EPG

| epg | url | isRollback |
| --- | --- | ---------- |
<!-- epgs_here -->

## TVBox EPG 使用

本站将 EPG 数据按日期和频道拆分为静态 JSON 文件，可直接在 TVBox 中使用。

EPG 链接格式（`{date}`、`{name}` 由 TVBox 自动替换）：

- 51zmt：`{site_url}/epg/51zmt/{date}/{name}.json`
- epg.pw 聚合：`{site_url}/epg/epg_pw/{date}/{name}.json`

在 TVBox 直播源 JSON 的 `epg` 字段中填入上述任一完整 URL（将 `{site_url}` 换成本站域名）即可查看节目预告。

## LICENSE

GPL-3.0 &copy; yunnysunny

本项目基于 GPL-3.0 协议开源。
