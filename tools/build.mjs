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
const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Forum&family=PT+Sans:wght@400;700&display=swap">';
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"><meta name="theme-color" content="#07050c">`;
// GitHub Pages: icons + link preview (icons from tools/icon.py, cover from npm run shots)
const SITE = 'https://x1as.github.io/ashroot/';
const DESC = 'Тринадцатый подвиг Геракла: souls-like пиксельный слэшер с видом сверху. 10 оружий с усиленными атаками, дары богов, 5 глубин Аида и 5 сердец. Играется в браузере на ПК и телефоне.';
const META = `<link rel="icon" type="image/png" href="favicon.png"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="description" content="${DESC}">
<meta property="og:type" content="website"><meta property="og:url" content="${SITE}"><meta property="og:title" content="Ashroot — Тринадцатый подвиг Геракла">
<meta property="og:description" content="${DESC}"><meta property="og:image" content="${SITE}og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}og.png">`;

fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
<html lang="ru">
<head>
${HEAD}
<title>Ashroot</title>
<link rel="icon" type="image/png" href="public/favicon.png">
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
<title>Ashroot — Тринадцатый подвиг Геракла</title>
${META}
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

// static files for the site: icons and the link-preview cover
for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(root, 'dist', f));
if (fs.existsSync(path.join(root, 'docs/og.png'))) fs.copyFileSync(path.join(root, 'docs/og.png'), path.join(root, 'dist/og.png'));
