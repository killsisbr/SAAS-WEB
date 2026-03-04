import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function checkMilkshakes() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log(`\n--- Milkshake Products (Sizes) ---`);
    const products = await db.all(`
        SELECT p.id, p.name, p.price 
        FROM products p 
        JOIN categories c ON p.category_id = c.id 
        WHERE p.tenant_id = ? AND c.name LIKE '%Milk Shake%'
    `, [tenantId]);
    console.table(products);

    console.log(`\n--- Addon Groups for Milk Shake ---`);
    // Finding groups linked to Milk Shake category or products
    const groups = await db.all(`
        SELECT g.id, g.name, g.min_selection, g.max_selection
        FROM addon_groups g
        WHERE g.tenant_id = ? AND (g.name LIKE '%Sabor%' OR g.name LIKE '%Milk%')
    `, [tenantId]);
    console.table(groups);

    for (const group of groups) {
        console.log(`\n--- Items in Group: ${group.name} (${group.id}) ---`);
        const items = await db.all(`
            SELECT name, price 
            FROM addon_items 
            WHERE group_id = ?
            ORDER BY name
        `, [group.id]);
        console.table(items);
    }

    await db.close();
}

checkMilkshakes().catch(console.error);
