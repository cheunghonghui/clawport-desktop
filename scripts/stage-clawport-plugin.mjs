import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as tar from 'tar'

const projectRoot = path.resolve(import.meta.dirname, '..')
const contract = JSON.parse(await readFile(path.join(projectRoot, 'artifact-assembly/clawport-plugin.json'), 'utf8'))

export async function validateClawPortPluginPackage(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  if (manifest.name !== contract.packageName || manifest.version !== contract.version) {
    throw new Error(`Artifact must be ${contract.packageName}@${contract.version}.`)
  }
  for (const entry of contract.entries) {
    if (!(await stat(path.join(directory, entry))).isFile()) throw new Error(`Artifact is missing ${entry}.`)
  }
}

export async function stageClawPortPlugin(artifact) {
  return stageClawPortPluginIntoRoot(artifact, projectRoot)
}

export async function stageClawPortPluginIntoRoot(artifact, root) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'clawport-plugin-stage-'))
  const stage = path.join(root, contract.stageDirectory)
  const installed = path.join(root, 'node_modules', ...contract.packageName.split('/'))
  try {
    await tar.x({ file: path.resolve(artifact), cwd: temporary })
    const source = path.join(temporary, 'package')
    await validateClawPortPluginPackage(source)
    await rm(stage, { recursive: true, force: true })
    await mkdir(path.dirname(stage), { recursive: true })
    await rename(source, stage)
    await rm(installed, { recursive: true, force: true })
    await mkdir(path.dirname(installed), { recursive: true })
    await cp(stage, installed, { recursive: true })
    const dshManifestPath = path.join(root, 'node_modules/@deepseek-ai/dsh/package.json')
    const dshManifest = JSON.parse(await readFile(dshManifestPath, 'utf8'))
    dshManifest.dependencies = { ...dshManifest.dependencies, [contract.packageName]: contract.version }
    await writeFile(dshManifestPath, `${JSON.stringify(dshManifest, null, 2)}\n`, 'utf8')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function verifyStagedClawPortPlugin(root = projectRoot) {
  try {
    await validateClawPortPluginPackage(path.join(root, contract.stageDirectory))
    await validateClawPortPluginPackage(path.join(root, 'node_modules', ...contract.packageName.split('/')))
  } catch (error) {
    throw new Error(
      `ClawPort product packaging requires ${contract.packageName}@${contract.version}. Run npm run clawport:stage-plugin -- --artifact /absolute/path/package.tgz.`,
      { cause: error }
    )
  }
}

async function main() {
  const index = process.argv.indexOf('--artifact')
  const artifact = index >= 0 ? process.argv[index + 1] : undefined
  if (!artifact) throw new Error('Usage: npm run clawport:stage-plugin -- --artifact /absolute/path/package.tgz')
  await stageClawPortPlugin(artifact)
  console.log(`Staged ${contract.packageName}@${contract.version}.`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main()
}
