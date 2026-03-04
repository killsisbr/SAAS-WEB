import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listSchema() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

    console.log('--- Tables ---');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.table(tables);

    for (const table of tables) {
        if (table.name.includes('addon') || table.name.includes('complement')) {
            console.log(`\n--- Schema for ${table.name} ---`);
            const schema = await db.all(`PRAGMA table_info(${table.name})`);
            console.table(schema);
        }
    }

    await db.close();
}

listSchema().catch(console.error);
