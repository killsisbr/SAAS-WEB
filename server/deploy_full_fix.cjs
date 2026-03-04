const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 10000
};

const serverFiles = [
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/direct-order/config.js', remote: '/root/killsis/SAAS-WEB/server/direct-order/config.js' },
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/direct-order/core/state-machine.js', remote: '/root/killsis/SAAS-WEB/server/direct-order/core/state-machine.js' },
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/direct-order/core/word-analyzer.js', remote: '/root/killsis/SAAS-WEB/server/direct-order/core/word-analyzer.js' }
];

const publicFiles = [
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/public/store/index.html', remote: '/root/killsis/SAAS-WEB/public/store/index.html' }
];

conn.on('ready', () => {
    console.log('SSH connection established for Full Deployment.');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const files = [...serverFiles, ...publicFiles];
        let uploaded = 0;

        const uploadNext = () => {
            if (uploaded >= files.length) {
                console.log('All files uploaded. Restarting saas-web...');
                conn.exec('pm2 restart saas-web', (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code) => {
                        console.log(`PM2 restart complete with code ${code}.`);
                        conn.end();
                    }).on('data', (data) => {
                        process.stdout.write(data);
                    });
                });
                return;
            }

            const { local, remote } = files[uploaded];
            console.log(`Uploading ${local} -> ${remote}...`);
            sftp.fastPut(local, remote, (err) => {
                if (err) {
                    console.error(`Upload error for ${local}:`, err);
                    conn.end();
                    return;
                }
                uploaded++;
                uploadNext();
            });
        };

        uploadNext();
    });
}).connect(config);
