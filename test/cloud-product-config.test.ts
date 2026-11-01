import { describe, expect, it } from 'vitest'
import { resolveProductCloudOrigin } from '../src/main/product-config'

describe('resolveProductCloudOrigin', () => {
  it('uses the public ClawPort origin by default', () => {
    expect(resolveProductCloudOrigin(false, undefined)).toBe('https://clawport.si')
  })

  it('allows a loopback HTTP API only in development', () => {
    expect(resolveProductCloudOrigin(true, 'http://127.0.0.1:4010')).toBe('http://127.0.0.1:4010')
    expect(() => resolveProductCloudOrigin(false, 'http://127.0.0.1:4010')).toThrow('HTTPS')
    expect(() => resolveProductCloudOrigin(true, 'http://api.example.com')).toThrow('loopback')
  })

  it('rejects origins with paths or credentials', () => {
    expect(() => resolveProductCloudOrigin(true, 'https://clawport.si/api')).toThrow('origin')
    expect(() => resolveProductCloudOrigin(true, 'https://user:pass@clawport.si')).toThrow('origin')
  })
})
