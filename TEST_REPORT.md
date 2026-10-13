# v1.5 验收记录

已运行：

1. `node tests/test_review.cjs` — PASS：昨天错题优先、答题统计、短时/长期复习和旧数据格式。
2. `node tests/test_indexeddb.cjs` — PASS：**模拟 IndexedDB** 的初始化、首次 localStorage 迁移、重复启动、保留旧库优先、答题记录保存、设置与记录一事务恢复。
3. `node tests/test_sw.cjs` — PASS：**模拟 Service Worker 和网络切断** 后，所有缓存清单资源均存在，首页和钢琴采样可以返回。
4. `python tests/test_ui_embedded.py` — PASS：Chromium 中通过内嵌脚本 / 模拟存储适配器验证手机和平板主界面、两次作答、统计和切换，无脚本异常。
5. CSS 与 `<main class="practice">` 主练习区源码和 v1.4 逐字节一致。
6. JavaScript `node --check`、manifest 解析、PWA 图标尺寸和离线资源路径检查通过。

**未在此环境通过的部分（非成功项）：** Chromium 真实的 `http://localhost` 访问被运行环境策略阻止，报 `ERR_BLOCKED_BY_ADMINISTRATOR`，因此 **真实 HTTPS 部署、PWA 安装提示、Service Worker 安装/真实离线刷新、Android 真机音频和存储保留** 都没有完成端到端验证。提供 `tests/test_pwa_integration.py` 供能访问 localhost 的电脑执行，并建议部署后在手机断网测试。

项目未发布到任何公开网址，不能将示例 `https://用户名.github.io/仓库名/` 当作真实访问地址。
