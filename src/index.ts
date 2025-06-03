import './common/schedule';
import { TokenManager } from './common/token';
import schedule from 'node-schedule';

console.log('课程价格管理系统启动中...');
console.log('启动时间:', new Date().toLocaleString('zh-CN'));

// 启动时立即更新一次 token
const initToken = async () => {
    try {
        console.log('开始初始化token...');
        const tokenManager = TokenManager.getInstance();
        
        // 先验证现有Token
        const isValid = await tokenManager.validateToken();
        if (!isValid || tokenManager.needsUpdate()) {
            console.log('Token无效或即将过期，开始更新...');
            const success = await tokenManager.updateToken();
            if (!success) {
                console.error('❌ Token初始化失败，系统可能无法正常工作');
            } else {
                console.log('✅ Token更新成功');
            }
        } else {
            console.log('✅ 现有Token有效，无需更新');
        }
        
        console.log('Token初始化完成');
    } catch (error) {
        console.error('初始化 token 失败:', error);
    }
};

// 改为每天更新一次 token（凌晨2点，避开业务高峰）
schedule.scheduleJob('0 2 * * *', async () => {
    try {
        console.log('开始定时更新 token...');
        const tokenManager = TokenManager.getInstance();
        const success = await tokenManager.updateToken();
        
        if (!success) {
            console.error('❌ 定时更新Token失败');
            // 发送告警邮件
            // await sendTokenUpdateFailNotification();
        }
    } catch (error) {
        console.error('定时更新 token 失败:', error);
    }
});

// 添加Token健康检查任务（每4小时检查一次）
schedule.scheduleJob('0 */4 * * *', async () => {
    try {
        console.log('开始Token健康检查...');
        const tokenManager = TokenManager.getInstance();
        const isValid = await tokenManager.validateToken();
        
        if (!isValid) {
            console.log('Token健康检查失败，尝试更新...');
            const success = await tokenManager.updateToken();
            if (!success) {
                console.error('❌ Token健康检查后更新失败');
            }
        } else {
            console.log('✅ Token健康检查通过');
        }
    } catch (error) {
        console.error('Token健康检查失败:', error);
    }
});

// 立即执行token初始化
initToken(); 