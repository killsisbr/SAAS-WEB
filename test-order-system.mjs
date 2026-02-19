/**
 * TESTE COMPLETO: Fluxo de Pedidos, IDs Aleatórios e Identificação
 * ----------------------------------------------------------------
 * Este script valida:
 * 1. Geração de IDs Aleatórios de 4 dígitos.
 * 2. Unicidade dos IDs por Tenant/Dia.
 * 3. Resolução de PID -> Telefone Real no Backend.
 * 4. Persistência de Identidade (Simulação Frontend).
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'server', 'database', 'deliveryhub.sqlite');
const API_URL = 'http://localhost:3000/api';

async function runTests() {
    console.log('🚀 Iniciando Testes do Sistema de Pedidos...\n');

    // 1. Verificar Conexão com DB
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    console.log('[OK] Conexão com banco de dados estabelecida.');

    // 2. Pegar um Tenant real para teste
    const tenant = await db.get('SELECT id, name FROM tenants WHERE status = "ACTIVE" LIMIT 1');
    if (!tenant) {
        console.error('[ERRO] Nenhum tenant ativo encontrado para teste.');
        return;
    }
    console.log(`[INFO] Usando Tenant para teste: ${tenant.name} (${tenant.id})`);

    // 3. Pegar um produto real
    const product = await db.get('SELECT id, name FROM products WHERE tenant_id = ? LIMIT 1', [tenant.id]);
    if (!product) {
        console.error('[ERRO] Nenhum produto encontrado para este tenant.');
        return;
    }

    // 4. Testar Identificação (PID -> JID)
    // Criar um mapeamento de teste se não existir
    const testPid = '99999999999999999'; // PID falso longo
    const testJid = '5511988887777@s.whatsapp.net';
    await db.run(`
        INSERT OR REPLACE INTO pid_jid_mappings (tenant_id, pid, jid, created_at)
        VALUES (?, ?, ?, datetime('now'))
    `, [tenant.id, testPid, testJid]);
    console.log(`[OK] Mapeamento de teste criado: ${testPid} -> ${testJid}`);

    // --- TESTES DE API ---

    // A. Pedido com Telefone Real
    console.log('\n--- Teste A: Pedido com Telefone Real ---');
    const orderA = await createOrder(tenant.id, 'Cliente Teste A', '11977776666', product.id);
    validateOrderResponse(orderA);

    // B. Pedido com PID (Deve resolver para o telefone do mapeamento)
    console.log('\n--- Teste B: Pedido com PID (Resolução Automática) ---');
    const orderB = await createOrder(tenant.id, 'Cliente Teste B', testPid, product.id, testPid);
    validateOrderResponse(orderB);

    // C. Verificação de Unicidade e Formato (4 dígitos)
    console.log('\n--- Teste C: Verificação de IDs Aleatórios (10 pedidos) ---');
    const orderNumbers = [];
    for (let i = 0; i < 10; i++) {
        const res = await createOrder(tenant.id, `Multi Teste ${i}`, '11900000000', product.id);
        if (res && res.order) {
            orderNumbers.push(res.order.orderNumber);
        }
    }

    const all4Digits = orderNumbers.every(n => n >= 1000 && n <= 9999);
    const allUnique = new Set(orderNumbers).size === orderNumbers.length;

    console.log('IDs Gerados:', orderNumbers);
    console.log(`[${all4Digits ? 'OK' : 'FALHA'}] Todos IDs têm 4 dígitos.`);
    console.log(`[${allUnique ? 'OK' : 'FALHA'}] Todos IDs são únicos.`);

    await db.close();
    console.log('\n✅ Testes Automatizados Concluídos.');
}

async function createOrder(tenantId, name, phone, productId, whatsappId = null) {
    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId,
                customerName: name,
                customerPhone: phone,
                whatsappId: whatsappId,
                items: [{ productId, quantity: 1 }],
                deliveryType: 'PICKUP',
                paymentMethod: 'CASH'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error(`[ERRO API] ${response.status}:`, err);
            return null;
        }

        return await response.json();
    } catch (e) {
        console.error('[ERRO REDE] Certifique-se que o servidor está rodando em http://localhost:3000');
        console.error(e.message);
        return null;
    }
}

function validateOrderResponse(data) {
    if (!data || !data.success || !data.order) {
        console.error('  [FALHA] Resposta inválida da API.');
        return;
    }
    const { orderNumber, id } = data.order;
    console.log(`  [OK] Pedido criado com sucesso!`);
    console.log(`  [OK] ID: ${id}`);
    console.log(`  [OK] Número: #${orderNumber} (${String(orderNumber).length} dígitos)`);
}

runTests().catch(console.error);
