
import { processMessage } from './direct-order/core/state-machine.js';
import * as cartService from './direct-order/services/cart-service.js';

// Mock DB and other params
const mockDb = {
    get: async () => null, // No saved customer/tenant
    all: async () => [],
    run: async () => ({}),
};

const mockMenu = {
    products: [{ id: 'p1', name: 'X-Burger', price: 20.00, available: true, is_available: 1 }],
    categories: []
};

const tenantId = 'tenant_test_pickup';
const customerId = 'user_pickup_1';

async function runTest() {
    console.log("--- TEST FLOW: ADD ITEM -> PICKUP -> NAME -> OBS -> (SKIP PAYMENT) -> FINISH ---");

    // Clear previous sessions
    cartService.resetCart(tenantId, customerId);

    // 1. Add Item
    console.log("\n1. Customer says: '1 X-Burger'");
    let result = await processMessage({
        message: '1 X-Burger',
        customerId, tenantId, customerName: 'User',
        menu: mockMenu, settings: { whatsappOrderMode: 'direct' }, db: mockDb
    });
    console.log(`Bot: ${result.text}`);

    // 2. Choose Pickup (Retirada)
    console.log("\n2. Customer says: 'Retirada'");
    result = await processMessage({
        message: 'Retirada',
        customerId, tenantId, customerName: 'User',
        menu: mockMenu, settings: { whatsappOrderMode: 'direct' }, db: mockDb
    });
    console.log(`Bot: ${result.text}`);

    // 3. Name (if asked)
    if (result.text && result.text.includes('nome')) {
        console.log("\n3. Customer says: 'João'");
        result = await processMessage({
            message: 'João',
            customerId, tenantId, customerName: 'User',
            menu: mockMenu, settings: { whatsappOrderMode: 'direct' }, db: mockDb
        });
        console.log(`Bot: ${result.text}`);
    }

    // 4. Observation
    console.log("\n4. Customer says: 'Sem cebola'");
    result = await processMessage({
        message: 'Sem cebola',
        customerId, tenantId, customerName: 'User',
        menu: mockMenu, settings: { whatsappOrderMode: 'direct' }, db: mockDb
    });
    console.log(`Bot: ${result.text}`);

    // CHECK
    if (result.orderCreated) {
        console.log("\n✅ SUCCESS: Order created immediately!");
        console.log(`Payment Method: ${result.orderCreated.paymentMethod}`);
        if (result.orderCreated.paymentMethod === 'PAGAR_NA_RETIRADA') {
            console.log("✅ Payment Method correctly set to PAGAR_NA_RETIRADA");
        } else {
            console.log("❌ Unexpected Payment Method");
        }
    } else if (result.text && result.text.includes('agamento')) {
        console.log("\n❌ FAILURE: Bot is asking for payment method.");
    } else {
        console.log("\n❓ UNKNOWN STATE. Result:", result.text);
    }
}

runTest().catch(console.error);
