import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { assertCloudBusinessRequest, type CloudBusinessResponse } from '../../shared/cloud-business'
import type { CloudIdentitySnapshot } from '../../shared/cloud-identity'

interface CloudHostBrokerOptions {
  request(value: unknown): Promise<CloudBusinessResponse>
  identity(): CloudIdentitySnapshot
}

export interface CloudHostLaunch {
  origin: string
  capability: string
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  if (status === 204) {
    response.end()
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

export class CloudHostBroker {
  private server?: Server
  private origin?: string
  private capability?: string

  constructor(private readonly options: CloudHostBrokerOptions) {}

  private authorized(request: IncomingMessage): boolean {
    return this.capability !== undefined && request.headers.authorization === `Bearer ${this.capability}`
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin !== undefined) {
      writeJson(response, 403, { code: 'origin_not_allowed' })
      return
    }
    if (!this.authorized(request)) {
      writeJson(response, 401, { code: 'invalid_capability' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/cloud/identity') {
      if (request.method !== 'GET') {
        writeJson(response, 405, { code: 'method_not_allowed' })
        return
      }
      writeJson(response, 200, this.options.identity())
      return
    }
    if (url.pathname !== '/cloud/request') {
      writeJson(response, 404, { code: 'not_found' })
      return
    }
    if (request.method !== 'POST') {
      writeJson(response, 405, { code: 'method_not_allowed' })
      return
    }
    try {
      const result = await this.options.request(assertCloudBusinessRequest(await readJson(request)))
      writeJson(response, result.status, result.body)
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && error.message.includes('cloud business request'))) {
        writeJson(response, 400, { code: 'invalid_request' })
        return
      }
      writeJson(response, 502, { code: 'cloud_unavailable' })
    }
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return
    const server = createServer((request, response) => { void this.handle(request, response) })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address() as AddressInfo
    this.server = server
    this.origin = `http://127.0.0.1:${address.port}`
  }

  async startLaunch(): Promise<CloudHostLaunch> {
    await this.ensureServer()
    return this.rotateLaunch()
  }

  rotateLaunch(): CloudHostLaunch {
    if (!this.origin) throw new Error('ClawPort Host broker is not running.')
    this.capability = randomBytes(32).toString('base64url')
    return { origin: this.origin, capability: this.capability }
  }

  launchEnvironment(): NodeJS.ProcessEnv {
    if (!this.origin || !this.capability) throw new Error('ClawPort Host broker launch has not started.')
    return {
      CLAWPORT_DESKTOP_BRIDGE_ORIGIN: this.origin,
      CLAWPORT_DESKTOP_BRIDGE_TOKEN: this.capability
    }
  }

  clearLaunch(): void {
    this.capability = undefined
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.origin = undefined
    this.clearLaunch()
    if (!server) return
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
