/**
 * Teste específico para o caso "bom ppap"
 * Verificar se "bom" não é adicionado como observação
 */

import { findAllProducts } from './core/word-analyzer.js';

const PRODUCTS = [
    { id: 1, name: 'Marmita P', price: 15 },
    { id: 2, name: 'Marmita Pequena', price: 15 },
    { id: 3, name: 'Marmita Média', price: 18 },
    { id: 4, name: 'Marmita Grande', price: 22 },
];

async function testBomPpap() {
    console.log('🧪 Teste: "bom ppap" não deve adicionar "bom" como observação\n');

    const result = await findAllProducts('bom ppap', PRODUCTS, null, null);

    console.log('Resultado:', JSON.stringify(result, null, 2));

    if (result.length === 0) {
        console.log('❌ FALHA: Nenhum produto detectado');
        return false;
    }

    if (result.length > 1) {
        console.log('❌ FALHA: Mais de um produto detectado');
        return false;
    }

    const item = result[0];

    // Verificar se é Marmita P
    if (!item.product.name.includes('Marmita P')) {
        console.log(`❌ FALHA: Produto errado detectado: ${item.product.name}`);
        return false;
    }

    // Verificar se NÃO tem "bom" na observação
    if (item.notes && item.notes.includes('bom')) {
        console.log(`❌ FALHA: "bom" foi adicionado como observação: "${item.notes}"`);
        return false;
    }

    // Verificar se a observação está vazia ou contém apenas "ppap"
    if (item.notes && item.notes.trim() && item.notes.trim() !== 'ppap') {
        console.log(`⚠️  AVISO: Observação inesperada: "${item.notes}"`);
        // Não é falha crítica, apenas aviso
    }

    console.log('✅ SUCESSO: "bom ppap" detectou corretamente Marmita P sem adicionar "bom" como observação');
    console.log(`   Produto: ${item.product.name}`);
    console.log(`   Observação: "${item.notes || '(vazio)'}"`);

    return true;
}

// Executar teste
(async () => {
    const passed = await testBomPpap();
    process.exit(passed ? 0 : 1);
})();
