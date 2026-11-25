const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * Shared TypeScript lives one level up in the web app (web/src/lib), imported as @shared/*.
 * Only dependency-free files are shared (format, avatars, apiTypes); anything that touches the
 * server or the DOM stays on its own side.
 */
const SHARED = path.resolve(__dirname, "../src/lib");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), SHARED];

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName.startsWith("@shared/") ? path.join(SHARED, moduleName.slice("@shared/".length)) : moduleName;
  return (resolveRequest ?? context.resolveRequest)(context, target, platform);
};

module.exports = config;
