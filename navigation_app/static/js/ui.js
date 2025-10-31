// UI 관련 기능을 처리하는 모듈

class UIService {
  constructor() {
    // DOM 요소는 init() 호출 시점에 초기화
  }

  init() {
    this.statusElement = document.getElementById('status');
    this.destinationInput = document.getElementById('destination');
    this.searchButton = document.getElementById('search');
    this.voiceButton = document.getElementById('voice-input');
    this.startNavigationButton = document.getElementById('start-navigation');
    this.stopNavigationButton = document.getElementById('stop-navigation');
    this.centerMapButton = document.getElementById('center-map');
    this.togglePanelButton = document.getElementById('toggle-panel');
    this.navigationPanel = document.getElementById('navigation-panel');
    this.navigationInfo = document.getElementById('navigation-info');
    this.destinationForm = document.getElementById('destination-form');
    this.distanceElement = document.getElementById('distance');
    this.timeElement = document.getElementById('time');
    this.nextDirectionElement = document.getElementById('next-direction');
    this.readInstructionButton = document.getElementById('read-instruction');
    this.toggleVoiceButton = document.getElementById('toggle-voice');
    this.searchResultsDiv = document.getElementById('search-results');

    this.initLocationDebugUI();
    this.initStyles();
  }

  setStatus(message, isLoading = false) {
    if (!this.statusElement) return;
    this.statusElement.innerHTML = isLoading
      ? `<div class="spinner"></div> ${message}`
      : message;
  }

  setDestinationInput(value) {
    if (this.destinationInput) {
      this.destinationInput.value = value;
    }
  }

  getDestinationInput() {
    return this.destinationInput ? this.destinationInput.value : '';
  }

  setVoiceButtonRecording(isRecording) {
    if (!this.voiceButton) return;

    this.voiceButton.classList.toggle('voice-recording', isRecording);

    const bigVoiceButton = document.getElementById('big-voice-input');
    if (bigVoiceButton) {
      bigVoiceButton.classList.toggle('voice-recording', isRecording);
    }
  }

  toggleBigVoiceButton(show) {
    const bigVoiceButton = document.getElementById('big-voice-input');
    if (bigVoiceButton) {
      bigVoiceButton.style.display = show ? 'flex' : 'none';
    }
  }

  setNavigationMode(isNavigating) {
    if (!this.navigationInfo || !this.destinationForm) return;
    this.navigationInfo.style.display = isNavigating ? 'block' : 'none';
    this.destinationForm.style.display = isNavigating ? 'none' : 'block';
  }

  updateNavigationInfo(distance, time, nextDirection) {
    if (this.distanceElement) this.distanceElement.textContent = distance;
    if (this.timeElement) this.timeElement.textContent = time;
    if (this.nextDirectionElement && nextDirection) {
      this.nextDirectionElement.textContent = nextDirection;
    }
  }

