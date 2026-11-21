// npm run build
//  -> index.html          dev page (ES modules from src/, run with `npm run dev`)
//  -> dist/ashroot.html   single self-contained file (bundled JS + inline CSS), playable offline,
//                         also the source for the claude.ai artifact.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const body = read('src/body.html');
const css = read('src/style.css');
const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tiny5&family=Press+Start+2P&display=swap">';
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"><meta name="theme-color" content="#07050c">`;

fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
<html lang="ru">
<head>
${HEAD}
<title>Ashroot</title>
${FONT}
<link rel="stylesheet" href="src/style.css">
</head>
<body>
${body}
<script type="module" src="src/main.js"></script>
</body>
</html>
`);

const out = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
// artifact flavour: no doctype/html/head/body (the host wraps it); also opens fine from disk
const page = `<meta charset="utf-8">
<title>Ashroot</title>
${FONT}
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
fs.writeFileSync(path.join(root, 'dist/ashroot.html'), page);
// GitHub Pages flavour: a full HTML document (standards mode) with everything inline
fs.writeFileSync(path.join(root, 'dist/index.html'), `<!doctype html>
<html lang="ru">
<head>
${HEAD}
<title>Ashroot</title>
<meta name="description" content="Ashroot — souls-like пиксельный слешер с видом сверху. Играется в браузере, на ПК и телефоне.">
${FONT}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`);
fs.writeFileSync(path.join(root, 'dist/.nojekyll'), '');
console.log(`index.html + dist/index.html + dist/ashroot.html (${(page.length / 1024).toFixed(0)} KB)`);
