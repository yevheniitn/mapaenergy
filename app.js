/* ============================================
   Poland Power Grid Monitor — Application Logic
   ============================================ */

(function () {
    'use strict';

    // ─── CONFIG ───────────────────────────────
    const PSE_API = 'https://api.raporty.pse.pl/api/his-wlk-cal';
    const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const MW_TO_GW = 1 / 1000;

    // ─── POWER PLANTS / CITIES DATA ──────────
    // Major power generation points in Poland with approximate installed capacity (MW)
    // and geographic coordinates mapped to our SVG viewBox
    const CITIES = [
        {
            name: 'Bełchatów',
            type: 'coal',
            capacity: 5298,
            lat: 51.26, lon: 19.36,
            desc: 'Największa elektrownia węglowa w Europie'
        },
        {
            name: 'Kozienice',
            type: 'coal',
            capacity: 4016,
            lat: 51.59, lon: 21.55,
            desc: 'Elektrownia na węgiel kamienny'
        },
        {
            name: 'Opole',
            type: 'coal',
            capacity: 3532,
            lat: 50.67, lon: 17.93,
            desc: 'Elektrownia na węgiel kamienny'
        },
        {
            name: 'Rybnik',
            type: 'coal',
            capacity: 1775,
            lat: 50.10, lon: 18.54,
            desc: 'Elektrownia na węgiel kamienny'
        },
        {
            name: 'Turów',
            type: 'coal',
            capacity: 1900,
            lat: 50.95, lon: 14.90,
            desc: 'Elektrownia na węgiel brunatny'
        },
        {
            name: 'Połaniec',
            type: 'coal',
            capacity: 1800,
            lat: 50.43, lon: 21.28,
            desc: 'Elektrownia na węgiel kamienny i biomasę'
        },
        {
            name: 'Jaworzno',
            type: 'coal',
            capacity: 1345,
            lat: 50.20, lon: 19.27,
            desc: 'Nowy blok 910 MW'
        },
        {
            name: 'Warszawa',
            type: 'gas',
            capacity: 1100,
            lat: 52.23, lon: 21.01,
            desc: 'Elektrociepłownia gazowa Żerań i Siekierki'
        },
        {
            name: 'Płock',
            type: 'gas',
            capacity: 600,
            lat: 52.55, lon: 19.70,
            desc: 'Elektrociepłownia PKN Orlen'
        },
        {
            name: 'Włocławek',
            type: 'hydro',
            capacity: 160,
            lat: 52.66, lon: 19.07,
            desc: 'Elektrownia wodna na Wiśle'
        },
        {
            name: 'Żarnowiec',
            type: 'hydro',
            capacity: 716,
            lat: 54.78, lon: 18.07,
            desc: 'Elektrownia szczytowo-pompowa'
        },
        {
            name: 'Gdańsk',
            type: 'wind',
            capacity: 900,
            lat: 54.35, lon: 18.64,
            desc: 'Farmy wiatrowe Pomorze'
        },
        {
            name: 'Szczecin',
            type: 'wind',
            capacity: 850,
            lat: 53.43, lon: 14.55,
            desc: 'Farmy wiatrowe Zachodniopomorskie'
        },
        {
            name: 'Koszalin',
            type: 'wind',
            capacity: 750,
            lat: 54.19, lon: 16.17,
            desc: 'Farmy wiatrowe Pomorze Środkowe'
        },
        {
            name: 'Łódź',
            type: 'gas',
            capacity: 460,
            lat: 51.77, lon: 19.45,
            desc: 'Elektrociepłownia EC4'
        },
        {
            name: 'Kraków',
            type: 'gas',
            capacity: 460,
            lat: 50.06, lon: 19.94,
            desc: 'Elektrociepłownia Kraków'
        },
        {
            name: 'Poznań',
            type: 'gas',
            capacity: 380,
            lat: 52.41, lon: 16.93,
            desc: 'Elektrociepłownia Karolin'
        },
        {
            name: 'Wrocław',
            type: 'gas',
            capacity: 350,
            lat: 51.11, lon: 17.04,
            desc: 'Kogeneracja Wrocław'
        },
        {
            name: 'Lublin',
            type: 'solar',
            capacity: 320,
            lat: 51.25, lon: 22.57,
            desc: 'Farmy fotowoltaiczne Lubelszczyzna'
        },
        {
            name: 'Rzeszów',
            type: 'solar',
            capacity: 280,
            lat: 50.04, lon: 22.00,
            desc: 'Farmy fotowoltaiczne Podkarpacie'
        },
        {
            name: 'Białystok',
            type: 'coal',
            capacity: 200,
            lat: 53.13, lon: 23.16,
            desc: 'Elektrociepłownia Białystok'
        },
        {
            name: 'Olsztyn',
            type: 'wind',
            capacity: 400,
            lat: 53.78, lon: 20.49,
            desc: 'Farmy wiatrowe Warmia-Mazury'
        },
        {
            name: 'Katowice',
            type: 'coal',
            capacity: 1200,
            lat: 50.26, lon: 19.02,
            desc: 'Elektrownia Łaziska i Halemba'
        },
        {
            name: 'Bydgoszcz',
            type: 'gas',
            capacity: 250,
            lat: 53.12, lon: 18.01,
            desc: 'Elektrociepłownia Bydgoszcz'
        },
    ];

    // Total installed capacity for scaling
    const TOTAL_INSTALLED = CITIES.reduce((s, c) => s + c.capacity, 0);

    // ─── STATE ────────────────────────────────
    let chartData = { labels: [], demand: [], generation: [], wind: [], solar: [] };
    let latestData = null;
    let refreshTimer = null;
    let nextRefreshTime = null;

    // ─── DOM REFS ─────────────────────────────
    const $id = id => document.getElementById(id);
    const statusBadge = $id('statusBadge');
    const statusText = statusBadge.querySelector('.status-text');
    const lastUpdateEl = $id('lastUpdate').querySelector('span:last-child');
    const nextRefreshEl = $id('nextRefresh');

    // ─── COORDINATE MAPPING ───────────────────
    // Poland bounding box approx: lat 49.0–54.9, lon 14.1–24.2
    const MAP_BOUNDS = { latMin: 48.8, latMax: 55.2, lonMin: 13.8, lonMax: 24.5 };
    const SVG_W = 600, SVG_H = 580;

    function geoToSvg(lat, lon) {
        const x = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * SVG_W;
        const y = ((MAP_BOUNDS.latMax - lat) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * SVG_H;
        return { x, y };
    }

    // ─── POLAND OUTLINE (simplified) ──────────
    // Simplified polygon of Poland's border
    const POLAND_OUTLINE_POINTS = [
        [14.12, 53.92], [14.18, 54.40], [14.77, 54.38], [16.18, 54.57],
        [16.56, 54.56], [17.62, 54.79], [18.30, 54.83], [18.78, 54.70],
        [19.60, 54.45], [19.87, 54.42], [21.10, 54.39], [22.77, 54.36],
        [23.48, 54.24], [23.51, 53.95], [23.89, 53.36], [23.57, 52.63],
        [23.55, 52.12], [23.60, 51.62], [23.62, 51.27], [24.11, 50.86],
        [24.03, 50.61], [23.61, 50.33], [22.71, 49.57], [22.56, 49.08],
        [22.04, 49.21], [21.60, 49.44], [20.87, 49.33], [20.07, 49.19],
        [19.77, 49.20], [19.46, 49.57], [19.18, 49.40], [18.85, 49.52],
        [18.56, 49.89], [18.01, 50.01], [17.88, 49.97], [17.59, 50.10],
        [16.88, 50.14], [16.68, 50.10], [16.21, 50.41], [16.41, 50.58],
        [16.28, 50.66], [16.00, 50.62], [15.35, 50.73], [15.00, 50.97],
        [14.83, 50.87], [14.68, 50.90], [14.60, 51.00], [14.98, 51.09],
        [14.93, 51.47], [14.72, 51.58], [14.61, 51.82], [14.57, 52.06],
        [14.28, 52.08], [14.14, 52.28], [14.17, 52.51], [14.36, 52.62],
        [14.55, 52.74], [14.39, 53.01], [14.22, 53.27], [14.19, 53.43],
        [14.09, 53.58], [14.12, 53.92]
    ];

    // ─── RENDER MAP ───────────────────────────
    function renderMap() {
        const container = $id('mapContainer');

        // Build Poland outline path
        let pathD = '';
        POLAND_OUTLINE_POINTS.forEach((p, i) => {
            const { x, y } = geoToSvg(p[1], p[0]);
            pathD += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
        });
        pathD += 'Z';

        // Build city markers
        let citySvg = '';
        const colorMap = {
            coal: '#ef4444',
            gas: '#f97316',
            wind: '#06b6d4',
            solar: '#fbbf24',
            hydro: '#3b82f6',
        };

        CITIES.forEach((city, idx) => {
            const { x, y } = geoToSvg(city.lat, city.lon);
            const radius = Math.max(5, Math.min(14, (city.capacity / TOTAL_INSTALLED) * 180));
            const color = colorMap[city.type] || '#8b5cf6';

            citySvg += `
                <g class="city-marker" data-idx="${idx}"
                   onmouseenter="window.__showTooltip(event, ${idx})"
                   onmouseleave="window.__hideTooltip()">
                    <circle class="city-pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius + 6}" 
                        fill="${color}" opacity="0.3"/>
                    <circle class="city-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" 
                        fill="${color}" opacity="0.85" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
                    <text class="city-label" x="${x.toFixed(1)}" y="${(y - radius - 8).toFixed(1)}">${city.name}</text>
                    <text class="city-power-label" x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" id="cityPower${idx}">—</text>
                </g>
            `;
        });

        container.innerHTML = `
            <svg viewBox="0 0 ${SVG_W} ${SVG_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                    <linearGradient id="mapGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="rgba(59,130,246,0.06)"/>
                        <stop offset="100%" stop-color="rgba(139,92,246,0.06)"/>
                    </linearGradient>
                </defs>
                <path class="poland-outline" d="${pathD}" fill="url(#mapGrad)"/>
                ${citySvg}
            </svg>
        `;
    }

    // ─── TOOLTIP ──────────────────────────────
    const tooltipEl = $id('mapTooltip');

    window.__showTooltip = function (e, idx) {
        const city = CITIES[idx];
        const currentPower = city._currentPower != null ? city._currentPower.toFixed(2) : '—';
        tooltipEl.innerHTML = `
            <div class="tt-city">${city.name}</div>
            <div class="tt-row"><span>Typ:</span><span>${typeLabel(city.type)}</span></div>
            <div class="tt-row"><span>Moc zainstalowana:</span><span>${city.capacity} MW</span></div>
            <div class="tt-row"><span>Aktualna moc:</span><span>${currentPower} GW</span></div>
            <div class="tt-row"><span>${city.desc}</span><span></span></div>
        `;
        tooltipEl.style.display = 'block';
        positionTooltip(e);
    };

    window.__hideTooltip = function () {
        tooltipEl.style.display = 'none';
    };

    function positionTooltip(e) {
        const rect = tooltipEl.getBoundingClientRect();
        let x = e.clientX + 16;
        let y = e.clientY - 10;
        if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - 16;
        if (y + rect.height > window.innerHeight - 10) y = window.innerHeight - rect.height - 10;
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
    }

    document.addEventListener('mousemove', (e) => {
        if (tooltipEl.style.display === 'block') positionTooltip(e);
    });

    function typeLabel(t) {
        return { coal: 'Węgiel', gas: 'Gaz', wind: 'Wiatr', solar: 'Fotowoltaika', hydro: 'Woda' }[t] || t;
    }

    // ─── CHART (vanilla canvas) ───────────────
    function renderChart() {
        const canvas = $id('powerChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const W = container.clientWidth;
        const H = container.clientHeight;
        const PAD = { top: 30, right: 16, bottom: 36, left: 52 };

        ctx.clearRect(0, 0, W, H);

        if (chartData.labels.length < 2) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Oczekiwanie na dane...', W / 2, H / 2);
            return;
        }

        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;

        // Compute Y range
        const allVals = [...chartData.demand, ...chartData.generation].filter(v => v != null);
        const yMax = Math.ceil(Math.max(...allVals) * 1.08);
        const yMin = 0;

        const xStep = plotW / (chartData.labels.length - 1);

        function toX(i) { return PAD.left + i * xStep; }
        function toY(v) { return PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

        // Grid lines
        ctx.strokeStyle = 'rgba(99,102,241,0.08)';
        ctx.lineWidth = 1;
        const gridSteps = 5;
        for (let i = 0; i <= gridSteps; i++) {
            const val = yMin + (yMax - yMin) * (i / gridSteps);
            const y = toY(val);
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(W - PAD.right, y);
            ctx.stroke();

            ctx.fillStyle = '#64748b';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(1), PAD.left - 6, y + 3.5);
        }

        // X labels
        ctx.fillStyle = '#64748b';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        const labelEvery = Math.max(1, Math.floor(chartData.labels.length / 12));
        chartData.labels.forEach((lbl, i) => {
            if (i % labelEvery === 0) {
                ctx.fillText(lbl, toX(i), H - PAD.bottom + 16);
            }
        });

        // Draw line function with gradient fill
        function drawLine(data, strokeColor, fillColor) {
            const validPoints = [];
            data.forEach((v, i) => {
                if (v != null) validPoints.push({ i, v });
            });
            if (validPoints.length < 2) return;

            // Fill
            ctx.beginPath();
            ctx.moveTo(toX(validPoints[0].i), toY(0));
            validPoints.forEach(p => ctx.lineTo(toX(p.i), toY(p.v)));
            ctx.lineTo(toX(validPoints[validPoints.length - 1].i), toY(0));
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
            grad.addColorStop(0, fillColor);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Stroke
            ctx.beginPath();
            validPoints.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(toX(p.i), toY(p.v));
                else ctx.lineTo(toX(p.i), toY(p.v));
            });
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // Draw data
        drawLine(chartData.demand, '#3b82f6', 'rgba(59,130,246,0.12)');
        drawLine(chartData.generation, '#8b5cf6', 'rgba(139,92,246,0.08)');
        drawLine(chartData.wind, '#06b6d4', 'rgba(6,182,212,0.06)');
        drawLine(chartData.solar, '#fbbf24', 'rgba(251,191,36,0.06)');

        // Legend
        const legends = [
            { label: 'Zapotrzebowanie', color: '#3b82f6' },
            { label: 'Generacja', color: '#8b5cf6' },
            { label: 'Wiatr', color: '#06b6d4' },
            { label: 'PV', color: '#fbbf24' },
        ];
        let lx = PAD.left;
        ctx.font = '10px Inter, sans-serif';
        legends.forEach(l => {
            ctx.fillStyle = l.color;
            ctx.fillRect(lx, 8, 14, 3);
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText(l.label, lx + 18, 13);
            lx += ctx.measureText(l.label).width + 34;
        });
    }

    // ─── ENERGY MIX ───────────────────────────
    function renderMix(data) {
        const container = $id('mixBars');
        if (!data) {
            container.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:8px;">Oczekiwanie na dane...</div>';
            return;
        }

        const total = (data.jg || 0) + (data.wi || 0) + (data.pv || 0) + Math.abs(data.jgm || 0);
        if (total === 0) return;

        // Breakdown: conventional = jgw1, jgw2 from coal; wi = wind; pv = solar; jgz2 = hydro; rest
        const conv = (data.jgw1 || 0) + (data.jgw2 || 0);
        const wind = data.wi || 0;
        const solar = data.pv || 0;
        const hydro = data.jgz2 || 0;
        const other = Math.max(0, (data.jg || 0) - conv);

        const grandTotal = conv + wind + solar + hydro + other || 1;

        function pct(v) { return ((v / grandTotal) * 100).toFixed(1); }
        function gwStr(v) { return (v * MW_TO_GW).toFixed(2) + ' GW'; }

        const rows = [
            { label: 'Węgiel / Konw.', cls: 'coal', value: conv, p: pct(conv) },
            { label: 'Wiatr', cls: 'wind', value: wind, p: pct(wind) },
            { label: 'Fotowoltaika', cls: 'solar', value: solar, p: pct(solar) },
            { label: 'Woda', cls: 'hydro', value: hydro, p: pct(hydro) },
            { label: 'Inne', cls: 'other', value: other, p: pct(other) },
        ];

        container.innerHTML = rows.map(r => `
            <div class="mix-row">
                <span class="mix-label">${r.label}</span>
                <div class="mix-bar-wrapper">
                    <div class="mix-bar-fill ${r.cls}" style="width: ${r.p}%"></div>
                </div>
                <span class="mix-value">${r.p}% · ${gwStr(r.value)}</span>
            </div>
        `).join('');
    }

    // ─── UPDATE CITY POWERS ───────────────────
    function updateCityPowers(data) {
        if (!data) return;

        // Total generation = jg + wi + pv approximately
        const totalGen = (data.jg || 0) + (data.wi || 0) + (data.pv || 0);

        // Distribute current generation proportionally to installed capacity and type
        CITIES.forEach((city, idx) => {
            let factor = city.capacity / TOTAL_INSTALLED;

            // Adjust by source type
            if (city.type === 'wind') {
                const windRatio = (data.wi || 0) / totalGen;
                factor *= windRatio * (TOTAL_INSTALLED / CITIES.filter(c => c.type === 'wind').reduce((s, c) => s + c.capacity, 0));
            } else if (city.type === 'solar') {
                const solarRatio = (data.pv || 0) / totalGen;
                factor *= solarRatio * (TOTAL_INSTALLED / CITIES.filter(c => c.type === 'solar').reduce((s, c) => s + c.capacity, 0));
            } else if (city.type === 'hydro') {
                const hydroRatio = (data.jgz2 || 0) / totalGen;
                factor *= hydroRatio * (TOTAL_INSTALLED / CITIES.filter(c => c.type === 'hydro').reduce((s, c) => s + c.capacity, 0));
            } else {
                // coal / gas — use conventional generation
                const convRatio = ((data.jgw1 || 0) + (data.jgw2 || 0)) / totalGen;
                const convCities = CITIES.filter(c => c.type === 'coal' || c.type === 'gas');
                const convCapacity = convCities.reduce((s, c) => s + c.capacity, 0);
                factor *= convRatio * (TOTAL_INSTALLED / convCapacity);
            }

            const power = totalGen * factor * MW_TO_GW;
            city._currentPower = Math.max(0, power);

            const el = $id(`cityPower${idx}`);
            if (el) {
                el.textContent = power > 0.005 ? power.toFixed(2) : '0.00';
            }
        });
    }

    // ─── UPDATE STATS ─────────────────────────
    function updateStats(data) {
        if (!data) return;

        const fields = [
            { id: 'valueDemand', val: data.demand },
            { id: 'valueGeneration', val: data.jg },
            { id: 'valueWind', val: data.wi },
            { id: 'valueSolar', val: data.pv },
            { id: 'valueExchange', val: data.swm_p },
        ];

        fields.forEach(f => {
            const el = $id(f.id);
            if (!el) return;
            if (f.val == null) {
                el.textContent = '—';
                return;
            }
            const gw = (f.val * MW_TO_GW).toFixed(2);
            if (el.textContent !== gw) {
                el.textContent = gw;
                el.classList.remove('updating');
                void el.offsetWidth; // force reflow
                el.classList.add('updating');
            }
        });
    }

    // ─── FETCH DATA ───────────────────────────
    async function fetchData() {
        setStatus('loading');

        try {
            const today = new Date().toISOString().split('T')[0];
            const baseUrl = `${PSE_API}?$filter=business_date eq '${today}'`;

            // Try direct fetch first, fallback to CORS proxy
            let resp;
            try {
                resp = await fetch(baseUrl);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            } catch (directErr) {
                console.warn('Direct fetch failed, trying CORS proxy...', directErr.message);
                const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(baseUrl);
                resp = await fetch(proxyUrl);
                if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
            }

            const json = await resp.json();
            const records = json.value || [];

            // Find latest record with actual data
            const validRecords = records.filter(r => r.demand != null);
            if (validRecords.length === 0) throw new Error('Brak danych');

            latestData = validRecords[validRecords.length - 1];

            // Build chart data
            chartData = { labels: [], demand: [], generation: [], wind: [], solar: [] };
            records.forEach(r => {
                const time = r.period.split(' - ')[1] || r.period;
                chartData.labels.push(time);
                chartData.demand.push(r.demand != null ? r.demand * MW_TO_GW : null);
                chartData.generation.push(r.jg != null ? r.jg * MW_TO_GW : null);
                chartData.wind.push(r.wi != null ? r.wi * MW_TO_GW : null);
                chartData.solar.push(r.pv != null ? r.pv * MW_TO_GW : null);
            });

            // Update UI
            updateStats(latestData);
            updateCityPowers(latestData);
            renderChart();
            renderMix(latestData);

            const updateTime = latestData.dtime ? new Date(latestData.dtime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—';
            lastUpdateEl.textContent = updateTime;

            setStatus('online');
        } catch (err) {
            console.error('Fetch error:', err);
            setStatus('error', err.message);
        }

        scheduleNext();
    }

    // ─── STATUS ───────────────────────────────
    function setStatus(state, msg) {
        statusBadge.className = 'status-badge ' + state;
        if (state === 'online') {
            statusText.textContent = 'Na żywo';
        } else if (state === 'error') {
            statusText.textContent = 'Błąd: ' + (msg || '');
        } else {
            statusText.textContent = 'Ładowanie...';
        }
    }

    // ─── SCHEDULE ─────────────────────────────
    function scheduleNext() {
        if (refreshTimer) clearInterval(refreshTimer);

        nextRefreshTime = Date.now() + REFRESH_INTERVAL;

        // Countdown display
        updateCountdown();
        refreshTimer = setInterval(() => {
            const remaining = nextRefreshTime - Date.now();
            if (remaining <= 0) {
                clearInterval(refreshTimer);
                fetchData();
            } else {
                updateCountdown();
            }
        }, 1000);
    }

    function updateCountdown() {
        const remaining = Math.max(0, nextRefreshTime - Date.now());
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000);
        nextRefreshEl.textContent = `Następne odświeżenie: ${min}:${String(sec).padStart(2, '0')}`;
    }

    // ─── RESIZE HANDLING ──────────────────────
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderChart();
        }, 200);
    });

    // ─── INIT ─────────────────────────────────
    function init() {
        renderMap();
        renderChart();
        fetchData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
