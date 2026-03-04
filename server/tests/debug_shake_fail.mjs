import { normalizeText, findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'milk-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' },
    { id: 'paleta-pacoca', name: 'Paleta de Paçoca', category_id: 'cat-paleta' }
];

const message = "um shaking de 300ml e uma paleta de pacoca";
console.log(`Original: "${message}"`);
const results = findProductsInMessage(message, mockProducts);

console.log('Results:', results.map(r => r.product.name));
