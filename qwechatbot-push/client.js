window.__ModuleLoader__.load({
  id: '@local/qwechatbot-push',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const NS = 'qwechatbot-push'
    const PANEL_ID = 'qwechatbot'
    const ROUTE = '/qwechatbot-push/'

    const zh = {
      'panel': '企业微信推送',
      'header.subtitle': '维护群机器人推送通道并发送消息',
      'newChannel': '新建通道',
      'refresh': '刷新',
      'edit': '编辑',
      'delete': '删除',
      'test': '测试',
      'save': '保存',
      'cancel': '取消',
      'close': '关闭',
      'loading': '加载中…',
      'emptyChannels': '还没有通道。点击「新建通道」添加一个企业微信 BOT，Agent 会按用途选择通道推送消息。',
      'row.noKey': '未配置 key',
      'error.title': '出错了',
      'form.titleNew': '新建通道',
      'form.titleEdit': '编辑通道',
      'form.id': '标识 (id)',
      'form.idHint': '字母、数字、_ . -，保存后不可改；Agent 用它指定通道',
      'form.purpose': '用途',
      'form.purposePlaceholder': '例如：构建通知 / 线上告警 / 日报',
      'form.purposeHint': '一句话说明这个通道用来推什么，Agent 据此判断是否使用它',
      'form.key': '推送凭据 (key)',
      'form.keyHint': '机器人 Webhook 地址 ?key= 后面的那一段。前缀已在插件配置中固定',
      'form.delete': '删除通道',
      'test.title': '测试推送',
      'test.msgtype': '消息类型',
      'test.text': '文本 (text)',
      'test.markdown': 'Markdown',
      'test.content': '内容',
      'test.contentPlaceholder': '输入要推送的内容…',
      'test.mentionHint': '要 @ 的 userid 或手机号，多个用逗号分隔（仅 text 类型）',
      'test.send': '发送',
      'test.sending': '发送中…',
      'test.ok': '发送成功',
    }
    const en = {
      'panel': 'WeChat Work push',
      'header.subtitle': 'Maintain group-bot push channels and send messages',
      'newChannel': 'New channel',
      'refresh': 'Refresh',
      'edit': 'Edit',
      'delete': 'Delete',
      'test': 'Test',
      'save': 'Save',
      'cancel': 'Cancel',
      'close': 'Close',
      'loading': 'Loading…',
      'emptyChannels': 'No channels yet. Click "New channel" to add a WeChat Work BOT; the agent picks a channel by purpose to push messages.',
      'row.noKey': 'no key',
      'error.title': 'Something went wrong',
      'form.titleNew': 'New channel',
      'form.titleEdit': 'Edit channel',
      'form.id': 'Identifier (id)',
      'form.idHint': 'Letters, digits, _ . -, fixed after save; the agent uses it to pick the channel',
      'form.purpose': 'Purpose',
      'form.purposePlaceholder': 'e.g. build notifications / on-call alerts / daily report',
      'form.purposeHint': 'One line on what this channel pushes; the agent uses it to decide',
      'form.key': 'Push credential (key)',
      'form.keyHint': 'The segment after ?key= in the bot webhook URL. The prefix is fixed in plugin config',
      'form.delete': 'Delete channel',
      'test.title': 'Test push',
      'test.msgtype': 'Message type',
      'test.text': 'Text',
      'test.markdown': 'Markdown',
      'test.content': 'Content',
      'test.contentPlaceholder': 'Type the content to push…',
      'test.mentionHint': 'Userids or mobile numbers to @, comma-separated (text only)',
      'test.send': 'Send',
      'test.sending': 'Sending…',
      'test.ok': 'Sent',
    }

    const CSS = `
.qwp-root{display:flex;flex-direction:column;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}
.qwp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.qwp-title{font-size:16px;font-weight:600}
.qwp-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.qwp-body{flex:1;min-height:0;overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.qwp-actions{display:flex;gap:6px;margin-bottom:4px}
.qwp-btn{padding:4px 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px}
.qwp-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.qwp-btn:disabled{opacity:.5;cursor:default}
.qwp-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.qwp-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.qwp-link{border:none;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:12px;padding:0 2px}
.qwp-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.qwp-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.qwp-row-top{display:flex;align-items:center;gap:8px}
.qwp-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
.qwp-purpose{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qwp-key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qwp-key-none{font-style:italic;color:var(--dsw-alias-state-warn-primary)}
.qwp-row-actions{display:inline-flex;gap:4px;flex:none}
.qwp-icon-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:3px 10px;border-radius:6px}
.qwp-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.qwp-muted{color:var(--dsw-alias-label-secondary)}
.qwp-pad{padding:8px 0}
.qwp-error{margin:8px 12px;padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px;color:var(--dsw-alias-state-error-primary);word-break:break-all}
.qwp-error-title{font-weight:600}
.qwp-ok{margin:8px 0;padding:6px 10px;color:var(--dsw-alias-state-success-primary)}
.qwp-modal{width:460px;max-width:calc(100vw - 32px);max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:16px}
.qwp-modal:not([open]){display:none}
dialog.qwp-modal:modal{overscroll-behavior:contain}
.qwp-modal::backdrop{background:var(--dsw-alias-bg-mask-1);overflow:hidden;overscroll-behavior:contain}
.qwp-modal-title{font-size:15px;font-weight:600;margin-bottom:12px}
.qwp-modal-body{display:flex;flex-direction:column;gap:10px}
.qwp-field{display:flex;flex-direction:column;gap:4px}
.qwp-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.qwp-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.qwp-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.qwp-modal-foot{display:flex;gap:8px;margin-top:14px;align-items:center}
.qwp-input{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:5px 8px;font-size:12px;width:100%;box-sizing:border-box}
.qwp-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.qwp-textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;min-height:110px}
`

    async function call(op, payload) {
      const res = await fetch(ROUTE + op, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      let data
      try { data = await res.json() } catch { data = null }
      if (!res.ok || !data || data.ok !== true) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }
      return data.value
    }

    function PanelIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none' },
        h('path', { d: 'M2.5 8.5 L13 2 L7.5 13.5 L5.5 9.5 Z', fill: 'var(--dsw-alias-brand-primary)' }),
        h('path', { d: 'M5.5 9.5 L7.5 13.5 L8 10 Z', fill: 'var(--dsw-alias-bg-base)' }),
      )
    }

    function ErrorBar({ error, onClose, t }) {
      if (!error) return null
      return h('div', { className: 'qwp-error', role: 'alert' },
        h('span', { className: 'qwp-error-title' }, t('error.title') + ': '),
        h('span', null, String(error)),
        onClose ? h('button', { className: 'qwp-link', onClick: onClose }, t('close')) : null,
      )
    }

    function useModal(onClose) {
      const dialogRef = useRef(null)
      const onCloseRef = useRef(onClose)
      onCloseRef.current = onClose
      useEffect(() => {
        const dlg = dialogRef.current
        if (!dlg) return
        if (!dlg.open) dlg.showModal()
        const syncClose = () => onCloseRef.current()
        dlg.addEventListener('close', syncClose)
        let pressedOutside = false
        const outside = (e) => {
          const r = dlg.getBoundingClientRect()
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        }
        const onDown = (e) => { pressedOutside = outside(e) }
        const onUp = (e) => {
          if ('closedBy' in HTMLDialogElement.prototype) return
          if (pressedOutside && outside(e)) dlg.close()
        }
        dlg.addEventListener('pointerdown', onDown)
        dlg.addEventListener('pointerup', onUp)
        return () => {
          dlg.removeEventListener('close', syncClose)
          dlg.removeEventListener('pointerdown', onDown)
          dlg.removeEventListener('pointerup', onUp)
        }
      }, [])
      const closeDialog = useCallback(() => {
        const dlg = dialogRef.current
        if (dlg?.open) dlg.close()
        else onCloseRef.current()
      }, [])
      return { dialogRef, closeDialog }
    }

    function ChannelForm({ initial, onClose, onSaved, onDelete, t }) {
      const isEdit = Boolean(initial?.id)
      const { dialogRef, closeDialog } = useModal(onClose)
      const [draft, setDraft] = useState(() => ({ id: initial?.id ?? '', purpose: initial?.purpose ?? '', key: initial?.key ?? '' }))
      const [busy, setBusy] = useState(null)
      const [outcome, setOutcome] = useState(null)
      const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e?.target ? e.target.value : e }))
      const run = async (op) => {
        setBusy(op); setOutcome(null)
        try {
          if (op === 'delete') { await onDelete(initial); return }
          await call('save-channel', {
            channel: { id: draft.id.trim(), purpose: draft.purpose.trim(), key: draft.key.trim() },
          })
          onSaved()
        } catch (error) {
          setOutcome({ ok: false, text: String(error?.message ?? error) })
        } finally {
          setBusy(null)
        }
      }
      const field = (labelKey, node, hintKey) => h('label', { className: 'qwp-field' },
        h('span', { className: 'qwp-field-label' }, t(labelKey)),
        node,
        hintKey ? h('span', { className: 'qwp-field-hint' }, t(hintKey)) : null,
      )
      const input = (value, onChange, opts) => h('input', { className: 'qwp-input', value: value ?? '', onChange: (e) => onChange(e.target.value), ...opts })
      return h('dialog', { className: 'qwp-modal', ref: dialogRef, closedby: 'any', 'aria-labelledby': 'qwp-form-title' },
        h('div', { className: 'qwp-modal-title', id: 'qwp-form-title' }, isEdit ? t('form.titleEdit') : t('form.titleNew')),
        h('div', { className: 'qwp-modal-body' },
          field('form.id', input(draft.id, set('id'), { disabled: isEdit, placeholder: 'my-bot', autoFocus: !isEdit }), 'form.idHint'),
          field('form.purpose', input(draft.purpose, set('purpose'), { placeholder: t('form.purposePlaceholder') }), 'form.purposeHint'),
          field('form.key', input(draft.key, set('key'), { placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', autoComplete: 'off' }), 'form.keyHint'),
          outcome ? h('div', { className: outcome.ok ? 'qwp-ok' : 'qwp-error' }, outcome.text) : null,
        ),
        h('div', { className: 'qwp-modal-foot' },
          isEdit ? h('button', { type: 'button', className: 'qwp-btn qwp-btn-danger', disabled: busy !== null, onClick: () => run('delete') }, t('form.delete')) : null,
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'qwp-btn', onClick: closeDialog, disabled: busy !== null }, t('cancel')),
          h('button', { type: 'button', className: 'qwp-btn qwp-btn-primary', onClick: () => run('save'), disabled: busy !== null }, busy === 'save' ? '…' : t('save')),
        ),
      )
    }

    function TestForm({ channel, onClose, t }) {
      const { dialogRef, closeDialog } = useModal(onClose)
      const [msgtype, setMsgtype] = useState('text')
      const [content, setContent] = useState('')
      const [mentioned, setMentioned] = useState('')
      const [busy, setBusy] = useState(false)
      const [outcome, setOutcome] = useState(null)
      const run = async () => {
        setBusy(true); setOutcome(null)
        try {
          const mentionedList = String(mentioned ?? '').split(/[,;\r\n]+/).map((s) => s.trim()).filter(Boolean)
          const value = await call('test-push', { id: channel.id, msgtype, content, mentionedList })
          setOutcome({ ok: true, text: `${t('test.ok')}: ${value?.errmsg ?? 'ok'} (errcode ${value?.errcode ?? 0})` })
        } catch (error) {
          setOutcome({ ok: false, text: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }
      const field = (labelKey, node, hintKey) => h('label', { className: 'qwp-field' },
        h('span', { className: 'qwp-field-label' }, t(labelKey)),
        node,
        hintKey ? h('span', { className: 'qwp-field-hint' }, t(hintKey)) : null,
      )
      return h('dialog', { className: 'qwp-modal', ref: dialogRef, closedby: 'any', 'aria-labelledby': 'qwp-test-title' },
        h('div', { className: 'qwp-modal-title', id: 'qwp-test-title' }, `${t('test.title')} — ${channel.id}`),
        h('div', { className: 'qwp-modal-body' },
          field('test.msgtype', h('select', { className: 'qwp-input', value: msgtype, onChange: (e) => setMsgtype(e.target.value) },
            h('option', { value: 'text' }, t('test.text')),
            h('option', { value: 'markdown' }, t('test.markdown')))),
          field('test.content', h('textarea', {
            className: 'qwp-input qwp-textarea', value: content,
            placeholder: t('test.contentPlaceholder'),
            onChange: (e) => setContent(e.target.value),
          })),
          msgtype === 'text'
            ? field('test.mentionHint', h('input', { className: 'qwp-input', value: mentioned, onChange: (e) => setMentioned(e.target.value) }), null)
            : null,
          outcome ? h('div', { className: outcome.ok ? 'qwp-ok' : 'qwp-error' }, outcome.text) : null,
        ),
        h('div', { className: 'qwp-modal-foot' },
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'qwp-btn', onClick: closeDialog, disabled: busy }, t('cancel')),
          h('button', { type: 'button', className: 'qwp-btn qwp-btn-primary', onClick: run, disabled: busy }, busy ? t('test.sending') : t('test.send')),
        ),
      )
    }

    function PushPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (props.locale?.t ?? ((k) => k))
      const [data, setData] = useState(null)
      const [fatal, setFatal] = useState(null)
      const [editing, setEditing] = useState(null) // null | {} | channel
      const [testing, setTesting] = useState(null) // null | channel

      const load = useCallback(async () => {
        try {
          const res = await fetch(ROUTE + 'channels', { headers: { accept: 'application/json' } })
          const body = await res.json()
          if (!res.ok || body?.ok !== true) throw new Error(body?.error?.message || `HTTP ${res.status}`)
          setData(body.value); setFatal(null)
        } catch (error) {
          setFatal(error)
        }
      }, [])

      useEffect(() => { load() }, [load])

      const remove = useCallback(async (id) => {
        try { await call('remove-channel', { id }); await load() } catch (error) { setFatal(error) }
      }, [load])

      return h('div', { className: 'qwp-root' },
        h('style', null, CSS),
        h('div', { className: 'qwp-head' },
          h('span', { className: 'qwp-title' }, t('panel')),
          h('span', { className: 'qwp-sub' }, t('header.subtitle')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'qwp-btn', onClick: load }, t('refresh')),
        ),
        h(ErrorBar, { error: fatal?.message, onClose: () => setFatal(null), t }),
        h('div', { className: 'qwp-body' },
          h('div', { className: 'qwp-actions' },
            h('button', { className: 'qwp-btn qwp-btn-primary', onClick: () => setEditing({}) }, '+ ' + t('newChannel'))),
          data === null && fatal === null
            ? h('div', { className: 'qwp-muted qwp-pad' }, t('loading'))
            : null,
          data && data.channels.length === 0
            ? h('div', { className: 'qwp-muted qwp-pad' }, t('emptyChannels'))
            : null,
          (data?.channels ?? []).map((ch) =>
            h('div', { key: ch.id, className: 'qwp-row' },
              h('div', { className: 'qwp-row-main' },
                h('div', { className: 'qwp-row-top' },
                  h('span', { className: 'qwp-id' }, ch.id),
                ),
                h('div', { className: 'qwp-purpose' }, ch.purpose),
                ch.key
                  ? h('div', { className: 'qwp-key', title: ch.key }, ch.key)
                  : h('div', { className: 'qwp-key qwp-key-none' }, t('row.noKey')),
              ),
              h('div', { className: 'qwp-row-actions' },
                h('button', { className: 'qwp-icon-btn', onClick: () => setTesting(ch) }, t('test')),
                h('button', { className: 'qwp-icon-btn', onClick: () => setEditing(ch) }, t('edit')),
              ),
            ),
          ),
        ),
        editing !== null
          ? h(ChannelForm, {
              initial: editing && editing.id ? editing : null,
              t,
              onClose: () => setEditing(null),
              onDelete: async (ch) => { setEditing(null); await remove(ch.id) },
              onSaved: async () => { setEditing(null); await load() },
            })
          : null,
        testing !== null
          ? h(TestForm, { channel: testing, t, onClose: () => setTesting(null) })
          : null,
      )
    }

    return {
      name: 'qwechatbot-push',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'qwechatbot-push: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('panel'),
        }, PanelIcon)), 'qwechatbot-push: panel icon')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, PushPanel)), 'qwechatbot-push: main panel')
      },
    }
  },
})
