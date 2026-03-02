import fs from 'fs';
import path from 'path';

const filePath = 'D:\\VENDA\\IZAQUE CAMPESTRE\\Saas-Restaurante\\public\\admin\\config.html';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Fix broken URLs (https: // -> https://)
content = content.replace(/https:\s+\/\//g, 'https://');

// 2. Fix broken method chains ( \n\n . -> .)
content = content.replace(/\s+\n\s*\./g, '.');

// 3. Fix broken semicolons ( \n\n ; -> ;)
content = content.replace(/\s+\n\s*;/g, ';');

// 4. Fix broken braces/brackets/parens
content = content.replace(/\s+\n\s*\]/g, ']');
content = content.replace(/\s+\n\s*\)/g, ')');
content = content.replace(/\s+\n\s*\}/g, '}');

// 5. Special case for the specific pattern I saw: } \n\n ;
content = content.replace(/\}\s*\n\s*;/g, '};');

// 6. Fix broken commas in arrays/objects
content = content.replace(/\s+\n\s*,/g, ',');

// 7. Fix broken function calls with newlines before parens (func \n\n () -> func())
// content = content.replace(/(\w+)\s+\n\s*\(/g, '$1('); // Be careful with this one

console.log('Cleaning complete. Saving...');
fs.writeFileSync(filePath, content);
console.log('Fixed config.html');
