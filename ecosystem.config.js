const path = require('path');

module.exports = {
    apps: [{
        name: 'price-scheduler',
        script: path.join(__dirname, 'dist/app.js'),
        cwd: __dirname,  // 使用当前目录
        exec_mode: 'cluster',
        instances: 1,
        watch: true,
        ignore_watch: [
            'node_modules',
            'logs',
            'src/config/token.json',  // 忽略 token.json 的变化
            'dist/config/token.json',  // 忽略编译后的 token.json 的变化
            'dist/logs',           // 忽略编译后的日志目录
            'dist/logs/*',         // 忽略编译后的所有日志文件
            'src/logs',            // 忽略源代码的日志目录
            'src/logs/*'           // 忽略源代码的所有日志文件
        ],
        max_memory_restart: '1G',
        output: './logs/prod-access.log',
        error: './logs/prod-error.log',
        env: {
            PORT: 5002,
            NODE_ENV: 'production',
            DEBUG: 'app*'
        },
        log_date_format: 'YYYY-MM-DD HH:mm Z',
        max_restarts: 10,
        min_uptime: '30s',
        restart_delay: 5000,
        exp_backoff_restart_delay: 100
    }]
}