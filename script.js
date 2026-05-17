document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const overlay = document.getElementById('loading-overlay');
    const tableBody = document.getElementById('table-body');
    const fullMarketBody = document.getElementById('full-market-body');
    const updateTime = document.getElementById('update-time');
    const progressSubtext = document.querySelector('.cyber-subtext');
    const exportBtn = document.getElementById('export-btn');

    const API_BASE = 'https://python-stock-radar.onrender.com/api';
    let fullMarketData = []; // 用於裝載全市場資料

    scanBtn.addEventListener('click', async () => {
        overlay.classList.remove('hidden');
        progressSubtext.textContent = "系統啟動：正在向台灣證交所取得全市場清單...";
        exportBtn.style.display = 'none'; // 重新檢索時先隱藏匯出鈕
        
        try {
            // 階段一：取得 1800+ 檔完整股票清單
            const listRes = await fetch(`${API_BASE}/get_list`);
            if (!listRes.ok) throw new Error('無法取得台股清單，請確認 API 是否正常運作');
            const stockDict = await listRes.json();
            const allTickers = Object.keys(stockDict);
            
            if (allTickers.length === 0) throw new Error('證交所回傳空清單，請稍後再試');

            // 階段二：Map 任務派發 (分批抓取特徵)
            const chunkSize = 200; 
            let allRecords = [];

            for (let i = 0; i < allTickers.length; i += chunkSize) {
                const chunk = allTickers.slice(i, i + chunkSize);
                const currentEnd = Math.min(i + chunkSize, allTickers.length);
                
                // 動態在畫面上跳動進度，科技感拉滿！
                progressSubtext.textContent = `[即時運算中] 正在下載並萃取第 ${i + 1} 到 ${currentEnd} 檔特徵... (總共 ${allTickers.length} 檔)`;

                const chunkRes = await fetch(`${API_BASE}/scan_chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickers: chunk, stock_dict: stockDict })
                });
                
                if (!chunkRes.ok) throw new Error(`批次 ${i} 處理失敗，伺服器可能過載`);
                const chunkData = await chunkRes.json();
                allRecords = allRecords.concat(chunkData);
            }

            progressSubtext.textContent = "特徵大數據萃取完畢！正在進行全市場 PR 值排名...";

            // 階段三：Reduce 終極排名與歸約
            const rankRes = await fetch(`${API_BASE}/calculate_rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: allRecords })
            });
            
            if (!rankRes.ok) throw new Error('AI 排名權重模型運算失敗');
            fullMarketData = await rankRes.json(); // 拿到完整的全市場成績單

            // 🌟 核心分流渲染！
            renderTop20Table(fullMarketData.slice(0, 20));  // 上方精選榜依然只留前 20 名
            renderFullMarketTable(fullMarketData);         // 下方滾動窗渲染完整 1800 檔
            
            // 運算大成功，浮現匯出 CSV 按鈕
            exportBtn.style.display = 'inline-block';
            updateTime.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });

        } catch (error) {
            console.error('執行失敗:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:red;">系統異常中止！<br>錯誤訊息: ${error.message}</td></tr>`;
            fullMarketBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:red;">無法載入數據: ${error.message}</td></tr>`;
        } finally {
            overlay.classList.add('hidden');
            setTimeout(() => { progressSubtext.textContent = "正在抓取並運算全台股特徵資料，請稍候"; }, 1000);
        }
    });

    // 渲染上方精選 Top 20 榜單
    function renderTop20Table(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">目前全市場無符合 5MA 條件標的</td></tr>';
            return;
        }
        data.forEach(stock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${stock.rank}</strong></td>
                <td>${stock.id}</td>
                <td>${stock.name}</td>
                <td>${stock.close}</td>
                <td class="score-high">${stock.score}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // 渲染下方全市場獨立滾動窗
    function renderFullMarketTable(data) {
        fullMarketBody.innerHTML = '';
        if (data.length === 0) {
            fullMarketBody.innerHTML = '<tr><td colspan="6" class="empty-state">無數據</td></tr>';
            return;
        }
        data.forEach(stock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;">${stock.rank}</td>
                <td>${stock.id}</td>
                <td>${stock.name}</td>
                <td>$${stock.close}</td>
                <td>${stock.score}</td>
                <td style="color:#0284c7; font-weight:bold;">PR ${stock.pr_value}</td>
            `;
            fullMarketBody.appendChild(tr);
        });
    }

    // 📥 點擊綠色按鈕一鍵匯出完整的 CSV 資料表
    exportBtn.addEventListener('click', () => {
        if (fullMarketData.length === 0) return alert("尚無資料可供匯出，請先點擊重新檢索！");

        let csvContent = "\uFEFF"; // 塞入 UTF-8 BOM 防 Excel 開啟變亂碼
        csvContent += "總排名,股票代號,股票名稱,收盤價,綜合特徵分數,全市場PR值\n";

        fullMarketData.forEach(row => {
            csvContent += `${row.rank},${row.id},${row.name},${row.close},${row.score},${row.pr_value}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        
        const today = new Date().toISOString().slice(0, 10);
        link.setAttribute("download", `台股AI量化雷達全市場PR總表_${today}.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
