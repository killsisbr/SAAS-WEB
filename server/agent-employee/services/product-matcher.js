// ============================================================
// Agent Employee - Product Matcher
// Validação e busca de produtos no cardápio real
// ============================================================

const IGNORE_TERMS = ['brutus', 'burger', 'brutus burger', 'boa', 'noite', 'tarde', 'dia', 'olá', 'oi', 'quero', 'pedir'];

/**
 * Buscar produto por nome (fuzzy match)
 * @param {string} searchTerm - Termo de busca
 * @param {Array} products - Lista de produtos do tenant
 * @returns {Object|null} Produto encontrado ou null
 */
export function findProduct(searchTerm, products) {
    if (!searchTerm || !products || products.length === 0) {
        return null;
    }

    const term = normalizeText(searchTerm);

    // 0. Filtrar termos ignorados (saudações, nome da loja, verbos comuns)
    if (IGNORE_TERMS.includes(term) || term.length < 3) {
        return null;
    }

    const candidates = [];

    // 1. Match exato
    products.forEach(p => {
        if (normalizeText(p.name) === term) {
            candidates.push({ product: p, score: 100 });
        }
    });

    // 2. Match por inclusão
    products.forEach(p => {
        const pNormalized = normalizeText(p.name);
        if (term.length >= 3 && pNormalized.includes(term)) {
            // Se o termo for "bacon" e o produto for "x-bacon", score alto
            const score = pNormalized === term ? 90 : 80;
            candidates.push({ product: p, score });
        }
    });

    // 3. Match reverso (Ex: "x-tudo especial" -> "x-tudo")
    products.forEach(p => {
        const pNormalized = normalizeText(p.name);
        if (pNormalized.length > 3 && term.includes(pNormalized)) {
            candidates.push({ product: p, score: 70 });
        }
    });

    if (candidates.length > 0) {
        // Regras de Decisão:
        // 1. Priorizar PRODUTO sobre qualquer ADICIONAL/BUFFET
        // 2. Priorizar Match Exato
        // 3. Priorizar nomes mais longos (mais específicos)
        return candidates.sort((a, b) => {
            const typeA = a.product._type === 'product' ? 0 : 1;
            const typeB = b.product._type === 'product' ? 0 : 1;
            if (typeA !== typeB) return typeA - typeB;

            if (b.score !== a.score) return b.score - a.score;

            return b.product.name.length - a.product.name.length;
        })[0].product;
    }

    // 4. Match por palavras-chave (apenas se não houver candidatos estruturados)
    const searchWords = term.split(' ').filter(w => w.length > 3 && !IGNORE_TERMS.includes(w));
    for (const word of searchWords) {
        const match = products.find(p => normalizeText(p.name) === word && p._type === 'product');
        if (match) return match;
    }

    return null;
}

/**
 * Buscar múltiplos produtos em uma mensagem
 * @param {string} message - Mensagem do cliente
 * @param {Array} products - Lista de produtos
 * @returns {Array} Lista de {product, quantity}
 */
