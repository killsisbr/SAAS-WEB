
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const DB_PATH = path.resolve('server/database/deliveryhub.sqlite');

async function checkOrders() {
    try {
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        const orders = await db.all(`
            SELECT id, order_number, customer_name, customer_phone, total, created_at 
            FROM orders 
            ORDER BY created_at DESC 
            LIMIT 3
        `);

        console.log('--- Últimos 3 Pedidos ---');
        if (orders.length === 0) {
            console.log('Nenhum pedido encontrado.');
        } else {
            orders.forEach(o => {
                console.log(`[${o.created_at}] #${o.order_number} - ${o.customer_name} (${o.customer_phone}) - R$ ${o.total}`);
            });
        }
        await db.close();
    } catch (error) {
        console.error('Erro ao ler banco:', error);
    }
}

checkOrders();
