/**
 * market.js —— 插件市场新增检测。
 *
 * 思路：把注册表整表快照下来（只存 name/url/stars/downloads），下次对比找新增。
 * 注册表 8000+ 条，快照约 1.5MB，存本地 state 目录，一天一次完全可接受。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const getJson = (host, port, pathname, timeout = 60000) =>
  new Promise((resolve) => {
    const req = http.get({ host, port, path: pathname, headers: { host: `${host}:${port}`, accept: 'application/json' }, timeout }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });

const snapshotOf = (plugins) => {
  const out = {};
  for (const p of plugins) {
    const key = p.npm || p.url || p.name;
    out[key] = { name: p.name || '', stars: p.stars ?? 0, dl: p.downloads ?? 0, cat: Array.isArray(p.category) ? p.category.join(',') : p.category || '' };
  }
  return out;
};

/**
 * @param {{stateDir:string, host?:string, port?:number, topN?:number}} opts
 * @returns {Promise<{ok:boolean, total?:number, updated?:string, added?:Array, error?:string}>}
 */
export async function scanMarket(opts) {
  const { stateDir, host = '127.0.0.1', port = 61310, topN = 10 } = opts;
  const file = path.join(stateDir, 'market-state.json');
  const reg = await getJson(host, port, '/dsh-market/registry');
  if (!reg?.registry?.plugins) return { ok: false, error: '读不到市场注册表（宿主在重启或端口变了）' };

  const plugins = reg.registry.plugins;
  const current = snapshotOf(plugins);
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8')).plugins;
  } catch {
    prev = null;
  }

  let added = null;
  if (prev) {
    added = Object.entries(current)
      .filter(([k]) => !(k in prev))
      .map(([, v]) => v)
      .sort((a, b) => b.dl - a.dl || b.stars - a.stars)
      .slice(0, topN);
  }

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), total: plugins.length, plugins: current }), 'utf8');

  return { ok: true, total: plugins.length, updated: reg.registry.updated, firstRun: prev === null, added };
}
