import fs from 'fs';
import path from 'path';

const base = path.join(process.env.TEMP || '/tmp', 'domiclick-docx-audit');
const outDir = path.join(process.cwd(), 'docs', 'audit');
fs.mkdirSync(outDir, { recursive: true });

for (const name of ['estructura', 'matriz', 'objeto']) {
  const xmlPath = path.join(base, name, 'unz', 'word', 'document.xml');
  console.log('\n========', name, '========');
  let xml = fs.readFileSync(xmlPath, 'utf8');
  xml = xml.replace(/<\/w:p>/g, '\n');
  xml = xml.replace(/<w:tab[^/]*\/>/g, '\t');
  xml = xml.replace(/<[^>]+>/g, '');
  xml = xml
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const lines = xml
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = lines.join('\n');
  fs.writeFileSync(path.join(outDir, `${name}.txt`), text, 'utf8');
  console.log(text.slice(0, 15000));
  if (text.length > 15000) console.log('\n...[truncated, full in docs/audit/' + name + '.txt]');
}
