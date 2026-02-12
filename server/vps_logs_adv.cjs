
const { Client } = require('ssh2');
const conn = new Client();
const pattern = process.argv[2] || 'Orders';

conn.on('ready', () => {
    // Grep logs with pattern
    const command = `grep "${pattern}" ~/.pm2/logs/saas-web-out.log | tail -n 100`;

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
