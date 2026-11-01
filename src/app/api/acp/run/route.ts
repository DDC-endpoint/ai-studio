import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/mcp/auth'
import { CampaignRetiredError, ProjectNotFoundError, generatePost } from '@/mcp/tools/generate'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-bistec-api-key')
    const key = await resolveApiKey(apiKey)
    if (!key) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { capability, input } = body

    if (!capability || typeof capability !== 'string') {
      return NextResponse.json({ error: 'capability is required' }, { status: 400 })
    }
    if (!input || typeof input !== 'object') {
      return NextResponse.json({ error: 'input is required' }, { status: 400 })
    }

    try {
      switch (capability) {
        case 'generate_post': {
          const err = validateGenerateInput(input)
          if (err) return NextResponse.json(err, { status: 400 })
          const result = await generatePost(
            {
              ...(input as Parameters<typeof generatePost>[0]),
              teamId: key.teamId,
            },
            'acp',
          )
          return NextResponse.json({ output: result })
        }
        default:
          return NextResponse.json({ error: `Unknown capability: ${capability}` }, { status: 400 })
      }
    } catch (err) {
      // 038 D13: a retired field is 400 and a project outside the key's team is 404,
      // each with its code. Anything else stays 422.
      if (err instanceof CampaignRetiredError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
      }
      if (err instanceof ProjectNotFoundError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 404 })
      }
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 422 })
    }
  } catch (err) {
    console.error(`[api] POST ${req.nextUrl.pathname} failed:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function validateGenerateInput(input: Record<string, unknown>): { error: string; code?: string } | null {
  // 038 D13: the cheap early refusal of the retired field, before any lookup.
  if ('campaignId' in input || 'campaign' in input) {
    return { error: new CampaignRetiredError().message, code: 'CAMPAIGN_RETIRED' }
  }
  const required = ['topic', 'designMode'] as const
  for (const field of required) {
    if (typeof input[field] !== 'string' || !(input[field] as string).trim()) {
      return { error: `${field} is required and must be a non-empty string` }
    }
  }
  // 027: goal, tone and postStyle are optional, but a present one must be a string.
  for (const field of ['goal', 'tone', 'postStyle'] as const) {
    if (input[field] != null && typeof input[field] !== 'string') {
      return { error: `${field} must be a string` }
    }
  }
  if (input.projectId != null && typeof input.projectId !== 'string') {
    return { error: 'projectId must be a string' }
  }
  if (!['TEMPLATE', 'GENERATE'].includes(input.designMode as string)) {
    return { error: 'designMode must be TEMPLATE or GENERATE' }
  }
  return null
}
