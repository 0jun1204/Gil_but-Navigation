/**
 * API 서비스 모듈
 * 모든 API 호출 기능을 담당하는 모듈입니다.
 */

// 장소 검색 API 함수 수정
export async function searchPlaces(keyword, lat, lng, radius = 3000) {
    try {
        console.log('검색 요청:', { keyword, lat, lng, radius });
        
        // 키워드에 '근처' 키워드가 포함된 경우 반경 축소
        if (keyword.includes('근처') || keyword.includes('주변') || keyword.includes('가까운')) {
            console.log('근처 검색 감지: 반경 축소');
            radius = 1000; // 1km로 제한
            
            // 필터링할 키워드 추출 (근처, 주변 등 제외)
            const cleanKeyword = keyword.replace(/근처|주변|가까운/g, '').trim();
            if (cleanKeyword) {
                keyword = cleanKeyword;
                console.log('정제된 키워드:', keyword);
            }
        }
        
        // 위치 정보 로깅
        const hasLocation = Boolean(lat && lng);
        console.log('위치 정보 포함 여부:', hasLocation);
        
        // 요청 URL 구성 - 항상 위치 정보 포함 (있는 경우)
        let url = `/api/search?keyword=${encodeURIComponent(keyword)}`;
        
        if (hasLocation) {
            // 소수점 자릿수 제한 및 정수 변환 
            const latRounded = parseFloat(lat.toFixed(6)); // 소수점 6자리로 제한
            const lngRounded = parseFloat(lng.toFixed(6)); // 소수점 6자리로 제한
            const radiusInt = Math.round(radius);          // 정수로 변환
            
            url += `&lat=${latRounded}&lng=${lngRounded}&radius=${radiusInt}&use_current_location=true`;
        }
        
        console.log('API 호출 URL:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 거리 정보 추가 및 계산
        if (hasLocation && data.places) {
            data.places.forEach(place => {
                if (!place.distance && place.lat && place.lng) {
                    place.distance = calculateDistance(lat, lng, place.lat, place.lng);
                    console.log(`거리 계산됨: ${place.name} - ${place.distance}m`);
                }
            });
            
            // 주요 변경: 거리 기준 필터링 개선
            const originalCount = data.places.length;
            
            // 필터링 전 원본 데이터 보존
            const allPlaces = [...data.places];
            
            // 반경 내 결과 필터링
            data.places = data.places.filter(place => 
                place.distance && place.distance <= radius
            );
            
            console.log(`검색 결과 필터링: 총 ${originalCount}개 중 ${data.places.length}개가 ${radius}m 반경 내에 있습니다.`);
            
            // 중요 변경: 필터링 후 결과가 없으면 가장 가까운 5개 결과 표시
            if (data.places.length === 0) {
                console.log('반경 내 결과 없음, 가까운 장소 5개 표시');
                
                // 거리 기준 정렬 후 가까운 5개 선택
                allPlaces.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
                data.places = allPlaces.slice(0, 5);
                
                // 알림 메시지 추가
                data.warning = `${radius}m 반경 내에 검색 결과가 없어 가장 가까운 장소를 보여줍니다.`;
            } else {
                // 거리 기준 정렬
                data.places.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
            }
        }
        
        return data;
    } catch (error) {
        console.error('검색 API 오류:', error);
        return { error: error.message || '검색 중 오류가 발생했습니다.' };
    }
}

// 경로 계산 API - POST 요청으로 수정
export async function getRoute(startLat, startLng, endLat, endLng) {
    try {
        const requestData = {
            start_lat: startLat,
            start_lng: startLng,
            end_lat: endLat,
            end_lng: endLng
        };
        
        const response = await fetch('/api/get_route', {
            method: 'POST',  // GET에서 POST로 변경
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('경로 계산 API 오류:', error);
        return { error: error.message || '경로 계산 중 오류가 발생했습니다.' };
    }
}

// 자연어 검색 API 함수 수정
export async function naturalLanguageSearch(query, lat, lng) {
    try {
        console.log('자연어 검색 요청:', { query, lat, lng });
        
        // 위치 정보 확인 및 로깅
        const hasLocation = Boolean(lat && lng);
        console.log('위치 정보 포함 여부:', hasLocation);
        
        // 요청 데이터 구성
        const requestData = {
            query: query,
            lat: lat || null,
            lng: lng || null,
            use_current_location: hasLocation
        };
        
        console.log('자연어 검색 요청 데이터:', requestData);
        
        const response = await fetch('/api/natural_language_search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            console.error('자연어 검색 응답 오류:', response.status);
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 거리 정보 추가 - 서버에서 계산되지 않았을 경우
        if (hasLocation && data.search_results) {
            data.search_results.forEach(place => {
                if (!place.distance && place.lat && place.lng) {
                    place.distance = calculateDistance(lat, lng, place.lat, place.lng);
                    console.log(`거리 계산됨: ${place.name} - ${place.distance}m`);
                }
            });
            
            // 거리 기준 정렬
            data.search_results.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        }
        
        return data;
    } catch (error) {
        console.error('자연어 검색 API 오류:', error);
        
        // 오류 발생 시 일반 검색으로 대체
        console.warn('자연어 검색 실패, 일반 검색으로 대체');
        return await searchPlaces(query, lat, lng, 1000); // 반경 1km로 제한
    }
}

// 내비게이션 업데이트 API
export async function updateNavigation(currentLat, currentLng, sessionId) {
    try {
        const requestData = {
            current_lat: currentLat,
            current_lng: currentLng,
            session_id: sessionId
        };
        
        const response = await fetch('/api/guidance_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('내비게이션 업데이트 API 오류:', error);
        return { error: error.message || '내비게이션 업데이트 중 오류가 발생했습니다.' };
    }
}

// TTS(음성 합성) API
export async function generateSpeech(text, voiceId = null) {
    try {
        const requestData = {
            text: text,
            voice_id: voiceId
        };
        
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('TTS API 오류:', error);
        return { error: error.message || '음성 생성 중 오류가 발생했습니다.' };
    }
}

// 카테고리 기반 근처 장소 검색 API
export async function searchNearbyCategory(category, lat, lng, radius = 1000) {
    try {
        if (!lat || !lng) {
            throw new Error('위치 정보가 필요합니다.');
        }
        
        const url = `/api/search_nearby?category=${encodeURIComponent(category)}&lat=${lat}&lng=${lng}&radius=${radius}`;
        console.log('카테고리 검색 요청:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('카테고리 검색 API 오류:', error);
        return { error: error.message || '장소 검색 중 오류가 발생했습니다.' };
    }
}

// 거리 계산 함수
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
    
    return Math.round(R * c); // 미터 단위 정수로 반환
}

// API 상태 확인
export async function checkApiStatus() {
    try {
        const response = await fetch('/api/test');
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API 상태 확인 오류:', error);
        return { status: 'error', message: error.message };
    }
}

// 기본 내보내기 - API 서비스 객체
export default {
    searchPlaces,
    getRoute,
    naturalLanguageSearch,
    updateNavigation,
    generateSpeech,
    searchNearbyCategory,
    checkApiStatus
};