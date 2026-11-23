# 神也过不了第二关 · 抖音小游戏

带**真实好友排行榜**的版本。抖音的关系链数据只在**小游戏**（开放数据域）里开放，小程序拿不到，所以这个版本独立成一个小游戏工程。

## 和「小程序版」的区别

| | 小程序版（`抖音小程序/`） | 小游戏版（本目录） |
| --- | --- | --- |
| 工程形态 | `pages/` + TTML/TTSS | `game.js` + `game.json` + 全屏 Canvas |
| 界面 | TTML 标签 | **全部 Canvas 绘制**（没有 DOM） |
| 排行榜 | 本地历史成绩（自己的榜） | **好友真实排行**（开放数据域 + 关系链） |
| 平台应用类型 | 小程序 | 小游戏 |

两个版本的游戏逻辑、难度参数完全一致，改动时注意同步 `js/core.js` 与 `pages/game/game.js`。

## 目录

```
game.js                  入口：画布/Dpr、触摸、场景状态机、主循环
game.json                小游戏配置（竖屏、openDataContext 声明）
project.config.json      appid 记得换成你的小游戏 AppID
js/core.js               游戏世界：透视投影、门、球、特效、HUD（纯 Canvas）
js/ui.js                 开始页 / 结算页 / 好友榜面板（Canvas 绘制 + 命中测试）
js/rank.js               主域：成绩上报、请求开放数据域、把 sharedCanvas 贴进面板
openDataContext/index.js 开放数据域：tt.getFriendCloudStorage 拉好友并绘制到 sharedCanvas
```

## 好友排行榜怎么打通

```
一局结束
  └─ tt.setUserCloudStorage({ KVDataList: [{ key: 'numdoor', value: '{"num":9800,"stage":4}' }] })
       └─ 主域 tt.getOpenDataContext().postMessage({ type: 'refresh' })
            └─ 开放数据域 tt.getFriendCloudStorage({ keyList: ['numdoor'] })
                 └─ 排序 → 绘制到 sharedCanvas
                      └─ 主域每帧 drawImage(sharedCanvas, ...) 贴进开始页面板
```

**关键点**：开放数据域**只能收消息、不能主动发消息**（微信/抖音同一套约束），所以主域不能等"数据好了再画"，而是请求后乐观地按帧把 sharedCanvas 贴上去，加载态/空态由开放数据域自己绘制。

## 怎么跑

1. 抖音开发者工具 → 导入本目录（含 `game.json` 的那一层）
2. `project.config.json` 的 `appid` 换成你的**小游戏** AppID
3. 编译预览 → 上传 → 开放平台提审

> 小游戏的**好友榜需要真机验证**：模拟器里没有关系链数据，`tt.getFriendCloudStorage` 会返回空或失败，开始页会显示"还没有好友上榜"。用两台手机（互为抖音好友）登录体验版即可看到彼此的排名。

## 已验证

- 主域/开放数据域全链路 Node 无头仿真：引导、渲染 3600 帧、触摸开局、撞 BOSS、上报成绩、重开，全部无异常
- 开放数据域：能正确解析 `KVDataList`，坏数据会丢弃，按「数字优先、关卡次之」排序
- Canvas UI 在真实浏览器里渲染截图核对（见 `../预览/小游戏开始页.png`）

## 参数（与小程序版一致）

`js/core.js` 顶部：`GAP = 6.2`、`BOSS_EVERY = 4`、`LANE_DUR = 0.06`、第一关速度 `12.5`、第二关起 `20.5 + (stage-2)*1.0`（上限 26）、第二关门槛 `×2.75`（其余 `×2.15`）。
