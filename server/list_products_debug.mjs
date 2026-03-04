import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listData() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria
    const acaiCatId = '7bb429c0-3bcc-41ac-a858-c36bc79593fa';
    const buffetCatId = 'c7640b73-fbfd-4229-942f-e06c6e8e58c0';

    console.log(`\n--- Products in Açaí Category ---`);
    const acaiProducts = await db.all('SELECT id, name, price FROM products WHERE category_id = ?', [acaiCatId]);
    console.table(acaiProducts);

    console.log(`\n--- Products in Buffet (Potential Addons) Category ---`);
    const buffetProducts = await db.all('SELECT id, name, price FROM products WHERE category_id = ?', [buffetCatId]);
    console.table(buffetProducts);

    await db.close();
}

listData().catch(console.error);
