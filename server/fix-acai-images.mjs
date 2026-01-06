import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'database', 'deliveryhub.sqlite');
const db = new sqlite3.Database(dbPath);

// Imagens corretas para Açaí
const acaiImages = [
    { id: 'demo_prod_acai_300', image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600' },
    { id: 'demo_prod_acai_500', image: 'https://images.unsplash.com/photo-1609501676725-7186f017a4b7?w=600' },
    { id: 'demo_prod_acai_750', image: 'https://images.unsplash.com/photo-1553158728-445e178b8c68?w=600' },
    { id: 'demo_prod_bowl', image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600' }
];

console.log('Atualizando imagens dos produtos de Açaí...\n');

let completed = 0;
for (const item of acaiImages) {
    db.run(
        `UPDATE products SET images = ? WHERE id = ?`,
        [JSON.stringify([item.image]), item.id],
        function (err) {
            if (err) {
                console.error(`❌ ${item.id}: erro - ${err.message}`);
            } else if (this.changes > 0) {
                console.log(`✅ ${item.id}: imagem atualizada`);
            } else {
                console.log(`⚠️ ${item.id}: produto não encontrado`);
            }

            completed++;
            if (completed === acaiImages.length) {
                console.log('\nConcluído!');
                db.close();
            }
        }
    );
}
