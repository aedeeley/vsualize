// A focused window-key compatibility check, NOT a replacement for Tauri's full
// config validator. The released Rust parser rejects unknown window properties.
// Baseline: tauri-v2.11.6 / tauri-utils 2.9.3, not the upstream dev branch.
// https://docs.rs/tauri-utils/2.9.3/tauri_utils/config/struct.WindowConfig.html
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASED_WINDOW_KEYS = Object.freeze(`
label create url userAgent dragDropEnabled center x y width height minWidth
minHeight maxWidth maxHeight preventOverflow resizable maximizable minimizable
closable title fullscreen focus focusable transparent maximized visible decorations
alwaysOnBottom alwaysOnTop visibleOnAllWorkspaces contentProtected skipTaskbar
windowClassname theme titleBarStyle trafficLightPosition hiddenTitle acceptFirstMouse
tabbingIdentifier additionalBrowserArgs shadow windowEffects incognito parent proxyUrl
zoomHotkeysEnabled browserExtensionsEnabled useHttpsScheme devtools backgroundColor
backgroundThrottling javascriptDisabled allowLinkPreview disableInputAccessoryView
dataDirectory dataStoreIdentifier scrollBarStyle activityName createdByActivityName
requestedBySceneIdentifier generalAutofillEnabled
`.trim().split(/\s+/));

export function checkWindowKeys(config, cliSchema = null) {
  if (!config?.app || !Array.isArray(config.app.windows) || config.app.windows.length === 0) {
    throw new Error('Expected app.windows to contain the main window in src-tauri/tauri.conf.json.');
  }
  const allowed = new Set(RELEASED_WINDOW_KEYS);
  let cliFields;
  if (cliSchema) {
    cliFields = cliSchema.definitions?.WindowConfig?.properties ?? cliSchema.$defs?.WindowConfig?.properties;
    if (!cliFields || typeof cliFields !== 'object') {
      throw new Error('The installed Tauri CLI schema has no WindowConfig properties. Run npm install to repair the CLI package.');
    }
  }
  const failures = [];
  config.app.windows.forEach((window, index) => {
    if (!window || typeof window !== 'object' || Array.isArray(window)) {
      failures.push(`app.windows[${index}] must be an object.`);
      return;
    }
    for (const key of Object.keys(window)) {
      const location = `app.windows[${index}].${key}`;
      if (!allowed.has(key)) {
        failures.push(`${location} is not supported by the released Tauri 2.11.6 runtime baseline.`);
      } else if (cliFields && !Object.hasOwn(cliFields, key)) {
        failures.push(`${location} is not supported by your installed Tauri CLI schema.`);
      }
    }
  });
  if (failures.length) {
    throw new Error(`Window configuration is incompatible:\n${failures.join('\n')}\nRemove unsupported fields or align the released runtime and CLI before building.`);
  }
}

export function checkDesktopConfig(root, { requireCli = false } = {}) {
  const readJson = relative => JSON.parse(readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));
  const config = readJson('src-tauri/tauri.conf.json');
  const schemaFile = 'node_modules/@tauri-apps/cli/config.schema.json';
  const cliPresent = existsSync(path.join(root, schemaFile));
  if (requireCli && !cliPresent) {
    throw new Error('Tauri CLI/config.schema.json is missing. Run npm install in the project folder, then retry.');
  }
  const schema = cliPresent ? readJson(schemaFile) : null;
  checkWindowKeys(config, schema);
  const pkg = readJson('package.json');
  const cargo = readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (pkg.version !== config.version || pkg.version !== cargoVersion) {
    throw new Error(`Mixed source versions: package=${pkg.version}, Tauri=${config.version}, Cargo=${cargoVersion}. Replace all files from the same update package.`);
  }
  return { version: pkg.version, cliSchemaChecked: cliPresent };
}

const entry = process.argv[1] && path.resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const result = checkDesktopConfig(root, { requireCli: process.argv.includes('--require-cli') });
    console.log(`Vsualize ${result.version}: window keys match the released runtime${result.cliSchemaChecked ? ' and installed CLI schema' : ' baseline (CLI not checked)'}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
