#!/usr/bin/env python3
"""Click through every header link on every page in headless Chrome and check where we land.
Usage: python3 -m http.server 8765 &  then  python3 scripts/navtest.py http://127.0.0.1:8765/
(needs: pip install websocket-client)"""
import json,time,subprocess,urllib.request,websocket,sys,random
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
p=subprocess.Popen([C,"--headless=new","--remote-debugging-port=9444","--user-data-dir=/tmp/trygdle_navtest_profile","about:blank"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(2)
tab=[t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9444/json")) if t["type"]=="page"][0]
ws=websocket.create_connection(tab["webSocketDebuggerUrl"])
i=0
def cmd(m,**params):
    global i; i+=1; ws.send(json.dumps({"id":i,"method":m,"params":params}))
    while True:
        r=json.loads(ws.recv())
        if r.get("id")==i: return r.get("result")
def ev(js):
    return cmd("Runtime.evaluate",expression=js,returnByValue=True)["result"].get("value")
BASE=sys.argv[1]
cmd("Page.enable")
cmd("Page.navigate",url=BASE+"hjelp.html"); time.sleep(2)
ev('localStorage.setItem("folketrygdle_seen_help","1")')
cmd("Page.navigate",url=BASE+"data.html"); time.sleep(2)
seq=["./?frispill","./","./?frispill","kalender.html","./?frispill","kalender.html","data.html","statistikk.html","kalender.html","./?frispill","kalender.html","./","data.html","kalender.html","hjelp.html","kalender.html","./","statistikk.html","data.html","kalender.html"]
labels={"kalender.html":"Kalender","data.html":"Data","statistikk.html":"Statistikk","hjelp.html":"Slik spiller du","./":"Trygdle","./?frispill":"Trygdle"}
for target in seq:
    # click the header link with this href on the current page
    clicked=ev(f'(()=>{{const a=[...document.querySelectorAll("header a")].find(a=>a.getAttribute("href")==={json.dumps(target)}); if(!a) return "NOLINK"; a.click(); return "ok"}})()')
    time.sleep(1.5)
    url=ev("location.href"); title=ev("document.title")
    ok = labels[target] in title and ("frispill" in url) == ("frispill" in target)
    print(("OK  " if ok else "FAIL"), target, "->", url, "|", title, clicked)
ws.close(); p.kill()
