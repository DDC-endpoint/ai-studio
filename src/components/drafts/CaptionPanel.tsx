'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle, Copy, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ICON } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { captionLength, captionSpec } from '@/lib/channels'
import type { DraftCaptionDetail } from '@/lib/api-types'
import type { ModelKey } from '@/lib/models/catalogue'
import { GeneratedWith } from './GeneratedWith'

// The ruled caption field (DESIGN_SYSTEM.md §8.3): a 1 px --line-subtle rule
// every 26 px, scrolling with the text. Only captions are ruled.
const RULED_TEXTAREA = [
  'block w-full resize-y rounded-ui-sm border border-line bg-surface-raised px-4 py-1',
  'font-text text-ui-sm leading-[26px] text-fg placeholder:text-fg-muted',
  '[background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_25px,rgb(var(--line-subtle))_25px,rgb(var(--line-subtle))_26px)]',
  '[background-attachment:local] [background-position:0_4px]',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

export const count = (n: number) => n.toLocaleString('en-US')

// A panel's save state, in its head's tail: Saving… / Saved / Unsaved changes.
export function SaveState({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-fg-muted">
        <Loader2 {...ICON} className="animate-spin" aria-hidden /> Saving…
      </span>
    )
  }
  if (saved) {
    return (
      <span className="flex items-center gap-1.5 font-semibold text-status-published">
        <Check {...ICON} aria-hidden /> Saved
      </span>
    )
  }
  return <span className="font-semibold text-status-scheduled">Unsaved changes</span>
}

/** A regenerate's answer. A refused model pick (400 MODEL_NOT_ALLOWED) carries
 *  its message, which the firing panel shows on its picker (008 FR-20). */
export type RegenerateResult = { ok: true } | { ok: false; modelError: string | null }

export interface CaptionPanelProps {
  draftId: string
  caption: DraftCaptionDetail
  /** The draft can take a caption action (EXPORTED). */
  ready: boolean
  /** Any action is firing or running on the draft (single-flight, A2). */
  locked: boolean
  /** Whether this draft's own caption provider is Claude (GET /api/drafts/[id]),
   *  so the picker hides exactly when the server would refuse a pick. */
  captionProviderIsClaude?: boolean
  /** Fires this channel's regenerate, with the model pick when one was made (A5).
   *  Resolves once the post-202 refetch has landed. */
  onRegenerate: (model?: ModelKey) => Promise<RegenerateResult>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
  /** 038 D11: false for a member who is not the author or a team admin. The
   *  edit controls are not rendered and the text is read-only; Copy stays. */
  canEdit?: boolean
}

