const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the full monorepo so Metro can resolve packages from the pnpm virtual store.
config.watchFolders = [monorepoRoot];

// Search mobile node_modules first, then the root (pnpm virtual store).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force singleton packages to always resolve from the mobile app's own
// node_modules. Without this, pnpm's virtual store causes Metro to load two
// separate copies of react/react-native — one for app code and one for
// pnpm-stored packages (e.g. @react-navigation/native). Two copies means
// React Context never propagates between them, which surfaces as
// "Couldn't find a navigation context" at runtime.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

module.exports = withNativeWind(config, { input: './global.css' });
