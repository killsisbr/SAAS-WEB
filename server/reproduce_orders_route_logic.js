
const items = [
    {
        productId: 1,
        quantity: 1,
        addons: [
            { name: 'Bacon', price: '5.00' }, // String price!
            { name: 'Queijo', price: 5.00 }   // Number price
        ]
    }
];

const products = {
    1: { id: 1, name: 'Brutus Burger', price: 28.00 }
};

async function calculate() {
    let subtotal = 0;

    for (const item of items) {
        const product = products[item.productId];
        if (product) {
            // FIXED LOGIC
            const itemTotal = Number(product.price) * Number(item.quantity);
            subtotal += itemTotal;

            let addonsTotal = 0;
            if (item.addons && Array.isArray(item.addons)) {
                for (const addon of item.addons) {
                    addonsTotal += Number(addon.price) || 0;
                }
            }
            subtotal += addonsTotal * Number(item.quantity);
        }
    }

    console.log('Final Subtotal:', subtotal);
    console.log('Type:', typeof subtotal);
}

calculate();
