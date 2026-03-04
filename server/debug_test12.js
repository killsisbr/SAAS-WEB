import { findProductsInMessage, normalizeText } from './agent-employee/services/product-matcher.js';

const mockMenu = [
    { id: 22, name: 'Copo Açaí 300ml', _type: 'product', category_id: 6 },
    { id: 23, name: 'Copo Açaí 500ml', _type: 'product', category_id: 6 },
    { id: 24, name: 'Copo Açaí 700ml', _type: 'product', category_id: 6 }
];

const msg = "1 acai 700 1 de 300 e 2 de 500";
console.log("Analyzing message:", msg);
const res = findProductsInMessage(msg, mockMenu);
console.log("Final Results Summary:", res.map(r => ({ id: r.product.id, q: r.quantity })));
console.log("Full Results Object:", JSON.stringify(res, null, 2));
