import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkTenants() {
    const db = await open({
        filename: './server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    const tenants = await db.all("SELECT id, name, settings FROM tenants WHERE status = 'ACTIVE'");

    console.log('\n=== TENANTS ATIVOS ===\n');
    for (const t of tenants) {
        const s = JSON.parse(t.settings || '{}');
        console.log(`ID: ${t.id}`);
        console.log(`Nome: ${t.name}`);
        console.log(`Bot Habilitado: ${s.whatsappBotEnabled || false}`);
        console.log(`Modo Pedido: ${s.whatsappOrderMode || 'link'}`);
        console.log('---');
    }

    await db.close();
}

checkTenants();
