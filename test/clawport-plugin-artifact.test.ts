import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as tar from 'tar'
import {
  stageClawPortPluginIntoRoot,
  validateClawPortPluginPackage,
  verifyStagedClawPortPlugin
} from '../scripts/stage-clawport-plugin.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('private ClawPort plugin artifact contract', () => {
  it('pins the package and both DSH entrypoints without tracking private source', async () => {
    const manifest = JSON.parse(await readFile(path.resolve('artifact-assembly/clawport-plugin.json'), 'utf8'))
    expect(manifest).toEqual({
      packageName: '@clawport/dsh-projects',
      version: '0.2.0',
      entries: ['lib/index.js', 'lib/client.js'],
      stageDirectory: '.build/clawport-plugin/package'
    })
  })

  it('accepts only the pinned built package', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'clawport-plugin-artifact-'))
    roots.push(root)
    await mkdir(path.join(root, 'lib'), { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@clawport/dsh-projects', version: '0.2.0' }))
    await writeFile(path.join(root, 'lib/index.js'), 'export function apply() {}')
    await writeFile(path.join(root, 'lib/client.js'), 'window.__ModuleLoader__ = window.__ModuleLoader__')
    await expect(validateClawPortPluginPackage(root)).resolves.toBeUndefined()

    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@clawport/dsh-projects', version: '0.2.1' }))
    await expect(validateClawPortPluginPackage(root)).rejects.toThrow('@clawport/dsh-projects@0.2.0')
  })

  it('projects an npm artifact into staging and the installed DSH dependency closure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'clawport-plugin-assembly-'))
    roots.push(root)
    const source = path.join(root, 'source', 'package')
    await mkdir(path.join(source, 'lib'), { recursive: true })
    await mkdir(path.join(root, 'node_modules/@deepseek-ai/dsh'), { recursive: true })
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: '@clawport/dsh-projects', version: '0.2.0' }))
    await writeFile(path.join(source, 'lib/index.js'), 'export function apply() {}')
    await writeFile(path.join(source, 'lib/client.js'), 'window.__ModuleLoader__ = window.__ModuleLoader__')
    await writeFile(path.join(root, 'node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({ dependencies: {} }))
    const artifact = path.join(root, 'plugin.tgz')
    await tar.c({ gzip: true, file: artifact, cwd: path.join(root, 'source') }, ['package'])

    await stageClawPortPluginIntoRoot(artifact, root)
    await expect(verifyStagedClawPortPlugin(root)).resolves.toBeUndefined()
    expect(JSON.parse(await readFile(path.join(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).dependencies)
      .toMatchObject({ '@clawport/dsh-projects': '0.2.0' })
  })

  it('reports the staging command when product packaging has no artifact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'clawport-plugin-missing-'))
    roots.push(root)
    await expect(verifyStagedClawPortPlugin(root)).rejects.toThrow('npm run clawport:stage-plugin')
  })
})
