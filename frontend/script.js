class LiveSubtitleSystem {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.currentTranscript = '';
        this.previousTranscript = '';
        this.startTime = null;
        this.lastUpdateTime = null;
        this.confidenceThreshold = 0.7;
        this.fontSize = 24;
        this.showConfidence = false;
        this.autoScroll = true;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSpeechRecognition();
        this.loadSettings();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.languageSelect = document.getElementById('languageSelect');
        this.statusText = document.getElementById('statusText');
        this.statusDot = document.getElementById('statusDot');
        this.latencyValue = document.getElementById('latencyValue');
        this.currentSubtitle = document.getElementById('currentSubtitle');
        this.previousSubtitle = document.getElementById('previousSubtitle');
        this.transcript = document.getElementById('transcript');
        this.clearTranscript = document.getElementById('clearTranscript');
        this.fontSizeSlider = document.getElementById('fontSizeSlider');
        this.fontSizeValue = document.getElementById('fontSizeValue');
        this.confidenceThreshold = document.getElementById('confidenceThreshold');
        this.confidenceValue = document.getElementById('confidenceValue');
        this.showConfidenceCheckbox = document.getElementById('showConfidence');
        this.autoScrollCheckbox = document.getElementById('autoScroll');
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startListening());
        this.stopBtn.addEventListener('click', () => this.stopListening());
        this.clearTranscript.addEventListener('click', () => this.clearTranscriptHistory());

        this.fontSizeSlider.addEventListener('input', (e) => {
            this.fontSize = parseInt(e.target.value);
            this.fontSizeValue.textContent = `${this.fontSize}px`;
            this.currentSubtitle.style.fontSize = `${this.fontSize}px`;
            this.saveSettings();
        });

        this.confidenceThreshold.addEventListener('input', (e) => {
            this.confidenceThreshold = parseFloat(e.target.value);
            this.confidenceValue.textContent = this.confidenceThreshold;
            this.saveSettings();
        });

        this.showConfidenceCheckbox.addEventListener('change', (e) => {
            this.showConfidence = e.target.checked;
            this.saveSettings();
        });

        this.autoScrollCheckbox.addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
            this.saveSettings();
        });

        this.languageSelect.addEventListener('change', () => {
            if (this.isListening) {
                this.stopListening();
                setTimeout(() => this.startListening(), 100);
            }
        });
    }

    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        // Configure for maximum responsiveness
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        // Set language
        this.recognition.lang = this.languageSelect.value;

        this.recognition.onstart = () => {
            this.isListening = true;
            this.startTime = Date.now();
            this.updateStatus('Listening...', 'listening');
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
        };

        this.recognition.onresult = (event) => {
            this.handleSpeechResult(event);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.handleError(event.error);
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                // Automatically restart if we're supposed to be listening
                setTimeout(() => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                }, 100);
            } else {
                this.updateStatus('Ready', 'offline');
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
            }
        };
    }

    handleSpeechResult(event) {
        const currentTime = Date.now();
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence;

            if (result.isFinal) {
                if (confidence >= this.confidenceThreshold) {
                    finalTranscript += transcript;
                }
            } else {
                interimTranscript += transcript;
            }
        }

        // Update latency calculation
        if (this.lastUpdateTime) {
            const latency = currentTime - this.lastUpdateTime;
            this.latencyValue.textContent = Math.round(latency);
        }
        this.lastUpdateTime = currentTime;

        // Update current subtitle with interim results for immediate feedback
        if (interimTranscript) {
            this.updateCurrentSubtitle(interimTranscript, false);
        }

        // Handle final results
        if (finalTranscript) {
            this.updateCurrentSubtitle(finalTranscript, true);
            this.addToTranscript(finalTranscript, event.results[event.results.length - 1][0].confidence);
        }
    }

    updateCurrentSubtitle(text, isFinal) {
        if (text.trim()) {
            // Move current to previous if this is a final result
            if (isFinal && this.currentTranscript) {
                this.previousSubtitle.textContent = this.currentTranscript;
            }

            this.currentTranscript = text.trim();
            this.currentSubtitle.textContent = this.currentTranscript;

            // Add visual indication for interim vs final results
            if (isFinal) {
                this.currentSubtitle.style.opacity = '1';
                this.currentSubtitle.style.fontWeight = '600';
            } else {
                this.currentSubtitle.style.opacity = '0.8';
                this.currentSubtitle.style.fontWeight = '400';
            }
        }
    }

    addToTranscript(text, confidence) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'transcript-entry';

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp';
        timestampDiv.textContent = timestamp;

        const textDiv = document.createElement('div');
        textDiv.textContent = text;

        if (this.showConfidence) {
            const confidenceDiv = document.createElement('div');
            confidenceDiv.className = 'confidence';
            confidenceDiv.textContent = `${Math.round(confidence * 100)}%`;
            entry.appendChild(confidenceDiv);
        }

        entry.appendChild(timestampDiv);
        entry.appendChild(textDiv);

        this.transcript.appendChild(entry);

        if (this.autoScroll) {
            this.transcript.scrollTop = this.transcript.scrollHeight;
        }
    }

    startListening() {
        if (!this.recognition) {
            this.showError('Speech recognition not available');
            return;
        }

        // Request microphone permission
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                this.recognition.lang = this.languageSelect.value;
                this.recognition.start();
                this.currentSubtitle.textContent = 'Listening for speech...';
            })
            .catch((error) => {
                this.showError('Microphone access denied. Please allow microphone access and try again.');
                console.error('Microphone access error:', error);
            });
    }

    stopListening() {
        this.isListening = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.updateStatus('Ready', 'offline');
        this.currentSubtitle.textContent = 'Click "Start Live Subtitles" to begin';
        this.previousSubtitle.textContent = '';
        this.latencyValue.textContent = '--';
    }

    clearTranscriptHistory() {
        this.transcript.innerHTML = '';
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusDot.className = `status-dot ${status}`;
    }

    handleError(error) {
        let errorMessage = 'Speech recognition error: ';

        switch (error) {
            case 'no-speech':
                errorMessage += 'No speech detected. Please speak into your microphone.';
                break;
            case 'audio-capture':
                errorMessage += 'Microphone not accessible. Please check your microphone settings.';
                break;
            case 'not-allowed':
                errorMessage += 'Microphone access denied. Please allow microphone access.';
                break;
            case 'network':
                errorMessage += 'Network error. Please check your internet connection.';
                break;
            case 'service-not-allowed':
                errorMessage += 'Speech recognition service not allowed.';
                break;
            default:
                errorMessage += error;
        }

        this.showError(errorMessage);
        this.updateStatus('Error', 'offline');
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
            z-index: 1000;
            max-width: 400px;
            font-weight: 500;
        `;
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    saveSettings() {
        const settings = {
            fontSize: this.fontSize,
            confidenceThreshold: this.confidenceThreshold,
            showConfidence: this.showConfidence,
            autoScroll: this.autoScroll,
            language: this.languageSelect.value
        };
        localStorage.setItem('liveSubtitleSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('liveSubtitleSettings');
        if (saved) {
            const settings = JSON.parse(saved);

            this.fontSize = settings.fontSize || 24;
            this.confidenceThreshold = settings.confidenceThreshold || 0.7;
            this.showConfidence = settings.showConfidence || false;
            this.autoScroll = settings.autoScroll !== undefined ? settings.autoScroll : true;

            // Update UI elements
            this.fontSizeSlider.value = this.fontSize;
            this.fontSizeValue.textContent = `${this.fontSize}px`;
            this.currentSubtitle.style.fontSize = `${this.fontSize}px`;

            this.confidenceThreshold.value = this.confidenceThreshold;
            this.confidenceValue.textContent = this.confidenceThreshold;

            this.showConfidenceCheckbox.checked = this.showConfidence;
            this.autoScrollCheckbox.checked = this.autoScroll;

            if (settings.language) {
                this.languageSelect.value = settings.language;
            }
        }
    }
}

// Initialize the system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new LiveSubtitleSystem();
});

// Add keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case ' ':
                event.preventDefault();
                const startBtn = document.getElementById('startBtn');
                const stopBtn = document.getElementById('stopBtn');
                if (!startBtn.disabled) {
                    startBtn.click();
                } else if (!stopBtn.disabled) {
                    stopBtn.click();
                }
                break;
            case 'c':
                if (event.shiftKey) {
                    event.preventDefault();
                    document.getElementById('clearTranscript').click();
                }
                break;
        }
    }
});
