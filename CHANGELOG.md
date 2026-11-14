# Changelog

## 0.1.1 — 2026-11-08

- 声明 `inject = ['tools']`，确保 tools 服务就绪后再注册工具（修复隔离 profile 启动时报「tools 服务不可用」）。
- 状态目录优先使用 `DSH_HOME`。

## 0.1.0 — 2026-11-04

首个版本。

- 3290b90 chore: add repository metadata
- 187c812 fix(digest): filter login/help chrome out of SRC page titles
- 3138377 feat: initial release

* 0.1.2 2026-11-14：修端口发现。inject 补上 webServer；问不到端口时按进程名+监听端口动态找，不再回落到写死的 61310（市场读不到就是走的这条死路）。
