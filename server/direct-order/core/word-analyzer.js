// ============================================================
// Direct Order Module - Word Analyzer (Enhanced Version)
// Analisador de palavras-chave com suporte a:
// - Múltiplos produtos na mesma mensagem
// - Modificadores (sem/com/mais)
// - Sinônimos inteligentes
// ============================================================

import { NUMBER_MAP, INTENT_KEYWORDS } from '../config.js';
import { findProductByText, normalizeText, getMappings } from '../services/mapping-service.js';

// Separadores de itens na mensagem
const ITEM_SEPARATORS = ['e', 'mais', '+', ',', 'tambem', 'também'];

// Modificadores que alteram produtos
const MODIFIERS = {
    REMOVE: ['sem', 'tira', 'tirar', 'remover', 'menos'],
    ADD: ['com', 'mais', 'adicional', 'extra', 'bastante'],
    PREPARATION: ['mal', 'malpassado', 'ao ponto', 'bem passado', 'bempassado']
};

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

/**
 * Tokenizar mensagem em palavras
 */
export function tokenize(message) {
    return message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Separar números de letras (ex: "3brutus" -> "3 brutus", "3x" -> "3 x")
        .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
        .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
        .replace(/[.,!?;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(word => word.length > 0);
}

/**
 * Extrair quantidade antes de uma posição específica
 */
export function extractQuantityAt(words, position) {
    // Verificar palavra anterior
    if (position > 0) {
        const prev = words[position - 1].toLowerCase();
        // console.log(`[ExtractQty] Checking prev word: "${prev}" at pos ${position-1}`);
        if (NUMBER_MAP[prev]) return NUMBER_MAP[prev];
        const num = parseInt(prev);
        if (!isNaN(num) && num > 0 && num <= 50) return num;
    }
    return null;
}

/**
 * Extrair quantidade geral da mensagem
 */
export function extractQuantity(words) {
    // Prioriza números no início da frase (ex: "3 brutus")

    // Tenta encontrar o primeiro número válido
    for (const word of words) {
        if (NUMBER_MAP[word]) return NUMBER_MAP[word];
        const num = parseInt(word);
        if (!isNaN(num) && num > 0 && num <= 50) return num;
    }

    return null;
}

/**
 * Verificar se mensagem contém palavras-chave de uma intenção
 */
export function matchesIntent(words, keywords) {
    const normalizedKeywords = keywords.map(k =>
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    return words.some(word => normalizedKeywords.includes(word));
}

/**
 * Extrair modificadores de um segmento de texto
 * Retorna { additions: [], removals: [], preparation: null }
 */
export function extractModifiers(words) {
    const result = { additions: [], removals: [], preparation: null };

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const next = words[i + 1] || '';

        // Remoções: "sem bacon", "tira cebola"
        if (MODIFIERS.REMOVE.includes(word) && next) {
            if (KNOWN_INGREDIENTS.includes(next)) {
                result.removals.push(next);
                i++; // Pular próxima palavra
            }
        }

        // Adições: "com bacon", "adicional queijo"
        if (MODIFIERS.ADD.includes(word) && next) {
            if (KNOWN_INGREDIENTS.includes(next)) {
                result.additions.push(next);
                i++;
            }
        }

        // Preparo: "mal passado", "ao ponto"
        if (word === 'mal' || word === 'malpassado') {
            result.preparation = 'mal passado';
        } else if (word === 'ao' && next === 'ponto') {
            result.preparation = 'ao ponto';
            i++;
        } else if (word === 'bem' && (next === 'passado' || next === 'passada')) {
            result.preparation = 'bem passado';
            i++;
        }
    }

    return result;
}

/**
 * Formatar modificadores como string de observação
 */
export function formatModifiersAsNotes(modifiers) {
    const parts = [];

    if (modifiers.removals.length > 0) {
        parts.push(`sem ${modifiers.removals.join(', ')}`);
    }
    if (modifiers.additions.length > 0) {
        parts.push(`com ${modifiers.additions.join(', ')}`);
    }
    if (modifiers.preparation) {
        parts.push(modifiers.preparation);
    }

    return parts.join(', ');
}

/**
 * Dividir mensagem em segmentos de produtos
 * "2 coca e 1 x salada" → ["2 coca", "1 x salada"]
 */
export function splitIntoSegments(message) {
    let normalized = normalizeText(message);

    // Substituir separadores por marcador especial
    for (const sep of ITEM_SEPARATORS) {
        // Escapar caracteres especiais de regex
        const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Não substituir se faz parte de um produto (ex: "pão com gergelim")
        const regex = new RegExp(`\\s+${escapedSep}\\s+`, 'gi');
        normalized = normalized.replace(regex, ' |SEP| ');
    }

    const segments = normalized
        .split('|SEP|')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    return segments;
}

/**
 * Encontrar TODOS os produtos em uma mensagem
 * @returns {Array<{product, quantity, notes, matchedKeyword}>}
 */
/**
 * Encontrar todos os produtos usando lógica do Bot Legado (Iterativa + Combinações)
 * Referência: src/core/analisePalavras.js (processarBebidas/processarLanches)
 */
export async function findAllProducts(message, products, db, tenantId) {
    const foundProducts = [];
    const segments = splitIntoSegments(message);

    console.log(`[WordAnalyzer] Segments: ${JSON.stringify(segments)}`);

    for (const segment of segments) {
        const words = tokenize(segment);
        if (words.length === 0) continue;

        console.log(`[WordAnalyzer] Words: ${JSON.stringify(words)}`);

        // Extrair modificadores (simplificado: global por segmento por enquanto)
        // const modifiers = extractModifiers(words);
        // const notes = formatModifiersAsNotes(modifiers);
        const notes = '';

        // Set para marcar índices já processados (evita duplicidade)
        const processedIndices = new Set();

        // Obter mapeamentos do banco uma única vez por segmento (para usar cache)
        const mappings = db ? await getMappings(db, tenantId) : {};

        for (let i = 0; i < words.length; i++) {
            // Se já processamos esta palavra, pula
            if (processedIndices.has(i)) continue;

            let bestMatch = null;
            let matchLength = 0;

            // Tentativa de combinações (4 palavras ... 1 palavra)
            // Prioriza frases mais longas (ex: "Coca 2L" > "Coca")
            for (let len = 4; len >= 1; len--) {
                if (i + len > words.length) continue;

                const comboWords = words.slice(i, i + len);
                const comboText = comboWords.join(' ');
                const normCombo = normalizeText(comboText);

                // 1. Tentar mapeamento exato (banco) - DEVE ser exato para este combo
                let match = null;
                if (mappings[normCombo]) {
                    match = { productId: mappings[normCombo], matchedKeyword: normCombo };
                }

                // 2. Tentar match no nome do produto (Strict Fuzzy)
                if (!match) {
                    const fuzzyProduct = findProductFuzzy(comboWords, products, true); // true = strict mode
                    if (fuzzyProduct) {
                        match = { productId: fuzzyProduct.id, matchedKeyword: fuzzyProduct.name };
                    }
                }

                // Se encontrou match, é o "melhor" para este start index 'i', pois estamos indo do maior pro menor
                if (match) {
                    bestMatch = match;
                    matchLength = len;
                    break;
                }
            }

            if (bestMatch) {
                const product = products.find(p => p.id === bestMatch.productId);

                if (product) {
                    // Extrair quantidade da palavra ANTERIOR ao início do match (i - 1)
                    let quantity = 1;
                    const prevIdx = i - 1;

                    if (prevIdx >= 0 && !processedIndices.has(prevIdx)) {
                        const prevWord = words[prevIdx];
                        const extracted = extractQuantity([prevWord]);

                        // Validar se é número puro ou palavra numérica
                        if (extracted) {
                            quantity = extracted;
                            processedIndices.add(prevIdx); // Marcar número como usado!
                            console.log(`[WordAnalyzer] Quantidade ${quantity} extraída de "${prevWord}" para "${product.name}"`);
                        }
                    }

                    // Evitar adicionar produto se for apenas um número isolado que deu match errado
                    // (Ex: "2" dando match em algo, mas já foi usado como quantidade)
                    // ... (logica coberta pelo processedIndices.has(i))

                    foundProducts.push({
                        product,
                        quantity,
                        notes, // Nota: Modificadores ainda globais, pode melhorar no futuro
                        matchedKeyword: bestMatch.matchedKeyword
                    });

                    console.log(`[WordAnalyzer] ✅ ADD: ${quantity}x ${product.name} (Match: "${words.slice(i, i + matchLength).join(' ')}")`);

                    // Marcar palavras do produto como processadas
                    for (let k = 0; k < matchLength; k++) {
                        processedIndices.add(i + k);
                    }

                    // Avançar índice principal (menos 1 pois o loop fará i++)
                    // Na verdade, o 'continue' do loop principal já checa processedIndices, 
                    // mas podemos avançar manualmente para eficiência
                    // i += matchLength - 1; 
                }
            }
        } // Close words loop

        // --- PÓS-PROCESSAMENTO DO SEGMENTO ---
        // Verificar palavras que sobraram (não viraram produto)
        // e anexar como observação do último produto encontrado

        const unconsumedWords = [];
        for (let i = 0; i < words.length; i++) {
            if (!processedIndices.has(i)) {
                unconsumedWords.push(words[i]);
            }
        }

        if (unconsumedWords.length > 0 && foundProducts.length > 0) {
            // Filtrar palavras "lixo" que não são obrigatoriamente observações
            const ignoreWords = ['quero', 'gostaria', 'me', 've', 'uma', 'um', 'uns', 'umas', 'por', 'favor', 'para', 'com', 'sem', 'e'];

            const rawNote = unconsumedWords.join(' ');

            // Verificar se parece uma observação (tem ingredientes ou modificadores)
            // Ou se o segmento era totalmente órfão (nenhum produto nele)
            const isOrphanSegment = (processedIndices.size === 0);

            if (isOrphanSegment || rawNote.length > 2) {
                // Limpeza básica
                let cleanNote = rawNote
                    .replace(/^(quero|gostaria|me|ve)\s*/i, '')
                    .trim();

                // Se sobrou apenas "uma" ou "um", ignorar
                if (['um', 'uma', 'uns', 'umas', 'e'].includes(cleanNote)) {
                    cleanNote = '';
                }

                if (cleanNote) {
                    const lastProduct = foundProducts[foundProducts.length - 1];

                    // Evitar duplicar notas
                    if (!lastProduct.notes) lastProduct.notes = '';

                    // Se já tem nota, adiciona vírgula
                    if (lastProduct.notes.length > 0) lastProduct.notes += ', ';

                    lastProduct.notes += cleanNote;
                    console.log(`[WordAnalyzer] 📝 Obs anexada a "${lastProduct.product.name}": "${cleanNote}"`);
                }
            }
        }

    }

    return foundProducts;
}

/**
 * Encontrar produto por fuzzy match
 */
/**
 * Encontrar produto por fuzzy match (Sistema de Pontuação)
 */
export function findProductFuzzy(words, products, isStrict = false) {
    // Normalização prévia para sinônimos comuns
    const normalizedWords = words.map(w => {
        if (w === '2l') return '2 litros';
        if (w === '600ml') return '600';
        return w;
    });

    const text = normalizedWords.join(' ');
    const textOriginal = words.join(' ');

    let bestMatch = null;
    let maxScore = 0;

    // Palavras chaves críticas que DEVEM dar match se presentes no input
    const criticalKeywords = ['2', '2l', 'litros', 'lata', '350', '600', '1.5', 'ks'];

    for (const product of products) {
        const productName = normalizeText(product.name);
        const productWords = productName.split(/\s+/);
        let score = 0;

        // 1. Match Exato (Vitória automática ou score muito alto)
        if (text === productName || productName === textOriginal) {
            score = 100;
        } else {
            // 2. Análise por palavras
            let matchedWordsCount = 0;
            const inputHasCritical = normalizedWords.filter(w => criticalKeywords.some(k => w.includes(k)));

            // Penalidade inicial para diferenca de tamanho (evita "Coca" dar match alto em "Coca Cola 2 Litros Gigante")
            // Prefere produtos com tamanho similar ao input
            if (Math.abs(productWords.length - normalizedWords.length) > 2) {
                score -= 10;
            }

            for (const w of normalizedWords) {
                // Verificar se é palavra crítica (número/medida)
                const isCritical = criticalKeywords.some(k => w.includes(k));

                // Tenta achar a palavra no nome do produto
                let foundInProduct = false;

                // FIX: Letras soltas ("a", "o") não podem dar match parcial (em "Marmita", "Prato")
                // Só aceita se for match exato de palavra isolada (Ex: "Opção A") ou se for número
                if (w.length <= 2 && !/^\d+$/.test(w)) {
                    foundInProduct = productWords.some(pw => pw === w);
                } else {
                    foundInProduct = productWords.some(pw => pw.includes(w) || w.includes(pw));
                }

                if (foundInProduct) {
                    matchedWordsCount++;
                    score += 10; // Ponto base por palavra
                    if (isCritical) score += 15; // Bônus por acertar medida
                } else {
                    if (isCritical) {
                        // PENALIDADE SEVERA: Input tem medida ("2l") mas produto não tem
                        score -= 50;
                    }
                }
            }

            // Verificar o inverso: Palavras críticas no produto que NÃO estão no input
            // Ex: Input "Coca", Produto "Coca 2L". O produto tem "2L" (crítico) mas input não.
            // Isso deve diminuir o score para evitar que "Coca" selecione "Coca 2L" se houver "Coca Lata" ou "Coca" simples.
            // Mas no modo não-estrito (busca vaga), as vezes queremos isso.
            // No modo estrito (n-gram), seremos mais rigorosos.
            if (isStrict) {
                const productHasCritical = productWords.filter(pw => criticalKeywords.some(k => pw.includes(k)));
                const missingCriticalInInput = productHasCritical.filter(pw => !normalizedWords.some(nw => nw.includes(pw) || pw.includes(nw)));

                if (missingCriticalInInput.length > 0) {
                    score -= 20;
                }
            }

            // Ajuste percentual
            const matchPercentage = matchedWordsCount / normalizedWords.length;
            score += (matchPercentage * 20);
        }

        // Atualizar melhor candidato
        if (score > maxScore) {
            maxScore = score;
            bestMatch = product;
        }
    }

    // Threshold de aceitação
    // Modo estrito exige score maior para evitar falsos positivos em n-grams
    const threshold = isStrict ? 25 : 15;

    if (maxScore >= threshold) {
        return bestMatch;
    }

    return null;
}

/**
 * Encontrar produto por ID
 */
export function findProductById(id, products) {
    return products.find(p => p.id == id) || null;
}

/**
 * Analisar mensagem e retornar ações detectadas
 * VERSÃO MELHORADA: Suporta múltiplos produtos
 */
export async function analyzeMessage(message, menu, cart, db = null, tenantId = null) {
    const words = tokenize(message);
    const actions = [];

    // Detectar intenções especiais primeiro
    if (matchesIntent(words, INTENT_KEYWORDS.MENU)) {
        actions.push({ type: 'SHOW_MENU' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.PIX)) {
        actions.push({ type: 'SHOW_PIX' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.REMOVE_ITEM)) {
        actions.push({ type: 'REMOVE_ITEM' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.DELIVERY)) {
        actions.push({ type: 'DELIVERY' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.PICKUP)) {
        actions.push({ type: 'PICKUP' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.CONFIRM)) {
        actions.push({ type: 'CONFIRM' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.CANCEL)) {
        actions.push({ type: 'CANCEL' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.BACK)) {
        actions.push({ type: 'BACK' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.HELP)) {
        actions.push({ type: 'HELP' });
    }
    if (matchesIntent(words, INTENT_KEYWORDS.RESET)) {
        actions.push({ type: 'RESET' });
    }

    // Detectar MÚLTIPLOS produtos
    const products = menu?.products || [];
    const foundProducts = await findAllProducts(message, products, db, tenantId);

    for (const found of foundProducts) {
        actions.push({
            type: 'ADD_PRODUCT',
            product: found.product,
            quantity: found.quantity,
            notes: found.notes
        });
    }

    // Detectar resposta numérica (escolha de opção)
    // DESATIVADO: Cliente pediu para remover seleção por número. Apenas por nome.
    /*
    const strictNumberRegex = /^(\d+)$|^(item|opcao|opção|numero|número)\s*(\d+)$/i;
    const numberMatch = message.trim().match(strictNumberRegex);

    if (numberMatch && foundProducts.length === 0) {
        // Se deu match, o número está no grupo 1 ou 3
        const numStr = numberMatch[1] || numberMatch[3];
        actions.push({
            type: 'NUMERIC_CHOICE',
            value: parseInt(numStr)
        });
    }
    */

    // 4. Se não achou NADA, verificar se é apenas saudação ou pedido de menu explícito

    // Saudações -> GREETING (Mostra Welcome Message com Link)
    const greetingRegex = /^(oi|ola|olá|opa|bom dia|boa tarde|boa noite|inicio|início|começar|comecar)\b/i;

    // Pedido explícito de cardápio -> SHOW_MENU (Mostra lista de texto)
    const menuRegex = /^(menu|cardapio|cardápio)\b/i;

    if (foundProducts.length === 0 && actions.length === 0) {
        if (greetingRegex.test(message)) {
            actions.push({ type: 'GREETING' });
        } else if (menuRegex.test(message)) {
            actions.push({ type: 'SHOW_MENU' });
        }
    }

    return actions;
}

/**
 * Formatar cardápio para exibição no WhatsApp
 */
export function formatMenu(menu) {
    const categories = menu?.categories || [];
    const products = menu?.products || [];

    if (products.length === 0) {
        return '*Cardápio não disponível no momento.*';
    }

    let msg = '*📋 CARDÁPIO:*\n\n';

    // Agrupar por categoria
    const grouped = {};
    for (const product of products) {
        if (!product.available && product.is_available === 0) continue;

        const catId = product.category_id || 0;
        if (!grouped[catId]) {
            const category = categories.find(c => c.id == catId);
            grouped[catId] = {
                name: category?.name || 'Outros',
                products: []
            };
        }
        grouped[catId].products.push(product);
    }

    // Formatar cada categoria
    for (const catId of Object.keys(grouped)) {
        const cat = grouped[catId];
        msg += `*${cat.name.toUpperCase()}*\n`;

        for (const p of cat.products) {
            const price = Number(p.price).toFixed(2).replace('.', ',');
            msg += `• ${p.name} - R$ ${price}\n`;
        }
        msg += '\n';
    }

    return msg;
}

/**
 * Formatar menu do buffet do dia (para RESTAURANTE/MARMITARIA)
 */
export function formatBuffetMenu(menu) {
    const { buffetItems = [], products = [], categories = [] } = menu;

    if (buffetItems.length === 0) {
        return '*BUFFET DO DIA*\n\n_Nenhum item disponível no momento._\n\nDigite o que deseja pedir ou aguarde a atualização.';
    }

    let msg = '🍽️ *BUFFET DO DIA*\n\n';

    // Listar itens do buffet
    for (const item of buffetItems) {
        msg += `✅ ${item.name || item.nome}\n`;
    }

    msg += '\n---\n\n';

    // Mostrar também os produtos (marmitas/porções) com preço
    if (products.length > 0) {
        // Agrupar produtos por categoria
        const groupedProducts = {};
        for (const p of products) {
            const categoryName = p.category_name || 'OPÇÕES';
            if (!groupedProducts[categoryName]) {
                groupedProducts[categoryName] = [];
            }
            groupedProducts[categoryName].push(p);
        }

        // Exibir grupos
        for (const [category, items] of Object.entries(groupedProducts)) {
            msg += `*${category.toUpperCase()}:*\n`;
            for (const p of items) {
                const price = Number(p.price).toFixed(2).replace('.', ',');
                msg += `• ${p.name} - R$ ${price}\n`;
            }
            msg += '\n';
        }
    }

    msg += '_Diga o que deseja pedir!_';

    return msg;
}

export default {
    tokenize,
    extractQuantity,
    extractQuantityAt,
    matchesIntent,
    extractModifiers,
    formatModifiersAsNotes,
    splitIntoSegments,
    findAllProducts,
    findProductFuzzy,
    findProductById,
    analyzeMessage,
    formatMenu,
    formatBuffetMenu
};
