import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listAllAddons() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- All Addon Groups ---`);
    const groups = await db.all(`SELECT id, name FROM addon_groups WHERE tenant_id = ?`, [tenantId]);
    console.table(groups);

    for (const group of groups) {
        console.log(`\n--- Items in Group: ${group.name} (${group.id}) ---`);
        const items = await db.all(`SELECT name, price FROM addon_items WHERE group_id = ?`, [group.id]);
        console.table(items);
    }

    await db.close();
}

listAllAddons().catch(console.error);
