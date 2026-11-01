// 037 FR-11 / AC-05: the machine surfaces have no publish capability. The ACP
// manifest pins its key set and version (2.1.0 since 038: `projectId` replaces the retired `campaignId`; 2.2.0 since 039: the open caption list, and no `channels`); the MCP server file cannot be imported
// (it starts a stdio transport), so its tool list is read from the source.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_MANIFEST } from '@/acp/agent'
import { CAPTION_CHANNELS } from '@/lib/channels'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('ACP manifest (037)', () => {
  it('is version 2.2.0 and advertises generate_post only', () => {
    expect(AGENT_MANIFEST.version).toBe('2.2.0')
    expect(AGENT_MANIFEST.capabilities.map((c) => c.name)).toEqual(['generate_post'])
  })

  it('does not describe itself as publishing', () => {
    expect(AGENT_MANIFEST.description).not.toMatch(/publish/i)
  })

  it('takes projectId and no campaign field, and never says campaign (038 AC-06)', () => {
    const cap = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')!
    const input = cap.input as unknown as { properties: Record<string, unknown> }
    expect(input.properties).toHaveProperty('projectId')
    expect(input.properties).not.toHaveProperty('campaignId')
    expect(JSON.stringify(AGENT_MANIFEST)).not.toMatch(/campaign/i)
    expect(read('src/acp/agent.ts')).not.toMatch(/campaign/i)
  })

  // 039 AC-20: no `channels` input (a caller that sends it is ignored), and the
  // caption channel enum is the curatable channels plus null.
  it('has no channels input, and the caption channel enum is CAPTION_CHANNELS plus null (039 AC-20)', () => {
    const cap = AGENT_MANIFEST.capabilities.find((c) => c.name === 'generate_post')!
    const input = cap.input as unknown as { properties: Record<string, unknown>; required: string[] }
    expect(input.properties).not.toHaveProperty('channels')
    expect(input.required).not.toContain('channels')
    expect(input.required).toEqual(['topic', 'designMode'])
    const out = cap.output as unknown as {
      properties: { captions: { items: { required: string[]; properties: { channel: { enum: unknown[] } } } } }
    }
    expect(out.properties.captions.items.properties.channel.enum).toEqual([...CAPTION_CHANNELS.map((s) => s.channel), null])
    expect(out.properties.captions.items.required).toEqual(['kind', 'channel', 'text', 'status', 'facts', 'rules'])
  })

  it('the MCP generate_post schema has no channels either (039 AC-20)', () => {
    const server = read('src/mcp/server.ts')
    expect(server).not.toMatch(/channels/)
  })

  it('names no publish capability anywhere in the manifest', () => {
    expect(JSON.stringify(AGENT_MANIFEST)).not.toMatch(/publish_post/)
  })
})

describe('MCP server (037)', () => {
  const server = read('src/mcp/server.ts')

  it('is version 2.2.0, takes projectId and never says campaign (038 AC-06)', () => {
    expect(server).toMatch(/version: '2[.]2[.]0'/)
    expect(server).toMatch(/projectId/)
    expect(server).not.toMatch(/campaign/i)
  })

  it('has no publish_post tool definition or case (AC-05)', () => {
    expect(server).not.toMatch(/publish_post|publishPost/)
  })

  it('the ACP run route has no publish_post case', () => {
    expect(read('src/app/api/acp/run/route.ts')).not.toMatch(/publish_post|publishPost/)
  })
})
