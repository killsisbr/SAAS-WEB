import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listBuffetItems() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- buffet_items for qdeliciasorveteria ---`);
    const items = await db.all(`SELECT * FROM buffet_items WHERE tenant_id = ?`, [tenantId]);
    console.table(items);

    await db.close();
}

listBuffetItems().catch(console.error);
