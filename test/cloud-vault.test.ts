import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CloudCredentialVault } from '../src/main/cloud/vault'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'clawport-cloud-vault-'))
}

describe('CloudCredentialVault', () => {
  it('persists a stable installation ID separately from encrypted credentials', async () => {
    const directory = await root()
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace('encrypted:', '')
    }
    const first = new CloudCredentialVault(directory, storage)
    const id = await first.installationId()
    await first.saveRefreshToken('refresh-secret')
    const second = new CloudCredentialVault(directory, storage)

    expect(id).toMatch(uuid)
    expect(await second.installationId()).toBe(id)
    expect(await second.load()).toEqual({ refreshToken: 'refresh-secret', revocationPending: false })
    expect(await readFile(join(directory, 'installation.json'), 'utf8')).toContain(id)
    expect(await readFile(join(directory, 'credentials.json'), 'utf8')).not.toContain('refresh-secret')
  })

  it('does not read or write credentials when secure storage is unavailable', async () => {
    const directory = await root()
    const vault = new CloudCredentialVault(directory, {
      isEncryptionAvailable: () => false,
      encryptString: () => { throw new Error('must not encrypt') },
      decryptString: () => { throw new Error('must not decrypt') }
    })
    expect(vault.secureStorageAvailable()).toBe(false)
    await expect(vault.saveRefreshToken('secret')).rejects.toMatchObject({ code: 'secure_storage_unavailable' })
    expect(await vault.load()).toBeUndefined()
  })

  it('persists revocation intent until server logout succeeds', async () => {
    const directory = await root()
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace('encrypted:', '')
    }
    const vault = new CloudCredentialVault(directory, storage)
    await vault.saveRefreshToken('refresh-secret')
    await vault.markRevocationPending()
    expect(await vault.load()).toEqual({ refreshToken: 'refresh-secret', revocationPending: true })
    await vault.saveRefreshToken('rotated-secret')
    expect(await vault.load()).toEqual({ refreshToken: 'rotated-secret', revocationPending: true })
    await vault.clear()
    expect(await vault.load()).toBeUndefined()
  })

  it('does not lose revocation intent when token rotation writes concurrently', async () => {
    const directory = await root()
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace('encrypted:', '')
    }
    const vault = new CloudCredentialVault(directory, storage)
    await vault.saveRefreshToken('refresh-secret')
    await Promise.all([
      vault.markRevocationPending(),
      vault.saveRefreshToken('rotated-secret')
    ])
    expect(await vault.load()).toEqual({ refreshToken: 'rotated-secret', revocationPending: true })
  })
})
