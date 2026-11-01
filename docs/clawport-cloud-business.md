# ClawPort 云端业务接入

Desktop 在本机运行 DSH Host 和原生 Web UI，ClawPort 云端保存律所项目、成员、记忆和已发布 Skill。本地对话与工作文件仍由当前 Desktop Profile 管理。

## 登录与请求链路

用户在浏览器登录 ClawPort 并确认设备。桌面主进程保存设备凭据，为该设备取得独立的 desktop Runtime binding。

```text
业务面板 → preload.requestClawPort → Electron main
本地 Host → loopback broker → Electron main
Electron main → /api/desktop/cloud/request → ClawPort Control API
```

Renderer 使用限定的 JSON 请求接口；Host 使用每次启动更新的本地 capability。云端访问令牌和续期令牌不进入 Renderer 或 Host。路由范围由 `src/shared/cloud-business.ts` 定义，云端再次验证设备、成员和业务资源权限。

登录续期保留当前业务面板。退出或切换账号立即使旧业务请求失效，清理账号所属的面板、记忆任务和律所 Skill 发布链接。本地会话与用户文件保留。

## 项目与记忆

项目关联从左侧工作区行操作进入，同一工作区的会话继承项目。云端按 desktop Runtime 与本地 Workspace/Session ID 保存关联，因此不同电脑可以使用相同本地 ID。

桌面复用私有插件的记忆中心、召回回执和自动提炼生命周期。自动恢复只处理当前 Runtime 已认领的会话。如果另一账号在同一本地会话继续发送消息，该会话标为混合归属，之后不自动向任何账号召回或提炼记忆；本地对话仍可继续。

## Skill 同步

云端审核发布的律所 Skill 由 Host 同步到当前 Profile。版本缓存按 Runtime 分开，活动目录仅链接当前账号可使用的版本。退出账号移除活动链接，保留版本缓存和用户自行创建的 Skill；再次登录后重新核对发布权限。

## 私有插件装配

公开仓库只维护桌面适配与装配规则。私有 `@clawport/dsh-projects` 以编译发布包提供，固定版本见 `artifact-assembly/clawport-plugin.json`。

```bash
npm run clawport:stage-plugin -- --artifact /path/to/clawport-dsh-projects-0.2.0.tgz
npm run build
```

构建安装包前必须完成 staging；`beforePack` 检查包名、版本和运行入口。普通 Profile 加载业务插件；安全模式只加载内置恢复能力，不注入 Host 业务 capability。

## 上游接缝

当前目标为 DSH `0.2.1-rc.3`。

- DSH 依赖闭包补丁允许装配 `@clawport/dsh-projects`。
- Workspace UI 补丁声明并渲染 `sidebar.workspaces.workspace.row.action`，类型为 list/root，owner 为 `{ workspaceId, displayTitle }`。仅真实工作区行挂载；未分组行不挂载。
- 业务展示与请求逻辑保留在私有插件中。

上游提供等价依赖发现机制或工作区 slot 后，可移除对应补丁。升级时核对插件后端加载、客户端模块发现、slot 挂载和退出账号清理。

## 验证范围

macOS 开发应用使用独立 Profile、实际浏览器设备授权、ClawPort Web 代理和隔离 PostgreSQL 数据库联调。项目、个人记忆详情、记忆召回回执、律所 Skill 同步及原生 Skill 发现均通过实际服务链路验证。

安全模式已实测：业务面板不挂载，Host 不接收业务 capability，桌面账号桥仍可读取登录状态。

限制：尚未发布到云端正式环境，未完成 Windows 和 macOS 安装包验收。本轮未调用真实模型完成自动记忆提炼；自动提炼生命周期和账号归属由插件行为测试覆盖。
