import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function enableWhatsApp() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    console.log('Habilitando WhatsApp para Fiorella...');

    // Buscar tenant Fiorella
    const fiorella = await db.get(`
        SELECT id, name, settings 
        FROM tenants 
        WHERE name LIKE '%Fiorella%' OR id = 'b6bde28a-bb8a-4d40-9d71-bdbb5a87da72'
    `);

    if (!fiorella) {
        console.log('❌ Tenant Fiorella não encontrado');
        await db.close();
        return;
    }

    const settings = JSON.parse(fiorella.settings || '{}');
    console.log(`\nTenant: ${fiorella.name} (${fiorella.id})`);
    console.log(`  whatsappBotEnabled atual: ${settings.whatsappBotEnabled}`);

    // Habilitar WhatsApp
    settings.whatsappBotEnabled = true;

    await db.run(
        'UPDATE tenants SET settings = ? WHERE id = ?',
        [JSON.stringify(settings), fiorella.id]
    );

    console.log('  ✓ WhatsApp habilitado para Fiorella');
    console.log('\n✅ Concluído! Fiorella agora tem WhatsApp habilitado.');
    await db.close();
}

enableWhatsApp().catch(console.error);
