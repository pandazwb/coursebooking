import schedule from 'node-schedule';
import { formatToLocalTime, getDb } from './db';
import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from './token';
import { sendErrorNotification, sendTokenUpdateFailNotification, sendTestEmail } from './email';
import { BookingManager } from '../services/booking-manager';
import { ReconciliationService } from '../services/reconciliation-service';

// 替换原来的 token 常量
const tokenManager = TokenManager.getInstance();

// 修改token获取方式，确保总是获取最新token
const getToken = () => {
    return tokenManager.getToken();
};

// 删除硬编码的token注释

// Add at the top of the file
interface PriceStrategy {
    amount: number;
    price: number;
    conditions?: {
        courseType?: string;
        timeRange?: string;
    };
}

// 添加全局错误计数器
let consecutiveErrors = 0;
let lastTokenUpdateTime = Date.now();
const MAX_CONSECUTIVE_ERRORS = 5;
const TOKEN_UPDATE_TIMEOUT = 24 * 60 * 60 * 1000; // 24小时

// 包装函数，添加错误处理
const withErrorHandling = (fn: Function, context: string) => {
    return async (...args: any[]) => {
        try {
            await fn(...args);
            consecutiveErrors = 0; // 成功执行后重置错误计数
        } catch (error) {
            consecutiveErrors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`${context} 执行失败:`, errorMessage);
            
            // 记录错误到日志
            const logDir = path.join(__dirname, '../logs');
            const errorLogFile = path.join(logDir, 'error.log');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const errorLogEntry = `[${new Date().toLocaleString('zh-CN')}] ${context}: ${errorMessage}\n`;
            fs.appendFileSync(errorLogFile, errorLogEntry);
            
            // 如果连续错误次数超过阈值，发送邮件通知
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                await sendErrorNotification(
                    `连续${consecutiveErrors}次执行失败: ${errorMessage}`,
                    context
                );
                consecutiveErrors = 0; // 发送邮件后重置计数，避免重复发送
            }
        }
    };
};

// 修改检查Token更新状态函数
const checkTokenStatus = async () => {
    try {
        const token = getToken();
        
        if (!token) {
            console.log('Token为空，尝试更新...');
            const success = await tokenManager.updateToken();
            if (!success) {
                await sendTokenUpdateFailNotification();
            }
            return;
        }
        
        // 验证Token有效性
        const isValid = await tokenManager.validateToken();
        if (!isValid) {
            console.log('Token无效，尝试更新...');
            const success = await tokenManager.updateToken();
            if (!success) {
                await sendTokenUpdateFailNotification();
            }
        }
    } catch (error) {
        console.error('检查Token状态失败:', error);
    }
};

// 修改现有的定时任务，添加错误处理
schedule.scheduleJob('*/5 * * * *', withErrorHandling(() => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每 5 分钟运行一次`);
    getRowClassList();
}, '每5分钟价格更新任务'));

//schedule.scheduleJob('0 12 * * *', withErrorHandling(() => {
//    console.log(`[${new Date().toISOString()}] 定时任务执行：每天中午12点更新明天课程价格`);
//    updateNextDayPrices();
//}, '中午12点价格更新任务'));

//schedule.cheduleJob('0 0 * * *', withErrorHandling(() => {
//    console.log(`[${new Date().toISOString()}] 定时任务执行：每天凌晨0点设置阻止选课价格`);
//    setBlockPrice();
//}, '凌晨0点阻止价格设置任务'));

// 添加Token状态检查任务（每小时检查一次）
schedule.scheduleJob('0 * * * *', withErrorHandling(() => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：检查Token状态`);
    checkTokenStatus();
}, 'Token状态检查任务'));

