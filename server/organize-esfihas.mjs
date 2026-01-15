// Script para organizar esfihas - produtos de R$ 7,00
// Cria categoria Esfihas e move os produtos

const BASE_URL = 'http://localhost:3000';

// Imagens de esfiha
const ESFIHA_IMAGES = [
    'https://images.unsplash.com/photo-1603532648955-039310d9ed75?w=400&h=400&fit=crop', // Lebanese food
    'https://images.unsplash.com/photo-1607301405752-4e6d6178dd8f?w=400&h=400&fit=crop', // Middle eastern
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop', // Backup pizza style
];

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

async function getCategories(token) {
    const res = await fetch(`${BASE_URL}/api/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return await res.json();
}

async function createCategory(token, name) {
    const res = await fetch(`${BASE_URL}/api/categories`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name })
    });
    return await res.json();
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
    console.log('=== Organizando Esfihas ===\n');

    const token = await login();
    console.log('Login OK\n');

    // Verificar se categoria Esfihas já existe
    let categories = await getCategories(token);
    let esfihaCat = categories.find(c => c.name.toLowerCase().includes('esfiha'));

    if (!esfihaCat) {
        console.log('Criando categoria Esfihas...');
        esfihaCat = await createCategory(token, 'Esfihas');
        console.log('Categoria criada:', esfihaCat.id);
    } else {
        console.log('Categoria Esfihas já existe:', esfihaCat.id);
    }

    // Buscar produtos
    const products = await getProducts(token);
    console.log(`\nTotal de produtos: ${products.length}\n`);

    // Filtrar produtos de R$ 7 (provavelmente esfihas)
    const esfihas = products.filter(p => p.price === 7 || p.price === 7.00);
    console.log(`Esfihas encontradas (preco R$ 7): ${esfihas.length}\n`);

    // Mover para categoria de esfihas
    let imageIndex = 0;
    for (const esfiha of esfihas) {
        const imageUrl = ESFIHA_IMAGES[imageIndex % ESFIHA_IMAGES.length];

        const success = await updateProduct(token, esfiha.id, {
            categoryId: esfihaCat.id,
            images: [imageUrl]
        });

        if (success) {
            console.log(`[OK] ${esfiha.name} -> Esfihas`);
        } else {
            console.log(`[ERRO] ${esfiha.name}`);
        }

        imageIndex++;
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n=== Finalizado! ===');
    console.log(`${esfihas.length} produtos movidos para Esfihas`);
}

main().catch(console.error);
