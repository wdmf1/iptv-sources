import fs from 'node:fs';
import process from 'node:process';

const ENV = process.env;
let oldJson;
try {
  oldJson = JSON.parse(fs.readFileSync('schedule-config.json', 'utf-8'));
} catch {
  oldJson = {};
}

const liveResultDir =
  ENV.LIVE_RESULT_DIR || ENV.M3U_ROOT || oldJson.liveResultDir || '/app/m3u';

const newJson = {
  ...oldJson,
  liveResultDir,
};

fs.writeFileSync('schedule-config.json', JSON.stringify(newJson, undefined, 2));
fs.writeFileSync(
  '/etc/nginx/nginx.conf',
  `
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;

    server {
        listen       80;
        server_name  localhost;

        location / {
            root   ${liveResultDir};
            index  index.html index.htm;
        }

        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   /usr/share/nginx/html;
        }
    }
}
`
);
