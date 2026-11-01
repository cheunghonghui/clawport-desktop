# ClawPort 云端账号

桌面端在本机运行 Harness。ClawPort 账号通过系统浏览器登录，在确认页核对设备确认码、账号和工作区后连接桌面端。入口位于原生设置的「ClawPort 账号」，普通模式和安全模式均可使用。

## 身份与凭据

每个安装配置保存独立的安装标识。同一账号在同一工作区重新授权时，云端复用设备和本地运行标识，并撤销该设备原来的登录会话。安装标识本身不能访问账号。

访问令牌有效期为 10 分钟，只保存在主进程内存中。刷新令牌由操作系统安全存储加密后保存，有效期为 30 天，成功续期会轮换令牌。桌面端在访问令牌到期前自动续期，重新启动时通过刷新令牌恢复身份。

系统安全存储不可用时，账号登录不可用。原生错误和网络凭据不会通过 IPC 暴露给网页；渲染进程仅获得账号状态及公开身份信息。

断网时保留加密凭据并重试。退出只有在云端撤销完成后才显示成功；未完成的退出会持久保存，重新打开客户端后继续处理。成员被停用、设备被撤销或刷新令牌过期时需要重新登录。

## 开发配置

默认云端地址为 `https://clawport.si`。`CLAWPORT_CLOUD_ORIGIN` 可配置其他 HTTPS 服务地址。开发版额外允许 loopback HTTP 地址；与 Next.js 本地开发服务联调时使用其返回的 canonical origin，例如 `http://localhost:3047`。

使用独立 `DSH_DEV_PROFILE`，并为并行开发配置不同的 `DSH_DEV_HARNESS_PORT` 与 `DSH_DEV_MOBILE_PORT`。已有配置中的会话和导入数据由原生 Harness 管理。

云端需要提供以下设备接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/desktop/device-authorizations` | 申请设备确认码 |
| POST | `/api/desktop/device-authorizations/token` | 等待浏览器批准并兑换令牌 |
| POST | `/api/desktop/device-sessions/refresh` | 续期并轮换令牌 |
| GET | `/api/desktop/bootstrap` | 查询当前账号、工作区和设备身份 |
| DELETE | `/api/desktop/device-sessions/current` | 撤销当前设备会话 |

浏览器确认地址为 `/desktop/authorize`，使用现有 ClawPort 登录流程。浏览器批准时提交页面展示的成员和工作区标识；如果其他标签页已经切换了身份，云端拒绝该次批准，要求重新核对。

## 当前范围

M2 提供云端账号与设备身份基础。设备令牌仅适用于设备接口；项目、记忆和 Skill 的业务访问由后续 M3 集成。客户端发行与云端服务发布需要配套进行。
