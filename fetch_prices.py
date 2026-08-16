# -*- coding: utf-8 -*-
"""
tcgcsv.com(TCGplayer 미러)에서 Riftbound 카드 시세를 수집해 data/prices.json 생성.
사용법: python fetch_prices.py  (하루 1회 정도 실행하면 충분)
"""
import json
import os
import re
import time
import urllib.request

CATEGORY = 89  # Riftbound League of Legends TCG

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    groups = get(f"https://tcgcsv.com/tcgplayer/{CATEGORY}/groups")["results"]
    # 이전 박스 가격 이력 로드 (24h 변동률 계산용)
    prev_hist = {}
    if os.path.exists("data/prices.json"):
        try:
            with open("data/prices.json", encoding="utf-8") as f:
                for b in json.load(f).get("_boxes", []):
                    prev_hist[b["abbr"]] = b.get("hist", [])
        except Exception:
            pass
    now = int(time.time())
    boxes = []
    out = {}
    for g in groups:
        gid, abbr = g["groupId"], (g.get("abbreviation") or "").upper()
        if not abbr:
            continue
        products = get(f"https://tcgcsv.com/tcgplayer/{CATEGORY}/{gid}/products")["results"]
        prices = get(f"https://tcgcsv.com/tcgplayer/{CATEGORY}/{gid}/prices")["results"]
        price_by_pid = {}
        for p in prices:
            price_by_pid.setdefault(p["productId"], {})[p["subTypeName"]] = p.get("marketPrice") or p.get("midPrice")
        # 부스터 박스(Booster Display, Case 제외) 가격 수집
        for prod in products:
            name = prod["name"]
            if "Booster Display" not in name or "Case" in name:
                continue
            pp = price_by_pid.get(prod["productId"], {})
            usd = pp.get("Normal") or pp.get("Foil")
            if usd is None:
                continue
            hist = [h for h in prev_hist.get(abbr, []) if now - h[0] < 8 * 86400]
            hist.append([now, round(usd, 2)])
            # 24시간 전에 가장 가까운 가격 대비 변동률
            target = now - 86400
            past = min(hist[:-1], key=lambda h: abs(h[0] - target), default=None)
            chg = round((usd - past[1]) / past[1] * 100, 1) if past and past[1] else 0.0
            boxes.append({
                "abbr": abbr, "name": name, "pid": prod["productId"],
                "usd": round(usd, 2), "chg": chg, "hist": hist[-16:],
            })
        n_matched = 0
        for prod in products:
            ext = {e["name"]: e["value"] for e in prod.get("extendedData") or []}
            number = ext.get("Number") or ""
            if not number:
                continue
            # "004/298" -> "004", "298b/298" -> "298b"
            num = number.split("/")[0].strip()
            m = re.match(r"^(\d+)([a-z*]*)$", num, re.I)
            if not m:
                continue
            code = "%s-%03d%s" % (abbr, int(m.group(1)), m.group(2).lower())
            pp = price_by_pid.get(prod["productId"], {})
            usd = pp.get("Normal") or pp.get("Foil")
            usd_foil = pp.get("Foil")
            if usd is None and usd_foil is None:
                continue
            entry = {"url": prod["url"]}
            if usd is not None:
                entry["usd"] = round(usd, 2)
            if usd_foil is not None and usd_foil != usd:
                entry["foil"] = round(usd_foil, 2)
            # 이미 있으면 기본판 우선
            if code not in out:
                out[code] = entry
            n_matched += 1
        print(f"{abbr}: products={len(products)} matched={n_matched}")
    out["_boxes"] = boxes
    with open("data/prices.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote data/prices.json ({len(out)} entries, {len(boxes)} boxes)")


if __name__ == "__main__":
    main()
