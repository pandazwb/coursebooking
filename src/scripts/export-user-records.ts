#!/usr/bin/env ts-node

import { userCourseRecordsService } from '../services/user-course-records';

async function main() {
    try {
        console.log('课程预约系统 - 用户上课记录导出工具');
        console.log('=======================================');
        
        // 获取命令行参数
        const args = process.argv.slice(2);
        const filename = args[0]; // 可选的自定义文件名

        if (filename) {
            console.log(`指定输出文件名: ${filename}`);
        }

        const filePath = await userCourseRecordsService.exportAllUserCourseRecords(filename);
        
        console.log('\n✅ 导出成功！');
        console.log(`📁 文件位置: ${filePath}`);
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 导出失败:', error);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('程序异常退出:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 执行主函数
main(); 