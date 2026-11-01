import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const source = (file: string) => readFile(path.join(root, file), 'utf8')

describe('ClawPort business channel assembly', () => {
  it('wires the named preload bridge and main-process broker lifecycle', async () => {
    const [preload, main] = await Promise.all([source('src/preload/index.ts'), source('src/main/index.ts')])
    expect(preload).toContain('...createCloudBusinessBridge(ipcRenderer)')
    expect(main).toContain('new CloudBusinessClient(')
    expect(main).toContain('registerCloudBusinessIpc({')
    expect(main).toContain('new CloudHostBroker({')
    expect(main).toContain('launchEnvironment: profile =>')
    expect(main).toContain('cloudHostBroker?.stop()')
  })

  it('loads the fixed plugin only in the normal profile composition', async () => {
    const [normal, safe, dshPatch] = await Promise.all([
      source('build/dsh-desktop.patch.yml'),
      source('build/dsh-desktop-safe.patch.yml'),
      source('patches/@deepseek-ai+dsh+0.2.1-rc.3.patch')
    ])
    expect(normal).toContain("name: '@clawport/dsh-projects'")
    expect(safe).not.toContain('@clawport/dsh-projects')
    expect(dshPatch).toContain('+    "@clawport/dsh-projects": "0.2.0",')
  })

  it('stages explicitly and verifies the private artifact before packaging', async () => {
    const [manifest, hook] = await Promise.all([source('package.json'), source('scripts/prepare-dmg-background.cjs')])
    const pkg = JSON.parse(manifest)
    expect(pkg.scripts['clawport:stage-plugin']).toBe('node scripts/stage-clawport-plugin.mjs')
    expect(hook).toContain('verifyStagedClawPortPlugin')
  })
})
