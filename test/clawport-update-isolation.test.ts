import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  desktopService: vi.fn(),
  attachDiagnostics: vi.fn(),
  fetch: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve()),
  getGPUInfo: vi.fn(),
  policy: vi.fn(),
  catalog: vi.fn(),
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  powerMonitorOn: vi.fn(),
  updater: {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('../src/main/desktop-service/service', () => ({
  DesktopService: mocks.desktopService,
  isPrereleaseVersion: vi.fn(),
  isVersion: (value: unknown) => typeof value === 'string'
}))
vi.mock('../src/main/desktop-service/diagnostics', () => ({ attachDiagnostics: mocks.attachDiagnostics }))
vi.mock('../src/main/desktop-service', async importOriginal => ({
  ...await importOriginal<object>(),
  checkDesktopUpdate: mocks.policy
}))
vi.mock('../src/main/update/version-catalog', async importOriginal => ({
  ...await importOriginal<object>(),
  fetchAvailableReleases: mocks.catalog
}))
vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.updater } }))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '0.1.0',
    getPath: () => '/clawport-test',
    isReady: () => true,
    whenReady: mocks.whenReady,
    getGPUInfo: mocks.getGPUInfo,
    isHardwareAccelerationEnabled: () => true,
    getAppMetrics: () => []
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBox: vi.fn() },
  net: { fetch: mocks.fetch },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.ipcHandlers.set(channel, handler)
    }
  },
  powerMonitor: { on: mocks.powerMonitorOn, removeListener: vi.fn() }
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.ipcHandlers.clear()
})

describe('ClawPort vendor-service isolation', () => {
  it('does not initialize installation tracking or crash upload services', async () => {
    const desktopService = await import('../src/main/desktop-service')

    desktopService.initializeDesktopService()

    expect(mocks.desktopService).not.toHaveBeenCalled()
    expect(mocks.attachDiagnostics).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.whenReady).not.toHaveBeenCalled()
    expect(desktopService.desktopDiagnostics).toBeUndefined()
  })

  it('keeps every update and rollback entrypoint unavailable without upstream calls', async () => {
    const manager = await import('../src/main/update/update-manager')
    manager.registerUpdateHandlers()
    const initialStatus = mocks.ipcHandlers.get('updates:status')
    if (!initialStatus) throw new Error('Expected status IPC handler')
    expect(initialStatus({})).toMatchObject({ phase: 'unsupported' })
    manager.startUpdateManager({ prepareToInstall: vi.fn(async () => {}) })

    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'unsupported' })
    await expect(manager.checkForUpdates(true)).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(manager.downloadAvailableUpdate()).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(manager.installSpecificVersion('0.0.9')).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(manager.installDownloadedUpdate()).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(manager.getApplicationRollbackStatus()).resolves.toEqual({ available: false, reason: 'updates-disabled' })
    await expect(manager.rollbackApplication()).rejects.toThrow('updates-disabled')

    const check = mocks.ipcHandlers.get('updates:check')
    const listVersions = mocks.ipcHandlers.get('updates:list-versions')
    const download = mocks.ipcHandlers.get('updates:download')
    const installVersion = mocks.ipcHandlers.get('updates:install-version')
    if (!check || !listVersions || !download || !installVersion) throw new Error('Expected update IPC handlers')
    await expect(check({})).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(listVersions({})).resolves.toEqual([])
    await expect(download({})).resolves.toMatchObject({ phase: 'unsupported' })
    await expect(installVersion({}, '0.0.9')).resolves.toMatchObject({ phase: 'unsupported' })

    expect(mocks.policy).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(mocks.powerMonitorOn).not.toHaveBeenCalled()
    expect(mocks.updater.on).not.toHaveBeenCalled()
    expect(mocks.updater.setFeedURL).not.toHaveBeenCalled()
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled()
  })
})
