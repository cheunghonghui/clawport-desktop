# ClawPort Desktop 开发计划

**目标：** 以现有 DSH Desktop 为基础提供本地 Agent、云端业务服务的 ClawPort 桌面产品。

**架构：** Electron 主进程管理本地 DSH 和桌面权限；原生 DSH Web 继续提供对话和文件交互；ClawPort 插件连接平台 API。平台和桌面分仓库维护，插件通过固定版本发布包复用。

**技术栈：** Electron、TypeScript、electron-vite、electron-builder、DSH 0.2.1-rc.3、Vitest。

**设计：** [ClawPort Desktop 设计](../specs/2026-11-01-clawport-desktop-design.md)。

## 全局约束

- 上游起点固定为 1a6212edb321509c3ee00e5d857fadfce13a7790。
- 先验证 macOS arm64；不以 macOS 测试替代 Windows 验收。
- 不自动导入用户现有 DSH 数据；保留用户主动导入入口，不调用上游产品的更新或统计服务。
- 保留原生 DSH Web 与必要的恢复机制；不另建对话前端。
- 插件源码继续在平台仓库维护；公共 Fork 不包含业务源码、客户数据或凭据。
- 本轮执行 M1；M2–M4 为后续依赖明确的产品里程碑。

## M1：独立桌面发行基础（本轮）

### 任务 1：仓库与运行身份

文件：package.json、package-lock.json、electron-builder.dev.cjs、src/main/product-config.ts、src/main/development-environment.ts、src/main/index.ts、src/main/version-info.ts，以及对应 test/ 文件。

- [x] 创建 cheunghonghui/clawport-desktop Fork，保留上游 main 历史并配置 upstream。
- [x] 创建 codex/clawport-desktop-foundation 分支。
- [x] 使用 ClawPort 应用名称、独立应用 ID 与正式/开发数据目录；保留依赖锁定版本。
- [x] 采用独立的默认本地端口，允许通过现有开发环境变量覆盖；拒绝使用上游正式/开发数据目录。
- [x] About 展示 ClawPort 版本和真实内置 Harness 版本。
- [x] 更新身份和目录测试，确认不会落入原有 DSH 数据目录；确认发行配置与实际运行身份一致。

### 任务 2：隔离发行服务

文件：src/main/desktop-service/index.ts、src/main/update/update-manager.ts、.github/workflows/ 及 test/ 中对应测试。

接口：保持已有更新 API 和状态类型，ClawPort 尚未配置更新源时返回 unsupported；历史版本列表为空，回滚不可用。

- [x] 阻止上游安装注册、统计和故障上传初始化，保留本地日志。
- [x] 自动检查、手动检查、下载、历史版本、回滚统一进入不可用状态，不触发上游网络请求。
- [x] 移除安装包中的上游 publish 配置与 Windows 发布者身份。
- [x] 为上游发布、归档及反馈工作流增加仓库归属约束；ClawPort 使用独立 CI，自有签名发布在 M4 接通。
- [x] 补行为测试：直接调用公开更新入口及 IPC 列表入口时，网络和 updater 方法均不执行。

### 任务 3：本地验证与交付记录

- [x] 完成 npm ci，包括 postinstall。
- [x] 运行身份、开发目录、更新行为、版本信息相关测试；失败时按实际来源修复。
- [x] 运行 npm run typecheck、npm run build、git diff --check。
- [x] 以独立开发 Profile 启动应用，确认实际 DSH Web 挂载及数据目录；原生导入入口按用户选择保留。
- [x] 提交前运行 `npm test -- --maxWorkers=2`：2859 通过、5 跳过。
- [x] 完成源码审查，保存[验证记录](../../verification/2026-11-01-desktop-foundation.md)。

## M2：云端设备身份

主要在 clawport-platform 实现，再接桌面。

1. 将 Runtime 身份与 Kubernetes 部署字段分开，新增桌面设备归属。
2. 提供设备授权创建、用户确认、授权轮询/兑换、刷新、撤销接口；响应包含用户、律所、设备与 Runtime 标识。
3. 桌面系统浏览器登录，主进程保存设备凭据；退出、撤销、过期及网络中断给出可恢复状态。
4. 验证两名用户、同一用户两台设备的权限与 Workspace 归属，避免使用 employee-a/b 测试凭据。

交付标准：桌面登录后可获取云端 bootstrap，重启可恢复身份，云端撤销立即阻止后续业务调用。

## M3：项目、记忆与 Skill 接入

1. 在平台插件中注入可替换的云端传输实现，保留 Web 同源方式。
2. 桌面通过受限 IPC/Host 桥调用云 API，凭据不进入聊天页面。
3. 对齐 rc.3 的客户端 slot 与 Host 生命周期契约，使用固定版本插件包安装。
4. 将 Linux 固定 Skill 路径改为 Runtime 数据目录；验证正常 Profile 和安全模式恢复。
5. 验证项目列表与 Workspace 绑定、记忆读取/回执、Skill 获取及本地安装。记忆检索质量调整独立跟踪。

交付标准：原生 DSH 对话体验保留，三个中心实际加载云端数据，桌面设备权限与归属正确。

## M4：客户分发

1. 应用图标、启动页及品牌资源采用已确定的 ClawPort 设计。
2. macOS arm64/x64、Windows x64 原生构建、签名及安装验证。
3. 自有更新源上线后接通更新；验证升级保留本地会话、Workspace、凭据及插件。
4. 明确模型 API 配置或云端统一计费方式，提供安装与卸载说明。
5. 单独评估手机常驻 WSS 和 CUA，不将临时隧道等同于客户生产中继服务。

## 上游维护

保留 upstream remote 与原始 MIT 声明。每次升级固定上游提交和 DSH 版本，先核对插件接口与补丁，再构建目标平台安装包。桌面发行和云端 API 独立版本化；不自动同步并发布上游 main。
