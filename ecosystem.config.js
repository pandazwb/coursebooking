const path = require('path');

module.exports = {
    apps: [{
        name: 'course-price-manager',
        script: './dist/index.js',
        instances: 1,
        autorestart: true,
        watch: ['dist'],
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'development'
        },
        env_production: {
            NODE_ENV: 'production'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,
        restart_delay: 5000,
        max_restarts: 10,
        min_uptime: '10s'
    }]
}