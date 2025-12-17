#!/usr/bin/env python3
"""
数据库自动备份脚本
"""

import json
import logging
from pathlib import Path
from datetime import datetime, timedelta
import shutil
from config import UPLOAD_FOLDER

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AutoBackup:
    def __init__(self):
        self.backup_dir = Path(__file__).parent / "backups"
        self.backup_dir.mkdir(exist_ok=True)
        
        # 数据库文件路径
        self.data_dir = Path(__file__).parent / "data"
        self.music_db_file = self.data_dir / "music_database.json"
        self.slides_db_file = self.data_dir / "slides_database.json"
    
    def backup_now(self):
        """执行立即备份"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_dir / f"full_backup_{timestamp}"
        backup_path.mkdir(exist_ok=True)
        
        try:
            # 备份数据库文件
            if self.music_db_file.exists():
                shutil.copy2(self.music_db_file, backup_path / "music_database.json")
            
            if self.slides_db_file.exists():
                shutil.copy2(self.slides_db_file, backup_path / "slides_database.json")
            
            # 备份上传的文件
            uploads_backup = backup_path / "uploads"
            if UPLOAD_FOLDER.exists():
                shutil.copytree(UPLOAD_FOLDER, uploads_backup, dirs_exist_ok=True)
            
            logger.info(f"完整备份已创建: {backup_path}")
            return True
            
        except Exception as e:
            logger.error(f"备份失败: {e}")
            return False
    
    def cleanup_old_backups(self, days_to_keep=7):
        """清理旧的备份文件"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)
            
            for backup_item in self.backup_dir.iterdir():
                if backup_item.is_dir() and backup_item.name.startswith("full_backup_"):
                    # 从目录名解析日期
                    try:
                        date_str = backup_item.name.split("_")[-1]
                        backup_date = datetime.strptime(date_str, "%Y%m%d%H%M%S")
                        
                        if backup_date < cutoff_date:
                            shutil.rmtree(backup_item)
                            logger.info(f"删除旧备份: {backup_item.name}")
                    except ValueError:
                        # 如果无法解析日期，跳过
                        continue
                        
            logger.info("旧备份清理完成")
            return True
            
        except Exception as e:
            logger.error(f"清理旧备份失败: {e}")
            return False
    
    def restore_backup(self, backup_name: str):
        """从备份恢复"""
        try:
            backup_path = self.backup_dir / backup_name
            if not backup_path.exists():
                logger.error(f"备份不存在: {backup_name}")
                return False
            
            # 恢复数据库文件
            music_backup = backup_path / "music_database.json"
            if music_backup.exists():
                shutil.copy2(music_backup, self.music_db_file)
            
            slides_backup = backup_path / "slides_database.json"
            if slides_backup.exists():
                shutil.copy2(slides_backup, self.slides_db_file)
            
            # 恢复上传的文件
            uploads_backup = backup_path / "uploads"
            if uploads_backup.exists():
                if UPLOAD_FOLDER.exists():
                    shutil.rmtree(UPLOAD_FOLDER)
                shutil.copytree(uploads_backup, UPLOAD_FOLDER)
            
            logger.info(f"已从备份恢复: {backup_name}")
            return True
            
        except Exception as e:
            logger.error(f"恢复备份失败: {e}")
            return False
    
    def list_backups(self):
        """列出所有备份"""
        backups = []
        for backup_item in self.backup_dir.iterdir():
            if backup_item.is_dir() and backup_item.name.startswith("full_backup_"):
                backups.append({
                    "name": backup_item.name,
                    "path": str(backup_item),
                    "size": self.get_folder_size(backup_item)
                })
        
        return sorted(backups, key=lambda x: x["name"], reverse=True)
    
    def get_folder_size(self, folder_path: Path):
        """获取文件夹大小"""
        total_size = 0
        for file_path in folder_path.rglob('*'):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        return total_size

if __name__ == "__main__":
    backup_manager = AutoBackup()
    
    # 执行备份
    print("正在执行备份...")
    if backup_manager.backup_now():
        print("备份成功！")
    else:
        print("备份失败！")
    
    # 清理旧备份
    print("\n清理旧备份...")
    backup_manager.cleanup_old_backups()
    
    # 列出所有备份
    print("\n所有备份:")
    backups = backup_manager.list_backups()
    for backup in backups:
        size_mb = backup["size"] / (1024 * 1024)
        print(f"  - {backup['name']} ({size_mb:.2f} MB}")