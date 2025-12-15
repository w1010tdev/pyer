const { createApp, ref, computed, onMounted, onUnmounted } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

createApp({
    setup() {
        // 状态
        const isConnected = ref(false);
        const connectionStatus = ref('连接中...');
        const ws = ref(null);
        const reconnectAttempts = ref(0);
        const maxReconnectAttempts = 5;
        
        // 应用状态
        const currentMode = ref('music');
        const isPlaying = ref(false);
        const currentTime = ref(0);
        const volume = ref(80);
        const currentTrackIndex = ref(-1);
        const currentSlideIndex = ref(-1);
        
        // 数据
        const playlist = ref([]);
        const slides = ref([]);
        const currentTrack = ref(null);
        const currentSlide = ref(null);
        
        // 上传相关
        const uploadTab = ref('music');
        const musicFile = ref(null);
        const coverFile = ref(null);
        const lyricsFile = ref(null);
        const slideFile = ref(null);
        const musicFileName = ref('');
        const coverFileName = ref('');
        const lyricsFileName = ref('');
        const slideFileName = ref('');
        const musicTitle = ref('');
        const musicArtist = ref('');
        const slideName = ref('');
        const isUploading = ref(false);
        
        // 计算属性
        const progressPercent = computed(() => {
            if (!currentTrack.value || !currentTrack.value.duration) return 0;
            return (currentTime.value / currentTrack.value.duration) * 100;
        });
        
        const displayUrl = computed(() => {
            return `${window.location.origin}/display`;
        });
        
        // WebSocket连接
        const connectWebSocket = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/admin`;
            
            ws.value = new WebSocket(wsUrl);
            
            ws.value.onopen = () => {
                isConnected.value = true;
                connectionStatus.value = '已连接';
                reconnectAttempts.value = 0;
                console.log('WebSocket连接已建立');
            };
            
            ws.value.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.value.onclose = () => {
                isConnected.value = false;
                connectionStatus.value = '已断开';
                console.log('WebSocket连接已关闭');
                
                // 尝试重新连接
                if (reconnectAttempts.value < maxReconnectAttempts) {
                    reconnectAttempts.value++;
                    setTimeout(() => {
                        console.log(`尝试重新连接 (${reconnectAttempts.value}/${maxReconnectAttempts})`);
                        connectWebSocket();
                    }, 3000);
                }
            };
            
            ws.value.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
        };
        
        // 处理WebSocket消息
        const handleWebSocketMessage = (data) => {
            switch (data.type) {
                case 'state_update':
                    updateState(data.data);
                    break;
                case 'playlist_update':
                    playlist.value = data.data.playlist || [];
                    break;
                case 'slides_update':
                    slides.value = data.data.slides || [];
                    break;
            }
        };
        
        // 更新状态
        const updateState = (state) => {
            currentMode.value = state.mode || currentMode.value;
            isPlaying.value = state.is_playing || false;
            currentTime.value = state.current_time || 0;
            volume.value = state.volume || 80;
            currentTrackIndex.value = state.current_track_index ?? -1;
            currentSlideIndex.value = state.current_slide_index ?? -1;
            playlist.value = state.playlist || playlist.value;
            slides.value = state.slides || slides.value;
            currentTrack.value = state.current_track || null;
            currentSlide.value = state.current_slide || null;
        };
        
        // 发送命令
        const sendCommand = (type, data = {}) => {
            if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
                ElMessage.error('WebSocket未连接');
                return;
            }
            
            ws.value.send(JSON.stringify({
                type,
                data
            }));
        };
        
        // 控制方法
        const switchMode = (mode) => {
            sendCommand('switch_mode', { mode });
        };
        
        const playMusic = () => {
            sendCommand('play_music');
        };
        
        const pauseMusic = () => {
            sendCommand('pause_music');
        };
        
        const prevTrack = () => {
            sendCommand('prev_track');
        };
        
        const nextTrack = () => {
            sendCommand('next_track');
        };
        
        const selectTrack = (index) => {
            sendCommand('select_track', { index });
        };
        
        const seekMusic = (event) => {
            if (!currentTrack.value) return;
            
            const progressBar = event.currentTarget;
            const rect = progressBar.getBoundingClientRect();
            const percent = (event.clientX - rect.left) / rect.width;
            const time = percent * (currentTrack.value.duration || 0);
            
            sendCommand('seek_music', { time });
        };
        
        const setVolume = () => {
            sendCommand('set_volume', { volume: volume.value });
        };
        
        const prevSlide = () => {
            if (slides.value.length === 0) return;
            let newIndex = currentSlideIndex.value - 1;
            if (newIndex < 0) newIndex = slides.value.length - 1;
            selectSlide(newIndex);
        };
        
        const nextSlide = () => {
            if (slides.value.length === 0) return;
            let newIndex = currentSlideIndex.value + 1;
            if (newIndex >= slides.value.length) newIndex = 0;
            selectSlide(newIndex);
        };
        
        const selectSlide = (index) => {
            if (index < 0 || index >= slides.value.length) return;
            sendCommand('select_slide', { index });
        };
        
        // 文件处理
        const handleMusicFileChange = (event) => {
            musicFile.value = event.target.files[0];
            musicFileName.value = musicFile.value ? musicFile.value.name : '';
            
            if (musicFile.value && !musicTitle.value) {
                musicTitle.value = musicFile.value.name.replace(/\.[^/.]+$/, "");
            }
        };
        
        const handleCoverFileChange = (event) => {
            coverFile.value = event.target.files[0];
            coverFileName.value = coverFile.value ? coverFile.value.name : '';
        };
        
        const handleLyricsFileChange = (event) => {
            lyricsFile.value = event.target.files[0];
            lyricsFileName.value = lyricsFile.value ? lyricsFile.value.name : '';
        };
        
        const handleSlideFileChange = (event) => {
            slideFile.value = event.target.files[0];
            slideFileName.value = slideFile.value ? slideFile.value.name : '';
            
            if (slideFile.value && !slideName.value) {
                slideName.value = slideFile.value.name.replace(/\.[^/.]+$/, "");
            }
        };
        
        // 上传音乐
        const uploadMusic = async () => {
            if (!musicFile.value) {
                ElMessage.warning('请选择音乐文件');
                return;
            }
            
            isUploading.value = true;
            
            const formData = new FormData();
            formData.append('music_file', musicFile.value);
            
            if (coverFile.value) {
                formData.append('cover_file', coverFile.value);
            }
            
            if (lyricsFile.value) {
                formData.append('lyrics_file', lyricsFile.value);
            }
            
            if (musicTitle.value) {
                formData.append('title', musicTitle.value);
            }
            
            if (musicArtist.value) {
                formData.append('artist', musicArtist.value);
            }
            
            try {
                const response = await fetch('/api/upload/music', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    ElMessage.success('音乐上传成功！');
                    
                    // 重置表单
                    musicFile.value = null;
                    coverFile.value = null;
                    lyricsFile.value = null;
                    musicFileName.value = '';
                    coverFileName.value = '';
                    lyricsFileName.value = '';
                    musicTitle.value = '';
                    musicArtist.value = '';
                    
                    if (document.getElementById('music-file')) {
                        document.getElementById('music-file').value = '';
                    }
                    if (document.getElementById('cover-file')) {
                        document.getElementById('cover-file').value = '';
                    }
                    if (document.getElementById('lyrics-file')) {
                        document.getElementById('lyrics-file').value = '';
                    }
                } else {
                    ElMessage.error('上传失败');
                }
            } catch (error) {
                console.error('上传错误:', error);
                ElMessage.error('上传过程中发生错误');
            } finally {
                isUploading.value = false;
            }
        };
        
        // 上传幻灯片
        const uploadSlide = async () => {
            if (!slideFile.value) {
                ElMessage.warning('请选择HTML文件');
                return;
            }
            
            isUploading.value = true;
            
            const formData = new FormData();
            formData.append('slide_file', slideFile.value);
            
            if (slideName.value) {
                formData.append('name', slideName.value);
            }
            
            try {
                const response = await fetch('/api/upload/slide', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    ElMessage.success('幻灯片上传成功！');
                    
                    // 重置表单
                    slideFile.value = null;
                    slideFileName.value = '';
                    slideName.value = '';
                    
                    if (document.getElementById('slide-file')) {
                        document.getElementById('slide-file').value = '';
                    }
                } else {
                    ElMessage.error('上传失败');
                }
            } catch (error) {
                console.error('上传错误:', error);
                ElMessage.error('上传过程中发生错误');
            } finally {
                isUploading.value = false;
            }
        };
        
        // 删除音乐
        const deleteTrack = async (trackId) => {
            try {
                await ElMessageBox.confirm(
                    '确定要删除这首音乐吗？',
                    '删除确认',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );
                
                const response = await fetch(`/api/track/${trackId}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    ElMessage.success('删除成功');
                } else {
                    ElMessage.error('删除失败');
                }
            } catch (error) {
                if (error !== 'cancel') {
                    console.error('删除错误:', error);
                }
            }
        };
        
        // 删除幻灯片
        const deleteSlide = async (slideId) => {
            try {
                await ElMessageBox.confirm(
                    '确定要删除这个幻灯片吗？',
                    '删除确认',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );
                
                const response = await fetch(`/api/slide/${slideId}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    ElMessage.success('删除成功');
                } else {
                    ElMessage.error('删除失败');
                }
            } catch (error) {
                if (error !== 'cancel') {
                    console.error('删除错误:', error);
                }
            }
        };
        
        // 格式化时间
        const formatTime = (seconds) => {
            if (!seconds || isNaN(seconds)) return '0:00';
            
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        };
        
        // 初始化
        const init = async () => {
            // 连接WebSocket
            connectWebSocket();
            
            // 获取初始状态
            try {
                const response = await fetch('/api/state');
                const state = await response.json();
                updateState(state);
            } catch (error) {
                console.error('获取初始状态失败:', error);
            }
        };
        
        // 生命周期
        onMounted(() => {
            init();
        });
        
        onUnmounted(() => {
            if (ws.value) {
                ws.value.close();
            }
        });
        
        return {
            // 状态
            isConnected,
            connectionStatus,
            currentMode,
            isPlaying,
            currentTime,
            volume,
            currentTrackIndex,
            currentSlideIndex,
            
            // 数据
            playlist,
            slides,
            currentTrack,
            currentSlide,
            
            // 上传相关
            uploadTab,
            musicFileName,
            coverFileName,
            lyricsFileName,
            slideFileName,
            musicTitle,
            musicArtist,
            slideName,
            isUploading,
            
            // 计算属性
            progressPercent,
            displayUrl,
            
            // 方法
            switchMode,
            playMusic,
            pauseMusic,
            prevTrack,
            nextTrack,
            selectTrack,
            seekMusic,
            setVolume,
            prevSlide,
            nextSlide,
            selectSlide,
            
            // 文件处理
            handleMusicFileChange,
            handleCoverFileChange,
            handleLyricsFileChange,
            handleSlideFileChange,
            uploadMusic,
            uploadSlide,
            deleteTrack,
            deleteSlide,
            formatTime
        };
    }
}).use(ElementPlus).mount('#app');