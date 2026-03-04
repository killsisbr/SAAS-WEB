// ============================================================
// Direct Order Module - Word Analyzer (Enhanced Version)
// Analisador de palavras-chave com suporte a:
// - Múltiplos produtos na mesma mensagem
// - Modificadores (sem/com/mais)
// - Sinônimos inteligentes
// - Detecção de Ambiguidade
// ============================================================

import { NUMBER_MAP, INTENT_KEYWORDS } from '../config.js';
import { findProductByText, normalizeText, getMappings } from '../services/mapping-service.js';
import { getIgnoredWords, getSynonyms } from '../services/auto-improve-service.js';
import fs from 'fs';

// Separadores de itens na mensagem
const ITEM_SEPARATORS = ['e', 'mais', '+', ',', 'tambem', 'também'];

// Modificadores que alteram produtos
const MODIFIERS = {
    REMOVE: ['sem', 'tira', 'tirar', 'remover', 'menos'],
    ADD: ['com', 'mais', 'adicional', 'extra', 'bastante'],
    PREPARATION: ['mal', 'malpassado', 'ao ponto', 'bem passado', 'bempassado']
};

// Palavras que NUNCA devem ser consideradas para match de produtos
const BASE_IGNORED_WORDS = [
    'bom', 'boa', 'dia', 'tarde', 'noite', 'oi', 'ola', 'olá', 'opa', 'eae', 'eai',
    'obrigado', 'obrigada', 'vlw', 'valeu', 'muito', 'obg',
    'quero', 'gostaria', 'por', 'favor', 'pfv', 'pf', 'por favor',
    'me', 've', 'manda', 'envia', 'traz', 'traga', 'preciso',
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'pra', 'para', 'pro', 'no', 'na', 'nos', 'nas', 'esse', 'essa', 'isso',
    'dele', 'dela', 'deles', 'delas'
];

// Ingredientes conhecidos
const KNOWN_INGREDIENTS = [
    'bacon', 'baicon', 'baco', 'queijo', 'cheddar', 'catupiry',
    'salada', 'tomate', 'cebola', 'alface', 'picles', 'ovo',
    'hamburguer', 'frango', 'calabresa', 'milho', 'ervilha',
    'maionese', 'ketchup', 'mostarda', 'molho',
    'batata', 'onion', 'pao', 'pão', 'burguer', 'hamburguer',
    'feijao', 'feijão', 'arroz', 'farofa', 'macarrao', 'macarrão',
    'fritas', 'pure', 'purê', 'couve', 'vinagrete', 'bife', 'carne'
];

// Categorias de medidas exclusivas
const EXCLUSIVE_MEASURES = {
    VOLUME: [
        ['2l', '2 litros', '2lts', '2litros'],
        ['1.5l', '1.5 litros', '1.5'],
        ['1l', '1 litro', '1000ml', '1litro'],
        ['600ml', '600'],
        ['350ml', '350', 'lata', 'latinha'],
        ['290ml', '290', 'ks'],
        ['250ml', '250', 'caculinha', 'caçulinha'],
        ['200ml', '200']
    ],
    SIZE: [
        ['p', 'pequeno', 'pequena'],
        ['m', 'media', 'medio', 'media'],
        ['g', 'grande', 'gigante'],
        ['gg', 'extra grande', 'familia', 'gigante']
    ]
};

/**
 * Detectar o grupo de uma medida em um texto
 */
function findMeasureGroup(text) {
    if (!text) return null;
    const norm = normalizeText(text);

    const validVolumePatterns = /^(\d+\.?\d*)(l|litro|litros|lts|ml)$/i;

    for (const [category, groups] of Object.entries(EXCLUSIVE_MEASURES)) {
        for (let i = 0; i < groups.length; i++) {
            for (const variant of groups[i]) {
                if (norm === variant) return { category, index: i };
                if (category === 'SIZE') continue;
                if (category === 'VOLUME' && validVolumePatterns.test(norm)) {
                    if (variant === norm || norm.includes(variant.replace(/\s/g, ''))) {
                        return { category, index: i };
                    }
                }
                if (variant.length >= 5 && (norm.includes(variant) || variant.includes(norm)) && norm.length >= 4) {
                    return { category, index: i };
                }
            }
        }
    }
    return null;
}

/**
 * Tokenizar mensagem
 */
