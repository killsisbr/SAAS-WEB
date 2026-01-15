// Script para cadastrar cardapio da Fiorella
// Execute: node add-fiorella-menu.mjs (da pasta server)

const BASE_URL = 'http://localhost:3000';

// Primeiro, fazer login para obter token
async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fiorella@gmail.com', password: 'fiorella123' })
    });
    const data = await res.json();
    return data.token;
}

async function api(token, method, endpoint, body = null) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Tenant-Slug': 'fiorella'
        },
        body: body ? JSON.stringify(body) : null
    });
    return res.json();
}

async function main() {
    console.log('=== Cadastrando Cardapio Fiorella ===\n');

    const token = await login();
    console.log('[OK] Login realizado\n');

    // ========================================
    // CATEGORIAS
    // ========================================

    const categories = [
        { name: 'Pizzas Tradicionais', icon: 'fas fa-pizza-slice', displayMode: 'circular' },
        { name: 'Pizzas Especiais', icon: 'fas fa-star', displayMode: 'circular' },
        { name: 'Pizzas Doces', icon: 'fas fa-cookie', displayMode: 'circular' },
        { name: 'Esfihas Abertas', icon: 'fas fa-circle', displayMode: 'default' },
        { name: 'Esfihas de Chocolate', icon: 'fas fa-cookie-bite', displayMode: 'default' },
        { name: 'Esfirra de Carne', icon: 'fas fa-drumstick-bite', displayMode: 'default' }
    ];

    const catIds = {};
    for (const cat of categories) {
        const result = await api(token, 'POST', '/api/categories', cat);
        if (result.category) {
            catIds[cat.name] = result.category.id;
            console.log(`[CAT] ${cat.name} - ID: ${result.category.id}`);
        } else {
            console.log(`[SKIP] ${cat.name} - ${result.error || 'ja existe'}`);
        }
    }

    // Buscar categorias existentes
    const existingCats = await api(token, 'GET', '/api/categories');
    for (const c of existingCats) {
        if (c.name.includes('Pizzas') && !catIds[c.name]) catIds[c.name] = c.id;
        if (c.name === 'Principal') catIds['Principal'] = c.id;
    }

    console.log('\nCategorias:', catIds);

    // ========================================
    // PIZZAS TRADICIONAIS (R$ 7,00 - preco unico)
    // ========================================

    const pizzasTradicionais = [
        { name: 'Lamontanha', description: 'Presunto, mussarela, milho, ervilha, bacon, calabresa, catupiry e batata palha' },
        { name: 'Xizi', description: 'Mussarela, bacon, catupiry e batata palha' },
        { name: 'Eldorado', description: 'Presunto, mussarela, milho e bacon' },
        { name: 'Moda Caipira', description: 'Mussarela, frango, tomate e milho' },
        { name: 'Pizzaiolo', description: 'Mussarela, bacon, calabresa e catupiry' },
        { name: 'Preferida', description: 'Mussarela, tomate, bacon e catupiry' },
        { name: 'Quatro Queijo', description: 'Mussarela, provolone, parmesao e catupiry' },
        { name: 'Estrogonofe de Carne', description: 'Mussarela, estrogonofe de carne e batata palha' },
        { name: 'Estrogonofe de Frango', description: 'Mussarela, estrogonofe de frango e batata palha' },
        { name: 'Peruana', description: 'Mussarela, atum, ervilha, cebola e azeitona' },
        { name: 'Atum', description: 'Mussarela, atum, cebola, azeitona e oregano' },
        { name: 'Estilo do Chefe', description: 'Tomate, mussarela, oregano, molho de pimenta' },
        { name: 'Siciliana', description: 'Mussarela, champignon, bacon, cheddar e oregano' },
        { name: 'Alho e Oleo', description: 'Mussarela, alho, oleo, oregano e azeitona' },
        { name: 'Lombo com Cheddar', description: 'Mussarela, lombo, cheddar e oregano' },
        { name: 'A Moda', description: 'Mussarela, presunto, ovos, calabresa e palmito' },
        { name: 'Inglesa', description: 'Mussarela, calabresa, palmito, cebola e milho' },
        { name: 'Paulista', description: 'Mussarela, milho, palmito, ervilha, tomate e oregano' },
        { name: 'Vegetariana', description: 'Mussarela, palmito, milho, ervilha, tomate e oregano' },
        { name: 'Tivoli', description: 'Mussarela, presunto, milho, tomate, cebola, ovos e manjericao' },
        { name: 'Americana', description: 'Mussarela, rodelas de tomate e calabresa' },
        { name: 'Romana', description: 'Mussarela, tomate, parmesao e oregano' },
        { name: 'Brocolis', description: 'Mussarela, brocolis, ovos, parmesao e oregano' },
        { name: 'Magnifica', description: 'Mussarela, tomate, bacon, ovos, parmesao e oregano' }
    ];

    const catTradId = catIds['Pizzas Tradicionais'] || catIds['Principal'] || catIds['Pizzas'];
    console.log('\n--- Pizzas Tradicionais ---');
    for (const pizza of pizzasTradicionais) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS CALABRESA
    // ========================================

    const pizzasCalabresa = [
        { name: 'Baiana', description: 'Mussarela, calabresa, ovos, cebola, pimenta e oregano' },
        { name: 'Calabresa', description: 'Mussarela, calabresa fatiada, cebola e oregano' },
        { name: 'Calabresa com Cheddar', description: 'Mussarela, calabresa fatiada e cheddar' },
        { name: 'Calabresa com Catupiry', description: 'Mussarela, calabresa fatiada e catupiry' }
    ];

    console.log('\n--- Pizzas Calabresa ---');
    for (const pizza of pizzasCalabresa) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS PRESUNTO
    // ========================================

    const pizzasPresunto = [
        { name: 'Presunto', description: 'Mussarela, presunto, ervilha e oregano' },
        { name: 'Marguerita', description: 'Mussarela, presunto, tomate, parmesao e manjericao' },
        { name: 'Portuguesa', description: 'Mussarela, presunto, ovos, cebola e azeitona' },
        { name: 'Portuguesa Especial', description: 'Mussarela, presunto, ovos, ervilha, palmito e catupiry' },
        { name: 'Tropical', description: 'Mussarela, presunto, calabresa, palmito e oregano' }
    ];

    console.log('\n--- Pizzas Presunto ---');
    for (const pizza of pizzasPresunto) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS FRANGO
    // ========================================

    const pizzasFrango = [
        { name: 'Frango', description: 'Mussarela, frango e oregano' },
        { name: 'Frango com Cheddar', description: 'Mussarela, frango, cheddar e oregano' },
        { name: 'Frango com Catupiry', description: 'Mussarela, frango, catupiry e oregano' },
        { name: 'Frango Cremoso', description: 'Mussarela, frango, requeijao e oregano' },
        { name: 'Frango com Bacon', description: 'Mussarela, frango, bacon, oregano e azeitona' }
    ];

    console.log('\n--- Pizzas Frango ---');
    for (const pizza of pizzasFrango) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS BACON
    // ========================================

    const pizzasBacon = [
        { name: 'Preferida', description: 'Mussarela, bacon, tomate, catupiry e parmesao' },
        { name: 'Bacon', description: 'Mussarela, bacon, oregano e azeitona' },
        { name: 'Xizi', description: 'Mussarela, bacon, catupiry e batata palha' },
        { name: 'Bacon com Ovos', description: 'Mussarela, bacon, ovos e oregano' }
    ];

    console.log('\n--- Pizzas Bacon ---');
    for (const pizza of pizzasBacon) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS QUEIJO
    // ========================================

    const pizzasQueijo = [
        { name: 'Queijo', description: 'Mussarela, molho de tomate, oregano e azeitona' },
        { name: 'Queijo Crocante', description: 'Mussarela, molho de tomate especial' },
        { name: '3 Queijos', description: 'Mussarela, catupiry, provolone, oregano e azeitona' },
        { name: '4 Queijos', description: 'Mussarela, catupiry, provolone, parmesao e azeitona' },
        { name: '6 Queijos', description: 'Mussarela, catupiry, provolone, parmesao, cheddar e gorgonzola' }
    ];

    console.log('\n--- Pizzas Queijo ---');
    for (const pizza of pizzasQueijo) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catTradId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS ESPECIAIS (tem tamanhos M/G)
    // ========================================

    const catEspId = catIds['Pizzas Especiais'] || catTradId;
    const pizzasEspeciais = [
        { name: 'Francesa', description: 'Mussarela, palmito, ervilha, ovos, cebola e oregano' },
        { name: 'Cracovia', description: 'Mussarela, cracovia, ovos, bacon, palmito e cheddar' },
        { name: 'Strogonoff de Carne', description: 'Mussarela, strogonoff de carne e batata palha' },
        { name: 'Strogonoff de Frango', description: 'Mussarela, strogonoff de frango e oregano' },
        { name: 'Fratelo (Da Casa)', description: 'Mussarela, mignon em cubos, cheddar e molho de barbecue' },
        { name: 'Pizza Fiorella', description: 'Mussarela, frango, bacon, catupiry e batata palha' },
        { name: 'Nova Lamontanha', description: 'Mussarela, presunto, milho, ervilha, tomate, frango, calabresa, bacon e cheddar' }
    ];

    console.log('\n--- Pizzas Especiais ---');
    for (const pizza of pizzasEspeciais) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 8.00,
            categoryId: catEspId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // PIZZAS DOCES
    // ========================================

    const catDocesId = catIds['Pizzas Doces'] || catTradId;
    const pizzasDoces = [
        { name: 'Brigadeiro', description: 'Mussarela, chocolate, granulado e leite condensado' },
        { name: 'Prestigio', description: 'Mussarela, chocolate, coco e leite condensado' },
        { name: 'Banana', description: 'Mussarela, banana, canela e leite condensado' },
        { name: 'Crocante', description: 'Mussarela, amendoim, chocolate e leite condensado' }
    ];

    console.log('\n--- Pizzas Doces ---');
    for (const pizza of pizzasDoces) {
        const result = await api(token, 'POST', '/api/products', {
            name: pizza.name,
            description: pizza.description,
            price: 7.00,
            categoryId: catDocesId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
    }

    // ========================================
    // ESFIHAS ABERTAS (R$ 5,50 a R$ 6,50)
    // ========================================

    const catEsfihaId = catIds['Esfihas Abertas'] || catTradId;
    const esfihasAbertas = [
        // R$ 5,50 - 2 ingredientes
        { name: 'Frango-Catupiry', price: 5.50 },
        { name: 'Frango-Cheddar', price: 5.50 },
        { name: 'Calabresa-Catupiry', price: 5.50 },
        { name: 'Calabresa-Cheddar', price: 5.50 },
        { name: 'Bacon-Catupiry', price: 5.50 },
        { name: 'Bacon-Cheddar', price: 5.50 },
        { name: 'Palmito-Catupiry', price: 5.50 },
        { name: 'Palmito-Cheddar', price: 5.50 },
        { name: 'Tomate-Catupiry', price: 5.50 },
        { name: 'Tomate-Cheddar', price: 5.50 },
        { name: 'Milho-Catupiry', price: 5.50 },
        { name: 'Milho-Cheddar', price: 5.50 },
        { name: 'Mussarela', price: 5.50 },
        // R$ 6,00 - 3 ingredientes
        { name: 'Frango-Mussarela-Catupiry', price: 6.00 },
        { name: 'Frango-Mussarela-Cheddar', price: 6.00 },
        { name: 'Calabresa-Mussarela-Catupiry', price: 6.00 },
        { name: 'Calabresa-Mussarela-Cheddar', price: 6.00 },
        { name: 'Bacon-Mussarela-Catupiry', price: 6.00 },
        { name: 'Bacon-Mussarela-Cheddar', price: 6.00 },
        { name: 'Palmito-Mussarela-Catupiry', price: 6.00 },
        { name: 'Palmito-Mussarela-Cheddar', price: 6.00 },
        { name: 'Tomate-Mussarela-Catupiry', price: 6.00 },
        { name: 'Tomate-Mussarela-Cheddar', price: 6.00 },
        { name: 'Milho-Mussarela-Catupiry', price: 6.00 },
        { name: 'Milho-Mussarela-Cheddar', price: 6.00 },
        // R$ 6,50 - 4 ingredientes
        { name: 'Frango-Mussarela-Milho-Catupiry', price: 6.50 },
        { name: 'Frango-Mussarela-Bacon-Catupiry', price: 6.50 },
        { name: 'Frango-Mussarela-Bacon-Cheddar', price: 6.50 },
        { name: 'Calabresa-Mussarela-Milho-Catupiry', price: 6.50 },
        { name: 'Calabresa-Mussarela-Milho-Cheddar', price: 6.50 },
        { name: 'Bacon-Mussarela-Milho-Catupiry', price: 6.50 },
        { name: 'Bacon-Mussarela-Milho-Cheddar', price: 6.50 },
        { name: 'Palmito-Mussarela-Milho-Catupiry', price: 6.50 },
        { name: 'Palmito-Mussarela-Milho-Cheddar', price: 6.50 },
        { name: 'Tomate-Mussarela-Milho-Catupiry', price: 6.50 },
        { name: 'Tomate-Milho-Cheddar', price: 6.50 }
    ];

    console.log('\n--- Esfihas Abertas ---');
    for (const esf of esfihasAbertas) {
        const result = await api(token, 'POST', '/api/products', {
            name: esf.name,
            description: 'Esfiha aberta',
            price: esf.price,
            categoryId: catEsfihaId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${esf.name} - R$ ${esf.price}`);
    }

    // ========================================
    // ESFIHAS DE CHOCOLATE (R$ 5,50)
    // ========================================

    const catChocoId = catIds['Esfihas de Chocolate'] || catTradId;
    const esfihasChocolate = [
        { name: 'Chocolate Preto', price: 5.50 },
        { name: 'Chocolate Branco', price: 5.50 },
        { name: 'Chocolate Preto-Banana', price: 5.50 },
        { name: 'Banana-Canela', price: 5.50 },
        { name: 'Chocolate Preto-Coco', price: 5.50 },
        { name: 'Chocolate Preto-Granulado', price: 5.50 },
        { name: 'Chocolate Preto-Confete', price: 5.50 },
        { name: 'Chocolate Preto-Amendoim', price: 5.50 },
        { name: 'Chocolate Preto e Branco', price: 5.50 },
        { name: 'Chocolate com Granulado', price: 5.50 },
        { name: 'Chocolate com Amendoim', price: 5.50 },
        { name: 'Chocolate com Coco', price: 5.50 },
        { name: 'Banana com Canela', price: 5.50 },
        { name: 'Banana com Chocolate', price: 5.50 },
        // R$ 6,00 (com morango)
        { name: 'Chocolate Preto-Morango', price: 6.00 },
        { name: 'Chocolate Branco-Morango', price: 6.00 },
        { name: 'Polpa de Morango', price: 6.00 }
    ];

    console.log('\n--- Esfihas de Chocolate ---');
    for (const esf of esfihasChocolate) {
        const result = await api(token, 'POST', '/api/products', {
            name: esf.name,
            description: 'Esfiha de chocolate',
            price: esf.price,
            categoryId: catChocoId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${esf.name}`);
    }

    // ========================================
    // ESFIRRA DE CARNE
    // ========================================

    const catCarneId = catIds['Esfirra de Carne'] || catTradId;
    const esfirrasCarne = [
        { name: 'Strogonoff de Carne' },
        { name: 'Strogonoff de Frango' },
        { name: 'Frango com Catupiry' },
        { name: 'Frango com Cheddar' },
        { name: 'Bacon com Catupiry' },
        { name: 'Calabresa com Catupiry' },
        { name: 'Calabresa com Cheddar' },
        { name: 'Bacon e Milho' },
        { name: '4 Queijos' },
        { name: 'Mussarela' },
        { name: 'Bacon' },
        { name: 'Palmito' },
        { name: 'Presunto e Queijo' },
        { name: 'Calabresa' },
        { name: 'Milho' },
        { name: 'Frango' },
        { name: 'Tomate' }
    ];

    console.log('\n--- Esfirra de Carne ---');
    for (const esf of esfirrasCarne) {
        const result = await api(token, 'POST', '/api/products', {
            name: `Esfirra ${esf.name}`,
            description: 'Esfirra de carne - Sexta, Sabado e Domingo',
            price: 5.00,
            categoryId: catCarneId,
            isActive: true
        });
        console.log(`  ${result.product ? '[OK]' : '[ERR]'} Esfirra ${esf.name}`);
    }

    console.log('\n=== Cardapio cadastrado com sucesso! ===');
    console.log('Acesse: http://localhost:3000/loja/fiorella');
}

main().catch(console.error);
