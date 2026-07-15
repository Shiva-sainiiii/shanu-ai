from http.server import BaseHTTPRequestHandler
import json
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from datetime import datetime
import pytz

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # CORS handle
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body)
            query = data.get('query', '')

            if not query:
                return self.send_json(400, {"error": "Query missing"})

            # Current date bhi bhej denge AI ko
            ist = pytz.timezone('Asia/Kolkata')
            current_date = datetime.now(ist).strftime("%d %B %Y")

            # Step 1: DuckDuckGo se 5 best results nikalo
            search_results = []
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=5, timelimit="y"): # y = past year
                    search_results.append({
                        "title": r.get('title', ''),
                        "link": r.get('href', ''),
                        "snippet": r.get('body', '')
                    })

            # Step 2: Top 2 links ka content scrape karo
            scraped_content = ""
            sources = []
            for i, result in enumerate(search_results[:2]):
                try:
                    url = result['link']
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                    page = requests.get(url, timeout=8, headers=headers)
                    soup = BeautifulSoup(page.text, 'lxml')
                    
                    # Sirf main paragraphs nikal
                    paragraphs = soup.find_all('p')
                    text = ' '.join([p.get_text() for p in paragraphs[:8]])
                    
                    scraped_content += f"\n--- SOURCE {i+1}: {result['title']} ---\n{text[:1500]}\n"
                    sources.append(url)
                    
                except Exception as e:
                    print(f"Scrape error for {url}: {e}")
                    continue

            # Step 3: AI ko dene ke liye final data
            final_data = {
                "current_date": current_date,
                "query": query,
                "search_results": search_results,
                "scraped_content": scraped_content[:4000], # 4000 char limit
                "sources": sources
            }

            self.send_json(200, final_data)

        except Exception as e:
            print("Browse Error:", e)
            self.send_json(500, {"error": str(e)})

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
              
