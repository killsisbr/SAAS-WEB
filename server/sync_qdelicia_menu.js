
import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function syncMenu() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3Pkg.Database
    });

    try {
        const tenant = await db.get('SELECT id FROM tenants WHERE slug = ?', ['qdeliciasorveteria']);
        const tenantId = tenant.id;

        // 1. Adicionar Categoria Bebidas se não existir
        let drinksCategory = await db.get('SELECT id FROM categories WHERE tenant_id = ? AND name = ?', [tenantId, 'Bebidas']);
        if (!drinksCategory) {
            const catId = uuidv4();
            await db.run('INSERT INTO categories (id, tenant_id, name, order_index) VALUES (?, ?, ?, ?)', [catId, tenantId, 'Bebidas', 10]);
            drinksCategory = { id: catId };
            console.log("Categoria 'Bebidas' criada.");
        }

        const popsicleSpecialCat = await db.get('SELECT id FROM categories WHERE tenant_id = ? AND name = ?', [tenantId, 'Picolés Especiais']);

        // 2. Adicionar Bebidas
        const drinks = [
            { name: 'Coca 2L', price: 15.00 },
            { name: 'Sprite 2L', price: 10.00 },
            { name: 'Fanta 2L', price: 10.00 },
            { name: 'Coca 600ml', price: 7.00 },
            { name: 'Fanta 600ml', price: 6.00 },
            { name: 'Coca Lata', price: 5.00 },
            { name: 'Monster', price: 12.00 }
        ];

        for (const drink of drinks) {
            await db.run(`
                INSERT OR REPLACE INTO products (id, tenant_id, category_id, name, price, is_available) 
                VALUES (?, ?, ?, ?, ?, 1)
            `, [uuidv4(), tenantId, drinksCategory.id, drink.name, drink.price]);
        }
        console.log(`${drinks.length} bebidas adicionadas.`);

        // 3. Adicionar Sabores de Picolés Skimo
        const skimoFlavors = ['Skimo Brigadeiro', 'Skimo Branco', 'Skimo Morango', 'Skimo Chocolate'];
        for (const flavor of skimoFlavors) {
            await db.run(`
                INSERT OR REPLACE INTO products (id, tenant_id, category_id, name, price, is_available) 
                VALUES (?, ?, ?, ?, ?, 1)
            `, [uuidv4(), tenantId, popsicleSpecialCat.id, flavor, 4.50]);
        }
        console.log(`${skimoFlavors.length} sabores de Skimo adicionados.`);

        // 4. Adicionar Sabores de Picolés Itu
        const ituFlavors = ['Picolé Itu Banana', 'Picolé Itu Chocolate', 'Picolé Itu Abacate', 'Picolé Itu Morango'];
        for (const flavor of ituFlavors) {
            await db.run(`
                INSERT OR REPLACE INTO products (id, tenant_id, category_id, name, price, is_available) 
                VALUES (?, ?, ?, ?, ?, 1)
            `, [uuidv4(), tenantId, popsicleSpecialCat.id, flavor, 3.00]);
        }
        console.log(`${ituFlavors.length} sabores de Itu adicionados.`);

    } catch (error) {
        console.error("Error syncing menu:", error);
    } finally {
        await db.close();
    }
}

syncMenu();
