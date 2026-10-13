# 音程听辨 v1.5 — PWA + IndexedDB

本版本在 v1.4 的练习、钢琴采样、练习统计、自动针对性出题基础上增加 **安装到桌面 / 离线缓存 / IndexedDB 自动保存 / 固定地址更新**，**不改变 v1.2 主练习界面**，不包含 APK。纯前端静态文件，无服务器数据库、无注册登录、无第三方跟踪，也不跨设备同步。

## 重要：必须先部署到固定 HTTPS 地址

**请不要直接双击 `site/index.html` 试图安装 PWA。** `file://` 不能正常注册 Service Worker，也可能无法使用 IndexedDB。开发测试可使用 `http://localhost`；真正让手机和平板安装，需要稳定的 HTTPS 地址。

### Github Pages 免费发布（推荐）

1. 创建一个 GitHub 仓库（推荐 Public），例如 `interval-trainer`。
2. 把此工程中的 `site/`、`.github/workflows/pages.yml` 等目录上传到仓库根目录；不能只上传 zip，也不能只上传 `index.html`，**钢琴采样文件必须跟着上传**。可以使用 GitHub Desktop 同步整个工程。
3. 仓库 `Settings` → `Pages` → `Build and deployment` → `Source` 选择 **GitHub Actions**。
4. 推送到 `main` 后检查 `Actions` 的发布工作流是否成功。成功后仓库 Pages 页面会给出**实际的** HTTPS 访问地址，通常形如 `https://你的用户名.github.io/interval-trainer/`（这只是示例，**本项目尚未部署到该网址**）。
5. 在 Android 手机和平板中使用 Chrome 或支持 PWA 的浏览器打开上述真实地址，在浏览器菜单中选择「安装应用」或「添加到主屏幕」。某些浏览器把它称为创建快捷方式，安装界面可能不同。
6. 首次在线进入后等待资源缓存完成，然后测试断网打开。以后每次提交代码到 `main`，已安装的应用在重新联网打开时会检查更新；更新通常需完全退出、重新打开应用后生效。**不保证马上强制切换至最新版**。

如果以后换了域名、协议、端口或仓库路径，会改变应用来源或作用域；学习记录不会自动转移。发布后要尽量维持同一个地址。

### 本地开发（Windows）

在解压的工程根目录运行：

```bat
python -m http.server 8000 --directory site
```

然后在同一台电脑访问 `http://localhost:8000/`。`localhost` 被浏览器视为安全上下文（供开发使用）；**用手机输入电脑局域网 IP 的 HTTP 地址并不符合正式安装所需的 HTTPS 条件**。

## 日常使用与数据存储

- 练习后自动写入该设备浏览器对应站点来源的 **IndexedDB**，设置与答题记录一同保存。没有任何“保存记录”按钮。
- 每天自动优先出前一天的错题，配合当天间隔补练与简化 SM-2 式长期调度。仍在设置 → 练习统计中查看趋势、混淆情况、答题历史。
- 安装与更新 PWA 时，只要应用 HTTPS 来源保持一致且数据库没有被清除，记录通常会保留。
- PWA 离线缓存包括首页、CSS、JS、**本地钢琴采样（约 4.4MB）**、图标和音源许可证。首次需要在联网状态完整载入，**在手机上必须实测断网后能打开并听到声音**。
- 数据存储不代表永久备份。清除网站数据、卸载应用、手机空间紧张造成缓存清理等可能导致丢失。系统会尝试请求持久存储，但浏览器可以拒绝；需要长期保留的统计仍建议偶尔在统计页面导出 JSON 备份。
- 手机和平板根据你的 B 方案各自独立保存。需要手动迁移可使用 `统计 → 数据备份与管理 → 导出 JSON / 导入`。

## 从 v1.3/v1.4 单文件 HTML 升级

旧版本从 `file://` 打开，和新 PWA 的 `https://` **不是同一个存储来源**，PWA **不能直接读取旧 HTML 的 localStorage**。

最可靠的一次性迁移：

1. 使用原来的手机和浏览器打开原 v1.3/v1.4 HTML。
2. 进入原版练习统计，在「数据备份与管理」导出 JSON。
3. 打开新发布的 PWA → 练习统计 → 数据备份与管理 → 导入该 JSON（将覆盖新 PWA 的原有记录与设置）。
4. 在统计页面核对历史题数与各音程记录后再正常使用。

如果旧版和 PWA 原本就是同一 HTTPS 来源（例如同一网站先前保存过 localStorage），v1.5 启动时会**自动将有效旧数据迁入 IndexedDB**。如果数据库已经有现存数据，则优先保护数据库内容，绝不覆盖。

## 文件结构

- `site/index.html`：原有练习/统计 UI（仅增加 PWA head 标签与脚本）。
- `site/app.js`、`site/logic.js`、`site/review.js`、`site/statistics.js`：原有业务逻辑。
- `site/storage.js`：IndexedDB 适配层，异步读取后再初始化程序，事务持久化及原 localStorage 迁移。
- `site/sw.js`：Service Worker，离线缓存整个应用，包括钢琴采样。
- `site/manifest.webmanifest`、`site/icons/`：安装信息与图标。
- `site/assets/piano-samples.js`：音频采样（不运行时联网）。
- `.github/workflows/pages.yml`：Github Pages 持续发布工程。
- `tests/`：逻辑/存储/UI 测试脚本。

## 已测试与限制

- v1.4 的跨天针对性出题与练习统计逻辑测试通过。
- v1.5 的静态源码语法、manifest/icon/缓存资源一致性、IndexedDB 存储模拟测试、界面交互测试按 `tests/` 说明复现。
- **当前受限的 Chromium 环境无法访问本地 HTTP 服务（`ERR_BLOCKED_BY_ADMINISTRATOR`），真实的 Service Worker 安装、离线刷新以及手机实际持久化需要部署后验证；不能把代码级测试当成已完成真机验证。**
- 本项目未发布到真实 HTTPS 地址；GitHub Pages 的上线需要你在自己的 GitHub 账户执行一次上传/授权动作。

## 钢琴采样授权

TimGM6mb 钢琴采样原始版权和许可证详见 `site/UPSTREAM_AUDIO_COPYRIGHT.txt` 和 `site/LICENSE_AUDIO_GPL2.txt`，部署时一并保留。使用及传播请遵守其授权要求。
