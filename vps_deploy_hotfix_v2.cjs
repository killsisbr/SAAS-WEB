
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

const localFilePath = path.join(__dirname, 'server', 'whatsapp-service.js');
const remoteFilePath = '/root/killsis/SAAS-WEB/server/whatsapp-service.js';

conn.on('ready', () => {
    console.log('SSH connection established.');
    conn.sftp((err, sftp) => {
        if (err) {
            console.error('SFTP error:', err);
            conn.end();
            return;
        }

        console.log(`Uploading ${localFilePath} to ${remoteFilePath}...`);
        sftp.fastPut(localFilePath, remoteFilePath, (err) => {
            if (err) {
                console.error('Upload error:', err);
                conn.end();
                return;
            }

            console.log('Upload successful! Restarting saas-web...');
            conn.exec('pm2 restart saas-web', (err, stream) => {
                if (err) {
                    console.error('Exec error:', err);
                    conn.end();
                    return;
                }
                stream.on('close', (code, signal) => {
                    console.log('PM2 restart complete.');
                    conn.end();
                }).on('data', (data) => {
                    process.stdout.write(data);
                }).stderr.on('data', (data) => {
                    process.stderr.write(data);
                });
            });
        });
    });
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
