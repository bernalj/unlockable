// Import Firebase configuration and functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    query, 
    orderByChild, 
    get,
    limitToLast 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getGameStats } from '../../firebase-config.js';

const firebaseConfig = {
    apiKey: "AIzaSyCYlnJnOL938zx7jwqhDzyDLx1KPs7sU58",
    authDomain: "unlockable-80519.firebaseapp.com",
    databaseURL: "https://unlockable-80519-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "unlockable-80519",
    storageBucket: "unlockable-80519.firebasestorage.app",
    messagingSenderId: "1097134073503",
    appId: "1:1097134073503:web:25b79a17911e6e8976e4aa",
    measurementId: "G-H17HYTEYWB"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Chart instances
let patternChart = null;
let stageChart = null;
let timeChart = null;

// Add stage configurations
const stageConfigs = {
    1: { time: 10000, requiredPatterns: 5 },
    2: { time: 8000, requiredPatterns: 7 },
    3: { time: 6000, requiredPatterns: 10 },
    4: { time: 5000, requiredPatterns: 12 },
    5: { time: 4000, requiredPatterns: 15 }
};

// Initialize dashboard
async function initializeDashboard() {
    showLoading();
    try {
        const games = await fetchGameStats();
        if (!games || games.length === 0) {
            console.log('No valid game data found');
            updateOverviewStats([]);
            return;
        }
        updateOverviewStats(games);
        createCharts(games);
        updateRecentGames(games);
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading statistics', 'error');
    } finally {
        hideLoading();
    }
}

// Fetch game statistics based on time range
async function fetchGameStats(timeRange = '24h') {
    const games = await getGameStats();
    if (!games) return [];
    
    // Get selected stage filter
    const selectedStage = document.getElementById('stageFilter').value;
    
    console.log('Raw games data:', games);
    console.log('Selected stage:', selectedStage);
    
    // Filter games based on time range
    const now = Date.now();
    const timeRanges = {
        '24h': now - (24 * 60 * 60 * 1000),
        '7d': now - (7 * 24 * 60 * 60 * 1000),
        '30d': now - (30 * 24 * 60 * 60 * 1000),
        'all': 0
    };

    // Create a map to store complete game data
    const gameMap = new Map();

    // Process all entries in games
    Object.entries(games).forEach(([key, entry]) => {
        if (!entry || entry.timestamp <= timeRanges[timeRange]) return;

        // Check if this is a stage entry (key contains "_stage_")
        if (key.includes('_stage_')) {
            const [gameId, stage] = key.split('_stage_');
            
            // Skip if a specific stage is selected and this isn't it
            if (selectedStage !== 'all' && stage !== selectedStage) return;
            
            console.log(`Processing stage ${stage} for game ${gameId}`);
            
            // Initialize game data if not exists
            if (!gameMap.has(gameId)) {
                gameMap.set(gameId, {
                    id: gameId,
                    timestamp: entry.timestamp,
                    timingData: {
                        patterns: [],
                        stageData: {},
                        finalScore: 0,
                        finalStage: 0,
                        gameDuration: 0
                    }
                });
            }
            
            const gameData = gameMap.get(gameId);
            
            // Add stage data using the correct path from the raw data
            const stageData = entry.timingData.stageData;
            gameData.timingData.stageData[stage] = {
                patterns: stageData.patterns || [],
                attempts: stageData.attempts || 0,
                successes: stageData.successes || 0,
                totalTime: stageData.totalTime || 0,
                completed: stageData.completed || false
            };
            
            // Add patterns from this stage
            if (entry.timingData.patterns && entry.timingData.patterns.length > 0) {
                gameData.timingData.patterns.push(...entry.timingData.patterns);
            }
            
            // Update game stats
            gameData.timingData.finalScore = Math.max(
                gameData.timingData.finalScore, 
                entry.timingData.partialScore || 0
            );
            gameData.timingData.finalStage = Math.max(
                gameData.timingData.finalStage, 
                parseInt(stage)
            );
            gameData.timingData.gameDuration += stageData.totalTime || 0;
        }
    });

    // Convert Map to plain object for logging
    const gameMapObject = Object.fromEntries(gameMap);
    console.log('Processed game map:', JSON.stringify(gameMapObject, null, 2));

    // Filter out incomplete data
    const validGames = Array.from(gameMap.values()).filter(game => {
        const hasValidStageData = Object.values(game.timingData.stageData).some(stage => 
            stage.completed && stage.patterns && stage.patterns.length > 0
        );
        
        console.log('Validating game:', game.id, {
            hasTimingData: !!game.timingData,
            stageCount: Object.keys(game.timingData.stageData).length,
            hasValidStageData,
            totalPatterns: game.timingData.patterns.length,
            stageData: game.timingData.stageData
        });

        return game.timingData && hasValidStageData;
    });

    console.log('Valid games:', validGames);
    return validGames.sort((a, b) => b.timestamp - a.timestamp);
}

// Update overview statistics
function updateOverviewStats(games) {
    if (!games.length) {
        document.getElementById('totalGames').textContent = '0';
        document.getElementById('avgScore').textContent = '0';
        document.getElementById('successRate').textContent = '0%';
        document.getElementById('avgDuration').textContent = '0s';
        return;
    }

    const totalGames = games.length;
    const avgScore = games.reduce((acc, game) => acc + game.timingData.finalScore, 0) / totalGames;
    
    // Calculate total patterns and successes across all stages
    let totalPatterns = 0;
    let successfulPatterns = 0;
    let totalDuration = 0;

    games.forEach(game => {
        Object.values(game.timingData.stageData).forEach(stageData => {
            if (stageData.patterns) {
                totalPatterns += stageData.patterns.length;
                successfulPatterns += stageData.patterns.filter(p => p.success).length;
                totalDuration += stageData.totalTime || 0;
            }
        });
    });
    
    const successRate = totalPatterns > 0 ? (successfulPatterns / totalPatterns) * 100 : 0;
    const avgDuration = totalDuration / totalGames;

    document.getElementById('totalGames').textContent = totalGames;
    document.getElementById('avgScore').textContent = Math.round(avgScore);
    document.getElementById('successRate').textContent = `${successRate.toFixed(1)}%`;
    document.getElementById('avgDuration').textContent = `${(avgDuration / 1000).toFixed(1)}s`;
}

// Create and update charts
function createCharts(games) {
    createPatternAnalysisChart(games);
    createStageProgressionChart(games);
    createTimeDistributionChart(games);
}

function createPatternAnalysisChart(games) {
    const ctx = document.getElementById('patternAnalysis').getContext('2d');
    
    // Aggregate pattern data
    const patternStats = {};
    games.forEach(game => {
        game.timingData.patterns.forEach(pattern => {
            const key = pattern.pattern.join('-');
            if (!patternStats[key]) {
                patternStats[key] = {
                    attempts: 0,
                    successes: 0,
                    avgTime: 0,
                    totalTime: 0
                };
            }
            patternStats[key].attempts++;
            if (pattern.success) {
                patternStats[key].successes++;
                patternStats[key].totalTime += pattern.duration;
                patternStats[key].avgTime = patternStats[key].totalTime / patternStats[key].successes;
            }
        });
    });

    // Prepare chart data
    const labels = Object.keys(patternStats);
    const successRates = labels.map(key => 
        (patternStats[key].successes / patternStats[key].attempts) * 100
    );
    const avgTimes = labels.map(key => patternStats[key].avgTime);

    if (patternChart) patternChart.destroy();
    patternChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Success Rate (%)',
                data: successRates,
                backgroundColor: 'rgba(255, 215, 0, 0.5)',
                borderColor: 'rgba(255, 215, 0, 1)',
                borderWidth: 1,
                yAxisID: 'y'
            }, {
                label: 'Avg Time (ms)',
                data: avgTimes,
                type: 'line',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 2,
                fill: false,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Success Rate (%)'
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Time (ms)'
                    }
                }
            }
        }
    });
}

