import { describe, expect, it, vi } from 'vitest'
import { CloudApiError, type CloudApi } from '../src/main/cloud/api-client'
import { CloudIdentityService, type CloudIdentityVault } from '../src/main/cloud/service'
import type { DesktopBootstrap, TokenSet } from '../src/shared/cloud-identity'

const bootstrap: DesktopBootstrap = {
  identity: { memberId: 'member-1', displayName: 'Ada', email: null, role: 'owner' },
  workspace: { tenantId: 'tenant-1', tenantName: 'ClawPort', projectId: 'project-1', projectName: 'Desktop' },
  device: { id: 'device-1', name: 'Ada Mac', platform: 'darwin', appVersion: '0.1.0' },
  runtime: { id: 'runtime-1', kind: 'desktop' },
  session: { id: 'session-1', accessExpiresAt: '2026-11-01T01:10:00.000Z', refreshExpiresAt: '2026-12-01T01:00:00.000Z' }
}

function tokens(suffix = '1'): TokenSet {
  return {
    tokenType: 'Bearer', accessToken: `access-${suffix}`, expiresInSeconds: 600,
    refreshToken: `refresh-${suffix}`, refreshExpiresInSeconds: 2_592_000, bootstrap
  }
}

function fixture(overrides: Partial<CloudApi> = {}, stored?: { refreshToken: string; revocationPending: boolean }) {
  let credential = stored
  const vault: CloudIdentityVault = {
    secureStorageAvailable: () => true,
    installationId: vi.fn(async () => 'c1720c94-17af-4b41-a8c4-64c4685bcad4'),
    load: vi.fn(async () => credential),
    saveRefreshToken: vi.fn(async value => { credential = { refreshToken: value, revocationPending: credential?.revocationPending === true } }),
    markRevocationPending: vi.fn(async () => { if (credential) credential.revocationPending = true }),
    clear: vi.fn(async () => { credential = undefined })
  }
  const api: CloudApi = {
    authorize: vi.fn(async () => ({
      deviceCode: 'device-code', userCode: 'AbC-42',
      verificationUri: 'https://clawport.si/desktop/authorize',
      verificationUriComplete: 'https://clawport.si/desktop/authorize?user_code=AbC-42',
      expiresInSeconds: 600, intervalSeconds: 5
    })),
    exchange: vi.fn(async () => tokens()),
    refresh: vi.fn(async () => tokens('2')),
    bootstrap: vi.fn(async () => bootstrap),
    revoke: vi.fn(async () => undefined),
    ...overrides
  }
  const openExternal = vi.fn(async () => undefined)
  const service = new CloudIdentityService({
    api, vault, openExternal, deviceName: 'Ada Mac', platform: 'darwin', appVersion: '0.1.0',
    schedule: (callback, delay) => {
      if (delay < 10_000) queueMicrotask(callback)
      return 1
    },
    cancelSchedule: vi.fn(), now: () => Date.parse('2026-11-01T01:00:00.000Z')
  })
  return { service, api, vault, openExternal }
}

