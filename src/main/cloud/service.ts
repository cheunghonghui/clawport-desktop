import type { CloudIdentitySnapshot, TokenSet } from '../../shared/cloud-identity'
import { CloudApiError, type CloudApi } from './api-client'
import { CloudVaultError } from './vault'
import type { CloudBusinessCredential } from './business-client'

const REFRESH_EARLY_MS = 60_000
const OFFLINE_RETRY_MS = 30_000

export interface CloudIdentityVault {
  secureStorageAvailable(): boolean
  installationId(): Promise<string>
  load(): Promise<{ refreshToken: string; revocationPending: boolean } | undefined>
  saveRefreshToken(refreshToken: string): Promise<void>
  markRevocationPending(): Promise<void>
  clear(): Promise<void>
}

interface CloudIdentityServiceOptions {
  api: CloudApi
  vault: CloudIdentityVault
  openExternal(url: string): Promise<unknown>
  deviceName: string
  platform: 'darwin' | 'win32'
  appVersion: string
  schedule?: (callback: () => void, delay: number) => unknown
  cancelSchedule?: (timer: unknown) => void
  now?: () => number
}

function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof CloudApiError) return { code: error.code, message: error.message }
  if (error instanceof CloudVaultError) return { code: error.code, message: error.message }
  return { code: 'unexpected_error', message: 'Cloud identity is unavailable.' }
}

export class CloudIdentityService {
  private state: CloudIdentitySnapshot
  private accessToken?: string
  private loginFlow?: Promise<CloudIdentitySnapshot>
  private refreshFlow?: Promise<CloudIdentitySnapshot>
  private revokeFlow?: Promise<CloudIdentitySnapshot>
  private credentialWrite?: Promise<void>
  private timer?: unknown
  private pendingDelayResolve?: (active: boolean) => void
  private generation = 0
  private revocationGeneration = 0
  private businessEpoch = 0
  private disposed = false
  private readonly listeners = new Set<(snapshot: CloudIdentitySnapshot) => void>()
  private readonly schedule: NonNullable<CloudIdentityServiceOptions['schedule']>
  private readonly cancelSchedule: NonNullable<CloudIdentityServiceOptions['cancelSchedule']>
  private readonly now: NonNullable<CloudIdentityServiceOptions['now']>

