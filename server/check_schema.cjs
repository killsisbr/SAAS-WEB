const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("PRAGMA table_info(addon_groups)", (err, rows) => {
        console.log("addon_groups cols:", rows.map(r => r.name).join(', '));
    });
    db.all("PRAGMA table_info(addon_items)", (err, rows) => {
        console.log("addon_items cols:", rows.map(r => r.name).join(', '));
        db.close();
    });
});
