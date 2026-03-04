
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
    { local: './server/services/follow-up.js', remote: '/root/killsis/SAAS-WEB/server/services/follow-up.js' },
    { local: './server/routes/category-addons.js', remote: '/root/killsis/SAAS-WEB/server/routes/category-addons.js' },
    { local: './public/admin/categorias.html', remote: '/root/killsis/SAAS-WEB/public/admin/categorias.html' },
    { local: './public/admin/adicionais.html', remote: '/root/killsis/SAAS-WEB/public/admin/adicionais.html' },
    { local: './public/admin/index.html', remote: '/root/killsis/SAAS-WEB/public/admin/index.html' },
    { local: './public/admin/js/shared.js', remote: '/root/killsis/SAAS-WEB/public/admin/js/shared.js' },
    { local: './public/store/index.html', remote: '/root/killsis/SAAS-WEB/public/store/index.html' }
];

conn.on('ready', () => {
    console.log('SSH connection established.');

    // 1. Skip cleanup for now to avoid hangs
    console.log('Step 1: Skipping port cleanup...');

    // 2. Upload de arquivos
    conn.sftp((err, sftp) => {
        if (err) { console.error('SFTP error:', err); conn.end(); return; }

        let uploadedCount = 0;
        filesToUpload.forEach(f => {
            const localPath = path.resolve(__dirname, f.local);
            console.log(`Step 2: Uploading ${f.local}...`);

            const readStream = fs.createReadStream(localPath);
            const writeStream = sftp.createWriteStream(f.remote);

            writeStream.on('close', () => {
                console.log(`Uploaded: ${f.local}`);
                uploadedCount++;
                if (uploadedCount === filesToUpload.length) {
                    console.log('All files uploaded.');
                    console.log('Step 3: Restarting saas-web...');
                    conn.exec('pm2 restart saas-web && sleep 2 && pm2 logs saas-web --lines 5 --nostream', (err, stream) => {
                        stream.on('close', () => {
                            console.log('\nDeploy complete.');
                            conn.end();
                        }).on('data', (data) => {
                            process.stdout.write(data);
                        });
                    });
                }
            });

            writeStream.on('error', (err) => {
                console.error(`Upload error (${f.local}):`, err);
            });

            readStream.pipe(writeStream);
        });
    });
}).on('error', (err) => {
    console.error('SSH Client Error:', err);
}).connect(config);
