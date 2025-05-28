import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    to: string;
}

// 读取邮件配置
const getEmailConfig = (): EmailConfig | null => {
    try {
        const configPath = path.join(__dirname, '../config/email.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent);
    } catch (error) {
        console.error('读取邮件配置失败:', error);
        return null;
    }
};

// 发送邮件
export const sendEmail = async (subject: string, content: string) => {
    try {
        const config = getEmailConfig();
        if (!config) {
            console.error('邮件配置不存在，无法发送邮件');
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass
            }
        });

        const mailOptions = {
            from: config.auth.user,
            to: config.to,
            subject: subject,
            text: content,
            html: `<pre>${content}</pre>`
        };

        await transporter.sendMail(mailOptions);
        console.log('邮件发送成功');
        return true;
    } catch (error) {
        console.error('发送邮件失败:', error);
        return false;
    }
};

// 发送错误通知邮件
export const sendErrorNotification = async (error: string, context: string = '') => {
    const subject = '课程价格管理系统错误通知';
    const content = `
时间: ${new Date().toLocaleString('zh-CN')}
错误类型: ${context}
错误详情: ${error}

请及时检查系统状态。
    `;
    
    await sendEmail(subject, content);
};

// 发送Token更新失败通知
export const sendTokenUpdateFailNotification = async () => {
    const subject = '课程价格管理系统 - Token更新失败';
    const content = `
时间: ${new Date().toLocaleString('zh-CN')}
错误类型: Token更新失败
详情: 系统无法正常更新Token，可能导致API调用失败

请及时检查Token配置和网络连接。
    `;
    
    await sendEmail(subject, content);
};

// 发送测试邮件
export const sendTestEmail = async () => {
    const subject = '课程价格管理系统 - 测试邮件';
    const content = `
这是一封测试邮件，用于验证邮件配置是否正确。

时间: ${new Date().toLocaleString('zh-CN')}
系统状态: 正常运行
邮件功能: 配置成功

如果您收到这封邮件，说明邮件通知功能已正常工作。
    `;
    
    const result = await sendEmail(subject, content);
    if (result) {
        console.log('测试邮件发送成功');
    } else {
        console.log('测试邮件发送失败');
    }
    return result;
}; 