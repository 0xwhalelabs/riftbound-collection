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
KR_GALLERY_URL = "https://playriftbound.com/ko-kr/card-gallery/"
KR_DATA_URL = "https://playriftbound.com/_next/data/{build_id}/ko-kr/card-gallery.json"
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


def _get_build_id(gallery_url):
    html = http_get(gallery_url)
    m = re.search(r'"buildId":"([^"]+)"', html)
    if not m:
        sys.exit("Could not find Next.js buildId from %s" % gallery_url)
    return m.group(1)


def _fetch_gallery(gallery_url, data_url_tpl):
    print("Fetching gallery page for build id...")
    build_id = _get_build_id(gallery_url)
    print("Build id:", build_id)
    data = json.loads(http_get(data_url_tpl.format(build_id=build_id)))
    blades = data["pageProps"]["page"]["blades"]
    gallery = next(b for b in blades if b["type"] == "riftboundCardGallery")
    sets = {s["id"]: s["name"] for s in gallery["sets"]["items"]}
    items = gallery["cards"]["items"]
    return sets, items


def fetch_en():
    print("Fetching EN cards...")
    sets, items = _fetch_gallery(EN_GALLERY_URL, EN_DATA_URL)
    print("EN cards:", len(items))
    return sets, items


def fetch_kr():
    print("Fetching KR cards...")
    sets, items = _fetch_gallery(KR_GALLERY_URL, KR_DATA_URL)
    print("KR cards:", len(items))
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
            "nameKr": "",
            "nameCn": "",
            "typeIds": ctypes,
            "rarity": rarity.get("id", ""),
            "rarityEn": rarity.get("label", ""),
            "rarityCn": "",
            "domains": domains,
            "imgEn": (it.get("cardImage") or {}).get("url", ""),
            "imgKr": "",
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
                "nameKr": "",
                "nameCn": it.get("cardName", ""),
                "typeIds": it.get("cardCategoryList") or [],
                "rarity": CN_RARITY_MAP.get(it.get("rarity", ""), it.get("rarity", "")),
                "rarityEn": "",
                "rarityCn": it.get("rarityName", ""),
                "domains": domains,
                "imgEn": "",
                "imgKr": "",
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

    # --- KR (한국어) 카드 병합 ---
    kr_sets, kr_items = fetch_kr()
    kr_matched = 0
    def has_hangul(text):
        return any("\uAC00" <= ch <= "\uD7A3" for ch in text)

    for it in kr_items:
        code = normalize_code(it["publicCode"])
        name_kr = it.get("name", "")
        # 실제 한국어 번역이 있는 카드만 imgKr 설정
        img_kr = (it.get("cardImage") or {}).get("url", "") if has_hangul(name_kr) else ""

        card = merged.get(code)
        if card is None:
            # KR-only card (e.g. Korea-exclusive Ahri)
            domains = [v["id"] for v in (it.get("domain") or {}).get("values", [])]
            rarity = ((it.get("rarity") or {}).get("value") or {})
            ctypes = [t["id"] for t in (it.get("cardType") or {}).get("type", [])]
            card = {
                "code": code,
                "set": (it["set"]["value"] or {}).get("id", code.split("-")[0]),
                "num": it.get("collectorNumber"),
                "nameEn": "",
                "nameKr": name_kr,
                "nameCn": "",
                "typeIds": ctypes,
                "rarity": rarity.get("id", ""),
                "rarityEn": rarity.get("label", ""),
                "rarityCn": "",
                "domains": domains,
                "imgEn": "",
                "imgKr": img_kr,
                "imgCn": "",
                "energy": it.get("energy"),
                "publicCode": it.get("publicCode", ""),
            }
            merged[code] = card
            order.append(code)
        else:
            kr_matched += 1
            if not card["nameKr"]:
                card["nameKr"] = name_kr
            if not card["imgKr"]:
                card["imgKr"] = img_kr
    # KR sets
    for k, v in kr_sets.items():
        sets.setdefault(k, v)
    print("Matched KR->EN: %d ; total cards: %d" % (kr_matched, len(order)))

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
