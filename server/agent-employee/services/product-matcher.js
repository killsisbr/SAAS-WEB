// ============================================================
// Agent Employee - Product Matcher
// Validação e busca de produtos no cardápio real
// ============================================================

const IGNORE_TERMS = ['brutus', 'burger', 'boa', 'noite', 'tarde', 'dia', 'ola', 'oi', 'quero', 'queria', 'pedir', 'pra', 'mim', 've', 'lanca', 'manda', 'favor', 'por', 'com', 'sem', 'de', 'mais', 'um', 'uma'];

export function findProduct(searchTerm, products) {
    if (!searchTerm || !products || products.length === 0) return null;

    const term = normalizeText(searchTerm);
    if (IGNORE_TERMS.includes(term) || term.length < 3) return null;

    const candidates = [];

    products.forEach(p => {
        const pNormalized = normalizeText(p.name);
        if (pNormalized === term) {
            candidates.push({ product: p, score: 100 });
        } else if (term.length >= 3 && pNormalized.includes(term)) {
            const score = pNormalized === term ? 90 : 80;
            candidates.push({ product: p, score });
        } else if (pNormalized.length > 3 && term.includes(pNormalized)) {
            candidates.push({ product: p, score: 70 });
        } else {
            if (pNormalized.replace(/\s+/g, '') === term.replace(/\s+/g, '')) {
                candidates.push({ product: p, score: 95 });
            }
        }
    });

    if (candidates.length > 0) {
        return candidates.sort((a, b) => {
            const typeA = a.product._type === 'product' ? 0 : 1;
            const typeB = b.product._type === 'product' ? 0 : 1;
            if (typeA !== typeB) return typeA - typeB;

            if (b.score !== a.score) return b.score - a.score;

            if (a.score === 70) {
                return b.product.name.length - a.product.name.length;
            }

            const aDefaults = a.product.name.toLowerCase().includes('lata') || a.product.name.toLowerCase().includes('simples') || a.product.name.toLowerCase().includes('tradicional') || a.product.name.toLowerCase().includes('porcao');
            const bDefaults = b.product.name.toLowerCase().includes('lata') || b.product.name.toLowerCase().includes('simples') || b.product.name.toLowerCase().includes('tradicional') || b.product.name.toLowerCase().includes('porcao');

            if (aDefaults && !bDefaults) return -1;
            if (bDefaults && !aDefaults) return 1;

            return a.product.name.length - b.product.name.length;
        })[0].product;
    }

    const searchWords = term.split(' ').filter(w => w.length > 3 && !IGNORE_TERMS.includes(w));
    for (const word of searchWords) {
        const match = products.find(p => normalizeText(p.name) === word && p._type === 'product');
        if (match) return match;
    }

    return null;
}