// Update recent games section
function updateRecentGames(games) {
    const container = document.getElementById('recentGames');
    container.innerHTML = '';

    games.slice(0, 6).forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.dataset.gameId = game.id || game.timestamp.toString();
        
        const successRate = calculateSuccessRate(game.timingData.patterns);
        
        card.innerHTML = `
            <h3>Game ${formatDate(game.timestamp)}</h3>
            <div class="game-card-stats">
                <div>Score: ${game.timingData.finalScore}</div>
                <div>Stage: ${game.timingData.finalStage}</div>
                <div>Success: ${successRate}%</div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Helper functions
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}

function calculateSuccessRate(patterns) {
    const successful = patterns.filter(p => p.success).length;
    return ((successful / patterns.length) * 100).toFixed(1);
}

function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Add event listener for time range changes
document.getElementById('timeRange').addEventListener('change', async (e) => {
    showLoading();
    const games = await fetchGameStats(e.target.value);
    updateOverviewStats(games);
    createCharts(games);
    updateRecentGames(games);
    hideLoading();
});

// Add event listener for refresh button
document.getElementById('refreshData').addEventListener('click', initializeDashboard);

// Data processing functions
function processGamesData(games) {
    return {
        totalGames: games.length,
        avgScore: calculateAverageScore(games),
        avgDuration: calculateAverageDuration(games),
        maxStage: calculateMaxStage(games),
        patternStats: calculatePatternStats(games),
        stageStats: calculateStageStats(games),
        timeStats: calculateTimeStats(games)
    };
}

function calculateAverageScore(games) {
    return games.reduce((acc, game) => acc + game.timingData.finalScore, 0) / games.length;
}

function calculateAverageDuration(games) {
    return games.reduce((acc, game) => acc + game.timingData.gameDuration, 0) / games.length;
}

function calculateMaxStage(games) {
    return Math.max(...games.map(game => game.timingData.finalStage));
}

function calculatePatternStats(games) {
    const patterns = games.flatMap(game => game.timingData.patterns);
    return {
        totalPatterns: patterns.length,
        successRate: (patterns.filter(p => p.success).length / patterns.length) * 100,
        avgComplexity: patterns.reduce((acc, p) => acc + p.complexity, 0) / patterns.length,
        timePerLength: calculateTimePerLength(patterns)
    };
}

function calculateTimePerLength(patterns) {
    const lengthGroups = {};
    patterns.forEach(pattern => {
        if (!lengthGroups[pattern.length]) {
            lengthGroups[pattern.length] = [];
        }
        lengthGroups[pattern.length].push(pattern.duration);
    });

    return Object.entries(lengthGroups).map(([length, times]) => ({
        length: parseInt(length),
        avgTime: times.reduce((a, b) => a + b, 0) / times.length
    }));
}

function calculateStageStats(games) {
    const stageData = {};
    games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageData[stage]) {
                stageData[stage] = {
                    attempts: 0,
                    successes: 0,
                    totalTime: 0,
                    remainingTime: []
                };
            }
            stageData[stage].attempts += data.attempts;
            stageData[stage].successes += data.successes;
            stageData[stage].totalTime += data.totalTime;
            if (data.patterns.length > 0) {
                stageData[stage].remainingTime.push(
                    data.patterns[data.patterns.length - 1].remainingTime
                );
            }
        });
    });
    return stageData;
}

function calculateTimeStats(games) {
    return {
        averageTimePerStage: calculateAverageTimePerStage(games),
        timeDistribution: calculateTimeDistribution(games)
    };
}

function calculateAverageTimePerStage(games) {
    const stageTimings = {};
    games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageTimings[stage]) {
                stageTimings[stage] = [];
            }
            stageTimings[stage].push(data.totalTime);
        });
    });

    return Object.entries(stageTimings).map(([stage, times]) => ({
        stage: parseInt(stage),
        avgTime: times.reduce((a, b) => a + b, 0) / times.length
    }));
}

function calculateTimeDistribution(games) {
    const patterns = games.flatMap(game => game.timingData.patterns);
    const timeRanges = {
        fast: 0,    // < 500ms
        medium: 0,  // 500ms - 1500ms
        slow: 0     // > 1500ms
    };

    patterns.forEach(pattern => {
        if (pattern.duration < 500) timeRanges.fast++;
        else if (pattern.duration < 1500) timeRanges.medium++;
        else timeRanges.slow++;
    });

    return timeRanges;
}

// Chart rendering functions
function renderCharts(data) {
    renderPerformanceCharts(data);
    renderPatternCharts(data);
    renderStageCharts(data);
    renderTimeCharts(data);
}

function renderPerformanceCharts(data) {
    renderScoreProgressionChart(data);
    renderSuccessRateChart(data);
    renderPatternComplexityChart(data);
}

function renderScoreProgressionChart(data) {
    const ctx = document.getElementById('scoreProgressionChart').getContext('2d');
    
    // Process data for the chart
    const gameScores = data.games.map(game => ({
        x: new Date(game.timestamp),
        y: game.timingData.finalScore
    })).sort((a, b) => a.x - b.x);

    new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Score Progression',
                data: gameScores,
                borderColor: '#FFD700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Score Progression Over Time',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

function renderSuccessRateChart(data) {
    const ctx = document.getElementById('successRateChart').getContext('2d');
    
    // Process data for success rates by pattern length
    const successRatesByLength = {};
    data.games.forEach(game => {
        game.timingData.patterns.forEach(pattern => {
            if (!successRatesByLength[pattern.length]) {
                successRatesByLength[pattern.length] = {
                    attempts: 0,
                    successes: 0
                };
            }
            successRatesByLength[pattern.length].attempts++;
            if (pattern.success) {
                successRatesByLength[pattern.length].successes++;
            }
        });
    });

    const lengths = Object.keys(successRatesByLength).sort((a, b) => a - b);
    const successRates = lengths.map(length => 
        (successRatesByLength[length].successes / successRatesByLength[length].attempts) * 100
    );

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: lengths.map(l => `${l} nodes`),
            datasets: [{
                label: 'Success Rate',
                data: successRates,
                backgroundColor: 'rgba(255, 215, 0, 0.7)',
                borderColor: '#FFD700',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Success Rate by Pattern Length',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff',
                        callback: value => `${value}%`
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

function renderPatternComplexityChart(data) {
    const ctx = document.getElementById('patternComplexityChart').getContext('2d');
    
    // Process data for complexity vs completion time
    const complexityData = data.games.flatMap(game => 
        game.timingData.patterns
            .filter(p => p.success)
            .map(pattern => ({
                x: pattern.complexity,
                y: pattern.duration,
                r: pattern.length * 2 // Bubble size based on pattern length
            }))
    );

    new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Pattern Complexity vs Time',
                data: complexityData,
                backgroundColor: 'rgba(255, 215, 0, 0.5)',
                borderColor: '#FFD700'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Pattern Complexity vs Completion Time',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Complexity',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Completion Time (ms)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

function renderStageCharts(data) {
    renderStageProgressionChart(data);
    renderStageTimeDistribution(data);
    renderStageSuccessRates(data);
}

function renderStageProgressionChart(data) {
    const ctx = document.getElementById('stageProgressionChart').getContext('2d');
    
    // Process data for stage progression
    const stageData = {};
    data.games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageData[stage]) {
                stageData[stage] = {
                    completionTimes: [],
                    remainingTimes: []
                };
            }
            if (data.successes === stageConfigs[stage].requiredPatterns) {
                stageData[stage].completionTimes.push(data.totalTime);
                stageData[stage].remainingTimes.push(
                    data.patterns[data.patterns.length - 1].remainingTime
                );
            }
        });
    });

    const stages = Object.keys(stageData).sort((a, b) => a - b);
    const avgCompletionTimes = stages.map(stage => 
        stageData[stage].completionTimes.reduce((a, b) => a + b, 0) / 
        stageData[stage].completionTimes.length / 1000 // Convert to seconds
    );
    const avgRemainingTimes = stages.map(stage =>
        stageData[stage].remainingTimes.reduce((a, b) => a + b, 0) /
        stageData[stage].remainingTimes.length
    );

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stages.map(s => `Stage ${s}`),
            datasets: [{
                label: 'Avg Completion Time (s)',
                data: avgCompletionTimes,
                backgroundColor: 'rgba(255, 215, 0, 0.5)',
                borderColor: '#FFD700',
                borderWidth: 1,
                yAxisID: 'y'
            }, {
                label: 'Avg Remaining Time (s)',
                data: avgRemainingTimes,
                type: 'line',
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                fill: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Stage Progression Analysis',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw.toFixed(1);
                            return `${context.dataset.label}: ${value}s`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y: {
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Completion Time (s)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y1: {
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Remaining Time (s)',
                        color: '#fff'
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

function renderStageTimeDistribution(data) {
    const ctx = document.getElementById('stageTimeDistribution').getContext('2d');
    
    // Process data for time distribution per stage
    const stageTimeData = {};
    data.games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageTimeData[stage]) {
                stageTimeData[stage] = {
                    times: [],
                    timeLimit: stageConfigs[stage].time
                };
            }
            data.patterns.forEach(pattern => {
                stageTimeData[stage].times.push(pattern.remainingTime);
            });
        });
    });

    const stages = Object.keys(stageTimeData).sort((a, b) => a - b);
    const boxplotData = stages.map(stage => {
        const times = stageTimeData[stage].times.sort((a, b) => a - b);
        return {
            stage: `Stage ${stage}`,
            min: times[0],
            q1: times[Math.floor(times.length * 0.25)],
            median: times[Math.floor(times.length * 0.5)],
            q3: times[Math.floor(times.length * 0.75)],
            max: times[times.length - 1],
            timeLimit: stageTimeData[stage].timeLimit
        };
    });

    new Chart(ctx, {
        type: 'boxplot',
        data: {
            labels: boxplotData.map(d => d.stage),
            datasets: [{
                label: 'Time Distribution',
                data: boxplotData.map(d => ({
                    min: d.min,
                    q1: d.q1,
                    median: d.median,
                    q3: d.q3,
                    max: d.max
                })),
                backgroundColor: 'rgba(255, 215, 0, 0.5)',
                borderColor: '#FFD700',
                borderWidth: 1
            }, {
                label: 'Time Limit',
                data: boxplotData.map(d => d.timeLimit),
                type: 'line',
                borderColor: '#FF4081',
                borderDash: [5, 5],
                pointStyle: 'dash'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Remaining Time Distribution by Stage',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Time (seconds)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

function renderStageSuccessRates(data) {
    const ctx = document.getElementById('stageSuccessRates').getContext('2d');
    
    // Process data for success rates per stage
    const stageSuccessData = {};
    data.games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageSuccessData[stage]) {
                stageSuccessData[stage] = {
                    attempts: 0,
                    successes: 0,
                    patternSuccesses: []
                };
            }
            stageSuccessData[stage].attempts += data.attempts;
            stageSuccessData[stage].successes += data.successes;
            data.patterns.forEach(pattern => {
                stageSuccessData[stage].patternSuccesses.push(pattern.success);
            });
        });
    });

    const stages = Object.keys(stageSuccessData).sort((a, b) => a - b);
    const overallRates = stages.map(stage => 
        (stageSuccessData[stage].successes / stageSuccessData[stage].attempts) * 100
    );
    const firstAttemptRates = stages.map(stage => {
        const patterns = stageSuccessData[stage].patternSuccesses;
        const firstAttempts = patterns.filter((_, i) => 
            i === 0 || !patterns[i-1]
        );
        return (firstAttempts.filter(success => success).length / firstAttempts.length) * 100;
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: stages.map(s => `Stage ${s}`),
            datasets: [{
                label: 'Overall Success Rate',
                data: overallRates,
                borderColor: '#FFD700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                fill: true
            }, {
                label: 'First Attempt Success Rate',
                data: firstAttemptRates,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Stage Success Rates',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Success Rate (%)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff',
                        callback: value => `${value}%`
                    }
                }
            }
        }
    });
}

// Game comparison functionality
function setupGameComparison() {
    const compareBtn = document.getElementById('compareGames');
    const modal = document.getElementById('comparisonModal');
    const closeBtn = modal.querySelector('.close-modal');

    compareBtn.addEventListener('click', () => {
        showGameSelectionDialog();
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

function showGameSelectionDialog() {
    // Create a temporary dialog for game selection
    const dialog = document.createElement('div');
    dialog.className = 'game-selection-dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>Select Games to Compare</h3>
            <div class="game-selection-grid" id="gameSelectionGrid"></div>
            <div class="selection-controls">
                <button id="compareSelectedGames" disabled>Compare Selected (0/2)</button>
                <button id="cancelSelection">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // Style the dialog
    const dialogStyles = document.createElement('style');
    dialogStyles.textContent = `
        .game-selection-dialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1001;
        }
        .dialog-content {
            background: var(--card-background);
            padding: 20px;
            border-radius: 10px;
            max-width: 800px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        .game-selection-grid {
            display: grid;
            gap: 10px;
            margin: 20px 0;
        }
        .game-card {
            background: rgba(0,0,0,0.2);
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .game-card:hover {
            background: rgba(255,215,0,0.1);
        }
        .game-card.selected {
            background: rgba(255,215,0,0.2);
            border: 1px solid #FFD700;
        }
        .selection-controls {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
    `;
    document.head.appendChild(dialogStyles);

    // Populate game selection grid
    populateGameSelection();

    // Setup event handlers
    const compareBtn = document.getElementById('compareSelectedGames');
    const cancelBtn = document.getElementById('cancelSelection');
    const selectedGames = new Set();

    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
    });

    compareBtn.addEventListener('click', () => {
        const selectedArray = Array.from(selectedGames);
        document.body.removeChild(dialog);
        compareGames(selectedArray[0], selectedArray[1]);
    });
}

async function populateGameSelection() {
    const games = await fetchGameStats();
    const grid = document.getElementById('gameSelectionGrid');
    const compareBtn = document.getElementById('compareSelectedGames');
    const selectedGames = new Set();

    games.sort((a, b) => b.timestamp - a.timestamp).forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div>Date: ${new Date(game.timestamp).toLocaleString()}</div>
            <div>Score: ${game.timingData.finalScore}</div>
            <div>Stage: ${game.timingData.finalStage}</div>
            <div>Duration: ${(game.timingData.gameDuration / 1000).toFixed(1)}s</div>
        `;

        card.addEventListener('click', () => {
            if (card.classList.contains('selected')) {
                card.classList.remove('selected');
                selectedGames.delete(game);
            } else if (selectedGames.size < 2) {
                card.classList.add('selected');
                selectedGames.add(game);
            }

            compareBtn.disabled = selectedGames.size !== 2;
            compareBtn.textContent = `Compare Selected (${selectedGames.size}/2)`;
        });

        grid.appendChild(card);
    });
}

