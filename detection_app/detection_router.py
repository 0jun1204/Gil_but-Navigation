from fastapi import FastAPI, UploadFile, File, APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import cv2
import numpy as np
import time
import os

from detection_app.models.guide_block import detect_blocks
from detection_app.models.obstacle_depth import detect_obstacles, estimate_depth
from detection_app.models.segmentation import segment_sidewalk_road, decode_segmap_with_overlay
from detection_app.utils.state_manager import extract_warnings, reset_audio_status, set_audio_playing
from detection_app.utils.audio_map import warning_audio_map
from detection_app.utils.visualization_BB import draw_obstacle_boxes

router = APIRouter()
templates = Jinja2Templates(directory="navigation_app/templates")

@router.get("/detection")
async def detection_home(request: Request):
    return templates.TemplateResponse("detection.html", {"request": request})

@router.post("/process_warning")
async def process_warning(request: Request, file: UploadFile = File(...)):
    screen = request.query_params.get("screen", "all")  # depth, obstacle, segmentation, all

    contents = await file.read()
    np_arr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    block_results = detect_blocks(frame)
    obstacle_results = detect_obstacles(frame)
    depth_map = estimate_depth(frame)

    warnings, audio_filename = extract_warnings(frame, block_results, obstacle_results, depth_map)
    audio_url = f"/static_audio/{audio_filename}" if audio_filename else None

    # 미리 정의
    depthmap_url = None
    obstacle_url = None
    segmentation_url = None

    # 선택된 화면만 처리
    if screen == "depth":
        depth_norm = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX)
        depth_color = cv2.applyColorMap(depth_norm.astype(np.uint8), cv2.COLORMAP_JET)
        depthmap_path = "navigation_app/static/depthmap_latest.jpg"
        cv2.imwrite(depthmap_path, depth_color)
        depthmap_url = "/static/depthmap_latest.jpg"

    elif screen == "obstacle":
        obstacle_vis = draw_obstacle_boxes(frame.copy(), obstacle_results)
        obstacle_vis_path = "navigation_app/static/obstacle_latest.jpg"
        cv2.imwrite(obstacle_vis_path, obstacle_vis)
        obstacle_url = "/static/obstacle_latest.jpg"

    elif screen == "segmentation":
        seg_map = segment_sidewalk_road(frame)
        seg_vis = decode_segmap_with_overlay(seg_map, frame)
        segmentation_path = "navigation_app/static/segmentation_latest.jpg"
        cv2.imwrite(segmentation_path, seg_vis)
        segmentation_url = "/static/segmentation_latest.jpg"

    return JSONResponse(content={
        "warnings": warnings,
        "audio_url": audio_url,
        "depthmap_url": depthmap_url,
        "obstacle_url": obstacle_url,
        "segmentation_url": segmentation_url
    })

@router.get("/audio_finished")
async def audio_finished():
    reset_audio_status()
    return JSONResponse(content={"status": "ok"})

@router.get("/ping")
async def ping():
    return {"message": "pong"}
