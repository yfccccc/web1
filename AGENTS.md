# 中华整木网（web1）

Next.js 14（App Router）+ Prisma/PostgreSQL + TipTap。项目说明在 `README.md`，需要时按章节读，不要整份读入。全局约束见 `~/.codex/AGENTS.md`，这里只补本项目的范围。

## 只在这些地方找代码
- `app/`：前台、会员系统（`app/membership/`）、管理后台（`app/membership/admin/`）、API（`app/api/`）
- `components/`、`lib/`、`types/`
- `prisma/schema.prisma`（只读相关 model，不整份输出）
- `scripts/`、`tests/`：按 `package.json` 里的脚本名找对应文件

## 不要读、不要搜
- `node_modules/`、`.next/`、`dist/`、`artifacts/`、`reports/`、`.release-worktrees/`、`.codex-temp/`
- `custom/backups/`、`custom/tmp/`、`custom/reports/`、`custom/experiments/`
- `docs/`（除 `docs/legacy-site-fixes/`）、`data/legacy/`、`public/` 下的图片和上传文件
- `package-lock.json`、`*.tsbuildinfo`、`prisma/migrations/` 里的历史 SQL（只看最新一条）

## 工作方式
- 先说清楚改哪几个文件再动手，改动只限任务涉及的路由和组件。
- 验证：单个 API 或页面用 `curl` 看状态码和关键字段；需要全量时跑 `npm run build`，只看末尾和报错。
- 数据库：`db:push`、`db:migrate`、`db:seed` 和任何写库脚本，只在用户明确要求时执行；线上服务器默认只读。
