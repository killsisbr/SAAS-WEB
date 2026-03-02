import { processMessage } from './agent-employee/core/state-machine.js';
import * as cartService from './agent-employee/services/cart-service.js';

async function testPickupLogic() {
    const tenantId = 'test-tenant';
    const customerId = 'test-customer';

    // Simular sessão em ORDERING
    cartService.resetSession(tenantId, customerId);
    cartService.setState(tenantId, customerId, 'ORDERING');
    const session = cartService.getSession(tenantId, customerId);
    session.items = [{ id: 1, name: 'Burger', price: 20, quantity: 1, total: 20 }];
    session.subtotal = 20;
    session.total = 20;

    console.log('--- TESTE 1: allow_pickup = true ---');
    const params1 = {
        message: 'fechar pedido',
        customerId,
        tenantId,
        settings: { allow_pickup: true },
        aiConfig: { model: 'gemma:2b' },
        products: [{ id: 1, name: 'Burger', price: 20 }]
    };

    // Precisamos de um mock do interpreter
    const mockInterpreter = {
        interpret: async () => ({ type: 'FINALIZE_CART' }),
        generateResponse: async () => null
    };

    const res1 = await processMessage({ ...params1, interpreter: mockInterpreter });
    console.log('Resposta (Pickup Ativo):', res1.text);
    console.log('Novo Estado:', cartService.getSession(tenantId, customerId).state);

    console.log('\n--- TESTE 2: allow_pickup = false ---');
    cartService.resetSession(tenantId, customerId);
    cartService.setState(tenantId, customerId, 'ORDERING');
    const session2 = cartService.getSession(tenantId, customerId);
    session2.items = [{ id: 1, name: 'Burger', price: 20, quantity: 1, total: 20 }];

    const params2 = {
        message: 'fechar pedido',
        customerId,
        tenantId,
        settings: { allow_pickup: false },
        aiConfig: { model: 'gemma:2b' },
        products: [{ id: 1, name: 'Burger', price: 20 }]
    };

    const res2 = await processMessage({ ...params2, interpreter: mockInterpreter });
    console.log('Resposta (Pickup Inativo):', res2.text);
    console.log('Novo Estado:', cartService.getSession(tenantId, customerId).state);

    console.log('\n--- TESTE 3: Usuário insiste em PICKUP com allow_pickup = false ---');
    cartService.resetSession(tenantId, customerId);
    cartService.setState(tenantId, customerId, 'DELIVERY_TYPE');
    const params3 = {
        message: 'quero retirar no local',
        customerId,
        tenantId,
        settings: { allow_pickup: false },
        aiConfig: { model: 'gemma:2b' },
        products: [{ id: 1, name: 'Burger', price: 20 }]
    };

    const mockInterpreter3 = {
        interpret: async () => ({ type: 'PICKUP' }), // IA detectou tentativa de retirada
        generateResponse: async () => null
    };

    const res3 = await processMessage({ ...params3, interpreter: mockInterpreter3 });
    console.log('Resposta (Insistência Bloqueada):', res3.text);
    console.log('Estado Continua:', cartService.getSession(tenantId, customerId).state);
}

testPickupLogic().catch(console.error);
