import { sendTestEmail } from './src/common/email';

console.log('开始测试邮件发送...');
sendTestEmail().then((success) => {
    if (success) {
        console.log('✅ 测试邮件发送成功！请检查收件箱。');
    } else {
        console.log('❌ 测试邮件发送失败，请检查配置。');
    }
    process.exit(0);
}); 