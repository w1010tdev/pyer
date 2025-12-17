import json
import logging
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

from config import UPLOAD_FOLDER

logger = logging.getLogger(__name__)

class PersistenceManager:
    def __init__(self):
        self.data_dir = Path(__file__).parent / "data"
        self.data_dir.mkdir(exist_ok=True)
        
        # 数据库文件路径
        self.music_db_file = self.data_dir / "music_database.json"
        self.slides_db_file = self.data_dir / "slides_database.json"
        
        # 初始化数据库
        self.music_database = self.load_database(self.music_db_file)
        self.slides_database = self.load_database(self.slides_db_file)
        
        logger.info(f"音乐数据库已加载: {len(self.music_database)} 条记录")
        logger.info(f"幻灯片数据库已加载: {len(self.slides_database)} 条记录")
    
    def load_database(self, db_file: Path) -> List[Dict[str, Any]]:
        """加载数据库文件"""
        try:
            if db_file.exists():
                with open(db_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return []
        except Exception as e:
            logger.error(f"加载数据库文件失败 {db_file}: {e}")
            return []
    
    def save_database(self, db_file: Path, data: List[Dict[str, Any]]):
        """保存数据库到文件"""
        try:
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.debug(f"数据库已保存到 {db_file}")
        except Exception as e:
            logger.error(f"保存数据库文件失败 {db_file}: {e}")
    
    def add_music_track(self, track_data: Dict[str, Any]) -> str:
        """添加音乐轨道到数据库"""
        track_id = track_data.get('id', str(len(self.music_database) + 1))
        track_data['id'] = track_id
        track_data['created_at'] = datetime.now().isoformat()
        
        # 检查文件是否存在
        url = track_data.get('url', '')
        if url and not self.check_file_exists(url):
            logger.warning(f"音乐文件不存在: {url}")
        
        self.music_database.append(track_data)
        self.save_database(self.music_db_file, self.music_database)
        
        logger.info(f"音乐已添加到数据库: {track_data.get('title', '未知')}")
        return track_id
    
    def add_slide(self, slide_data: Dict[str, Any]) -> str:
        """添加幻灯片到数据库"""
        slide_id = slide_data.get('id', str(len(self.slides_database) + 1))
        slide_data['id'] = slide_id
        slide_data['created_at'] = datetime.now().isoformat()
        
        # 检查文件是否存在
        url = slide_data.get('url', '')
        if url and not self.check_file_exists(url):
            logger.warning(f"幻灯片文件不存在: {url}")
        
        self.slides_database.append(slide_data)
        self.save_database(self.slides_db_file, self.slides_database)
        
        logger.info(f"幻灯片已添加到数据库: {slide_data.get('name', '未知')}")
        return slide_id
    
    def delete_music_track(self, track_id: str) -> bool:
        """从数据库删除音乐轨道"""
        original_length = len(self.music_database)
        self.music_database = [track for track in self.music_database if track.get('id') != track_id]
        
        if len(self.music_database) < original_length:
            self.save_database(self.music_db_file, self.music_database)
            logger.info(f"音乐已从数据库删除: ID={track_id}")
            return True
        return False
    
    def delete_slide(self, slide_id: str) -> bool:
        """从数据库删除幻灯片"""
        original_length = len(self.slides_database)
        self.slides_database = [slide for slide in self.slides_database if slide.get('id') != slide_id]
        
        if len(self.slides_database) < original_length:
            self.save_database(self.slides_db_file, self.slides_database)
            logger.info(f"幻灯片已从数据库删除: ID={slide_id}")
            return True
        return False
    
    def get_all_music_tracks(self) -> List[Dict[str, Any]]:
        """获取所有音乐轨道"""
        # 过滤掉文件不存在的记录
        valid_tracks = []
        for track in self.music_database:
            url = track.get('url', '')
            if not url or self.check_file_exists(url):
                valid_tracks.append(track)
            else:
                logger.warning(f"音乐文件不存在，跳过: {track.get('title', '未知')}")
        
        # 如果有无效记录，更新数据库
        if len(valid_tracks) != len(self.music_database):
            self.music_database = valid_tracks
            self.save_database(self.music_db_file, self.music_database)
        
        return valid_tracks
    
    def get_all_slides(self) -> List[Dict[str, Any]]:
        """获取所有幻灯片"""
        # 过滤掉文件不存在的记录
        valid_slides = []
        for slide in self.slides_database:
            url = slide.get('url', '')
            if not url or self.check_file_exists(url):
                valid_slides.append(slide)
            else:
                logger.warning(f"幻灯片文件不存在，跳过: {slide.get('name', '未知')}")
        
        # 如果有无效记录，更新数据库
        if len(valid_slides) != len(self.slides_database):
            self.slides_database = valid_slides
            self.save_database(self.slides_db_file, self.slides_database)
        
        return valid_slides
    
    def check_file_exists(self, url: str) -> bool:
        """检查文件是否存在"""
        if not url.startswith('/uploads/'):
            return False
        
        # 移除开头的 /uploads/ 部分
        relative_path = url[9:]  # 跳过 '/uploads/'
        file_path = UPLOAD_FOLDER / relative_path
        
        return file_path.exists()
    
    def cleanup_orphaned_files(self):
        """清理孤立的文件（数据库中不存在引用的文件）"""
        try:
            # 收集所有在数据库中引用的文件
            referenced_files = set()
            
            for track in self.music_database:
                if track.get('url'):
                    referenced_files.add(track['url'])
                if track.get('cover_url'):
                    referenced_files.add(track['cover_url'])
                if track.get('lyrics_url'):
                    referenced_files.add(track['lyrics_url'])
            
            for slide in self.slides_database:
                if slide.get('url'):
                    referenced_files.add(slide['url'])
                if slide.get('thumbnail_url'):
                    referenced_files.add(slide['thumbnail_url'])
            
            # 遍历上传目录，删除未被引用的文件
            for subdir in ['music', 'slides', 'covers', 'lyrics']:
                dir_path = UPLOAD_FOLDER / subdir
                if dir_path.exists():
                    for file_path in dir_path.iterdir():
                        if file_path.is_file():
                            file_url = f"/uploads/{subdir}/{file_path.name}"
                            if file_url not in referenced_files and file_path.name != "default-cover.jpg":
                                try:
                                    file_path.unlink()
                                    logger.info(f"清理孤立文件: {file_path}")
                                except Exception as e:
                                    logger.error(f"删除文件失败 {file_path}: {e}")
            
            logger.info("文件清理完成")
            
        except Exception as e:
            logger.error(f"清理文件时出错: {e}")
    
    def backup_database(self):
        """备份数据库"""
        backup_dir = self.data_dir / "backups"
        backup_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 备份音乐数据库
        if self.music_db_file.exists():
            backup_file = backup_dir / f"music_database_backup_{timestamp}.json"
            try:
                with open(self.music_db_file, 'r', encoding='utf-8') as src:
                    data = json.load(src)
                with open(backup_file, 'w', encoding='utf-8') as dst:
                    json.dump(data, dst, ensure_ascii=False, indent=2)
                logger.info(f"音乐数据库已备份到: {backup_file}")
            except Exception as e:
                logger.error(f"备份音乐数据库失败: {e}")
        
        # 备份幻灯片数据库
        if self.slides_db_file.exists():
            backup_file = backup_dir / f"slides_database_backup_{timestamp}.json"
            try:
                with open(self.slides_db_file, 'r', encoding='utf-8') as src:
                    data = json.load(src)
                with open(backup_file, 'w', encoding='utf-8') as dst:
                    json.dump(data, dst, ensure_ascii=False, indent=2)
                logger.info(f"幻灯片数据库已备份到: {backup_file}")
            except Exception as e:
                logger.error(f"备份幻灯片数据库失败: {e}")

# 创建全局持久化管理器实例
persistence_manager = PersistenceManager()