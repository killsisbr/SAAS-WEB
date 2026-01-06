// ============================================================
// Teste Automatizado - Bot IA WhatsApp
// Simula conversas completas para validar fluxo
// ============================================================

import { processMessage } from '../services/ai-processor.js';
import { getOrCreateSession, removeSession, ORDER_STATES } from '../services/order-session.js';
import { handleConversation } from '../services/conversation-handler.js';

// Cores para output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// Mock de banco de dados
const mockDb = {
    async get(query, params) {
        return null;
    },
    async all(query, params) {
        return [];
    },
    async run(query, params) {
        return { lastID: 1 };
    }
};

// Cardapio de teste
const mockMenuData = {
    categories: [
        { id: 1, name: 'Hamburgueres', sort_order: 1 },
        { id: 2, name: 'Bebidas', sort_order: 2 },
        { id: 3, name: 'Combos', sort_order: 3 }
    ],
    products: [
        { id: 1, name: 'X-Burger', price: 18.00, category_id: 1, description: 'Hamburguer classico' },
        { id: 2, name: 'X-Bacon', price: 22.00, category_id: 1, description: 'Com bacon crocante' },
        { id: 3, name: 'X-Tudo', price: 28.00, category_id: 1, description: 'Completo' },
        { id: 4, name: 'Coca-Cola Lata', price: 6.00, category_id: 2 },
        { id: 5, name: 'Coca-Cola 600ml', price: 8.00, category_id: 2 },
        { id: 6, name: 'Suco Natural', price: 10.00, category_id: 2 }
    ],
    addons: [
        { id: 1, product_id: 1, name: 'Bacon extra', price: 4.00 },
        { id: 2, product_id: 1, name: 'Queijo extra', price: 3.00 },
        { id: 3, product_id: 2, name: 'Bacon extra', price: 4.00 },
        { id: 4, product_id: 2, name: 'Ovo', price: 2.00 }
    ]
};

// Configuracoes do tenant de teste
const mockTenantSettings = {
    name: 'Brutus Burger',
    aiBot: {
        enabled: true,
        apiKey: process.env.GEMINI_API_KEY || '',
        provider: 'gemini'
    }
};

/**
 * Simular conversa completa
 */
async function simulateConversation(testName, messages, expectedFlow) {
    console.log(`\n${colors.cyan}════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}Teste: ${testName}${colors.reset}`);
    console.log(`${colors.cyan}════════════════════════════════════════${colors.reset}`);

    const whatsappId = `test_${Date.now()}@c.us`;
    const tenantId = 'test-tenant';
    let passed = true;
    let responses = [];

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`\n${colors.blue}[Cliente]${colors.reset} ${msg}`);

        try {
            const result = await handleConversation({
                message: msg,
                whatsappId,
                tenantId,
                customerName: 'Cliente Teste',
                menuData: mockMenuData,
                tenantSettings: mockTenantSettings,
                db: mockDb
            });

            if (result && result.response) {
                console.log(`${colors.green}[Bot]${colors.reset} ${result.response.substring(0, 200)}${result.response.length > 200 ? '...' : ''}`);
                responses.push(result.response);

                // Verificar se resposta contem palavras esperadas
                if (expectedFlow[i]) {
                    const expected = expectedFlow[i];
                    const hasExpected = expected.some(word =>
                        result.response.toLowerCase().includes(word.toLowerCase())
                    );

                    if (hasExpected) {
                        console.log(`${colors.green}  ✓ Resposta valida${colors.reset}`);
                    } else {
                        console.log(`${colors.red}  ✗ Esperado: ${expected.join(' ou ')}${colors.reset}`);
                        passed = false;
                    }
                }
            } else {
                console.log(`${colors.yellow}[Bot] (sem resposta - modo link)${colors.reset}`);
            }
        } catch (error) {
            console.log(`${colors.red}[Erro] ${error.message}${colors.reset}`);
            passed = false;
        }

        // Delay entre mensagens
        await new Promise(r => setTimeout(r, 1000));
    }

    // Limpar sessao
    removeSession(whatsappId, tenantId);

    console.log(`\n${passed ? colors.green + '✓ TESTE PASSOU' : colors.red + '✗ TESTE FALHOU'}${colors.reset}`);
    return { passed, responses };
}

/**
 * Teste 1: Saudacao Simples
 */
async function testGreeting() {
    return simulateConversation(
        'Saudacao Simples',
        ['oi'],
        [['bem-vindo', 'ola', 'querer', 'pedir']]
    );
}

