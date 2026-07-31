# Riftbound 도감 (Collection Tracker)

League of Legends TCG **Riftbound** 카드 도감 + 보유 컬렉션 트래커.

- 영문판 이미지: playriftbound.com
- 중문판 이미지: playloltcg.com

## 사용법

1. 카드 데이터 수집 (최신화할 때마다 실행):
   ```
   python scrape.py
   ```
   → `data/cards.json` 생성

2. 로컬 서버 실행:
   ```
   python -m http.server 8000
   ```
   → http://localhost:8000 접속

## 기능

- 시리즈(세트)별 원버튼 필터
- 영문판 / 중문판 이미지 전환
- 정렬: 넘버순 / 도메인 색상별 / 등급별 / 이름순
- 필터: 도메인(색상), 등급, 보유중/미보유, 검색
- 카드별 +/− 버튼으로 보유 수량 관리 (localStorage 저장)
- 보유 현황 통계 및 진행률 표시
- 컬렉션 JSON 내보내기 / 가져오기
