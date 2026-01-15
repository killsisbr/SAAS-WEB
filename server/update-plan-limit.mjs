// Script para passar Fiorella para plano Enterprise (top)
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    const db = await open({
        filename: join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    console.log('=== Passando Fiorella para Plano Top ===\n');

    // Buscar tenant Fiorella
    const fiorella = await db.get("SELECT * FROM tenants WHERE slug = 'fiorella'");
    if (!fiorella) {
        console.log('[ERR] Fiorella nao encontrada');
        return;
    }
    console.log('[OK] Fiorella encontrada:', fiorella.id);

    // Buscar plano Enterprise (top)
    let enterprise = await db.get("SELECT * FROM plans WHERE name LIKE '%Enterprise%' OR name LIKE '%Top%'");

    // Se nao existe, criar
    if (!enterprise) {
        console.log('Criando plano Enterprise...');
        await db.run(`
            INSERT INTO plans (id, name, price, max_products, max_categories, max_orders_month, features)
            VALUES ('plan-enterprise', 'Enterprise', 199.90, 500, 50, 10000, '["unlimited_products","unlimited_orders","custom_domain","priority_support"]')
        `);
        enterprise = await db.get("SELECT * FROM plans WHERE id = 'plan-enterprise'");
        console.log('[OK] Plano Enterprise criado');
    } else {
        console.log('[OK] Plano Enterprise encontrado:', enterprise.name);
        // Atualizar limites para garantir
        await db.run("UPDATE plans SET max_products = 500 WHERE id = ?", [enterprise.id]);
    }

    // Atualizar subscription da Fiorella
    const subscription = await db.get("SELECT * FROM subscriptions WHERE tenant_id = ?", [fiorella.id]);

    if (subscription) {
        await db.run("UPDATE subscriptions SET plan_id = ?, status = 'ACTIVE' WHERE tenant_id = ?", [enterprise.id, fiorella.id]);
        console.log('[OK] Subscription atualizada para Enterprise');
    } else {
        // Criar subscription
        await db.run(`
            INSERT INTO subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
            VALUES (?, ?, ?, 'ACTIVE', datetime('now'), datetime('now', '+1 year'))
        `, ['sub-fiorella', fiorella.id, enterprise.id]);
        console.log('[OK] Subscription Enterprise criada');
    }

    // Verificar resultado
    const result = await db.get(`
        SELECT s.*, p.name as plan_name, p.max_products 
        FROM subscriptions s 
        JOIN plans p ON s.plan_id = p.id 
        WHERE s.tenant_id = ?
    `, [fiorella.id]);

    console.log('\n=== Resultado ===');
    console.log('Plano:', result.plan_name);
    console.log('Max Produtos:', result.max_products);
    console.log('Status:', result.status);

    await db.close();
}

main().catch(console.error);
