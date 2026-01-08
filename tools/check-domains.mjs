// Script para verificar e configurar domínios customizados
// Uso: node tools/check-domains.mjs

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

async function main() {
    const db = await open({
        filename: './server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    console.log('\n=== TENANTS ===');
    const tenants = await db.all('SELECT id, name, slug FROM tenants');
    tenants.forEach(t => console.log(`  ${t.name} (${t.slug}) -> ${t.id}`));

    console.log('\n=== DOMINIOS CUSTOMIZADOS ===');
    const domains = await db.all(`
        SELECT cd.*, t.name as tenant_name, t.slug 
        FROM custom_domains cd 
        LEFT JOIN tenants t ON cd.tenant_id = t.id
    `);

    if (domains.length === 0) {
        console.log('  Nenhum domínio customizado configurado!');
    } else {
        domains.forEach(d => console.log(`  ${d.domain} -> ${d.tenant_name} (verified: ${d.verified})`));
    }

    // Verificar se DEGUST tem domínio
    const degust = tenants.find(t => t.slug === 'degust' || t.name.toLowerCase().includes('degust'));
    if (degust) {
        const degustDomain = await db.get('SELECT * FROM custom_domains WHERE tenant_id = ?', [degust.id]);

        if (!degustDomain) {
            console.log('\n[!] DEGUST não tem domínio configurado! Adicionando...');

            await db.run(`
                INSERT INTO custom_domains (id, tenant_id, domain, verified, ssl_status)
                VALUES (?, ?, ?, 1, 'active')
            `, [uuidv4(), degust.id, 'restaurantedegust.com']);

            console.log('[OK] Domínio restaurantedegust.com adicionado para DEGUST');
        } else {
            console.log(`\n[OK] DEGUST já tem domínio: ${degustDomain.domain} (verified: ${degustDomain.verified})`);

            if (!degustDomain.verified) {
                await db.run('UPDATE custom_domains SET verified = 1 WHERE id = ?', [degustDomain.id]);
                console.log('[OK] Domínio marcado como verificado');
            }
        }
    } else {
        console.log('\n[!] Tenant DEGUST não encontrado!');
    }

    console.log('\n=== VERIFICAÇÃO FINAL ===');
    const finalDomains = await db.all(`
        SELECT cd.domain, t.name, cd.verified 
        FROM custom_domains cd 
        JOIN tenants t ON cd.tenant_id = t.id
    `);
    finalDomains.forEach(d => console.log(`  ${d.name}: ${d.domain} (verified: ${d.verified})`));

    await db.close();
    console.log('\nDone! Reinicie o servidor para aplicar.');
}

main().catch(console.error);
