import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudHostBroker } from '../src/main/cloud/host-broker'

const brokers: CloudHostBroker[] = []

afterEach(async () => {
  await Promise.all(brokers.splice(0).map(broker => broker.stop()))
})

describe('ClawPort Host loopback broker', () => {
  it('binds loopback, rejects browser origins and credentials other than the launch capability', async () => {
    const broker = new CloudHostBroker({
      request: vi.fn(async () => ({ status: 200, body: { projects: [] } })),
      identity: () => ({ phase: 'connected', revision: 1, secureStorageAvailable: true })
    })
    brokers.push(broker)
    const launch = await broker.startLaunch()
    expect(new URL(launch.origin).hostname).toBe('127.0.0.1')

    const invalid = await fetch(`${launch.origin}/cloud/request`, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' })
    expect(invalid.status).toBe(401)
    const browser = await fetch(`${launch.origin}/cloud/request`, {
      method: 'POST', headers: { authorization: `Bearer ${launch.capability}`, origin: 'https://example.test' }, body: '{}'
    })
    expect(browser.status).toBe(403)
  })

  it('returns public identity and preserves the cloud response HTTP status', async () => {
    const request = vi.fn(async () => ({ status: 409, body: { code: 'runtime_changed' } }))
    const broker = new CloudHostBroker({
      request,
      identity: () => ({
        phase: 'connected', revision: 2, secureStorageAvailable: true,
        identity: { memberId: 'member-a', displayName: 'Alice', email: null, role: 'member' },
        runtime: { id: 'runtime-a', kind: 'desktop' }
      })
    })
    brokers.push(broker)
    const launch = await broker.startLaunch()
    const headers = { authorization: `Bearer ${launch.capability}` }
    const identity = await fetch(`${launch.origin}/cloud/identity`, { headers })
    expect(identity.status).toBe(200)
    expect(JSON.stringify(await identity.json())).not.toContain('access')

    const response = await fetch(`${launch.origin}/cloud/request`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: '/v1/business-projects', expectedRuntimeId: 'runtime-old' })
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'runtime_changed' })
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/v1/business-projects', expectedRuntimeId: 'runtime-old' })
  })

  it('rotates the capability for each Host launch', async () => {
    const broker = new CloudHostBroker({ request: vi.fn(), identity: () => ({ phase: 'signedOut', revision: 0, secureStorageAvailable: true }) })
    brokers.push(broker)
    const first = await broker.startLaunch()
    const second = await broker.startLaunch()
    expect(second.origin).toBe(first.origin)
    expect(second.capability).not.toBe(first.capability)
    expect((await fetch(`${first.origin}/cloud/identity`, { headers: { authorization: `Bearer ${first.capability}` } })).status).toBe(401)
  })

  it('revokes the launch capability when the Harness process stops', async () => {
    const broker = new CloudHostBroker({ request: vi.fn(), identity: () => ({ phase: 'signedOut', revision: 0, secureStorageAvailable: true }) })
    brokers.push(broker)
    const launch = await broker.startLaunch()
    broker.clearLaunch()
    expect((await fetch(`${launch.origin}/cloud/identity`, {
      headers: { authorization: `Bearer ${launch.capability}` }
    })).status).toBe(401)
  })
})
