import type { CloudIdentitySnapshot } from '../../shared/cloud-identity'
import { CLOUD_IDENTITY_CHANNELS } from '../../shared/cloud-identity'

interface IpcEvent {
  sender: unknown
  senderFrame: unknown
}

interface IpcMainLike {
  removeHandler(channel: string): void
  handle(channel: string, listener: (event: IpcEvent) => unknown): void
}

interface WebContentsLike {
  mainFrame: unknown
  isDestroyed(): boolean
  send(channel: string, value: CloudIdentitySnapshot): void
}

interface WindowLike {
  isDestroyed(): boolean
  webContents: WebContentsLike
}

interface CloudIdentityIpcService {
  snapshot(): CloudIdentitySnapshot
  startLogin(): Promise<CloudIdentitySnapshot>
  refresh(): Promise<CloudIdentitySnapshot>
  revoke(): Promise<CloudIdentitySnapshot>
  subscribe(listener: (snapshot: CloudIdentitySnapshot) => void): () => void
}

export function registerCloudIdentityIpc(options: {
  ipcMain: IpcMainLike
  service: CloudIdentityIpcService
  getMainWindow: () => WindowLike | undefined
}): () => void {
  const trusted = (event: IpcEvent): void => {
    const window = options.getMainWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('This action is only available from the main ClawPort window.')
    }
  }
  const register = (channel: string, action: () => unknown): void => {
    options.ipcMain.removeHandler(channel)
    options.ipcMain.handle(channel, event => {
      trusted(event)
      return action()
    })
  }
  register(CLOUD_IDENTITY_CHANNELS.get, () => options.service.snapshot())
  register(CLOUD_IDENTITY_CHANNELS.startLogin, () => options.service.startLogin())
  register(CLOUD_IDENTITY_CHANNELS.refresh, () => options.service.refresh())
  register(CLOUD_IDENTITY_CHANNELS.revoke, () => options.service.revoke())
  const unsubscribe = options.service.subscribe(snapshot => {
    const window = options.getMainWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(CLOUD_IDENTITY_CHANNELS.changed, snapshot)
  })
  return () => {
    unsubscribe()
    for (const channel of [
      CLOUD_IDENTITY_CHANNELS.get,
      CLOUD_IDENTITY_CHANNELS.startLogin,
      CLOUD_IDENTITY_CHANNELS.refresh,
      CLOUD_IDENTITY_CHANNELS.revoke
    ]) options.ipcMain.removeHandler(channel)
  }
}
