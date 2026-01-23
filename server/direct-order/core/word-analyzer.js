// ============================================================
// Direct Order Module - Word Analyzer (Enhanced Version)
// Analisador de palavras-chave com suporte a:
// - Múltiplos produtos na mesma mensagem
// - Modificadores (sem/com/mais)
// - Sinônimos inteligentes
// ============================================================

import { NUMBER_MAP, INTENT_KEYWORDS } from '../config.js';
import { findProductByText, normalizeText, getMappings } from '../services/mapping-service.js';
import { getIgnoredWords, getSynonyms } from '../services/auto-improve-service.js';

// Separadores de itens na mensagem
const ITEM_SEPARATORS = ['e', 'mais', '+', ',', 'tambem', 'também'];

// Modificadores que alteram produtos
const MODIFIERS = {
    REMOVE: ['sem', 'tira', 'tirar', 'remover', 'menos'],
    ADD: ['com', 'mais', 'adicional', 'extra', 'bastante'],
    PREPARATION: ['mal', 'malpassado', 'ao ponto', 'bem passado', 'bempassado']
};

// Palavras que NUNCA devem ser consideradas para match de produtos
// Inclui saudações, palavras comuns e termos que causam falsos positivos
// NOTA: Palavras adicionais podem ser carregadas do banco de dados por tenant
const BASE_IGNORED_WORDS = [
    // Saudações
    'bom', 'boa', 'dia', 'tarde', 'noite', 'oi', 'ola', 'olá', 'opa', 'eae', 'eai',
    'obrigado', 'obrigada', 'vlw', 'valeu', 'muito', 'obg',
    // Palavras comuns
    'quero', 'gostaria', 'por', 'favor', 'pfv', 'pf', 'por favor',
    'me', 've', 'manda', 'envia', 'traz', 'traga', 'preciso',
    // Artigos e pronomes
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'pra', 'para', 'pro', 'no', 'na', 'nos', 'nas', 'esse', 'essa', 'isso',
    // Palavras que causavam falso positivo
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

// Categorias de medidas exclusivas para evitar falsos positivos cross-volume/size
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
 * @returns {object|null} { category, groupIndex }
 */
function findMeasureGroup(text) {
    if (!text) return null;
    const norm = normalizeText(text);

    // Padrões válidos de combinação número+unidade (apenas para volumes, não tamanhos)
    // Isso evita que "1grande" seja detectado como medida
    const validVolumePatterns = /^(\d+\.?\d*)(l|litro|litros|lts|ml)$/i;

    for (const [category, groups] of Object.entries(EXCLUSIVE_MEASURES)) {
        for (let i = 0; i < groups.length; i++) {
            for (const variant of groups[i]) {
                // Match exato é sempre válido
                if (norm === variant) return { category, index: i };

                // Para SIZE (p, m, g), NÃO permitir combinações com números ("1grande" não é medida)
                if (category === 'SIZE') {
                    // Só aceitar match exato para tamanhos
                    continue;
                }

                // Para VOLUME, aceitar combinações válidas (2l, 600ml, etc)
                if (category === 'VOLUME' && validVolumePatterns.test(norm)) {
                    // Verificar se o volume no texto corresponde a este grupo
                    if (variant === norm || norm.includes(variant.replace(/\s/g, ''))) {
                        return { category, index: i };
                    }
                }

                // Regra para termos longos (litros, grande, etc) - apenas inclusão em palavras
                if (variant.length >= 5 && (norm.includes(variant) || variant.includes(norm)) && norm.length >= 4) {
                    return { category, index: i };
                }
            }
        }
    }
    return null;
}

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

    // Carregar palavras ignoradas e sinônimos do banco (com cache)
    let ignoredWordsSet = new Set(BASE_IGNORED_WORDS);
    let synonymsMap = new Map();

    if (db && tenantId) {
        try {
            // Mesclar palavras ignoradas do banco com as base
            const tenantIgnored = await getIgnoredWords(db, tenantId);
            tenantIgnored.forEach(w => ignoredWordsSet.add(w));

            // Carregar sinônimos do tenant
            synonymsMap = await getSynonyms(db, tenantId);

            if (tenantIgnored.size > 0) {
                console.log(`[WordAnalyzer] +${tenantIgnored.size} palavras ignoradas do tenant`);
            }
            if (synonymsMap.size > 0) {
                console.log(`[WordAnalyzer] ${synonymsMap.size} sinônimos do tenant carregados`);
            }
        } catch (err) {
            console.warn('[WordAnalyzer] Falha ao carregar auto-improve:', err.message);
        }
    }

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

                // PROTEÇÃO: Ignorar combos que são apenas saudações/palavras comuns
                // Isso evita que "bom dia" dê match em "marmita media" (dia ⊂ media)
                // Usa o Set mesclado (base + tenant)
                const nonIgnoredWords = comboWords.filter(w => !ignoredWordsSet.has(w));
                if (nonIgnoredWords.length === 0) {
                    // Todas as palavras são ignoradas, pular este combo
                    continue;
                }

                // 0. Tentar sinônimo do banco (alta prioridade)
                let match = null;
                if (synonymsMap.has(normCombo)) {
                    const productId = synonymsMap.get(normCombo);
                    match = { productId, matchedKeyword: normCombo + ' (sinônimo)' };
                    console.log(`[WordAnalyzer] ✨ Sinônimo encontrado: "${normCombo}" → produto ${productId}`);
                }

                // 1. Tentar mapeamento exato (banco) - DEVE ser exato para este combo
                if (!match && mappings[normCombo]) {
                    match = { productId: mappings[normCombo], matchedKeyword: normCombo };
                }

                // 2. Tentar match no nome do produto (Strict Fuzzy)
                if (!match) {
                    const fuzzyProduct = findProductFuzzy(comboWords, products, true, ignoredWordsSet); // true = strict mode
                    if (fuzzyProduct) {
                        match = { productId: fuzzyProduct.id, matchedKeyword: fuzzyProduct.name };
                    }
                }

                // Se encontrou match, é o "melhor" para este start index 'i', pois estamos indo do maior pro menor
                if (match) {
                    // NOVA PROTEÇÃO: Verificar se há termos de volume no segmento que NÃO foram consumidos pelo combo
                    // Ex: Se o segmento é ["coca", "2", "l"] e o combo é apenas ["coca"], verificar se "2l" conflita
                    const remainingWordsInSegment = words.slice(i + len);
                    let segmentHasUnmappedVolume = false;

                    for (let k = 0; k < remainingWordsInSegment.length; k++) {
                        const rw = remainingWordsInSegment[k];
                        const rnext = remainingWordsInSegment[k + 1] || '';
                        const rcombo = (rw + rnext).toLowerCase().replace(/\s/g, '');

                        // Verificar se é um padrão de volume (2l, 600ml, litros, etc)
                        const volumePatterns = /^(\d+\.?\d*)(l|litro|litros|lts|ml)$/i;
                        const volumeWords = ['litros', 'litro', 'lts', 'ml'];

                        if (volumePatterns.test(rw) || volumePatterns.test(rcombo) || volumeWords.includes(rw)) {
                            // O segmento tem um volume não consumido pelo combo
                            // Verificar se o produto é uma bebida e não tem este volume específico
                            const product = products.find(p => p.id === match.productId);
                            if (product) {
                                const productNameNorm = normalizeText(product.name);
                                // Se o produto NÃO contém o volume mencionado, rejeitar o match
                                if (!productNameNorm.includes(rw) && !productNameNorm.includes(rcombo)) {
                                    console.log(`[WordAnalyzer] ⛔ Rejeitando "${product.name}" - segmento tem volume "${rcombo || rw}" não presente no produto.`);
                                    segmentHasUnmappedVolume = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (segmentHasUnmappedVolume) {
                        // Não aceitar este match, continuar procurando (ou nenhum match será encontrado)
                        continue;
                    }

                    bestMatch = match;
                    matchLength = len;
                    break;
                }
            }

            if (bestMatch) {
                const product = products.find(p => p.id === bestMatch.productId);

                if (product) {
                    // Extrair quantidade - pode estar em dois lugares:
                    // 1. Palavra ANTERIOR ao match (ex: "2 marmita" → "2" está antes)
                    // 2. PRIMEIRA palavra do match (ex: "duas marmitas" → "duas" está no início do combo)
                    let quantity = 1;
                    let quantityExtracted = false;

                    // Tentativa 1: Palavra anterior ao início do match (i - 1)
                    const prevIdx = i - 1;
                    if (prevIdx >= 0 && !processedIndices.has(prevIdx)) {
                        const prevWord = words[prevIdx];
                        const extracted = extractQuantity([prevWord]);

                        if (extracted) {
                            quantity = extracted;
                            processedIndices.add(prevIdx);
                            quantityExtracted = true;
                            console.log(`[WordAnalyzer] Quantidade ${quantity} extraída de "${prevWord}" para "${product.name}"`);
                        }
                    }

                    // Tentativa 2: Primeira palavra do match (para casos como "duas marmitas grandes")
                    if (!quantityExtracted && matchLength > 1) {
                        const firstMatchWord = words[i];
                        const extracted = extractQuantity([firstMatchWord]);

                        if (extracted) {
                            quantity = extracted;
                            quantityExtracted = true;
                            console.log(`[WordAnalyzer] Quantidade ${quantity} extraída de "${firstMatchWord}" (início do match) para "${product.name}"`);
                        }
                    }

                    // Evitar adicionar produto se for apenas um número isolado que deu match errado
                    // (Ex: "2" dando match em algo, mas já foi usado como quantidade)
                    // ... (logica coberta pelo processedIndices.has(i))

                    // NOVO: Verificar se sobrou alguma medida conflitante no resto do segmento
                    // (Ex: Se mandou "Coca 2L", não deixar "Coca" dar match em "Coca Lata" ignorando o "2L")
                    const segmentRemainingWords = words.slice(i + matchLength);
                    let contextConflict = false;

                    const productMeasures = product.name.split(/\s+/).map(findMeasureGroup).filter(m => m !== null);
                    if (productMeasures.length > 0) {
                        for (let j = 0; j < segmentRemainingWords.length; j++) {
                            const uw = segmentRemainingWords[j];
                            const unext = segmentRemainingWords[j + 1] || '';
                            const ucombo = (uw + unext).toLowerCase().replace(/\s/g, '');

                            // Tenta individual e combo (ex: "2" + "l" = "2l")
                            const um1 = findMeasureGroup(uw);
                            const um2 = findMeasureGroup(ucombo);
                            const um = um2 || um1;

                            // PRIORIDADE: Se encontrou uma medida conflitante, é conflito!
                            if (um && productMeasures.some(pm => pm.category === um.category && pm.index !== um.index)) {
                                console.log(`[WordAnalyzer] 🚨 Conflito: "${product.name}" conflita com termo "${um2 ? ucombo : uw}" no segmento.`);
                                contextConflict = true;
                                break;
                            }

                            // Se encontramos um número que NÃO é parte de uma medida (combo não deu match),
                            // provavelmente é o início de outro produto (Ex: "2 pequenas, 1 grande").
                            // Só paramos se o próximo termo não forma uma medida.
                            if (/^\d+$/.test(uw) && !um2) {
                                break;
                            }
                        }
                    }

                    if (contextConflict) {
                        bestMatch = null;
                        continue;
                    }

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
                // NOVO: Filtrar palavras que estão em ignoredWordsSet
                // Isso evita que "bom" de "bom dia" ou "bom ppap" seja adicionado como observação
                if (!ignoredWordsSet.has(words[i])) {
                    unconsumedWords.push(words[i]);
                }
            }
        }

        if (unconsumedWords.length > 0 && foundProducts.length > 0) {
            // Filtrar palavras "lixo" que não são obrigatoriamente observações
            const extraIgnoreWords = ['quero', 'gostaria', 'me', 've', 'uma', 'um', 'uns', 'umas', 'por', 'favor', 'para', 'com', 'sem', 'e', 'mais'];

            const filteredWords = unconsumedWords.filter(w => !extraIgnoreWords.includes(w));

            if (filteredWords.length === 0) {
                // Não há palavras válidas para observação, pular
                continue;
            }

            const rawNote = filteredWords.join(' ').trim();

            // NOVO: Requisitos mais rigorosos para considerar como observação válida:
            // 1. Deve ter pelo menos 3 caracteres
            // 2. Não pode ser apenas um número
            // 3. Deve ter pelo menos uma palavra "significativa" (não apenas conectores)

            const isValidNote =
                rawNote.length >= 3 &&
                !/^\d+$/.test(rawNote) &&  // Não é apenas número
                filteredWords.length > 0;

            if (isValidNote) {
                const lastProduct = foundProducts[foundProducts.length - 1];

                // Evitar duplicar notas
                if (!lastProduct.notes) lastProduct.notes = '';

                // Se já tem nota, adiciona vírgula
                if (lastProduct.notes.length > 0) lastProduct.notes += ', ';

                lastProduct.notes += rawNote;
                console.log(`[WordAnalyzer] 📝 Obs anexada a "${lastProduct.product.name}": "${rawNote}"`);
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
export function findProductFuzzy(words, products, isStrict = false, ignoredWordsSet = null) {
    // Usar o Set mesclado se fornecido, senão fallback para o base
    const ignoredSet = ignoredWordsSet || new Set(BASE_IGNORED_WORDS);

    // Normalização prévia para sinônimos comuns
    const normalizedWords = words.map(w => {
        // Se for número seguido de l ou ml, juntar para facilitar match de volume
        // Nota: words já vem separado por causa do tokenize (ex: "2", "l")
        return w;
    });

    const textOriginal = words.join(' ');
    // Re-juntar medidas separadas pelo tokenize para checagem de conflitos
    // Ex: ["2", "l"] -> "2l"
    const fullInputText = textOriginal.replace(/\s+/g, '');
    const measuresInInput = [];

    // Tentar achar medidas no input
    for (let j = 0; j < words.length; j++) {
        const w = words[j];
        const next = words[j + 1] || '';
        const combo = (w + next).toLowerCase();

        const m1 = findMeasureGroup(w);
        if (m1) measuresInInput.push(m1);

        const m2 = findMeasureGroup(combo);
        if (m2) {
            measuresInInput.push(m2);
            j++; // Pula o próximo
        }
    }

    // PROTEÇÃO: Se todas as palavras são saudações/comuns, não há produto para buscar
    const relevantWords = normalizedWords.filter(w => !ignoredSet.has(w));
    if (relevantWords.length === 0) {
        return null;
    }

    let bestMatch = null;
    let maxScore = 0;

    // Palavras chaves críticas que DEVEM dar match se presentes no input
    const criticalKeywords = ['2', '2l', 'litros', 'lata', '350', '600', '1.5', 'ks'];

    for (const product of products) {
        const productName = normalizeText(product.name);
        const productWords = productName.split(/\s+/);
        let score = 0;

        // --- DETECÇÃO DE CONFLITO DE MEDIDAS ---
        let hasConflict = false;
        const measuresInProduct = productWords.map(findMeasureGroup).filter(m => m !== null);

        for (const inputM of measuresInInput) {
            // Se o produto tem uma medida da MESMA categoria (ex: VOLUME) 
            // mas de um grupo DIFERENTE, é um conflito claro.
            const conflict = measuresInProduct.find(pm => pm.category === inputM.category && pm.index !== inputM.index);
            if (conflict) {
                hasConflict = true;
                break;
            }
        }

        if (hasConflict) {
            // Penalidade extrema para conflitos (Lata vs 2L, P vs G)
            score -= 100;
        }

        // 1. Match Exato (Vitória automática ou score muito alto)
        if (textOriginal === productName || textOriginal.replace(/\s/g, '') === productName.replace(/\s/g, '')) {
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
                // PROTEÇÃO: Ignorar palavras de saudação/comuns no matching
                // Isso evita que "dia" dê match parcial em "media"
                if (ignoredSet.has(w)) {
                    continue;
                }

                // Verificar se é palavra crítica (número/medida)
                const isCritical = criticalKeywords.some(k => w.includes(k));

                // Tenta achar a palavra no nome do produto
                let foundInProduct = false;

                // FIX: Letras soltas ("a", "o") não podem dar match parcial (em "Marmita", "Prato")
                // Só aceita se for match exato de palavra isolada (Ex: "Opção A") ou se for número
                // FIX 2: Números pequenos (1-10) usados como quantidade NÃO devem dar match parcial
                // com tamanhos de bebida (2L, 1.5L, etc). Ex: "2" não deve dar match com "2L"
                const isSmallNumber = /^[1-9]$|^10$/.test(w);

                if (w.length <= 2 && !/^\d+$/.test(w)) {
                    // Letras curtas: apenas match exato
                    foundInProduct = productWords.some(pw => pw === w);
                } else if (isSmallNumber) {
                    // Números pequenos (1-10): match exato apenas para evitar "2" → "2L"
                    foundInProduct = productWords.some(pw => pw === w);
                } else {
                    // NOVO: Palavras de 3+ caracteres precisam de match mais rigoroso
                    // Regra 1: Match exato (palavra completa)
                    // Regra 2: A palavra do INPUT começa a palavra do PRODUTO (ex: "marm" → "marmita")
                    //          MAS: A palavra do INPUT deve ter pelo menos 60% do tamanho da palavra do produto
                    //          Isso evita "ma" dar match em "marmita" (apenas 2/8 = 25%)
                    // Regra 3: A palavra do PRODUTO está contida no INPUT (ex: "coca" em "cocacola")

                    foundInProduct = productWords.some(pw => {
                        // Match exato
                        if (pw === w) return true;

                        // INPUT começa PRODUTO (ex: "cocacola" contém "coca")
                        if (w.includes(pw) && pw.length >= 3) return true;

                        // PRODUTO começa com INPUT - MAS: INPUT deve ter pelo menos 60% do tamanho
                        // Exemplo válido: "marmit" (6 chars) → "marmita" (8 chars) = 75% ✅
                        // Exemplo inválido: "ma" (2 chars) → "marmita" (8 chars) = 25% ❌
                        if (pw.startsWith(w)) {
                            const matchRatio = w.length / pw.length;
                            return matchRatio >= 0.6; // Pelo menos 60% do tamanho
                        }

                        return false;
                    });
                }

                if (foundInProduct) {
                    matchedWordsCount++;
                    score += 10; // Ponto base por palavra
                    if (isCritical) score += 15; // Bônus por acertar medida

                    // BÔNUS: Se a palavra é a PRIMEIRA palavra do produto (base do nome)
                    // Ex: "coca" é a base de "Coca Cola Lata" - forte indicação de match
                    // AJUSTADO: Só dar bônus se for match exato ou muito próximo (>=60%)
                    const firstWord = productWords[0];
                    if (firstWord === w || (firstWord.startsWith(w) && w.length / firstWord.length >= 0.6)) {
                        score += 15; // Bônus significativo por ser a base do nome
                    }
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
