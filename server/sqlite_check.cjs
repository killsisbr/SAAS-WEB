const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');

const db = new sqlite3.Database(dbPath);

console.log('Testando query de categorias...');
const tenantId = '127371eb-14c6-44bc-a9e5-e6b0b7d61d11';
db.all("SELECT * FROM categories", [], (err, rows) => {
    if (err) console.error("ERRO CATEGORIES:", err.message);
    else console.log("Categorias lidas com sucesso: ", rows.length);
});

// db.all("SELECT * FROM products", [], (err, rows) => {
//    if (err) console.error("ERRO produtos:", err.message);
//    else console.log("produtos lidos com sucesso: ", rows.length);
// });
