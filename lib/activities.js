/**
 * activities.js —— 教育行业 SRC / 众测活动变化检测。
 *
 * 三个来源都是公开页面，只做「标题列表对比」，不发请求到任何需要登录的地方：
 *   - EDUSRC 众测         https://src.sjtu.edu.cn/zc/
 *   - 北京教育行业 SRC     https://bjedusrc.buu.edu.cn/index/notice/index.html
 *   - 常态化演习           https://vulsrc.sjtu.edu.cn/home/
 *
 * 页面改版会失效——失效表现为「抓取失败」或长期「没有新变化」，调用方应当保留人工核对的意识。
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

export const SOURCES = [
  { id: 'edusrc-zc', label: 'EDUSRC 众测', url: 'https://src.sjtu.edu.cn/zc/' },
  { id: 'bj-edusrc', label: '北京教育SRC 公告', url: 'https://bjedusrc.buu.edu.cn/index/notice/index.html' },
  { id: 'vulsrc', label: '常态化演习', url: 'https://vulsrc.sjtu.edu.cn/home/' },
];

const get = (url, redirect = 4) =>
  new Promise((resolve) => {
    const req = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-encoding': 'identity' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirect > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).href, redirect - 1));
        return;
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ code: res.statusCode, body: d }));
    });
    req.on('error', () => resolve({ code: 0, body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ code: 0, body: '' });
    });
  });

const NAV = /^(首页|登录|注册|公告|关于|排行榜|礼品中心|众测|漏洞列表|招聘|提交漏洞|积分商城|贡献榜)$/;

function titles(html) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,140}?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 4 || NAV.test(text)) continue;
    out.push(text);
  }
  return [...new Set(out)];
}

/**
 * @param {{stateDir:string}} opts
 */
export async function scanActivities(opts) {
  const { stateDir } = opts;
  const file = path.join(stateDir, 'activities-state.json');
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8')).sources;
  } catch {
    prev = null;
  }

  const next = {};
  const changes = [];
  const failures = [];

  for (const src of SOURCES) {
    const res = await get(src.url);
    if (res.code !== 200) {
      failures.push(`${src.label}(HTTP ${res.code})`);
      next[src.id] = (prev && prev[src.id]) || { titles: [] };
      continue;
    }
    const list = titles(res.body);
    next[src.id] = { titles: list };
    const old = new Set((prev?.[src.id]?.titles) || []);
    if (prev) {
      for (const t of list) {
        if (!old.has(t)) changes.push({ source: src.label, title: t });
      }
    }
  }

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), sources: next }, 'utf8'), 'utf8');

  return { ok: failures.length < SOURCES.length, firstRun: prev === null, changes, failures };
}
