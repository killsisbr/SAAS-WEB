import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'acai-700', name: 'Copo Açaí 700ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'paleta-pacoca', name: 'Paleta de Paçoca', category_id: 'cat-paleta' },
    { id: 'milk-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const multiItemScenarios = [
    {
        name: "Dois itens simples com 'e'",
        input: "quero um monster e uma coca lata",
        expected: [{ id: 'monster', qty: 1 }, { id: 'coca-lata', qty: 1 }]
    },
    {
        name: "Dois itens com quantidades diferentes",
        input: "me ve 3 monster e 2 coca lata",
        expected: [{ id: 'monster', qty: 3 }, { id: 'coca-lata', qty: 2 }]
    },
    {
        name: "Mix de tamanhos e quantidades",
        input: "vou querer dois açai de 500 e um shake de 300",
        expected: [{ id: 'acai-500', qty: 2 }, { id: 'milk-300', qty: 1 }]
    },
    {
        name: "Pedido corrido com vírgula",
        input: "manda 1 paleta de pacoca, e tbm 2 monstros",
        expected: [{ id: 'paleta-pacoca', qty: 1 }, { id: 'monster', qty: 2 }]
    },
    {
        name: "Dois itens sem separador claro",
        input: "quero uma coca um monster",
        expected: [{ id: 'coca-lata', qty: 1 }, { id: 'monster', qty: 1 }]
    },
    {
        name: "Abreviações e gírias",
        input: "lanca 2 coca lt e 1 assai 300ml",
        expected: [{ id: 'coca-lata', qty: 2 }, { id: 'acai-300', qty: 1 }]
    },
    {
        name: "Dois tamanhos do mesmo produto",
        input: "queria um açai de 300 e outro de 700",
        expected: [{ id: 'acai-300', qty: 1 }, { id: 'acai-700', qty: 1 }]
    }
];

async function runMultiItemTests() {
    console.log("🧪 Iniciando Testes de Multi-Itens (2 por cliente)...\n");
    let passedCount = 0;

    for (const scenario of multiItemScenarios) {
        console.log(`🔹 Teste: ${scenario.name}`);
        console.log(`   Input: "${scenario.input}"`);

        try {
            const results = findProductsInMessage(scenario.input, mockProducts);
            const matches = results.map(r => `${r.quantity}x ${r.product.name}`);
            console.log(`   Matches: [${matches.join(', ')}]`);

            let allMatch = true;
            if (results.length !== scenario.expected.length) {
                console.log(`   ❌ Erro: Esperado ${scenario.expected.length} itens, obtido ${results.length}`);
                allMatch = false;
            } else {
                for (const exp of scenario.expected) {
                    const found = results.find(r => r.product.id === exp.id);
                    if (!found) {
                        console.log(`   ❌ Erro: Produto ${exp.id} não encontrado`);
                        allMatch = false;
                    } else if (found.quantity !== exp.qty) {
                        console.log(`   ❌ Erro Qtd: ${found.product.name} (Esperado: ${exp.qty}, Obtido: ${found.quantity})`);
                        allMatch = false;
                    }
                }
            }

            if (allMatch) {
                console.log("   ✅ PASSOU");
                passedCount++;
            } else {
                console.log("   ❌ FALHOU");
            }
        } catch (err) {
            console.log(`   💥 CRASH: ${err.message}`);
        }
        console.log("");
    }

    console.log(`📊 Resumo: ${passedCount}/${multiItemScenarios.length} testes passaram.`);
    if (passedCount < multiItemScenarios.length) {
        process.exit(1);
    }
}

runMultiItemTests();
