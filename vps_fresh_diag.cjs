const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();

const config = {
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 20000
};

const commands = [
    'echo "========== PM2 STATUS =========="',
    'pm2 status',
    'echo ""',
    'echo "========== PM2 LIST (JSON) =========="',
    'pm2 jlist 2>/dev/null | head -c 2000',
    'echo ""',
    'echo "========== LAST 100 LINES ERROR LOG =========="',
    'pm2 logs saas-web --err --lines 100 --nostream 2>&1',
    'echo ""',
    'echo "========== LAST 150 LINES OUT LOG =========="',
    'pm2 logs saas-web --out --lines 150 --nostream 2>&1',
    'echo ""',
    'echo "========== PORT 5000 CHECK =========="',
    'fuser 5000/tcp 2>&1 || echo "Port 5000 is FREE"',
    'echo ""',
    'echo "========== PORT 3000 CHECK =========="',
    'fuser 3000/tcp 2>&1 || echo "Port 3000 is FREE"',
    'echo ""',
    'echo "========== NODE PROCESSES =========="',
    'ps aux | grep node | grep -v grep',
    'echo ""',
    'echo "========== MEMORY USAGE =========="',
    'free -h',
    'echo ""',
    'echo "========== DISK USAGE =========="',
    'df -h /',
    'echo ""',
    'echo "========== SERVER.JS HEAD (first 5 lines of start function) =========="',
    'grep -n "app.listen\\|autoReconnect\\|WHATSAPP_AUTO_CONNECT\\|initWhatsApp" /root/killsis/SAAS-WEB/server/server.js 2>&1',
    'echo ""',
    'echo "========== .ENV FILE =========="',
    'cat /root/killsis/SAAS-WEB/.env 2>&1 || echo "No .env found"',
    'echo ""',
    'echo "========== ECOSYSTEM CONFIG =========="',
    'cat /root/killsis/SAAS-WEB/ecosystem.config.js 2>&1 || echo "No ecosystem.config.js found"',
    'echo ""',
    'echo "========== TENANTS IN DB =========="',
    'sqlite3 /root/killsis/SAAS-WEB/server/database/deliveryhub.sqlite "SELECT id, name, status FROM tenants;" 2>&1',
    'echo "========== DONE =========="'
];

conn.on('ready', () => {
    console.log('SSH Connected. Running diagnostics...\n');
    const fullCommand = commands.join(' && ');

    let output = '';
    conn.exec(fullCommand, (err, stream) => {
        if (err) { console.error('Exec error:', err); conn.end(); return; }
        stream.on('close', () => {
            // Save to file
            fs.writeFileSync('vps_fresh_diag_output.txt', output, 'utf-8');
            console.log('\n\nDiagnostics saved to vps_fresh_diag_output.txt');
            conn.end();
        }).on('data', (d) => {
            const str = d.toString();
            output += str;
            process.stdout.write(d);
        }).stderr.on('data', (d) => {
            const str = d.toString();
            output += str;
            process.stderr.write(d);
        });
    });
}).on('error', (err) => {
    console.error('SSH Error:', err.message);
}).connect(config);
