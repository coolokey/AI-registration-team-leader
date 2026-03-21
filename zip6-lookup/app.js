/**
 * 台灣郵遞區號六碼查詢 - App Logic
 * 使用 zip5.5432.tw API 查詢 3+3 郵遞區號
 */

(function () {
    'use strict';

    // ========================================
    // DOM Elements
    // ========================================
    const addressInput = document.getElementById('addressInput');
    const searchBtn = document.getElementById('searchBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const resultSection = document.getElementById('resultSection');
    const resultSuccess = document.getElementById('resultSuccess');
    const resultError = document.getElementById('resultError');
    const errorMessage = document.getElementById('errorMessage');
    const zip6Value = document.getElementById('zip6Value');
    const zip5Value = document.getElementById('zip5Value');
    const fullAddress6 = document.getElementById('fullAddress6');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // ========================================
    // State
    // ========================================
    const STORAGE_KEY = 'zip6_history';
    const MAX_HISTORY = 10;
    let isSearching = false;

    // ========================================
    // Initialization
    // ========================================
    function init() {
        createParticles();
        createToast();
        bindEvents();
        loadHistory();
        autoFocusInput();
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

        // Enter key in input (Ctrl+Enter or plain Enter)
        addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
            }
        });

        // Paste button
        pasteBtn.addEventListener('click', handlePaste);

        // Auto-search on paste into input
        addressInput.addEventListener('paste', (e) => {
            // Delay to let the paste complete
            setTimeout(() => {
                if (addressInput.value.trim().length > 5) {
                    handleSearch();
                }
            }, 200);
        });

        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach((btn) => {
            btn.addEventListener('click', handleCopy);
        });

        // Clear history
        clearHistoryBtn.addEventListener('click', clearHistory);
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
                showToast('✅ 已貼上地址');
                // Auto search if the pasted text looks like an address
                if (text.trim().length > 5) {
                    setTimeout(handleSearch, 300);
                }
            }
        } catch (err) {
            showToast('⚠️ 無法存取剪貼簿，請手動貼上');
        }
    }

    // ========================================
    // Copy Handler
    // ========================================
    function handleCopy(e) {
        const btn = e.currentTarget;
        const targetId = btn.getAttribute('data-copy');
        const targetEl = document.getElementById(targetId);
        const text = targetEl.textContent;

        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            const span = btn.querySelector('span');
            const originalText = span.textContent;
            span.textContent = '已複製';
            showToast('📋 已複製到剪貼簿');

            setTimeout(() => {
                btn.classList.remove('copied');
                span.textContent = originalText;
            }, 1500);
        }).catch(() => {
            showToast('⚠️ 複製失敗');
        });
    }

    // ========================================
    // Search Handler
    // ========================================
    async function handleSearch() {
        if (isSearching) return;

        const address = addressInput.value.trim();
        if (!address) {
            shakeInput();
            showToast('⚠️ 請輸入地址');
            return;
        }

        if (address.length < 5) {
            shakeInput();
            showToast('⚠️ 地址太短，請輸入完整地址');
            return;
        }

        setLoading(true);
        hideResults();

        try {
            const data = await queryPostalCode(address);
            handleResult(data, address);
        } catch (error) {
            showError('查詢過程中發生錯誤，請稍後再試。' + (error.message ? `（${error.message}）` : ''));
        } finally {
            setLoading(false);
        }
    }

    // ========================================
    // API Query
    // ========================================
    function queryPostalCode(address) {
        return new Promise((resolve, reject) => {
            const encodedAddress = encodeURIComponent(address);
            const url = `https://zip5.5432.tw/zip5json.py?adrs=${encodedAddress}`;

            // Use JSONP for cross-origin request
            const callbackName = 'zip5Callback_' + Date.now();
            const script = document.createElement('script');

            // Set up timeout
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('查詢逾時'));
            }, 10000);

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
                // Fallback: try with fetch + CORS
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
    // Result Handling
    // ========================================
    function handleResult(data, originalAddress) {
        if (!data) {
            showError('未收到查詢結果，請再試一次。');
            return;
        }

        const zipcode6 = data.zipcode6 || '';
        const zipcode5 = data.zipcode || '';
        const newAddress6 = data.new_adrs6 || data.new_adrs6_2 || '';
        const newAddress5 = data.new_adrs || data.new_adrs2 || '';

        // Check if we got a valid result
        if (!zipcode6 && !zipcode5) {
            showError('無法查詢到此地址的郵遞區號，請確認地址格式是否正確。\n\n提示：請輸入完整地址，例如「台北市中正區重慶南路一段122號」');
            return;
        }

        // Show success result
        zip6Value.textContent = zipcode6 || '無資料';
        zip5Value.textContent = zipcode5 || '無資料';
        fullAddress6.textContent = newAddress6 || newAddress5 || originalAddress;

        resultSuccess.style.display = 'block';
        resultError.style.display = 'none';
        resultSection.style.display = 'block';

        // Animate the result section
        resultSection.style.animation = 'none';
        resultSection.offsetHeight; // trigger reflow
        resultSection.style.animation = 'fadeInUp 0.5s ease-out';

        // Save to history
        if (zipcode6 || zipcode5) {
            addToHistory({
                address: originalAddress,
                zip6: zipcode6,
                zip5: zipcode5,
                fullAddress: newAddress6 || newAddress5,
                timestamp: Date.now(),
            });
        }

        // Scroll to result
        setTimeout(() => {
            resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 200);
    }

    function showError(message) {
        errorMessage.textContent = message;
        resultSuccess.style.display = 'none';
        resultError.style.display = 'block';
        resultSection.style.display = 'block';

        resultSection.style.animation = 'none';
        resultSection.offsetHeight;
        resultSection.style.animation = 'fadeInUp 0.5s ease-out';
    }

    function hideResults() {
        resultSection.style.display = 'none';
        resultSuccess.style.display = 'none';
        resultError.style.display = 'none';
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
