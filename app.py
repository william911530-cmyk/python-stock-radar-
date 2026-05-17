# -*- coding: utf-8 -*-
from flask import Flask, jsonify
from flask_cors import CORS
import sys, requests, urllib3, io
import numpy as np
import pandas as pd
import yfinance as yf
import warnings
import traceback
import sys, requests, urllib3, io, gc

warnings.filterwarnings('ignore')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app)

def get_tw_stock_list():
    stock_dict = {}
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        for m in [2, 4]:
            url = f"https://isin.twse.com.tw/isin/C_public.jsp?strMode={m}"
            res = requests.get(url, headers=headers, verify=False, timeout=15)
            df = pd.read_html(io.StringIO(res.text))[0].iloc[1:]
            for _, row in df.iterrows():
                try:
                    code_name = str(row[0]).split()
                    if len(code_name) == 2:
                        code, name = code_name
                        cat = str(row[4])
                        if len(code) == 4 or code.startswith('00'):
                            if cat not in ['權證', '牛熊證', '認購(售)權證']:
                                suffix = ".TW" if m == 2 else ".TWO"
                                stock_dict[f"{code}{suffix}"] = {"name": name, "ind": cat}
                except: continue
    except Exception as e: 
        print(f"抓取清單失敗: {e}")
    return stock_dict

def run_ai_scanner():
    print("🔍 [進度 1] 開始向證交所抓取全台股清單...")
    stock_dict = get_tw_stock_list()
    
    if not stock_dict:
        print("❌ [錯誤] 抓不到台股清單，可能被台灣證交所封鎖了！")
        return []
        
    # 【封印解除】這次我們真的要抓全市場所有的股票了！
    all_tickers = list(stock_dict.keys()) 
    print(f"✅ [進度 2] 成功取得 {len(all_tickers)} 檔清單，準備啟動「螞蟻搬大象」分批抓取模式...")
    
    records = []
    batch_size = 50  # 【瘦身 1】每次只處理 50 檔，細嚼慢嚥
    
    
    # 迴圈分批處理
    # 迴圈分批處理
    for i in range(0, len(all_tickers), batch_size):
        batch = all_tickers[i:i + batch_size]
        print(f"⏳ [處理中] 正在下載第 {i+1} 到 {i+len(batch)} 檔資料...")
        
        try:
            # 【瘦身 2】threads=False 關閉多執行緒，讓它排隊乖乖下載，絕對不撐爆記憶體
            data = yf.download(batch, period="100d", interval="1d", group_by='ticker', auto_adjust=False, progress=False, threads=False)
            
            if data.empty:
                continue
                
            for ticker in batch:
                try:
                    df = data[ticker] if len(batch) > 1 else data
                    if df.empty or len(df) < 60: continue
                    df = df.dropna()
                    close = df['Close']
                    if len(close) < 60: continue

                    ma5 = close.rolling(5).mean().iloc[-1]
                    ma20 = close.rolling(20).mean().iloc[-1]
                    ma60 = close.rolling(60).mean().iloc[-1]
                    
                    hist_vol = close.pct_change().rolling(20).std().iloc[-1] * np.sqrt(252) * 100
                    
                    std20 = close.rolling(20).std().iloc[-1]
                    bb_upper = ma20 + 2 * std20
                    bb_width = ((bb_upper - (ma20 - 2 * std20)) / ma20) * 100
                    
                    current_close = close.iloc[-1]
                    
                    p_to_ma60 = (current_close / ma60 - 1) * 100
                    trend_str = (ma5 / ma60 - 1) * 100
                    p_to_ma20 = (current_close / ma20 - 1) * 100
                    p_to_bbupper = (current_close / bb_upper - 1) * 100
                    roc_10 = (current_close - close.iloc[-11]) / close.iloc[-11] * 100

                    if np.isnan(hist_vol) or np.isnan(roc_10): continue

                    records.append({
                        'id': ticker.replace(".TW", "").replace(".TWO", ""),
                        'name': stock_dict[ticker]['name'],
                        'close': round(current_close, 2),
                        'F_Hist_Vol': hist_vol,
                        'F_BB_Width': bb_width,
                        'F_P_to_MA60': p_to_ma60,
                        'F_Trend_Strength': trend_str,
                        'F_P_to_MA20': p_to_ma20,
                        'F_P_to_BBUpper': p_to_bbupper,
                        'F_ROC_10': roc_10,
                        'MA5': ma5
                    })
                except: continue
                
            # 【瘦身 3】這一批 50 檔算完後，立刻把龐大的歷史資料刪除，並呼叫 gc 回收記憶體
            del data
            gc.collect()
            
        except Exception as e:
            print(f"⚠️ [警告] 批次抓取發生錯誤，已跳過: {e}")
            continue
    if not records:
        print("❌ [錯誤] 所有批次皆失敗，或全市場沒有符合基礎資料的股票。")
        return []

    print(f"✅ [進度 3] 歷史資料下載完畢！共萃取出 {len(records)} 檔有效標的，進入 AI 排名模型...")

    df_res = pd.DataFrame(records)
    features = ['F_Hist_Vol', 'F_BB_Width', 'F_P_to_MA60', 'F_Trend_Strength', 'F_P_to_MA20', 'F_P_to_BBUpper', 'F_ROC_10']
    weights = [29.08, 19.33, 10.39, 7.67, 7.26, 5.09, 4.25]

    for f in features:
        df_res[f + '_Rank'] = df_res[f].rank(pct=True)

    df_res['score'] = 0.0
    for f, w in zip(features, weights):
        df_res['score'] += df_res[f + '_Rank'] * w

    max_score = sum(weights)
    df_res['score'] = round((df_res['score'] / max_score) * 100, 2)

    df_filtered = df_res[df_res['close'] >= df_res['MA5']].copy()
    top20 = df_filtered.sort_values(by='score', ascending=False).head(20)
    
    top20.insert(0, 'rank', range(1, len(top20) + 1))
    result = top20[['rank', 'id', 'name', 'close', 'score']].to_dict(orient='records')
    print(f"🎉 運算大功告成！今日最強 AI 妖股名單已出爐。")
    return result

@app.route('/api/scan', methods=['GET'])
def api_scan():
    data = run_ai_scanner()
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
