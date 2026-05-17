document.addEventListener('DOMContentLoaded', () => {
    // 1. 精準抓取你 HTML 裡面的所有代號
    const scanBtn = document.getElementById('scan-btn');
    const overlay = document.getElementById('loading-overlay');
    const tableBody = document.getElementById('table-body');
    const fullMarketBody = document.getElementById('full-market-body');
    const updateTime = document.getElementById('update-time');
    const progressSubtext = document.getElementById('loading-subtext'); 
    const exportBtn = document.getElementById('export-btn');

    // 防呆：如果找不到按鈕，就在後台報錯，不要讓整個網頁壞掉
    if (!scanBtn) {
        console.error("找不到檢索按鈕！請確認 HTML 裡面的 id='scan-btn' 還在。");
        return;
    }

    const API_BASE = 'https://python-stock-radar.onrender.com/api';
    let fullMarketData = []; 

    scanBtn.addEventListener('click', async () => {
        // 顯示電子魚動畫
        if(overlay) overlay.classList.remove('hidden');
        if(progressSubtext) progressSubtext.textContent = "系統啟動：正在向台灣證交所取得全市場清單... 📡";
        if(exportBtn) exportBtn.style.display = 'none'; 
        
        if(fullMarketBody) fullMarketBody.innerHTML = '<tr><td colspan="6" class="empty-state">資料運算中...</td></tr>';
        
        try {
            const listRes = await fetch(`${API_BASE}/get_list`);
            const stockDict = await listRes.json();
            const allTickers = Object.keys(stockDict);
            
            // 每批 100 檔，穩穩抓取
            const chunkSize = 100; 
            let allRecords = [];

            for (let i = 0; i < allTickers.length; i += chunkSize) {
                const chunk = allTickers.slice(i, i + chunkSize);
                const currentEnd = Math.min(i + chunkSize, allTickers.length);
                
                // 🌟 讓電子魚的文字跟著進度跳動
                if(progressSubtext) progressSubtext.textContent = `[即時運算中] 正在下載並萃取第 ${i + 1} 到 ${currentEnd} 檔... (共 ${allTickers.length} 檔) 🐟`;
                
                const chunkRes = await fetch(`${API_BASE}/scan_chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickers: chunk, stock_dict: stockDict })
                });
                
                const chunkData = await chunkRes.json();
                allRecords = allRecords.concat(chunkData);
            }

            if(progressSubtext) progressSubtext.textContent = "大數據萃取完畢！正在進行全市場 PR 值排名... 🏆";

            const rankRes = await fetch(`${API_BASE}/calculate_rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: allRecords })
            });
            
            fullMarketData = await rankRes.json();

            // 畫出表格
            renderTop20Table(fullMarketData.slice(0, 20));  
            renderFullMarketTable(fullMarketData);
            
            if(exportBtn) exportBtn.style.display = 'inline-block'; 
            if(updateTime) updateTime.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });

        } catch (error) {
            console.error(error);
            if(progressSubtext) progressSubtext.textContent = "系統異常中止！請查看錯誤紀錄。 ❌";
            alert("運算發生錯誤，請查看 Console！");
        } finally {
            // 算完後隱藏電子魚
            setTimeout(() => {
                if(overlay) overlay.classList.add('hidden');
                if(progressSubtext) progressSubtext.textContent = "正在抓取並運算全台股特徵資料，請稍候";
            }, 1000); 
        }
    });

    // 渲染上方 TOP 20
    function renderTop20Table(data) {
        if(!tableBody) return;
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">目前全市場無符合 5MA 條件標的</td></tr>';
            return;
        }
        data.forEach(stock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${stock.rank}</strong></td>
                <td style="color:#3b82f6; font-weight:bold;">${stock.id}</td>
                <td>${stock.name}</td>
                <td>$${stock.close}</td>
                <td style="color: #ef4444; font-weight: bold;">${stock.score}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // 渲染下方全市場觀測窗
    function renderFullMarketTable(data) {
        if(!fullMarketBody) return;
        fullMarketBody.innerHTML = '';
        if (data.length === 0) {
            fullMarketBody.innerHTML = '<tr><td colspan="6" class="empty-state">無數據</td></tr>';
            return;
        }
        data.forEach(stock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align:center;">${stock.rank}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color:#3b82f6; font-weight:bold;">${stock.id}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${stock.name}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">$${stock.close}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${stock.score}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color:#059669; font-weight:bold;">PR ${stock.pr_value}</td>
            `;
            fullMarketBody.appendChild(tr);
        });
    }

    // 匯出功能
    if(exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!fullMarketData || fullMarketData.length === 0) return alert("尚無資料可供匯出，請先點擊重新檢索！");

            let csvContent = "\uFEFF總排名,股票代號,股票名稱,收盤價,綜合特徵分數,全市場PR值\n";
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
    }
});
