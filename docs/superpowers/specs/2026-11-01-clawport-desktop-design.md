# ClawPort Desktop 设计

## 产品边界

ClawPort Desktop 基于 dataelement/dsh-desktop，复用 Electron 宿主、本地 DSH Host 和原生 DSH Web。账号、律所权限、项目、已发布 Skill、记忆及 Hindsight 由 ClawPort 云端提供。本地保存会话、Workspace 文件和运行配置。

桌面仓库与 clawport-platform 分离。ClawPort 插件源码继续在平台仓库维护，桌面使用固定版本的发布包；业务源码、客户数据和凭据不复制到公共 Fork。

## 基线

- 上游：dataelement/dsh-desktop。
- 起点：1a6212edb321509c3ee00e5d857fadfce13a7790。
- DSH：0.2.1-rc.3，保留锁文件中的依赖版本。
- 仓库：cheunghonghui/clawport-desktop，main 保留起点，开发使用 codex/clawport-desktop-foundation。
- 首个验证平台：macOS arm64。后续支持 macOS x64、Windows x64。

## 桌面发行基础

应用显示名称为 ClawPort，正式数据目录为 clawport-desktop，开发目录为 clawport-desktop-dev。应用 ID 使用 com.clawport.desktop；开发包使用独立 ID。原有 DSH Desktop 安装及数据目录保持独立，不自动导入；保留原生导入入口，由用户明确选择是否导入已有 DSH 数据。

保留 DSH Web 的聊天、文件预览与输入交互。产品识别只修改宿主身份和必要配置，视觉资源在客户分发阶段统一处理。

ClawPort 自有更新服务上线前，桌面更新处于不可用状态。自动检查、手动检查、历史版本下载和应用回滚均不调用上游发行服务；上游安装统计与故障上传不初始化。本地日志和本地故障恢复保留。应用签名使用 ClawPort 自身证书，不继承上游发布者身份。

## 云端身份与请求

现有账号和律所权限继续由平台服务维护。新增桌面设备注册及撤销，设备凭据关联用户、律所和本地 Runtime，不能携带 Pod Service/PVC 等必填部署字段。

登录通过系统浏览器进行；后端先提供明确的设备授权协议，再实现客户端。主进程负责凭据续期与存储，渲染进程只接收登录状态和业务响应。刷新凭据使用系统支持的安全存储，访问凭据保存在内存；退出撤销设备会话并清除本机凭据。

插件的云端调用通过受限的请求通道进入主进程，主进程固定云端 origin 并附加身份。仅允许 ClawPort 业务 API 路径和明确方法，沿用现有 IPC 发送者验证。Host 自动记忆任务使用同一设备身份对应的服务凭据。不得在公共安装包中预置客户模型密钥或云端管理凭据。

## 插件与数据归属

桌面与云端容器共用插件业务实现，通过不同传输适配器接入平台。Workspace/Session 关联按用户及 Runtime/设备分区；相同本地路径在不同设备上不被当作同一 Workspace。

系统插件安装与安全模式需要单独验证。安全模式保留可恢复入口，不能因强制加载失败的业务插件而失去恢复能力。业务权限始终在云端校验，插件可见性不是授权边界。

## 后续范围

设备授权、插件接入、平台安装包分别交付。完整 CUA、Linux、Windows ARM64、跨设备历史同步和新手机公网中继单独规划。现有云端 employee-a/b 保持当前部署，桌面阶段不以其共享凭据替代设备身份。
