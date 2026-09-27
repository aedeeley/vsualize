import { generateBranding } from './generate-branding.mjs';
import { inlineBrandPreview } from './brand-preview.mjs';
import { mkdir, readFile, readdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pruneRetiredVisuals } from './prune-retired-visuals.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await generateBranding(root);
const retired = await pruneRetiredVisuals(root);
if (retired.length) console.log(`Removed ${retired.length} retired visual source files from this in-place update.`);
function tsc(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), ...args], { stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`TypeScript is missing. Run npm install first. ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await rm('dist', { recursive: true, force: true }); await mkdir('dist', { recursive: true });
tsc(['-p', 'tsconfig.json']);
for (const name of await readdir('static')) await copyFile(path.join('static', name), path.join('dist', name));
// A zero-network, single HTML preview. This is the SAME compiled UI and shaders.
await rm('.bundle', { recursive: true, force: true });
tsc(['-p', 'tsconfig.json', '--module', 'CommonJS', '--moduleResolution', 'Node', '--outDir', '.bundle']);
async function walk(dir, prefix = '') {
  const modules = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + item.name;
    if (item.isDirectory()) modules.push(...await walk(path.join(dir, item.name), key + '/'));
    else if (item.name.endsWith('.js')) modules.push(`${JSON.stringify(key)}:function(require,module,exports){\n${await readFile(path.join(dir, item.name), 'utf8')}\n}`);
  }
  return modules;
}
const modules = await walk('.bundle');
const bundle = `(function(){const modules={${modules.join(',\n')}};const cache={};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;const req=(p)=>{const a=(id.slice(0,id.lastIndexOf('/')+1)+p).split('/');const b=[];for(const v of a){if(v==='.'||v==='')continue;if(v==='..')b.pop();else b.push(v)}return load(b.join('/'))};if(!modules[id])throw new Error('Missing module '+id);modules[id](req,m,m.exports);return m.exports}load('main.js');})();`;
let html = await readFile('static/index.html', 'utf8');
html = await inlineBrandPreview(html, root);
html = html.replace('<link rel="stylesheet" href="./style.css">', `<style>${await readFile('static/style.css', 'utf8')}</style>`);
html = html.replace('</head>', `<style id="preview-menu-style">${await readFile('static/preview-menu.css', 'utf8')}</style></head>`);
html = html.replace('<script type="module" src="./main.js"></script>', `<script>${bundle.replaceAll('</script', '<\\/script')}</script>`);
await writeFile('Vsualize-Preview.html', html);
await rm('.bundle', { recursive: true, force: true });
console.log('Built dist/ and Vsualize-Preview.html. Native Windows build is separate.');