// 读取价格策略配置
const getPriceStrategy = () => {
    try {
        const configPath = path.join(__dirname, '../config/price-strategy.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent);
    } catch (error) {
        console.error('读取价格策略配置失败:', error);
        return {
            strategies: [
                { amount: 0, price: 200 },
                { amount: 1, price: 180 },
                { amount: 2, price: 160 },
                { amount: 3, price: 140 },
                { amount: 4, price: 120 },
                { amount: 5, price: 100 }
            ]
        };
    }
};

const getRowClassList = withErrorHandling(async () => {
    try {
        const body = {
            "StoresID": "1517",
            "isweek": "0",
            "dateTime": "",
            "RowClassType": "0",
            "ClassTeacher": "",
            "CourseID": "",
            "SelectClass": "1",
            "ClassID": "",
            "RowType": 0,
            token: getToken()
        }
        const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/getListRowClassNew.aspx", {
            "headers": {
                "accept": "application/json",
                "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
                "access-control-allow-origin": "*",
                "cache-control": "no-cache",
                "content-type": "application/x-www-form-urlencoded",
                "pragma": "no-cache",
                "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "Referer": "https://s.zhihuoyueke.com/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": JSON.stringify(body),
            "method": "POST"
        });
        const json = await res.json();
        
        if (!json || !json.data) {
            console.error('Invalid response:', json);
            return;
        }

        // 数组长度是3，代表上下午和晚上
        // 1.找到今天的课表
        const courseList: any[] = [];
        (json.data as any[]).forEach((obj) => {
            Object.keys(obj).forEach((key) => {
                if (obj[key].TitleDay == '今') {
                    courseList.push(...obj[key].listRowClass);
                }
            });
        });
        console.log('courseList', courseList);
        // 2.找到今天约课情况,PreAboutCount 代表预约人数
        for (let index = 0; index < courseList.length; index++) {
            const item = courseList[index];
            console.log('课程日期', item.SKtime);
            console.log('课程时间', item.startTime);
            console.log('课程人数', item.PreAboutCount);
            const SKtimeArray = (item.SKtime as string).split('/');
            const startTimeArray = (item.startTime as string).split(':');
            const ts = new Date(Number(SKtimeArray[0]), Number(SKtimeArray[1]) - 1, Number(SKtimeArray[2]), Number(startTimeArray[0]), Number(startTimeArray[1])).valueOf();
            const now = Date.now();
            console.log('课程时间戳', ts);
            console.log('当前时间戳', now);
            // 计算时间差单位是分钟
            const diff = (ts - now) / 1000 / 60;
            if (diff > -0 && diff < 60) {
                // 当天价格修改使用折扣
                const afterPrice = await calPrice(item, true);
                if (afterPrice !== null) {
                    modifyPrice(item, afterPrice);
                }
            }
        }
    } catch (error) {
        console.log('getRowClassList error', error);
    }
}, '获取今日课程列表');

const calPrice = async (course: any, applyDiscount: boolean = true) => {
    try {
        // 获取当前预约人数和课程时长
        const currentCount = parseInt(course.PreAboutCount) || 0;
        const courseLength = course.Timelength;
        
        // 获取价格策略
        const priceStrategy = getPriceStrategy();
        
        // 获取对应时长的策略列表
        const lengthStrategies = priceStrategy.strategies[courseLength];
        
        // 如果找不到对应时长的策略，返回 null
        if (!lengthStrategies) {
            console.log(`未找到时长 ${courseLength} 分钟的价格策略`);
            return null;
        }
        
        // 找到对应的价格策略
        const strategy = lengthStrategies.find((s: PriceStrategy) => s.amount === currentCount);
        
        // 如果找不到对应的策略，返回 null
        if (!strategy) {
            console.log(`未找到预约人数 ${currentCount} 对应的价格策略`);
            return null;
        }
        
        const currentPrice = parseFloat(course.singlePrice);
        let newPrice = strategy.price;
        
        // 只在当天价格修改时应用折扣
        if (applyDiscount && priceStrategy.discount && priceStrategy.discount > 0 && priceStrategy.discount < 1) {
            // 计算折扣后价格，保留2位小数
            const discountedPrice = newPrice * priceStrategy.discount;
            // 向下取整
            newPrice = Math.floor(discountedPrice);
            console.log(`应用折扣 ${priceStrategy.discount}，原价: ${strategy.price}，折扣后: ${newPrice}`);
        }
        
        console.log(`课程: ${course.CourseName}`);
        console.log(`课程时长: ${courseLength}分钟`);
        console.log(`当前预约人数: ${currentCount}`);
        console.log(`当前价格: ${currentPrice}`);
        console.log(`策略价格: ${newPrice}`);
        
        // 如果当前价格和策略价格相同，返回 null 表示不需要修改
        if (currentPrice === newPrice) {
            console.log('价格相同，无需修改');
            return null;
        }
        
        return newPrice.toString();
    } catch (error) {
        console.error('计算价格时出错:', error);
        return null; // 出错时返回 null
    }
}

