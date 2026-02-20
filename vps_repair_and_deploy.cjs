
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 20000
};

const filesToUpload = [
    { local: './server/server.js', remote: '/root/killsis/SAAS-WEB/server/server.js' },
    { local: './server/whatsapp-service.js', remote: '/root/killsis/SAAS-WEB/server/whatsapp-service.js' },
    { local: './server/services/follow-up.js', remote: '/root/killsis/SAAS-WEB/server/services/follow-up.js' }
];

conn.on('ready', () => {
    console.log('SSH connection established.');

    // 1. Limpar processos fantasmas na porta 5000
    console.log('Step 1: Cleaning up port 5000...');
    conn.exec('fuser -k 5000/tcp || true', (err, stream) => {
        stream.on('close', () => {
            console.log('Port 5000 cleaned.');

            // 2. Upload de arquivos
            conn.sftp((err, sftp) => {
                if (err) { console.error('SFTP error:', err); conn.end(); return; }

                let uploadedCount = 0;
                filesToUpload.forEach(f => {
                    const localPath = path.resolve(__dirname, f.local);
                    console.log(`Step 2: Uploading ${f.local}...`);

                    sftp.fastPut(localPath, f.remote, (err) => {
                        if (err) { console.error(`Upload error (${f.local}):`, err); }
                        uploadedCount++;

                        if (uploadedCount === filesToUpload.length) {
                            console.log('All files uploaded.');

                            // 3. Reiniciar PM2 e verificar logs
                            console.log('Step 3: Restarting saas-web and checking logs...');
                            conn.exec('pm2 restart saas-web && sleep 5 && pm2 logs saas-web --lines 20 --nostream', (err, stream) => {
                                stream.on('close', () => {
                                    console.log('\nRepair and Deploy complete.');
                                    conn.end();
                                }).on('data', (data) => {
                                    process.stdout.write(data);
                                }).stderr.on('data', (data) => {
                                    process.stderr.write(data);
                                });
                            });
                        }
                    });
                });
            });
        });
    });
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
