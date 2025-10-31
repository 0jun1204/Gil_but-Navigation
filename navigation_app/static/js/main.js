// 메인 애플리케이션 파일 - 모든 모듈을 연결합니다.
import ui from './ui.js';
import apiService from './api.js';
import speechService from './speech.js';
import navigationService from './navigation.js';
import mapService from './map.js';
import { enqueueMp3 } from './speech.js';

// 전역 변수
let currentPositionData = null;
let destinationData = null;
let currentGuidance = '';
let isVoiceEnabled = true;
let conversationState = 'idle'; // 'idle', 'asking_destination', 'confirming_destination', 'confirming_search_result'
let searchResultItems = [];

// 거리 형식화 함수 - 소수점 1자리까지만 표시
function formatDistance(meters) {
    if (!meters && meters !== 0) return "";
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

// 앱 초기화 함수
async function initApp() {
    try {
        const map = mapService.initMap(null, null);
        if (!map) throw new Error('지도를 초기화할 수 없습니다');

        speechService.initSpeechRecognition(handleVoiceInput);

        ui.registerEventListeners({
            onSearch: handleSearch,
            onVoiceInput: handleVoiceButtonClick,
            onStartNavigation: handleStartNavigation,
            onStopNavigation: handleStopNavigation,
            onCenterMap: handleCenterMap,
            onTogglePanel: ui.togglePanel.bind(ui),
            onReadInstruction: handleReadInstruction,
            onRefreshLocation: handleRefreshLocation,
            onToggleVoice: handleToggleVoice,
            onBigVoiceInput: handleBigVoiceButtonClick,
            onGoToDetection: handleGoToDetection
        });

        const permissionGranted = await checkLocationPermission();
        const locationSuccess = await getLocationWithRetry(3);

        if (locationSuccess) {
            ui.setStatus('현재 위치를 확인했습니다. 목적지를 말씀해주세요.');
            speechService.speak('준비가 완료되었습니다. 목적지를 말씀해주세요.', 'high');
            setTimeout(() => {
                conversationState = 'asking_destination';
                toggleBigVoiceButton(true);
                handleVoiceButtonClick();
            }, 2000);
        } else {
            ui.setStatus('위치 정보를 가져올 수 없습니다. 위치 권한을 확인해주세요.');
            speechService.speak('위치 정보에 접근할 수 없습니다. 브라우저 설정에서 위치 접근을 허용해주세요.');
        }

        startLocationTracking();
        initBigVoiceButton();
    } catch (error) {
        ui.setStatus('애플리케이션 초기화 중 오류가 발생했습니다: ' + error.message);
        speechService.speak('애플리케이션 초기화 중 오류가 발생했습니다.');
    }
}

// 새로운 위치 권한 확인 함수 추가
async function checkLocationPermission() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            ui.setStatus('브라우저가 위치 정보를 지원하지 않습니다.');
            resolve(false);
            return;
        }
        
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' })
                .then(permissionStatus => {
                    ui.updateLocationDebug(null, null, null, permissionStatus.state);
                    
                    if (permissionStatus.state === 'denied') {
                        ui.setStatus('위치 정보 접근 권한이 필요합니다. 브라우저 설정에서 허용해주세요.');
                        speechService.speak('위치 접근 권한이 필요합니다. 브라우저 설정에서 허용해주세요.');
                    }
                    
                    permissionStatus.onchange = () => {
                        ui.updateLocationDebug(null, null, null, permissionStatus.state);
                    };
                    
                    resolve(permissionStatus.state === 'granted');
                })
                .catch(error => {
                    console.error("권한 확인 오류:", error);
                    resolve(true); // 오류 시에도 계속 진행
                });
        } else {
            // 권한 API가 없는 경우 위치 확인 시도로 권한 요청
            ui.setStatus('위치 정보 권한을 요청합니다...');
            resolve(true);
        }
    });
}

