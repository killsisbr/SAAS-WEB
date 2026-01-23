/**
 * Teste para validar que palavras com iniciais não dão match incorreto
 * Casos problemáticos reportados:
 * - "maaa" não deve dar match em "Marmita"
 * - "penela" não deve dar match em "Marmita P"
 * - "asdasd" não deve dar match em nada
 */

import { findAllProducts } from './core/word-analyzer.js';

const PRODUCTS = [
    { id: 1, name: 'Marmita P', price: 15 },
    { id: 2, name: 'Marmita Pequena', price: 15 },
    { id: 3, name: 'Marmita Média', price: 18 },
    { id: 4, name: 'Marmita Grande', price: 22 },
    { id: 5, name: 'Coca Cola', price: 5 },
    { id: 6, name: 'Pizza', price: 35 },
];

const TEST_CASES = [
    {
        input: 'maaa',
        shouldMatch: false,
        desc: '"maaa" não deve dar match em "Marmita"'
    },
    {
        input: 'penela',
        shouldMatch: false,
        desc: '"penela" não deve dar match em "Marmita P"'
    },
    {
        input: 'asdasd',
        shouldMatch: false,
        desc: '"asdasd" não deve dar match em nada'
    },
    {
        input: 'pimenta',
        shouldMatch: false,
        desc: '"pimenta" não deve dar match em "Pizza" ou "Marmita P"'
    },
    // Casos válidos que DEVEM funcionar
    {
        input: 'marmita',
        shouldMatch: true,
        expectedProduct: 'Marmita',
        desc: '"marmita" deve dar match'
    },
    {
        input: 'marmit',
        shouldMatch: true,
        expectedProduct: 'Marmita',
        desc: '"marmit" (75% de marmita) deve dar match'
    },
    {
        input: 'media',
        shouldMatch: true,
        expectedProduct: 'Média',
        desc: '"media" deve dar match em "Marmita Média"'
    },
    {
        input: 'pequena',
        shouldMatch: true,
        expectedProduct: 'Pequena',
        desc: '"pequena" deve dar match'
    },
    {
        input: 'coca',
        shouldMatch: true,
        expectedProduct: 'Coca',
        desc: '"coca" deve dar match'
    },
    {
        input: 'pizza',
        shouldMatch: true,
        expectedProduct: 'Pizza',
        desc: '"pizza" deve dar match'
    }
];

async function runTests() {
    console.log('🧪 Teste de Match com Iniciais\n');
    console.log('═'.repeat(60));

    let passed = 0;
    let failed = 0;

    for (const test of TEST_CASES) {
        const result = await findAllProducts(test.input, PRODUCTS, null, null);

        if (test.shouldMatch) {
            // Deve encontrar produto
            if (result.length === 0) {
                console.log(`❌ "${test.input}" - ${test.desc}`);
                console.log(`   Esperado: match, Obtido: nenhum produto`);
                failed++;
            } else if (test.expectedProduct && !result[0].product.name.includes(test.expectedProduct)) {
                console.log(`❌ "${test.input}" - ${test.desc}`);
                console.log(`   Esperado: ${test.expectedProduct}, Obtido: ${result[0].product.name}`);
                failed++;
            } else {
                console.log(`✅ "${test.input}" - ${test.desc}`);
                console.log(`   → ${result[0].product.name}`);
                passed++;
            }
        } else {
            // NÃO deve encontrar produto
            if (result.length > 0) {
                console.log(`❌ "${test.input}" - ${test.desc}`);
                console.log(`   Esperado: nenhum match, Obtido: ${result.map(r => r.product.name).join(', ')}`);
                failed++;
            } else {
                console.log(`✅ "${test.input}" - ${test.desc}`);
                console.log(`   → (nenhum match, como esperado)`);
                passed++;
            }
        }
        console.log('');
    }

    console.log('═'.repeat(60));
    console.log(`\n📊 Resultado: ${passed}/${TEST_CASES.length} testes passaram`);

    if (failed > 0) {
        console.log(`\n❌ ${failed} teste(s) falharam\n`);
        process.exit(1);
    } else {
        console.log('\n🎉 Todos os testes passaram!\n');
        process.exit(0);
    }
}

runTests();
