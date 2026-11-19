# 和声练唱音频接入

首页「练耳 → 和声练唱 → 在他乡」中有四个音轨，顺序固定为「旋律+和声、旋律、和声、伴奏」。目前已接入前三个 WAV 音频，「伴奏」尚未提供，保留「音频待添加」状态。

文件放在 `site/assets/harmony-practice/zai-ta-xiang/`，再修改 `site/assets/harmony-songs.js` 中相应音轨的 `src`，例如：

```js
{id:'melody-harmony', title:'旋律+和声', src:'assets/harmony-practice/zai-ta-xiang/melody-harmony.wav'}
```

其余三个可使用 `melody.wav`、`harmony.wav`、`accompaniment.wav`，文件扩展名必须和实际文件相同。`src` 使用上述网页相对路径和正斜杠 `/`，不能填写 `D:\...` 或 `file:///...` 电脑磁盘路径。保留原始文件，不在播放器里改音高、速度或音量。这里接入项目文件，不提供账号或服务器上传服务。

歌曲清单联网时优先获取最新内容，离线时使用最近缓存的清单。首次更新旧网页后，可从本地预览的新地址打开并刷新；不需要清除练习记录或重新安装 PWA。仅修改本地文件不会同步到已发布网站。

新增歌曲时，在同一清单中追加一个有独立 `id`、`title` 和 `tracks` 的项目即可，目录自动生成。目录名称使用文本节点，音频通过相对路径引用。音频及其相关许可需由提供者确认。

顺序播放从选中音轨继续到最后一项后停止，不跳过未添加的项目，也不自动回到第一项。循环播放使用原生 `audio.loop`，重复当前音轨。切换模式保留当前音轨和进度。播放器支持暂停、继续、上一音轨、下一音轨及进度拖动；返回音轨目录立即停止并释放音源，逐级返回歌曲目录和首页。

后台播放采用单个原生 HTML `audio` 元素，不在切后台或锁屏时主动暂停。支持时接入 Media Session 的锁屏播放/暂停、上下音轨及进度控制，并在播放期间请求 `audioSession.type = 'playback'`，离开后恢复。实际后台播放、后台换曲仍由手机系统和浏览器决定，不能通过桌面浏览器的测试声称已完成手机锁屏验收。

程序入口、清单和播放器界面纳入 PWA 离线资源。歌曲文件按需通过浏览器加载，由原生播放器处理 HTTP Range 请求以支持拖动播放；本版不预下载或承诺歌曲离线可用。该模块没有答题计数、统计、每日任务或新的历史数据格式。

验证：基础测试用可控的媒体替身检查顺序、循环、快速操作、返回清理和历史保护；浏览器测试用独立生成的短 WAV 检查真实播放、自动换曲、原生循环、暂停和进度，并检查 320/390/900 像素排版。同时在浏览器加载已提供的 WAV，检查播放进度前进、时长和拖动；不代表已人工试听或完成手机锁屏测试。

参考：[HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)、[原生循环](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loop)、[Media Session](https://www.w3.org/TR/mediasession/)。
