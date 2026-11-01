export const CLOUD_IDENTITY_CHANNELS = {
  get: 'cloud-identity:get',
  startLogin: 'cloud-identity:start-login',
  refresh: 'cloud-identity:refresh',
  revoke: 'cloud-identity:revoke',
  changed: 'cloud-identity:changed'
} as const

export type CloudIdentityPhase =
  | 'signedOut'
  | 'authorizing'
  | 'refreshing'
  | 'connected'
  | 'offline'
  | 'reauthRequired'
  | 'error'

export interface DesktopBootstrap {
  identity: {
    memberId: string
    displayName: string
    email: string | null
    role: 'owner' | 'admin' | 'operator' | 'member' | 'viewer'
  }
  workspace: {
    tenantId: string
    tenantName: string
    projectId: string
    projectName: string
  }
  device: {
    id: string
    name: string
    platform: 'darwin' | 'win32'
    appVersion: string
  }
  runtime: {
    id: string
    kind: 'desktop'
  }
  session: {
    id: string
    accessExpiresAt: string
    refreshExpiresAt: string
  }
}

export interface TokenSet {
  tokenType: 'Bearer'
  accessToken: string
  expiresInSeconds: number
  refreshToken: string
  refreshExpiresInSeconds: number
  bootstrap: DesktopBootstrap
}

export interface CloudIdentitySnapshot {
  phase: CloudIdentityPhase
  revision: number
  secureStorageAvailable: boolean
  identity?: DesktopBootstrap['identity']
  workspace?: DesktopBootstrap['workspace']
  device?: DesktopBootstrap['device']
  runtime?: DesktopBootstrap['runtime']
  accessExpiresAt?: string
  publicUserCode?: string
  error?: {
    code: string
    message: string
  }
}

export interface CloudIdentityBridge {
  getCloudIdentity: () => Promise<CloudIdentitySnapshot>
  startCloudLogin: () => Promise<CloudIdentitySnapshot>
  refreshCloudIdentity: () => Promise<CloudIdentitySnapshot>
  revokeCloudIdentity: () => Promise<CloudIdentitySnapshot>
  onCloudIdentityChanged: (listener: (snapshot: CloudIdentitySnapshot) => void) => () => void
}
