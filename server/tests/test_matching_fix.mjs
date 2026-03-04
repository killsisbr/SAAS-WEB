import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: '1', name: 'Copo Açaí 700ml' },
    { id: '2', name: 'Coca Lata' },
    { id: '3', name: 'Monster' },
    { id: '4', name: 'Paleta de Paçoca' }
];

const testMessage = "quero um monster e uma coca lata";
console.log(`Testing message: "${testMessage}"`);

const results = findProductsInMessage(testMessage, mockProducts);

console.log('--- Results ---');
results.forEach(r => {
    console.log(`- ${r.product.name} (Qty: ${r.quantity})`);
});

const hasMonster = results.some(r => r.product.name === 'Monster');
const hasCoca = results.some(r => r.product.name === 'Coca Lata');

if (hasMonster && hasCoca) {
    console.log('✅ Success: Both products matched correctly.');
} else {
    console.log('❌ Failure: Products missing or mismatched.');
}
