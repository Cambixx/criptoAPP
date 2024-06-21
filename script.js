// script.js

document.addEventListener('DOMContentLoaded', async function () {
    const pairs = await fetchCryptoPairs();
    populateCryptoPairs(pairs);
});

document.getElementById('cryptoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    updateChartPeriodically();
});

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

    const crossovers = detectCrossovers(macdData, rsiData, adxData);
    updateChart(macdData, crossovers);
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

    while (rsi.length < data.length) {
        rsi.unshift(null);
    }

    return rsi;
}

function calculateADX(data, length = 14) {
    // For simplicity, assuming only close price is used, modify accordingly if high and low are available
    const plusDMs = [];
    const minusDMs = [];
    const trueRanges = [];

    for (let i = 1; i < data.length; i++) {
        const currentClose = data[i].close;
        const previousClose = data[i - 1].close;

        const plusDM = currentClose - previousClose;
        const minusDM = previousClose - currentClose;

        plusDMs.push(plusDM > 0 ? plusDM : 0);
        minusDMs.push(minusDM > 0 ? minusDM : 0);

        trueRanges.push(Math.abs(currentClose - previousClose));
    }

    const smoothedPlusDMs = calculateEMA(plusDMs, length);
    const smoothedMinusDMs = calculateEMA(minusDMs, length);
    const smoothedTrueRanges = calculateEMA(trueRanges, length);

    const plusDis = smoothedPlusDMs.map((dm, index) => 100 * (dm / smoothedTrueRanges[index]));
    const minusDis = smoothedMinusDMs.map((dm, index) => 100 * (dm / smoothedTrueRanges[index]));

    const dxs = plusDis.map((pdi, index) => 100 * (Math.abs(pdi - minusDis[index]) / (pdi + minusDis[index])));

    const adx = calculateEMA(dxs, length);

    while (adx.length < data.length) {
        adx.unshift(null);
    }

    return adx;
}

function detectCrossovers(macdData, rsiData, adxData) {
    const buySignals = [];
    const sellSignals = [];

    for (let i = 1; i < macdData.time.length; i++) {
        if (macdData.macd[i - 1] <= macdData.signal[i - 1] && macdData.macd[i] > macdData.signal[i]) {
            buySignals.push({ time: macdData.time[i], value: macdData.macd[i] });
        }
        if (macdData.macd[i - 1] >= macdData.signal[i - 1] && macdData.macd[i] < macdData.signal[i]) {
            sellSignals.push({ time: macdData.time[i], value: macdData.macd[i] });
        }
    }

    return { buySignals, sellSignals };
}

function updateChart(macdData, crossovers) {
    const ctx = document.getElementById('signalsChart').getContext('2d');

    if (window.myChart) {
        window.myChart.destroy();
    }

    const buyAnnotations = crossovers.buySignals.map(signal => ({
        type: 'point',
        xValue: signal.time,
        yValue: signal.value,
        backgroundColor: 'green',
        borderColor: 'green',
        radius: 5,
        pointStyle: 'triangle',
        rotation: 180,
        label: {
            content: 'BUY',
            enabled: true,
            position: 'top',
            backgroundColor: 'green',
            font: { style: 'bold', size: 12 },
            yAdjust: -10
        }
    }));

    const sellAnnotations = crossovers.sellSignals.map(signal => ({
        type: 'point',
        xValue: signal.time,
        yValue: signal.value,
        backgroundColor: 'red',
        borderColor: 'red',
        radius: 5,
        pointStyle: 'triangle',
        rotation: 0,
        label: {
            content: 'SELL',
            enabled: true,
            position: 'bottom',
            backgroundColor: 'red',
            font: { style: 'bold', size: 12 },
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
                    pointRadius: 0
                },
                {
                    label: 'Signal Line',
                    data: macdData.signal,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 2,
                    fill: false,
                    type: 'line',
                    pointRadius: 0
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
                annotation: {
                    annotations: [...buyAnnotations, ...sellAnnotations]
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
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
                }
            }
        }
    });
}

if (Notification.permission !== 'granted') {
    Notification.requestPermission();
}

function notifySignals(crossovers) {
    const buySignals = crossovers.buySignals;
    const sellSignals = crossovers.sellSignals;

    const buySound = document.getElementById('buy-sound');
    const sellSound = document.getElementById('sell-sound');

    if (buySignals.length > 0) {
        const buySignal = buySignals[buySignals.length - 1];
        buySound.play();
        if (Notification.permission === 'granted') {
            new Notification(`BUY Signal detected at ${buySignal.time}`, {
                body: `Value: ${buySignal.value}`,
                icon: './buy.png' // Opcional: ruta a un icono
            });
        }
    }

    if (sellSignals.length > 0) {
        const sellSignal = sellSignals[sellSignals.length - 1];
        sellSound.play();
        if (Notification.permission === 'granted') {
            new Notification(`SELL Signal detected at ${sellSignal.time}`, {
                body: `Value: ${sellSignal.value}`,
                icon: './sell.png' // Opcional: ruta a un icono
            });
        }
    }
}