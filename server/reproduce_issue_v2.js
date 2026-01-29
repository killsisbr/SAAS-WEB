
import { addItem, calculateTotal, getCart } from './direct-order/services/cart-service.js';

const tenantId = 'test-tenant';
const customerId = 'test-customer';

// Mock product with addons?
// Note: product passed to addItem usually comes from DB or word-analyzer.
// If word-analyzer attaches 'addons' to the product object, let's see if addItem keeps it.
const product = {
    id: 100,
    name: 'Brutus Burger',
    price: 28.00,
    addons: [
        { name: 'Bacon', price: 5.00 },
        { name: 'Queijo', price: 5.00 }
    ]
};

console.log('--- TEST 1: Add Item with nested addons ---');
addItem(tenantId, customerId, product, 1, '', 'product');

const cart = getCart(tenantId, customerId);
console.log('Cart Items:', JSON.stringify(cart.items, null, 2));
console.log('Cart Total:', cart.total);

// Check if total is 38.00 or 28.00
if (cart.total === 28.00) {
    console.log('FAIL: Total ignores addons (expected 38.00)');
} else if (cart.total === 38.00) {
    console.log('SUCCESS: Total includes addons');
} else {
    console.log('UNKNOWN: Total is', cart.total);
}

// Check if items have addons property
if (cart.items[0].addons) {
    console.log('CONFIRMED: Item has addons property');
} else {
    console.log('CONFIRMED: Item MISSING addons property');
}
