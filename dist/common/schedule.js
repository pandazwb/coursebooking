"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_schedule_1 = __importDefault(require("node-schedule"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const token_1 = require("./token");
// 替换原来的 token 常量
const tokenManager = token_1.TokenManager.getInstance();
// 在需要 token 的地方使用
const token = tokenManager.getToken();
// 每 5 分钟执行一次
node_schedule_1.default.scheduleJob('*/5 * * * *', () => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每 5 分钟运行一次`);
    getRowClassList();
});
// 读取价格策略配置
const getPriceStrategy = () => {
    try {
        const configPath = path.join(__dirname, '../config/price-strategy.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent);
    }
    catch (error) {
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
const getRowClassList = async () => {
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
        };
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
        const courseList = [];
        json.data.forEach((obj) => {
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
            const SKtimeArray = item.SKtime.split('/');
            const startTimeArray = item.startTime.split(':');
            const ts = new Date(Number(SKtimeArray[0]), Number(SKtimeArray[1]) - 1, Number(SKtimeArray[2]), Number(startTimeArray[0]), Number(startTimeArray[1])).valueOf();
            const now = Date.now();
            console.log('课程时间戳', ts);
            console.log('当前时间戳', now);
            // 计算时间差单位是分钟
            const diff = (ts - now) / 1000 / 60;
            if (diff > -0 && diff < 60) {
                const afterPrice = await calPrice(item);
                if (afterPrice !== null) {
                    modifyPrice(item, afterPrice);
                }
            }
        }
    }
    catch (error) {
        console.log('getRowClassList error', error);
    }
};
const calPrice = async (course) => {
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
        const strategy = lengthStrategies.find((s) => s.amount === currentCount);
        // 如果找不到对应的策略，返回 null
        if (!strategy) {
            console.log(`未找到预约人数 ${currentCount} 对应的价格策略`);
            return null;
        }
        const currentPrice = parseFloat(course.singlePrice);
        const newPrice = strategy.price;
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
    }
    catch (error) {
        console.error('计算价格时出错:', error);
        return null; // 出错时返回 null
    }
};
const getPreAboutList = async () => {
    // const body = new FormData()
    // body.append('StoresID', '1517')
    // body.append('isweek', '0')
    // body.append('dateTime', '')
    // body.append('LoginID', '14909')
    // body.append('RowClassType', '0')
    // body.append('ClassTeacher', '')
    // body.append('CourseID', '')
    // body.append('SelectClass', '1')
    // body.append('ClassID', '')
    // body.append('RowType', '0')
    // body.append('token', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ3ODExNjc3LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yMCAxNToxNDozNyIsImRhdGEiOnsiTmFtZSI6IumSn-WFiOeUnyIsIklzZGlzYWJsZSI6MCwiUm9sZSI6IjAiLCJMaW1pdHMiOiIxLDIsMywzMSwzMiw0LDQxLDQyLDQzLDQ0LDUsNTEsNTIsNTMsNiw2MSw2Miw2Myw2NCw2NSw2Niw2Nyw2OCw2OSw2MDEsNjAyLDYwMyw3LDcxLDcyLDczLDc0LDc1LDgsODEsOSw5MSw5Miw5Myw5NCwxMCwxMDEsMTAyLDEwMywxMDQsMTEsMTExLDExMiwxMTMsMTE0LDExNSwyMSwyMiwyMywyNCwyNSwyNiwyNywxMDUsMjgsMTIsMTIxLDEyMiwxMjMsMTMsMTQsMTQxLDE0MiwxNSw2MDQsMzMsNjA1LDYwNiw2MDcsNjA4LDYwOSw2MTAsNjExLDYxMiw2MTMsNjE0LDYxNSw2MTYsNjE3LDYxOCw2MTksNjIwLDYyMSw2MDQxLDYwNDIsNjA0Myw2MDQ0LDYwNDUsMjksMjExLDIxMiwyMTMsMjE0LDE2LDE2MSwxNjIsMTYzLDE2NiwxNjcsMTY0LDYwNDYsNjA0Nyw2MDQ4LDYwNDksMjE1LDIxNiwxNjUsMjE3LDc4LDYwNTAsMjE4LDIxOSwyMTkwLDIxOTEsMjE5MiIsInVzZXJpZCI6IjE0OTA5IiwiU3RvcmVzSUQiOiIxNTE3IiwiSXNIZWFkT2ZmaWNlIjowLCJJc3RlciI6MX19.iQqqq5dBq2loy0QfgGKJXi_Rr4QgisQsUOdS0TdisZA')
    const body = {
        "StoresID": "1517",
        "isweek": "0",
        "dateTime": "",
        "LoginID": "14909",
        "RowClassType": "0",
        "ClassTeacher": "",
        "CourseID": "",
        "SelectClass": "1",
        "ClassID": "",
        "RowType": "0",
        token
    };
    const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/getListPreAbout.aspx", {
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
    // 数组长度是3，代表上下午和晚上
    const preAboutList = [];
    json.data.filter((obj) => {
        Object.keys(obj).forEach((key) => {
            if (obj[key].TitleDay == '今') {
                preAboutList.push(...obj[key].listRowClass);
            }
        });
    });
    // PreAboutCount 代表预约人数
    // console.log('preAboutList', preAboutList);
};
// 添加日志记录函数
const logPriceChange = (course, prePrice, curPrice) => {
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
    const logEntry = `[${localTime}] 课程: ${course.CourseName}, 原价: ${prePrice}, 新价格: ${curPrice}, 预约人数: ${course.PreAboutCount}\n`;
    fs.appendFileSync(logFile, logEntry);
};
// 修改 modifyPrice 函数
const modifyPrice = async (body, curPrice = '500') => {
    const prePrice = body.singlePrice;
    const newBody = Object.assign(Object.assign({}, body), { singlePrice: curPrice, IsPay: Number(body.IsPay), payPrice: Number(body.payPrice), "ListRowClassTime": "[]", "RowClassID": body.ID, token });
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
};
// 1.找到今天的课表,
// 2.找到今天约课情况
// // 3.修改价格
getRowClassList();
