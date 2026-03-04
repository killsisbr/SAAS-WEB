import { findProductsInMessage } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'milk-shake-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const mockAddons = [
    { id: 'nutella', name: 'Nutella', price: 10 },
    { id: 'leite-ninho', name: 'Leite Ninho', price: 5 },
    { id: 'morango', name: 'Morango', price: 5 },
    { id: 'banana', name: 'Banana', price: 3 },
    { id: 'granola', name: 'Granola', price: 2 }
];

// Nota: A função findProductsInMessage atualmente retorna { product, quantity }.
// Precisamos evoluir para retornar { product, quantity, addons: [] }.

const megaScenarios = [
    {
        name: "Pedido da Galera (Massivo)",
        input: "Quero 1 acai 500 com nutella e leite ninho, 1 acai 300 sem nada, 2 milk shake de 300ml, 3 monstros e 5 coca lata",
        expected: [
            { id: 'acai-500', qty: 1, addons: ['nutella', 'leite-ninho'] },
            { id: 'acai-300', qty: 1, addons: [] },
            { id: 'milk-shake-300', qty: 2, addons: [] },
            { id: 'monster', qty: 3, addons: [] },
            { id: 'coca-lata', qty: 5, addons: [] }
        ]
    },
    {
        name: "Todos os Açaís com todos os Adicionais",
        input: "me ve um de 300 com banana e granola e um de 500 com morango e nutella",
        expected: [
            { id: 'acai-300', qty: 1, addons: ['banana', 'granola'] },
            { id: 'acai-500', qty: 1, addons: ['morango', 'nutella'] }
        ]
    }
];

async function runMegaTest() {
    console.log("🚀 Iniciando MEGA STRESS TEST (Catálogo + Adicionais)...\n");
    let passedCount = 0;

    for (const scenario of megaScenarios) {
        console.log(`🔹 Teste: ${scenario.name}`);
        console.log(`   Input: "${scenario.input}"`);

        try {
            // we will need to update findProductsInMessage signature or add a new param for addons
            const results = findProductsInMessage(scenario.input, mockProducts, mockAddons);

            let allMatch = true;
            if (results.length !== scenario.expected.length) {
                console.log(`   ❌ Erro: Esperado ${scenario.expected.length} itens, obtido ${results.length}`);
                allMatch = false;
            } else {
                for (let i = 0; i < scenario.expected.length; i++) {
                    const exp = scenario.expected[i];
                    const found = results[i]; // Or search by ID

                    if (!found || found.product.id !== exp.id) {
                        console.log(`   ❌ Erro Item ${i + 1}: Esperado ${exp.id}, obtido ${found?.product?.id}`);
                        allMatch = false;
                        continue;
                    }

                    if (found.quantity !== exp.qty) {
                        console.log(`   ❌ Erro Qtd: ${found.product.name} (Esperado: ${exp.qty}, Obtido: ${found.quantity})`);
                        allMatch = false;
                    }

                    if (exp.addons && exp.addons.length > 0) {
                        const foundAddons = found.addons?.map(a => a.id) || [];
                        const missing = exp.addons.filter(a => !foundAddons.includes(a));
                        if (missing.length > 0) {
                            console.log(`   ❌ Erro Adicionais: Faltando [${missing.join(', ')}] em ${found.product.name}`);
                            allMatch = false;
                        }
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

    console.log(`📊 Resumo: ${passedCount}/${megaScenarios.length} testes passaram.`);
}

runMegaTest();
