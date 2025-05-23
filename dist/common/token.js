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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TokenManager {
    constructor() {
        this.token = '';
        // 使用相对于项目根目录的路径
        const rootDir = path.resolve(__dirname, '../../');
        this.configPath = path.join(rootDir, 'src/config/token.json');
        this.authConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/config/auth.json'), 'utf-8'));
        this.loadToken();
    }
    static getInstance() {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }
    loadToken() {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            this.token = config.token;
        }
        catch (error) {
            console.error('加载 token 失败:', error);
        }
    }
    saveToken(token) {
        try {
            const config = {
                token,
                lastUpdate: new Date().toLocaleString('zh-CN')
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.token = token;
        }
        catch (error) {
            console.error('保存 token 失败:', error);
        }
    }
    async updateToken() {
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
            }
            else {
                console.error('Token 更新失败:', data);
            }
        }
        catch (error) {
            console.error('更新 token 时出错:', error);
        }
    }
    getToken() {
        return this.token;
    }
}
exports.TokenManager = TokenManager;
