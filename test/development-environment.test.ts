import { describe, expect, it } from 'vitest'
import { developmentEnvironment } from '../src/main/development-environment'

describe('development worktree isolation', () => {
  it('keeps defaults and ignores development overrides in production', () => {
    expect(developmentEnvironment(false, 44129, { DSH_DEV_PROFILE: '../unsafe', DSH_DEV_HARNESS_PORT: 'invalid' }))
      .toEqual({ profile: 'clawport-desktop', harnessPort: 44129, mobilePort: 44127 })
    expect(developmentEnvironment(true, 44129, {}))
      .toEqual({ profile: 'clawport-desktop-dev', harnessPort: 44130, mobilePort: 44128 })
  })

  it('uses distinct profile and loopback ports for a second worktree', () => {
    expect(developmentEnvironment(true, 44129, {
      DSH_DEV_PROFILE: 'clawport-desktop-dev-workbench', DSH_DEV_HARNESS_PORT: '44132', DSH_DEV_MOBILE_PORT: '44133'
    })).toEqual({ profile: 'clawport-desktop-dev-workbench', harnessPort: 44132, mobilePort: 44133 })
  })

  it.each(['../profile', '/tmp/profile', 'a/b', 'a\\b', 'dsh-desktop', 'dsh-desktop-dev', 'clawport-desktop', '..'])('rejects unsafe profile %s', profile => {
    expect(() => developmentEnvironment(true, 44129, { DSH_DEV_PROFILE: profile })).toThrow('DSH_DEV_PROFILE')
  })

  it.each(['0', '1023', '65536', '-1', '12.5', 'invalid', ' 44132 '])('rejects invalid port %s', value => {
    expect(() => developmentEnvironment(true, 44129, { DSH_DEV_HARNESS_PORT: value })).toThrow('DSH_DEV_HARNESS_PORT')
    expect(() => developmentEnvironment(true, 44129, { DSH_DEV_MOBILE_PORT: value })).toThrow('DSH_DEV_MOBILE_PORT')
  })

  it('rejects colliding service ports', () => {
    expect(() => developmentEnvironment(true, 44129, { DSH_DEV_MOBILE_PORT: '44130' })).toThrow('must differ')
  })
})