// 添加日志记录函数
const logPriceChange = (course: any, prePrice: string, curPrice: string, status: string = 'SUCCESS') => {
    const logDir = path.join(__dirname, '../logs');
    const logFile = path.join(logDir, 'price-changes.log');
    
    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 使用本地时间
    const now = new Date();
    const localTime = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const logEntry = `[${localTime}] 课程: ${course.CourseName}, 原价: ${prePrice}, 新价格: ${curPrice}, 预约人数: ${course.PreAboutCount}, 状态: ${status}\n`;
    
    fs.appendFileSync(logFile, logEntry);
};

// 修改 modifyPrice 函数
const modifyPrice = async (body: any, curPrice = '500') => {
    const prePrice = body.singlePrice;
    const newBody = {
        ...body,
        singlePrice: curPrice,
        IsPay: Number(body.IsPay),
        payPrice: Number(body.payPrice),
        "ListRowClassTime": "[]",
        "RowClassID": body.ID,
        token: getToken()
    }

    const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/editRowClass.aspx", {
        "headers": {
            "accept": "application/json",
            "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
            "access-control-allow-origin": "*",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "Referer": "https://s.zhihuoyueke.com/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        body: JSON.stringify(newBody),
        "method": "POST"
    });
    const json = await res.json();
    console.log('json', json);

    if (json.orsuccess && json.orsuccess == 1) {
        // 记录价格变更到日志文件
        logPriceChange(body, prePrice, curPrice);
    }
}

// 1.找到今天的课表,
// 2.找到今天约课情况
// // 3.修改价格
getRowClassList()

// Add new function to get next day's courses
const getNextDayClassList = async () => {
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '/');

        const body = {
            "StoresID": "1517",
            "isweek": "0",
            "dateTime": tomorrowStr,
            "RowClassType": "0",
            "ClassTeacher": "",
            "CourseID": "",
            "SelectClass": "1",
            "ClassID": "",
            "RowType": 0,
            token: getToken()
        }

        const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/getListRowClassNew.aspx", {
            "headers": {
                "accept": "application/json",
                "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
                "access-control-allow-origin": "*",
                "cache-control": "no-cache",
                "content-type": "application/x-www-form-urlencoded",
                "pragma": "no-cache",
                "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "Referer": "https://s.zhihuoyueke.com/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": JSON.stringify(body),
            "method": "POST"
        });
        const json = await res.json();
        
        if (!json || !json.data) {
            console.error('Invalid response:', json);
            return [];
        }

        const courseList: any[] = [];
        (json.data as any[]).forEach((obj) => {
            Object.keys(obj).forEach((key) => {
                // 只取明天的课表
                if (obj[key].TitleDay == '明') {
                    courseList.push(...obj[key].listRowClass);
                }
            });
        });
        return courseList;
    } catch (error) {
        console.error('getNextDayClassList error:', error);
        return [];
    }
}

// Add retry mechanism for price modification
const modifyPriceWithRetry = async (course: any, newPrice: string, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await modifyPrice(course, newPrice);
            return true;
        } catch (error) {
            console.error(`Price modification attempt ${attempt} failed:`, error);
            if (attempt === maxRetries) {
                logPriceChange(course, course.singlePrice, newPrice, 'FAILED');
                return false;
            }
            // Wait for 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return false;
}

// Add new scheduled task for noon price updates
const updateNextDayPrices = withErrorHandling(async () => {
    console.log(`[${new Date().toISOString()}] 开始更新明天课程价格`);
    const courses = await getNextDayClassList();
    
    for (const course of courses) {
        const newPrice = await calPrice(course, true);
        if (newPrice !== null) {
            await modifyPriceWithRetry(course, newPrice);
        }
    }
    console.log(`[${new Date().toISOString()}] 明天课程价格更新完成`);
}, '更新明天课程价格');

