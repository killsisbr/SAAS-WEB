/**
 * Leitor de Dados do Pedido (pós-conversa)
 */

import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function openDatabase() {
    const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');
    return open({
        filename: dbPath,
        driver: sqlite3Pkg.Database
    });
}

async function readOrderData() {
    const db = await openDatabase();

    console.log('🔍 Buscando última conversa da IA...');

    // Buscar última conversa (deveria ser nosso teste)
    const conversation = await db.get(
        `SELECT * FROM ai_conversations 
         WHERE customer_phone = '5511988887777' 
         ORDER BY updated_at DESC LIMIT 1`
    );

    if (conversation) {
        console.log(`\n📅 Iniciada em: ${conversation.created_at}`);
        console.log(`📊 Status: ${conversation.status}`);

        if (conversation.order_data) {
            console.log('\n📦 DADOS DO PEDIDO EXTRAÍDOS:');
            console.log(JSON.stringify(JSON.parse(conversation.order_data), null, 2));
        } else {
            console.log('\n⚠️ Nenhum dado de pedido extraído ainda.');
        }

        // Mostrar últimas mensagens para contexto
        const messages = JSON.parse(conversation.messages || '[]');
        console.log(`\n💬 Últimas 3 mensagens:`);
        messages.slice(-3).forEach(m => {
            console.log(`   [${m.role}]: ${m.content}`);
        });

    } else {
        console.log('❌ Nenhuma conversa encontrada para o número de teste.');
    }

    await db.close();
}

readOrderData();
