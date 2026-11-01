import type { CloudIdentityBridge, CloudIdentitySnapshot } from '../shared/cloud-identity'
import { CLOUD_IDENTITY_CHANNELS } from '../shared/cloud-identity'

interface IpcRendererLike {
  invoke(channel: string): Promise<unknown>
  on(channel: string, listener: (event: unknown, value: unknown) => void): void
  removeListener(channel: string, listener: (event: unknown, value: unknown) => void): void
}

const PHASES = new Set(['signedOut', 'authorizing', 'refreshing', 'connected', 'offline', 'reauthRequired', 'error'])

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown, keys: readonly string[]): boolean {
  return object(value) && keys.every(key => typeof value[key] === 'string')
}

export function isCloudIdentitySnapshot(value: unknown): value is CloudIdentitySnapshot {
  if (!object(value) || !PHASES.has(value.phase as string) || !Number.isSafeInteger(value.revision) || typeof value.secureStorageAvailable !== 'boolean') return false
  if (value.identity !== undefined) {
    const identity = value.identity
    if (!object(identity)) return false
    if (!strings(identity, ['memberId', 'displayName', 'role']) || !(identity.email === null || typeof identity.email === 'string')) return false
  }
  if (value.workspace !== undefined && !strings(value.workspace, ['tenantId', 'tenantName', 'projectId', 'projectName'])) return false
  if (value.device !== undefined && !strings(value.device, ['id', 'name', 'platform', 'appVersion'])) return false
  if (value.runtime !== undefined && !strings(value.runtime, ['id', 'kind'])) return false
  if (value.accessExpiresAt !== undefined && typeof value.accessExpiresAt !== 'string') return false
  if (value.publicUserCode !== undefined && typeof value.publicUserCode !== 'string') return false
  if (value.error !== undefined && !strings(value.error, ['code', 'message'])) return false
  return true
}

export function createCloudIdentityBridge(ipcRenderer: IpcRendererLike): CloudIdentityBridge {
  const invoke = async (channel: string): Promise<CloudIdentitySnapshot> => {
    const value = await ipcRenderer.invoke(channel)
    if (!isCloudIdentitySnapshot(value)) throw new Error('Received an invalid cloud identity snapshot.')
    return value
  }
  return Object.freeze({
    getCloudIdentity: () => invoke(CLOUD_IDENTITY_CHANNELS.get),
    startCloudLogin: () => invoke(CLOUD_IDENTITY_CHANNELS.startLogin),
    refreshCloudIdentity: () => invoke(CLOUD_IDENTITY_CHANNELS.refresh),
    revokeCloudIdentity: () => invoke(CLOUD_IDENTITY_CHANNELS.revoke),
    onCloudIdentityChanged: (listener: (snapshot: CloudIdentitySnapshot) => void) => {
      const receive = (_event: unknown, value: unknown): void => {
        if (isCloudIdentitySnapshot(value)) listener(value)
      }
      ipcRenderer.on(CLOUD_IDENTITY_CHANNELS.changed, receive)
      return () => ipcRenderer.removeListener(CLOUD_IDENTITY_CHANNELS.changed, receive)
    }
  })
}
