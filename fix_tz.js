import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  content = content.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })");
  content = content.replace(/new Date\(\)\.toISOString\(\)\.split\("T"\)\[0\]/g, "new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })");
  
  // Also replace new Date(year, month, day).toISOString().split('T')[0]
  content = content.replace(/new Date\(([^)]+)\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "new Date($1).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })");

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
