const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server/database/deliveryhub.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, name, slug FROM tenants", [], (err, rows) => {
    if (err) {
        throw err;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