/**
 * Teste 2: Pedir um item
 */
async function testAddSingleItem() {
    return simulateConversation(
        'Pedir Item Simples',
        [
            'oi',
            'quero um x-bacon'
        ],
        [
            ['bem-vindo', 'ola'],
            ['bacon', 'anotado', 'adicionado', 'adicional']
        ]
    );
}

/**
 * Teste 3: Pedir com quantidade
 */
async function testAddWithQuantity() {
    return simulateConversation(
        'Pedir com Quantidade',
        [
            'oi',
            'quero 2 x-burger'
        ],
        [
            ['bem-vindo'],
            ['burger', '2', 'anotado']
        ]
    );
}

/**
 * Teste 4: Fluxo completo de pedido
 */
async function testFullOrderFlow() {
    return simulateConversation(
        'Fluxo Completo de Pedido',
        [
            'oi',
            'quero um x-bacon',
            'nao quero adicional',
            'uma coca lata',
            'fechar pedido',
            'entrega',
            'Rua das Flores, 123',
            'pix'
        ],
        [
            ['bem-vindo'],
            ['bacon', 'anotado', 'adicional'],
            ['mais', 'alguma'],
            ['coca', 'lata', 'anotado'],
            ['total', 'fechar', 'entrega', 'retirada'],
            ['endereco', 'localizacao'],
            ['pagamento', 'pix', 'cartao', 'dinheiro'],
            ['confirmado', 'pedido', 'agradecemos']
        ]
    );
}

/**
 * Teste 5: Ver carrinho
 */
async function testViewCart() {
    return simulateConversation(
        'Ver Carrinho',
        [
            'oi',
            'quero um x-tudo',
            'nao',
            'ver meu pedido'
        ],
        [
            ['bem-vindo'],
            ['tudo', 'anotado'],
            ['mais', 'alguma'],
            ['pedido', 'total', 'R$']
        ]
    );
}

/**
 * Teste 6: Cancelar pedido
 */
async function testCancelOrder() {
    return simulateConversation(
        'Cancelar Pedido',
        [
            'oi',
            'quero um x-burger',
            'cancelar pedido'
        ],
        [
            ['bem-vindo'],
            ['burger', 'anotado'],
            ['cancelado', 'chamar']
        ]
    );
}

/**
 * Teste 7: Pedir ajuda
 */
async function testHelp() {
    return simulateConversation(
        'Pedir Ajuda',
        [
            'oi',
            'ajuda'
        ],
        [
            ['bem-vindo'],
            ['ajudar', 'como', 'diga', 'pedir']
        ]
    );
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
    console.log(`\n${colors.magenta}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.magenta}║    TESTES AUTOMATIZADOS - BOT IA       ║${colors.reset}`);
    console.log(`${colors.magenta}╚════════════════════════════════════════╝${colors.reset}`);

    // Verificar API Key
    if (!mockTenantSettings.aiBot.apiKey) {
        console.log(`\n${colors.red}ERRO: GEMINI_API_KEY nao definida!${colors.reset}`);
        console.log(`${colors.yellow}Execute: set GEMINI_API_KEY=sua-chave${colors.reset}`);
        process.exit(1);
    }

    const tests = [
        testGreeting,
        testAddSingleItem,
        testAddWithQuantity,
        testViewCart,
        testCancelOrder,
        testHelp,
        testFullOrderFlow
    ];

    const results = {
        passed: 0,
        failed: 0,
        total: tests.length
    };

    for (const test of tests) {
        try {
            const result = await test();
            if (result.passed) {
                results.passed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            console.log(`${colors.red}Erro no teste: ${error.message}${colors.reset}`);
            results.failed++;
        }

        // Delay entre testes
        await new Promise(r => setTimeout(r, 2000));
    }

    // Resumo final
    console.log(`\n${colors.magenta}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.magenta}║           RESUMO DOS TESTES            ║${colors.reset}`);
    console.log(`${colors.magenta}╚════════════════════════════════════════╝${colors.reset}`);
    console.log(`\n  Total:   ${results.total}`);
    console.log(`  ${colors.green}Passou:  ${results.passed}${colors.reset}`);
    console.log(`  ${colors.red}Falhou:  ${results.failed}${colors.reset}`);
    console.log(`\n  Taxa: ${((results.passed / results.total) * 100).toFixed(1)}%\n`);

    process.exit(results.failed > 0 ? 1 : 0);
}

// Executar se chamado diretamente
runAllTests().catch(console.error);
