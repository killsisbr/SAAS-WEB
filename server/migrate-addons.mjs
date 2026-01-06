// Script para adicionar coluna category_id na tabela addon_groups
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database', 'deliveryhub.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar:', err.message);
        process.exit(1);
    }

    console.log('Conectado ao banco:', dbPath);

    // Verificar se a coluna existe
    db.all("PRAGMA table_info(addon_groups)", [], (err, rows) => {
        if (err) {
            console.error('Erro ao verificar tabela:', err.message);
            db.close();
            return;
        }

        const hasColumn = rows.some(col => col.name === 'category_id');

        if (!hasColumn) {
            db.run('ALTER TABLE addon_groups ADD COLUMN category_id TEXT', [], (err) => {
                if (err) {
                    console.error('Erro ao adicionar coluna:', err.message);
                } else {
                    console.log('Coluna category_id adicionada com sucesso!');
                }
                db.close();
            });
        } else {
            console.log('Coluna category_id ja existe.');
            db.close();
        }
    });
});