function compareGames(game1, game2) {
    const modal = document.getElementById('comparisonModal');
    const container = document.querySelector('.comparison-container');
    
    // Clear previous content
    container.innerHTML = '';
    
    // Create comparison sections
    const sections = [
        createOverviewComparison(game1, game2),
        createPatternComparison(game1, game2),
        createStageComparison(game1, game2),
        createTimelineComparison(game1, game2)
    ];
    
    sections.forEach(section => container.appendChild(section));
    
    // Show the modal
    modal.style.display = 'flex';
}

function createOverviewComparison(game1, game2) {
    const section = document.createElement('div');
    section.className = 'comparison-section overview';
    
    const metrics = {
        'Final Score': [game1.timingData.finalScore, game2.timingData.finalScore],
        'Final Stage': [game1.timingData.finalStage, game2.timingData.finalStage],
        'Duration': [
            (game1.timingData.gameDuration / 1000).toFixed(1) + 's',
            (game2.timingData.gameDuration / 1000).toFixed(1) + 's'
        ],
        'Success Rate': [
            (game1.timingData.patterns.filter(p => p.success).length / game1.timingData.patterns.length * 100).toFixed(1) + '%',
            (game2.timingData.patterns.filter(p => p.success).length / game2.timingData.patterns.length * 100).toFixed(1) + '%'
        ]
    };

    section.innerHTML = `
        <h3>Overview Comparison</h3>
        <div class="metrics-grid">
            ${Object.entries(metrics).map(([metric, values]) => `
                <div class="metric-row">
                    <div class="metric-label">${metric}</div>
                    <div class="metric-values">
                        <div class="value ${values[0] > values[1] ? 'better' : ''}">${values[0]}</div>
                        <div class="value ${values[1] > values[0] ? 'better' : ''}">${values[1]}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    return section;
}

