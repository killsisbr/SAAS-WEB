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

// Arquivos para upload
const filesToUpload = [
    { local: './server/whatsapp-service.js', remote: '/root/killsis/SAAS-WEB/server/whatsapp-service.js' },
    { local: './server/server.js', remote: '/root/killsis/SAAS-WEB/server/server.js' },
    { local: './server/services/follow-up.js', remote: '/root/killsis/SAAS-WEB/server/services/follow-up.js' }
];

// Sequencia de comandos para limpar e reiniciar
const repairCommands = [
    // 1. Parar o servico
    'echo "[1/5] Parando saas-web..."',
    'pm2 stop saas-web',
    'sleep 2',

    // 2. Limpar sessoes corrompidas dos tenants problemáticos
    'echo "[2/5] Limpando sessoes corrompidas..."',
    'rm -rf /root/killsis/SAAS-WEB/server/sessions/session-demo_tenant_001',
    'rm -rf /root/killsis/SAAS-WEB/server/sessions/session-4b095f71-0d97-4e48-80aa-1e20fee1b457',
    'rm -rf /root/killsis/SAAS-WEB/server/sessions/session-981f332f-fc3e-414d-a69a-04b02267118c',
    'echo "Sessoes removidas."',

    // 3. Limpar porta se ainda estiver em uso
    'echo "[3/5] Limpando porta 5000..."',
    'fuser -k 5000/tcp 2>/dev/null || true',
    'sleep 1',

    // 4. Limpar logs antigos para facilitar leitura
    'echo "[4/5] Truncando logs antigos..."',
    'pm2 flush saas-web 2>/dev/null || true',

    // 5. Reiniciar e verificar
    'echo "[5/5] Reiniciando saas-web..."',
    'pm2 start saas-web',
    'sleep 8',
    'echo ""',
    'echo "========== STATUS =========="',
    'pm2 status saas-web',
    'echo ""',
    'echo "========== LOGS (20 linhas) =========="',
    'pm2 logs saas-web --lines 20 --nostream 2>&1',
    'echo ""',
    'echo "DEPLOY CONCLUIDO."'
].join(' && ');

function runExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('close', () => resolve(out));
            stream.on('data', (d) => {
                const s = d.toString();
                out += s;
                process.stdout.write(d);
            });
            stream.stderr.on('data', (d) => {
                const s = d.toString();
                out += s;
                process.stderr.write(d);
            });
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
        // Upload dos arquivos corrigidos
        console.log('=== UPLOAD DE ARQUIVOS ===');
        const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));

        for (const f of filesToUpload) {
            const localPath = path.resolve(__dirname, f.local);
            console.log(`  Uploading ${f.local}...`);
            await uploadFile(sftp, localPath, f.remote);
            console.log(`  OK: ${f.remote}`);
        }
        console.log('');

        // Executar sequencia de reparo
        console.log('=== REPARO E RESTART ===');
        await runExec(conn, repairCommands);

    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('SSH Error:', err.message);
}).connect(config);
