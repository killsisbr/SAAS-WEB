const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    const cmd = `
    echo "--- FINAL DISK SPACE ---"
    df -h
    echo "--- PM2 STATUS ---"
    pm2 status
    echo "--- SAAS-WEB LOGS (LATEST) ---"
    pm2 logs deliveryhub --lines 20 --no-daemon || pm2 logs saas-web --lines 20 --no-daemon
  `;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect({
    host: '82.29.58.126',
    port: 22,
    username: 'root',
    password: 'Killsis19980910#'
});
