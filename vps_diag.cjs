
const { Client } = require('ssh2');
const conn = new Client();

const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
};

const commands = [
    'echo "=== LOCALE ==="',
    'locale',
    'echo "\n=== FILE INFO ==="',
    'file -i /root/killsis/SAAS-WEB/server/whatsapp-service.js',
    'echo "\n=== RECENT LOGS (SAAS-WEB) ==="',
    'pm2 logs saas-web --lines 20 --nostream'
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
