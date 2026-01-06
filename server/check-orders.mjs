import Database from 'better-sqlite3';
const db = new Database('./database/deliveryhub.sqlite');

console.log('\n=== ORDERS ===');
const orders = db.prepare('SELECT id, tenant_id, customer_name, status, DATE(created_at) as date FROM orders ORDER BY created_at DESC LIMIT 10').all();
console.log(JSON.stringify(orders, null, 2));

console.log('\n=== TODAY FILTER TEST ===');
const today = new Date().toISOString().split('T')[0];
console.log('Today is:', today);
const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?").get(today);
console.log('Orders today:', todayOrders.count);

const allOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get();
console.log('Total orders:', allOrders.count);

db.close();
