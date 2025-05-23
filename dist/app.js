"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
require("./common/schedule");
const node_schedule_1 = __importDefault(require("node-schedule"));
const token_1 = require("./common/token");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// 添加错误处理中间件
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// 每 23 小时更新一次 token
node_schedule_1.default.scheduleJob('0 */23 * * *', async () => {
    try {
        console.log('开始更新 token...');
        await token_1.TokenManager.getInstance().updateToken();
    }
    catch (error) {
        console.error('更新 token 失败:', error);
    }
});
// 启动时立即更新一次 token
const initToken = async () => {
    try {
        await token_1.TokenManager.getInstance().updateToken();
    }
    catch (error) {
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
