import { describe, expect, it } from 'vitest'
import {
  assertCloudBusinessRequest,
  isAllowedCloudBusinessRequest
} from '../src/shared/cloud-business'

describe('ClawPort cloud business request contract', () => {
  it.each([
    ['GET', '/v1/workbench/bootstrap'],
    ['GET', '/v1/business-projects?limit=20&cursor=next%2Fpage'],
    ['PUT', '/v1/dsh/session-links/session%2Fone'],
    ['POST', '/v1/dsh-memory/batches/commit'],
    ['PATCH', '/v1/firm-process-copies/copy-1']
  ] as const)('allows the plugin business route %s %s', (method, path) => {
    expect(isAllowedCloudBusinessRequest({ method, path })).toBe(true)
  })

  it.each([
    ['GET', '/v1/infrastructure/runtime-targets'],
    ['POST', '/v1/skills'],
    ['GET', '/v1/business-projects/project-1/members'],
    ['POST', '/v1/firm-process-copies/copy-1'],
    ['GET', 'https://cloud.example/v1/business-projects'],
    ['GET', '/v1/business-projects#members'],
    ['GET', '/v1/business-projects/../infrastructure/runtime-targets']
  ] as const)('rejects a request outside the exact business surface: %s %s', (method, path) => {
    expect(() => assertCloudBusinessRequest({ method, path })).toThrow('cloud business request')
  })

  it('accepts a JSON body and optional runtime fence while rejecting malformed input', () => {
    expect(assertCloudBusinessRequest({
      method: 'POST',
      path: '/v1/business-projects',
      body: { name: 'Matter A', tags: ['priority'] },
      expectedRuntimeId: '00000000-0000-4000-8000-000000000901'
    })).toEqual({
      method: 'POST',
      path: '/v1/business-projects',
      body: { name: 'Matter A', tags: ['priority'] },
      expectedRuntimeId: '00000000-0000-4000-8000-000000000901'
    })
    expect(() => assertCloudBusinessRequest({ method: 'POST', path: '/v1/business-projects', body: undefined, extra: true })).toThrow()
    expect(() => assertCloudBusinessRequest({ method: 'POST', path: '/v1/business-projects', expectedRuntimeId: '' })).toThrow()
  })
})
