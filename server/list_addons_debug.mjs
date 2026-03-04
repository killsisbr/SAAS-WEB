import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listData() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- acai_adicionais for qdeliciasorveteria ---`);
    const acaiAddons = await db.all('SELECT * FROM acai_adicionais WHERE tenant_id = ?', [tenantId]);
    console.table(acaiAddons);

    console.log(`\n--- addon_groups and addon_items for qdeliciasorveteria ---`);
    const genericAddons = await db.all(`
        SELECT g.name as group_name, i.name as item_name, i.price 
        FROM addon_groups g 
        JOIN addon_items i ON g.id = i.group_id 
        WHERE g.tenant_id = ?
    `, [tenantId]);
    console.table(genericAddons);

    await db.close();
}

listData().catch(console.error);
