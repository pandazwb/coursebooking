import * as fs from 'fs';
import * as path from 'path';

interface TokenConfig {
    token: string;
    lastUpdate: string;
}

export class TokenManager {
    private static instance: TokenManager;
    private configPath: string;
    private token: string = '';
    private authConfig: any;

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
        
        this.authConfig = JSON.parse(fs.readFileSync(authConfigPath, 'utf-8'));
        this.loadToken();
    }

    public static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    private loadToken() {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as TokenConfig;
            this.token = config.token;
        } catch (error) {
            console.error('加载 token 失败:', error);
        }
    }

    private saveToken(token: string) {
        try {
            const config: TokenConfig = {
                token,
                lastUpdate: new Date().toLocaleString('zh-CN')
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.token = token;
        } catch (error) {
            console.error('保存 token 失败:', error);
        }
    }

    public async updateToken() {
        try {
            console.log('开始更新token...');

            const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/login.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    "LoginName": this.authConfig.loginName,
                    "Pwd": this.authConfig.password,
                    "StoresCode": this.authConfig.storesCode
                })
            });

            const data = await response.json();
            
            if (data.orsuccess === '1' && data.token) {
                this.saveToken(data.token);
                console.log('Token 更新成功');
            } else {
                console.error('Token 更新失败:', data.Msg || '未知错误');
            }
        } catch (error) {
            console.error('更新 token 时出错:', error);
        }
    }

    public getToken(): string {
        return this.token;
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