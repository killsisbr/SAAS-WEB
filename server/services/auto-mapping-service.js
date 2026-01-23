// ============================================================
// Auto-Mapping Service
// Gera mapeamentos automáticos para produtos
// ============================================================

import { v4 as uuidv4 } from 'uuid';

/**
 * Normaliza texto removendo acentos e caracteres especiais
 */
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

/**
 * Gera variações de mapeamento para um nome de produto
 * Ex: "Coca-Cola 2 Litros" -> ["coca cola 2 litros", "coca 2l", "coca 2 litros", "coca cola 2l"]
 */
export function generateMappingVariations(productName) {
    const variations = new Set();
    const normalized = normalizeText(productName);

    // 1. Nome normalizado completo
    variations.add(normalized);

    // 2. Palavras individuais relevantes (exceto artigos/preposições)
    const stopWords = ['de', 'da', 'do', 'com', 'sem', 'e', 'ou', 'o', 'a', 'os', 'as', 'um', 'uma'];
    const words = normalized.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

    // Primeira palavra significativa (geralmente é a marca/tipo)
    if (words.length > 0) {
        variations.add(words[0]);
    }

    // 3. Combinar primeiras palavras
    if (words.length >= 2) {
        variations.add(words.slice(0, 2).join(' '));
    }
    if (words.length >= 3) {
        variations.add(words.slice(0, 3).join(' '));
    }

    // 4. Detectar e gerar variações de volume
    const volumePatterns = [
        { regex: /(\d+)\s*litros?/i, abbrev: (m) => `${m[1]}l` },
        { regex: /(\d+)\s*l\b/i, full: (m) => `${m[1]} litros` },
        { regex: /(\d+)\s*ml\b/i, abbrev: (m) => `${m[1]}ml` },
    ];

    for (const pattern of volumePatterns) {
        const match = normalized.match(pattern.regex);
        if (match) {
            // Gerar abreviação
            if (pattern.abbrev) {
                const abbr = pattern.abbrev(match);
                // Base + abreviação
                if (words[0]) {
                    variations.add(`${words[0]} ${abbr}`);
                    if (words[1] && words[1] !== match[0]) {
                        variations.add(`${words[0]} ${words[1]} ${abbr}`);
                    }
                }
            }
            // Gerar forma completa
            if (pattern.full) {
                const full = pattern.full(match);
                if (words[0]) {
                    variations.add(`${words[0]} ${full}`);
                }
            }
        }
    }

    // 5. Detectar e gerar variações de tamanho (P, M, G)
    const sizePatterns = [
        { regex: /\bpequen[oa]?\b/i, abbrev: 'p' },
        { regex: /\bmedi[oa]?\b/i, abbrev: 'm' },
        { regex: /\bgrande\b/i, abbrev: 'g' },
        { regex: /\bgg\b/i, full: 'extra grande' },
    ];

    for (const pattern of sizePatterns) {
        const match = normalized.match(pattern.regex);
        if (match) {
            // Base sem o tamanho + abreviação
            const baseWithoutSize = normalized.replace(pattern.regex, '').replace(/\s+/g, ' ').trim();
            if (pattern.abbrev) {
                variations.add(`${baseWithoutSize} ${pattern.abbrev}`);
            }
            if (pattern.full) {
                variations.add(`${baseWithoutSize} ${pattern.full}`);
            }
        }
    }

    // 6. Gerar variações sem hífen/espaços extras
    const noHyphen = productName.replace(/-/g, ' ').toLowerCase();
    if (noHyphen !== normalized) {
        variations.add(normalizeText(noHyphen));
    }

    // Filtrar variações muito curtas ou vazias
    return Array.from(variations)
        .filter(v => v && v.length >= 2)
        .map(v => v.trim());
}

/**
 * Cria mapeamentos automáticos para um produto recém-criado
 */
export async function createAutoMappings(db, tenantId, productId, productName) {
    const variations = generateMappingVariations(productName);
    let created = 0;

    console.log(`[AutoMapping] Gerando ${variations.length} mapeamentos para "${productName}"`);

    for (const keyword of variations) {
        try {
            // Verificar se já existe mapeamento para esta keyword
            const existing = await db.get(
                'SELECT id FROM product_mappings WHERE tenant_id = ? AND keyword = ?',
                [tenantId, keyword]
            );

            if (!existing) {
                const mappingId = uuidv4();
                await db.run(
                    'INSERT INTO product_mappings (id, tenant_id, keyword, product_id) VALUES (?, ?, ?, ?)',
                    [mappingId, tenantId, keyword, productId]
                );
                created++;
                console.log(`[AutoMapping] + "${keyword}" -> ${productId}`);
            }
        } catch (err) {
            console.error(`[AutoMapping] Erro ao criar mapeamento "${keyword}":`, err.message);
        }
    }

    console.log(`[AutoMapping] ${created}/${variations.length} mapeamentos criados para "${productName}"`);
    return { created, total: variations.length, variations };
}

/**
 * Remove mapeamentos automáticos de um produto
 */
export async function removeAutoMappings(db, tenantId, productId) {
    try {
        const result = await db.run(
            'DELETE FROM product_mappings WHERE tenant_id = ? AND product_id = ?',
            [tenantId, productId]
        );
        console.log(`[AutoMapping] ${result.changes} mapeamentos removidos para produto ${productId}`);
        return result.changes;
    } catch (err) {
        console.error('[AutoMapping] Erro ao remover mapeamentos:', err.message);
        return 0;
    }
}

export default {
    generateMappingVariations,
    createAutoMappings,
    removeAutoMappings
};