  constructor(private readonly options: CloudIdentityServiceOptions) {
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancelSchedule = options.cancelSchedule ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>))
    this.now = options.now ?? Date.now
    this.state = {
      phase: 'signedOut', revision: 0,
      secureStorageAvailable: options.vault.secureStorageAvailable()
    }
    if (!this.state.secureStorageAvailable) {
      this.state = {
        ...this.state,
        phase: 'error',
        error: { code: 'secure_storage_unavailable', message: 'Secure credential storage is unavailable.' }
      }
    }
  }

  snapshot(): CloudIdentitySnapshot {
    return structuredClone(this.state)
  }

  subscribe(listener: (snapshot: CloudIdentitySnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  businessCredential(): CloudBusinessCredential | undefined {
    if (!this.accessToken || !this.state.runtime) return undefined
    return { accessToken: this.accessToken, runtimeId: this.state.runtime.id, epoch: this.businessEpoch }
  }

  isBusinessCredentialCurrent(credential: CloudBusinessCredential): boolean {
    return this.accessToken !== undefined && credential.epoch === this.businessEpoch &&
      credential.runtimeId === this.state.runtime?.id
  }

  private update(patch: Omit<Partial<CloudIdentitySnapshot>, 'revision'>): CloudIdentitySnapshot {
    const base: CloudIdentitySnapshot = {
      phase: patch.phase ?? this.state.phase,
      revision: this.state.revision + 1,
      secureStorageAvailable: this.options.vault.secureStorageAvailable()
    }
    this.state = { ...base, ...patch }
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.cancelSchedule(this.timer)
    this.timer = undefined
    const resolve = this.pendingDelayResolve
    this.pendingDelayResolve = undefined
    resolve?.(false)
  }

  private scheduleRefresh(expiresInSeconds: number): void {
    this.cancelTimer()
    const delay = Math.max(0, expiresInSeconds * 1_000 - REFRESH_EARLY_MS)
    this.timer = this.schedule(() => { this.timer = undefined; void this.refresh() }, delay)
  }

  private scheduleRetry(): void {
    this.cancelTimer()
    this.timer = this.schedule(() => { this.timer = undefined; void this.refresh() }, OFFLINE_RETRY_MS)
  }

  private updateWithIdentity(patch: Omit<Partial<CloudIdentitySnapshot>, 'revision'>): CloudIdentitySnapshot {
    const { identity, workspace, device, runtime, accessExpiresAt } = this.state
    return this.update({ identity, workspace, device, runtime, accessExpiresAt, ...patch })
  }

  private connected(tokens: TokenSet): CloudIdentitySnapshot {
    const previousOwner = this.state.identity && this.state.runtime
      ? `${this.state.identity.memberId}:${this.state.runtime.id}`
      : undefined
    const nextOwner = `${tokens.bootstrap.identity.memberId}:${tokens.bootstrap.runtime.id}`
    if (previousOwner !== nextOwner) this.businessEpoch += 1
    this.accessToken = tokens.accessToken
    this.scheduleRefresh(tokens.expiresInSeconds)
    const { identity, workspace, device, runtime, session } = tokens.bootstrap
    return this.update({
      phase: 'connected', identity, workspace, device, runtime,
      accessExpiresAt: session.accessExpiresAt
    })
  }

  startLogin(): Promise<CloudIdentitySnapshot> {
    if (this.loginFlow) return this.loginFlow
    if (this.revokeFlow) return this.revokeFlow
    if (!this.options.vault.secureStorageAvailable()) return Promise.resolve(this.snapshot())
    const generation = ++this.generation
    this.businessEpoch += 1
    this.accessToken = undefined
    this.cancelTimer()
    this.update({ phase: 'authorizing' })
    this.loginFlow = this.runLogin(generation).finally(() => { this.loginFlow = undefined })
    return this.loginFlow
  }

  private async delay(milliseconds: number, generation: number): Promise<boolean> {
    return new Promise(resolve => {
      this.pendingDelayResolve = resolve
      this.timer = this.schedule(() => {
        this.timer = undefined
        this.pendingDelayResolve = undefined
        resolve(!this.disposed && generation === this.generation)
      }, milliseconds)
    })
  }

  private async runLogin(generation: number): Promise<CloudIdentitySnapshot> {
    try {
      const credential = await this.options.vault.load()
      if (generation !== this.generation || this.disposed) return this.snapshot()
      if (credential?.revocationPending) return this.runRefresh(generation)
      this.update({ phase: 'authorizing' })
      const authorization = await this.options.api.authorize({
        installationId: await this.options.vault.installationId(),
        deviceName: this.options.deviceName.slice(0, 120),
        platform: this.options.platform,
        appVersion: this.options.appVersion.slice(0, 64)
      })
      if (generation !== this.generation || this.disposed) return this.snapshot()
      this.update({ phase: 'authorizing', publicUserCode: authorization.userCode })
      await this.options.openExternal(authorization.verificationUriComplete)
      let intervalSeconds = authorization.intervalSeconds
      const deadline = this.now() + authorization.expiresInSeconds * 1_000
      while (this.now() < deadline && generation === this.generation && !this.disposed) {
        if (!await this.delay(intervalSeconds * 1_000, generation)) return this.snapshot()
        try {
          const tokens = await this.options.api.exchange(authorization.deviceCode)
          if (generation !== this.generation || this.disposed) return this.snapshot()
          const write = this.options.vault.saveRefreshToken(tokens.refreshToken)
          this.credentialWrite = write
          try {
            await write
          } finally {
            if (this.credentialWrite === write) this.credentialWrite = undefined
          }
          if (generation !== this.generation || this.disposed) return this.snapshot()
          return this.connected(tokens)
        } catch (error) {
          if (error instanceof CloudApiError && (error.code === 'pending' || error.code === 'slow_down')) {
            intervalSeconds = error.intervalSeconds ?? intervalSeconds
            continue
          }
          throw error
        }
      }
      if (generation === this.generation) {
        return this.update({ phase: 'error', publicUserCode: authorization.userCode, error: { code: 'expired_token', message: 'The cloud login code expired.' } })
      }
      return this.snapshot()
    } catch (error) {
      if (generation !== this.generation || this.disposed) return this.snapshot()
      const safe = safeError(error)
      return this.update({ phase: safe.code === 'offline' ? 'offline' : 'error', error: safe })
    }
  }

  refresh(): Promise<CloudIdentitySnapshot> {
    if (this.revokeFlow) return this.revokeFlow
    if (this.loginFlow) return Promise.resolve(this.snapshot())
    if (this.refreshFlow) return this.refreshFlow
    if (!this.options.vault.secureStorageAvailable()) return Promise.resolve(this.snapshot())
    const generation = this.generation
    const revocationGeneration = this.revocationGeneration
    this.refreshFlow = this.runRefresh(generation, revocationGeneration).finally(() => { this.refreshFlow = undefined })
    return this.refreshFlow
  }

  private async runRefresh(
    generation: number,
    revocationGeneration = this.revocationGeneration
  ): Promise<CloudIdentitySnapshot> {
    this.cancelTimer()
    let revocationPending = false
    try {
      const credential = await this.options.vault.load()
      if (!credential) return this.update({ phase: 'signedOut' })
      revocationPending = credential.revocationPending
      this.updateWithIdentity({ phase: 'refreshing' })
      const tokens = await this.options.api.refresh(credential.refreshToken)
      if (generation !== this.generation || this.disposed) return this.snapshot()
      const write = this.options.vault.saveRefreshToken(tokens.refreshToken)
      this.credentialWrite = write
      try {
        await write
      } finally {
        if (this.credentialWrite === write) this.credentialWrite = undefined
      }
      if (generation !== this.generation || this.disposed) return this.snapshot()
      this.accessToken = tokens.accessToken
      const persisted = await this.options.vault.load()
      if (revocationGeneration !== this.revocationGeneration || revocationPending || persisted?.revocationPending) {
        return await this.completeRevocation(tokens.accessToken, false)
      }
      return this.connected(tokens)
    } catch (error) {
      if (generation !== this.generation || this.disposed) return this.snapshot()
      const safe = safeError(error)
      if (safe.code === 'reauth_required' || safe.code === 'device_revoked' || safe.code === 'expired_token') {
        this.accessToken = undefined
        await this.options.vault.clear()
        return revocationPending
          ? this.update({ phase: 'signedOut' })
          : this.update({ phase: 'reauthRequired', error: safe })
      }
      if (safe.code === 'offline') {
        this.scheduleRetry()
        return this.updateWithIdentity({
          phase: 'offline',
          error: revocationPending
            ? { code: 'logout_pending', message: 'Cloud logout is pending and will retry when ClawPort is available.' }
            : safe
        })
      }
      return this.update({ phase: 'error', error: safe })
    }
  }

  revoke(): Promise<CloudIdentitySnapshot> {
    if (this.revokeFlow) return this.revokeFlow
    const refreshFlow = this.refreshFlow
    this.revocationGeneration += 1
    this.revokeFlow = this.runRevoke(refreshFlow).finally(() => { this.revokeFlow = undefined })
    return this.revokeFlow
  }

  private async runRevoke(refreshFlow?: Promise<CloudIdentitySnapshot>): Promise<CloudIdentitySnapshot> {
    this.cancelTimer()
    this.businessEpoch += 1
    this.update({ phase: 'signedOut' })
    if (this.loginFlow) {
      ++this.generation
      const write = this.credentialWrite
      if (write) await write.catch(() => undefined)
    }
    if (refreshFlow) {
      const rotating = await this.options.vault.load()
      if (rotating) await this.options.vault.markRevocationPending()
      await refreshFlow
    }
    const credential = await this.options.vault.load()
    if (!credential) {
      this.accessToken = undefined
      return this.update({ phase: 'signedOut' })
    }
    await this.options.vault.markRevocationPending()
    const accessToken = this.accessToken
    if (!accessToken) return this.runRefresh(this.generation)
    return this.completeRevocation(accessToken)
  }

  private async completeRevocation(accessToken: string, retryUnauthorized = true): Promise<CloudIdentitySnapshot> {
    try {
      await this.options.api.revoke(accessToken)
      await this.options.vault.clear()
      this.accessToken = undefined
      return this.update({ phase: 'signedOut' })
    } catch (error) {
      const safe = safeError(error)
      if (safe.code === 'access_unauthorized' && retryUnauthorized) {
        this.accessToken = undefined
        return this.runRefresh(this.generation)
      }
      if (safe.code === 'reauth_required' || safe.code === 'device_revoked') {
        await this.options.vault.clear()
        this.accessToken = undefined
        return this.update({ phase: 'signedOut' })
      }
      this.scheduleRetry()
      return this.update({
        phase: safe.code === 'offline' ? 'offline' : 'error',
        error: { code: 'logout_pending', message: 'Cloud logout is pending and will retry when ClawPort is available.' }
      })
    }
  }

  dispose(): void {
    this.disposed = true
    ++this.generation
    this.accessToken = undefined
    this.cancelTimer()
    this.listeners.clear()
  }
}