// Add test function for immediate execution
const testNextDayPriceUpdate = async () => {
    console.log(`[${new Date().toISOString()}] 测试：立即执行明天课程价格更新`);
    try {
        await updateNextDayPrices();
        console.log(`[${new Date().toISOString()}] 测试完成：明天课程价格更新执行完毕`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 测试失败：`, error);
    }
}

// 测试：立即执行明天课程价格更新
//testNextDayPriceUpdate();


// Add new function to set block price
const setBlockPrice = withErrorHandling(async () => {
    console.log(`[${new Date().toISOString()}] 开始设置阻止选课价格`);
    try {
        const priceStrategy = getPriceStrategy();
        const blockPrice = priceStrategy.blockPrice || '99999'; // 从配置中读取阻止价格，默认99999
        
        const courses = await getNextDayClassList();
        let successCount = 0;
        let failCount = 0;
        
        for (const course of courses) {
            const result = await modifyPriceWithRetry(course, blockPrice);
            if (result) {
                successCount++;
            } else {
                failCount++;
            }
        }
        
        console.log(`[${new Date().toISOString()}] 阻止选课价格设置完成`);
        console.log(`成功: ${successCount} 个课程, 失败: ${failCount} 个课程`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 设置阻止选课价格失败:`, error);
    }
}, '设置阻止选课价格');

// Add midnight schedule for block price
//schedule.scheduleJob('0 0 * * *', () => {
//    console.log(`[${new Date().toISOString()}] 定时任务执行：每天凌晨0点设置阻止选课价格`);
//    setBlockPrice();
//});

