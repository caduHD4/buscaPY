import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { SOURCES } from '../src/sources.mjs';
import { Script } from 'node:vm';
let page=await readFile('src/ui.html','utf8');
page=page.replace('<!-- SOURCE_OPTIONS -->',()=>Object.entries(SOURCES).map(([id,source])=>`<option value="${id}">${source.label}</option>`).join(''));
page=page.replace('/* INLINE_CONFIG */',()=>`const SOURCE_CONFIG = ${JSON.stringify(SOURCES)};`);
const css=await readFile('src/ui.css','utf8'),js=await readFile('src/ui.js','utf8');
// A function replacement keeps $' and other dollar sequences literal in embedded code.
page=page.replace('/* INLINE_STYLE */',()=>css).replace('/* INLINE_SCRIPT */',()=>js);
new Script(page.match(/<script>([\s\S]*?)<\/script>/)[1]);
await writeFile('src/page.html',page);
await build({entryPoints:['src/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.html':'text'},outfile:'worker/index.js',minify:true});
