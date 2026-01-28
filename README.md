# 班级元旦晚会远程控制系统

一个基于 FastAPI 和 WebSocket 的远程控制系统，用于班级元旦晚会的音乐播放和幻灯片显示。

## 功能特性

- 🎵 **音乐播放控制**
  - 支持多种音频格式（MP3、WAV、OGG、M4A、FLAC、AAC）
  - 播放列表管理
  - 播放/暂停/上一曲/下一曲控制
  - 音量调节
  - 歌词显示支持（LRC、TXT、ASS、SRT 格式）
  - 封面图片显示

- 📊 **幻灯片控制**
  - 支持 HTML 幻灯片展示
  - 幻灯片切换控制

- 🖥️ **双端架构**
  - 管理端：用于控制播放
  - 显示端：用于投影展示
  - WebSocket 实时同步

- 💾 **数据持久化**
  - 基于 JSON 文件的数据存储
  - 自动备份功能
  - 数据恢复支持

- 🛠️ **维护功能**
  - 音频时长自动修复
  - 孤立文件清理
  - 系统状态监控

## 系统要求

- Python 3.8+
- 现代浏览器（支持 WebSocket）

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/w1010tdev/pyer.git
cd pyer
```

### 2. 创建虚拟环境（推荐）

```bash
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或者
venv\Scripts\activate  # Windows
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
```

### 4. 启动服务器

```bash
python server.py
```

服务器将在 `http://localhost:2427` 启动。

## 使用说明

### 访问地址

| 页面 | 地址 | 说明 |
| ------ | ------ | ------ |
| 首页 | `http://localhost:2427/` | 系统首页 |
| 管理端 | `http://localhost:2427/admin` | 控制音乐和幻灯片 |
| 显示端 | `http://localhost:2427/display` | 用于投影展示 |

### 基本操作

1. **管理端**：在浏览器中打开管理端地址，上传音乐和幻灯片，控制播放
2. **显示端**：在投影设备上打开显示端地址，展示当前播放内容
3. **双端同步**：管理端的所有操作会实时同步到显示端

### 上传文件

- **音乐文件**：支持 MP3、WAV、OGG、M4A、FLAC、AAC 格式
- **幻灯片**：支持 HTML/HTM 格式
- **封面图片**：支持 JPG、JPEG、PNG、GIF、WebP、BMP 格式
- **歌词文件**：支持 LRC、TXT、ASS、SRT 格式

## 配置说明

配置文件位于 `config.py`：

```python
# 服务器配置
SERVER_HOST = '0.0.0.0'     # 监听地址
SERVER_PORT = 2427           # 监听端口
DEBUG = True                 # 调试模式

# WebSocket 配置
WEBSOCKET_PING_INTERVAL = 30  # Ping 间隔（秒）
WEBSOCKET_PING_TIMEOUT = 60   # Ping 超时（秒）

# 文件上传配置
UPLOAD_FOLDER = BASE_DIR / 'uploads'  # 上传目录
```

## 项目结构

```
pyer/
├── server.py          # 主服务器程序
├── config.py          # 配置文件
├── persistence.py     # 数据持久化管理
├── backup.py          # 自动备份功能
├── repair_audio.py    # 音频时长修复工具
├── requirements.txt   # Python 依赖
├── admin/             # 管理端前端
│   └── index.html
├── display/           # 显示端前端
│   ├── index.html
│   └── display.js
├── test/              # 测试文件
│   ├── 1.html
│   └── 2.html
├── uploads/           # 上传文件目录（自动创建）
│   ├── music/         # 音乐文件
│   ├── slides/        # 幻灯片文件
│   ├── covers/        # 封面图片
│   └── lyrics/        # 歌词文件
├── data/              # 数据目录（自动创建）
│   ├── music_database.json
│   └── slides_database.json
└── backups/           # 备份目录（自动创建）
```

## API 端点

### REST API

| 方法 | 端点 | 说明 |
| ------ | ------ | ------ |
| GET | `/` | 系统首页 |
| GET | `/admin` | 管理端页面 |
| GET | `/display` | 显示端页面 |
| GET | `/health` | 健康检查 |
| GET | `/api/state` | 获取当前系统状态 |
| POST | `/api/upload/music` | 上传音乐文件 |
| POST | `/api/upload/slide` | 上传幻灯片文件 |
| DELETE | `/api/track/{track_id}` | 删除音乐 |
| DELETE | `/api/slide/{slide_id}` | 删除幻灯片 |
| GET | `/api/lyrics/{filename}` | 获取歌词内容 |
| POST | `/api/maintenance/cleanup` | 清理孤立文件 |
| POST | `/api/maintenance/backup` | 执行数据备份 |
| POST | `/api/maintenance/repair_durations` | 修复音频时长 |
| GET | `/api/maintenance/status` | 获取维护状态 |

### WebSocket 端点

| 端点 | 说明 |
| ------ | ------ |
| `/ws/admin` | 管理端 WebSocket 连接 |
| `/ws/display` | 显示端 WebSocket 连接 |

## 辅助工具

### 数据备份

```bash
python backup.py
```

执行完整备份，包括数据库和上传的文件。

### 修复音频时长

```bash
python repair_audio.py
```

修复数据库中音频文件的时长信息。

## 技术栈

- **后端框架**: FastAPI
- **ASGI 服务器**: Uvicorn
- **WebSocket**: websockets
- **音频处理**: mutagen
- **图像处理**: Pillow
- **数据验证**: Pydantic

## 许可证

本项目基于 GNU General Public License (GPL) 许可证开源。

## 贡献

欢迎提交 Issue 和 Pull Request！
