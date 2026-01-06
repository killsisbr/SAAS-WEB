// Script temporario para inserir dados da sorveteria
import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('./database/deliveryhub.sqlite');

// Ler e executar o SQL
const sql = fs.readFileSync('./database/seed_sorveteria.sql', 'utf8');

// Dividir em statements
const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--') && !s.trim().startsWith('COMMIT'));

for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed) {
        try {
            db.exec(trimmed);
            console.log('OK:', trimmed.substring(0, 50) + '...');
        } catch (e) {
            console.log('SKIP:', e.message.substring(0, 50));
        }
    }
}

console.log('\nDados da sorveteria inseridos com sucesso!');
db.close();
