import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Replace new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  // with a safe local string
  content = content.replace(
    /new Date\(new Date\(\)\.getFullYear\(\), new Date\(\)\.getMonth\(\), 1\)\.toISOString\(\)\.split\('T'\)\[0\]/g,
    "(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })()"
  );

  // Replace new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  content = content.replace(
    /new Date\(new Date\(\)\.getFullYear\(\), new Date\(\)\.getMonth\(\) \+ 1, 0\)\.toISOString\(\)\.split\('T'\)\[0\]/g,
    "(() => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()"
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', '.git', 'dist'].includes(file)) {
        walkDir(fullPath);
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir('.');