function createPatternComparison(game1, game2) {
    const section = document.createElement('div');
    section.className = 'comparison-section patterns';
    
    const canvas = document.createElement('canvas');
    section.appendChild(canvas);
    
    // Create pattern success rate comparison chart
    new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({ length: Math.max(
                game1.timingData.patterns.length,
                game2.timingData.patterns.length
            ) }, (_, i) => i + 1),
            datasets: [{
                label: 'Game 1 Success',
                data: game1.timingData.patterns.map(p => p.success ? 1 : 0),
                borderColor: '#FFD700',
                fill: false
            }, {
                label: 'Game 2 Success',
                data: game2.timingData.patterns.map(p => p.success ? 1 : 0),
                borderColor: '#4CAF50',
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Pattern Success Comparison',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });

    return section;
}

function createStageComparison(game1, game2) {
    const section = document.createElement('div');
    section.className = 'comparison-section stages';
    
    const canvas = document.createElement('canvas');
    section.appendChild(canvas);
    
    // Create stage completion time comparison chart
    const stageData1 = processStageData(game1);
    const stageData2 = processStageData(game2);
    
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(stageData1).map(s => `Stage ${s}`),
            datasets: [{
                label: 'Game 1 Time',
                data: Object.values(stageData1),
                backgroundColor: 'rgba(255, 215, 0, 0.5)'
            }, {
                label: 'Game 2 Time',
                data: Object.values(stageData2),
                backgroundColor: 'rgba(76, 175, 80, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Stage Completion Time Comparison',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Time (seconds)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });

    return section;
}

function createTimelineComparison(game1, game2) {
    const section = document.createElement('div');
    section.className = 'comparison-section timeline';
    
    const canvas = document.createElement('canvas');
    section.appendChild(canvas);
    
    // Create completion time trend comparison chart
    new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [{
                label: 'Game 1 Pattern Times',
                data: game1.timingData.patterns.map((p, i) => ({
                    x: i,
                    y: p.duration
                })),
                borderColor: '#FFD700',
                fill: false
            }, {
                label: 'Game 2 Pattern Times',
                data: game2.timingData.patterns.map((p, i) => ({
                    x: i,
                    y: p.duration
                })),
                borderColor: '#4CAF50',
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Pattern Completion Time Trends',
                    color: '#fff'
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Time (ms)',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Pattern Number',
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });

    return section;
}

function processStageData(game) {
    const stageData = {};
    Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
        stageData[stage] = data.totalTime / 1000; // Convert to seconds
    });
    return stageData;
}

