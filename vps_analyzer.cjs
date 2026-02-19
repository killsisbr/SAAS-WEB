
const { Client } = require('ssh2');
const conn = new Client();

const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
};

const commands = [
    'echo "=== PM2 STATUS ==="',
    'pm2 status',
    'echo "\n=== RECENT LOGS (SAAS-WEB) ==="',
    'pm2 logs saas-web --lines 50 --nostream',
    'echo "\n=== RECENT LOGS (DELIVERYHUB) ==="',
    'pm2 logs deliveryhub --lines 50 --nostream',
    'echo "\n=== ACTIVE TENANTS (DB) ==="',
    'sqlite3 /root/killsis/SAAS-WEB/server/database/deliveryhub.sqlite "SELECT id, name, status FROM tenants WHERE status = \'ACTIVE\';"',
    'echo "\n=== ALL TENANTS (DB) ==="',
    'sqlite3 /root/killsis/SAAS-WEB/server/database/deliveryhub.sqlite "SELECT id, name, status FROM tenants;"'
];

conn.on('ready', () => {
    console.log('SSH connection established.');
    const fullCommand = commands.join(' && ');

    conn.exec(fullCommand, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        stream.on('close', (code, signal) => {
            conn.end();
            console.log('\nAnalysis complete.');
        }).on('data', (d) => {
            process.stdout.write(d);
        }).stderr.on('data', (d) => {
            process.stderr.write(d);
        });
    });
}).connect(config);
