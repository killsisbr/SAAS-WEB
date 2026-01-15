// Script para recadastrar cardapio completo da Fiorella
// Deleta tudo e cria do zero com dados corretos do menu

const BASE_URL = 'http://localhost:3000';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fiorella@gmail.com', password: 'fiorella123' })
    });
    return (await res.json()).token;
}

async function api(token, method, endpoint, body = null) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) return null;
    try { return await res.json(); } catch { return true; }
}

// ===== DADOS DO CARDAPIO =====

const CATEGORIES = [
    { name: 'Pizzas Tradicionais', display_mode: 'circular' },
    { name: 'Pizzas com Queijo', display_mode: 'circular' },
    { name: 'Pizzas Calabresa', display_mode: 'circular' },
    { name: 'Pizzas Presunto', display_mode: 'circular' },
    { name: 'Pizzas Frango', display_mode: 'circular' },
    { name: 'Pizzas Bacon', display_mode: 'circular' },
    { name: 'Pizzas Especiais', display_mode: 'circular' },
    { name: 'Pizzas Doces', display_mode: 'circular' },
    { name: 'Esfihas Abertas R$7', display_mode: 'circular' },
    { name: 'Esfihas Abertas', display_mode: 'default' },
    { name: 'Esfihas de Chocolate', display_mode: 'default' },
];

