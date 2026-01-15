// Script para mapear produtos com imagens corretas baseado no sabor
const BASE_URL = 'http://localhost:3000';

// Mapeamento EXATO de nomes para imagens
const IMAGE_MAP = {
    // Exatos
    'atum': '/images/pizzas/atum.png',
    'calabresa': '/images/pizzas/calabresa.png',
    'quatro queijo': '/images/pizzas/4queijos.png',
    '4 queijos': '/images/pizzas/4queijos.png',
    'frango': '/images/pizzas/frango-catupiry.png',
    'catupiry': '/images/pizzas/frango-catupiry.png',
    'milho': '/images/pizzas/milho-com-bacon.png',
    'bacon': '/images/pizzas/milho-com-bacon.png',
    'moda': '/images/pizzas/moda-da-casa.png',
    'mussarela': '/images/pizzas/muçarela.png',
    'muçarela': '/images/pizzas/muçarela.png',
    'napolitana': '/images/pizzas/napolitana.png',
    'pepperoni': '/images/pizzas/pepperoni.png',
    'portuguesa': '/images/pizzas/portuguesa.png',
    'brócolis': '/images/pizzas/brocolis-com-catupiry.png',
    'brocolis': '/images/pizzas/brocolis-com-catupiry.png',
    'chocolate': '/images/pizzas/chocolate.png',
    'morango': '/images/pizzas/chocolate-com-morango.png',
    'banana': '/images/pizzas/banan-doce-de-leite.png',
    'camarão': '/images/pizzas/camarao-c-catupiry.png',
    'camarao': '/images/pizzas/camarao-c-catupiry.png',

    // Nomes específicos dos produtos
    'lamontanha': '/images/pizzas/moda-da-casa.png',
    'xizi': '/images/pizzas/4queijos.png',
    'eldorado': '/images/pizzas/calabresa.png',
    'caipira': '/images/pizzas/milho-com-bacon.png',
    'pizzaiolo': '/images/pizzas/pepperoni.png',
    'preferida': '/images/pizzas/portuguesa.png',
    'estrogonofe': '/images/pizzas/frango-catupiry.png',
    'peruana': '/images/pizzas/camarao-c-catupiry.png',
    'estilo': '/images/pizzas/moda-da-casa.png',
    'chefe': '/images/pizzas/moda-da-casa.png',
    'siciliana': '/images/pizzas/napolitana.png',
    'alho': '/images/pizzas/muçarela.png',
    'lombo': '/images/pizzas/calabresa.png',
    'cheddar': '/images/pizzas/4queijos.png',
    'inglesa': '/images/pizzas/portuguesa.png',
    'paulista': '/images/pizzas/4queijos.png',
};

async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fiorella@gmail.com', password: 'fiorella123' })
    });
    return (await res.json()).token;
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data)
    });
    return res.ok;
}

function findImageForProduct(productName) {
    const name = productName.toLowerCase();

    // Buscar correspondência exata primeiro
    for (const [keyword, imagePath] of Object.entries(IMAGE_MAP)) {
        if (name.includes(keyword)) {
            return imagePath;
        }
    }
    return '/images/pizzas/moda-da-casa.png'; // Default
}

async function main() {
    console.log('=== Mapeando Imagens por Sabor ===\n');

    const token = await login();
    console.log('Login OK\n');

    const products = await getProducts(token);

    for (const product of products) {
        const imageUrl = findImageForProduct(product.name);
        const imageName = imageUrl.split('/').pop();

        const success = await updateProduct(token, product.id, { images: [imageUrl] });
        console.log(`${success ? '[OK]' : '[ERRO]'} ${product.name} -> ${imageName}`);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n=== Finalizado! ===');
}

main().catch(console.error);
