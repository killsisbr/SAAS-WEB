import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentEmployee } from '../agent-employee/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    console.log('🚀 Iniciando Verificação de Pedido de Açaí com Adicionais Pagos...\n');

    const db = await open({
        filename: path.join(__dirname, '..', 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    const tenantSlug = 'qdeliciasorveteria';
    const tenantRow = await db.get("SELECT id, name FROM tenants WHERE slug = ?", [tenantSlug]);

    if (!tenantRow) {
        console.error(`❌ Tenant ${tenantSlug} não encontrado.`);
        process.exit(1);
    }

    const tenantId = tenantRow.id;
    console.log(`[INFO] Testando para: ${tenantRow.name} (${tenantId})`);

    const aiConfig = {
        employeeName: 'Ana',
        storeName: tenantRow.name,
        ollamaUrl: 'http://127.0.0.1:11434',
        model: 'gemma:2b' // Usando o modelo configurado no ambiente
    };

    const agent = new AgentEmployee(db, tenantId, aiConfig);
    await agent.initialize();

    const customerPhone = '5511999998888';
    const customerName = 'Izaque Teste';

    // Resetar sessão para garantir limpeza
    agent.resetSession(customerPhone);

    console.log(`\n--- Passo 1: Enviando pedido complexo ---`);
    const orderMsg = "quero um copo de açai de 500ml com morango e nutella";
    console.log(`👤 [${customerName}]: "${orderMsg}"`);

    const result = await agent.handleMessage(customerPhone, orderMsg, customerName);
    console.log(`🤖 [Ana]: ${result.message}`);

    const state = agent.getSessionState(customerPhone);
    console.log(`\n--- Passo 2: Validando Carrinho em Memória ---`);

    if (state.items.length > 0) {
        const item = state.items[0];
        console.log(`✅ Item: ${item.name} (${item.size}) - R$ ${item.price}`);

        const hasMorango = item.addons.some(a => a.name.toLowerCase().includes('morango'));
        const hasNutella = item.addons.some(a => a.name.toLowerCase().includes('nutella'));

        console.log(`   Adicionais encontrados: ${item.addons.map(a => `${a.name} (R$ ${a.price})`).join(', ')}`);

        if (hasMorango && hasNutella) {
            console.log(`✅ Sucesso: Adicionais pagos detectados.`);
        } else {
            console.log(`❌ Falha: Adicionais não detectados corretamente.`);
        }

        console.log(`   Subtotal: R$ ${state.subtotal}`);
        if (state.subtotal === 40) { // 25 (Açaí 500ml) + 5 (Morango) + 10 (Nutella)
            console.log(`✅ Sucesso: Preço total calculado corretamente (R$ 40,00).`);
        } else {
            console.log(`❌ Falha: Preço calculado incorretamente (Esperado R$ 40,00, obtido R$ ${state.subtotal}).`);
        }
    } else {
        console.log(`❌ Falha: Nenhum item adicionado ao carrinho.`);
    }

    console.log(`\n--- Passo 3: Finalizando Pedido ---`);
    await agent.handleMessage(customerPhone, "pode fechar", customerName);
    await agent.handleMessage(customerPhone, "retirada", customerName);
    await agent.handleMessage(customerPhone, "Izaque", customerName);
    await agent.handleMessage(customerPhone, "nada", customerName); // Observação
    const finalResult = await agent.handleMessage(customerPhone, "dinheiro", customerName);

    if (finalResult.orderCreated) {
        const order = finalResult.orderCreated;
        console.log(`✅ Pedido Criado no DB! ID: ${order.id} | Número: #${order.orderNumber}`);

        // Verificar no banco de dados se os itens foram salvos com os adicionais
        const dbOrder = await db.get("SELECT items, total FROM orders WHERE id = ?", [order.id]);
        const savedItems = JSON.parse(dbOrder.items);
        console.log(`\n--- Passo 4: Validando Persistência no DB ---`);
        console.log(`   Itens salvos no JSON:`, JSON.stringify(savedItems[0].addons));

        if (dbOrder.total === 40 && savedItems[0].addons.length >= 2) {
            console.log(`\n✨ SUCESSO TOTAL: O sistema está anotando e precificando corretamente!`);
        } else {
            console.log(`\n⚠️ Alerta: O pedido foi criado mas houve divergência nos dados salvos.`);
        }
    } else {
        console.log(`❌ Falha ao finalizar o pedido.`);
    }

    await db.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
