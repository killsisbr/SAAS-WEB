import { findProductsInMessage, normalizeText } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'acai-700', name: 'Copo Açaí 700ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'paleta-pacoca', name: 'Paleta de Paçoca', category_id: 'cat-paleta' },
    { id: 'milk-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const advancedScenarios = [
    {
        name: "Typos leves (Monstre)",
        input: "quero um monstre bem gelado",
        expected: [{ id: 'monster', qty: 1 }]
    },
    {
        name: "Typos em Açaí (Assai)",
        input: "me ve um assai de 500",
        expected: [{ id: 'acai-500', qty: 1 }]
    },
    {
        name: "Abreviação de Coca (Coca lt)",
        input: "manda 2 coca lt",
        expected: [{ id: 'coca-lata', qty: 2 }]
    },
    {
        name: "Lista complexa com preposições variadas",
        input: "Vou querer dois açaís de 500ml, um de 300, e tbm 3 monstros e 1 coca lata",
        expected: [
            { id: 'acai-500', qty: 2 },
            { id: 'acai-300', qty: 1 },
            { id: 'monster', qty: 3 },
            { id: 'coca-lata', qty: 1 }
        ]
    },
    {
        name: "Tamanho sem unidade colado",
        input: "açai500 e uma coca",
        expected: [
            { id: 'acai-500', qty: 1 },
            { id: 'coca-lata', qty: 1 }
        ]
    }
];

async function runAdvancedTests() {
    console.log("🧪 Iniciando Testes Avançados de Matcher...\n");
    let passedCount = 0;

    for (const scenario of advancedScenarios) {
        console.log(`🔹 Teste: ${scenario.name}`);
        console.log(`   Input: "${scenario.input}"`);

        try {
            const results = findProductsInMessage(scenario.input, mockProducts);
            const matches = results.map(r => r.product.name);
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

    console.log(`📊 Resumo: ${passedCount}/${advancedScenarios.length} testes passaram.`);
    if (passedCount < advancedScenarios.length) {
        process.exit(1);
    }
}

runAdvancedTests();
