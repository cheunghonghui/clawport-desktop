import type { DesktopBootstrap, TokenSet } from '../../shared/cloud-identity'

const CLIENT_ID = 'clawport-desktop'
const JSON_HEADERS = { 'content-type': 'application/json' }
const ROLES = new Set(['owner', 'admin', 'operator', 'member', 'viewer'])

export type CloudApiErrorCode =
  | 'offline'
  | 'invalid_response'
  | 'pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  | 'access_unauthorized'
  | 'reauth_required'
  | 'device_revoked'
  | 'server_error'

export class CloudApiError extends Error {
  constructor(
    readonly code: CloudApiErrorCode,
    message: string,
    readonly intervalSeconds?: number
  ) {
    super(message)
    this.name = 'CloudApiError'
  }
}

export interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresInSeconds: number
  intervalSeconds: number
}

export interface CloudApi {
  authorize(input: {
    installationId: string
    deviceName: string
    platform: 'darwin' | 'win32'
    appVersion: string
  }): Promise<DeviceAuthorization>
  exchange(deviceCode: string): Promise<TokenSet>
  refresh(refreshToken: string): Promise<TokenSet>
  bootstrap(accessToken: string): Promise<DesktopBootstrap>
  revoke(accessToken: string): Promise<void>
}

type Request = (url: string, init: RequestInit) => Promise<Response>

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return value as Record<string, unknown>
}

function string(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return value
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return value as number
}

function isoDate(value: unknown): string {
  const result = string(value) as string
  if (!Number.isFinite(Date.parse(result))) {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return result
}

function parseBootstrap(value: unknown): DesktopBootstrap {
  const body = record(value)
  const identity = record(body.identity)
  const workspace = record(body.workspace)
  const device = record(body.device)
  const runtime = record(body.runtime)
  const session = record(body.session)
  if (!ROLES.has(identity.role as string) || (device.platform !== 'darwin' && device.platform !== 'win32') || runtime.kind !== 'desktop') {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return {
    identity: {
      memberId: string(identity.memberId) as string,
      displayName: string(identity.displayName) as string,
      email: string(identity.email, true),
      role: identity.role as DesktopBootstrap['identity']['role']
    },
    workspace: {
      tenantId: string(workspace.tenantId) as string,
      tenantName: string(workspace.tenantName) as string,
      projectId: string(workspace.projectId) as string,
      projectName: string(workspace.projectName) as string
    },
    device: {
      id: string(device.id) as string,
      name: string(device.name) as string,
      platform: device.platform,
      appVersion: string(device.appVersion) as string
    },
    runtime: { id: string(runtime.id) as string, kind: 'desktop' },
    session: {
      id: string(session.id) as string,
      accessExpiresAt: isoDate(session.accessExpiresAt),
      refreshExpiresAt: isoDate(session.refreshExpiresAt)
    }
  }
}

function parseTokenSet(value: unknown): TokenSet {
  const body = record(value)
  if (body.tokenType !== 'Bearer') {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
  return {
    tokenType: 'Bearer',
    accessToken: string(body.accessToken) as string,
    expiresInSeconds: positiveInteger(body.expiresInSeconds),
    refreshToken: string(body.refreshToken) as string,
    refreshExpiresInSeconds: positiveInteger(body.refreshExpiresInSeconds),
    bootstrap: parseBootstrap(body.bootstrap)
  }
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new CloudApiError('invalid_response', 'ClawPort returned an invalid response.')
  }
}

function publicMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string' && body.message.length <= 240) {
    return body.message
  }
  return fallback
}

export class CloudApiClient implements CloudApi {
  private readonly origin: string

