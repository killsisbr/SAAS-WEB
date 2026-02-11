// ============================================================
// Bug Regression Test - Multi-Item Addon Mapping
// Valida que adicionais não são duplicados em pedidos múltiplos
// ============================================================

import { processMessage } from '../agent-employee/core/state-machine.js';
import * as cartService from '../agent-employee/services/cart-service.js';
import { AGENT_STATES } from '../agent-employee/config.js';

// Mock de DB
const mockDb = {
    get: async () => null,
    all: async () => [],
    run: async () => ({ lastID: 1 })
};

// Dados de teste
const tenantId = 'test_tenant';
const customerId = 'test_customer';
const products = [
    { id: 1, name: 'X-Tudo', price: 25.0, category_id: 1, has_sizes: false, _type: 'product' },
    { id: 2, name: 'X-Bacon', price: 22.0, category_id: 1, has_sizes: false, _type: 'product' },
    { id: 3, name: 'Marmita Pequena', price: 15.0, category_id: 2, has_sizes: true, _type: 'product' }
];
const addons = [
    { id: 10, name: 'Feijão', price: 0, _type: 'addon' },
    { id: 11, name: 'Arroz', price: 0, _type: 'addon' }
];

async function runTest() {
    console.log('🚀 Iniciando teste de regressão: Mapeamento de Adicionais Múltiplos');

    // 1. Resetar sessão
    cartService.resetSession(tenantId, customerId);
    cartService.setState(tenantId, customerId, AGENT_STATES.ORDERING);

    // 2. Simular mensagem: "quero 2 x tudo e 1 marmita pequena com arroz e feijao"
    const message = 'quero 2 x tudo e 1 marmita pequena com arroz e feijao';

    console.log(`\n📝 Mensagem: "${message}"`);

    const result = await processMessage({
        message,
        customerId,
        tenantId,
        products,
        addons,
        buffet: [],
        settings: { storeName: 'Teste' },
        db: mockDb,
        aiConfig: { model: 'gemma3:4b' } // Ajuste se necessário
    });

    const session = cartService.getSession(tenantId, customerId);

    console.log('\n📦 Conteúdo do Carrinho:');
    session.items.forEach(item => {
        console.log(`- ${item.quantity}x ${item.name}`);
        if (item.modifiers && item.modifiers.length > 0) {
            item.modifiers.forEach(m => console.log(`  └─ Adicional: ${m.name}`));
        } else {
            console.log('  └─ (Sem adicionais)');
        }
    });

    // 3. Validações
    let failures = [];

    const xTudo = session.items.find(i => i.name === 'X-Tudo');
    const marmita = session.items.find(i => i.name === 'Marmita Pequena');

    if (!xTudo) failures.push('X-Tudo não encontrado no carrinho');
    else if (xTudo.modifiers.length > 0) {
        failures.push(`ERRO: X-Tudo tem ${xTudo.modifiers.length} adicionais (esperava 0)`);
    }

    if (!marmita) failures.push('Marmita Pequena não encontrada no carrinho');
    else if (marmita.modifiers.length === 0) {
        failures.push('ERRO: Marmita Pequena não tem adicionais (esperava Arroz e Feijão)');
    } else {
        const hasRice = marmita.modifiers.some(m => m.name === 'Arroz');
        const hasBeans = marmita.modifiers.some(m => m.name === 'Feijão');
        if (!hasRice || !hasBeans) {
            failures.push(`ERRO: Adicionais da Marmita incompletos (Encontrados: ${marmita.modifiers.map(m => m.name).join(', ')})`);
        }
    }

    if (failures.length === 0) {
        console.log('\n✅ TESTE PASSOU: Adicionais mapeados corretamente apenas para os itens solicitados.');
    } else {
        console.log('\n❌ TESTE FALHOU:');
        failures.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error('Erro durante o teste:', err);
    process.exit(1);
});
