
import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function listProducts() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3Pkg.Database
    });

    const tenants = await db.all("SELECT id, name FROM tenants WHERE status = 'ACTIVE'");

    const result = {};

    for (const t of tenants) {
        const products = await db.all(
            "SELECT name, price, description FROM products WHERE tenant_id = ? AND is_available = 1",
            [t.id]
        );
        result[t.name] = products.map(p => p.name);
    }

    console.log(JSON.stringify(result, null, 2));
    await db.close();
}

listProducts();
