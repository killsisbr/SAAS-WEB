import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function run() {
    try {
        const db = await open({
            filename: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/database/deliveryhub.sqlite',
            driver: sqlite3.Database
        });
        const tenants = await db.all('SELECT id, slug, name FROM tenants');
        console.log(JSON.stringify(tenants, null, 2));

        // Also get settings for one of them
        if (tenants.length > 0) {
            const settings = await db.get('SELECT settings FROM tenants WHERE id = ?', [tenants[0].id]);
            console.log('\nSETTINGS FOR ' + tenants[0].id + ':');
            console.log(settings.settings);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
