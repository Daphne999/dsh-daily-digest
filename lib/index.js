/**
 * dsh-daily-digest —— 给「每日巡检」这类心跳回合一个可复述的清单。
 *
 * 提供工具 digest_scan：
 *   scope = "market"    只看插件市场新增
 *   scope = "activities" 只看教育行业 SRC / 众测活动变化
 *   scope = "all"（默认）两者都看
 *
 * 设计原则：**只报告变化，不重复念旧账**。第一次运行只建基线、不报新增。
 * 资讯（新闻、热点）不在这里做 —— 那是模型自己用搜索能力的事，插件不该假装能抓。
 */
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { scanMarket } from './market.js';
import { scanActivities } from './activities.js';

export const name = 'dsh-daily-digest';
export const inject = ['tools', 'webServer'];

const defaultStateDir = () => path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'daily-digest');

export async function apply(ctx, config = {}) {
  const log = (line) => {
    try {
      ctx.logger?.info?.(`[dsh-daily-digest] ${line}`);
    } catch {}
    try {
      console.log(`[dsh-daily-digest] ${line}`);
    } catch {}
  };

  const stateDir = config.stateDir ? path.resolve(config.stateDir) : defaultStateDir();
  // 宿主端口不固定（每次启动可能换），优先问 webServer 要真实端口
  const marketPort = (() => {
    if (config.marketPort) return Number(config.marketPort);
    try {
      const ws = ctx.get('webServer');
      const p = ws?.port ?? ws?.server?.address?.()?.port;
      if (p) return Number(p);
    } catch {}
    const fromEnv = Number(process.env.DSH_PORT || process.env.DSH_WEB_PORT || 0);
    if (fromEnv) return fromEnv;
    return discoverPort() || 61310;
  })();
  const topN = Number(config.topN || 8);

  let tools;
  try {
    tools = ctx.get('tools');
  } catch {
    tools = undefined;
  }

  if (!tools?.register) {
    log('⚠️ tools 服务不可用，digest_scan 未注册');
    return;
  }

  tools.register({
    name: 'digest_scan',
    description:
      'Produce a daily digest of what actually CHANGED: newly published plugins in the curated DSH market, and new '
      + 'entries on the Chinese education SRC calendars (EDUSRC crowdsourced-testing rounds, Beijing education SRC '
      + 'seasons, the standing vulnerability-hunting exercise). Only reports deltas; the first call establishes a '
      + 'baseline and reports nothing. News/hot topics are NOT covered here — use web search for that.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'market', 'activities'],
          description: 'Which part to scan. Defaults to "all".',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          report: { type: 'string' },
        },
        required: ['ok', 'report'],
        additionalProperties: true,
      },
      render: (_args, value) => [{ type: 'text', text: value?.report ?? '(无内容)' }],
    },
    async execute(args) {
      const scope = ['market', 'activities', 'all'].includes(args?.scope) ? args.scope : 'all';
      const lines = [];
      const result = { ok: true };

      if (scope === 'all' || scope === 'market') {
        const m = await scanMarket({ stateDir, port: marketPort, topN });
        result.market = m;
        if (!m.ok) {
          lines.push(`📦 市场：${m.error}`);
        } else if (m.firstRun) {
          lines.push(`📦 市场：已建基线（${m.total} 个插件），下次开始报新增`);
        } else if (!m.added || m.added.length === 0) {
          lines.push(`📦 市场：没有新插件（共 ${m.total}）`);
        } else {
          lines.push(`📦 市场新增 ${m.added.length} 个：`);
          for (const p of m.added) lines.push(`   · ${p.name} ★${p.stars} ↓${p.dl}${p.cat ? ` [${p.cat}]` : ''}`);
        }
      }

      if (scope === 'all' || scope === 'activities') {
        const a = await scanActivities({ stateDir });
        result.activities = a;
        if (a.firstRun) {
          lines.push('🎯 活动：已建基线，下次开始报变化');
        } else if (a.changes.length === 0) {
          lines.push('🎯 活动：没有新一期/新赛季');
        } else {
          lines.push(`🎯 活动变化 ${a.changes.length} 条：`);
          for (const c of a.changes) lines.push(`   · 【${c.source}】${c.title}`);
        }
        if (a.failures.length) lines.push(`   ⚠️ 抓取失败：${a.failures.join('、')}`);
      }

      const report = lines.join('\n') || '(没有内容)';
      log(`digest(${scope}) → ${lines.length} 行`);
      return { ok: true, scope, report };
    },
  });

  log(`✅ digest_scan 已注册（state: ${stateDir}）`);
}

/**
 * 宿主端口每次启动都可能变（见过 19387 / 49749 / 61310）。问不到 webServer 时，
 * 按「进程名 + 实际监听端口」找一遍，不要写死某个端口。
 */
function discoverPort() {
  try {
    const netOut = execSync('netstat -ano -p tcp', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true }).toString('latin1');
    const listOut = execSync('tasklist /FO CSV /NH', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true }).toString('latin1');
    const pids = new Set();
    for (const line of listOut.split(/\r?\n/)) {
      const m = /^"([^"]+)","(\d+)"/.exec(line.trim());
      if (m && /deepseek|dsh/i.test(m[1])) pids.add(m[2]);
    }
    for (const line of netOut.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;
      const local = cols[1] || '';
      const m2 = /^127\.0\.0\.1:(\d+)$/.exec(local);
      if (!m2) continue;
      if (!pids.has(cols[4])) continue;
      return Number(m2[1]);
    }
  } catch {}
  return 0;
}
