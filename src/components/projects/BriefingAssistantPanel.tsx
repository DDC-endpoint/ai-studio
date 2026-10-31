'use client'

import React, { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import type { ModelKey } from '@/lib/models/catalogue'
import { EYEBROW, FOCUS, ICON, ICON_BUTTON, SCROLL_FOCUS } from '@/components/ui/atoms'

// AI briefing assistant: hand in source documents, converse until the model
// converges on a briefing draft, then Apply drops it into the briefing editor
// (saving still goes through the normal versioned flow). The conversation is
// ephemeral — the transcript lives in component state and is sent whole to the
// stateless chat route each turn.

interface ProjectDocumentMeta {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  briefingDraft?: string | null
}

interface BriefingAssistantPanelProps {
  projectId: string
  open: boolean
  onClose: () => void
  onApply: (text: string) => void
}

const ACCEPT =
  '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function BriefingAssistantPanel({ projectId, open, onClose, onApply }: BriefingAssistantPanelProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const messageId = React.useId()
  // 008 FR-21: the header model pick. It is client state for this open chat
  // only (no remembered choice; a reload resets it). Undefined means the team
  // or system default (A5), so an untouched picker sends today's body. A
  // refused pick's 400 message shows on the picker.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [])

  const { data: docs = [] } = useQuery({
    queryKey: ['projects', projectId, 'documents'],
    queryFn: () => apiFetch<ProjectDocumentMeta[]>(`/api/projects/${projectId}/documents`),
    enabled: open,
  })

  function invalidateDocs() {
    return queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'documents'] })
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const doc = await apiFetch<ProjectDocumentMeta>(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        body: fd,
      })
      await invalidateDocs()
      toast.success(
        doc.truncated
          ? `${file.name} uploaded — the text was long and was truncated for the AI context.`
          : `${file.name} uploaded`,
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteDoc(doc: ProjectDocumentMeta) {
    try {
      await apiFetch(`/api/projects/${projectId}/documents/${doc.id}`, { method: 'DELETE' })
      await invalidateDocs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || pending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setPending(true)
    setModelError(undefined)
    // Let the new message render before scrolling to it.
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{ reply: string; briefingDraft: string | null }>(
        `/api/projects/${projectId}/briefing/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
            // Dropped by JSON.stringify while undefined (A5).
            model,
          }),
        },
      )
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: result.reply, briefingDraft: result.briefingDraft },
      ])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      // A refused model pick (400, nothing ran) shows on the picker; any other
      // failure toasts.
      if (err instanceof ApiError && err.code === 'MODEL_NOT_ALLOWED') setModelError(err.message)
      else toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      // Roll the failed turn back so it can be resent.
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Draft briefing with AI">
      <div className="flex h-full flex-col">
        {/* The chat header's model picker (008 FR-21), pre-selected to the team
            or system default. Its team-token notice is the picker's own
            (FR-22). It renders nothing until /api/models loads. */}
        <ModelPicker
          id="briefing-assistant-model"
          surface="ASSISTANT_BRIEFING"
          value={model}
          onChange={pickModel}
          label="Briefing assistant model"
          disabled={pending}
          error={modelError}
          className="flex-shrink-0 border-b border-line-subtle px-5 py-4"
        />
        {/* Documents */}
        <div className="space-y-2 border-b border-line-subtle px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={EYEBROW}>
              Source documents &amp; images ({docs.length}/5)
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading || docs.length >= 5}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 {...ICON} className="animate-spin" /> : <Paperclip {...ICON} />}
              {uploading ? 'Uploading…' : 'Add document'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void uploadFile(file)
              }}
            />
          </div>
          {docs.length === 0 ? (
            <p className="text-ui-xs text-fg-muted">
              Hand in strategy decks or one-pagers (PDF, DOCX, TXT, MD — max 10MB each). The
              assistant grounds the briefing in them.
            </p>
          ) : (
            <ul className="border-t border-line-subtle">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-2 border-b border-line-subtle py-1 text-ui-sm text-fg">
                  <FileText {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate" title={doc.name}>{doc.name}</span>
                  <span className="whitespace-nowrap text-ui-xs text-fg-muted">
                    {formatSize(doc.sizeBytes)}
                    {doc.truncated && ' · truncated'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => deleteDoc(doc)}
                    className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                  >
                    <Trash2 {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The conversation (§8.14's log vocabulary): ruled rows, newest last.
            It scrolls inside its own box, so the box is always a focusable,
            labelled region, even before the first turn (WCAG 2.1.1; the static
            rule, 014 FR-17). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Conversation"
          className={`flex-1 overflow-y-auto px-5 py-4 ${SCROLL_FOCUS}`}
        >
          {messages.length === 0 && (
            <p className="text-ui-sm text-fg-muted">
              Describe the project — goal, audience, timing — and the assistant will interview
              you and converge on a briefing draft. Each draft it proposes can be applied to the
              editor.
            </p>
          )}
          {messages.length > 0 && (
            <ol className="border-t border-line-subtle">
              {messages.map((m, i) => (
                <li key={i} className="border-b border-line-subtle py-3">
                  <p className={`${EYEBROW} mb-1`}>
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <p
                    className={
                      m.role === 'user'
                        ? "whitespace-pre-wrap break-words font-display text-ui-base italic leading-snug text-fg [font-variation-settings:'opsz'_24]"
                        : 'whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-fg'
                    }
                  >
                    {m.content}
                  </p>
                  {m.briefingDraft && (
                    <div className="mt-2.5">
                      <Button variant="secondary" size="sm" onClick={() => onApply(m.briefingDraft!)}>
                        Apply this draft to the editor
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {pending && (
            <div className="mt-3 flex items-center gap-2 text-ui-sm text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" aria-hidden />
              Thinking — this can take up to a minute…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* The prompt (§8.3, §8.14): a display-italic field with the ink Send
            button attached; the wrapper shows the focus outline. */}
        <form onSubmit={send} className="flex-shrink-0 border-t border-line-subtle px-5 py-4">
          <FieldLabel htmlFor={messageId} className="mb-1.5">Message</FieldLabel>
          <div className="flex rounded-ui-sm border border-line bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            <input
              id={messageId}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Tell the assistant about this project…"
              className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 font-display text-ui-base italic text-fg [font-variation-settings:'opsz'_24] placeholder:text-fg-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Send"
              className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-l border-line bg-fg px-4 font-text text-ui-sm font-semibold text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
              {pending ? <Loader2 {...ICON} className="animate-spin" aria-hidden /> : <Send {...ICON} aria-hidden />}
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  )
}
