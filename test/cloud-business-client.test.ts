import { describe, expect, it, vi } from 'vitest'
import type { CloudBusinessRequest } from '../src/shared/cloud-business'
import { CloudBusinessClient, type CloudBusinessCredential } from '../src/main/cloud/business-client'

const runtimeA = '00000000-0000-4000-8000-000000000901'
const runtimeB = '00000000-0000-4000-8000-000000000902'
const request: CloudBusinessRequest = { method: 'GET', path: '/v1/business-projects', expectedRuntimeId: runtimeA }

function credential(accessToken = 'access-a', epoch = 1, runtimeId = runtimeA): CloudBusinessCredential {
  return { accessToken, epoch, runtimeId }
}

describe('ClawPort cloud business client', () => {
  it('posts the fixed envelope with only the main-process bearer credential', async () => {
    const send = vi.fn(async () => Response.json({ projects: [] }, { status: 200 }))
    const auth = { credential: vi.fn(() => credential()), refresh: vi.fn(), isCurrent: vi.fn(() => true) }
    const client = new CloudBusinessClient('https://cloud.example', send, auth)

    await expect(client.request(request)).resolves.toEqual({ status: 200, body: { projects: [] } })
    expect(send).toHaveBeenCalledWith('https://cloud.example/api/desktop/cloud/request', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer access-a', 'content-type': 'application/json' }),
      body: JSON.stringify(request),
      redirect: 'error'
    }))
  })

  it('shares one refresh for concurrent 401 responses and retries each request once', async () => {
    let active = credential()
    const send = vi.fn(async (_url: string, init: RequestInit) => {
      const authorization = (init.headers as Record<string, string>).authorization
      return authorization === 'Bearer access-a'
        ? Response.json({ code: 'expired' }, { status: 401 })
        : Response.json({ projects: [] }, { status: 200 })
    })
    let release!: () => void
    const refresh = vi.fn(() => new Promise<void>(resolve => {
      release = () => { active = credential('access-b', 1); resolve() }
    }))
    const auth = { credential: () => active, refresh, isCurrent: (value: CloudBusinessCredential) => value.epoch === active.epoch }
    const client = new CloudBusinessClient('https://cloud.example', send, auth)

    const first = client.request(request)
    const second = client.request(request)
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 200, body: { projects: [] } },
      { status: 200, body: { projects: [] } }
    ])
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('returns the second 401 without another refresh', async () => {
    const send = vi.fn(async () => Response.json({ code: 'expired' }, { status: 401 }))
    const auth = { credential: () => credential(), refresh: vi.fn(async () => undefined), isCurrent: () => true }
    const client = new CloudBusinessClient('https://cloud.example', send, auth)
    await expect(client.request(request)).resolves.toEqual({ status: 401, body: { code: 'expired' } })
    expect(send).toHaveBeenCalledTimes(2)
    expect(auth.refresh).toHaveBeenCalledOnce()
  })

  it('rejects an old runtime fence locally and never sends it to the cloud', async () => {
    const send = vi.fn()
    const auth = { credential: () => credential('access-b', 2, runtimeB), refresh: vi.fn(), isCurrent: () => true }
    const client = new CloudBusinessClient('https://cloud.example', send, auth)
    await expect(client.request(request)).resolves.toEqual({
      status: 409,
      body: { code: 'runtime_changed', message: 'The ClawPort runtime identity changed.' }
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('invalidates a response completed after logout or account switch', async () => {
    let active = credential()
    let resolveResponse!: (value: Response) => void
    const send = vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve }))
    const auth = { credential: () => active, refresh: vi.fn(), isCurrent: (value: CloudBusinessCredential) => value.epoch === active.epoch }
    const client = new CloudBusinessClient('https://cloud.example', send, auth)
    const pending = client.request(request)
    active = credential('access-b', 2, runtimeB)
    resolveResponse(Response.json({ projects: [{ id: 'old' }] }))
    await expect(pending).resolves.toEqual({
      status: 409,
      body: { code: 'identity_changed', message: 'The ClawPort account changed while the request was running.' }
    })
  })
})
