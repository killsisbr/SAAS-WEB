
/**
 * Analyze AI Results
 * Busca conversas de teste recentes e gera relatório de precisão.
 */

import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyze() {
    console.log('📊 ANALISANDO RESULTADOS DOS TESTES IA\n');

    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3Pkg.Database
    });

    // Buscar conversas de teste (números 55119999%) nas últimas 24h
    const conversations = await db.all(
        `SELECT * FROM ai_conversations 
         WHERE customer_phone LIKE '55119999%' 
         ORDER BY updated_at DESC LIMIT 20`
    );

    if (conversations.length === 0) {
        console.log('⚠️ Nenhuma conversa de teste encontrada.');
        await db.close();
        return;
    }

    let passedCount = 0;
    let fallbackCount = 0;
    let total = conversations.length;

    console.log(`Encontradas ${total} conversas de teste.\n`);

    for (const conv of conversations) {
        const tenant = await db.get("SELECT name FROM tenants WHERE id = ?", [conv.tenant_id]);
        const tenantName = tenant ? tenant.name : conv.tenant_id;

        console.log(`📱 ${conv.customer_phone} (${tenantName})`);
        console.log(`   Status: ${conv.status}`);

        if (conv.order_data) {
            const order = JSON.parse(conv.order_data);
            const isLLM = order.executionType === 'LLM_EXTRACTION';

            if (isLLM) {
                console.log(`   ✅ Extração LLM: SUCESSO`);
                passedCount++;
            } else {
                console.log(`   ⚠️ Extração Fallback: REGEX (Limitado)`);
                fallbackCount++;
            }

            if (order.items) {
                console.log(`   🛒 Itens: ${order.items.length}`);
                order.items.forEach(i => console.log(`      - ${i.quantity}x ${i.name} ${i.observation ? `(${i.observation})` : ''}`));
            }
            if (order.paymentMethod) console.log(`   💰 Pagamento: ${order.paymentMethod}`);
            if (order.deliveryType) console.log(`   🚚 Entrega: ${order.deliveryType}`);

        } else {
            console.log(`   ❌ NENHUM DADO DE PEDIDO EXTRAÍDO`);
        }
        console.log('--------------------------------------------------');
    }

    console.log(`\n📈 RESUMO:`);
    console.log(`Total Testes: ${total}`);
    console.log(`Extração Inteligente (LLM): ${passedCount} (${Math.round(passedCount / total * 100)}%)`);
    console.log(`Extração Básica (Fallback): ${fallbackCount}`);

    await db.close();
}

analyze();
