import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
    console.log('--- SEEDING TEST DATA FOR demo_tenant_001 ---');

    const db = await open({
        filename: './server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    const tenantId = 'demo_tenant_001';

    // 1. Adicionar itens de buffet (Marmita)
    console.log('Adicionando itens de buffet...');
    const buffetItems = ['Arroz', 'Feijão', 'Batata Frita', 'Bife Acebolado', 'Farofa'];
    for (const item of buffetItems) {
        await db.run(
            'INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo) VALUES (?, ?, ?, 1)',
            [uuidv4(), tenantId, item]
        );
    }

    // 2. Garantir que as categorias existam
    console.log('Verificando categorias...');
    let catLanches = await db.get("SELECT id FROM categories WHERE tenant_id = ? AND name = 'Lanches'", [tenantId]);
    if (!catLanches) {
        catLanches = { id: uuidv4() };
        await db.run("INSERT INTO categories (id, tenant_id, name, is_active) VALUES (?, ?, ?, 1)", [catLanches.id, tenantId, 'Lanches']);
    }

    let catAdicionais = await db.get("SELECT id FROM categories WHERE tenant_id = ? AND name = 'Adicionais'", [tenantId]);
    if (!catAdicionais) {
        catAdicionais = { id: uuidv4() };
        await db.run("INSERT INTO categories (id, tenant_id, name, is_active) VALUES (?, ?, ?, 1)", [catAdicionais.id, tenantId, 'Adicionais']);
    }

    // 3. Adicionar addon_groups e addon_items
    console.log('Adicionando grupos de adicionais...');
    const groupId = uuidv4();
    await db.run(
        'INSERT OR IGNORE INTO addon_groups (id, tenant_id, category_id, name, min_selection, max_selection) VALUES (?, ?, ?, ?, 0, 10)',
        [groupId, tenantId, catLanches.id, 'Extras']
    );

    const addons = [
        { name: 'Bacon Extra', price: 5.0 },
        { name: 'Queijo Extra', price: 4.0 },
        { name: 'Ovo', price: 2.0 }
    ];

    for (const addon of addons) {
        await db.run(
            'INSERT OR IGNORE INTO addon_items (id, group_id, name, price, is_available) VALUES (?, ?, ?, ?, 1)',
            [uuidv4(), groupId, addon.name, addon.price]
        );
    }

    // 4. Adicionar produto \"Marmita\" com tamanhos
    console.log('Adicionando produto Marmita com tamanhos...');
    await db.run(
        `INSERT OR REPLACE INTO products (id, tenant_id, category_id, name, price, is_available, has_sizes, sizes, size_prices) 
         VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        ['demo_prod_marmita', tenantId, catLanches.id, 'Marmita', 25.0,
            JSON.stringify(['P', 'M', 'G']),
            JSON.stringify({ 'P': 18.0, 'M': 25.0, 'G': 35.0 })]
    );

    console.log('Seed completo!');
    await db.close();
}

seed();
