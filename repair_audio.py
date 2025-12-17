#!/usr/bin/env python3
"""
修复音频时长脚本
"""

import asyncio
import sys
from pathlib import Path

# 添加当前目录到路径，以便导入模块
sys.path.insert(0, str(Path(__file__).parent))

from server import get_audio_duration, UPLOAD_FOLDER
from persistence import persistence_manager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def repair_all_audio_durations():
    """修复所有音频文件的时长"""
    logger.info("开始修复音频时长...")
    
    repaired_count = 0
    tracks = persistence_manager.get_all_music_tracks()
    
    for track in tracks:
        try:
            url = track.get('url', '')
            if not url or not url.startswith('/uploads/music/'):
                continue
            
            filename = url.split('/')[-1]
            file_path = UPLOAD_FOLDER / 'music' / filename
            
            if not file_path.exists():
                logger.warning(f"文件不存在: {file_path}")
                continue
            
            # 获取实际时长
            duration = await get_audio_duration(file_path)
            old_duration = track.get('duration', 0)
            
            if duration > 0 and duration != old_duration:
                track['duration'] = duration
                repaired_count += 1
                
                title = track.get('title', '未知')
                logger.info(f"修复: {title} - {old_duration}s -> {duration}s")
        
        except Exception as e:
            logger.error(f"修复失败 {track.get('id', '未知')}: {e}")
    
    # 保存修复后的数据库
    if repaired_count > 0:
        persistence_manager.save_database(
            persistence_manager.music_db_file,
            tracks
        )
    
    logger.info(f"修复完成！共修复 {repaired_count} 个音频文件")
    return repaired_count

if __name__ == "__main__":
    repaired = asyncio.run(repair_all_audio_durations())
    print(f"修复了 {repaired} 个音频文件的时长")