
const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    // Grep logs for tenant ID
    const command = 'grep "demo_tenant_001" ~/.pm2/logs/saas-web-out.log | tail -n 500';

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
