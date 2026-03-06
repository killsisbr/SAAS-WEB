import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function listTenants() {
    const dbPath = path.resolve('./database/deliveryhub.sqlite');
    console.log('Opening database:', dbPath);

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const tenants = await db.all('SELECT id, name FROM tenants');
    console.log('--- ALL TENANTS ---');
    tenants.forEach(t => console.log(`${t.id} | ${t.name}`));

    await db.close();
}

listTenants().catch(console.error);
