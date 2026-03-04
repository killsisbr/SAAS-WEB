// ============================================================
// Agent Employee - Product Matcher (DEFINITIVE v20 - THE APEX)
// ============================================================

export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/([0-9]+)x\b/gi, '$1 ') // Corrigir '2x'
        .replace(/([0-9]+)([a-z]+)/gi, '$1 $2')
        .replace(/([a-z]+)([0-9]+)/gi, '$1 $2')
        .replace(/[-_.,:;!?( )]/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        // Typos comuns
        .replace(/\bxis\b/g, 'x')
        .replace(/\bepecial\b/g, 'especial')
        .replace(/\bepeciais\b/g, 'especial')
        .trim();
}

function handleCommonTypos(text) {
    return text
        .replace(/\bepecial\b/gi, 'especial')
        .replace(/\bepeciais\b/gi, 'especial')
        .replace(/\bepeci(al|ais)\b/gi, 'especial')
        .replace(/\btudo\b/gi, 'tudo')
        .replace(/\bburger\b/gi, 'burger')
        .replace(/\bburguer\b/gi, 'burger')
        .replace(/\bburgue\b/gi, 'burger');
}

const numberWords = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3,
    'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10
};

export function findProduct(searchTerm, products, lastCategoryId = null) {
    if (!searchTerm || !products) return null;
    const term = normalizeText(searchTerm);
    if (term.length < 2 || ['300', '500', '700', 'com', 'sem', 'de', 'da', 'do', 'e'].includes(term)) return null;

    const scored = products.map(p => {
        const pN = normalizeText(p.name);
        let score = 0;
        if (pN === term) score = 100;
        else if (pN.split(' ').includes(term)) score = 90;
        else if (pN.includes(term)) score = 80;

        // Afinidade de categoria para desempate
        if (score > 0 && lastCategoryId && p.category_id === lastCategoryId) score += 5;

        // Se score ainda for 0, testar se TODAS as palavras buscadas estão contidas no nome do produto
        // Ex: termo "coca lata", produto "coca cola lata". As palavras "coca" e "lata" estão presentes.
        if (score === 0) {
            const termWords = term.split(' ').filter(w => w.length > 2 || w.match(/^\d+$/));
            if (termWords.length > 1) {
                const pWords = pN.split(' ');
                let allPresent = true;
                for (const tw of termWords) {
                    if (pWords.includes(tw)) continue;
                    if (tw.length >= 4 && pWords.some(pw => pw.startsWith(tw))) continue;
                    if (tw.match(/^\d+$/) && pWords.some(pw => pw.includes(tw))) continue;
                    allPresent = false;
                    break;
                }
                if (allPresent) score = 85;
            }
        }

        // Adicionar threshold mínimo rigoroso para evitar matches de puro ruído
        if (score < 70) score = 0;

        if (score < 85 && term.length >= 3) {
            const tSet = new Set(term);
            const pSet = new Set(pN);
            let inter = 0;
            for (let c of tSet) if (pSet.has(c)) inter++;
            const sim = inter / Math.max(tSet.size, pSet.size);
            if (sim >= 0.7 && Math.abs(term.length - pN.length) <= 3) score = Math.max(score, 75);
        }
        return { product: p, score };
    }).filter(s => s.score >= 75).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Tie break by difference in length relative to the search term
        const diffA = Math.abs(a.product.name.length - term.length);
        const diffB = Math.abs(b.product.name.length - term.length);
        return diffA - diffB;
    });

    return scored.length > 0 ? scored[0].product : null;
}