// 위치 정보 여러 번 시도하는 함수 추가
async function getLocationWithRetry(maxRetries = 5) {
    return new Promise((resolve) => {
        let attempts = 0;
        
        function tryGetLocation() {
            attempts++;
            ui.setStatus(`위치 정보를 가져오는 중... (시도 ${attempts}/${maxRetries})`);
            
            getCurrentPosition(true, 
                // 성공 콜백
                () => {
                    resolve(true);
                }, 
                // 실패 콜백
                (error) => {
                    console.error(`위치 정보 시도 ${attempts} 실패:`, error);
                    
                    if (attempts < maxRetries) {
                        ui.setStatus(`위치 정보를 다시 시도합니다... (${attempts}/${maxRetries})`);
                        setTimeout(tryGetLocation, 3000); // 3초 후 재시도
                    } else {
                        ui.setStatus('위치 정보를 가져올 수 없습니다. 브라우저 설정을 확인해주세요.');
                        speechService.speak('위치 정보를 가져올 수 없습니다. 위치 권한을 확인해주세요.');
                        resolve(false);
                    }
                }
            );
        }
        
        tryGetLocation();
    });
}

function initBigVoiceButton() {
    const bigVoiceButton = document.getElementById('big-voice-input');
    if (!bigVoiceButton) return;
    bigVoiceButton.addEventListener('click', handleBigVoiceButtonClick);
}

function handleBigVoiceButtonClick() {
    handleVoiceButtonClick();
}

function toggleBigVoiceButton(show) {
    const bigVoiceButton = document.getElementById('big-voice-input');
    if (!bigVoiceButton) return;
    bigVoiceButton.style.display = show ? 'flex' : 'none';
}

function handleGoToDetection() {
    if (navigationService.isNavigationActive()) {
        speechService.speak("실시간 장애물 탐지 화면으로 이동합니다. 내비게이션은 계속 실행됩니다.", "high");
    }
    document.getElementById("detection-view").style.display = "block";
    document.getElementById("navigation-view").style.display = "none";
    if (typeof startDetection === "function") {
        startDetection();
    }
}

// 현재 위치 가져오기 함수 수정
function getCurrentPosition(forceCenterMap = false, successCallback = null, errorCallback = null) {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                
                currentPositionData = { lat, lng };
                
                // 위치 디버그 정보 업데이트
                ui.updateLocationDebug(lat, lng, accuracy, '위치 확인됨');
                
                // 현재 위치 마커 업데이트
                mapService.updateCurrentPositionMarker(lat, lng, accuracy);
                
                if (forceCenterMap) {
                    mapService.centerMap(lat, lng, 16);
                }
                
                ui.setStatus(`현재 위치를 확인했습니다. (정확도: ${Math.round(accuracy)}m)`);
                
                if (successCallback) successCallback(position);
            },
            function(error) {
                console.error('위치 정보 오류:', error);
                handleLocationError(error);
                if (errorCallback) errorCallback(error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000
            }
        );
    } else {
        const error = new Error('브라우저가 위치 정보를 지원하지 않습니다.');
        ui.setStatus('브라우저가 위치 정보를 지원하지 않습니다.');
        speechService.speak('브라우저가 위치 정보를 지원하지 않습니다.');
        if (errorCallback) errorCallback(error);
    }
}

// 위치 정보 오류 처리 함수 수정
function handleLocationError(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            ui.setStatus('위치 정보 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
            speechService.speak('위치 접근 권한이 필요합니다. 브라우저 설정에서 위치 권한을 허용해주세요.');
            
            // 사용자에게 권한 필요성 강조
            setTimeout(() => {
                if (confirm('이 앱은 위치 정보가 필요합니다. 브라우저 설정에서 위치 정보 접근을 허용하시겠습니까?')) {
                    // 설정 페이지로 이동하는 안내
                    ui.setStatus('브라우저 설정에서 위치 정보 접근을 허용한 후 페이지를 새로고침 해주세요.');
                }
            }, 2000);
            break;
        case error.POSITION_UNAVAILABLE:
            ui.setStatus('위치 정보를 사용할 수 없습니다. 잠시 후 다시 시도합니다.');
            speechService.speak('GPS 신호를 확인할 수 없습니다. 실외로 이동하면 더 정확한 위치를 찾을 수 있습니다.');
            
            // 자동으로 5초 후 다시 시도
            setTimeout(() => getCurrentPosition(true), 5000);
            break;
        case error.TIMEOUT:
            ui.setStatus('위치 정보 요청 시간이 초과되었습니다. 다시 시도합니다.');
            speechService.speak('위치 정보를 가져오는 데 시간이 너무 오래 걸립니다. 다시 시도합니다.');
            
            // 1초 후 다시 시도
            setTimeout(() => getCurrentPosition(true), 1000);
            break;
    }
}

// 앱 시작 이벤트
document.addEventListener('DOMContentLoaded', initApp);

