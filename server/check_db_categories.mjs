import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkData() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    const categories = await db.all(`
        SELECT t.slug, c.name as category_name 
        FROM categories c 
        JOIN tenants t ON c.tenant_id = t.id 
        LIMIT 20
    `);

    console.log(JSON.stringify(categories, null, 2));
    await db.close();
}

checkData();
