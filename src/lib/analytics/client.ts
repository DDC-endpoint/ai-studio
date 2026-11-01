// The browser's side of the event store (006 FR-08). Fire and forget: the call
// is never awaited on a navigation path, never throws and never reports an
// error, so analytics cannot slow or break the wizard. Deliberately does NOT
// import the catalogue (that pulls Prisma into the client bundle); the server
// route is the one that checks the name and payload.
export function sendWizardStep(step: number, briefDraftId: string | null): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'wizard.step',
        payload: { step, ...(briefDraftId ? { briefDraftId } : {}) },
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // never surfaces
  }
}

// 039 D22: one caption was copied. Called only after a successful clipboard
// write; same fire-and-forget contract. `kind` and `channel` are the enum values
// the caption row carries (channel null for the general caption); no text is sent.
export function sendCaptionCopied(draftId: string, kind: string, channel: string | null): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'caption.copied', draftId, payload: { kind, channel } }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // never surfaces
  }
}
