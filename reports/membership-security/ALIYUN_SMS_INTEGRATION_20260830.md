# 阿里云短信集成验证报告

日期：2026-08-30

状态：`MEMBERSHIP_SECURITY_ALIYUN_SMS_INTEGRATION_READY_FOR_SECRET_CONFIGURATION`

本报告不包含 AccessKey、完整手机号、真实 OTP、RequestId、身份资料或 SDK 异常堆栈。本轮没有真实短信发送、生产写入、数据库迁移、备份、部署、服务重启、HTTP smoke、Git 暂存或提交。

## 集成结果

- 官方 SDK：`@alicloud/dysmsapi20170525@4.6.0`
- 官方凭据链：`@alicloud/credentials@2.4.7`
- SDK 使用的 OpenAPI Core：`@alicloud/openapi-core@1.0.8`
- Endpoint：`dysmsapi.aliyuncs.com`
- Provider：`aliyun`
- 签名：`杭州创始记科技发展`
- 模板：`SMS_512265107`
- 模板变量：仅 `code`，值来自每次随机生成的 6 位 OTP
- 凭据变量：仅服务端标准变量 `ALIBABA_CLOUD_ACCESS_KEY_ID` 与 `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- RAM 最小权限前提沿用用户给定配置：`cnzhengmu-sms` / `CnzhengmuSmsSendOnly` / `dysms:SendSms`；本轮未连接阿里云控制台重新核验，不扩大权限。

`lib/sms-verification.ts` 保留原有 OTP 生成、bcrypt hash、5 分钟 TTL、60 秒重发限制、每日限制、IP 限流、错误次数与消费逻辑，只替换发送 Provider。发送顺序为：先写入 `usedAt != null` 的不可用记录，再调用阿里云；只有业务响应 `Code=OK` 时才将该记录激活。发送失败时记录保持不可用。

## 安全边界

- 未配置 Provider、任一凭据、签名或模板时，发送在数据库访问前以 `BLOCKED_BY_SMS_PROVIDER_CONFIGURATION` 安全失败。
- 复用 `lib/member-phone.ts` 的中国大陆手机号服务端校验，没有第二套手机号规则。
- 不接受单纯 HTTP 200；仅严格接受阿里云业务码 `OK`。
- 服务端失败日志只保留固定事件码、经过字符白名单处理的业务错误码、掩码手机号和时间。
- API 响应及日志不暴露 AccessKey、完整手机号、OTP、RequestId、内部错误或 SDK stack。
- 没有万能验证码、custom HTTP fallback 或客户端可修改的签名/模板。
- 真实发送脚本需要一次性确认变量和运行时静默输入的测试手机号；没有确认时在联网前退出。

## Node 20 验证

执行环境：便携 Node `v20.20.1`，npm `10.8.2`。

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | 锁文件可复现安装，540 packages |
| SDK 依赖树 | PASS | 4.6.0 / 2.4.7 / 1.0.8，无重复有效版本 |
| `npm run db:generate` | PASS | Prisma Client 5.22.0；未连接或修改数据库 |
| 项目 TypeScript | PASS | `tsc --noEmit --incremental false` |
| 短信文件隔离 TypeScript | PASS | Provider、自检、真实发送门禁及其依赖 |
| `npm run lint` | PASS | 0 error；保留 1 条既有 `<img>` 性能 warning |
| 阿里云短信安全自检 | PASS | 配置失败、业务码、落库顺序、日志脱敏、OTP 安全规则 |
| 其他现有自检 | PASS | keyword、news keyword、pending brand、security guards，共 4 组 |
| `npm run build` | PASS | Next.js 14.2.35；99/99 静态页生成完成 |

补充说明：尝试用项目宽泛的 `scripts/tsconfig.scripts.json` 检查全部历史脚本时，发现多个既有 legacy import/SEO 脚本类型错误；本轮没有修改这些无关脚本。项目主 TypeScript 和本次短信文件的隔离 TypeScript 均通过。

首次安装依赖时 npm 对整个既有依赖树给出 14 项 audit 摘要（1 moderate、13 high）。本轮没有运行 `npm audit fix`、升级无关依赖或改写现有功能；该摘要不等同于已确认由本次三个阿里云依赖直接引入。

## 测试结果

```text
SMS_UNCONFIGURED_SAFE_FAILURE_TEST=PASS
SMS_RATE_LIMIT_TEST=PASS
OTP_EXPIRY_TEST=PASS
OTP_REUSE_TEST=PASS
OTP_ERROR_LIMIT_TEST=PASS
ALIYUN_SMS_PROVIDER_SAFETY_TESTS=PASS
```

其中“无 AccessKey”和阿里云失败响应为无网络的安全测试。错误 AccessKey、错误模板、阿里云后台发送记录以及手机真实到达必须在用户私下配置凭据后做一次隔离真实验收；本轮未伪造为 PASS。

## 泄漏扫描

扫描覆盖 Git 已跟踪文件（包括 `public`、报告和 fixtures）、全部非忽略的未跟踪文件、本地忽略的 `.env`、`.next/static` 客户端 bundle 及 `.next/server` 构建结果。只统计命中数量，没有打印疑似值。

```text
ALIYUN_ACCESS_KEY_HARDCODED=NO
ALIYUN_SECRET_HARDCODED=NO
ALIYUN_SECRET_CLIENT_EXPOSURE=NO
ALIYUN_SECRET_GIT_EXPOSURE=NO
ACCESS_KEY_LITERAL_FILE_COUNT=0
ASSIGNED_ALIYUN_CREDENTIAL_FILE_COUNT=0
NEXT_PUBLIC_ALIYUN_CREDENTIAL_FILE_COUNT=0
CLIENT_BUNDLE_SENSITIVE_LITERAL_FILE_COUNT=0
SERVER_BUNDLE_ACCESS_KEY_LITERAL_FILE_COUNT=0
```

代码和说明中仅存在标准环境变量名称；`.env.example` 中对应值为空。

## 生产环境加载机制审计

- 已从本机 SSH 配置、PowerShell 历史、VS Code Remote SSH 记录和部署工作流交叉恢复既有生产连接：`root@123.60.14.103:22`，使用既有 ED25519 身份文件。
- 只读连接确认远端 hostname 为 `ecs-197424`、`/home/web1` 存在、`web1.service` active，生产 Git 工作树干净。
- `web1.service` 明确配置 `WorkingDirectory=/home/web1`、`ExecStart=/usr/bin/npm run start`、`EnvironmentFile=/home/web1/.env`，运行用户为 `root`。
- `/home/web1/.env.production` 不存在；`/home/web1/.env` 存在、未被 Git 跟踪、权限 `600`、属主 `root:root`。
- 五个短信变量当前均未配置。手工配置步骤见 `SECRET_MANUAL_ENTRY_INSTRUCTIONS.md`；不改 systemd，不重启，不部署。

```text
PRODUCTION_ENV_MECHANISM=SYSTEMD_ENVIRONMENT_FILE
PRODUCTION_ENV_FILE=/home/web1/.env
PRODUCTION_ENV_FILE_GIT_TRACKED=NO
PRODUCTION_ENV_FILE_MODE=600
```

## Git 与生产边界

- 基线分支：`security/tombstone-hardening`
- 基线 HEAD：`dad777d5cd6c90b36407c7d7d853f0bc8541a6ab`
- 工作树原有大量未提交改动；全部保留，没有 reset、clean、stash、checkout、暂存或提交。
- 本轮只新增/修改短信 Provider、必要依赖与锁文件、配置模板、测试和会员安全报告；没有让其依赖无关改动。

## 当前状态字段

```text
MEMBERSHIP_SECURITY_ALIYUN_SMS_INTEGRATION_READY_FOR_SECRET_CONFIGURATION
ALIYUN_SMS_SDK=@alicloud/dysmsapi20170525@4.6.0
ALIYUN_RAM_USER=cnzhengmu-sms
ALIYUN_RAM_POLICY=CnzhengmuSmsSendOnly
ALIYUN_RAM_PERMISSION=dysms:SendSms
SMS_PROVIDER=aliyun
SMS_SIGN_NAME=杭州创始记科技发展
SMS_TEMPLATE_CODE=SMS_512265107
ALIYUN_ACCESS_KEY_CONFIGURED=NO
ALIYUN_SECRET_HARDCODED=NO
ALIYUN_SECRET_CLIENT_EXPOSURE=NO
ALIYUN_SECRET_GIT_EXPOSURE=NO
ALIYUN_SMS_REAL_SEND_TEST=DEFERRED_SECRET_CONFIGURATION
SMS_RATE_LIMIT_TEST=PASS
OTP_EXPIRY_TEST=PASS
OTP_REUSE_TEST=PASS
OTP_ERROR_LIMIT_TEST=PASS
PRODUCTION_PREDEPLOY_DATABASE_BACKUP=NOT_EXECUTED
PRODUCTION_PREDEPLOY_DATABASE_BACKUP_SHA256=NOT_APPLICABLE
SECURITY_MIGRATION_DEPLOY=NOT_EXECUTED
NODE_VERSION=v20.20.1
PRISMA_GENERATE=PASS
TYPECHECK=PASS
LINT=PASS
TESTS=PASS
NEXT_BUILD=PASS
DEPLOY=NOT_EXECUTED
NEW_PERSONAL_SMS_TEST=NOT_EXECUTED
NEW_PERSONAL_PENDING_REVIEW_TEST=NOT_EXECUTED
UNAPPROVED_PUBLISH_BLOCK_TEST=NOT_EXECUTED_PRODUCTION
ADMIN_ACCOUNT_APPROVAL_TEST=NOT_EXECUTED_PRODUCTION
PERSONAL_CATEGORY_FORCE_TEST=NOT_EXECUTED_PRODUCTION
PERSONAL_LIMIT_TEST=NOT_EXECUTED_PRODUCTION
ENTERPRISE_BASIC_CATEGORY_TEST=NOT_EXECUTED_PRODUCTION
ENTERPRISE_BASIC_LIMIT_TEST=NOT_EXECUTED_PRODUCTION
EXISTING_ARTICLE_REVIEW_FLOW=PASS_FROZEN_EXISTING_CODE
ARTICLE_REVIEW_BYPASS_TEST=NOT_EXECUTED_PRODUCTION
IDENTITY_PRIVATE_STORAGE_TEST=PASS_FROZEN_EXISTING_CODE
PERSONAL_WRONG_CATEGORY_COUNT=NOT_QUERIED
ENTERPRISE_BASIC_WRONG_CATEGORY_COUNT=NOT_QUERIED
HTTP_SMOKE_TEST=NOT_EXECUTED
GIT_COMMIT=NOT_EXECUTED
```
