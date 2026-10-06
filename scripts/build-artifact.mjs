// Собирает версию для публикации как Artifact на claude.ai: страница без <html>/<head>/<body>.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const start = html.indexOf('<!--artifact-start-->') + '<!--artifact-start-->'.length;
const end = html.indexOf('<!--artifact-end-->');
const body = html.slice(start, end).replace('</head>\n<body>\n', '');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', body.trim() + '\n');
console.log('dist/artifact.html готов');
