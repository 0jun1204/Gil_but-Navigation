# 경고 문구별 오디오 파일 매핑
warning_audio_map = {
    "Stop sign detected! Please stop.": "정지 블록이 있습니다. 정지하세요.mp3",
    "Pause at the stop block.": "정지 블록이 있습니다. 일시정지 후 계속 이동하세요.mp3",
    "Pause and decide direction at stop block.": "정지 블록이 있습니다. 일시정지 후 가실 방향을 결정하세요.mp3",
    "Danger Increasing! Be careful! Move RIGHT to avoid obstacle!": "장애물 접근중. 오른쪽으로 피하세요.mp3",
    "Danger Increasing! Be careful! Move LEFT to avoid obstacle!": "장애물 접근중. 왼쪽으로 피하세요.mp3",
    "Turn Left.": "좌회전하세요.mp3",
    "Turn Right.": "우회전하세요.mp3",
    "Off the guide block. Move left.": "점자블록을 벗어나고 있습니다. 왼쪽으로 이동하세요.mp3",
    "Off the guide block. Move right.": "점자블록을 벗어나고 있습니다. 오른쪽으로 이동하세요.mp3",
    "No guide block detected.": "점자블록이 탐지되지 않습니다.mp3",
    "Road detected on the LEFT. Move right to stay on the sidewalk.": "인도를 벗어나고 있습니다. 오른쪽으로 이동하세요.mp3",
    "Road detected on the RIGHT. Move left to stay on the sidewalk.": "인도를 벗어나고 있습니다. 왼쪽으로 이동하세요.mp3",
    "Guide block detected again.": "점자블록이 다시 탐지되었습니다.mp3"
}

# 경고 문구 우선순위 정의 (낮을수록 우선)
priority_order = {
    "Road detected on the LEFT. Move right to stay on the sidewalk.": 1,
    "Road detected on the RIGHT. Move left to stay on the sidewalk.": 1,
    "Guide block detected again.": 2,
    "Stop sign detected! Please stop.": 3,
    "Pause at the stop block.": 3,
    "Pause and decide direction at stop block.": 3,
    "Turn Left.": 3,
    "Turn Right.": 3,
    "Danger Increasing! Be careful! Move RIGHT to avoid obstacle!": 4,
    "Danger Increasing! Be careful! Move LEFT to avoid obstacle!": 4,
    "Off the guide block. Move left.": 5,
    "Off the guide block. Move right.": 5,
    "No guide block detected.": 6
}