import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'milk-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const diversityScenarios = [
    {
        name: "Quantidade após o nome",
        input: "açai de 500ml duas unidades",
        expected: [{ id: 'acai-500', qty: 2 }]
    },
    {
        name: "Ruído massivo e irrelevante",
        input: "Boa tarde pessoal, tudo bem? Olha, o meu filho está aqui pedindo mto pra eu pegar um monster pra ele, entao manda um monster e pra mim pode ser 2 coca lata. Ah, e nao esquece o canudo.",
        expected: [{ id: 'monster', qty: 1 }, { id: 'coca-lata', qty: 2 }]
    },
    {
        name: "Ambiguidade de 'um' (artigo vs número)",
        input: "Queria um monster e tbm um açai de 500",
        expected: [{ id: 'monster', qty: 1 }, { id: 'acai-500', qty: 1 }]
    },
    {
        name: "Repetição do mesmo item em partes diferentes",
        input: "Manda 1 monster e mais tarde vc manda mais 2 monster",
        expected: [{ id: 'monster', qty: 3 }] // O matcher atual pode pegar apenas a primeira ou separar, vamos ver o comportamento
    },
    {
        name: "Linguagem muito informal/abreviada",
        input: "me ve 1 mstr e 2 cc lt", // Testando limites do fuzzy
        expected: [{ id: 'monster', qty: 1 }, { id: 'coca-lata', qty: 2 }]
    }
];

async function runDiversityTests() {
    console.log("🧪 Iniciando Testes de Diversidade Extrema...\n");
    let passedCount = 0;

    for (const scenario of diversityScenarios) {
        console.log(`🔹 Teste: ${scenario.name}`);
        console.log(`   Input: "${scenario.input}"`);

        try {
            const results = findProductsInMessage(scenario.input, mockProducts);
            const matches = results.map(r => `${r.quantity}x ${r.product.name}`);
            console.log(`   Matches: [${matches.join(', ')}]`);

            let allMatch = true;
            // Para o teste de repetição, somamos as quantidades se o ID for igual
            const combinedResults = results.reduce((acc, curr) => {
                const existing = acc.find(a => a.product.id === curr.product.id);
                if (existing) existing.quantity += curr.quantity;
                else acc.push({ ...curr });
                return acc;
            }, []);

            if (combinedResults.length !== scenario.expected.length) {
                console.log(`   ❌ Erro: Esperado ${scenario.expected.length} itens únicos, obtido ${combinedResults.length}`);
                allMatch = false;
            } else {
                for (const exp of scenario.expected) {
                    const found = combinedResults.find(r => r.product.id === exp.id);
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

    console.log(`📊 Resumo: ${passedCount}/${diversityScenarios.length} testes passaram.`);
    if (passedCount < diversityScenarios.length) {
        process.exit(1);
    }
}

runDiversityTests();
