# 第三方资源与授权说明

根目录 [LICENSE](LICENSE) 中的 MIT 授权，仅适用于 youlajiaoma 拥有版权且有权按 MIT 授权的原创程序代码和原创文档。音频、字体、图标等资源不因放入本仓库而自动获得 MIT 授权；第三方组件继续适用其原有许可证。

## TimGM6mb 派生音频采样

| 文件 | 用途 | 现有授权 |
| --- | --- | --- |
| `site/assets/piano-samples.js` | 钢琴采样，用于和声音程及识谱答题后的声音播放 | GPL v2 |
| `site/assets/melody-samples.js` | 旧版旋律采样；当前旋律练习已改用预录音频，文件仍保留在仓库中 | GPL v2 |

这两个文件包含由 TimGM6mb.sf2 派生的音频数据，文件头保留了 GPL 声明，**整个资源文件均不纳入根目录 MIT 授权**。不能因文件扩展名为 `.js` 就按本项目原创代码处理。

仓库现有上游版权记录包括：

- Copyright 2004 Tim Brechbill。
- Copyright 2010 David Bolton。

许可原文见 [LICENSE_AUDIO_GPL2.txt](site/LICENSE_AUDIO_GPL2.txt)，完整来源及版权记录见 [UPSTREAM_AUDIO_COPYRIGHT.txt](site/UPSTREAM_AUDIO_COPYRIGHT.txt)。其中有关 Debian 打包文件的条目仅描述其对应文件，不代表 Tonaloom 全部代码采用同一许可。

复制、修改或重新分发这些采样时，需要继续遵守对应的 GPL v2 条款，并保留必要的来源和版权说明。本次未修改采样或原有许可证。

## 旋律练习的 96 段录音：授权待核实

涉及 `site/assets/melodic-recordings.js` 中登记的 `site/assets/melodic-recordings/*.m4a` 文件，共 96 段，覆盖四种乐器、十二种音程和两个方向。

项目作者确认这些录音由其使用 MuseScore 制作，但尚未确认当时的软件版本、具体音源名称和对应许可。录音与其中使用的音源并非同一项权利；不能仅凭自行录制或导出，就认定可以将音源相关内容重新按 MIT 授权。

因此，这些录音**不纳入根目录 MIT 授权**，本说明也不构成对其公开分发或再次授权的许可。仍需核实：

1. 使用的是哪一版本 MuseScore，以及各乐器实际采用的音源。
2. 对应许可是否允许将这些独立的音程录音随开源仓库公开分发。
3. 是否需要补充署名、许可证或其他分发条件。

将录音排除在 MIT 之外，不等于已经确认其公开分发权。在完成核实前，不能声称仓库全部资源均已明确开源授权。录音文件及原有来源注释保持不变。

## VexFlow 程序

项目使用 [VexFlow 5.0.0](https://github.com/vexflow/vexflow)。本地加载器优先读取 `site/vendor/vexflow.js`，缺失时从 CDN 加载固定版本；GitHub 检查和部署流程会下载相同版本的发布文件。

VexFlow 程序采用上游 MIT 许可证，保留其独立版权署名：

- Copyright (c) 2023-present VexFlow contributors。
- Copyright (c) 2010-2022 Mohit Muthanna Cheppudira。

原有 [LICENSE_VEXFLOW_MIT.txt](site/LICENSE_VEXFLOW_MIT.txt) 保持不变，并已与 [5.0.0 发布包的 LICENSE](https://cdn.jsdelivr.net/npm/vexflow@5.0.0/LICENSE) 核对。上游授权与本项目原创代码的 MIT 授权分别成立，不能用项目作者署名替换上游署名。

## VexFlow 内嵌字体

VexFlow 5.0.0 的完整发布文件内部附带字体数据。即使仓库没有单独的字体文件，部署后的 VexFlow 文件仍包含这些资源。当前谱面选择 Bravura 和 Academico；发布文件同时附带其他字体。

| 字体 | 上游权利人 | 许可 |
| --- | --- | --- |
| Bravura | Steinberg Media Technologies GmbH | SIL Open Font License 1.1 |
| Academico，包括粗体 | Steinberg Media Technologies GmbH | SIL Open Font License 1.1 |
| Petaluma、Petaluma Script | Steinberg Media Technologies GmbH | SIL Open Font License 1.1 |
| Gonville | Simon Tatham | 上游允许不受限制地使用、修改和分发生成的字体文件；字体生成程序另有 MIT 条款 |

完整上游版权行和许可原文见 [LICENSE_VEXFLOW_FONTS.txt](site/LICENSE_VEXFLOW_FONTS.txt)。字体不按 Tonaloom 的 MIT 许可证重新授权，不能把 VexFlow 程序的 MIT 许可直接套用于其全部字体。

## 历史谱号与界面字体

[LICENSE_SIGHT_CLEF.txt](site/LICENSE_SIGHT_CLEF.txt) 记录旧版谱号轮廓来自 Noto Music，包含 Google Inc. 的版权声明及 SIL Open Font License 1.1 来源。当前谱面已使用 VexFlow；历史声明继续保留，不将旧轮廓重新声明为项目原创。

界面样式列出的 Inter、微软雅黑和苹方等名称是系统字体候选列表，当前仓库未单独附带这些界面字体文件。列出字体名称不意味着本项目拥有这些字体的版权。

## 重新分发时

保留本说明及相关版权、许可证文件，按各项资源的实际许可处理。新增或替换音源、字体等资源前，应先核实来源和分发条件；不要将整个仓库笼统标注为“所有内容均采用 MIT”。
