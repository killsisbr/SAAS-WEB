import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function listAllBeverages() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const categoryId = '8c56b521-e2fb-43fa-b76c-d3c8c2e1bc15'; // Bebidas

    console.log(`\n--- All Products in category 'Bebidas' ---`);
    const products = await db.all(`
        SELECT id, name, price, is_available 
        FROM products 
        WHERE category_id = ?
    `, [categoryId]);
    console.table(products);

    await db.close();
}

listAllBeverages().catch(console.error);