export function findProductsInMessage(message, products) {
    const results = [];
    const msg = normalizeText(message);
    let currentMsg = msg;

    // Regex não gulosa que para em novos números, fim da string ou delimitadores comuns
    // Grupo 1: Quantidade (dígitos ou extenso)
    // Grupo 2: Nome do produto (não guloso, para antes de delimitadores ou números)
    const patterns = [
        /(\d+)\s*(?:x\s*)?([a-z0-9à-ú\s.-]+?)(?=\s*(?:\d+|$)|(?:\s+e\s+|\s+,\s*|\s+com\s+|\s+sem\s+|\s+de\s+|\s+da\s+|\s+para\s+|\s+p\s+|\s+acompanhado\s+|\+))/gi,
        /(um|uma|dois|duas|três|tres|quatro|cinco)\s*(?:x\s*)?([a-z0-9à-ú\s.-]+?)(?=\s*(?:\d+|$)|(?:\s+e\s+|\s+,\s*|\s+com\s+|\s+sem\s+|\s+de\s+|\s+da\s+|\s+para\s+|\s+p\s+|\s+acompanhado\s+|\+))/gi
    ];

    const numberWords = {
        'um': 1, 'uma': 1,
        'dois': 2, 'duas': 2,
        'tres': 3, 'três': 3,
        'quatro': 4,
        'cinco': 5
    };

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(msg)) !== null) {
            let quantity = parseInt(match[1]);
            if (isNaN(quantity)) {
                quantity = numberWords[match[1].toLowerCase()] || 1;
            }

            let productName = match[2].trim();

            // Remover artigos comuns do início do nome (ex: "a coca" -> "coca")
            productName = productName.replace(/^(a|o|as|os|um|uma)\s+/i, '');

            if (productName.length < 2 || ['e', 'com', 'mais'].includes(productName)) continue;

            // Busca especial para itens começando com "X" (ajustando espaços)
            let product = findProduct(productName, products);

            // Tentar match sem espaços se falhar (ex: "x tudo" -> "xtudo")
            if (!product) {
                const noSpace = productName.replace(/\s+/g, '');
                product = findProduct(noSpace, products);
            }

            if (product && !results.some(r => r.product.id === product.id)) {
                results.push({ product, quantity });
                // "Consumir" o texto encontrado para não ser re-pareado no Step 3
                const matchedText = match[0];
                currentMsg = currentMsg.replace(matchedText, ' '.repeat(matchedText.length));
            }
        }
    }

    // 2. Especial: Tratar "coca" como "coca-cola" se não encontrar match direto
    if (!results.some(r => r.product.name.toLowerCase().includes('coca'))) {
        if (currentMsg.includes('coca')) {
            const coca = products.find(p => p.name.toLowerCase().includes('coca'));
            if (coca) {
                const cocaMatch = currentMsg.match(/(\d+|um|uma|dois|duas|três|tres)\s*(?:x\s*)?coca/i);
                let q = 1;
                if (cocaMatch) {
                    q = parseInt(cocaMatch[1]) || numberWords[cocaMatch[1].toLowerCase()] || 1;
                }
                results.push({ product: coca, quantity: q });
                currentMsg = currentMsg.replace(/coca/gi, '    ');
            }
        }
    }

    // 3. Match direto remanescente (Priorizando nomes mais longos para evitar subsumção)
    const sortedProducts = [...products].sort((a, b) => b.name.length - a.name.length);
    for (const product of sortedProducts) {
        const normalizedName = normalizeText(product.name);

        // Evitar adicionar se já foi encontrado pelo ID OU se for o mesmo TIPO e o nome já está contido
        const alreadyFound = results.some(r =>
            r.product.id === product.id ||
            (r.product._type === product._type && normalizeText(r.product.name).includes(normalizedName))
        );

        if (!alreadyFound && normalizedName.length > 3) {
            // Match exato de palavra ou contido na mensagem RESTANTE
            if (currentMsg.includes(normalizedName) || currentMsg.includes(normalizedName.replace(/\s+/g, ''))) {
                results.push({ product, quantity: 1 });
            }
        }
    }

    return results;
}

/**
 * Sugerir produtos similares
 * @param {string} searchTerm - Termo buscado
 * @param {Array} products - Lista de produtos
 * @param {number} limit - Máximo de sugestões
 * @returns {Array} Lista de produtos sugeridos
 */
export function getSuggestions(searchTerm, products, limit = 3) {
    const term = normalizeText(searchTerm);

    // Ordenar por similaridade (simples: quantas letras em comum)
    const scored = products.map(p => {
        const name = normalizeText(p.name);
        let score = 0;

        // Pontos por palavras em comum
        const termWords = term.split(' ');
        const nameWords = name.split(' ');

        for (const tw of termWords) {
            for (const nw of nameWords) {
                if (nw.includes(tw) || tw.includes(nw)) {
                    score += 10;
                }
            }
        }

        return { product: p, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.product);
}

/**
 * Normalizar texto para comparação
 */
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .trim();
}

export default {
    findProduct,
    findProductsInMessage,
    getSuggestions,
    normalizeText
};
