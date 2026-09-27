/** Keep the standalone preview self-contained after adding branding to the normal build. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function inlineBrandPreview(html, root) {
  const css = await readFile(path.join(root, 'static/brand.css'), 'utf8');
  const logo = await readFile(path.join(root, 'static/brand-logo.svg'));
  const favicon = await readFile(path.join(root, 'static/favicon.svg'));
  html = html.replace('<link rel="stylesheet" href="./brand.css">', `<style>${css}</style>`);
  html = html.replaceAll('src="./brand-logo.svg"', `src="data:image/svg+xml;base64,${logo.toString('base64')}"`);
  // A standalone file is not an installable website. Do not leave broken file:// links.
  html = html.replace(/^\s*<link\b[^>]*href="\.\/(?:favicon\.ico|apple-touch-icon\.png|site\.webmanifest)"[^>]*>\s*$/gm, '');
  html = html.replaceAll('href="./favicon.svg"', `href="data:image/svg+xml;base64,${favicon.toString('base64')}"`);
  return html;
}