// UI Event Handlers
function setupEventHandlers() {
    // Time range selector
    const timeRange = document.getElementById('timeRange');
    timeRange.addEventListener('change', async () => {
        await updateAllCharts();
    });

    // Refresh button
    const refreshBtn = document.getElementById('refreshData');
    refreshBtn.addEventListener('click', async () => {
        await updateAllCharts();
        showToast('Data refreshed!');
    });

    // Game details modal
    const gameList = document.getElementById('recentGames');
    gameList.addEventListener('click', (e) => {
        const gameCard = e.target.closest('.game-card');
        if (gameCard) {
            const gameId = gameCard.dataset.gameId;
            showGameDetails(gameId);
        }
    });

    // Export button already set up in previous code

    // Chart type toggles
    const chartToggles = document.querySelectorAll('.chart-toggle');
    chartToggles.forEach(toggle => {
        toggle.addEventListener('change', async () => {
            const chartId = toggle.dataset.chartId;
            const chartContainer = document.getElementById(chartId);
            if (toggle.checked) {
                chartContainer.style.display = 'block';
                await updateChart(chartId);
            } else {
                chartContainer.style.display = 'none';
            }
        });
    });

    // Filter controls
    setupFilterControls();
}

function setupFilterControls() {
    const filterForm = document.getElementById('filterForm');
    const stageFilter = document.getElementById('stageFilter');

    // Update stage filter options based on available data
    async function updateStageFilter() {
        const games = await fetchGameStats('all');
        const stages = getAvailableStages(games);
        
        stageFilter.innerHTML = `
            <option value="all">All Stages</option>
            ${stages.map(stage => `
                <option value="${stage}">Stage ${stage}</option>
            `).join('')}
        `;
    }

    // Call this when page loads
    updateStageFilter();

    // Change event listener for stage filter
    stageFilter.addEventListener('change', async () => {
        await updateAllCharts();
    });

    // Pattern length filter
    const lengthFilter = document.getElementById('lengthFilter');
    lengthFilter.addEventListener('change', async () => {
        await updateAllCharts();
    });

    // Success rate threshold
    const successRateThreshold = document.getElementById('successRateThreshold');
    successRateThreshold.addEventListener('input', debounce(async () => {
        await updateAllCharts();
    }, 300));
}