export function tokenize(message) {
    return message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
        .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
        .replace(/[.,!?;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(word => word.length > 0);
}

/**
 * Extrair quantidade
 */
export function extractQuantityAt(words, position) {
    if (position > 0) {
        const prev = words[position - 1].toLowerCase();
        if (NUMBER_MAP[prev]) return NUMBER_MAP[prev];
        const num = parseInt(prev);
        if (!isNaN(num) && num > 0 && num <= 50) return num;
    }
    return null;
}

export function extractQuantity(words) {
    for (const word of words) {
        if (NUMBER_MAP[word]) return NUMBER_MAP[word];
        const num = parseInt(word);
        if (!isNaN(num) && num > 0 && num <= 50) return num;
    }
    return null;
}

/**
 * Verificar intenção
 */
export function matchesIntent(words, keywords) {
    const normalizedKeywords = keywords.map(k =>
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    // 1. Match exato de palavra
    if (words.some(word => normalizedKeywords.includes(word))) return true;
    const fullMsg = words.join(' ');
    // 2. Match de substring (para keywords compostas)
    if (normalizedKeywords.some(k => k.length > 3 && fullMsg.includes(k))) return true;
    // 3. Match fuzzy curto (typos como "canela" -> "cancela")
    for (const word of words) {
        if (word.length < 5) continue; // Palavras muito curtas não fuzzy
        for (const kw of normalizedKeywords) {
            if (kw.length < 5) continue; // Keywords muito curtas não fuzzy

            // Se a diferença de tamanho for grande, ignora (evita "tira" em "marmita")
            if (Math.abs(word.length - kw.length) > 2) continue;

            // Jaccard simples
            const s1 = new Set(word);
            const s2 = new Set(kw);
            let inter = 0;
            for (const char of s1) if (s2.has(char)) inter++;
            const score = (inter * 200) / (s1.size + s2.size);

            if (score > 90) return true;
        }
    }
    return false;
}

/**
 * Extrair modificadores
 */
export function extractModifiers(words, processedIndices, allAddons = []) {
    const result = { additions: [], removals: [], preparation: null, foundAddons: [] };
    const indices = processedIndices || new Set();

    for (let i = 0; i < words.length; i++) {
        if (indices.has(i)) continue;
        const word = words[i];
        const next = words[i + 1] || '';

        if (word === 'mal' || word === 'malpassado') {
            result.preparation = 'mal passado';
            indices.add(i);
            continue;
        } else if (word === 'ao' && next === 'ponto') {
            result.preparation = 'ao ponto';
            indices.add(i); indices.add(i + 1);
            i++; continue;
        } else if (word === 'bem' && (next === 'passado' || next === 'passada')) {
            result.preparation = 'bem passado';
            indices.add(i); indices.add(i + 1);
            i++; continue;
        }

        if (MODIFIERS.REMOVE.includes(word) && next) {
            result.removals.push(next);
            indices.add(i); indices.add(i + 1);
            i++; continue;
        }

        if (MODIFIERS.ADD.includes(word) && next) {
            let matchedAddon = null;
            let matchLength = 0;
            if (allAddons.length > 0) {
                for (let len = 3; len >= 1; len--) {
                    if (i + 1 + len > words.length) continue;
                    const comboText = normalizeText(words.slice(i + 1, i + 1 + len).join(' '));
                    const found = allAddons.find(a => normalizeText(a.name) === comboText || normalizeText(a.name).includes(comboText));
                    if (found) { matchedAddon = found; matchLength = len; break; }
                }
            }
            if (matchedAddon) {
                result.foundAddons.push(matchedAddon);
                indices.add(i);
                for (let k = 1; k <= matchLength; k++) indices.add(i + k);
                i += matchLength;
            } else if (KNOWN_INGREDIENTS.includes(next) || next.length > 2) {
                result.additions.push(next);
                indices.add(i); indices.add(i + 1);
                i++;
            }
        }
    }
    return result;
}

export function formatModifiersAsNotes(modifiers) {
    const parts = [];
    if (modifiers.removals.length > 0) parts.push(`sem ${modifiers.removals.join(', ')}`);
    if (modifiers.additions.length > 0) parts.push(`com ${modifiers.additions.join(', ')}`);
    if (modifiers.preparation) parts.push(modifiers.preparation);
    return parts.join(', ');
}

export function splitIntoSegments(message) {
    let normalized = normalizeText(message);
    for (const sep of ITEM_SEPARATORS) {
        const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\s+${escapedSep}\\s+`, 'gi');
        normalized = normalized.replace(regex, ' |SEP| ');
    }
    return normalized.split('|SEP|').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Encontrar TODOS os produtos em uma mensagem
 */
export async function findAllProducts(message, products, db, tenantId, allAddons = []) {
    const foundProducts = [];
    const segments = splitIntoSegments(message);
    let ignoredWordsSet = new Set(BASE_IGNORED_WORDS);
    let synonymsMap = new Map();

    if (db && tenantId) {
        try {
            const tenantIgnored = await getIgnoredWords(db, tenantId);
            tenantIgnored.forEach(w => ignoredWordsSet.add(w));
            synonymsMap = await getSynonyms(db, tenantId);
        } catch (err) { }
    }

    for (const segment of segments) {
        const words = tokenize(segment);
        if (words.length === 0) continue;
        const processedIndices = new Set();
        const modifiers = extractModifiers(words, processedIndices, allAddons);

        for (const addon of modifiers.foundAddons) {
            foundProducts.push({ product: addon, quantity: 1, notes: '', matchedKeyword: addon.name, type: 'addon' });
        }

        const notesFromModifiers = formatModifiersAsNotes(modifiers);
        const mappings = db ? await getMappings(db, tenantId) : {};

        for (let i = 0; i < words.length; i++) {
            if (processedIndices.has(i)) continue;

            // SÓ INICIAR busca se a palavra não for ignorada ou se for um número
            const word = words[i];
            if (ignoredWordsSet.has(word) && !/^\d+$/.test(word)) continue;

            let bestMatch = null;
            let matchLength = 0;

            for (let len = 4; len >= 1; len--) {
                if (i + len > words.length) continue;
                const comboWords = words.slice(i, i + len);
                const normCombo = normalizeText(comboWords.join(' '));
                const nonIgnoredWords = comboWords.filter(w => !ignoredWordsSet.has(w));
                if (nonIgnoredWords.length === 0) continue;

                let match = null;
                if (synonymsMap.has(normCombo)) {
                    match = { productId: synonymsMap.get(normCombo), matchedKeyword: normCombo + ' (sinônimo)' };
                } else if (mappings[normCombo]) {
                    match = { productId: mappings[normCombo], matchedKeyword: normCombo };
                } else {
                    const fuzzyResult = findProductFuzzy(comboWords, products, true, ignoredWordsSet);
                    if (fuzzyResult) {
                        const fp = fuzzyResult.product;
                        match = {
                            productId: fp.id,
                            matchedKeyword: fp.name,
                            isAmbiguous: !!fuzzyResult.isAmbiguous,
                            candidates: fuzzyResult.candidates || [fp]
                        };
                    }
                }

                if (match) {
                    const remaining = words.slice(i + len);
                    let hasUnmappedVolume = false;
                    for (let k = 0; k < remaining.length; k++) {
                        const rw = remaining[k];
                        const rcombo = (rw + (remaining[k + 1] || '')).toLowerCase().replace(/\s/g, '');
                        if (/^(\d+\.?\d*)(l|litro|litros|lts|ml)$/i.test(rw) || /^(\d+\.?\d*)(l|litro|litros|lts|ml)$/i.test(rcombo)) {
                            const p = products.find(p => p.id === match.productId);
                            if (p && !normalizeText(p.name).includes(rw) && !normalizeText(p.name).includes(rcombo)) {
                                hasUnmappedVolume = true; break;
                            }
                        }
                    }
                    if (hasUnmappedVolume) continue;
                    bestMatch = match; matchLength = len; break;
                }
            }

            if (bestMatch) {
                const product = products.find(p => p.id === bestMatch.productId);
                if (product) {
                    let quantity = 1;
                    const prevIdx = i - 1;
                    if (prevIdx >= 0 && !processedIndices.has(prevIdx)) {
                        const q = extractQuantity([words[prevIdx]]);
                        if (q) { quantity = q; processedIndices.add(prevIdx); }
                    }
                    if (quantity === 1 && matchLength > 1) {
                        const q = extractQuantity([words[i]]);
                        if (q) quantity = q;
                    }
                    foundProducts.push({
                        product, quantity, notes: notesFromModifiers,
                        matchedKeyword: bestMatch.matchedKeyword, type: 'product',
                        isAmbiguous: !!bestMatch.isAmbiguous,
                        candidates: bestMatch.candidates || [product]
                    });
                    for (let k = 0; k < matchLength; k++) processedIndices.add(i + k);
                }
            }
        }

        const unconsumed = words.filter((_, idx) => !processedIndices.has(idx) && !ignoredWordsSet.has(words[idx]));
        if (unconsumed.length > 0 && foundProducts.length > 0) {
            const rawNote = unconsumed.filter(w => !['quero', 'gostaria', 'me', 've', 'uma', 'um', 'uns', 'umas', 'por', 'favor', 'para', 'com', 'sem', 'e', 'mais'].includes(w)).join(' ').trim();
            if (rawNote.length >= 3 && !/^\d+$/.test(rawNote)) {
                const last = foundProducts.filter(p => p.type === 'product').pop();
                if (last) { last.notes = (last.notes ? last.notes + ', ' : '') + rawNote; }
            }
        }
    }
    return foundProducts;
}

/**
 * Fuzzy Match System
 */
export function findProductFuzzy(words, products, isStrict = false, ignoredWordsSet = null) {
    const ignoredSet = ignoredWordsSet || new Set(BASE_IGNORED_WORDS);
    const textOriginal = words.join(' ');
    // Filtrar palavras ignoradas do input para conferência real
    const relevantInputWords = words.filter(w => !ignoredSet.has(w));
    if (relevantInputWords.length === 0) return null;

    const criticalKeywords = ['2l', 'litros', 'lata', '350', '600', '1.5', 'ks'];

    const measuresInInput = [];
    for (let j = 0; j < words.length; j++) {
        const m1 = findMeasureGroup(words[j]);
        if (m1) measuresInInput.push(m1);
        const m2 = findMeasureGroup((words[j] + (words[j + 1] || '')).toLowerCase());
        if (m2) { measuresInInput.push(m2); j++; }
    }

    let maxScore = 0;
    let bestMatch = null;
    const candidatesWithScores = [];
    const threshold = isStrict ? 25 : 15;

    for (const product of products) {
        const productName = normalizeText(product.name);
        const productWords = productName.split(/\s+/).filter(w => !ignoredSet.has(w));
        let score = 0;

        // Conflito de medidas
        let hasConflict = false;
        const measuresInProduct = productWords.map(findMeasureGroup).filter(m => m !== null);
        for (const inputM of measuresInInput) {
            if (measuresInProduct.find(pm => pm.category === inputM.category && pm.index !== inputM.index)) {
                hasConflict = true; break;
            }
        }
        if (hasConflict) score -= 100;

        if (textOriginal === productName || textOriginal.replace(/\s/g, '') === productName.replace(/\s/g, '')) {
            score = 100;
        } else {
            let matchedCount = 0;

            for (const w of words) {
                if (ignoredSet.has(w)) continue;
                const isCritical = criticalKeywords.some(k => w.includes(k));
                let found = false;

                // Fuzzy Match individual
                if (w.length <= 3) {
                    found = productWords.some(pw => pw === w);
                } else {
                    found = productWords.some(pw => pw === w || w.includes(pw) && pw.length >= 3 || (pw.startsWith(w) && w.length / pw.length >= 0.7));
                }

                if (found) {
                    matchedCount++;
                    score += 15; // Aumentar peso do match individual
                    if (isCritical) score += 20;
                    if (productWords[0] === w) score += 10;
                } else {
                    // PENALIDADE: Se a palavra é relevante e não está no produto, perde pontos
                    // Evita "xis" casar com "combo" se ambos estiverem no menu
                    score -= 10;
                }
            }

            // BÔNUS DE COMPLETUDE: Baseado em quão bem as palavras batem proporcionalmente
            const coverage = (matchedCount / Math.max(relevantInputWords.length, productWords.length));
            score += coverage * 30;

            // Penalidade de tamanho excessivo
            if (productWords.length > relevantInputWords.length + 2) score -= 15;
        }

        if (score >= threshold) candidatesWithScores.push({ product, score });
        if (score > maxScore) { maxScore = score; bestMatch = product; }
    }

    if (maxScore >= threshold) {
        // AMBIGUIDADE EXPERTA: Se os scores estão muito próximos (até 10% de diferença ou 5 pontos)
        let top = candidatesWithScores.filter(c => c.score >= maxScore - 5).sort((a, b) => b.score - a.score);

        // EXTRA: Se o input é uma única palavra genérica e temos múltiplas opções contendo essa palavra
        // Forçar ambiguidade mesmo que o score não seja tão próximo (ex: "acai" vs "Barca de Acai" vs "Copo de Acai")
        if (relevantInputWords.length === 1 && candidatesWithScores.length > 1) {
            const inputWord = relevantInputWords[0];
            const hasManyAcai = candidatesWithScores.filter(c => normalizeText(c.product.name).includes(inputWord)).length > 1;
            if (hasManyAcai) {
                top = candidatesWithScores.sort((a, b) => b.score - a.score).slice(0, 5);
            }
        }

        try {
            const logMsg = `[${new Date().toISOString()}] FUZZY Input: "${textOriginal}" -> Best: ${bestMatch?.name} (Score: ${maxScore}), Ambig: ${top.length > 1}\n`;
            fs.appendFileSync('/root/killsis/SAAS-WEB/server/match_debug.log', logMsg);
        } catch (e) { }

        if (top.length > 1) {
            return { product: top[0].product, isAmbiguous: true, candidates: top.map(c => c.product).slice(0, 5) };
        }
        return { product: bestMatch, isAmbiguous: false, candidates: [bestMatch] };
    }
    return null;
}

export function findProductById(id, products) {
    return products.find(p => p.id == id) || null;
}

export async function analyzeMessage(message, menu, cart, db = null, tenantId = null) {
    const words = tokenize(message);
    const actions = [];
    const intents = [
        [INTENT_KEYWORDS.MENU, 'SHOW_MENU'], [INTENT_KEYWORDS.PIX, 'SHOW_PIX'],
        [INTENT_KEYWORDS.REMOVE_ITEM, 'REMOVE_ITEM'], [INTENT_KEYWORDS.DELIVERY, 'DELIVERY'],
        [INTENT_KEYWORDS.PICKUP, 'PICKUP'], [INTENT_KEYWORDS.CONFIRM, 'CONFIRM'],
        [INTENT_KEYWORDS.CANCEL, 'CANCEL'], [INTENT_KEYWORDS.BACK, 'BACK'],
        [INTENT_KEYWORDS.HELP, 'HELP'], [INTENT_KEYWORDS.RESET, 'RESET']
    ];
    for (const [kw, type] of intents) if (matchesIntent(words, kw)) actions.push({ type });

    const isCancel = actions.some(a => a.type === 'CANCEL' || a.type === 'REMOVE_ITEM');
    if (isCancel && !message.includes(' e ') && !message.includes(' mais ')) return actions;

    const products = menu?.products || [];
    const allAddons = menu?.allAddons || [];
    const found = await findAllProducts(message, products, db, tenantId, allAddons);

    for (const f of found) {
        if (f.isAmbiguous) {
            actions.push({ type: 'CLARIFY_PRODUCT', candidates: f.candidates, quantity: f.quantity, notes: f.notes, matchedKeyword: f.matchedKeyword });
        } else {
            actions.push({ type: 'ADD_PRODUCT', product: f.product, quantity: f.quantity, notes: f.notes, itemType: f.type || 'product' });
        }
    }

    if (found.length === 0 && actions.length === 0) {
        if (/^(oi|ola|olá|opa|bom dia|boa tarde|boa noite|inicio|início|começar|comecar)\b/i.test(message)) actions.push({ type: 'GREETING' });
        else if (/^(menu|cardapio|cardápio)\b/i.test(message)) actions.push({ type: 'SHOW_MENU' });
    }
    return actions;
}

export function formatMenu(menu) {
    const categories = menu?.categories || [];
    const products = menu?.products || [];
    if (products.length === 0) return '*Cardápio não disponível no momento.*';
    let msg = '*📋 CARDÁPIO:*\n\n';
    const grouped = {};
    for (const p of products) {
        if (!p.available && p.is_available === 0) continue;
        const catId = p.category_id || 0;
        if (!grouped[catId]) grouped[catId] = { name: categories.find(c => c.id == catId)?.name || 'Outros', products: [] };
        grouped[catId].products.push(p);
    }
    for (const catId of Object.keys(grouped)) {
        msg += `*${grouped[catId].name.toUpperCase()}*\n`;
        for (const p of grouped[catId].products) msg += `• ${p.name} - R$ ${Number(p.price).toFixed(2).replace('.', ',')}\n`;
        msg += '\n';
    }
    return msg;
}

export function formatBuffetMenu(menu) {
    const { buffetItems = [], products = [] } = menu;
    if (buffetItems.length === 0) return '*BUFFET DO DIA*\n\n_Nenhum item disponível no momento._\n\nDigite o que deseja pedir ou aguarde a atualização.';
    let msg = '🍽️ *BUFFET DO DIA*\n\n';
    for (const item of buffetItems) msg += `✅ ${item.name || item.nome}\n`;
    msg += '\n---\n\n';
    if (products.length > 0) {
        const grouped = {};
        for (const p of products) {
            const cat = p.category_name || 'OPÇÕES';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        }
        for (const [cat, items] of Object.entries(grouped)) {
            msg += `*${cat.toUpperCase()}:*\n`;
            for (const p of items) msg += `• ${p.name} - R$ ${Number(p.price).toFixed(2).replace('.', ',')}\n`;
            msg += '\n';
        }
    }
    msg += '_Diga o que deseja pedir!_';
    return msg;
}

export default {
    tokenize, extractQuantity, extractQuantityAt, matchesIntent, extractModifiers,
    formatModifiersAsNotes, splitIntoSegments, findAllProducts, findProductFuzzy,
    findProductById, analyzeMessage, formatMenu, formatBuffetMenu
};
