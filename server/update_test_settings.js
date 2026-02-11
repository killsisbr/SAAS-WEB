/**
 * Script de Update - Settings do Tenant para Teste IA
 */

import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function openDatabase() {
    const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');
    return open({
        filename: dbPath,
        driver: sqlite3Pkg.Database
    });
}

async function updateTenantSettings() {
    const db = await openDatabase();

    const settings = {
        address: 'Rua das Flores, 123 - Centro',
        phone: '(11) 99999-9999',
        deliveryFee: 5.00,
        minOrderValue: 20.00,
        openingHours: 'Terça a Domingo das 18h às 23h',
        description: 'A melhor hamburgueria da cidade!'
    };

    console.log('Atualizando settings do Brutus Burger...');

    // Buscar primeiro tenant ativo
    const tenant = await db.get('SELECT id, name FROM tenants WHERE status = ? LIMIT 1', ['ACTIVE']);

    if (tenant) {
        await db.run(
            'UPDATE tenants SET settings = ? WHERE id = ?',
            [JSON.stringify(settings), tenant.id]
        );
        console.log(`✅ Tenant ${tenant.name} atualizado com sucesso!`);
    } else {
        console.log('❌ Tenant não encontrado');
    }

    await db.close();
}

updateTenantSettings().catch(console.error);
