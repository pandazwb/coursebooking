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
        // 使用相对于项目根目录的路径
        const rootDir = path.resolve(__dirname, '../../');
        this.configPath = path.join(rootDir, 'src/config/token.json');
        this.authConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/config/auth.json'), 'utf-8'));
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
            if (data.token) {
                this.saveToken(data.token);
                console.log('Token 更新成功');
            } else {
                console.error('Token 更新失败:', data);
            }
        } catch (error) {
            console.error('更新 token 时出错:', error);
        }
    }

    public getToken(): string {
        return this.token;
    }
} 