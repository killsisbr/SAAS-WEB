const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established for Verification.');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const remotePath = '/root/killsis/SAAS-WEB/server/direct-order/core/word-analyzer.js';
        sftp.readFile(remotePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading remote file:', err);
                conn.end();
                return;
            }
            console.log('--- REMOTE WORD ANALYZER CONTENT ---');
            console.log(data);
            conn.end();
        });
    });
}).connect({
    host: '82.29.58.126',
    port: 22,
    username: 'root',
    password: 'Killsis19980910#'
});
