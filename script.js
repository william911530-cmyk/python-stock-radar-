document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const overlay = document.getElementById('loading-overlay');
    const tableBody = document.getElementById('table-body');
    const updateTime = document.getElementById('update-time');
    const progressSubtext = document.querySelector('.cyber-subtext');

    // 連接你的雲端後端
    const API_BASE = 'https://python-stock-radar.onrender.com/api';

    scanBtn.addEventListener('click', async () => {
        overlay.classList.remove('hidden');
        progressSubtext.textContent = "系統啟動：正在向台灣證交所取得全市場清單...";
        
        try {
            // 階段一：取得 1800 檔清單
            const listRes = await fetch(`${API_BASE}/get_list`);
            if (!listRes.ok) throw new Error('無法取得台股清單，請確認 API 是否清醒');
            const stockDict = await listRes.json();
            const allTickers = Object.keys(stockDict);
            
            if (allTickers.length === 0) throw new Error('證交所回傳空清單，可能遭到暫時阻擋');

            // 階段二：螞蟻搬大象 (Map 派發任務)
            const chunkSize = 200; // 每批 200 檔，保證不超時不爆 Ram
            let allRecords = [];

            for (let i = 0; i < allTickers.length; i += chunkSize) {
                const chunk = allTickers.slice(i, i + chunkSize);
                const currentEnd = Math.min(i + chunkSize, allTickers.length);
                
                // 動態更新網頁畫面上的文字！超帥！
                progressSubtext.textContent = `[深度掃描中] 正在分析第 ${i + 1} 到 ${currentEnd} 檔... (共 ${allTickers.length} 檔)`;

                const chunkRes = await fetch(`${API_BASE}/scan_chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickers: chunk, stock_dict: stockDict })
                });
                
                if (!chunkRes.ok) throw new Error(`批次 ${i} 處理失敗，伺服器可能過載`);
                const chunkData = await chunkRes.json();
                allRecords = allRecords.concat(chunkData);
            }

            progressSubtext.textContent = "資料萃取完畢！正在進行大數據 PR 值綜合排名...";

            // 階段三：終極排名 (Reduce)
            const rankRes = await fetch(`${API_BASE}/calculate_rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: allRecords })
            });
            
            if (!rankRes.ok) throw new Error('AI 排名運算失敗');
            const finalTop20 = await rankRes.json();

            renderTable(finalTop20);
            updateTime.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });

        } catch (error) {
            console.error('執行失敗:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:red;">系統異常中止！<br>錯誤訊息: ${error.message}</td></tr>`;
        } finally {
            overlay.classList.add('hidden');
            // 復原預設文字
            setTimeout(() => { progressSubtext.textContent = "正在抓取並運算全台股特徵資料，請稍候"; }, 1000);
        }
    });

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">大盤偏弱，目前沒有符合站上 5MA 條件的標的</td></tr>';
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
});
