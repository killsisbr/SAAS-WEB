const { Client } = require('ssh2');

const conn = new Client();
const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 10000
};

conn.on('ready', () => {
    console.log('SSH connection established. Running git pull...');
    conn.exec('cd /root/killsis/SAAS-WEB && git checkout main && git reset --hard origin/main && git pull origin main && pm2 restart saas-web', (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        stream.on('close', (code, signal) => {
            console.log('Git pull and PM2 restart complete.');
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
