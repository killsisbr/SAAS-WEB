// Script para criar tabela de mapeamentos
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function createTable() {
    const db = await open({
        filename: 'server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS product_mappings (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            keyword TEXT NOT NULL,
            product_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tenant_id, keyword)
        )
    `);

    console.log('✅ Tabela product_mappings criada!');

    const count = await db.get('SELECT COUNT(*) as c FROM product_mappings');
    console.log('Total mapeamentos:', count.c);

    await db.close();
}

createTable().catch(console.error);
