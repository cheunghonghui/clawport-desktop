import { describe, expect, it, vi } from 'vitest'
import { CLOUD_IDENTITY_CHANNELS, type CloudIdentitySnapshot } from '../src/shared/cloud-identity'
import { registerCloudIdentityIpc } from '../src/main/cloud/ipc'

const signedOut: CloudIdentitySnapshot = { phase: 'signedOut', revision: 0, secureStorageAvailable: true }

describe('cloud identity IPC', () => {
  it('accepts only the current main window main frame and broadcasts changes there', async () => {
    const handlers = new Map<string, (event: unknown) => unknown>()
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: (event: unknown) => unknown) => handlers.set(channel, handler))
    }
    let listener: ((snapshot: CloudIdentitySnapshot) => void) | undefined
    const service = {
      snapshot: vi.fn(() => signedOut), startLogin: vi.fn(async () => signedOut),
      refresh: vi.fn(async () => signedOut), revoke: vi.fn(async () => signedOut),
      subscribe: vi.fn((value: typeof listener) => { listener = value; return vi.fn() })
    }
    const mainFrame = {}
    const webContents = { mainFrame, send: vi.fn(), isDestroyed: () => false }
    const window = { isDestroyed: () => false, webContents }
    registerCloudIdentityIpc({ ipcMain, service, getMainWindow: () => window })

    expect(() => handlers.get(CLOUD_IDENTITY_CHANNELS.get)!({ sender: webContents, senderFrame: {} }))
      .toThrow('main ClawPort window')
    expect(await handlers.get(CLOUD_IDENTITY_CHANNELS.startLogin)!({ sender: webContents, senderFrame: mainFrame })).toBe(signedOut)
    listener?.({ ...signedOut, revision: 1 })
    expect(webContents.send).toHaveBeenCalledWith(CLOUD_IDENTITY_CHANNELS.changed, { ...signedOut, revision: 1 })
  })
})
