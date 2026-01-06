import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simplistic HTML to TXT converter for GUI preview
 * Focuses on identifying structure, buttons, and inputs.
 */
function generatePreview(htmlContent, fileName) {
    let preview = `=== PREVIEW: ${fileName} ===\n\n`;

    // Extract Title
    const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) preview += `TITULO: ${titleMatch[1]}\n`;

    // Extract H1s
    const h1Matches = htmlContent.matchAll(/<h1.*?>(.*?)<\/h1>/gi);
    for (const match of h1Matches) {
        preview += `[H1] ${match[1].replace(/<[^>]*>?/gm, '').trim()}\n`;
    }

    // Extract Buttons
    const btnMatches = htmlContent.matchAll(/<button.*?>(.*?)<\/button>/gi);
    preview += `\nBOTÕES:\n`;
    for (const match of btnMatches) {
        const text = match[1].replace(/<[^>]*>?/gm, '').trim();
        if (text) preview += `  [BTN] ${text}\n`;
    }

    // Extract Inputs/Labels
    const inputMatches = htmlContent.matchAll(/<label.*?>(.*?)<\/label>.*?<input.*?(?:placeholder="(.*?)")?.*?>/gis);
    preview += `\nCAMPOS DE ENTRADA:\n`;
    for (const match of inputMatches) {
        const label = match[1].replace(/<[^>]*>?/gm, '').trim();
        const placeholder = match[2] || '';
        preview += `  [INP] ${label} (${placeholder})\n`;
    }

    // Extract Selects
    const selectMatches = htmlContent.matchAll(/<label.*?>(.*?)<\/label>.*?<select.*?>/gis);
    for (const match of selectMatches) {
        const label = match[1].replace(/<[^>]*>?/gm, '').trim();
        preview += `  [SEL] ${label}\n`;
    }

    // Identify Kanban or Tables
    if (htmlContent.includes('id="quadro"') || htmlContent.includes('class="kanban"')) {
        preview += `\nINFO: Esta página contém um Quadro Kanban.\n`;
    }

    if (htmlContent.includes('<table')) {
        preview += `\nINFO: Esta página contém Tabelas de Dados.\n`;
    }

    preview += `\n` + "=".repeat(fileName.length + 15);
    return preview;
}

const publicDir = path.join(__dirname, '..', 'public');
const adminDir = path.join(publicDir, 'admin');

const filesToPreview = [
    { dir: adminDir, name: 'index.html' },
    { dir: adminDir, name: 'quadro.html' },
    { dir: adminDir, name: 'produtos.html' },
    { dir: adminDir, name: 'categorias.html' },
    { dir: adminDir, name: 'config.html' }
];

let fullReport = "# GUI Preview Report\n\n";

for (const file of filesToPreview) {
    const filePath = path.join(file.dir, file.name);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        fullReport += "```text\n" + generatePreview(content, file.name) + "\n```\n\n";
    }
}

fs.writeFileSync(path.join(__dirname, 'gui_previews.md'), fullReport);
console.log('GUI Previews generated in tools/gui_previews.md');
