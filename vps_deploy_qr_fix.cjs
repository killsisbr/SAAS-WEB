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
    { local: './server/whatsapp-service.js', remote: '/root/killsis/SAAS-WEB/server/whatsapp-service.js' },
    { local: './server/routes/whatsapp.js', remote: '/root/killsis/SAAS-WEB/server/routes/whatsapp.js' },
    { local: './public/admin/whatsapp.html', remote: '/root/killsis/SAAS-WEB/public/admin/whatsapp.html' }
];

const repairCommands = [
    'echo "[1/3] Parando saas-web..."',
    'pm2 stop saas-web',
    'sleep 2',
    'echo "[2/3] Limpando porta 5000..."',
    'fuser -k 5000/tcp 2>/dev/null || true',
    'sleep 1',
    'pm2 flush saas-web 2>/dev/null || true',
    'echo "[3/3] Reiniciando saas-web..."',
    'pm2 start saas-web',
    'sleep 8',
    'echo ""',
    'echo "========== STATUS =========="',
    'pm2 status saas-web',
    'echo ""',
    'echo "========== LOGS (30 linhas) =========="',
    'pm2 logs saas-web --lines 30 --nostream 2>&1',
    'echo ""',
    'echo "DEPLOY CONCLUIDO."'
].join(' && ');

function runExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('close', () => resolve(out));
            stream.on('data', (d) => { out += d.toString(); process.stdout.write(d); });
            stream.stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d); });
        });
    });
}

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

conn.on('ready', async () => {
    console.log('SSH Connected.\n');
    try {
        console.log('=== UPLOAD ===');
        const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));
        for (const f of filesToUpload) {
            const localPath = path.resolve(__dirname, f.local);
            console.log(`  ${f.local} -> ${f.remote}`);
            await uploadFile(sftp, localPath, f.remote);
        }
        console.log('');
        console.log('=== RESTART ===');
        await runExec(conn, repairCommands);
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('SSH Error:', err.message);
}).connect(config);
