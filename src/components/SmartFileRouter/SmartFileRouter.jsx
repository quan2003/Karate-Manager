import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole, ROLES } from '../../context/RoleContext';
import { decodeKrtFile } from '../../services/krtService';
import { decodeKmatchFile } from '../../services/matchService';

/**
 * SmartFileRouter - Xử lý điều hướng thông minh dựa trên file mở
 * 
 * Luồng:
 * 1. Khi app khởi động, kiểm tra có file từ command line không (qua IPC)
 * 2. Khi app đang chạy, lắng nghe event 'app:open-file' từ Electron
 * 3. Đọc targetRole từ nội dung file
 * 4. Tự động điều hướng đến đúng màn hình
 */
export default function SmartFileRouter() {
  const navigate = useNavigate();
  const { setRole, loadKrtData, loadMatchData } = useRole();

  /**
   * Xử lý file được mở (krt hoặc kmatch)
   */
  const handleOpenFile = useCallback(async ({ filePath, content }) => {
    if (!filePath || !content) return;

    const ext = filePath.toLowerCase().split('.').pop();

    try {
      if (ext === 'krt') {
        // Decode file .krt
        const result = decodeKrtFile(content);
        if (!result.success) {
          console.error('Không thể đọc file .krt:', result.error);
          return;
        }

        const data = result.data;
        const targetRole = data.targetRole || 'coach';

        if (targetRole === 'coach') {
          // Mở thẳng giao diện HLV
          setRole(ROLES.COACH);
          await loadKrtData(data);
          navigate('/coach');
        } else if (targetRole === 'admin') {
          // Mở giao diện Admin - file .krt từ Coach gửi về (ít dùng)
          setRole(ROLES.ADMIN);
          navigate('/admin');
        } else {
          // Default: CoachPage
          setRole(ROLES.COACH);
          await loadKrtData(data);
          navigate('/coach');
        }

      } else if (ext === 'kmatch') {
        // Decode file .kmatch
        const result = decodeKmatchFile(content);
        if (!result.success) {
          console.error('Không thể đọc file .kmatch:', result.error);
          return;
        }

        const data = result.data;
        const targetRole = data.targetRole || 'secretary';

        if (targetRole === 'secretary') {
          // Mở thẳng giao diện Thư ký
          setRole(ROLES.SECRETARY);
          await loadMatchData(data);
          navigate('/secretary');
        } else if (targetRole === 'admin') {
          // Admin nhận file kết quả từ Thư ký
          setRole(ROLES.ADMIN);
          navigate('/admin');
        } else {
          // Default: SecretaryPage
          setRole(ROLES.SECRETARY);
          await loadMatchData(data);
          navigate('/secretary');
        }
      }
    } catch (error) {
      console.error('Lỗi xử lý file:', error);
    }
  }, [navigate, setRole, loadKrtData, loadMatchData]);

  // Lắng nghe event khi user double-click file trong lúc app đang chạy
  useEffect(() => {
    if (!window.electronAPI?.onOpenFile) return;

    const cleanup = window.electronAPI.onOpenFile(handleOpenFile);
    return cleanup;
  }, [handleOpenFile]);

  // Kiểm tra file từ startup (command line argument)
  useEffect(() => {
    const checkStartupFile = async () => {
      if (!window.electronAPI?.getStartupFile) return;

      try {
        const result = await window.electronAPI.getStartupFile();
        if (result.success && result.filePath && result.content) {
          await handleOpenFile({ filePath: result.filePath, content: result.content });
        }
      } catch (error) {
        console.error('Lỗi kiểm tra startup file:', error);
      }
    };

    // Delay nhỏ để đảm bảo context đã sẵn sàng
    const timer = setTimeout(checkStartupFile, 300);
    return () => clearTimeout(timer);
  }, [handleOpenFile]);

  // Component này không render gì cả
  return null;
}
