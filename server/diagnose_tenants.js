
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');

const reportPath = path.join(__dirname, 'diagnosis_report.txt');
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(reportPath, msg + '\n');
};

async function diagnose() {
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    log(`Checking database at: ${dbPath}`);

    if (!fs.existsSync(dbPath)) {
        log('Database file not found!');
        return;
    }

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        const tenants = await db.all('SELECT id, name, status, settings FROM tenants');
        log(`\nFound ${tenants.length} tenants:\n`);

        for (const tenant of tenants) {
            log(`--- Tenant: ${tenant.name} (${tenant.id}) ---`);
            log(`Status: ${tenant.status}`);

            log(`Raw Settings: ${tenant.settings}`);
            let settings = {};
            try {
                settings = JSON.parse(tenant.settings || '{}');
            } catch (e) {
                log('Error parsing settings JSON');
            }

            log(`Settings:`);
            log(`  whatsappBotEnabled: ${settings.whatsappBotEnabled}`);
            log(`  aiBot.enabled: ${settings.aiBot?.enabled}`);

            const sessionDir = path.join(__dirname, 'baileys-sessions', `session-${tenant.id}`);
            const hasSession = fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'creds.json'));
            log(`Session Exists (on disk): ${hasSession}`);
            log(`Path: ${sessionDir}`);
            log('-------------------------------------------');
        }

    } catch (err) {
        log('Error querying database: ' + err);
    } finally {
        await db.close();
    }
}

diagnose();
