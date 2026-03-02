import { processMessage } from './agent-employee/core/state-machine.js';
import * as cartService from './agent-employee/services/cart-service.js';

async function testPixPayment() {
    const tenantId = 'brutus-burger';
    const customerId = 'pix-test-customer';

    // Simular sessão em PAYMENT
    cartService.resetSession(tenantId, customerId);
    cartService.setState(tenantId, customerId, 'PAYMENT');
    const session = cartService.getSession(tenantId, customerId);
    session.items = [{ id: 1, name: 'Combo Brutus', price: 35, quantity: 1, total: 35 }];
    session.subtotal = 35;
    session.total = 35;
    session.deliveryType = 'pickup'; // Para simplificar e evitar coleta de endereço

    console.log('--- TESTE: Pagamento via PIX ---');
    const params = {
        message: 'vou pagar no pix',
        customerId,
        tenantId,
        settings: {
            pixKey: '123.456.789-00', // Chave fictícia
            storeName: 'Brutus Burger'
        },
        aiConfig: { model: 'gemma:2b' },
        products: [{ id: 1, name: 'Combo Brutus', price: 35 }],
        // Mock do DB para o finalizeOrder (embora ele falhe no INSERT, queremos ver a resposta textual)
        db: {
            get: async () => ({ max_order: 100 }),
            run: async () => ({ lastID: 101 })
        }
    };

    // Mock do interpreter para detectar intenção de PIX
    const mockInterpreter = {
        interpret: async () => ({
            type: 'PAYMENT',
            method: 'PIX'
        }),
        generateResponse: async () => null
    };

    const res = await processMessage({ ...params, interpreter: mockInterpreter });
    console.log('\nResposta Final (Confirmação):');
    console.log(res.text);
}

testPixPayment().catch(err => {
    console.error('Erro no teste:', err);
});
