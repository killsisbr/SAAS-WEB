/**
 * Script para importar produtos do Brutus Burger para o SAAS
 * Uso: node server/database/import-brutusburger.js
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gerar ID unico
function generateId(prefix = '') {
    return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

async function importProducts() {
    console.log('=== Importando produtos do Brutus Burger ===\n');

    // Abrir banco de dados
    const dbPath = path.join(__dirname, 'deliveryhub.sqlite');
    console.log('Banco de dados:', dbPath);

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Carregar produtos do JSON
    const produtosPath = path.join(__dirname, 'produtos-brutusburger.json');
    const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf-8'));
    console.log(`Produtos a importar: ${produtos.length}\n`);

    // Buscar tenant brutus-burger
    let tenant = await db.get("SELECT id FROM tenants WHERE slug = 'brutus-burger'");
    if (!tenant) {
        console.log('Tenant brutus-burger nao encontrado, buscando demo_tenant_001...');
        tenant = await db.get("SELECT id FROM tenants WHERE id = 'demo_tenant_001'");
    }

    if (!tenant) {
        console.error('ERRO: Nenhum tenant encontrado!');
        const tenants = await db.all('SELECT id, slug, name FROM tenants');
        console.log('Tenants disponiveis:');
        tenants.forEach(t => console.log(`  - ${t.id} (${t.slug}) - ${t.name}`));
        await db.close();
        return;
    }
    console.log(`Tenant encontrado: ${tenant.id}\n`);

    // Buscar ou criar categorias
    const categorias = {};
    const categoriasUnicas = [...new Set(produtos.map(p => p.categoria))];

    for (let i = 0; i < categoriasUnicas.length; i++) {
        const catNome = categoriasUnicas[i];
        let cat = await db.get(
            "SELECT id FROM categories WHERE tenant_id = ? AND name = ?",
            [tenant.id, catNome]
        );

        if (!cat) {
            const catId = generateId('cat_');
            await db.run(
                "INSERT INTO categories (id, tenant_id, name, order_index, is_active) VALUES (?, ?, ?, ?, 1)",
                [catId, tenant.id, catNome, i]
            );
            cat = { id: catId };
            console.log(`Categoria criada: ${catNome} (ID: ${cat.id})`);
        } else {
            console.log(`Categoria existente: ${catNome} (ID: ${cat.id})`);
        }

        categorias[catNome] = cat.id;
    }

    console.log('\n--- Inserindo produtos ---\n');

    let inseridos = 0;
    let atualizados = 0;

    for (const prod of produtos) {
        const catId = categorias[prod.categoria];

        // Verificar se produto ja existe
        const existente = await db.get(
            "SELECT id FROM products WHERE tenant_id = ? AND name = ?",
            [tenant.id, prod.nome]
        );

        if (existente) {
            // Atualizar produto existente
            await db.run(
                `UPDATE products SET 
                    description = ?, 
                    price = ?, 
                    category_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [prod.descricao, prod.preco, catId, existente.id]
            );
            atualizados++;
            console.log(`  [ATUALIZADO] ${prod.nome}`);
        } else {
            // Inserir novo produto
            const prodId = generateId('prod_');
            await db.run(
                `INSERT INTO products (id, tenant_id, category_id, name, description, price, is_available, is_featured, order_index) 
                VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
                [prodId, tenant.id, catId, prod.nome, prod.descricao, prod.preco, inseridos]
            );
            inseridos++;
            console.log(`  [INSERIDO] ${prod.nome}`);
        }
    }

    console.log(`\n=== Importacao concluida ===`);
    console.log(`Produtos inseridos: ${inseridos}`);
    console.log(`Produtos atualizados: ${atualizados}`);
    console.log(`Total processado: ${produtos.length}`);

    await db.close();
}

importProducts().catch(console.error);
