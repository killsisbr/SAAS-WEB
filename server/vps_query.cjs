
const { Client } = require('ssh2');
const conn = new Client();
const query = process.argv[2] || 'SELECT id, name FROM tenants WHERE name LIKE "%Brutus%";';

conn.on('ready', () => {
    const command = `sqlite3 /root/killsis/SAAS-WEB/server/database/deliveryhub.sqlite "${query}"`;

    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (d) => {
            process.stdout.write(d);
        }).stderr.on('data', (d) => {
            process.stderr.write(d);
        });
    });
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
});
