import { findProductsInMessage, normalizeText } from '../agent-employee/services/product-matcher.js';

const mockProducts = [
    { id: 'acai-300', name: 'Copo Açaí 300ml', category_id: 'cat-acai' },
    { id: 'acai-500', name: 'Copo Açaí 500ml', category_id: 'cat-acai' },
    { id: 'coca-lata', name: 'Coca Lata', category_id: 'cat-bebidas' },
    { id: 'monster', name: 'Monster', category_id: 'cat-bebidas' },
    { id: 'paleta-pacoca', name: 'Paleta de Paçoca', category_id: 'cat-paleta' },
    { id: 'milk-300', name: 'Milk Shake 300ml', category_id: 'cat-milk' }
];

const testScenarios = [
    {
        name: "Simples conjunção 'e'",
        msg: "quero um monster e uma coca lata",
        expected: ["Monster", "Coca Lata"]
    },
    {
        name: "Quantidades em numeral",
        msg: "me ve 2 coca lata e 3 monster",
        expected: ["Coca Lata", "Monster"]
    },
    {
        name: "Quantidades por extenso",
        msg: "queria dois açai de 300 e um de 500",
        expected: ["Copo Açaí 300ml", "Copo Açaí 500ml"],
        checkQty: { "Copo Açaí 300ml": 2, "Copo Açaí 500ml": 1 }
    },
    {
        name: "Mistura colada",
        msg: "quero1monster e2coca lata",
        expected: ["Monster", "Coca Lata"]
    },
    {
        name: "Plurais e termos variados",
        msg: "manda dois monstros e 3 cocas",
        expected: ["Monster", "Coca Lata"]
    },
    {
        name: "Itens com preposição 'de'",
        msg: "um shaking de 300ml e uma paleta de pacoca",
        expected: ["Milk Shake 300ml", "Paleta de Paçoca"]
    },
    {
        name: "Ruído e pontuação",
        msg: "Oi, tudo bem? Por favor, eu queria... um açaí de 500ml, e também um monster!!! Valeu",
        expected: ["Copo Açaí 500ml", "Monster"]
    }
];

console.log('🧪 Iniciando Testes de Stress de Matcher...\n');

let passed = 0;

testScenarios.forEach(scenario => {
    console.log(`\n🔹 Teste: ${scenario.name}`);
    console.log(`   Input: "${scenario.msg}"`);

    const results = findProductsInMessage(scenario.msg, mockProducts);
    const matchedNames = results.map(r => r.product.name);

    console.log(`   Matches: [${matchedNames.join(', ')}]`);

    let allFound = scenario.expected.every(name => matchedNames.includes(name));
    let qtyCorrect = true;

    if (scenario.checkQty) {
        for (const [name, qty] of Object.entries(scenario.checkQty)) {
            const res = results.find(r => r.product.name === name);
            if (!res || res.quantity !== qty) {
                qtyCorrect = false;
                console.log(`   ❌ Erro Qtd: ${name} (Esperado: ${qty}, Obtido: ${res?.quantity})`);
            }
        }
    }

    if (allFound && qtyCorrect && results.length === scenario.expected.length) {
        console.log(`   ✅ PASSOU`);
        passed++;
    } else {
        console.log(`   ❌ FALHOU`);
    }
});

console.log(`\n📊 Resumo: ${passed}/${testScenarios.length} testes passaram.\n`);

if (passed < testScenarios.length) {
    process.exit(1);
} else {
    process.exit(0);
}
