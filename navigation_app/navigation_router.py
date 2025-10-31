from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, Query, Request, APIRouter
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn
import os
import requests
import json
import time
import uuid
import shutil
import hashlib
import urllib.parse
from pathlib import Path
import logging
import random
import math
from datetime import datetime

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))


# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
load_dotenv()  # .env 파일을 읽어 환경 변수로 설정

# API 키 설정
APP_KEY = os.getenv("TMAP_API_KEY", "your_tmap_api_key")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# 변수 초기화
route_sessions = {}  # 세션 ID -> 경로 정보 매핑

# OpenAI 클라이언트 (있는 경우)
openai_client = None
if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        logger.info("OpenAI 클라이언트 초기화 완료")
    except Exception as e:
        logger.error(f"OpenAI 초기화 오류: {e}")
else:
    logger.warning("OpenAI API 키가 설정되지 않았습니다. 자연어 처리 기능이 제한됩니다.")

# API 모델 정의
class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

class GuidanceUpdateRequest(BaseModel):
    current_lat: float
    current_lng: float
    session_id: str

class NaturalLanguageSearchRequest(BaseModel):
    query: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    use_current_location: bool = False

# 기본 경로 - 템플릿 사용
@router.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "api_key": APP_KEY})

# TTS 엔드포인트
@router.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """텍스트를 음성으로 변환"""
    text = request.text.strip()
    if not text:
        return {"error": "텍스트가 비어 있습니다."}
    
    # 캐시 파일명 생성
    cache_dir = Path("static/tts_cache")
    cache_dir.mkdir(exist_ok=True)
    
    # 간단한 해시 사용
    hash_obj = hashlib.md5(text.encode())
    if request.voice_id:
        hash_obj.update(request.voice_id.encode())
    filename = hash_obj.hexdigest() + ".mp3"
    cache_path = cache_dir / filename
    
    # 캐시 확인
    if cache_path.exists():
        logger.info(f"TTS 캐시 사용: {text}")
        return {"url": f"/static/tts_cache/{filename}"}
    
    # ElevenLabs API 사용 시도
    if ELEVENLABS_API_KEY and request.voice_id:
        try:
            headers = {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            }
            payload = {
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
            
            response = requests.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{request.voice_id}/stream",
                headers=headers,
                json=payload,
                stream=True
            )
            
            if response.status_code == 200:
                with open(cache_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=1024):
                        if chunk:
                            f.write(chunk)
                
                logger.info(f"ElevenLabs TTS 생성 완료: {text}")
                return {"url": f"/static/tts_cache/{filename}"}
            else:
                logger.error(f"ElevenLabs API 오류: {response.status_code}, {response.text}")
        except Exception as e:
            logger.error(f"ElevenLabs TTS 오류: {e}")
    
    # 기본 음성 파일 반환
    logger.info(f"기본 음성 파일 사용: {text}")
    return {"url": "/static/audio/fallback_voice.mp3", "fallback": True}

@router.get("/api/search")
async def search_place(
    keyword: str, 
    lat: Optional[float] = None, 
    lng: Optional[float] = None, 
    radius: int = 3000,
    use_current_location: bool = False
):
    """키워드로 장소 검색"""
    if not keyword:
        return {"error": "검색어가 비어 있습니다."}

    try:
        url = "https://apis.openapi.sk.com/tmap/pois"

        logger.info(f"검색 키워드: {keyword}, 위치: {lat}, {lng}, 반경: {radius}m")

        params = {
            "version": "1",
            "searchKeyword": keyword,
            "count": 20,
            "reqCoordType": "WGS84GEO",
            "resCoordType": "WGS84GEO",
            "appKey": APP_KEY
        }

        response = requests.get(url, params=params)

        if response.status_code != 200:
            logger.error(f"키워드 검색 API 오류: {response.status_code}, {response.text}")
            return {"error": f"키워드 검색 실패: {response.status_code}"}

        data = response.json()

        pois = data.get("searchPoiInfo", {}).get("pois", {}).get("poi")
        if not pois:
            return {"places": [], "warning": "검색 결과가 없습니다."}

        places = []
        for poi in pois:
            try:
                place = {
                    "id": poi.get("id"),
                    "name": poi.get("name"),
                    "lat": float(poi.get("noorLat")),
                    "lng": float(poi.get("noorLon")),
                    "address": poi.get("address", {}).get("fullAddress")
                }

                if lat and lng and use_current_location:
                    place["distance"] = calculate_distance(lat, lng, place["lat"], place["lng"])

                places.append(place)
            except Exception as e:
                logger.warning(f"장소 데이터 처리 오류: {e}")

        if lat and lng and use_current_location:
            places.sort(key=lambda x: x.get("distance", float("inf")))

        logger.info(f"검색 결과 {len(places)}개 반환")
        return {"places": places}

    except Exception as e:
        logger.error(f"검색 API 오류: {e}")
        return {"error": f"검색 중 오류가 발생했습니다: {str(e)}"}

