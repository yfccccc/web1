# 中华整木网

整木行业知识基础设施与会员共建平台。当前仓库不是单纯的展示站，而是由公开前台、会员系统、管理员后台、内容审核链路与 Prisma/PostgreSQL 数据层组成的完整站点。

## 1. 当前项目定位

项目当前主要包含三条主链路：

- 公开前台：资讯、品牌市场、词库、标准、评选、搜索与分享页
- 会员系统：登录、企业资料、企业认证、内容发布、图库提交、审核状态查看
- 管理后台：内容管理、审核、会员账号、权限、企业认证、站点设置

从当前代码结构看，这个仓库更接近“行业内容站 + 会员共建后台”，而不是只做静态页面展示。

## 2. 技术栈

- Next.js 14（App Router）
- React 18 + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- TipTap 富文本编辑器
- `jose` + `bcryptjs` 用于登录态与密码校验

## 3. 当前主栏目与入口

当前主导航与核心入口主要包括：

- `/news`：整木资讯
- `/brands`：整木市场 / 品牌与选购
- `/dictionary`：整木词库
- `/standards`：整木标准
- `/awards`：整木评选
- `/membership`：会员系统入口
- `/search`：站内搜索

兼容与历史路由说明：

- `/market` 当前会重定向到 `/brands`
- `/data` 当前会重定向到 `/`
- `/gallery` 当前会重定向到 `/`

因此，`app/` 目录中的栏目数量多于当前正式主导航数量，README 以真实可用主链路为准，不把兼容重定向页误写为独立主模块。

## 4. 会员与后台能力概览

### 4.1 会员系统

`app/membership/` 当前包含：

- `/membership/login`：会员登录
- `/membership/profile`：企业资料管理
- `/membership/content/verification`：企业认证申请
- `/membership/content/publish`：内容发布与修改申请
- `/membership/content/gallery`：图库内容提交
- `/membership/content/status`：内容审核状态
- `/membership/content/news`：会员内容入口页

### 4.2 管理后台

`app/membership/admin/` 当前包含：

- `/membership/admin/content`：文章内容管理、发布、修改、审核
- `/membership/admin/gallery`：图库管理
- `/membership/admin/enterprise-verifications`：企业认证审核
- `/membership/admin/accounts`：后台账号管理
- `/membership/admin/permissions`：权限管理
- `/membership/admin/settings`：站点设置

## 5. API 能力概览

`app/api/` 当前已形成较完整的服务端路由层：

- `app/api/auth/`：登录、退出、获取当前用户、修改密码
- `app/api/member/`：会员资料、文章、图库、下载、企业认证、标准反馈
- `app/api/admin/`：文章、词条、标准、品牌、图库、分类、站点设置、成员、审核等后台能力
- `app/api/upload/image/`：图片上传
- `app/api/og/news-default/`：资讯默认分享图
- `app/api/news/`、`app/api/terms/`、`app/api/standards/`、`app/api/brands/`、`app/api/tags/`：对前台内容的读接口

## 6. 数据模型概览

从 [prisma/schema.prisma](prisma/schema.prisma) 看，当前核心数据模型主要包括：

- `Article` / `ArticleChangeRequest`：资讯、词库文章、标准文章等内容与修改申请
- `Term`：词库词条
- `Standard` / `StandardFeedback`：标准数据与标准反馈
- `Brand`：品牌资料
- `IndustryData`：行业数据
- `Member` / `Enterprise` / `EnterpriseVerification`：会员、企业资料、企业认证
- `GalleryImage`：图库素材
- `Category` / `SubCategory` / `CategoryFaq` / `Tag`：栏目、子栏目、FAQ、标签
- `AppSetting` / `OperationLog`：站点设置与操作日志

补充说明：

- 当前数据库 provider 为 PostgreSQL
- 仓库里仍保留 `passwordPlaintext` 字段，但最近记录显示运行时代码已在收口这部分明文密码使用

## 7. 目录结构

下面是按当前仓库实际用途整理后的关键目录：

```text
web1/
├─ app/
│  ├─ api/                      # 服务端路由：auth / member / admin / upload / og
│  ├─ awards/                   # 评选与榜单
│  ├─ brands/                   # 品牌与选购
│  ├─ dictionary/               # 词库与词条详情
│  ├─ membership/               # 会员入口、会员后台、管理员后台
│  ├─ news/                     # 资讯列表、详情、分享相关页面
│  ├─ standards/                # 标准列表与详情
│  ├─ search/                   # 搜索页
│  ├─ share/                    # 分享落地页
│  ├─ market/                   # 旧链接兼容，重定向到 /brands
│  ├─ data/                     # 兼容占位，当前重定向到首页
│  └─ gallery/                  # 兼容占位，当前重定向到首页
├─ components/
│  ├─ homepage/                 # 首页分区组件
│  └─ *.tsx                     # 通用 UI、富文本、结构化展示、分享等组件
├─ lib/                         # 业务工具、权限、SEO、分类、内容处理、Prisma 封装
├─ prisma/
│  ├─ schema.prisma             # 数据模型
│  ├─ migrations/               # 数据库迁移
│  ├─ seed.ts                   # 种子数据
│  ├─ ensure-admin.js           # 管理员引导脚本
│  └─ README.md                 # Prisma 使用说明
├─ public/                      # 静态资源
├─ types/                       # TypeScript 类型
├─ data/                        # 版本化的示例与业务数据
├─ scripts/                     # 运维、迁移、审计与自测脚本
├─ custom/
│  ├─ notes/                    # 正式迭代记录
│  └─ experiments/              # 临时材料与实验产物
├─ docs/                        # 长期文档与旧站兼容说明
├─ artifacts/                   # 验收截图与验收报告
├─ reports/                     # 审计及变更报告
├─ dist/                        # 手工生成的发布包（非应用运行依赖）
└─ README.md
```

