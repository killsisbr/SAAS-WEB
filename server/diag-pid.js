import sqlite3Pkg from 'sqlite3';
const sqlite3 = sqlite3Pkg.verbose();
const db = new sqlite3.Database('database/deliveryhub.sqlite');

console.log('--- DIAGNOSTIC: PID/JID MAPPINGS ---');
db.all('SELECT * FROM pid_jid_mappings ORDER BY created_at DESC LIMIT 5', (err, rows) => {
    if (err) console.error('PID/JID Error:', err);
    else {
        console.log('Recent PID/JID Mappings:');
        rows.forEach(r => console.log(`  ${r.pid} -> ${r.jid} (Tenant: ${r.tenant_id})`));
    }
});

console.log('\n--- DIAGNOSTIC: LID/PHONE MAPPINGS ---');
db.all('SELECT * FROM lid_phone_mappings ORDER BY created_at DESC LIMIT 5', (err, rows) => {
    if (err) console.error('LID Error:', err);
    else {
        console.log('Recent LID Mappings:');
        rows.forEach(r => console.log(`  ${r.lid} -> ${r.phone} (Tenant: ${r.tenant_id})`));
    }
});

console.log('\n--- DIAGNOSTIC: RECENT ORDERS WITH POSSIBLE PIDs ---');
db.all('SELECT order_number, customer_name, customer_phone FROM orders ORDER BY created_at DESC LIMIT 5', (err, rows) => {
    if (err) console.error('Orders Error:', err);
    else {
        console.log('Recent Orders:');
        rows.forEach(r => {
            const isPid = String(r.customer_phone).length >= 15;
            console.log(`  #${r.order_number} - ${r.customer_name}: ${r.customer_phone} ${isPid ? '[PID detected]' : ''}`);
        });
    }
    db.close();
});
