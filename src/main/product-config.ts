/** Product-owned identity; local data stays separate from upstream DSH Desktop. */
export const PRODUCT_NAME = 'ClawPort'
export const PRODUCTION_USER_DATA_DIR = 'clawport-desktop'
export const DEVELOPMENT_USER_DATA_DIR = 'clawport-desktop-dev'
export const PRODUCT_HARNESS_PORT = 44129
export const PRODUCT_UPDATES_ENABLED = false
export const PRODUCT_CLOUD_ORIGIN = 'https://clawport.si'

export function resolveProductCloudOrigin(
  developmentBuild: boolean,
  override = process.env.CLAWPORT_CLOUD_ORIGIN
): string {
  if (!override) return PRODUCT_CLOUD_ORIGIN
  const url = new URL(override)
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('The ClawPort cloud origin must contain only a scheme and authority.')
  }
  if (url.protocol === 'https:') return url.origin
  if (!developmentBuild) throw new Error('The production ClawPort cloud origin must use HTTPS.')
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]')) {
    throw new Error('An HTTP ClawPort cloud origin must be a development loopback address.')
  }
  return url.origin
}
