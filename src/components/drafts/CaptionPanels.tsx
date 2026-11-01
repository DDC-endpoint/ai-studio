'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import type { Channel } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { SectionHead } from '@/components/ui/SectionHead'
import { ICON } from '@/components/ui/atoms'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import { captionActionTargets } from '@/lib/captions/actionTargets'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { NO_WEBSITE_NOTICE } from '@/lib/captions/rules'
import type { DraftDetail } from '@/lib/api-types'
import type { ModelKey } from '@/lib/models/catalogue'
import { CaptionPanel, type RegenerateResult } from './CaptionPanel'
import { HeadlinePanel } from './HeadlinePanel'

export interface CaptionPanelsProps {
  draft: Pick<
    DraftDetail,
    | 'id'
    | 'headline'
    | 'headlineModel'
    | 'headlineModelSubstitutedFrom'
    | 'captions'
    | 'captionProviderIsClaude'
    | 'pendingAction'
    | 'pendingActionError'
    | 'status'
    | 'kitWebsite'
  >
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void | Promise<unknown>
  /** 038 D11: false for a member who is not the author or a team admin. */
  canEdit?: boolean
}

// The regenerate-copy bodies (012 FR-11, 039 D12): { kind: 'GENERAL' } is the
// general caption (made on a post that has none), { channel } a curated caption,
// { headline: true } the headline. Each takes the model pick when one was made
// (008 FR-17); JSON.stringify drops an undefined pick (A5).
type RegenerateBody = ({ kind: 'GENERAL' } | { channel: Channel } | { headline: true }) & {
  model?: ModelKey
}

