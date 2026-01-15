// Migration: Adicionar campos de Pizza ao sistema
// Execute com: node database/scripts/migrate-pizza.mjs (de dentro da pasta server)

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'deliveryhub.sqlite');

console.log('=== Iniciando Migration: Sistema de Pizzaria ===');
console.log('Database:', dbPath, '\n');

async function migrate() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Helper para verificar se coluna existe
    async function columnExists(table, column) {
        const info = await db.all(`PRAGMA table_info(${table})`);
        return info.some(col => col.name === column);
    }

    // Helper para verificar se tabela existe
    async function tableExists(tableName) {
        const result = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, tableName);
        return !!result;
    }

    try {
        // 1. Adicionar display_mode em categories
        if (!(await columnExists('categories', 'display_mode'))) {
            await db.exec(`ALTER TABLE categories ADD COLUMN display_mode TEXT DEFAULT 'default'`);
            console.log('[OK] Coluna display_mode adicionada em categories');
        } else {
            console.log('[SKIP] Coluna display_mode ja existe em categories');
        }

        // 2. Adicionar campos de pizza em products
        if (!(await columnExists('products', 'sizes'))) {
            await db.exec(`ALTER TABLE products ADD COLUMN sizes TEXT DEFAULT '[]'`);
            console.log('[OK] Coluna sizes adicionada em products');
        } else {
            console.log('[SKIP] Coluna sizes ja existe em products');
        }

        if (!(await columnExists('products', 'size_prices'))) {
            await db.exec(`ALTER TABLE products ADD COLUMN size_prices TEXT DEFAULT '[]'`);
            console.log('[OK] Coluna size_prices adicionada em products');
        } else {
            console.log('[SKIP] Coluna size_prices ja existe em products');
        }

        if (!(await columnExists('products', 'has_sizes'))) {
            await db.exec(`ALTER TABLE products ADD COLUMN has_sizes INTEGER DEFAULT 0`);
            console.log('[OK] Coluna has_sizes adicionada em products');
        } else {
            console.log('[SKIP] Coluna has_sizes ja existe em products');
        }

        if (!(await columnExists('products', 'allow_half'))) {
            await db.exec(`ALTER TABLE products ADD COLUMN allow_half INTEGER DEFAULT 0`);
            console.log('[OK] Coluna allow_half adicionada em products');
        } else {
            console.log('[SKIP] Coluna allow_half ja existe em products');
        }

        // 3. Criar tabela pizza_borders
        if (!(await tableExists('pizza_borders'))) {
            await db.exec(`
                CREATE TABLE pizza_borders (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price REAL DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    order_index INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
                )
            `);
            console.log('[OK] Tabela pizza_borders criada');
        } else {
            console.log('[SKIP] Tabela pizza_borders ja existe');
        }

        // 4. Criar indice para pizza_borders
        try {
            await db.exec(`CREATE INDEX IF NOT EXISTS idx_pizza_borders_tenant ON pizza_borders(tenant_id)`);
            console.log('[OK] Indice idx_pizza_borders_tenant criado');
        } catch (e) {
            console.log('[SKIP] Indice ja existe');
        }

        console.log('\n=== Migration concluida com sucesso! ===');

    } catch (error) {
        console.error('[ERRO] Migration falhou:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

migrate();
