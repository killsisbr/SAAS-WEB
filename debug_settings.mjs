import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkSettings() {
    const dbPath = path.join(__dirname, 'server', 'database', 'deliveryhub.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const tenants = await db.all('SELECT id, name, settings FROM tenants');
    console.log(JSON.stringify(tenants, null, 2));
    await db.close();
}

checkSettings().catch(console.error);
