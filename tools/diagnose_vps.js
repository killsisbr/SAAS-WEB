const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    const cmd = `
    echo "--- PRISON18 DETAILED DU ---"
    du -h -d 2 /root/killsis/PRISON18 | sort -rh | head -n 30
    echo "--- TOP 10 LARGEST FILES IN PRISON18 ---"
    find /root/killsis/PRISON18 -type f -exec ls -lh {} + | sort -k5 -rh | head -n 10
  `;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect({
    host: '82.29.58.126',
    port: 22,
    username: 'root',
    password: 'Killsis19980910#'
});