  setButtonEnabled(buttonId, enabled) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = !enabled;
    }
  }

  hideSearchResults() {
    if (this.searchResultsDiv) {
      this.searchResultsDiv.style.display = 'none';
    }
  }

  displaySearchResults(places, currentLocation, onSelect) {
    if (!this.searchResultsDiv) return;

    this.searchResultsDiv.innerHTML = '';
    const ul = document.createElement('ul');

    places.forEach(place => {
      const li = document.createElement('li');
      li.textContent = place.name;

      if (place.distance) {
        const distanceSpan = document.createElement('div');
        distanceSpan.className = 'distance-info';
        distanceSpan.textContent = place.distance < 1000
          ? `${place.distance}m`
          : `${(place.distance / 1000).toFixed(1)}km`;
        li.appendChild(distanceSpan);
      }

      li.addEventListener('click', () => {
        if (typeof onSelect === 'function') {
          onSelect(place);
        }
      });

      ul.appendChild(li);
    });

    this.searchResultsDiv.appendChild(ul);
    this.searchResultsDiv.style.display = 'block';
  }

  updateLocationDebug(lat, lng, accuracy, permission) {
    const permElem = document.getElementById('loc-permission');
    const latElem = document.getElementById('loc-lat');
    const lngElem = document.getElementById('loc-lng');
    const accElem = document.getElementById('loc-accuracy');

    if (permission && permElem) permElem.textContent = permission;
    if (lat && latElem) latElem.textContent = lat.toFixed(6);
    if (lng && lngElem) lngElem.textContent = lng.toFixed(6);
    if (accuracy && accElem) accElem.textContent = accuracy.toFixed(1);
  }

  togglePanel() {
    if (!this.navigationPanel || !this.togglePanelButton) return;
    this.navigationPanel.classList.toggle('collapsed');
    this.togglePanelButton.innerHTML = this.navigationPanel.classList.contains('collapsed')
      ? '<i class="fas fa-chevron-down"></i>'
      : '<i class="fas fa-chevron-up"></i>';
  }

  initLocationDebugUI() {
    const navigationView = document.getElementById('navigation-view');
    if (!navigationView) return;
  
    const locationDebug = document.createElement('div');
    locationDebug.id = 'location-debug';
    locationDebug.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 8px;
      border-radius: 5px;
      font-size: 11px;
      max-width: 200px;
      z-index: 1000;
    `;
    locationDebug.innerHTML = `
      <div>위치 권한: <span id="loc-permission">확인 중...</span></div>
      <div>현재 위도: <span id="loc-lat">N/A</span></div>
      <div>현재 경도: <span id="loc-lng">N/A</span></div>
      <div>정확도: <span id="loc-accuracy">N/A</span>m</div>
      <button id="refresh-location" style="font-size: 11px; padding: 3px 5px; margin-top: 5px;">위치 갱신</button>
    `;
  
    // 👉 여기: navigation-view 안에만 추가되도록
    navigationView.appendChild(locationDebug);
  }

  initStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(0,0,0,0.1);
        border-radius: 50%;
        border-top-color: #4a89dc;
        animation: spin 1s ease-in-out infinite;
        vertical-align: middle;
        margin-right: 8px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .voice-recording {
        background-color: #f44336 !important;
      }

      .current-position-marker {
        animation: pulse 1.5s infinite;
      }

      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.4; }
        100% { opacity: 1; }
      }

      #search-results {
        max-height: 300px;
        overflow-y: auto;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }

      #search-results ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      #search-results li {
        padding: 10px 15px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
      }

      #search-results li:hover {
        background-color: #f5f5f5;
      }

      .distance-info {
        color: #0066cc;
        font-weight: bold;
        margin-top: 5px;
      }

      .no-location {
        color: #cc0000;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  registerEventListeners(handlers) {
    if (handlers.onSearch && this.searchButton)
      this.searchButton.addEventListener('click', handlers.onSearch);
    if (handlers.onVoiceInput && this.voiceButton)
      this.voiceButton.addEventListener('click', handlers.onVoiceInput);
    if (handlers.onStartNavigation && this.startNavigationButton)
      this.startNavigationButton.addEventListener('click', handlers.onStartNavigation);
    if (handlers.onStopNavigation && this.stopNavigationButton)
      this.stopNavigationButton.addEventListener('click', handlers.onStopNavigation);
    if (handlers.onCenterMap && this.centerMapButton)
      this.centerMapButton.addEventListener('click', handlers.onCenterMap);
    if (this.togglePanelButton)
      this.togglePanelButton.addEventListener('click', handlers.onTogglePanel || this.togglePanel.bind(this));
    if (handlers.onReadInstruction && this.readInstructionButton)
      this.readInstructionButton.addEventListener('click', handlers.onReadInstruction);
    if (handlers.onToggleVoice && this.toggleVoiceButton)
      this.toggleVoiceButton.addEventListener('click', handlers.onToggleVoice);

    const bigVoiceButton = document.getElementById('big-voice-input');
    if (bigVoiceButton && handlers.onBigVoiceInput)
      bigVoiceButton.addEventListener('click', handlers.onBigVoiceInput);

    const goToDetectionButton = document.getElementById('go-to-detection');
    if (goToDetectionButton && handlers.onGoToDetection)
      goToDetectionButton.addEventListener('click', handlers.onGoToDetection);

    const goToDetectionNavButton = document.getElementById('go-to-detection-nav');
    if (goToDetectionNavButton && handlers.onGoToDetection)
      goToDetectionNavButton.addEventListener('click', handlers.onGoToDetection);

    const refreshLocationButton = document.getElementById('refresh-location');
    if (refreshLocationButton && handlers.onRefreshLocation)
      refreshLocationButton.addEventListener('click', handlers.onRefreshLocation);
  }
}

const ui = new UIService();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ui.init());
} else {
  ui.init();
}

export default ui;
