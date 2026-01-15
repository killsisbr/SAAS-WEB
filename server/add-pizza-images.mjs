// Script para adicionar imagens de pizza aos produtos da Fiorella
// Usa URLs do Unsplash (gratuitas e de alta qualidade)

const BASE_URL = 'http://localhost:3000';

// Imagens de pizza do Unsplash (redimensionadas para 400x400)
const PIZZA_IMAGES = [
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop', // Pizza margherita
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=400&fit=crop', // Pizza pepperoni
    'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=400&h=400&fit=crop', // Pizza fatia
    'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=400&h=400&fit=crop', // Pizza queijo
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop', // Pizza classica
    'https://images.unsplash.com/photo-1571066811602-716837d681de?w=400&h=400&fit=crop', // Pizza italiana
    'https://images.unsplash.com/photo-1574126154517-d1e0d89ef734?w=400&h=400&fit=crop', // Pizza forno
    'https://images.unsplash.com/photo-1595708684082-a173bb3a06c5?w=400&h=400&fit=crop', // Pizza veggies
    'https://images.unsplash.com/photo-1570992917841-428eee9be6b8?w=400&h=400&fit=crop', // Pizza caseira
    'https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?w=400&h=400&fit=crop', // Pizza gourmet
    'https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=400&h=400&fit=crop', // Pizza pepperoni 2
    'https://images.unsplash.com/photo-1564128442383-9201fcc740eb?w=400&h=400&fit=crop', // Pizza artesanal
    'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=400&h=400&fit=crop', // Pizza bacon
    'https://images.unsplash.com/photo-1552539618-7eec9b4d1796?w=400&h=400&fit=crop', // Pizza mozza
    'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=400&h=400&fit=crop', // Pizza napolitana
    'https://images.unsplash.com/photo-1600028068383-ea11a7a101f3?w=400&h=400&fit=crop', // Pizza havaiana
    'https://images.unsplash.com/photo-1593246049226-ded77bf90326?w=400&h=400&fit=crop', // Pizza fresca
    'https://images.unsplash.com/photo-1548369937-47519962c11a?w=400&h=400&fit=crop', // Pizza tradicional
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

async function getProducts(token) {
    const res = await fetch(`${BASE_URL}/api/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return await res.json();
}

async function updateProductImage(token, productId, imageUrl) {
    const res = await fetch(`${BASE_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            images: [imageUrl]
        })
    });
    return res.ok;
}

async function main() {
    console.log('=== Adicionando Imagens de Pizza ===\n');

    const token = await login();
    console.log('Login OK\n');

    const products = await getProducts(token);
    console.log(`Total de produtos: ${products.length}\n`);

    // Filtrar apenas pizzas (produtos de categorias com 'pizza' no nome)
    // Como não temos info da categoria aqui, vamos atualizar todos

    let imageIndex = 0;
    for (const product of products) {
        const imageUrl = PIZZA_IMAGES[imageIndex % PIZZA_IMAGES.length];
        const success = await updateProductImage(token, product.id, imageUrl);

        if (success) {
            console.log(`[OK] ${product.name} -> Imagem ${imageIndex + 1}`);
        } else {
            console.log(`[ERRO] ${product.name}`);
        }

        imageIndex++;

        // Pequena pausa para evitar rate limit
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n=== Finalizado! ===');
}

main().catch(console.error);
