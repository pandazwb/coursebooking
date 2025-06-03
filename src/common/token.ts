import * as fs from 'fs';
import * as path from 'path';

interface TokenConfig {
    token: string;
    lastUpdate: string;
    expiresAt?: string; // 添加过期时间字段
}

export class TokenManager {
    private static instance: TokenManager;
    private configPath: string;
    private token: string = '';
    private authConfig: any;
    private updateInProgress: boolean = false; // 防止并发更新

    private constructor() {
        // 检测当前运行环境，如果是编译后的代码则使用dist目录
        const isCompiledCode = __filename.includes('dist');
        const rootDir = isCompiledCode 
            ? path.resolve(__dirname, '../../')  // 从dist/common到项目根目录
            : path.resolve(__dirname, '../../'); // 从src/common到项目根目录
        
        const configDir = isCompiledCode ? 'dist/config' : 'src/config';
        
        this.configPath = path.join(rootDir, configDir, 'token.json');
        const authConfigPath = path.join(rootDir, configDir, 'auth.json');
        
        console.log('Token配置文件路径:', this.configPath);
        console.log('Auth配置文件路径:', authConfigPath);
        
        try {
            this.authConfig = JSON.parse(fs.readFileSync(authConfigPath, 'utf-8'));
            this.loadToken();
        } catch (error) {
            console.error('初始化TokenManager失败:', error);
        }
    }

    public static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    private loadToken() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as TokenConfig;
                this.token = config.token;
                console.log('Token加载成功，最后更新时间:', config.lastUpdate);
            } else {
                console.log('Token配置文件不存在，将创建新的');
            }
        } catch (error) {
            console.error('加载 token 失败:', error);
            this.token = '';
        }
    }

    private saveToken(token: string) {
        try {
            // 解析JWT获取过期时间
            let expiresAt = '';
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                if (payload.exp) {
                    expiresAt = new Date(payload.exp * 1000).toLocaleString('zh-CN');
                }
            } catch (e) {
                console.warn('无法解析Token过期时间:', e);
            }

            const config: TokenConfig = {
                token,
                lastUpdate: new Date().toLocaleString('zh-CN'),
                expiresAt
            };

            // 确保目录存在
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.token = token;
            console.log('Token保存成功，过期时间:', expiresAt);
        } catch (error) {
            console.error('保存 token 失败:', error);
            throw error;
        }
    }

    // 检查Token是否即将过期（提前1小时检查）
    private isTokenExpiringSoon(): boolean {
        try {
            if (!this.token) return true;
            
            const payload = JSON.parse(Buffer.from(this.token.split('.')[1], 'base64').toString());
            if (!payload.exp) return true;
            
            const expirationTime = payload.exp * 1000;
            const currentTime = Date.now();
            const oneHourInMs = 60 * 60 * 1000;
            
            return (expirationTime - currentTime) < oneHourInMs;
        } catch (error) {
            console.error('检查Token过期时间失败:', error);
            return true;
        }
    }

    public async updateToken(retryCount: number = 3): Promise<boolean> {
        if (this.updateInProgress) {
            console.log('Token更新正在进行中，等待完成...');
            // 等待当前更新完成，而不是直接跳过
            while (this.updateInProgress) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // 检查更新是否成功
            return !this.isTokenExpiringSoon();
        }

        this.updateInProgress = true;
        
        try {
            console.log(`开始更新token... (剩余重试次数: ${retryCount})`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/login.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    "LoginName": this.authConfig.loginName,
                    "Pwd": this.authConfig.password,
                    "StoresCode": this.authConfig.storesCode
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.orsuccess === '1' && data.token) {
                this.saveToken(data.token);
                console.log('✅ Token 更新成功');
                return true;
            } else {
                const errorMsg = data.Msg || '未知错误';
                console.error('❌ Token 更新失败:', errorMsg);
                
                // 如果是认证失败，不重试
                if (errorMsg.includes('密码') || errorMsg.includes('用户名') || errorMsg.includes('认证')) {
                    console.error('认证信息错误，停止重试');
                    return false;
                }
                
                // 其他错误进行重试
                if (retryCount > 0) {
                    console.log(`等待5秒后重试... (剩余重试次数: ${retryCount - 1})`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    return await this.updateToken(retryCount - 1);
                }
                
                return false;
            }
        } catch (error) {
            console.error('更新 token 时出错:', error);
            
            if (retryCount > 0) {
                console.log(`网络错误，等待10秒后重试... (剩余重试次数: ${retryCount - 1})`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return await this.updateToken(retryCount - 1);
            }
            
            return false;
        } finally {
            this.updateInProgress = false;
        }
    }

    public getToken(): string {
        // 移除自动更新逻辑，避免竞态条件
        // 改为只在定时任务和手动调用时更新
        return this.token;
    }

    // 添加一个检查是否需要更新的方法
    public needsUpdate(): boolean {
        return this.isTokenExpiringSoon();
    }

    // 检查Token有效性
    public async validateToken(): Promise<boolean> {
        if (!this.token) {
            console.log('Token为空，需要更新');
            return false;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListRowClassNew.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    "StoresID": "1517",
                    "isweek": "0",
                    "dateTime": "",
                    "RowClassType": "0",
                    "ClassTeacher": "",
                    "CourseID": "",
                    "SelectClass": "1",
                    "ClassID": "",
                    "RowType": 0,
                    "token": this.token
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();
            
            if (data.orsuccess === '-99' || data.orsuccess === -99) {
                console.log('Token验证失败，需要更新');
                return false;
            }
            
            console.log('Token验证成功');
            return true;
        } catch (error) {
            console.error('Token验证出错:', error);
            return false;
        }
    }

    public reloadConfig() {
        try {
            const isCompiledCode = __filename.includes('dist');
            const rootDir = isCompiledCode 
                ? path.resolve(__dirname, '../../')
                : path.resolve(__dirname, '../../');
            
            const configDir = isCompiledCode ? 'dist/config' : 'src/config';
            const authConfigPath = path.join(rootDir, configDir, 'auth.json');
            
            this.authConfig = JSON.parse(fs.readFileSync(authConfigPath, 'utf-8'));
            console.log('配置重载成功');
        } catch (error) {
            console.error('配置重载失败:', error);
        }
    }
} 