// Helper function to show toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Trigger reflow to enable animation
    toast.offsetHeight;
    
    // Add visible class for animation
    toast.classList.add('visible');
    
    // Remove toast after animation
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Game details modal
async function showGameDetails(gameId) {
    const gameData = await fetchGameDetails(gameId);
    if (!gameData) return; // Exit if no game data found
    
    const modal = document.getElementById('gameDetailsModal');
    const content = modal.querySelector('.modal-content');
    
    content.innerHTML = `
        <h3>Game Details</h3>
        <div class="game-stats">
            <div class="stat-item">
                <label>Score:</label>
                <span>${gameData.timingData.finalScore}</span>
            </div>
            <div class="stat-item">
                <label>Duration:</label>
                <span>${(gameData.timingData.gameDuration / 1000).toFixed(1)}s</span>
            </div>
            <div class="stat-item">
                <label>Final Stage:</label>
                <span>${gameData.timingData.finalStage}</span>
            </div>
            <div class="stat-item">
                <label>Success Rate:</label>
                <span>${calculateSuccessRate(gameData.timingData.patterns)}%</span>
            </div>
        </div>
        <div class="pattern-history">
            <h4>Pattern History</h4>
            <div class="pattern-list">
                ${generatePatternList(gameData.timingData.patterns)}
            </div>
        </div>
        <div class="stage-breakdown">
            <h4>Stage Breakdown</h4>
            <div class="stage-list">
                ${generateStageBreakdown(gameData.timingData.stageData)}
            </div>
        </div>
        <button class="close-modal">Close</button>
    `;

    // Add event listener for close button
    content.querySelector('.close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.style.display = 'flex';
}

function generatePatternList(patterns) {
    return patterns.map((p, index) => `
        <div class="pattern-item ${p.success ? 'success' : 'failure'}">
            <span class="pattern-number">#${index + 1}</span>
            <span class="pattern-sequence">${p.pattern.join('-')}</span>
            <span class="pattern-time">${p.duration.toFixed(1)}ms</span>
            <span class="pattern-result">${p.success ? '✓' : '✗'}</span>
        </div>
    `).join('');
}

function generateStageBreakdown(stageData) {
    return Object.entries(stageData).map(([stage, data]) => `
        <div class="stage-item">
            <h5>Stage ${stage}</h5>
            <div class="stage-stats">
                <div>Success: ${((data.successes / data.attempts) * 100).toFixed(1)}%</div>
                <div>Avg Time: ${(data.totalTime / data.successes).toFixed(1)}ms</div>
                <div>Patterns: ${data.patterns.length}</div>
            </div>
        </div>
    `).join('');
}

// Initialize event handlers when the page loads
document.addEventListener('DOMContentLoaded', () => {
    setupEventHandlers();
    updateAllCharts(); // Initial chart update
});

// Add this function for updating all charts
async function updateAllCharts() {
    showLoading();
    try {
        const timeRange = document.getElementById('timeRange').value;
        const games = await fetchGameStats(timeRange);
        if (!games || games.length === 0) {
            console.log('No valid game data found for the selected time range');
            updateOverviewStats([]);
            return;
        }
        updateOverviewStats(games);
        createCharts(games);
        updateRecentGames(games);
    } catch (error) {
        console.error('Error updating charts:', error);
        showToast('Error updating charts', 'error');
    } finally {
        hideLoading();
    }
}

// Add this function for updating individual charts
async function updateChart(chartId) {
    const timeRange = document.getElementById('timeRange').value;
    const games = await fetchGameStats(timeRange);
    
    switch(chartId) {
        case 'patternAnalysis':
            createPatternAnalysisChart(games);
            break;
        case 'stageProgression':
            createStageProgressionChart(games);
            break;
        case 'timeDistribution':
            createTimeDistributionChart(games);
            break;
    }
}

// Add this function for creating stage progression chart
function createStageProgressionChart(games) {
    const ctx = document.getElementById('stageProgression').getContext('2d');
    
    // Process data for all stages
    const stageData = {};
    games.forEach(game => {
        Object.entries(game.timingData.stageData).forEach(([stage, data]) => {
            if (!stageData[stage]) {
                stageData[stage] = {
                    count: 0,
                    totalTime: 0,
                    successRate: 0,
                    attempts: 0,
                    successes: 0
                };
            }
            stageData[stage].count++;
            stageData[stage].totalTime += data.totalTime || 0;
            stageData[stage].attempts += data.attempts || 0;
            stageData[stage].successes += data.successes || 0;
        });
    });

    const stages = Object.keys(stageData).sort((a, b) => a - b);
    const avgTimes = stages.map(stage => 
        stageData[stage].totalTime / stageData[stage].count / 1000
    );
    const successRates = stages.map(stage =>
        stageData[stage].attempts > 0 ? 
        (stageData[stage].successes / stageData[stage].attempts) * 100 : 0
    );

    if (stageChart) stageChart.destroy();
    stageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stages.map(s => `Stage ${s}`),
            datasets: [{
                label: 'Avg Time (s)',
                data: avgTimes,
                backgroundColor: 'rgba(255, 215, 0, 0.5)',
                borderColor: '#FFD700',
                borderWidth: 1,
                yAxisID: 'y'
            }, {
                label: 'Success Rate (%)',
                data: successRates,
                type: 'line',
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                fill: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Time (seconds)'
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Success Rate (%)'
                    }
                }
            }
        }
    });
}

