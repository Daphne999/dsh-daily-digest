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
import { scanMarket } from './market.js';
import { scanActivities } from './activities.js';

export const name = 'dsh-daily-digest';
export const inject = [];

const defaultStateDir = () => path.join(os.homedir(), '.dsh', 'daily-digest');

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
  const marketPort = Number(config.marketPort || 61310);
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
