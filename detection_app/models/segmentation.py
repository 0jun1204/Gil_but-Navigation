import cv2
import numpy as np
from ultralytics import YOLO

# YOLO-Seg 모델 로드
model = YOLO("onnx_models/road_segmentation_yolo11seg_small.onnx", task="segment")

# 클래스 매핑 (참고용)
# 0: alley, 1: bike_lane, 2: braille_guide_blocks, 3: caution_zone, 4: roadway, 5: sidewalk

def segment_sidewalk_road(image):
    """
    YOLO-Seg 모델을 이용해 세그멘테이션 맵 생성.
    각 픽셀 값은 해당 위치의 클래스 ID로 설정됨.
    """
    results = model.predict(image, imgsz=640)[0]
    seg_map = np.zeros(image.shape[:2], dtype=np.uint8)

    if results.masks is not None and results.boxes.cls is not None:
        masks = results.masks.data.cpu().numpy()  # (N, H, W)
        class_ids = results.boxes.cls.cpu().numpy().astype(int)  # (N,)

        for i, mask in enumerate(masks):
            class_id = class_ids[i]
            seg_map[mask > 0.5] = class_id

    return seg_map

def decode_segmap_with_overlay(seg_map, original_img, alpha=0.5):
    """
    세그멘테이션 맵을 컬러로 시각화하고 원본 이미지 위에 반투명하게 오버레이 + 클래스 이름 표시.
    """
    # 클래스 색상 정의
    colors = {
        0: (128, 64, 128),  # alley         보라색 계열, 연한 자주빛
        1: (0, 255, 255),   # bike_lane         노란색-청록 사이, 거의 밝은 하늘색 또는 시안
        2: (255, 255, 0),   # braille_guide_blocks      밝은 파랑(청색) 느낌 (RGB에서는 노랑)
        3: (255, 0, 0),     # caution_zone      	파란색 (OpenCV 기준 B)
        4: (0, 0, 255),     # roadway       	빨간색 (OpenCV 기준 R)
        5: (0, 255, 0),     # sidewalk      	초록색
    }

    class_names = {
        0: "alley",
        1: "bike_lane",
        2: "braille_blocks",
        3: "caution_zone",
        4: "roadway",
        5: "sidewalk"
    }

    # 색상 맵 생성
    h, w = seg_map.shape
    color_seg = np.zeros((h, w, 3), dtype=np.uint8)
    for class_id, color in colors.items():
        color_seg[seg_map == class_id] = color

    # 원본과 혼합 (alpha blending)
    overlay = cv2.addWeighted(original_img, 1 - alpha, color_seg, alpha, 0)

    # 라벨 위치 추출 및 텍스트 표시
    for class_id in np.unique(seg_map):
        if class_id in class_names:
            mask = (seg_map == class_id).astype(np.uint8)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                if cv2.contourArea(cnt) > 500:  # 너무 작은 건 무시
                    x, y, w_box, h_box = cv2.boundingRect(cnt)
                    label = class_names[class_id]
                    cv2.putText(overlay, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX,
                                0.6, (255, 255, 255), 2, cv2.LINE_AA)

    return overlay