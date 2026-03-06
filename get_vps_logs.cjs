const { Client } = require('ssh2');
const conn = new Client();
const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 20000
};

conn.on('ready', () => {
    console.log('SSH connection established.');
    conn.exec('pm2 logs saas-web --lines 100 --nostream', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', (data) => {
            output += data;
        }).on('close', () => {
            console.log(output);
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
