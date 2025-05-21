
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

// 创建并导出一个函数来获取数据库连接
export const getDb = async (): Promise<Database> => {
    return open({
        filename: './sqlitedb.db', // 数据库文件路径
        driver: sqlite3.Database
    });
};

export const formatToLocalTime = (timestamp: number | string | Date): string => {
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
