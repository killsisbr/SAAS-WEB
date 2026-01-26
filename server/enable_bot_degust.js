
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function enableBot() {
    console.log(`Open database: ${dbPath}`);
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        const tenants = await db.all('SELECT id, name, settings FROM tenants');

        for (const tenant of tenants) {
            console.log(`Processing ${tenant.name}...`);
            let settings = {};
            try {
                settings = JSON.parse(tenant.settings || '{}');
            } catch (e) {
                console.error('Failed to parse settings');
            }

            // Enable Bot
            settings.whatsappBotEnabled = true;

            // Also enable AI bot if present or desired (optional, but good for auto-connect)
            if (!settings.aiBot) settings.aiBot = {};
            // settings.aiBot.enabled = true; // Uncomment if we want to force AI too

            await db.run(
                'UPDATE tenants SET settings = ? WHERE id = ?',
                [JSON.stringify(settings), tenant.id]
            );
            console.log(`  -> Bot ENABLED for ${tenant.name}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.close();
    }
}

enableBot();
