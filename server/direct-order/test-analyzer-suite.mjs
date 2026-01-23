/**
 * Suíte de Testes Completa - Word Analyzer
 * Executa testes para garantir que não hajam erros de matching
 * 
 * Executar: node server/direct-order/test-analyzer-suite.mjs
 */

import { findAllProducts, tokenize, findProductFuzzy } from './core/word-analyzer.js';
import { normalizeText } from './services/mapping-service.js';

// Produtos simulados (similar ao menu real)
const PRODUCTS = [
    { id: 1, name: 'Marmita Pequena', price: 15 },
    { id: 2, name: 'Marmita Média', price: 18 },
    { id: 3, name: 'Marmita Media', price: 18 },  // Sem acento
    { id: 4, name: 'Marmita Grande', price: 22 },
    { id: 5, name: 'Coca Cola 2 Litros', price: 12 },
    { id: 6, name: 'Coca Cola Lata', price: 5 },
    { id: 7, name: 'Coca 2L', price: 12 },
    { id: 8, name: 'Guaraná Antarctica 2L', price: 10 },
    { id: 9, name: 'X-Burguer', price: 15 },
    { id: 10, name: 'X-Bacon', price: 18 },
    { id: 11, name: 'Água Mineral', price: 3 },
];

// Categorias de testes
const TEST_CASES = {
    // =============================================
    // SAUDAÇÕES - Não devem detectar produtos
    // =============================================
    'Saudações (devem retornar vazio)': [
        { input: 'bom dia', expected: [], desc: 'Saudação simples' },
        { input: 'boa tarde', expected: [], desc: 'Saudação tarde' },
        { input: 'boa noite', expected: [], desc: 'Saudação noite' },
        { input: 'oi', expected: [], desc: 'Oi simples' },
        { input: 'olá', expected: [], desc: 'Olá com acento' },
        { input: 'oi, bom dia!', expected: [], desc: 'Saudação combinada' },
        { input: 'opa, boa tarde', expected: [], desc: 'Opa + saudação' },
        { input: 'obrigado', expected: [], desc: 'Agradecimento' },
        { input: 'valeu', expected: [], desc: 'Agradecimento informal' },
    ],

    // =============================================
    // PALAVRAS COMUNS - Não devem detectar produtos
    // =============================================
    'Palavras comuns (devem retornar vazio)': [
        { input: 'quero pedir', expected: [], desc: 'Intenção vaga' },
        { input: 'me manda', expected: [], desc: 'Pedido vago' },
        { input: 'por favor', expected: [], desc: 'Cortesia' },
        { input: 'preciso de algo', expected: [], desc: 'Vago' },
    ],

    // =============================================
    // NÚMEROS COMO QUANTIDADE vs TAMANHO
    // =============================================
    'Números quantidade vs tamanho': [
        { input: '2 pequenas', expected: [{ qty: 2, name: 'Marmita Pequena' }], desc: '2 = quantidade' },
        { input: '2 pequena', expected: [{ qty: 2, name: 'Marmita Pequena' }], desc: '2 singular = quantidade' },
        { input: '3 medias', expected: [{ qty: 3, name: 'Marmita' }], desc: '3 = quantidade (partial match ok)' },
        { input: 'coca 2l', expected: [{ qty: 1, name: 'Coca' }], desc: '2l = tamanho bebida' },
        { input: 'coca 2 litros', expected: [{ qty: 1, name: 'Coca' }], desc: '2 litros = tamanho' },
        { input: '1 coca 2 litros', expected: [{ qty: 1, name: 'Coca' }], desc: '1 coca = quantidade, 2l = tamanho' },
        { input: '2 cocas 2l', expected: [{ qty: 2, name: 'Coca' }], desc: 'Primeiro 2 = qty, segundo = tamanho' },
    ],

    // =============================================
    // PLURAL E SINGULAR
    // =============================================
    'Plural e Singular': [
        { input: 'marmita pequena', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Singular' },
        { input: 'marmitas pequenas', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Plural' },
        { input: 'pequena', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Abreviado singular' },
        { input: 'pequenas', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Abreviado plural' },
        { input: 'media', expected: [{ qty: 1, name: 'Marmita' }], desc: 'Media' },
        { input: 'medias', expected: [{ qty: 1, name: 'Marmita' }], desc: 'Medias' },
    ],

    // =============================================
    // NÚMEROS POR EXTENSO
    // =============================================
    'Números por extenso': [
        { input: 'uma pequena', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Uma' },
        { input: 'duas pequenas', expected: [{ qty: 2, name: 'Marmita Pequena' }], desc: 'Duas' },
        { input: 'tres medias', expected: [{ qty: 3, name: 'Marmita' }], desc: 'Três' },
        { input: 'quatro grandes', expected: [{ qty: 4, name: 'Marmita Grande' }], desc: 'Quatro' },
        { input: 'cinco pequenas', expected: [{ qty: 5, name: 'Marmita Pequena' }], desc: 'Cinco' },
        { input: 'duas marmitas grandes', expected: [{ qty: 2, name: 'Marmita Grande' }], desc: 'Duas + nome completo' },
    ],

    // =============================================
    // MÚLTIPLOS PRODUTOS
    // =============================================
    'Múltiplos produtos': [
        { input: 'uma media e uma pequena', expected: [{ name: 'Marmita' }, { name: 'Marmita Pequena' }], desc: 'Com "e"' },
        { input: '2 pequenas, 1 grande', expected: [{ qty: 2, name: 'Marmita Pequena' }, { qty: 1, name: 'Marmita Grande' }], desc: 'Com vírgula' },
        { input: 'marmita media mais coca', expected: [{ name: 'Marmita' }, { name: 'Coca' }], desc: 'Com "mais"' },
        { input: 'pequena + grande', expected: [{ name: 'Marmita Pequena' }, { name: 'Marmita Grande' }], desc: 'Com +' },
    ],

    // =============================================
    // FALSOS POSITIVOS A EVITAR
    // =============================================
    'Falsos positivos (bugs anteriores)': [
        { input: 'bom dia', expected: [], desc: 'Bug: "dia" não deve dar match em "media"' },
        { input: '2 pequena', expected: [{ qty: 2, name: 'Marmita Pequena' }], desc: 'Bug: "2" não deve dar match em "2L"' },
        { input: 'obrigado pela comida', expected: [], desc: '"comida" não é produto' },
        { input: 'quanto custa', expected: [], desc: 'Pergunta, não pedido' },
        { input: 'tudo bem?', expected: [], desc: 'Pergunta social' },
    ],

    // =============================================
    // MENSAGENS COM CONTEXTO
    // =============================================
    'Mensagens reais com contexto': [
        { input: 'bom dia, quero 2 marmitas medias', expected: [{ qty: 2, name: 'Marmita' }], desc: 'Saudação + pedido' },
        { input: 'oi, me vê uma pequena por favor', expected: [{ qty: 1, name: 'Marmita Pequena' }], desc: 'Educado' },
        { input: 'quero pedir 3 grandes e 2 cocas', expected: [{ qty: 3, name: 'Marmita Grande' }, { qty: 2, name: 'Coca' }], desc: 'Pedido completo' },
    ],

    // =============================================
    // CASOS ESPECIAIS DE BEBIDAS
    // =============================================
    'Bebidas - casos especiais': [
        { input: 'coca', expected: [{ qty: 1, name: 'Coca' }], desc: 'Só coca (sem especificar)' },
        { input: 'coca lata', expected: [{ qty: 1, name: 'Coca Cola Lata' }], desc: 'Coca lata específico' },
        { input: 'guarana', expected: [{ qty: 1, name: 'Guaraná' }], desc: 'Guaraná' },
        { input: 'agua', expected: [{ qty: 1, name: 'Água' }], desc: 'Água' },
    ],
};

// =============================================
// EXECUÇÃO DOS TESTES
// =============================================
async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           SUÍTE DE TESTES - WORD ANALYZER                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = [];

    for (const [category, tests] of Object.entries(TEST_CASES)) {
        console.log(`\n📋 ${category}`);
        console.log('─'.repeat(60));

        for (const test of tests) {
            totalTests++;
            const result = await findAllProducts(test.input, PRODUCTS, null, null);

            // Verificar resultado
            let passed = true;

            if (test.expected.length === 0) {
                // Esperado: nenhum produto
                passed = result.length === 0;
            } else {
                // Verificar cada produto esperado
                if (result.length !== test.expected.length) {
                    passed = false;
                } else {
                    for (let i = 0; i < test.expected.length; i++) {
                        const exp = test.expected[i];
                        const got = result[i];

                        // Verificar nome (match parcial)
                        if (exp.name && !got?.product?.name?.includes(exp.name)) {
                            passed = false;
                        }

                        // Verificar quantidade (se especificada)
                        if (exp.qty !== undefined && got?.quantity !== exp.qty) {
                            passed = false;
                        }
                    }
                }
            }

            if (passed) {
                passedTests++;
                console.log(`  ✅ "${test.input}" → ${test.desc}`);
            } else {
                const gotStr = result.length > 0
                    ? result.map(r => `${r.quantity}x ${r.product.name}`).join(', ')
                    : '(vazio)';
                const expStr = test.expected.length > 0
                    ? test.expected.map(e => `${e.qty || '?'}x ${e.name}`).join(', ')
                    : '(vazio)';

                console.log(`  ❌ "${test.input}"`);
                console.log(`     Esperado: ${expStr}`);
                console.log(`     Obtido:   ${gotStr}`);

                failedTests.push({
                    input: test.input,
                    desc: test.desc,
                    expected: expStr,
                    got: gotStr
                });
            }
        }
    }

    // Resumo
    console.log('\n');
    console.log('═'.repeat(60));
    console.log(`📊 RESULTADO: ${passedTests}/${totalTests} testes passaram`);
    console.log('═'.repeat(60));

    if (failedTests.length > 0) {
        console.log('\n❌ TESTES QUE FALHARAM:');
        for (const f of failedTests) {
            console.log(`  • "${f.input}" - ${f.desc}`);
        }
    } else {
        console.log('\n🎉 TODOS OS TESTES PASSARAM!');
    }

    return { total: totalTests, passed: passedTests, failed: failedTests };
}

// Executar
runTests();
