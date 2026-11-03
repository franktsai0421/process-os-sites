import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { combineProcessScripts } from './process-scripts-build.mjs';

// All shell styles share /process/ as their URL base. Keep their exact cascade
// order and bytes; consolidate requests only, without minifying or dropping CSS.
export function combineProcessStyles(html, readStyle) {
  const pattern = /<link\s+rel="stylesheet"\s+href="([a-zA-Z0-9_-]+\.css)(?:\?[^"<>]*)?"\s*\/?>/g;
  const links = [...html.matchAll(pattern)];
  if (!links.length) throw Error('PROCESS_STYLES_MISSING');
  const allStyles = html.match(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi) || [];
  if (allStyles.length !== links.length) throw Error('PROCESS_STYLES_ATTRIBUTES');
  const css = links.map(([, name]) => {
    const source = readStyle(name);
    // These constructs require a CSS parser/rewrite; fail instead of silently
    // changing import order, character encoding, or a document base URL.
    if (/@(?:import|charset|namespace)\b/i.test(source)) throw Error('PROCESS_STYLES_DIRECTIVE');
    return `/* ${name} */\n${source}\n`;
  }).join('\n');
  if (/<base\b/i.test(html) || /<style\b/i.test(html.slice(links[0].index, links.at(-1).index))) {
    throw Error('PROCESS_STYLES_ORDER');
  }
  const name = `shell-styles.${createHash('sha256').update(css).digest('hex').slice(0, 20)}.css`;
  let first = true;
  const output = html.replace(pattern, () => {
    if (!first) return '';
    first = false;
    return `<link rel="stylesheet" href="${name}" />`;
  });
  return { html: output, css, name, count: links.length };
}

/** @returns {import('vite').Plugin} */
export function processStylesBuildPlugin() {
  return {
    name: 'process-os:ordered-shell-styles',
    apply: 'build',
    // Runs after all environments build, before the following auth audit reads
    // the final public artifacts. Source HTML/CSS remain the dev source of truth.
    buildApp: {
      order: 'post',
      handler(builder) {
        if (!builder.environments?.client?.isBuilt) throw Error('PROCESS_STYLES_BUILD_ORDER');
        const root = path.resolve(builder.config.root, builder.environments.client.config.build.outDir, 'process');
        const file = path.join(root, 'index.html');
        const result = combineProcessStyles(fs.readFileSync(file, 'utf8'), name => fs.readFileSync(path.join(root, name), 'utf8'));
        const scripts = combineProcessScripts(result.html, name => fs.readFileSync(path.join(root, name), 'utf8'));
        fs.writeFileSync(path.join(root, result.name), result.css);
        for (const asset of scripts.assets) fs.writeFileSync(path.join(root, asset.name), asset.source);
        fs.writeFileSync(file, scripts.html);
      },
    },
  };
}
