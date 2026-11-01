import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface SecureStorage {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export class CloudVaultError extends Error {
  constructor(readonly code: 'secure_storage_unavailable' | 'credential_unavailable', message: string) {
    super(message)
    this.name = 'CloudVaultError'
  }
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export class CloudCredentialVault {
  private readonly installationPath: string
  private readonly credentialsPath: string
  private credentialMutation = Promise.resolve()

  constructor(private readonly directory: string, private readonly storage: SecureStorage) {
    this.installationPath = join(directory, 'installation.json')
    this.credentialsPath = join(directory, 'credentials.json')
  }

  secureStorageAvailable(): boolean {
    return this.storage.isEncryptionAvailable()
  }

  private async atomicWrite(path: string, value: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  private mutateCredential(action: () => Promise<void>): Promise<void> {
    const result = this.credentialMutation.then(action, action)
    this.credentialMutation = result.catch(() => undefined)
    return result
  }

  async installationId(): Promise<string> {
    const stored = await readJson(this.installationPath)
    if (typeof stored === 'object' && stored !== null && 'id' in stored && UUID.test(String(stored.id))) {
      return String(stored.id)
    }
    if (stored !== undefined) throw new Error('Cloud installation identity is invalid.')
    const id = randomUUID()
    await this.atomicWrite(this.installationPath, { schemaVersion: 1, id })
    return id
  }

  async load(): Promise<{ refreshToken: string; revocationPending: boolean } | undefined> {
    if (!this.secureStorageAvailable()) return undefined
    await this.credentialMutation
    const stored = await readJson(this.credentialsPath)
    if (stored === undefined) return undefined
    if (typeof stored !== 'object' || stored === null || !('encryptedRefreshToken' in stored) || typeof stored.encryptedRefreshToken !== 'string') {
      throw new CloudVaultError('credential_unavailable', 'Saved cloud credentials are unavailable.')
    }
    try {
      const refreshToken = this.storage.decryptString(Buffer.from(stored.encryptedRefreshToken, 'base64'))
      if (!refreshToken) throw new Error('empty credential')
      return { refreshToken, revocationPending: 'revocationPending' in stored && stored.revocationPending === true }
    } catch {
      throw new CloudVaultError('credential_unavailable', 'Saved cloud credentials are unavailable.')
    }
  }

  async saveRefreshToken(refreshToken: string): Promise<void> {
    return this.mutateCredential(async () => {
      if (!this.secureStorageAvailable()) {
        throw new CloudVaultError('secure_storage_unavailable', 'Secure credential storage is unavailable.')
      }
      const encryptedRefreshToken = this.storage.encryptString(refreshToken).toString('base64')
      const current = await readJson(this.credentialsPath)
      const revocationPending = typeof current === 'object' && current !== null &&
        'revocationPending' in current && current.revocationPending === true
      await this.atomicWrite(this.credentialsPath, { schemaVersion: 1, encryptedRefreshToken, revocationPending })
    })
  }

  async markRevocationPending(): Promise<void> {
    return this.mutateCredential(async () => {
      const stored = await readJson(this.credentialsPath)
      if (typeof stored !== 'object' || stored === null || !('encryptedRefreshToken' in stored) || typeof stored.encryptedRefreshToken !== 'string') return
      await this.atomicWrite(this.credentialsPath, { schemaVersion: 1, encryptedRefreshToken: stored.encryptedRefreshToken, revocationPending: true })
    })
  }

  async clear(): Promise<void> {
    return this.mutateCredential(() => rm(this.credentialsPath, { force: true }))
  }
}
