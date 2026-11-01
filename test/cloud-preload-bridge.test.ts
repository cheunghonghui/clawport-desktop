import { describe, expect, it, vi } from 'vitest'
import { CLOUD_IDENTITY_CHANNELS } from '../src/shared/cloud-identity'
import { createCloudIdentityBridge } from '../src/preload/cloud-identity'

describe('cloud identity preload bridge', () => {
  it('uses named channels, validates snapshots, and owns event cleanup', async () => {
    const snapshot = { phase: 'signedOut', revision: 0, secureStorageAvailable: true } as const
    let receive: ((_event: unknown, value: unknown) => void) | undefined
    const ipc = {
      invoke: vi.fn(async () => snapshot),
      on: vi.fn((_channel: string, listener: typeof receive) => { receive = listener }),
      removeListener: vi.fn()
    }
    const bridge = createCloudIdentityBridge(ipc)
    expect(await bridge.getCloudIdentity()).toEqual(snapshot)
    expect(ipc.invoke).toHaveBeenCalledWith(CLOUD_IDENTITY_CHANNELS.get)

    const listener = vi.fn()
    const dispose = bridge.onCloudIdentityChanged(listener)
    receive?.({}, { ...snapshot, revision: 1 })
    receive?.({}, { phase: 'connected', revision: 'wrong' })
    expect(listener).toHaveBeenCalledOnce()
    dispose()
    expect(ipc.removeListener).toHaveBeenCalledWith(CLOUD_IDENTITY_CHANNELS.changed, receive)
  })

  it('rejects malformed invoke responses', async () => {
    const bridge = createCloudIdentityBridge({
      invoke: vi.fn(async () => ({ phase: 'connected', revision: 1, secureStorageAvailable: true, identity: { memberId: 42 } })),
      on: vi.fn(), removeListener: vi.fn()
    })
    await expect(bridge.refreshCloudIdentity()).rejects.toThrow('invalid cloud identity')
  })
})
