// 음성 관련 기능을 모아놓은 모듈

class SpeechService {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.recognition = null;
        this.isListening = false;
        this.isVoiceEnabled = true;
        this.voiceQueue = [];
        this.isSpeaking = false;
        this.preferredVoice = null;

        // 확장 기능
        this.autoRecognitionEnabled = false;
        this.confirmationDestinations = [];
        this.currentConfirmationIndex = 0;

        this.initVoices();
    }

    // 음성 합성 초기화
    initVoices() {
        if (this.synthesis.getVoices().length) {
            this.setPreferredVoice();
        }

        this.synthesis.onvoiceschanged = () => {
            this.setPreferredVoice();
        };
    }

    // 선호 음성 설정 (한국어 > 영어 우선)
    setPreferredVoice() {
        const voices = this.synthesis.getVoices();
        const koreanVoice = voices.find(v => /ko/i.test(v.lang));
        const englishVoice = voices.find(v => /en/i.test(v.lang));
        this.preferredVoice = koreanVoice || englishVoice || voices[0];
        console.log(`선택된 음성: ${this.preferredVoice?.name || '없음'}`);
    }

    // 텍스트를 음성으로 말하기
    speak(text, priority = 'normal') {
        if (!this.isVoiceEnabled) return;
        if (!this.synthesis || typeof this.synthesis.speak !== 'function') return;

        console.log(`[음성]: ${text} (${priority})`);

        try {
            if (priority === 'high' && this.isSpeaking) {
                this.synthesis.cancel();
                this.voiceQueue = [];
            }

            this.voiceQueue.push(text);
            if (!this.isSpeaking) this.processVoiceQueue();
        } catch (e) {
            console.error('음성 합성 오류:', e);
        }
    }

    // speak 별칭 (결과 반환 포함)
    speakText(text, priority = 'normal') {
        return this.speak(text, priority);
    }

    // 대기열 처리
    processVoiceQueue() {
        if (this.voiceQueue.length === 0) {
            this.isSpeaking = false;
            return;
        }

        this.isSpeaking = true;
        const text = this.voiceQueue.shift();
        const utterance = new SpeechSynthesisUtterance(text);

        if (this.preferredVoice) utterance.voice = this.preferredVoice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => setTimeout(() => this.processVoiceQueue(), 100);
        utterance.onerror = (e) => {
            console.error('음성 오류:', e);
            setTimeout(() => this.processVoiceQueue(), 100);
        };

        this.synthesis.speak(utterance);
    }

    // 음성 인식 초기화
    initSpeechRecognition(callback) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("이 브라우저는 음성 인식을 지원하지 않습니다.");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'ko-KR';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 3; // 여러 인식 결과 받기

        this.recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const result = event.results[last];
            
            // 모든 대안 결과 로깅
            console.log('음성 인식 결과들:');
            for (let i = 0; i < result.length; i++) {
                console.log(`  ${i + 1}. "${result[i].transcript}" (신뢰도: ${result[i].confidence})`);
            }
            
            // 가장 신뢰도가 높은 결과 선택
            let bestTranscript = result[0].transcript;
            let bestConfidence = result[0].confidence || 0;
            
            for (let i = 1; i < result.length; i++) {
                const confidence = result[i].confidence || 0;
                if (confidence > bestConfidence) {
                    bestTranscript = result[i].transcript;
                    bestConfidence = confidence;
                }
            }
            
            console.log(`선택된 결과: "${bestTranscript}" (신뢰도: ${bestConfidence})`);
            if (callback) callback(bestTranscript);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            console.log('음성 인식 종료');
            if (this.autoRecognitionEnabled) {
                setTimeout(() => this.startListening(), 500);
            }
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            console.error('음성 인식 오류:', event.error);

            let msg = '음성 인식 중 오류가 발생했습니다.';
            if (event.error === 'no-speech') {
                msg = '음성이 감지되지 않았습니다. 다시 말씀해주세요.';
            } else if (event.error === 'aborted') {
                msg = '음성 인식이 중단되었습니다. 다시 시도해주세요.';
            } else if (event.error === 'audio-capture') {
                msg = '마이크를 찾을 수 없습니다. 마이크 연결을 확인해주세요.';
            } else if (event.error === 'network') {
                msg = '네트워크 오류로 음성 인식이 실패했습니다. 인터넷 연결을 확인해주세요.';
            } else if (event.error === 'not-allowed') {
                msg = '마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.';
            } else if (event.error === 'service-not-allowed') {
                msg = '음성 인식 서비스가 허용되지 않았습니다.';
            }

            this.speak(msg);
            
            // 오류 발생 시 자동으로 다시 시도 (no-speech, aborted의 경우)
            if (event.error === 'no-speech' || event.error === 'aborted') {
                setTimeout(() => {
                    if (!this.isListening) {
                        console.log('음성 인식 재시도');
                        this.startListening();
                    }
                }, 2000);
            }
        };
    }

    startListening() {
        if (!this.recognition) {
            console.error("음성 인식이 초기화되지 않았습니다.");
            return;
        }

        try {
            this.recognition.start();
            this.isListening = true;
            console.log("음성 인식 시작");
        } catch (e) {
            console.error('음성 인식 시작 오류:', e);
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }

    // 음성 안내 On/Off
    setVoiceEnabled(enabled) {
        this.isVoiceEnabled = enabled;
        if (!enabled) {
            this.synthesis.cancel();
            this.voiceQueue = [];
            this.isSpeaking = false;
        }
    }

    // 🔁 자동 음성 인식 제어
    enableAutoRecognition() {
        this.autoRecognitionEnabled = true;
        if (!this.isListening && this.recognition) this.startListening();
    }

    disableAutoRecognition() {
        this.autoRecognitionEnabled = false;
    }

    // 🔊 목적지 3개 읽어주기
    readTopDestinations(destinations) {
        if (!Array.isArray(destinations)) {
            console.error("목적지 배열 아님");
            return;
        }

        const topThree = destinations.slice(0, 3);
        let message = "추천 목적지입니다. ";
        topThree.forEach((dest, i) => {
            message += `${i + 1}번: ${dest}. `;
        });
        this.speak(message, 'normal');
    }

    // ❓ 네/아니오로 목적지 선택 받기
    confirmDestinations(destinations, selectionCallback) {
        if (!Array.isArray(destinations) || destinations.length === 0) {
            console.error("확인할 목적지가 없습니다.");
            if (selectionCallback) selectionCallback(null);
            return;
        }

        this.confirmationDestinations = destinations.slice(0, 3);
        this.currentConfirmationIndex = 0;

        const askNext = () => {
            if (this.currentConfirmationIndex >= this.confirmationDestinations.length) {
                this.speak("목적지가 선택되지 않았습니다.", "high");
                if (selectionCallback) selectionCallback(null);
                return;
            }

            const dest = this.confirmationDestinations[this.currentConfirmationIndex];
            this.speak(`제안 ${this.currentConfirmationIndex + 1}: ${dest}. 이 목적지로 선택하시겠습니까? 네 또는 아니오로 대답해주세요.`, "normal");

            this.initSpeechRecognition((transcript) => {
                const answer = transcript.toLowerCase().trim();
                console.log('목적지 확인 응답:', answer);
                
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
                
                if (isPositive) {
                    this.speak("선택되었습니다.", "normal");
                    if (selectionCallback) selectionCallback(dest);
                } else if (isNegative) {
                    this.currentConfirmationIndex++;
                    askNext();
                } else {
                    this.speak(`"${answer}"로 인식되었습니다. 네 또는 아니오로 명확하게 대답해주세요.`, "normal");
                    askNext();
                }
            });

            this.startListening();
        };

        askNext();
    }
}

