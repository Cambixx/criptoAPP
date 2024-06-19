document.addEventListener('DOMContentLoaded', async function () {
    const pairs = await fetchCryptoPairs();
    populateCryptoPairs(pairs);
});

document.getElementById('cryptoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    startAutoUpdate();
});

let updateInterval;

function startAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateChartPeriodically();
    updateInterval = setInterval(updateChartPeriodically, 5000);
}

async function updateChartPeriodically() {
    const pair = document.getElementById('pair').value;
    const interval = document.getElementById('interval').value;

    const data = await fetchCryptoData(pair, interval);

    if (data.length === 0) {
        alert('No data returned. Please check your API key and parameters.');
        return;
    }

    const macdData = calculateMACD(data);
    const rsiData = calculateRSI(data);
    const adxData = calculateADX(data);

    const crossovers = detectCrossoversWithRSI(macdData, rsiData, adxData);
    updateChart(macdData, rsiData, crossovers);
    notifySignals(crossovers);
}

async function fetchCryptoPairs() {
    const url = 'https://api.binance.com/api/v3/ticker/24hr';
    const response = await fetch(url);

    if (!response.ok) {
        alert('Error fetching crypto pairs. Please check your network connection.');
        return [];
    }

    const data = await response.json();

    // Filter and sort pairs with respect to USDT by volume in descending order
    const usdtPairs = data
        .filter(ticker => ticker.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

    return usdtPairs;
}

function populateCryptoPairs(pairs) {
    const pairSelect = document.getElementById('pair');
    pairs.forEach(pair => {
        const option = document.createElement('option');
        option.value = pair.symbol;
        const volumeInMillions = (parseFloat(pair.quoteVolume) / 1_000_000).toFixed(2);
        option.textContent = `${pair.symbol} (Vol: ${volumeInMillions}M)`;
        pairSelect.appendChild(option);
    });
}

async function fetchCryptoData(pair, interval) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=500`;
    const response = await fetch(url);

    if (!response.ok) {
        alert('Error fetching data. Please check your API key and parameters.');
        return [];
    }

    const data = await response.json();
    return data.map(candle => ({
        time: candle[0],
        close: parseFloat(candle[4])
    }));
}

function calculateMACD(data) {
    const closePrices = data.map(d => d.close);
    const fastLength = 12;
    const slowLength = 26;
    const signalLength = 9;

    const emaFast = calculateEMA(closePrices, fastLength);
    const emaSlow = calculateEMA(closePrices, slowLength);

    const macd = emaFast.map((value, index) => value - emaSlow[index]);
    const signal = calculateEMA(macd, signalLength);
    const histogram = macd.map((value, index) => value - signal[index]);

    return {
        time: data.map(d => new Date(d.time)),
        macd,
        signal,
        histogram
    };
}

function calculateEMA(prices, length) {
    const k = 2 / (length + 1);
    const emaArray = [prices[0]];

    for (let i = 1; i < prices.length; i++) {
        emaArray.push(prices[i] * k + emaArray[i - 1] * (1 - k));
    }

    return emaArray;
}

function calculateRSI(data, length = 14) {
    const gains = [];
    const losses = [];

    for (let i = 1; i < data.length; i++) {
        const difference = data[i].close - data[i - 1].close;
        if (difference >= 0) {
            gains.push(difference);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(Math.abs(difference));
        }
    }

    const averageGain = gains.slice(0, length).reduce((a, b) => a + b, 0) / length;
    const averageLoss = losses.slice(0, length).reduce((a, b) => a + b, 0) / length;

    const rsi = [];
    for (let i = length; i < data.length; i++) {
        const currentGain = gains[i];
        const currentLoss = losses[i];

        const newAverageGain = ((averageGain * (length - 1)) + currentGain) / length;
        const newAverageLoss = ((averageLoss * (length - 1)) + currentLoss) / length;

        const rs = newAverageGain / newAverageLoss;
        rsi.push(100 - (100 / (1 + rs)));
    }

    // Fill initial RSI values with null to match the length of input data
    while (rsi.length < data.length) {
        rsi.unshift(null);
    }

    return rsi;
}

function calculateADX(data, length = 14) {
    const plusDMs = [];
    const minusDMs = [];
    const trueRanges = [];

    for (let i = 1; i < data.length; i++) {
        const currentHigh = data[i].high;
        const currentLow = data[i].low;
        const previousClose = data[i - 1].close;

        const plusDM = currentHigh - data[i - 1].high;
        const minusDM = data[i - 1].low - currentLow;

        plusDMs.push(plusDM > minusDM && plusDM > 0 ? plusDM : 0);
        minusDMs.push(minusDM > plusDM && minusDM > 0 ? minusDM : 0);

        trueRanges.push(Math.max(currentHigh - currentLow, Math.abs(currentHigh - previousClose), Math.abs(currentLow - previousClose)));
    }

    const smoothedPlusDMs = calculateEMA(plusDMs, length);
    const smoothedMinusDMs = calculateEMA(minusDMs, length);
    const smoothedTrueRanges = calculateEMA(trueRanges, length);

    const plusDis = smoothedPlusDMs.map((dm, i) => (dm / smoothedTrueRanges[i]) * 100);
    const minusDis = smoothedMinusDMs.map((dm, i) => (dm / smoothedTrueRanges[i]) * 100);

    const dxs = plusDis.map((plusDi, i) => Math.abs(plusDi - minusDis[i]) / (plusDi + minusDis[i]) * 100);

    return calculateEMA(dxs, length);
}

function detectCrossoversWithRSI(macdData, rsiData, adxData, rsiThreshold = 50, adxThreshold = 20) {
    const buySignals = [];
    const sellSignals = [];

    for (let i = 1; i < macdData.macd.length; i++) {
        if (macdData.macd[i] > macdData.signal[i] && macdData.macd[i - 1] <= macdData.signal[i - 1] && rsiData[i] < rsiThreshold && adxData[i] > adxThreshold) {
            buySignals.push({ time: macdData.time[i], value: macdData.macd[i] });
        } else if (macdData.macd[i] < macdData.signal[i] && macdData.macd[i - 1] >= macdData.signal[i - 1] && rsiData[i] > rsiThreshold && adxData[i] > adxThreshold) {
            sellSignals.push({ time: macdData.time[i], value: macdData.macd[i] });
        }
    }

    return { buySignals, sellSignals };
}

function updateChart(macdData, rsiData, crossovers) {
    const ctx = document.getElementById('macdChart').getContext('2d');

    if (window.myChart) {
        window.myChart.destroy();
    }

    const buyAnnotations = crossovers.buySignals.map(signal => ({
        type: 'point',
        xValue: signal.time,
        yValue: signal.value,
        backgroundColor: 'green',
        borderColor: 'green',
        borderWidth: 2,
        pointStyle: 'triangle',
        rotation: 180, // Arrow pointing up
        label: {
            content: 'BUY',
            enabled: true,
            position: 'start',
            backgroundColor: 'green',
            color: 'white',
            yAdjust: -10
        }
    }));

    const sellAnnotations = crossovers.sellSignals.map(signal => ({
        type: 'point',
        xValue: signal.time,
        yValue: signal.value,
        backgroundColor: 'red',
        borderColor: 'red',
        borderWidth: 2,
        pointStyle: 'triangle',
        rotation: 0, // Arrow pointing down
        label: {
            content: 'SELL',
            enabled: true,
            position: 'start',
            backgroundColor: 'red',
            color: 'white',
            yAdjust: 10
        }
    }));

    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: macdData.time,
            datasets: [
                {
                    label: 'MACD',
                    data: macdData.macd,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    fill: false,
                    type: 'line',
                    pointRadius: 0 // Hide points on MACD line
                },
                {
                    label: 'Signal Line',
                    data: macdData.signal,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 2,
                    fill: false,
                    type: 'line',
                    pointRadius: 0 // Hide points on Signal line
                },
                {
                    label: 'Histogram',
                    data: macdData.histogram,
                    backgroundColor: macdData.histogram.map(value => value >= 0 ? 'rgba(75, 192, 192, 0.2)' : 'rgba(255, 99, 132, 0.2)'),
                    borderColor: macdData.histogram.map(value => value >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'),
                    borderWidth: 1
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                },
                annotation: {
                    annotations: [...buyAnnotations, ...sellAnnotations]
                }
            }
        }
    });
}

function notifySignals(crossovers) {
    const buySignals = crossovers.buySignals;
    const sellSignals = crossovers.sellSignals;

    if (buySignals.length > 0) {
        alert('Buy Signal Detected');
    }

    if (sellSignals.length > 0) {
        alert('Sell Signal Detected');
    }
}