// One caption, the general one or a curated one (012 FR-18/FR-19, 039 FR-16): its
// h3 with the tail (save state, Copy, Generate/Regenerate), the ruled textarea named by that heading
// and saved on blur, the per-registry counter with its limit or guide warning,
// the review / FAILED / last-regenerate-failed notices, and a skeleton
// only while the row is PENDING. Empty text on a row that is not PENDING always
// shows the editable field (TC-ASYNC-10).
export function CaptionPanel({
  draftId,
  caption,
  ready,
  locked,
  captionProviderIsClaude,
  onRegenerate,
  onSaved,
  canEdit = true,
}: CaptionPanelProps) {
  const spec = captionSpec(caption.target)
  // The heading, and the name its buttons carry: "General caption", "Instagram
  // caption". In a sentence the general caption is lower case (DESIGN_SYSTEM §12).
  const title = `${spec.label} caption`
  const noun = spec.kind === 'GENERAL' ? 'general caption' : title
  // 008 FR-20: this channel's model pick (undefined = the stamp's pre-selection,
  // A5) and a refused pick's 400 message.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [setModel, setModelError])
  const headingId = useId()
  const failureId = useId()
  const counterId = useId()
  const warningId = useId()
  const [value, setValue] = useState(caption.text)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  // The patch body that names this caption: { kind: 'GENERAL' } or { channel }.
  const ref = caption.kind === 'GENERAL' ? { kind: 'GENERAL' } : { channel: caption.channel }

  // A regenerate's new text arrives through the parent's poll.
  useEffect(() => {
    setValue(caption.text)
    setSaved(true)
  }, [caption.text])

  const pending = caption.status === 'PENDING'

  // The blur-save in flight, if any. Clicking Regenerate blurs the field first,
  // so a regenerate waits for that PATCH to land; racing the claim, it would 409.
  const inFlightSave = useRef<Promise<void>>(Promise.resolve())
  const flushSave = () => inFlightSave.current

  const length = captionLength(value)
  const over = spec.hardLimit !== null && length > spec.hardLimit
  const counter =
    spec.hardLimit !== null
      ? `${count(length)} / ${count(spec.hardLimit)} (${spec.kind === 'GENERAL' ? noun : spec.label})`
      : `${count(length)} characters`
  const warning = over ? `Over the ${spec.kind === 'GENERAL' ? noun : spec.label} limit` : null
  const lastFailed = caption.status === 'READY' && caption.failureReason !== null
  // The field's description: the notices about it, the counter
  // and any limit warning.
  const describedBy = [
    (caption.status === 'FAILED' || lastFailed) && failureId,
    counterId,
    warning && warningId,
  ]
    .filter(Boolean)
    .join(' ')
  const verb = value === '' ? 'Generate' : 'Regenerate'

  async function save() {
    if (saved || value === caption.text) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ref, text: value }),
      })
      setSaved(true)
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    await flushSave()
    setModelError(undefined)
    const result = await onRegenerate(model)
    if (!result.ok && result.modelError) setModelError(result.modelError)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Caption copied')
    } catch {
      // Clipboard can be blocked (insecure origin, no permission).
      toast.error("Couldn't copy. Select the text and copy it manually.")
    }
  }

  return (
    <div>
      <SectionHead level={3} title={title} id={headingId} className="mb-3">
        {canEdit && !pending && <SaveState saving={saving} saved={saved} />}
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          disabled={pending || value === ''}
          aria-label={`Copy ${noun}`}
        >
          <Copy {...ICON} /> Copy
        </Button>
        {/* Any in-flight action blocks a new one — the server would 409 anyway. */}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={regenerate}
            disabled={!ready || locked}
            aria-label={`${verb} ${noun}`}
          >
            {pending ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} {verb}
          </Button>
        )}
      </SectionHead>

      {caption.status === 'FAILED' && (
        <Notice
          id={failureId}
          tone="error"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The {noun} failed to generate ({caption.failureReason ?? 'no reason given'}). Write it
          below, or use Generate.
        </Notice>
      )}

      {/* A failed regenerate keeps the READY text (A7) and records why. */}
      {lastFailed && (
        <Notice
          id={failureId}
          tone="warning"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The last regenerate failed: {caption.failureReason}. The caption below is unchanged.
        </Notice>
      )}

      {pending ? (
        <div
          className="animate-pulse space-y-2.5"
          aria-label={`Generating the ${noun}`}
          role="status"
        >
          <div className="h-4 w-3/4 rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-full rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-5/6 rounded-ui-sm bg-line-subtle" />
        </div>
      ) : (
        <>
          <textarea
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            onBlur={() => {
              inFlightSave.current = save()
            }}
            readOnly={!canEdit}
            rows={8}
            className={RULED_TEXTAREA}
            placeholder={`Write the ${noun}…`}
          />
          <div className="mt-2 flex items-baseline gap-4">
            <span
              id={counterId}
              className={`ml-auto shrink-0 text-ui-xs ${over ? 'font-semibold text-status-failed' : 'text-fg-muted'}`}
            >
              {counter}
            </span>
          </div>
          {/* Never blocks the save: a hard limit is enforced at publish (FR-14). */}
          {warning && (
            <p
              id={warningId}
              className={`mt-1 text-right text-ui-xs font-semibold ${over ? 'text-status-failed' : 'text-status-scheduled'}`}
            >
              {warning}
            </p>
          )}
        </>
      )}

      {/* The panel's tail (008 FR-20): the model that wrote this caption (not
          while it is rewritten, and not for a FAILED row, whose stamp may
          belong to text since cleared), then this channel's regenerate model,
          pre-selected from that stamp (FR-09). */}
      {!pending && caption.status !== 'FAILED' && (
        <GeneratedWith stamp={caption.model} substitutedFrom={caption.modelSubstitutedFrom} className="mt-2" />
      )}
      {canEdit && ready && (
        <ModelPicker
          id={`draft-caption-model-${caption.target.toLowerCase()}`}
          surface="CAPTION"
          context={{ stamp: caption.model }}
          value={model}
          onChange={pickModel}
          label={`${title} model`}
          disabled={locked}
          captionProviderIsClaude={captionProviderIsClaude}
          error={modelError}
          className="mt-3 sm:max-w-xs"
        />
      )}
    </div>
  )
}