// 싱글톤 인스턴스 생성하여 내보내기
const speechService = new SpeechService();
export default speechService;

// === MP3 오디오 큐 (겹침 방지) ===
let mp3Queue = [];
let isMp3Playing = false;

// ✅ 최근 재생된 MP3 기록 (2초 이내 중복 방지)
let recentlyPlayedMp3 = [];

function enqueueMp3(src) {
    const now = Date.now();

    // 2초 이내에 같은 src 재생되었는지 확인
    if (recentlyPlayedMp3.some(item => item.src === src && now - item.timestamp < 2000)) {
        return;
    }

    // 기록 추가
    recentlyPlayedMp3.push({ src, timestamp: now });
    if (recentlyPlayedMp3.length > 10) {
        recentlyPlayedMp3.shift(); // 오래된 것 삭제
    }

    mp3Queue.push({ src, timestamp: now });
    playNextMp3();
}

function playNextMp3() {
    if (isMp3Playing || mp3Queue.length === 0) return;

    const now = Date.now();
    while (mp3Queue.length > 0 && now - mp3Queue[0].timestamp > 2000) {
        mp3Queue.shift(); // 너무 오래된 항목 제거
    }

    if (mp3Queue.length === 0) return;

    const { src } = mp3Queue.shift();
    const audio = new Audio(src);
    isMp3Playing = true;

    audio.addEventListener('ended', () => {
        isMp3Playing = false;
        setTimeout(playNextMp3, 100);
    });

    audio.play().catch(err => {
        console.warn("오디오 재생 실패:", err);
        isMp3Playing = false;
        setTimeout(playNextMp3, 100);
    });
}

// ✅ 전역에서도 사용 가능하도록 등록
window.enqueueMp3 = enqueueMp3;
export { enqueueMp3 };
