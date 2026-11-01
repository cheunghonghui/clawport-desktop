import { describe, expect, it, vi } from 'vitest'
import { CLOUD_BUSINESS_CHANNEL } from '../src/shared/cloud-business'
import { createCloudBusinessBridge } from '../src/preload/cloud-business'

describe('ClawPort business preload bridge', () => {
  it('uses one named channel and validates the response envelope', async () => {
    const ipc = { invoke: vi.fn(async () => ({ status: 200, body: { projects: [] } })) }
    const bridge = createCloudBusinessBridge(ipc)
    await expect(bridge.requestClawPort({ method: 'GET', path: '/v1/business-projects' })).resolves.toEqual({ status: 200, body: { projects: [] } })
    expect(ipc.invoke).toHaveBeenCalledWith(CLOUD_BUSINESS_CHANNEL, { method: 'GET', path: '/v1/business-projects' })
  })

  it('rejects malformed response envelopes', async () => {
    const bridge = createCloudBusinessBridge({ invoke: vi.fn(async () => ({ status: '200', body: null })) })
    await expect(bridge.requestClawPort({ method: 'GET', path: '/v1/business-projects' })).rejects.toThrow('invalid cloud business response')
  })
})
