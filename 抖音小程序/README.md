# 数字门 · 抖音小程序版

原生抖音小程序工程（非 H5 套壳，非 web-view），Canvas 2D 实时渲染，手机竖屏全屏跑。
和网页版玩法完全一致，只是把渲染与输入换成了小程序原生 API。

## 一、怎么跑起来（3 步）

1. 打开 **抖音开发者工具** → 新建/导入项目 → 选择本目录 `抖音小程序/`（含 `app.json` 的那一层）。
2. `project.config.json` 里的 `appid` 现在是占位符 `tt0000000000000000`，换成你自己的小程序 AppID
   （抖音开放平台 → 你的小程序 → 开发设置 → AppID）。没有 AppID 时选「测试号」也能直接跑。
3. 点「编译」看模拟器，点「预览」出二维码 → 用抖音扫码，手机上直接玩。

## 二、发布上线

开发者工具右上角 **上传** → 填版本号和描述 → 打开 [抖音开放平台](https://developer.open-douyin.com/)
控制台 → 你的小程序 → 版本管理 → 提交审核 → 审核通过后点「发布」，线上版本即生效。
（`appid`、类目、名称等在小程序后台配置，工程里不用改。）

## 三、目录结构

```
抖音小程序/
├── app.js                  小程序入口
├── app.json                页面注册 + 全屏(custom)窗口配置
├── app.ttss                全局样式
├── project.config.json     工程配置（appid 记得换）
└── pages/game/
    ├── game.js             全部游戏逻辑 + Canvas 渲染（约 900 行）
    ├── game.json           页面配置（隐藏导航栏、禁滚动）
    ├── game.ttml           画布 + 开始页 / 结算页 / 声音按钮
    └── game.ttss           遮罩页样式（rpx + 安全区适配）
```

## 四、工程上做的关键适配

| 问题 | 处理方式 |
| --- | --- |
| 高分屏发虚 | 优先取 `type="2d"` 画布节点，`canvas.width = 屏宽 × dpr`，`setTransform` 缩放，逻辑坐标仍按 CSS px 走 |
| 低版本基础库 | 取不到画布节点时自动降级 `tt.createCanvasContext('game')` + `setInterval` 帧循环 + 每帧 `draw()`，两条通道代码同一套 |
| 刘海屏 / 灵动岛 | HUD 顶部按 `safeArea.top` 下移，声音按钮用 `env(safe-area-inset-bottom)` |
| 帧循环 | 优先 `canvas.requestAnimationFrame`，缺失则 `setTimeout(16)`；`onHide` 暂停、`onShow` 重置时间基准，切后台不吃电 |
| 每帧 GC 抖动 | 天空/地面/路面等静态渐变在 `buildGradients()` 里缓存，只在布局变化时重建 |
| setData 卡顿 | 只在「开始 / 结束 / 切静音」时 `setData`，帧内绝不触发渲染层通信 |
| 音效 | 不用 WebAudio（小程序无此 API），改为 `tt.vibrateShort` 手感反馈 + 画布内合成音视觉；声音按钮状态保留 |

## 五、想改手感

全部在 `pages/game/game.js` 顶部与两个函数里：

- `GAP = 6.2`：门的间距（约 3 道门/秒）
- `LANE_DUR = 0.06`：切道补间时长（秒），越小越跟手
- 滑动阈值 `16`（`onTouchMove` 里）+ `swipeDone` 标记：**一次手势只切一格**，轻点则直接跳到对应跑道
- 第一关速度 `12.5`（放慢），第二关起 `20.5 + (stage-2)*1.0`，上限 `26`
- `BOSS_EVERY = 4`：第二关起每 4 道门一道 BOSS 门；第一关在 `spawnGate()` 里多给到 6 道
- `bossWin()` 里 `G.num * 2.15`：常规门槛倍率；`G.stage === 2 ? 2.75` 是**第二关新人墙**
- `makeRow()`：一行 **1 扇好门 + 2 扇坑门**（好门 `×2`/`+24%`，坑门 `-38%`/`-26%`/`÷2`）
- `start()` 里 `gentleLeft`：开局缓冲门的数量，`0` = 硬核（当前值）

## 六、想走「小游戏」通道

本工程是**小程序**结构（pages + ttml/ttss）。抖音小游戏是另一套结构（`game.js` + `game.json` 入口、
`tt.createCanvas()` 全屏画布、无 TTML）。如果你要的是小游戏形态（能被「游戏中心」收录那种），
说一声，我按小游戏工程再出一份，核心渲染代码可以直接搬过去。
