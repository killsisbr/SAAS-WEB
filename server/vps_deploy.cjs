const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const filesToUpload = [
    {
        local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/whatsapp-service.js',
        remote: '/root/killsis/SAAS-WEB/server/whatsapp-service.js'
    },
    {
        local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/services/whatsapp-bot.js',
        remote: '/root/killsis/SAAS-WEB/server/services/whatsapp-bot.js'
    },
    {
        local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/public/store/index.html',
        remote: '/root/killsis/SAAS-WEB/public/store/index.html'
    },
    {
        local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/public/admin/config.html',
        remote: '/root/killsis/SAAS-WEB/public/admin/config.html'
    },
    {
        local: 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/agent-employee/services/product-matcher.js',
        remote: '/root/killsis/SAAS-WEB/server/agent-employee/services/product-matcher.js'
    }
];

conn.on('ready', () => {
    console.log('[VPS] Connected for deployment');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        let completed = 0;
        filesToUpload.forEach(file => {
            console.log(`[VPS] Uploading ${path.basename(file.local)}...`);
            sftp.fastPut(file.local, file.remote, (err) => {
                if (err) {
                    console.error(`[VPS] Error uploading ${file.local}:`, err);
                } else {
                    console.log(`[VPS] Successfully uploaded ${path.basename(file.local)}`);
                }
                completed++;
                if (completed === filesToUpload.length) {
                    console.log('[VPS] All uploads completed. Restarting services...');
                    conn.exec('pm2 restart saas-web && pm2 restart saas-whatsapp', (err, stream) => {
                        if (err) console.error(err);
                        stream.on('close', () => {
                            console.log('[VPS] Services restarted.');
                            conn.end();
                        }).on('data', (data) => {
                            process.stdout.write(data);
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
