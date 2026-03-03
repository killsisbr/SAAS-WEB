const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database', 'database.sqlite');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('--- TABELAS ---');
            tables.forEach(t => console.log(t.name));

            // Tentar ver se tem tenant
            const tenantTable = tables.find(t => t.name.toLowerCase().includes('tenant'));
            if (tenantTable) {
                console.log(`\nAchou tabela: ${tenantTable.name}`);
                db.all(`SELECT * FROM ${tenantTable.name}`, (err, rows) => {
                    if (err) console.error(err);
                    else {
                        rows.forEach(r => {
                            if (JSON.stringify(r).toLowerCase().includes('delicia') || JSON.stringify(r).toLowerCase().includes('sorvet')) {
                                console.log('ACHOU:', r);
                            }
                        });
                    }
                });
            }
        }
    });
});

db.close();