// Pizzas com tamanhos M/G
const PIZZAS = {
    'Pizzas Tradicionais': [
        { name: 'Peruana', desc: 'Mussarela, atum, ervilha, cebola e azeitona', img: 'atum.png' },
        { name: 'Atum', desc: 'Mussarela, atum, cebola, azeitona e oregano', img: 'atum.png' },
        { name: 'Estilo do Chefe', desc: 'Mussarela, tomate seco, pimentao e oregano', img: 'moda-da-casa.png' },
        { name: 'Siciliana', desc: 'Mussarela, champignon, bacon, cheddar e oregano', img: 'milho-com-bacon.png' },
        { name: 'Moda Caipira', desc: 'Mussarela, milho, frango, tomate e oregano', img: 'milho-com-bacon.png' },
        { name: 'Alho e Oleo', desc: 'Mussarela, alho, oleo, oregano e azeitona', img: 'muçarela.png' },
        { name: 'Lombo com Cheddar', desc: 'Mussarela, lombo, cheddar e oregano', img: 'calabresa.png' },
        { name: 'A Moda', desc: 'Mussarela, presunto, ovos, calabresa e palmito', img: 'portuguesa.png' },
        { name: 'Inglesa', desc: 'Mussarela, calabresa, palmito, cebola, milho e oregano', img: 'calabresa.png' },
        { name: 'Paulista', desc: 'Mussarela, milho, palmito, ervilha, tomate e oregano', img: 'napolitana.png' },
        { name: 'Vegetariana', desc: 'Mussarela, palmito, milho, ervilha, tomate e oregano', img: 'napolitana.png' },
        { name: 'Americana', desc: 'Mussarela, rodelas de tomate e calabresa', img: 'calabresa.png' },
        { name: 'Romana', desc: 'Mussarela, tomate, parmesao e oregano', img: 'napolitana.png' },
        { name: 'Brocolis', desc: 'Mussarela, brocolis, ovos e parmesao', img: 'brocolis-com-catupiry.png' },
        { name: 'Magnifica', desc: 'Mussarela, tomate, bacon, ovos e parmesao', img: 'portuguesa.png' },
    ],
    'Pizzas com Queijo': [
        { name: 'Queijo', desc: 'Mussarela, molho de tomate, oregano e azeitona', img: 'muçarela.png' },
        { name: 'Queijo Crocante', desc: 'Mussarela e molho de tomate', img: 'muçarela.png' },
        { name: '3 Queijos', desc: 'Mussarela, catupiry e provolone', img: '4queijos.png' },
        { name: '4 Queijos', desc: 'Mussarela, catupiry, provolone e parmesao', img: '4queijos.png' },
        { name: '6 Queijos', desc: 'Mussarela, catupiry, provolone, parmesao, cheddar e gorgonzola', img: '4queijos.png' },
    ],
    'Pizzas Calabresa': [
        { name: 'Baiana', desc: 'Mussarela, calabresa, ovos, cebola, pimenta e oregano', img: 'calabresa.png' },
        { name: 'Calabresa', desc: 'Mussarela, calabresa fatiada, cebola e oregano', img: 'calabresa.png' },
        { name: 'Calabresa com Cheddar', desc: 'Mussarela, calabresa fatiada e cheddar', img: 'calabresa.png' },
        { name: 'Calabresa com Catupiry', desc: 'Mussarela, calabresa fatiada e catupiry', img: 'calabresa.png' },
    ],
    'Pizzas Presunto': [
        { name: 'Presunto', desc: 'Mussarela, presunto, ervilha e oregano', img: 'portuguesa.png' },
        { name: 'Marguerita', desc: 'Mussarela, presunto, tomate, parmesao e manjericao', img: 'napolitana.png' },
        { name: 'Eldorado', desc: 'Mussarela, presunto, bacon, milho e oregano', img: 'milho-com-bacon.png' },
        { name: 'Portuguesa', desc: 'Mussarela, presunto, ovos, cebola e azeitona', img: 'portuguesa.png' },
        { name: 'Portuguesa Especial', desc: 'Mussarela, presunto, ovos, ervilha, palmito e catupiry', img: 'portuguesa.png' },
        { name: 'Tropical', desc: 'Mussarela, presunto, calabresa, palmito e oregano', img: 'calabresa.png' },
    ],
    'Pizzas Frango': [
        { name: 'Frango', desc: 'Mussarela, frango e oregano', img: 'frango-catupiry.png' },
        { name: 'Frango com Cheddar', desc: 'Mussarela, frango, cheddar e oregano', img: 'frango-catupiry.png' },
        { name: 'Frango com Catupiry', desc: 'Mussarela, frango, catupiry e oregano', img: 'frango-catupiry.png' },
        { name: 'Frango Cremoso', desc: 'Mussarela, frango, requeijao e oregano', img: 'frango-catupiry.png' },
        { name: 'Frango com Bacon', desc: 'Mussarela, frango, bacon, oregano e azeitona', img: 'frango-catupiry.png' },
    ],
    'Pizzas Bacon': [
        { name: 'Preferida', desc: 'Mussarela, bacon, tomate, catupiry e parmesao', img: 'milho-com-bacon.png' },
        { name: 'Bacon', desc: 'Mussarela, bacon, oregano e azeitona', img: 'milho-com-bacon.png' },
        { name: 'Xizi', desc: 'Mussarela, bacon, catupiry e batata palha', img: 'milho-com-bacon.png' },
        { name: 'Bacon com Ovos', desc: 'Mussarela, bacon, ovos e oregano', img: 'milho-com-bacon.png' },
        { name: 'Pizzaiolo', desc: 'Mussarela, bacon, calabresa e catupiry', img: 'pepperoni.png' },
    ],
    'Pizzas Especiais': [
        { name: 'Francesa', desc: 'Mussarela, palmito, ervilha, ovos, cebola e oregano', img: 'portuguesa.png' },
        { name: 'Cracovia', desc: 'Mussarela, cracovia, ovos, bacon, palmito e cheddar', img: 'calabresa.png' },
        { name: 'Strogonoff de Carne', desc: 'Mussarela, strogonoff de carne e batata palha', img: 'moda-da-casa.png' },
        { name: 'Strogonoff de Frango', desc: 'Mussarela, strogonoff de frango e oregano', img: 'frango-catupiry.png' },
        { name: 'Fratelo (Da Casa)', desc: 'Mussarela, mignon em cubos, cheddar e molho barbecue', img: 'moda-da-casa.png' },
        { name: 'Pizza Fiorella', desc: 'Mussarela, frango, bacon, catupiry e batata palha', img: 'frango-catupiry.png' },
        { name: 'Lamontanha', desc: 'Mussarela, presunto, milho, ervilha, bacon, calabresa, catupiry e batata palha', img: 'moda-da-casa.png' },
        { name: 'Nova Lamontanha', desc: 'Mussarela, presunto, milho, ervilha, tomate, frango, calabresa, bacon e cheddar', img: 'moda-da-casa.png' },
    ],
    'Pizzas Doces': [
        { name: 'Brigadeiro', desc: 'Mussarela, chocolate, granulado e leite condensado', img: 'chocolate.png' },
        { name: 'Prestigio', desc: 'Mussarela, chocolate, coco e leite condensado', img: 'chocolate.png' },
        { name: 'Banana', desc: 'Mussarela, banana, canela e leite condensado', img: 'banan-doce-de-leite.png' },
        { name: 'Crocante', desc: 'Mussarela, amendoim, chocolate e leite condensado', img: 'chocolate.png' },
    ],
};

