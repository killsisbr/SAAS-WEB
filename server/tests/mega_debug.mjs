import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'milk-shake-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const mockAddons = [
    { id: 'nutella', name: 'Nutella', price: 10 },
    { id: 'leite-ninho', name: 'Leite Ninho', price: 5 },
    { id: 'morango', name: 'Morango', price: 5 },
    { id: 'banana', name: 'Banana', price: 3 },
    { id: 'granola', name: 'Granola', price: 2 }
];

const input = "Quero 1 acai 500 com nutella e leite ninho, 1 acai 300 sem nada, 2 milk shake de 300ml, 3 monstros e 5 coca lata";
console.log(`Input 1: "${input}"`);
const r1 = findProductsInMessage(input, mockProducts, mockAddons);
console.log('Results 1:', JSON.stringify(r1.map(r => ({ name: r.product.name, q: r.quantity, a: r.addons.map(ad => ad.id) })), null, 2));

const input2 = "me ve um de 300 com banana e granola e um de 500 com morango e nutella";
console.log(`\nInput 2: "${input2}"`);
const r2 = findProductsInMessage(input2, mockProducts, mockAddons);
console.log('Results 2:', JSON.stringify(r2.map(r => ({ name: r.product.name, q: r.quantity, a: r.addons.map(ad => ad.id) })), null, 2));
