import type { CloudBusinessBridge, CloudBusinessResponse } from '../shared/cloud-business'
import { assertCloudBusinessRequest, CLOUD_BUSINESS_CHANNEL, isCloudBusinessResponse } from '../shared/cloud-business'

interface IpcRendererLike {
  invoke(channel: string, value: unknown): Promise<unknown>
}

export function createCloudBusinessBridge(ipcRenderer: IpcRendererLike): CloudBusinessBridge {
  return {
    requestClawPort: async input => {
      const request = assertCloudBusinessRequest(input)
      const response = await ipcRenderer.invoke(CLOUD_BUSINESS_CHANNEL, request)
      if (!isCloudBusinessResponse(response)) throw new Error('ClawPort returned an invalid cloud business response.')
      return response as CloudBusinessResponse
    }
  }
}
