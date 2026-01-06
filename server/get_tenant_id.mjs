import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database/deliveryhub.sqlite');

db.get('SELECT id FROM tenants WHERE slug = ?', ['brutus-burger'], (err, row) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log(JSON.stringify(row));
    }
    db.close();
});
