import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function resetAntiDup() {
    const db = await open({
        filename: './database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    console.log('Resetando anti-duplicação...\n');

    // Buscar tenant Fiorella
    const tenant = await db.get(`SELECT id, name FROM tenants WHERE name = 'Fiorella'`);

    if (!tenant) {
        console.log('❌ Tenant Fiorella não encontrado');
        await db.close();
        return;
    }

    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`Resetando cache de mensagens para número 554191798537@c.us\n`);

    // Nota: O anti-duplicação está em memória (welcomeLogs, linkLogs)
    // Não está no banco de dados
    // Para resetar, precisamos reiniciar o servidor ou criar endpoint API
    console.log('⚠️  IMPORTANTE: O anti-duplicação está em MEMÓRIA');
    console.log('Para resetar completamente, reinicie o servidor!\n');
    console.log('Ou você pode esperar o cache expirar (configurado em WELCOME_RESEND_HOURS)');

    await db.close();
}

resetAntiDup().catch(console.error);
