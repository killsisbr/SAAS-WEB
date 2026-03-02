import { Client } from 'ssh2';

const conn = new Client();
const config = {
  host: '82.29.58.126',
  port: 22,
  username: 'root',
  password: 'Killsis19980910#'
};

console.log(`[DEPLOY] Conectando à VPS ${config.host}...`);

conn.on('ready', () => {
    console.log('[DEPLOY] Autenticação bem-sucedida!');
    
    const remotePath = '/root/killsis/SAAS-WEB';
    const commands = [
        `cd ${remotePath} && git checkout main && git reset --hard origin/main && git pull origin main`,
        'pm2 restart saas-web'
    ];

    let current = 0;
    const executeNext = () => {
        if (current >= commands.length) {
            console.log('\n[DEPLOY] SUCESSO! deploy finalizado.');
            conn.end();
            return;
        }

        const cmd = commands[current];
        console.log(`\n[PASSO ${current + 1}/${commands.length}] Executando: ${cmd}`);
        
        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.error(`[ERRO] ${err.message}`);
                conn.end();
                return;
            }

            stream.on('close', (code) => {
                if (code !== 0) {
                    console.error('[ERRO] Comando falhou.');
                    conn.end();
                } else {
                    current++;
                    executeNext();
                }
            }).on('data', (data) => {
                process.stdout.write(data.toString());
            }).stderr.on('data', (data) => {
                process.stderr.write(data.toString());
            });
        });
    };

    executeNext();
}).on('error', (err) => {
    console.error(`[FALHA] ${err.message}`);
}).connect(config);
