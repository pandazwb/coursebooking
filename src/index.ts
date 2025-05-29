import './common/schedule';
import { TokenManager } from './common/token';
import schedule from 'node-schedule';

console.log('课程价格管理系统启动中...');
console.log('启动时间:', new Date().toLocaleString('zh-CN'));

// 启动时立即更新一次 token
const initToken = async () => {
    try {
        console.log('开始初始化token...');
        await TokenManager.getInstance().updateToken();
        console.log('Token初始化完成');
    } catch (error) {
        console.error('初始化 token 失败:', error);
    }
};

// 每 23 小时更新一次 token
schedule.scheduleJob('0 */23 * * *', async () => {
    try {
        console.log('开始定时更新 token...');
        await TokenManager.getInstance().updateToken();
    } catch (error) {
        console.error('定时更新 token 失败:', error);
    }
});

// 立即执行token初始化
initToken(); 