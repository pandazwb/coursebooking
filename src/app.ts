import express from 'express';
import './common/schedule'
import schedule from 'node-schedule';
import { TokenManager } from './common/token';

const app = express();
const PORT = process.env.PORT || 3000;

// 添加错误处理中间件
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 每 23 小时更新一次 token
schedule.scheduleJob('0 */23 * * *', async () => {
    try {
        console.log('开始更新 token...');
        await TokenManager.getInstance().updateToken();
    } catch (error) {
        console.error('更新 token 失败:', error);
    }
});

// 启动时立即更新一次 token
const initToken = async () => {
    try {
        await TokenManager.getInstance().updateToken();
    } catch (error) {
        console.error('初始化 token 失败:', error);
    }
};

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // 在服务器启动后初始化 token
    initToken();
}).on('error', (error) => {
    console.error('Server error:', error);
});

app.get('/', (req, res) => {
    res.send('Hello, World!!');
});