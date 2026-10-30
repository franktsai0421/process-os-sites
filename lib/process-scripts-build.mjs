import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import ts from 'typescript';

// Classic scripts with global declarations stay separate: merging them would
// change hoisting/lexical initialization. Existing IIFEs keep their own scope and
// strictness. This emits ordinary same-origin scripts, never eval or fetched code.
function canCombine(name, source) {
  if (source.startsWith('#!') || /\bdocument\s*(?:\.\s*currentScript|\[\s*['"]currentScript['"])/.test(source)) return false;
  const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length) throw Error('PROCESS_SCRIPTS_SYNTAX');
  return parsed.statements.every(statement => ts.isEmptyStatement(statement) ||
    ts.isExpressionStatement(statement) && !ts.isStringLiteral(statement.expression));
}

export function combineProcessScripts(html, readScript) {
  const matches = [...html.matchAll(/<script data-process-src="([^"]+)"><\/script>/g)];
  const assets = [], replacements = [];
  let group = [];
  function flush() {
    if (group.length > 1) {
      const sources = group.map(item => item.name);
      const body = group.map(item => `;\n/* ${item.name} */\n${item.source}\n`).join('\n');
      const id = createHash('sha256').update(body).digest('hex').slice(0, 20);
      const name = `shell-scripts.${id}.js`;
      const source = body + `\n;(window.ProcessRuntimeBundles ||= Object.create(null))["${id}"] = true;\n`;
      try { new Script(source); } catch { throw Error('PROCESS_SCRIPTS_SYNTAX'); }
      assets.push({ name, source, sources, id });
      replacements.push({ start: group[0].start, end: group.at(-1).end,
        html: `<script data-process-src="${name}" data-process-bundle="${id}"></script>` });
    }
    group = [];
  }
  for (const match of matches) {
    // Private imported seeds are not build inputs and never enter a bundle.
    const name = match[1].split('?')[0];
    if (!/^[a-zA-Z0-9_-]+\.js$/.test(name)) { flush(); continue; }
    const source = readScript(name);
    if (!canCombine(name, source)) { flush(); continue; }
    if (group.length && html.slice(group.at(-1).end, match.index).trim()) flush();
    group.push({ name, source, start: match.index, end: match.index + match[0].length });
  }
  flush();
  for (const replacement of replacements.reverse()) html = html.slice(0, replacement.start) + replacement.html + html.slice(replacement.end);
  return { html, assets };
}
