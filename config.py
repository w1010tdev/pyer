# 配置文件
import os
from pathlib import Path

# 基础配置
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / 'uploads'

# 创建上传目录
for subdir in ['music', 'slides', 'covers', 'lyrics']:
    (UPLOAD_FOLDER / subdir).mkdir(parents=True, exist_ok=True)

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {
    'music': {'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'},
    'slides': {'html', 'htm'},
    'covers': {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'},
    'lyrics': {'lrc', 'txt', 'ass', 'srt'}
}

# 服务器配置
SERVER_HOST = '0.0.0.0'
SERVER_PORT = 2427
DEBUG = True

# WebSocket配置
WEBSOCKET_PING_INTERVAL = 30
WEBSOCKET_PING_TIMEOUT = 60

# 默认文件
DEFAULT_COVER_URL = "/uploads/covers/default-cover.jpg"