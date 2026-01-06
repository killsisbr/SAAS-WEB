// Script para atualizar senha dos usuarios demo
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');

async function updatePasswords() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const newHash = await bcrypt.hash('123456', 10);
    console.log('Novo hash gerado:', newHash);

    // Atualizar todos os usuarios demo
    const result = await db.run(`
        UPDATE users 
        SET password_hash = ? 
        WHERE id IN ('superadmin_001', 'demo_user_001')
    `, [newHash]);

    console.log(`Senhas atualizadas: ${result.changes} usuarios`);

    // Verificar se superadmin existe, senao criar
    const superadmin = await db.get(`SELECT id FROM users WHERE id = 'superadmin_001'`);

    if (!superadmin) {
        await db.run(`
            INSERT INTO users (id, email, password_hash, name, role)
            VALUES (?, ?, ?, ?, ?)
        `, ['superadmin_001', 'admin@deliveryhub.com', newHash, 'Super Admin', 'SUPER_ADMIN']);
        console.log('SuperAdmin criado!');
    }

    console.log('\n=== CREDENCIAIS ===');
    console.log('  Email: admin@deliveryhub.com');
    console.log('  Senha: 123456');
    console.log('  Email: demo@demo.com');
    console.log('  Senha: 123456');

    await db.close();
}

updatePasswords().catch(console.error);