# 카테고리 매핑 정의
CATEGORY_MAPPING = {
    "카페": "CS200,CS300",  # 카페, 커피숍
    "편의점": "MT200",       # 편의점
    "식당": "FD6",          # 음식점
    "음식점": "FD6",        # 음식점
    "병원": "HP8",          # 병원
    "약국": "PM9",          # 약국
    "화장실": "BT1",        # 화장실
    "은행": "BK9",          # 은행
    "ATM": "AT4",          # ATM
    "지하철": "SW8",        # 지하철역
    "버스정류장": "BS3",     # 버스정류장
    "주유소": "OL7",        # 주유소
    "주차장": "PK6",        # 주차장
    "마트": "MT1",          # 대형마트
    "슈퍼": "MT1"           # 슈퍼마켓
}

def get_category_code(query):
    """자연어 쿼리에서 카테고리 코드 추출"""
    # 기본 카테고리 (음식점)
    default_category = "FD6"
    
    # 위치 관련 단어 제거
    for word in ["근처", "주변", "가까운", "여기", "주위"]:
        query = query.replace(word, "").strip()
    
    # 카테고리 매핑 검색
    for keyword, code in CATEGORY_MAPPING.items():
        if keyword in query:
            return code
    
    # 매칭되는 카테고리가 없으면 일반 POI 검색 사용을 위해 None 반환
    return None

@router.post("/api/natural_language_search")
async def natural_language_search(request: NaturalLanguageSearchRequest):
    """자연어 질의로 장소 검색"""
    query = request.query.strip()
    if not query:
        return {"error": "검색어가 비어 있습니다."}
    
    try:
        # 위치 정보 로깅
        logger.info(f"자연어 검색 요청: '{query}', 위치: {request.lat}, {request.lng}")
        
        # 카테고리 코드 변환 시도
        category_code = get_category_code(query)
        
        # 위치 관련 검색인지 확인
        is_nearby_search = any(word in query for word in ["근처", "주변", "가까운", "여기", "주위"])
        search_radius = 1000 if is_nearby_search else 3000
        
        # 검색 결과
        search_result = None
        
        # 위치 정보가 있고, 카테고리 검색이 가능하며, 근처 검색이면 카테고리 API 사용
        if request.lat and request.lng and category_code and is_nearby_search:
            logger.info(f"카테고리 주변 검색 사용: 카테고리={category_code}")
            search_result = await search_nearby_category(
                category=category_code,
                lat=request.lat,
                lng=request.lng,
                radius=search_radius
            )
            explanation = f"현재 위치 주변 {search_radius}m 내의 검색 결과입니다."
        else:
            # 일반 키워드 검색
            interpreted_query = query
            # 위치 관련 단어 제거
            for word in ["근처", "주변", "가까운", "여기", "주위"]:
                interpreted_query = interpreted_query.replace(word, "").strip()
                
            logger.info(f"일반 키워드 검색 사용: 키워드={interpreted_query}")
            search_result = await search_place(
                interpreted_query, 
                request.lat, 
                request.lng, 
                radius=search_radius, 
                use_current_location=request.use_current_location
            )
            explanation = f"'{query}'를 '{interpreted_query}'로 해석했습니다."
            if request.use_current_location:
                explanation += f" 현재 위치 기준으로 검색합니다."
        
        # 오류 처리
        if "error" in search_result:
            return search_result
        
        return {
            "original_query": query,
            "interpreted_as": category_code or query.replace("근처", "").replace("주변", "").strip(),
            "search_results": search_result.get("places", []),
            "explanation": explanation
        }
    except Exception as e:
        logger.error(f"자연어 검색 오류: {e}")
        return {"error": f"검색 처리 중 오류가 발생했습니다: {str(e)}"}

