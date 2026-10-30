# 解忧杂货铺 · 网页版

与微信小程序保持相同插画和交互的静态网站。原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。

## 交互

- 悬停邮筒：上浮、放大和暖色光晕。
- 悬停纸箱：信封弹跳一次。
- 悬停报纸摊：遮阳棚起伏、提亮并带有风线。
- 点击门：双扇门打开，再次点击关闭。
- 常驻动画：炊烟、飞信、灯光、落叶、微光以及遮阳棚轻摆。
- 手机支持轻触；交互按钮支持键盘；遵循减少动态效果偏好，切到后台后暂停动画。

## 本地预览

在仓库目录运行：

```sh
python3 -m http.server 4173 --directory public
```

然后访问 http://localhost:4173。

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

配置参考：[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)。`wrangler.toml` 通过 `assets.directory` 指向 `public`；静态网站无需额外 Worker 脚本，也无需安装前端依赖。

## 文件

```text
public/
  index.html       页面与可访问性结构
  styles.css       布局和动画
  app.js           开关门、触摸反馈及动画暂停
  _headers         Cloudflare 响应头
  assets/          插画底图和透明贴图
wrangler.toml      Cloudflare Workers 静态资源配置
```

网站与小程序分别维护页面代码。插画素材来自同一组文件；后续更新素材时应同步到两端。
