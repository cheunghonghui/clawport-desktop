import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const UPSTREAM_REPOSITORY = 'dataelement/dsh-desktop'
const CLAWPORT_REPOSITORY = 'cheunghonghui/clawport-desktop'

type Job = { if?: string; needs?: string | string[]; steps: Array<Record<string, unknown>>; 'runs-on'?: string }
type Workflow = {
  on: Record<string, unknown>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

function workflow(name: string): Workflow {
  return parse(readFileSync(`.github/workflows/${name}`, 'utf8')) as Workflow
}

function enabled(expression: string | undefined, repository: string | undefined, overrides: {
  event?: string
  ref?: string
  inputs?: Record<string, string>
} = {}): boolean {
  const eventName = overrides.event ?? 'workflow_dispatch'
  const javaScriptExpression = (expression ?? 'true').replace(
    /needs\.([a-z0-9]+(?:-[a-z0-9]+)+)/g,
    (_, name: string) => `needs['${name}']`
  )
  return Boolean(runInNewContext(javaScriptExpression, {
    github: {
      repository,
      event_name: eventName,
      ref: overrides.ref ?? 'refs/heads/main',
      event: {
        issue: {},
        comment: { user: { type: 'User' } }
      }
    },
    inputs: {
      mode: 'development',
      target: 'all',
      version: '',
      source_run_id: '',
      checks: 'standard',
      ...overrides.inputs
    },
    needs: new Proxy({}, { get: () => ({ result: 'success' }) }),
    startsWith: (value: string, prefix: string) => value.startsWith(prefix),
    always: () => true
  }))
}

describe('ClawPort GitHub workflows', () => {
  it('keeps every upstream automation job disabled in the ClawPort repository', () => {
    const release = workflow('release.yml')
    const releaseScenarios: Record<string, Parameters<typeof enabled>[2]> = {
      'validate-dispatch': {},
      macos: {},
      'windows-x64': {},
      'sign-windows': { inputs: { mode: 'signed' } },
      'publish-signed-test': { inputs: { mode: 'signed' } },
      publish: { inputs: { mode: 'publish' } },
      'publish-prerelease': { inputs: { mode: 'prerelease', version: '0.1.0-rc.1' } }
    }
    for (const [jobName, job] of Object.entries(release.jobs)) {
      expect(enabled(job.if, CLAWPORT_REPOSITORY, releaseScenarios[jobName]), jobName).toBe(false)
      expect(enabled(job.if, undefined, releaseScenarios[jobName]), jobName).toBe(false)
      expect(enabled(job.if, UPSTREAM_REPOSITORY, releaseScenarios[jobName]), jobName).toBe(true)
    }

    const backfill = workflow('backfill-archive.yml')
    for (const [jobName, job] of Object.entries(backfill.jobs)) {
      expect(enabled(job.if, CLAWPORT_REPOSITORY), jobName).toBe(false)
      expect(enabled(job.if, undefined), jobName).toBe(false)
      expect(enabled(job.if, UPSTREAM_REPOSITORY), jobName).toBe(true)
    }

    const issueFeedback = workflow('issue-feedback.yml')
    const issueScenarios: Record<string, Parameters<typeof enabled>[2]> = {
      'follow-up': { event: 'schedule' },
      'feedback-received': { event: 'issue_comment' }
    }
    for (const [jobName, job] of Object.entries(issueFeedback.jobs)) {
      expect(enabled(job.if, CLAWPORT_REPOSITORY, issueScenarios[jobName]), jobName).toBe(false)
      expect(enabled(job.if, undefined, issueScenarios[jobName]), jobName).toBe(false)
      expect(enabled(job.if, UPSTREAM_REPOSITORY, issueScenarios[jobName]), jobName).toBe(true)
    }
  })

  it('runs only read-only validation on a native Apple Silicon runner', () => {
    const ci = workflow('clawport-ci.yml')
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'workflow_dispatch'])
    expect(ci.permissions).toEqual({ contents: 'read' })
    expect(Object.keys(ci.jobs)).toEqual(['verify'])

    const verify = ci.jobs.verify
    expect(verify?.['runs-on']).toBe('macos-15')
    expect(verify?.steps.filter(step => 'run' in step).map(step => step.run)).toEqual([
      'npm ci',
      'npm run typecheck',
      'npm run build',
      'npm test'
    ])
    expect(verify?.steps.filter(step => 'uses' in step).map(step => step.uses)).toEqual([
      'actions/checkout@v4',
      'actions/setup-node@v4'
    ])
    expect(verify?.steps.find(step => step.uses === 'actions/setup-node@v4')?.with).toEqual({
      'node-version': 24,
      cache: 'npm'
    })
    expect(readFileSync('.github/workflows/clawport-ci.yml', 'utf8')).not.toMatch(/secrets\.|publish|sign|webhook|message/i)
  })
})
