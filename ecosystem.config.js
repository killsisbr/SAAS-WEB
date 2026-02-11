module.exports = {
    apps: [{
        name: 'saas-web',
        script: 'server.js',
        cwd: './server',
        instances: 1,
        autorestart: true,
        watch: false, // Desabilitado para performance e estabilidade na VPS
        max_memory_restart: '4G', // Prevenir crashes por heap limit
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        node_args: '--max-old-space-size=4096', // Aumentar o heap size do Node para 4GB
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }]
};
