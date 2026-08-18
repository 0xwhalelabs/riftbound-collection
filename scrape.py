# -*- coding: utf-8 -*-
"""Riftbound TCG card scraper.

Fetches English cards from playriftbound.com (Next.js data endpoint)
and Chinese cards from lol-api.playloltcg.com, merges them by card code,
and writes data/cards.json for the collection web app.

Usage: python scrape.py
"""
import json
import re
import sys
import urllib.request

EN_GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/"
EN_DATA_URL = "https://playriftbound.com/_next/data/{build_id}/en-us/card-gallery.json"
CN_API_URL = "https://lol-api.playloltcg.com/xcx/card/searchCardCraftWeb"

# CN rarity code -> standard rarity id
CN_RARITY_MAP = {
    "rune_dust": "common",
    "rune_glimmer": "uncommon",
    "rune_shard": "rare",
    "rune_core": "epic",
    "rune_legend": "showcase",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "application/json, text/html",
}


def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def http_post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={**HEADERS, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_code(code):
    """UNL-131/219 -> UNL-131 ; VEN·001 -> VEN-001 ; keeps variant suffixes."""
    code = code.split("/")[0].strip()
    code = code.replace("\u00b7", "-").replace("\u30fb", "-")
    m = re.match(r"^([A-Za-z]+)-?(\d+)([a-z*]*)$", code)
    if not m:
        return code.upper()
    return "%s-%03d%s" % (m.group(1).upper(), int(m.group(2)), m.group(3))


def fetch_en():
    print("Fetching EN gallery page for build id...")
    html = http_get(EN_GALLERY_URL)
    m = re.search(r'"buildId":"([^"]+)"', html)
    if not m:
        sys.exit("Could not find Next.js buildId")
    build_id = m.group(1)
    print("Build id:", build_id)
    data = json.loads(http_get(EN_DATA_URL.format(build_id=build_id)))
    blades = data["pageProps"]["page"]["blades"]
    gallery = next(b for b in blades if b["type"] == "riftboundCardGallery")
    sets = {s["id"]: s["name"] for s in gallery["sets"]["items"]}
    items = gallery["cards"]["items"]
    print("EN cards:", len(items))
    return sets, items


def fetch_cn():
    print("Fetching CN cards...")
    cards = []
    page = 1
    while True:
        payload = {
            "pageNum": page, "pageSize": 200, "searchContent": "",
            "cardCategoryList": [], "cardColorList": [],
            "rarityList": [], "productCodeList": [],
        }
        resp = http_post_json(CN_API_URL, payload)
        if resp.get("code") != 0:
            sys.exit("CN API error: %s" % resp.get("message"))
        result = resp["result"]
        cards.extend(result["list"])
        total = result["total"]
        print("  page %d, got %d / %d" % (page, len(cards), total))
        if len(cards) >= total or not result["list"]:
            break
        page += 1
    return cards


def fetch_tcg_images():
    """tcgcsv.com(TCGplayer 미러)에서 카드 이미지/이름 맵을 수집 (공식 EN 데이터에 없는 변형 카드 보완용)."""
    print("Fetching TCGplayer product images (tcgcsv)...")
    imgs = {}
    try:
        groups = json.loads(http_get("https://tcgcsv.com/tcgplayer/89/groups"))["results"]
        for g in groups:
            abbr = (g.get("abbreviation") or "").upper()
            if not abbr:
                continue
            products = json.loads(http_get("https://tcgcsv.com/tcgplayer/89/%d/products" % g["groupId"]))["results"]
            for p in products:
                ext = {e["name"]: e["value"] for e in p.get("extendedData") or []}
                num = (ext.get("Number") or "").split("/")[0].strip()
                if not num:
                    continue
                code = normalize_code("%s-%s" % (abbr, num))
                name = re.sub(r"\s*\([^)]*\)\s*$", "", p["name"])
                url = "https://tcgplayer-cdn.tcgplayer.com/product/%d_in_1000x1000.jpg" % p["productId"]
                imgs.setdefault(code, (url, name))
    except Exception as e:
        print("  tcgcsv fetch failed, skipping backfill:", e)
    print("  TCG image entries:", len(imgs))
    return imgs


def build():
    sets, en_items, = fetch_en()
    cn_items = fetch_cn()

    merged = {}
    order = []

    for it in en_items:
        code = normalize_code(it["publicCode"])
        domains = [v["id"] for v in (it.get("domain") or {}).get("values", [])]
        rarity = ((it.get("rarity") or {}).get("value") or {})
        ctypes = [t["id"] for t in (it.get("cardType") or {}).get("type", [])]
        card = {
            "code": code,
            "set": (it["set"]["value"] or {}).get("id", code.split("-")[0]),
            "num": it.get("collectorNumber"),
            "nameEn": it.get("name", ""),
            "nameCn": "",
            "typeIds": ctypes,
            "rarity": rarity.get("id", ""),
            "rarityEn": rarity.get("label", ""),
            "rarityCn": "",
            "domains": domains,
            "imgEn": (it.get("cardImage") or {}).get("url", ""),
            "imgCn": "",
            "energy": it.get("energy"),
            "publicCode": it.get("publicCode", ""),
        }
        merged[code] = card
        order.append(code)

    matched = 0
    for it in cn_items:
        code = normalize_code(it.get("cardNo", ""))
        card = merged.get(code)
        if card is None:
            domains = it.get("cardColorList") or []
            card = {
                "code": code,
                "set": code.split("-")[0],
                "num": int(re.sub(r"\D", "", code.split("-")[-1]) or 0),
                "nameEn": "",
                "nameCn": it.get("cardName", ""),
                "typeIds": it.get("cardCategoryList") or [],
                "rarity": CN_RARITY_MAP.get(it.get("rarity", ""), it.get("rarity", "")),
                "rarityEn": "",
                "rarityCn": it.get("rarityName", ""),
                "domains": domains,
                "imgEn": "",
                "imgCn": it.get("frontImage", ""),
                "energy": it.get("energy"),
                "publicCode": it.get("cardNo", ""),
            }
            merged[code] = card
            order.append(code)
        else:
            matched += 1
            if not card["nameCn"]:
                card["nameCn"] = it.get("cardName", "")
            if not card["imgCn"]:
                card["imgCn"] = it.get("frontImage", "")
            if not card["rarityCn"]:
                card["rarityCn"] = it.get("rarityName", "")
            if not card["domains"]:
                card["domains"] = it.get("cardColorList") or []
        # CN 등급이 있으면 표준 등급으로 통일 (showcase 구분이 정확함)
        cn_rarity = CN_RARITY_MAP.get(it.get("rarity", ""))
        if cn_rarity:
            card["rarity"] = cn_rarity

    print("Matched CN->EN: %d ; total cards: %d" % (matched, len(order)))

    # 공식 EN 데이터에 없는 카드(시그니처/쇼케이스 등) 이미지를 TCGplayer에서 보완
    tcg_imgs = fetch_tcg_images()
    backfilled = 0
    for code in order:
        card = merged[code]
        if card["imgEn"]:
            continue
        hit = tcg_imgs.get(code)
        if not hit:
            continue
        card["imgEn"] = hit[0]
        if not card["nameEn"]:
            card["nameEn"] = hit[1]
        backfilled += 1
    print("Backfilled EN images from TCGplayer: %d" % backfilled)

    # ensure set names include CN-only sets
    for code in order:
        sid = merged[code]["set"]
        sets.setdefault(sid, sid)

    out = {
        "sets": [{"id": k, "name": v} for k, v in sets.items()],
        "cards": [merged[c] for c in order],
    }
    import os
    os.makedirs("data", exist_ok=True)
    with open("data/cards.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Wrote data/cards.json (%d cards, %d sets)" % (len(order), len(sets)))


if __name__ == "__main__":
    build()
