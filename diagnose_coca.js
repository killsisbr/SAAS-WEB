
import { fileURLToPath } from 'url';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { findProductFuzzy, tokenize } from './server/direct-order/core/word-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function check() {
    console.log('--- DIAGNOSING COCA 2L ---');

    // 1. Get Products from DB
    const db = await open({
        filename: path.join(__dirname, 'server', 'database', 'deliveryhub.sqlite'),
        driver: sqlite3.Database
    });

    const products = await db.all('SELECT * FROM products WHERE name LIKE "%Coca%" OR name LIKE "%Refri%"');
    console.log('Found Products:', products.map(p => ({ id: p.id, name: p.name })));

    // 2. Test Matching Logic
    const inputs = [
        "coca 2l",
        "coca cola 2l",
        "coca 2 litros",
        "uma coca 2l" // "uma" should be stripped or handled by analyzer
    ];

    console.log('\n--- TESTING MATCHING ---');
    for (const input of inputs) {
        const words = tokenize(input);

        // Remove 'uma' manually as analyzer does efficiently in loop usually
        const cleanWords = words.filter(w => !['uma', 'um', 'quero'].includes(w));

        console.log(`\nInput: "${input}" (Tok: ${cleanWords.join('|')})`);

        const match = findProductFuzzy(cleanWords, products);
        if (match) {
            console.log(`✅ MATCH: "${match.name}" (ID: ${match.id})`);
        } else {
            console.log(`❌ NO MATCH`);
        }
    }
}

check();