# 경로 계산 API
@router.post("/api/get_route")
async def get_route(request: RouteRequest):
    """경로 계산"""
    try:
        start_lat = request.start_lat
        start_lng = request.start_lng
        end_lat = request.end_lat
        end_lng = request.end_lng
        
        # TMap 보행자 경로 API 호출
        url = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&resCoordType=WGS84GEO"
        headers = {
            "appKey": APP_KEY,
            "Content-Type": "application/json"
        }
        
        payload = {
            "startX": start_lng,
            "startY": start_lat,
            "endX": end_lng,
            "endY": end_lat,
            "startName": "출발지",
            "endName": "목적지",
            "searchOption": "0",  # 최적 경로
            "resCoordType": "WGS84GEO"
        }
        
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            return {"error": f"경로 API 요청 실패: {response.status_code}"}
        
        data = response.json()
        
        if not "features" in data:
            return {"error": "경로를 계산할 수 없습니다."}
        
        # 좌표 추출
        coordinates = []
        for feature in data["features"]:
            if feature["geometry"]["type"] == "LineString":
                coords = feature["geometry"]["coordinates"]
                for lon, lat in coords:
                    coordinates.append([lat, lon])  # TMap은 [lon, lat] 순서로 반환
        
        # 주요 지점(턴포인트) 정보 추출
        guidance = []
        
        for feature in data["features"]:
            if feature["properties"].get("description") and feature["properties"].get("index") is not None:
                # 안내 지점 좌표
                if feature["geometry"]["type"] == "Point":
                    lon, lat = feature["geometry"]["coordinates"]
                    description = feature["properties"]["description"]
                    distance = feature["properties"].get("distance", 0)
                    
                    guidance.append({
                        "lat": lat,
                        "lng": lon,
                        "description": description,
                        "distance": distance,
                        "index": feature["properties"]["index"]
                    })
        
        # 세션 ID 생성
        session_id = str(uuid.uuid4())
        
        # 총 거리 및 시간 정보
        total_distance = int(data["features"][0]["properties"]["totalDistance"])  # 수정: int로 변환
        total_time = format_time(data["features"][0]["properties"]["totalTime"])  # 수정: 시간 형식으로 변환
        
        # 경로 정보 저장
        route_sessions[session_id] = {
            "coordinates": coordinates,
            "guidance": guidance,
            "total_distance": total_distance,
            "total_time": total_time,
            "start": {"lat": start_lat, "lng": start_lng},
            "end": {"lat": end_lat, "lng": end_lng},
            "created_at": time.time()
        }
        
        # 세션 정리 (오래된 세션 제거)
        cleanup_sessions()
        
        return {
            "session_id": session_id,
            "coordinates": coordinates,
            "guidance": guidance,
            "total_distance": total_distance,
            "total_time": total_time
        }
    except Exception as e:
        logger.error(f"경로 계산 오류: {e}")
        return {"error": f"경로 계산 중 오류가 발생했습니다: {str(e)}"}

# 네비게이션 안내 업데이트 API
@router.post("/api/guidance_update")
async def guidance_update(request: GuidanceUpdateRequest):
    """현재 위치에 따른 네비게이션 안내 업데이트"""
    current_lat = request.current_lat
    current_lng = request.current_lng
    session_id = request.session_id
    
    # 세션 확인
    if session_id not in route_sessions:
        return {"error": "유효하지 않은 세션입니다. 경로를 다시 계산해주세요."}
    
    route_data = route_sessions[session_id]
    coordinates = route_data["coordinates"]
    guidance_points = route_data["guidance"]
    end_point = route_data["end"]
    
    # 목적지 도착 확인 (20m 이내)
    distance_to_end = calculate_distance(current_lat, current_lng, end_point["lat"], end_point["lng"])
    
    if distance_to_end < 20:
        return {
            "is_arrived": True,
            "message": "목적지에 도착했습니다!"
        }
    
    # 경로 이탈 확인
    on_route, nearest_point, deviation_distance = check_on_route(current_lat, current_lng, coordinates)
    
    if not on_route:
        return {
            "deviation_warning": f"경로에서 벗어났습니다. 약 {round(deviation_distance)}미터 거리에 있습니다. 경로로 돌아가세요."
        }
    
    # 다음 안내 지점 찾기
    next_guidance = None
    distance_to_next = float('inf')
    
    for point in guidance_points:
        dist = calculate_distance(current_lat, current_lng, point["lat"], point["lng"])
        if dist < distance_to_next:
            distance_to_next = dist
            next_guidance = point
    
    # 이동 방향 계산
    direction = calculate_direction(current_lat, current_lng, nearest_point)
    
    # 남은 거리 계산 (근사치)
    remaining_distance = distance_to_end
    for i in range(len(coordinates) - 1):
        if coordinates[i][0] == nearest_point[0] and coordinates[i][1] == nearest_point[1]:
            break
        remaining_distance += calculate_distance(
            coordinates[i][0], coordinates[i][1], 
            coordinates[i+1][0], coordinates[i+1][1]
        )
    
    # 남은 시간 계산 (평균 보행 속도 5km/h = 1.4m/s)
    walking_speed = 1.4  # m/s
    remaining_time = remaining_distance / walking_speed  # 초 단위
    
    return {
        "next_guidance": next_guidance,
        "distance_to_next": int(distance_to_next),  # 수정: int로 변환
        "direction": direction,
        "remaining_distance": int(remaining_distance),  # 수정: int로 변환
        "remaining_time": int(remaining_time),  # 수정: int로 변환
        "time": format_time(int(remaining_time)),  # 추가: 시간 포맷팅
        "guidance": next_guidance["description"] if next_guidance else direction  # 추가: 안내 문구
}

