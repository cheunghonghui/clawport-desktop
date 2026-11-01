# ClawPort Desktop M3 云端业务接入

## 目标

复用私有平台的 ClawPort 插件，让本地 DSH 的项目、记忆、Skill 和律所流程入口访问云端业务数据。保持原生对话、文件预览和编辑器；本地会话与工作文件留在客户设备。

## 约束

- 桌面主进程持有设备凭据，Renderer 和 Host 不接收云端令牌。
- 公共 Fork 不包含私有插件源码、客户数据或凭据；插件通过固定版本发布包装配。
- 原有浏览器 Cookie 模式和云端 employee-a/b 保持兼容。
- Workspace、Session 与个人记忆按确定的 Runtime 归属，不能按成员猜选某个容器。
- 安全模式保留原生恢复和账号设置，不强制加载业务插件。
- 使用隔离开发 Profile、独立测试数据库。测试并发最多为 2。

## 1. 云端身份与业务接口

扩展 dsh_runtime_bindings 为 managed/desktop 两类。desktop 不填写 Pod 相关部署字段；设备兑换和历史设备回填创建稳定的 Runtime binding。浏览器默认只选择 managed，桌面请求按设备确定 binding。

新增 POST /v1/desktop/cloud/request，接收 method、原有 /v1/ 业务路径及可选 JSON body。通过设备授权推导当前成员、角色、工作区和 Runtime；显式路由表调用既有业务服务，拒绝管理基础设施和任意代理请求。

相关文件位于 packages/contracts、packages/database 及 services/control-api 的 desktop-devices、business-projects、memories。新增迁移、契约及 API 行为测试，验证多设备、成员隔离、撤销和旧浏览器行为。

## 2. 桌面通道

主进程新增业务客户端、受限 IPC 和随机 loopback Host broker。设备令牌由主进程附加；401 只共享续期并重试一次；退出或切换账号使旧响应失效。preload 暴露 requestClawPort，返回业务状态和 JSON 数据。

Host 通过仅本机可达的 broker 与一次性进程 capability 使用相同请求通道。能力凭据随进程生命周期清理。测试覆盖路由约束、续期、退出、来源校验及真实子进程环境。

## 3. 插件与 Web 适配

私有 @clawport/dsh-projects 更新为 0.2.0。各 API factory 注入统一传输函数：Web 保持同源 BFF，桌面通过 preload，Host 通过 broker。账号菜单使用桌面原生账号入口。

身份改变时清理旧账号的缓存、回执和后台任务；Skill 文件置于本机 Runtime 数据目录，按身份分区。复用现有记忆生命周期、Skill 包校验及原子同步实现。

Web 设备代理只增加 cloud/request，固定上游并保留响应状态；上传限额容纳现有 Skill 包契约。

## 4. 私有插件装配

桌面提供固定版本 artifact staging 和构建接入。正常 Profile 装载指定包，公共基础开发无需私有代码，产品装配缺包时明确失败。安全模式不装载业务插件。验证生成包入口和真实客户端加载。

## 5. 验收与交付

先运行改动对应行为测试和类型检查。集成使用实际 Electron、控制 API、Web 设备代理与 PostgreSQL，验证中心数据、Workspace 绑定、记忆回执及 Skill 本地同步。原生 DSH 对话功能不做重复全面验收。

代码审阅后执行桌面仓库要求的全量测试与构建；记录真实验证结果和未覆盖平台，再提交桌面开发分支。云端正式部署、Windows 发行、CUA 和品牌调整在后续阶段进行。

## 开发与验收结果

M3 实现完成，macOS 开发应用与隔离云端服务联调通过。

- 浏览器 OIDC 登录、设备确认、桌面凭据兑换及重启自动续期。
- 云端业务项目展示；工作区行关联项目；项目中心打开本地讨论；重启保留关联。
- 个人记忆列表、详情；Host broker 召回、确认回执；界面展开具体引用。
- 已发布律所 Skill 自动同步，DSH 原生 Skill 列表发现对应本地版本。
- 退出登录立即阻断业务请求，移除律所 Skill 活动链接，保留本地会话。
- 安全模式不加载业务插件、不注入 Host capability，桌面账号状态仍可读取。

自动化验证：Desktop 全量 295 个文件通过、1 个文件跳过，2,935 项通过、5 项跳过；私有插件全套 239 项通过，并补验面板初次挂载的登录态加载显示；Web 设备代理 16 项通过。云端 contracts 329 项、Control API 非 PG 132 项、定向 PostgreSQL 31 项通过。Desktop 构建和类型检查、云端三包及 Web 类型检查通过。

Workspace 接缝对 DSH rc3 干净安装执行了补丁重放验证。插件通过编译发布包装配，公开仓库不包含私有业务源码。

限制：未发布云端正式服务或客户安装包，未验收 Windows。自动记忆提炼通过生命周期测试，本轮未接真实模型生成提炼结果。PostgreSQL memory projection 集成测试的清理需要 superuser，当前隔离角色无法完成，未计入通过数；历史设备授权测试会重建迁移表，未在正在联调的库上执行，实际授权与兑换已通过真实应用验证。
