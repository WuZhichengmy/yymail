# 解忧杂货铺 · 网页版

解忧杂货铺首页与「圆圆旅行」规划工具。原生 HTML、CSS、JavaScript，配合 Cloudflare Workers 和 D1。此仓库仅维护网页，不修改同级 `letter` 小程序。

## 交互

- 悬停邮筒：上浮、放大和暖色光晕。
- 悬停纸箱：信封弹跳一次。
- 悬停报纸摊：遮阳棚起伏、提亮并带有风线。
- 点击门：双扇门打开，再次点击关闭。
- 常驻动画：炊烟、飞信、灯光、落叶、微光以及遮阳棚轻摆。
- 手机支持轻触；交互按钮支持键盘；遵循减少动态效果偏好，切到后台后暂停动画。
- 点击邮筒进入 `/travel/`：批量搜索景点、餐厅、已订酒店，确认准确地址后显示在高德地图；按天分组、调整顺序、编辑备注和酒店入住日期。
- 地图连线仅表示游览顺序，不是道路导航。支持跳转高德查看地点；没有位置的手动记录保留在清单中。
- 行程本机自动保存，D1 云同步；用私人同步码在其他设备恢复。同步码是 256 位随机凭证，数据库只保存其 SHA-256 摘要，不把行程公开到网址。
- 支持多份行程、JSON 备份导入导出、云端版本冲突检测，避免旧设备静默覆盖新数据。

## 本地预览

首页静态预览可直接运行 Python HTTP 服务。要开发旅行工具的地图和云保存，先运行：

```sh
npm ci
npm run dev
```

然后访问 http://localhost:4173/travel/。本地 Wrangler 使用独立的本地 D1，不会改动线上行程。

开发配置 `.dev.vars` 已加入 Git 忽略；字段为 `AMAP_WEB_KEY`、`AMAP_JS_KEY`、`AMAP_JS_SECURITY`。不要提交实际密钥。

## Cloudflare Workers 部署

在 Cloudflare 控制台进入 **Workers & Pages → Create application**，连接 GitHub 仓库 `WuZhichengmy/yymail`，填写：

| 设置 | 值 |
| --- | --- |
| Project name | `yymail` |
| Root directory | 保持默认（仓库根目录） |
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Enable Preview builds | 可开启 |
| Protect with Cloudflare Access | 关闭，网站可公开访问 |
| Production branch（如显示） | `main` |

保存并部署后，Cloudflare 会给出实际的 `*.workers.dev` 访问地址。之后推送到 `main` 的修改会触发自动部署。

配置参考：[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)。`wrangler.toml` 通过 `assets.directory` 指向 `public`，并以 `src/worker.mjs` 为后端入口。静态资源优先直接提供，后端入口通过 `ASSETS` 绑定保留网站文件访问能力，无需安装前端依赖。

## D1 数据库准备

纯静态资源 Worker 无法添加数据库绑定；本项目已经提供 Worker 脚本入口，部署此版本后即可在控制台添加绑定。

1. 创建 D1 数据库 `yuanyuan-travel`。
2. 等待 `main` 分支最新版本部署成功。
3. 进入 `Workers & Pages → yymail → Bindings → Add binding → D1 database`。
4. 变量名填写 `YY_DB`，选择 `yuanyuan-travel` 并确认添加。
5. 仓库 `wrangler.toml` 已保存实际数据库 ID 和 `YY_DB` 绑定，后续 Git 部署沿用该配置；后端使用 `env.YY_DB` 访问数据库。

第一次调用行程接口时自动创建 `travel_workspaces` 表，无需手工粘贴 SQL。每份同步空间最多 30 份行程、合计 1000 个地点，每份行程最多 200 个地点和 60 天。接口限制单次数据 256 KB，保存采用 revision 乐观锁。

私人同步码相当于访问凭证，知道它的人可读写对应行程；它不是账号登录系统。请自行保管同步码，遗失且所有设备本机数据清空后无法按身份找回。不要把个人同步码放进截图、共享链接或 Git 仓库。

## 高德地图与服务端配置

在 `yymail → Settings → Runtime variables and secrets` 为 Production 设置：

| Secret 名称 | 内容 |
| --- | --- |
| `AMAP_WEB_KEY` | 高德 Web 服务 API Key（用于后端地点搜索） |
| `AMAP_JS_KEY` | 高德 Web 端 JS API Key（此 Key 会交付浏览器使用） |
| `AMAP_JS_SECURITY` | JS API 安全密钥（仅服务端代理使用） |

使用对应高德控制台设置限定适用域名。预览环境如需真实地图，另行配置对应环境的变量与数据库；不要直接把个人生产数据复制到公开预览中。

安全密钥和 Web 服务 Key 不返回浏览器。地图 SDK 通过同源 `/_AMapService/` 代理附加安全密钥；只允许固定的高德上游。搜索只在主动提交时触发，批量地点逐个确认，不实现高频输入联想。搜索结果仅返回地图展示需要的字段，不保存整份服务响应。

## 验证

```sh
npm run check
npx wrangler deploy --dry-run
```

自动测试使用真实 SQLite 执行与生产一致的建表和保存语句，检查隔离、冲突、无效数据、体积限制、凭证验证及密钥不被公开。

## 文件

```text
public/
  index.html       页面与可访问性结构
  styles.css       布局和动画
  app.js           开关门、触摸反馈及动画暂停
  _headers         Cloudflare 响应头
  assets/          插画底图和透明贴图
wrangler.toml      Cloudflare Workers 静态资源配置
src/worker.mjs     后端入口，预留数据库及行程接口扩展
src/travel.mjs     地图代理、地点搜索及 D1 行程接口
public/travel/     圆圆旅行页面、样式及交互
test/              SQLite 后端行为测试
```

网站与小程序分别维护页面代码。插画素材来自同一组文件；后续更新素材时应同步到两端。