// Esfihas abertas numeradas R$ 7,00
const ESFIHAS_7 = [
    { name: '1-Lamontanha', desc: 'Presunto, mussarela, milho, ervilha, bacon, calabresa, catupiry e batata palha', img: 'moda-da-casa.png' },
    { name: '2-Xizi', desc: 'Mussarela, bacon, catupiry e batata palha', img: 'milho-com-bacon.png' },
    { name: '3-Eldorado', desc: 'Presunto, mussarela, milho e bacon', img: 'milho-com-bacon.png' },
    { name: '4-Moda Caipira', desc: 'Mussarela, frango, tomate e milho', img: 'frango-catupiry.png' },
    { name: '5-Pizzaiolo', desc: 'Mussarela, bacon, calabresa e catupiry', img: 'pepperoni.png' },
    { name: '6-Preferida', desc: 'Mussarela, tomate, bacon e catupiry', img: 'milho-com-bacon.png' },
    { name: '7-Quatro Queijo', desc: 'Mussarela, provolone, parmesao e catupiry', img: '4queijos.png' },
    { name: '8-Estrogonofe de Carne', desc: 'Mussarela, estrogonofe e batata palha', img: 'moda-da-casa.png' },
    { name: '9-Estrogonofe de Frango', desc: 'Mussarela, estrogonofe e batata palha', img: 'frango-catupiry.png' },
];

// Esfihas abertas variadas
const ESFIHAS_ABERTAS = [
    // R$ 5,50
    { name: 'Frango-Catupiry', price: 5.50 },
    { name: 'Frango-Cheddar', price: 5.50 },
    { name: 'Calabresa-Catupiry', price: 5.50 },
    { name: 'Calabresa-Cheddar', price: 5.50 },
    { name: 'Bacon-Catupiry', price: 5.50 },
    { name: 'Bacon-Cheddar', price: 5.50 },
    { name: 'Palmito-Catupiry', price: 5.50 },
    { name: 'Palmito-Cheddar', price: 5.50 },
    { name: 'Mussarela', price: 5.50 },
    // R$ 6,00
    { name: 'Frango-Mussarela-Catupiry', price: 6.00 },
    { name: 'Calabresa-Mussarela-Catupiry', price: 6.00 },
    { name: 'Bacon-Mussarela-Catupiry', price: 6.00 },
    // R$ 6,50
    { name: 'Frango-Mussarela-Milho-Catupiry', price: 6.50 },
    { name: 'Calabresa-Mussarela-Milho-Catupiry', price: 6.50 },
];

// Esfihas de chocolate
const ESFIHAS_CHOCOLATE = [
    { name: 'Chocolate Preto', price: 5.50 },
    { name: 'Chocolate Branco', price: 5.50 },
    { name: 'Chocolate Preto-Banana', price: 5.50 },
    { name: 'Banana-Canela', price: 5.50 },
    { name: 'Chocolate Preto-Coco', price: 5.50 },
    { name: 'Chocolate Preto-Granulado', price: 5.50 },
    { name: 'Chocolate Preto e Branco', price: 5.50 },
    { name: 'Chocolate Preto-Morango', price: 6.00 },
    { name: 'Chocolate Branco-Morango', price: 6.00 },
];

