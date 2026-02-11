const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    const cmd = `
    echo "--- CLEANING PRISON18 LOGS ---"
    rm -rf /root/killsis/PRISON18/logs/*
    echo "--- FLUSHING PM2 LOGS ---"
    pm2 flush
    echo "--- DISK SPACE AFTER CLEANUP ---"
    df -h
    echo "--- RESTARTING SAAS-WEB ---"
    pm2 restart deliveryhub || pm2 restart saas-web
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
