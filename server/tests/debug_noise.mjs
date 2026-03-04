import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' }
];

const input = "Boa tarde pessoal, tudo bem? Olha, o meu filho está aqui pedindo mto pra eu pegar um monster pra ele, entao manda um monster e pra mim pode ser 2 coca lata. Ah, e nao esquece o canudo.";
console.log(`Input: "${input}"`);
const results = findProductsInMessage(input, mockProducts);
console.log('Results:', results.map(r => `${r.quantity}x ${r.product.name}`));
