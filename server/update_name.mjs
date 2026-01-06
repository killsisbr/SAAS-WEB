// Atualizar nome da sorveteria no banco
import Database from 'better-sqlite3';

const db = new Database('./database/deliveryhub.sqlite');

// Atualizar tenant
db.exec(`UPDATE tenants SET name = 'Sorveteria Qdelicia', slug = 'sorveteria-qdelicia' WHERE id = 'sorveteria_001'`);

// Atualizar usuario
db.exec(`UPDATE users SET name = 'Sorveteria Qdelicia' WHERE id = 'sorveteria_user_001'`);

console.log('Nome atualizado para Sorveteria Qdelicia!');
db.close();
