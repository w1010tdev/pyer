// 显示端主程序 - 自定义音频播放器版本
document.addEventListener('DOMContentLoaded', function() {
    // 元素引用
    const waitingState = document.getElementById('waitingState');
    const slideContainer = document.getElementById('slideContainer');
    const slideFrame = document.getElementById('slideFrame');
    const musicContainer = document.getElementById('musicContainer');
    const backgroundOverlay = document.getElementById('backgroundOverlay');
    const coverImage = document.getElementById('coverImage');
    const albumCover = document.getElementById('albumCover');
    const trackTitle = document.getElementById('trackTitle');
    const trackArtist = document.getElementById('trackArtist');
    const lyricContainer = document.getElementById('lyric');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const musicStatusDot = document.getElementById('musicStatusDot');
    const musicStatusText = document.getElementById('musicStatusText');
    const audioEnableOverlay = document.createElement('div');
    
    // 音频控件元素
    const audioControls = document.getElementById('audioControls');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const currentTimeDisplay = document.getElementById('currentTime');
    const durationDisplay = document.getElementById('duration');
    const progressBar = document.getElementById('progressBar');
    const progressFilled = document.getElementById('progressFilled');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeFilled = document.getElementById('volumeFilled');
    
    // 状态
    let currentMode = 'waiting'; // 'waiting', 'music', 'slide'
    let isConnected = false;
    let ws = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    // 音频相关
    let audio = new Audio();
    let isPlaying = false;
    let currentVolume = 0.8;
    let currentTrack = null;
    let audioEnabled = false;
    
    // 歌词相关
    let lyricsData = [];
    let currentLyricIndex = -1;
    let lyricScrollInterval = null;
    let updateInterval = null;
    
    // 初始化
    init();
    
    function init() {
        // 添加音频启用覆盖层
        createAudioEnableOverlay();
        
        // 初始化音频播放器
        initAudioPlayer();
        
        // 连接WebSocket
        connectWebSocket();
        
        // 初始化歌词显示
        initLyricDisplay();
        
        // 初始化全屏按钮
        initFullscreenButton();
        
    // 不初始化音频控件事件 - 只允许服务器端控制
    // initAudioControls();
    
    // 移除所有本地控制功能，只允许服务器控制
    // 播放/暂停按钮将不会响应点击事件
    playPauseBtn.style.pointerEvents = 'none';
    playPauseBtn.style.opacity = '0.3';
    
    // 进度条将不会响应点击事件
    progressBar.style.pointerEvents = 'none';
    
    // 音量滑块将不会响应点击事件
    volumeSlider.style.pointerEvents = 'none';
    
    // 保持服务器控制功能
    // 发送时间更新到服务器（用于同步）
    audio.addEventListener('timeupdate', function() {
        updateProgress();
        updateLyricDisplay(audio.currentTime);
        
        // 发送时间更新到服务器
        if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: 'time_update',
                    data: { time: audio.currentTime }
                }));
            } catch (e) {
                console.error('发送时间更新失败:', e);
            }
        }
    });
    }
    
    // 创建音频启用覆盖层
    function createAudioEnableOverlay() {
        audioEnableOverlay.id = 'audioEnableOverlay';
        audioEnableOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            backdrop-filter: blur(10px);
            display: none;
        `;
        
        audioEnableOverlay.innerHTML = `
            <div style="text-align: center; padding: 40px; max-width: 500px;">
                <i class="fas fa-volume-up" style="font-size: 72px; margin-bottom: 30px; color: #667eea;"></i>
                <h3 style="font-size: 32px; margin-bottom: 20px; font-weight: 600;">点击启用音频播放</h3>
                <p style="font-size: 18px; color: rgba(255,255,255,0.8); margin-bottom: 30px; line-height: 1.6;">
                    浏览器要求点击页面后才能播放音频<br>
                    请点击下方按钮以启用完整音频功能
                </p>
                <button onclick="window.enableAudio()" style="
                    margin-top: 20px;
                    padding: 16px 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 20px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.3s;
                    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
                ">
                    启用音频
                </button>
            </div>
        `;
        
        document.body.appendChild(audioEnableOverlay);
    }
    
    // 全局启用音频函数
    window.enableAudio = function() {
        audioEnabled = true;
        audioEnableOverlay.style.display = 'none';
        
        // 如果当前有音乐，尝试播放
        if (currentTrack && !isPlaying) {
            play();
        }
    };
    
    // 初始化音频播放器
    function initAudioPlayer() {
        audio.volume = currentVolume;
        audio.preload = 'metadata';
        
        // 监听音频事件
        audio.addEventListener('loadedmetadata', function() {
            updateDurationDisplay();
            if (isPlaying && audioEnabled) {
                audio.play().catch(e => {
                    console.log('自动播放被阻止，需要用户交互');
                    if (!audioEnabled) {
                        audioEnableOverlay.style.display = 'flex';
                    }
                });
            }
        });
        
        audio.addEventListener('timeupdate', function() {
            updateProgress();
            updateLyricDisplay(audio.currentTime);
            
            // 发送时间更新到服务器
            if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({
                        type: 'time_update',
                        data: { time: audio.currentTime }
                    }));
                } catch (e) {
                    console.error('发送时间更新失败:', e);
                }
            }
        });
        
        audio.addEventListener('play', function() {
            isPlaying = true;
            updatePlayPauseButton();
            albumCover.classList.add('playing');
            startLyricScroll();
        });
        
        audio.addEventListener('pause', function() {
            isPlaying = false;
            updatePlayPauseButton();
            albumCover.classList.remove('playing');
            stopLyricScroll();
        });
        
        audio.addEventListener('ended', function() {
            isPlaying = false;
            updatePlayPauseButton();
            albumCover.classList.remove('playing');
            stopLyricScroll();
        });
        
        audio.addEventListener('error', function(e) {
            console.error('音频播放错误:', e);
        });
        
        // 开始更新循环
        startUpdateInterval();
    }
    
    // 初始化音频控件事件
    }
    
    // 播放音乐 - 只响应服务器命令
    function play() {
        if (!audio.src) return;
        
        if (!audioEnabled) {
            audioEnableOverlay.style.display = 'flex';
            return;
        }
        
        audio.play().catch(e => {
            console.log('播放失败:', e);
            if (!audioEnabled) {
                audioEnableOverlay.style.display = 'flex';
            }
        });
    }
    
    // 暂停音乐 - 只响应服务器命令
    function pause() {
        audio.pause();
    }
    
    // 跳转到指定时间 - 只响应服务器命令
    function seek(time) {
        if (!audio.duration) return;
        
        const validTime = Math.max(0, Math.min(audio.duration, time));
        audio.currentTime = validTime;
        updateProgress();
        updateLyricDisplay(validTime);
    }
    
    // 设置音量 - 只响应服务器命令
    function setVolume(volume) {
        currentVolume = Math.max(0, Math.min(1, volume));
        audio.volume = currentVolume;
        volumeFilled.style.width = `${currentVolume * 100}%`;
    }
    
    // 更新播放/暂停按钮
    function updatePlayPauseButton() {
        const icon = playPauseBtn.querySelector('i');
        if (isPlaying) {
            icon.className = 'fas fa-pause';
            playPauseBtn.title = '暂停';
        } else {
            icon.className = 'fas fa-play';
            playPauseBtn.title = '播放';
        }
    }
    
    // 更新进度显示
    function updateProgress() {
        if (!audio.duration) return;
        
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFilled.style.width = `${percent}%`;
        currentTimeDisplay.textContent = formatTime(audio.currentTime);
    }
    
    // 更新总时长显示
    function updateDurationDisplay() {
        if (audio.duration) {
            durationDisplay.textContent = formatTime(audio.duration);
        }
    }
    
    // 格式化时间
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // 开始更新循环
    function startUpdateInterval() {
        if (updateInterval) clearInterval(updateInterval);
        
        updateInterval = setInterval(() => {
            if (audio.duration) {
                updateProgress();
            }
        }, 100);
    }
    
    // 连接WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/display`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            isConnected = true;
            updateConnectionStatus(true);
            reconnectAttempts = 0;
            console.log('显示端WebSocket连接已建立');
        };
        
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error('解析WebSocket消息失败:', e);
            }
        };
        
        ws.onclose = function() {
            isConnected = false;
            updateConnectionStatus(false);
            console.log('显示端WebSocket连接已关闭');
            
            // 尝试重新连接
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(() => {
                    console.log(`尝试重新连接 (${reconnectAttempts}/${maxReconnectAttempts})`);
                    connectWebSocket();
                }, 3000);
            }
        };
        
        ws.onerror = function(error) {
            console.error('显示端WebSocket错误:', error);
        };
    }
    
    // 更新连接状态显示
    function updateConnectionStatus(connected) {
        if (connected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = '已连接';
            musicStatusDot.className = 'status-dot connected';
            musicStatusText.textContent = '已连接';
        } else {
            statusDot.className = 'status-dot';
            statusText.textContent = '已断开';
            musicStatusDot.className = 'status-dot';
            musicStatusText.textContent = '已断开';
        }
    }
    
    // 处理WebSocket消息
    function handleWebSocketMessage(data) {
        console.log('收到命令:', data.type);
        
        switch (data.type) {
            case 'music_state':
                showMusicMode(data.data);
                break;
                
            case 'slide_state':
                showSlideMode(data.data);
                break;
                
            case 'switch_to_music':
                switchToMusicMode(data.data);
                break;
                
            case 'switch_to_slide':
                switchToSlideMode(data.data);
                break;
                
            case 'track_change':
                changeTrack(data.data);
                break;
                
            case 'slide_change':
                changeSlide(data.data);
                break;
                
            case 'play':
                playMusic(data.data);
                break;
                
            case 'pause':
                pauseMusic();
                break;
                
            case 'seek':
                seekMusic(data.data);
                break;
                
            case 'volume':
                setVolumeFromServer(data.data);
                break;
        }
    }
    
    // 显示音乐模式
    function showMusicMode(data) {
        if (currentMode !== 'music') {
            switchToMusicMode(data);
        } else {
            updateMusicDisplay(data);
        }
    }
    
    // 切换到音乐模式
    function switchToMusicMode(data) {
        currentMode = 'music';
        
        // 隐藏其他模式
        waitingState.style.display = 'none';
        slideContainer.classList.remove('active');
        
        // 显示音乐模式和音频控件
        musicContainer.classList.add('active');
        audioControls.classList.add('active');
        
        // 更新显示
        updateMusicDisplay(data);
    }
    
    // 更新音乐显示
    function updateMusicDisplay(data) {
        const track = data.track;
        const shouldPlay = data.is_playing;
        const currentTime = data.current_time;
        const volume = data.volume;
        
        if (track) {
            // 保存当前曲目
            currentTrack = track;
            
            // 更新封面和背景
            const coverUrl = track.cover_url || '/uploads/covers/default-cover.jpg';
            coverImage.src = coverUrl;
            backgroundOverlay.style.backgroundImage = `url(${coverUrl})`;
            
            // 更新标题和艺术家
            trackTitle.textContent = track.title || '未知歌曲';
            trackArtist.textContent = track.artist || '未知艺术家';
            
            // 检查是否需要切换歌曲
            const needSwitch = !audio.src || audio.src !== track.url;
            
            if (needSwitch) {
                // 暂停当前播放
                pause();
                
                // 切换音频源
                audio.src = track.url;
                
                // 重置进度
                progressFilled.style.width = '0%';
                currentTimeDisplay.textContent = '0:00';
                durationDisplay.textContent = '0:00';
                
                // 加载歌词
                if (track.lyrics_url) {
                    loadLyrics(track.lyrics_url);
                } else {
                    clearLyrics();
                }
            }
            
            // 设置播放状态
            if (shouldPlay) {
                if (audioEnabled) {
                    play();
                } else if (!audioEnableOverlay.style.display || audioEnableOverlay.style.display === 'none') {
                    audioEnableOverlay.style.display = 'flex';
                }
            } else {
                pause();
            }
            
            // 设置时间
            if (currentTime !== undefined && needSwitch) {
                setTimeout(() => {
                    seek(currentTime);
                }, 100);
            }
            
            // 设置音量
            if (volume !== undefined) {
                setVolume(volume / 100);
            }
        }
    }
    
    // 显示幻灯片模式
    function showSlideMode(data) {
        if (currentMode !== 'slide') {
            switchToSlideMode(data);
        } else {
            updateSlideDisplay(data);
        }
    }
    
    // 切换到幻灯片模式
    function switchToSlideMode(data) {
        currentMode = 'slide';
        
        // 隐藏其他模式
        waitingState.style.display = 'none';
        musicContainer.classList.remove('active');
        audioControls.classList.remove('active');
        
        // 显示幻灯片模式
        slideContainer.classList.add('active');
        
        // 停止音乐
        if (isPlaying) {
            pause();
        }
        
        // 更新显示
        updateSlideDisplay(data);
    }
    
    // 更新幻灯片显示
    function updateSlideDisplay(data) {
        const slide = data.slide;
        
        if (slide) {
            slideFrame.src = slide.url;
        }
    }
    
    // 切换曲目
    function changeTrack(data) {
        if (currentMode === 'music') {
            updateMusicDisplay({
                track: data.track,
                is_playing: data.play !== false,
                current_time: 0
            });
        }
    }
    
    // 切换幻灯片
    function changeSlide(data) {
        if (currentMode === 'slide') {
            updateSlideDisplay(data);
        }
    }
    
    // 播放音乐（来自服务器命令）
    function playMusic(data) {
        if (currentMode === 'music') {
            if (!audioEnabled) {
                audioEnableOverlay.style.display = 'flex';
                return;
            }
            
            play();
            
            if (data && data.time !== undefined) {
                seek(data.time);
            }
        }
    }
    
    // 暂停音乐（来自服务器命令）
    function pauseMusic() {
        if (currentMode === 'music') {
            pause();
        }
    }
    
    // 跳转到指定时间（来自服务器命令）
    function seekMusic(data) {
        if (currentMode === 'music' && data && data.time !== undefined) {
            seek(data.time);
        }
    }
    
    // 设置音量（来自服务器命令）
    function setVolumeFromServer(data) {
        if (currentMode === 'music' && data && data.volume !== undefined) {
            setVolume(data.volume / 100);
        }
    }
    
    // 初始化歌词显示
    function initLyricDisplay() {
        lyricContainer.innerHTML = `
            <div class="lyric-scroll-container">
                <div class="lyric-viewport">
                    <div class="lyric-lines"></div>
                </div>
            </div>
            <div class="lyric-fade-top"></div>
            <div class="lyric-fade-bottom"></div>
            <div class="lyric-center-guide"></div>
        `;
        
        // 初始化歌词容器高度
        updateLyricContainerHeight();
        
        // 监听窗口大小变化
        window.addEventListener('resize', updateLyricContainerHeight);
    }
    
    // 更新歌词容器高度
    function updateLyricContainerHeight() {
        const scrollContainer = lyricContainer.querySelector('.lyric-scroll-container');
        if (!scrollContainer) return;
        
        // 计算可用高度（减去标题和其他元素的高度）
        const lyricsSection = document.querySelector('.lyrics-section');
        if (lyricsSection) {
            const lyricsContainer = document.querySelector('.lyrics-container');
            const lyricsTitle = document.querySelector('.lyrics-title');
            
            if (lyricsContainer && lyricsTitle) {
                const containerHeight = lyricsContainer.clientHeight;
                const titleHeight = lyricsTitle.offsetHeight;
                const marginBottom = 15; // lyrics-title的margin-bottom
                
                const availableHeight = containerHeight - titleHeight - marginBottom;
                if (availableHeight > 0) {
                    scrollContainer.style.height = `${availableHeight}px`;
                }
            }
        }
    }
    
    // 加载歌词
    function loadLyrics(lyricsUrl) {
        if (!lyricsUrl) {
            clearLyrics();
            return;
        }
        
        const match = lyricsUrl.match(/\/([^\/]+)$/);
        if (!match) {
            clearLyrics();
            return;
        }
        
        const filename = match[1];
        
        fetch(`/api/lyrics/${filename}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('获取歌词失败');
                }
                return response.json();
            })
            .then(data => {
                if (data.content) {
                    parseLyrics(data.content);
                    updateLyricDisplay(0);
                } else {
                    clearLyrics();
                }
            })
            .catch(error => {
                console.error('加载歌词失败:', error);
                clearLyrics();
                showLyricError('歌词加载失败');
            });
    }
    
    // 解析歌词
    function parseLyrics(lyricText) {
        lyricsData = [];
        const lines = lyricText.split('\n');
        
        lines.forEach((line, lineIndex) => {
            line = line.trim();
            if (!line) return;
            
            // 处理多种LRC格式
            const timeMatch = line.match(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g);
            
            if (timeMatch) {
                // 处理多个时间标签的情况
                const text = line.replace(/\[.*?\]/g, '').trim();
                if (!text) return;
                
                timeMatch.forEach(timeTag => {
                    const match = timeTag.match(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/);
                    if (match) {
                        const minutes = parseInt(match[1]);
                        const seconds = parseInt(match[2]);
                        const milliseconds = match[3] ? 
                            parseInt(match[3].padEnd(3, '0')) : 0;
                        const time = minutes * 60 + seconds + milliseconds / 1000;
                        
                        lyricsData.push({
                            time: time,
                            text: text,
                            originalIndex: lineIndex
                        });
                    }
                });
            } else {
                // 没有时间标签的文本行
                if (!line.startsWith('[') && !line.startsWith('#') && !line.startsWith('//')) {
                    if (lyricsData.length > 0) {
                        // 合并到上一行
                        const lastLyric = lyricsData[lyricsData.length - 1];
                        lastLyric.text += ' ' + line;
                    } else {
                        // 作为第一行（无时间标签）
                        lyricsData.push({
                            time: 0,
                            text: line,
                            originalIndex: lineIndex
                        });
                    }
                }
            }
        });
        
        // 按时间排序
        lyricsData.sort((a, b) => a.time - b.time);
        
        // 删除重复的时间点（保留最后一个）
        const uniqueLyrics = [];
        const timeMap = new Map();
        
        lyricsData.forEach(lyric => {
            timeMap.set(lyric.time, lyric.text);
        });
        
        timeMap.forEach((text, time) => {
            uniqueLyrics.push({ time, text });
        });
        
        uniqueLyrics.sort((a, b) => a.time - b.time);
        lyricsData = uniqueLyrics;
        
        // 如果还是没有歌词，显示整个文本
        if (lyricsData.length === 0) {
            const textLines = lines.filter(line => {
                line = line.trim();
                return line && !line.startsWith('#') && !line.startsWith('//');
            });
            if (textLines.length > 0) {
                lyricsData.push({
                    time: 0,
                    text: textLines.join('\n')
                });
            }
        }
        
        // 更新歌词显示
        updateLyricLines();
        updateLyricDisplay(0);
    }
    
    // 更新歌词行
    function updateLyricLines() {
        const linesContainer = lyricContainer.querySelector('.lyric-lines');
        if (!linesContainer) return;
        
        linesContainer.innerHTML = '';
        
        if (lyricsData.length === 0) {
            const emptyLine = document.createElement('div');
            emptyLine.className = 'lyric-line empty';
            emptyLine.textContent = '暂无歌词';
            linesContainer.appendChild(emptyLine);
            return;
        }
        
        lyricsData.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'lyric-line';
            lineElement.dataset.index = index;
            lineElement.textContent = line.text;
            linesContainer.appendChild(lineElement);
        });
        
        // 更新容器高度
        updateLyricContainerHeight();
    }
    
    // 显示歌词错误
    function showLyricError(message) {
        const linesContainer = lyricContainer.querySelector('.lyric-lines');
        if (linesContainer) {
            const errorLine = document.createElement('div');
            errorLine.className = 'lyric-line empty';
            errorLine.textContent = message;
            linesContainer.innerHTML = '';
            linesContainer.appendChild(errorLine);
        }
    }
    
    // 更新歌词显示
    function updateLyricDisplay(currentTime) {
        if (lyricsData.length === 0) return;
        
        // 找到当前时间对应的歌词
        let newIndex = -1;
        for (let i = 0; i < lyricsData.length; i++) {
            if (lyricsData[i].time <= currentTime) {
                newIndex = i;
            } else {
                break;
            }
        }
        
        // 如果歌词索引发生变化
        if (newIndex !== currentLyricIndex) {
            currentLyricIndex = newIndex;
            
            // 移除所有歌词行的高亮
            const lines = lyricContainer.querySelectorAll('.lyric-line');
            lines.forEach(line => {
                line.classList.remove('active', 'prev', 'next');
            });
            
            // 设置当前歌词高亮
            if (currentLyricIndex >= 0) {
                const currentLine = lyricContainer.querySelector(`.lyric-line[data-index="${currentLyricIndex}"]`);
                if (currentLine) {
                    currentLine.classList.add('active');
                    
                    // 添加上下歌词的样式
                    if (currentLyricIndex > 0) {
                        const prevLine = lyricContainer.querySelector(`.lyric-line[data-index="${currentLyricIndex - 1}"]`);
                        if (prevLine) prevLine.classList.add('prev');
                    }
                    
                    if (currentLyricIndex < lyricsData.length - 1) {
                        const nextLine = lyricContainer.querySelector(`.lyric-line[data-index="${currentLyricIndex + 1}"]`);
                        if (nextLine) nextLine.classList.add('next');
                    }
                    
                    // 滚动到当前歌词
                    scrollToLyric(currentLine);
                }
            }
        }
    }
    
    // 滚动到当前歌词
    function scrollToLyric(element) {
        const scrollContainer = lyricContainer.querySelector('.lyric-scroll-container');
        const container = lyricContainer.querySelector('.lyric-viewport');
        
        if (!scrollContainer || !container || !element) return;
        
        const containerHeight = scrollContainer.clientHeight;
        const elementTop = element.offsetTop;
        const elementHeight = element.offsetHeight;
        const containerTop = container.offsetTop;
        
        // 计算元素相对于滚动容器的位置
        const elementRelativeTop = elementTop - containerTop;
        
        // 计算滚动位置，使当前歌词位于容器中间
        const targetScroll = elementRelativeTop - (containerHeight / 2) + (elementHeight / 2);
        
        // 确保滚动位置在有效范围内
        const maxScroll = scrollContainer.scrollHeight - containerHeight;
        const finalScroll = Math.max(0, Math.min(targetScroll, maxScroll));
        
        scrollContainer.scrollTo({
            top: finalScroll,
            behavior: 'smooth'
        });
    }
    
    // 开始歌词滚动
    function startLyricScroll() {
        if (lyricScrollInterval) clearInterval(lyricScrollInterval);
        lyricScrollInterval = setInterval(() => {
            if (isPlaying) {
                updateLyricDisplay(audio.currentTime);
            }
        }, 100);
    }
    
    // 停止歌词滚动
    function stopLyricScroll() {
        if (lyricScrollInterval) {
            clearInterval(lyricScrollInterval);
            lyricScrollInterval = null;
        }
    }
    
    // 清除歌词
    function clearLyrics() {
        lyricsData = [];
        currentLyricIndex = -1;
        updateLyricLines();
        stopLyricScroll();
    }
    
    // 初始化全屏按钮
    function initFullscreenButton() {
        fullscreenBtn.addEventListener('click', function() {
            toggleFullscreen();
        });
        
        // 更新全屏按钮图标
        document.addEventListener('fullscreenchange', function() {
            if (document.fullscreenElement) {
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                fullscreenBtn.title = '退出全屏';
            } else {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                fullscreenBtn.title = '切换全屏';
            }
        });
    }
    
    // 切换全屏
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`全屏请求失败: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
});