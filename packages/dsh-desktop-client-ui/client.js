window.__ModuleLoader__.load({
  id: 'dsh-desktop-client-ui',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { BrandWordmark, FishLogo, MenuItemButton, Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives')

    // Tight bounds of the mark inside its 1000x1000 source artwork.
    const BRAND_MARK_VIEWBOX = { x: 42, y: 218, width: 898, height: 564 }
    // DSH Desktop whale mark: a window with a tail, drawn in currentColor so
    // it follows the sidebar text color in both themes.
    const BRAND_MARK_PATH = "M478.318 218C605.318 218 683.318 287 687.318 404L691.318 472C693.318 525 697.319 556 726.318 574C746.318 587 774.318 585 790.318 562C799.318 550 802.318 539 792.318 534C747.319 513 727.318 472 738.318 428C739.652 420 742.652 418.667 747.318 424C774.318 450 815.318 460 831.318 501C855.318 457 898.318 456 930.318 436C936.318 431.333 939.318 433.333 939.318 442C938.318 496 903.318 535 850.318 547C841.318 570 833.318 592 819.318 622C773.318 723 661.318 782 491.318 782H294.318C161.319 782 74.3183 714 53.3184 592C41.3184 526 38.3184 433 50.3184 375C70.3184 277 113.82 218 234.32 218H478.318ZM571.82 350.5C469.82 333.5 277.82 329.5 164.82 350.5C138.82 355.5 114.318 379 110.318 404C100.318 451 102.318 551 124.318 596C155.318 660 214.319 697 315.318 705C324.318 678 346.319 662 376.318 662C404.318 662 427.318 678 435.318 705C493.318 699 526.318 680 562.318 652C621.318 606 633.749 527.103 633.749 424C633.749 385.144 604.82 355.5 571.82 350.5ZM179.32 264C167.722 264 158.32 273.402 158.32 285C158.32 296.598 167.722 306 179.32 306C190.918 306 200.32 296.598 200.32 285C200.32 273.402 190.918 264 179.32 264ZM245.551 264C233.953 264 224.551 273.402 224.551 285C224.551 296.598 233.953 306 245.551 306C257.149 306 266.551 296.598 266.551 285C266.551 273.402 257.149 264 245.551 264ZM311.782 264C300.184 264 290.782 273.402 290.782 285C290.782 296.598 300.184 306 311.782 306C323.38 306 332.782 296.598 332.782 285C332.782 273.402 323.38 264 311.782 264Z"

    function DesktopBrandMark() {
      const height = 17
      return React.createElement(
        'svg',
        {
          width: height * BRAND_MARK_VIEWBOX.width / BRAND_MARK_VIEWBOX.height,
          height,
          viewBox: `${BRAND_MARK_VIEWBOX.x} ${BRAND_MARK_VIEWBOX.y} ${BRAND_MARK_VIEWBOX.width} ${BRAND_MARK_VIEWBOX.height}`,
          fill: 'none',
          'aria-hidden': 'true'
        },
        React.createElement('path', { d: BRAND_MARK_PATH, fill: 'currentColor' })
      )
    }

    function DesktopBrandName() {
      return React.createElement(BrandWordmark, { includeMark: false })
    }

    function ConversationBrandMark(props) {
      return React.createElement(FishLogo, props)
    }

    function OpenUnpreviewableFile({ absolutePath, openWorkspacePath }) {
      const [error, setError] = React.useState('')
      const label = document.documentElement.lang?.toLowerCase().startsWith('zh')
        ? '用本地应用打开'
        : 'Open with local app'
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('button', {
          type: 'button',
          'data-textpreview-open-local': true,
          onClick: () => {
            setError('')
            void openWorkspacePath(absolutePath).catch((reason) => {
              setError(reason instanceof Error ? reason.message : String(reason))
            })
          }
        }, label),
        error && React.createElement('span', { role: 'alert' }, error)
      )
    }

    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState, deleteSession }) {
      const [, setMenuOpen] = useMenuOpenState()
      const chinese = document.documentElement.lang?.toLowerCase().startsWith('zh')
      const label = chinese ? '永久删除会话' : 'Delete session permanently'
      const warning = chinese
        ? `确定删除“${displayTitle || sessionId}”？工作区文件会保留。此操作无法撤销。`
        : `Delete “${displayTitle || sessionId}”? Workspace files are kept. This can’t be undone.`
      return React.createElement(MenuItemButton, {
        danger: true,
        onSelect: () => {
          setMenuOpen(false)
          if (!window.confirm(warning)) return
          void Promise.resolve().then(() => deleteSession(sessionId)).catch((reason) => {
            window.alert(reason instanceof Error ? reason.message : String(reason))
          })
        }
      }, label)
    }

    function OpenSessionFolderMenuItem({ sessionId, useMenuOpenState, openInFinder }) {
      const [, setMenuOpen] = useMenuOpenState()
      if (typeof window.dshDesktop?.openInFinder !== 'function') return null
      const chinese = document.documentElement.lang?.toLowerCase().startsWith('zh')
      const label = chinese ? '在文件管理器中打开' : 'Open in file manager'
      return React.createElement(MenuItemButton, {
        onSelect: () => {
          setMenuOpen(false)
          void Promise.resolve().then(() => openInFinder(sessionId)).catch((reason) => {
            window.alert(reason instanceof Error ? reason.message : String(reason))
          })
        }
      }, label)
    }

    function UnreadSessionMenuItem({ sessionId, unread, onUnreadChange, useMenuOpenState }) {
      const [, setMenuOpen] = useMenuOpenState()
      const chinese = document.documentElement.lang?.toLowerCase().startsWith('zh')
      return React.createElement(MenuItemButton, {
        onSelect: () => {
          setMenuOpen(false)
          onUnreadChange(sessionId, !unread)
        }
      }, unread ? (chinese ? '标为已读' : 'Mark as read') : (chinese ? '标为未读' : 'Mark as unread'))
    }

    const ENTERPRISE_NS = 'dsh-desktop-enterprise-entry'
    function EnterpriseEntry({ t }) {
      return React.createElement('a', {
        href: 'https://dshdesktop.com/zh/enterprise/', target: '_blank', rel: 'noopener noreferrer',
        'data-dsh-enterprise-entry': true
      }, t('learnMore'), React.createElement('span', { 'aria-hidden': true }, ' ↗'))
    }

    const CLOUD_NS = 'dsh-desktop-cloud-account'
    const EMPTY_CLOUD_IDENTITY = { phase: 'signedOut', revision: 0, secureStorageAvailable: true }

    function CloudAccountSection({ t }) {
      const [snapshot, setSnapshot] = React.useState(EMPTY_CLOUD_IDENTITY)
      const [busy, setBusy] = React.useState(false)
      const mounted = React.useRef(true)
      React.useEffect(() => {
        mounted.current = true
        const bridge = window.dshDesktop
        if (typeof bridge?.getCloudIdentity !== 'function') {
          setSnapshot({ phase: 'error', revision: 0, secureStorageAvailable: false, error: { code: 'bridge_unavailable', message: t('unavailable') } })
          return () => { mounted.current = false }
        }
        const unsubscribe = bridge.onCloudIdentityChanged?.(value => {
          if (mounted.current) setSnapshot(value)
        })
        void bridge.getCloudIdentity().then(value => {
          if (mounted.current) setSnapshot(value)
        }).catch(() => {
          if (mounted.current) setSnapshot({ phase: 'error', revision: 0, secureStorageAvailable: true, error: { code: 'bridge_failed', message: t('unavailable') } })
        })
        return () => { mounted.current = false; unsubscribe?.() }
      }, [t])

      const perform = async operation => {
        if (busy) return
        setBusy(true)
        try {
          const value = await operation()
          if (mounted.current) setSnapshot(value)
        } catch {
          if (mounted.current) setSnapshot(current => ({ ...current, phase: 'error', error: { code: 'bridge_failed', message: t('unavailable') } }))
        } finally {
          if (mounted.current) setBusy(false)
        }
      }
      const bridge = window.dshDesktop
      const statusKey = snapshot.phase === 'signedOut' ? 'signedOut'
        : snapshot.phase === 'authorizing' ? 'authorizing'
          : snapshot.phase === 'refreshing' ? 'refreshing'
            : snapshot.phase === 'connected' ? 'connected'
              : snapshot.phase === 'offline' ? 'offline'
                : snapshot.phase === 'reauthRequired' ? 'reauthRequired' : 'error'
      const logoutPending = snapshot.error?.code === 'logout_pending'
      const login = !logoutPending && (snapshot.phase === 'signedOut' || snapshot.phase === 'reauthRequired' || snapshot.phase === 'error')
      const retry = logoutPending || snapshot.phase === 'offline'

      return React.createElement('section', {
        'data-clawport-cloud-account': true,
        'data-clawport-cloud-phase': snapshot.phase,
        'aria-labelledby': 'clawport-cloud-account-heading'
      },
      React.createElement('header', { 'data-cloud-header': true },
        React.createElement('div', null,
          React.createElement('h2', { id: 'clawport-cloud-account-heading' }, t('title')),
          React.createElement('p', { 'data-cloud-status': snapshot.phase, 'aria-live': 'polite' }, t(statusKey))
        ),
        React.createElement('div', { 'data-cloud-actions': true },
          login && React.createElement('button', {
            type: 'button', disabled: busy || !snapshot.secureStorageAvailable,
            'data-cloud-action': 'login',
            onClick: () => { void perform(() => bridge.startCloudLogin()) }
          }, busy ? t('working') : t('login')),
          retry && React.createElement('button', {
            type: 'button', disabled: busy,
            'data-cloud-action': 'retry',
            onClick: () => { void perform(() => bridge.refreshCloudIdentity()) }
          }, busy ? t('working') : t('retry')),
          snapshot.phase === 'connected' && React.createElement('button', {
            type: 'button', disabled: busy,
            'data-cloud-action': 'logout',
            onClick: () => { void perform(() => bridge.revokeCloudIdentity()) }
          }, busy ? t('working') : t('logout'))
        )
      ),
      !snapshot.secureStorageAvailable && React.createElement('p', { role: 'alert', 'data-cloud-error': true }, t('secureStorageUnavailable')),
      snapshot.publicUserCode && React.createElement('div', { 'data-cloud-user-code': true },
        React.createElement('span', null, t('userCode')),
        React.createElement('strong', null, snapshot.publicUserCode)
      ),
      snapshot.phase === 'connected' && snapshot.identity && snapshot.workspace && snapshot.device && React.createElement('dl', { 'data-cloud-details': true },
        React.createElement('div', null, React.createElement('dt', null, t('user')), React.createElement('dd', null,
          React.createElement('strong', null, snapshot.identity.displayName),
          snapshot.identity.email && React.createElement('span', null, snapshot.identity.email))),
        React.createElement('div', null, React.createElement('dt', null, t('firm')), React.createElement('dd', null,
          React.createElement('strong', null, snapshot.workspace.tenantName),
          React.createElement('span', null, snapshot.workspace.projectName))),
        React.createElement('div', null, React.createElement('dt', null, t('device')), React.createElement('dd', null,
          React.createElement('strong', null, snapshot.device.name),
          React.createElement('span', null, snapshot.device.platform === 'darwin' ? 'macOS' : 'Windows')))
      ),
      snapshot.error && React.createElement('p', { role: 'alert', 'data-cloud-error': true },
        snapshot.error.code === 'logout_pending' ? t('logoutPending') : snapshot.error.message)
      )
    }

    const REPAIR_NS = 'dsh-desktop-repair'
    function DesktopUtilityActions({ t, wide }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [connected, setConnected] = React.useState(false)
      const mounted = React.useRef(true)
      React.useEffect(() => {
        mounted.current = true
        const bridge = window.dshDesktop
        const unsubscribe = bridge?.onMobileStatus?.(status => {
          if (mounted.current) setConnected(status.connected === true)
        })
        void bridge?.getMobileStatus?.().then(status => {
          if (mounted.current) setConnected(status.connected === true)
        }).catch(reason => { if (mounted.current) setError(t('phoneFailed')) })
        return () => { mounted.current = false; unsubscribe?.() }
      }, [t])
      const bridge = window.dshDesktop
      if (!bridge) return null
      const open = async (operation) => {
        if (busy) return
        setBusy(true); setError('')
        try {
          const result = await operation()
          if (result?.ok === false) throw new Error(result.error || t('failed'))
        } catch (reason) {
          if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
        } finally { if (mounted.current) setBusy(false) }
      }
      const icon = (kind) => React.createElement('svg', {
        width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true
      }, kind === 'phone'
        ? React.createElement(React.Fragment, null,
          React.createElement('rect', { x: 7, y: 2.75, width: 10, height: 18.5, rx: 2.25 }),
          React.createElement('path', { d: 'M10.2 5.5h3.6M10.5 18.35h3' }))
        : React.createElement('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-7.91 7.91a2.12 2.12 0 0 1-3-3l7.91-7.91a6 6 0 0 1 7.94-7.94z' }))
      return React.createElement('div', { 'data-dsh-desktop-utilities': true, 'data-wide': wide },
        typeof bridge.openRepairAgent === 'function' && React.createElement(Tooltip, {
          label: t(busy ? 'opening' : 'description'), side: 'top', align: 'end',
          portal: true, maxWidth: 280, delayMs: 0, focusDelayMs: 0
        }, React.createElement('button', {
          type: 'button', disabled: busy,
          'aria-label': t(busy ? 'opening' : 'open'), 'aria-description': t('description'), 'data-dsh-repair-entry': true,
          onClick: () => { void open(() => bridge.openRepairAgent()) }
        }, icon('repair'))),
        typeof bridge.openMobilePairing === 'function' && (wide || connected) && React.createElement('button', {
          type: 'button', disabled: busy, title: t(connected ? 'phoneManage' : 'phone'),
          'aria-label': t(connected ? 'phoneManage' : 'phone'), 'data-dsh-mobile-entry': true,
          onClick: () => { void open(() => bridge.openMobilePairing()) }
        }, icon('phone'), connected && React.createElement('span', { 'data-connected': true, 'aria-hidden': true })),
        error && React.createElement('span', { role: 'alert', 'data-dsh-utility-error': true }, error))
    }

    // The session-scope slot supplies Harness's public editor actions. Capture the
    // revision before IPC so an async suggestion can never overwrite a user's edit.
    function RepairDraft({ session, input, inputActions }) {
      const currentInput = React.useRef(input)
      currentInput.current = input
      React.useEffect(() => {
        const bridge = window.dshDesktop
        if (typeof bridge?.getRepairDraft !== 'function') return
        let live = true
        const sessionId = session.sessionId
        const span = inputActions.captureInsertion()
        const empty = input.draft === '' && input.attachmentIds.length === 0 && input.phase === 'plain'
        void bridge.getRepairDraft(sessionId).then(async draft => {
          if (!live || typeof draft?.token !== 'string') return
          const current = currentInput.current
          if (empty && current.draft === '' && current.attachmentIds.length === 0 && current.phase === 'plain' && typeof draft.text === 'string' && draft.text !== '') {
            if (inputActions.insertText(draft.text, span)) inputActions.persistDraft()
          }
          // Preserved user input consumes the initial suggestion too; clearing it
          // later must not unexpectedly restore a repair prompt.
          await bridge.acknowledgeRepairDraft(sessionId, draft.token)
        }).catch(reason => { console.warn('[repair] unable to initialize draft', reason) })
        return () => { live = false }
      }, [session.sessionId, inputActions])
      return null
    }

    const inject = ['locale', 'slots', 'remote.session', 'sessions', 'uiWorkspace']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(CLOUD_NS, {
        zh: {
          nav: 'ClawPort 账号', title: 'ClawPort 账号', signedOut: '未登录', authorizing: '等待浏览器确认',
          refreshing: '正在刷新账号', connected: '已连接', offline: '离线', reauthRequired: '需要重新登录', error: '账号不可用',
          login: '登录 ClawPort', retry: '重试', logout: '退出登录', working: '请稍候…', userCode: '确认码',
          user: '用户', firm: '律所与项目', device: '设备', unavailable: '暂时无法读取 ClawPort 账号。',
          secureStorageUnavailable: '系统安全存储不可用，无法登录 ClawPort。', logoutPending: '云端退出尚未完成，联网后将自动重试。'
        },
        en: {
          nav: 'ClawPort Account', title: 'ClawPort Account', signedOut: 'Signed out', authorizing: 'Waiting for browser confirmation',
          refreshing: 'Refreshing account', connected: 'Connected', offline: 'Offline', reauthRequired: 'Sign-in required', error: 'Account unavailable',
          login: 'Sign in with ClawPort', retry: 'Retry', logout: 'Sign out', working: 'Please wait…', userCode: 'Confirmation code',
          user: 'User', firm: 'Firm and project', device: 'Device', unavailable: 'ClawPort account is temporarily unavailable.',
          secureStorageUnavailable: 'System secure storage is unavailable. ClawPort sign-in is disabled.', logoutPending: 'Cloud sign-out is pending and will retry when online.'
        }
      }))
      const cloudText = ctx.locale.bind(CLOUD_NS)
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'clawport-account', order: -20,
        label: () => cloudText('nav'), locale: CLOUD_NS,
        inject: () => ({ t: cloudText })
      }, CloudAccountSection))
      ctx.effect(() => ctx.locale.register(ENTERPRISE_NS, {
        zh: { learnMore: '了解企业版' }, en: { learnMore: 'Explore Enterprise' }
      }))
      const enterpriseText = ctx.locale.bind(ENTERPRISE_NS)
      ctx.slots.inject('settings.sidebar.footer', () => ctx.slots.register({
        name: 'settings.sidebar.footer', id: 'desktop-enterprise-entry', locale: ENTERPRISE_NS,
        inject: () => ({ t: enterpriseText })
      }, EnterpriseEntry))
      ctx.effect(() => ctx.locale.register(REPAIR_NS, {
        zh: { open: '进入维修模式', description: '维修 Agent：协助排查和修复问题。点击进入修复模式，描述问题后发送。', opening: '正在打开维修…', failed: '无法打开维修会话，请重试', phone: '连接手机', phoneManage: '管理手机连接', phoneFailed: '无法读取手机连接状态' },
        en: { open: 'Enter repair mode', description: 'Repair Agent helps diagnose and resolve problems. Click to enter repair mode, describe the issue, and send when ready.', opening: 'Opening repair…', failed: 'Could not open repair. Please retry.', phone: 'Connect phone', phoneManage: 'Manage phone connection', phoneFailed: 'Could not read phone connection status.' }
      }))
      const repairText = ctx.locale.bind(REPAIR_NS)
      ctx.slots.inject('sidebar.settings.action', () => ctx.slots.register({
        name: 'sidebar.settings.action', id: 'desktop-utilities', locale: REPAIR_NS,
        inject: () => ({ t: repairText })
      }, DesktopUtilityActions))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock', id: 'desktop-repair-draft'
      }, RepairDraft))
      ctx.effect(() => {
        const id = 'dsh-desktop-preset-toolbar-style'
        if (document.getElementById(id)) return
        const style = document.createElement('style')
        style.id = id
        style.textContent = `
          [data-dsh-enterprise-entry] {
            display:flex; align-items:center; gap:4px; min-height:36px; padding:0 12px;
            border-radius:8px; color:var(--dsw-alias-label-secondary); font-size:13px;
            line-height:20px; text-decoration:none;
          }
          [data-dsh-enterprise-entry]:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
          [data-dsh-enterprise-entry]:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:1px; }
          [data-clawport-cloud-account] { width:min(100%, 720px); color:var(--dsw-alias-label-primary); }
          [data-cloud-header] { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:20px; border-bottom:1px solid var(--dsw-alias-border-l2); }
          [data-cloud-header] h2 { margin:0; font-size:20px; line-height:28px; letter-spacing:0; }
          [data-cloud-status] { margin:4px 0 0; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:20px; }
          [data-cloud-status=connected] { color:var(--dsw-alias-state-success-primary); }
          [data-cloud-status=offline], [data-cloud-status=error], [data-cloud-status=reauthRequired] { color:var(--dsw-alias-state-error-primary); }
          [data-cloud-actions] { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
          [data-cloud-actions] button { min-height:34px; padding:0 14px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-module-platform); font:inherit; font-size:13px; cursor:pointer; }
          [data-cloud-actions] button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
          [data-cloud-actions] button:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }
          [data-cloud-actions] button:disabled { opacity:.5; cursor:default; }
          [data-cloud-user-code] { display:flex; align-items:baseline; justify-content:space-between; gap:16px; margin-top:20px; padding:14px 0; border-bottom:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); font-size:13px; }
          [data-cloud-user-code] strong { color:var(--dsw-alias-label-primary); font-size:18px; letter-spacing:0; }
          [data-cloud-details] { margin:0; }
          [data-cloud-details] > div { display:grid; grid-template-columns:minmax(112px, .35fr) minmax(0, 1fr); gap:16px; padding:18px 0; border-bottom:1px solid var(--dsw-alias-border-l2); }
          [data-cloud-details] dt { color:var(--dsw-alias-label-secondary); font-size:13px; }
          [data-cloud-details] dd { display:grid; gap:3px; min-width:0; margin:0; overflow-wrap:anywhere; font-size:13px; }
          [data-cloud-details] dd span { color:var(--dsw-alias-label-secondary); }
          [data-cloud-error] { margin:16px 0 0; color:var(--dsw-alias-state-error-primary); font-size:13px; line-height:20px; }
          @media (max-width: 620px) { [data-cloud-header] { align-items:stretch; flex-direction:column; } [data-cloud-actions] { justify-content:flex-start; } [data-cloud-details] > div { grid-template-columns:1fr; gap:6px; } }
          :root { --dsh-page-title-top-spacing:56px; }
          [data-dsh-sidebar-settings] { display:flex; align-items:center; }
          [data-dsh-sidebar-settings-content] { flex:1; min-width:0; }
          [data-dsh-sidebar-settings-actions] { flex:none; display:flex; align-items:center; }
          [data-dsh-desktop-utilities] { display:flex; align-items:center; flex:none; position:relative; }
          [data-dsh-desktop-utilities][data-wide=false] { flex-direction:column; }
          [data-dsh-desktop-utilities] button {
            appearance:none; display:inline-flex; align-items:center; justify-content:center;
            width:32px; height:36px; padding:0; position:relative; border:0; border-radius:8px;
            color:var(--dsw-alias-label-secondary); background:transparent; cursor:pointer;
          }
          [data-dsh-desktop-utilities] button > svg { display:block; flex:none; }
          [data-dsh-desktop-utilities] button:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
          [data-dsh-desktop-utilities] button:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:1px; }
          [data-dsh-desktop-utilities] button:disabled { opacity:.5; cursor:wait; }
          [data-dsh-desktop-utilities] [data-connected] { position:absolute; top:7px; right:5px; width:6px; height:6px; border-radius:50%; background:var(--dsw-alias-state-success-primary); }
          [data-dsh-utility-error] { position:absolute; right:0; bottom:100%; width:200px; padding:8px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-state-error-primary); border-radius:8px; }
          [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] [data-dsh-sidebar-settings] { flex-direction:column; }

          /* Top-level page titles align with the sidebar brand row. Keep
             conversation chrome and detail/dialog headers in their own layout. */
          [data-plugin-panel] > header[data-window-drag] {
            padding-top:var(--dsh-page-title-top-spacing);
          }
          [data-dsh-preset-heading] { display:flex; align-items:center; flex-wrap:wrap; gap:12px 16px; }
          [data-dsh-preset-heading] h2 { margin:0; }
          [data-dsh-preset-actions] { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-left:auto; }
          [data-dsh-preset-actions] button { white-space:nowrap; }
          [data-dsh-preset-search] { margin-bottom:16px; }
          [data-dsh-preset-search] input[type=search] {
            box-sizing:border-box; width:100%; min-width:0; height:36px;
            border:1px solid var(--dsw-alias-border-l2); border-radius:10px;
            background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-primary);
            padding:0 12px; font:inherit; font-size:13px;
          }
          [data-dsh-preset-search] input[type=search]::placeholder { color:var(--dsw-alias-label-caption); }
          [data-dsh-preset-search] input[type=search]:focus-visible {
            outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px;
            background:var(--dsw-alias-bg-base);
          }
        `
        document.head.appendChild(style)
        return () => style.remove()
      })
      ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.inject('sidebar.brand.name', () =>
          ctx.slots.inject('conversation.hero.brand.mark', function* () {
            yield ctx.slots.register({ name: 'sidebar.brand.mark' }, DesktopBrandMark)
            yield ctx.slots.register({ name: 'sidebar.brand.name' }, DesktopBrandName)
            yield ctx.slots.register(
              { name: 'conversation.hero.brand.mark' },
              ConversationBrandMark
            )
          })
        )
      )
      ctx.slots.inject('sidebar.right.tab.document.unpreviewable', () =>
        ctx.slots.register({
          name: 'sidebar.right.tab.document.unpreviewable',
          id: 'desktop-open-local',
          inject: () => ({
            openWorkspacePath: (path) => ctx.remote.session.openWorkspacePath({ path })
          })
        }, OpenUnpreviewableFile)
      )
      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'desktop-delete-session',
          order: 900,
          inject: () => ({
            deleteSession: (sessionId) => {
              const workspace = ctx.get('uiWorkspace')
              if (!workspace) throw new Error('Workspace navigation is unavailable')
              return workspace.deleteSession(sessionId)
            }
          })
        }, DeleteSessionMenuItem)
      )
      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'desktop-open-session-folder',
          order: 800,
          inject: () => ({
            openInFinder: (sessionId) => {
              const cwd = ctx.get('sessions').list.getSnapshot().byId[sessionId]?.cwd
              if (!cwd) throw new Error('Session workspace directory is unavailable')
              return window.dshDesktop.openInFinder(cwd)
            }
          })
        }, OpenSessionFolderMenuItem)
      )
      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'desktop-unread-session',
          order: 350
        }, UnreadSessionMenuItem)
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
