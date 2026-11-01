const packageJson = require('./package.json')

module.exports = {
  ...packageJson.build,
  appId: 'com.clawport.desktop.dev',
  productName: 'ClawPort Dev',
  directories: {
    ...packageJson.build.directories,
    output: 'dist-dev'
  },
  extraMetadata: {
    name: 'clawport-desktop-dev',
    productName: 'ClawPort Dev',
    clawportDesktopChannel: 'development'
  },
  artifactName: 'clawport-desktop-dev-${os}-${arch}.${ext}',
  nsis: {
    ...packageJson.build.nsis,
    artifactName: 'clawport-desktop-dev-windows-${arch}-setup.${ext}'
  },
  publish: null
}