`node_modules/`、`.next/`、`.codex-temp/`、`.release-worktrees/`、`tmp*/`、日志和
`*.tsbuildinfo` 都是依赖、构建缓存或本地工作产物，不属于项目源码，已通过
`.gitignore` 与源码目录隔离。

## 8. 环境变量

可参考 [`.env.example`](.env.example)：

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/web1?schema=public"
JWT_SECRET="your-secret-at-least-32-chars"
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
ADMIN_ACCOUNT="yfcccc"
ADMIN_PASSWORD="admin"
ADMIN_NAME="admin"
NEXT_PUBLIC_MEMBER_CONTACT_EMAIL="member@your-domain.com"
NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL="service@your-domain.com"
NEXT_PUBLIC_CONTACT_PHONE="400-123-4567"
BAIDU_PUSH_SITE="cnzhengmu.com"
BAIDU_PUSH_TOKEN="your-baidu-push-token"
```

可选项：

- `GEMINI_API_KEY`：当前 `.env.example` 中保留了可选 AI Key 注释，但它不是本项目启动的硬性前提
- `SEO_NEWS_AUTOGEN_ENABLED="true"`：仅当该值显式为 `true` 时，生产服务器的 SEO 自动生成 cron 才会实际写入 `pending` 草稿；未设置或非 `true` 时，cron 即使触发也会记录 `SKIP` 并跳过

## 9. 常用命令

首次安装依赖：

```bash
npm install
```

锁定依赖安装：

```bash
npm ci
```

开发模式：

```bash
npm run dev
```

生产预览：

```bash
npm run build
npm run start
```

代码检查：

```bash
npm run lint
```

数据库相关：

```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:ensure-admin
```

默认开发地址：

- [http://localhost:3000](http://localhost:3000)

### 可选：通过本地代理下载依赖

如果本地访问 GitHub、npm registry 或其他依赖源较慢，可将常见下载工具指向本机代理：

```bash
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897

npm config set proxy http://127.0.0.1:7897 --global
npm config set https-proxy http://127.0.0.1:7897 --global
```

## 10. 初始化建议顺序

如果你是首次在本地拉起这个仓库，建议按下面顺序：

1. 安装依赖：`npm install`
2. 复制并填写 `.env`
3. 准备 PostgreSQL 数据库
4. 执行 `npm run db:generate`
5. 执行 `npm run db:push` 或 `npm run db:migrate`
6. 按需执行 `npm run db:seed`
7. 执行 `npm run db:ensure-admin`
8. 启动 `npm run dev`

### Windows 本地验证通过的一组环境

下面这组环境已在本仓库实际跑通，可作为本地对齐参考：

- Node.js `20.20.1`
- npm `10.8.2`
- PostgreSQL `17.4`
- Prisma `5.22.0`

对应的本地开发连接示例：

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/web1?schema=public"
NEXT_PUBLIC_SITE_URL="http://127.0.0.1:3000"
```

数据库初始化完成后，可用以下默认管理员账号登录：

- 账号：`yfcccc`
- 密码：`admin`

首次落地时，一条可直接执行的最小链路是：

```bash
npm ci
npm run db:generate
npm run db:push
npm run db:seed
npm run db:ensure-admin
npm run dev
```

## 11. 相关文档与记录

当前仓库中可直接参考的说明入口：

- [prisma/README.md](prisma/README.md)：数据库与 Prisma 使用说明
- [custom/notes](custom/notes)：正式迭代记录
- [custom/experiments](custom/experiments)：临时材料与实验文件

注意：

- 旧版 README 中提到的 `docs/COMPONENTS.md`、`docs/DEPLOYMENT.md` 在当前仓库中并不存在，因此本次已移除，避免文档指向失真

## 12. 当前 README 的边界

这份 README 主要服务于“快速理解当前仓库结构与启动方式”，不是完整产品文档，也不是部署白皮书。

如果后续还要继续补文档，更值得拆分的方向是：

- 后台内容系统使用说明
- 会员角色与权限说明
- 内容模型与栏目映射说明
- 部署与环境差异说明
## SEO cron 快速修复

生产服务器执行：

```bash
APP_DIR=/home/web1 bash scripts/fix-seo-cron.sh
```

注意：请使用和 `deploy.yml` 安装 cron 相同的服务器用户执行，避免 `root`/user crontab 不一致。
