
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const remoteRoot = '/root/killsis/SAAS-WEB';

const filesToUpload = [
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/routes/orders.js', remote: `${remoteRoot}/server/routes/orders.js` },
    { local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/public/store/index.html', remote: `${remoteRoot}/public/store/index.html` }
];

conn.on('ready', () => {
    console.log('Client :: ready');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        let completed = 0;
        filesToUpload.forEach(file => {
            console.log(`Uploading ${file.local} to ${file.remote}...`);
            sftp.fastPut(file.local, file.remote, (err) => {
                if (err) {
                    console.error(`Error uploading ${file.local}:`, err);
                } else {
                    console.log(`Successfully uploaded ${file.local}`);
                }
                completed++;
                if (completed === filesToUpload.length) {
                    console.log('All files uploaded. Restarting PM2...');
                    // Use common names from logs: saas-web
                    conn.exec('pm2 restart saas-web || pm2 restart all', (err, stream) => {
                        if (err) throw err;
                        stream.on('close', () => {
                            console.log('PM2 restart command completed.');
                            conn.end();
                        }).on('data', (d) => {
                            process.stdout.write(d);
                        });
                    });
                }
            });
        });
    });
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
});
