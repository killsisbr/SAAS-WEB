import { normalizeText } from '../agent-employee/services/product-matcher.js';

// Versão com logs do matcher
function debugMatcher(message, products) {
    const results = [];
    const numberWords = { 'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3 };
    let msg = normalizeText(message);
    let originalMsgPadded = " " + msg + " ";

    const sortedProducts = [...products].sort((a, b) => b.name.length - a.name.length);

    console.log(`[DEBUG] Msg inicial: "${originalMsgPadded}"`);

    // Passo 1
    for (const product of sortedProducts) {
        let pName = normalizeText(product.name);
        if (pName.length < 3) continue;

        const words = pName.split(/\s+/);
        let regexStr = words.join('\\s+').replace(/(\\s\+)/g, '(?:\\s+de\\s+|\\s+da\\s+|\\s+)?$1');
        let pRegex = new RegExp(`(?:^|\\s|e\\s+|com\\s+|um[a]?\\s+)(${regexStr})(?:$|\\s|,)`, 'i');

        let match;
        while ((match = pRegex.exec(originalMsgPadded)) !== null) {
            console.log(`[DEBUG] Passo 1 Match: "${match[1]}" para o produto "${product.name}"`);
            results.push({ product, quantity: 1 });
            originalMsgPadded = originalMsgPadded.replace(match[1], ' '.repeat(match[1].length));
            pRegex.lastIndex = 0;
        }
    }

    // Passo 3 Fallback
    console.log(`[DEBUG] Msg após Step 1: "${originalMsgPadded}"`);
    let finalMsg = originalMsgPadded.trim();
    if (!results.some(r => r.product.name.toLowerCase().includes('coca'))) {
        if (/\bcocas?\b/i.test(finalMsg)) {
            console.log(`[DEBUG] Passo 3 detectou "coca" no que sobrou: "${finalMsg}"`);
        }
    }
}

const mockProducts = [
    { id: '1', name: 'Milk Shake 300ml' },
    { id: '2', name: 'Coca Lata' },
    { id: '3', name: 'Paleta de Paçoca' }
];

debugMatcher("um shaking de 300ml e uma paleta de pacoca", mockProducts);
