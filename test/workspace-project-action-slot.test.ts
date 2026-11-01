import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const workspaceClientPath = path.resolve(
  import.meta.dirname,
  '../node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js'
)

interface ElementNode {
  type: unknown
  props: Record<string, unknown>
}

function containsNode(value: unknown, target: unknown): boolean {
  if (value === target) return true
  if (Array.isArray(value)) return value.some(item => containsNode(item, target))
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).some(item => containsNode(item, target))
}

describe('workspace project action slot', () => {
  it('declares a root list slot for workspace row actions', async () => {
    const source = await readFile(workspaceClientPath, 'utf8')
    const start = source.indexOf('ctx.slots.inject("sidebar.workspaces",')
    const end = source.indexOf('\n\t\t\tctx.slots.inject("sidebar.workspaces.session.menu.item"', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    let registration: { children?: Record<string, unknown> } | undefined
    const run = vm.runInNewContext(
      `(ctx, browserInjected, viewStore, NS, WorkspaceBrowser) => { ${source.slice(start, end)} }`,
      { menuOpenStateFactory: () => undefined }
    ) as (...args: unknown[]) => void
    run({
      shortcuts: { catalog: {} },
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (config: { children?: Record<string, unknown> }) => { registration = config }
      }
    }, {}, {}, 'workspace', () => undefined)

    expect(registration?.children?.['sidebar.workspaces.workspace.row.action']).toEqual({
      kind: 'list',
      scope: 'root'
    })
  })

  it('renders one action contribution for a real workspace and none for ungrouped', async () => {
    const source = await readFile(workspaceClientPath, 'utf8')
    const start = source.indexOf('function ProjectRowItem(')
    const end = source.indexOf('\n\t\t/* v8 ignore next 3', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const jsx = (type: unknown, props: Record<string, unknown>): ElementNode => ({ type, props })
    const primitives = new Proxy({}, { get: (_target, key) => key })
    const ProjectRowItem = vm.runInNewContext(
      `(() => { ${source.slice(start, end)}; return ProjectRowItem })()`,
      {
        react: { useState: (initial: unknown) => [initial, () => undefined] },
        react_jsx_runtime: { jsx, jsxs: jsx },
        _deepseek_ai_dsh_client_ui_primitives: primitives,
        Rows_module_css_default: new Proxy({}, { get: (_target, key) => String(key) }),
        clsx: (...values: unknown[]) => values.filter(Boolean).join(' '),
        WorkspaceHoverContent: 'WorkspaceHoverContent',
        abbreviateHomePath: (value: string) => value
      }
    ) as (props: Record<string, unknown>) => ElementNode

    const contribution = { type: 'project-action' }
    const renderSlot = vi.fn(() => contribution)
    const common = {
      containsCurrentDescendant: false,
      onToggle: () => undefined,
      onCreate: () => undefined,
      actions: { rename: () => undefined, delete: () => undefined },
      renderSlot,
      t: (key: string) => key
    }
    const workspaceRow = ProjectRowItem({
      ...common,
      group: {
        key: 'workspace-1',
        workspaceId: 'workspace-1',
        label: 'Workspace A',
        expanded: true,
        containsCurrent: false
      }
    })

    expect(renderSlot).toHaveBeenCalledOnce()
    expect(renderSlot).toHaveBeenCalledWith('sidebar.workspaces.workspace.row.action', {
      workspaceId: 'workspace-1',
      displayTitle: 'Workspace A'
    })
    expect(containsNode(workspaceRow, contribution)).toBe(true)

    renderSlot.mockClear()
    ProjectRowItem({
      ...common,
      actions: undefined,
      group: { key: 'ungrouped', label: 'Ungrouped', expanded: true, containsCurrent: false }
    })
    expect(renderSlot).not.toHaveBeenCalled()
  })
})
