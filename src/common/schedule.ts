import schedule from 'node-schedule';
import { formatToLocalTime, getDb } from './db';
import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from './token';
import { sendErrorNotification, sendTokenUpdateFailNotification, sendTestEmail } from './email';

// 替换原来的 token 常量
const tokenManager = TokenManager.getInstance();

// 在需要 token 的地方使用
const token = tokenManager.getToken();

//{"StoresID":"1517","token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ4MTA2Mjg2LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yNCAxOjA0OjQ2IiwiZGF0YSI6eyJOYW1lIjoi6ZKf5YWI55SfIiwiSXNkaXNhYmxlIjowLCJSb2xlIjoiMCIsIkxpbWl0cyI6IjEsMiwzLDMxLDMyLDQsNDEsNDIsNDMsNDQsNSw1MSw1Miw1Myw2LDYxLDYyLDYzLDY0LDY1LDY2LDY3LDY4LDY5LDYwMSw2MDIsNjAzLDcsNzEsNzIsNzMsNzQsNzUsOCw4MSw5LDkxLDkyLDkzLDk0LDEwLDEwMSwxMDIsMTAzLDEwNCwxMSwxMTEsMTEyLDExMywxMTQsMTE1LDIxLDIyLDIzLDI0LDI1LDI2LDI3LDEwNSwyOCwxMiwxMjEsMTIyLDEyMywxMywxNCwxNDEsMTQyLDE1LDYwNCwzMyw2MDUsNjA2LDYwNyw2MDgsNjA5LDYxMCw2MTEsNjEyLDYxMyw2MTQsNjE1LDYxNiw2MTcsNjE4LDYxOSw2MjAsNjIxLDYwNDEsNjA0Miw2MDQzLDYwNDQsNjA0NSwyOSwyMTEsMjEyLDIxMywyMTQsMTYsMTYxLDE2MiwxNjMsMTY2LDE2NywxNjQsNjA0Niw2MDQ3LDYwNDgsNjA0OSwyMTUsMjE2LDE2NSwyMTcsNzgsNjA1MCwyMTgsMjE5LDIxOTAsMjE5MSwyMTkyIiwidXNlcmlkIjoiMTQ5MDkiLCJTdG9yZXNJRCI6IjE1MTciLCJJc0hlYWRPZmZpY2UiOjAsIklzdGVyIjoxfX0.8Ivp-H04N_w0KdUBgHvmpX0hZO6ZZuxMRfkNLDBK4LA"}: 

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

// 检查Token更新状态
const checkTokenStatus = async () => {
    try {
        const tokenManager = TokenManager.getInstance();
        const token = tokenManager.getToken();
        
        if (!token) {
            await sendTokenUpdateFailNotification();
            return;
        }
        
        // 检查Token是否长时间未更新
        const now = Date.now();
        if (now - lastTokenUpdateTime > TOKEN_UPDATE_TIMEOUT) {
            await sendTokenUpdateFailNotification();
            lastTokenUpdateTime = now; // 重置时间，避免重复发送
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

schedule.scheduleJob('0 12 * * *', withErrorHandling(() => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每天中午12点更新明天课程价格`);
    updateNextDayPrices();
}, '中午12点价格更新任务'));

schedule.scheduleJob('0 0 * * *', withErrorHandling(() => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每天凌晨0点设置阻止选课价格`);
    setBlockPrice();
}, '凌晨0点阻止价格设置任务'));

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
            token
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
        token
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
            token
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
schedule.scheduleJob('0 0 * * *', () => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每天凌晨0点设置阻止选课价格`);
    setBlockPrice();
});

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