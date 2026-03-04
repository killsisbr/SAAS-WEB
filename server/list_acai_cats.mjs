import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listCategories() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- Categories for qdeliciasorveteria ---`);
    const cats = await db.all(`SELECT id, name FROM categories WHERE tenant_id = ?`, [tenantId]);
    console.table(cats);

    await db.close();
}

listCategories().catch(console.error);
