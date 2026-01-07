// Script para configurar PIX do tenant
// Execute com: node tools/set-pix.mjs TENANT_ID PIX_KEY PIX_NAME

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'server', 'database.sqlite');

const db = Database(dbPath);

const tenantId = process.argv[2];
const pixKey = process.argv[3];
const pixName = process.argv[4] || '';

if (!tenantId || !pixKey) {
    console.log('Uso: node tools/set-pix.mjs TENANT_ID PIX_KEY [PIX_NAME]');
    console.log('');
    console.log('Exemplo: node tools/set-pix.mjs abc123 41999999999 "Lucas Larocca"');
    console.log('');

    // Listar tenants disponíveis
    const tenants = db.prepare('SELECT id, name, slug FROM tenants WHERE status = ?').all('ACTIVE');
    console.log('Tenants disponíveis:');
    tenants.forEach(t => {
        console.log(`  - ID: ${t.id}`);
        console.log(`    Nome: ${t.name}`);
        console.log(`    Slug: ${t.slug}`);
        console.log('');
    });

    process.exit(1);
}

// Buscar tenant
const tenant = db.prepare('SELECT * FROM tenants WHERE id = ? OR slug = ?').get(tenantId, tenantId);

if (!tenant) {
    console.error('Tenant não encontrado:', tenantId);
    process.exit(1);
}

// Atualizar settings
let settings = {};
try {
    settings = JSON.parse(tenant.settings || '{}');
} catch { }

settings.pixKey = pixKey;
settings.pixName = pixName;

db.prepare('UPDATE tenants SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(settings), tenant.id);

console.log('PIX configurado com sucesso!');
console.log('');
console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
console.log(`Chave PIX: ${pixKey}`);
console.log(`Titular: ${pixName || '(não informado)'}`);

db.close();
