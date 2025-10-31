import cv2
import numpy as np
import onnxruntime
from ultralytics import YOLO

# 장애물 YOLO 모델 로드
obstacle_model = YOLO("onnx_models/obstacle_detect_yolo12s.onnx", task="detect")

# Depth Anything ONNX 모델 로드
depth_model = onnxruntime.InferenceSession(
    "onnx_models/depth_anything_v2_vitb.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

def preprocess_depth_image(image, size=(518, 518)):
    """
    Depth 모델 입력 전처리
    """
    img = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) / 255.0
    img = cv2.resize(img, size)
    img = img.transpose(2, 0, 1).astype(np.float32)
    return np.expand_dims(img, axis=0)

def estimate_depth(image):
    """
    깊이 맵 추정
    """
    input_tensor = preprocess_depth_image(image)
    input_name = depth_model.get_inputs()[0].name
    depth_map = depth_model.run(None, {input_name: input_tensor})[0]
    depth_map = np.squeeze(depth_map)
    depth_map = cv2.resize(depth_map, (image.shape[1], image.shape[0]))
    depth_map = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min())
    return depth_map

def detect_obstacles(frame):
    """
    장애물 탐지 수행 함수
    """
    results = obstacle_model.predict(frame, imgsz=640, conf=0.5, device=0, stream=True)
    return list(results)
