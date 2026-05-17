document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const overlay = document.getElementById('loading-overlay');
    const tableBody = document.getElementById('table-body');
    const updateTime = document.getElementById('update-time');

    scanBtn.addEventListener('click', async () => {
        // 1. 顯示電子魚 Loading 畫面
        overlay.classList.remove('hidden');
        
        try {
            // 2. 真實向你電腦上的 Python API 發送請求！
            const response = await fetch('https://python-stock-radar.onrender.com/api/scan');
            
            // 確保伺服器有正常回應
            if (!response.ok) {
                throw new Error(`伺服器錯誤: ${response.status}`);
            }

            // 將拿到的資料轉成 JSON 格式
            const realData = await response.json();
            
            // 3. 把拿到的真實資料放進表格
            renderTable(realData);
            
            // 更新最後檢索時間
            const now = new Date();
            updateTime.textContent = now.toLocaleTimeString('zh-TW', { hour12: false });

        } catch (error) {
            console.error('抓取資料失敗:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:red;">掃描失敗，請確認 Python API 伺服器是否已啟動！<br>錯誤訊息: ${error.message}</td></tr>`;
        } finally {
            // 無論成功或失敗，最後都隱藏 Loading 畫面
            overlay.classList.add('hidden');
        }
    });

    function renderTable(data) {
        tableBody.innerHTML = ''; // 清空現有表格
        
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">目前沒有符合條件的標的</td></tr>';
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
