from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import requests
from detection_app.detection_router import router as detection_router
from navigation_app.navigation_router import router as navigation_router
from navigation_app.navigation_router import logger, APP_KEY

from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pathlib import Path

app = FastAPI(title="시각장애인 내비게이션 통합 시스템")

# ✅ CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 정적 파일 및 템플릿 설정
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "navigation_app" / "static"
TEMPLATES_DIR = BASE_DIR / "navigation_app" / "templates"
AUDIO_DIR = BASE_DIR / "detection_app" / "mp3"

# 디버깅용 출력
# print("STATIC_DIR:", STATIC_DIR)
# print("TEMPLATES_DIR:", TEMPLATES_DIR)
# print("STATIC_DIR exists?", STATIC_DIR.exists())

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/static_audio", StaticFiles(directory=AUDIO_DIR), name="static_audio")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# ✅ JavaScript 모듈 지원을 위한 헤더 설정
@app.middleware("http")
async def add_js_header(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.endswith(".js"):
        response.headers["Content-Type"] = "application/javascript"
    return response

# ✅ 각 기능별 라우터 등록
app.include_router(detection_router)
app.include_router(navigation_router)

# ✅ Tmap API 연결 확인 - 앱 부팅 시 실행됨
@app.on_event("startup")
async def check_tmap_connection():
    test_url = f"https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=서울역&count=1&appKey={APP_KEY}&reqCoordType=WGS84GEO&resCoordType=WGS84GEO"
    try:
        response = requests.get(test_url)
        if response.status_code == 200:
            logger.info("✅ Tmap API 연결 성공 - 기본 검색 테스트 통과")
        else:
            logger.warning(f"⚠️ Tmap API 테스트 실패: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"❌ Tmap API 테스트 중 오류 발생: {e}")

# ✅ 기본 루트 페이지 연결
@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})