// 네비게이션 관련 기능을 모아놓은 모듈

// API 서비스와 음성 서비스 가져오기
import apiService from './api.js';
import speechService from './speech.js';

class NavigationService {
    constructor() {
        this.isActive = false;
        this.sessionId = null;
        this.guidancePoints = [];
        this.currentGuidanceIndex = 0;
    }

    // 경로 안내 시작
    async startNavigation(startLat, startLng, endLat, endLng) {
        try {
            console.log('경로 계산 시작:', {
                출발점: [startLat, startLng],
                도착점: [endLat, endLng]
            });
            
            // apiService 직접 참조 (this.apiService가 아님)
            const routeData = await apiService.getRoute(startLat, startLng, endLat, endLng);
            
            console.log('서버 응답:', routeData);
            
            if (routeData.error) {
                console.error('경로 데이터 오류:', routeData.error);
                throw new Error(routeData.error);
            }
            
            if (!routeData.coordinates || routeData.coordinates.length === 0) {
                console.error('경로 좌표가 없음');
                throw new Error('유효한 경로 좌표가 없습니다.');
            }
            
            // 세션 저장
            this.sessionId = routeData.session_id;
            this.isActive = true;
            this.guidancePoints = routeData.guidance || [];
            this.currentGuidanceIndex = 0;
            
            // 결과 반환 (좌표, 총 거리, 소요 시간 등)
            return {
                coordinates: routeData.coordinates,
                totalDistance: routeData.total_distance,
                totalTime: routeData.total_time,
                guidance: routeData.guidance
            };
        } catch (error) {
            console.error('경로 계산 중 오류 발생:', error);
            throw new Error('경로를 계산할 수 없습니다: ' + error.message);
        }
    }

    // 네비게이션 업데이트
    async updateNavigation(currentLat, currentLng) {
        if (!this.isActive || !this.sessionId) {
            return null;
        }

        try {
            // 업데이트 데이터 가져오기
            const data = await apiService.updateNavigation(currentLat, currentLng, this.sessionId);
            
            if (data.error) {
                console.error('안내 업데이트 오류:', data.error);
                return null;
            }

            // 목적지 도착 확인
            if (data.is_arrived) {
                return {
                    arrived: true,
                    guidance: "목적지에 도착했습니다!"
                };
            }

            // 경로 이탈 확인
            if (data.deviation_warning) {
                speechService.speak(data.deviation_warning, 'high');
                return {
                    guidance: data.deviation_warning,
                    distance: "이탈",
                    time: "경로 복귀 필요"
                };
            }

            // 다음 안내 준비
            let nextGuidance = "";
            
            if (data.next_guidance) {
                const distToNext = data.distance_to_next;
                const description = data.next_guidance.description;
                
                // 새로운 안내를 읽어줄지 결정
                if (distToNext < 30 && this.currentGuidanceIndex !== data.next_guidance.index) {
                    nextGuidance = description;
                    this.currentGuidanceIndex = data.next_guidance.index;
                    speechService.speak(description, 'high');
                } else {
                    nextGuidance = `${Math.round(distToNext)}m 앞에서 ${description}`;
                }
            } else {
                nextGuidance = "직진하세요";
            }

            // 남은 거리 및 시간 형식화
            const distance = formatDistance(data.remaining_distance);
            const time = formatTime(data.remaining_time);

            return {
                guidance: nextGuidance,
                distance: distance,
                time: time
            };
        } catch (error) {
            console.error('네비게이션 업데이트 오류:', error);
            return null;
        }
    }

    // 네비게이션 종료
    stopNavigation() {
        this.isActive = false;
        this.sessionId = null;
        this.guidancePoints = [];
        this.currentGuidanceIndex = 0;
    }

    // 네비게이션 활성화 상태 확인
    isNavigationActive() {
        return this.isActive;
    }

    // 현재 안내 읽기
    readCurrentGuidance(guidance) {
        if (guidance) {
            speechService.speak(guidance, 'high');
        }
    }
}

// 남은 거리 형식화
function formatDistance(meters) {
    if (!meters) return "계산 중...";
    
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    } else {
        return `${(meters / 1000).toFixed(1)}km`;
    }
}

// 남은 시간 형식화
function formatTime(seconds) {
    if (!seconds) return "계산 중...";
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (minutes < 60) {
        return `${minutes}분 ${remainingSeconds}초`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}시간 ${remainingMinutes}분`;
    }
}

// 싱글톤 인스턴스 생성하여 내보내기
const navigationService = new NavigationService();
export default navigationService;