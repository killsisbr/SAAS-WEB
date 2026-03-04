import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listDrinks() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- Searching for Monster and Coca in qdeliciasorveteria ---`);
    const products = await db.all(`
        SELECT p.id, p.name, p.price, p.is_available, c.name as category
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.tenant_id = ? AND (p.name LIKE '%Monster%' OR p.name LIKE '%Coca%')
    `, [tenantId]);
    console.table(products);

    console.log(`\n--- Searching for Paleta de Paçoca ---`);
    const paleta = await db.all(`
        SELECT p.id, p.name, p.price, p.is_available, c.name as category
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.tenant_id = ? AND p.name LIKE '%Paleta%'
    `, [tenantId]);
    console.table(paleta);

    await db.close();
}

listDrinks().catch(console.error);