async function main() {
    console.log('=== RECADASTRANDO CARDAPIO FIORELLA ===\n');

    const token = await login();
    console.log('[OK] Login\n');

    // 1. DELETAR PRODUTOS EXISTENTES
    console.log('--- Deletando produtos existentes ---');
    const products = await api(token, 'GET', '/api/products');
    if (products && products.length > 0) {
        for (const p of products) {
            await api(token, 'DELETE', `/api/products/${p.id}`);
            console.log(`  [DEL] ${p.name}`);
            await delay(50);
        }
    }
    console.log(`  Total: ${products?.length || 0} deletados\n`);

    // 2. DELETAR CATEGORIAS EXISTENTES
    console.log('--- Deletando categorias existentes ---');
    const categories = await api(token, 'GET', '/api/categories');
    if (categories && categories.length > 0) {
        for (const c of categories) {
            await api(token, 'DELETE', `/api/categories/${c.id}`);
            console.log(`  [DEL] ${c.name}`);
            await delay(50);
        }
    }
    console.log(`  Total: ${categories?.length || 0} deletadas\n`);

    // 3. CRIAR NOVAS CATEGORIAS
    console.log('--- Criando categorias ---');
    const catIds = {};
    for (const cat of CATEGORIES) {
        const result = await api(token, 'POST', '/api/categories', cat);
        if (result && result.category && result.category.id) {
            catIds[cat.name] = result.category.id;
            console.log(`  [OK] ${cat.name}`);
        } else {
            console.log(`  [ERR] ${cat.name}`, result);
        }
        await delay(100);
    }
    console.log('');

    // 4. CRIAR PIZZAS (com tamanhos M/G)
    const basePrice = { 'M': 35, 'G': 45 };

    for (const [catName, pizzas] of Object.entries(PIZZAS)) {
        console.log(`--- ${catName} ---`);
        const catId = catIds[catName];
        if (!catId) { console.log('  [SKIP] Categoria nao encontrada'); continue; }

        for (const pizza of pizzas) {
            const result = await api(token, 'POST', '/api/products', {
                name: pizza.name,
                description: pizza.desc,
                categoryId: catId,
                images: [`/images/pizzas/${pizza.img}`],
                price: 0,
                has_sizes: 1,
                sizes: JSON.stringify(['M', 'G']),
                size_prices: JSON.stringify(basePrice),
                isAvailable: true
            });
            console.log(`  ${result ? '[OK]' : '[ERR]'} ${pizza.name}`);
            await delay(100);
        }
    }

    // 5. CRIAR ESFIHAS R$ 7
    console.log('\n--- Esfihas Abertas R$7 ---');
    const catEsf7 = catIds['Esfihas Abertas R$7'];
    for (const esf of ESFIHAS_7) {
        const result = await api(token, 'POST', '/api/products', {
            name: esf.name,
            description: esf.desc,
            categoryId: catEsf7,
            images: [`/images/pizzas/${esf.img}`],
            price: 7.00,
            isAvailable: true
        });
        console.log(`  ${result ? '[OK]' : '[ERR]'} ${esf.name}`);
        await delay(100);
    }

    // 6. CRIAR ESFIHAS ABERTAS VARIADAS
    console.log('\n--- Esfihas Abertas ---');
    const catEsfAb = catIds['Esfihas Abertas'];
    for (const esf of ESFIHAS_ABERTAS) {
        const result = await api(token, 'POST', '/api/products', {
            name: esf.name,
            description: 'Esfiha aberta',
            categoryId: catEsfAb,
            images: ['/images/pizzas/moda-da-casa.png'],
            price: esf.price,
            isAvailable: true
        });
        console.log(`  ${result ? '[OK]' : '[ERR]'} ${esf.name} - R$ ${esf.price}`);
        await delay(100);
    }

    // 7. CRIAR ESFIHAS DE CHOCOLATE
    console.log('\n--- Esfihas de Chocolate ---');
    const catChoco = catIds['Esfihas de Chocolate'];
    for (const esf of ESFIHAS_CHOCOLATE) {
        const result = await api(token, 'POST', '/api/products', {
            name: esf.name,
            description: 'Esfiha de chocolate',
            categoryId: catChoco,
            images: ['/images/pizzas/chocolate.png'],
            price: esf.price,
            isAvailable: true
        });
        console.log(`  ${result ? '[OK]' : '[ERR]'} ${esf.name}`);
        await delay(100);
    }

    console.log('\n=== CARDAPIO COMPLETO CRIADO! ===');
    console.log('Acesse: http://localhost:3000/loja/fiorella');
}

main().catch(console.error);
