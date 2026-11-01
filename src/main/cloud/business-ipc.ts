import { assertCloudBusinessRequest, CLOUD_BUSINESS_CHANNEL, type CloudBusinessResponse } from '../../shared/cloud-business'

interface IpcEvent {
  sender: unknown
  senderFrame: unknown
}

interface IpcMainLike {
  removeHandler(channel: string): void
  handle(channel: string, listener: (event: IpcEvent, value: unknown) => unknown): void
}

interface WindowLike {
  isDestroyed(): boolean
  webContents: { mainFrame: unknown }
}

export function registerCloudBusinessIpc(options: {
  ipcMain: IpcMainLike
  request(value: unknown): Promise<CloudBusinessResponse>
  getMainWindow: () => WindowLike | undefined
}): () => void {
  options.ipcMain.removeHandler(CLOUD_BUSINESS_CHANNEL)
  options.ipcMain.handle(CLOUD_BUSINESS_CHANNEL, (event, value) => {
    const window = options.getMainWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('This action is only available from the main ClawPort window.')
    }
    return options.request(assertCloudBusinessRequest(value))
  })
  return () => options.ipcMain.removeHandler(CLOUD_BUSINESS_CHANNEL)
}
