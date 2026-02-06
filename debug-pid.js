
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const DB_PATH = path.resolve('server/database/deliveryhub.sqlite');
const TENANT_ID = 'demo_tenant_001';
const TARGET_PID = '554112345678901';

async function debugQuery() {
    try {
        console.log(`Abrindo banco: ${DB_PATH}`);
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log(`Executando Query...`);
        console.log(`Tenant: '${TENANT_ID}'`);
        console.log(`PID: '${TARGET_PID}'`);

        // Verificar o que tem na tabela
        const all = await db.all('SELECT * FROM pid_jid_mappings LIMIT 5');
        console.log('--- Amostra de dados no banco ---');
        console.log(all);

        // Tentar buscar o específico
        const row = await db.get(
            'SELECT jid FROM pid_jid_mappings WHERE tenant_id = ? AND pid = ?',
            [TENANT_ID, TARGET_PID]
        );

        console.log('--- Resultado da Busca ---');
        if (row) {
            console.log('✅ ACHOU:', row);
        } else {
            console.log('❌ NÃO ACHOU.');
        }

        await db.close();
    } catch (error) {
        console.error('Erro:', error);
    }
}

debugQuery();
