# WEB1 本地清理与 Node 20 基线冻结记录

- 验证日期：2026-08-29（Asia/Shanghai）
- 项目路径：`T:\2026新网站资料\web1`
- 当前分支：`security/tombstone-hardening`
- 当前 HEAD：`68841586c4d7efed209d29d7f5ddf169d465c29c`
- 冻结结论：`WEB1_LOCAL_CLEANUP_NODE20_FREEZE_READY=YES`

## 1. Git 与 worktree 基线

- 验证前状态：`DIRTY`，`git status --short` 共 79 项（55 个已跟踪修改、24 个未跟踪入口）。
- 验证后状态：`DIRTY`，同为 79 项（55 个已跟踪修改、24 个未跟踪入口）。
- 验证前后 `git diff --stat` 均为：54 files changed, 910 insertions(+), 589 deletions(-)。
- 上述业务、配置、README 和 `.gitignore` 改动在本轮开始前已经存在，本轮未覆盖、恢复或重写。
- 当前主 worktree：`security/tombstone-hardening`，HEAD `6884158`。
- 现有附加 worktree 保持不变：
  - `fix/dictionary-review-security`，HEAD `b1a181e`
  - `dictionary-week2-content-20260815`，HEAD `6884158`
  - `feature/difan-monthly-news-summary`，HEAD `05556d4`

未执行 `reset`、`checkout`、`restore`、`git clean`、commit 或 push。

## 2. Node 版本声明与隔离环境

- 切换前系统 Node：`v24.14.0`
- 切换前系统 npm：`11.9.0`
- `package.json`：`engines.node = ">=20 <21"`，`engineStrict = true`
- `.nvmrc`：`20`
- README 已记录验证组合：Node.js `20.20.1`、npm `10.8.2`
- `.node-version`、`.tool-versions`、`volta.json`：不存在
- 声明冲突：无
- 本机 nvm-windows：未安装
- 安全切换方式：使用官方 Windows x64 便携包，验证 SHA-256 后解压到用户本地应用数据目录，仅在验证命令进程内前置 PATH
- 隔离运行时：`C:\Users\程翼飞的电脑\AppData\Local\CodexRuntimes\web1-node20\node-v20.20.1-win-x64`
- 实际验证 Node：`v20.20.1`
- 实际验证 npm：`10.8.2`
- 验证结束后默认系统 Node 仍为：`v24.14.0`
- `NODE20_SAFE_SWITCH_AVAILABLE=YES`

没有卸载或覆盖 Node 24，没有修改系统/用户全局 PATH，也没有修改全局 npm 包。

## 3. `.gitignore` 核验

- 项目实际文件：`T:\2026新网站资料\web1\.gitignore`
- 外部候选：`T:\2026新网站资料\web1.gitignore`（不存在）
- 本轮动作：只读检查，未创建、移动、覆盖或合并
- 已确认保留项目原有规则，并能够排除 `.next`、`.codex-temp/`、`*.log`、`*.tsbuildinfo`、`node_modules` 和 `.release-worktrees/`

## 4. 依赖一致性

- `package-lock.json`：存在，lockfileVersion 3
- `npm ci`：`PASS`
- 安装结果：503 packages added，504 packages audited
- `package.json` 本轮前后 SHA-256：`2D9A8AA17427DB1B0CD8731CC7A7D59796D357B88B43485B2C5AA0FE1645CE3B`
- `package-lock.json` 本轮前后 SHA-256：`A14862CAF8434E9467E869030892E675AC52A05D0BA151B29DA0A326EBAF551D`
- `PACKAGE_JSON_CHANGED_BY_THIS_TASK=NO`
- `PACKAGE_LOCK_CHANGED_BY_THIS_TASK=NO`
- npm 审计提示：14 项（1 moderate、13 high）；按本轮限制未执行 `npm update`、`npm audit fix` 或依赖升级
- `PREEXISTING_DEPENDENCY_AUDIT_FINDINGS=1_MODERATE_13_HIGH`

## 5. Node 20 验证结果

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| Production build | `npm run build` | `PASS`，99/99 静态页面生成完成 |
| TypeScript | `npx tsc --noEmit --incremental false --pretty false` | `PASS` |
| Lint | `npm run lint` | `PASS_WITH_EXISTING_WARNING` |
| Self test 1 | `npm run selftest:keyword-filter` | `PASS` |
| Self test 2 | `npm run selftest:news-keywords` | `PASS` |
| Self test 3 | `npm run selftest:pending-brand-threshold` | `PASS` |
| Self test 4 | `npm run selftest:security-guards` | `PASS` |

Lint 原有 warning 数量：1。位置为 `app/membership/admin/enterprises/[id]/page.tsx:284` 的 `@next/next/no-img-element`；本轮未修改页面消除该 warning。

构建另有 Browserslist 数据过期提示和 Edge Runtime 静态生成提示，均未导致构建失败；按限制未更新依赖或配置。
`BROWSERSLIST_OUTDATED_DATA=PREEXISTING_MAINTENANCE_ITEM`

## 6. 分页完整测试

- `PAGINATION_FULL_TEST=DEFERRED_ENVIRONMENT_DEPENDENCY`
- `PAGINATION_CODE_FAILURE=NO_EVIDENCE`
- `CLEANUP_REGRESSION=NO_EVIDENCE`

检查 `scripts/selftest-news-pagination.mjs` 后确认：脚本没有安全 mock/隔离模式，会读取 `.env`，依赖 `BAIDU_PUSH_TOKEN` 状态、本地测试服务器和数据库，并通过 Prisma 批量创建/删除文章及操作日志。为避免真实百度推送和真实数据库写入，本轮未执行该完整测试，也未修改 token、环境变量或业务逻辑。

## 7. 变更隔离复核

本轮开始与结束时，下列关键文件 SHA-256 均一致：

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `next.config.mjs`
- `prisma/schema.prisma`
- `.env`
- `.env.example`
- `.gitignore`
- `README.md`

本轮验证生成的 `.next` 和 `tsconfig.tsbuildinfo` 已按其开始时状态移除；未使用 `git clean`。`node_modules` 仅由 `npm ci` 按 lockfile 重建。

```text
BUSINESS_CODE_CHANGED=NO
DATABASE_CHANGED=NO
ENV_CHANGED=NO
UPLOADS_CHANGED=NO
WORKTREE_CHANGED=NO
PRODUCTION_CONNECTED=NO
DEPLOY_EXECUTED=NO
PUSH_EXECUTED=NO
COMMIT_EXECUTED=NO
```

## 8. 最终冻结结论

```text
BUILD=PASS
TYPESCRIPT=PASS
LINT=PASS_WITH_EXISTING_WARNING
EXISTING_LINT_WARNING_COUNT=1
SELF_TEST_PASS_COUNT=4
SELF_TEST_TOTAL_COUNT=4
BUSINESS_CODE_CHANGED=NO
WEB1_LOCAL_CLEANUP_NODE20_FREEZE_READY=YES
```

本记录仅用于本地审计；专项 freeze commit 状态以 Git 历史为准，不代表已经推送或部署。
