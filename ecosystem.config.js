module.exports = {
    apps: [
        {
            name: 'ton-node-prod', // pm2 start App name
            script: 'dist/app.js',
            exec_mode: 'cluster', // 'cluster' or 'fork'
            instance_var: 'INSTANCE_ID', // instance variable
            instances: 1, // pm2 instance count
            // autorestart: true, // auto restart if process crash
            watch: false, // files change automatic restart
            ignore_watch: ['node_modules', 'logs'], // ignore files change
            max_memory_restart: '1G', // restart if process use more than 1G memory
            output: './logs/prod-access.log', // pm2 log file
            error: './logs/prod-error.log', // pm2 error log file
            env: { // environment variable
                PORT: 5002,
                NODE_ENV: 'production',
                DEBUG: 'app*'
            },
            log_date_format: 'YYYY-MM-DD HH:mm Z',
        },
    ]
}