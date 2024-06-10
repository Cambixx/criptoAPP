document.getElementById('cryptoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const pair = document.getElementById('pair').value;
    const interval = document.getElementById('interval').value;
    
    const data = await fetchCryptoData(pair, interval);
    
    if (data.length === 0) {
        alert('No data returned. Please check your API key and parameters.');
        return;
    }
    
    const macdData = calculateMACD(data);
    updateChart(macdData);
});

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

function updateChart(macdData) {
    const ctx = document.getElementById('macdChart').getContext('2d');
    
    if (window.myChart) {
        window.myChart.destroy();
    }
    
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
                    type: 'line'
                },
                {
                    label: 'Signal Line',
                    data: macdData.signal,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 2,
                    fill: false,
                    type: 'line'
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
            }
        }
    });
}
