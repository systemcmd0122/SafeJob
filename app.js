document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:8000';
    let charts = {};

    // サンプル求人データ
    const SAMPLE_JOBS = {
        safe: "都内オフィスでの一般事務のアルバイトです。時給1,200円、交通費支給。勤務時間は平日10時〜17時。書類整理やデータ入力が主な業務です。社会保険完備、研修制度あり。正社員登用制度もあります。",
        suspicious: "簡単作業で日給3万円保証！ノルマなし、即日払いOK。身分証のみで即採用。内容は当日説明します。LINE登録で詳細をお伝えします。学生・フリーター大歓迎！シフト自由！",
        dangerous: "夜のお客様と会話するだけの簡単なお仕事。時給5000円以上可能。容姿に自信のある方優遇。身バレ防止対策あり。ノンアダルト・ノンタッチ。即日勤務可能。出勤自由。"
    };

    // DOM要素の取得
    const elements = {
        form: document.getElementById('analysis-form'),
        textarea: document.getElementById('job-description'),
        analyzeBtn: document.getElementById('analyze-btn'),
        clearBtn: document.getElementById('clear-btn'),
        resultSection: document.getElementById('analysis-result'),
        errorMessage: document.getElementById('error-message'),
        tabButtons: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        sampleButtons: document.querySelectorAll('.sample-btn'),
        historyList: document.querySelector('.history-list'),
        historySort: document.getElementById('history-sort'),
        historyFilter: document.getElementById('history-filter')
    };

    // チャートの基本設定
    const chartConfig = {
        radar: {
            options: {
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 20
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.raw}%`;
                            }
                        }
                    }
                }
            }
        },
        bar: {
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                }
            }
        },
        doughnut: {
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.raw}%`;
                            }
                        }
                    }
                }
            }
        }
    };

    // イベントリスナーの設定
    elements.form.addEventListener('submit', handleSubmit);
    elements.clearBtn.addEventListener('click', clearForm);
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    elements.sampleButtons.forEach(button => {
        button.addEventListener('click', () => loadSampleJob(button.dataset.sample));
    });
    elements.historySort?.addEventListener('change', handleHistorySort);
    elements.historyFilter?.addEventListener('change', handleHistoryFilter);

    // フォーム送信ハンドラ
    async function handleSubmit(e) {
        e.preventDefault();
        const jobDescription = elements.textarea.value.trim();
        
        if (!jobDescription) {
            showError('求人内容を入力してください。');
            return;
        }

        try {
            elements.analyzeBtn.disabled = true;
            elements.analyzeBtn.textContent = '分析中...';
            hideError();

            const result = await analyzeJob(jobDescription);
            displayAnalysisResult(result);
            updateStatistics(await fetchPastAnalyses());
        } catch (error) {
            showError(`分析中にエラーが発生しました: ${error.message}`);
        } finally {
            elements.analyzeBtn.disabled = false;
            elements.analyzeBtn.textContent = '分析開始';
        }
    }

    // 求人分析API呼び出し
    async function analyzeJob(jobDescription) {
        const response = await fetch(`${API_URL}/api/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jobDescription }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '分析に失敗しました');
        }

        return await response.json();
    }

    // 分析結果の表示
    function displayAnalysisResult(result) {
        elements.resultSection.classList.remove('hidden');

        // 安全性ステータス
        const statusElement = elements.resultSection.querySelector('.safety-status');
        statusElement.className = `safety-status ${result.isSafe ? 'safe' : 'unsafe'}`;
        statusElement.innerHTML = `
            <span class="status-icon">${result.isSafe ? '✓' : '⚠'}</span>
            <span class="status-text">${result.isSafe ? '安全な正規バイト' : '危険な闇バイトの可能性'}</span>
        `;

        // レーダーチャートの更新
        updateSafetyRadarChart(result);

        // 危険シグナルチャートの更新
        updateRedFlagsChart(result);

        // リスク要因チャートの更新
        updateRiskFactorsChart(result);

        // 比較チャートの更新
        updateComparativeChart(result);

        // スコアの表示
        updateProgressBar('.safety-score', result.safetyScore);
        updateProgressBar('.confidence-score', result.confidenceLevel);

        // 危険シグナル
        const flagsList = elements.resultSection.querySelector('.flags-list');
        flagsList.innerHTML = Object.entries(result.redFlags)
            .map(([key, value]) => `
                <li class="${value ? 'detected' : 'safe'}">
                    ${value ? '⚠' : '✓'} ${formatFlagKey(key)}
                </li>
            `).join('');

        // 警告フラグ
        const warningsList = elements.resultSection.querySelector('.warnings-list');
        const warningsContainer = warningsList.parentElement;
        if (result.warningFlags.length > 0) {
            warningsList.innerHTML = result.warningFlags
                .map(warning => `<li>⚠ ${warning}</li>`)
                .join('');
            warningsContainer.style.display = 'block';
        } else {
            warningsContainer.style.display = 'none';
        }

        // 分析詳細
        const analysisText = elements.resultSection.querySelector('.analysis-text');
        analysisText.textContent = result.safetyAnalysis;

        // 推奨アクション
        const actionsList = elements.resultSection.querySelector('.actions-list');
        const actionsContainer = actionsList.parentElement;
        if (result.recommendedActions.length > 0) {
            actionsList.innerHTML = result.recommendedActions
                .map(action => `<li>→ ${action}</li>`)
                .join('');
            actionsContainer.style.display = 'block';
        } else {
            actionsContainer.style.display = 'none';
        }

        // 結果までスクロール
        elements.resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    // チャート更新関数
    function updateSafetyRadarChart(result) {
        const ctx = document.getElementById('safetyRadarChart');
        
        if (charts.radar) {
            charts.radar.destroy();
        }

        charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: [
                    '安全性',
                    '信頼性',
                    '透明性',
                    '合法性',
                    '適切性'
                ],
                datasets: [{
                    label: '求人分析スコア',
                    data: [
                        result.safetyScore,
                        result.confidenceLevel,
                        100 - (result.redFlags.lackOfCompanyInfo ? 100 : 0),
                        100 - (result.redFlags.illegalActivity ? 100 : 0),
                        100 - (result.redFlags.unclearJobDescription ? 100 : 0)
                    ],
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2
                }]
            },
            options: chartConfig.radar.options
        });
    }

    function updateRedFlagsChart(result) {
        const ctx = document.getElementById('redFlagsChart');
        
        if (charts.redFlags) {
            charts.redFlags.destroy();
        }

        const redFlagsData = Object.entries(result.redFlags)
            .map(([key, value]) => ({
                label: formatFlagKey(key),
                value: value ? 100 : 0
            }));

        charts.redFlags = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: redFlagsData.map(d => d.label),
                datasets: [{
                    label: '危険度',
                    data: redFlagsData.map(d => d.value),
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: chartConfig.bar.options
        });
    }

    function updateRiskFactorsChart(result) {
        const ctx = document.getElementById('riskFactorsChart');
        
        if (charts.riskFactors) {
            charts.riskFactors.destroy();
        }

        const riskLevel = calculateRiskLevel(result);
        charts.riskFactors = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['安全', '要注意', '危険'],
                datasets: [{
                    data: [
                        riskLevel.safe,
                        riskLevel.warning,
                        riskLevel.dangerous
                    ],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(255, 99, 132, 0.6)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: chartConfig.doughnut.options
        });
    }

    function updateComparativeChart(result) {
        const ctx = document.getElementById('comparativeChart');
        
        if (charts.comparative) {
            charts.comparative.destroy();
        }

        // サンプルの比較データ
        const compareData = {
            current: result.safetyScore,
            industry: 85,
            similar: 75,
            risky: 30
        };

        charts.comparative = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['現在の求人', '業界平均', '類似求人平均', '危険求人平均'],
                datasets: [{
                    label: '安全性スコア比較',
                    data: Object.values(compareData),
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.6)',
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(255, 99, 132, 0.6)'
                    ],
                    borderColor: [
                        'rgba(54, 162, 235, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: chartConfig.bar.options
        });
    }

    // プログレスバーの更新
    function updateProgressBar(selector, value) {
        const progressFill = elements.resultSection.querySelector(selector);
        const progressText = progressFill.parentElement.querySelector('.progress-text');
        
        let color;
        if (value >= 80) color = '#4CAF50';
        else if (value >= 60) color = '#8BC34A';
        else if (value >= 40) color = '#FFC107';
        else if (value >= 20) color = '#FF9800';
        else color = '#F44336';

        progressFill.style.width = `${value}%`;
        progressFill.style.backgroundColor = color;
        progressText.textContent = `${value}%`;
    }

    // 過去の分析結果の管理
    async function fetchPastAnalyses() {
        try {
            const response = await fetch(`${API_URL}/api/past-analyses`);
            if (!response.ok) throw new Error('過去の分析結果の取得に失敗しました');
            return await response.json();
        } catch (error) {
            console.error('Error fetching past analyses:', error);
            return [];
        }
    }

    async function handleHistorySort() {
        const analyses = await fetchPastAnalyses();
        const sortValue = elements.historySort.value;
        const filterValue = elements.historyFilter.value;
        
        displayFilteredAndSortedHistory(analyses, sortValue, filterValue);
    }

    async function handleHistoryFilter() {
        const analyses = await fetchPastAnalyses();
        const sortValue = elements.historySort.value;
        const filterValue = elements.historyFilter.value;
        
        displayFilteredAndSortedHistory(analyses, sortValue, filterValue);
    }

    function displayFilteredAndSortedHistory(analyses, sortValue, filterValue) {
        let filteredAnalyses = analyses;

        // フィルタリング
        if (filterValue !== 'all') {
            filteredAnalyses = analyses.filter(analysis => {
                const isSafe = analysis.analysisResult.isSafe;
                return filterValue === 'safe' ? isSafe : !isSafe;
            });
        }

        // ソート
        filteredAnalyses.sort((a, b) => {
            switch (sortValue) {
                case 'date-desc':
                    return new Date(b.timestamp) - new Date(a.timestamp);
                case 'date-asc':
                    return new Date(a.timestamp) - new Date(b.timestamp);
                case 'score-desc':
                    return b.analysisResult.safetyScore - a.analysisResult.safetyScore;
                case 'score-asc':
                    return a.analysisResult.safetyScore - b.analysisResult.safetyScore;
                default:
                    return 0;
            }
        });

        displayHistoryList(filteredAnalyses);
    }

    function displayHistoryList(analyses) {
        elements.historyList.innerHTML = analyses.length ? analyses
            .map(analysis => createHistoryItem(analysis))
            .join('') : '<p>表示する分析結果がありません。</p>';
    }

    // createHistoryItem関数を以下のように変更
function createHistoryItem(analysis) {
    const date = new Date(analysis.timestamp).toLocaleString('ja-JP');
    const result = analysis.analysisResult;
    
    return `
        <div class="history-item">
            <div class="history-header">
                <div class="history-date">${date}</div>
                <button class="toggle-details-btn" onclick="toggleDetails(this)">
                    詳細を表示
                </button>
            </div>
            <div class="history-job">
                <strong>求人内容:</strong>
                <p>${analysis.jobDescription}</p>
            </div>
            <div class="history-result ${result.isSafe ? 'safe' : 'unsafe'}">
                <span class="status-icon">
                    ${result.isSafe ? '✓' : '⚠'}
                </span>
                <span class="status-text">
                    ${result.isSafe ? '安全な正規バイト' : '危険な闇バイトの可能性'}
                </span>
                <div class="history-score">
                    安全性スコア: ${result.safetyScore}%
                </div>
            </div>
            <div class="history-details" style="display: none;">
                <div class="details-grid">
                    <div class="details-section">
                        <h4>安全性スコア詳細</h4>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${result.safetyScore}%; 
                                 background-color: ${getScoreColor(result.safetyScore)}">
                            </div>
                            <span class="progress-text">${result.safetyScore}%</span>
                        </div>
                        <div class="progress-bar confidence-bar">
                            <div class="progress-fill" style="width: ${result.confidenceLevel}%; 
                                 background-color: ${getScoreColor(result.confidenceLevel)}">
                            </div>
                            <span class="progress-text">${result.confidenceLevel}%</span>
                        </div>
                        <p>分析確信度: ${result.confidenceLevel}%</p>
                    </div>
                    
                    <div class="details-section">
                        <h4>検出された危険シグナル</h4>
                        <ul class="details-flags-list">
                            ${Object.entries(result.redFlags)
                                .map(([key, value]) => `
                                    <li class="${value ? 'detected' : 'safe'}">
                                        ${value ? '⚠' : '✓'} ${formatFlagKey(key)}
                                    </li>
                                `).join('')}
                        </ul>
                    </div>

                    ${result.warningFlags.length > 0 ? `
                        <div class="details-section">
                            <h4>警告フラグ</h4>
                            <ul class="details-warnings-list">
                                ${result.warningFlags.map(warning => `
                                    <li>⚠ ${warning}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    <div class="details-section">
                        <h4>分析詳細</h4>
                        <p class="details-analysis-text">${result.safetyAnalysis}</p>
                    </div>

                    ${result.recommendedActions.length > 0 ? `
                        <div class="details-section">
                            <h4>推奨される行動</h4>
                            <ul class="details-actions-list">
                                ${result.recommendedActions.map(action => `
                                    <li>→ ${action}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${result.alternativeJobSuggestions.length > 0 ? `
                        <div class="details-section">
                            <h4>代替求人の提案</h4>
                            <ul class="details-suggestions-list">
                                ${result.alternativeJobSuggestions.map(suggestion => `
                                    <li>• ${suggestion}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// 詳細の表示/非表示を切り替える関数
window.toggleDetails = function(button) {
    const detailsSection = button.closest('.history-item').querySelector('.history-details');
    const isHidden = detailsSection.style.display === 'none';
    
    detailsSection.style.display = isHidden ? 'block' : 'none';
    button.textContent = isHidden ? '詳細を隠す' : '詳細を表示';
    
    if (isHidden) {
        detailsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

    // 分析詳細モーダル
    window.showAnalysisDetails = function(result) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h3>分析結果の詳細</h3>
                <div class="safety-status ${result.isSafe ? 'safe' : 'unsafe'}">
                    ${result.isSafe ? '✓ 安全な正規バイト' : '⚠ 危険な闇バイトの可能性'}
                </div>
                <div class="modal-scores">
                    <div class="score-item">
                        <h4>安全性スコア: ${result.safetyScore}%</h4>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${result.safetyScore}%; 
                                 background-color: ${getScoreColor(result.safetyScore)}"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-flags">
                    <h4>検出された危険シグナル</h4>
                    <ul>
                        ${Object.entries(result.redFlags)
                            .filter(([_, value]) => value)
                            .map(([key]) => `<li>⚠ ${formatFlagKey(key)}</li>`)
                            .join('')}
                    </ul>
                </div>
                <div class="modal-analysis">
                    <h4>分析詳細</h4>
                    <p>${result.safetyAnalysis}</p>
                </div>
                ${result.recommendedActions.length > 0 ? `
                    <div class="modal-actions">
                        <h4>推奨される行動</h4>
                        <ul>
                            ${result.recommendedActions.map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => modal.remove();

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    };

    // 統計情報の更新
async function updateStatistics(data) {
    if (!data || !Array.isArray(data)) {
        console.warn('統計データが利用できません');
        return;
    }

    try {
        updateSafetyDistributionChart(data);
        updateRedFlagsFrequencyChart(data);
        updateMonthlyAnalysisChart(data);
        updateRiskDistributionChart(data);
    } catch (error) {
        console.error('統計の更新中にエラーが発生しました:', error);
    }
}

// 安全性分布チャートの更新
function updateSafetyDistributionChart(data) {
    const ctx = document.getElementById('safetyDistributionChart');
    if (!ctx) return;
    
    if (charts.safetyDistribution) {
        charts.safetyDistribution.destroy();
    }

    const distribution = calculateScoreDistribution(data);

    charts.safetyDistribution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
            datasets: [{
                label: '安全性スコア分布',
                data: distribution,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '安全性スコアの分布'
                }
            }
        }
    });
}

// 危険シグナル頻度チャートの更新
function updateRedFlagsFrequencyChart(data) {
    const ctx = document.getElementById('redFlagsFrequencyChart');
    if (!ctx) return;
    
    if (charts.redFlagsFrequency) {
        charts.redFlagsFrequency.destroy();
    }

    const flagCounts = calculateRedFlagFrequency(data);
    const labels = Object.keys(flagCounts).map(formatFlagKey);
    const values = Object.values(flagCounts);

    charts.redFlagsFrequency = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                title: {
                    display: true,
                    text: '危険シグナルの検出頻度'
                }
            }
        }
    });
}

// 月別分析チャートの更新
function updateMonthlyAnalysisChart(data) {
    const ctx = document.getElementById('monthlyAnalysisChart');
    if (!ctx) return;
    
    if (charts.monthlyAnalysis) {
        charts.monthlyAnalysis.destroy();
    }

    const monthlyData = calculateMonthlyAnalysis(data);

    charts.monthlyAnalysis = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: '分析件数',
                data: monthlyData.counts,
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '月別分析件数'
                }
            }
        }
    });
}

// リスク分布チャートの更新
function updateRiskDistributionChart(data) {
    const ctx = document.getElementById('riskDistributionChart');
    if (!ctx) return;
    
    if (charts.riskDistribution) {
        charts.riskDistribution.destroy();
    }

    const riskData = calculateRiskDistribution(data);

    charts.riskDistribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['安全', '要注意', '危険'],
            datasets: [{
                data: [riskData.safe, riskData.warning, riskData.dangerous],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(255, 99, 132, 0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'リスクレベル分布'
                }
            }
        }
    });
}

// スコア分布の計算
function calculateScoreDistribution(data) {
    const distribution = [0, 0, 0, 0, 0];
    data.forEach(item => {
        const score = item.analysisResult.safetyScore;
        const index = Math.min(Math.floor(score / 20), 4);
        distribution[index]++;
    });
    return distribution;
}

// 危険フラグ頻度の計算
function calculateRedFlagFrequency(data) {
    const counts = {
        unrealisticPay: 0,
        lackOfCompanyInfo: 0,
        requestForPersonalInfo: 0,
        unclearJobDescription: 0,
        illegalActivity: 0
    };

    data.forEach(item => {
        const flags = item.analysisResult.redFlags;
        for (const flag in flags) {
            if (flags[flag]) {
                counts[flag]++;
            }
        }
    });

    return counts;
}

// 月別分析データの計算
function calculateMonthlyAnalysis(data) {
    const months = {};
    data.forEach(item => {
        const date = new Date(item.timestamp);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months[key] = (months[key] || 0) + 1;
    });

    const sortedMonths = Object.keys(months).sort();
    return {
        labels: sortedMonths.map(m => {
            const [year, month] = m.split('-');
            return `${year}年${month}月`;
        }),
        counts: sortedMonths.map(month => months[month])
    };
}

// リスク分布の計算
function calculateRiskDistribution(data) {
    return data.reduce((acc, item) => {
        const score = item.analysisResult.safetyScore;
        if (score >= 80) acc.safe++;
        else if (score >= 40) acc.warning++;
        else acc.dangerous++;
        return acc;
    }, { safe: 0, warning: 0, dangerous: 0 });
}

    // ユーティリティ関数
    function formatFlagKey(key) {
        const translations = {
            unrealisticPay: '非現実的な高額報酬',
            lackOfCompanyInfo: '会社情報の欠如',
            requestForPersonalInfo: '個人情報の不審な要求',
            unclearJobDescription: '曖昧な仕事内容',
            illegalActivity: '違法行為の示唆'
        };
        return translations[key] || key;
    }

    function calculateRiskLevel(result) {
        return {
            safe: result.safetyScore,
            warning: 100 - result.safetyScore - (result.redFlags.illegalActivity ? 30 : 0),
            dangerous: result.redFlags.illegalActivity ? 30 : 0
        };
    }

    function getScoreColor(score) {
        if (score >= 80) return '#4CAF50';
        if (score >= 60) return '#8BC34A';
        if (score >= 40) return '#FFC107';
        if (score >= 20) return '#FF9800';
        return '#F44336';
    }

    // エラー管理
    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.classList.remove('hidden');
    }

    function hideError() {
        elements.errorMessage.classList.add('hidden');
        elements.errorMessage.textContent = '';
    }

    // フォーム管理
    function clearForm() {
        elements.textarea.value = '';
        elements.resultSection.classList.add('hidden');
        hideError();
    }

    function loadSampleJob(sampleType) {
        elements.textarea.value = SAMPLE_JOBS[sampleType];
    }

    // タブ管理
    function switchTab(tabId) {
        elements.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        if (tabId === 'history') {
            loadPastAnalyses();
        }
    }

    // 初期化
    async function initialize() {
        try {
            const analyses = await fetchPastAnalyses();
            if (analyses.length > 0) {
                displayFilteredAndSortedHistory(analyses, 'date-desc', 'all');
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    // アプリケーションの初期化
    initialize();
});