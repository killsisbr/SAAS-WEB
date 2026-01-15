// Script para adicionar produtos restantes da Fiorella com pausas
// Execute: node add-fiorella-menu-v2.mjs (da pasta server)

const BASE_URL = 'http://localhost:3000';

// Delay entre requests
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function getCategoryId(token, categoryName) {
    const cats = await api(token, 'GET', '/api/categories');
    const cat = cats.find(c => c.name === categoryName);
    return cat ? cat.id : null;
}

async function addProduct(token, product, catId) {
    const result = await api(token, 'POST', '/api/products', {
        ...product,
        categoryId: catId,
        isActive: true
    });
    return result;
}

async function main() {
    console.log('=== Cadastrando Produtos Fiorella (v2) ===\n');

    const token = await login();
    console.log('[OK] Login realizado\n');

    // Buscar IDs das categorias
    const catPizzasEspec = await getCategoryId(token, 'Pizzas Especiais');
    const catPizzasDoces = await getCategoryId(token, 'Pizzas Doces');
    const catEsfihasAbertas = await getCategoryId(token, 'Esfihas Abertas');
    const catEsfihasChoco = await getCategoryId(token, 'Esfihas de Chocolate');
    const catEsfirraCarne = await getCategoryId(token, 'Esfirra de Carne');
    const catPizzasTrad = await getCategoryId(token, 'Pizzas Tradicionais');

    console.log('Categorias:', { catPizzasEspec, catPizzasDoces, catEsfihasAbertas, catEsfihasChoco, catEsfirraCarne, catPizzasTrad });

    // ========================================
    // PIZZAS ESPECIAIS (com tamanhos M/G)
    // ========================================

    if (catPizzasEspec) {
        const pizzasEspeciais = [
            { name: 'Francesa', description: 'Mussarela, palmito, ervilha, ovos, cebola e oregano', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 35, 'G': 45 }) },
            { name: 'Cracovia', description: 'Mussarela, cracovia, ovos, bacon, palmito e cheddar', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 38, 'G': 48 }) },
            { name: 'Strogonoff de Carne Especial', description: 'Mussarela, strogonoff de carne e batata palha', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 38, 'G': 48 }) },
            { name: 'Strogonoff de Frango Especial', description: 'Mussarela, strogonoff de frango e oregano', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 38, 'G': 48 }) },
            { name: 'Fratelo (Da Casa)', description: 'Mussarela, mignon em cubos, cheddar e molho de barbecue', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 42, 'G': 52 }) },
            { name: 'Pizza Fiorella', description: 'Mussarela, frango, bacon, catupiry e batata palha', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 40, 'G': 50 }) },
            { name: 'Nova Lamontanha', description: 'Mussarela, presunto, milho, ervilha, tomate, frango, calabresa, bacon e cheddar', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 42, 'G': 52 }) },
            { name: 'Pizzaiolo', description: 'Mussarela, bacon, calabresa e catupiry', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 35, 'G': 45 }) },
        ];

        console.log('\n--- Pizzas Especiais ---');
        for (const pizza of pizzasEspeciais) {
            const result = await addProduct(token, pizza, catPizzasEspec);
            console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
            await delay(200);
        }
    }

    // ========================================
    // PIZZAS DOCES
    // ========================================

    if (catPizzasDoces) {
        const pizzasDoces = [
            { name: 'Brigadeiro', description: 'Mussarela, chocolate, granulado e leite condensado', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 32, 'G': 42 }) },
            { name: 'Prestigio', description: 'Mussarela, chocolate, coco e leite condensado', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 32, 'G': 42 }) },
            { name: 'Banana', description: 'Mussarela, banana, canela e leite condensado', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 32, 'G': 42 }) },
            { name: 'Crocante', description: 'Mussarela, amendoim, chocolate e leite condensado', price: 0, has_sizes: 1, sizes: JSON.stringify(['M', 'G']), size_prices: JSON.stringify({ 'M': 32, 'G': 42 }) },
        ];

        console.log('\n--- Pizzas Doces ---');
        for (const pizza of pizzasDoces) {
            const result = await addProduct(token, pizza, catPizzasDoces);
            console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${pizza.name}`);
            await delay(200);
        }
    }

    // ========================================
    // ESFIHAS ABERTAS (R$ 5,50 a R$ 6,50)
    // ========================================

    if (catEsfihasAbertas) {
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
            // R$ 6,50 - 4 ingredientes
            { name: 'Frango-Mussarela-Milho-Catupiry', price: 6.50 },
            { name: 'Frango-Mussarela-Bacon-Catupiry', price: 6.50 },
            { name: 'Calabresa-Mussarela-Milho-Catupiry', price: 6.50 },
        ];

        console.log('\n--- Esfihas Abertas ---');
        for (const esf of esfihasAbertas) {
            const result = await addProduct(token, { name: esf.name, description: 'Esfiha aberta', price: esf.price }, catEsfihasAbertas);
            console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${esf.name} - R$ ${esf.price}`);
            await delay(200);
        }
    }

    // ========================================
    // ESFIHAS DE CHOCOLATE (R$ 5,50 - R$ 6,00)
    // ========================================

    if (catEsfihasChoco) {
        const esfihasChocolate = [
            { name: 'Chocolate Preto', price: 5.50 },
            { name: 'Chocolate Branco', price: 5.50 },
            { name: 'Chocolate Preto-Banana', price: 5.50 },
            { name: 'Banana-Canela', price: 5.50 },
            { name: 'Chocolate Preto-Coco', price: 5.50 },
            { name: 'Chocolate Preto-Granulado', price: 5.50 },
            { name: 'Chocolate Preto e Branco', price: 5.50 },
            { name: 'Chocolate com Amendoim', price: 5.50 },
            { name: 'Banana com Chocolate', price: 5.50 },
            { name: 'Chocolate Preto-Morango', price: 6.00 },
            { name: 'Chocolate Branco-Morango', price: 6.00 },
        ];

        console.log('\n--- Esfihas de Chocolate ---');
        for (const esf of esfihasChocolate) {
            const result = await addProduct(token, { name: esf.name, description: 'Esfiha de chocolate', price: esf.price }, catEsfihasChoco);
            console.log(`  ${result.product ? '[OK]' : '[ERR]'} ${esf.name}`);
            await delay(200);
        }
    }

    // ========================================
    // ESFIRRA DE CARNE (Sexta, Sabado, Domingo)
    // ========================================

    if (catEsfirraCarne) {
        const esfirrasCarne = [
            'Strogonoff de Carne', 'Strogonoff de Frango', 'Frango com Catupiry', 'Frango com Cheddar',
            'Bacon com Catupiry', 'Calabresa com Catupiry', 'Calabresa com Cheddar', 'Bacon e Milho',
            '4 Queijos', 'Mussarela', 'Bacon', 'Palmito', 'Presunto e Queijo', 'Calabresa', 'Milho', 'Frango', 'Tomate'
        ];

        console.log('\n--- Esfirra de Carne ---');
        for (const esf of esfirrasCarne) {
            const result = await addProduct(token, { name: `Esfirra ${esf}`, description: 'Esfirra de carne - Sexta, Sabado e Domingo', price: 5.00 }, catEsfirraCarne);
            console.log(`  ${result.product ? '[OK]' : '[ERR]'} Esfirra ${esf}`);
            await delay(200);
        }
    }

    console.log('\n=== Produtos cadastrados! ===');
    console.log('Acesse: http://localhost:3000/loja/fiorella');
}

main().catch(console.error);
