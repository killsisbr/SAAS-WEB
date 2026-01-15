// Migração: Adicionar coluna display_mode na tabela categories
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
    console.log('=== Migração: display_mode ===\n');

    const db = await open({
        filename: join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    try {
        await db.run("ALTER TABLE categories ADD COLUMN display_mode TEXT DEFAULT 'default'");
        console.log('[OK] Coluna display_mode adicionada com sucesso!');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('[OK] Coluna display_mode já existe');
        } else {
            console.error('[ERRO]', e.message);
        }
    }

    // Verificar se a coluna existe
    const columns = await db.all("PRAGMA table_info(categories)");
    const hasDisplayMode = columns.some(c => c.name === 'display_mode');
    console.log('\nColunas da tabela categories:');
    columns.forEach(c => console.log(`  - ${c.name} (${c.type})`));
    console.log(`\ndisplay_mode existe: ${hasDisplayMode ? 'SIM' : 'NÃO'}`);

    await db.close();
}

migrate().catch(console.error);