export function findProductsInMessage(message, products) {
    const results = [];

    // Pre-limpeza de noise words
    let msg = normalizeText(message);
    msg = msg.replace(/\baguas?\b/gi, 'agua');
    msg = msg.replace(/\bcocas?\b/gi, 'coca');
    msg = msg.replace(/\b(?:quero|queria|pedir|ola|oi|boa|noite|tarde|dia|moça|moca|amigo|ve|lança|lanca|manda|favor|por|mim|levar|pra|viagem|inicio|vontade|cardapio|olhando)\b/gi, ' ');
    msg = msg.trim().replace(/\s+/g, ' ');

    let originalMsgPadded = " " + msg + " ";

    const numberWords = {
        'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3,
        'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10
    };

    const sortedProducts = [...products].sort((a, b) => b.name.length - a.name.length);

    // Passo 1: Busca exata via Regex iterativo
    for (const product of sortedProducts) {
        let pName = normalizeText(product.name);
        if (pName.length < 3 && pName !== 'x') continue;

        let aliases = [pName];
        let comboMatch = pName.match(/^combo \d+/);
        if (comboMatch) aliases.push(comboMatch[0]);
        if (pName.startsWith('x ')) aliases.push(pName.replace(/^x /, 'x'));
        if (pName.includes('fritas') || pName.includes('batata')) {
            aliases.push('fritas');
            aliases.push('batata');
            aliases.push('porcao de batata');
        }
        if (pName.includes('coca cola lata')) aliases.push('coca lata');

        for (const alias of aliases) {
            const words = alias.split(/\s+/);
            let regexStrs = [];
            for (let i = 0; i < words.length; i++) {
                if (words[i] === 'x' && i < words.length - 1) {
                    regexStrs.push('x\\s*');
                } else {
                    regexStrs.push(words[i]);
                    if (i < words.length - 1) {
                        regexStrs.push('\\s+(?:com\\s+|e\\s+|de\\s+|\\+\\s+)?');
                    }
                }
            }
            let regexStr = regexStrs.join('');
            let pRegex = new RegExp(`(?:^|\\s)(${regexStr})(?:$|\\s|,)`, 'i');

            let match;
            while ((match = pRegex.exec(originalMsgPadded)) !== null) {
                let matchedText = match[1];
                let matchIndex = match.index;
                if (originalMsgPadded[matchIndex] === ' ') matchIndex++;

                const prefix = originalMsgPadded.substring(0, matchIndex).trim();
                const prefixWords = prefix.split(/\s+/);
                let q = 1;

                for (let i = prefixWords.length - 1; i >= Math.max(0, prefixWords.length - 4); i--) {
                    const w = prefixWords[i];
                    if (!w) continue;
                    let wClean = w.replace(/^x/i, '').replace(/x$/i, '');
                    let parsed = parseInt(wClean);
                    if (!isNaN(parsed) && parsed > 0 && parsed < 100) {
                        q = parsed;
                        prefixWords[i] = '';
                        break;
                    } else if (numberWords[w]) {
                        q = numberWords[w];
                        prefixWords[i] = '';
                        break;
                    }
                }

                const existing = results.find(r => r.product.id === product.id);
                if (!existing) {
                    results.push({ product, quantity: q });
                } else {
                    existing.quantity += q;
                }

                const reconstructPrefix = prefixWords.join(' ').replace(/\s+/g, ' ');
                const suffix = originalMsgPadded.substring(matchIndex + matchedText.length);
                originalMsgPadded = reconstructPrefix + " " + " ".repeat(matchedText.length) + " " + suffix;
                originalMsgPadded = originalMsgPadded.replace(/\s+/g, ' ');

                pRegex.lastIndex = 0;
            }
        }
    }

    msg = originalMsgPadded.trim();

    // Passo 2: Fallback Optional Quantity e Plurais
    const qtys = '10|[1-9]|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez';
    const pattern = new RegExp(`(?:^|\\s)(?:(${qtys})\\s*(?:x\\s*)?)?([a-z][a-z0-9\\s]*?)(?=\\s+(?:${qtys})\\b|\\s+e\\s+|\\s+com\\s+|\\s*,|$)`, 'gi');

    let match2;
    while ((match2 = pattern.exec(msg)) !== null) {
        let productName = match2[2].trim();
        productName = productName.replace(/^(a|o|as|os|um|uma)\s+/i, '');
        if (productName.length < 3 && productName !== 'x') continue;

        let quantity = 1;
        if (match2[1]) {
            let qText = match2[1].toLowerCase().replace(/^x/i, '').replace(/x$/i, '');
            let parsed = parseInt(qText);
            if (!isNaN(parsed)) quantity = parsed;
            else if (numberWords[qText]) quantity = numberWords[qText];
        }

        let product = findProduct(productName, products);
        if (!product) {
            product = findProduct(productName.replace(/\b([a-z]{3,})s\b/g, '$1'), products);
        }
        if (!product) {
            const noSpace = productName.replace(/\s+/g, '');
            product = findProduct(noSpace, products);
        }

        if (product && !results.some(r => r.product.id === product.id)) {
            results.push({ product, quantity });
            msg = msg.replace(match2[0], ' ');
            pattern.lastIndex = 0;
        }
    }

    // Passo 3: Default fallback for "coca"
    if (!results.some(r => r.product.name.toLowerCase().includes('coca'))) {
        if (msg.includes('coca')) {
            const coca = findProduct('coca lata', products) || findProduct('coca cola lata', products) || findProduct('coca', products);
            if (coca) {
                const cocaMatch = msg.match(/(\d+|um|uma|dois|duas|três|tres)\s*(?:x\s*)?coca/i);
                let q = 1;
                if (cocaMatch) {
                    let cClean = cocaMatch[1].replace(/^x/i, '').replace(/x$/i, '');
                    q = parseInt(cClean) || numberWords[cocaMatch[1].toLowerCase()] || 1;
                }
                results.push({ product: coca, quantity: q });
            }
        }
    }

    // Passo 4: Heurística Bruta para Observações (Blindagem sem IA)
    if (results.length > 0) {
        // Tenta achar "sem X" ou "com Y" globalmente na mensagem pura e anexar ao último item adicionado
        const obsMatch = message.toLowerCase().match(/\b((?:sem|com|menos|mais)\s+[a-zãõáéíóúâêôç]+(?:\s+e\s+[a-zãõáéíóúâêôç]+)?)\b/i);
        if (obsMatch) {
            const lastItem = results[results.length - 1];
            if (!lastItem.observation) {
                lastItem.observation = obsMatch[1].trim();
            }
        }
    }

    return results;
}

export function getSuggestions(searchTerm, products, limit = 3) {
    const term = normalizeText(searchTerm);
    const scored = products.map(p => {
        const name = normalizeText(p.name);
        let score = 0;
        const termWords = term.split(' ');
        const nameWords = name.split(' ');
        for (const tw of termWords) {
            for (const nw of nameWords) {
                if (nw.includes(tw) || tw.includes(nw)) score += 10;
            }
        }
        return { product: p, score };
    });
    return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.product);
}

export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_.,:]/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export default { findProduct, findProductsInMessage, getSuggestions, normalizeText };