  constructor(origin: string, private readonly request: Request) {
    const parsed = new URL(origin)
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Cloud origin must contain only a scheme and authority.')
    }
    this.origin = parsed.origin
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.request(`${this.origin}/api/desktop/${path}`, {
        ...init,
        headers: { ...JSON_HEADERS, ...init.headers },
        redirect: 'error',
        signal: init.signal ?? AbortSignal.timeout(15_000)
      })
    } catch (error) {
      if (error instanceof CloudApiError) throw error
      throw new CloudApiError('offline', 'ClawPort is unavailable.')
    }
  }

  async authorize(input: Parameters<CloudApi['authorize']>[0]): Promise<DeviceAuthorization> {
    const response = await this.send('device-authorizations', {
      method: 'POST', body: JSON.stringify({ clientId: CLIENT_ID, ...input })
    })
    if (response.status !== 200) throw new CloudApiError('server_error', 'Cloud login could not be started.')
    const body = record(await json(response))
    const verificationUri = string(body.verificationUri) as string
    const verificationUriComplete = string(body.verificationUriComplete) as string
    for (const value of [verificationUri, verificationUriComplete]) {
      const url = new URL(value)
      if (url.origin !== this.origin || url.pathname !== '/desktop/authorize') {
        throw new CloudApiError('invalid_response', 'ClawPort returned an invalid authorization URL.')
      }
    }
    return {
      deviceCode: string(body.deviceCode) as string,
      userCode: string(body.userCode) as string,
      verificationUri,
      verificationUriComplete,
      expiresInSeconds: positiveInteger(body.expiresInSeconds),
      intervalSeconds: positiveInteger(body.intervalSeconds)
    }
  }

  async exchange(deviceCode: string): Promise<TokenSet> {
    const response = await this.send('device-authorizations/token', {
      method: 'POST', body: JSON.stringify({ clientId: CLIENT_ID, deviceCode })
    })
    if (response.status === 200) return parseTokenSet(await json(response))
    const body = await json(response)
    const values = record(body)
    if (response.status === 202 && values.status === 'pending') {
      throw new CloudApiError('pending', 'Authorization is pending.', positiveInteger(values.intervalSeconds))
    }
    if (response.status === 403 && values.code === 'access_denied') {
      throw new CloudApiError('access_denied', publicMessage(values, 'Cloud login was declined.'))
    }
    if (response.status === 410 && values.code === 'expired_token') {
      throw new CloudApiError('expired_token', publicMessage(values, 'The cloud login code expired.'))
    }
    if (response.status === 429 && values.code === 'slow_down') {
      throw new CloudApiError('slow_down', 'Authorization polling slowed down.', positiveInteger(values.intervalSeconds))
    }
    throw new CloudApiError('server_error', 'Cloud login could not be completed.')
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    const response = await this.send('device-sessions/refresh', {
      method: 'POST', body: JSON.stringify({ clientId: CLIENT_ID, refreshToken })
    })
    if (response.status === 200) return parseTokenSet(await json(response))
    const body = record(await json(response))
    if (response.status === 401 && (body.code === 'reauth_required' || body.code === 'device_revoked')) {
      throw new CloudApiError(body.code, publicMessage(body, 'Cloud sign-in is required.'))
    }
    throw new CloudApiError('server_error', 'Cloud identity could not be refreshed.')
  }

  async bootstrap(accessToken: string): Promise<DesktopBootstrap> {
    const response = await this.send('bootstrap', {
      method: 'GET', headers: { authorization: `Bearer ${accessToken}` }
    })
    if (response.status === 200) return parseBootstrap(await json(response))
    if (response.status === 401) throw new CloudApiError('reauth_required', 'Cloud sign-in is required.')
    throw new CloudApiError('server_error', 'Cloud identity could not be loaded.')
  }

  async revoke(accessToken: string): Promise<void> {
    const response = await this.send('device-sessions/current', {
      method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` }
    })
    if (response.status === 204) return
    if (response.status === 401) throw new CloudApiError('access_unauthorized', 'Cloud access expired.')
    throw new CloudApiError('server_error', 'Cloud logout could not be completed.')
  }
}
