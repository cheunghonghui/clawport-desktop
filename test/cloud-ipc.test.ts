import { describe, expect, it, vi } from 'vitest'
import { CLOUD_IDENTITY_CHANNELS, type CloudIdentitySnapshot } from '../src/shared/cloud-identity'
import { registerCloudIdentityIpc } from '../src/main/cloud/ipc'
import { registerCloudBusinessIpc } from '../src/main/cloud/business-ipc'
import { CLOUD_BUSINESS_CHANNEL } from '../src/shared/cloud-business'

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

describe('cloud business IPC', () => {
  it('accepts a validated business request only from the current main frame', async () => {
    const handlers = new Map<string, (event: unknown, value: unknown) => unknown>()
    const ipcMain = {
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handle: vi.fn((channel: string, handler: (event: unknown, value: unknown) => unknown) => handlers.set(channel, handler))
    }
    const mainFrame = {}
    const webContents = { mainFrame }
    const window = { isDestroyed: () => false, webContents }
    const request = vi.fn(async () => ({ status: 200, body: { projects: [] } }))
    registerCloudBusinessIpc({ ipcMain, request, getMainWindow: () => window })

    await expect(handlers.get(CLOUD_BUSINESS_CHANNEL)!({ sender: webContents, senderFrame: mainFrame }, {
      method: 'GET', path: '/v1/business-projects'
    })).resolves.toEqual({ status: 200, body: { projects: [] } })
    expect(() => handlers.get(CLOUD_BUSINESS_CHANNEL)!({ sender: webContents, senderFrame: {} }, {
      method: 'GET', path: '/v1/business-projects'
    })).toThrow('main ClawPort window')
    expect(() => handlers.get(CLOUD_BUSINESS_CHANNEL)!({ sender: webContents, senderFrame: mainFrame }, {
      method: 'GET', path: '/v1/infrastructure/runtime-targets'
    })).toThrow('cloud business request')
  })
})
