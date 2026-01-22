// ============================================================
// Direct Order Module - Mapping Service
// Gerencia mapeamentos de palavras-chave para produtos
// ============================================================

import { v4 as uuidv4 } from 'uuid';

// Cache de mapeamentos por tenant
const mappingsCache = new Map();
const CACHE_DURATION = 60000; // 1 minuto

/**
 * Normalizar texto para matching
 * Remove acentos, converte para minúsculas, remove pontuação
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[.,!?;:'"()]/g, '')    // Remove pontuação
        .replace(/[-]/g, ' ')             // Hífen vira espaço
        .replace(/\s+/g, ' ')             // Múltiplos espaços
        .trim();
}

/**
 * Obter mapeamentos do tenant (com cache)
 */
export async function getMappings(db, tenantId) {
    const cached = mappingsCache.get(tenantId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    try {
        const rows = await db.all(
            'SELECT keyword, product_id FROM product_mappings WHERE tenant_id = ?',
            [tenantId]
        );

        // Criar objeto de mapeamento: keyword → productId
        const mappings = {};
        for (const row of rows) {
            mappings[row.keyword] = row.product_id;
        }

        mappingsCache.set(tenantId, { data: mappings, timestamp: Date.now() });
        console.log(`[Mappings] Carregados ${Object.keys(mappings).length} mapeamentos para tenant ${tenantId}`);

        return mappings;
    } catch (err) {
        console.error('[Mappings] Erro ao carregar:', err.message);
        return {};
    }
}

/**
 * Adicionar mapeamento
 */
export async function addMapping(db, tenantId, keyword, productId) {
    const normalized = normalizeText(keyword);
    if (!normalized) return false;

    try {
        const id = uuidv4();
        await db.run(
            `INSERT OR REPLACE INTO product_mappings (id, tenant_id, keyword, product_id) 
             VALUES (?, ?, ?, ?)`,
            [id, tenantId, normalized, productId]
        );

        // Invalidar cache
        mappingsCache.delete(tenantId);
        console.log(`[Mappings] Adicionado: "${normalized}" → ${productId}`);
        return true;
    } catch (err) {
        console.error('[Mappings] Erro ao adicionar:', err.message);
        return false;
    }
}

/**
 * Adicionar múltiplos mapeamentos de uma vez
 */
export async function addMultipleMappings(db, tenantId, keywords, productId) {
    let count = 0;
    for (const keyword of keywords) {
        if (await addMapping(db, tenantId, keyword, productId)) {
            count++;
        }
    }
    return count;
}

/**
 * Remover mapeamento
 */
export async function removeMapping(db, tenantId, keyword) {
    const normalized = normalizeText(keyword);

    try {
        await db.run(
            'DELETE FROM product_mappings WHERE tenant_id = ? AND keyword = ?',
            [tenantId, normalized]
        );
        mappingsCache.delete(tenantId);
        return true;
    } catch (err) {
        console.error('[Mappings] Erro ao remover:', err.message);
        return false;
    }
}

/**
 * Obter mapeamentos de um produto específico
 */
export async function getMappingsByProduct(db, tenantId, productId) {
    try {
        const rows = await db.all(
            'SELECT keyword FROM product_mappings WHERE tenant_id = ? AND product_id = ?',
            [tenantId, productId]
        );
        return rows.map(r => r.keyword);
    } catch (err) {
        console.error('[Mappings] Erro:', err.message);
        return [];
    }
}

/**
 * Gerar mapeamentos automáticos do nome do produto
 * Inclui sinônimos inteligentes
 */
export function generateAutoMappings(productName) {
    const base = normalizeText(productName);
    if (!base) return [];

    const mappings = [base];
    const words = base.split(' ');

    // Adicionar palavras individuais (se tiver mais de 2 caracteres)
    for (const word of words) {
        if (word.length > 2 && !mappings.includes(word)) {
            mappings.push(word);
        }
    }

    // Adicionar combinações de 2 palavras
    if (words.length >= 2) {
        for (let i = 0; i < words.length - 1; i++) {
            const combo = `${words[i]} ${words[i + 1]}`;
            if (!mappings.includes(combo)) {
                mappings.push(combo);
            }
        }
    }

    // ========================================
    // SINÔNIMOS INTELIGENTES
    // ========================================
    const synonyms = generateSynonyms(base);
    for (const syn of synonyms) {
        if (!mappings.includes(syn)) {
            mappings.push(syn);
        }
    }

    return mappings;
}

/**
 * Gerar sinônimos para um texto
 */
function generateSynonyms(text) {
    const synonyms = [];

    // Mapa de sinônimos comuns
    const SYNONYM_MAP = {
        // Bebidas
        'coca cola': ['coca', 'cocacola', 'kok', 'koka'],
        'coca': ['coca cola', 'cocacola'],
        'guarana': ['guarana antarctica', 'antartica', 'antarct'],
        'fanta': ['fanta laranja'],
        'sprite': ['sprit'],

        // Tamanhos
        '2l': ['2 litros', '2litros', 'dois litros'],
        '1l': ['1 litro', '1litro', 'um litro'],
        '600ml': ['600', 'seiscentos'],
        'lata': ['latinha', 'lt'],

        // Lanches X-
        'x ': ['x-', 'xis '],
        'x-': ['x ', 'xis '],
        'xis': ['x', 'x-'],

        // Ingredientes comuns
        'hamburger': ['hamburguer', 'hamburgue', 'burger'],
        'hamburguer': ['hamburger', 'hamburgue', 'burger'],
        'bacon': ['baicon', 'baco', 'becon'],
        'queijo': ['qjo', 'mussarela'],
        'frango': ['chicken', 'galinha'],
        'calabresa': ['calabreza', 'lingui'],

        // Açaí
        'acai': ['açai', 'açaí', 'assai'],

        // Pizzas
        'mussarela': ['mucarela', 'mozarela', 'mozzarela', 'queijo'],
        'calabreza': ['calabresa'],
        'portuguesa': ['portuga'],
        'marguerita': ['margarita', 'margherita']
    };

    // Verificar cada chave do mapa
    for (const [key, values] of Object.entries(SYNONYM_MAP)) {
        if (text.includes(key)) {
            for (const value of values) {
                const synonym = text.replace(key, value);
                if (synonym !== text && !synonyms.includes(synonym)) {
                    synonyms.push(synonym);
                }
            }
        }
    }

    // Gerar variações com/sem hífen para X-lanches
    if (text.startsWith('x ')) {
        synonyms.push(text.replace('x ', 'x-'));
    }
    if (text.startsWith('x-')) {
        synonyms.push(text.replace('x-', 'x '));
    }

    return synonyms;
}

/**
 * Encontrar produto por texto usando mapeamentos
 * Retorna { productId, matchedKeyword, words } ou null
 */
export async function findProductByText(db, tenantId, text, products = []) {
    const mappings = await getMappings(db, tenantId);
    const normalized = normalizeText(text);
    const words = normalized.split(' ');

    // Tentar combinações de 4 até 1 palavra (mais específico primeiro)
    for (let size = Math.min(4, words.length); size >= 1; size--) {
        for (let i = 0; i <= words.length - size; i++) {
            const combo = words.slice(i, i + size).join(' ');

            if (mappings[combo]) {
                return {
                    productId: mappings[combo],
                    matchedKeyword: combo,
                    startIndex: i,
                    wordCount: size
                };
            }
        }
    }

    // Fallback: busca fuzzy no nome dos produtos
    if (products && products.length > 0) {
        for (const product of products) {
            const productNorm = normalizeText(product.name);
            if (normalized.includes(productNorm) || productNorm.includes(normalized)) {
                return {
                    productId: product.id,
                    matchedKeyword: productNorm,
                    startIndex: 0,
                    wordCount: normalized.split(' ').length
                };
            }
        }
    }

    return null;
}

/**
 * Limpar cache de um tenant
 */
export function clearCache(tenantId) {
    mappingsCache.delete(tenantId);
}

export default {
    normalizeText,
    getMappings,
    addMapping,
    addMultipleMappings,
    removeMapping,
    getMappingsByProduct,
    generateAutoMappings,
    findProductByText,
    clearCache
};
