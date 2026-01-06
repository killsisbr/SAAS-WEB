// ============================================================
// Teste Interativo - Bot IA WhatsApp
// Permite conversar manualmente com o bot para debug
// ============================================================

import readline from 'readline';
import { handleConversation } from '../services/conversation-handler.js';
import { getOrCreateSession, removeSession } from '../services/order-session.js';

// Cores
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
};

// Mock dados
const mockDb = {
    async get(q, p) { return null; },
    async all(q, p) { return []; },
    async run(q, p) { return { lastID: Math.floor(Math.random() * 1000) }; }
};

const mockMenu = {
    categories: [
        { id: 1, name: 'Hamburgueres' },
        { id: 2, name: 'Bebidas' }
    ],
    products: [
        { id: 1, name: 'X-Burger', price: 18.00, category_id: 1 },
        { id: 2, name: 'X-Bacon', price: 22.00, category_id: 1 },
        { id: 3, name: 'X-Tudo', price: 28.00, category_id: 1 },
        { id: 4, name: 'Coca-Cola Lata', price: 6.00, category_id: 2 },
        { id: 5, name: 'Coca-Cola 600ml', price: 8.00, category_id: 2 },
        { id: 6, name: 'Guarana Lata', price: 5.00, category_id: 2 }
    ],
    addons: [
        { id: 1, product_id: 2, name: 'Bacon extra', price: 4.00 },
        { id: 2, product_id: 2, name: 'Queijo extra', price: 3.00 }
    ]
};

const mockSettings = {
    name: 'Brutus Burger',
    aiBot: {
        enabled: true,
        apiKey: process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '',
        provider: process.env.GROQ_API_KEY ? 'groq' : 'gemini'
    }
};

const whatsappId = 'interactive_test@c.us';
const tenantId = 'test-tenant';

async function main() {
    console.log(`\n${c.magenta}╔════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.magenta}║    MODO INTERATIVO - BOT IA            ║${c.reset}`);
    console.log(`${c.magenta}╚════════════════════════════════════════╝${c.reset}`);

    if (!mockSettings.aiBot.apiKey) {
        console.log(`\n${c.yellow}⚠ API_KEY nao definida!${c.reset}`);
        console.log(`${c.gray}Execute: set GROQ_API_KEY=sua-chave${c.reset}`);
        console.log(`${c.gray}     ou: set GEMINI_API_KEY=sua-chave${c.reset}\n`);
        process.exit(1);
    }

    console.log(`\n${c.cyan}Provider: ${mockSettings.aiBot.provider.toUpperCase()}${c.reset}`);

    console.log(`\n${c.gray}Cardapio disponivel:${c.reset}`);
    mockMenu.products.forEach(p => {
        console.log(`  ${c.cyan}${p.name}${c.reset} - R$ ${p.price.toFixed(2)}`);
    });

    console.log(`\n${c.gray}Digite suas mensagens como se fosse o cliente.${c.reset}`);
    console.log(`${c.gray}Comandos: /reset (limpa sessao) | /quit (sair)${c.reset}\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => {
        rl.question(`${c.blue}Voce: ${c.reset}`, async (input) => {
            const msg = input.trim();

            if (!msg) {
                prompt();
                return;
            }

            if (msg === '/quit') {
                console.log(`\n${c.gray}Ate logo!${c.reset}\n`);
                rl.close();
                process.exit(0);
            }

            if (msg === '/reset') {
                removeSession(whatsappId, tenantId);
                console.log(`${c.yellow}Sessao resetada!${c.reset}\n`);
                prompt();
                return;
            }

            if (msg === '/status') {
                const session = getOrCreateSession(whatsappId, tenantId);
                console.log(`${c.gray}Estado: ${session.state}${c.reset}`);
                console.log(`${c.gray}Itens: ${session.items.length}${c.reset}`);
                console.log(`${c.gray}Total: R$ ${session.getTotal().toFixed(2)}${c.reset}\n`);
                prompt();
                return;
            }

            try {
                const result = await handleConversation({
                    message: msg,
                    whatsappId,
                    tenantId,
                    customerName: 'Voce',
                    menuData: mockMenu,
                    tenantSettings: mockSettings,
                    db: mockDb
                });

                if (result && result.response) {
                    console.log(`${c.green}Bot: ${c.reset}${result.response}\n`);

                    if (result.orderCreated) {
                        console.log(`${c.magenta}[PEDIDO CRIADO #${result.orderCreated.orderNumber}]${c.reset}\n`);
                    }
                } else {
                    console.log(`${c.yellow}(IA desabilitada - resposta do modo link)${c.reset}\n`);
                }
            } catch (error) {
                console.log(`${c.yellow}Erro: ${error.message}${c.reset}\n`);
            }

            prompt();
        });
    };

    prompt();
}

main().catch(console.error);
