# ClawPort Desktop M1 验证记录

## 环境与范围

- 上游基线：`1a6212edb321509c3ee00e5d857fadfce13a7790`。
- macOS arm64，24 GB 内存，Node 24.18.0，Electron 43.0.0，DSH 0.2.1-rc.3。
- 验证应用身份、数据目录、更新及发行服务隔离。云端登录与业务插件属于后续里程碑。

## 已验证

- `npm ci --no-audit --no-fund` 完整成功，包含补丁、品牌资源安装和 Electron 安装。
- `npm test -- --maxWorkers=2`：281 个测试文件通过、1 个跳过；2859 项通过、5 项跳过。
- `npm run typecheck` 通过。
- `npm run build` 通过，包含 Office/PPT 资源和主进程、preload 构建。
- 更新隔离行为覆盖自动/手动检查、下载、历史版本、回滚、IPC 初始状态及安装统计服务。
- 实际启动独立开发 Profile，窗口名称为 ClawPort Dev；原生 DSH Web 的工作区列表和输入区已挂载。
- 原生数据导入入口保留，用户主动选择后可以导入已有 DSH 数据。独立应用身份不等于禁止用户导入。
- 上游发行、归档和问题反馈工作流仅允许上游仓库执行；ClawPort 使用独立只读 CI。
- 原生菜单和 About 实际显示 ClawPort 0.1.0 / Harness 0.2.1-rc.3，隐藏不可用更新及版本切换入口。
- 源码审查无剩余实质问题，`git diff --check` 通过。

## 本地内存观察

应用空闲时对六个相关进程采集 macOS physical footprint，两次采样合计约 690 MB 与 680 MB。DSH Node 服务约 338 MB，页面约 116–130 MB，主进程约 103 MB，GPU 约 103 MB，其余服务约 17 MB。该指标与仅统计驻留页的 RSS 不同。

短时采样没有持续增长；这不是长会话、文件预览或多任务场景的内存上限测试。完整测试会启动多个 Harness 和文档渲染子进程，本地执行限制为两个 worker。

## 验证限制

- 尚未验证 Windows、macOS x64 安装包、签名、公证和升级。
- GitHub 托管 CI 尚未执行；本地通过不等于线上工作流已通过。
- 云端设备登录、记忆/项目/Skill 插件、完整品牌资源和自有更新源尚未交付。

## 相关回归文件

- 身份与菜单：`development-environment.test.ts`、`version-info.test.ts`、`enterprise-entry.test.ts`、`windows-titlebar.test.ts`。
- 更新隔离：`clawport-update-isolation.test.ts`、`desktop-update-ui.test.ts`、`update-rollout.test.ts`、`application-rollback-manager.test.ts`。
- 发行与工作流：`clawport-workflows.test.ts`、`release.test.ts`、`release-ci-scheduling.test.mjs`、`release-publish-recovery.test.mjs`。
- 权限契约：`security-policy.test.ts` 验证显式音频授权、缺少媒体类型和视频请求拒绝；应用权限实现保持不变。