// 위치 추적 시작
let watchPositionId = null;
function startLocationTracking() {
    if (watchPositionId !== null) {
        navigator.geolocation.clearWatch(watchPositionId);
    }
    
    if ('geolocation' in navigator) {
        watchPositionId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 10000
            }
        );
    }
}

// 위치 추적 중지
function stopLocationTracking() {
    if (watchPositionId !== null) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
}

// 위치 업데이트 핸들러
function handlePositionUpdate(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    
    currentPositionData = { lat, lng };
    
    // 위치 디버그 정보 업데이트
    ui.updateLocationDebug(lat, lng, accuracy, '추적 중');
    
    // 현재 위치 마커 업데이트
    mapService.updateCurrentPositionMarker(lat, lng, accuracy);
    
    // 네비게이션 중이면 안내 정보 업데이트
    if (navigationService.isNavigationActive()) {
        updateNavigationInfo();
    }
}

// 네비게이션 정보 업데이트
async function updateNavigationInfo() {
    if (!currentPositionData) return;
    
    const navInfo = await navigationService.updateNavigation(
        currentPositionData.lat, 
        currentPositionData.lng
    );
    
    if (navInfo) {
        if (navInfo.arrived) {
            handleStopNavigation();
            speechService.speak("목적지에 도착했습니다! 길 안내를 종료합니다.", "high");
            return;
        }
        
        currentGuidance = navInfo.guidance;
        ui.updateNavigationInfo(
            navInfo.distance, 
            navInfo.time, 
            navInfo.guidance
        );
    }
}

// 위치 기반 검색 실행 함수
async function searchWithLocation(query, lat, lng) {
    try {
        // 근처 검색 감지
        const isNearbySearch = /근처|주변|가까운/.test(query);
        
        if (isNearbySearch) {
            if (!lat || !lng) {
                ui.setStatus('위치 정보 없이 주변 검색을 할 수 없습니다. 위치 권한을 확인해주세요.');
                return;
            }
            ui.setStatus('주변 검색 중...');
        }
        
        // 검색 API 호출 (모든 경우에 위치 정보 포함)
        const radiusSelect = document.getElementById("search-radius");
        const radius = parseInt(radiusSelect?.value || "3000");

        const searchData = await apiService.searchPlaces(query, lat, lng, radius);
        
        if (searchData.error) {
            ui.setStatus(`검색 오류: ${searchData.error}`);
            return;
        }
        
        if (!searchData.places || searchData.places.length === 0) {
            ui.setStatus('검색 결과가 없습니다.');
            return;
        }
        
        // 검색 결과에 거리 정보 추가 (없는 경우)
        if (lat && lng) {
            searchData.places.forEach(place => {
                if (!place.distance) {
                    place.distance = calculateDistance(lat, lng, place.lat, place.lng);
                }
            });
            
            // 거리 기준 정렬
            searchData.places.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        }
        
        // 검색 결과 표시
        ui.displaySearchResults(searchData.places, currentPositionData, handleSelectDestination);
        ui.setStatus(`${searchData.places.length}개의 검색 결과가 있습니다.`);
    } catch (error) {
        console.error('검색 처리 오류:', error);
        ui.setStatus('검색 처리 중 오류가 발생했습니다.');
    }
}

