// ============================================================
// Menu Matcher - Busca Fuzzy no Cardapio
// Encontra produtos e adicionais por texto aproximado
// ============================================================

/**
 * Normalizar texto para comparacao
 */
function normalize(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .trim();
}

/**
 * Calcular distancia de Levenshtein
 */
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Calcular similaridade (0-1)
 */
function similarity(a, b) {
    const normA = normalize(a);
    const normB = normalize(b);
    const maxLen = Math.max(normA.length, normB.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(normA, normB) / maxLen;
}

/**
 * Verificar se texto contem query
 */
function containsQuery(text, query) {
    return normalize(text).includes(normalize(query));
}

/**
 * Encontrar produto no cardapio
 * @param {string} query - Texto de busca
 * @param {array} products - Lista de produtos
 * @param {number} threshold - Limiar de similaridade (0-1)
 * @returns {array} Produtos encontrados ordenados por relevancia
 */
export function findProduct(query, products, threshold = 0.5) {
    const normalizedQuery = normalize(query);
    const results = [];

    for (const product of products) {
        const name = normalize(product.name);

        // Verificar match exato ou contem
        if (name === normalizedQuery || containsQuery(product.name, query)) {
            results.push({
                product,
                score: 1,
                matchType: 'exact'
            });
            continue;
        }

        // Verificar cada palavra do nome
        const nameWords = name.split(/\s+/);
        const queryWords = normalizedQuery.split(/\s+/);

        let maxWordScore = 0;
        for (const nameWord of nameWords) {
            for (const queryWord of queryWords) {
                if (queryWord.length >= 3) {
                    const wordSim = similarity(nameWord, queryWord);
                    maxWordScore = Math.max(maxWordScore, wordSim);
                }
            }
        }

        // Similaridade geral
        const nameSim = similarity(product.name, query);
        const finalScore = Math.max(nameSim, maxWordScore);

        if (finalScore >= threshold) {
            results.push({
                product,
                score: finalScore,
                matchType: 'fuzzy'
            });
        }
    }

    // Ordenar por score descendente
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Encontrar categoria
 */
export function findCategory(query, categories, threshold = 0.5) {
    const results = [];

    for (const category of categories) {
        if (containsQuery(category.name, query)) {
            results.push({ category, score: 1 });
            continue;
        }

        const sim = similarity(category.name, query);
        if (sim >= threshold) {
            results.push({ category, score: sim });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}

/**
 * Encontrar addon/extra
 */
export function findAddon(query, addons, threshold = 0.5) {
    const results = [];

    for (const addon of addons) {
        if (containsQuery(addon.name, query)) {
            results.push({ addon, score: 1 });
            continue;
        }

        const sim = similarity(addon.name, query);
        if (sim >= threshold) {
            results.push({ addon, score: sim });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}

/**
 * Extrair quantidade do texto
 * Ex: "2 hamburgueres", "quero 3 cocas"
 */
export function extractQuantity(text) {
    const normalized = normalize(text);

    // Patterns para numeros
    const patterns = [
        /(\d+)\s*x?\s*\w+/,        // "2 hamburgueres" ou "2x hamburguer"
        /quero\s+(\d+)/,           // "quero 2"
        /(\d+)\s+unidades?/,       // "3 unidades"
        /me\s+da\s+(\d+)/,         // "me da 2"
        /(\d+)\s*$/                // numero no final
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    // Palavras para numeros
    const wordNumbers = {
        'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3,
        'quatro': 4, 'cinco': 5, 'seis': 6, 'meia': 0.5
    };

    for (const [word, num] of Object.entries(wordNumbers)) {
        if (normalized.includes(word)) {
            return num;
        }
    }

    return 1; // Default
}

/**
 * Detectar intencao basica do texto
 */
export function detectBasicIntent(text) {
    const normalized = normalize(text);

    const greetings = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'eai', 'e ai'];
    const addPhrases = ['quero', 'me da', 'manda', 'pedir', 'queria', 'vou querer', 'bota'];
    const removePhrases = ['tira', 'remove', 'cancela', 'nao quero'];
    const checkoutPhrases = ['fechar', 'finalizar', 'so isso', 'era isso', 'pode fechar', 'confirmar'];
    const viewCartPhrases = ['carrinho', 'pedido', 'o que tem', 'quanto ta', 'total'];
    const helpPhrases = ['ajuda', 'cardapio', 'menu', 'opcoes'];
    const cancelPhrases = ['cancelar', 'desistir', 'nao quero mais'];

    if (greetings.some(g => normalized.startsWith(g) || normalized === g)) {
        return 'greeting';
    }
    if (cancelPhrases.some(p => normalized.includes(p))) {
        return 'cancel';
    }
    if (checkoutPhrases.some(p => normalized.includes(p))) {
        return 'checkout';
    }
    if (viewCartPhrases.some(p => normalized.includes(p))) {
        return 'view_cart';
    }
    if (removePhrases.some(p => normalized.includes(p))) {
        return 'remove_item';
    }
    if (addPhrases.some(p => normalized.includes(p))) {
        return 'add_item';
    }
    if (helpPhrases.some(p => normalized.includes(p))) {
        return 'help';
    }

    return 'unknown';
}

export default {
    findProduct,
    findCategory,
    findAddon,
    extractQuantity,
    detectBasicIntent,
    normalize,
    similarity
};
