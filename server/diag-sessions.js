
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');
    const sessionsDir = path.join(__dirname, 'baileys-sessions');

    console.log('--- DIAGNOSTICO DELIVERYHUB ---');
    console.log('DB Path:', dbPath);

    if (!fs.existsSync(dbPath)) {
        console.error('Banco de dados não encontrado!');
        return;
    }

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const tenants = await db.all('SELECT id, name, slug FROM tenants');
    console.log('\nTenants encontrados:', tenants.length);

    const degust = tenants.find(t => t.slug.includes('degust') || t.name.includes('Degust'));

    if (degust) {
        console.log('\n✅ Tenant "Degust" encontrado:');
        console.log('ID:', degust.id);
        console.log('Name:', degust.name);
        console.log('Slug:', degust.slug);

        const authDir = path.join(sessionsDir, `session-${degust.id}`);
        console.log('\nAuthDir:', authDir);

        if (fs.existsSync(authDir)) {
            const files = fs.readdirSync(authDir);
            console.log('Arquivos na sessão:', files.length);
            if (files.includes('creds.json')) {
                console.log('✅ creds.json existe.');
                const stats = fs.statSync(path.join(authDir, 'creds.json'));
                console.log('Ultima modificação:', stats.mtime);
            } else {
                console.log('❌ creds.json NÃO existe!');
            }
        } else {
            console.log('❌ Diretório de sessão NÃO existe!');
        }
    } else {
        console.log('\n❌ Tenant "Degust" NÃO encontrado na lista:');
        tenants.forEach(t => console.log(`- [${t.id}] ${t.name} (${t.slug})`));
    }

    await db.close();
}

run().catch(console.error);