// 검색 후 자동으로 길안내 시작하는 함수
async function handleSearchAndStartNavigation(query) {
    try {
        console.log('자동 검색 및 길안내 시작:', query);
        
        // 위치 정보 확인
        const lat = currentPositionData ? currentPositionData.lat : null;
        const lng = currentPositionData ? currentPositionData.lng : null;
        
        if (!lat || !lng) {
            speechService.speak('현재 위치를 찾을 수 없습니다. 위치 권한을 확인해주세요.');
            return;
        }
        
        // 검색 실행
        const searchData = await apiService.searchPlaces(query, lat, lng, 3000);
        
        if (searchData.error) {
            speechService.speak(`검색 오류: ${searchData.error}`);
            return;
        }
        
        if (!searchData.places || searchData.places.length === 0) {
            speechService.speak('검색 결과가 없습니다. 다른 목적지를 말씀해주세요.');
            return;
        }
        
        // 첫 번째 결과 자동 선택
        const firstPlace = searchData.places[0];
        console.log('첫 번째 결과 자동 선택:', firstPlace);
        
        // 목적지 설정
        destinationData = firstPlace;
        mapService.setDestinationMarker(firstPlace.lat, firstPlace.lng, firstPlace.name);
        mapService.centerMap(firstPlace.lat, firstPlace.lng);
        
        ui.setDestinationInput(firstPlace.name);
        ui.hideSearchResults();
        
        // 거리 정보 음성 안내
        const distanceText = firstPlace.distance 
            ? `거리는 ${firstPlace.distance < 1000 
                ? `${firstPlace.distance}미터` 
                : `${(firstPlace.distance / 1000).toFixed(1)}킬로미터`}입니다.` 
            : '';
        
        speechService.speak(`목적지를 ${firstPlace.name}로 설정했습니다. ${distanceText} 길 안내를 시작합니다.`, 'high');
        
        // 자동으로 길안내 시작
        setTimeout(() => {
            handleStartNavigation();
        }, 2000); // 2초 후 길안내 시작
        
    } catch (error) {
        console.error('자동 검색 및 길안내 오류:', error);
        speechService.speak('검색 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
}

// 검색 버튼 핸들러 수정
function handleSearch(overrideQuery = null) {
    try {
        // 이벤트 객체 처리
        if (overrideQuery && (overrideQuery instanceof Event)) {
            overrideQuery = null;
        }
        
        // 입력값 가져오기 - DOM에서 직접 가져오는 방식으로 변경
        let query = overrideQuery;
        
        if (query === null || query === undefined) {
            // ui.getDestinationInput() 대신 직접 DOM에서 가져오거나 ui.destinationInput 사용
            query = ui.destinationInput ? ui.destinationInput.value : '';
        }
        
        // 문자열 확인 및 변환
        if (typeof query !== 'string') {
            query = String(query || '');
        }
        
        // 공백 제거 및 유효성 검사
        query = query.trim();
        
        if (!query) {
            ui.setStatus('검색어를 입력하세요.');
            return;
        }
        
        ui.setStatus('검색 중...');
        
        // 위치 정보 확인
        const lat = currentPositionData ? currentPositionData.lat : null;
        const lng = currentPositionData ? currentPositionData.lng : null;
        
        console.log('검색 실행:', {
            쿼리: query,
            위도: lat,
            경도: lng,
            위치사용여부: Boolean(lat && lng)
        });
        
        // 검색 실행
        searchWithLocation(query, lat, lng);
    } catch (error) {
        console.error('검색 오류:', error);
        ui.setStatus('검색 중 오류가 발생했습니다: ' + error.message);
    }
}

// 상태 메시지 설정 함수
function setStatusMessage(message) {
    // ui.setStatus 대신 직접 DOM 조작
    const statusElement = document.getElementById('status-message');
    if (statusElement) {
        statusElement.textContent = message;
    }
    console.log('상태 메시지:', message);
}

// 거리 계산 함수 추가
function calculateDistance(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null;
    
    const R = 6371000; // 지구 반지름 (미터)
    
    const rad = Math.PI / 180;
    const lat1Rad = lat1 * rad;
    const lat2Rad = lat2 * rad;
    const latDiff = (lat2 - lat1) * rad;
    const lngDiff = (lng2 - lng1) * rad;
    
    const a = Math.sin(latDiff/2) * Math.sin(latDiff/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * 
              Math.sin(lngDiff/2) * Math.sin(lngDiff/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return Math.round(R * c); // 미터 단위 거리 (반올림)
}

// 목적지 선택 핸들러
function handleSelectDestination(place) {
    destinationData = place;
    
    mapService.setDestinationMarker(place.lat, place.lng, place.name);
    mapService.centerMap(place.lat, place.lng);
    
    ui.setDestinationInput(place.name);
    ui.hideSearchResults();
    
    const distanceText = place.distance 
        ? `거리는 ${place.distance < 1000 
            ? `${place.distance}미터` 
            : `${(place.distance / 1000).toFixed(1)}킬로미터`}입니다.` 
        : '';
    
    ui.setStatus(`목적지: ${place.name}`);
    speechService.speak(`목적지를 ${place.name}로 설정했습니다. ${distanceText} 길 안내를 시작하려면 안내 시작 버튼을 누르세요.`);
    
    // 경로 시작 버튼 활성화
    ui.setButtonEnabled('start-navigation', true);
}

// 네비게이션 시작 핸들러
async function handleStartNavigation() {
    if (!currentPositionData || !destinationData) {
        speechService.speak('출발지와 목적지를 모두 설정해야 합니다.');
        return;
    }
    
    try {
        ui.setStatus('경로를 계산 중입니다...', true);
        speechService.speak('경로를 계산 중입니다. 잠시만 기다려주세요.');
        
        const routeData = await navigationService.startNavigation(
            currentPositionData.lat,
            currentPositionData.lng,
            destinationData.lat,
            destinationData.lng
        );
        
        // 경로 표시
        mapService.clearRoute();
        mapService.drawRoute(routeData.coordinates);
        
        // UI 업데이트
        ui.setNavigationMode(true);
        
        // 거리, 시간 정보 포맷팅
        const distanceKm = (routeData.totalDistance/1000).toFixed(1);
        const timeFormatted = routeData.totalTime;
        
        ui.updateNavigationInfo(
            `${distanceKm}km`, 
            timeFormatted, 
            '안내를 시작합니다.'
        );
        
        // 음성 안내
        speechService.speak(`길 안내를 시작합니다. 총 거리는 ${distanceKm}킬로미터이며, 예상 소요 시간은 ${timeFormatted}입니다.`, 'high');
        
        // 첫 안내 정보 업데이트
        updateNavigationInfo();
    } catch (error) {
        console.error('경로 계산 오류:', error);
        ui.setStatus('경로를 계산할 수 없습니다.');
        speechService.speak('경로를 계산할 수 없습니다. 다시 시도해주세요.');
    }
}

// 네비게이션 종료 핸들러
function handleStopNavigation() {
    navigationService.stopNavigation();
    mapService.clearRoute();
    
    ui.setNavigationMode(false);
    speechService.speak('길 안내를 종료했습니다. 새 목적지를 검색하세요.');
}

// 음성 버튼 클릭 핸들러
function handleVoiceButtonClick() {
    const promptMap = {
        'asking_destination': '목적지를 말씀해 주세요.',
        'confirming_destination': '네 또는 아니오로 대답해주세요.',
        'confirming_search_result': '첫 번째 목적지로 안내를 시작할까요? 네 또는 아니오로 대답해주세요.'
    };
    const promptMessage = promptMap[conversationState] || '무엇을 도와드릴까요?';

    ui.setStatus('음성으로 말씀해주세요...');
    speechService.speak(promptMessage, 'high');

    setTimeout(() => {
        ui.setVoiceButtonRecording(true);
        try {
            speechService.startListening();
        } catch (error) {
            ui.setStatus('음성 인식을 시작할 수 없습니다.');
            ui.setVoiceButtonRecording(false);
        }
    }, 1000);
}

// 위치 갱신 함수 추가
function refreshCurrentLocation(callback) {
    ui.setStatus('위치 정보를 갱신 중...');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            currentPositionData = { lat, lng };
            console.log('위치 정보 갱신됨:', currentPositionData);
            
            mapService.updateCurrentPositionMarker(lat, lng, accuracy);
            ui.updateLocationDebug(lat, lng, accuracy, '위치 갱신됨');
            
            if (typeof callback === 'function') {
                callback();
            }
        },
        (error) => {
            console.error('위치 정보 갱신 실패:', error);
            ui.setStatus('위치 정보를 갱신할 수 없습니다. 위치 권한을 확인해주세요.');
            
            if (typeof callback === 'function') {
                callback();
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 음성 인식 결과 처리 함수
function handleVoiceInput(transcript) {
    ui.setVoiceButtonRecording(false);
    if (!transcript || typeof transcript !== 'string' || transcript.trim() === '') {
        ui.setStatus('음성이 인식되지 않았습니다.');
        return;
    }

    switch (conversationState) {
        case 'idle':
            ui.setDestinationInput(transcript);
            handleSearch(transcript);
            break;
        case 'asking_destination':
            ui.setDestinationInput(transcript);
            speechService.speak(`목적지를 ${transcript}로 설정할까요? 네 또는 아니오로 대답해주세요.`, 'high');
            conversationState = 'confirming_destination';
            setTimeout(() => handleVoiceButtonClick(), 3000);
            break;
        case 'confirming_destination': {
            const answer = transcript.toLowerCase().trim();
            console.log('확인 응답 인식:', answer);
            
            // 더 포괄적인 긍정 응답 패턴
            const positivePatterns = [
                /네/, /예/, /응/, /좋아/, /맞아/, /맞아요/, /맞습니다/, /맞습니다요/,
                /그래/, /그래요/, /그렇습니다/, /그렇습니다요/, /좋습니다/, /좋습니다요/,
                /확인/, /확인해/, /확인해요/, /확인합니다/, /확인합니다요/,
                /선택/, /선택해/, /선택해요/, /선택합니다/, /선택합니다요/,
                /설정/, /설정해/, /설정해요/, /설정합니다/, /설정합니다요/,
                /진행/, /진행해/, /진행해요/, /진행합니다/, /진행합니다요/,
                /시작/, /시작해/, /시작해요/, /시작합니다/, /시작합니다요/,
                /go/, /yes/, /ok/, /okay/, /yep/, /yeah/, /sure/, /right/
            ];
            
            // 더 포괄적인 부정 응답 패턴
            const negativePatterns = [
                /아니/, /아니오/, /아냐/, /아닙니다/, /아닙니다요/,
                /틀려/, /틀렸/, /틀렸어/, /틀렸어요/, /틀렸습니다/, /틀렸습니다요/,
                /다시/, /다시해/, /다시해요/, /다시합니다/, /다시합니다요/,
                /취소/, /취소해/, /취소해요/, /취소합니다/, /취소합니다요/,
                /no/, /nope/, /not/, /wrong/, /cancel/, /stop/
            ];
            
            const isPositive = positivePatterns.some(pattern => pattern.test(answer));
            const isNegative = negativePatterns.some(pattern => pattern.test(answer));
            
            console.log('긍정 응답 여부:', isPositive, '부정 응답 여부:', isNegative);
            
            if (isPositive) {
                console.log('목적지 확인됨, 검색 시작');
                speechService.speak('목적지를 확인했습니다. 검색을 시작합니다.', 'high');
                // 자동으로 검색 후 첫 번째 결과 선택하여 길안내 시작
                handleSearchAndStartNavigation(ui.destinationInput.value);
                conversationState = 'idle';
            } else if (isNegative) {
                console.log('목적지 거부됨, 다시 입력 요청');
                speechService.speak('목적지를 다시 말씀해주세요.', 'high');
                ui.setDestinationInput('');
                conversationState = 'asking_destination';
                setTimeout(() => handleVoiceButtonClick(), 2000);
            } else {
                console.log('인식되지 않은 응답, 다시 요청');
                speechService.speak(`"${answer}"로 인식되었습니다. 네 또는 아니오로 명확하게 대답해주세요.`, 'high');
                setTimeout(() => handleVoiceButtonClick(), 2500);
            }
            break;
        }
        case 'confirming_search_result': {
            const answer = transcript.toLowerCase().trim();
            console.log('검색 결과 확인 응답 인식:', answer);
            
            // 더 포괄적인 긍정 응답 패턴
            const positivePatterns = [
                /네/, /예/, /응/, /좋아/, /맞아/, /맞아요/, /맞습니다/, /맞습니다요/,
                /그래/, /그래요/, /그렇습니다/, /그렇습니다요/, /좋습니다/, /좋습니다요/,
                /확인/, /확인해/, /확인해요/, /확인합니다/, /확인합니다요/,
                /선택/, /선택해/, /선택해요/, /선택합니다/, /선택합니다요/,
                /설정/, /설정해/, /설정해요/, /설정합니다/, /설정합니다요/,
                /진행/, /진행해/, /진행해요/, /진행합니다/, /진행합니다요/,
                /시작/, /시작해/, /시작해요/, /시작합니다/, /시작합니다요/,
                /go/, /yes/, /ok/, /okay/, /yep/, /yeah/, /sure/, /right/
            ];
            
            // 더 포괄적인 부정 응답 패턴
            const negativePatterns = [
                /아니/, /아니오/, /아냐/, /아닙니다/, /아닙니다요/,
                /틀려/, /틀렸/, /틀렸어/, /틀렸어요/, /틀렸습니다/, /틀렸습니다요/,
                /다시/, /다시해/, /다시해요/, /다시합니다/, /다시합니다요/,
                /취소/, /취소해/, /취소해요/, /취소합니다/, /취소합니다요/,
                /no/, /nope/, /not/, /wrong/, /cancel/, /stop/
            ];
            
            const isPositive = positivePatterns.some(pattern => pattern.test(answer));
            const isNegative = negativePatterns.some(pattern => pattern.test(answer));
            
            console.log('긍정 응답 여부:', isPositive, '부정 응답 여부:', isNegative);
            
            if (isPositive) {
                console.log('첫 번째 목적지 선택됨, 내비게이션 시작');
                const firstPlace = searchResultItems[0];
                handleSelectDestination(firstPlace);
                setTimeout(() => handleStartNavigation(), 2000);
                conversationState = 'idle';
            } else if (isNegative) {
                console.log('첫 번째 목적지 거부됨, 목록에서 선택 요청');
                speechService.speak('검색 결과 목록에서 원하시는 목적지를 선택해주세요.', 'high');
                conversationState = 'idle';
            } else {
                console.log('인식되지 않은 응답, 다시 요청');
                speechService.speak(`"${answer}"로 인식되었습니다. 네 또는 아니오로 명확하게 대답해주세요.`, 'high');
                setTimeout(() => handleVoiceButtonClick(), 2500);
            }
            break;
        }
    }
}

// 자연어 검색 처리 함수
async function handleNaturalLanguageSearch(query) {
    try {
        ui.setStatus('자연어 질의를 처리 중입니다...', true);
        
        if (!query || query.trim() === '') {
            ui.setStatus('검색어가 없습니다.');
            return;
        }
        
        // 현재 위치 정보
        const lat = currentPositionData ? currentPositionData.lat : null;
        const lng = currentPositionData ? currentPositionData.lng : null;
        
        // 근처 검색 감지
        const isNearbySearch = query.includes('근처') || 
                               query.includes('주변') || 
                               query.includes('가까운');
        
        // 위치 정보가 없는데 근처 검색일 경우 경고
        if (isNearbySearch && (!lat || !lng)) {
            ui.setStatus('위치 정보가 필요한 검색입니다. 위치 권한을 확인해주세요.');
            speechService.speak('현재 위치를 찾을 수 없어 정확한 근처 검색이 어렵습니다.');
        }
        
        console.log('자연어 검색 시작:', { 
            쿼리: query, 
            위도: lat, 
            경도: lng,
            근처검색여부: isNearbySearch
        });
        
        // API 호출 - 위치 정보 전달
        const data = await apiService.naturalLanguageSearch(query, lat, lng);
        console.log("자연어 검색 결과 응답:", data);
        
        if (data.error) {
            ui.setStatus(`검색 오류: ${data.error}`);
            speechService.speak(data.error);
            return;
        }
        
        // 결과 처리
        if (data.explanation) {
            ui.setStatus(data.explanation);
            speechService.speak(`${data.explanation} 검색 결과를 표시합니다.`);
        }
        
        // 변환된 키워드 표시
        if (data.interpreted_as) {
            ui.setDestinationInput(data.interpreted_as);
        }
        
        // 검색 결과 표시
        ui.displaySearchResults(data.search_results, currentPositionData, handleSelectDestination);
        
        if (!data.search_results || data.search_results.length === 0) {
            ui.setStatus('검색 결과가 없습니다.');
            speechService.speak('검색 결과가 없습니다. 다른 표현으로 시도해보세요.');
        }
    } catch (error) {
        console.error('자연어 검색 오류:', error);
        ui.setStatus('검색 처리 중 오류가 발생했습니다.');
        speechService.speak('검색 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
}

// 지도 중심 이동 핸들러
function handleCenterMap() {
    if (currentPositionData) {
        mapService.centerMap(currentPositionData.lat, currentPositionData.lng);
    } else {
        speechService.speak('현재 위치를 확인할 수 없습니다.');
    }
}

// 위치 갱신 핸들러
function handleRefreshLocation() {
    getCurrentPosition(true);
}

// 현재 안내 읽기 핸들러
function handleReadInstruction() {
    if (currentGuidance) {
        navigationService.readCurrentGuidance(currentGuidance);
    } else {
        speechService.speak('현재 안내 정보가 없습니다.');
    }
}

// 음성 안내 토글 핸들러
function handleToggleVoice() {
    isVoiceEnabled = !isVoiceEnabled;
    speechService.setVoiceEnabled(isVoiceEnabled);
    
    ui.toggleVoiceButton.textContent = isVoiceEnabled ? '음성 끄기' : '음성 켜기';
    
    if (isVoiceEnabled) {
        speechService.speak('음성 안내가 켜졌습니다.');
    }
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', initApp);