// Add test function for immediate block price execution
const testBlockPriceUpdate = async () => {
    console.log(`[${new Date().toISOString()}] 测试：立即执行阻止选课价格设置`);
    try {
        await setBlockPrice();
        console.log(`[${new Date().toISOString()}] 测试完成：阻止选课价格设置执行完毕`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 测试失败：`, error);
    }
}

// 测试：立即执行阻止选课价格设置
//testBlockPriceUpdate();

// 进程异常处理
process.on('uncaughtException', async (error) => {
    console.error('未捕获的异常:', error);
    await sendErrorNotification(error.message, '未捕获的异常');
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    await sendErrorNotification(String(reason), '未处理的Promise拒绝');
});

// 在文件末尾添加测试邮件发送
//console.log('正在发送测试邮件...');
//sendTestEmail().then((success) => {
//    if (success) {
//        console.log('测试邮件发送完成，请检查收件箱');
//    } else {
//        console.log('测试邮件发送失败，请检查邮件配置');
//    }
//});

//设置最大预约天数的payload
//{"SttingID":"25046","info":"5","token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ4NjEwMzAyLCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yOSAyMTowNTowMiIsImRhdGEiOnsiTmFtZSI6IumSn-WFiOeUnyIsIklzZGlzYWJsZSI6MCwiUm9sZSI6IjAiLCJMaW1pdHMiOiIxLDIsMywzMSwzMiw0LDQxLDQyLDQzLDQ0LDUsNTEsNTIsNTMsNiw2MSw2Miw2Myw2NCw2NSw2Niw2Nyw2OCw2OSw2MDEsNjAyLDYwMyw3LDcxLDcyLDczLDc0LDc1LDgsODEsOSw5MSw5Miw5Myw5NCwxMCwxMDEsMTAyLDEwMywxMDQsMTEsMTExLDExMiwxMTMsMTE0LDExNSwyMSwyMiwyMywyNCwyNSwyNiwyNywxMDUsMjgsMTIsMTIxLDEyMiwxMjMsMTMsMTQsMTQxLDE0MiwxNSw2MDQsMzMsNjA1LDYwNiw2MDcsNjA4LDYwOSw2MTAsNjExLDYxMiw2MTMsNjE0LDYxNSw2MTYsNjE3LDYxOCw2MTksNjIwLDYyMSw2MDQxLDYwNDIsNjA0Myw2MDQ0LDYwNDUsMjksMjExLDIxMiwyMTMsMjE0LDE2LDE2MSwxNjIsMTYzLDE2NiwxNjcsMTY0LDYwNDYsNjA0Nyw2MDQ4LDYwNDksMjE1LDIxNiwxNjUsMjE3LDc4LDYwNTAsMjE4LDIxOSwyMTkwLDIxOTEsMjE5MiIsInVzZXJpZCI6IjE0OTA5IiwiU3RvcmVzSUQiOiIxNTE3IiwiSXNIZWFkT2ZmaWNlIjowLCJJc3RlciI6MX19.RVfuTv0YKALSJxt4PqtiyYtRhJUiUWymFy7JUJtXEAw"}: 
//https://test.xingxingzhihuo.com.cn/WebApi/editSttinginfo.aspx

// 在文件末尾添加预约管理定时任务

// 获取预约管理器实例
const bookingManager = BookingManager.getInstance();
const bookingConfig = bookingManager.getConfig();

// 添加预约日志记录函数
const logBookingSchedule = (message: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS') => {
    const logDir = path.join(__dirname, '../logs');
    const logFile = path.join(logDir, 'booking-schedule.log');
    
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logEntry = `[${formatToLocalTime(new Date())}] [${status}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry);
};

// 每天凌晨0点整，设置最大预约天数为1天
schedule.scheduleJob('0 0 * * *', withErrorHandling(async () => {
    console.log('\n=== 凌晨0点定时任务 ===');
    console.log('时间:', formatToLocalTime(new Date()));
    
    const success = await bookingManager.closeBooking();
    if (success) {
        logBookingSchedule('设置最大预约天数为1天（关闭次日预约）');
    } else {
        logBookingSchedule('设置最大预约天数为1天失败', 'FAILED');
        await sendErrorNotification('预约设置失败', '凌晨0点设置最大预约天数为1天失败');
    }
}, '凌晨0点关闭预约'));

// 每天中午12点（或配置的时间），设置最大预约天数为2天
const [hour, minute] = bookingConfig.openBookingTime.split(':').map(Number);
const cronExpression = `${minute} ${hour} * * *`;

schedule.scheduleJob(cronExpression, withErrorHandling(async () => {
    console.log(`\n=== ${bookingConfig.openBookingTime}定时任务 ===`);
    console.log('时间:', formatToLocalTime(new Date()));
    
    const success = await bookingManager.openBooking();
    if (success) {
        logBookingSchedule('设置最大预约天数为2天（开放次日预约）');
    } else {
        logBookingSchedule('设置最大预约天数为2天失败', 'FAILED');
        await sendErrorNotification('预约设置失败', `${bookingConfig.openBookingTime}设置最大预约天数为2天失败`);
    }
}, `${bookingConfig.openBookingTime}开放预约`));

console.log(`📅 预约管理定时任务已启动:`);
console.log(`   - 每天凌晨0点: 关闭次日预约（设置为1天）`);
console.log(`   - 每天${bookingConfig.openBookingTime}: 开放次日预约（设置为2天）`);

// 获取售卡统计信息的接口：https://test.xingxingzhihuo.com.cn/WebApi/getCradTurnover.aspx
// payload:{"StoresID":"1517","Stime":"2025-05-28","Etime":"2025-06-04","stype":"4","SelectCardID":"","token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ5MDQxNDc0LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNi8zIDIwOjUxOjE0IiwiZGF0YSI6eyJOYW1lIjoi6ZKf5YWI55SfIiwiSXNkaXNhYmxlIjowLCJSb2xlIjoiMCIsIkxpbWl0cyI6IjEsMiwzLDMxLDMyLDQsNDEsNDIsNDMsNDQsNSw1MSw1Miw1Myw2LDYxLDYyLDYzLDY0LDY1LDY2LDY3LDY4LDY5LDYwMSw2MDIsNjAzLDcsNzEsNzIsNzMsNzQsNzUsOCw4MSw5LDkxLDkyLDkzLDk0LDEwLDEwMSwxMDIsMTAzLDEwNCwxMSwxMTEsMTEyLDExMywxMTQsMTE1LDIxLDIyLDIzLDI0LDI1LDI2LDI3LDEwNSwyOCwxMiwxMjEsMTIyLDEyMywxMywxNCwxNDEsMTQyLDE1LDYwNCwzMyw2MDUsNjA2LDYwNyw2MDgsNjA5LDYxMCw2MTEsNjEyLDYxMyw2MTQsNjE1LDYxNiw2MTcsNjE4LDYxOSw2MjAsNjIxLDYwNDEsNjA0Miw2MDQzLDYwNDQsNjA0NSwyOSwyMTEsMjEyLDIxMywyMTQsMTYsMTYxLDE2MiwxNjMsMTY2LDE2NywxNjQsNjA0Niw2MDQ3LDYwNDgsNjA0OSwyMTUsMjE2LDE2NSwyMTcsNzgsNjA1MCwyMTgsMjE5LDIxOTAsMjE5MSwyMTkyIiwidXNlcmlkIjoiMTQ5MDkiLCJTdG9yZXNJRCI6IjE1MTciLCJJc0hlYWRPZmZpY2UiOjAsIklzdGVyIjoxfX0.xkmyVsoQ5T02wEIi8T0hhxWbrxarXNi7sRJSLA9JlSM"}: 
//response:
/*
{
    "Stime": "2025-05-28",
    "orsuccess": "1",
    "Etime": "2025-06-04",
    "Msg": "获取成功",
    "listall": [
      {
        "CradName": "储值卡",
        "allCountsk": 76,
        "allAmountsk": 34868.00,
        "allCountxf": 18,
        "allAmountxf": 5594.00,
        "CradID": 23503
      }
    ]
  }
  
  其中，总金额 =allAmountsk + allAmountxf 
  
  */

  // 会员卡片剩余余额的查询接口和实例：
  /*
  https://test.xingxingzhihuo.com.cn/WebApi/getListSYKSMembers.aspx

{"pages":1,"psize":10,"StoresID":"1517","SelectName":"","CardType":"4","OderType":"1","CardDays1":"0","CardDays2":"0","Amount1":"99999","Amount2":"0","CardNumber1":"30","CardNumber2":"0","selectCardID":"","token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ5MDQxNDc0LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNi8zIDIwOjUxOjE0IiwiZGF0YSI6eyJOYW1lIjoi6ZKf5YWI55SfIiwiSXNkaXNhYmxlIjowLCJSb2xlIjoiMCIsIkxpbWl0cyI6IjEsMiwzLDMxLDMyLDQsNDEsNDIsNDMsNDQsNSw1MSw1Miw1Myw2LDYxLDYyLDYzLDY0LDY1LDY2LDY3LDY4LDY5LDYwMSw2MDIsNjAzLDcsNzEsNzIsNzMsNzQsNzUsOCw4MSw5LDkxLDkyLDkzLDk0LDEwLDEwMSwxMDIsMTAzLDEwNCwxMSwxMTEsMTEyLDExMywxMTQsMTE1LDIxLDIyLDIzLDI0LDI1LDI2LDI3LDEwNSwyOCwxMiwxMjEsMTIyLDEyMywxMywxNCwxNDEsMTQyLDE1LDYwNCwzMyw2MDUsNjA2LDYwNyw2MDgsNjA5LDYxMCw2MTEsNjEyLDYxMyw2MTQsNjE1LDYxNiw2MTcsNjE4LDYxOSw2MjAsNjIxLDYwNDEsNjA0Miw2MDQzLDYwNDQsNjA0NSwyOSwyMTEsMjEyLDIxMywyMTQsMTYsMTYxLDE2MiwxNjMsMTY2LDE2NywxNjQsNjA0Niw2MDQ3LDYwNDgsNjA0OSwyMTUsMjE2LDE2NSwyMTcsNzgsNjA1MCwyMTgsMjE5LDIxOTAsMjE5MSwyMTkyIiwidXNlcmlkIjoiMTQ5MDkiLCJTdG9yZXNJRCI6IjE1MTciLCJJc0hlYWRPZmZpY2UiOjAsIklzdGVyIjoxfX0.xkmyVsoQ5T02wEIi8T0hhxWbrxarXNi7sRJSLA9JlSM"}

{
  "data": [
    {
      "PurchaseAmount": "100.00",
      "CardID": "23503",
      "CardName": "储值卡",
      "OverdueTime": "2025/5/29",
      "Phone": "15921985593",
      "isDel": "0",
      "CardNum": "",
      "vid": "456079",
      "SourceIDs": "0",
      "SourceName": "",
      "Isdisable": "0",
      "ID": "477240",
      "TypeLabel": "",
      "WxHeadUrl": "https://tp.xingxingzhihuo.com.cn/zhyk/wx/moren.png",
      "Note": "流水号：7895004855876147",
      "CardDays": "-6",
      "sourceID": "14909",
      "HeadUrl": "",
      "integral": "0",
      "Name": "俊俊",
      "isMain": "1",
      "MainID": "0",
      "StoresID": "1517",
      "UpdTime": "2025/6/1 15:48:49",
      "CardType": "4",
      "Amount": "0.00",
      "sourceName": "钟先生",
      "CreateTime": "2025/5/29 19:17:34",
      "CardNumber": "0",
      "addTime": "2025/5/29 19:17:34"
    },
    {
      "PurchaseAmount": "100.00",
      "CardID": "23503",
      "CardName": "储值卡",
      "OverdueTime": "2025/5/29",
      "Phone": "13611058902",
      "isDel": "0",
      "CardNum": "",
      "vid": "456085",
      "SourceIDs": "0",
      "SourceName": "",
      "Isdisable": "0",
      "ID": "477243",
      "TypeLabel": "",
      "WxHeadUrl": "https://tp.xingxingzhihuo.com.cn/zhyk/wx/moren.png",
      "Note": "流水号：7895004855850871",
      "CardDays": "-6",
      "sourceID": "14909",
      "HeadUrl": "",
      "integral": "0",
      "Name": "梅丽莎",
      "isMain": "1",
      "MainID": "0",
      "StoresID": "1517",
      "UpdTime": "2025/6/1 16:35:57",
      "CardType": "4",
      "Amount": "0.00",
      "sourceName": "钟先生",
      "CreateTime": "2025/5/29 19:18:59",
      "CardNumber": "0",
      "addTime": "2025/5/29 19:18:59"
    },
    {
      "PurchaseAmount": "200.00",
      "CardID": "23503",
      "CardName": "储值卡",
      "OverdueTime": "2025/5/30",
      "Phone": "13917985059",
      "isDel": "0",
      "CardNum": "",
      "vid": "456532",
      "SourceIDs": "0",
      "SourceName": "",
      "Isdisable": "0",
      "ID": "477528",
      "TypeLabel": "",
      "WxHeadUrl": "https://tp.xingxingzhihuo.com.cn/zhyk/upload_images/165d8b0e6a3d4d2d9cdcbcc535ed6bfa.jpeg",
      "Note": "流水号：7895225862771993",
      "CardDays": "-5",
      "sourceID": "15201",
      "HeadUrl": "",
      "integral": "0",
      "Name": "茉小莉",
      "isMain": "1",
      "MainID": "0",
      "StoresID": "1517",
      "UpdTime": "2025/5/31 13:01:23",
      "CardType": "4",
      "Amount": "12.00",
      "sourceName": "吴明",
      "CreateTime": "2025/5/30 16:59:51",
      "CardNumber": "0",
      "addTime": "2025/5/30 16:59:51"
    },

    其中 Amount 字段即卡内余额
  */

/*
会员已消课的小费金额统计

https://test.xingxingzhihuo.com.cn/WebApi/getListOrderRecordTJ.aspx

{"StoresID":"1517","sTime":"2025-05-28","eTime":"2025-06-04","stype":"4","SelectName":"","token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ5MDQxNDc0LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNi8zIDIwOjUxOjE0IiwiZGF0YSI6eyJOYW1lIjoi6ZKf5YWI55SfIiwiSXNkaXNhYmxlIjowLCJSb2xlIjoiMCIsIkxpbWl0cyI6IjEsMiwzLDMxLDMyLDQsNDEsNDIsNDMsNDQsNSw1MSw1Miw1Myw2LDYxLDYyLDYzLDY0LDY1LDY2LDY3LDY4LDY5LDYwMSw2MDIsNjAzLDcsNzEsNzIsNzMsNzQsNzUsOCw4MSw5LDkxLDkyLDkzLDk0LDEwLDEwMSwxMDIsMTAzLDEwNCwxMSwxMTEsMTEyLDExMywxMTQsMTE1LDIxLDIyLDIzLDI0LDI1LDI2LDI3LDEwNSwyOCwxMiwxMjEsMTIyLDEyMywxMywxNCwxNDEsMTQyLDE1LDYwNCwzMyw2MDUsNjA2LDYwNyw2MDgsNjA5LDYxMCw2MTEsNjEyLDYxMyw2MTQsNjE1LDYxNiw2MTcsNjE4LDYxOSw2MjAsNjIxLDYwNDEsNjA0Miw2MDQzLDYwNDQsNjA0NSwyOSwyMTEsMjEyLDIxMywyMTQsMTYsMTYxLDE2MiwxNjMsMTY2LDE2NywxNjQsNjA0Niw2MDQ3LDYwNDgsNjA0OSwyMTUsMjE2LDE2NSwyMTcsNzgsNjA1MCwyMTgsMjE5LDIxOTAsMjE5MSwyMTkyIiwidXNlcmlkIjoiMTQ5MDkiLCJTdG9yZXNJRCI6IjE1MTciLCJJc0hlYWRPZmZpY2UiOjAsIklzdGVyIjoxfX0.xkmyVsoQ5T02wEIi8T0hhxWbrxarXNi7sRJSLA9JlSM"}: 

 "data": [
    {
      "Phone": "15901698368",
      "allCount": "5",
      "CardType": "4",
      "djValue": "1.00",
      "MembersID": "471974",
      "Name": "小明",
      "OrderType": 1,
      "CardName": "储值卡",
      "Amount": 1000.00,
      "sumNumber": "0",
      "sumAmount": "557.00",
      "OrderCode": "202505230055170005"
    },
    {
      "Phone": "15846516328",
      "allCount": "1",
      "CardType": "4",
      "djValue": "1.00",
      "MembersID": "476864",
      "Name": "思敏",
      "OrderType": 1,
      "CardName": "储值卡",
      "Amount": 500.00,
      "sumNumber": "0",
      "sumAmount": "84.00",
      "OrderCode": "202505282333090010"
    },
    {
      "Phone": "18321347116",
      "allCount": "4",
      "CardType": "4",
      "djValue": "1.00",
      "MembersID": "476865",
      "Name": "赵红",
      "OrderType": 1,
      "CardName": "储值卡",
      "Amount": 1000.00,
      "sumNumber": "0",
      "sumAmount": "339.00",
      "OrderCode": "202505282337310011"
    },
    {
      "Phone": "13501724350",
      "allCount": "3",
      "CardType": "4",
      "djValue": "1.00",
      "MembersID": "476872",
      "Name": "韩菲",
      "OrderType": 1,
      "CardName": "储值卡",
      "Amount": 500.00,
      "sumNumber": "0",
      "sumAmount": "279.00",
      "OrderCode": "202505282340570013"
    },


    其中 sumAmount 为已消耗的金额
*/

// 在文件末尾添加核账相关代码

// 核账任务 - 每天晚上11点执行
schedule.scheduleJob('0 23 * * *', withErrorHandling(async () => {
    console.log(`\n=== 每日核账任务 ===`);
    console.log('时间:', new Date().toLocaleString('zh-CN'));
    
    try {
        const reconciliationService = ReconciliationService.getInstance();
        const result = await reconciliationService.performReconciliation();
        
        if (!result.isBalanced) {
            // 如果账目不平衡，发送告警邮件
            await sendErrorNotification(
                `账目不平衡！差额: ¥${result.difference.toFixed(2)}`,
                '每日核账告警'
            );
        }
        
        console.log('✅ 每日核账任务完成');
    } catch (error) {
        console.error('❌ 每日核账任务失败:', error);
        await sendErrorNotification(
            `核账任务执行失败: ${error}`,
            '核账任务错误'
        );
    }
}, '每日核账任务'));

console.log(`📊 核账任务已启动: 每天晚上23:00执行`);

// 添加用户上课记录导出功能
import { userCourseRecordsService } from '../services/user-course-records';
import { userReconciliationService } from '../services/user-reconciliation-service';

// 手动调用的导出功能（注释掉，需要时取消注释）
// const testExportUserRecords = async () => {
//     console.log('开始测试导出所有用户上课记录...');
//     try {
//         const filePath = await userCourseRecordsService.exportAllUserCourseRecords();
//         console.log(`测试导出完成，文件路径: ${filePath}`);
//     } catch (error) {
//         console.error('测试导出失败:', error);
//     }
// };

// 手动调用的用户核账功能（注释掉，需要时取消注释）
// const testUserReconciliation = async () => {
//     console.log('开始测试用户核账功能...');
//     try {
//         // 测试单个用户核账
//         // const result = await userReconciliationService.reconcileUser('478926', '测试用户');
//         
//         // 测试所有用户核账
//         const result = await userReconciliationService.exportUserReconciliation();
//         console.log(`测试核账完成: ${result}`);
//     } catch (error) {
//         console.error('测试核账失败:', error);
//     }
// };

// 取消注释下面这行来立即执行导出
// testExportUserRecords();

// 取消注释下面这行来立即执行用户核账
// testUserReconciliation();