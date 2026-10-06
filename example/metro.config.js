// Resolve `whyrn.dev` straight from ../src so library changes hot-reload,
// and force a single copy of react / react-native from this app.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.blockList = [new RegExp(`^${escape(path.join(root, 'node_modules'))}/.*`)];
config.resolver.extraNodeModules = {
  'whyrn.dev': path.join(root, 'src'),
};

function escape(s) {
  return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

module.exports = config;
