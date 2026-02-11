# Hướng Dẫn Triển Khai License Server lên VPS

Đây là hướng dẫn chi tiết để deploy **Karate License Server** lên VPS (Ubuntu 20.04/22.04).

## 1. Chuẩn Bị VPS
- Mua VPS (khuyến nghị DigitalOcean, Vultr hoặc nhà cung cấp VN).
- Hệ điều hành: Ubuntu 20.04 hoặc 22.04 LTS.
- RAM: Tối thiểu 1GB.
- IP: Public IP (ví dụ: `103.82.194.186`).

## 2. Copy Code lên VPS
Bạn có thể dùng `scp` hoặc `git`. Cách đơn giản nhất:
1. Nén thư mục `license-server` thành `license-server.zip`.
2. Upload lên VPS bằng `scp` hoặc WinSCP.
   ```bash
   scp -r license-server root@<YOUR_VPS_IP>:/root/
   ```

## 3. Cài Đặt Tự Động (Khuyên dùng)
Tôi đã tạo sẵn script cài đặt. Hãy chạy lệnh sau trên VPS:

```bash
cd /root/license-server
chmod +x setup-vps.sh
./setup-vps.sh
```

## 4. Cấu Hình Bảo Mật (RẤT QUAN TRỌNG)
Sau khi cài đặt xong, bạn **PHẢI** tạo file `.env` để bảo mật server:

1. Tạo file `.env` từ file mẫu:
   ```bash
   cp .env.example .env
   nano .env
   ```
2. Sửa nội dung file `.env`:
   - `ADMIN_SECRET`: Đổi thành một chuỗi ký tự dài, ngẫu nhiên và khó đoán. **Lưu lại chuỗi này để nhập vào App Owner Page**.
   - `PORT`: Mặc định 2000.

3. Khởi động lại Server để áp dụng cấu hình:
   ```bash
   pm2 restart karate-license-api
   ```

## 5. Kiểm Tra Hoạt Động
- Truy cập trình duyệt: `http://<YOUR_VPS_IP>:2000` -> Sẽ thấy "Karate License Server is RUNNING".
- Kiểm tra logs: `pm2 logs karate-license-api`.

## 6. Cập Nhật Client App
- Mở file `src/services/licenseService.js` trên máy local.
- Sửa `SERVER_URL` thành: `http://<YOUR_VPS_IP>:2000`.
- Build lại app Electron để phân phối cho khách.

---

## Các Lệnh Quản Lý Server (trên VPS)
- **Xem trạng thái**: `pm2 status`
- **Xem log**: `pm2 logs`
- **Khởi động lại**: `pm2 restart all`
- **Dừng server**: `pm2 stop all`