export function findProductsInMessage(message, products, addons = []) {
    const raw = normalizeText(message);
    let working = " " + raw + " ";

    // Passo 0: Sinônimos Cirúrgicos (evita milk milk shake) e Palavras Ignoradas
    const ignoredWords = ['por favor', 'pfv', 'pf', 'quero', 'querer', 'gostaria', 'manda', 'mandarem', 've', 'obrigado', 'obrigada', 'vlw', 'valeu', 'moça', 'moço', 'amigo', 'amiga', 'bom dia', 'boa tarde', 'boa noite', 'ola', 'olá', 'oi', 'opa', 'eae', 'eai', 'entao', 'então', 'vou', 'pra', 'para', 'pro', 'me', 'muito', 'muita', 'eu', 'demora', 'pedir', 'voces', 'estava', 'fiquei', 'vontade', 'olhando', 'cardapio', 'cardápio', 'um', 'uma', 'uns', 'umas', 'no', 'na', 'nos', 'nas', 'esse', 'essa', 'isso', 'dele', 'dela', 'deles', 'delas', 'preciso', 'envia', 'traz', 'traga', 'obg', 'dia', 'tarde', 'noite', 'bom', 'boa'];
    let ignoredRegex = new RegExp(`\\b(?:${ignoredWords.join('|')})\\b`, 'gi');
    working = working.replace(ignoredRegex, ' ');

    working = working.replace(/\b(?:milk\s+)?shakings?\b/gi, ' milk shake ');
    working = working.replace(/\b(?:milk\s+)?shakes?\b/gi, ' milk shake ');
    working = working.replace(/\b(?!milk\s)shaking\b/gi, ' milk shake '); // Fallback extra

    working = working.replace(/\bmonstros?\b/gi, ' monster ');
    working = working.replace(/\bmstr\b/gi, ' monster ');
    working = working.replace(/\bcocas?\b(?!\s*(?:de\s+)?(?:lata|2\s*l|litros?|zero|cola))/gi, ' coca lata ');
    working = working.replace(/\bassais?\b/gi, ' acai ');
    working = working.replace(/\btbm\b/gi, ' e ');
    working = working.replace(/\s+/g, ' ');

    const results = [];
    const sortedProducts = [...products].sort((a, b) => b.name.length - a.name.length);
    const qtysStr = '(?:\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';

    // Step 1: Rigorous Scan
    for (const p of sortedProducts) {
        const pN = normalizeText(p.name);
        const aliases = [pN];
        if (pN.startsWith('copo ')) aliases.push(pN.replace('copo ', ''));
        if (pN.includes('milk shake')) aliases.push(pN.replace('milk shake', 'shake').trim());
        if (pN.includes('coca cola')) aliases.push(pN.replace('coca cola', 'coca').trim());
        if (pN.match(/\bcoca\b(?!\scola)/)) aliases.push(pN.replace(/\bcoca\b/, 'coca lata').trim());

        aliases.sort((a, b) => b.length - a.length);

        for (let alias of aliases) {
            if (alias.match(/^[0-9]+(?:\s*ml)?$/)) continue;

            let regexStr = alias.split(' ').join('\\s*(?:(?:de|da|do|com|sem|e)\\s+)?');
            if (regexStr.match(/\s*(?:500|300|700)$/)) {
                // Se termina em número (ex: 500), o 'ml' e sua preposição são opcionais JUNTOS.
                regexStr += '(?:\\s*(?:(?:de|da|do|com|sem|e)\\s+)?ml)?';
            } else if (regexStr.match(/ml$/)) {
                // Se o alias já tem ml (ex: "acai 500 ml"), tornamos o bloco de ' ml' opcional no fim.
                const mlPart = '\\s*(?:(?:de|da|do|com|sem|e)\\s+)?ml$';
                const mlRegex = new RegExp(mlPart);
                if (regexStr.match(mlRegex)) {
                    regexStr = regexStr.replace(mlRegex, '(?:\\s*(?:(?:de|da|do|com|sem|e)\\s+)?ml)?');
                } else {
                    regexStr = regexStr.replace(/ml$/, '(?:\\s*ml)?');
                }
            }
            regexStr = regexStr.replace(/([a-z]{3,})\b/g, '$1s?');

            const pRegex = new RegExp(`(?:^|\\s)(?:(${qtysStr})\\s+(?:de\\s+)?)?(${regexStr})(?=\\s|$)`, 'i');
            let m;
            while ((m = working.match(pRegex)) !== null) {
                const matchIdx = m.index;
                let q = 1;
                if (m[1]) q = parseInt(m[1]) || numberWords[m[1].toLowerCase()] || 1;

                results.push({ product: p, quantity: q, addons: [], index: matchIdx, length: m[0].length });
                working = working.substring(0, matchIdx) + ' '.repeat(m[0].length) + working.substring(matchIdx + m[0].length);
            }
        }
    }



    const sizeRegex = /(?:\b)(?:(\d+|um|uma|dois|duas)\s+)?(?:de\s+)?([0-9]{3})(?:ml)?\b/gi;
    let sMatch;
    while ((sMatch = sizeRegex.exec(working)) !== null) {
        const size = sMatch[2].trim();
        const lastProd = results.slice().sort((a, b) => a.index - b.index).reverse().find(r => r.index < sMatch.index);
        const catId = lastProd ? lastProd.product.category_id : null;

        if (catId) {
            const sibling = products.find(prod => prod.category_id === catId && normalizeText(prod.name).includes(size));
            if (sibling) {
                let q = 1;
                if (sMatch[1]) q = parseInt(sMatch[1]) || numberWords[sMatch[1].toLowerCase()] || 1;

                // Pegar o index real do match
                const actualMatchIdx = sMatch.index;
                const actualMatchLen = sMatch[0].length;

                results.push({ product: sibling, quantity: q, addons: [], index: actualMatchIdx, length: actualMatchLen });
                working = working.substring(0, actualMatchIdx) + ' '.repeat(actualMatchLen) + working.substring(actualMatchIdx + actualMatchLen);
                sizeRegex.lastIndex = 0;
            }
        }
    }



    // Step 3: Addons
    let sortedRes = results.sort((a, b) => a.index - b.index);
    for (let i = 0; i < sortedRes.length; i++) {
        const curr = sortedRes[i];
        const nextIdx = (i < sortedRes.length - 1) ? sortedRes[i + 1].index : working.length;
        const scanStart = curr.index + curr.length;
        const scanEnd = Math.min(nextIdx, scanStart + 120);
        const fragment = working.substring(scanStart, scanEnd);

        if (addons.length > 0) {
            const sortedAddons = [...addons].sort((a, b) => b.name.length - a.name.length);
            for (const addon of sortedAddons) {
                const aN = normalizeText(addon.name);
                // Match exato ou inclui
                if (fragment.includes(aN)) {
                    curr.addons.push(addon);
                    // Clear the matched addon from working string
                    const aRegex = new RegExp(`(?:^|\\s)(?:com|e|extra|adicional|sem)?\\s*(${aN})s?(?:$|\\s)`, 'i');
                    const aMatch = fragment.match(aRegex);
                    if (aMatch) {
                        const globalAIdx = scanStart + aMatch.index;
                        working = working.substring(0, globalAIdx) + ' '.repeat(aMatch[0].length) + working.substring(globalAIdx + aMatch[0].length);
                    }
                    continue;
                }
                // Fuzzy match para adicionais (ex: nutela -> nutella)
                if (aN.length >= 4) {
                    const words = fragment.split(' ');
                    for (const w of words) {
                        if (w.length < 4) continue;
                        // Jaccard simples para a palavra do fragment vs addon
                        const s1 = new Set(w);
                        const s2 = new Set(aN);
                        let inter = 0;
                        for (const char of s1) if (s2.has(char)) inter++;
                        const score = (inter * 200) / (s1.size + s2.size);
                        if (score > 80) {
                            curr.addons.push(addon);
                            // Clear the matched addon from working string
                            const aRegex = new RegExp(`(?:^|\\s)(?:com|e|extra|adicional|sem)?\\s*(${w})s?(?:$|\\s)`, 'i'); // Use 'w' for clearing
                            const aMatch = fragment.match(aRegex);
                            if (aMatch) {
                                const globalAIdx = scanStart + aMatch.index;
                                working = working.substring(0, globalAIdx) + ' '.repeat(aMatch[0].length) + working.substring(globalAIdx + aMatch[0].length);
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    // Step 4: Generic Fallback (Index-aware) - Multi-word attempt
    const words = working.split(/\s+/).filter(w => w.trim().length > 0);
    for (let w = 0; w < words.length; w++) {
        // Tentar janelas de 3, 2 e 1 palavra(s)
        for (let windowSize = 3; windowSize >= 1; windowSize--) {
            if (w + windowSize <= words.length) {
                const phrase = words.slice(w, w + windowSize).join(' ');

                // Pular se a frase for vazia ou menor que 3 chars
                if (phrase.length < 3) continue;

                // Checar se a frase tem um prefixo de quantidade
                let q = 1;
                let searchPhrase = phrase;
                const firstWord = words[w];
                const isQty = firstWord.match(/^\d+$/) || numberWords[firstWord.toLowerCase()];

                if (isQty && windowSize > 1) {
                    q = parseInt(firstWord) || numberWords[firstWord.toLowerCase()] || 1;
                    searchPhrase = words.slice(w + 1, w + windowSize).join(' ');
                } else if (isQty && windowSize === 1) {
                    continue; // Se é só uma quantidade isolada, pula
                }

                if (searchPhrase.length < 3) continue;

                // Restrição severa: palavras pequenas não podem dar fallback genérico em produtos não relacionados
                const lastCat = sortedRes.length > 0 ? sortedRes[sortedRes.length - 1].product.category_id : null;
                const found = findProduct(searchPhrase, products, lastCat);
                if (found) {
                    // Evitar que palavras muito genéricas deem match (ex: 'com' não deve dar match em 'Combo')
                    if (searchPhrase.length <= 3 && !normalizeText(found.name).split(' ').includes(searchPhrase)) {
                        continue;
                    }

                    // Localizar a string exata em `working` para pegar o index
                    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
                    const matchRegex = new RegExp(`(?:^|\\s)(${escapeRegex(phrase)})(?:\\s|$)`, 'i');
                    const gm = working.match(matchRegex);
                    if (gm) {
                        const matchIdx = gm.index + gm[0].indexOf(gm[1]);
                        sortedRes.push({ product: found, quantity: q, addons: [], index: matchIdx, length: gm[1].length });
                        working = working.substring(0, matchIdx) + ' '.repeat(gm[1].length) + working.substring(matchIdx + gm[1].length);
                        words.splice(w, windowSize, ...Array(windowSize).fill(' ')); // Invalidar no array
                        w += windowSize - 1; // Pular as palavras
                        break; // Janela encontrada, break out do loop de janelas
                    }
                }
            }
        }
    }

    // Final Unique Position Filter
    const unique = [];
    const positions = new Set();
    for (const r of sortedRes.sort((a, b) => a.index - b.index)) {
        if (!positions.has(r.index)) {
            unique.push(r);
            positions.add(r.index);
        }
    }

    return unique.map(({ index, length, ...rest }) => rest);
}

export function getSuggestions(searchTerm, products, limit = 3) {
    const term = normalizeText(searchTerm);
    return products.map(p => ({ product: p, score: normalizeText(p.name).includes(term) ? 10 : 0 }))
        .sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.product);
}