// The caption desk (012 FR-18, 039 FR-16): "i. Captions", then the headline, the
// general caption (or "Generate general caption" on a post made before 039) and
// the curated captions, in registry order. Each panel owns its Regenerate. A
// background failure is shown by the page's pendingActionError line; a
// caption's own failure by its panel.
export function CaptionPanels({
  draft,
  onSaved,
  onActionStarted,
  canEdit = true,
}: CaptionPanelsProps) {
  // True while a regenerate POST is in flight and until the refetch after its
  // 202 has landed, so no panel can fire a second request (which would 409) in
  // the gap before pendingAction is seen. The background run is tracked via
  // the polled pendingAction and row status.
  const [firing, setFiring] = useState(false)

  const ready = draft.status === 'EXPORTED'
  const writing =
    draft.status === 'IN_PROGRESS' && draft.captions.some((c) => c.status === 'PENDING')
  const general = draft.captions.find((c) => c.kind === 'GENERAL')
  const curated = draft.captions.filter((c) => c.kind === 'CURATED')
  // A channel with no live caption gets a "Curate for …" button (a deleted one
  // is replaced by a new curate).
  const curatable = CAPTION_CHANNELS.filter(
    (s) => !curated.some((c) => c.channel === s.channel && !c.deleted),
  )
  const showCurate = canEdit && ready && curatable.length > 0
  const generalFlagged = general?.facts?.status === 'flagged'
  const regenerating = firing || draft.pendingAction === 'REGENERATE_COPY'
  // Single-flight is draft-level (A2): any in-flight action blocks every
  // panel's Regenerate — the server would 409 anyway.
  const locked = firing || draft.pendingAction !== null

  // 039 D15: one step of undo, on the server. The answer is the refreshed draft,
  // so the parent refetches to show it.
  async function undo(ref: { kind: 'GENERAL' } | { channel: Channel }): Promise<void> {
    try {
      await apiFetch(`/api/drafts/${draft.id}/captions/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref),
      })
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to undo')
    }
  }

  // 039 D14: delete a curated caption; it stays recoverable through Undo.
  async function remove(channel: Channel): Promise<void> {
    try {
      await apiFetch(`/api/drafts/${draft.id}/captions?channel=${channel}`, { method: 'DELETE' })
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete the caption')
    }
  }

  async function regenerate(body: RegenerateBody, failure: string): Promise<RegenerateResult> {
    setFiring(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e: unknown) {
      setFiring(false)
      // A refused model pick is shown on the picker that sent it, not as a toast.
      if (e instanceof ApiError && e.code === 'MODEL_NOT_ALLOWED')
        return { ok: false, modelError: e.message }
      toast.error(e instanceof Error ? e.message : failure)
      return { ok: false, modelError: null }
    }
    // Accepted (202). Refetch so the parent picks up pendingAction and polls;
    // a failed refetch never turns the accept into a refusal.
    try {
      await onActionStarted()
    } catch {
      // The parent's fetch reports its own errors.
    } finally {
      setFiring(false)
    }
    return { ok: true }
  }

  return (
    <section className="pt-[22px] pb-1.5">
      <SectionHead numeral="i." title="Captions" className="mb-3">
        {regenerating && (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Regenerating…
          </span>
        )}
      </SectionHead>
      {writing && (
        <p className="mb-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
          <Loader2 {...ICON} className="animate-spin" aria-hidden /> Writing the caption…
        </p>
      )}
      <div className="space-y-6">
        <HeadlinePanel
          draftId={draft.id}
          headline={draft.headline}
          headlineModel={draft.headlineModel}
          headlineModelSubstitutedFrom={draft.headlineModelSubstitutedFrom}
          captionProviderIsClaude={draft.captionProviderIsClaude}
          busy={captionActionTargets(draft).includes('HEADLINE')}
          ready={ready}
          locked={locked}
          actionPending={draft.pendingAction !== null}
          editLocked={draft.pendingAction === 'REGENERATE_COPY'}
          onRegenerate={(model) =>
            regenerate({ headline: true, model }, 'Failed to regenerate the headline')
          }
          onSaved={onSaved}
          canEdit={canEdit}
        />
        {general ? (
          <CaptionPanel
            draftId={draft.id}
            caption={general}
            ready={ready}
            locked={locked}
            captionProviderIsClaude={draft.captionProviderIsClaude}
            onRegenerate={(model) =>
              regenerate({ kind: 'GENERAL', model }, 'Failed to regenerate the caption')
            }
            onSaved={onSaved}
            onUndo={() => undo({ kind: 'GENERAL' })}
            website={draft.kitWebsite}
            canEdit={canEdit}
          />
        ) : (
          // A post made before 039 has no general caption (it is not backfilled).
          canEdit &&
          ready && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  regenerate({ kind: 'GENERAL' }, 'Failed to generate the general caption')
                }
                disabled={locked}
              >
                {regenerating ? (
                  <Loader2 {...ICON} className="animate-spin" />
                ) : (
                  <Sparkles {...ICON} />
                )}{' '}
                Generate general caption
              </Button>
            </div>
          )
        )}
        {(showCurate || curated.length > 0) && (
          <div className="space-y-4">
            <SectionHead level={3} title="Curated captions" />
            {showCurate && (
              <div className="space-y-3">
                {/* 039 D19: the general caption states values the sources don't, and a
                    curated caption written from it may repeat them. */}
                {generalFlagged && (
                  <Notice tone="warning" data-testid="general-flagged">
                    The general caption has values your sources don&apos;t state. A curated caption
                    written from it may repeat them.
                  </Notice>
                )}
                <div className="flex flex-wrap gap-2">
                  {curatable.map((s) => (
                    <Button
                      key={s.channel}
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        regenerate({ channel: s.channel }, `Failed to curate for ${s.label}`)
                      }
                      disabled={locked}
                    >
                      <Sparkles {...ICON} /> Curate for {s.label}
                    </Button>
                  ))}
                </div>
                {/* 039 D17: a Facebook caption gets its link from the kit's website. */}
                {!draft.kitWebsite && curatable.some((s) => s.rules.link === 'kit-website') && (
                  <Notice tone="neutral" data-testid="curate-no-website">
                    {NO_WEBSITE_NOTICE}
                  </Notice>
                )}
              </div>
            )}
            {curated.map((caption) => (
              <CaptionPanel
                key={caption.target}
                draftId={draft.id}
                caption={caption}
                ready={ready}
                locked={locked}
                captionProviderIsClaude={draft.captionProviderIsClaude}
                onRegenerate={(model) =>
                  regenerate(
                    { channel: caption.channel as Channel, model },
                    'Failed to regenerate the caption',
                  )
                }
                onSaved={onSaved}
                onUndo={() => undo({ channel: caption.channel as Channel })}
                onDelete={() => remove(caption.channel as Channel)}
                website={draft.kitWebsite}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