// Add this function for creating time distribution chart
function createTimeDistributionChart(games) {
    const ctx = document.getElementById('timeDistribution').getContext('2d');
    
    // Calculate time distributions
    const timeRanges = {
        'Fast (<500ms)': 0,
        'Medium (500-1500ms)': 0,
        'Slow (>1500ms)': 0
    };

    games.forEach(game => {
        game.timingData.patterns.forEach(pattern => {
            if (pattern.duration < 500) timeRanges['Fast (<500ms)']++;
            else if (pattern.duration < 1500) timeRanges['Medium (500-1500ms)']++;
            else timeRanges['Slow (>1500ms)']++;
        });
    });

    if (timeChart) timeChart.destroy();
    timeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(timeRanges),
            datasets: [{
                data: Object.values(timeRanges),
                backgroundColor: [
                    'rgba(76, 175, 80, 0.5)',
                    'rgba(255, 215, 0, 0.5)',
                    'rgba(255, 99, 132, 0.5)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Add this function for fetching game details
async function fetchGameDetails(gameId) {
    try {
        const games = await getGameStats();
        if (!games) {
            throw new Error('No games data found');
        }

        // Find all entries for this game ID (looking for id_stage_X patterns)
        const gameEntries = Object.entries(games).filter(([key, _]) => 
            key.startsWith(gameId + '_stage_')
        );

        if (gameEntries.length === 0) {
            throw new Error(`Game with ID ${gameId} not found`);
        }

        // Combine all stage data into a single game object
        const combinedGame = {
            id: gameId,
            timestamp: gameEntries[0][1].timestamp,
            timingData: {
                patterns: [],
                stageData: {},
                finalScore: 0,
                finalStage: 0,
                gameDuration: 0
            }
        };

        // Process each stage entry
        gameEntries.forEach(([key, entry]) => {
            const stage = key.split('_stage_')[1];
            
            // Add stage data
            combinedGame.timingData.stageData[stage] = {
                patterns: entry.timingData.stageData.patterns || [],
                attempts: entry.timingData.stageData.attempts || 0,
                successes: entry.timingData.stageData.successes || 0,
                totalTime: entry.timingData.stageData.totalTime || 0,
                completed: entry.timingData.stageData.completed || false
            };

            // Add patterns from this stage
            if (entry.timingData.patterns && entry.timingData.patterns.length > 0) {
                combinedGame.timingData.patterns.push(...entry.timingData.patterns);
            }

            // Update game stats
            combinedGame.timingData.finalScore = Math.max(
                combinedGame.timingData.finalScore,
                entry.timingData.partialScore || 0
            );
            combinedGame.timingData.finalStage = Math.max(
                combinedGame.timingData.finalStage,
                parseInt(stage)
            );
            combinedGame.timingData.gameDuration += entry.timingData.stageData.totalTime || 0;
        });

        return combinedGame;
    } catch (error) {
        console.error('Error fetching game details:', error);
        showToast('Error loading game details', 'error');
        return null;
    }
}

// Add this function to get the available stages from games data
function getAvailableStages(games) {
    const stages = new Set();
    games.forEach(game => {
        Object.keys(game.timingData.stageData).forEach(stage => {
            stages.add(parseInt(stage));
        });
    });
    return Array.from(stages).sort((a, b) => a - b);
}

// ... rest of existing code ... 