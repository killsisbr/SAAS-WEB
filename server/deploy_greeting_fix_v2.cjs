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

const baseLocal = 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/agent-employee';
const baseRemote = '/root/killsis/SAAS-WEB/server/agent-employee';

const filesToUpload = [
    { local: 'config.js', remote: 'config.js' },
    { local: 'core/state-machine.js', remote: 'core/state-machine.js' }
];

conn.on('ready', () => {
    console.log('SSH connection established.');
    conn.sftp((err, sftp) => {
        if (err) {
            console.error('SFTP error:', err);
            conn.end();
            return;
        }

        let uploaded = 0;
        const uploadNext = () => {
            if (uploaded >= filesToUpload.length) {
                console.log('All files uploaded. Restarting saas-web...');
                conn.exec('pm2 restart saas-web', (err, stream) => {
                    if (err) {
                        console.error('Exec error:', err);
                        conn.end();
                        return;
                    }
                    stream.on('close', (code) => {
                        console.log(`PM2 restart complete with code ${code}.`);
                        conn.end();
                    }).on('data', (data) => {
                        process.stdout.write(data);
                    });
                });
                return;
            }

            const { local, remote } = filesToUpload[uploaded];
            const fullLocal = path.join(baseLocal, local);
            const fullRemote = path.join(baseRemote, remote).replace(/\\/g, '/');

            console.log(`Uploading ${fullLocal} -> ${fullRemote}...`);
            sftp.fastPut(fullLocal, fullRemote, (err) => {
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
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
