// Pieni bundleri: liittää tsc:n tuottamat moduulit yhdeksi skriptiksi.
// Paikalliset importit poistetaan ja export-avainsanat riisutaan (nimet ovat uniikkeja).
import fs from 'fs';

const ORDER = ['rng', 'terrain', 'data', 'pathfind', 'sim', 'ai', 'render', 'audio', 'ui', 'main'];

export function bundle(mods, { keepThreeImport = true } = {}) {
  let out = '';
  let threeImported = false;
  for (const m of mods) {
    let src = fs.readFileSync(`dist/${m}.js`, 'utf8');
    src = src.replace(/^import\s+\*\s+as\s+THREE\s+from\s+['"]three['"];?\s*$/m, () => {
      if (threeImported || !keepThreeImport) return '';
      threeImported = true;
      return "import * as THREE from 'three';";
    });
    src = src.replace(/^import\s+[^;]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gms, '');
    src = src.replace(/^export\s+(?=(const|let|function|class|async))/gm, '');
    src = src.replace(/^export\s*\{\s*\};?\s*$/gm, '');
    out += `// ---- ${m}.ts ----\n` + src + '\n';
  }
  return out;
}

if (process.argv[2] === 'test') {
  const code = bundle(ORDER.slice(0, 6), { keepThreeImport: false }) + '\n' + fs.readFileSync(process.argv[3]||'test/simtest.js', 'utf8');
  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync('build/simtest.mjs', code);
} else if (process.argv[2] === 'web') {
  // Itsenäinen verkkosivu (esim. Render): täysi HTML-dokumentti ja Three.js omalta palvelimelta.
  const code = bundle(ORDER);
  const tpl = fs.readFileSync('src/index.html', 'utf8')
    .replace('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js', './three.module.min.js');
  const body = tpl.replace('/*__GAME__*/', () => code).replace(/<title>[^<]*<\/title>/, '<title>Itärintama – WeGo-taktiikkapeli</title>');
  const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="#171b16"/><path d="M16 5l10 11-10 11L6 16z" fill="#d6b76a"/></svg>');
  const html = `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="WeGo-taktiikkapeli itärintamalta: Bobrin kylä 1941 ja Zaborjen kukkula 1944.">
<link rel="icon" href="${icon}">
<style>html, body { margin: 0; } :root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } [hidden] { display: none !important; }</style>
</head>
<body>
${body}
</body>
</html>
`;
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/index.html', html);
  fs.copyFileSync('vendor/three.module.min.js', 'public/three.module.min.js');
  console.log('public/index.html', (html.length / 1024).toFixed(0), 'kB + three.module.min.js');
} else {
  const code = bundle(ORDER);
  const tpl = fs.readFileSync('src/index.html', 'utf8');
  const html = tpl.replace('/*__GAME__*/', () => code);
  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync('build/index.html', html);
  console.log('build/index.html', (html.length / 1024).toFixed(0), 'kB');
}
