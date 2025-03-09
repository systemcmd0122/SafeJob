// job-safety-analyzer.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Gemini APIのAPIキーを設定
// 実際に使用する場合は環境変数などから安全に読み込むことをお勧めします
const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyCuspouVwXN6VKZK6U_ppWfkCdoT8YLJns";

// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(API_KEY);

// gemini-2.0-flashモデルを使用
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// 闇バイト検出のためのプロンプト
async function analyzeJobSafety(jobDescription) {
  const prompt = `
あなたは闇バイト（違法・犯罪に関連するアルバイト）を検出する専門家です。
以下の求人情報が安全な正規のアルバイトか、危険な闇バイトかを詳細に分析してください。

求人情報:
"""
${jobDescription}
"""

以下の形式でJSON形式で回答してください。全ての項目を省略せず含めてください:
{
  "isSafe": boolean, // 安全なら true、危険な闇バイトなら false
  "safetyScore": number, // 0-100のスコア（数値が高いほど安全）
  "warningFlags": [string], // 危険フラグのリスト（あれば記載、なければ空配列）
  "reasonsForConcern": [string], // 懸念点の詳細リスト（あれば記載、なければ空配列）
  "legalIssues": [string], // 法的問題点のリスト（あれば記載、なければ空配列）
  "redFlags": { // 特定の危険シグナルの検出結果
    "unrealisticPay": boolean, // 非現実的な高額報酬
    "lackOfCompanyInfo": boolean, // 会社情報の欠如
    "requestForPersonalInfo": boolean, // 個人情報の要求
    "unclearJobDescription": boolean, // 曖昧な仕事内容
    "illegalActivity": boolean // 違法行為の示唆
  },
  "safetyAnalysis": string, // 分析の詳細説明
  "recommendedActions": [string], // 推奨される行動（応募検討者向け）
  "alternativeJobSuggestions": [string], // 代替の安全な仕事の提案
  "confidenceLevel": number // 分析の確信度（0-100）
}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // JSON部分を抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                    text.match(/{[\s\S]*}/);
    
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[0].replace(/```json|```/g, '').trim());
        
        // データの検証と補完
        validateAndCompleteData(jsonData);
        
        // 分析ログを保存
        saveAnalysisLog(jobDescription, jsonData);
        
        return jsonData;
      } catch (e) {
        console.error('JSONの解析に失敗しました:', e);
        return { 
          error: '結果の解析に失敗しました',
          originalError: e.message,
          rawResponse: text 
        };
      }
    } else {
      console.error('JSONフォーマットが見つかりませんでした');
      return { 
        error: '期待されたJSONフォーマットが見つかりませんでした',
        rawResponse: text 
      };
    }
  } catch (error) {
    console.error('Gemini APIへのリクエスト中にエラーが発生しました:', error);
    return { 
      error: 'APIリクエストエラー: ' + error.message,
      details: error.details || 'No additional details available'
    };
  }
}

// JSONデータを検証し、不足しているフィールドを補完する
function validateAndCompleteData(data) {
  if (data.isSafe === undefined) data.isSafe = false;
  if (data.safetyScore === undefined) data.safetyScore = 0;
  if (!data.warningFlags) data.warningFlags = [];
  if (!data.reasonsForConcern) data.reasonsForConcern = [];
  if (!data.legalIssues) data.legalIssues = [];
  if (!data.redFlags) {
    data.redFlags = {
      unrealisticPay: false,
      lackOfCompanyInfo: false,
      requestForPersonalInfo: false,
      unclearJobDescription: false,
      illegalActivity: false
    };
  }
  if (!data.recommendedActions) data.recommendedActions = [];
  if (!data.alternativeJobSuggestions) data.alternativeJobSuggestions = [];
  if (data.confidenceLevel === undefined) data.confidenceLevel = 50;
  
  // safetyScoreとconfidenceLevelの値を0-100の範囲に正規化
  data.safetyScore = Math.max(0, Math.min(100, data.safetyScore));
  data.confidenceLevel = Math.max(0, Math.min(100, data.confidenceLevel));
}

// 分析結果をログファイルに保存
function saveAnalysisLog(jobDescription, result) {
  try {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `analysis-${timestamp}.json`);
    
    const logData = {
      timestamp: new Date().toISOString(),
      jobDescription,
      analysisResult: result
    };
    
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2), 'utf8');
    console.log(`分析ログを保存しました: ${logFile}`);
  } catch (err) {
    console.error('ログの保存に失敗しました:', err);
  }
}

// 結果を表示する関数
function displayResults(result) {
  console.log('\n==================== 求人安全性分析結果 ====================\n');
  
  if (result.error) {
    console.log(`エラー: ${result.error}`);
    if (result.originalError) {
      console.log(`詳細エラー: ${result.originalError}`);
    }
    if (result.rawResponse) {
      console.log('\n生のレスポンス:');
      console.log(result.rawResponse.substring(0, 500) + '...');
    }
    return;
  }
  
  // 安全性スコアに基づいて色とアイコンを設定
  let safetyColor, safetyText, safetyIcon;
  if (result.isSafe) {
    safetyColor = '\x1b[32m'; // 緑
    safetyText = '安全な正規バイト';
    safetyIcon = '✓';
  } else {
    safetyColor = '\x1b[31m'; // 赤
    safetyText = '危険な闇バイトの可能性';
    safetyIcon = '⚠';
  }
  
  // リセット用コード
  const reset = '\x1b[0m';
  const yellowBold = '\x1b[33;1m';
  const cyan = '\x1b[36m';
  
  console.log(`${safetyColor}${safetyIcon} 総合判定: ${safetyText}${reset}`);
  
  // 安全性スコアのビジュアル表示
  const safetyScoreColor = getColorForScore(result.safetyScore);
  console.log(`\n${yellowBold}安全性スコア:${reset} ${safetyScoreColor}${result.safetyScore}/100${reset}`);
  displayProgressBar(result.safetyScore, 50);
  
  // 分析確信度のビジュアル表示
  console.log(`\n${yellowBold}分析確信度:${reset} ${getColorForConfidence(result.confidenceLevel)}${result.confidenceLevel}/100${reset}`);
  displayProgressBar(result.confidenceLevel, 50);
  
  // 赤旗警告の詳細表示
  console.log(`\n${yellowBold}危険シグナル検出:${reset}`);
  displayRedFlags(result.redFlags);
  
  // 警告フラグ
  if (result.warningFlags && result.warningFlags.length > 0) {
    console.log(`\n${yellowBold}警告フラグ:${reset}`);
    result.warningFlags.forEach(flag => {
      console.log(`\x1b[33m• ${flag}${reset}`);
    });
  } else {
    console.log(`\n${yellowBold}警告フラグ:${reset} なし`);
  }
  
  // 懸念点
  if (result.reasonsForConcern && result.reasonsForConcern.length > 0) {
    console.log(`\n${yellowBold}懸念点:${reset}`);
    result.reasonsForConcern.forEach(reason => {
      console.log(`\x1b[33m• ${reason}${reset}`);
    });
  } else {
    console.log(`\n${yellowBold}懸念点:${reset} なし`);
  }
  
  // 法的問題点
  if (result.legalIssues && result.legalIssues.length > 0) {
    console.log(`\n${yellowBold}法的問題点:${reset}`);
    result.legalIssues.forEach(issue => {
      console.log(`\x1b[31m• ${issue}${reset}`);
    });
  } else {
    console.log(`\n${yellowBold}法的問題点:${reset} なし`);
  }
  
  // 分析詳細
  console.log(`\n${yellowBold}分析詳細:${reset}`);
  console.log(result.safetyAnalysis);
  
  // 推奨行動
  if (result.recommendedActions && result.recommendedActions.length > 0) {
    console.log(`\n${yellowBold}推奨される行動:${reset}`);
    result.recommendedActions.forEach((action, index) => {
      console.log(`${cyan}${index + 1}. ${action}${reset}`);
    });
  }
  
  // 代替の職業提案
  if (result.alternativeJobSuggestions && result.alternativeJobSuggestions.length > 0) {
    console.log(`\n${yellowBold}代替の安全な職業提案:${reset}`);
    result.alternativeJobSuggestions.forEach((suggestion, index) => {
      console.log(`${cyan}${index + 1}. ${suggestion}${reset}`);
    });
  }
  
  console.log('\n============================================================\n');
}

// スコアに応じた色コードを返す
function getColorForScore(score) {
  if (score >= 80) return '\x1b[32m'; // 緑
  if (score >= 60) return '\x1b[32;2m'; // 暗い緑
  if (score >= 40) return '\x1b[33m'; // 黄
  if (score >= 20) return '\x1b[33;2m'; // 暗い黄
  return '\x1b[31m'; // 赤
}

// 確信度に応じた色コードを返す
function getColorForConfidence(level) {
  if (level >= 80) return '\x1b[34m'; // 青
  if (level >= 50) return '\x1b[36m'; // シアン
  return '\x1b[35m'; // マゼンタ
}

// プログレスバーを表示する関数
function displayProgressBar(value, length = 20) {
  const fullBlocks = Math.floor(value / 100 * length);
  const emptyBlocks = length - fullBlocks;
  
  let color;
  if (value >= 80) color = '\x1b[32m'; // 緑
  else if (value >= 60) color = '\x1b[32;2m'; // 暗い緑
  else if (value >= 40) color = '\x1b[33m'; // 黄
  else if (value >= 20) color = '\x1b[33;2m'; // 暗い黄
  else color = '\x1b[31m'; // 赤
  
  const reset = '\x1b[0m';
  const bar = `${color}${'█'.repeat(fullBlocks)}${reset}${'░'.repeat(emptyBlocks)}`;
  console.log(`[${bar}] ${value}%`);
}

// 赤旗警告を表示する関数
function displayRedFlags(redFlags) {
  const reset = '\x1b[0m';
  const red = '\x1b[31m';
  const green = '\x1b[32m';
  
  const flags = [
    { key: 'unrealisticPay', label: '非現実的な高額報酬' },
    { key: 'lackOfCompanyInfo', label: '会社情報の欠如' },
    { key: 'requestForPersonalInfo', label: '個人情報の不審な要求' },
    { key: 'unclearJobDescription', label: '曖昧な仕事内容' },
    { key: 'illegalActivity', label: '違法行為の示唆' }
  ];
  
  const maxLabelLength = Math.max(...flags.map(f => f.label.length));
  
  flags.forEach(flag => {
    const value = redFlags[flag.key];
    const status = value ? `${red}検出 [!]` : `${green}なし [✓]`;
    const paddedLabel = flag.label.padEnd(maxLabelLength, ' ');
    console.log(`  ${paddedLabel}: ${status}${reset}`);
  });
}

// 求人例のデータベース
const jobExamples = [
  {
    name: "安全な一般事務",
    description: "都内オフィスでの一般事務のアルバイトです。時給1,200円、交通費支給。勤務時間は平日10時〜17時。書類整理やデータ入力が主な業務です。株式会社〇〇（東京都渋谷区〇〇）での勤務となります。雇用保険完備。"
  },
  {
    name: "怪しい高額バイト",
    description: "簡単作業で日給3万円保証！ノルマなし、即日払いOK。身分証のみで即採用。内容は当日説明します。LINE登録で詳細をお伝えします。学生・フリーター大歓迎。"
  },
  {
    name: "闇営業系",
    description: "夜のお客様と会話するだけの簡単なお仕事。時給5000円以上可能。容姿に自信のある方優遇。身バレ防止対策あり。ノンアダルト・ノンコンタクトで安全です。"
  }
];

// インタラクティブなCLIを設定
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// メイン実行関数
async function main() {
  console.log('\x1b[1m======= 求人安全性分析ツール v2.0 =======\x1b[0m');
  console.log('闇バイトのリスクを検出するAI搭載ツール');
  console.log('求人内容を入力して詳細な安全性分析を実施します');
  
  await showMainMenu();
}

// メインメニューを表示
async function showMainMenu() {
  console.log('\n\x1b[36m==== メインメニュー ====\x1b[0m');
  console.log('1. 求人内容を入力して分析');
  console.log('2. サンプル求人から選択');
  console.log('3. 過去の分析結果を表示');
  console.log('4. 終了');
  
  rl.question('\n選択してください (1-4): ', async (choice) => {
    switch (choice) {
      case '1':
        await analyzeUserInput();
        break;
      case '2':
        await selectFromSamples();
        break;
      case '3':
        await showPastAnalyses();
        break;
      case '4':
        console.log('プログラムを終了します。');
        rl.close();
        return;
      default:
        console.log('無効な選択です。もう一度お試しください。');
        await showMainMenu();
        break;
    }
  });
}

// ユーザー入力を分析
async function analyzeUserInput() {
  rl.question('\n求人内容を入力してください:\n> ', async (input) => {
    if (input.trim() === '') {
      console.log('入力が空です。メインメニューに戻ります。');
      await showMainMenu();
      return;
    }
    
    console.log('\n分析中...\n');
    const result = await analyzeJobSafety(input);
    displayResults(result);
    
    // 分析結果後のオプション
    afterAnalysisOptions();
  });
}

// サンプルから選択
async function selectFromSamples() {
  console.log('\n\x1b[36m==== サンプル求人 ====\x1b[0m');
  jobExamples.forEach((job, index) => {
    console.log(`${index + 1}. ${job.name}`);
  });
  
  rl.question('\n選択してください (1-' + jobExamples.length + '): ', async (choice) => {
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < jobExamples.length) {
      const selectedJob = jobExamples[index];
      console.log(`\n選択された求人: ${selectedJob.name}`);
      console.log(`内容: ${selectedJob.description}`);
      console.log('\n分析中...\n');
      
      const result = await analyzeJobSafety(selectedJob.description);
      displayResults(result);
      
      // 分析結果後のオプション
      afterAnalysisOptions();
    } else {
      console.log('無効な選択です。メインメニューに戻ります。');
      await showMainMenu();
    }
  });
}

// 過去の分析結果を表示
async function showPastAnalyses() {
  const logDir = path.join(__dirname, 'logs');
  
  if (!fs.existsSync(logDir)) {
    console.log('過去の分析結果がありません。メインメニューに戻ります。');
    await showMainMenu();
    return;
  }
  
  try {
    const files = fs.readdirSync(logDir).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('過去の分析結果がありません。メインメニューに戻ります。');
      await showMainMenu();
      return;
    }
    
    console.log('\n\x1b[36m==== 過去の分析結果 ====\x1b[0m');
    files.forEach((file, index) => {
      const filePath = path.join(logDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const date = new Date(data.timestamp).toLocaleString();
      
      // 求人の一部を表示（最初の30文字）
      const jobPreview = data.jobDescription.length > 30 
        ? data.jobDescription.substring(0, 30) + '...' 
        : data.jobDescription;
      
      console.log(`${index + 1}. [${date}] ${jobPreview}`);
    });
    
    rl.question('\n表示する結果を選択してください (1-' + files.length + '), または 0 で戻る: ', (choice) => {
      const index = parseInt(choice) - 1;
      
      if (choice === '0') {
        showMainMenu();
        return;
      }
      
      if (index >= 0 && index < files.length) {
        const filePath = path.join(logDir, files[index]);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`\n求人内容: ${data.jobDescription}`);
        displayResults(data.analysisResult);
        
        // 分析結果後のオプション
        afterAnalysisOptions();
      } else {
        console.log('無効な選択です。メインメニューに戻ります。');
        showMainMenu();
      }
    });
  } catch (err) {
    console.error('過去の分析結果の取得中にエラーが発生しました:', err);
    console.log('メインメニューに戻ります。');
    await showMainMenu();
  }
}

// 分析結果後のオプション
function afterAnalysisOptions() {
  console.log('\n\x1b[36m==== 次のアクション ====\x1b[0m');
  console.log('1. 別の求人を分析');
  console.log('2. メインメニューに戻る');
  console.log('3. 終了');
  
  rl.question('選択してください (1-3): ', (choice) => {
    switch (choice) {
      case '1':
        analyzeUserInput();
        break;
      case '2':
        showMainMenu();
        break;
      case '3':
        console.log('プログラムを終了します。');
        rl.close();
        break;
      default:
        console.log('無効な選択です。メインメニューに戻ります。');
        showMainMenu();
        break;
    }
  });
}

// プログラム実行
main();