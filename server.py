import os
import json
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Set
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE
from mutagen.mp4 import MP4
from mutagen.asf import ASF
from mutagen.aac import AAC

from config import *

# 加载环境变量
load_dotenv()

# 导入持久化管理器
from persistence import persistence_manager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="班级元旦晚会远程控制系统",
    description="远程控制音乐播放和幻灯片显示系统",
    version="1.0.0"
)

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/admin", StaticFiles(directory="admin"), name="admin")
app.mount("/display", StaticFiles(directory="display"), name="display")
# 数据模型
class Track(BaseModel):
    id: str
    title: str
    artist: str
    url: str
    cover_url: str
    lyrics_url: Optional[str] = None
    duration: int = 0

class Slide(BaseModel):
    id: str
    name: str
    url: str
    thumbnail_url: Optional[str] = None

class ControlCommand(BaseModel):
    type: str
    data: Optional[Dict] = None

# 全局状态管理器
class StateManager:
    def __init__(self):
        # WebSocket连接
        self.admin_connections: Set[WebSocket] = set()
        self.display_connections: Set[WebSocket] = set()
        
        # 播放状态
        self.current_mode: str = "music"  # "music" 或 "slide"
        self.current_track_index: int = -1
        self.current_slide_index: int = -1
        self.is_playing: bool = False
        self.current_time: float = 0.0
        self.volume: int = 80
        
        # 从持久化存储加载数据
        self.playlist: List[Track] = []
        self.slides: List[Slide] = []
        self.load_from_persistence()
        
        # 当前显示的内容
        self.current_track: Optional[Track] = None
        self.current_slide: Optional[Slide] = None
        
        # 创建默认封面
        self.create_default_cover()
    
    def create_default_cover(self):
        """创建默认封面图片"""
        default_cover_path = UPLOAD_FOLDER / "covers" / "default-cover.jpg"
        if not default_cover_path.exists():
            try:
                # 创建一个简单的默认封面
                from PIL import Image, ImageDraw, ImageFont
                import io
                
                # 创建新图片
                img = Image.new('RGB', (800, 800), color='#667eea')
                draw = ImageDraw.Draw(img)
                
                # 添加文字
                try:
                    font = ImageFont.truetype("arial.ttf", 60)
                except:
                    font = ImageFont.load_default()
                
                text = "元旦晚会\n音乐系统"
                bbox = draw.textbbox((0, 0), text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                
                position = ((800 - text_width) // 2, (800 - text_height) // 2)
                draw.text(position, text, fill="white", font=font)
                
                # 保存图片
                img.save(default_cover_path, "JPEG")
                logger.info("创建默认封面成功")
            except Exception as e:
                logger.warning(f"创建默认封面失败: {e}")
                # 创建一个纯色图片作为备用
                img = Image.new('RGB', (800, 800), color='#667eea')
                img.save(default_cover_path, "JPEG")
    
    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.admin_connections.add(websocket)
        await self.send_admin_state(websocket)
    
    async def connect_display(self, websocket: WebSocket):
        await websocket.accept()
        self.display_connections.add(websocket)
        await self.send_display_state(websocket)
    
    def disconnect_admin(self, websocket: WebSocket):
        if websocket in self.admin_connections:
            self.admin_connections.remove(websocket)
    
    def disconnect_display(self, websocket: WebSocket):
        if websocket in self.display_connections:
            self.display_connections.remove(websocket)
    
    async def broadcast_to_display(self, command: ControlCommand):
        """向所有显示端广播命令"""
        for connection in self.display_connections:
            try:
                await connection.send_json(command.dict())
            except Exception as e:
                logger.error(f"广播到显示端失败: {e}")
    
    async def broadcast_to_admin(self, command: ControlCommand):
        """向所有管理端广播状态更新"""
        for connection in self.admin_connections:
            try:
                await connection.send_json(command.dict())
            except Exception as e:
                logger.error(f"广播到管理端失败: {e}")
    
    async def send_admin_state(self, websocket: WebSocket):
        """发送完整状态给管理端"""
        state = {
            "type": "state_update",
            "data": {
                "mode": self.current_mode,
                "is_playing": self.is_playing,
                "current_time": self.current_time,
                "volume": self.volume,
                "playlist": [track.dict() for track in self.playlist],
                "slides": [slide.dict() for slide in self.slides],
                "current_track_index": self.current_track_index,
                "current_slide_index": self.current_slide_index,
                "current_track": self.current_track.dict() if self.current_track else None,
                "current_slide": self.current_slide.dict() if self.current_slide else None,
            }
        }
        try:
            await websocket.send_json(state)
        except Exception as e:
            logger.error(f"发送状态到管理端失败: {e}")
    
    async def send_display_state(self, websocket: WebSocket):
        """发送当前显示状态给显示端"""
        if self.current_mode == "music":
            state = {
                "type": "music_state",
                "data": {
                    "track": self.current_track.dict() if self.current_track else None,
                    "is_playing": self.is_playing,
                    "current_time": self.current_time,
                    "volume": self.volume,
                }
            }
        else:
            state = {
                "type": "slide_state",
                "data": {
                    "slide": self.current_slide.dict() if self.current_slide else None,
                }
            }
        
        try:
            await websocket.send_json(state)
        except Exception as e:
            logger.error(f"发送状态到显示端失败: {e}")
    
    def add_track(self, track: Track):
        self.playlist.append(track)
        if len(self.playlist) == 1 and self.current_track_index == -1:
            self.current_track_index = 0
            self.current_track = track
    
    def add_slide(self, slide: Slide):
        self.slides.append(slide)
        if len(self.slides) == 1 and self.current_slide_index == -1:
            self.current_slide_index = 0
            self.current_slide = slide
    
    def remove_track(self, track_id: str):
        self.playlist = [track for track in self.playlist if track.id != track_id]
        if not self.playlist:
            self.current_track_index = -1
            self.current_track = None
        elif self.current_track and self.current_track.id == track_id:
            self.current_track_index = max(0, self.current_track_index - 1)
            self.current_track = self.playlist[self.current_track_index] if self.playlist else None
    
    def remove_slide(self, slide_id: str):
        self.slides = [slide for slide in self.slides if slide.id != slide_id]
        if not self.slides:
            self.current_slide_index = -1
            self.current_slide = None
        elif self.current_slide and self.current_slide.id == slide_id:
            self.current_slide_index = max(0, self.current_slide_index - 1)
            self.current_slide = self.slides[self.current_slide_index] if self.slides else None

    def load_from_persistence(self):
        """从持久化存储加载数据"""
        try:
            # 加载音乐
            music_data = persistence_manager.get_all_music_tracks()
            self.playlist = [Track(**data) for data in music_data]
            
            # 加载幻灯片
            slides_data = persistence_manager.get_all_slides()
            self.slides = [Slide(**data) for data in slides_data]
            
            # 设置当前曲目和幻灯片
            if self.playlist:
                self.current_track_index = 0
                self.current_track = self.playlist[0]
            
            if self.slides:
                self.current_slide_index = 0
                self.current_slide = self.slides[0]
                
            logger.info(f"从持久化存储加载了 {len(self.playlist)} 首音乐和 {len(self.slides)} 个幻灯片")
        except Exception as e:
            logger.error(f"从持久化存储加载数据失败: {e}")
            self.playlist = []
            self.slides = []

    def add_track(self, track: Track):
        """添加曲目到播放列表并持久化"""
        self.playlist.append(track)
        
        # 保存到持久化存储
        persistence_manager.add_music_track(track.dict())
        
        if len(self.playlist) == 1 and self.current_track_index == -1:
            self.current_track_index = 0
            self.current_track = track

    def add_slide(self, slide: Slide):
        """添加幻灯片到列表并持久化"""
        self.slides.append(slide)
        
        # 保存到持久化存储
        persistence_manager.add_slide(slide.dict())
        
        if len(self.slides) == 1 and self.current_slide_index == -1:
            self.current_slide_index = 0
            self.current_slide = slide

    def remove_track(self, track_id: str):
        """从播放列表移除曲目并更新持久化存储"""
        # 先从播放列表移除
        self.playlist = [track for track in self.playlist if track.id != track_id]
        
        # 从持久化存储删除
        persistence_manager.delete_music_track(track_id)
        
        if not self.playlist:
            self.current_track_index = -1
            self.current_track = None
        elif self.current_track and self.current_track.id == track_id:
            self.current_track_index = max(0, self.current_track_index - 1)
            self.current_track = self.playlist[self.current_track_index] if self.playlist else None

    def remove_slide(self, slide_id: str):
        """从幻灯片列表移除并更新持久化存储"""
        # 先从列表移除
        self.slides = [slide for slide in self.slides if slide.id != slide_id]
        
        # 从持久化存储删除
        persistence_manager.delete_slide(slide_id)
        
        if not self.slides:
            self.current_slide_index = -1
            self.current_slide = None
        elif self.current_slide and self.current_slide.id == slide_id:
            self.current_slide_index = max(0, self.current_slide_index - 1)
            self.current_slide = self.slides[self.current_slide_index] if self.slides else None

state_manager = StateManager()

# 工具函数
def allowed_file(filename: str, file_type: str) -> bool:
    if not filename or '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS.get(file_type, set())

def save_upload_file(file: UploadFile, subdir: str) -> str:
    """保存上传文件并返回URL路径"""
    file_ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = UPLOAD_FOLDER / subdir / filename
    
    with open(file_path, "wb") as buffer:
        content = file.file.read()
        buffer.write(content)
    
    return f"/uploads/{subdir}/{filename}"

async def get_audio_duration(file_path: Path) -> int:
    """使用mutagen获取音频文件时长"""
    try:
        # 尝试使用mutagen直接打开文件
        audio = mutagen.File(str(file_path))
        
        if audio is None:
            logger.warning(f"mutagen无法识别文件格式: {file_path}")
            return get_audio_duration_fallback(file_path)
        
        # 获取时长（秒）
        duration = audio.info.length
        
        if duration <= 0:
            logger.warning(f"音频时长异常: {duration} 秒, 文件: {file_path}")
            return get_audio_duration_fallback(file_path)
        
        # 确保返回整数秒
        return int(duration)
        
    except Exception as e:
        logger.error(f"使用mutagen获取音频时长失败 {file_path}: {e}")
        return get_audio_duration_fallback(file_path)

def get_audio_duration_fallback(file_path: Path) -> int:
    """备用方法获取音频时长"""
    try:
        # 尝试使用文件信息估算
        file_ext = file_path.suffix.lower()
        file_size = file_path.stat().st_size
        
        # 常见音频格式的估算比特率（kbps）
        bitrate_estimates = {
            '.mp3': 128,      # MP3常见比特率
            '.mp4': 128,      # MP4/AAC常见比特率
            '.m4a': 128,
            '.aac': 128,
            '.flac': 1000,    # FLAC无损，比特率较高
            '.wav': 1411,     # WAV CD质量
            '.ogg': 160,      # OGG Vorbis
            '.wma': 128,      # Windows Media Audio
        }
        
        # 获取比特率估算值
        bitrate = bitrate_estimates.get(file_ext, 128)  # 默认128kbps
        
        # 计算时长：文件大小(字节) / (比特率(kbps) * 1000 / 8)
        # 比特率(kbps) = 千比特/秒，1字节=8比特
        duration = file_size / (bitrate * 1000 / 8)
        
        # 限制在合理范围内（10秒到30分钟）
        return max(10, min(1800, int(duration)))
        
    except Exception as e:
        logger.error(f"备用方法获取时长也失败 {file_path}: {e}")
        return 180  # 默认3分钟

# WebSocket连接 - 管理端
@app.websocket("/ws/admin")
async def websocket_admin(websocket: WebSocket):
    await state_manager.connect_admin(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_admin_command(data)
            
    except WebSocketDisconnect:
        state_manager.disconnect_admin(websocket)
        logger.info("管理端WebSocket连接断开")
    except Exception as e:
        logger.error(f"处理管理端命令时出错: {e}")
        state_manager.disconnect_admin(websocket)

async def handle_admin_command(data: dict):
    command_type = data.get("type")
    command_data = data.get("data", {})
    
    logger.info(f"收到管理端命令: {command_type}")
    
    if command_type == "play_music":
        state_manager.is_playing = True
        # 确保发送当前时间
        await state_manager.broadcast_to_display(ControlCommand(
            type="play",
            data={
                "time": command_data.get("time", state_manager.current_time)  # 优先使用命令中的时间
            }
        ))
        await state_manager.broadcast_to_admin(ControlCommand(
            type="state_update",
            data={
                "is_playing": True,
                "current_time": state_manager.current_time
            }
        ))
        
    elif command_type == "pause_music":
        state_manager.is_playing = False
        await state_manager.broadcast_to_display(ControlCommand(
            type="pause"
        ))
        await state_manager.broadcast_to_admin(ControlCommand(
            type="state_update",
            data={"is_playing": False}
        ))
        
    elif command_type == "next_track":
        if state_manager.playlist:
            state_manager.current_track_index = (
                state_manager.current_track_index + 1
            ) % len(state_manager.playlist)
            state_manager.current_track = state_manager.playlist[state_manager.current_track_index]
            state_manager.is_playing = True
            
            await state_manager.broadcast_to_display(ControlCommand(
                type="track_change",
                data={
                    "track": state_manager.current_track.dict(),
                    "play": True
                }
            ))
            
            await state_manager.broadcast_to_admin(ControlCommand(
                type="state_update",
                data={
                    "current_track_index": state_manager.current_track_index,
                    "current_track": state_manager.current_track.dict(),
                    "is_playing": True
                }
            ))
            
    elif command_type == "prev_track":
        if state_manager.playlist:
            state_manager.current_track_index = (
                state_manager.current_track_index - 1
            ) % len(state_manager.playlist)
            state_manager.current_track = state_manager.playlist[state_manager.current_track_index]
            state_manager.is_playing = True
            
            await state_manager.broadcast_to_display(ControlCommand(
                type="track_change",
                data={
                    "track": state_manager.current_track.dict(),
                    "play": True
                }
            ))
            
            await state_manager.broadcast_to_admin(ControlCommand(
                type="state_update",
                data={
                    "current_track_index": state_manager.current_track_index,
                    "current_track": state_manager.current_track.dict(),
                    "is_playing": True
                }
            ))
            
    elif command_type == "select_track":
        index = command_data.get("index")
        if 0 <= index < len(state_manager.playlist):
            state_manager.current_track_index = index
            state_manager.current_track = state_manager.playlist[index]
            state_manager.is_playing = True
            state_manager.current_time = 0  # 选择新曲目时重置时间

            await state_manager.broadcast_to_display(ControlCommand(
                type="track_change",
                data={
                    "track": state_manager.current_track.dict(),
                    "play": True,
                    "time": 0  # 重置时间
                }
            ))

            await state_manager.broadcast_to_admin(ControlCommand(
                type="state_update",
                data={
                    "current_track_index": state_manager.current_track_index,
                    "current_track": state_manager.current_track.dict(),
                    "is_playing": True,
                    "current_time": 0  # 重置时间
                }
            ))
            
    elif command_type == "seek_music":
        time = command_data.get("time", 0)
        state_manager.current_time = time
        
        # 发送给所有显示端和管理端，确保状态一致
        await state_manager.broadcast_to_display(ControlCommand(
            type="seek",
            data={"time": time}
        ))
        
        # 如果当前正在播放，更新播放状态
        if state_manager.is_playing:
            await state_manager.broadcast_to_display(ControlCommand(
                type="play",
                data={"time": time}  # 同时发送播放命令，确保时间同步
            ))
        
        await state_manager.broadcast_to_admin(ControlCommand(
            type="state_update",
            data={"current_time": time}
        ))
        
    elif command_type == "set_volume":
        volume = command_data.get("volume", 80)
        state_manager.volume = volume
        
        await state_manager.broadcast_to_display(ControlCommand(
            type="volume",
            data={"volume": volume}
        ))
        
        await state_manager.broadcast_to_admin(ControlCommand(
            type="state_update",
            data={"volume": volume}
        ))
        
    elif command_type == "switch_mode":
        mode = command_data.get("mode", "music")
        state_manager.current_mode = mode
        
        if mode == "music":
            await state_manager.broadcast_to_display(ControlCommand(
                type="switch_to_music",
                data={
                    "track": state_manager.current_track.dict() if state_manager.current_track else None,
                    "is_playing": state_manager.is_playing,
                    "current_time": state_manager.current_time
                }
            ))
        else:
            await state_manager.broadcast_to_display(ControlCommand(
                type="switch_to_slide",
                data={
                    "slide": state_manager.current_slide.dict() if state_manager.current_slide else None
                }
            ))
        
        await state_manager.broadcast_to_admin(ControlCommand(
            type="state_update",
            data={"mode": mode}
        ))
        
    elif command_type == "select_slide":
        index = command_data.get("index")
        if 0 <= index < len(state_manager.slides):
            state_manager.current_slide_index = index
            state_manager.current_slide = state_manager.slides[index]
            
            await state_manager.broadcast_to_display(ControlCommand(
                type="slide_change",
                data={"slide": state_manager.current_slide.dict()}
            ))
            
            await state_manager.broadcast_to_admin(ControlCommand(
                type="state_update",
                data={
                    "current_slide_index": state_manager.current_slide_index,
                    "current_slide": state_manager.current_slide.dict()
                }
            ))

# WebSocket连接 - 显示端
@app.websocket("/ws/display")
async def websocket_display(websocket: WebSocket):
    await state_manager.connect_display(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # 处理显示端的时间更新等
            if data.get("type") == "time_update":
                state_manager.current_time = data.get("data", {}).get("time", 0)
                
    except WebSocketDisconnect:
        state_manager.disconnect_display(websocket)
        logger.info("显示端WebSocket连接断开")
    except Exception as e:
        logger.error(f"处理显示端消息时出错: {e}")
        state_manager.disconnect_display(websocket)

# API路由
@app.post("/api/upload/music")
async def upload_music(
    music_file: UploadFile = File(...),
    cover_file: UploadFile = File(None),
    lyrics_file: UploadFile = File(None),
    title: str = Form(""),
    artist: str = Form("")
):
    if not allowed_file(music_file.filename, "music"):
        raise HTTPException(400, "不支持的音频格式")
    
    # 保存音乐文件
    music_url = save_upload_file(music_file, "music")
    music_path = UPLOAD_FOLDER / "music" / music_url.split("/")[-1]
    
    # 获取音频时长
    duration = await get_audio_duration(music_path)
    
    # 保存封面
    cover_url = "/uploads/covers/default-cover.jpg"
    if cover_file and cover_file.filename:
        if allowed_file(cover_file.filename, "covers"):
            cover_url = save_upload_file(cover_file, "covers")
        else:
            logger.warning(f"不支持的封面格式: {cover_file.filename}")
    
    # 保存歌词
    lyrics_url = None
    if lyrics_file and lyrics_file.filename:
        if allowed_file(lyrics_file.filename, "lyrics"):
            lyrics_url = save_upload_file(lyrics_file, "lyrics")
        else:
            logger.warning(f"不支持的歌词格式: {lyrics_file.filename}")
    
    # 创建曲目
    track = Track(
        id=str(uuid.uuid4().hex[:8]),
        title=title or music_file.filename.rsplit('.', 1)[0],
        artist=artist or "未知艺术家",
        url=music_url,
        cover_url=cover_url,
        lyrics_url=lyrics_url,
        duration=duration
    )
    
    # 添加到播放列表
    state_manager.add_track(track)
    
    # 广播更新
    await state_manager.broadcast_to_admin(ControlCommand(
        type="playlist_update",
        data={"playlist": [t.dict() for t in state_manager.playlist]}
    ))
    
    return {"success": True, "track": track.dict()}

@app.post("/api/upload/slide")
async def upload_slide(
    slide_file: UploadFile = File(...),
    name: str = Form("")
):
    if not allowed_file(slide_file.filename, "slides"):
        raise HTTPException(400, "只支持HTML/HTM文件")
    
    # 保存幻灯片文件
    slide_url = save_upload_file(slide_file, "slides")
    
    # 创建幻灯片
    slide = Slide(
        id=str(uuid.uuid4().hex[:8]),
        name=name or slide_file.filename.rsplit('.', 1)[0],
        url=slide_url
    )
    
    # 添加到幻灯片列表
    state_manager.add_slide(slide)
    
    # 广播更新
    await state_manager.broadcast_to_admin(ControlCommand(
        type="slides_update",
        data={"slides": [s.dict() for s in state_manager.slides]}
    ))
    
    return {"success": True, "slide": slide.dict()}

@app.delete("/api/track/{track_id}")
async def delete_track(track_id: str):
    state_manager.remove_track(track_id)
    
    await state_manager.broadcast_to_admin(ControlCommand(
        type="playlist_update",
        data={"playlist": [t.dict() for t in state_manager.playlist]}
    ))
    
    return {"success": True}

@app.delete("/api/slide/{slide_id}")
async def delete_slide(slide_id: str):
    state_manager.remove_slide(slide_id)
    
    await state_manager.broadcast_to_admin(ControlCommand(
        type="slides_update",
        data={"slides": [s.dict() for s in state_manager.slides]}
    ))
    
    return {"success": True}

@app.get("/api/state")
async def get_state():
    return {
        "mode": state_manager.current_mode,
        "is_playing": state_manager.is_playing,
        "current_time": state_manager.current_time,
        "volume": state_manager.volume,
        "playlist": [track.dict() for track in state_manager.playlist],
        "slides": [slide.dict() for slide in state_manager.slides],
        "current_track_index": state_manager.current_track_index,
        "current_slide_index": state_manager.current_slide_index,
        "current_track": state_manager.current_track.dict() if state_manager.current_track else None,
        "current_slide": state_manager.current_slide.dict() if state_manager.current_slide else None,
    }

@app.get("/api/lyrics/{filename}")
async def get_lyrics(filename: str):
    """获取歌词文件内容"""
    lyrics_path = UPLOAD_FOLDER / "lyrics" / filename
    
    if not lyrics_path.exists():
        raise HTTPException(404, "歌词文件不存在")
    
    try:
        with open(lyrics_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except UnicodeDecodeError:
        try:
            with open(lyrics_path, 'r', encoding='gbk') as f:
                content = f.read()
            return {"content": content}
        except:
            raise HTTPException(500, "歌词文件编码不支持")
    except Exception as e:
        logger.error(f"读取歌词文件失败: {e}")
        raise HTTPException(500, "读取歌词文件失败")

@app.post("/api/maintenance/cleanup")
async def cleanup_orphaned_files():
    """清理孤立的文件"""
    try:
        persistence_manager.cleanup_orphaned_files()
        return {"success": True, "message": "文件清理完成"}
    except Exception as e:
        logger.error(f"清理文件失败: {e}")
        return {"success": False, "message": f"清理失败: {e}"}

@app.post("/api/maintenance/backup")
async def backup_database():
    """备份数据库"""
    try:
        persistence_manager.backup_database()
        return {"success": True, "message": "数据库备份完成"}
    except Exception as e:
        logger.error(f"备份数据库失败: {e}")
        return {"success": False, "message": f"备份失败: {e}"}

@app.post("/api/maintenance/repair_durations")
async def repair_audio_durations():
    """修复所有音频文件的时长信息"""
    try:
        repaired_count = persistence_manager.repair_music_durations()
        return {"success": True, "message": f"已修复 {repaired_count} 个音频文件的时长", "repaired_count": repaired_count}
    except Exception as e:
        logger.error(f"修复音频时长失败: {e}")
        return {"success": False, "message": f"修复失败: {e}"}

@app.get("/api/maintenance/status")
async def get_maintenance_status():
    """获取维护状态"""
    return {
        "music_count": len(persistence_manager.music_database),
        "slides_count": len(persistence_manager.slides_database),
        "data_dir": str(persistence_manager.data_dir)
    }

@app.get("/")
async def root():
    return FileResponse("admin/index.html")

# 静态文件服务
@app.get("/admin")
async def admin_page():
    return FileResponse("admin/index.html")

@app.get("/display")
async def display_page():
    return FileResponse("display/index.html")

# 健康检查端点
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

def main():
    print(f"服务器启动中...")
    print(f"管理端地址: http://{SERVER_HOST}:{SERVER_PORT}/admin")
    print(f"显示端地址: http://{SERVER_HOST}:{SERVER_PORT}/display")
    print(f"按 Ctrl+C 停止服务器")
    
    if DEBUG:
        # 开发模式：使用热重载
        uvicorn.run(
            "server:app",
            host=SERVER_HOST,
            port=SERVER_PORT,
            reload=True,
            reload_dirs=["."],  # 监视当前目录的变化
            ws_ping_interval=WEBSOCKET_PING_INTERVAL,
            ws_ping_timeout=WEBSOCKET_PING_TIMEOUT
        )
    else:
        # 生产模式：不使用热重载
        uvicorn.run(
            app,
            host=SERVER_HOST,
            port=SERVER_PORT,
            reload=False,
            ws_ping_interval=WEBSOCKET_PING_INTERVAL,
            ws_ping_timeout=WEBSOCKET_PING_TIMEOUT
        )

if __name__ == "__main__":
    main()