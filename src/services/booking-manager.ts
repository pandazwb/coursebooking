import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from '../common/token';

interface BookingConfig {
    openBookingTime: string;
    settingId: string;
    maxDaysWhenOpen: number;
    maxDaysWhenClosed: number;
    apiUrl: string;
}

export class BookingManager {
    private static instance: BookingManager;
    private config: BookingConfig = {
        openBookingTime: "12:00",
        settingId: "25046", 
        maxDaysWhenOpen: 2,
        maxDaysWhenClosed: 1,
        apiUrl: "https://test.xingxingzhihuo.com.cn/WebApi/editSttinginfo.aspx"
    };
    private configPath: string;

    private constructor() {
        const isCompiledCode = __filename.includes('dist');
        const rootDir = isCompiledCode 
            ? path.resolve(__dirname, '../../')
            : path.resolve(__dirname, '../../');
        
        const configDir = isCompiledCode ? 'dist/config' : 'src/config';
        this.configPath = path.join(rootDir, configDir, 'booking-schedule.json');
        
        this.loadConfig();
    }

    public static getInstance(): BookingManager {
        if (!BookingManager.instance) {
            BookingManager.instance = new BookingManager();
        }
        return BookingManager.instance;
    }

    private loadConfig() {
        try {
            this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        } catch (error) {
            console.error('加载预约配置失败:', error);
            // 使用默认配置
            this.config = {
                openBookingTime: "12:00",
                settingId: "25046",
                maxDaysWhenOpen: 2,
                maxDaysWhenClosed: 1,
                apiUrl: "https://test.xingxingzhihuo.com.cn/WebApi/editSttinginfo.aspx"
            };
        }
    }

    public async setMaxBookingDays(days: number): Promise<boolean> {
        try {
            const tokenManager = TokenManager.getInstance();
            const token = tokenManager.getToken();

            if (!token) {
                console.error('Token不存在，无法设置预约天数');
                return false;
            }

            const payload = {
                "SttingID": this.config.settingId,
                "info": days.toString(),
                "token": token
            };

            console.log(`开始设置最大预约天数为: ${days}天`);

            const response = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.orsuccess === '1' || result.orsuccess === 1) {
                console.log(`✅ 成功设置最大预约天数为: ${days}天`);
                return true;
            } else {
                console.error(`❌ 设置预约天数失败:`, result.Msg || '未知错误');
                
                // 检查是否是token无效
                if (result.orsuccess === '-99' || result.orsuccess === -99) {
                    console.log('Token无效，尝试刷新token后重试...');
                    const refreshed = await tokenManager.updateToken();
                    if (refreshed) {
                        // 递归重试一次
                        return await this.setMaxBookingDays(days);
                    }
                }
                return false;
            }
        } catch (error) {
            console.error('设置预约天数时出错:', error);
            return false;
        }
    }

    public async openBooking(): Promise<boolean> {
        console.log('🔓 开放预约 - 设置最大预约天数为2天');
        return await this.setMaxBookingDays(this.config.maxDaysWhenOpen);
    }

    public async closeBooking(): Promise<boolean> {
        console.log('🔒 关闭预约 - 设置最大预约天数为1天');
        return await this.setMaxBookingDays(this.config.maxDaysWhenClosed);
    }

    public getConfig(): BookingConfig {
        return { ...this.config };
    }

    public reloadConfig() {
        this.loadConfig();
        console.log('预约配置重载成功');
    }

    public async testBookingSettings() {
        console.log('🧪 测试预约设置功能...');
        
        // 测试设置为2天
        console.log('\n测试1: 设置最大预约天数为2天');
        const test1 = await this.openBooking();
        
        // 等待10秒
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 测试设置为1天
        console.log('\n测试2: 设置最大预约天数为1天');
        const test2 = await this.closeBooking();
        
        console.log(`\n测试结果: 开放预约${test1 ? '✅' : '❌'}, 关闭预约${test2 ? '✅' : '❌'}`);
    }
} 

// 检查命令行参数
if (process.argv.includes('--test-booking')) {
    console.log('🧪 启动预约设置测试模式...');
    setTimeout(async () => {
        const bookingManager = BookingManager.getInstance();
        await bookingManager.testBookingSettings();
        process.exit(0); // 测试完成后退出
    }, 10000);
}