import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createLesson, applyLesson } from './ai-reinforcement/processors/lesson-engine.js';
import { runSandboxTest } from './ai-reinforcement/processors/sandbox-tester.js';

async function testFlow() {
    console.log('🧪 Iniciando teste de fluxo de lições...\n');

    // Caminho absoluto para o banco para evitar erros de diretório
    const dbPath = 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/database/deliveryhub.sqlite';

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const tenantId = 'demo_tenant_001'; // ID padrão do seed

    try {
        // Limpar possíveis resquícios do teste anterior
        await db.run('DELETE FROM product_mappings WHERE tenant_id = ? AND keyword = ?', [tenantId, 'marmitex']);
        await db.run('DELETE FROM learned_patterns WHERE tenant_id = ? AND customer_input = ?', [tenantId, 'marmitex']);

        // 1. Criar uma lição (Simulando erro detectado)
        console.log('1. Criando lição...');
        const lesson = await createLesson(db, {
            tenantId,
            problemType: 'PRODUCT_NOT_FOUND',
            customerInput: 'marmitex',
            expectedProductId: 'p1', // Marmita P no seed
            expectedProductName: 'Marmita P',
            confidence: 0.9,
            reason: 'Cliente usou termo comum não mapeado'
        });

        if (!lesson) {
            console.error('❌ Falha ao criar lição');
            return;
        }
        console.log(`✅ Lição criada ID: ${lesson.id}`);

        // 2. Testar Sandbox
        console.log('\n2. Executando teste Sandbox...');
        const products = [
            { id: 'p1', name: 'Marmita P', price: 15 },
            { id: 'p2', name: 'Marmita M', price: 18 }
        ];

        const testResult = await runSandboxTest(db, lesson, products);
        console.log(`Resultado do teste: ${testResult.passed ? '✅ PASSOU' : '❌ FALHOU'}`);
        console.log(`Score: ${testResult.score}`);

        // 3. Aplicar lição
        console.log('\n3. Aplicando lição...');
        const applyResult = await applyLesson(db, lesson.id, 'test-runner');

        if (applyResult.success) {
            console.log('✅ Lição aplicada com sucesso!');
        } else {
            console.error(`❌ Falha ao aplicar lição: ${applyResult.error}`);
        }

        // 4. Verificar no banco
        console.log('\n4. Verificando no banco de mapeamentos...');
        const mapping = await db.get(
            'SELECT * FROM product_mappings WHERE tenant_id = ? AND keyword = ?',
            [tenantId, 'marmitex']
        );

        if (mapping && mapping.product_id === 'p1') {
            console.log('✅ Verificação concluída: Mapeamento "marmitex" -> "p1" encontrado!');
        } else {
            console.error('❌ Verificação falhou: Mapeamento não encontrado ou incorreto');
        }

    } catch (err) {
        console.error('❌ Erro durante o teste:', err.message);
    } finally {
        await db.close();
    }

    console.log('\n✨ Teste de fluxo finalizado.');
}

testFlow();
