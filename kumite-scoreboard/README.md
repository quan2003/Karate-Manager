# Kumite Scoreboard

Hệ thống chấm điểm Kumite (đối kháng) Karate chuyên nghiệp.

## Tính năng

### 🎯 Điểm số

- **Ippon** (3 điểm): Đòn hoàn hảo
- **Waza-ari** (2 điểm): Đòn đẹp
- **Yuko** (1 điểm): Đòn hiệu quả
- **Senshu**: Điểm đầu tiên (ưu tiên khi hòa)

### ⚠️ Lỗi phạt (Penalties)

- **C1**: Cảnh cáo lần 1
- **C2**: Cảnh cáo lần 2
- **C3**: Cảnh cáo lần 3
- **HC** (Hansoku-chui): Cảnh cáo nặng
- **H** (Hansoku): Truất quyền

### ⏱️ Timer

- Đồng hồ đếm ngược
- Độ chính xác 0.1 giây
- Tùy chỉnh thời gian trận đấu

### 🔄 Đồng bộ Real-time

- Admin và Display đồng bộ qua localStorage
- Cập nhật tức thời

## Cách sử dụng

### 1. Upload danh sách VĐV (Tùy chọn)

- Chuẩn bị file CSV với format:
  ```
  VĐV,Đơn vị
  Nguyễn Văn A,Đại học ABC
  Trần Thị B,CLB XYZ
  ```
- Trong Admin panel, click "Upload CSV" và chọn file
- Chọn VĐV từ dropdown "Red Athlete" và "Blue Athlete"
- Tên và đơn vị sẽ tự động điền vào ô "Red Name" và "Blue Name"

### 2. Mở Admin Panel

- Truy cập `admin.html`
- Điều khiển điểm số, penalties, timer
- Tùy chỉnh tên VĐV, category, font scale

### 3. Chọn vòng thi đấu

- Trong Admin Panel, chọn **Vòng thi đấu**:
  - 🏆 **Chung Kết** (HCV/HCB)
  - 🥉 **Bán Kết 1** (HCĐ #1)
  - 🥉 **Bán Kết 2** (HCĐ #2)
  - 📍 **Tứ Kết**
  - 📝 **Vòng Loại**

### 4. Kết thúc trận & Lưu kết quả

- Sau khi trận đấu kết thúc, click **"🏁 Kết Thúc Trận & Lưu Kết Quả"**
- Hệ thống tự động:
  - Xác định người thắng (dựa trên điểm số và Senshu)
  - Lưu huy chương vào database:
    - **Chung Kết**: Thắng = HCV, Thua = HCB
    - **Bán Kết 1**: Thua = HCĐ #1
    - **Bán Kết 2**: Thua = HCĐ #2
- Xem kết quả đã lưu trong **🏆 Quản Lý Kết Quả & Huy Chương**

### 5. Mở Display Screen

- Truy cập `display.html` hoặc nhấn nút "Open Display Window" từ Admin
- Hiển thị trên màn hình lớn/projector

### Phím tắt

- **Space**: Start/Stop timer
- **Ctrl + R**: Reset timer

## Cấu trúc file

```
Kumite Scoreboard/
├── index.html          # Trang chủ
├── admin.html          # Trang điều khiển
├── display.html        # Màn hình hiển thị
├── logo.png            # Logo
├── css/
│   ├── admin.css       # Style cho admin
│   └── display.css     # Style cho display
└── js/
    ├── admin.js        # Logic admin
    └── display.js      # Logic display
```

## Yêu cầu

- Trình duyệt web hiện đại (Chrome, Firefox, Edge)
- Không cần cài đặt thêm

## License

MIT License
