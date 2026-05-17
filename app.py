# -*- coding: utf-8 -*-
from flask import Flask, jsonify
from flask_cors import CORS
import sys, requests, urllib3
import numpy as np
import pandas as pd
import yfinance as yf
import warnings

warnings.filterwarnings('ignore')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
# 允許所有來源發送請求 (開發測試用)
CORS(app)

# --- 這裡保留你原本強大的爬蟲邏輯 ---
def get_tw_stock_list():
    stock_dict = {}
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        for m in [2, 4]:
            url = f"https://isin.twse.com.tw/isin/C_public.jsp?strMode={m}"
            res = requests.get(url, headers=headers, verify=False, timeout=15)
            df = pd.read_html(res.text)[0].iloc[1:]
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
    stock_dict = get_tw_stock_list()
    # 解除封印！抓取 stock_dict 裡面的所有台股標的
    all_tickers = list(stock_dict.keys())[:50]
    records = []
    
    # 下載歷史資料
    data = yf.download(all_tickers, period="100d", interval="1d", group_by='ticker', auto_adjust=False, progress=False, threads=True)
    
    for ticker in all_tickers:
        try:
            df = data[ticker] if len(all_tickers) > 1 else data
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

    if not records:
        return []

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
    
    # 加上排名，並轉換成可以回傳給網頁的字典格式 (List of Dicts)
    top20.insert(0, 'rank', range(1, len(top20) + 1))
    
    # 只回傳前端需要的欄位
    result = top20[['rank', 'id', 'name', 'close', 'score']].to_dict(orient='records')
    return result

# --- 這裡就是你的 API 窗口 ---
@app.route('/api/scan', methods=['GET'])
def api_scan():
    print("收到前端請求，開始啟動 AI 動能雷達掃描...")
    data = run_ai_scanner()
    print(f"掃描完成，回傳 {len(data)} 筆資料給前端！")
    return jsonify(data)

if __name__ == '__main__':
    # 啟動伺服器，預設會跑在 http://127.0.0.1:5000
    app.run(debug=True, host='127.0.0.1', port=5000)
