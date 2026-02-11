import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import AgentEmployee from './agent-employee/index.js';

async function test() {
    console.log('--- TESTANDO INTEGRAÇÃO DE ADICIONAIS E BUFFET ---');

    const db = await open({
        filename: './server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    const agent = new AgentEmployee(db, 'demo_tenant_001', {
        employeeName: 'Ana',
        storeName: 'Brutus Burger'
    });

    // 1. Testar Adicional de Bacon
    console.log('\n[Teste 1] Pedindo "X-Bacon com bacon extra"');
    let result = await agent.handleMessage('5511999999999', 'quero um x-bacon com bacon extra', 'Lucas');
    console.log('Resposta da Ana:', result.message.split('\n\n')[0]);
    console.log('Visual do Carrinho:\n', result.message.split('\n\n').slice(1).join('\n\n'));

    // 2. Testar Marmita com Buffet e tamanho
    console.log('\n[Teste 2] Pedindo \"uma marmita grande com arroz e feijão\"');
    result = await agent.handleMessage('5511999999999', 'quero uma marmita grande com arroz e feijao', 'Lucas');
    console.log('Resposta da Ana:', result.message.split('\n\n')[0]);
    console.log('Visual do Carrinho:\n', result.message.split('\n\n').slice(1).join('\n\n'));

    await db.close();
}

test();
