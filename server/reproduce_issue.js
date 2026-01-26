
import { analyzeMessage } from './direct-order/core/word-analyzer.js';
import * as cartService from './direct-order/services/cart-service.js';

// Mock DB
const mockDb = {
    all: async () => [],
    get: async () => null
};

// Mock Menu
const mockMenu = {
    products: [
        { id: 'p1', name: 'X-Burger', price: 20.00 },
        { id: 'p2', name: 'Coca Cola', price: 5.00 }
    ],
    // Addons are usually in a separate list, but word-analyzer currently only looks at 'products' argument for main matches
    // But let's see if we pass addons as products if it helps (it might, but we want to test "com bacon" behavior)
    addons: [
        { id: 'a1', name: 'Bacon', price: 3.00 }
    ],
    allAddons: [
        { id: 'a1', name: 'Bacon', price: 3.00 }
    ]
};

const tenantId = 'tenant1';
const customerId = '5511999999999';

async function runTest() {
    console.log("--- TESTE DE REPRODUÇÃO: '1 X-Burger com bacon' ---");

    // Reset cart
    cartService.resetCart(tenantId, customerId);

    // Simulate user message
    // Note: The current analyzer only looks at the 'products' array passed to it.
    // Text logic: "com bacon" -> extracts modifier

    const message = "1 X-Burger com bacon";

    // Analyze
    const actions = await analyzeMessage(message, mockMenu, cartService.getCart(tenantId, customerId), mockDb, tenantId);

    console.log("Ações Detectadas:", JSON.stringify(actions, null, 2));

    // Execute actions (simulate state machine logic)
    for (const action of actions) {
        if (action.type === 'ADD_PRODUCT') {
            const product = action.product;
            // The action.notes contains 'com bacon'?
            console.log(`Adicionando Produto: ${product.name} (Preço Base: ${product.price})`);
            console.log(`Notas: ${action.notes}`);

            cartService.addItem(tenantId, customerId, product, action.quantity, action.notes, action.itemType || 'product');
        }
    }

    const cart = cartService.getCart(tenantId, customerId);
    console.log(`Total do Carrinho: ${cart.total}`);

    // Check Result
    if (cart.total === 20.00) {
        console.log("RESULTADO: ERRO CONFIRMADO. O bacon (R$ 3,00) foi ignorado no preço.");
    } else if (cart.total === 23.00) {
        console.log("RESULTADO: CORRETO. O preço do bacon foi somado.");
    } else {
        console.log(`RESULTADO: INESPERADO. Total: ${cart.total}`);
    }
}

runTest().catch(console.error);
