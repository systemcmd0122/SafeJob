const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Gemini APIの設定
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error('Gemini API key is not set in .env file');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ログディレクトリの作成
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// メインページのルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 求人分析API
app.post('/api/analyze', async (req, res) => {
    try {
        const { jobDescription } = req.body;
        
        if (!jobDescription) {
            return res.status(400).json({ error: '求人内容が必要です' });
        }

        const prompt = `
あなたは闇バイト（違法・犯罪に関連するアルバイト）を検出する専門家です。
以下の求人情報が安全な正規のアルバイトか、危険な闇バイトかを詳細に分析してください。

求人情報:
"""
${jobDescription}
"""

以下の形式でJSON形式で回答してください。全ての項目を省略せず含めてください:
{
    "isSafe": boolean,
    "safetyScore": number,
    "warningFlags": [string],
    "reasonsForConcern": [string],
    "legalIssues": [string],
    "redFlags": {
        "unrealisticPay": boolean,
        "lackOfCompanyInfo": boolean,
        "requestForPersonalInfo": boolean,
        "unclearJobDescription": boolean,
        "illegalActivity": boolean
    },
    "safetyAnalysis": string,
    "recommendedActions": [string],
    "alternativeJobSuggestions": [string],
    "confidenceLevel": number
}`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // JSON部分の抽出と解析
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/{[\s\S]*}/);
        
        if (!jsonMatch) {
            throw new Error('AIからの応答をJSONとして解析できませんでした');
        }

        const jsonData = JSON.parse(jsonMatch[0].replace(/```json|```/g, '').trim());
        
        // データの検証と補完
        validateAndCompleteData(jsonData);
        
        // 分析ログを保存
        saveAnalysisLog(jobDescription, jsonData);
        
        res.json(jsonData);
    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({
            error: 'Analysis failed',
            message: error.message
        });
    }
});

// 過去の分析結果を取得
app.get('/api/past-analyses', (req, res) => {
    try {
        if (!fs.existsSync(logDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(logDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(logDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return {
                    ...data,
                    filename: file
                };
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(files);
    } catch (error) {
        console.error('Error fetching past analyses:', error);
        res.status(500).json({ error: '過去の分析結果の取得に失敗しました' });
    }
});

// データ検証と補完関数
function validateAndCompleteData(data) {
    const defaultRedFlags = {
        unrealisticPay: false,
        lackOfCompanyInfo: false,
        requestForPersonalInfo: false,
        unclearJobDescription: false,
        illegalActivity: false
    };

    if (typeof data.isSafe !== 'boolean') data.isSafe = false;
    if (typeof data.safetyScore !== 'number') data.safetyScore = 0;
    if (!Array.isArray(data.warningFlags)) data.warningFlags = [];
    if (!Array.isArray(data.reasonsForConcern)) data.reasonsForConcern = [];
    if (!Array.isArray(data.legalIssues)) data.legalIssues = [];
    if (!data.redFlags || typeof data.redFlags !== 'object') data.redFlags = defaultRedFlags;
    if (!data.safetyAnalysis) data.safetyAnalysis = '';
    if (!Array.isArray(data.recommendedActions)) data.recommendedActions = [];
    if (!Array.isArray(data.alternativeJobSuggestions)) data.alternativeJobSuggestions = [];
    if (typeof data.confidenceLevel !== 'number') data.confidenceLevel = 50;

    // 値の範囲を正規化
    data.safetyScore = Math.max(0, Math.min(100, data.safetyScore));
    data.confidenceLevel = Math.max(0, Math.min(100, data.confidenceLevel));

    // redFlagsの各プロパティを確認
    for (const key in defaultRedFlags) {
        if (typeof data.redFlags[key] !== 'boolean') {
            data.redFlags[key] = defaultRedFlags[key];
        }
    }
}

// 分析ログを保存
function saveAnalysisLog(jobDescription, result) {
    try {
        const timestamp = new Date().toISOString();
        const filename = `analysis-${timestamp.replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(logDir, filename);
        
        const logData = {
            timestamp,
            jobDescription,
            analysisResult: result
        };

        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving analysis log:', error);
        return false;
    }
}

// サーバー起動
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});