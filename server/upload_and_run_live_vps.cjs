const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established for Live Analysis.');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut('d:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/vps_live_analysis.js', '/root/killsis/SAAS-WEB/server/vps_live_analysis.js', (err) => {
            if (err) throw err;
            console.log('Live analysis script uploaded. Running...');
            conn.exec('cd /root/killsis/SAAS-WEB/server && node vps_live_analysis.js', (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log(`Command exited with code ${code}`);
                    conn.end();
                }).on('data', (data) => {
                    process.stdout.write(data);
                }).stderr.on('data', (data) => {
                    process.stderr.write(data);
                });
            });
        });
    });
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
});
