export const CLOUD_BUSINESS_CHANNEL = 'cloud-business:request'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type CloudBusinessMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface CloudBusinessRequest {
  method: CloudBusinessMethod
  path: string
  body?: JsonValue
  expectedRuntimeId?: string
}

export interface CloudBusinessResponse {
  status: number
  body: JsonValue | null
}

export interface CloudBusinessBridge {
  requestClawPort(request: CloudBusinessRequest): Promise<CloudBusinessResponse>
}

const ROUTES = [
  ['GET', '/v1/workbench/bootstrap'],
  ['GET', '/v1/skills'],
  ['GET', '/v1/business-projects'],
  ['POST', '/v1/business-projects'],
  ['POST', '/v1/business-projects/establish'],
  ['GET', '/v1/business-projects/member-directory'],
  ['GET', '/v1/business-projects/:projectId'],
  ['GET', '/v1/business-projects/:projectId/member-directory'],
  ['PUT', '/v1/business-projects/:projectId/members'],
  ['DELETE', '/v1/business-projects/:projectId/members/:memberId'],
  ['GET', '/v1/business-projects/:projectId/artifacts'],
  ['POST', '/v1/business-projects/:projectId/artifacts'],
  ['GET', '/v1/business-projects/:projectId/artifacts/:artifactId'],
  ['GET', '/v1/dsh/runtime-binding'],
  ['GET', '/v1/dsh/session-links'],
  ['PUT', '/v1/dsh/session-links/:sessionId'],
  ['DELETE', '/v1/dsh/session-links/:sessionId'],
  ['GET', '/v1/dsh/workspace-bindings'],
  ['PUT', '/v1/dsh/workspace-bindings/:workspaceId'],
  ['GET', '/v1/memories'],
  ['POST', '/v1/memories'],
  ['GET', '/v1/memories/:memoryId'],
  ['GET', '/v1/memories/:memoryId/revisions'],
  ['POST', '/v1/memories/:memoryId/revisions'],
  ['PUT', '/v1/memories/:memoryId/recall'],
  ['GET', '/v1/memory-publications'],
  ['POST', '/v1/memory-publications'],
  ['GET', '/v1/product-knowledge/:knowledgeId'],
  ['GET', '/v1/dsh-memory/sessions/:sessionId/events'],
  ['GET', '/v1/dsh-memory/sessions/:sessionId/context-status'],
  ['POST', '/v1/dsh-memory/turns/recall'],
  ['POST', '/v1/dsh-memory/turns/recall-attached'],
  ['POST', '/v1/dsh-memory/turns/completed'],
  ['GET', '/v1/dsh-memory/sessions/:sessionId/state'],
  ['POST', '/v1/dsh-memory/batches/commit'],
  ['GET', '/v1/firm-skills'],
  ['GET', '/v1/firm-skills/versions/:versionId'],
  ['GET', '/v1/firm-skill-drafts'],
  ['GET', '/v1/firm-skill-drafts/:draftId'],
  ['POST', '/v1/firm-skill-drafts/:draftId/reviews'],
  ['GET', '/v1/firm-skill-reviews'],
  ['GET', '/v1/firm-skill-reviews/:reviewId'],
  ['PATCH', '/v1/firm-skill-reviews/:reviewId/decision'],
  ['GET', '/v1/dsh-firm-skills/manifest'],
  ['GET', '/v1/dsh-firm-skills/versions/:versionId/package'],
  ['PUT', '/v1/dsh-firm-skills/drafts'],
  ['GET', '/v1/dsh-projects/member-directory'],
  ['POST', '/v1/dsh-projects/establish'],
  ['GET', '/v1/firm-processes'],
  ['GET', '/v1/firm-processes/versions/:versionId'],
  ['GET', '/v1/firm-process-drafts'],
  ['POST', '/v1/firm-process-drafts'],
  ['GET', '/v1/firm-process-drafts/:draftId'],
  ['PATCH', '/v1/firm-process-drafts/:draftId'],
  ['POST', '/v1/firm-process-drafts/:draftId/reviews'],
  ['GET', '/v1/firm-process-reviews'],
  ['PATCH', '/v1/firm-process-reviews/:reviewId/decision'],
  ['GET', '/v1/firm-process-copies'],
  ['GET', '/v1/firm-process-copies/:copyId'],
  ['PATCH', '/v1/firm-process-copies/:copyId'],
  ['POST', '/v1/firm-processes/versions/:versionId/project-copies']
] as const satisfies readonly (readonly [CloudBusinessMethod, string])[]

const ROUTE_PATTERNS = ROUTES.map(([method, path]) => ({
  method,
  pattern: new RegExp(`^${path.split('/').map(segment => segment.startsWith(':') ? '[^/]+' : segment).join('/')}$`, 'u')
}))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function validPath(path: string): { pathname: string } | undefined {
  if (!path.startsWith('/v1/') || path.includes('#')) return undefined
  try {
    const parsed = new URL(path, 'https://clawport.invalid')
    if (`${parsed.pathname}${parsed.search}` !== path) return undefined
    return { pathname: parsed.pathname }
  } catch {
    return undefined
  }
}

export function isAllowedCloudBusinessRequest(request: Pick<CloudBusinessRequest, 'method' | 'path'>): boolean {
  const parsed = validPath(request.path)
  return parsed !== undefined && ROUTE_PATTERNS.some(route => route.method === request.method && route.pattern.test(parsed.pathname))
}

export function assertCloudBusinessRequest(value: unknown): CloudBusinessRequest {
  if (!isRecord(value)) throw new Error('Invalid cloud business request.')
  const keys = Object.keys(value)
  if (keys.some(key => !['method', 'path', 'body', 'expectedRuntimeId'].includes(key)) ||
    typeof value.method !== 'string' || typeof value.path !== 'string' ||
    (value.body !== undefined && !isJsonValue(value.body)) ||
    (value.expectedRuntimeId !== undefined && (typeof value.expectedRuntimeId !== 'string' || value.expectedRuntimeId.length === 0)) ||
    !isAllowedCloudBusinessRequest({ method: value.method as CloudBusinessMethod, path: value.path })) {
    throw new Error('Invalid cloud business request.')
  }
  const request: CloudBusinessRequest = {
    method: value.method as CloudBusinessMethod,
    path: value.path
  }
  if (value.body !== undefined) request.body = value.body as JsonValue
  if (value.expectedRuntimeId !== undefined) request.expectedRuntimeId = value.expectedRuntimeId as string
  return request
}

export function isCloudBusinessResponse(value: unknown): value is CloudBusinessResponse {
  return isRecord(value) && Number.isInteger(value.status) && (value.status as number) >= 100 &&
    (value.status as number) <= 599 && isJsonValue(value.body)
}