describe('CloudIdentityService', () => {
  it('singleflights repeated login clicks and never publishes device or token secrets', async () => {
    let resolveExchange!: (value: TokenSet) => void
    const exchange = vi.fn(() => new Promise<TokenSet>(resolve => { resolveExchange = resolve }))
    const f = fixture({ exchange })
    const first = f.service.startLogin()
    const second = f.service.startLogin()
    await vi.waitFor(() => expect(f.openExternal).toHaveBeenCalledOnce())
    expect(first).toBe(second)
    expect(f.service.snapshot()).toMatchObject({ phase: 'authorizing', publicUserCode: 'AbC-42' })
    expect(JSON.stringify(f.service.snapshot())).not.toMatch(/device-code|access-|refresh-/)
    resolveExchange(tokens())
    await first
    expect(f.service.snapshot()).toMatchObject({ phase: 'connected', identity: bootstrap.identity })
  })

  it('keeps the business credential main-only and invalidates it on logout', async () => {
    const f = fixture({}, { refreshToken: 'refresh-1', revocationPending: false })
    await f.service.refresh()
    const first = f.service.businessCredential()
    expect(first).toMatchObject({ accessToken: 'access-2', runtimeId: 'runtime-1' })
    expect(JSON.stringify(f.service.snapshot())).not.toContain('access-2')

    await f.service.refresh()
    const rotated = f.service.businessCredential()
    expect(rotated?.epoch).toBe(first?.epoch)
    expect(first && f.service.isBusinessCredentialCurrent(first)).toBe(true)

    const logout = f.service.revoke()
    expect(first && f.service.isBusinessCredentialCurrent(first)).toBe(false)
    await logout
    expect(f.service.businessCredential()).toBeUndefined()
  })

  it('keeps the connected runtime visible during a normal refresh and offline retry', async () => {
    let finishRefresh!: (value: TokenSet) => void
    const refresh = vi.fn()
      .mockResolvedValueOnce(tokens('1'))
      .mockImplementationOnce(() => new Promise<TokenSet>(resolve => { finishRefresh = resolve }))
      .mockRejectedValueOnce(new CloudApiError('offline', 'ClawPort is unavailable.'))
    const f = fixture({ refresh }, { refreshToken: 'refresh-0', revocationPending: false })
    await f.service.refresh()

    const rotating = f.service.refresh()
    await vi.waitFor(() => expect(f.service.snapshot().phase).toBe('refreshing'))
    expect(f.service.snapshot()).toMatchObject({ identity: bootstrap.identity, runtime: bootstrap.runtime })
    finishRefresh(tokens('2'))
    await rotating

    await f.service.refresh()
    expect(f.service.snapshot()).toMatchObject({ phase: 'offline', identity: bootstrap.identity, runtime: bootstrap.runtime })
  })

  it('clears the old public runtime as soon as account switching starts', async () => {
    const f = fixture({}, { refreshToken: 'refresh-0', revocationPending: false })
    await f.service.refresh()
    const switching = f.service.startLogin()
    expect(f.service.snapshot()).toMatchObject({ phase: 'authorizing' })
    expect(f.service.snapshot().runtime).toBeUndefined()
    await switching
  })

  it('completes a persisted pending logout before allowing a new authorization', async () => {
    const f = fixture({}, { refreshToken: 'refresh-1', revocationPending: true })

    await expect(f.service.startLogin()).resolves.toMatchObject({ phase: 'signedOut' })

    expect(f.api.refresh).toHaveBeenCalledWith('refresh-1')
    expect(f.api.revoke).toHaveBeenCalledWith('access-2')
    expect(f.api.authorize).not.toHaveBeenCalled()
  })

  it('uses the server polling interval and schedules refresh 60 seconds before expiry', async () => {
    const scheduled: Array<{ callback: () => void; delay: number }> = []
    const exchange = vi.fn()
      .mockRejectedValueOnce(new CloudApiError('pending', 'Authorization is pending.', 7))
      .mockResolvedValueOnce(tokens())
    const f = fixture({ exchange })
    const service = new CloudIdentityService({
      api: f.api, vault: f.vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0',
      schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length },
      cancelSchedule: () => undefined
    })
    const login = service.startLogin()
    await vi.waitFor(() => expect(scheduled[0]?.delay).toBe(5_000))
    scheduled.shift()?.callback()
    await vi.waitFor(() => expect(scheduled[0]?.delay).toBe(7_000))
    scheduled.shift()?.callback()
    await login
    expect(scheduled[0]?.delay).toBe(540_000)
    service.dispose()
  })

  it('cancels pending login on logout and ignores the late exchange result', async () => {
    let resolveExchange!: (value: TokenSet) => void
    const f = fixture({ exchange: vi.fn(() => new Promise<TokenSet>(resolve => { resolveExchange = resolve })) })
    const login = f.service.startLogin()
    await vi.waitFor(() => expect(f.openExternal).toHaveBeenCalledOnce())
    await f.service.revoke()
    resolveExchange(tokens())
    await login
    expect(f.service.snapshot().phase).toBe('signedOut')
    expect(f.vault.saveRefreshToken).not.toHaveBeenCalled()
  })

  it('settles a pending login when logout cancels its poll timer', async () => {
    const scheduled = new Map<number, () => void>()
    let nextTimer = 0
    const cancelSchedule = vi.fn((timer: unknown) => { scheduled.delete(timer as number) })
    const vault: CloudIdentityVault = {
      secureStorageAvailable: () => true,
      installationId: async () => 'c1720c94-17af-4b41-a8c4-64c4685bcad4',
      load: async () => undefined,
      saveRefreshToken: vi.fn(), markRevocationPending: vi.fn(), clear: vi.fn()
    }
    const api = fixture().api
    const service = new CloudIdentityService({
      api, vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0',
      schedule: callback => { const timer = ++nextTimer; scheduled.set(timer, callback); return timer },
      cancelSchedule
    })
    const login = service.startLogin()
    await vi.waitFor(() => expect(service.snapshot().phase).toBe('authorizing'))
    await vi.waitFor(() => expect(scheduled.size).toBe(1))
    await service.revoke()
    await expect(login).resolves.toMatchObject({ phase: 'signedOut' })
    expect(cancelSchedule).toHaveBeenCalledOnce()
  })

  it('does not let refresh cancel an authorizing poll', async () => {
    const scheduled = new Map<number, () => void>()
    let nextTimer = 0
    const f = fixture()
    const service = new CloudIdentityService({
      api: f.api, vault: f.vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0',
      schedule: callback => { const timer = ++nextTimer; scheduled.set(timer, callback); return timer },
      cancelSchedule: timer => { scheduled.delete(timer as number) }
    })
    const login = service.startLogin()
    await vi.waitFor(() => expect(scheduled.size).toBe(1))
    await expect(service.refresh()).resolves.toMatchObject({ phase: 'authorizing' })
    expect(scheduled.size).toBe(1)
    scheduled.values().next().value?.()
    await expect(login).resolves.toMatchObject({ phase: 'connected' })
  })

  it('singleflights refresh and rotates the encrypted refresh credential', async () => {
    let resolveRefresh!: (value: TokenSet) => void
    const refresh = vi.fn(() => new Promise<TokenSet>(resolve => { resolveRefresh = resolve }))
    const f = fixture({ refresh }, { refreshToken: 'refresh-1', revocationPending: false })
    const first = f.service.refresh()
    const second = f.service.refresh()
    expect(first).toBe(second)
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    resolveRefresh(tokens('2'))
    await first
    expect(refresh).toHaveBeenCalledOnce()
    expect(f.vault.saveRefreshToken).toHaveBeenCalledWith('refresh-2')
  })

  it('serializes logout behind an in-flight refresh and revokes the rotated session', async () => {
    let resolveRefresh!: (value: TokenSet) => void
    const f = fixture({ refresh: vi.fn(() => new Promise<TokenSet>(resolve => { resolveRefresh = resolve })) }, {
      refreshToken: 'refresh-1', revocationPending: false
    })
    const refreshing = f.service.refresh()
    await vi.waitFor(() => expect(f.api.refresh).toHaveBeenCalledOnce())
    const logout = f.service.revoke()
    await vi.waitFor(() => expect(f.vault.markRevocationPending).toHaveBeenCalledOnce())
    resolveRefresh(tokens('2'))
    await refreshing
    await expect(logout).resolves.toMatchObject({ phase: 'signedOut' })
    expect(f.api.revoke).toHaveBeenCalledWith('access-2')
    expect(f.vault.clear).toHaveBeenCalledOnce()
  })

  it('keeps logout fenced when refresh completes before revocation is persisted', async () => {
    let resolveRefresh!: (value: TokenSet) => void
    let resolveLogoutLoad!: () => void
    let resolveRevoke!: () => void
    const refresh = vi.fn(() => new Promise<TokenSet>(resolve => { resolveRefresh = resolve }))
    const revoke = vi.fn(() => new Promise<void>(resolve => { resolveRevoke = resolve }))
    const f = fixture({ refresh, revoke }, { refreshToken: 'refresh-1', revocationPending: false })
    const load = f.vault.load
    let loadCount = 0
    f.vault.load = vi.fn(() => {
      loadCount += 1
      if (loadCount !== 2) return load()
      return new Promise<Awaited<ReturnType<CloudIdentityVault['load']>>>(resolve => {
        resolveLogoutLoad = () => { void load().then(resolve) }
      })
    })

    const refreshing = f.service.refresh()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    const logout = f.service.revoke()
    await vi.waitFor(() => expect(f.vault.load).toHaveBeenCalledTimes(2))

    resolveRefresh(tokens('2'))
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('access-2'))
    expect(f.service.snapshot().phase).toBe('signedOut')
    expect(f.service.businessCredential()).toBeUndefined()

    resolveLogoutLoad()
    resolveRevoke()
    await refreshing
    await expect(logout).resolves.toMatchObject({ phase: 'signedOut' })
  })

  it('finishes revoking a token persisted while login cancellation was in progress', async () => {
    let finishWrite!: () => void
    let writes = 0
    let credential: { refreshToken: string; revocationPending: boolean } | undefined
    const vault: CloudIdentityVault = {
      secureStorageAvailable: () => true,
      installationId: async () => 'c1720c94-17af-4b41-a8c4-64c4685bcad4',
      load: async () => credential,
      saveRefreshToken: vi.fn(value => {
        writes += 1
        if (writes > 1) {
          credential = { refreshToken: value, revocationPending: credential?.revocationPending === true }
          return Promise.resolve()
        }
        return new Promise<void>(resolve => {
          finishWrite = () => { credential = { refreshToken: value, revocationPending: credential?.revocationPending === true }; resolve() }
        })
      }),
      markRevocationPending: vi.fn(async () => { if (credential) credential.revocationPending = true }),
      clear: vi.fn(async () => { credential = undefined })
    }
    const f = fixture()
    const service = new CloudIdentityService({
      api: f.api, vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0',
      schedule: callback => { queueMicrotask(callback); return 1 }, cancelSchedule: () => undefined
    })
    const login = service.startLogin()
    await vi.waitFor(() => expect(vault.saveRefreshToken).toHaveBeenCalledOnce())
    const logout = service.revoke()
    finishWrite()
    await login
    await expect(logout).resolves.toMatchObject({ phase: 'signedOut' })
    expect(f.api.revoke).toHaveBeenCalled()
    expect(vault.clear).toHaveBeenCalledOnce()
  })

  it('keeps credentials and reports offline when refresh cannot reach the server', async () => {
    const f = fixture({ refresh: vi.fn(async () => { throw new CloudApiError('offline', 'ClawPort is unavailable.') }) }, {
      refreshToken: 'refresh-1', revocationPending: false
    })
    await f.service.refresh()
    expect(f.service.snapshot()).toMatchObject({ phase: 'offline', error: { code: 'offline' } })
    expect(f.vault.clear).not.toHaveBeenCalled()
  })

  it('does not expose native or filesystem errors in the public snapshot', async () => {
    const f = fixture({}, { refreshToken: 'refresh-1', revocationPending: false })
    f.vault.load = vi.fn(async () => { throw new Error('/Users/private/cloud-identity/credentials.json failed') })
    await f.service.refresh()
    expect(f.service.snapshot()).toMatchObject({
      phase: 'error', error: { code: 'unexpected_error', message: 'Cloud identity is unavailable.' }
    })
    expect(JSON.stringify(f.service.snapshot())).not.toContain('/Users/private')
  })

  it('clears revoked credentials and requires sign-in again', async () => {
    const f = fixture({ refresh: vi.fn(async () => { throw new CloudApiError('device_revoked', 'Device revoked.') }) }, {
      refreshToken: 'refresh-1', revocationPending: false
    })
    await f.service.refresh()
    expect(f.service.snapshot().phase).toBe('reauthRequired')
    expect(f.vault.clear).toHaveBeenCalledOnce()
  })

  it('refreshes once and retries logout when the in-memory access token expired', async () => {
    const refresh = vi.fn()
      .mockResolvedValueOnce(tokens('1'))
      .mockResolvedValueOnce(tokens('2'))
    const revoke = vi.fn()
      .mockRejectedValueOnce(new CloudApiError('access_unauthorized', 'Cloud access expired.'))
      .mockResolvedValueOnce(undefined)
    const f = fixture({ refresh, revoke }, { refreshToken: 'refresh-0', revocationPending: false })
    await f.service.refresh()

    await expect(f.service.revoke()).resolves.toMatchObject({ phase: 'signedOut' })
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenNthCalledWith(1, 'access-1')
    expect(revoke).toHaveBeenNthCalledWith(2, 'access-2')
    expect(f.vault.clear).toHaveBeenCalledOnce()
  })

  it('persists an offline logout and completes it on the next retry', async () => {
    const revoke = vi.fn()
      .mockRejectedValueOnce(new CloudApiError('offline', 'ClawPort is unavailable.'))
      .mockResolvedValueOnce(undefined)
    const f = fixture({ revoke }, { refreshToken: 'refresh-1', revocationPending: false })
    await f.service.refresh()
    await f.service.revoke()
    expect(f.vault.markRevocationPending).toHaveBeenCalledOnce()
    expect(f.service.snapshot()).toMatchObject({ phase: 'offline', error: { code: 'logout_pending' } })
    expect(f.vault.clear).not.toHaveBeenCalled()

    await f.service.refresh()
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(f.vault.clear).toHaveBeenCalledOnce()
    expect(f.service.snapshot().phase).toBe('signedOut')
  })

  it('keeps a pending logout persisted when rotated-session revocation fails again', async () => {
    let credential = { refreshToken: 'refresh-1', revocationPending: true }
    const vault: CloudIdentityVault = {
      secureStorageAvailable: () => true,
      installationId: async () => 'c1720c94-17af-4b41-a8c4-64c4685bcad4',
      load: vi.fn(async () => credential),
      saveRefreshToken: vi.fn(async value => { credential = { refreshToken: value, revocationPending: credential.revocationPending } }),
      markRevocationPending: vi.fn(async () => { credential.revocationPending = true }),
      clear: vi.fn()
    }
    const api = fixture({ revoke: vi.fn(async () => { throw new CloudApiError('offline', 'ClawPort is unavailable.') }) }).api
    const first = new CloudIdentityService({ api, vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0' })
    await first.refresh()
    expect(credential).toEqual({ refreshToken: 'refresh-2', revocationPending: true })
    first.dispose()

    const second = new CloudIdentityService({ api, vault, openExternal: async () => undefined, deviceName: 'Mac', platform: 'darwin', appVersion: '0.1.0' })
    await second.refresh()
    expect(api.revoke).toHaveBeenCalledTimes(2)
    expect(credential.revocationPending).toBe(true)
    second.dispose()
  })
})
