export function validateClawPortPluginPackage(directory: string): Promise<void>
export function stageClawPortPlugin(artifact: string): Promise<void>
export function stageClawPortPluginIntoRoot(artifact: string, root: string): Promise<void>
export function verifyStagedClawPortPlugin(root?: string): Promise<void>
