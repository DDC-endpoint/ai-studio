// ACP agent manifest — describes bistec-studio's capabilities to peer agents
import { CaptionKind, CaptionStatus } from '@prisma/client'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { activeStyles } from '@/lib/postStyles'

// 018 FR-01: the advertised output must match what `generatePost`
// (src/mcp/tools/generate.ts) returns; tests/unit/mcpGetDraft.test.ts fails on
// any drift in the key set. The version is semver: a minor bump per additive
// change to a capability's schema.
export const AGENT_MANIFEST = {
  name: 'bistec-studio',
  description: 'On-brand social media post generation: an image to download and a general caption to copy.',
  version: '2.2.0',
  capabilities: [
    {
      name: 'generate_post',
      description: 'Generate a complete, on-brand social media post (HTML design + copy) from a brief.',
      input: {
        type: 'object',
        required: ['topic', 'designMode'],
        properties: {
          topic: { type: 'string', description: 'Post subject or headline' },
          postStyle: {
            type: 'string',
            enum: activeStyles().map((s) => s.key),
            description:
              'The kind of post (default: general, or the project default). An unknown value is an error.',
          },
          goal: {
            type: 'string',
            description:
              'Legacy. Picks a style (hiring or announcement) only when no postStyle is given; ignored otherwise.',
          },
          tone: {
            type: 'string',
            description: 'Optional voice/tone (e.g. professional, casual). Defaults from the post style.',
          },
          designMode: {
            type: 'string',
            enum: ['TEMPLATE', 'GENERATE'],
            description: 'TEMPLATE fills a brand template; GENERATE creates a new design',
          },
          description: { type: 'string', description: 'Additional context for the post' },
          projectId: {
            type: 'string',
            description:
              'Project id (optional): its briefing, documents, default kit and default post style apply',
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          draftId: { type: 'string' },
          exportUrl: { type: 'string' },
          htmlContent: { type: 'string' },
          postStyle: { type: 'string', description: 'The post style key that was used' },
          factsCheck: {
            type: ['object', 'null'],
            description:
              'Numbers, dates and times in the headline or captions that the brief does not state; null if never checked',
            properties: {
              status: { type: 'string', enum: ['clear', 'flagged', 'error'] },
              flagged: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string' },
                    value: { type: 'string' },
                    where: { type: 'string' },
                  },
                },
              },
            },
          },
          headline: {
            type: ['string', 'null'],
            description: 'The on-image headline (at most 100 characters); null if it was never written',
          },
          captions: {
            type: 'array',
            description:
              'The general caption first, then any curated captions made in the app. A post made before 039 may have no general caption. Treat facts.status flagged or error as needing review.',
            items: {
              type: 'object',
              required: ['kind', 'channel', 'text', 'status', 'facts', 'rules'],
              properties: {
                kind: { type: 'string', enum: Object.values(CaptionKind) },
                channel: { type: ['string', 'null'], enum: [...CAPTION_CHANNELS.map((s) => s.channel), null] },
                text: { type: 'string' },
                status: { type: 'string', enum: Object.values(CaptionStatus) },
                facts: {
                  type: ['object', 'null'],
                  description: 'Facts check for this caption; null if the post was never checked',
                  properties: {
                    status: { type: 'string', enum: ['clear', 'flagged', 'error'] },
                    flagged: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { kind: { type: 'string' }, value: { type: 'string' } },
                      },
                    },
                  },
                },
                rules: {
                  type: 'object',
                  description: 'Whether the caption meets its channel rules, and which it misses',
                  properties: {
                    met: { type: 'boolean' },
                    unmet: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
}
