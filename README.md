# dsh-skill-group

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-2f81f7">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 GUI 内技能管理器：浏览完整的 `ctx.skills` 目录、逐个开启/关闭技能、查看技能正文、修复发现（discovery）问题、从市场安装、新建技能。

> 宿主侧只通过官方 SDK 运行在 dsh 进程内；浏览器侧只通过官方 slot 渲染。不修改 dsh 源码。

## 这是一个分叉

本项目是 **[cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)** 的分叉，不追踪上游发布。

主要是满足我自己的需求，原版插件的很好，但我想要的更多，而我并不想重新写一个。
1、技能开关改成运行时：靠中间层（ provider + preset ）拦截，不再重命名或移动技能文件，对只读来源同样生效。
2、中间层拦截同时做分组与模式级隔离：选择性地让哪些模式看见技能，多个来源同名技能只暴露优先级最高的一份。
3、去掉我自己几乎不使用的东西，减少代码实现和后续维护的麻烦。


## 快速开始

```bash
dsh plugin --profile web add github:FlyDut/dsh-skill-group#main
# 重启 dsh web → 设置 → 技能分组 → 市场 → 扫描 → 导入
```

## 社区

本分叉：[Issues](https://github.com/FlyDut/dsh-skill-group/issues) · [Discussions](https://github.com/FlyDut/dsh-skill-group/discussions)。

上游项目及其讨论：[cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
