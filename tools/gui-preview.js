/**
 * GUI Preview Tool - DeliveryHub SaaS
 * Gera uma representação em texto das interfaces para debug rápido.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function generatePreview(filePath) {
    if (!fs.existsSync(filePath)) return `Arquivo nao encontrado: ${filePath}`;

    const content = fs.readFileSync(filePath, 'utf8');
    const titleMatch = content.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Sem titulo';

    // Extrair cabeçalhos e botões principais por regex simples
    const h1s = [...content.matchAll(/<h1>(.*?)<\/h1>/g)].map(m => m[1]);
    const buttons = [...content.matchAll(/class="btn.*?".*?>(.*?)<\/.*?>/g)].map(m => {
        return m[1].replace(/<i.*?><\/i>/g, '').trim();
    });

    // Extrair intens de navegação
    const navItems = [...content.matchAll(/class="nav-item.*?".*?>(.*?)<\/a>/g)].map(m => {
        return m[1].replace(/<i.*?><\/i>/g, '').trim();
    });

    let output = `\n============================================================\n`;
    output += `PREVIEW: ${title}\n`;
    output += `Caminho: ${filePath.replace(PUBLIC_DIR, '')}\n`;
    output += `============================================================\n\n`;

    output += `[TITULOS DA PAGINA]\n`;
    h1s.forEach(h => output += `  # ${h}\n`);

    if (navItems.length > 0) {
        output += `\n[NAVEGACAO (SIDEBAR)]\n`;
        navItems.forEach(n => output += `  > ${n}\n`);
    }

    if (buttons.length > 0) {
        output += `\n[ACOES PRINCIPAIS (BOTOES)]\n`;
        buttons.forEach(b => output += `  [ ${b} ]\n`);
    }

    // Tentar identificar se é o quadro Kanban
    if (content.includes('kanban') || content.includes('quadro')) {
        output += `\n[ESTRUTURA KANBAN DETECTADA]\n`;
        output += `  [ Pendentes ] -> [ Preparando ] -> [ Saiu para Entrega ] -> [ Concluidos ]\n`;
    }

    output += `\n============================================================\n`;
    return output;
}

const pages = [
    path.join(PUBLIC_DIR, 'admin', 'index.html'),
    path.join(PUBLIC_DIR, 'admin', 'quadro.html'),
    path.join(PUBLIC_DIR, 'admin', 'produtos.html'),
    path.join(PUBLIC_DIR, 'admin', 'avaliacoes.html'),
];

console.log('--- Gerando Previews das GUIs ---');
pages.forEach(p => {
    console.log(generatePreview(p));
});
