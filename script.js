document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const overlay = document.getElementById('loading-overlay');
    const tableBody = document.getElementById('table-body');
    const fullMarketBody = document.getElementById('full-market-body');
    const updateTime = document.getElementById('update-time');
    
    // 這就是控制電子魚下方文字的指揮棒！
    const progressSubtext = document.getElementById('loading-subtext'); 
    const exportBtn = document.getElementById('export-btn');

    const API_BASE = 'https://python-stock-radar.onrender.com/api';
    let fullMarketData = []; 

    scanBtn.addEventListener('click', async () => {
        // 1. 顯示電子魚動畫，隱藏匯出按鈕
        overlay.classList.remove('hidden');
        progressSubtext.textContent = "系統啟動：正在向台灣證交所取得全市場清單... 📡";
        exportBtn.style.display = 'none'; 
        
        fullMarketBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">資料運算中...</td></tr>';
        
        try {
            const listRes = await fetch(`${API_BASE}/get_list`);
            const stockDict = await listRes.json();
            const allTickers = Object.keys(stockDict);
            
            // 每批 100 檔，確保 512MB 免費記憶體安穩運作
            const chunkSize = 100; 
            let allRecords = [];

            for (let i = 0; i < allTickers.length; i += chunkSize) {
                const chunk = allTickers.slice(i, i + chunkSize);
                const currentEnd = Math.min(i + chunkSize, allTickers.length);
                
                // 🌟 2. 讓電子魚的文字跟著進度跳動！
                progressSubtext.textContent = `[即時運算中] 正在下載並萃取第 ${i + 1} 到 ${currentEnd} 檔... (共 ${allTickers.length} 檔) 🐟`;
                
                const chunkRes = await fetch(`${API_BASE}/scan_chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickers: chunk, stock_dict: stockDict })
                });
                
                const chunkData = await chunkRes.json();
                allRecords = allRecords.concat(chunkData);
            }

            // 3. 抓取完畢，進入排名階段
            progressSubtext.textContent = "大數據萃取完畢！正在進行全市場 PR 值排名... 🏆";

            const rankRes = await fetch(`${API_BASE}/calculate_rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: allRecords })
            });
            
            fullMarketData = await rankRes.json();

            // 4. 畫出上下兩個表格
            renderTop20Table(fullMarketData.slice(0, 20));  
            renderFullMarketTable(fullMarketData);
            
            exportBtn.style.display = 'inline-block'; // 顯示匯出按鈕
            if(updateTime) updateTime.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });

        } catch (error) {
            console.error(error);
            progressSubtext.textContent = "系統異常中止！請查看錯誤紀錄。 ❌";
            alert("運算發生錯誤，請查看 Console！");
        } finally {
            // 5. 算完之後，把動畫隱藏起來，並把文字改回預設狀態
            setTimeout(() => {
                overlay.classList.add('hidden');
                progressSubtext.textContent = "正在抓取並運算全台股特徵資料，請稍候";
            }, 1000); 
        }
    });

    // 渲染上方精選 Top 20 榜單 (保留你原本的樣式)
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
                <td style="color: #ef4444; font-weight: bold;">${stock.score}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // 渲染下方全市場獨立滾動窗
    function renderFullMarketTable(data) {
        fullMarketBody.innerHTML = '';
        if (data.length === 0) {
            fullMarketBody.innerHTML = '<tr><td colspan="6" class="empty-state" style="text-align:center;">無數據</td></tr>';
            return;
        }
        data.forEach(stock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align:center;">${stock.rank}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${stock.id}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${stock.name}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">$${stock.close}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${stock.score}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color:#059669; font-weight:bold;">PR ${stock.pr_value}</td>
            `;
            fullMarketBody.appendChild(tr);
        });
    }

    // 匯出按鈕的邏輯
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
});
