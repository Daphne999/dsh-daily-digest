# dsh-daily-digest

> 每日巡检的"事实层"：只报**变化**，不念旧账。

给那些每天定时醒一次的 agent 回合一个靠谱的输入 —— 与其让模型每天重新"感觉一下有什么新闻"，不如给它两个确定的差分：

1. **插件市场新增**：对比 curated market 列表（8000+ 条），只列出上次之后新出现的插件
2. **教育行业 SRC 活动变化**：EDUSRC 众测、北京教育 SRC、常态化演习三个公开页面的新条目

第一次调用只建基线（不报新增），之后每次调用都是真差分。

## 装

```bash
dsh plugin --profile web add dsh-daily-digest
```

## 用

```
digest_scan { "scope": "all" }        // 或 "market" / "activities"
```

输出示例：

```
📦 市场新增 2 个：
   · dsh-better-sidebar ★4773 ↓233365 [ui]
   · dsh-meme ★488 ↓46045 [fun]
🎯 活动：没有新一期/新赛季
```

## 它不做的事

- **不抓新闻/热点**：那是模型自己用搜索能力的事，插件假装能抓只会给出二手幻觉
- **不做推送**：什么时候提醒、提醒谁，交给调用方（比如 dsh-proactive 的心跳回合）
- **不登录任何账号**：三个 SRC 来源都是公开页面

## 状态存在哪

默认 `~/.dsh/daily-digest/`（`market-state.json` / `activities-state.json`），可配置 `stateDir`。删掉即重置基线。

## 已知短板

`activities` 是**网页抓取**。平台改版会让它静默失效 —— 表现是长期"没有新变化"。建议每周至少人工核一次页面。

## License

MIT
