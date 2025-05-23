"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatToLocalTime = exports.getDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
// 创建并导出一个函数来获取数据库连接
const getDb = async () => {
    return (0, sqlite_1.open)({
        filename: './sqlitedb.db',
        driver: sqlite3_1.default.Database
    });
};
exports.getDb = getDb;
const formatToLocalTime = (timestamp) => {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Shanghai',
    });
    return formatter.format(date);
};
exports.formatToLocalTime = formatToLocalTime;
