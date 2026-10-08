# 别碰我的 NVIDIA 即时重放
[English](README.md) | **中文**

> 关闭属于用户电脑的即时重放功能，应当先征求用户同意。

一个油猴脚本，用于拦截浏览器 EME API，阻止浏览器自动加载 Widevine CDM，防止网页擅自关闭 NVIDIA ShadowPlay 即时重放，保护即时重放持续运行，直到用户手动授权站点放行。

**警告：脚本拦截 EME 调用后，被拦截站点上的 DRM 加密视频将无法播放。本脚本并不用于录制 DRM 受保护内容，不存在相关侵权；脚本仅针对滥用行为，网站和 NVIDIA 的机制导致不经用户许可就强制关闭本地即时重放，且重放不会自动恢复、已录制尚未保存内容也会丢失——甚至很多网站根本不提供 DRM 内容也会导致即时重放被关闭。如需观看加密视频，请将站点加入放行名单，此时即时重放会按照原有逻辑正常被站点阻止。**

<img width="276" height="217" alt="image" src="https://github.com/user-attachments/assets/5f1650e7-30c6-4ad3-8be7-e40d71830652" />

## 功能特性
- 在目标网站拦截 EME / Widevine 相关浏览器接口
- 两种拦截模式：`reject`（直接抛出 NotSupportedError）、`hang`（返回永不决议的 Promise）
- 允许本次会话临时放行，或永久加入放行名单
- 在网页右下角显示角标入口，或快捷键 `Alt+E`，手动强制唤起控制面板

## 安装方法
1. 安装油猴脚本管理器：Tampermonkey / Violentmonkey
2. 导入脚本
3. 访问网页。当页面发起 DRM 请求被拦截时，右下角会出现控制角标。
