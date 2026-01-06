// ============================================================
// GUI Preview Service (TXT)
// - Converte HTML/CSS de GUIs para formato texto estruturado
// - Auxilia manutencao via IA e logs de terminal
// Autor: killsis (Lucas Larocca)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GUIPreviewService {
    constructor() {
        this.publicPath = path.join(__dirname, '..', '..', 'public');
    }

    /**
     * Renderiza uma pagina HTML para um formato texto simplificado
     */
    renderPageToTxt(pagePath) {
        try {
            const fullPath = path.join(this.publicPath, pagePath);
            if (!fs.existsSync(fullPath)) {
                return `[ERRO] Pagina nao encontrada: ${pagePath}`;
            }

            const html = fs.readFileSync(fullPath, 'utf-8');

            // Extracao simplificada de componentes
            const title = this.extractTagContent(html, 'title') || 'Sem Titulo';
            const buttons = this.extractAllTags(html, 'button');
            const inputs = this.extractAllTags(html, 'input');
            const h1s = this.extractAllTags(html, 'h1');
            const labels = this.extractAllTags(html, 'label');

            let output = `============================================================\n`;
            output += ` PREVIEW GUI: ${pagePath.toUpperCase()}\n`;
            output += `============================================================\n\n`;
            output += `TITULO: ${title}\n\n`;

            if (h1s.length > 0) {
                output += `CABEÇALHOS (H1):\n`;
                h1s.forEach(h => output += `  [#] ${h.content}\n`);
                output += `\n`;
            }

            if (labels.length > 0) {
                output += `CAMPOS / LABELS:\n`;
                labels.forEach(l => output += `  [L] ${l.content}\n`);
                output += `\n`;
            }

            if (inputs.length > 0) {
                output += `ENTRADAS (INPUTS):\n`;
                inputs.forEach(i => {
                    const type = i.attributes.type || 'text';
                    const id = i.attributes.id || i.attributes.name || 'sem-id';
                    output += `  [I] (${type.toUpperCase()}) id="${id}"\n`;
                });
                output += `\n`;
            }

            if (buttons.length > 0) {
                output += `AÇÕES (BOTÕES):\n`;
                buttons.forEach(b => {
                    const text = b.content.trim() || b.attributes.title || 'Sem Texto';
                    const id = b.attributes.id || 'sem-id';
                    output += `  [B] "${text}" (id: ${id})\n`;
                });
                output += `\n`;
            }

            // Tentar extrair templates do Alpine.js se houver
            if (html.includes('x-for') || html.includes('x-if')) {
                output += `LOGICA DINAMICA DETECTADA: Alpine.js\n`;
            }

            output += `============================================================\n`;
            return output;
        } catch (error) {
            return `[ERRO] Falha ao renderizar preview: ${error.message}`;
        }
    }

    /**
     * Helper para extrair conteudo de uma tag
     */
    extractTagContent(html, tag) {
        const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'si');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Helper para extrair todas as tags e seus atributos
     */
    extractAllTags(html, tag) {
        const results = [];
        const regex = new RegExp(`<${tag}([^>]*)>(.*?)<\/${tag}>|<${tag}([^>]*)\/?>`, 'gsi');
        let match;

        while ((match = regex.exec(html)) !== null) {
            const attrStr = match[1] || match[3] || '';
            const content = match[2] || '';
            const attributes = this.parseAttributes(attrStr);
            results.push({ content, attributes });
        }
        return results;
    }

    /**
     * Parseie string de atributos para objeto
     */
    parseAttributes(attrStr) {
        const attributes = {};
        const attrRegex = /([a-z0-9-]+)=["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/gi;
        let match;
        while ((match = attrRegex.exec(attrStr)) !== null) {
            attributes[match[1]] = match[2];
        }
        return attributes;
    }
}

// Singleton
let instance = null;
export function getGUIPreviewService() {
    if (!instance) instance = new GUIPreviewService();
    return instance;
}

export default GUIPreviewService;
