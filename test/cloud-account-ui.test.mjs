// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function loadPlugin(bridge) {
  const source = await readFile(resolve('packages/dsh-desktop-client-ui/client.js'), 'utf8')
  let plugin
  new Function('window', 'document', 'console', source)(
    { dshDesktop: bridge, __ModuleLoader__: { load(entry) { plugin = entry.factory(name => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') {
        return { BrandWordmark: 'span', FishLogo: 'span', MenuItemButton: 'button', Tooltip: ({ children }) => children }
      }
      throw new Error(name)
    }) } } },
    document,
    console
  )
  const registrations = []
  const dictionaries = new Map()
  const disposers = []
  const ctx = {
    locale: {
      register(namespace, copy) { dictionaries.set(namespace, copy); return () => dictionaries.delete(namespace) },
      bind(namespace) { return key => dictionaries.get(namespace)?.en?.[key] ?? key }
    },
    effect(setup) { const dispose = setup(); if (typeof dispose === 'function') disposers.push(dispose) },
    slots: {
      inject(_name, setup) { const result = setup(); if (result && typeof result[Symbol.iterator] === 'function') Array.from(result) },
      register(options, Component) { registrations.push({ options, Component }); return () => undefined }
    },
    get() { return undefined },
    remote: { session: {} }, sessions: {}
  }
  plugin.apply(ctx)
  return { registrations, dictionaries, dispose: () => disposers.reverse().forEach(dispose => dispose()) }
}

describe('ClawPort account settings section', () => {
  it('registers bilingual settings copy in the native section slot', async () => {
    const loaded = await loadPlugin({})
    try {
      const entry = loaded.registrations.find(item => item.options.id === 'clawport-account')
      expect(entry.options).toMatchObject({ name: 'settings.section', id: 'clawport-account', order: -20 })
      expect(entry.options.label()).toBe('ClawPort Account')
      const copy = loaded.dictionaries.get('dsh-desktop-cloud-account')
      expect(copy.zh.nav).toBe('ClawPort 账号')
      expect(copy.en.login).toBe('Sign in with ClawPort')
    } finally {
      loaded.dispose()
    }
  })

  it('mounts, follows native identity events, routes login, and unsubscribes on unmount', async () => {
    let publish
    const unsubscribe = vi.fn()
    const signedOut = { phase: 'signedOut', revision: 0, secureStorageAvailable: true }
    const connected = {
      phase: 'connected', revision: 2, secureStorageAvailable: true,
      identity: { memberId: 'member-1', displayName: 'Ada', email: 'ada@example.com', role: 'owner' },
      workspace: { tenantId: 'tenant-1', tenantName: 'ClawPort Legal', projectId: 'project-1', projectName: 'Matter One' },
      device: { id: 'device-1', name: 'Ada Mac', platform: 'darwin', appVersion: '0.1.0' },
      runtime: { id: 'runtime-1', kind: 'desktop' }, accessExpiresAt: '2026-11-01T01:10:00.000Z'
    }
    const bridge = {
      getCloudIdentity: vi.fn(async () => signedOut),
      startCloudLogin: vi.fn(async () => ({ ...signedOut, phase: 'authorizing', revision: 1, publicUserCode: 'AbC-42' })),
      refreshCloudIdentity: vi.fn(async () => signedOut),
      revokeCloudIdentity: vi.fn(async () => signedOut),
      onCloudIdentityChanged: vi.fn(listener => { publish = listener; return unsubscribe })
    }
    const loaded = await loadPlugin(bridge)
    const entry = loaded.registrations.find(item => item.options.id === 'clawport-account')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(React.createElement(entry.Component, entry.options.inject())))
      expect(container.querySelector('[data-clawport-cloud-phase="signedOut"]')).not.toBeNull()
      await act(async () => container.querySelector('button[data-cloud-action="login"]').click())
      expect(bridge.startCloudLogin).toHaveBeenCalledOnce()
      expect(container.textContent).toContain('AbC-42')

      await act(async () => publish(connected))
      expect(container.querySelector('[data-clawport-cloud-phase="connected"]')).not.toBeNull()
      expect(container.textContent).toContain('Ada')
      expect(container.textContent).toContain('ClawPort Legal')
      expect(container.textContent).toContain('Ada Mac')
      await act(async () => container.querySelector('button[data-cloud-action="logout"]').click())
      expect(bridge.revokeCloudIdentity).toHaveBeenCalledOnce()
      expect(container.querySelector('[data-clawport-cloud-phase="signedOut"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      loaded.dispose()
    }
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('offers logout retry instead of login while revocation is pending', async () => {
    const pending = {
      phase: 'error', revision: 4, secureStorageAvailable: true,
      error: { code: 'logout_pending', message: 'Cloud sign-out is pending.' }
    }
    const signedOut = { phase: 'signedOut', revision: 5, secureStorageAvailable: true }
    const bridge = {
      getCloudIdentity: vi.fn(async () => pending),
      startCloudLogin: vi.fn(async () => pending),
      refreshCloudIdentity: vi.fn(async () => signedOut),
      revokeCloudIdentity: vi.fn(async () => signedOut),
      onCloudIdentityChanged: vi.fn(() => () => undefined)
    }
    const loaded = await loadPlugin(bridge)
    const entry = loaded.registrations.find(item => item.options.id === 'clawport-account')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(React.createElement(entry.Component, entry.options.inject())))
      await vi.waitFor(() => expect(container.querySelector('[data-clawport-cloud-phase="error"]')).not.toBeNull())
      expect(container.querySelector('button[data-cloud-action="login"]')).toBeNull()

      await act(async () => container.querySelector('button[data-cloud-action="retry"]').click())
      expect(bridge.refreshCloudIdentity).toHaveBeenCalledOnce()
      expect(bridge.startCloudLogin).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      loaded.dispose()
    }
  })
})
