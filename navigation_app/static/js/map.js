// 지도 관련 기능을 모아놓은 모듈

let map;
let currentPositionMarker = null;
let destinationMarker = null;
let routeLayer = null;

// 지도 초기화
function initMap(initialLat, initialLng, zoom = 15) {
    const el = document.getElementById("map");
    console.log("[initMap 호출됨] map 엘리먼트 높이:", el?.offsetHeight);
    console.log('지도 초기화 중...');

    try {
        // 지도 요소가 있는지 확인
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('map 요소를 찾을 수 없습니다');
            return null;
        }

        // 기존 map 인스턴스가 있다면 제거
        if (map) {
            map.remove();
        }

        // 위치 정보가 없는 경우 빈 지도만 생성
        if (!initialLat || !initialLng) {
            console.warn('위치 정보가 없습니다. 위치 확인 후 지도가 업데이트됩니다.');
            initialLat = 0;
            initialLng = 0;
            zoom = 2; // 전체 지도 표시
        }

        // 지도 생성
        map = L.map('map', {
            center: [initialLat, initialLng],
            zoom: zoom,
            zoomControl: false // 줌 컨트롤은 별도로 배치
        });

        // 타일 레이어 추가
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // 줌 컨트롤 추가 (왼쪽으로 변경)
        L.control.zoom({
            position: 'topleft'
        }).addTo(map);

        console.log('지도 초기화 완료');
        return map;
    } catch (error) {
        console.error('지도 초기화 오류:', error);
        return null;
    }
}

// 현재 위치 마커 가져오기
function getCurrentPositionMarker() {
    return currentPositionMarker;
}

// 목적지 마커 가져오기
function getDestinationMarker() {
    return destinationMarker;
}

// 현재 위치 마커 업데이트
function updateCurrentPositionMarker(lat, lng, accuracy) {
    let hasChanged = true;

    if (currentPositionMarker) {
        const pos = currentPositionMarker.getLatLng();
        if (Math.abs(pos.lat - lat) < 0.00005 && Math.abs(pos.lng - lng) < 0.00005) {
            hasChanged = false;
        }
    }

    if (hasChanged) {
        if (currentPositionMarker) {
            map.removeLayer(currentPositionMarker);
        }

        if (accuracy && accuracy < 100) {
            L.circle([lat, lng], {
                radius: accuracy,
                color: 'blue',
                fillColor: 'rgba(0, 0, 255, 0.1)',
                fillOpacity: 0.3
            }).addTo(map);
        }

        currentPositionMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'current-position-marker',
                html: '<div style="background-color: blue; border-radius: 50%; width: 16px; height: 16px; border: 3px solid white;"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            })
        }).addTo(map);
    }

    return currentPositionMarker;
}

// 목적지 마커 설정
function setDestinationMarker(lat, lng, name) {
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    destinationMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map);

    destinationMarker.bindPopup(`<b>목적지:</b> ${name}`).openPopup();

    return destinationMarker;
}

// 경로 그리기
function drawRoute(coordinates) {
    clearRoute();

    const routeCoordinates = coordinates.map(coord => [coord[0], coord[1]]);
    routeLayer = L.polyline(routeCoordinates, { color: 'blue', weight: 5 }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

    return routeLayer;
}

// 경로 제거
function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}

// 지도 중심 이동
function centerMap(lat, lng, zoom = null) {
    if (zoom) {
        map.setView([lat, lng], zoom);
    } else {
        map.setView([lat, lng]);
    }
}

// 현재 지도 객체 가져오기
function getMap() {
    return map;
}

const mapService = {
    initMap,
    updateCurrentPositionMarker,
    setDestinationMarker,
    drawRoute,
    clearRoute,
    centerMap,
    getMap,
    getCurrentPositionMarker,
    getDestinationMarker
};

export default mapService;
