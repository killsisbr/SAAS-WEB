import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function dump() {
    const db = await open({
        filename: './server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    const tenantId = 'demo_tenant_001';
    console.log(`\n--- USANDO TENANT ID: ${tenantId} ---`);
    console.log(`--- PRODUCTS PERTENECIENTES A ${tenantId} ---`);
    const products = await db.all('SELECT id, name, price, has_addons FROM products WHERE tenant_id = ?', [tenantId]);
    console.table(products);

    console.log(`\n--- ADDON GROUPS PARA O TENANT ---`);
    const groups = await db.all('SELECT id, category_id, name FROM addon_groups WHERE tenant_id = ?', [tenantId]);
    console.table(groups);

    console.log(`\n--- ADDON ITEMS PARA OS GRUPOS ---`);
    if (groups.length > 0) {
        const groupIds = groups.map(g => `'${g.id}'`).join(',');
        const items = await db.all(`SELECT id, group_id, name, price FROM addon_items WHERE group_id IN (${groupIds})`);
        console.table(items);
    } else {
        console.log('Nenhum grupo de adicionais encontrado.');
    }

    console.log(`\n--- ACAI ADICIONAIS PARA O TENANT ---`);
    const acaiAddons = await db.all('SELECT id, nome, preco, ativo FROM acai_adicionais WHERE tenant_id = ?', [tenantId]);
    console.table(acaiAddons);

    await db.close();
}

dump();
