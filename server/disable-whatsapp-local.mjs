import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function disableWhatsApp() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    console.log('Buscando tenants...');
    const tenants = await db.all('SELECT id, name, settings FROM tenants');

    for (const tenant of tenants) {
        const settings = JSON.parse(tenant.settings || '{}');

        console.log(`\nTenant: ${tenant.name} (${tenant.id})`);
        console.log(`  whatsappBotEnabled: ${settings.whatsappBotEnabled}`);
        console.log(`  aiBot.enabled: ${settings.aiBot?.enabled}`);

        // Desabilitar WhatsApp
        settings.whatsappBotEnabled = false;
        if (settings.aiBot) {
            settings.aiBot.enabled = false;
        }

        await db.run(
            'UPDATE tenants SET settings = ? WHERE id = ?',
            [JSON.stringify(settings), tenant.id]
        );

        console.log('  ✓ WhatsApp desabilitado');
    }

    console.log('\n✅ Concluído! Todos os tenants locais agora têm WhatsApp desabilitado.');
    await db.close();
}

disableWhatsApp().catch(console.error);
