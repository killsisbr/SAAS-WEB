const { Client } = require('ssh2');
const conn = new Client();
const command = process.argv[2] || 'ls -la';

conn.on('ready', () => {
    console.log(`[VPS] Executing: ${command}`);
    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        stream.on('close', (code, signal) => {
            console.log(`[VPS] Stream closed with code ${code}`);
            conn.end();
        }).on('data', (d) => {
            process.stdout.write(d);
        }).stderr.on('data', (d) => {
            process.stderr.write(d);
        });
    });
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
});
