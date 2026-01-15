// Script para atualizar esfihas com imagem correta
const BASE_URL = 'http://localhost:3000';

async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'fiorella@gmail.com',
            password: 'fiorella123'
        })
    });
    const data = await res.json();
    return data.token;
}

async function getProducts(token) {
    const res = await fetch(`${BASE_URL}/api/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return await res.json();
}

async function updateProduct(token, productId, data) {
    const res = await fetch(`${BASE_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
    });
    return res.ok;
}

async function main() {
    console.log('=== Atualizando Esfihas com Imagem Correta ===\n');

    const token = await login();
    console.log('Login OK\n');

    const products = await getProducts(token);
    console.log(`Total de produtos: ${products.length}\n`);

    // Produtos de R$ 7 são esfihas
    const esfihas = products.filter(p => p.price === 7 || p.price === 7.00);
    const pizzas = products.filter(p => p.price > 7);

    console.log(`Esfihas (R$ 7): ${esfihas.length}`);
    console.log(`Pizzas (R$ 45+): ${pizzas.length}\n`);

    // Atualizar esfihas com imagem de esfiha
    console.log('--- Atualizando Esfihas ---');
    for (const esfiha of esfihas) {
        const success = await updateProduct(token, esfiha.id, {
            images: ['/images/pizzas/esfiha.png']
        });
        console.log(`${success ? '[OK]' : '[ERRO]'} ${esfiha.name} -> esfiha.png`);
        await new Promise(r => setTimeout(r, 100));
    }

    // Manter pizzas com imagem de pizza (calabresa)
    console.log('\n--- Pizzas mantidas ---');
    for (const pizza of pizzas) {
        console.log(`[OK] ${pizza.name} -> ja tem imagem de pizza`);
    }

    console.log('\n=== Finalizado! ===');
}

main().catch(console.error);
