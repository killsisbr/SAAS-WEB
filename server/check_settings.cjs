const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, name, settings FROM tenants', (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log('--- TENANT SETTINGS ---');
    rows.forEach(t => {
        console.log(`\nTenant: ${t.name} (${t.id})`);
        try {
            const settings = JSON.parse(t.settings || '{}');
            console.log(JSON.stringify(settings, null, 2));
        } catch (e) {
            console.log('Settings are not JSON:', t.settings);
        }
    });
    db.close();
});
