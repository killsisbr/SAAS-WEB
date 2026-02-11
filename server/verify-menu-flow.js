
import { AgentEmployee } from './agent-employee/index.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    console.log('🚀 Iniciando Teste de Fluxo Completo de Pedido (Texto)...\n');

    // 1. Conectar ao Banco
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    // 2. Configurar Tenant e Agente
    const tenantId = 'demo_tenant_001';
    const customerPhone = '5511999998888'; // Cliente Teste Novo
    const pushName = 'Tester Menu';

    // Mock de Configuração da IA
    const aiConfig = {
        employeeName: 'Ana',
        storeName: 'Brutus Burger',
        ollamaUrl: 'http://localhost:11434',
        model: 'qwen3:8b'
    };

    console.log('[Setup] Inicializando AgentEmployee...');
    const agent = new AgentEmployee(db, tenantId, aiConfig);
    await agent.initialize(); // Carrega produtos

    // Helper para enviar mensagem e logar resposta
    async function send(msg) {
        console.log(`\n💬 [Cliente]: "${msg}"`);
        const result = await agent.handleMessage(customerPhone, msg, pushName);

        console.log(`🤖 [Ana]: ${result.message}`);
        if (result.orderCreated) {
            console.log(`✅ PEDIDO CRIADO: #${result.orderCreated.orderNumber}`);
            console.log(`   Itens: ${JSON.stringify(result.orderCreated.items, null, 2)}`);
            console.log(`   Total: R$ ${result.orderCreated.total}`);
        }
        return result;
    }

    // --- CENÁRIO DE TESTE ---

    // 1. Saudação
    await send('Oi, boa noite');

    // 2. Pedir Cardápio
    await send('O que tem pra comer hoje?');

    // 3. Pedido Complexo (Item Principal + Bebida)
    // Assumindo que existem produtos com nomes aproximados no banco
    await send('Eu vou querer um X-Salada e uma Coca-Cola lata');

    // 4. Adicional
    await send('Coloca bacon extra no lanche, por favor');

    // 5. Finalizar
    await send('Só isso, pode fechar');

    // 6. Tipo de Entrega
    await send('Entrega');

    // 7. Endereço (Texto manual)
    await send('Av. Paulista, 1000');

    // 8. Observação (Pular/Confirmar Nome depende do fluxo)
    // O estado seguinte geralmente é NOME se não tiver pegado do pushName ou perfil
    // Vamos assumir que ele pede o nome ou confirma
    await send('Carlos Silva');

    // 9. Pagamento
    await send('Vou pagar no Pix');

    // 10. Troco/Finalização
    // Se for PIX, geralmente finaliza direto. Se pedir troco, ele pergunta.
    // Vamos ver a resposta anterior para decidir, mas no script sequencial vamos mandar um "ok" se precisar

    console.log('\n🏁 Teste Finalizado!');
}

runTest().catch(console.error);
