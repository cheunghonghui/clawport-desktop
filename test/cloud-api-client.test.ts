import { describe, expect, it, vi } from 'vitest'
import { CloudApiClient, CloudApiError } from '../src/main/cloud/api-client'

const bootstrap = {
  identity: { memberId: 'member-1', displayName: 'Ada', email: 'ada@example.com', role: 'owner' },
  workspace: { tenantId: 'tenant-1', tenantName: 'ClawPort', projectId: 'project-1', projectName: 'Desktop' },
  device: { id: 'device-1', name: 'Ada Mac', platform: 'darwin', appVersion: '0.1.0' },
  runtime: { id: 'runtime-1', kind: 'desktop' },
  session: { id: 'session-1', accessExpiresAt: '2026-11-01T01:10:00.000Z', refreshExpiresAt: '2026-12-01T01:00:00.000Z' }
} as const

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' }
  })
}

describe('CloudApiClient', () => {
  it('sends the public desktop contract and preserves the user code', async () => {
    const request = vi.fn(async () => response(200, {
      deviceCode: 'secret-device-code',
      userCode: 'AbC-42',
      verificationUri: 'https://clawport.si/desktop/authorize',
      verificationUriComplete: 'https://clawport.si/desktop/authorize?user_code=AbC-42',
      expiresInSeconds: 600,
      intervalSeconds: 5
    }))
    const client = new CloudApiClient('https://clawport.si', request)

    const result = await client.authorize({
      installationId: 'c1720c94-17af-4b41-a8c4-64c4685bcad4',
      deviceName: 'Ada Mac',
      platform: 'darwin',
      appVersion: '0.1.0'
    })

    expect(result.userCode).toBe('AbC-42')
    expect(request).toHaveBeenCalledWith('https://clawport.si/api/desktop/device-authorizations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        clientId: 'clawport-desktop',
        installationId: 'c1720c94-17af-4b41-a8c4-64c4685bcad4',
        deviceName: 'Ada Mac',
        platform: 'darwin',
        appVersion: '0.1.0'
      })
    }))
  })

  it('rejects a browser URL outside the configured origin or exact authorization path', async () => {
    const request = vi.fn(async () => response(200, {
      deviceCode: 'secret-device-code', userCode: 'ABC-42',
      verificationUri: 'https://evil.example/desktop/authorize',
      verificationUriComplete: 'https://clawport.si/desktop/authorize/extra?user_code=ABC-42',
      expiresInSeconds: 600, intervalSeconds: 5
    }))

    await expect(new CloudApiClient('https://clawport.si', request).authorize({
      installationId: 'c1720c94-17af-4b41-a8c4-64c4685bcad4', deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0'
    })).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it.each([
    [202, { status: 'pending', intervalSeconds: 7 }, 'pending'],
    [403, { code: 'access_denied', message: 'Declined' }, 'access_denied'],
    [410, { code: 'expired_token', message: 'Expired' }, 'expired_token'],
    [429, { code: 'slow_down', intervalSeconds: 9 }, 'slow_down']
  ])('maps token response %s to %s', async (status, body, code) => {
    const client = new CloudApiClient('https://clawport.si', async () => response(status, body))
    await expect(client.exchange('device-code')).rejects.toEqual(expect.objectContaining({ code }))
  })

  it('returns a validated token set without leaking it into errors', async () => {
    const client = new CloudApiClient('https://clawport.si', async () => response(200, {
      tokenType: 'Bearer', accessToken: 'access-secret', expiresInSeconds: 600,
      refreshToken: 'refresh-secret', refreshExpiresInSeconds: 2_592_000, bootstrap
    }))
    const result = await client.exchange('device-code')
    expect(result.bootstrap).toEqual(bootstrap)
    expect(result.refreshToken).toBe('refresh-secret')
  })

  it('classifies request failures as offline without including request secrets', async () => {
    const client = new CloudApiClient('https://clawport.si', async () => {
      throw new Error('socket closed')
    })
    await expect(client.refresh('refresh-secret')).rejects.toEqual(expect.objectContaining({
      code: 'offline', message: 'ClawPort is unavailable.'
    }))
    await expect(client.refresh('refresh-secret')).rejects.not.toThrow('refresh-secret')
    expect(CloudApiError).toBeTypeOf('function')
  })

  it('keeps an unauthorized logout distinct so the service can refresh and retry', async () => {
    const client = new CloudApiClient('https://clawport.si', async () => response(401, {
      code: 'reauth_required', message: 'Access token expired.'
    }))
    await expect(client.revoke('expired-access')).rejects.toMatchObject({ code: 'access_unauthorized' })
  })
})
