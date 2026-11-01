import type { CloudBusinessRequest, CloudBusinessResponse, JsonValue } from '../../shared/cloud-business'
import { assertCloudBusinessRequest, isJsonValue } from '../../shared/cloud-business'

type Request = (url: string, init: RequestInit) => Promise<Response>

export interface CloudBusinessCredential {
  accessToken: string
  runtimeId: string
  epoch: number
}

export interface CloudBusinessAuthorization {
  credential(): CloudBusinessCredential | undefined
  refresh(): Promise<unknown>
  isCurrent(credential: CloudBusinessCredential): boolean
}

const RUNTIME_CHANGED: CloudBusinessResponse = {
  status: 409,
  body: { code: 'runtime_changed', message: 'The ClawPort runtime identity changed.' }
}

const IDENTITY_CHANGED: CloudBusinessResponse = {
  status: 409,
  body: { code: 'identity_changed', message: 'The ClawPort account changed while the request was running.' }
}

const SIGN_IN_REQUIRED: CloudBusinessResponse = {
  status: 401,
  body: { code: 'reauth_required', message: 'Cloud sign-in is required.' }
}

async function responseBody(response: Response): Promise<JsonValue | null> {
  if (response.status === 204) return null
  const body: unknown = await response.json()
  if (!isJsonValue(body)) throw new Error('ClawPort returned an invalid business response.')
  return body
}

export class CloudBusinessClient {
  private readonly endpoint: string
  private refreshFlow?: Promise<unknown>

  constructor(origin: string, private readonly send: Request, private readonly authorization: CloudBusinessAuthorization) {
    const parsed = new URL(origin)
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Cloud origin must contain only a scheme and authority.')
    }
    this.endpoint = `${parsed.origin}/api/desktop/cloud/request`
  }

  private refresh(): Promise<unknown> {
    if (!this.refreshFlow) {
      this.refreshFlow = this.authorization.refresh().finally(() => { this.refreshFlow = undefined })
    }
    return this.refreshFlow
  }

  private async sendOnce(request: CloudBusinessRequest, credential: CloudBusinessCredential): Promise<CloudBusinessResponse> {
    const response = await this.send(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
    const envelope = { status: response.status, body: await responseBody(response) }
    return this.authorization.isCurrent(credential) ? envelope : IDENTITY_CHANGED
  }

  async request(input: unknown): Promise<CloudBusinessResponse> {
    const request = assertCloudBusinessRequest(input)
    const initial = this.authorization.credential()
    if (!initial) return SIGN_IN_REQUIRED
    if (request.expectedRuntimeId !== undefined && request.expectedRuntimeId !== initial.runtimeId) return RUNTIME_CHANGED

    const first = await this.sendOnce(request, initial)
    if (first.status !== 401 || first === IDENTITY_CHANGED) return first
    await this.refresh()
    if (!this.authorization.isCurrent(initial)) return IDENTITY_CHANGED
    const rotated = this.authorization.credential()
    if (!rotated) return SIGN_IN_REQUIRED
    if (request.expectedRuntimeId !== undefined && request.expectedRuntimeId !== rotated.runtimeId) return RUNTIME_CHANGED
    return this.sendOnce(request, rotated)
  }
}
