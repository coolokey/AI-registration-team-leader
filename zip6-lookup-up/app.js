/**
 * 台灣郵遞區號六碼查詢 - App Logic
 * 使用 zip5.5432.tw API 查詢 3+3 郵遞區號
 * 支援多筆地址批次查詢
 */

(function () {
    'use strict';

    // ========================================
    // DOM Elements
    // ========================================
    const addressInput = document.getElementById('addressInput');
    const searchBtn = document.getElementById('searchBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const clearInputBtn = document.getElementById('clearInputBtn');
    const resultSection = document.getElementById('resultSection');
    const resultTableBody = document.getElementById('resultTableBody');
    const resultCount = document.getElementById('resultCount');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const progressSection = document.getElementById('progressSection');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const addressCountHint = document.getElementById('addressCount');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // ========================================
    // State
    // ========================================
    const STORAGE_KEY = 'zip6_history';
    const MAX_HISTORY = 20;
    let isSearching = false;
    let batchResults = []; // stores all batch results

    // ========================================
    // Initialization
    // ========================================
    function init() {
        createParticles();
        createToast();
        bindEvents();
        loadHistory();
        autoFocusInput();
        updateAddressCount();
    }

    // ========================================
    // Background Particles
    // ========================================
    function createParticles() {
        const container = document.getElementById('bgParticles');
        const colors = [
            `hsla(230, 85%, 58%, 0.12)`,
            `hsla(160, 75%, 48%, 0.1)`,
            `hsla(270, 70%, 55%, 0.08)`,
        ];

        for (let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            const size = Math.random() * 6 + 3;
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                left: ${Math.random() * 100}%;
                animation-duration: ${Math.random() * 20 + 15}s;
                animation-delay: ${Math.random() * 10}s;
            `;
            container.appendChild(particle);
        }
    }

    // ========================================
    // Toast Notification
    // ========================================
    let toastEl;
    let toastTimer;

    function createToast() {
        toastEl = document.createElement('div');
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
    }

    function showToast(message, duration = 2000) {
        clearTimeout(toastTimer);
        toastEl.textContent = message;
        toastEl.classList.add('show');
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, duration);
    }

    // ========================================
    // Event Binding
    // ========================================
    function bindEvents() {
        // Search button click
        searchBtn.addEventListener('click', handleSearch);

        // Ctrl+Enter to search (Enter now adds new line)
        addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                handleSearch();
            }
        });

        // Paste button
        pasteBtn.addEventListener('click', handlePaste);

        // Clear input button
        clearInputBtn.addEventListener('click', () => {
            addressInput.value = '';
            addressInput.focus();
            updateAddressCount();
            showToast('🗑️ 已清除輸入');
        });

        // Auto-search on paste into input
        addressInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                updateAddressCount();
                if (addressInput.value.trim().length > 5) {
                    handleSearch();
                }
            }, 200);
        });

        // Update address count on input
        addressInput.addEventListener('input', updateAddressCount);

        // Copy all results
        copyAllBtn.addEventListener('click', handleCopyAll);

        // Clear history
        clearHistoryBtn.addEventListener('click', clearHistory);
    }

    // ========================================
    // Address Count
    // ========================================
    function updateAddressCount() {
        const addresses = parseAddresses(addressInput.value);
        const count = addresses.length;
        if (count > 0) {
            addressCountHint.innerHTML = `<span class="hint-icon">📝</span><span>目前有 <span class="count-highlight">${count}</span> 筆地址待查詢（Ctrl+Enter 快速查詢）</span>`;
        } else {
            addressCountHint.innerHTML = `<span class="hint-icon">💡</span><span>每行輸入一筆地址，按 Enter 換行可繼續新增</span>`;
        }
    }

    // ========================================
    // Parse Addresses
    // ========================================
    function parseAddresses(text) {
        return text
            .split(/[\n\r]+/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    // ========================================
    // Auto Focus
    // ========================================
    function autoFocusInput() {
        setTimeout(() => {
            addressInput.focus();
        }, 500);
    }

    // ========================================
    // Paste Handler
    // ========================================
    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                addressInput.value = text;
                addressInput.focus();
                updateAddressCount();
                showToast('✅ 已貼上地址');
                if (text.trim().length > 5) {
                    setTimeout(handleSearch, 300);
                }
            }
        } catch (err) {
            showToast('⚠️ 無法存取剪貼簿，請手動貼上');
        }
    }

    // ========================================
    // Copy All Results
    // ========================================
    function handleCopyAll() {
        if (batchResults.length === 0) return;

        // Build tab-separated text for easy pasting into spreadsheets
        const header = '地址\t六碼\t五碼\t狀態';
        const rows = batchResults.map(r => {
            return `${r.address}\t${r.zip6 || '--'}\t${r.zip5 || '--'}\t${r.success ? '成功' : '失敗'}`;
        });
        const text = [header, ...rows].join('\n');

        navigator.clipboard.writeText(text).then(() => {
            copyAllBtn.classList.add('copied');
            const span = copyAllBtn.querySelector('span');
            const original = span.textContent;
            span.textContent = '已複製';
            showToast('📋 已複製全部結果到剪貼簿（可直接貼到 Excel）');

            setTimeout(() => {
                copyAllBtn.classList.remove('copied');
                span.textContent = original;
            }, 2000);
        }).catch(() => {
            showToast('⚠️ 複製失敗');
        });
    }

    // ========================================
    // Search Handler (Batch)
    // ========================================
    async function handleSearch() {
        if (isSearching) return;

        const rawText = addressInput.value.trim();
        if (!rawText) {
            shakeInput();
            showToast('⚠️ 請輸入地址');
            return;
        }

        const addresses = parseAddresses(rawText);
        if (addresses.length === 0) {
            shakeInput();
            showToast('⚠️ 請輸入至少一筆地址');
            return;
        }

        // Validate all addresses
        const tooShort = addresses.filter(a => a.length < 5);
        if (tooShort.length === addresses.length) {
            shakeInput();
            showToast('⚠️ 地址太短，請輸入完整地址');
            return;
        }

        setLoading(true);
        batchResults = [];
        resultSection.style.display = 'none';

        // Initialize table with loading rows
        resultTableBody.innerHTML = '';
        resultSection.style.display = 'block';
        resultSection.style.animation = 'none';
        resultSection.offsetHeight;
        resultSection.style.animation = 'fadeInUp 0.5s ease-out';

        addresses.forEach((addr, i) => {
            const row = createResultRow(i + 1, addr, null, 'loading');
            resultTableBody.appendChild(row);
        });

        // Show progress
        progressSection.style.display = 'block';
        let completed = 0;
        updateProgress(0, addresses.length);

        // Query each address with concurrency limit
        const CONCURRENCY = 3;
        const results = new Array(addresses.length);

        async function processAddress(index) {
            const address = addresses[index];
            if (address.length < 5) {
                results[index] = { address, success: false, error: '地址太短' };
                completed++;
                updateProgress(completed, addresses.length);
                updateRowResult(index, results[index]);
                return;
            }

            try {
                const data = await queryPostalCode(address);
                const zip6 = data?.zipcode6 || '';
                const zip5 = data?.zipcode || '';
                const fullAddr = data?.new_adrs6 || data?.new_adrs6_2 || data?.new_adrs || data?.new_adrs2 || '';

                if (zip6 || zip5) {
                    results[index] = { address, zip6, zip5, fullAddress: fullAddr, success: true };
                } else {
                    results[index] = { address, success: false, error: '無法查詢' };
                }
            } catch (err) {
                results[index] = { address, success: false, error: err.message || '查詢失敗' };
            }

            completed++;
            updateProgress(completed, addresses.length);
            updateRowResult(index, results[index]);
        }

        // Process with concurrency limit
        const queue = [...Array(addresses.length).keys()]; // [0, 1, 2, ...]
        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY, addresses.length); w++) {
            workers.push(runWorker(queue, processAddress));
        }
        await Promise.all(workers);

        // Done
        batchResults = results.filter(Boolean);
        const successCount = batchResults.filter(r => r.success).length;
        const failCount = batchResults.filter(r => !r.success).length;
        resultCount.textContent = `${successCount} 成功 / ${failCount} 失敗`;

        // Save successful results to history
        batchResults.filter(r => r.success).forEach(r => {
            addToHistory({
                address: r.address,
                zip6: r.zip6,
                zip5: r.zip5,
                fullAddress: r.fullAddress,
                timestamp: Date.now(),
            });
        });

        // Hide progress
        progressSection.style.display = 'none';
        setLoading(false);

        // Scroll to result
        setTimeout(() => {
            resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    }

    async function runWorker(queue, processFn) {
        while (queue.length > 0) {
            const index = queue.shift();
            if (index !== undefined) {
                await processFn(index);
            }
        }
    }

    // ========================================
    // Progress
    // ========================================
    function updateProgress(completed, total) {
        const pct = Math.round((completed / total) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `查詢中... (${completed}/${total})`;
    }

    // ========================================
    // Table Row Management
    // ========================================
    function createResultRow(num, address, result, status) {
        const tr = document.createElement('tr');
        tr.style.animationDelay = `${(num - 1) * 0.05}s`;

        if (status === 'loading') {
            tr.className = 'row-loading';
            tr.innerHTML = `
                <td>${num}</td>
                <td class="td-address">${escapeHTML(address)}</td>
                <td style="text-align:center;">
                    <span class="status-badge loading">查詢中</span>
                </td>
                <td style="text-align:center;">--</td>
                <td style="text-align:center;">
                    <span class="status-badge loading">⏳</span>
                </td>
            `;
        }
        return tr;
    }

    function updateRowResult(index, result) {
        const rows = resultTableBody.querySelectorAll('tr');
        const row = rows[index];
        if (!row) return;

        row.className = '';
        row.style.animation = 'none';
        row.offsetHeight;
        row.style.animation = 'fadeInUp 0.3s ease-out both';

        if (result.success) {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td class="td-address">${escapeHTML(result.address)}</td>
                <td style="text-align:center;">
                    <span class="zip-value zip6" title="點擊複製" data-zip="${escapeHTML(result.zip6)}">${escapeHTML(result.zip6 || '--')}</span>
                </td>
                <td style="text-align:center;">
                    <span class="zip-value zip5" title="點擊複製" data-zip="${escapeHTML(result.zip5)}">${escapeHTML(result.zip5 || '--')}</span>
                </td>
                <td style="text-align:center;">
                    <span class="status-badge success">✓ 成功</span>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td class="td-address">${escapeHTML(result.address)}</td>
                <td style="text-align:center;" colspan="1">--</td>
                <td style="text-align:center;">--</td>
                <td style="text-align:center;">
                    <span class="status-badge error">✗ ${escapeHTML(result.error || '失敗')}</span>
                </td>
            `;
        }

        // Add click-to-copy for zip values
        row.querySelectorAll('.zip-value').forEach(el => {
            el.addEventListener('click', () => {
                const zip = el.getAttribute('data-zip');
                if (zip) {
                    navigator.clipboard.writeText(zip).then(() => {
                        showToast(`📋 已複製 ${zip}`);
                    });
                }
            });
        });
    }

    // ========================================
    // API Query
    // ========================================
    function queryPostalCode(address) {
        return new Promise((resolve, reject) => {
            const encodedAddress = encodeURIComponent(address);
            const url = `https://zip5.5432.tw/zip5json.py?adrs=${encodedAddress}`;

            // Use JSONP for cross-origin request
            const callbackName = 'zip5Callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const script = document.createElement('script');

            // Set up timeout
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('查詢逾時'));
            }, 15000);

            // Cleanup function
            function cleanup() {
                clearTimeout(timeout);
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            }

            // Set up callback
            window[callbackName] = function (data) {
                cleanup();
                resolve(data);
            };

            // Set up error handler
            script.onerror = function () {
                cleanup();
                fetchPostalCode(address).then(resolve).catch(reject);
            };

            script.src = `${url}&callback=${callbackName}`;
            document.body.appendChild(script);
        });
    }

    function fetchPostalCode(address) {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://zip5.5432.tw/zip5json.py?adrs=${encodedAddress}`;
        return fetch(url)
            .then((response) => {
                if (!response.ok) throw new Error('網路回應錯誤');
                return response.json();
            });
    }

    // ========================================
    // UI Helpers
    // ========================================
    function setLoading(loading) {
        isSearching = loading;
        if (loading) {
            searchBtn.classList.add('loading');
        } else {
            searchBtn.classList.remove('loading');
        }
    }

    function shakeInput() {
        addressInput.style.animation = 'none';
        addressInput.offsetHeight;
        addressInput.style.animation = 'shake 0.4s ease-out';
    }

    // Add shake animation dynamically
    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
        }
    `;
    document.head.appendChild(shakeStyle);

    // ========================================
    // History Management
    // ========================================
    function getHistory() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch {
            // Silently fail
        }
    }

    function addToHistory(entry) {
        const history = getHistory();

        // Remove duplicate if exists
        const filtered = history.filter(
            (h) => h.address !== entry.address
        );

        // Add new entry at the beginning
        filtered.unshift(entry);

        // Limit to max count
        const trimmed = filtered.slice(0, MAX_HISTORY);

        saveHistory(trimmed);
        renderHistory(trimmed);
    }

    function loadHistory() {
        const history = getHistory();
        if (history.length > 0) {
            renderHistory(history);
        }
    }

    function clearHistory() {
        localStorage.removeItem(STORAGE_KEY);
        historySection.style.display = 'none';
        showToast('🗑️ 查詢紀錄已清除');
    }

    function renderHistory(history) {
        if (!history || history.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        historyList.innerHTML = '';

        history.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.style.animationDelay = `${index * 0.05}s`;
            el.innerHTML = `
                <span class="history-item-address">${escapeHTML(item.address)}</span>
                <span class="history-item-zip">${escapeHTML(item.zip6 || item.zip5 || '--')}</span>
            `;
            el.addEventListener('click', () => {
                addressInput.value = item.address;
                addressInput.focus();
                updateAddressCount();
                handleSearch();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            historyList.appendChild(el);
        });
    }

    // ========================================
    // Utilities
    // ========================================
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========================================
    // Start
    // ========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