#---------------------------------------------------------------------------------
# 유틸리티 함수들
#---------------------------------------------------------------------------------

def calculate_distance(lat1, lng1, lat2, lng2):
    """두 지점 간의 거리 계산 (Haversine 공식)"""
    R = 6371000  # 지구 반지름 (미터)
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    
    a = math.sin(delta_phi/2) * math.sin(delta_phi/2) + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda/2) * math.sin(delta_lambda/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    # 수정: 정수로 반환
    return int(R * c)  # 미터 단위 거리

def point_to_line_distance(px, py, x1, y1, x2, y2):
    """점과 직선 사이의 최단 거리 계산"""
    # 선분의 길이^2
    l2 = (x1 - x2)**2 + (y1 - y2)**2
    
    # 선분의 길이가 0이면 점과 (x1, y1) 사이의 거리를 반환
    if l2 == 0:
        return calculate_distance(px, py, x1, y1)
    
    # 선분 위의 점 파라미터 t (투영)
    t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
    
    # t가 0~1 범위 밖이면, 점은 선분의 연장선 위에 있는 것이므로
    # 점과 가장 가까운 선분 끝점 사이의 거리를 반환
    if t < 0:
        return calculate_distance(px, py, x1, y1)
    if t > 1:
        return calculate_distance(px, py, x2, y2)
    
    # 점을 직선에 투영한 좌표
    proj_x = x1 + t * (x2 - x1)
    proj_y = y1 + t * (y2 - y1)
    
    # 점과 투영점 사이의 거리 반환
    return calculate_distance(px, py, proj_x, proj_y)

def closest_point_on_line(px, py, x1, y1, x2, y2):
    """점에서 선분 위의 가장 가까운 점 계산"""
    # 선분의 길이^2
    l2 = (x1 - x2)**2 + (y1 - y2)**2
    
    # 선분의 길이가 0이면 (x1, y1) 반환
    if l2 == 0:
        return (x1, y1)
    
    # 선분 위의 점 파라미터 t (투영)
    t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
    
    # t가 0~1 범위 밖이면, 점은 선분의 연장선 위에 있는 것
    if t < 0:
        return (x1, y1)
    if t > 1:
        return (x2, y2)
    
    # 점을 직선에 투영한 좌표
    proj_x = x1 + t * (x2 - x1)
    proj_y = y1 + t * (y2 - y1)
    
    return (proj_x, proj_y)

def check_on_route(lat, lng, coordinates, max_distance=50):
    """경로 이탈 여부 확인"""
    min_dist = float('inf')
    nearest_point = None
    
    for i in range(len(coordinates) - 1):
        point1 = coordinates[i]
        point2 = coordinates[i + 1]
        
        # 점과 선분 사이의 최소 거리 계산
        dist = point_to_line_distance(lat, lng, point1[0], point1[1], point2[0], point2[1])
        
        if dist < min_dist:
            min_dist = dist
            # 가장 가까운 점 (선분 위의 점)
            nearest_point = closest_point_on_line(lat, lng, point1[0], point1[1], point2[0], point2[1])
    
    return min_dist <= max_distance, nearest_point, min_dist

def calculate_direction(lat, lng, nearest_point):
    """현재 위치에서 가장 가까운 경로 지점 기준 이동 방향 계산"""
    # 방위각 계산
    y = math.sin(math.radians(nearest_point[1] - lng)) * math.cos(math.radians(nearest_point[0]))
    x = math.cos(math.radians(lat)) * math.sin(math.radians(nearest_point[0])) - \
        math.sin(math.radians(lat)) * math.cos(math.radians(nearest_point[0])) * math.cos(math.radians(nearest_point[1] - lng))
    brng = math.degrees(math.atan2(y, x))
    brng = (brng + 360) % 360
    
    # 방위각 -> 방향
    directions = ["북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽"]
    index = round(brng / 45) % 8
    
    return directions[index]

def format_time(seconds):
    """초를 시:분:초 형식으로 변환"""
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    
    if h > 0:
        return f"{h}시간 {m}분"
    else:
        return f"{m}분"

def cleanup_sessions():
    """30분 이상 지난 세션 제거"""
    now = time.time()
    expired_sessions = []
    
    for session_id, data in route_sessions.items():
        if now - data["created_at"] > 1800:  # 30분 = 1800초
            expired_sessions.append(session_id)
    
    for session_id in expired_sessions:
        del route_sessions[session_id]

# 서버 실행 코드 (직접 실행 시)
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)