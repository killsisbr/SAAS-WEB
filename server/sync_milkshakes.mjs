import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function syncFlavors() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11'; // qdeliciasorveteria

    console.log('🚀 Iniciando atualização de sabores de Milk Shake...\n');

    // 1. Inativar sabores que não estão no cardápio ou foram excluídos pelo usuário
    const toRemove = [
        'Sorvete de Napolitano',
        'Sorvete de Coco',
        'Sorvete de Limão',
        'Sorvete de Pistache',
        'Sorvete de Creme' // Caso exista
    ];

    for (const name of toRemove) {
        const result = await db.run(
            'UPDATE buffet_items SET ativo = 0 WHERE tenant_id = ? AND nome = ?',
            [tenantId, name]
        );
        if (result.changes > 0) {
            console.log(`✅ Inativado: ${name}`);
        }
    }

    // 2. Novos sabores para adicionar (incluindo trocas solicitadas)
    const newFlavors = [
        'Ovomaltine',
        'Torta Alemã',
        'Ninho Trufado',
        'Menta',
        'Maçã Verde',
        'Chocobrownie',
        'Leite Condensado',
        'Chocomenta',
        'Sensação',
        'Iogurte Grego',
        'Oreo',
        'Unicórnio',
        'Sonho de Valsa'
    ];

    for (const flavor of newFlavors) {
        // Verificar se já existe (ativo ou inativo)
        const existing = await db.get(
            'SELECT id FROM buffet_items WHERE tenant_id = ? AND nome = ?',
            [tenantId, flavor]
        );

        if (existing) {
            await db.run(
                'UPDATE buffet_items SET ativo = 1 WHERE id = ?',
                [existing.id]
            );
            console.log(`♻️  Reativado: ${flavor}`);
        } else {
            await db.run(
                `INSERT INTO buffet_items (id, tenant_id, nome, ativo, order_index, created_at) 
                 VALUES (?, ?, ?, 1, 0, datetime('now'))`,
                [uuidv4(), tenantId, flavor]
            );
            console.log(`✨ Adicionado: ${flavor}`);
        }
    }

    console.log('\n--- Sabores Ativos Atuais ---');
    const active = await db.all(
        'SELECT nome FROM buffet_items WHERE tenant_id = ? AND ativo = 1 ORDER BY nome',
        [tenantId]
    );
    console.table(active);

    await db.close();
}

syncFlavors().catch(console.error);
