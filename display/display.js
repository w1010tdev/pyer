// 显示端主程序
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
    
    // 状态
    let currentMode = 'waiting'; // 'waiting', 'music', 'slide'
    let isConnected = false;
    let ws = null;
    let aplayer = null;
    let lyric = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    // 初始化
    init();
    
    function init() {
        // 连接WebSocket
        connectWebSocket();
        
        // 初始化全屏按钮
        initFullscreenButton();
        
        // 初始化APlayer
        initAPlayer();
    }
    
    // 连接WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/display`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            isConnected = true;
            updateConnectionStatus(true);
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
                setVolume(data.data);
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
        
        // 显示音乐模式
        musicContainer.classList.add('active');
        
        // 更新显示
        updateMusicDisplay(data);
    }
    
    // 更新音乐显示
    function updateMusicDisplay(data) {
        const track = data.track;
        const isPlaying = data.is_playing;
        const currentTime = data.current_time;
        const volume = data.volume;
        
        if (track) {
            // 更新封面和背景
            coverImage.src = track.cover_url;
            backgroundOverlay.style.backgroundImage = `url(${track.cover_url})`;
            
            // 更新标题和艺术家
            trackTitle.textContent = track.title;
            trackArtist.textContent = track.artist;
            
            // 检查是否需要切换歌曲
            const currentAudio = aplayer.list.audios[0];
            const needSwitch = !currentAudio || currentAudio.url !== track.url;
            
            if (needSwitch) {
                // 清除当前播放列表
                aplayer.list.clear();
                
                // 添加新歌曲
                aplayer.list.add([{
                    name: track.title,
                    artist: track.artist,
                    url: track.url,
                    cover: track.cover_url,
                    lrc: ''
                }]);
                
                // 切换到新歌曲
                aplayer.list.switch(0);
                
                // 加载歌词
                if (track.lyrics_url) {
                    loadLyrics(track.lyrics_url);
                } else {
                    clearLyrics();
                }
            }
            
            // 设置播放状态
            if (isPlaying) {
                aplayer.play();
                albumCover.classList.add('playing');
            } else {
                aplayer.pause();
                albumCover.classList.remove('playing');
            }
            
            // 设置时间和音量
            if (currentTime !== undefined && needSwitch) {
                // 只有在切换歌曲时才设置时间，避免冲突
                setTimeout(() => {
                    aplayer.seek(currentTime);
                }, 100);
            }
            
            if (volume !== undefined) {
                aplayer.volume(volume / 100);
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
        
        // 显示幻灯片模式
        slideContainer.classList.add('active');
        
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
    
    // 播放音乐
    function playMusic(data) {
        if (aplayer && currentMode === 'music') {
            aplayer.play();
            albumCover.classList.add('playing');
            
            if (data && data.time !== undefined) {
                aplayer.seek(data.time);
            }
        }
    }
    
    // 暂停音乐
    function pauseMusic() {
        if (aplayer && currentMode === 'music') {
            aplayer.pause();
            albumCover.classList.remove('playing');
        }
    }
    
    // 跳转到指定时间
    function seekMusic(data) {
        if (aplayer && currentMode === 'music' && data && data.time !== undefined) {
            aplayer.seek(data.time);
        }
    }
    
    // 设置音量
    function setVolume(data) {
        if (aplayer && currentMode === 'music' && data && data.volume !== undefined) {
            aplayer.volume(data.volume / 100);
        }
    }
    
    // 初始化APlayer
    function initAPlayer() {
        aplayer = new APlayer({
            container: document.getElementById('aplayer'),
            audio: [{
                name: '等待音乐',
                artist: '未知艺术家',
                url: '',
                cover: '/uploads/covers/default-cover.jpg',
                lrc: ''
            }],
            volume: 0.8,
            lrcType: 0,
            fixed: false,
            mini: false,
            autoplay: false,
            theme: '#2980b9',
            loop: 'all',
            order: 'list',
            preload: 'metadata',
            mutex: true,
            listFolded: false,
            listMaxHeight: '90px',
            storageName: 'aplayer-setting'
        });
        
        // 监听时间更新
        aplayer.on('timeupdate', function() {
            if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({
                        type: 'time_update',
                        data: {
                            time: aplayer.audio.currentTime
                        }
                    }));
                } catch (e) {
                    console.error('发送时间更新失败:', e);
                }
            }
        });
        
        // 监听播放状态变化
        aplayer.on('play', function() {
            albumCover.classList.add('playing');
        });
        
        aplayer.on('pause', function() {
            albumCover.classList.remove('playing');
        });
        
        // 监听错误
        aplayer.on('error', function(e) {
            console.error('APlayer错误:', e);
        });
    }
    
    // 加载歌词
    function loadLyrics(lyricsUrl) {
        if (!lyricsUrl) {
            clearLyrics();
            return;
        }
        
        // 从URL中提取文件名
        const match = lyricsUrl.match(/\/([^\/]+)$/);
        if (!match) {
            clearLyrics();
            return;
        }
        
        const filename = match[1];
        
        // 通过API获取歌词内容
        fetch(`/api/lyrics/${filename}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('获取歌词失败');
                }
                return response.json();
            })
            .then(data => {
                if (data.content) {
                    // 设置歌词
                    aplayer.lrc = {
                        show: true,
                        text: data.content
                    };
                    
                    // 如果有lyric插件，使用它
                    if (window.APlayer && window.APlayer.lyric) {
                        if (lyric) {
                            lyric.destroy();
                        }
                        lyric = new APlayer.Lyric({
                            container: lyricContainer,
                            audio: aplayer.audio,
                            lrc: data.content
                        });
                        aplayer.lyric = lyric;
                    } else {
                        // 简单显示歌词
                        lyricContainer.innerHTML = '<div class="aplayer-lrc-contents">' + 
                            data.content.split('\n').map(line => 
                                `<p>${line}</p>`
                            ).join('') + 
                            '</div>';
                    }
                } else {
                    clearLyrics();
                }
            })
            .catch(error => {
                console.error('加载歌词失败:', error);
                clearLyrics();
            });
    }
    
    // 清除歌词
    function clearLyrics() {
        if (lyric) {
            lyric.destroy();
            lyric = null;
        }
        lyricContainer.innerHTML = '<p style="text-align: center; margin-top: 100px; color: rgba(255,255,255,0.5);">暂无歌词</p>';
        aplayer.lrc = { show: false, text: '' };
    }
    
    // 初始化全屏按钮
    function initFullscreenButton() {
        fullscreenBtn.addEventListener('click', function() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`全屏请求失败: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
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
});